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
    if (lead.call_report_id) {
      const { data: existing } = await workspaceAdmin().from("call_reports").select("report").eq("id", lead.call_report_id).maybeSingle();
      if (existing) return new Response(`data: ${JSON.stringify({ type: "report", report: existing.report })}\n\n`, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
    }
    const { analyseTranscript } = await import("@/lib/analysis.server");
    return analyseTranscript(request, input.data.transcript, apiKey, { audioPath: lead.audio_path, audioName: lead.audio_name, leadId: lead.id, ownerId: lead.owner_id });
  } } },
});