import { CallAudioPlayer } from "@/components/call-audio-player";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LeadSummary } from "@/components/lead-summary";
import { deleteLead, getLeadReport, listLeads, listAvailableProjects, updateLeadFollowUp, updateLeadSiteVisit } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";
import { downloadReportPdf } from "@/lib/report-pdf";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
export const Route = createFileRoute("/_authenticated/leads")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(leadsOptions), context.queryClient.ensureQueryData(projectsOptions)]); },
  head: () => ({ meta: [{ title: "Leads · AI Call Workspace" }, { name: "description", content: "Customer details, recorded call audio and report status." }, { property: "og:title", content: "Leads · AI Call Workspace" }, { property: "og:description", content: "Your saved customer calls and follow-up reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeadsPageRoute,
});
function LeadsPageRoute() { return <LeadsPage identity={Route.useRouteContext().identity} />; }
function scoreBadge(score: number | null) {
  if (score === null) return <Badge variant="outline" className="text-muted-foreground">AI Pending</Badge>;
  const tone = score >= 70 ? "bg-success text-success-foreground" : score >= 40 ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
  return <Badge className={tone}>{score}/100</Badge>;
}
export function LeadsPage({ identity, compact = false }: { identity: { role: "admin" | "employee" } | null; compact?: boolean }) {
  const { data } = useSuspenseQuery(leadsOptions), { data: projects } = useSuspenseQuery(projectsOptions), [search, setSearch] = useState("");
  const remove = useServerFn(deleteLead), updateVisit = useServerFn(updateLeadSiteVisit), updateFollowUp = useServerFn(updateLeadFollowUp), queryClient = useQueryClient();
  const [visitDates, setVisitDates] = useState<Record<string,string>>({});
  const [followUpDates, setFollowUpDates] = useState<Record<string,string>>({});
  const [followUpSaving, setFollowUpSaving] = useState<string | null>(null);
  const [visitSaving, setVisitSaving] = useState<string | null>(null);
  const [visitError, setVisitError] = useState("");
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);
  async function saveFollowUpDate(id: string) {
    setFollowUpSaving(id); setVisitError("");
    try { await updateFollowUp({ data: { id, followUpType: "site_visit", followUpDate: followUpDates[id] || null, followUpStatus: "Pending" } }); await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] }); }
    catch (e) { setVisitError(e instanceof Error ? e.message : "Follow-up date save ஆகவில்லை."); }
    finally { setFollowUpSaving(null); }
  }
  async function saveVisitDate(id: string, currentStatus: string | null) {
    setVisitSaving(id); setVisitError("");
    try { await updateVisit({ data: { id, siteVisitDate: visitDates[id] || null, siteVisitStatus: (currentStatus || "Not Planned") as "Not Planned" | "Planned" | "Confirmed" | "Completed" | "Rescheduled" | "Cancelled" } }); await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] }); }
    catch (e) { setVisitError(e instanceof Error ? e.message : "Site Visit date save ஆகவில்லை."); }
    finally { setVisitSaving(null); }
  }
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; customer_name: string | null } | null>(null);
  const [openSummary, setOpenSummary] = useState<string | null>(null);
  async function confirmDelete() {
    const row = pendingDelete;
    if (identity?.role !== "admin" || !row || deleting) return;
    setDeleting(row.id); setActionError("");
    try {
      await remove({ data: { id: row.id } });
      if (openSummary === row.id) setOpenSummary(null);
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Lead delete செய்ய முடியல.");
    } finally { setDeleting(null); }
  }
  async function downloadReport(row: { id: string; customer_name: string | null; audio_name: string | null }) {
    setDownloading(row.id); setDownloadError("");
    try {
      const { report, transcript, audioName, createdAt } = await getLeadReport({ data: { id: row.id } });
      const validated = validateReport(report, transcript) as ConversationReport;
      await downloadReportPdf(validated, row.customer_name ?? audioName ?? "call", createdAt ?? undefined);
    } catch (e) { setDownloadError(e instanceof Error ? e.message : "Report download ஆகல."); }
    finally { setDownloading(null); }
  }
  const rows = useMemo(() => data.filter(row => `${row.customer_name ?? ""} ${row.customer_phone ?? ""} ${row.audio_name ?? ""} ${projectNames.get(row.project_id ?? "") ?? ""}`.toLowerCase().includes(search.toLowerCase())), [data, search, projectNames]);
  const stats = useMemo(() => {
    const analysed = data.filter(row => row.overall_score !== null);
    return { total: data.length, pending: data.length - analysed.length, average: analysed.length ? Math.round(analysed.reduce((sum, row) => sum + (row.overall_score ?? 0), 0) / analysed.length) : null };
  }, [data]);
  return <main className={compact ? "w-full min-w-0 max-w-full overflow-x-clip space-y-4" : "w-full min-w-0 max-w-full overflow-x-clip px-4 py-6 sm:px-10 sm:py-10"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className={compact ? "font-display text-xl" : "font-display text-3xl"}>Leads</h2><p className="mt-1 text-sm text-muted-foreground">{stats.total} leads saved</p></div><Button asChild size={compact ? "sm" : "default"}><Link to="/"><Plus />New Lead</Link></Button></div>
    <div className={`${compact ? "grid gap-3 sm:grid-cols-3" : "mt-8 grid gap-4 sm:grid-cols-3"}`} aria-label="Lead summary">
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Leads</p><p className="mt-1 text-xl font-semibold">{stats.total}</p></div>
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Pending</p><p className="mt-1 text-xl font-semibold">{stats.pending}</p></div>
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average Score</p><p className="mt-1 text-xl font-semibold">{stats.average === null ? "—" : `${stats.average}/100`}</p></div>
    </div>
    <Input aria-label="Search leads" placeholder="Search customer name or phone" className={`${compact ? "my-1 max-w-sm" : "my-7 max-w-sm"}`} value={search} onChange={e => setSearch(e.target.value)} />
    {downloadError && <p role="alert" className="mb-4 text-sm text-destructive">{downloadError}</p>}
    {visitError && <p role="alert" className="mb-4 text-sm text-destructive">{visitError}</p>}
    {actionError && <p role="alert" className="mb-4 text-sm text-destructive">{actionError}</p>}
    {rows.length === 0 && <p className="border-y py-10 text-muted-foreground">{search ? "No matching leads." : "இன்னும் lead சமர்ப்பிக்கப்படல."}</p>}
    <div className="mt-1 grid min-w-0 gap-3 md:hidden">{rows.map(row => <article key={row.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-sm"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="break-words font-semibold text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-xs text-muted-foreground">{row.telecaller_name ?? "—"}</p></div><div className="shrink-0">{scoreBadge(row.overall_score)}</div></div><dl className="mt-3 grid min-w-0 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Phone Number</dt><dd className="break-words">{row.customer_phone ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Project</dt><dd>{projectNames.get(row.project_id ?? "") ?? "Not selected"}</dd></div><div><dt className="text-xs text-muted-foreground">Follow-up Date</dt><dd><input aria-label={`Follow-up Date ${row.customer_name ?? ""}`} type="date" value={followUpDates[row.id] ?? row.follow_up_date ?? ""} onChange={e => setFollowUpDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" className="ml-2" disabled={followUpSaving===row.id} onClick={() => void saveFollowUpDate(row.id)}>{followUpSaving===row.id ? "Saving" : "Save date"}</Button></dd></div><div><dt className="text-xs text-muted-foreground">Site Visit Date</dt><dd><input aria-label={`Site Visit Date ${row.customer_name ?? ""}`} type="date" value={visitDates[row.id] ?? row.site_visit_date ?? ""} onChange={e => setVisitDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" className="ml-2" disabled={visitSaving===row.id} onClick={() => void saveVisitDate(row.id,row.site_visit_status)}>{visitSaving===row.id ? "Saving" : "Save date"}</Button></dd></div><div><dt className="text-xs text-muted-foreground">Created Date</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Audio</dt><dd className="min-w-0">{row.audio_name ? <p className="break-words">{row.audio_name}</p> : "Audio இல்லை"}{row.audioUrl && <CallAudioPlayer src={row.audioUrl} name={row.audio_name ?? "call"} className="mt-2 w-full min-w-0" />}</dd></div></dl><div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={row.overall_score === null || downloading === row.id} onClick={() => void downloadReport(row)}>{downloading === row.id ? <Loader2 className="animate-spin" /> : <Download />}Download report</Button>{row.overall_score !== null && <Button variant="outline" size="sm" aria-expanded={openSummary === row.id} onClick={() => setOpenSummary(openSummary === row.id ? null : row.id)}>{openSummary === row.id ? "Hide summary" : "View summary"}</Button>}{identity?.role === "admin" && <Button variant="destructive" size="sm" disabled={deleting === row.id} onClick={() => setPendingDelete({ id: row.id, customer_name: row.customer_name })}>{deleting === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete</Button>}</div>{openSummary === row.id && <div className="mt-4 min-w-0 border-t pt-3"><LeadSummary id={row.id} /></div>}</article>)}</div>
    <div className="mt-1 hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border md:block"><table className="w-full min-w-[1380px] table-auto text-sm"><thead className="bg-muted/60"><tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"><th className="whitespace-nowrap py-3 pl-4 pr-4 font-semibold">Created Date</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Customer Name</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Phone Number</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Project</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Follow-up Date</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Site Visit Date</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Audio</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Overall Score</th><th className="whitespace-nowrap px-4 py-3 font-semibold"><span className="sr-only">Report</span></th><th className="whitespace-nowrap px-4 py-3 font-semibold">Summary</th>{identity?.role === "admin" && <th className="whitespace-nowrap px-4 py-3 font-semibold">Action</th>}</tr></thead><tbody className="divide-y">{rows.map(row => <Fragment key={row.id}><tr className="align-top hover:bg-muted/40"><td className="whitespace-nowrap py-4 pl-4 pr-4 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td><td className="py-4 pr-4 min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="whitespace-nowrap font-medium text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-xs text-muted-foreground">{row.telecaller_name ?? "—"}</p></td><td className="py-4 pr-4 whitespace-nowrap">{row.customer_phone ?? "—"}</td><td className="py-4 pr-4 whitespace-nowrap">{projectNames.get(row.project_id ?? "") ?? "—"}</td><td className="py-4 pr-4 whitespace-nowrap"><div className="flex items-center gap-2"><input aria-label={`Follow-up Date ${row.customer_name ?? ""}`} type="date" value={followUpDates[row.id] ?? row.follow_up_date ?? ""} onChange={e => setFollowUpDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" variant="outline" disabled={followUpSaving===row.id} onClick={() => void saveFollowUpDate(row.id)}>{followUpSaving===row.id ? "Saving" : "Save"}</Button></div></td><td className="py-4 pr-4 whitespace-nowrap"><div className="flex items-center gap-2"><input aria-label={`Site Visit Date ${row.customer_name ?? ""}`} type="date" value={visitDates[row.id] ?? row.site_visit_date ?? ""} onChange={e => setVisitDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" variant="outline" disabled={visitSaving===row.id} onClick={() => void saveVisitDate(row.id,row.site_visit_status)}>{visitSaving===row.id ? "Saving" : "Save"}</Button></div></td><td className="py-4 pr-4 min-w-0"><p className="mb-1 max-w-[24rem] truncate text-muted-foreground">{row.audio_name ?? "Audio இல்லை"}</p>{row.audioUrl && <CallAudioPlayer src={row.audioUrl} name={row.audio_name ?? "call"} className="w-full max-w-[22rem] min-w-0" />}</td><td className="py-4 pr-4">{scoreBadge(row.overall_score)}</td><td className="px-4 py-4"><Button variant="outline" size="icon" title="Download full report" aria-label="Download full report" disabled={row.overall_score === null || downloading === row.id} onClick={() => void downloadReport(row)}>{downloading === row.id ? <Loader2 className="animate-spin" /> : <Download />}</Button></td><td className="whitespace-nowrap px-4 py-4">{row.overall_score === null ? <span className="text-muted-foreground">—</span> : <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" aria-expanded={openSummary === row.id} onClick={() => setOpenSummary(openSummary === row.id ? null : row.id)}>{openSummary === row.id ? "Hide summary" : "View summary"}</button>}</td>{identity?.role === "admin" && <td className="whitespace-nowrap px-4 py-4"><Button variant="destructive" size="sm" disabled={deleting === row.id} onClick={() => setPendingDelete({ id: row.id, customer_name: row.customer_name })}>{deleting === row.id ? <Loader2 className="animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</Button></td>}</tr>{openSummary === row.id && <tr className="bg-muted/30"><td colSpan={identity?.role === "admin" ? 8 : 7} className="px-4 pb-4 pt-2"><div className="sticky left-0 w-[min(52rem,calc(100vw_-_7rem))]"><LeadSummary id={row.id} /></div></td></tr>}</Fragment>)}</tbody></table></div>
    <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lead-ஐ delete செய்ய வேண்டுமா?</AlertDialogTitle>
          <AlertDialogDescription>
            “{pendingDelete?.customer_name ?? "இந்த customer"}” lead மற்றும் அதனுடன் தொடர்புடைய report/audio delete செய்யப்படும். இந்தச் செயலை மீண்டும் மாற்ற முடியாது.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
          >
            {deleting ? "Deleting..." : "ஆம், Delete செய்"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
