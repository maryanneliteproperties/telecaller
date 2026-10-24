import { transcriptionAudioType } from "./audio-limits";

export function playbackMime(name: string): string {
  return transcriptionAudioType({ name });
}

export function requiresAudioConversion(name: string, canPlayType: (type: string) => string): boolean {
  return !canPlayType(playbackMime(name));
}

export function convertAudioForPlayback(bytes: ArrayBuffer, name: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./audio-decoder.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Audio தயாராக அதிக நேரம் ஆகுது. மீண்டும் முயற்சி பண்ணுங்க."));
    }, 120_000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = ({ data }: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
      finish();
      if (data.bytes) resolve(new Blob([data.bytes], { type: "audio/wav" }));
      else reject(new Error(data.error ?? "Audio தயாராகல."));
    };
    worker.onerror = () => { finish(); reject(new Error("Audio தயாராகல. மீண்டும் முயற்சி பண்ணுங்க.")); };
    worker.postMessage({ bytes, name }, [bytes]);
  });
}