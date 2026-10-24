import { describe, it, expect } from "vitest";
import { PERFORMANCE, READINESS, DEFAULT_INTENT_WEIGHTS, PRIORITY_TAMIL, MISSING_REPORT_INFO, validateReport, performanceSummary, intentSummary, compactReport, detailedReport, reportText, type ConversationReport } from "@/lib/conversation-report";
function fixture(): ConversationReport {
  return { categories: PERFORMANCE.map(c => ({ id: c.id, score: 80, strength: "", missed: "", improvement: "", betterWording: "", quote: "Hello", timestamp: null })), checks: [], coaching: ["a", "b", "c"], findings: [], readiness: READINESS.map(c => ({ id: c.id, score: null, rationale: "Unknown", quote: null, timestamp: null })), nextAction: "", reason: "", questions: [], objectionResponses: [], documents: [], timing: "", script: "", siteInvitation: null };
}
describe("Evidence-based report rules", () => {
  for (const [id, weight] of [["introduction", 10], ["discovery", 20], ["listening", 15], ["explanation", 20], ["objections", 15], ["closing", 20]] as const) {
    it(`uses ${weight}% for ${id}`, () => expect(PERFORMANCE.find(c => c.id === id)?.weight).toBe(weight));
  }
  it("normalizes only supported performance categories and displays coverage", () => {
    const r = fixture(); r.categories[0] = { ...r.categories[0], id: "introduction", score: null, strength: "", missed: "", improvement: "", betterWording: "", quote: null, timestamp: null };
    expect(performanceSummary(r)).toEqual({ score: 80, coverage: 90 });
  });
  it("does not score insufficient performance evidence", () => { const r = fixture(); r.categories.forEach(c => c.score = null); expect(performanceSummary(r)).toEqual({ score: null, coverage: 0 }); });
  it("does not rank price and brochure requests as purchase readiness", () => {
    const r = fixture(); r.readiness.forEach(c => { if (["questions", "nextStep"].includes(c.id)) { c.score = 25; c.quote = "Hello"; } });
    expect(intentSummary(r)).toMatchObject({ score: 6, priority: "Insufficient information" });
  });
  it("requires commitment for high priority", () => {
    const r = fixture(); r.readiness.forEach(c => { c.score = ["visit", "nextStep"].includes(c.id) ? 0 : 100; });
    expect(intentSummary(r).priority).not.toBe("High priority");
  });
  it("calculates concrete weighted scores out of 100", () => {
    const r = fixture(); const scores = [100, 50, 80, 60, 40, 90];
    r.categories.forEach((c, i) => c.score = scores[i] ?? null);
    expect(performanceSummary(r)).toEqual({ score: 68, coverage: 100 });
  });
  it("supports configurable buyer scoring without changing evidence", () => {
    const r = fixture(); r.readiness.forEach(c => c.score = c.id === "questions" ? 100 : 0);
    expect(intentSummary(r, { fit: 0, timeline: 0, requirements: 0, visit: 0, questions: 100, nextStep: 0 }).score).toBe(100);
    expect(intentSummary(r).score).toBe(10);
  });
  it("rejects invented quotations", () => { const r = fixture(); expect(() => validateReport(r, "Buyer: price?")).toThrow(/quotation/); });
  it("rejects out-of-range scores", () => { const r = fixture(); r.categories.forEach(c => c.score = 101); expect(() => validateReport(r, "Hello")).toThrow(/invalid score/); });
  it("removes invented timestamps", () => { const r = fixture(); r.categories.forEach(c => c.timestamp = "03:42"); expect(validateReport(r, "Hello").categories[0]?.timestamp).toBeNull(); });
  it("does not turn politeness or general interest into HOT", () => {
    const r = fixture();
    r.readiness.forEach(row => { row.score = ["visit", "nextStep"].includes(row.id) ? 25 : null; row.quote = "Hello"; });
    expect(compactReport(r).priority).toBe(MISSING_REPORT_INFO);
  });
  it("uses HOT only for the existing evidence-backed high priority", () => {
    const r = fixture(); r.readiness.forEach(row => { row.score = 100; row.quote = "Hello"; });
    expect(compactReport(r).priority).toBe("HOT");
    expect(compactReport(r).intent.score).toBe(intentSummary(r).score);
  });
  it("retains WARM and COLD from the existing priority rules", () => {
    const r = fixture(); r.readiness.forEach(row => { row.score = 50; row.quote = "Hello"; });
    expect(compactReport(r).priority).toBe("WARM");
    r.readiness.forEach(row => { if (["visit", "nextStep"].includes(row.id)) row.score = 0; });
    expect(compactReport(r).priority).toBe("COLD");
  });
  it("does not invent an improvement score or change the caller overall", () => {
    const r = fixture();
    const result = compactReport(r);
    expect(result.caller[5]?.score).toBeNull();
    expect(result.performance.score).toBe(80);
    expect(result.caller.slice(0, 5).map(row => row.score)).toEqual([80, 80, 80, 80, 80]);
  });
  it("does not surface unsupported buyer details", () => {
    const r = fixture(); r.findings.push({ label: "பட்ஜெட்", kind: "unknown", value: "பத்து லட்சம்", quote: null, timestamp: null });
    expect(compactReport(r).buyer[2]?.value).toBe("தகவல் இல்லை · தகவல் இல்லை");
  });
  it("keeps existing report fields intact when projecting a reopened report", () => {
    const r = fixture(); const before = JSON.stringify(r);
    const reopened: ConversationReport = JSON.parse(before);
    compactReport(reopened);
    expect(JSON.stringify(reopened)).toBe(before);
  });
  it("maps every priority label to Tamil", () => {
    for (const priority of ["High priority", "Medium priority", "Low priority", "Insufficient information"]) expect(PRIORITY_TAMIL[priority]).toMatch(/[\u0B80-\u0BFF]/u);
  });
  it("preserves original scores and report fields when displaying detailed reports", () => {
    const r = fixture(); const before = JSON.stringify(r);
    detailedReport(r, "performance"); detailedReport(r, "buyer");
    expect(JSON.stringify(r)).toBe(before);
    expect(performanceSummary(r).score).toBe(80);
  });
  it("does not invent detailed scores without transcript evidence", () => {
    const r = fixture(); const category = r.categories[0];
    if (!category) throw new Error("Missing fixture category");
    category.quote = null;
    const section = detailedReport(r, "performance")[0];
    expect(section?.rows[0]?.value).toBe(MISSING_REPORT_INFO);
    expect(category.score).toBe(80);
  });
  it("renders report headings and labels in Tamil script", () => {
    const r = fixture(); r.findings.push({ label: "பட்ஜெட்", kind: "explicit", value: "30 lakhs", quote: "Hello", timestamp: null });
    const out = compactReport(r);
    const all = [
      MISSING_REPORT_INFO,
      ...out.caller.map(x => x.label),
      ...out.buyer.map(x => x.label),
      reportText(r, "performance", DEFAULT_INTENT_WEIGHTS, "detailed"),
      reportText(r, "buyer", DEFAULT_INTENT_WEIGHTS, "detailed"),
    ].join(" ");
    expect(all).toMatch(/[\u0B80-\u0BFF]/u);
    expect(MISSING_REPORT_INFO).toBe("தகவல் இல்லை");
  });
});
