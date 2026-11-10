import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/analyse")({
  server: { handlers: { POST: async ({ request }) => {
    const { workspaceIdentity, readLead, workspaceAdmin } = await import("@/lib/workspace.server");
    const identity = await workspaceIdentity(request);
    if (!identity) return Response.json({ error: "முதலில் login பண்ணுங்க." }, { status: 401 });
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) return Response.json({ error: "GEMINI_API_KEY is missing from the server environment." }, { status: 500 });
    if (Number(request.headers.get("content-length") ?? 0) > 220000) return Response.json({ error: "This transcript is too long to analyse in one report." }, { status: 413 });
    let value: unknown;
    try { value = await request.json(); } catch { return Response.json({ error: "Could not read the transcript." }, { status: 400 }); }
    const input = z.object({
      transcript: z.string().trim().min(1).max(50000),
      audioPath: z.string().max(255).optional(),
      audioName: z.string().max(255).optional(),
      leadId: z.string().uuid(),
    }).safeParse(value);
    if (!input.success) return Response.json({ error: "Please provide a completed transcript of up to 50,000 characters." }, { status: 400 });
    let lead;
    try { lead = await readLead(input.data.leadId, identity); } catch { return Response.json({ error: "இந்த lead-க்கு அனுமதி இல்லை." }, { status: 403 }); }
    const db = workspaceAdmin();
    if (lead.call_report_id) {
      const { data: existing } = await db.from("call_reports").select("report").eq("id", lead.call_report_id).maybeSingle();
      if (existing) return new Response(`data: ${JSON.stringify({ type: "report", report: existing.report })}\n\n`, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
    }

    // Shared database-backed circuit breaker: stop repeated requests after a daily quota error.
    const { data: blockedUntil, error: quotaGuardError } = await db.rpc("get_call_analysis_quota_block");
    if (quotaGuardError) {
      console.error("[analyse] quota guard lookup failed", { code: quotaGuardError.code, message: quotaGuardError.message });
      return Response.json({ error: "AI Analysis பாதுகாப்பு அமைப்பு இன்னும் தயாராகவில்லை. Admin SQL setup-ஐ சரிபார்க்கவும்." }, { status: 503 });
    }
    if (blockedUntil && new Date(blockedUntil).getTime() > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000));
      return Response.json(
        { error: "Gemini API quota தற்காலிகமாக நிறுத்தப்பட்டுள்ளது. Quota reset ஆன பிறகு மீண்டும் முயற்சிக்கவும்." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // Atomic lock prevents simultaneous Analysis calls for the same lead across users and tabs.
    const lockToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await db.rpc("claim_call_analysis", {
      p_lead_id: lead.id,
      p_lock_token: lockToken,
    });
    if (claimError) {
      console.error("[analyse] analysis lock claim failed", { code: claimError.code, message: claimError.message });
      return Response.json({ error: "AI Analysis lock அமைப்பைச் சரிபார்க்கவும். Admin SQL setup தேவை." }, { status: 503 });
    }
    if (!claimed) {
      return Response.json({ error: "இந்த Lead-க்கு AI Analysis ஏற்கனவே நடைபெறுகிறது. சிறிது நேரம் கழித்து மீண்டும் திறக்கவும்." }, { status: 409 });
    }

    try {
      const { analyseTranscript } = await import("@/lib/analysis.server");
      const response = await analyseTranscript(request, input.data.transcript, apiKey, {
        audioPath: lead.audio_path, audioName: lead.audio_name, leadId: lead.id, ownerId: lead.owner_id,
      });
      const retryAfterHeader = response.headers.get("Retry-After");
      if (response.status === 429 && retryAfterHeader) {
        const retrySeconds = Math.min(86400, Math.max(60, Number(retryAfterHeader) || 3600));
        const blockedUntilValue = new Date(Date.now() + retrySeconds * 1000).toISOString();
        const { error: blockError } = await db.rpc("set_call_analysis_quota_block", { p_blocked_until: blockedUntilValue });
        if (blockError) console.error("[analyse] quota guard update failed", { code: blockError.code, message: blockError.message });
      }
      return response;
    } finally {
      const { error: releaseError } = await db.rpc("release_call_analysis", {
        p_lead_id: lead.id,
        p_lock_token: lockToken,
      });
      if (releaseError) console.error("[analyse] analysis lock release failed", { code: releaseError.code, message: releaseError.message });
    }
  } } },
});