import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, Loader2, Check, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationReports } from "@/components/conversation-reports";
import { startAudioProcessing, getAudioProcessingState, subscribeAudioProcessing } from "@/lib/audio-processing";
import { getLeadReport } from "@/lib/workspace.functions";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";

function isApiErrorTranscript(value: string) {
  const text = value.trim();
  return /^(Gemini தினசரி API quota முடிந்துவிட்டது|Gemini API request limit அடைந்துள்ளது)/i.test(text)
    || /^<!doctype html>/i.test(text)
    || /<html[\s>]/i.test(text) && /This page didn't load/i.test(text);
}

export function CallTranscription({ leadId, savedAudioName, autoStart = false }: { leadId: string; savedAudioName: string; autoStart?: boolean }) {
  const processing = useSyncExternalStore(
    subscribeAudioProcessing,
    () => getAudioProcessingState(leadId),
    () => null,
  );
  const [savedTranscript, setSavedTranscript] = useState("");
  const [savedReport, setSavedReport] = useState<ConversationReport | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoStart) {
      startAudioProcessing(leadId, savedAudioName);
      return;
    }
    let active = true;
    void getLeadReport({ data: { id: leadId } }).then(result => {
      if (!active) return;
      setSavedTranscript(result.transcript);
      setSavedReport(validateReport(result.report, result.transcript) as ConversationReport);
    }).catch(() => {});
    return () => { active = false; };
  }, [autoStart, leadId, savedAudioName]);

  const rawTranscript = processing?.transcript || savedTranscript;
  const transcript = isApiErrorTranscript(rawTranscript) ? "" : rawTranscript;
  const report = processing?.report ?? savedReport;
  const loading = processing?.status === "transcribing" || processing?.status === "analysing";
  const storedTranscriptError = !processing && isApiErrorTranscript(savedTranscript);
  const error = processing?.status === "error"
    ? processing.error
    : storedTranscriptError
      ? "முந்தைய முயற்சியில் API error transcript-ஆக சேமிக்கப்பட்டுள்ளது. Quota reset ஆன பிறகு Retry செய்யவும்."
      : "";

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
              <p role="status" className="text-sm text-muted-foreground">
                {processing?.status === "transcribing" ? "Audio transcription தானாக நடைபெறுகிறது…" :
                  processing?.status === "analysing" ? "Transcript முடிந்தது. AI analysis மற்றும் report தயாராகிறது…" :
                  processing?.status === "completed" || report ? "Transcription மற்றும் AI report முடிந்தது." :
                  error ? "Transcription தோல்வியடைந்தது. கீழே உள்ள விவரத்தைப் பார்க்கவும்." :
                  "Audio processing status ஏற்றப்படுகிறது…"}
              </p>
            </div>
            {error && <Button size="sm" variant="outline" onClick={() => startAudioProcessing(leadId, savedAudioName)}><RotateCcw className="h-4 w-4" /> Retry</Button>}
          </div>
        </section>

        {(transcript || loading) && (
          <section className="panel mt-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Transcript</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!transcript || loading} onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" disabled={!transcript || loading} onClick={download}>
                  <Download className="h-4 w-4" /> Download .txt
                </Button>
              </div>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap leading-relaxed">
              {transcript || <span className="text-muted-foreground">Audio-வை text-ஆக மாற்றுகிறது… நீளமான recording-க்கு நேரம் ஆகலாம்.</span>}
            </div>
          </section>
        )}
        {report && <ConversationReports key={leadId} transcript={transcript} filename={savedAudioName} leadId={leadId} initialReport={report} />}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
