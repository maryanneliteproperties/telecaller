import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CallAudioPlayer } from "@/components/call-audio-player";
import { listReports, listAvailableProjects, listWorkspaceFilterEmployees } from "@/lib/workspace.functions";
import { WorkspaceRecordFilters } from "@/components/workspace-record-filters";
import { WorkspacePagination } from "@/components/workspace-pagination";
import { DEFAULT_INTENT_WEIGHTS, reportText, type ConversationReport } from "@/lib/conversation-report";

const reportsOptions = queryOptions({ queryKey: ["workspace", "reports"], queryFn: () => listReports() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
const employeeOptions = queryOptions({ queryKey: ["workspace", "filter-employees"], queryFn: () => listWorkspaceFilterEmployees() });
const reportDate = (row: { created_at: string }) => row.created_at;
export const Route = createFileRoute("/_authenticated/reports")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(reportsOptions), context.queryClient.ensureQueryData(projectsOptions), context.queryClient.ensureQueryData(employeeOptions)]); },
  head: () => ({ meta: [{ title: "Call Reports · Mary Ann Elite Properties" }] }),
  component: ReportsPage,
});
function ReportsPage() {
  const { data: reports } = useSuspenseQuery(reportsOptions);
  const { data: projects } = useSuspenseQuery(projectsOptions);
  const { data: employees } = useSuspenseQuery(employeeOptions);
  const [filteredReports, setFilteredReports] = useState<typeof reports | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const visibleReports = filteredReports ?? reports;
  const handleFilterChange = useCallback((nextReports: typeof reports) => { setFilteredReports(nextReports); setPage(1); }, []);
  const pageReports = visibleReports.slice((page - 1) * pageSize, page * pageSize);
  return <main className="w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-10 sm:py-10"><div className="mx-auto max-w-7xl space-y-6">
    <div><h1 className="font-display text-3xl">Saved Call Reports</h1></div>
    <WorkspaceRecordFilters rows={reports} projects={projects} employeeNames={employees} getDate={reportDate} onChange={handleFilterChange} />
    {visibleReports.length===0&&<p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">இன்னும் saved call reports எதுவும் இல்லை.</p>}
    {pageReports.map(r=><article key={r.id} className="space-y-3 rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString("ta-IN")} · {r.audio_name??"call"}</p>{r.audioUrl?<CallAudioPlayer src={r.audioUrl} name={r.audio_name??"call"}/>:<p className="text-sm text-muted-foreground">Audio சேமிக்கப்படவில்லை</p>}<details><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm">{r.transcript}</p></details><details><summary className="cursor-pointer font-medium">AI Report சுருக்கம்</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{safeSummary(r.report)}</pre></details></article>)}
    <WorkspacePagination totalItems={visibleReports.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
  </div></main>;
}
function safeSummary(report: unknown) { try { const r=report as ConversationReport; return `${reportText(r,"performance",DEFAULT_INTENT_WEIGHTS)}\n\n${reportText(r,"buyer",DEFAULT_INTENT_WEIGHTS)}`; } catch { return "Report-ஐ காட்ட முடியவில்லை."; } }
