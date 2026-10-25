import { useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Copy, Download, Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DetailedReport } from "@/components/detailed-report";
import { DEFAULT_INTENT_WEIGHTS, MISSING_REPORT_INFO, compactReport, validateReport, reportText, type ConversationReport } from "@/lib/conversation-report";
import { destinationHeaders } from "@/lib/workspace-attacher";

export function ConversationReports({ transcript, filename, audioPath, leadId, autoStart = false }: { transcript: string; filename: string; audioPath?: string; leadId?: string; autoStart?: boolean }) {
  const [report, setReport] = useState<ConversationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("performance");
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<"summary" | "detailed">("summary");
  const weights = DEFAULT_INTENT_WEIGHTS;
  const busy = useRef(false);
  useEffect(() => { if (autoStart) void analyse(); }, [autoStart]);
  async function analyse() {
    if (busy.current || report) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const response = await fetch("/api/analyse", { method: "POST", headers: { "Content-Type": "application/json", ...await destinationHeaders() }, body: JSON.stringify({ transcript, audioPath: audioPath || undefined, audioName: filename, leadId }) });
      if (!response.ok) { const j = await response.json(); throw new Error(j.error ?? "Analysis failed."); }
      if (!response.body) throw new Error("The report response was empty.");
      let final: unknown, failure = "";
      const parser = createParser({ onEvent(event) {
        const data = JSON.parse(event.data);
        if (data.type === "report") final = data.report;
        if (data.type === "error") failure = data.error;
      } });
      const reader = response.body.getReader(), decoder = new TextDecoder();
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; parser.feed(decoder.decode(chunk.value, { stream: true })); }
      parser.feed(decoder.decode());
      if (failure) throw new Error(failure);
      if (!final) throw new Error("Analysis ended before both reports were ready. Please try again.");
      setReport(validateReport(final, transcript));
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
    finally { busy.current = false; setLoading(false); }
  }
  async function copyReport() {
    if (!report) return;
    try { await navigator.clipboard.writeText(reportText(report, tab, weights, format)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Could not copy the report. Please download it instead."); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportText(report, tab, weights, format)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${filename.replace(/\.[^.]+$/, "")}-${tab}-report.txt`; a.click(); URL.revokeObjectURL(url);
  }
  const summary = report ? compactReport(report, weights) : null;
  const scoreText = (score: number | null) => score === null ? MISSING_REPORT_INFO : `${score}/100`;
  return <section className="mt-8 min-w-0 border-t border-border pt-6" aria-label="உரையாடல் அறிக்கைகள்" lang="ta">
    {!report && <Button onClick={analyse} disabled={loading} className="w-full" size="lg">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{loading ? "உரையாடலை ஆய்வு செய்கிறேன்…" : "உரையாடலை ஆய்வு செய்"}</Button>}
    {loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Transcript-ஐ ஆய்வு செய்து score, buyer intent, அடுத்த call report தயாரிக்கிறது…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {summary && <>
      <section className="mb-6" aria-label="மொத்த மதிப்பெண் சுருக்கம்">
        <h2 className="font-display text-xl">மொத்த மதிப்பெண் சுருக்கம்</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>விற்பனையாளர் மொத்த மதிப்பெண்: <strong className="text-primary">{scoreText(summary.performance.score)}</strong></li>
          <li>வாங்குபவர் மொத்த மதிப்பெண்: <strong className="text-primary">{summary.intent.score}/100</strong> · {summary.priority}</li>
        </ul>
      </section>
      <Tabs value={tab} onValueChange={value => { setTab(value); setCopied(false); }}>
        <TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger value="performance" className="min-w-0 whitespace-normal">விற்பனையாளர் செயல்திறன்</TabsTrigger><TabsTrigger value="buyer" className="min-w-0 whitespace-normal">வாங்குபவரின் அறிகுறிகள்</TabsTrigger></TabsList>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Report format" className="flex gap-1">
            <Button size="sm" variant={format === "summary" ? "default" : "outline"} aria-pressed={format === "summary"} onClick={() => { setFormat("summary"); setCopied(false); }}>சுருக்கம்</Button>
            <Button size="sm" variant={format === "detailed" ? "default" : "outline"} aria-pressed={format === "detailed"} onClick={() => { setFormat("detailed"); setCopied(false); }}>விரிவான அறிக்கை</Button>
          </div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={copyReport}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "நகலெடுக்கப்பட்டது" : "நகலெடு"}</Button><Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4" />பதிவிறக்கு</Button></div>
        </div>
        <TabsContent value="performance" className="min-w-0 break-words">
          <h2 className="mt-5 font-display text-xl">விற்பனையாளர் செயல்திறன் சுருக்கம்</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed">
            {summary.caller.map(row => <li key={row.label}><span className="font-medium">{row.label}</span>{row.score !== null && <strong className="text-primary"> · {row.score}/100</strong>} — <span className="text-muted-foreground">{row.explanation}</span></li>)}
          </ul>
          {format === "detailed" && report && <DetailedReport report={report} tab="performance" />}
        </TabsContent>
        <TabsContent value="buyer" className="min-w-0 break-words">
          <h2 className="mt-5 font-display text-xl">வாங்குபவரின் வாங்கும் அறிகுறிகள்</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed">
            {summary.buyer.map(row => <li key={row.label}><span className="font-medium">{row.label}: </span><span className={row.value === "HOT" || row.value === "WARM" || row.value === "COLD" ? "font-semibold text-primary" : "text-muted-foreground"}>{row.value}</span></li>)}
          </ul>
          {format === "detailed" && report && <DetailedReport report={report} tab="buyer" />}
        </TabsContent>
      </Tabs>
    </>}
  </section>;
}
