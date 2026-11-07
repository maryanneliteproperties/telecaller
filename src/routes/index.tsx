import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWorkspaceIdentity } from "@/lib/workspace.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const identity = await getWorkspaceIdentity();
    if (!identity) throw redirect({ to: "/auth" });
    throw redirect({ to: "/dashboard" });
  },
});
