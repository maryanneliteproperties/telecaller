import { useEffect, useRef, useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertAudioForPlayback, requiresAudioConversion } from "@/lib/audio-playback";

export function CallAudioPlayer({ src, name = "call", className = "w-full" }: { src: string; name?: string; className?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const converting = useRef(false);
  const [playable, setPlayable] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    generation.current += 1;
    setPlayable(undefined); setBusy(false); setError(""); converting.current = false;
    return () => {
      generation.current += 1;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [src]);

  async function prepare(forceConversion = false) {
    if (converting.current) return;
    const element = audio.current;
    if (!element) return;
    const current = generation.current;
    setError("");
    if (!forceConversion && !requiresAudioConversion(name, type => element.canPlayType(type))) {
      setPlayable(src);
      return;
    }
    converting.current = true; setBusy(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("Audio கிடைக்கல. பக்கத்தை refresh பண்ணி மீண்டும் முயற்சி பண்ணுங்க.");
      const blob = await convertAudioForPlayback(await response.arrayBuffer(), name);
      if (generation.current !== current) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setPlayable(objectUrl.current);
    } catch (e) {
      if (generation.current === current) setError(e instanceof Error ? e.message : "Audio தயாராகல.");
    } finally {
      if (generation.current === current) { converting.current = false; setBusy(false); }
    }
  }

  return <div className={className}>
    {(!playable || busy || error) && <Button variant="outline" size="sm" disabled={busy} aria-label={`Play audio ${name}`} onClick={() => void prepare(Boolean(error))}>
      {busy ? <Loader2 className="animate-spin" /> : error ? <RotateCcw /> : <Play />}
      {busy ? "Audio தயாராகுது…" : error ? "மீண்டும் முயற்சி" : "Play audio"}
    </Button>}
    <audio ref={audio} controls preload="none" src={playable} className={playable && !busy ? "mt-1 w-full" : "hidden"}
      onCanPlay={() => { void audio.current?.play().catch(() => { /* Mobile browsers may require tapping the native play control. */ }); }}
      onError={() => {
        if (playable === src) void prepare(true);
        else if (playable) setError("Audio play ஆகல. மீண்டும் முயற்சி பண்ணுங்க.");
      }} />
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}