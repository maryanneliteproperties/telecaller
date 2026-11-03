import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listLeads, listAvailableProjects, updateLeadFollowUp } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
export const Route = createFileRoute("/_authenticated/follow-ups")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(leadsOptions), context.queryClient.ensureQueryData(projectsOptions)]); },
  head: () => ({ meta: [{ title: "Follow Ups · Mary Ann Elite Properties" }] }),
  component: FollowUpsPage,
});
function FollowUpsPage() {
  const { data: leads } = useSuspenseQuery(leadsOptions), { data: projects } = useSuspenseQuery(projectsOptions);
  const update = useServerFn(updateLeadFollowUp), client = useQueryClient();
  const [kind, setKind] = useState<"site_visit" | "conversion">("site_visit");
  const [dates, setDates] = useState<Record<string,string>>({}), [statuses, setStatuses] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState<string | null>(null), [error, setError] = useState("");
  const projectNames = useMemo(() => new Map(projects.map(p => [p.id,p.name])), [projects]);
  const rows = useMemo(() => [...leads].filter(row => kind === "site_visit" ? Boolean(row.follow_up_date) : row.site_visit_status === "Completed").sort((a,b) => {
    const aDate = kind === "site_visit" ? a.follow_up_date : a.conversion_follow_up_date;
    const bDate = kind === "site_visit" ? b.follow_up_date : b.conversion_follow_up_date;
    return (aDate ?? "9999-12-31").localeCompare(bDate ?? "9999-12-31");
  }), [leads,kind]);
  async function save(id: string, date: string | null, status: string) {
    setSaving(id); setError("");
    try { await update({ data: { id, followUpType: kind, followUpDate: date, followUpStatus: status as "Pending" | "Completed" | "Rescheduled" | "Not Interested" } }); await client.invalidateQueries({ queryKey: ["workspace","leads"] }); }
    catch(e) { setError(e instanceof Error ? e.message : "Follow-up save ஆகவில்லை."); } finally { setSaving(null); }
  }
  return <main className="w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-10 sm:py-10"><div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-3xl">Follow Ups</h1><p className="mt-1 text-sm text-muted-foreground">எந்த Telecaller, எந்த Customer-க்கு, எந்த Project தொடர்பாக follow-up செய்கிறார் என்பதை track செய்யுங்கள்.</p></div><Button asChild variant="outline"><Link to="/leads">View Leads</Link></Button></div>
    <div className="flex flex-wrap gap-2"><Button variant={kind==="site_visit"?"default":"outline"} onClick={()=>setKind("site_visit")}>1st Follow-up · Site Visit Schedule</Button><Button variant={kind==="conversion"?"default":"outline"} onClick={()=>setKind("conversion")}>2nd Follow-up · Booking Conversion</Button></div>
    <p className="text-sm text-muted-foreground">{kind==="site_visit"?"Home form-ல் கொடுத்த Follow-up Date அடிப்படையில் customer-ஐ தொடர்பு கொண்டு Site Visit arrange / confirm செய்யுங்கள்.":"Site Visit Completed ஆன customer-க்கு மட்டும் Booking Conversion follow-up செய்யுங்கள்."}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Follow-up Date","Customer","Phone","Project","Follow-up Type","Telecaller","Status","Action"].map(x=><th key={x} className="whitespace-nowrap px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row=>{const date=kind==="site_visit"?row.follow_up_date:row.conversion_follow_up_date; const status=kind==="site_visit"?row.follow_up_status:row.conversion_follow_up_status; return <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3">{kind==="site_visit" ? <span>{date ?? "—"}</span> : <Input type="date" className="w-36" value={dates[row.id]??date??""} onChange={e=>setDates(v=>({...v,[row.id]:e.target.value}))}/>}</td><td className="whitespace-nowrap px-4 py-3 font-medium">{row.customer_name??"—"}</td><td className="px-4 py-3">{row.customer_phone??"—"}</td><td className="px-4 py-3">{projectNames.get(row.project_id??"")??"—"}</td><td className="px-4 py-3">{kind==="site_visit"?"Site Visit Scheduling":"Post-Visit Booking"}</td><td className="px-4 py-3">{row.telecaller_name??"—"}</td><td className="px-4 py-3"><select aria-label="Follow-up status" className="h-9 rounded-md border bg-background px-2" value={statuses[row.id]??status??"Pending"} onChange={e=>setStatuses(v=>({...v,[row.id]:e.target.value}))}>{["Pending","Completed","Rescheduled","Not Interested"].map(s=><option key={s}>{s}</option>)}</select></td><td className="px-4 py-3"><Button size="sm" disabled={saving===row.id} onClick={()=>void save(row.id,dates[row.id]??date??null,statuses[row.id]??status??"Pending")}>{saving===row.id?"Saving...":"Save"}</Button></td></tr>})}</tbody></table>{rows.length===0&&<p className="px-4 py-12 text-center text-sm text-muted-foreground">இந்த வகையில் follow-up செய்ய வேண்டிய leads இல்லை.</p>}</div>
  </div></main>;
}
