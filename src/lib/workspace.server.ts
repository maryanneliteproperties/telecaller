import { getRequest } from "@tanstack/react-start/server";
import { getDestinationAdmin } from "./destination.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canReadLead, type WorkspaceIdentity } from "./workspace-schema";

// External tables intentionally have local types, separate from generated Cloud types.
export function workspaceAdmin(): SupabaseClient { return getDestinationAdmin() as SupabaseClient; }
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function consumeAttempt(scope: string) {
  const { data, error } = await workspaceAdmin().rpc("consume_workspace_attempt", { attempt_scope: await digest(scope) });
  if (error) {
    // Log only the database error fields; never log keys, PINs, or request data.
    console.error("[consumeAttempt] Supabase RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Account setup இன்னும் முடியல. Admin setup SQL-ஐ run பண்ணுங்க.");
  }
  if (!data) throw new Error("அதிக முயற்சிகள் வந்திருக்கு. 15 நிமிடம் கழித்து முயற்சி பண்ணுங்க.");
}
export async function workspaceIdentity(request: Request = getRequest()): Promise<WorkspaceIdentity | null> {
  const db = workspaceAdmin();
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("workspace_admin="))?.slice("workspace_admin=".length);
  if (cookie && /^[a-f0-9]{64}$/.test(cookie)) {
    const { data } = await db.from("workspace_admin_sessions").select("token_hash").eq("token_hash", await digest(cookie)).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (data) return { id: "admin", username: "Admin", role: "admin" };
  }
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const { data: user, error } = await db.auth.getUser(token);
  if (error || !user.user) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("username").eq("id", user.user.id).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", user.user.id),
  ]);
  const role = roles?.some(r => r.role === "admin") ? "admin" : roles?.some(r => r.role === "employee") ? "employee" : null;
  if (!profile || !role) return null;
  return { id: user.user.id, username: profile.username, role };
}
export async function requireWorkspace(request?: Request) {
  const identity = await workspaceIdentity(request);
  if (!identity) throw new Error("முதலில் login பண்ணுங்க.");
  return identity;
}
export async function requireAdmin() {
  const identity = await requireWorkspace();
  if (identity.role !== "admin") throw new Error("Admin மட்டும் இதைச் செய்யலாம்.");
  return identity;
}
export async function readLead(id: string, identity: WorkspaceIdentity) {
  let query = workspaceAdmin().from("telecaller_data").select("*").eq("id", id);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("இந்த lead-ஐ பார்க்க அனுமதி இல்லை அல்லது கிடைக்கல.");
  if (!canReadLead(identity, data.owner_id ?? null)) throw new Error("இந்த lead-க்கு அனுமதி இல்லை.");
  return data;
}