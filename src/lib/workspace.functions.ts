import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { adminLoginSchema, customerSchema, employeeSchema, employeeLoginSchema } from "./workspace-schema";
import { validateAudioFile, transcriptionAudioType } from "./audio-limits";

export const getWorkspaceIdentity = createServerFn({ method: "GET" }).handler(async () => {
  const { workspaceIdentity } = await import("./workspace.server");
  return workspaceIdentity();
});
export const loginAdmin = createServerFn({ method: "POST" }).inputValidator((v: unknown) => adminLoginSchema.parse(v)).handler(async ({ data }) => {
  const { consumeAttempt, digest, workspaceAdmin } = await import("./workspace.server");
  await consumeAttempt("admin-pin");
  const pin = process.env["ADMIN_LOGIN_PIN"];
  if (!pin || await digest(data.pin) !== await digest(pin)) throw new Error("PIN சரியில்லை.");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v => v.toString(16).padStart(2, "0")).join("");
  const { error } = await workspaceAdmin().from("workspace_admin_sessions").insert({ token_hash: await digest(token), expires_at: new Date(Date.now() + 8 * 3600000).toISOString() });
  if (error) throw new Error("Admin session உருவாக்க முடியல.");
  // The preview runs inside an iframe, where SameSite=Strict cookies are
  // blocked; cross-site embeds need SameSite=None; Secure (partitioned).
  const request = getRequest();
  const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.includes("https") === true;
  setCookie("workspace_admin", token, { httpOnly: true, secure: https, sameSite: https ? "none" : "lax", partitioned: https, path: "/", maxAge: 8 * 3600 });
  return { ok: true };
});
export const loginEmployee = createServerFn({ method: "POST" }).inputValidator((v: unknown) => employeeLoginSchema.parse(v)).handler(async ({ data }) => {
  const { workspaceAdmin, consumeAttempt } = await import("./workspace.server");
  await consumeAttempt(`employee:${data.username}`);
  const db = workspaceAdmin();
  const { data: profile } = await db.from("profiles").select("email").eq("username", data.username).maybeSingle();
  // A dummy sign-in preserves the same generic failure path for unknown usernames.
  const { data: result, error } = await db.auth.signInWithPassword({ email: profile?.email ?? "invalid-account@example.invalid", password: data.password });
  if (error || !result.session || !profile) throw new Error("Username அல்லது password சரியில்லை.");
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", result.user.id).in("role", ["employee", "admin"]).limit(1).maybeSingle();
  if (!role) throw new Error("இந்த account-க்கு அனுமதி இல்லை.");
  deleteCookie("workspace_admin", { path: "/" });
  return { access_token: result.session.access_token, refresh_token: result.session.refresh_token };
});
export const logoutWorkspace = createServerFn({ method: "POST" }).handler(async () => {
  const { workspaceAdmin, digest } = await import("./workspace.server");
  const token = getRequest().headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("workspace_admin="))?.slice(16);
  if (token) await workspaceAdmin().from("workspace_admin_sessions").delete().eq("token_hash", await digest(token));
  deleteCookie("workspace_admin", { path: "/" });
  return { ok: true };
});
export const createEmployee = createServerFn({ method: "POST" }).inputValidator((v: unknown) => employeeSchema.parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin, recordWorkspaceActivity } = await import("./workspace.server");
  const identity = await requireAdmin();
  const db = workspaceAdmin();
  const { data: created, error } = await db.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { username: data.username } });
  if (error || !created.user) throw new Error("Account உருவாக்க முடியல. Username/email ஏற்கனவே உள்ளதா சரிபாருங்க.");
  const { error: roleError } = await db.from("user_roles").insert({ user_id: created.user.id, role: "employee" });
  if (roleError) { await db.auth.admin.deleteUser(created.user.id); throw new Error("Employee அனுமதி சேமிக்க முடியல."); }
  await recordWorkspaceActivity(identity, { action: "created", entityType: "employee", entityId: created.user.id, entityLabel: data.username });
  return { username: data.username };
});
export const listEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { data, error } = await workspaceAdmin().from("profiles").select("id,username,email,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Employee விவரங்களை ஏற்ற முடியல.");
  return data ?? [];
});
export const updateEmployee = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({
  id: z.string().uuid(),
  username: employeeSchema.shape.username,
  email: employeeSchema.shape.email,
  password: z.string().min(8).max(128).optional(),
}).parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin, recordWorkspaceActivity } = await import("./workspace.server");
  const identity = await requireAdmin();
  const db = workspaceAdmin();
  const { data: roles, error: roleReadError } = await db.from("user_roles").select("role").eq("user_id", data.id);
  if (roleReadError) throw new Error("Employee role-ஐ சரிபார்க்க முடியல.");
  if (!roles?.some(row => row.role === "employee") || roles.some(row => row.role === "admin")) throw new Error("Employee account மட்டும் edit செய்யலாம்.");
  const { data: existing, error: existingError } = await db.from("profiles").select("id,username,email").eq("id", data.id).maybeSingle();
  if (existingError || !existing) throw new Error("Employee account கிடைக்கல.");
  const { data: usernameMatch, error: usernameCheckError } = await db.from("profiles").select("id").eq("username", data.username.trim().toLowerCase()).neq("id", data.id).maybeSingle();
  if (usernameCheckError) throw new Error("Username-ஐ சரிபார்க்க முடியல.");
  if (usernameMatch) throw new Error("இந்த username ஏற்கனவே பயன்படுத்தப்படுகிறது.");
  const authUpdate: { email: string; email_confirm: boolean; user_metadata: { username: string }; password?: string } = {
    email: data.email.trim(),
    email_confirm: true,
    user_metadata: { username: data.username.trim().toLowerCase() },
  };
  if (data.password) authUpdate.password = data.password;
  const { error: authError } = await db.auth.admin.updateUserById(data.id, authUpdate);
  if (authError) throw new Error("Email/password update செய்ய முடியல. Email ஏற்கனவே பயன்படுத்தப்பட்டிருக்கலாம்.");
  const { error: profileError } = await db.from("profiles").update({ username: data.username.trim().toLowerCase(), email: data.email.trim() }).eq("id", data.id);
  if (profileError) throw new Error("Login account update ஆனது; profile விவரங்களை update செய்ய முடியல. Admin support தேவை.");
  await recordWorkspaceActivity(identity, { action: "updated", entityType: "employee", entityId: data.id, entityLabel: data.username, details: { previousUsername: existing.username, emailChanged: existing.email !== data.email.trim(), passwordChanged: Boolean(data.password) } });
  return { ok: true };
});
export const deleteEmployee = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin, recordWorkspaceActivity } = await import("./workspace.server");
  const identity = await requireAdmin();
  const db = workspaceAdmin();
  const { data: roles, error: roleReadError } = await db.from("user_roles").select("role").eq("user_id", data.id);
  if (roleReadError) throw new Error("Employee role-ஐ சரிபார்க்க முடியல.");
  if (!roles?.some(row => row.role === "employee") || roles.some(row => row.role === "admin")) throw new Error("Employee account மட்டும் delete செய்யலாம்.");
  const { data: profile } = await db.from("profiles").select("username").eq("id", data.id).maybeSingle();
  const { error } = await db.auth.admin.deleteUser(data.id);
  if (error) throw new Error("Employee account delete செய்ய முடியல.");
  await recordWorkspaceActivity(identity, { action: "deleted", entityType: "employee", entityId: data.id, entityLabel: profile?.username ?? "Employee" });
  return { ok: true };
});
export const submitLead = createServerFn({ method: "POST" }).inputValidator((v: unknown) => {
  if (!(v instanceof FormData)) throw new Error("Form சரியில்லை.");
  const fields = customerSchema.parse({ customerName: v.get("customerName"), customerPhone: v.get("customerPhone"), submissionKey: v.get("submissionKey"), followUpDate: v.get("followUpDate"), leadStage: v.get("leadStage"), projectId: (v.get("projectId") || undefined) });
  const file = v.get("file");
  if (!(file instanceof File)) throw new Error("Audio சேர்க்கவும்.");
  const invalid = validateAudioFile(file); if (invalid) throw new Error(invalid);
  if (file.name.length > 255) throw new Error("Audio பெயர் அதிக நீளமா இருக்கு.");
  return { ...fields, file };
}).handler(async ({ data }) => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  const ownerId = identity.role === "admin" && identity.id === "admin" ? null : identity.id;
  const { data: existing } = await db.from("telecaller_data").select("id,owner_id").eq("submission_key", data.submissionKey).maybeSingle();
  if (existing) {
    if (identity.role !== "admin" && existing.owner_id !== identity.id) throw new Error("இந்த submission-க்கு அனுமதி இல்லை.");
    return { id: existing.id as string };
  }
  const ext = data.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "audio";
  const path = `${ownerId ?? "admin"}/${data.submissionKey}.${ext}`;
  const { error: uploadError } = await db.storage.from("call-audio").upload(path, data.file, { contentType: transcriptionAudioType(data.file), upsert: true });
  if (uploadError) throw new Error("Audio சேமிக்க முடியல. மீண்டும் முயற்சி பண்ணுங்க.");
  const { data: saved, error } = await db.from("telecaller_data").upsert({ submission_key: data.submissionKey, owner_id: ownerId, customer_name: data.customerName, customer_phone: data.customerPhone, follow_up_date: data.followUpDate, lead_stage: data.leadStage, project_id: data.projectId ?? null, telecaller_name: identity.username, audio_name: data.file.name, audio_path: path, processing_status: "submitted" }, { onConflict: "submission_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error("Customer விவரங்கள் சேமிக்க முடியல. மீண்டும் Submit பண்ணுங்க.");
  if (saved) { await (await import("./workspace.server")).recordWorkspaceActivity(identity, { action: "created", entityType: "lead", entityId: saved.id, entityLabel: data.customerName, details: { phone: data.customerPhone } }); return { id: saved.id as string }; }
  const { data: duplicate } = await db.from("telecaller_data").select("id").eq("submission_key", data.submissionKey).maybeSingle();
  if (!duplicate) throw new Error("Submission-ஐ உறுதி செய்ய முடியல.");
  return { id: duplicate.id as string };
});
export const listLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  let query = db.from("telecaller_data").select("id,call_report_id,customer_name,customer_phone,telecaller_name,audio_name,audio_path,overall_score,created_at,processing_status,follow_up_date,follow_up_status,follow_up_rescheduled_date,follow_up_not_interested_reason,conversion_follow_up_date,conversion_follow_up_status,conversion_follow_up_rescheduled_date,conversion_follow_up_not_interested_reason,lead_stage,site_visit_date,site_visit_status,site_visit_cancel_reason,project_id").order("created_at", { ascending: false }).limit(200);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data, error } = await query;
  if (error) throw new Error("Leads ஏற்ற முடியல. Account setup SQL-ஐ run பண்ணியிருக்கீங்களா சரிபாருங்க.");
  const rows = data ?? [];
  const audioPaths = rows.flatMap(row => row.audio_path ? [row.audio_path] : []);
  const { data: signedFiles } = audioPaths.length
    ? await db.storage.from("call-audio").createSignedUrls(audioPaths, 900)
    : { data: [] };
  const signedByPath = new Map((signedFiles ?? []).map(file => [file.path, file.signedUrl]));
  return rows.map(row => ({ ...row, audioUrl: row.audio_path ? signedByPath.get(row.audio_path) ?? null : null }));
});

export const updateLeadFollowUp = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({
  id: z.string().uuid(),
  followUpType: z.enum(["site_visit", "conversion"]),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  followUpStatus: z.enum(["Pending", "Completed", "Rescheduled", "Not Interested"]),
  rescheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notInterestedReason: z.string().trim().max(500).nullable().optional(),
}).parse(v)).handler(async ({ data }) => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  if (data.followUpType === "conversion") {
    let eligibility = db.from("telecaller_data").select("id").eq("id", data.id).eq("site_visit_status", "Completed");
    if (identity.role !== "admin") eligibility = eligibility.eq("owner_id", identity.id);
    const { data: eligible, error: eligibilityError } = await eligibility.maybeSingle();
    if (eligibilityError) throw new Error("Site Visit status-ஐ சரிபார்க்க முடியல.");
    if (!eligible) throw new Error("Site Visit Completed ஆன customer-க்கு மட்டுமே Second Follow-up அமைக்க முடியும்.");
  }
  if (data.followUpStatus === "Rescheduled" && !data.rescheduledDate) throw new Error("Rescheduled என்றால் புதிய follow-up date கட்டாயம்.");
  if (data.followUpStatus === "Not Interested" && !data.notInterestedReason?.trim()) throw new Error("Not Interested காரணத்தை பதிவு செய்யவும்.");
  const { data: previous } = await db.from("telecaller_data").select("customer_name,follow_up_status,follow_up_rescheduled_date,conversion_follow_up_date,conversion_follow_up_status,conversion_follow_up_rescheduled_date").eq("id", data.id).maybeSingle();
  const values = data.followUpType === "site_visit"
    ? { follow_up_status: data.followUpStatus, follow_up_rescheduled_date: data.followUpStatus === "Rescheduled" ? data.rescheduledDate : null, follow_up_not_interested_reason: data.followUpStatus === "Not Interested" ? data.notInterestedReason : null }
    : { conversion_follow_up_date: data.followUpDate, conversion_follow_up_status: data.followUpStatus, conversion_follow_up_rescheduled_date: data.followUpStatus === "Rescheduled" ? data.rescheduledDate : null, conversion_follow_up_not_interested_reason: data.followUpStatus === "Not Interested" ? data.notInterestedReason : null };
  let query = db.from("telecaller_data").update(values).eq("id", data.id);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data: row, error } = await query.select("id").maybeSingle();
  if (error) throw new Error("Follow-up விவரங்களை update செய்ய முடியல. Database migration run செய்துள்ளீர்களா சரிபார்க்கவும்.");
  if (!row) throw new Error("இந்த lead கிடைக்கல அல்லது update செய்ய அனுமதி இல்லை.");
  await (await import("./workspace.server")).recordWorkspaceActivity(identity, { action: "updated", entityType: "follow_up", entityId: data.id, entityLabel: previous?.customer_name ?? "Lead", details: { followUpType: data.followUpType, oldStatus: data.followUpType === "site_visit" ? previous?.follow_up_status : previous?.conversion_follow_up_status, newStatus: data.followUpStatus, date: data.followUpDate, rescheduledDate: data.rescheduledDate ?? null } });
  return { ok: true };
});

export const updateLeadSiteVisit = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({
  id: z.string().uuid(),
  siteVisitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  siteVisitStatus: z.enum(["Not Planned", "Planned", "Confirmed", "Completed", "Rescheduled", "Cancelled"]),
  cancelReason: z.string().trim().max(500).nullable().optional(),
}).parse(v)).handler(async ({ data }) => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  if (data.siteVisitStatus === "Rescheduled" && !data.siteVisitDate) throw new Error("Rescheduled என்றால் புதிய Site Visit date கட்டாயம்.");
  if (data.siteVisitStatus === "Cancelled" && !data.cancelReason?.trim()) throw new Error("Cancelled காரணத்தை பதிவு செய்யவும்.");
  const { data: previous } = await db.from("telecaller_data").select("customer_name,site_visit_date,site_visit_status").eq("id", data.id).maybeSingle();
  const siteVisitUpdate = { site_visit_date: data.siteVisitDate, site_visit_status: data.siteVisitStatus, site_visit_cancel_reason: data.siteVisitStatus === "Cancelled" ? data.cancelReason : null, ...(data.siteVisitStatus === "Completed" ? { follow_up_status: "Completed", follow_up_rescheduled_date: null, follow_up_not_interested_reason: null } : {}) };
  let query = db.from("telecaller_data").update(siteVisitUpdate).eq("id", data.id);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data: row, error } = await query.select("id").maybeSingle();
  if (error) throw new Error("Site Visit விவரங்களை update செய்ய முடியல. Database migration run செய்துள்ளீர்களா சரிபார்க்கவும்.");
  if (!row) throw new Error("இந்த lead கிடைக்கல அல்லது update செய்ய அனுமதி இல்லை.");
  await (await import("./workspace.server")).recordWorkspaceActivity(identity, { action: "updated", entityType: "site_visit", entityId: data.id, entityLabel: previous?.customer_name ?? "Lead", details: { oldDate: previous?.site_visit_date, newDate: data.siteVisitDate, oldStatus: previous?.site_visit_status, newStatus: data.siteVisitStatus } });
  return { ok: true };
});
export const deleteLead = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin, recordWorkspaceActivity } = await import("./workspace.server");
  const identity = await requireAdmin();
  const db = workspaceAdmin();
  const { data: lead, error: readError } = await db.from("telecaller_data").select("id,call_report_id,audio_path,customer_name").eq("id", data.id).maybeSingle();
  if (readError || !lead) throw new Error("இந்த lead கிடைக்கல அல்லது ஏற்ற முடியல.");
  if (lead.call_report_id) {
    const { error: reportError } = await db.from("call_reports").delete().eq("id", lead.call_report_id);
    if (reportError) throw new Error("Lead report-ஐ delete செய்ய முடியல. Lead மாற்றப்படவில்லை.");
  }
  const { error: leadError } = await db.from("telecaller_data").delete().eq("id", data.id);
  if (leadError) throw new Error("Lead delete செய்ய முடியல.");
  if (lead.audio_path) {
    const { error: audioError } = await db.storage.from("call-audio").remove([lead.audio_path]);
    if (audioError) console.error("[deleteLead] Audio cleanup failed", { code: audioError.name, message: audioError.message });
  }
  await recordWorkspaceActivity(identity, { action: "deleted", entityType: "lead", entityId: data.id, entityLabel: lead.customer_name ?? "Lead" });
  return { ok: true };
});
export const getLead = createServerFn({ method: "GET" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data }) => {
  const { requireWorkspace, readLead, workspaceAdmin } = await import("./workspace.server");
  const row = await readLead(data.id, await requireWorkspace());
  const { data: signed } = await workspaceAdmin().storage.from("call-audio").createSignedUrl(row.audio_path, 900);
  return { ...row, audioUrl: signed?.signedUrl ?? null };
});
export const getLeadReport = createServerFn({ method: "GET" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data }) => {
  const { requireWorkspace, readLead, workspaceAdmin } = await import("./workspace.server");
  const lead = await readLead(data.id, await requireWorkspace());
  if (!lead.call_report_id) throw new Error("இந்த lead-க்கு இன்னும் report இல்லை.");
  const { data: row, error } = await workspaceAdmin().from("call_reports").select("report,transcript,audio_name,created_at").eq("id", lead.call_report_id).maybeSingle();
  if (error || !row?.report) throw new Error("Report-ஐ ஏற்ற முடியல.");
  return { report: row.report, transcript: row.transcript ?? "", audioName: row.audio_name ?? lead.audio_name ?? "call", createdAt: row.created_at ?? null };
});
const SUMMARY_SECTIONS = [["introduction", "அறிமுகம் மற்றும் பேச்சுத்திறன்"], ["discovery", "வாடிக்கையாளர் தேவையை அறிதல்"], ["listening", "கவனமாகக் கேட்டல்"], ["explanation", "திட்டத்தை விளக்கும் திறன்"], ["objections", "எதிர்ப்புகளைக் கையாளுதல்"], ["closing", "Closing மற்றும் அடுத்த நடவடிக்கை"]] as const;
export const getLeadSummary = createServerFn({ method: "GET" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data }) => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace();
  const cols = ["owner_id", "coaching_1", "coaching_2", "coaching_3", ...SUMMARY_SECTIONS.flatMap(([p]) => [`${p}_strength`, `${p}_missed`, `${p}_improvement`, `${p}_better_wording`])].join(",");
  const { data: row, error } = await workspaceAdmin().from("telecaller_data").select(cols).eq("id", data.id).maybeSingle();
  if (error || !row) throw new Error("Summary ஏற்ற முடியல.");
  const r = row as unknown as Record<string, string | null>;
  if (identity.role !== "admin" && r["owner_id"] !== identity.id) throw new Error("இந்த lead-க்கு அனுமதி இல்லை.");
  const pick = (suffix: string) => SUMMARY_SECTIONS.map(([p, label]) => ({ label, text: r[`${p}_${suffix}`] ?? null })).filter(x => x.text);
  return {
    good: pick("strength"),
    mistakes: pick("missed"),
    suggestions: [
      ...SUMMARY_SECTIONS.map(([p, label]) => ({ label, text: [r[`${p}_improvement`], r[`${p}_better_wording`] ? `சிறந்த வார்த்தை: ${r[`${p}_better_wording`]}` : null].filter(Boolean).join("\n") || null })).filter(x => x.text),
      ...[r["coaching_1"], r["coaching_2"], r["coaching_3"]].filter(Boolean).map((text, i) => ({ label: `பயிற்சி பரிந்துரை ${i + 1}`, text })),
    ],
  };
});
export const listReports = createServerFn({ method: "GET" }).handler(async () => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  let query = db.from("call_reports").select("id,created_at,transcript,report,audio_path,audio_name").order("created_at", { ascending: false }).limit(100);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data, error } = await query;
  if (error) throw new Error("Reports ஏற்ற முடியல.");
  const rows = data ?? [];
  const reportIds = rows.map(row => row.id);
  const { data: leadRows, error: leadError } = reportIds.length
    ? await db.from("telecaller_data").select("call_report_id,customer_name,customer_phone,telecaller_name,project_id").in("call_report_id", reportIds)
    : { data: [], error: null };
  if (leadError) throw new Error("Report customer விவரங்களை ஏற்ற முடியல.");
  const leadByReport = new Map((leadRows ?? []).map(row => [row.call_report_id, row]));
  const audioPaths = rows.flatMap(row => row.audio_path ? [row.audio_path] : []);
  const { data: signedFiles } = audioPaths.length
    ? await db.storage.from("call-audio").createSignedUrls(audioPaths, 900)
    : { data: [] };
  const signedByPath = new Map((signedFiles ?? []).map(file => [file.path, file.signedUrl]));
  return rows.map(row => ({ ...row, ...(leadByReport.get(row.id) ?? {}), audioUrl: row.audio_path ? signedByPath.get(row.audio_path) ?? null : null }));
});

const projectNameSchema = z.object({ name: z.string().trim().min(1, "Project Name கொடுக்கவும்.").max(120, "Project Name 120 எழுத்துகளுக்குள் இருக்க வேண்டும்.") });
const projectIdSchema = z.object({ id: z.string().uuid() });

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { data, error } = await workspaceAdmin().from("projects").select("id,name,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Projects பட்டியலை ஏற்ற முடியல. Project setup SQL run செய்துள்ளீர்களா சரிபார்க்கவும்.");
  return data ?? [];
});

export const createProject = createServerFn({ method: "POST" }).inputValidator((v: unknown) => projectNameSchema.parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { data: row, error } = await workspaceAdmin().from("projects").insert({ name: data.name }).select("id,name,created_at").single();
  if (error || !row) throw new Error(error?.code === "23505" ? "இந்த Project Name ஏற்கனவே உள்ளது." : "Project உருவாக்க முடியல.");
  return row;
});

export const updateProject = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({ id: z.string().uuid(), name: projectNameSchema.shape.name }).parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { data: row, error } = await workspaceAdmin().from("projects").update({ name: data.name }).eq("id", data.id).select("id,name,created_at").maybeSingle();
  if (error) throw new Error(error.code === "23505" ? "இந்த Project Name ஏற்கனவே உள்ளது." : "Project update செய்ய முடியல.");
  if (!row) throw new Error("Project கிடைக்கல.");
  return row;
});

export const deleteProject = createServerFn({ method: "POST" }).inputValidator((v: unknown) => projectIdSchema.parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { error, count } = await workspaceAdmin().from("projects").delete({ count: "exact" }).eq("id", data.id);
  if (error) throw new Error("Project delete செய்ய முடியல.");
  if (count === 0) throw new Error("Project கிடைக்கல அல்லது ஏற்கனவே delete செய்யப்பட்டது.");
  return { ok: true };
});

export const listWorkspaceFilterEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace();
  if (identity.role !== "admin") return [identity.username];
  const { data, error } = await workspaceAdmin().from("profiles").select("username").order("username", { ascending: true });
  if (error) throw new Error("Employee filter பட்டியலை ஏற்ற முடியல.");
  return ["Admin", ...(data ?? []).map(row => row.username)];
});

export const listAvailableProjects = createServerFn({ method: "GET" }).handler(async () => {
 const { requireWorkspace, workspaceAdmin } = await import("./workspace.server"); await requireWorkspace();
 const { data, error } = await workspaceAdmin().from("projects").select("id,name").order("name", { ascending: true });
 if (error) throw new Error("Projects பட்டியலை ஏற்ற முடியல. Admin-ஐ தொடர்பு கொள்ளவும்."); return data ?? [];
});


export const listWorkspaceActivity = createServerFn({ method: "GET" }).inputValidator((v: unknown) => z.object({
  from: z.string().optional(), to: z.string().optional(), type: z.string().optional(), actor: z.string().optional(),
}).parse(v)).handler(async ({ data }) => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  let query = workspaceAdmin().from("workspace_activity_history").select("id,actor_name,actor_role,action,entity_type,entity_id,entity_label,details,created_at").order("created_at", { ascending: false }).limit(500);
  if (data.from) query = query.gte("created_at", new Date(data.from + "T00:00:00").toISOString());
  if (data.to) query = query.lt("created_at", new Date(new Date(data.to + "T00:00:00").getTime() + 86400000).toISOString());
  if (data.type && data.type !== "all") query = query.eq("entity_type", data.type);
  if (data.actor && data.actor !== "all") query = query.eq("actor_name", data.actor);
  const { data: rows, error } = await query;
  if (error) throw new Error("History ஏற்ற முடியல. Activity History SQL run செய்துள்ளீர்களா சரிபார்க்கவும்.");
  return rows ?? [];
});
