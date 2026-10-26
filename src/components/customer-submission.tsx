import { useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Upload, FileAudio, X, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { customerSchema } from "@/lib/workspace-schema";
import { ACCEPT_ATTR, formatBytes, validateAudioFile, MAX_AUDIO_BYTES } from "@/lib/audio-limits";
import { convertAudioForPlayback } from "@/lib/audio-playback";
import { submitLead } from "@/lib/workspace.functions";

export function CustomerSubmission() {
  const save = useServerFn(submitLead), router = useRouter(), navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null), busyRef = useRef(false), key = useRef<string | null>(null);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [savedId, setSavedId] = useState(""), [busyStatus, setBusyStatus] = useState("");
  function pick(file?: File) { if (!file) return; const error = validateAudioFile(file); setError(error ?? ""); setFile(error ? null : file); }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busyRef.current) return; setError("");
    key.current ??= crypto.randomUUID();
    const parsed = customerSchema.safeParse({ customerName: name, customerPhone: phone, submissionKey: key.current });
    if (!parsed.success || !file) { setError("Customer பெயர், சரியான phone number மற்றும் audio சேர்க்கவும்."); return; }
    busyRef.current = true; setBusy(true); setBusyStatus("Customer விவரங்களைச் சேமிக்கத் தயாராகிறது…");
    try {
      let uploadFile = file;
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const geminiFriendly = new Set(["mp3", "mp2", "mpga", "mpeg", "m4a", "mp4", "wav", "wave", "webm", "ogg", "oga", "opus", "flac", "aiff", "aif", "aac"]);
      // AMR/AWB are converted on the server. Convert other unsupported formats locally
      // so they can be transcribed even when the provider rejects their original container.
      if (!geminiFriendly.has(extension) && extension !== "amr" && extension !== "awb") {
        setBusyStatus("இந்த audio format-ஐ WAV-ஆக மாற்றுகிறேன்…");
        const wavBlob = await convertAudioForPlayback(await file.arrayBuffer(), file.name);
        if (wavBlob.size > MAX_AUDIO_BYTES) throw new Error("Convert செய்த audio 14 MB-ஐ விட அதிகமாக உள்ளது. குறுகிய recording அல்லது compressed audio பயன்படுத்தவும்.");
        uploadFile = new File([wavBlob], `${file.name.replace(/\\.[^.]+$/, "") || "recording"}.wav`, { type: "audio/wav" });
      }
      setBusyStatus("Audio மற்றும் customer விவரங்களைச் சேமிக்கிறேன்…");
      const form = new FormData(); form.set("customerName", parsed.data.customerName); form.set("customerPhone", parsed.data.customerPhone); form.set("submissionKey", parsed.data.submissionKey); form.set("file", uploadFile);
      const result = await save({ data: form }); setSavedId(result.id); await router.invalidate(); await navigate({ to: "/leads/$id", params: { id: result.id } });
    } catch (e) { setError(e instanceof Error ? e.message : "சேமிக்க முடியல. மீண்டும் முயற்சி பண்ணுங்க."); }
    finally { busyRef.current = false; setBusy(false); setBusyStatus(""); }
  }
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-10"><p className="text-xs font-semibold uppercase text-primary">Home / New lead</p><h1 className="mt-2 font-display text-3xl">Submit a customer call</h1><div className="panel mt-8 p-6 sm:p-10">
    {savedId ? <section className="mt-10 space-y-5 border-y py-8"><CheckCircle2 className="h-10 w-10 text-primary" /><h2 className="text-xl font-semibold">Submitted Successfully!</h2><p className="text-muted-foreground">{name} · {phone} · {file?.name}</p><div className="flex flex-wrap gap-3"><Button onClick={() => { setSavedId(""); setName(""); setPhone(""); setFile(null); key.current = null; }}>Add Another Lead</Button><Button asChild variant="outline"><Link to="/leads/$id" params={{ id: savedId }}>View Lead <ArrowRight /></Link></Button></div></section> :
      <form onSubmit={submit} className="mt-8 space-y-6" aria-label="Customer submission">
        <div className="grid gap-6 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="customer-name">Customer Name</Label><Input id="customer-name" maxLength={100} required value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder="Customer name" /></div><div className="space-y-2"><Label htmlFor="customer-phone">Phone Number</Label><Input id="customer-phone" type="tel" maxLength={20} required value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} placeholder="Phone number" /></div></div>
        <div className="space-y-2"><Label>Audio Upload</Label><div className="dropzone bg-card" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) pick(e.dataTransfer.files[0]); }}><Upload className="h-8 w-8 text-primary" /><Button variant="outline" type="button" className="mt-4" disabled={busy} onClick={() => input.current?.click()}>Select Audio File</Button><p className="mt-3 text-xs text-muted-foreground">MP3, M4A, WAV, OGG, WEBM, FLAC, AMR மற்றும் பல formats · max 14 MB</p><input ref={input} aria-label="Audio file" type="file" accept={ACCEPT_ATTR} className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} /></div></div>
        {file && <div className="flex items-center gap-3 border-b pb-4"><FileAudio className="shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remove audio" disabled={busy} onClick={() => setFile(null)}><X /></Button></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">{busyStatus}</p>}
        <Button type="submit" size="lg" disabled={busy || !file}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} {busy ? "Submitting…" : "Submit"}</Button>
      </form>}
  </div></main>;
}