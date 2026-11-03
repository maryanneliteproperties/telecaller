import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listLeads, listAvailableProjects, updateLeadSiteVisit } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
export const Route = createFileRoute("/_authenticated/site-visits")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(leadsOptions), context.queryClient.ensureQueryData(projectsOptions)]); },
  head: () => ({ meta: [{ title: "Site Visits · Mary Ann Elite Properties" }] }),
  component: SiteVisitsPage,
});
function SiteVisitsPage() {
  const { data: leads } = useSuspenseQuery(leadsOptions), { data: projects } = useSuspenseQuery(projectsOptions);
  const update = useServerFn(updateLeadSiteVisit), client = useQueryClient();
  const [statuses,setStatuses]=useState<Record<string,string>>({}),[saving,setSaving]=useState<string|null>(null),[error,setError]=useState("");
  const names=useMemo(()=>new Map(projects.map(p=>[p.id,p.name])),[projects]);
  const rows=useMemo(()=>leads.filter(r=>!!r.site_visit_date).sort((a,b)=>(a.site_visit_date??"").localeCompare(b.site_visit_date??"")),[leads]);
  async function save(row: typeof rows[number]) { setSaving(row.id);setError("");try{await update({data:{id:row.id,siteVisitDate:row.site_visit_date,siteVisitStatus:(statuses[row.id]??row.site_visit_status??"Planned") as "Not Planned"|"Planned"|"Confirmed"|"Completed"|"Rescheduled"|"Cancelled"}});await client.invalidateQueries({queryKey:["workspace","leads"]});}catch(e){setError(e instanceof Error?e.message:"Visit status update ஆகவில்லை.");}finally{setSaving(null);} }
  return <main className="w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-10 sm:py-10"><div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-3xl">Site Visit</h1><p className="mt-1 text-sm text-muted-foreground">Leads page-ல் save செய்த Site Visit dates இங்கே தானாக வரும்.</p></div><Button asChild variant="outline"><Link to="/leads">Manage Leads</Link></Button></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Customer","Phone","Project","Site Visit Date","Telecaller","Visit Status","Action"].map(x=><th key={x} className="whitespace-nowrap px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row=><tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3 font-medium">{row.customer_name??"—"}</td><td className="px-4 py-3">{row.customer_phone??"—"}</td><td className="px-4 py-3">{names.get(row.project_id??"")??"—"}</td><td className="whitespace-nowrap px-4 py-3">{new Date(row.site_visit_date+"T00:00:00").toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{row.telecaller_name??"—"}</td><td className="px-4 py-3"><select aria-label="Visit status" className="h-9 rounded-md border bg-background px-2" value={statuses[row.id]??row.site_visit_status??"Planned"} onChange={e=>setStatuses(v=>({...v,[row.id]:e.target.value}))}>{["Planned","Confirmed","Completed","Rescheduled","Cancelled"].map(s=><option key={s}>{s}</option>)}</select></td><td className="px-4 py-3"><Button size="sm" disabled={saving===row.id} onClick={()=>void save(row)}>{saving===row.id?"Saving...":"Save"}</Button></td></tr>)}</tbody></table>{rows.length===0&&<p className="px-4 py-12 text-center text-sm text-muted-foreground">Site Visit date இன்னும் schedule செய்யப்படவில்லை. Leads page-ல் date save செய்யுங்கள்.</p>}</div></div></main>;
}
