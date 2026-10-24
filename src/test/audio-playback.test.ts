import { describe, expect, it } from "vitest";
import { requiresAudioConversion } from "../lib/audio-playback";

describe("browser-compatible call playback", () => {
  const browser = (type: string) => ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"].includes(type) ? "probably" : "";
  it("converts AMR recordings when the browser lacks the codec", () => {
    expect(requiresAudioConversion("phone.AMR", browser)).toBe(true);
  });
  it("converts AMR-WB recordings when the browser lacks the codec", () => {
    expect(requiresAudioConversion("phone.awb", browser)).toBe(true);
  });
  it("uses native MP3 playback when supported", () => {
    expect(requiresAudioConversion("call.mp3", browser)).toBe(false);
  });
  it("uses the decoder for unfamiliar audio formats instead of rejecting them", () => {
    expect(requiresAudioConversion("call.customaudio", browser)).toBe(true);
  });
});