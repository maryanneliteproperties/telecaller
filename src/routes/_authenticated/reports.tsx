import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ClipboardList, MapPin, Users } from "lucide-react";
import { CallAudioPlayer } from "@/components/call-audio-player";
import { LeadsPage } from "./leads";
import { Button } from "@/components/ui/button";
import { DEFAULT_INTENT_WEIGHTS, reportText, type ConversationReport } from "@/lib/conversation-report";
import { listLeads, listReports, updateLeadSiteVisit } from "@/lib/workspace.functions";

const reportsOptions = queryOptions({ queryKey: ["workspace", "reports"], queryFn: () => listReports() });
const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
type Tab = "leads" | "followups" | "sitevisits";
type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export const Route = createFileRoute("/_authenticated/reports")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(reportsOptions),
      context.queryClient.ensureQueryData(leadsOptions),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Reports · Mary Ann Elite Properties" },
      { name: "description", content: "Leads, follow-ups, site visits and saved call reports." },
      { property: "og:title", content: "Reports · Mary Ann Elite Properties" },
      { property: "og:description", content: "Manage leads, follow-ups and site visits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: reports } = useSuspenseQuery(reportsOptions);
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const { identity } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<Tab>("leads");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const updateSiteVisit = useServerFn(updateLeadSiteVisit);
  const queryClient = useQueryClient();

  const followUps = useMemo(() => leads.filter(row => row.follow_up_date).sort((a,b) => (a.follow_up_date ?? "").localeCompare(b.follow_up_date ?? "")), [leads]);
  const siteVisits = useMemo(() => leads.filter(row => row.site_visit_status && row.site_visit_status !== "Not Planned"), [leads]);

  async function saveSiteVisit(row: LeadRow, form: HTMLFormElement) {
    const formData = new FormData(form);
    setSavingId(row.id); setError("");
    try {
      await updateSiteVisit({ data: {
        id: row.id,
        siteVisitDate: String(formData.get("siteVisitDate") || "") || null,
        siteVisitStatus: String(formData.get("siteVisitStatus") || "Not Planned") as "Not Planned" | "Planned" | "Confirmed" | "Completed" | "Rescheduled" | "Cancelled",
      }});
      await queryClient.invalidateQueries({ queryKey: ["workspace", "leads"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Site Visit update செய்ய முடியல.");
    } finally { setSavingId(null); }
  }

  const tabs: { id: Tab; label: string; icon: typeof Users; count: number }[] = [
    { id: "leads", label: "Leads", icon: Users, count: leads.length },
    { id: "followups", label: "Follow Ups", icon: CalendarDays, count: followUps.length },
    { id: "sitevisits", label: "Site Visit", icon: MapPin, count: siteVisits.length },
  ];

  return (
    <main lang="ta" className="w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="font-display text-3xl">Reports</h1><p className="mt-1 text-sm text-muted-foreground">Leads, follow-ups மற்றும் site visits ஒரே இடத்தில்.</p></div>
          <Button asChild variant="outline"><Link to="/">புதிய call</Link></Button>
        </div>

        <div role="tablist" aria-label="Reports sections" className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/50 p-1 sm:inline-flex sm:gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-5 sm:text-sm ${active ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>
              <Icon className="h-4 w-4 shrink-0" /><span>{tab.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] sm:text-xs ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"}`}>{tab.count}</span>
            </button>;
          })}
        </div>

        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

        {activeTab === "leads" && <section role="tabpanel" className="space-y-8">
          <LeadsPage identity={identity} />
          <section className="space-y-4 border-t pt-8">
            <div><h2 className="font-display text-2xl">Saved Call Reports</h2><p className="mt-1 text-sm text-muted-foreground">சேமிக்கப்பட்ட call transcripts மற்றும் AI reports.</p></div>
            {reports.length === 0 && <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">இன்னும் saved call reports எதுவும் இல்லை.</p>}
            {reports.map(r => (
              <article key={r.id} className="space-y-3 rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString("ta-IN")} · {r.audio_name ?? "call"}</p>
                {r.audioUrl ? <CallAudioPlayer src={r.audioUrl} name={r.audio_name ?? "call"} /> : <p className="text-sm text-muted-foreground">Audio சேமிக்கப்படவில்லை</p>}
                <details><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm">{r.transcript}</p></details>
                <details><summary className="cursor-pointer font-medium">AI Report சுருக்கம்</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{safeSummary(r.report)}</pre></details>
              </article>
            ))}
          </section>
        </section>}

        {activeTab === "followups" && <section role="tabpanel" className="space-y-4">
          <div><h2 className="font-display text-xl">Follow Up Schedule</h2><p className="text-sm text-muted-foreground">Follow-up date பதிவு செய்யப்பட்ட leads.</p></div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Follow-up Date</th><th className="px-4 py-3">Customer Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Lead Stage</th><th className="px-4 py-3">Telecaller</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y">{followUps.map(row => <tr key={row.id} className="transition-colors hover:bg-muted/30"><td className="whitespace-nowrap px-4 py-3 font-medium">{formatDate(row.follow_up_date)}</td><td className="px-4 py-3 font-medium">{row.customer_name ?? "—"}</td><td className="whitespace-nowrap px-4 py-3">{row.customer_phone ?? "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.lead_stage === "Interest" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{row.lead_stage ?? "—"}</span></td><td className="px-4 py-3">{row.telecaller_name ?? "—"}</td><td className="px-4 py-3"><Button asChild size="sm" variant="outline"><Link to="/leads/$id" params={{id:row.id}}>View</Link></Button></td></tr>)}</tbody>
            </table>
            {followUps.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">Follow-up date உள்ள leads எதுவும் இல்லை.</p>}
          </div>
        </section>}

        {activeTab === "sitevisits" && <section role="tabpanel" className="space-y-4">
          <div><h2 className="font-display text-xl">Site Visit Tracker</h2><p className="text-sm text-muted-foreground">ஒவ்வொரு lead-க்கும் site visit date மற்றும் status update செய்யலாம்.</p></div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Site Visit Date</th><th className="px-4 py-3">Visit Status</th><th className="px-4 py-3">Telecaller</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody className="divide-y">{leads.map(row => <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3 font-medium">{row.customer_name ?? "—"}</td><td className="px-4 py-3">{row.customer_phone ?? "—"}</td><td className="px-4 py-3"><form id={`visit-${row.id}`} onSubmit={e => {e.preventDefault(); void saveSiteVisit(row,e.currentTarget);}}><input aria-label="Site visit date" type="date" name="siteVisitDate" defaultValue={row.site_visit_date ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm" /></form></td><td className="px-4 py-3"><select aria-label="Site visit status" name="siteVisitStatus" form={`visit-${row.id}`} defaultValue={row.site_visit_status ?? "Not Planned"} className="h-9 rounded-md border bg-background px-2 text-sm"><option>Not Planned</option><option>Planned</option><option>Confirmed</option><option>Completed</option><option>Rescheduled</option><option>Cancelled</option></select></td><td className="px-4 py-3">{row.telecaller_name ?? "—"}</td><td className="px-4 py-3"><Button type="submit" form={`visit-${row.id}`} size="sm" disabled={savingId===row.id}>{savingId===row.id ? "Saving..." : "Save"}</Button></td></tr>)}</tbody>
            </table>
            {leads.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">Leads எதுவும் இல்லை.</p>}
          </div>
        </section>}
      </div>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function safeSummary(report: unknown) {
  try {
    const r = report as ConversationReport;
    return `${reportText(r, "performance", DEFAULT_INTENT_WEIGHTS)}\n\n${reportText(r, "buyer", DEFAULT_INTENT_WEIGHTS)}`;
  } catch { return "Report-ஐ காட்ட முடியவில்லை."; }
}
