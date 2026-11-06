import { useEffect, useMemo, useState } from "react";

type FilterRow = {
  customer_name?: string | null;
  customer_phone?: string | null;
  telecaller_name?: string | null;
  project_id?: string | null;
};
type ProjectOption = { id: string; name: string };

export function WorkspaceRecordFilters<T extends FilterRow>({
  rows, projects, employeeNames = [], getDate, onChange,
}: {
  rows: T[];
  projects: ProjectOption[];
  employeeNames?: string[];
  getDate: (row: T) => string | null | undefined;
  onChange: (rows: T[]) => void;
}) {
  const [employee, setEmployee] = useState("all");
  const [project, setProject] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [customDate, setCustomDate] = useState("");
  const [search, setSearch] = useState("");

  const employees = useMemo(
    () => [...new Set([...employeeNames, ...rows.map(row => row.telecaller_name?.trim()).filter((name): name is string => Boolean(name))])]
      .sort((a, b) => a.localeCompare(b)),
    [rows, employeeNames],
  );

  const filtered = useMemo(() => {
    const today = new Date();
    const key = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const target = new Date(today);
    if (datePreset === "yesterday") target.setDate(target.getDate() - 1);
    if (datePreset === "tomorrow") target.setDate(target.getDate() + 1);
    const wantedDate = datePreset === "custom"
      ? customDate
      : ["yesterday", "today", "tomorrow"].includes(datePreset) ? key(target) : "";

    const term = search.trim().toLowerCase();
    const phoneTerm = term.replace(/\s/g, "");
    return rows.filter(row => {
      const date = getDate(row)?.slice(0, 10) ?? "";
      const name = (row.customer_name ?? "").toLowerCase();
      const phone = (row.customer_phone ?? "").replace(/\s/g, "").toLowerCase();
      const caller = (row.telecaller_name ?? "").toLowerCase();
      const matchesSearch = !term || name.includes(term) || phone.includes(phoneTerm) || caller.includes(term);

      return (employee === "all" || row.telecaller_name === employee)
        && (project === "all" || row.project_id === project)
        && (!wantedDate || date === wantedDate)
        && matchesSearch;
    });
  }, [rows, employee, project, datePreset, customDate, search, getDate]);

  useEffect(() => { onChange(filtered); }, [filtered, onChange]);

  const field = "h-10 w-full min-w-[168px] rounded-lg border border-white/70 bg-white/95 px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200";
  const label = "mb-1 block whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-indigo-950/80";

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-100 via-violet-100 to-sky-100 p-3 shadow-sm" aria-label="Record filters">
      <div className="flex items-end gap-3 overflow-x-auto pb-1">
        <label className="w-[190px] shrink-0">
          <span className={label}>Employee</span>
          <select className={field} value={employee} onChange={e => setEmployee(e.target.value)}>
            <option value="all">All Employees</option>
            {employees.map(name => <option key={name} value={name}>{/^admin$/i.test(name) ? "Admin" : name}</option>)}
          </select>
        </label>

        <label className="w-[190px] shrink-0">
          <span className={label}>Project</span>
          <select className={field} value={project} onChange={e => setProject(e.target.value)}>
            <option value="all">All Projects</option>
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label className="w-[270px] shrink-0">
          <span className={label}>Search Customer / Phone / Telecaller</span>
          <input
            className={field}
            placeholder="Type name, phone or telecaller..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search customer name, customer phone, or telecaller"
          />
        </label>

        <label className="w-[170px] shrink-0">
          <span className={label}>Date</span>
          <select className={field} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
            <option value="all">All Dates</option>
            <option value="yesterday">Yesterday</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="custom">Select Date</option>
          </select>
        </label>

        {datePreset === "custom" && (
          <label className="w-[170px] shrink-0">
            <span className={label}>Choose Date</span>
            <input className={field} type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} />
          </label>
        )}

        <button
          type="button"
          className="h-10 shrink-0 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          onClick={() => {
            setEmployee("all");
            setProject("all");
            setDatePreset("all");
            setCustomDate("");
            setSearch("");
          }}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}
