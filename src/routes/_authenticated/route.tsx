import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getWorkspaceIdentity } from "@/lib/workspace.functions";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getDestinationClient } from "@/lib/destination-client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    await getDestinationClient();
    const identity = await getWorkspaceIdentity();
    if (!identity) throw redirect({ to: "/auth" });
    return { identity };
  },
  component: WorkspaceLayout,
});

function WorkspaceLayout() { const { identity } = Route.useRouteContext(); return <WorkspaceShell identity={identity}><Outlet /></WorkspaceShell>; }
