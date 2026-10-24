import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listLeads } from "@/lib/workspace.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Plus } from "lucide-react";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
export const Route = createFileRoute("/_authenticated/leads")({
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsOptions),
  head: () => ({ meta: [{ title: "Leads · AI Call Workspace" }, { name: "description", content: "Customer details, recorded call audio and report status." }, { property: "og:title", content: "Leads · AI Call Workspace" }, { property: "og:description", content: "Your saved customer calls and follow-up reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeadsPage,
});
function LeadsPage() {
  const { data } = useSuspenseQuery(leadsOptions), [search, setSearch] = useState("");
  const rows = data.filter(row => `${row.customer_name ?? ""} ${row.customer_phone ?? ""} ${row.audio_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="px-4 py-10 sm:px-10"><div className="flex items-center justify-between gap-4"><h1 className="font-display text-3xl">Leads</h1><Button asChild><Link to="/"><Plus />New Lead</Link></Button></div><Input aria-label="Search leads" placeholder="Search customer name or phone" className="my-7 max-w-sm" value={search} onChange={e => setSearch(e.target.value)} />
    {rows.length === 0 && <p className="border-y py-10 text-muted-foreground">{search ? "No matching leads." : "இன்னும் lead சமர்ப்பிக்கப்படல."}</p>}
    <div className="divide-y">{rows.map(row => <article key={row.id} className="grid gap-4 py-6 lg:grid-cols-[1fr_1fr_auto]"><div className="min-w-0"><Link to="/leads/$id" params={{ id: row.id }} className="font-medium text-primary">{row.customer_name ?? "Customer தகவல் இல்லை"}</Link><p className="mt-1 text-sm">{row.customer_phone ?? "Phone தகவல் இல்லை"}</p><p className="mt-2 text-xs text-muted-foreground">{row.telecaller_name ?? "—"} · {new Date(row.created_at).toLocaleString()}</p></div><div className="min-w-0"><p className="mb-2 truncate text-sm text-muted-foreground">{row.audio_name ?? "Audio இல்லை"}</p>{row.audioUrl && <audio controls preload="none" src={row.audioUrl} className="w-full min-w-0" />}</div><div className="flex items-center gap-4 text-sm"><span>{row.overall_score === null ? "AI Pending" : `${row.overall_score}/100`}</span><Button asChild variant="outline" size="icon" title="Open lead"><Link to="/leads/$id" params={{ id: row.id }} aria-label="Open lead"><ArrowUpRight /></Link></Button></div></article>)}</div>
  </main>;
}