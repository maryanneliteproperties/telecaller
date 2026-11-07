import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Headphones, ShieldCheck, UserRound, ArrowRight, Loader2, Download, Smartphone } from "lucide-react";
import { getDestinationClient } from "@/lib/destination-client";
import { loginAdmin, loginEmployee } from "@/lib/workspace.functions";
import { ADMIN_PIN_PATTERN, employeeLoginSchema } from "@/lib/workspace-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ANDROID_DOWNLOAD_URL = "https://github.com/maryanneliteproperties/telecaller/releases/latest/download/telecaller.apk";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Login · Mary Ann Elite Properties CRM" },
      { name: "description", content: "Secure employee and admin access to Mary Ann Elite Properties Telecaller CRM." },
      { property: "og:title", content: "Mary Ann Elite Properties · Telecaller CRM" },
      { property: "og:description", content: "Secure access to leads, follow-ups and call reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const adminLogin = useServerFn(loginAdmin);
  const employeeLogin = useServerFn(loginEmployee);
  const [mode, setMode] = useState<"employee" | "admin">("employee");
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    setIsNativeApp(capacitor?.isNativePlatform?.() === true);
  }, []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "admin") {
        await adminLogin({ data: { pin } });
      } else {
        const parsed = employeeLoginSchema.parse({ username, password });
        const session = await employeeLogin({ data: parsed });
        const { error } = await (await getDestinationClient()).auth.setSession(session);
        if (error) throw new Error("Login session அமைக்க முடியல.");
      }
      setPassword("");
      setPin("");
      await navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login செய்ய முடியல.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div className="relative w-full max-w-md">
        <section className="panel rounded-3xl p-6 shadow-xl shadow-primary/5 sm:p-9">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Headphones className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide text-foreground">MARY ANN ELITE PROPERTIES</p>
              <p className="text-xs text-muted-foreground">Telecaller CRM</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="eyebrow mb-2">Workspace access</p>
            <h1 className="font-display text-3xl tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to manage leads, follow-ups and customer calls.</p>
          </div>

          <div role="group" aria-label="Login role" className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <Button type="button" variant={mode === "employee" ? "default" : "ghost"} className="w-full" onClick={() => { setMode("employee"); setError(""); }}>
              <UserRound className="mr-1 h-4 w-4" />Employee
            </Button>
            <Button type="button" variant={mode === "admin" ? "default" : "ghost"} className="w-full" onClick={() => { setMode("admin"); setError(""); }}>
              <ShieldCheck className="mr-1 h-4 w-4" />Admin
            </Button>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {mode === "employee" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" autoComplete="username" required maxLength={40} value={username} onChange={e => setUsername(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" autoComplete="current-password" type="password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="pin">Admin PIN</Label>
                <Input id="pin" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} pattern={ADMIN_PIN_PATTERN} minLength={8} maxLength={12} required value={pin} onChange={e => setPin(e.target.value)} />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} size="lg" className="w-full">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </section>

        <a
          href={ANDROID_DOWNLOAD_URL}
          className="mt-4 flex w-full items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-card/90 p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Get the Android App</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Install Telecaller CRM on your phone</span>
            </span>
          </span>
          <Download className="h-5 w-5 shrink-0 text-primary" />
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">Secure team access · Your CRM data stays in the existing workspace</p>
      </div>
    </main>
  );
}        {!isNativeApp && (\n        )}\n        <p className="mt-3 text-center text-xs text-muted-foreground">Secure team access · Your CRM data stays in the existing workspace</p>
      </div>
    </main>
  );
}
