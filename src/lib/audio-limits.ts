// Shared, browser-safe limits for audio uploads.
export const MAX_AUDIO_BYTES = 14 * 1024 * 1024; // Keep upload limits aligned with the transcription service.

// Every audio recording is accepted. The gate is "is this audio?", not "is this on
// a short list". This list is the fallback for files whose browser MIME type comes
// back empty or generic (e.g. .amr, .awb, .opus), where the name is the only clue.
export const AUDIO_EXTENSIONS = [
  "mp3", "mp2", "mpa", "mpga", "mpeg", "mp4", "m4a", "m4b", "m4r", "m4v",
  "wav", "wave", "bwav", "w64", "caf",
  "webm", "ogg", "oga", "ogx", "opus", "spx",
  "flac", "alac", "ape", "wv", "aiff", "aif", "aifc", "au", "snd", "raw",
  "amr", "awb", "3gp", "3gpp", "3ga", "3g2", "act", "qcp", "vox", "voc", "vocx",
  "aac", "ac3", "eac3", "mka", "m2a", "wma", "ra", "ram", "cdda",
];

// Container MIME types browsers report for call recordings that hold speech
// (phone exports, voice notes). Generic buckets like application/octet-stream are
// deliberately excluded — those fall back to the extension check.
const AUDIO_CONTAINERS = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "video/webm",
  "application/ogg",
  "application/mp4",
  "application/x-matroska",
]);

export const ACCEPT_ATTR =
  "audio/*," + Array.from(new Set(AUDIO_EXTENSIONS)).map((e) => "." + e).join(",");

// Label phone recording containers as audio without changing their encoded bytes.
export function transcriptionAudioType(file: { name: string; type?: string }): string {
  const type = (file.type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.startsWith("audio/")) return type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    mp3: "audio/mpeg", mp2: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
    m4b: "audio/mp4", m4v: "audio/mp4", wav: "audio/wav", wave: "audio/wav",
    webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
    flac: "audio/flac", amr: "audio/amr", awb: "audio/amr-wb",
    "3gp": "audio/3gpp", "3gpp": "audio/3gpp", "3ga": "audio/3gpp",
    "3g2": "audio/3gpp2", aac: "audio/aac", aiff: "audio/aiff", aif: "audio/aiff",
  };
  return types[ext] ?? (type.startsWith("video/") ? type.replace("video/", "audio/") : "audio/octet-stream");
}

export function isAudio(file: { name: string; type?: string }): boolean {
  const raw = (file.type ?? "").toLowerCase();
  const type = (raw.split(";")[0] ?? "").trim();
  if (type.startsWith("audio/")) return true;
  if (AUDIO_CONTAINERS.has(type)) return true;
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  return AUDIO_EXTENSIONS.includes(ext);
}

export function validateAudioFile(file: { name: string; size: number; type?: string }): string | null {
  if (!isAudio(file)) {
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
    return ext
      ? `"${file.name}" doesn't look like an audio file. Please upload a call recording (MP3, M4A, WAV, AMR, OGG, …).`
      : `"${file.name}" doesn't look like an audio file. Please upload a call recording.`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_AUDIO_BYTES) return "File is larger than 14 MB. Please upload a shorter or compressed recording.";
  return null;
}

// The speech service only decodes a fixed set of containers. When it refuses one,
// say so in the uploader's terms instead of leaking its terse wording.
const UNSUPPORTED_FORMAT = /unsupported file format[:\s]*([a-z0-9]*)/i;

export function friendlyTranscriptionError(message: string): string {
  const match = UNSUPPORTED_FORMAT.exec(message);
  if (match) {
    const fmt = (match[1] ?? "").toUpperCase() || "This";
    return `"${fmt}" recordings can't be transcribed yet. Convert the file to MP3, M4A, WAV, OGG, WEBM or FLAC and try again.`;
  }
  return message;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
