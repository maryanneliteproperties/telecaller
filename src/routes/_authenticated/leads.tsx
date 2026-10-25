import { CallAudioPlayer } from "@/components/call-audio-player";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { LeadSummary } from "@/components/lead-summary";
import { getLeadReport, listLeads } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";
import { downloadReportPdf } from "@/lib/report-pdf";
import { Download, Loader2, Plus } from "lucide-react";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
export const Route = createFileRoute("/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsOptions),
  head: () => ({ meta: [{ title: "Leads · AI Call Workspace" }, { name: "description", content: "Customer details, recorded call audio and report status." }, { property: "og:title", content: "Leads · AI Call Workspace" }, { property: "og:description", content: "Your saved customer calls and follow-up reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeadsPage,
});
function scoreBadge(score: number | null) {
  if (score === null) return <Badge variant="outline" className="text-muted-foreground">AI Pending</Badge>;
  const tone = score >= 70 ? "bg-success text-success-foreground" : score >= 40 ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
  return <Badge className={tone}>{score}/100</Badge>;
}
function LeadsPage() {
  const { data } = useSuspenseQuery(leadsOptions), [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [openSummary, setOpenSummary] = useState<string | null>(null);
  async function downloadReport(row: { id: string; customer_name: string | null; audio_name: string | null }) {
    setDownloading(row.id); setDownloadError("");
    try {
      const { report, transcript, audioName, createdAt } = await getLeadReport({ data: { id: row.id } });
      const validated = validateReport(report, transcript) as ConversationReport;
      await downloadReportPdf(validated, row.customer_name ?? audioName ?? "call", createdAt ?? undefined);
    } catch (e) { setDownloadError(e instanceof Error ? e.message : "Report download ஆகல."); }
    finally { setDownloading(null); }
  }
  const rows = useMemo(() => data.filter(row => `${row.customer_name ?? ""} ${row.customer_phone ?? ""} ${row.audio_name ?? ""}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const stats = useMemo(() => {
    const analysed = data.filter(row => row.overall_score !== null);
    return { total: data.length, pending: data.length - analysed.length, average: analysed.length ? Math.round(analysed.reduce((sum, row) => sum + (row.overall_score ?? 0), 0) / analysed.length) : null };
  }, [data]);
  return <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-10 sm:px-10">
    <div className="flex items-center justify-between gap-4"><div><h1 className="font-display text-3xl">Leads</h1><p className="mt-1 text-sm text-muted-foreground">{stats.total} leads saved</p></div><Button asChild><Link to="/"><Plus />New Lead</Link></Button></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Lead summary">
      <div className="rounded-lg border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Leads</p><p className="mt-2 text-2xl font-semibold">{stats.total}</p></div>
      <div className="rounded-lg border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Pending</p><p className="mt-2 text-2xl font-semibold">{stats.pending}</p></div>
      <div className="rounded-lg border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average Score</p><p className="mt-2 text-2xl font-semibold">{stats.average === null ? "—" : `${stats.average}/100`}</p></div>
    </div>
    <Input aria-label="Search leads" placeholder="Search customer name or phone" className="my-7 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
    {downloadError && <p role="alert" className="mb-4 text-sm text-destructive">{downloadError}</p>}
    {rows.length === 0 && <p className="border-y py-10 text-muted-foreground">{search ? "No matching leads." : "இன்னும் lead சமர்ப்பிக்கப்படல."}</p>}
    <div className="w-full max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[1100px] table-auto text-sm"><thead><tr className="border-b text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground"><th className="whitespace-nowrap py-3 pr-4 font-semibold">Created Date</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Customer Name</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Phone Number</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Audio</th><th className="whitespace-nowrap py-3 pr-4 font-semibold">Overall Score</th><th className="whitespace-nowrap px-4 py-3 font-semibold"><span className="sr-only">Report</span></th><th className="whitespace-nowrap px-4 py-3 font-semibold">Summary</th></tr></thead><tbody className="divide-y">{rows.map(row => <Fragment key={row.id}><tr className="align-top hover:bg-muted/40"><td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td><td className="py-4 pr-4 min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="whitespace-nowrap font-medium text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-xs text-muted-foreground">{row.telecaller_name ?? "—"}</p></td><td className="py-4 pr-4 whitespace-nowrap">{row.customer_phone ?? "—"}</td><td className="py-4 pr-4 min-w-0"><p className="mb-1 max-w-[24rem] truncate text-muted-foreground">{row.audio_name ?? "Audio இல்லை"}</p>{row.audioUrl && <CallAudioPlayer src={row.audioUrl} name={row.audio_name ?? "call"} className="w-full max-w-[22rem] min-w-0" />}</td><td className="py-4 pr-4">{scoreBadge(row.overall_score)}</td><td className="px-4 py-4"><Button variant="outline" size="icon" title="Download full report" aria-label="Download full report" disabled={row.overall_score === null || downloading === row.id} onClick={() => void downloadReport(row)}>{downloading === row.id ? <Loader2 className="animate-spin" /> : <Download />}</Button></td><td className="whitespace-nowrap px-4 py-4">{row.overall_score === null ? <span className="text-muted-foreground">—</span> : <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" aria-expanded={openSummary === row.id} onClick={() => setOpenSummary(openSummary === row.id ? null : row.id)}>{openSummary === row.id ? "Hide summary" : "View summary"}</button>}</td></tr>{openSummary === row.id && <tr className="bg-muted/30"><td colSpan={7} className="px-4 pb-4 pt-2"><div className="sticky left-0 w-[min(52rem,calc(100vw_-_7rem))]"><LeadSummary id={row.id} /></div></td></tr>}</Fragment>)}</tbody></table></div>
  </main>;
}
