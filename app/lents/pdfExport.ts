"use client";

// ─────────────────────────────────────────────────────────────────────────
// Credics — PDF Export (pdf-lib এডিশন)
//
// jsPDF বাদ দেওয়া হয়েছে — ওটার কোনো text-shaping engine নেই, তাই বাংলা যুক্তাক্ষর
// (রাষ্ট্র, স্বাস্থ্য, ক্ষ ইত্যাদি) ভেঙে যাচ্ছিল। এখন pdf-lib + @pdf-lib/fontkit
// ব্যবহার করা হচ্ছে — fontkit-এর ভেতরে Universal Shaping Engine আছে যেটা bengali
// conjunct/matra ঠিকভাবে জোড়া লাগায়। এটা সম্পূর্ণ vector/text-based PDF — কোনো
// html2canvas বা screenshot-ভিত্তিক পদ্ধতি ব্যবহার করা হয়নি।
//
// Dependency: npm install pdf-lib @pdf-lib/fontkit regenerator-runtime
// ─────────────────────────────────────────────────────────────────────────

import "regenerator-runtime/runtime"; // fontkit-এর shaping engine generator function ব্যবহার করে;
// Next.js-এর ডিফল্ট SWC কম্পাইলার এটা auto-polyfill করে না, তাই সরাসরি import করা হলো।

import { PDFDocument, PDFFont, PDFPage, PDFImage, rgb, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { HIND_SILIGURI_REGULAR_BASE64, HIND_SILIGURI_BOLD_BASE64 } from "./bengaliFont";

// ── Brand tokens ──
const DARK = rgb(8 / 255, 8 / 255, 20 / 255);
const AMBER = rgb(245 / 255, 158 / 255, 11 / 255);
const RED = rgb(239 / 255, 68 / 255, 68 / 255);
const EMERALD = rgb(16 / 255, 185 / 255, 129 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const INK = rgb(30 / 255, 30 / 255, 40 / 255);
const ROW_TINT = rgb(248 / 255, 248 / 255, 251 / 255);
const HAIRLINE = rgb(0.9, 0.9, 0.92);
const WHITE = rgb(1, 1, 1);

const LOGO_URL = "/icon-512x512.png";
const APP_TAGLINE = "Credit Card & Financial Manager";

// A4, points (pdf-lib-এর native unit)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 100;
const BOTTOM_SAFE = 54; // ফুটারের জন্য জায়গা রাখা

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// square লোগো ইমেজকে ছোট্ট একটা offscreen canvas দিয়ে গোল করে ক্রপ করা হচ্ছে
// (পুরো পেজের screenshot না — শুধু একটা ছোট আইকন প্রসেস করা হচ্ছে) তারপর PNG bytes রিটার্ন করছে
async function loadCircularLogoBytes(size = 240): Promise<Uint8Array | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = LOGO_URL;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const ratio = Math.max(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/png");
    return base64ToUint8Array(dataUrl.split(",")[1]);
  } catch {
    return null;
  }
}

const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

// ── word-wrap: একটা শব্দ নিজেই cell-এর চেয়ে চওড়া হলে অক্ষর ভেঙে ভেঙে wrap করে ──
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = (text ?? "").toString();
  if (!clean) return [""];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushChunked = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (font.widthOfTextAtSize(test, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = test;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      current = pushChunked(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type Align = "left" | "right" | "center";

function drawAligned(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  align: Align,
  font: PDFFont,
  size: number,
  color: RGB,
  padding = 4
) {
  const textWidth = font.widthOfTextAtSize(text, size);
  let drawX = x + padding;
  if (align === "right") drawX = x + width - textWidth - padding;
  else if (align === "center") drawX = x + (width - textWidth) / 2;
  page.drawText(text, { x: drawX, y, size, font, color });
}

// ─────────────────────────────────────────────────────────────────────────
// Builder — pages, cursor, header/footer, table rendering — সব state এখানে
// ─────────────────────────────────────────────────────────────────────────
interface BuilderState {
  pdfDoc: PDFDocument;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  logo: PDFImage | null;
  headerTitle: string;
  headerSubtitle: string;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
}

async function createBuilder(headerTitle: string, headerSubtitle: string): Promise<BuilderState> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontRegular = await pdfDoc.embedFont(base64ToUint8Array(HIND_SILIGURI_REGULAR_BASE64), { subset: true });
  const fontBold = await pdfDoc.embedFont(base64ToUint8Array(HIND_SILIGURI_BOLD_BASE64), { subset: true });

  let logo: PDFImage | null = null;
  const logoBytes = await loadCircularLogoBytes();
  if (logoBytes) {
    try {
      logo = await pdfDoc.embedPng(logoBytes);
    } catch {
      logo = null;
    }
  }

  const state: BuilderState = {
    pdfDoc,
    fontRegular,
    fontBold,
    logo,
    headerTitle,
    headerSubtitle,
    pages: [],
    page: null as any,
    y: 0,
  };
  addPage(state);
  return state;
}

function drawHeaderBand(state: BuilderState) {
  const { page, fontRegular, fontBold, logo } = state;

  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: DARK });
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 3, width: PAGE_W, height: 3, color: AMBER });
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 4.4, width: PAGE_W, height: 1.4, color: RED });

  let textX = MARGIN + 2;
  if (logo) {
    const cx = MARGIN + 20;
    const cy = PAGE_H - 34;
    page.drawEllipse({ x: cx, y: cy, xScale: 21, yScale: 21, color: AMBER });
    const logoSize = 36;
    page.drawImage(logo, { x: cx - logoSize / 2, y: cy - logoSize / 2, width: logoSize, height: logoSize });
    textX = MARGIN + 48;
  }

  page.drawText("Credics", { x: textX, y: PAGE_H - 32, size: 20, font: fontBold, color: WHITE });
  page.drawText(APP_TAGLINE, { x: textX, y: PAGE_H - 47, size: 9, font: fontRegular, color: rgb(0.75, 0.75, 0.8) });

  drawAligned(page, state.headerTitle, MARGIN, PAGE_H - 34, CONTENT_W, "right", fontBold, 13, AMBER, 0);
  drawAligned(page, state.headerSubtitle, MARGIN, PAGE_H - 49, CONTENT_W, "right", fontRegular, 9, rgb(0.82, 0.82, 0.86), 0);
  drawAligned(
    page,
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    MARGIN,
    PAGE_H - 62,
    CONTENT_W,
    "right",
    fontRegular,
    7.5,
    rgb(0.65, 0.65, 0.7),
    0
  );
}

function addPage(state: BuilderState) {
  const page = state.pdfDoc.addPage([PAGE_W, PAGE_H]);
  state.page = page;
  state.pages.push(page);
  state.y = PAGE_H - HEADER_H - 20;
  drawHeaderBand(state);
}

function ensureSpace(state: BuilderState, height: number) {
  if (state.y - height < BOTTOM_SAFE) {
    addPage(state);
  }
}

function drawSummaryBoxes(state: BuilderState, boxes: { label: string; value: string; color: RGB }[]) {
  const gap = 12;
  const boxH = 46;
  const boxW = (CONTENT_W - gap * (boxes.length - 1)) / boxes.length;
  ensureSpace(state, boxH + 10);

  boxes.forEach((b, i) => {
    const x = MARGIN + i * (boxW + gap);
    const y = state.y - boxH;
    state.page.drawRectangle({ x, y, width: boxW, height: boxH, color: ROW_TINT });
    state.page.drawRectangle({ x, y, width: 3, height: boxH, color: b.color });
    state.page.drawText(b.label.toUpperCase(), { x: x + 10, y: y + boxH - 16, size: 7.5, font: state.fontRegular, color: SLATE });
    state.page.drawText(b.value, { x: x + 10, y: y + 10, size: 14, font: state.fontBold, color: b.color });
  });

  state.y -= boxH + 20;
}

interface Column {
  header: string;
  width: number;
  align?: Align;
}

type CellStyleFn = (rowIndex: number, colIndex: number, value: string) => { color?: RGB; bold?: boolean } | void;

function drawTableHeader(state: BuilderState, columns: Column[]) {
  const rowH = 22;
  ensureSpace(state, rowH + 6);
  const y = state.y - rowH;
  state.page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: rowH, color: DARK });
  let cx = MARGIN;
  columns.forEach((col) => {
    drawAligned(state.page, col.header, cx, y + 7, col.width, col.align || "left", state.fontBold, 8, WHITE);
    cx += col.width;
  });
  state.y -= rowH;
}

function drawTable(state: BuilderState, columns: Column[], rows: string[][], cellStyleFn?: CellStyleFn) {
  const FONT_SIZE = 8;
  const LINE_H = 10.5;
  const CELL_PAD_Y = 6;

  drawTableHeader(state, columns);

  rows.forEach((row, ri) => {
    const wrapped = columns.map((col, ci) => wrapText(row[ci] ?? "", state.fontRegular, FONT_SIZE, col.width - 8));
    const lineCount = Math.max(...wrapped.map((w) => w.length));
    const rowH = lineCount * LINE_H + CELL_PAD_Y;

    if (state.y - rowH < BOTTOM_SAFE) {
      addPage(state);
      drawTableHeader(state, columns);
    }

    const yTop = state.y;
    if (ri % 2 === 1) {
      state.page.drawRectangle({ x: MARGIN, y: yTop - rowH, width: CONTENT_W, height: rowH, color: ROW_TINT });
    }

    let cx = MARGIN;
    columns.forEach((col, ci) => {
      const lines = wrapped[ci];
      const style = cellStyleFn ? cellStyleFn(ri, ci, row[ci]) : undefined;
      const font = style?.bold ? state.fontBold : state.fontRegular;
      const color = style?.color || INK;
      lines.forEach((line, li) => {
        const ly = yTop - CELL_PAD_Y / 2 - (li + 1) * LINE_H + 2.5;
        drawAligned(state.page, line, cx, ly, col.width, col.align || "left", font, FONT_SIZE, color);
      });
      cx += col.width;
    });

    state.page.drawLine({
      start: { x: MARGIN, y: yTop - rowH },
      end: { x: MARGIN + CONTENT_W, y: yTop - rowH },
      thickness: 0.5,
      color: HAIRLINE,
    });

    state.y -= rowH;
  });
}

function drawFooters(state: BuilderState) {
  const total = state.pages.length;
  state.pages.forEach((page, i) => {
    page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: PAGE_W - MARGIN, y: 34 }, thickness: 0.5, color: HAIRLINE });
    page.drawText("Generated by Credics", { x: MARGIN, y: 22, size: 7.5, font: state.fontRegular, color: SLATE });
    drawAligned(page, `Page ${i + 1} of ${total}`, MARGIN, 22, CONTENT_W, "right", state.fontRegular, 7.5, SLATE, 0);
  });
}

async function finalize(state: BuilderState, filename: string) {
  drawFooters(state);
  const bytes = await state.pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─────────────────────────────────────────────────────────────────────────
// 1) মূল পেজের পুরো Borrower List — PDF export
// ─────────────────────────────────────────────────────────────────────────
export interface BorrowerListRow {
  name: string;
  phone?: string | null;
  totalGiven: number;
  totalCollected: number;
  netDue: number;
}

export async function exportBorrowerListPdf(params: { borrowers: BorrowerListRow[]; mode: "card" | "pocket" }) {
  const { borrowers, mode } = params;

  const state = await createBuilder(
    mode === "card" ? "Card & Cash Lending" : "Personal Pocket Lending",
    `Borrower Summary  •  ${new Date().toLocaleDateString("en-GB")}`
  );

  const totalGiven = borrowers.reduce((s, b) => s + b.totalGiven, 0);
  const totalCollected = borrowers.reduce((s, b) => s + b.totalCollected, 0);
  const totalDue = borrowers.reduce((s, b) => s + Math.max(0, b.netDue), 0);

  drawSummaryBoxes(state, [
    { label: "Total Given", value: money(totalGiven), color: RED },
    { label: "Total Collected", value: money(totalCollected), color: EMERALD },
    { label: "Total Due", value: money(totalDue), color: AMBER },
  ]);

  const columns: Column[] = [
    { header: "Borrower", width: CONTENT_W * 0.34, align: "left" },
    { header: "Total Given", width: CONTENT_W * 0.2, align: "right" },
    { header: "Total Collected", width: CONTENT_W * 0.22, align: "right" },
    { header: "Net Due", width: CONTENT_W * 0.14, align: "right" },
    { header: "Status", width: CONTENT_W * 0.1, align: "center" },
  ];

  const rows = borrowers.map((b) => [
    b.name,
    money(b.totalGiven),
    money(b.totalCollected),
    money(b.netDue),
    b.netDue > 0 ? "Due" : "Settled",
  ]);

  drawTable(state, columns, rows, (_ri, ci, value) => {
    if (ci === 4) return { color: value === "Due" ? RED : EMERALD, bold: true };
    if (ci === 3) return { bold: true };
    return undefined;
  });

  await finalize(state, `Credics_${mode === "card" ? "CardCash" : "PersonalPocket"}_Borrowers_${todayStamp()}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────
// 2) একজন নির্দিষ্ট Borrower-এর Ledger — date filter সহ PDF export
// ─────────────────────────────────────────────────────────────────────────
export interface LedgerRowForPdf {
  entry_type: "given" | "collected";
  amount: number;
  transaction_date: string;
  created_at: string;
  source_type?: "cash_on_hand" | "credit_card" | null;
  card_id?: string | null;
  remarks?: string | null;
  recorded_by?: string | null;
  balanceAfter: number;
}

export async function exportLedgerPdf(params: {
  borrower: { name: string; phone?: string | null };
  entries: LedgerRowForPdf[];
  mode: "card" | "pocket";
  dateFrom: string | null;
  dateTo: string | null;
  getCardLabel: (id?: string | null) => string;
  getRecorderName: (id?: string | null) => string;
}) {
  const { borrower, entries, mode, dateFrom, dateTo, getCardLabel, getRecorderName } = params;

  const filtered = entries
    .filter((e) => {
      if (dateFrom && e.transaction_date < dateFrom) return false;
      if (dateTo && e.transaction_date > dateTo) return false;
      return true;
    })
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.created_at.localeCompare(b.created_at));

  const rangeLabel =
    dateFrom || dateTo
      ? `${dateFrom ? new Date(dateFrom).toLocaleDateString("en-GB") : "Start"} – ${dateTo ? new Date(dateTo).toLocaleDateString("en-GB") : "Today"}`
      : "All Time";

  const state = await createBuilder(borrower.name, `${mode === "card" ? "Card & Cash" : "Personal Pocket"} Ledger  •  ${rangeLabel}`);

  const totalGiven = filtered.filter((e) => e.entry_type === "given").reduce((s, e) => s + Number(e.amount), 0);
  const totalCollected = filtered.filter((e) => e.entry_type === "collected").reduce((s, e) => s + Number(e.amount), 0);
  const netDue = totalGiven - totalCollected;

  drawSummaryBoxes(state, [
    { label: "You Gave", value: money(totalGiven), color: RED },
    { label: "You Got", value: money(totalCollected), color: EMERALD },
    { label: "Net Due", value: money(netDue), color: netDue > 0 ? AMBER : EMERALD },
  ]);

  const columns: Column[] =
    mode === "card"
      ? [
          { header: "Date", width: CONTENT_W * 0.1, align: "left" },
          { header: "Time", width: CONTENT_W * 0.1, align: "left" },
          { header: "Type", width: CONTENT_W * 0.1, align: "left" },
          { header: "Source", width: CONTENT_W * 0.22, align: "left" },
          { header: "Amount", width: CONTENT_W * 0.1, align: "right" },
          { header: "Balance", width: CONTENT_W * 0.1, align: "right" },
          { header: "Recorded By", width: CONTENT_W * 0.12, align: "left" },
          { header: "Remarks", width: CONTENT_W * 0.16, align: "left" },
        ]
      : [
          { header: "Date", width: CONTENT_W * 0.12, align: "left" },
          { header: "Time", width: CONTENT_W * 0.12, align: "left" },
          { header: "Type", width: CONTENT_W * 0.12, align: "left" },
          { header: "Amount", width: CONTENT_W * 0.14, align: "right" },
          { header: "Balance", width: CONTENT_W * 0.14, align: "right" },
          { header: "Recorded By", width: CONTENT_W * 0.16, align: "left" },
          { header: "Remarks", width: CONTENT_W * 0.2, align: "left" },
        ];

  const typeColIndex = 2;

  const rows = filtered.map((e) => {
    const row: string[] = [
      new Date(e.transaction_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }),
      new Date(e.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
      e.entry_type === "given" ? "You Gave" : "You Got",
    ];
    if (mode === "card") {
      row.push(`${e.source_type === "credit_card" ? "Card" : "Cash"}: ${getCardLabel(e.card_id)}`);
    }
    row.push(money(e.amount));
    row.push(money(e.balanceAfter));
    row.push(getRecorderName(e.recorded_by));
    row.push(e.remarks || "-");
    return row;
  });

  drawTable(state, columns, rows, (_ri, ci, value) => {
    if (ci === typeColIndex) return { color: value === "You Gave" ? RED : EMERALD, bold: true };
    return undefined;
  });

  await finalize(state, `Credics_${borrower.name.replace(/\s+/g, "_")}_Ledger_${todayStamp()}.pdf`);
}