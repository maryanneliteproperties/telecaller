import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getWorkspaceIdentity, listWorkspaceActivity } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { History as HistoryIcon, RefreshCw } from "lucide-react";

const historyOptions = queryOptions({ queryKey: ["workspace", "activity-history"], queryFn: () => listWorkspaceActivity({ data: {} }) });
type Activity = { id: string; actor_name: string; actor_role: string; action: string; entity_type: string; entity_id: string | null; entity_label: string | null; details: Record<string, unknown>; created_at: string };
const typeLabels: Record<string,string> = { lead: "Lead", follow_up: "Follow-up", site_visit: "Site Visit", employee: "Employee", booking: "Booking" };
const actionLabels: Record<string,string> = { created: "Created", updated: "Updated", deleted: "Deleted" };

export const Route = createFileRoute("/_authenticated/history")({
  beforeLoad: async () => { const identity = await getWorkspaceIdentity(); if (identity?.role !== "admin") throw redirect({ to: "/" }); },
  loader: ({ context }) => context.queryClient.ensureQueryData(historyOptions),
  head: () => ({ meta: [{ title: "History · Mary Ann Elite Properties" }, { name: "description", content: "Admin activity history." }] }),
  component: HistoryPage,
});
function HistoryPage() {
  const { data } = useSuspenseQuery(historyOptions);
  const reload = useServerFn(listWorkspaceActivity);
  const [type,setType] = useState("all"), [actor,setActor] = useState("all"), [from,setFrom] = useState(""), [to,setTo] = useState("");
  const [rows,setRows] = useState<Activity[] | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const visible = rows ?? data as Activity[];
  async function apply() {
    setBusy(true); setError("");
    try { setRows(await reload({ data: { type, actor, ...(from ? { from } : {}), ...(to ? { to } : {}) } }) as Activity[]); }
    catch (e) { setError(e instanceof Error ? e.message : "History ஏற்ற முடியல."); }
    finally { setBusy(false); }
  }
  const actors = [...new Set((data as Activity[]).map(row => row.actor_name))];
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-10">
    <div><h1 className="font-display text-3xl">History</h1><p className="mt-1 text-sm text-muted-foreground">Admin activity log · Latest activity first</p></div>
    <section className="panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="space-y-1 text-sm"><span className="font-medium">Activity Type</span><select className="h-10 w-full rounded-md border bg-background px-3" value={type} onChange={e=>setType(e.target.value)}><option value="all">All activities</option>{Object.entries(typeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span className="font-medium">Performed By</span><select className="h-10 w-full rounded-md border bg-background px-3" value={actor} onChange={e=>setActor(e.target.value)}><option value="all">All users</option>{actors.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span className="font-medium">From Date</span><input type="date" className="h-10 w-full rounded-md border bg-background px-3" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label className="space-y-1 text-sm"><span className="font-medium">To Date</span><input type="date" className="h-10 w-full rounded-md border bg-background px-3" value={to} onChange={e=>setTo(e.target.value)} /></label>
      <div className="flex items-end gap-2"><Button className="flex-1" disabled={busy} onClick={()=>void apply()}>{busy ? "Loading…" : "Apply Filter"}</Button><Button variant="outline" size="icon" title="Refresh" disabled={busy} onClick={()=>{setType("all");setActor("all");setFrom("");setTo("");setRows(null);void reload({data:{}}).then(result=>setRows(result as Activity[])).catch(e=>setError(e instanceof Error?e.message:"Refresh failed."));}}><RefreshCw className="h-4 w-4"/></Button></div>
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-4"><HistoryIcon className="h-5 w-5 text-primary"/><h2 className="font-semibold">Activity Log</h2><span className="ml-auto text-xs text-muted-foreground">{visible.length} records · up to 500</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Date & Time</th><th className="px-4 py-3">Performed By</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y">{visible.map(row=><tr key={row.id} className="align-top"><td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{new Date(row.created_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</td><td className="px-4 py-4"><span className="font-medium">{row.actor_name}</span><span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{row.actor_role}</span></td><td className="whitespace-nowrap px-4 py-4">{actionLabels[row.action] ?? row.action} {typeLabels[row.entity_type] ?? row.entity_type}</td><td className="px-4 py-4 font-medium">{row.entity_label ?? "—"}</td><td className="max-w-sm px-4 py-4 text-muted-foreground">{Object.entries(row.details ?? {}).filter(([,value])=>value!==null&&value!==undefined&&value!=="").map(([key,value])=><span key={key} className="mr-3 inline-block">{key}: {String(value)}</span>)}</td></tr>)}</tbody></table></div>
      {visible.length===0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">History records எதுவும் இல்லை.</p>}
    </section>
  </main>;
}
