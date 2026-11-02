import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { createProject, deleteProject, getWorkspaceIdentity, listProjects, updateProject } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus, Pencil, Trash2, X } from "lucide-react";

const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listProjects() });
export const Route = createFileRoute("/_authenticated/projects")({
  beforeLoad: async () => { const identity = await getWorkspaceIdentity(); if (identity?.role !== "admin") throw redirect({ to: "/" }); },
  loader: ({ context }) => context.queryClient.ensureQueryData(projectsOptions),
  head: () => ({ meta: [{ title: "Projects · Mary Ann Elite Properties" }, { name: "description", content: "Admin project management." }] }),
  component: ProjectsPage,
});

type Project = { id: string; name: string; created_at: string };
function ProjectsPage() {
  const { data } = useSuspenseQuery(projectsOptions);
  const create = useServerFn(createProject), update = useServerFn(updateProject), remove = useServerFn(deleteProject);
  const queryClient = useQueryClient();
  const [name, setName] = useState(""), [editing, setEditing] = useState<Project | null>(null), [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function refresh() { await queryClient.invalidateQueries({ queryKey: ["workspace", "projects"] }); }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    const value = name.trim(); if (!value) { setError("Project Name கொடுக்கவும்."); return; }
    setBusy(true); setError(""); setMessage("");
    try { await create({ data: { name: value } }); setName(""); setMessage("Project வெற்றிகரமாக சேர்க்கப்பட்டது."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Project சேர்க்க முடியல."); }
    finally { setBusy(false); }
  }
  function openEdit(row: Project) { setEditing(row); setEditName(row.name); setError(""); setMessage(""); }
  async function saveEdit(e: FormEvent) {
    e.preventDefault(); if (!editing || busy) return;
    if (!editName.trim()) { setError("Project Name கொடுக்கவும்."); return; }
    setBusy(true); setError(""); setMessage("");
    try { await update({ data: { id: editing.id, name: editName.trim() } }); setEditing(null); setMessage("Project update செய்யப்பட்டது."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Project update செய்ய முடியல."); }
    finally { setBusy(false); }
  }
  async function deleteRow(row: Project) {
    if (busy || !window.confirm(`“${row.name}” project-ஐ delete செய்ய வேண்டுமா? இந்தச் செயலை மீண்டும் மாற்ற முடியாது.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await remove({ data: { id: row.id } }); setMessage("Project delete செய்யப்பட்டது."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Project delete செய்ய முடியல."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-10">
    <div className="mb-7"><h1 className="font-display text-3xl">Projects</h1><p className="mt-1 text-sm text-muted-foreground">Create and manage property projects</p></div>
    <form onSubmit={submit} className="panel my-6 space-y-4 p-5 sm:p-7">
      <h2 className="text-lg font-semibold">Add Project</h2>
      <div className="space-y-2"><Label htmlFor="project-name">Project Name</Label><Input id="project-name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter project name" required maxLength={120} /></div>
      <Button type="submit" disabled={busy}><FolderPlus className="mr-2 h-4 w-4" />{busy ? "Submitting…" : "Submit"}</Button>
    </form>
    {error && !editing && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="mb-4 text-sm text-primary">{message}</p>}
    <section className="panel overflow-hidden">
      <div className="border-b px-5 py-4"><h2 className="font-semibold">Project List</h2><p className="text-xs text-muted-foreground">{data.length} projects</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead><tr className="border-b bg-muted/40 text-muted-foreground"><th className="w-20 px-4 py-3 font-semibold">S.No</th><th className="px-4 py-3 font-semibold">Project Name</th><th className="w-52 px-4 py-3 font-semibold">Create At</th><th className="w-44 px-4 py-3 text-right font-semibold">Action</th></tr></thead>
        <tbody className="divide-y">{data.map((row, index) => <tr key={row.id} className="hover:bg-muted/20"><td className="px-4 py-4 text-muted-foreground">{index + 1}</td><td className="px-4 py-4 font-medium">{row.name}</td><td className="px-4 py-4 text-muted-foreground">{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => openEdit(row)}><Pencil className="mr-1 h-4 w-4" />Edit</Button><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => deleteRow(row)}><Trash2 className="mr-1 h-4 w-4" />Delete</Button></div></td></tr>)}</tbody>
      </table></div>
      {data.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Projects இன்னும் சேர்க்கப்படவில்லை.</p>}
    </section>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setEditing(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-project-title" className="panel w-full max-w-md space-y-5 p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 id="edit-project-title" className="text-xl font-semibold">Edit Project</h2><Button type="button" variant="ghost" size="icon" aria-label="Close edit project" disabled={busy} onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div>
        <form onSubmit={saveEdit} className="space-y-4"><div className="space-y-2"><Label htmlFor="edit-project-name">Project Name</Label><Input id="edit-project-name" required maxLength={120} value={editName} onChange={e => setEditName(e.target.value)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button></div></form>
      </section>
    </div>}
  </main>;
}
