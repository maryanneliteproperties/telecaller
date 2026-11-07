import { createFileRoute } from "@tanstack/react-router";
import { CustomerSubmission } from "@/components/customer-submission";

export const Route = createFileRoute("/_authenticated/new_leads")({
  head: () => ({ meta: [{ title: "New Lead · Mary Ann Elite Properties CRM" }] }),
  component: CustomerSubmission,
});
