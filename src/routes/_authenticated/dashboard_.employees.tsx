import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getEmployeeDashboardStats, getWorkspaceIdentity } from "@/lib/workspace.functions";
import { Users, UserRound, Target } from "lucide-react";

const statsOptions = queryOptions({
  queryKey: ["workspace", "employee-dashboard-stats"],
  queryFn: () => getEmployeeDashboardStats(),
});

export const Route = createFileRoute("/_authenticated/dashboard_/employees")({
  beforeLoad: async () => {
    const identity = await getWorkspaceIdentity();
    if (identity?.role !== "admin") throw redirect({ to: "/dashboard/organization" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(statsOptions),
  head: () => ({ meta: [{ title: "Employees Dashboard · Mary Ann Elite Properties" }] }),
  component: EmployeesDashboardPage,
});

function EmployeesDashboardPage() {
  const { data } = useSuspenseQuery(statsOptions);
  const cards = [
    { label: "Total Employees", value: data.totalEmployees.toLocaleString("en-IN"), note: "Registered employee accounts", icon: Users, gradient: "from-violet-600 to-indigo-500", glow: "shadow-violet-500/20" },
    { label: "Total Leads", value: data.totalLeads.toLocaleString("en-IN"), note: "All leads across the organization", icon: UserRound, gradient: "from-blue-600 to-cyan-500", glow: "shadow-blue-500/20" },
    { label: "Overall Score", value: data.overallScore === null ? "—" : data.overallScore.toLocaleString("en-IN", { maximumFractionDigits: 1 }), note: "Average AI call score", icon: Target, gradient: "from-emerald-600 to-teal-500", glow: "shadow-emerald-500/20" },
  ];

  return (
    <main className="min-w-0 w-full overflow-x-clip bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Employees Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Organization-wide employee, lead and call performance overview.</p>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Employee dashboard metrics">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${card.gradient} p-5 text-white shadow-xl ${card.glow} transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
                <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" />
                <div className="absolute -bottom-12 right-12 h-28 w-28 rounded-full bg-white/10 blur-xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white/85">{card.label}</p>
                    <p className="mt-3 text-4xl font-extrabold tracking-tight drop-shadow-sm">{card.value}</p>
                    <p className="mt-2 text-xs text-white/75">{card.note}</p>
                  </div>
                  <span className="rounded-xl border border-white/20 bg-white/15 p-3 shadow-inner backdrop-blur-sm"><Icon className="h-6 w-6" /></span>
                </div>
                <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full w-2/3 rounded-full bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.6)]" /></div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
