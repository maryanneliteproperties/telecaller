import { createFileRoute, redirect } from "@tanstack/react-router";
import { getWorkspaceIdentity } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const identity = await getWorkspaceIdentity();
    if (!identity) throw redirect({ to: "/auth" });
    throw redirect({ to: identity.role === "admin" ? "/dashboard/organization" : "/new_leads" });
  },
});
