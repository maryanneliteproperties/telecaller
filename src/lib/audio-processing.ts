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

function parseEventStream<T>(response: Response, onEvent: (event: Record<string, unknown>) => void) {
  return new Promise<T>((resolve, reject) => {
    if (!response.body) {
      reject(new Error("Server response empty-ஆக உள்ளது."));
      return;
    }
    let streamError = "";
    let result: T | undefined;
    const parser = createParser({
      onEvent(event) {
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          if (data.type === "error") streamError = String(data.error ?? data.message ?? "Processing failed.");
          onEvent(data);
        } catch {
          // Ignore non-JSON keep-alive events.
        }
      },
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    void (async () => {
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          parser.feed(decoder.decode(chunk.value, { stream: true }));
        }
        parser.feed(decoder.decode());
        if (streamError) throw new Error(streamError);
        resolve(result as T);
      } catch (error) {
        reject(error);
      }
    })();
    // The caller stores the final payload through the event callback.
    void result;
  });
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

async function postWithCapacityRetry(url: string, init: RequestInit, stage: "transcription" | "analysis") {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, init);
    if (response.ok) return response;
    const message = await responseError(response);
    if (!shouldRetry(response.status, message) || attempt === 2) throw new Error(message);
    const delay = attempt === 0 ? 15000 : 30000;
    updateStageMessage(init, stage, `Gemini service busy. ${delay / 1000} seconds கழித்து மீண்டும் முயற்சி செய்கிறோம்…`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(response ? await responseError(response) : "Processing failed.");
}

// Kept as a no-op hook point so retry messaging can be updated without coupling
// the processor to a particular route component.
function updateStageMessage(_init: RequestInit, _stage: "transcription" | "analysis", _message: string) {}

async function run(leadId: string, filename: string) {
  try {
    update(leadId, { status: "transcribing", error: "" });
    const form = new FormData();
    form.append("leadId", leadId);
    const transcribeResponse = await postWithCapacityRetry("/api/transcribe", {
      method: "POST",
      headers: await destinationHeaders(),
      body: form,
    }, "transcription");

    let transcript = "";
    let completed = false;
    const parser = createParser({
      onEvent(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript.text.delta" && data.delta) transcript += data.delta;
          if (data.type === "transcript.text.done") {
            transcript = data.text ?? transcript;
            completed = true;
          }
          if (data.type === "error" || data.error) throw new Error(data.error?.message ?? data.message ?? "Transcription failed.");
        } catch (error) {
          if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
        }
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
    if (!completed || !transcript.trim()) throw new Error("Transcription முழுமையடையவில்லை. மீண்டும் முயற்சி செய்யவும்.");

    update(leadId, { status: "analysing", transcript, error: "" });
    const analysisResponse = await postWithCapacityRetry("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await destinationHeaders() },
      body: JSON.stringify({ transcript, audioName: filename, leadId }),
    }, "analysis");

    let finalReport: unknown = null;
    const analysisParser = createParser({
      onEvent(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "report") finalReport = data.report;
          if (data.type === "error") throw new Error(data.error ?? "Analysis failed.");
        } catch (error) {
          if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
        }
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
