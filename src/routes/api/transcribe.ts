import { createFileRoute } from "@tanstack/react-router";
import { MAX_AUDIO_BYTES, friendlyTranscriptionError, transcriptionAudioType, validateAudioFile } from "@/lib/audio-limits";

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { workspaceIdentity, readLead, workspaceAdmin } = await import("@/lib/workspace.server");
        const identity = await workspaceIdentity(request);
        if (!identity) return jsonError(401, "முதலில் login பண்ணுங்க.");
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return jsonError(500, "Transcription is not configured on the server.");

        const len = Number(request.headers.get("content-length") ?? "0");
        if (len > MAX_AUDIO_BYTES + 1024 * 1024) return jsonError(413, "File is too large (max 24 MB).");

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
        const file = new File([stored], lead.audio_name, { type: stored.type });
        const invalid = validateAudioFile(file);
        if (invalid) return jsonError(400, invalid);
        const { transcribe, TRANSCRIPTION_MODEL, GEMINI_MAX_FILE_BYTES } = await import("@/lib/transcribe.server");
        if (file.size > GEMINI_MAX_FILE_BYTES) {
          return jsonError(413, "Gemini can transcribe recordings up to 14 MB. Please upload a shorter or compressed recording.");
        }
        const audio = new File([file], file.name, { type: transcriptionAudioType(file) });

        const audioPath = lead.audio_path;

        let res: Response;
        try {
          res = await transcribe({
            baseURL: "https://ai.gateway.lovable.dev", apiKey,
            model: TRANSCRIPTION_MODEL, maxFileBytes: GEMINI_MAX_FILE_BYTES, audioOnly: true,
          }, audio, { signal: request.signal });
        } catch (e) {
          console.error("transcription fetch failed", e);
          return jsonError(502, "Could not reach the transcription service. Please try again.");
        }

        if (!res.ok) {
          const text = await res.text();
          console.error("transcription error", res.status, text);
          let msg = "Transcription failed.";
          try {
            const j = JSON.parse(text);
            msg = j?.error?.message ?? j?.message ?? msg;
          } catch {}
          if (res.status === 429) msg = "Too many requests right now. Please wait a moment and try again.";
          if (res.status === 402) msg = msg || "AI credits are exhausted.";
          return jsonError(res.status, friendlyTranscriptionError(msg));
        }

        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "text/event-stream",
            "Cache-Control": "no-store",
            ...(audioPath ? { "X-Audio-Path": audioPath } : {}),
          },
        });
      },
    },
  },
});
