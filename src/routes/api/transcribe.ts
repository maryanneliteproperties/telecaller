import { createFileRoute } from "@tanstack/react-router";
import { MAX_AUDIO_BYTES, friendlyTranscriptionError, transcriptionAudioType, validateAudioFile } from "@/lib/audio-limits";

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const GEMINI_SUPPORTED_AUDIO_TYPES = new Set([
  "audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg",
  "audio/flac", "audio/mpeg", "audio/m4a", "audio/mp4", "audio/l16",
  "audio/opus", "audio/alaw", "audio/mulaw", "audio/webm",
]);

// Convert decoded audio samples to a standard 16-bit PCM WAV that Gemini accepts.
function encodePcmWav(channelData: Float32Array[], sampleRate: number): Buffer {
  if (!channelData.length || !channelData[0]?.length) throw new Error("No audio samples were decoded.");
  const channels = Math.min(channelData.length, 2);
  const frames = channelData[0].length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch]?.[i] ?? 0));
      wav.writeInt16LE(sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), offset);
      offset += bytesPerSample;
    }
  }
  return wav;
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { workspaceIdentity, readLead, workspaceAdmin } = await import("@/lib/workspace.server");
        const identity = await workspaceIdentity(request);
        if (!identity) return jsonError(401, "முதலில் login பண்ணுங்க.");

        // This route calls Google's Gemini API directly, so use a Google AI Studio key.
        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) return jsonError(500, "GEMINI_API_KEY is missing from the server environment.");

        const len = Number(request.headers.get("content-length") ?? "0");
        if (len > MAX_AUDIO_BYTES + 1024 * 1024) return jsonError(413, "File is too large (max 14 MB).");

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonError(400, "Could not read the uploaded file.");
        }
        const leadId = form.get("leadId");
        if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/.test(leadId)) return jsonError(400, "Lead தேர்வு செய்யவும்.");
        let lead;
        try { lead = await readLead(leadId, identity); } catch { return jsonError(403, "இந்த call-க்கு அனுமதி இல்லை."); }
        const { data: stored, error: downloadError } = await workspaceAdmin().storage.from("call-audio").download(lead.audio_path);
        if (downloadError || !stored) return jsonError(500, "சேமித்த audio கிடைக்கல.");

        let file = new File([stored], lead.audio_name, { type: stored.type });
        const invalid = validateAudioFile(file);
        if (invalid) return jsonError(400, invalid);
        if (file.size > 14 * 1024 * 1024) {
          return jsonError(413, "Audio file is larger than 14 MB. Please upload a shorter or compressed recording.");
        }

        let mimeType = transcriptionAudioType(file);
        // AMR is common in phone-call recordings but isn't accepted by Gemini.
        // Decode it with the already-installed AMR decoder and repackage as WAV.
        if (!GEMINI_SUPPORTED_AUDIO_TYPES.has(mimeType)) {
          const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
          if (extension !== "amr" && extension !== "awb") {
            return jsonError(400, friendlyTranscriptionError(`Unsupported file format: ${extension || mimeType}`));
          }
          try {
            const { default: decodeAmr } = await import("@audio/decode-amr");
            const decoded = await decodeAmr(new Uint8Array(await file.arrayBuffer()));
            const wav = encodePcmWav(decoded.channelData, decoded.sampleRate);
            file = new File([new Uint8Array(wav)], `${file.name.replace(/\.[^.]+$/, "") || "recording"}.wav`, { type: "audio/wav" });
            mimeType = "audio/wav";
          } catch (conversionError) {
            console.error("AMR to WAV conversion failed", file.name, conversionError);
            return jsonError(400, "இந்த AMR recording-ஐ தானாக convert செய்ய முடியவில்லை. MP3 அல்லது WAV file upload செய்து முயற்சிக்கவும்.");
          }
        }

        const audioPath = lead.audio_path;
        // Upload call audio through Gemini Files API, then run the dedicated transcription model.
        // This avoids sending a large base64 payload inside generateContent.
        const model = "gemini-3.5-transcribe";
        let res: Response;
        let lastErrorMessage = "Gemini transcription service is temporarily unavailable.";
        const makeSignal = () => request.signal.aborted
          ? request.signal
          : AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]);
        try {
          const bytes = Buffer.from(await file.arrayBuffer());
          const startUpload = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": String(bytes.length),
              "X-Goog-Upload-Header-Content-Type": mimeType,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ file: { display_name: file.name } }),
            signal: makeSignal(),
          });
          if (!startUpload.ok) {
            const details = await startUpload.text();
            console.error("Gemini Files API start upload failed", startUpload.status, details);
            if (startUpload.status === 401 || startUpload.status === 403) {
              return jsonError(startUpload.status, "Gemini API key invalid அல்லது authorize ஆகவில்லை. Vercel Production-ல் GEMINI_API_KEY சரிபார்க்கவும்.");
            }
            return jsonError(startUpload.status >= 500 ? 503 : startUpload.status, "Gemini Files API-ல் audio upload செய்ய முடியவில்லை.");
          }
          const uploadUrl = startUpload.headers.get("x-goog-upload-url");
          if (!uploadUrl) return jsonError(502, "Gemini Files API upload URL கிடைக்கவில்லை.");
          const uploaded = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Length": String(bytes.length),
              "X-Goog-Upload-Offset": "0",
              "X-Goog-Upload-Command": "upload, finalize",
            },
            body: bytes,
            signal: makeSignal(),
          });
          if (!uploaded.ok) {
            const details = await uploaded.text();
            console.error("Gemini Files API upload failed", uploaded.status, details);
            return jsonError(uploaded.status >= 500 ? 503 : uploaded.status, "Gemini Files API-க்கு audio அனுப்ப முடியவில்லை.");
          }
          const uploadedJson = await uploaded.json();
          const fileUri = uploadedJson?.file?.uri;
          if (typeof fileUri !== "string" || !fileUri) return jsonError(502, "Gemini Files API audio URI கிடைக்கவில்லை.");
          // Match Google's documented REST request exactly first: audio URI + MIME type.
          // The dedicated transcription model auto-detects Tamil/English code-switching.
          res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              model: "gemini-3.5-transcribe",
              input: [{ type: "audio", uri: fileUri, mime_type: mimeType }],
            }),
            signal: makeSignal(),
          });
        } catch (e) {
          if (request.signal.aborted) return jsonError(499, "Request cancelled. Please try again.");
          if (e instanceof Error && e.name === "TimeoutError") {
            return jsonError(504, "Gemini transcription 100 விநாடிகளுக்குள் பதில் தரவில்லை. Recording நீளமாக இருந்தால் சிறிய recording-ஆகப் பிரித்து முயற்சிக்கவும்.");
          }
          console.error("Gemini transcription request failed", e);
          return jsonError(502, "Gemini transcription service-ஐ அணுக முடியவில்லை. மீண்டும் முயற்சிக்கவும்.");
        }
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Gemini transcription error", model, res.status, errorText);
          try { lastErrorMessage = JSON.parse(errorText)?.error?.message ?? lastErrorMessage; } catch {}
          if (res.status === 401 || res.status === 403 || (res.status === 400 && /API key/i.test(lastErrorMessage))) {
            return jsonError(res.status, "Gemini API key invalid அல்லது authorize ஆகவில்லை. Vercel Production-ல் GEMINI_API_KEY சரிபார்க்கவும்.");
          }
          if (res.status === 429) {
            return jsonError(503, "Gemini API request limit / அதிக traffic உள்ளது. சில நிமிடங்களில் மீண்டும் முயற்சிக்கவும்.");
          }
          return jsonError(res.status >= 500 ? 503 : res.status, "Gemini transcription error: " + lastErrorMessage);
        }
        let transcript = "";
        try {
          const data = await res.json();
          const textParts: string[] = [];
          const addText = (value: unknown) => {
            if (typeof value === "string" && value.trim()) textParts.push(value.trim());
          };
          // Official response field.
          addText(data?.output_text);
          // REST responses may also expose text as typed output items/steps.
          if (Array.isArray(data?.output)) {
            for (const item of data.output) {
              addText(item?.text);
              addText(item?.content?.text);
              if (Array.isArray(item?.content)) {
                for (const part of item.content) addText(part?.text);
              }
            }
          }
          if (Array.isArray(data?.steps)) {
            for (const step of data.steps) {
              if (Array.isArray(step?.content)) {
                for (const part of step.content) addText(part?.text);
              }
            }
          }
          // Compatibility fallback for GenerateContent-style responses.
          if (Array.isArray(data?.candidates)) {
            for (const candidate of data.candidates) {
              for (const part of candidate?.content?.parts ?? []) addText(part?.text);
            }
          }
          transcript = [...new Set(textParts)].join("\\n").trim();
          if (!transcript) {
            console.error("Gemini returned no transcript text", JSON.stringify({
              keys: data && typeof data === "object" ? Object.keys(data) : [],
              outputType: Array.isArray(data?.output) ? data.output.map((item: { type?: string }) => item?.type) : typeof data?.output,
              status: data?.status,
              error: data?.error,
              model,
              mimeType,
              fileSize: file.size,
            }));
          }
        } catch {
          return jsonError(502, "Gemini returned an unreadable response. Please try again.");
        }
        if (!transcript) return jsonError(502, "Gemini returned an empty transcript. Please try another recording.");

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "transcript.text.delta", delta: transcript })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "transcript.text.done", text: transcript })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
            ...(audioPath ? { "X-Audio-Path": audioPath } : {}),
          },
        });
      },
    },
  },
});
