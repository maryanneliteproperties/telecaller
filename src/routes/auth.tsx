import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Headphones, ShieldCheck, UserRound, ArrowRight, Loader2 } from "lucide-react";
import { getDestinationClient } from "@/lib/destination-client";
import { loginAdmin, loginEmployee } from "@/lib/workspace.functions";
import { ADMIN_PIN_PATTERN, employeeLoginSchema } from "@/lib/workspace-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Login · AI Call Workspace" }, { name: "description", content: "Admin PIN and employee account login for the AI Call workspace." }, { property: "og:title", content: "Login · AI Call Workspace" }, { property: "og:description", content: "Secure access to customer calls, leads and Tamil reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuthPage,
});
function AuthPage() {
  const navigate = useNavigate(), adminLogin = useServerFn(loginAdmin), employeeLogin = useServerFn(loginEmployee);
  const [mode, setMode] = useState<"employee" | "admin">("employee"), [username, setUsername] = useState(""), [password, setPassword] = useState(""), [pin, setPin] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      if (mode === "admin") await adminLogin({ data: { pin } });
      else { const parsed = employeeLoginSchema.parse({ username, password }); const session = await employeeLogin({ data: parsed }); const { error } = await (await getDestinationClient()).auth.setSession(session); if (error) throw new Error("Login session அமைக்க முடியல."); }
      setPassword(""); setPin(""); await navigate({ to: "/" });
    } catch(e) { setError(e instanceof Error ? e.message : "Login செய்ய முடியல."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><div className="w-full max-w-sm"><div className="mb-10 flex items-center gap-3"><Headphones className="h-9 w-9 text-primary" /><span className="font-display text-2xl">AI Call Workspace</span></div><h1 className="font-display text-3xl">Welcome back</h1><div role="group" aria-label="Login role" className="my-7 flex gap-2"><Button variant={mode === "employee" ? "default" : "outline"} onClick={() => { setMode("employee"); setError(""); }}><UserRound />Employee</Button><Button variant={mode === "admin" ? "default" : "outline"} onClick={() => { setMode("admin"); setError(""); }}><ShieldCheck />Admin</Button></div><form onSubmit={submit} className="space-y-5">
    {mode === "employee" ? <><div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" required maxLength={40} value={username} onChange={e => setUsername(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" autoComplete="current-password" type="password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></div></> : <div className="space-y-2"><Label htmlFor="pin">Admin PIN</Label><Input id="pin" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} pattern={ADMIN_PIN_PATTERN} minLength={8} maxLength={12} required value={pin} onChange={e => setPin(e.target.value)} /></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy} size="lg" className="w-full">{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}{busy ? "Signing in…" : "Sign in"}</Button>
  </form></div></main>;
}