import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Home, Users, FileText, PanelLeft, LogOut, Menu, Headphones, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { logoutWorkspace } from "@/lib/workspace.functions";
import { getDestinationClient } from "@/lib/destination-client";
import type { WorkspaceIdentity } from "@/lib/workspace-schema";

const PAGE_TITLES: Array<[prefix: string, title: string]> = [
  ["/employees", "Employees"],
  ["/leads", "Leads"],
  ["/reports", "Reports"],
  ["/", "Home"],
];

export function WorkspaceShell({ identity, children }: { identity: WorkspaceIdentity; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false), [mobileOpen, setMobileOpen] = useState(false);
  const path = useRouterState({ select: r => r.location.pathname });
  const navigate = useNavigate(), queryClient = useQueryClient(), logout = useServerFn(logoutWorkspace);
  const items = [{ title: "Home", to: "/" as const, icon: Home }, { title: "Leads", to: "/leads" as const, icon: Users }, { title: "Report", to: "/reports" as const, icon: FileText }];
  const pageTitle = PAGE_TITLES.find(([prefix]) => path === prefix || (prefix !== "/" && path.startsWith(prefix)))?.[1] ?? "Home";
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    await logout(); await (await getDestinationClient()).auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  const nav = (compact: boolean) => <>
    <Link to="/" aria-label="AI Call workspace" onClick={() => setMobileOpen(false)} className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Headphones className="h-5 w-5" /></span>{!compact && <span className="text-sm font-semibold">AI Call<span className="block text-xs font-normal text-sidebar-foreground/70">CRM Workspace</span></span>}</Link>
    <nav className="flex-1 space-y-1 px-2 py-6" aria-label="Main menu">{[...items, ...(identity.role === "admin" ? [{ title: "Employees", to: "/employees" as const, icon: ShieldCheck }] : [])].map(item => <Button key={item.title} asChild variant="ghost" className={`w-full justify-start px-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${path === item.to || (item.to !== "/" && path.startsWith(item.to)) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"}`} title={item.title}><Link to={item.to} onClick={() => setMobileOpen(false)}><item.icon />{!compact && <span>{item.title}</span>}</Link></Button>)}</nav>
  </>;
  return <div className="flex min-h-screen w-full">
    <aside className={`${collapsed ? "w-16" : "w-60"} sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground min-[1200px]:flex`}>{nav(collapsed)}</aside>
    <div aria-hidden={!mobileOpen} onClick={() => setMobileOpen(false)} className={`fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-300 min-[1200px]:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
    <aside aria-label="Mobile menu" className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-out min-[1200px]:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{nav(false)}</aside>
    <div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-card px-4 sm:px-8"><div className="flex min-w-0 items-center gap-2 text-sm"><Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" className="hidden min-[1200px]:inline-flex" onClick={() => setCollapsed(!collapsed)}><PanelLeft /></Button><nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-muted-foreground"><Link to="/" className="hover:text-foreground">AI Call CRM</Link><ChevronRight className="h-4 w-4 shrink-0" /><span className="truncat font-medium text-foreground">{pageTitle}</span></nav></div><div className="flex items-center gap-2">
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Account menu" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{identity.username.slice(0, 1).toUpperCase()}</button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-0"><div className="px-3 py-2.5 text-sm"><span className="font-medium">{identity.username}</span><span className="ml-3 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">{identity.role}</span></div><DropdownMenuSeparator className="m-0 h-px" /><DropdownMenuItem onSelect={() => void signOut()} className="m-1 cursor-pointer"><LogOut />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={mobileOpen} className="min-[1200px]:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button>
    </div></header>{children}</div>
  </div>;
}
