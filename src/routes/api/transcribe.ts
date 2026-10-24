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
            file = new File([new Uint8Array(wav)], `${file.name.replace(/\\.[^.]+$/, "") || "recording"}.wav`, { type: "audio/wav" });
            mimeType = "audio/wav";
          } catch (conversionError) {
            console.error("AMR to WAV conversion failed", file.name, conversionError);
            return jsonError(400, "இந்த AMR recording-ஐ தானாக convert செய்ய முடியவில்லை. MP3 அல்லது WAV file upload செய்து முயற்சிக்கவும்.");
          }
        }

        const audioPath = lead.audio_path;
        let res: Response;
        try {
          const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
          res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: "Transcribe this call recording verbatim. Preserve the original spoken language, including Tamil, Tanglish, and English. Do not translate, summarize, or add commentary. Return only the words spoken in the recording." },
                  { inlineData: { mimeType, data: bytes } },
                ],
              }],
              generationConfig: { temperature: 0 },
            }),
            signal: request.signal,
          });
        } catch (e) {
          console.error("Gemini transcription fetch failed", e);
          return jsonError(502, "Could not reach Gemini. Please try again.");
        }

        if (!res.ok) {
          const text = await res.text();
          console.error("Gemini transcription error", res.status, text);
          let msg = "Gemini transcription failed.";
          try {
            const j = JSON.parse(text);
            msg = j?.error?.message ?? msg;
          } catch {}
          if (res.status === 429) msg = "Gemini API quota/rate limit reached. Check your Google AI Studio quota and try again.";
          if (res.status === 400 && /API key/i.test(msg)) msg = "Gemini API key is invalid. Add a valid Google AI Studio key as GEMINI_API_KEY in Vercel.";
          return jsonError(res.status, friendlyTranscriptionError(msg));
        }

        let transcript = "";
        try {
          const data = await res.json();
          transcript = data?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .join("")
            .trim() ?? "";
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
