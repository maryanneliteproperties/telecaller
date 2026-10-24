import { performanceSummary, type ConversationReport } from "./conversation-report";

// telecaller_data lives in the external destination database, so its columns are typed here
// (the generated Database types only cover the managed schema).
type CategoryPrefix = "introduction" | "discovery" | "listening" | "explanation" | "objections" | "closing";
type CategoryColumns<P extends CategoryPrefix> = {
  [K in `${P}_score` | `${P}_strength` | `${P}_missed` | `${P}_evidence` | `${P}_timestamp` | `${P}_improvement` | `${P}_better_wording`]: string | number | null;
};
// The destination table names the introduction score column introduction_score_1.
function renameScore<P extends CategoryPrefix>(columns: CategoryColumns<P>, prefix: P) {
  const entries = Object.entries(columns).map(([key, value]) => [key === `${prefix}_score` ? `${prefix}_score_1` : key, value]);
  return Object.fromEntries(entries) as Omit<CategoryColumns<P>, `${P}_score`> & { [K in `${P}_score_1`]: string | number | null };
}
export type TelecallerDataInsert = ReturnType<typeof telecallerDataRow>;

// Maps the validated report onto the telecaller_data columns (one column per detailed-report sub-heading).
// Display-only projection: scores stay null without evidence, unknown text stays as stored.
export function telecallerDataRow(
  report: ConversationReport,
  refs: { callReportId?: string | undefined; audioPath?: string | undefined; audioName?: string | undefined } = {},
) {
  const category = <P extends CategoryPrefix>(id: string, prefix: P): CategoryColumns<P> => {
    const row = report.categories.find((item) => item.id === id);
    return {
      [`${prefix}_score`]: row?.quote ? row.score ?? null : null,
      [`${prefix}_strength`]: row?.strength || null,
      [`${prefix}_missed`]: row?.missed || null,
      [`${prefix}_evidence`]: row?.quote || null,
      [`${prefix}_timestamp`]: row?.timestamp || null,
      [`${prefix}_improvement`]: row?.improvement || null,
      [`${prefix}_better_wording`]: row?.betterWording || null,
    } as CategoryColumns<P>;
  };
  return {
    call_report_id: refs.callReportId ?? null,
    customer_name: null,
    customer_phone: null,
    telecaller_name: null,
    audio_path: refs.audioPath ?? null,
    audio_name: refs.audioName ?? null,
    overall_score: performanceSummary(report).score,
    improvement_area: report.coaching[0] || null,
    // The destination table names this one column introduction_score_1.
    ...renameScore(category("introduction", "introduction"), "introduction"),
    ...category("discovery", "discovery"),
    ...category("listening", "listening"),
    ...category("explanation", "explanation"),
    ...category("objections", "objections"),
    ...category("closing", "closing"),
    checklist: report.checks.map((check) => ({ label: check.label, status: check.status, detail: check.detail, quote: check.quote, timestamp: check.timestamp })),
    coaching_1: report.coaching[0] || null,
    coaching_2: report.coaching[1] || null,
    coaching_3: report.coaching[2] || null,
  };
}
