import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWorkspaceIdentity } from "@/lib/workspace.functions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CustomerSubmission } from "@/components/customer-submission";
import { getDestinationClient } from "@/lib/destination-client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => { await getDestinationClient(); const identity = await getWorkspaceIdentity(); if (!identity) throw redirect({ to: "/auth" }); return { identity }; },
  head: () => ({ meta: [{ title: "Home · AI Call Workspace" }, { name: "description", content: "Submit customer details and recorded calls to your private call workspace." }, { property: "og:title", content: "Home · AI Call Workspace" }, { property: "og:description", content: "Customer call submissions and audio storage." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: HomePage,
});
function HomePage() { const { identity } = Route.useRouteContext(); return <WorkspaceShell identity={identity}><CustomerSubmission /></WorkspaceShell>; }