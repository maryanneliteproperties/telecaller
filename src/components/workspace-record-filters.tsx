import { useEffect, useMemo, useState } from "react";

type FilterRow = {
  customer_name?: string | null;
  customer_phone?: string | null;
  telecaller_name?: string | null;
  project_id?: string | null;
};
type ProjectOption = { id: string; name: string };

export function WorkspaceRecordFilters<T extends FilterRow>({
  rows, projects, getDate, onChange,
}: {
  rows: T[];
  projects: ProjectOption[];
  getDate: (row: T) => string | null | undefined;
  onChange: (rows: T[]) => void;
}) {
  const [employee, setEmployee] = useState("all");
  const [project, setProject] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [customDate, setCustomDate] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [telecaller, setTelecaller] = useState("");

  const employees = useMemo(() => [...new Set(rows.map(row => row.telecaller_name?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)), [rows]);
  const filtered = useMemo(() => {
    const today = new Date();
    const key = (date: Date) => {
      const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const target = new Date(today);
    if (datePreset === "yesterday") target.setDate(target.getDate() - 1);
    if (datePreset === "tomorrow") target.setDate(target.getDate() + 1);
    const wantedDate = datePreset === "custom" ? customDate : ["yesterday", "today", "tomorrow"].includes(datePreset) ? key(target) : "";
    return rows.filter(row => {
      const date = getDate(row)?.slice(0, 10) ?? "";
      return (employee === "all" || row.telecaller_name === employee)
        && (project === "all" || row.project_id === project)
        && (!wantedDate || date === wantedDate)
        && (!customer || (row.customer_name ?? "").toLowerCase().includes(customer.toLowerCase()))
        && (!phone || (row.customer_phone ?? "").replace(/\\s/g, "").includes(phone.replace(/\\s/g, "")))
        && (!telecaller || (row.telecaller_name ?? "").toLowerCase().includes(telecaller.toLowerCase()));
    });
  }, [rows, employee, project, datePreset, customDate, customer, phone, telecaller, getDate]);

  useEffect(() => { onChange(filtered); }, [filtered, onChange]);

  const field = "h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm";
  return <section className="rounded-xl border bg-card p-4 space-y-3" aria-label="Record filters">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Select Employee
        <select className={field} value={employee} onChange={e => setEmployee(e.target.value)}>
          <option value="all">All Employees (including Admin)</option>
          {employees.map(name => <option key={name} value={name}>{/^admin$/i.test(name) ? "Admin" : name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Project
        <select className={field} value={project} onChange={e => setProject(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Customer Name
        <input className={field} placeholder="Search customer" value={customer} onChange={e => setCustomer(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Customer Phone
        <input className={field} inputMode="numeric" placeholder="Search phone number" value={phone} onChange={e => setPhone(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Telecaller
        <input className={field} placeholder="Search telecaller" value={telecaller} onChange={e => setTelecaller(e.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Date
        <select className={field} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
          <option value="all">All Dates</option><option value="yesterday">Yesterday</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="custom">Select Date</option>
        </select>
      </label>
      {datePreset === "custom" && <label className="grid gap-1 text-xs font-medium text-muted-foreground">Choose Date
        <input className={field} type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} />
      </label>}
    </div>
    <div className="flex justify-end"><button type="button" className="text-xs font-medium text-primary underline underline-offset-4" onClick={() => { setEmployee("all"); setProject("all"); setDatePreset("all"); setCustomDate(""); setCustomer(""); setPhone(""); setTelecaller(""); }}>Clear filters</button></div>
  </section>;
}
