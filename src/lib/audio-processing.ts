import { createParser } from "eventsource-parser";
import { validateReport, type ConversationReport } from "@/lib/conversation-report";
import { destinationHeaders } from "@/lib/workspace-attacher";

export type AudioProcessingStatus = "transcribing" | "analysing" | "completed" | "error";
export type AudioProcessingState = {
  leadId: string;
  filename: string;
  status: AudioProcessingStatus;
  transcript: string;
  report: ConversationReport | null;
  error: string;
};

const jobs = new Map<string, AudioProcessingState>();
const EMPTY: AudioProcessingState | null = null;
let snapshot: AudioProcessingState[] = [];
const listeners = new Set<() => void>();

function publish() {
  snapshot = [...jobs.values()];
  listeners.forEach(listener => listener());
}

export function subscribeAudioProcessing(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAudioProcessingSnapshot() {
  return snapshot;
}

export function getAudioProcessingState(leadId: string): AudioProcessingState | null {
  return snapshot.find(job => job.leadId === leadId) ?? EMPTY;
}

function update(leadId: string, patch: Partial<AudioProcessingState>) {
  const current = jobs.get(leadId);
  if (!current) return;
  jobs.set(leadId, { ...current, ...patch });
  publish();
}

async function responseError(response: Response) {
  const body = await response.clone().text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    return String(parsed?.error ?? parsed?.message ?? body);
  } catch {
    return body.slice(0, 500) || `Server error (${response.status}).`;
  }
}

function shouldRetry(status: number, message: string) {
  return (status === 429 || status === 503) && !/daily quota|தினசரி.*quota|requests per day|per day.*free tier|daily limit/i.test(message);
}

async function postWithCapacityRetry(url: string, init: RequestInit) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, init);
    if (response.ok) return response;
    const message = await responseError(response);
    if (!shouldRetry(response.status, message) || attempt === 2) throw new Error(message);
    const delay = attempt === 0 ? 15000 : 30000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(response ? await responseError(response) : "Processing failed.");
}

async function run(leadId: string, filename: string) {
  try {
    update(leadId, { status: "transcribing", error: "" });
    const form = new FormData();
    form.append("leadId", leadId);
    const transcribeResponse = await postWithCapacityRetry("/api/transcribe", {
      method: "POST",
      headers: await destinationHeaders(),
      body: form,
    });

    let transcript = "";
    let completed = false;
    let transcriptionError = "";
    const parser = createParser({
      onEvent(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript.text.delta" && data.delta) transcript += data.delta;
          if (data.type === "transcript.text.done") {
            transcript = data.text ?? transcript;
            completed = true;
          }
          if (data.type === "error" || data.error) transcriptionError = data.error?.message ?? data.message ?? "Transcription failed.";
        } catch {}
      },
    });
    const reader = transcribeResponse.body?.getReader();
    if (!reader) throw new Error("Transcription response empty-ஆக உள்ளது.");
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
    }
    parser.feed(decoder.decode());
    if (transcriptionError) throw new Error(transcriptionError);
    if (!completed || !transcript.trim()) throw new Error("Transcription முழுமையடையவில்லை. மீண்டும் முயற்சி செய்யவும்.");

    update(leadId, { status: "analysing", transcript, error: "" });
    const analysisResponse = await postWithCapacityRetry("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await destinationHeaders() },
      body: JSON.stringify({ transcript, audioName: filename, leadId }),
    });

    let finalReport: unknown = null;
    let analysisError = "";
    const analysisParser = createParser({
      onEvent(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "report") finalReport = data.report;
          if (data.type === "error") analysisError = String(data.error ?? "Analysis failed.");
        } catch {}
      },
    });
    const analysisReader = analysisResponse.body?.getReader();
    if (!analysisReader) throw new Error("Analysis response empty-ஆக உள்ளது.");
    const analysisDecoder = new TextDecoder();
    for (;;) {
      const chunk = await analysisReader.read();
      if (chunk.done) break;
      analysisParser.feed(analysisDecoder.decode(chunk.value, { stream: true }));
    }
    analysisParser.feed(analysisDecoder.decode());
    if (analysisError) throw new Error(analysisError);
    if (!finalReport) throw new Error("AI report முழுமையடையவில்லை. மீண்டும் முயற்சி செய்யவும்.");
    const report = validateReport(finalReport, transcript) as ConversationReport;
    update(leadId, { status: "completed", transcript, report, error: "" });
  } catch (error) {
    update(leadId, {
      status: "error",
      error: error instanceof Error ? error.message : "Audio processing failed.",
    });
  }
}

/** Starts one route-independent transcription + analysis job per lead. */
export function startAudioProcessing(leadId: string, filename: string) {
  const existing = jobs.get(leadId);
  if (existing && existing.status !== "error") return;
  jobs.set(leadId, {
    leadId,
    filename,
    status: "transcribing",
    transcript: existing?.transcript ?? "",
    report: null,
    error: "",
  });
  publish();
  void run(leadId, filename);
}
