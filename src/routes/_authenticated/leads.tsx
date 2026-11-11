import { CallAudioPlayer } from "@/components/call-audio-player";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LeadSummary } from "@/components/lead-summary";
import { deleteLead, getLeadReport, listLeads, listAvailableProjects, listWorkspaceFilterEmployees, updateLeadSiteVisit } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";
import { downloadReportPdf } from "@/lib/report-pdf";
import { WorkspaceRecordFilters } from "@/components/workspace-record-filters";
import { WorkspacePagination } from "@/components/workspace-pagination";
import { ArrowDown, ArrowDownUp, ArrowUp, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { isLeadAnalysisComplete } from "@/lib/lead-score-status";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
const employeeOptions = queryOptions({ queryKey: ["workspace", "filter-employees"], queryFn: () => listWorkspaceFilterEmployees() });
const createdDate = (row: { created_at: string }) => row.created_at;
export const Route = createFileRoute("/_authenticated/leads")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(leadsOptions), context.queryClient.ensureQueryData(projectsOptions), context.queryClient.ensureQueryData(employeeOptions)]); },
  head: () => ({ meta: [{ title: "Leads · AI Call Workspace" }, { name: "description", content: "Customer details, recorded call audio and report status." }, { property: "og:title", content: "Leads · AI Call Workspace" }, { property: "og:description", content: "Your saved customer calls and follow-up reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeadsPageRoute,
});
function LeadsPageRoute() { return <LeadsPage identity={Route.useRouteContext().identity} />; }
function scoreBadge(score: number | null, analysisComplete: boolean) {
  if (score === null) return <Badge variant="outline" className="text-muted-foreground">{analysisComplete ? "தகவல் இல்லை" : "AI Pending"}</Badge>;
  const tone = score >= 70 ? "bg-success text-success-foreground" : score >= 40 ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
  return <Badge className={tone}>{score}/100</Badge>;
}
export function LeadsPage({ identity, compact = false }: { identity: { role: "admin" | "employee" } | null; compact?: boolean }) {
  const { data } = useSuspenseQuery(leadsOptions), { data: projects } = useSuspenseQuery(projectsOptions), { data: employees } = useSuspenseQuery(employeeOptions), [filteredRows, setFilteredRows] = useState<typeof data | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [scoreSort, setScoreSort] = useState<"asc" | "desc" | null>(null);
  const remove = useServerFn(deleteLead), updateVisit = useServerFn(updateLeadSiteVisit), queryClient = useQueryClient();
  const [visitDates, setVisitDates] = useState<Record<string,string>>({});
  const [visitSaving, setVisitSaving] = useState<string | null>(null);
  const [visitError, setVisitError] = useState("");
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects]);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
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
  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds(current => checked ? (current.includes(id) ? current : [...current, id]) : current.filter(item => item !== id));
  }
  function toggleAllVisible(checked: boolean) {
    setSelectedIds(current => checked ? [...new Set([...current, ...rows.map(row => row.id)])] : current.filter(id => !rows.some(row => row.id === id)));
  }
  async function confirmBulkDelete() {
    if (identity?.role !== "admin" || !selectedIds.length || bulkDeleting) return;
    setBulkDeleting(true); setActionError("");
    const ids = [...selectedIds];
    const deleted: string[] = [];
    try {
      for (const id of ids) { await remove({ data: { id } }); deleted.push(id); }
      setSelectedIds(current => current.filter(id => !deleted.includes(id)));
      if (openSummary && deleted.includes(openSummary)) setOpenSummary(null);
      setBulkDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] });
    } catch (e) {
      setSelectedIds(current => current.filter(id => !deleted.includes(id)));
      await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] });
      setActionError(`${deleted.length} lead(s) delete ஆனது. மீதமுள்ளவற்றை delete செய்ய முடியவில்லை: ${e instanceof Error ? e.message : "Unknown error"}`);
      setBulkDeleteOpen(false);
    } finally { setBulkDeleting(false); }
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
  const rows = filteredRows ?? data;
  const sortedRows = useMemo(() => {
    if (!scoreSort) return rows;
    return [...rows].sort((a, b) => {
      const aScore = a.overall_score;
      const bScore = b.overall_score;
      if (aScore === null && bScore === null) return 0;
      if (aScore === null) return 1;
      if (bScore === null) return -1;
      return scoreSort === "asc" ? aScore - bScore : bScore - aScore;
    });
  }, [rows, scoreSort]);
  const handleScoreSort = () => setScoreSort(current => current === null ? "asc" : current === "asc" ? "desc" : null);
  const handleFilterChange = useCallback((nextRows: typeof data) => { setFilteredRows(nextRows); setPage(1); }, []);
  const paginatedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const stats = useMemo(() => {
    const analysed = data.filter(row => row.overall_score !== null);
    const noInfo = data.filter(row => row.overall_score === null && isLeadAnalysisComplete(row)).length;
    return { total: data.length, pending: data.filter(row => row.overall_score === null && !isLeadAnalysisComplete(row)).length, noInfo, average: analysed.length ? Math.round(analysed.reduce((sum, row) => sum + (row.overall_score ?? 0), 0) / analysed.length) : null };
  }, [data]);
  return <main className={compact ? "w-full min-w-0 max-w-full overflow-x-clip space-y-4" : "w-full min-w-0 max-w-full overflow-x-clip px-4 py-6 sm:px-10 sm:py-10"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className={compact ? "font-display text-xl" : "font-display text-3xl"}>Leads</h2><p className="mt-1 text-sm text-muted-foreground">{stats.total} leads saved</p></div><Button asChild size={compact ? "sm" : "default"}><Link to="/"><Plus />New Lead</Link></Button></div>
    <div className={`${compact ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}`} aria-label="Lead summary">
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Leads</p><p className="mt-1 text-xl font-semibold">{stats.total}</p></div>
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Pending</p><p className="mt-1 text-xl font-semibold">{stats.pending}</p></div>
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">தகவல் இல்லை</p><p className="mt-1 text-xl font-semibold">{stats.noInfo}</p></div>
      <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average Score</p><p className="mt-1 text-xl font-semibold">{stats.average === null ? "—" : `${stats.average}/100`}</p></div>
    </div>
    <div className={compact ? "my-2" : "my-7"}><WorkspaceRecordFilters rows={data} projects={projects} employeeNames={employees} getDate={createdDate} onChange={handleFilterChange} /></div>
    {downloadError && <p role="alert" className="mb-4 text-sm text-destructive">{downloadError}</p>}
    {visitError && <p role="alert" className="mb-4 text-sm text-destructive">{visitError}</p>}
    {actionError && <p role="alert" className="mb-4 text-sm text-destructive">{actionError}</p>}
    <div className="mt-1 grid min-w-0 gap-3 md:hidden">{rows.length === 0 && <p className="rounded-xl border px-4 py-12 text-center text-sm text-muted-foreground">{data.length > 0 ? "No matching leads. Try adjusting or clearing the filters." : "இன்னும் lead சமர்ப்பிக்கப்படல."}</p>}{paginatedRows.map(row => <article key={row.id} className="min-w-0 rounded-lg border bg-card p-4 shadow-sm"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="break-words font-semibold text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-xs text-muted-foreground">{row.telecaller_name ?? "—"}</p></div><div className="shrink-0">{scoreBadge(row.overall_score, isLeadAnalysisComplete(row))}</div></div><dl className="mt-3 grid min-w-0 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Phone Number</dt><dd className="break-words">{row.customer_phone ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Project</dt><dd>{projectNames.get(row.project_id ?? "") ?? "Not selected"}</dd></div><div><dt className="text-xs text-muted-foreground">Follow-up Date</dt><dd>{row.follow_up_date ?? "Not scheduled"}</dd></div><div><dt className="text-xs text-muted-foreground">Site Visit Date</dt><dd><input aria-label={`Site Visit Date ${row.customer_name ?? ""}`} type="date" value={visitDates[row.id] ?? row.site_visit_date ?? ""} onChange={e => setVisitDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" className="ml-2" disabled={visitSaving===row.id} onClick={() => void saveVisitDate(row.id,row.site_visit_status)}>{visitSaving===row.id ? "Saving" : "Save date"}</Button></dd></div><div><dt className="text-xs text-muted-foreground">Created Date</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div><div><dt className="text-xs text-muted-foreground">Audio</dt><dd className="min-w-0">{row.audio_name ? <p className="break-words">{row.audio_name}</p> : "Audio இல்லை"}{row.audioUrl && <CallAudioPlayer src={row.audioUrl} name={row.audio_name ?? "call"} className="mt-2 w-full min-w-0" />}</dd></div></dl><div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={row.overall_score === null || downloading === row.id} onClick={() => void downloadReport(row)}>{downloading === row.id ? <Loader2 className="animate-spin" /> : <Download />}Download report</Button>{row.overall_score !== null && <Button variant="outline" size="sm" aria-expanded={openSummary === row.id} onClick={() => setOpenSummary(openSummary === row.id ? null : row.id)}>{openSummary === row.id ? "Hide summary" : "View summary"}</Button>}{identity?.role === "admin" && <Button variant="destructive" size="sm" disabled={deleting === row.id} onClick={() => setPendingDelete({ id: row.id, customer_name: row.customer_name })}>{deleting === row.id ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete</Button>}</div>{openSummary === row.id && <div className="mt-4 min-w-0 border-t pt-3"><LeadSummary id={row.id} /></div>}</article>)}</div>
    <div className="mt-1 hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border md:block">{identity?.role === "admin" && selectedIds.length > 0 && <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3"><span className="text-sm font-medium">{selectedIds.length} row(s) selected</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>Clear selection</Button><Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="h-4 w-4" />Delete selected</Button></div></div>}<table className="w-full min-w-[1380px] table-auto text-sm"><thead className="bg-muted/60"><tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{identity?.role === "admin" && <th className="whitespace-nowrap py-3 pl-4 pr-2 font-semibold"><input type="checkbox" aria-label="Select all visible leads" checked={rows.length > 0 && rows.every(row => selectedIds.includes(row.id))} onChange={e => toggleAllVisible(e.target.checked)} className="h-4 w-4 accent-primary" /></th>}<th className="whitespace-nowrap py-3 pl-4 pr-4 font-semibold">Created Date</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Customer Name</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Phone Number</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Project</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Follow-up Date</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Site Visit Date</th><th className="whitespace-nowrap py-4 pr-4 font-semibold">Audio</th><th className="whitespace-nowrap py-4 pr-4 font-semibold"><button type="button" onClick={handleScoreSort} aria-label={scoreSort === "asc" ? "Sort Overall Score descending" : scoreSort === "desc" ? "Clear Overall Score sorting" : "Sort Overall Score ascending"} className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 -ml-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Overall Score {scoreSort === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : scoreSort === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowDownUp className="h-3.5 w-3.5 opacity-60" />}</button></th><th className="whitespace-nowrap px-4 py-3 font-semibold"><span className="sr-only">Report</span></th><th className="whitespace-nowrap px-4 py-3 font-semibold">Summary</th>{identity?.role === "admin" && <th className="whitespace-nowrap px-4 py-3 font-semibold">Action</th>}</tr></thead><tbody className="divide-y">{paginatedRows.map(row => <Fragment key={row.id}><tr className={`align-top hover:bg-muted/40 ${selectedIds.includes(row.id) ? "bg-primary/5" : ""}`}>{identity?.role === "admin" && <td className="py-4 pl-4 pr-2"><input type="checkbox" aria-label={`Select ${row.customer_name ?? "lead"}`} checked={selectedIds.includes(row.id)} onChange={e => toggleSelected(row.id,e.target.checked)} className="h-4 w-4 accent-primary" /></td>}<td className="whitespace-nowrap py-4 pl-2 pr-4 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td><td className="py-4 pr-4 min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="whitespace-nowrap font-medium text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-xs text-muted-foreground">{row.telecaller_name ?? "—"}</p></td><td className="py-4 pr-4 whitespace-nowrap">{row.customer_phone ?? "—"}</td><td className="py-4 pr-4 whitespace-nowrap">{projectNames.get(row.project_id ?? "") ?? "—"}</td><td className="py-4 pr-4 whitespace-nowrap">{row.follow_up_date ?? "Not scheduled"}</td><td className="py-4 pr-4 whitespace-nowrap"><div className="flex items-center gap-2"><input aria-label={`Site Visit Date ${row.customer_name ?? ""}`} type="date" value={visitDates[row.id] ?? row.site_visit_date ?? ""} onChange={e => setVisitDates(prev => ({ ...prev, [row.id]: e.target.value }))} className="h-8 rounded-md border bg-background px-2 text-xs" /><Button size="sm" variant="outline" disabled={visitSaving===row.id} onClick={() => void saveVisitDate(row.id,row.site_visit_status)}>{visitSaving===row.id ? "Saving" : "Save"}</Button></div></td><td className="py-4 pr-4 min-w-0"><p className="mb-1 max-w-[24rem] truncate text-muted-foreground">{row.audio_name ?? "Audio இல்லை"}</p>{row.audioUrl && <CallAudioPlayer src={row.audioUrl} name={row.audio_name ?? "call"} className="w-full max-w-[22rem] min-w-0" />}</td><td className="py-4 pr-4">{scoreBadge(row.overall_score, isLeadAnalysisComplete(row))}</td><td className="py-4 pr-4"><Button variant="outline" size="icon" title="Download full report" aria-label="Download full report" disabled={row.overall_score === null || downloading === row.id} onClick={() => void downloadReport(row)}>{downloading === row.id ? <Loader2 className="animate-spin" /> : <Download />}</Button></td><td className="whitespace-nowrap py-4 pr-4">{row.overall_score === null ? <span className="text-muted-foreground">—</span> : <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" aria-expanded={openSummary === row.id} onClick={() => setOpenSummary(openSummary === row.id ? null : row.id)}>{openSummary === row.id ? "Hide summary" : "View summary"}</button>}</td>{identity?.role === "admin" && <td className="whitespace-nowrap py-4 pr-4"><Button variant="destructive" size="sm" disabled={deleting === row.id} onClick={() => setPendingDelete({ id: row.id, customer_name: row.customer_name })}>{deleting === row.id ? <Loader2 className="animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</Button></td>}</tr>{openSummary === row.id && <tr className="bg-muted/30"><td colSpan={identity?.role === "admin" ? 8 : 7} className="px-4 pb-4 pt-2"><div className="sticky left-0 w-[min(52rem,calc(100vw_-_7rem))]"><LeadSummary id={row.id} /></div></td></tr>}</Fragment>)}</tbody></table>{rows.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">{data.length > 0 ? "No matching leads. Try adjusting or clearing the filters." : "இன்னும் lead சமர்ப்பிக்கப்படல."}</p>}</div>
    <WorkspacePagination totalItems={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
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
    <AlertDialog open={bulkDeleteOpen} onOpenChange={open => { if (!bulkDeleting) setBulkDeleteOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{selectedIds.length} leads-ஐ delete செய்ய வேண்டுமா?</AlertDialogTitle>
          <AlertDialogDescription>தேர்வு செய்த {selectedIds.length} lead(s), அதனுடன் தொடர்புடைய report மற்றும் audio-வும் delete செய்யப்படும். இந்தச் செயலை மீண்டும் மாற்ற முடியாது.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={bulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event => { event.preventDefault(); void confirmBulkDelete(); }}>{bulkDeleting ? "Deleting..." : "ஆம், அனைத்தையும் Delete செய்"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
