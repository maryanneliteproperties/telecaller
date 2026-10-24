import { CallAudioPlayer } from "@/components/call-audio-player";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getLead } from "@/lib/workspace.functions";
import { CallTranscription } from "@/components/call-transcription";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const leadOptions = (id: string) => queryOptions({ queryKey: ["workspace", "lead", id], queryFn: () => getLead({ data: { id } }) });
export const Route = createFileRoute("/_authenticated/leads_/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(leadOptions(params.id)),
  head: () => ({ meta: [{ title: "Customer Call · AI Call Workspace" }, { name: "description", content: "Private customer call details and conversation analysis." }, { property: "og:title", content: "Customer Call · AI Call Workspace" }, { property: "og:description", content: "Saved audio and Tamil call analysis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: LeadPage,
});
function LeadPage() { const { id } = Route.useParams(), { data } = useSuspenseQuery(leadOptions(id)); return <><main className="mx-auto max-w-4xl px-4 py-8 sm:px-10"><Button asChild variant="ghost"><Link to="/leads"><ArrowLeft />Leads</Link></Button><h1 className="mt-6 font-display text-3xl">{data.customer_name ?? "Customer Call"}</h1><p className="mt-2 text-muted-foreground">{data.customer_phone ?? "Phone தகவல் இல்லை"} · {data.telecaller_name ?? "—"}</p><p className="my-4 text-sm">{data.audio_name}</p>{data.audioUrl && <CallAudioPlayer src={data.audioUrl} name={data.audio_name ?? "call"} />}</main><CallTranscription leadId={id} savedAudioName={data.audio_name ?? "call"} autoStart={data.processing_status !== "analysed" && data.overall_score === null} /></>; }