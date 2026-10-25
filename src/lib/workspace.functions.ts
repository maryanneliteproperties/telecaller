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
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const db = workspaceAdmin();
  const { data: created, error } = await db.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { username: data.username } });
  if (error || !created.user) throw new Error("Account உருவாக்க முடியல. Username/email ஏற்கனவே உள்ளதா சரிபாருங்க.");
  const { error: roleError } = await db.from("user_roles").insert({ user_id: created.user.id, role: "employee" });
  if (roleError) { await db.auth.admin.deleteUser(created.user.id); throw new Error("Employee அனுமதி சேமிக்க முடியல."); }
  return { username: data.username };
});
export const listEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin, workspaceAdmin } = await import("./workspace.server");
  await requireAdmin();
  const { data, error } = await workspaceAdmin().from("profiles").select("id,username,email,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Employee விவரங்களை ஏற்ற முடியல.");
  return data ?? [];
});
export const submitLead = createServerFn({ method: "POST" }).inputValidator((v: unknown) => {
  if (!(v instanceof FormData)) throw new Error("Form சரியில்லை.");
  const fields = customerSchema.parse({ customerName: v.get("customerName"), customerPhone: v.get("customerPhone"), submissionKey: v.get("submissionKey") });
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
  const { data: saved, error } = await db.from("telecaller_data").upsert({ submission_key: data.submissionKey, owner_id: ownerId, customer_name: data.customerName, customer_phone: data.customerPhone, telecaller_name: identity.username, audio_name: data.file.name, audio_path: path, processing_status: "submitted" }, { onConflict: "submission_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error("Customer விவரங்கள் சேமிக்க முடியல. மீண்டும் Submit பண்ணுங்க.");
  if (saved) return { id: saved.id as string };
  const { data: duplicate } = await db.from("telecaller_data").select("id").eq("submission_key", data.submissionKey).maybeSingle();
  if (!duplicate) throw new Error("Submission-ஐ உறுதி செய்ய முடியல.");
  return { id: duplicate.id as string };
});
export const listLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { requireWorkspace, workspaceAdmin } = await import("./workspace.server");
  const identity = await requireWorkspace(), db = workspaceAdmin();
  let query = db.from("telecaller_data").select("id,call_report_id,customer_name,customer_phone,telecaller_name,audio_name,audio_path,overall_score,created_at,processing_status").order("created_at", { ascending: false }).limit(200);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data, error } = await query;
  if (error) throw new Error("Leads ஏற்ற முடியல. Account setup SQL-ஐ run பண்ணியிருக்கீங்களா சரிபாருங்க.");
  return Promise.all((data ?? []).map(async row => {
    const signed = row.audio_path ? await db.storage.from("call-audio").createSignedUrl(row.audio_path, 900) : null;
    return { ...row, audioUrl: signed?.data?.signedUrl ?? null };
  }));
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
  return Promise.all((data ?? []).map(async row => {
    const { data: signed } = row.audio_path ? await db.storage.from("call-audio").createSignedUrl(row.audio_path, 900) : { data: null };
    return { ...row, audioUrl: signed?.signedUrl ?? null };
  }));
});