import { z } from "zod";

export const PERFORMANCE = [
  { id: "introduction", label: "Introduction and professionalism", tamil: "அறிமுகம் மற்றும் பேச்சுத்திறன்", weight: 10 },
  { id: "discovery", label: "Needs discovery", tamil: "வாடிக்கையாளர் தேவையை அறிதல்", weight: 20 },
  { id: "listening", label: "Active listening", tamil: "கவனமாகக் கேட்டல்", weight: 15 },
  { id: "explanation", label: "Project explanation and factual accuracy", tamil: "திட்டத்தை விளக்கும் திறன்", weight: 20 },
  { id: "objections", label: "Objection handling", tamil: "எதிர்ப்புகளைக் கையாளுதல்", weight: 15 },
  { id: "closing", label: "Closing and next-step agreement", tamil: "Closing மற்றும் அடுத்த நடவடிக்கை", weight: 20 },
] as const;
export const READINESS = [
  { id: "fit", label: "Budget and project fit", tamil: "பட்ஜெட் மற்றும் திட்டப் பொருத்தம்", weight: 20, rubric: "0 unknown; 50 budget stated but fit unconfirmed; 100 explicitly matched budget and requirement" },
  { id: "timeline", label: "Purchase timeline", tamil: "வாங்கும் காலக்கெடு", weight: 20, rubric: "0 unknown; 25 distant/unspecified; 50 within six months; 100 explicit near-term purchase" },
  { id: "requirements", label: "Relevant property requirements", tamil: "சொத்து தேவைகள்", weight: 15, rubric: "0 unknown; 50 one concrete requirement; 100 clear location, type and purpose" },
  { id: "visit", label: "Site-visit commitment", tamil: "Site visit உறுதி", weight: 20, rubric: "0 no commitment; 25 interest only; 50 agrees visit without date; 100 confirms a specific visit" },
  { id: "questions", label: "Specific buying questions", tamil: "குறிப்பிட்ட வாங்கும் கேள்விகள்", weight: 10, rubric: "0 none; 25 price/brochure enquiry only; 50 specific registration/payment question; 100 several concrete due-diligence questions" },
  { id: "nextStep", label: "Clear next-step commitment", tamil: "தெளிவான அடுத்த நடவடிக்கை உறுதி", weight: 15, rubric: "0 no agreement; 25 brochure request only; 50 agreed callback; 100 explicit action and time" },
] as const;
export const PRIORITY_TAMIL: Record<string, string> = {
  "High priority": "அதிக முன்னுரிமை",
  "Medium priority": "நடுத்தர முன்னுரிமை",
  "Low priority": "குறைந்த முன்னுரிமை",
  "Insufficient information": "போதுமான தகவல் இல்லை",
};
export type IntentWeights = Record<string, number>;
export const DEFAULT_INTENT_WEIGHTS: IntentWeights = Object.fromEntries(READINESS.map((r) => [r.id, r.weight]));
const textField = z.preprocess((value) => value == null ? "" : value, z.string());
const evidence = { quote: z.string().nullable().catch(null), timestamp: z.string().nullable().catch(null) };
export const reportSchema = z.object({
  categories: z.array(z.object({ id: z.string(), score: z.number().nullable(), strength: textField, missed: textField, improvement: textField, betterWording: textField, ...evidence })),
  checks: z.array(z.object({ label: textField, status: textField, detail: textField, ...evidence })),
  coaching: z.array(textField),
  findings: z.array(z.object({ label: textField, kind: textField, value: textField, ...evidence })),
  readiness: z.array(z.object({ id: z.string(), score: z.number().nullable(), rationale: textField, ...evidence })),
  nextAction: textField, reason: textField, questions: z.array(textField), objectionResponses: z.array(textField),
  documents: z.array(textField), timing: textField, script: textField, siteInvitation: z.string().nullable(),
});
export type ConversationReport = z.infer<typeof reportSchema>;
const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function validateReport(value: unknown, transcript: string): ConversationReport {
  const report = reportSchema.parse(value);
  for (const list of [report.categories, report.readiness, report.findings, report.checks]) {
    for (const item of list) {
      if (item.quote && !normalize(transcript).includes(normalize(item.quote))) throw new Error("The report contained a quotation not found in the transcript. Please try again.");
      if (item.timestamp && !transcript.includes(item.timestamp)) item.timestamp = null;
    }
  }
  for (const [items, config] of [[report.categories, PERFORMANCE], [report.readiness, READINESS]] as const) {
    if (items.length !== config.length || config.some((c) => items.filter((i) => i.id === c.id).length !== 1)) throw new Error("The report was incomplete. Please try again.");
    for (const item of items) {
      if (item.score !== null && (!Number.isFinite(item.score) || item.score < 0 || item.score > 100)) throw new Error("The report contained an invalid score.");
      if (!item.quote) item.score = null;
    }
  }
  if (report.checks.length !== 7) throw new Error("The checklist report was incomplete. Please try again.");
  for (const check of report.checks) {
    if (!["Yes", "No", "Insufficient evidence"].includes(check.status)) throw new Error("The report contained an invalid checklist status.");
  }
  for (const finding of report.findings) {
    if (!["explicit", "inferred", "unknown"].includes(finding.kind)) throw new Error("The report contained an invalid evidence label.");
    if (!finding.quote || finding.kind === "unknown") { finding.kind = "unknown"; finding.value = "Unknown"; }
  }
  if (report.coaching.length !== 3) throw new Error("The coaching report was incomplete. Please try again.");
  return report;
}

export function performanceSummary(report: ConversationReport) {
  let total = 0, coverage = 0;
  for (const c of PERFORMANCE) {
    const row = report.categories.find((r) => r.id === c.id);
    if (row?.score !== null && row?.score !== undefined) { coverage += c.weight; total += row.score * c.weight; }
  }
  return { score: coverage >= 50 ? Math.round(total / coverage) : null, coverage };
}

export function intentSummary(report: ConversationReport, weights: IntentWeights = DEFAULT_INTENT_WEIGHTS) {
  const sum = READINESS.reduce((n, r) => n + (weights[r.id] ?? 0), 0);
  let total = 0, coverage = 0, known = 0;
  for (const r of READINESS) {
    const row = report.readiness.find((i) => i.id === r.id);
    if (row?.score !== null && row?.score !== undefined) { total += row.score * (weights[r.id] ?? 0); coverage += weights[r.id] ?? 0; known++; }
  }
  const score = sum ? Math.round(total / sum) : 0;
  const commitment = report.readiness.some((r) => ["visit", "nextStep"].includes(r.id) && (r.score ?? 0) >= 50);
  const substantial = report.readiness.filter((r) => r.id !== "questions" && (r.score ?? 0) >= 50).length;
  const priority = !sum || known < 3 || substantial < 2 ? "Insufficient information" : score >= 70 && commitment && substantial >= 3 ? "High priority" : score >= 40 && commitment ? "Medium priority" : "Low priority";
  return { score, priority, coverage: sum ? Math.round(coverage / sum * 100) : 0 };
}

export const MISSING_REPORT_INFO = "தகவல் இல்லை";
// Accepts colloquial Tamil text (Tamil script, optionally mixed with English words); only unknown markers are rejected.
const concise = (value: string | undefined) => {
  if (!value || /^(unknown|insufficient evidence|n\/a)$/i.test(value.trim()) || !/\p{L}/u.test(value)) return MISSING_REPORT_INFO;
  return value.replace(/\s+/g, " ").trim().split(/(?<=[.!?。])\s+/u)[0] ?? MISSING_REPORT_INFO;
};

// Display projections only: keep original report fields, weights and priority gates intact.
export function compactReport(report: ConversationReport, weights: IntentWeights = DEFAULT_INTENT_WEIGHTS) {
  const caller = [
    ["introduction", "அறிமுகம் மற்றும் பேச்சுத்திறன்"],
    ["discovery", "வாடிக்கையாளர் தேவையை அறிதல்"],
    ["explanation", "திட்டத்தை விளக்கும் திறன்"],
    ["objections", "எதிர்ப்புகள் மற்றும் சந்தேகங்களைக் கையாளுதல்"],
    ["closing", "Closing மற்றும் அடுத்த நடவடிக்கை பெறுதல்"],
  ].map(([id, label]) => {
    const row = report.categories.find(r => r.id === id);
    return { label, score: row?.quote ? row.score ?? null : null, explanation: row?.quote ? concise(row.strength || row.missed || row.improvement) : MISSING_REPORT_INFO };
  });
  caller.push({ label: "மேம்படுத்த வேண்டிய அம்சம்", score: null, explanation: concise(report.coaching[0]) });
  const finding = (pattern: RegExp) => {
    const matches = report.findings.filter(r => pattern.test(r.label) && r.kind !== "unknown" && r.quote);
    const row = matches.find(r => r.kind === "explicit") ?? matches[0];
    const text = concise(row?.value);
    return row?.kind === "inferred" && text !== MISSING_REPORT_INFO ? `ஊகம்: ${text}` : text;
  };
  const intent = intentSummary(report, weights);
  const priority = intent.priority === "High priority" ? "HOT" : intent.priority === "Medium priority" ? "WARM" : intent.priority === "Low priority" ? "COLD" : MISSING_REPORT_INFO;
  const interest = priority === "HOT" ? "அதிகம்" : priority === "WARM" ? "மிதமானது" : priority === "COLD" ? "குறைவு" : MISSING_REPORT_INFO;
  const signals = report.readiness.filter(r => r.quote && (r.score ?? 0) >= 50).map(r => concise(r.rationale)).filter(s => s !== MISSING_REPORT_INFO);
  const buyer = [
    { label: "வாங்கும் ஆர்வம்", value: interest },
    { label: "வாங்கும் நோக்கம்", value: finding(/purpose|nookkam|நோக்கம்|பயன்பாடு/i) },
    { label: "பட்ஜெட் மற்றும் விரும்பும் இடம்", value: `${finding(/budget|பட்ஜெட்|வரவு|செலவு/i)} · ${finding(/location|idam|paham|இடம்|பகுதி/i)}` },
    { label: "வாங்கும் காலக்கெடு", value: finding(/timeline|deadline|kaalam|கால|நேரம்/i) },
    { label: "நேர்மறையான Buying Signals", value: signals.length ? signals.join("; ") : MISSING_REPORT_INFO },
    { label: "முக்கியத் தடை அல்லது எதிர்ப்பு", value: finding(/objection|barrier|ethirpu|thadai|sandheham|kavala|எதிர்ப்பு|தடை|சந்தேகம்|கவலை/i) },
    { label: "அடுத்த சிறந்த நடவடிக்கை", value: concise(report.nextAction) },
    { label: "Lead Priority", value: priority },
  ];
  return { caller, buyer, performance: performanceSummary(report), intent, priority };
}

// Full-length presentation of the same validated fields; never regenerate or rescore.
export function detailedReport(report: ConversationReport, tab: string) {
  const text = (value: string | null | undefined) => {
    if (!value || /^(unknown|insufficient evidence|n\/a)$/i.test(value.trim()) || !/\p{L}/u.test(value)) return MISSING_REPORT_INFO;
    return value.trim();
  };
  const evidenceRows = (row: { quote: string | null; timestamp: string | null }) => [
    { label: "உரையாடல் ஆதாரம்", value: row.quote || MISSING_REPORT_INFO },
    { label: "நேரக் குறிப்பு", value: row.timestamp || MISSING_REPORT_INFO },
  ];
  const listRows = (values: string[], label: string) => values.length
    ? values.map((value, i) => ({ label: `${label} ${i + 1}`, value: text(value) }))
    : [{ label, value: MISSING_REPORT_INFO }];
  if (tab === "performance") return [
    ...PERFORMANCE.map(category => {
      const row = report.categories.find(item => item.id === category.id);
      return { title: `${category.tamil} · ${category.weight}%`, rows: row ? [
        { label: "மதிப்பெண்", value: row.quote && row.score !== null ? `${row.score}/100` : MISSING_REPORT_INFO },
        { label: "சிறப்பாகச் செய்தவை", value: text(row.strength) },
        { label: "தவறவிட்டவை", value: text(row.missed) },
        ...evidenceRows(row),
        { label: "மேம்படுத்த வேண்டியவை", value: text(row.improvement) },
        { label: "சிறந்த மாற்றுப் பேச்சு", value: text(row.betterWording) },
      ] : [{ label: "மதிப்பீடு", value: MISSING_REPORT_INFO }] };
    }),
    { title: "உரையாடல் சரிபார்ப்புப் பட்டியல்", rows: report.checks.length ? report.checks.flatMap(row => [
      { label: text(row.label), value: `${text(row.status)} — ${text(row.detail)}` }, ...evidenceRows(row),
    ]) : [{ label: "சரிபார்ப்பு", value: MISSING_REPORT_INFO }] },
    { title: "பயிற்சி பரிந்துரைகள்", rows: listRows(report.coaching, "பரிந்துரை") },
  ];
  return [
    ...([['explicit', 'வாங்குபவர் வெளிப்படையாகச் சொன்ன தகவல்கள்'], ['inferred', 'ஆதாரம் அடிப்படையிலான ஊகங்கள்'], ['unknown', 'தகவல் இல்லாத விஷயங்கள்']] as const).map(([kind, title]) => {
      const findings = report.findings.filter(row => row.kind === kind);
      return { title, rows: findings.length ? findings.flatMap(row => [
        { label: text(row.label), value: kind === "unknown" ? MISSING_REPORT_INFO : text(row.value) },
        ...(kind === "unknown" ? [] : evidenceRows(row)),
      ]) : [{ label: "தகவல்கள்", value: MISSING_REPORT_INFO }] };
    }),
    ...READINESS.map(factor => {
      const row = report.readiness.find(item => item.id === factor.id);
      return { title: `${factor.tamil} · ${factor.weight}%`, rows: row ? [
        { label: "மதிப்பெண்", value: row.quote && row.score !== null ? `${row.score}/100` : MISSING_REPORT_INFO },
        { label: "மதிப்பீட்டிற்கான காரணம்", value: text(row.rationale) }, ...evidenceRows(row),
      ] : [{ label: "மதிப்பீடு", value: MISSING_REPORT_INFO }] };
    }),
    { title: "அடுத்த அழைப்புத் திட்டம்", rows: [
      { label: "அடுத்த சிறந்த நடவடிக்கை", value: text(report.nextAction) },
      { label: "காரணம்", value: text(report.reason) },
      ...listRows(report.questions, "கேட்க வேண்டிய கேள்வி"),
      ...listRows(report.objectionResponses, "எதிர்ப்புக்குப் பதில்"),
      ...listRows(report.documents, "பகிர வேண்டிய ஆவணம்"),
      { label: "தொடர்பு எடுக்க வேண்டிய நேரம்", value: text(report.timing) },
      // Keep the original Tanglish call wording as generated.
      { label: "Personal call script", value: report.script || MISSING_REPORT_INFO },
      { label: "Site visit அழைப்பு", value: text(report.siteInvitation) },
    ] },
  ];
}

export function reportText(report: ConversationReport, tab: string, weights: IntentWeights, format: "summary" | "detailed" = "summary"): string {
  const summary = compactReport(report, weights);
  const score = (value: number | null) => value === null ? MISSING_REPORT_INFO : `${value}/100`;
  return [
    "மொத்த மதிப்பெண் சுருக்கம்",
    `விற்பனையாளர் மொத்த மதிப்பெண்: ${score(summary.performance.score)}`,
    `வாங்குபவர் மொத்த மதிப்பெண்: ${score(summary.intent.score)} · ${summary.priority}`,
    tab === "performance" ? "விற்பனையாளர் செயல்திறன் சுருக்கம்" : "வாங்குபவரின் வாங்கும் அறிகுறிகள்",
    ...(tab === "performance" ? summary.caller.map(r => `• ${r.label}${r.score === null ? "" : `: ${r.score}/100`} — ${r.explanation}`) : summary.buyer.map(r => `• ${r.label}: ${r.value}`)),
    ...(format === "detailed" ? ["", "விரிவான அறிக்கை", ...detailedReport(report, tab).flatMap(section => ["", section.title, ...section.rows.map(row => `${row.label}: ${row.value}`)])] : []),
  ].join("\n");
}
