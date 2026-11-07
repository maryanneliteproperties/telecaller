import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Home, Users, FileText, PanelLeft, LogOut, Menu, Building2, ShieldCheck, X, FolderKanban, CalendarDays, MapPin, LayoutDashboard } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { logoutWorkspace } from "@/lib/workspace.functions";
import { getDestinationClient } from "@/lib/destination-client";
import type { WorkspaceIdentity } from "@/lib/workspace-schema";

const PAGE_TITLES: Array<[prefix: string, title: string]> = [
  ["/dashboard", "Dashboard"],
  ["/projects", "Projects"],
  ["/follow-ups", "Follow Ups"],
  ["/site-visits", "Site Visit"],
  ["/employees", "Employees"],
  ["/leads", "Leads"],
  ["/reports", "Reports"],
  ["/new_leads", "New Lead"],
];

export function WorkspaceShell({ identity, children }: { identity: WorkspaceIdentity; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false), [mobileOpen, setMobileOpen] = useState(false);
  const path = useRouterState({ select: r => r.location.pathname });
  const navigate = useNavigate(), queryClient = useQueryClient(), logout = useServerFn(logoutWorkspace);
  const items = [{ title: "New Lead", to: "/new_leads" as const, icon: Home }, { title: "Leads", to: "/leads" as const, icon: Users }, { title: "Follow Ups", to: "/follow-ups" as const, icon: CalendarDays }, { title: "Site Visit", to: "/site-visits" as const, icon: MapPin }, { title: "Call Reports", to: "/reports" as const, icon: FileText }];
  const pageTitle = PAGE_TITLES.find(([prefix]) => path === prefix || (prefix !== "/" && path.startsWith(prefix)))?.[1] ?? "Home";
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    await logout(); await (await getDestinationClient()).auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  const nav = (compact: boolean) => <>
    <div className="flex h-20 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
      <Link to="/dashboard" aria-label="AI Call workspace" onClick={() => setMobileOpen(false)} className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#8245EF] to-[#D43BCB] text-white shadow-sm"><Building2 className="h-5 w-5" /></span>
        {!compact && <span className="text-sm font-semibold leading-tight">Mary Ann Elite<span className="block text-xs font-normal text-sidebar-foreground/75">Properties</span></span>}
      </Link>
      <Button type="button" variant="ghost" size="icon" aria-label="Close sidebar" title="Close sidebar" className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent min-[1200px]:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
    </div>
    <nav className="flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-3 pb-8 pt-8" aria-label="Main menu">{[{ title: "Dashboard", to: "/dashboard" as const, icon: LayoutDashboard }, ...items, ...(identity.role === "admin" ? [{ title: "Projects", to: "/projects" as const, icon: FolderKanban }, { title: "Employees", to: "/employees" as const, icon: ShieldCheck }] : [])].map(item => <Button key={item.title} asChild variant="ghost" className={`min-h-12 w-full justify-start rounded-xl px-3 py-3 text-[15px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${path === item.to || (item.to !== "/" && path.startsWith(item.to)) ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-foreground/80"}`} title={item.title}><Link to={item.to} onClick={() => setMobileOpen(false)}><item.icon />{!compact && <span>{item.title}</span>}</Link></Button>)}</nav>
  </>;
  return <div className="flex min-h-screen w-full min-w-0 overflow-x-clip">
    <aside className={`${collapsed ? "w-16" : "w-60"} sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-[1200px]:flex`}>{nav(collapsed)}</aside>
    <div aria-hidden={!mobileOpen} onClick={() => setMobileOpen(false)} className={`fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300 min-[1200px]:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
    <aside aria-label="Mobile menu" className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-out min-[1200px]:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{nav(false)}</aside>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 flex min-h-[calc(76px+env(safe-area-inset-top))] items-center justify-between border-b border-indigo-100/80 bg-gradient-to-r from-white via-white to-indigo-50/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-sm backdrop-blur-xl sm:px-8"><div className="flex min-w-0 items-center gap-2 text-sm"><Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" className="hidden min-[1200px]:inline-flex" onClick={() => setCollapsed(!collapsed)}><PanelLeft /></Button><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-600/20"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">Mary Ann Elite Properties</p><p className="text-xs font-medium text-indigo-600">{pageTitle}</p></div></div></div><div className="flex items-center gap-2">
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Account menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-600/20 ring-2 ring-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{identity.username.slice(0, 1).toUpperCase()}</button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-0"><div className="px-3 py-2.5 text-sm"><span className="font-medium">{identity.username}</span><span className="ml-3 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">{identity.role}</span></div><DropdownMenuSeparator className="m-0 h-px" /><DropdownMenuItem onSelect={() => void signOut()} className="m-1 cursor-pointer"><LogOut />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={mobileOpen} className="h-11 w-11 rounded-xl border border-indigo-100 bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 min-[1200px]:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button>
    </div></header>{children}</div>
  </div>;
}
