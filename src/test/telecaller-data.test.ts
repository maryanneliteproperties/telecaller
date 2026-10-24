import { describe, expect, it } from "vitest";
import { telecallerDataRow } from "@/lib/telecaller-data";
import { validateReport, PERFORMANCE, READINESS } from "@/lib/conversation-report";

const transcript = "Vanakkam, en pekar Kumar. Budget 30 lakhs sollunga. Chengalpattu plot venum.";

function makeReport() {
  return validateReport({
    categories: PERFORMANCE.map((c, i) => ({
      id: c.id,
      score: i === 0 ? 80 : null,
      strength: `Strength ${c.id}`,
      missed: `Missed ${c.id}`,
      improvement: `Improve ${c.id}`,
      betterWording: `Wording ${c.id}`,
      quote: i === 0 ? "Budget 30 lakhs sollunga" : null,
      timestamp: null,
    })),
    checks: [{ label: "Budget asked", status: "Yes", detail: "Budget kekka pattadhu", quote: "Budget 30 lakhs sollunga", timestamp: null }],
    coaching: ["Coaching onnu", "Coaching rendu", "Coaching moonu"],
    findings: [{ label: "Budget", kind: "explicit", value: "30 lakhs", quote: "Budget 30 lakhs sollunga", timestamp: null }],
    readiness: READINESS.map((r) => ({ id: r.id, score: null, rationale: "Unknown", quote: null, timestamp: null })),
    nextAction: "Call pannunga",
    reason: "Interest irukku",
    questions: ["q1"],
    objectionResponses: ["o1"],
    documents: ["d1"],
    timing: "Nalai",
    script: "Script",
    siteInvitation: null,
  }, transcript);
}

describe("telecallerDataRow", () => {
  it("fills every detailed-report sub-heading column from the validated report", () => {
    const row = telecallerDataRow(makeReport(), { callReportId: "r1", audioPath: "a/b.amr", audioName: "call.amr" });
    expect(row.call_report_id).toBe("r1");
    expect(row.audio_path).toBe("a/b.amr");
    expect(row.audio_name).toBe("call.amr");
    expect(row.introduction_score_1).toBe(80);
    expect(row.introduction_strength).toBe("Strength introduction");
    expect(row.introduction_evidence).toBe("Budget 30 lakhs sollunga");
    expect(row.introduction_better_wording).toBe("Wording introduction");
    expect(row.discovery_score).toBeNull();
    expect(row.discovery_strength).toBe("Strength discovery");
    expect(row.listening_missed).toBe("Missed listening");
    expect(row.explanation_improvement).toBe("Improve explanation");
    expect(row.objections_timestamp).toBeNull();
    expect(row.closing_better_wording).toBe("Wording closing");
    expect(row.checklist).toEqual([{ label: "Budget asked", status: "Yes", detail: "Budget kekka pattadhu", quote: "Budget 30 lakhs sollunga", timestamp: null }]);
    expect(row.coaching_1).toBe("Coaching onnu");
    expect(row.coaching_2).toBe("Coaching rendu");
    expect(row.coaching_3).toBe("Coaching moonu");
    expect(row.improvement_area).toBe("Coaching onnu");
  });

  it("keeps overall and per-category scores null without evidence, never inventing values", () => {
    // Only introduction has evidence (10% coverage < 50%), so the overall score stays null.
    const row = telecallerDataRow(makeReport());
    expect(row.overall_score).toBeNull();
    expect(row.discovery_score).toBeNull();
    // With evidence-backed scores in every category, the weighted overall score is stored.
    const full = makeReport();
    for (const category of full.categories) { category.quote = "Budget 30 lakhs sollunga"; category.score = 80; }
    const scored = telecallerDataRow(full);
    expect(scored.overall_score).toBe(80);
    expect(scored.closing_score).toBe(80);
    // A quote-less score is never stored.
    const noEvidence = makeReport();
    noEvidence.categories[0]!.quote = null;
    noEvidence.categories[0]!.score = null;
    const empty = telecallerDataRow(noEvidence);
    expect(empty.introduction_score_1).toBeNull();
  });
});
