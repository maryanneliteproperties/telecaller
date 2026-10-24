import { detailedReport, type ConversationReport } from "@/lib/conversation-report";

export function DetailedReport({ report, tab }: { report: ConversationReport; tab: string }) {
  const sections = detailedReport(report, tab);
  return <div className="mt-5 space-y-6 min-w-0 break-words">
    {sections.map((section, index) => <section key={`${section.title}-${index}`} className="border-b border-border pb-5 last:border-0">
      <h3 className="font-display text-lg">{section.title}</h3>
      <dl className="mt-3 space-y-3 text-sm leading-relaxed">
        {section.rows.map((row, rowIndex) => <div key={rowIndex}>
          <dt className="font-medium">{row.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{row.value}</dd>
        </div>)}
      </dl>
    </section>)}
  </div>;
}