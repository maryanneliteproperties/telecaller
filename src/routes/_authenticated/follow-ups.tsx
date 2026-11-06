import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { listLeads, listAvailableProjects, listWorkspaceFilterEmployees, updateLeadFollowUp } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceRecordFilters } from "@/components/workspace-record-filters";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });
const employeeOptions = queryOptions({ queryKey: ["workspace", "filter-employees"], queryFn: () => listWorkspaceFilterEmployees() });

export const Route = createFileRoute("/_authenticated/follow-ups")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(leadsOptions),
      context.queryClient.ensureQueryData(projectsOptions),
      context.queryClient.ensureQueryData(employeeOptions),
    ]);
  },
  head: () => ({ meta: [{ title: "Follow Ups · Mary Ann Elite Properties" }] }),
  component: FollowUpsPage,
});

function FollowUpsPage() {
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const { data: projects } = useSuspenseQuery(projectsOptions);
  const { data: employees } = useSuspenseQuery(employeeOptions);
  const update = useServerFn(updateLeadFollowUp);
  const client = useQueryClient();

  const [kind, setKind] = useState<"site_visit" | "conversion">("site_visit");
  const [filteredRows, setFilteredRows] = useState<typeof leads | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [activeInputStatus, setActiveInputStatus] = useState<Record<string, string>>({});
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const getFilterDate = useCallback((row: typeof leads[number]) => kind === "site_visit" ? (row.follow_up_status === "Rescheduled" ? row.follow_up_rescheduled_date || row.follow_up_date : row.follow_up_date) : (row.conversion_follow_up_status === "Rescheduled" ? row.conversion_follow_up_rescheduled_date || row.conversion_follow_up_date : row.conversion_follow_up_date), [kind]);
  const rows = useMemo(
    () => [...leads]
      .filter(row => kind === "site_visit" ? Boolean(row.follow_up_date) : row.site_visit_status === "Completed")
      .sort((a, b) => {
        const aDate = kind === "site_visit" ? a.follow_up_date : a.conversion_follow_up_date;
        const bDate = kind === "site_visit" ? b.follow_up_date : b.conversion_follow_up_date;
        return (aDate ?? "9999-12-31").localeCompare(bDate ?? "9999-12-31");
      }),
    [leads, kind],
  );

  const visibleRows = filteredRows ?? rows;

  async function save(id: string, date: string | null, status: string) {
    setSaving(id);
    try {
      const result = await update({
        data: {
          id,
          followUpType: kind,
          followUpDate: date,
          followUpStatus: status as "Pending" | "Completed" | "Rescheduled" | "Not Interested",
          rescheduledDate: status === "Rescheduled" ? rescheduleDates[id] || null : null,
          notInterestedReason: status === "Not Interested" ? reasons[id] || null : null,
        },
      });
      if (!result?.ok) throw new Error("Database update confirm ஆகவில்லை.");
      await client.invalidateQueries({ queryKey: ["workspace", "leads"] });
      await client.refetchQueries({ queryKey: ["workspace", "leads"], type: "active" });
      setStatuses(current => { const next = { ...current }; delete next[id]; return next; });
      setDates(current => { const next = { ...current }; delete next[id]; return next; });
      setActiveInputStatus(current => { const next = { ...current }; delete next[id]; return next; });
      setRescheduleDates(current => { const next = { ...current }; delete next[id]; return next; });
      setReasons(current => { const next = { ...current }; delete next[id]; return next; });
      toast.success("Follow-up saved successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Follow-up save ஆகவில்லை.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Follow Ups</h1>
            <p className="mt-1 text-sm text-muted-foreground">எந்த Telecaller, எந்த Customer-க்கு, எந்த Project தொடர்பாக follow-up செய்கிறார் என்பதை track செய்யுங்கள்.</p>
          </div>
          <Button asChild variant="outline"><Link to="/leads">View Leads</Link></Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={kind === "site_visit" ? "default" : "outline"} onClick={() => setKind("site_visit")}>1st Follow-up · Site Visit Schedule</Button>
          <Button variant={kind === "conversion" ? "default" : "outline"} onClick={() => setKind("conversion")}>2nd Follow-up · Booking Conversion</Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {kind === "site_visit"
            ? "Home form-ல் கொடுத்த Follow-up Date அடிப்படையில் customer-ஐ தொடர்பு கொண்டு Site Visit arrange / confirm செய்யுங்கள்."
            : "Site Visit Completed ஆன customer-க்கு மட்டும் Booking Conversion follow-up செய்யுங்கள்."}
        </p>

        <WorkspaceRecordFilters rows={rows} projects={projects} employeeNames={employees} getDate={getFilterDate} onChange={setFilteredRows} />

        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{["Next Follow-up Date", "Customer", "Phone", "Project", "Follow-up Type", "Telecaller", "Status", "Action"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map(row => {
                const originalDate = kind === "site_visit" ? row.follow_up_date : row.conversion_follow_up_date;
                const status = kind === "site_visit" ? row.follow_up_status : row.conversion_follow_up_status;
                const rescheduledDate = kind === "site_visit" ? row.follow_up_rescheduled_date : row.conversion_follow_up_rescheduled_date;
                const reason = kind === "site_visit" ? row.follow_up_not_interested_reason : row.conversion_follow_up_not_interested_reason;
                const selectedStatus = statuses[row.id] ?? status ?? "Pending";
                const activeDate = selectedStatus === "Rescheduled" ? (rescheduleDates[row.id] ?? rescheduledDate ?? originalDate) : (dates[row.id] ?? originalDate);

                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3">
                      {kind === "conversion" ? (
                        <Input
                          aria-label="Next booking follow-up date"
                          type="date"
                          className="w-40"
                          value={dates[row.id] ?? originalDate ?? ""}
                          onChange={event => setDates(current => ({ ...current, [row.id]: event.target.value }))}
                        />
                      ) : (
                        <div>{activeDate ?? "—"}</div>
                      )}
                      {selectedStatus === "Rescheduled" && originalDate && activeDate !== originalDate && (
                        <p className="mt-1 text-xs text-muted-foreground"><strong className="font-semibold text-foreground">Original:</strong> {originalDate}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{row.customer_name ?? "—"}</td>
                    <td className="px-4 py-3">{row.customer_phone ?? "—"}</td>
                    <td className="px-4 py-3">{projectNames.get(row.project_id ?? "") ?? "—"}</td>
                    <td className="px-4 py-3">{kind === "site_visit" ? "Site Visit Scheduling" : "Post-Visit Booking"}</td>
                    <td className="px-4 py-3">{row.telecaller_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label="Follow-up status"
                        className="h-9 rounded-md border bg-background px-2"
                        value={selectedStatus}
                        onChange={event => {
                          setStatuses(current => ({ ...current, [row.id]: event.target.value }));
                          setActiveInputStatus(current => {
                            const next = { ...current };
                            if (event.target.value === "Rescheduled" || event.target.value === "Not Interested") next[row.id] = event.target.value;
                            else delete next[row.id];
                            return next;
                          });
                        }}
                      >
                        {["Pending", "Completed", "Rescheduled", "Not Interested"].map(value => <option key={value}>{value}</option>)}
                      </select>
                      {selectedStatus === "Not Interested" && reason && (
                        <p className="mt-1 max-w-56 whitespace-normal text-xs text-muted-foreground"><strong className="font-semibold text-foreground">Reason:</strong> {reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {selectedStatus === "Rescheduled" && activeInputStatus[row.id] === "Rescheduled" && kind !== "conversion" && (
                        <Input
                          aria-label="New follow-up date"
                          type="date"
                          className="mb-2 w-40"
                          value={rescheduleDates[row.id] ?? rescheduledDate ?? ""}
                          onChange={event => setRescheduleDates(current => ({ ...current, [row.id]: event.target.value }))}
                        />
                      )}
                      {selectedStatus === "Not Interested" && activeInputStatus[row.id] === "Not Interested" && (
                        <Input
                          aria-label="Not interested reason"
                          placeholder="Reason (required)"
                          className="mb-2 w-48"
                          value={reasons[row.id] ?? reason ?? ""}
                          onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))}
                        />
                      )}
                      <Button
                        size="sm"
                        disabled={saving === row.id || (kind === "conversion" && !(dates[row.id] ?? originalDate)) || (selectedStatus === "Rescheduled" && !(rescheduleDates[row.id] ?? rescheduledDate)) || (selectedStatus === "Not Interested" && !(reasons[row.id] ?? reason)?.trim())}
                        onClick={() => void save(row.id, dates[row.id] ?? originalDate ?? null, selectedStatus)}
                      >
                        {saving === row.id ? "Saving..." : "Save"}
                      </Button>

                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">இந்த வகையில் follow-up செய்ய வேண்டிய leads இல்லை.</p>}
        </div>
      </div>
    </main>
  );
}
