import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { PhoneCall, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const callInput = z.object({
  agentPhone: z.string().trim().min(7).max(20),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().trim().min(7).max(20),
});

function normalizePhone(value: string, label: string) {
  const phone = value.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{10,15}$/.test(phone)) throw new Error(label + " சரியான phone number கொடுக்கவும்.");
  if (/^[6-9][0-9]{9}$/.test(phone)) return "+91" + phone;
  if (/^0[6-9][0-9]{9}$/.test(phone)) return "+91" + phone.slice(1);
  if (phone.startsWith("+")) return phone;
  throw new Error(label + " country code உடன் கொடுக்கவும். உதா: +919876543210");
}

const startCloudCall = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => callInput.parse(value))
  .handler(async ({ data }) => {
    const { requireWorkspace } = await import("@/lib/workspace.server");
    await requireWorkspace();

    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const callerId = process.env.EXOTEL_CALLER_ID;
    if (!apiKey || !apiToken || !accountSid || !callerId) {
      throw new Error("Exotel setup முழுமையில்லை. Vercel Environment Variables சரிபார்க்கவும்.");
    }

    const from = normalizePhone(data.agentPhone, "Agent");
    const to = normalizePhone(data.customerPhone, "Customer");
    const host = "api.exotel.com"; // my.exotel.com accounts use the Singapore API cluster.
    const endpoint = `https://${host}/v1/Accounts/${encodeURIComponent(accountSid)}/Calls/connect.json`;
    const body = new URLSearchParams({ From: from, To: to, CallerId: callerId, CallType: "trans" });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${apiKey}:${apiToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    const raw = await response.text();
    if (!response.ok) {
      // Exotel error bodies can be JSON or XML. Extract only the provider's
      // message, then redact credentials and phone/account identifiers before
      // logging or returning it to the browser.
      let providerMessage = "";
      try {
        const parsed = JSON.parse(raw) as {
          RestException?: { Message?: string; message?: string };
          Message?: string;
          message?: string;
          error_description?: string;
          error?: string;
        };
        providerMessage = parsed.RestException?.Message
          ?? parsed.RestException?.message
          ?? parsed.Message
          ?? parsed.message
          ?? parsed.error_description
          ?? parsed.error
          ?? "";
      } catch {
        providerMessage = raw.match(/<(?:Message|message)>([\s\S]*?)<\/(?:Message|message)>/i)?.[1] ?? raw;
      }
      const sensitiveValues = [apiKey, apiToken, accountSid, callerId, from, to]
        .filter((value): value is string => Boolean(value));
      let safeMessage = providerMessage
        .replace(/<[^>]*>/g, " ")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      for (const value of sensitiveValues) {
        safeMessage = safeMessage.split(value).join("[REDACTED]");
      }
      safeMessage = safeMessage.replace(/\+?\d[\d .()\-]{7,}\d/g, "[REDACTED NUMBER]").slice(0, 240);
      if (!safeMessage) safeMessage = "Exotel response-ல் விவரமான error message கிடைக்கவில்லை.";
      console.error("[Exotel call] request failed", {
        status: response.status,
        providerMessage: safeMessage,
      });
      throw new Error(`Exotel API error (HTTP ${response.status}): ${safeMessage}`);
    }
    let callSid: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { Call?: { Sid?: string }; call?: { sid?: string } };
      callSid = parsed.Call?.Sid ?? parsed.call?.sid ?? null;
    } catch { /* Exotel may return XML when JSON is unavailable. */ }
    return { ok: true, callSid, customerName: data.customerName };
  });

export const Route = createFileRoute("/_authenticated/cloud-calling")({
  head: () => ({ meta: [{ title: "Cloud Calling · AI Call Workspace" }, { name: "description", content: "Start an Exotel click-to-call from the telecaller workspace." }] }),
  component: CloudCallingPage,
});

function CloudCallingPage() {
  const makeCall = useServerFn(startCloudCall);
  const [agentPhone, setAgentPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; sid: string | null } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSuccess(null);
    try {
      const result = await makeCall({ data: { agentPhone, customerName, customerPhone } });
      setSuccess({ name: result.customerName, sid: result.callSid });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call தொடங்க முடியவில்லை.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-10 sm:py-10">
    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Telecaller / Exotel</p>
    <h1 className="mt-2 font-display text-3xl">Cloud Calling</h1>
    <p className="mt-2 text-sm text-muted-foreground">Agent number-க்கு முதலில் call வரும். Agent எடுத்ததும் customer-க்கு call connect ஆகும்.</p>
    <section className="panel mt-8 p-5 sm:p-8">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="agent-phone">Telecaller / Agent Phone</Label><Input id="agent-phone" type="tel" required maxLength={20} value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="9876543210 அல்லது +919876543210" disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="customer-name">Customer Name</Label><Input id="customer-name" required maxLength={100} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer பெயர்" disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="customer-phone">Customer Phone</Label><Input id="customer-phone" type="tel" required maxLength={20} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="9876543210 அல்லது +919876543210" disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" />Call request Exotel-க்கு அனுப்பப்பட்டது.</p><p className="mt-1">{success.name} · Agent phone-க்கு முதலில் call வரும்.</p>{success.sid && <p className="mt-1 break-all text-xs text-muted-foreground">Call SID: {success.sid}</p>}</div>}
        <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">{busy ? <Loader2 className="animate-spin" /> : <PhoneCall />}{busy ? "Connecting…" : "Start Call"}</Button>
      </form>
    </section>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">Call செய்யும்போது Exotel credit/plan charges பொருந்தலாம். Caller ID-க்கு Exotel வழங்கிய ExoPhone பயன்படுத்தப்படும். API credentials browser-ல் காட்டப்படாது.</p>
  </main>;
}
