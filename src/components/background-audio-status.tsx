import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAudioProcessingSnapshot, startAudioProcessing, subscribeAudioProcessing } from "@/lib/audio-processing";

export function BackgroundAudioStatus() {
  const jobs = useSyncExternalStore(subscribeAudioProcessing, getAudioProcessingSnapshot, getAudioProcessingSnapshot);
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(() => new Set());
  const errorTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const job of jobs) {
      if (job.status === "error") {
        if (!errorTimers.current.has(job.leadId) && !dismissedErrors.has(job.leadId)) {
          const timer = setTimeout(() => {
            setDismissedErrors(current => new Set(current).add(job.leadId));
            errorTimers.current.delete(job.leadId);
          }, 10_000);
          errorTimers.current.set(job.leadId, timer);
        }
      } else {
        const timer = errorTimers.current.get(job.leadId);
        if (timer) clearTimeout(timer);
        errorTimers.current.delete(job.leadId);
        if (dismissedErrors.has(job.leadId)) {
          setDismissedErrors(current => {
            const next = new Set(current);
            next.delete(job.leadId);
            return next;
          });
        }
      }
    }
  }, [jobs, dismissedErrors]);

  useEffect(() => () => {
    errorTimers.current.forEach(timer => clearTimeout(timer));
    errorTimers.current.clear();
  }, []);

  const visible = jobs.filter(job =>
    job.status === "transcribing" ||
    job.status === "analysing" ||
    (job.status === "error" && !dismissedErrors.has(job.leadId))
  );
  if (!visible.length) return null;

  return (
    <aside aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {visible.map(job => (
        <div key={job.leadId} className="rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start gap-3">
            {job.status === "error" ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{job.filename}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {job.status === "transcribing" ? "Audio transcription நடக்கிறது…" : job.status === "analysing" ? "AI analysis மற்றும் report தயாராகிறது…" : job.error}
              </p>
              {job.status === "error" && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => startAudioProcessing(job.leadId, job.filename)}>
                  <RotateCcw className="h-3.5 w-3.5" /> மீண்டும் முயற்சி
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </aside>
  );
}
