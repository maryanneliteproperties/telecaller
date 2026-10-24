import { describe, expect, it } from "vitest";

import {
  MAX_AUDIO_BYTES,
  ACCEPT_ATTR,
  friendlyTranscriptionError,
  isAudio,
  validateAudioFile,
} from "@/lib/audio-limits";

// Call recordings arrive in whatever format the phone or CRM exports them in, so
// the rule is "is this audio?" rather than "is this on a short list".
describe("Audio upload rules", () => {
  it("accepts an AMR call recording even when the browser reports no MIME type", () => {
    expect(isAudio({ name: "call-2026-10-23.amr", type: "" })).toBe(true);
    expect(validateAudioFile({ name: "call-2026-10-23.amr", size: 48_000, type: "" })).toBeNull();
    expect(ACCEPT_ATTR).toContain(".amr");
  });

  it("accepts every audio format the browser labels as audio", () => {
    expect(validateAudioFile({ name: "voice-note.xyz", size: 10_000, type: "audio/opus" })).toBeNull();
    expect(validateAudioFile({ name: "recording.m4a", size: 10_000, type: "audio/mp4" })).toBeNull();
    expect(validateAudioFile({ name: "outbound.aac", size: 10_000, type: "audio/aac" })).toBeNull();
    expect(validateAudioFile({ name: "call.webm", size: 10_000, type: "audio/webm" })).toBeNull();
  });

  it("accepts phone exports whose container is reported as video", () => {
    expect(validateAudioFile({ name: "call.mp4", size: 10_000, type: "video/mp4" })).toBeNull();
    expect(validateAudioFile({ name: "call.3gp", size: 10_000, type: "video/3gpp" })).toBeNull();
  });

  it("rejects files that are not audio", () => {
    expect(validateAudioFile({ name: "invoice.pdf", size: 10_000, type: "application/pdf" })).toMatch(
      /doesn't look like an audio file/,
    );
    expect(validateAudioFile({ name: "notes.txt", size: 10_000, type: "text/plain" })).toMatch(
      /doesn't look like an audio file/,
    );
    expect(validateAudioFile({ name: "photo.png", size: 10_000, type: "image/png" })).toMatch(
      /doesn't look like an audio file/,
    );
    expect(validateAudioFile({ name: "README", size: 10_000, type: "" })).toMatch(
      /doesn't look like an audio file/,
    );
  });

  it("still rejects empty and oversized recordings", () => {
    expect(validateAudioFile({ name: "a.amr", size: 0, type: "" })).toBe("This file is empty.");
    expect(validateAudioFile({ name: "a.mp3", size: MAX_AUDIO_BYTES + 1, type: "audio/mpeg" })).toMatch(
      /larger than 24 MB/,
    );
  });
});

// Uploading is now open to any audio format, but the speech service decodes only a
// few containers — so a refusal has to read as advice, not as a raw API string.
describe("Transcription service errors", () => {
  it("explains a format the speech service cannot decode", () => {
    expect(friendlyTranscriptionError("Unsupported file format amr")).toBe(
      '"AMR" recordings can\'t be transcribed yet. Convert the file to MP3, M4A, WAV, OGG, WEBM or FLAC and try again.',
    );
  });

  it("passes other service errors through unchanged", () => {
    expect(friendlyTranscriptionError("Rate limit exceeded")).toBe("Rate limit exceeded");
  });
});
