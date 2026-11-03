import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listLeads, listAvailableProjects } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { CalendarClock, CalendarDays, Clock3, Users, UserPlus, MapPin, ArrowUpRight, Phone, CheckCircle2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";

const leadsOptions = queryOptions({ queryKey: ["workspace", "leads"], queryFn: () => listLeads() });
const projectsOptions = queryOptions({ queryKey: ["workspace", "projects"], queryFn: () => listAvailableProjects() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(leadsOptions),
      context.queryClient.ensureQueryData(projectsOptions),
    ]);
  },
  head: () => ({ meta: [{ title: "Dashboard · Mary Ann Elite Properties" }] }),
  component: DashboardPage,
});

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const followupDate = (row: any, type: "site" | "booking") => type === "site"
  ? (row.follow_up_status === "Rescheduled" ? row.follow_up_rescheduled_date || row.follow_up_date : row.follow_up_date)
  : (row.conversion_follow_up_status === "Rescheduled" ? row.conversion_follow_up_rescheduled_date || row.conversion_follow_up_date : row.conversion_follow_up_date);

function DashboardPage() {
  const { data: leads } = useSuspenseQuery(leadsOptions);
  const { data: projects } = useSuspenseQuery(projectsOptions);
  const today = dateKey(new Date());
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);

  const metrics = useMemo(() => {
    const dueToday = leads.filter(row => [followupDate(row, "site"), followupDate(row, "booking")].includes(today));
    const upcoming = leads.filter(row => [followupDate(row, "site"), followupDate(row, "booking")].some(date => !!date && date > today));
    const tomorrowFollowups = leads.filter(row => [followupDate(row, "site"), followupDate(row, "booking")].includes(tomorrow));
    const newToday = leads.filter(row => row.created_at && dateKey(new Date(row.created_at)) === today);
    const visitsToday = leads.filter(row => row.site_visit_date === today && row.site_visit_status !== "Cancelled");
    const schedule = leads.flatMap(row => [
      ...(followupDate(row, "site") ? [{ id: row.id + "-site", leadId: row.id, date: followupDate(row, "site")!, customer: row.customer_name || "—", phone: row.customer_phone || "—", project: projectNames.get(row.project_id || "") || "—", telecaller: row.telecaller_name || "—", type: "Site Visit Follow-up", status: row.follow_up_status || "Pending" }] : []),
      ...(followupDate(row, "booking") ? [{ id: row.id + "-booking", leadId: row.id, date: followupDate(row, "booking")!, customer: row.customer_name || "—", phone: row.customer_phone || "—", project: projectNames.get(row.project_id || "") || "—", telecaller: row.telecaller_name || "—", type: "Booking Follow-up", status: row.conversion_follow_up_status || "Pending" }] : []),
    ]).filter(item => item.date >= today && item.status !== "Completed" && item.status !== "Not Interested").sort((a,b) => a.date.localeCompare(b.date)).slice(0, 10);
    const statusCounts = ["Pending", "Completed", "Rescheduled", "Not Interested"].map(status => ({
      name: status,
      value: leads.reduce((sum, row) => sum + Number(row.follow_up_status === status) + Number(row.conversion_follow_up_status === status), 0),
    })).filter(item => item.value > 0);
    const stageCounts = Object.entries(leads.reduce((acc: Record<string, number>, row) => {
      const stage = row.lead_stage || "Not Set"; acc[stage] = (acc[stage] || 0) + 1; return acc;
    }, {})).map(([name, value]) => ({ name, value }));
    return { dueToday, upcoming, tomorrowFollowups, newToday, visitsToday, schedule, statusCounts, stageCounts };
  }, [leads, projectNames, today, tomorrow]);

  const cards = [
    { label: "Total Leads", value: leads.length, note: "All leads in your workspace", icon: Users, gradient: "from-violet-600 to-indigo-500", glow: "shadow-violet-500/20" },
    { label: "Today's Follow-ups", value: metrics.dueToday.length, note: "Customers to contact today", icon: CalendarClock, gradient: "from-blue-600 to-cyan-500", glow: "shadow-blue-500/20" },
    { label: "Upcoming Follow-ups", value: metrics.upcoming.length, note: "Scheduled after today", icon: Clock3, gradient: "from-emerald-600 to-teal-500", glow: "shadow-emerald-500/20" },
    { label: "New Leads", value: metrics.newToday.length, note: "Added today", icon: UserPlus, gradient: "from-orange-500 to-amber-400", glow: "shadow-orange-500/20" },
    { label: "Today's Site Visit Schedule", value: metrics.visitsToday.length, note: "Visits planned for today", icon: MapPin, gradient: "from-pink-600 to-rose-500", glow: "shadow-pink-500/20" },
    { label: "Tomorrow Follow-ups", value: metrics.tomorrowFollowups.length, note: "Customers to contact tomorrow", icon: CalendarDays, gradient: "from-fuchsia-600 to-purple-500", glow: "shadow-fuchsia-500/20" },
  ];

  return (
    <main className="min-w-0 w-full overflow-x-clip bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-500">Your daily sales activity, follow-up pipeline and site visit overview.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="border-indigo-200 bg-white shadow-sm"><Link to="/follow-ups">View Follow-ups <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button asChild className="bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700"><Link to="/">+ New Lead</Link></Button>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Dashboard metrics">
          {cards.map((card) => {
            const Icon = card.icon;
            return <div key={card.label} className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br ${card.gradient} p-5 text-white shadow-xl ${card.glow} transition duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" />
              <div className="absolute -bottom-12 right-12 h-28 w-28 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-white/85">{card.label}</p><p className="mt-3 text-4xl font-extrabold tracking-tight drop-shadow-sm">{card.value.toLocaleString("en-IN")}</p><p className="mt-2 text-xs text-white/75">{card.note}</p></div>
                <span className="rounded-xl border border-white/20 bg-white/15 p-3 shadow-inner backdrop-blur-sm"><Icon className="h-6 w-6" /></span>
              </div>
              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full w-2/3 rounded-full bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.6)]" /></div>
            </div>;
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Lead Follow-ups Schedule</h2><p className="mt-1 text-xs text-slate-500">Next 10 pending follow-up appointments</p></div><CalendarDays className="h-5 w-5 text-indigo-500" /></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-400"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Project</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Telecaller</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{metrics.schedule.map(item=><tr key={item.id} className="transition hover:bg-indigo-50/50"><td className="whitespace-nowrap px-3 py-3 font-semibold text-indigo-700">{displayDate(item.date)}</td><td className="px-3 py-3"><div className="font-semibold text-slate-800">{item.customer}</div><div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Phone className="h-3 w-3" />{item.phone}</div></td><td className="px-3 py-3 text-slate-600">{item.project}</td><td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.type}</td><td className="px-3 py-3 text-slate-600">{item.telecaller}</td><td className="px-3 py-3"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{item.status}</span></td></tr>)}</tbody></table>{metrics.schedule.length===0&&<div className="py-12 text-center text-sm text-slate-400">No pending follow-ups scheduled.</div>}</div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)]"><div className="mb-2"><h2 className="text-lg font-bold text-slate-900">Follow-up Status</h2><p className="text-xs text-slate-500">Status split across both follow-up stages</p></div><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={metrics.statusCounts} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={55} outerRadius={82} paddingAngle={4} cornerRadius={5}>{metrics.statusCounts.map((entry,index)=><Cell key={entry.name} fill={["#6366f1","#10b981","#f59e0b","#f43f5e"][index%4]} stroke="white" strokeWidth={3}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" iconType="circle" /></PieChart></ResponsiveContainer>{metrics.statusCounts.length===0&&<p className="text-center text-sm text-slate-400">No follow-up status data yet.</p>}</div></div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)]"><div className="mb-2"><h2 className="text-lg font-bold text-slate-900">Lead Stage Overview</h2><p className="text-xs text-slate-500">Distribution of current lead stages</p></div><div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={metrics.stageCounts} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={48} outerRadius={78} paddingAngle={3}>{metrics.stageCounts.map((entry,index)=><Cell key={entry.name} fill={["#0ea5e9","#8b5cf6","#f97316","#14b8a6","#ec4899","#64748b"][index%6]} stroke="white" strokeWidth={3}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" iconType="circle"/></PieChart></ResponsiveContainer></div></div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)]">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Today Site Visit</h2><p className="mt-1 text-xs text-slate-500">Customer visits scheduled for today</p></div><MapPin className="h-5 w-5 text-rose-500"/></div>
            <div className="space-y-3">{metrics.visitsToday.slice(0,6).map(row=><div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-rose-50/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{row.customer_name||"—"}</p><p className="mt-0.5 text-xs text-slate-500">{projectNames.get(row.project_id||"")||"—"} · {row.telecaller_name||"—"}</p></div><span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm">{row.site_visit_status||"Planned"}</span></div>)}{metrics.visitsToday.length===0&&<p className="py-8 text-center text-sm text-slate-400">No site visits scheduled for today.</p>}</div>
            <Button asChild variant="outline" className="mt-4 w-full border-rose-100"><Link to="/site-visits">Open Site Visit Schedule</Link></Button>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_35px_-20px_rgba(30,41,59,0.35)]">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-900">Today's Follow-ups</h2><p className="mt-1 text-xs text-slate-500">Due today across both follow-up stages</p></div><CheckCircle2 className="h-5 w-5 text-emerald-500"/></div>
            <div className="space-y-3">{metrics.dueToday.slice(0,6).map(row=><div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50/70 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{row.customer_name||"—"}</p><p className="mt-0.5 text-xs text-slate-500">{row.customer_phone||"—"} · {row.telecaller_name||"—"}</p></div><span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">Due Today</span></div>)}{metrics.dueToday.length===0&&<p className="py-8 text-center text-sm text-slate-400">No follow-ups due today.</p>}</div>
            <Button asChild variant="outline" className="mt-4 w-full border-emerald-100"><Link to="/follow-ups">Open Follow-ups</Link></Button>
          </div>
        </section>
        <p className="text-center text-xs text-slate-400">Dashboard data refreshes with your latest saved leads and schedules.</p>
      </div>
    </main>
  );
}
