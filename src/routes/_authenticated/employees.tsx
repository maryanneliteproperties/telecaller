import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { createEmployee, deleteEmployee, getWorkspaceIdentity, listEmployees, updateEmployee } from "@/lib/workspace.functions";
import { employeeSchema } from "@/lib/workspace-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Pencil, Trash2, X, Eye, EyeOff } from "lucide-react";

const employeesOptions = queryOptions({ queryKey: ["workspace", "employees"], queryFn: () => listEmployees() });
export const Route = createFileRoute("/_authenticated/employees")({
  beforeLoad: async () => { const identity = await getWorkspaceIdentity(); if (identity?.role !== "admin") throw redirect({ to: "/" }); },
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesOptions),
  head: () => ({ meta: [{ title: "Employees · AI Call Workspace" }, { name: "description", content: "Admin-managed employee accounts for the customer call workspace." }, { property: "og:title", content: "Employees · AI Call Workspace" }, { property: "og:description", content: "Create and view employee accounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EmployeesPage,
});
function EmployeesPage() {
  const { data } = useSuspenseQuery(employeesOptions), create = useServerFn(createEmployee), update = useServerFn(updateEmployee), remove = useServerFn(deleteEmployee), queryClient = useQueryClient();
  const [username, setUsername] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [editing, setEditing] = useState<{id:string;username:string;email:string}|null>(null);
  const [editUsername, setEditUsername] = useState(""), [editEmail, setEditEmail] = useState(""), [editPassword, setEditPassword] = useState(""), [showEditPassword, setShowEditPassword] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; setError(""); setMessage("");
    const parsed = employeeSchema.safeParse({ username, email, password });
    if (!parsed.success) { setError("சரியான username/email மற்றும் குறைந்தது 8 எழுத்துள்ள password கொடுங்க."); return; }
    setBusy(true);
    try { const result = await create({ data: parsed.data }); setMessage(`${result.username} account உருவாக்கப்பட்டது.`); setPassword(""); setUsername(""); setEmail(""); await queryClient.invalidateQueries({ queryKey: ["workspace", "employees"] }); }
    catch(e) { setError(e instanceof Error ? e.message : "Account உருவாக்க முடியல."); }
    finally { setBusy(false); }
  }
  function openEdit(row: {id:string;username:string;email:string}) {
    setEditing(row); setEditUsername(row.username); setEditEmail(row.email); setEditPassword(""); setShowEditPassword(false); setError(""); setMessage("");
  }
  async function saveEdit(e: FormEvent) {
    e.preventDefault(); if (!editing || busy) return;
    if (editUsername.trim().length < 3 || !/^[a-zA-Z0-9._-]+$/.test(editUsername.trim()) || !/^\S+@\S+\.\S+$/.test(editEmail.trim()) || (editPassword && editPassword.length < 8)) {
      setError("சரியான username/email கொடுங்க. Password மாற்றினால் குறைந்தது 8 எழுத்துகள் வேண்டும்."); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      await update({ data: { id: editing.id, username: editUsername.trim(), email: editEmail.trim(), ...(editPassword ? { password: editPassword } : {}) } });
      setEditing(null); setMessage("Employee விவரங்கள் update செய்யப்பட்டன."); await queryClient.invalidateQueries({ queryKey: ["workspace", "employees"] });
    } catch(e) { setError(e instanceof Error ? e.message : "Employee விவரங்களை update செய்ய முடியல."); }
    finally { setBusy(false); }
  }
  async function deleteRow(row: {id:string;username:string}) {
    if (busy || !window.confirm(`“${row.username}” employee account-ஐ delete செய்ய வேண்டுமா? இந்தச் செயலை மீண்டும் மாற்ற முடியாது.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await remove({ data: { id: row.id } }); setMessage(`${row.username} account delete செய்யப்பட்டது.`); await queryClient.invalidateQueries({ queryKey: ["workspace", "employees"] }); }
    catch(e) { setError(e instanceof Error ? e.message : "Employee account-ஐ delete செய்ய முடியல."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-10">
    <h1 className="font-display text-3xl">Employees</h1>
    <form onSubmit={submit} className="panel my-8 space-y-5 p-6 sm:p-8">
      <h2 className="text-lg font-medium">Create employee account</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="employee-username">Username</Label><Input id="employee-username" required maxLength={40} value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="employee-email">Email</Label><Input id="employee-email" type="email" required maxLength={255} value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="employee-password">Password</Label><Input id="employee-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></div>
      </div>
      {error && !editing && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-primary">{message}</p>}
      <Button disabled={busy}><UserPlus />{busy ? "Processing…" : "Create Account"}</Button>
    </form>
    {error && editing && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    <div className="panel overflow-x-auto p-3 sm:p-6">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead><tr className="border-b text-muted-foreground"><th scope="col" className="px-3 py-3 font-semibold">Username</th><th scope="col" className="px-3 py-3 font-semibold">Email</th><th scope="col" className="px-3 py-3 text-right font-semibold">Action</th></tr></thead>
        <tbody className="divide-y">{data.map(row => <tr key={row.id}>
          <td className="px-3 py-4 font-medium">{row.username}</td><td className="px-3 py-4 text-muted-foreground">{row.email}</td>
          <td className="px-3 py-4"><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => openEdit(row)}><Pencil className="mr-1 h-4 w-4" />Edit</Button><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => deleteRow(row)}><Trash2 className="mr-1 h-4 w-4" />Delete</Button></div></td>
        </tr>)}</tbody>
      </table>
      {data.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Employee accounts இன்னும் இல்லை.</p>}
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setEditing(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" className="panel w-full max-w-lg space-y-5 p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 id="edit-employee-title" className="text-xl font-semibold">Edit Employee</h2><Button type="button" variant="ghost" size="icon" aria-label="Close edit employee" disabled={busy} onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div>
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="edit-employee-username">Username</Label><Input id="edit-employee-username" required maxLength={40} value={editUsername} onChange={e => setEditUsername(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="edit-employee-email">Email</Label><Input id="edit-employee-email" type="email" required maxLength={255} value={editEmail} onChange={e => setEditEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="edit-employee-password">New Password (optional)</Label><div className="relative"><Input id="edit-employee-password" type={showEditPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="மாற்ற வேண்டுமென்றால் மட்டும் உள்ளிடவும்" className="pr-11" /><button type="button" onClick={() => setShowEditPassword(value => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={showEditPassword ? "Hide password" : "Show password"} aria-pressed={showEditPassword}>{showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><p className="text-xs text-muted-foreground">Password மாற்ற வேண்டாம் என்றால் காலியாக விடவும். பழைய password காட்டப்படாது.</p></div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button></div>
        </form>
      </section>
    </div>}
  </main>;
}