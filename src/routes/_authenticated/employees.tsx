import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { createEmployee, getWorkspaceIdentity, listEmployees } from "@/lib/workspace.functions";
import { employeeSchema } from "@/lib/workspace-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";

const employeesOptions = queryOptions({ queryKey: ["workspace", "employees"], queryFn: () => listEmployees() });
export const Route = createFileRoute("/_authenticated/employees")({
  beforeLoad: async () => { const identity = await getWorkspaceIdentity(); if (identity?.role !== "admin") throw redirect({ to: "/" }); },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesOptions),
  head: () => ({ meta: [{ title: "Employees · AI Call Workspace" }, { name: "description", content: "Admin-managed employee accounts for the customer call workspace." }, { property: "og:title", content: "Employees · AI Call Workspace" }, { property: "og:description", content: "Create and view employee accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EmployeesPage,
});
function EmployeesPage() {
  const { data } = useSuspenseQuery(employeesOptions), create = useServerFn(createEmployee), queryClient = useQueryClient();
  const [username, setUsername] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; setError(""); setMessage(""); const parsed = employeeSchema.safeParse({ username, email, password }); if (!parsed.success) { setError("சரியான username/email மற்றும் குறைந்தது 8 எழுத்துள்ள password கொடுங்க."); return; } setBusy(true); try { const result = await create({ data: parsed.data }); setMessage(`${result.username} account உருவாக்கப்பட்டது.`); setPassword(""); setUsername(""); setEmail(""); await queryClient.invalidateQueries({ queryKey: ["workspace", "employees"] }); } catch(e) { setError(e instanceof Error ? e.message : "Account உருவாக்க முடியல."); } finally { setBusy(false); } }
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-10"><h1 className="font-display text-3xl">Employees</h1><form onSubmit={submit} className="my-8 space-y-5 border-y py-7"><h2 className="text-lg font-medium">Create employee account</h2><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="employee-username">Username</Label><Input id="employee-username" required maxLength={40} value={username} onChange={e => setUsername(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="employee-email">Email</Label><Input id="employee-email" type="email" required maxLength={255} value={email} onChange={e => setEmail(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="employee-password">Password</Label><Input id="employee-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></div></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-primary">{message}</p>}<Button disabled={busy}><UserPlus />{busy ? "Creating…" : "Create Account"}</Button></form><div className="divide-y">{data.map(row => <div key={row.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm"><span className="font-medium">{row.username}</span><span className="text-muted-foreground">{row.email}</span></div>)}</div></main>;
}