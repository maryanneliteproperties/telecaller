import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationReports } from "@/components/conversation-reports";
import { getLeadProcessingStatus } from "@/lib/workspace.functions";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";

type DurableProcessingState = {
  status: string;
  stage: string;
  transcript: string;
  report: unknown;
  error: string;
};

export function CallTranscription({ leadId, savedAudioName }: { leadId: string; savedAudioName: string }) {
  const [state, setState] = useState<DurableProcessingState | null>(null);
  const [statusError, setStatusError] = useState("");
  const [copied, setCopied] = useState(false);

  // The server queue owns the work. This page only polls durable status, so
  // refreshing or closing the browser never cancels transcription or analysis.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await getLeadProcessingStatus({ data: { id: leadId } });
        if (!active) return;
        setState(result);
        setStatusError("");
        if (result.status !== "completed" && result.status !== "failed") {
          timer = window.setTimeout(() => void poll(), 5000);
        }
      } catch (error) {
        if (!active) return;
        setStatusError(error instanceof Error ? error.message : "Processing status ஏற்ற முடியல.");
        timer = window.setTimeout(() => void poll(), 10000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [leadId]);

  const transcript = state?.transcript ?? "";
  const report = state?.report ? validateReport(state.report, transcript) as ConversationReport : null;
  const status = state?.status ?? "queued";
  const stage = state?.stage ?? "transcribing";
  const loading = status === "queued" || status === "processing";
  const error = status === "failed" ? state?.error || "Audio processing முடியவில்லை." : statusError;

  async function copy() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${savedAudioName.replace(/\.[^.]+$/, "")}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusText = status === "completed" || report
    ? "Transcription மற்றும் AI report முழுமையாக save ஆகிவிட்டது."
    : status === "failed"
      ? error
      : status === "queued"
        ? "Server queue-ல் உள்ளது. தானாக processing தொடங்கும்…"
        : stage === "analysing"
          ? "Transcript save ஆகிவிட்டது. AI analysis மற்றும் final report தயாராகிறது…"
          : "Server-ல் audio transcription நடைபெறுகிறது…";

  return (
    <main className="min-h-screen px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3"><p className="eyebrow">Call analysis</p><Link to="/reports" className="text-sm underline">சேமித்த reports</Link></div>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">AI Call Transcription</h1>
        <p className="mt-3 text-muted-foreground">Tamil, Tanglish and English are kept as spoken — no translation.</p>

        <section className="panel mt-8 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : error ? <AlertCircle className="h-5 w-5 text-destructive" /> : <Check className="h-5 w-5 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{savedAudioName}</p>
              <p role="status" className="text-sm text-muted-foreground">{statusText}</p>
            </div>
          </div>
        </section>

        {(transcript || loading) && (
          <section className="panel mt-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Transcript</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!transcript} onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" disabled={!transcript} onClick={download}>
                  <Download className="h-4 w-4" /> Download .txt
                </Button>
              </div>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap leading-relaxed">
              {transcript || <span className="text-muted-foreground">Audio server-ல் text-ஆக மாற்றப்படுகிறது… நீளமான recording-க்கு நேரம் ஆகலாம்.</span>}
            </div>
          </section>
        )}
        {report && <ConversationReports key={leadId} transcript={transcript} filename={savedAudioName} leadId={leadId} initialReport={report} />}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
