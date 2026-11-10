import { describe, expect, it } from "vitest";
import { isLeadAnalysisComplete } from "@/lib/lead-score-status";

describe("isLeadAnalysisComplete", () => {
  it("keeps genuinely processing leads pending", () => {
    expect(isLeadAnalysisComplete({ processing_status: "submitted" })).toBe(false);
    expect(isLeadAnalysisComplete({ processing_status: "transcribing" })).toBe(false);
    expect(isLeadAnalysisComplete({ processing_status: null })).toBe(false);
  });

  it("recognizes current completed analysis even when no score is available", () => {
    expect(isLeadAnalysisComplete({ processing_status: "analysed" })).toBe(true);
  });

  it("recognizes older completed leads through their saved report link", () => {
    expect(isLeadAnalysisComplete({ processing_status: "submitted", call_report_id: "report-123" })).toBe(true);
  });

  it("recognizes legacy report content when the old status was not updated", () => {
    expect(isLeadAnalysisComplete({ processing_status: "submitted", coaching_1: "Saved coaching" })).toBe(true);
    expect(isLeadAnalysisComplete({ processing_status: "submitted", improvement_area: "Saved improvement" })).toBe(true);
    expect(isLeadAnalysisComplete({ processing_status: "submitted", checklist: [{ label: "Budget", status: "Yes" }] })).toBe(true);
  });

  it("does not treat an empty legacy checklist as a completed report", () => {
    expect(isLeadAnalysisComplete({ processing_status: "submitted", checklist: [] })).toBe(false);
  });
});
