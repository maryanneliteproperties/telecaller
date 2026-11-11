import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getEmployeeDashboardStats, getWorkspaceIdentity } from "@/lib/workspace.functions";
import { Users, UserRound, Target, CalendarDays, CalendarClock, BarChart3 } from "lucide-react";

const statsOptions = queryOptions({
  queryKey: ["workspace", "employee-dashboard-stats"],
  queryFn: () => getEmployeeDashboardStats(),
});

type ScorePeriod = "today" | "tomorrow" | "month";
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  const [period, setPeriod] = useState<ScorePeriod>("today");
  const today = dateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const month = today.slice(0, 7);
  const periodRows = useMemo(() => data.scoreRows.filter(row => {
    const day = dateKey(new Date(row.createdAt));
    if (period === "today") return day === today;
    if (period === "tomorrow") return day === tomorrow;
    return day.slice(0, 7) === month;
  }), [data.scoreRows, period, today, tomorrow, month]);
  const employeeMetrics = useMemo(() => data.employees.map(employee => {
    const rows = periodRows.filter(row => row.telecallerName.trim().toLowerCase() === employee.username.trim().toLowerCase());
    const average = rows.length ? Math.round((rows.reduce((sum, row) => sum + row.score, 0) / rows.length) * 10) / 10 : null;
    return { ...employee, calls: rows.length, average };
  }), [data.employees, periodRows]);
  const overallScore = periodRows.length
    ? Math.round((periodRows.reduce((sum, row) => sum + row.score, 0) / periodRows.length) * 10) / 10
    : null;
  const cards = [
    { label: "Total Employees", value: data.totalEmployees.toLocaleString("en-IN"), note: "Registered employee accounts", icon: Users, gradient: "from-violet-600 to-indigo-500", glow: "shadow-violet-500/20" },
    { label: "Total Leads", value: data.totalLeads.toLocaleString("en-IN"), note: "All leads across the organization", icon: UserRound, gradient: "from-blue-600 to-cyan-500", glow: "shadow-blue-500/20" },
    { label: "Overall Score", value: overallScore === null ? "—" : overallScore.toLocaleString("en-IN", { maximumFractionDigits: 1 }), note: period === "today" ? "Today's average AI call score" : period === "tomorrow" ? "Tomorrow's average AI call score" : "This month's average AI call score", icon: Target, gradient: "from-emerald-600 to-teal-500", glow: "shadow-emerald-500/20" },
  ];

  return (
    <main className="min-w-0 w-full overflow-x-clip bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Employees Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Employee-wise AI call score and performance overview.</p>
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
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">Individual Employee Scores</h2><p className="mt-1 text-xs text-slate-500">Each employee's average AI call score for the selected period.</p></div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Score date filter">
              {([
                { value: "today", label: "Today", icon: CalendarDays },
                { value: "tomorrow", label: "Tomorrow", icon: CalendarClock },
                { value: "month", label: "This Month", icon: BarChart3 },
              ] as const).map(option => {
                const Icon = option.icon;
                return <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${period === option.value ? "border-indigo-700 bg-indigo-700 text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-500 hover:bg-indigo-50"}`}><Icon className="h-4 w-4" />{option.label}</button>;
              })}
            </div>
          </div>
          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3 text-center">Analyzed Calls</th><th className="px-4 py-3 text-right">Average Score</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {employeeMetrics.map(employee => <tr key={employee.id} className="hover:bg-slate-50/80"><td className="px-4 py-3 font-semibold text-slate-800">{employee.username}</td><td className="px-4 py-3 text-center tabular-nums text-slate-600">{employee.calls.toLocaleString("en-IN")}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{employee.average === null ? "—" : `${employee.average}/100`}</td></tr>)}
                {employeeMetrics.length === 0 && <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-500">Employee records இல்லை.</td></tr>}
              </tbody>
            </table>
          </div>
          {periodRows.length === 0 && <p className="text-center text-sm text-slate-500">{period === "tomorrow" ? "Tomorrow-க்கான analyzed calls இன்னும் இல்லை." : period === "today" ? "Today analyzed calls இல்லை." : "இந்த மாதத்தில் analyzed calls இல்லை."}</p>}
        </section>
      </div>
    </main>
  );
}
