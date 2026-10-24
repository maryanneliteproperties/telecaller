import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, getDestinationClient } from "@/lib/destination-client";
import { Button } from "@/components/ui/button";
import { DEFAULT_INTENT_WEIGHTS, reportText, type ConversationReport } from "@/lib/conversation-report";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listReports } from "@/lib/workspace.functions";

const reportsOptions = queryOptions({ queryKey: ["workspace", "reports"], queryFn: () => listReports() });

export const Route = createFileRoute("/_authenticated/reports")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reportsOptions),
  head: () => ({
    meta: [
      { title: "சேமித்த Call Reports · AI Call Transcription" },
      { name: "description", content: "சேமித்த call audio, transcript மற்றும் தமிழ் report." },
      { property: "og:title", content: "சேமித்த Call Reports" },
      { property: "og:description", content: "சேமித்த call audio, transcript மற்றும் தமிழ் report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Row = { id: string; created_at: string; transcript: string; report: unknown; audio_path: string | null; audio_name: string | null; audioUrl?: string };

function ReportsPage() {
  const { data: rows } = useSuspenseQuery(reportsOptions);

  return (
    <main lang="ta" className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-4xl">சேமித்த Call Reports</h1>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/">புதிய call</Link></Button>
          </div>
        </div>
        {rows.length === 0 && <p className="text-muted-foreground">இன்னும் report எதுவும் சேமிக்கப்படவில்லை.</p>}
        {rows?.map((r) => (
          <article key={r.id} className="space-y-3 rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString("ta-IN")} · {r.audio_name ?? "call"}</p>
            {r.audioUrl ? <audio controls src={r.audioUrl} className="w-full" /> : <p className="text-sm text-muted-foreground">Audio சேமிக்கப்படவில்லை</p>}
            <details><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm">{r.transcript}</p></details>
            <details open><summary className="cursor-pointer font-medium">சுருக்கம்</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{safeSummary(r.report)}</pre>
            </details>
          </article>
        ))}
      </div>
    </main>
  );
}

function safeSummary(report: unknown) {
  try {
    const r = report as ConversationReport;
    return `${reportText(r, "performance", DEFAULT_INTENT_WEIGHTS)}\n\n${reportText(r, "buyer", DEFAULT_INTENT_WEIGHTS)}`;
  } catch { return "Report-ஐ காட்ட முடியவில்லை."; }
}
