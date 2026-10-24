import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Home, Users, FileText, PanelLeft, LogOut, Headphones, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { logoutWorkspace } from "@/lib/workspace.functions";
import { getDestinationClient } from "@/lib/destination-client";
import type { WorkspaceIdentity } from "@/lib/workspace-schema";

export function WorkspaceShell({ identity, children }: { identity: WorkspaceIdentity; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: r => r.location.pathname });
  const navigate = useNavigate(), queryClient = useQueryClient(), logout = useServerFn(logoutWorkspace);
  const items = [{ title: "Home", to: "/" as const, icon: Home }, { title: "Leads", to: "/leads" as const, icon: Users }, { title: "Report", to: "/reports" as const, icon: FileText }];
  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    await logout(); await (await getDestinationClient()).auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  return <div className="flex min-h-screen w-full">
    <aside className={`${collapsed ? "w-16" : "w-16 sm:w-56"} sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground`}>
      <Link to="/" aria-label="AI Call workspace" className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4"><Headphones className="h-7 w-7 shrink-0 text-sidebar-primary" />{!collapsed && <span className="hidden text-sm font-semibold sm:block">AI Call<span className="block text-xs font-normal text-muted-foreground">Workspace</span></span>}</Link>
      <nav className="flex-1 space-y-2 px-2 py-6" aria-label="Main menu">{items.map(item => <Button key={item.title} asChild variant="ghost" className={`w-full justify-start px-3 ${path === item.to ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`} title={item.title}><Link to={item.to}><item.icon />{!collapsed && <span className="hidden sm:inline">{item.title}</span>}</Link></Button>)}
        {identity.role === "admin" && <Button asChild variant="ghost" className={`w-full justify-start px-3 ${path === "/employees" ? "bg-sidebar-accent" : ""}`} title="Employees"><Link to="/employees"><ShieldCheck />{!collapsed && <span className="hidden sm:inline">Employees</span>}</Link></Button>}
      </nav>
      <Button variant="ghost" onClick={signOut} title="Sign out" aria-label="Sign out" className="mx-2 mb-5 justify-start px-3"><LogOut />{!collapsed && <span className="hidden sm:inline">Sign out</span>}</Button>
    </aside>
    <div className="min-w-0 flex-1"><header className="flex h-20 items-center justify-between border-b bg-card px-4 sm:px-8"><Button variant="ghost" size="icon" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}><PanelLeft /></Button><div className="text-right text-sm"><span className="font-medium">{identity.username}</span><span className="ml-3 text-xs capitalize text-muted-foreground">{identity.role}</span></div></header>{children}</div>
  </div>;
}