import { createFileRoute } from "@tanstack/react-router";

// Gemini Files & Interactions API moolam audio transcribe panra helper
async function transcribeAudioWithGemini(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const startUpload = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audioBuffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: fileName } }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!startUpload.ok) {
    const err = await startUpload.text();
    throw new Error(`Gemini upload start failed (${startUpload.status}): ${err}`);
  }

  const uploadUrl = startUpload.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload URL கிடைக்கவில்லை");

  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(audioBuffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: audioBuffer,
    signal: AbortSignal.timeout(60_000),
  });

  if (!uploaded.ok) {
    const err = await uploaded.text();
    throw new Error(`Gemini upload finalize failed (${uploaded.status}): ${err}`);
  }

  const uploadedJson = await uploaded.json();
  const fileUri = uploadedJson?.file?.uri;
  if (!fileUri) throw new Error("Gemini file URI கிடைக்கவில்லை");

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.5-transcribe",
      input: [{ type: "audio", uri: fileUri, mime_type: mimeType }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini transcribe failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const textParts: string[] = [];
  const addText = (value: unknown) => {
    if (typeof value === "string" && value.trim()) textParts.push(value.trim());
  };
  addText(data?.output_text);
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      addText(item?.text);
      addText(item?.content?.text);
      if (Array.isArray(item?.content)) {
        for (const part of item.content) addText(part?.text);
      }
    }
  }
  if (Array.isArray(data?.candidates)) {
    for (const candidate of data.candidates) {
      for (const part of candidate?.content?.parts ?? []) addText(part?.text);
    }
  }

  return [...new Set(textParts)].join("\n").trim();
}

export const Route = createFileRoute("/api/superfone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Optional Secret Verification
        const secret = process.env["SUPERFONE_WEBHOOK_SECRET"];
        if (secret) {
          const authHeader =
            request.headers.get("x-superfone-secret") ||
            new URL(request.url).searchParams.get("secret");
          if (authHeader !== secret) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const {
          event,
          cdr_recording_url,
          cdr_uuid,
          cdr_phone,
          cdr_duration,
          cdr_disposition,
          contact_first_name,
          contact_last_name,
          staff_first_name,
          staff_last_name,
        } = body ?? {};

        // Recording available event mattum thaan process pannanum
        if (event !== "CDR_RECORDING_AVAILABLE" || !cdr_recording_url) {
          return Response.json({
            ok: true,
            message: `Ignored event: ${event || "unknown"}`,
          });
        }

        // Answer aagatha calls / zero duration calls ignore pannalam
        if (cdr_disposition && cdr_disposition !== "ANSWER" && cdr_duration === 0) {
          return Response.json({
            ok: true,
            message: `Ignored non-answered call: ${cdr_disposition}`,
          });
        }

        const { workspaceAdmin } = await import("@/lib/workspace.server");
        const db = workspaceAdmin();

        // 2. Superfone cloud pre-signed URL-la irunthu audio download panrom
        const audioRes = await fetch(cdr_recording_url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!audioRes.ok) {
          return Response.json(
            { error: "Failed to download recording from Superfone" },
            { status: 502 },
          );
        }

        const audioBytes = Buffer.from(await audioRes.arrayBuffer());
        const mimeType = audioRes.headers.get("content-type") || "audio/mpeg";
        const ext = mimeType.includes("wav") ? "wav" : "mp3";

        const submissionKey = `superfone-${cdr_uuid || crypto.randomUUID()}`;
        const audioName = `superfone-${cdr_uuid || Date.now()}.${ext}`;
        const audioPath = `admin/${submissionKey}.${ext}`;

        // 3. Supabase Storage bucket "call-audio" la upload panrom
        const { error: uploadError } = await db.storage
          .from("call-audio")
          .upload(audioPath, audioBytes, {
            contentType: mimeType,
            upsert: true,
          });

        if (uploadError) {
          return Response.json(
            { error: "Failed to save call audio in storage" },
            { status: 500 },
          );
        }

        // 4. Customer and Telecaller name details
        const customerName =
          [contact_first_name, contact_last_name].filter(Boolean).join(" ").trim() ||
          (cdr_phone ? `Customer (${cdr_phone})` : "Superfone Lead");
        const telecallerName =
          [staff_first_name, staff_last_name].filter(Boolean).join(" ").trim() ||
          "Superfone Telecaller";

        // 5. telecaller_data table-la lead save panrom
        const { data: lead, error: leadError } = await db
          .from("telecaller_data")
          .upsert(
            {
              submission_key: submissionKey,
              customer_name: customerName,
              customer_phone: cdr_phone ?? null,
              telecaller_name: telecallerName,
              audio_name: audioName,
              audio_path: audioPath,
              processing_status: "submitted",
            },
            { onConflict: "submission_key" },
          )
          .select("id, audio_path, audio_name")
          .single();

        if (leadError || !lead) {
          return Response.json(
            { error: "Failed to save lead in database" },
            { status: 500 },
          );
        }

        // 6. Automatic-ah Gemini Transcription and QA Report Score run panrom
        const apiKey = process.env["GEMINI_API_KEY"];
        if (apiKey) {
          try {
            const transcript = await transcribeAudioWithGemini(
              audioBytes,
              audioName,
              mimeType,
              apiKey,
            );

            if (transcript) {
              const { analyseTranscript } = await import("@/lib/analysis.server");
              const dummyReq = new Request("https://localhost/api/analyse", {
                signal: AbortSignal.timeout(60_000),
              });
              await analyseTranscript(dummyReq, transcript, apiKey, {
                audioPath: lead.audio_path,
                audioName: lead.audio_name,
                leadId: lead.id,
                ownerId: null,
              });
              return Response.json({ ok: true, leadId: lead.id, status: "analysed" });
            }
          } catch (aiErr) {
            console.error("[superfone] AI processing error:", aiErr);
          }
        }

        // AI timeout or quota issue irundhalum lead submitted status-la safe-ah irukkum
        return Response.json({ ok: true, leadId: lead.id, status: "submitted" });
      },
    },
  },
});
