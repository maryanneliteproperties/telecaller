import { pcmToWav } from "./pcm-wav";

interface Decoder {
  FS: { writeFile: (name: string, bytes: Uint8Array) => void; readFile: (name: string) => Uint8Array };
  exec: (...args: string[]) => number;
  reset: () => void;
}

// Runs only in a browser worker. No audio leaves the device for conversion.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ bytes: ArrayBuffer; name: string }>) => void) | null;
  postMessage: (data: { bytes?: ArrayBuffer; error?: string }, transfer?: Transferable[]) => void;
  location: Location;
};
scope.onmessage = async ({ data }) => {
  try {
    const header = new TextDecoder().decode(data.bytes.slice(0, 9));
    if (header.startsWith("#!AMR")) {
      const { default: decode } = await import("@audio/decode-amr");
      const { channelData, sampleRate } = await decode(data.bytes);
      const samples = channelData[0];
      if (!samples?.length || !sampleRate) throw new Error("Empty AMR");
      const bytes = pcmToWav(samples, sampleRate);
      scope.postMessage({ bytes }, [bytes]);
      return;
    }
    const base = new URL("/audio-decoder/", scope.location.origin);
    const response = await fetch(new URL("ffmpeg-core.bin", base));
    if (!response.ok || !response.body) throw new Error("Decoder unavailable");
    const wasmBinary = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const moduleUrl = new URL("ffmpeg-core.js", base).href;
    const { default: createCore } = await import(/* @vite-ignore */ moduleUrl);
    const decoder: Decoder = await createCore({ wasmBinary });
    const ext = data.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "audio";
    const input = `input.${ext}`;
    decoder.FS.writeFile(input, new Uint8Array(data.bytes));
    const code = decoder.exec("-v", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "output.wav");
    if (code !== 0) throw new Error("Decode failed");
    const output = decoder.FS.readFile("output.wav");
    const bytes = new Uint8Array(output).buffer;
    scope.postMessage({ bytes }, [bytes]);
  } catch (error) {
    console.error("Audio decoder failed", error);
    scope.postMessage({ error: `${data.name}: இந்தப் பதிவைத் திறக்க முடியல. கோப்பு சேதமாகியிருக்கலாம் அல்லது இதன் ஒலி வகையை இன்னும் படிக்க முடியல.` });
  }
};