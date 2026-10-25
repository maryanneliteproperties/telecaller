import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Upload, FileAudio, Loader2, Copy, Download, X, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationReports } from "@/components/conversation-reports";
import { ACCEPT_ATTR, formatBytes, friendlyTranscriptionError, validateAudioFile } from "@/lib/audio-limits";
import { destinationHeaders } from "@/lib/workspace-attacher";

export function CallTranscription({ leadId, savedAudioName, autoStart = false }: { leadId: string; savedAudioName: string; autoStart?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioPath, setAudioPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [completed, setCompleted] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    const err = validateAudioFile(f);
    setTranscript("");
    setCompleted(false);
    if (err) {
      setFile(null);
      setError(err);
      return;
    }
    setError(null);
    setFile(f);
  }

  const started = useRef(false);
  useEffect(() => { if (autoStart && !started.current) { started.current = true; void transcribe(); } }, [autoStart]);

  async function transcribe() {
    started.current = true;
    setLoading(true);
    setCompleted(false);
    setError(null);
    setTranscript("");
    try {
      const fd = new FormData();
      fd.append("leadId", leadId);
      const res = await fetch("/api/transcribe", { method: "POST", headers: await destinationHeaders(), body: fd });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Transcription failed (${res.status}).`);
      }
      setAudioPath(res.headers.get("X-Audio-Path") ?? "");
      let text = "";
      let done = false;
      let streamErr: string | null = null;
      const parser = createParser({
        onEvent(ev) {
          try {
            const d = JSON.parse(ev.data);
            if (d.type === "transcript.text.delta" && d.delta) {
              text += d.delta;
              setTranscript(text);
            } else if (d.type === "transcript.text.done") {
              text = d.text ?? text;
              done = true;
              setTranscript(text);
            } else if (d.type === "error" || d.error) {
              streamErr = d.error?.message ?? d.message ?? "Transcription failed.";
            }
          } catch {}
        },
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done: rd } = await reader.read();
        if (rd) break;
        parser.feed(dec.decode(value, { stream: true }));
      }
      if (streamErr) throw new Error(friendlyTranscriptionError(streamErr));
      if (!done) throw new Error("Transcription ended unexpectedly. Please try again.");
      if (!text.trim()) throw new Error("No speech was detected in this recording.");
      setCompleted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name.replace(/\.[^.]+$/, "") ?? "transcript") + "-transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3"><p className="eyebrow">Call analysis</p><Link to="/reports" className="text-sm underline">சேமித்த reports</Link></div>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">AI Call Transcription</h1>
        <p className="mt-3 text-muted-foreground">
          Upload a recorded client call. Tamil, Tanglish and English are kept as spoken — no translation.
        </p>

        <section className="panel mt-10 p-6 sm:p-8">
          <div className="hidden"
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            data-active={dragging}
          >
            <Upload className="h-8 w-8 text-primary" />
            <p className="mt-3 font-medium">Drag & drop an audio file here</p>
            <p className="text-sm text-muted-foreground">Any audio format, including AMR · Gemini transcription up to 14 MB</p>
            <Button type="button" variant="outline" className="mt-4" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              Select Audio File
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {file && (
            <div className="mt-5 flex items-center gap-3 rounded-lg bg-secondary px-4 py-3">
              <FileAudio className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button aria-label="Remove file" disabled={loading} onClick={() => { setFile(null); setTranscript(""); setCompleted(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-5 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">{savedAudioName}</p>
          <Button className="mt-6 w-full" size="lg" disabled={loading} onClick={transcribe}>
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Transcribing…</>) : "Transcribe Audio"}
          </Button>
        </section>

        {(transcript || loading) && (
          <section className="panel mt-8 p-6 sm:p-8">
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
        {completed && !loading && <ConversationReports key={transcript} transcript={transcript} filename={savedAudioName} audioPath={audioPath} leadId={leadId} autoStart={autoStart} />}
      </div>
    </main>
  );
}
