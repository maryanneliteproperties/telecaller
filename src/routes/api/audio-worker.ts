import { createFileRoute } from "@tanstack/react-router";
import { createParser } from "eventsource-parser";

type Job = {
  id: string;
  lead_id: string;
  filename: string;
  status: string;
  stage: "transcribing" | "analysing" | "completed";
  transcript: string | null;
  attempts: number;
};

function parseEvents(body: string) {
  const events: Array<Record<string, unknown>> = [];
  const parser = createParser({ onEvent(event) { try { events.push(JSON.parse(event.data)); } catch {} } });
  parser.feed(body);
  return events;
}

function getError(body: string, status: number) {
  try {
    const value = JSON.parse(body);
    return String(value.error ?? value.message ?? body).slice(0, 1000);
  } catch {
    return body.slice(0, 1000) || `Server error (${status})`;
  }
}

export const Route = createFileRoute("/api/audio-worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { workspaceAdmin } = await import("@/lib/workspace.server");
        const db = workspaceAdmin();
        const { data, error } = await db.rpc("claim_audio_processing_job");
        if (error) {
          console.error("[audio-worker] claim failed", { code: error.code, message: error.message });
          return Response.json({ error: "Queue claim failed" }, { status: 500 });
        }
        const job = (Array.isArray(data) ? data[0] : data) as Job | null;
        if (!job) return Response.json({ ok: true, processed: false, message: "No pending audio jobs." });

        const updateJob = async (values: Record<string, unknown>) => {
          const { error: updateError } = await db.from("audio_processing_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", job.id);
          if (updateError) throw updateError;
        };
        const updateLead = async (processing_status: string) => {
          const { error: updateError } = await db.from("telecaller_data").update({ processing_status }).eq("id", job.lead_id);
          if (updateError) throw updateError;
        };

        try {
          const { data: lead, error: leadError } = await db.from("telecaller_data")
            .select("id,call_report_id,audio_name,processing_status")
            .eq("id", job.lead_id).maybeSingle();
          if (leadError || !lead) throw new Error("Lead record not found.");

          if (lead.call_report_id) {
            await updateJob({ status: "completed", stage: "completed", completed_at: new Date().toISOString(), locked_at: null, last_error: null });
            await updateLead("analysed");
            return Response.json({ ok: true, processed: true, status: "completed", recoveredExistingReport: true });
          }

          const headers = { Authorization: `Bearer ${secret}` };
          const base = new URL(request.url);
          let transcript = job.transcript?.trim() ?? "";

          if (!transcript) {
            await updateJob({ stage: "transcribing", last_error: null });
            await updateLead("transcribing");
            const form = new FormData();
            form.set("leadId", job.lead_id);
            const response = await fetch(new URL("/api/transcribe", base), {
              method: "POST", headers, body: form, signal: AbortSignal.timeout(150_000),
            });
            const body = await response.text();
            if (!response.ok) throw Object.assign(new Error(getError(body, response.status)), { httpStatus: response.status });
            const transcriptEvent = parseEvents(body).find(event => event.type === "transcript.text.done");
            transcript = typeof transcriptEvent?.text === "string" ? transcriptEvent.text.trim() : "";
            if (!transcript) throw new Error("Transcription response-ல் முழுமையான transcript இல்லை.");
            // Persist immediately. If analysis fails or the worker is interrupted,
            // the next run resumes from this transcript without paying for transcription again.
            await updateJob({ transcript, stage: "analysing", last_error: null });
          }

          await updateJob({ stage: "analysing", last_error: null });
          await updateLead("analysing");
          const analysis = await fetch(new URL("/api/analyse", base), {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ transcript, audioName: job.filename || lead.audio_name || "call", leadId: job.lead_id }),
            signal: AbortSignal.timeout(90_000),
          });
          const analysisBody = await analysis.text();
          if (!analysis.ok) throw Object.assign(new Error(getError(analysisBody, analysis.status)), { httpStatus: analysis.status });
          const reportEvent = parseEvents(analysisBody).find(event => event.type === "report");
          if (!reportEvent?.report) {
            // Analyse may have saved the report just before a connection interruption.
            const { data: refreshed } = await db.from("telecaller_data").select("call_report_id").eq("id", job.lead_id).maybeSingle();
            if (!refreshed?.call_report_id) throw new Error("Final AI report கிடைக்கவில்லை.");
          }

          await updateJob({ status: "completed", stage: "completed", completed_at: new Date().toISOString(), locked_at: null, last_error: null });
          await updateLead("analysed");
          return Response.json({ ok: true, processed: true, status: "completed", leadId: job.lead_id });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Audio processing failed.";
          const status = Number((error as { httpStatus?: number })?.httpStatus ?? 0);
          const dailyQuota = /daily quota|தினசரி.*quota|requests per day|per day.*free tier|daily limit|retry in \d+h/i.test(message);
          const permanent = [400, 401, 403, 413].includes(status) && !dailyQuota;
          const exhausted = job.attempts >= 10;
          const failed = permanent || exhausted;
          const delayMinutes = dailyQuota ? 24 * 60 : Math.min(360, 2 ** Math.min(job.attempts, 8));
          const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
          console.error("[audio-worker] job failed", { leadId: job.lead_id, attempt: job.attempts, status, failed, message });
          await updateJob({
            status: failed ? "failed" : "queued",
            locked_at: null,
            last_error: message,
            next_attempt_at: failed ? new Date().toISOString() : nextAttempt,
          });
          await updateLead(failed ? "failed" : "submitted");
          return Response.json({ ok: false, processed: true, status: failed ? "failed" : "queued", retryAt: failed ? null : nextAttempt, error: message }, { status: 200 });
        }
      },
    },
  },
});
