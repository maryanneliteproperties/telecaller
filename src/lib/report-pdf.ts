import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import { DEFAULT_INTENT_WEIGHTS, MISSING_REPORT_INFO, compactReport, detailedReport, type ConversationReport } from "./conversation-report";

// Colorful PDF export of the validated report. Rendered through the browser so
// Tamil text is shaped correctly (pdf-lib/jsPDF text drawing cannot shape Tamil).
const NAVY = "#1e2a4a", BLUE = "#2563eb", GREEN = "#16a34a", AMBER = "#d97706", RED = "#dc2626";
const SLATE = "#475569", LIGHT = "#f1f5f9", BORDER = "#e2e8f0", WHITE = "#ffffff";
const PAGE_WIDTH = 794; // A4 at 96dpi

type Styles = Record<string, string>;
function el(tag: string, styles: Styles, text?: string) {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  if (text !== undefined) node.textContent = text;
  return node;
}
const block: Styles = { fontFamily: "'Noto Sans Tamil','Segoe UI',system-ui,sans-serif", boxSizing: "border-box" };

function scoreColor(score: number | null) {
  if (score === null) return SLATE;
  return score >= 70 ? GREEN : score >= 40 ? AMBER : RED;
}
function priorityColor(priority: string) {
  return priority === "HOT" ? RED : priority === "WARM" ? AMBER : priority === "COLD" ? BLUE : SLATE;
}

function header(customer: string, date: string) {
  const band = el("div", { ...block, background: `linear-gradient(135deg, ${NAVY}, #2f3f6e)`, color: WHITE, padding: "28px 32px", borderRadius: "12px", marginBottom: "20px" });
  band.appendChild(el("p", { margin: "0", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", color: "#93c5fd" }, "AI Call Workspace · Call Report"));
  band.appendChild(el("h1", { margin: "6px 0 4px", fontSize: "26px", fontWeight: "700" }, customer));
  band.appendChild(el("p", { margin: "0", fontSize: "13px", color: "#cbd5e1" }, date));
  return band;
}

function scoreCards(report: ConversationReport) {
  const summary = compactReport(report, DEFAULT_INTENT_WEIGHTS);
  const wrap = el("div", { ...block, display: "flex", gap: "16px", marginBottom: "20px" });
  const card = (title: string, value: string, sub: string, color: string) => {
    const c = el("div", { flex: "1", background: WHITE, border: `1px solid ${BORDER}`, borderLeft: `5px solid ${color}`, borderRadius: "10px", padding: "16px 18px" });
    c.appendChild(el("p", { margin: "0", fontSize: "12px", fontWeight: "600", color: SLATE, textTransform: "uppercase", letterSpacing: "1px" }, title));
    c.appendChild(el("p", { margin: "6px 0 2px", fontSize: "26px", fontWeight: "700", color }, value));
    c.appendChild(el("p", { margin: "0", fontSize: "12px", color: SLATE }, sub));
    return c;
  };
  const perf = summary.performance.score;
  wrap.appendChild(card("விற்பனையாளர் மொத்த மதிப்பெண்", perf === null ? MISSING_REPORT_INFO : `${perf}/100`, "Telecaller Performance", scoreColor(perf)));
  wrap.appendChild(card("வாங்குபவர் மொத்த மதிப்பெண்", `${summary.intent.score}/100`, `Lead Priority: ${summary.priority}`, priorityColor(summary.priority)));
  return wrap;
}

function sectionBlock(title: string, accent: string, rows: { label: string; value: string }[]) {
  const section = el("div", { ...block, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "18px 20px", marginBottom: "16px" });
  const head = el("div", { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" });
  head.appendChild(el("span", { display: "inline-block", width: "6px", height: "22px", borderRadius: "3px", background: accent }));
  head.appendChild(el("h2", { margin: "0", fontSize: "17px", fontWeight: "700", color: NAVY }, title));
  section.appendChild(head);
  for (const row of rows) {
    const line = el("div", { padding: "8px 0", borderTop: `1px solid ${LIGHT}` });
    line.appendChild(el("p", { margin: "0 0 3px", fontSize: "12px", fontWeight: "600", color: accent }, row.label));
    line.appendChild(el("p", { margin: "0", fontSize: "13px", lineHeight: "1.6", color: "#1f2937", whiteSpace: "pre-wrap" }, row.value));
    section.appendChild(line);
  }
  return section;
}

function summaryList(title: string, accent: string, items: string[]) {
  return sectionBlock(title, accent, items.map((item) => ({ label: "", value: item })).map((r) => ({ label: r.label, value: `• ${r.value}` })));
}

async function renderBlock(node: HTMLElement) {
  const host = el("div", { position: "fixed", left: "-10000px", top: "0", width: `${PAGE_WIDTH}px`, background: "#f8fafc", padding: "24px" });
  host.appendChild(node);
  document.body.appendChild(host);
  try {
    return await html2canvas(host, { scale: 2, backgroundColor: "#f8fafc", useCORS: true });
  } finally {
    host.remove();
  }
}

export async function downloadReportPdf(report: ConversationReport, customerName: string, createdAt?: string) {
  const summary = compactReport(report, DEFAULT_INTENT_WEIGHTS);
  const date = createdAt ? new Date(createdAt).toLocaleString("ta-IN") : new Date().toLocaleString("ta-IN");

  const intro = el("div", {});
  intro.appendChild(header(customerName, date));
  intro.appendChild(scoreCards(report));

  // One block per section so page breaks fall on section boundaries, never mid-list.
  const blocks: HTMLElement[] = [
    intro,
    summaryList("விற்பனையாளர் செயல்திறன் சுருக்கம்", BLUE,
      summary.caller.map((r) => `${r.label}${r.score === null ? "" : `: ${r.score}/100`} — ${r.explanation}`)),
    summaryList("வாங்குபவரின் வாங்கும் அறிகுறிகள்", GREEN,
      summary.buyer.map((r) => `${r.label}: ${r.value}`)),
  ];
  for (const [tab, accent] of [["performance", BLUE], ["buyer", GREEN]] as const) {
    for (const section of detailedReport(report, tab)) {
      blocks.push(sectionBlock(section.title, accent, section.rows));
    }
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = 297, margin = 10, usable = pageHeight - margin * 2;
  let y = margin, first = true;
  for (const blockNode of blocks) {
    const canvas = await renderBlock(blockNode);
    const widthMm = 210 - margin * 2;
    const heightMm = (canvas.height / canvas.width) * widthMm;
    if (heightMm <= usable) {
      if (!first && y + heightMm > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, y, widthMm, heightMm);
      y += heightMm + 4;
    } else {
      // Taller than one page: slice the canvas into page-sized chunks.
      const chunkPx = Math.floor((usable / widthMm) * canvas.width);
      for (let offset = 0; offset < canvas.height; offset += chunkPx) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(chunkPx, canvas.height - offset);
        slice.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        if (!first) pdf.addPage();
        const sliceMm = (slice.height / canvas.width) * widthMm;
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, widthMm, sliceMm);
        y = pageHeight; first = false;
      }
      y = margin;
    }
    first = false;
  }
  pdf.save(`${customerName.replace(/\.[^.]+$/, "")}-full-report.pdf`);
}
