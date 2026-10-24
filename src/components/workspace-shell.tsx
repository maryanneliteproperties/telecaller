import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Home, Users, FileText, PanelLeft, LogOut, Headphones, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
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
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: r => r.location.pathname });
  const navigate = useNavigate(), queryClient = useQueryClient(), logout = useServerFn(logoutWorkspace);
  const items = [{ title: "Home", to: "/" as const, icon: Home }, { title: "Leads", to: "/leads" as const, icon: Users }, { title: "Report", to: "/reports" as const, icon: FileText }];
  const pageTitle = PAGE_TITLES.find(([prefix]) => path === prefix || (prefix !== "/" && path.startsWith(prefix)))?.[1] ?? "Home";
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    await logout(); await (await getDestinationClient()).auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  return <div className="flex min-h-screen w-full">
    <aside className={`${collapsed ? "w-16" : "w-16 sm:w-60"} sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground`}>
      <Link to="/" aria-label="AI Call workspace" className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Headphones className="h-5 w-5" /></span>{!collapsed && <span className="hidden text-sm font-semibold sm:block">AI Call<span className="block text-xs font-normal text-sidebar-foreground/70">CRM Workspace</span></span>}</Link>
      <nav className="flex-1 space-y-1 px-2 py-6" aria-label="Main menu">{items.map(item => <Button key={item.title} asChild variant="ghost" className={`w-full justify-start px-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${path === item.to || (item.to !== "/" && path.startsWith(item.to)) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"}`} title={item.title}><Link to={item.to}><item.icon />{!collapsed && <span className="hidden sm:inline">{item.title}</span>}</Link></Button>)}
        {identity.role === "admin" && <Button asChild variant="ghost" className={`w-full justify-start px-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${path === "/employees" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"}`} title="Employees"><Link to="/employees"><ShieldCheck />{!collapsed && <span className="hidden sm:inline">Employees</span>}</Link></Button>}
      </nav>
      <Button variant="ghost" onClick={signOut} title="Sign out" aria-label="Sign out" className="mx-2 mb-5 justify-start px-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut />{!collapsed && <span className="hidden sm:inline">Sign out</span>}</Button>
    </aside>
    <div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b bg-card px-4 sm:px-8"><div className="flex min-w-0 items-center gap-2 text-sm"><Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}><PanelLeft /></Button><nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-muted-foreground"><Link to="/" className="hover:text-foreground">AI Call CRM</Link><ChevronRight className="h-4 w-4 shrink-0" /><span className="truncate font-medium text-foreground">{pageTitle}</span></nav></div><div className="flex items-center gap-3"><span className="hidden text-right text-sm sm:block"><span className="font-medium">{identity.username}</span><span className="ml-3 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">{identity.role}</span></span><span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{identity.username.slice(0, 1).toUpperCase()}</span></div></header>{children}</div>
  </div>;
}
