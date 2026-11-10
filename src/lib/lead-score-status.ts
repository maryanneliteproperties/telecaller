export type LeadAnalysisStatusRecord = {
  processing_status?: string | null;
  call_report_id?: string | null;
  checklist?: unknown;
  coaching_1?: string | null;
  improvement_area?: string | null;
};

/**
 * A linked report or legacy report content proves analysis completed,
 * even when older rows still carry the default "submitted" status.
 */
export function isLeadAnalysisComplete(row: LeadAnalysisStatusRecord): boolean {
  if (row.processing_status === "analysed") return true;
  if (typeof row.call_report_id === "string" && row.call_report_id.trim()) return true;
  if (typeof row.coaching_1 === "string" && row.coaching_1.trim()) return true;
  if (typeof row.improvement_area === "string" && row.improvement_area.trim()) return true;
  return Array.isArray(row.checklist) && row.checklist.length > 0;
}
