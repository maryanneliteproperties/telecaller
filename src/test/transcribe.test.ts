import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribe, TRANSCRIPTION_MODEL, GEMINI_MAX_FILE_BYTES } from "@/lib/transcribe.server";
import { transcriptionAudioType } from "@/lib/audio-limits";

afterEach(() => vi.unstubAllGlobals());

describe("Gemini transcription", () => {
  it("uses Gemini with streaming and automatic language detection, without OpenAI-only hints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(""));
    vi.stubGlobal("fetch", fetchMock);
    await transcribe({ baseURL: "https://ai.gateway.lovable.dev", apiKey: "test-key", model: TRANSCRIPTION_MODEL, maxFileBytes: GEMINI_MAX_FILE_BYTES, audioOnly: true }, new File(["speech"], "call.amr", { type: "audio/amr" }));
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("Gemini request was not sent");
    expect(call[0]).toBe("https://ai.gateway.lovable.dev/v1/audio/transcriptions");
    const body = call[1].body as FormData;
    expect(body.get("model")).toBe("google/gemini-3.5-transcribe");
    expect(body.get("stream")).toBe("true");
    expect(body.get("language")).toBeNull();
    expect(body.get("languages")).toBeNull();
    expect(body.get("prompt")).toBeNull();
  });

  it("preserves AMR and relabels phone and recorder containers as audio", () => {
    expect(transcriptionAudioType({ name: "call.amr", type: "" })).toBe("audio/amr");
    expect(transcriptionAudioType({ name: "call.3gp", type: "video/3gpp" })).toBe("audio/3gpp");
    expect(transcriptionAudioType({ name: "call.webm", type: "video/webm" })).toBe("audio/webm");
  });
});