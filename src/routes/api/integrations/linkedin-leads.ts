import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/integrations/linkedin-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LINKEDIN_LEAD_SYNC_SECRET"];
        const supplied = request.headers.get("x-linkedin-sync-secret") ?? "";
        if (!expected || supplied.length !== expected.length ||
            !crypto.subtle || supplied !== expected) return json(401, { error: "Unauthorized integration request." });

        let input: Record<string, unknown>;
        try { input = await request.json() as Record<string, unknown>; }
        catch { return json(400, { error: "Invalid JSON payload." }); }

        const sourceLeadId = String(input.sourceLeadId ?? "").trim();
        const employeeEmail = String(input.employeeEmail ?? "").trim().toLowerCase();
        const profileName = String(input.profileName ?? "").trim();
        const assignedAt = String(input.assignedAt ?? "").trim();
        if (!sourceLeadId || !employeeEmail || !profileName || !assignedAt ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeEmail) ||
            !Number.isFinite(Date.parse(assignedAt))) {
          return json(400, { error: "Required LinkedIn lead fields are missing or invalid." });
        }

        const url = process.env["SUPABASE_URL"];
        const key = process.env["EXTERNAL_SUPABASE_SECRET_KEY"];
        if (!url || !key) return json(503, { error: "Telecaller database integration is not configured." });
        const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: profile, error: profileError } = await db.from("profiles")
          .select("id,email").ilike("email", employeeEmail).maybeSingle();
        if (profileError) return json(503, { error: "Could not verify Telecaller employee account." });
        if (!profile) return json(409, { error: "No Telecaller employee account matches this email." });
        const { data: roles, error: roleError } = await db.from("user_roles")
          .select("role").eq("user_id", profile.id);
        if (roleError) return json(503, { error: "Could not verify Telecaller employee role." });
        if (!roles?.some((row) => row.role === "employee")) return json(403, { error: "Matched Telecaller account is not an employee." });

        const row = {
          source_lead_id: sourceLeadId,
          owner_id: profile.id,
          employee_email: employeeEmail,
          profile_name: profileName,
          photo_url: typeof input.photoUrl === "string" ? input.photoUrl : null,
          designation: typeof input.designation === "string" ? input.designation : null,
          company: typeof input.company === "string" ? input.company : null,
          phone: typeof input.phone === "string" ? input.phone : null,
          contact_email: typeof input.contactEmail === "string" ? input.contactEmail : null,
          linkedin_url: typeof input.linkedinUrl === "string" ? input.linkedinUrl : null,
          assigned_by_name: typeof input.assignedByName === "string" ? input.assignedByName : null,
          assigned_by_role: typeof input.assignedByRole === "string" ? input.assignedByRole : null,
          assigned_at: assignedAt,
          project: typeof input.project === "string" ? input.project : null,
          follow_up_date: typeof input.followUpDate === "string" ? input.followUpDate : null,
          site_visit_date: typeof input.siteVisitDate === "string" ? input.siteVisitDate : null,
          updated_at: new Date().toISOString(),
        };
        const { data: saved, error } = await db.from("linkedin_assigned_leads")
          .upsert(row, { onConflict: "source_lead_id" })
          .select("id,source_lead_id,owner_id").single();
        if (error || !saved) return json(503, { error: "Could not save LinkedIn lead in Telecaller." });
        return json(200, { success: true, id: saved.id, sourceLeadId: saved.source_lead_id });
      },
      GET: async ({ request }) => {
        const { workspaceIdentity, workspaceAdmin } = await import("@/lib/workspace.server");
        const identity = await workspaceIdentity(request);
        if (!identity) return json(401, { error: "முதலில் login பண்ணுங்க." });
        const db = workspaceAdmin();
        let query = db.from("linkedin_assigned_leads").select("*").order("assigned_at", { ascending: false }).limit(300);
        if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
        const { data, error } = await query;
        if (error) return json(503, { error: "LinkedIn assigned leads ஏற்ற முடியல. Integration SQL run செய்துள்ளீர்களா சரிபார்க்கவும்." });
        const rows = data ?? [];
        const callIds = rows.flatMap((row) => row.linked_telecaller_data_id ? [row.linked_telecaller_data_id] : []);
        const { data: calls } = callIds.length
          ? await db.from("telecaller_data").select("id,project_id,follow_up_date,site_visit_date,audio_name,audio_path,overall_score,call_report_id,created_at").in("id", callIds)
          : { data: [] };
        const byId = new Map((calls ?? []).map((call) => [call.id, call]));
        const paths = (calls ?? []).flatMap((call) => call.audio_path ? [call.audio_path] : []);
        const { data: signed } = paths.length ? await db.storage.from("call-audio").createSignedUrls(paths, 900) : { data: [] };
        const signedByPath = new Map((signed ?? []).map((file) => [file.path, file.signedUrl]));
        return json(200, { rows: rows.map((row) => {
          const call = row.linked_telecaller_data_id ? byId.get(row.linked_telecaller_data_id) : null;
          return { ...row, call: call ? { ...call, audioUrl: call.audio_path ? signedByPath.get(call.audio_path) ?? null : null } : null };
        }) });
      },
    },
  },
});
