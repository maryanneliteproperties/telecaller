import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getLeadSummary } from "@/lib/workspace.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Item = { label: string; text?: string | null | undefined };

function List({ items }: { items: Item[] }) {
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">தகவல் இல்லை</p>;
  return <ul className="grid gap-3 py-3 sm:grid-cols-2">{items.map((item, i) => <li key={i} className="rounded-md border bg-card p-3"><p className="text-xs font-semibold text-muted-foreground">{item.label}</p><p className="mt-1 whitespace-pre-line text-sm">{item.text}</p></li>)}</ul>;
}

export function LeadSummary({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["workspace", "lead-summary", id], queryFn: () => getLeadSummary({ data: { id } }) });
  if (isLoading) return <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />ஏற்றுகிறது…</p>;
  if (error || !data) return <p role="alert" className="py-3 text-sm text-destructive">{error instanceof Error ? error.message : "Summary ஏற்ற முடியல."}</p>;
  return <Tabs defaultValue="good">
    <TabsList><TabsTrigger value="good">Good</TabsTrigger><TabsTrigger value="mistakes">Mistakes</TabsTrigger><TabsTrigger value="suggestions">Suggestions</TabsTrigger></TabsList>
    <TabsContent value="good"><List items={data.good} /></TabsContent>
    <TabsContent value="mistakes"><List items={data.mistakes} /></TabsContent>
    <TabsContent value="suggestions"><List items={data.suggestions} /></TabsContent>
  </Tabs>;
}
