"use client";

// ─────────────────────────────────────────────────────────────────────────
// Credics — Transactions PDF Export (pdf-lib এডিশন)
//
// app/lents/pdfExport.ts এর একই ব্র্যান্ড-স্টাইল বিল্ডার এখানে re-implement করা
// হয়েছে (builder internals lents ফাইল থেকে export হয় না, তাই duplicate করতে
// হলো) — তবে বাংলা ফন্ট বেস৬৪ ডেটা lents/bengaliFont.ts থেকেই সরাসরি reuse
// করা হচ্ছে, যাতে দুই জায়গায় বড় ফন্ট ফাইল ডুপ্লিকেট না হয়।
//
// Dependency: pdf-lib, @pdf-lib/fontkit, regenerator-runtime (already installed
// for the lents feature)
// ─────────────────────────────────────────────────────────────────────────

import "regenerator-runtime/runtime";

import { PDFDocument, PDFFont, PDFPage, PDFImage, rgb, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { HIND_SILIGURI_REGULAR_BASE64, HIND_SILIGURI_BOLD_BASE64 } from "../lents/bengaliFont";

// ── Brand tokens (transactions পেজের নিজস্ব accent — নীল/বেগুনি থিমের সাথে মিলিয়ে) ──
const DARK = rgb(8 / 255, 8 / 255, 20 / 255);
const SKY = rgb(14 / 255, 165 / 255, 233 / 255);
const PURPLE = rgb(168 / 255, 85 / 255, 247 / 255);
const RED = rgb(239 / 255, 68 / 255, 68 / 255);
const EMERALD = rgb(16 / 255, 185 / 255, 129 / 255);
const AMBER = rgb(245 / 255, 158 / 255, 11 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const INK = rgb(30 / 255, 30 / 255, 40 / 255);
const ROW_TINT = rgb(248 / 255, 248 / 255, 251 / 255);
const HAIRLINE = rgb(0.9, 0.9, 0.92);
const WHITE = rgb(1, 1, 1);

const LOGO_URL = "/icon-512x512.png";
const APP_TAGLINE = "Credit Card & Financial Manager";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 100;
const BOTTOM_SAFE = 54;

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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
    pdfDoc, fontRegular, fontBold, logo, headerTitle, headerSubtitle,
    pages: [], page: null as any, y: 0,
  };
  addPage(state);
  return state;
}

function drawHeaderBand(state: BuilderState) {
  const { page, fontRegular, fontBold, logo } = state;

  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: DARK });
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 3, width: PAGE_W, height: 3, color: SKY });
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 4.4, width: PAGE_W, height: 1.4, color: PURPLE });

  let textX = MARGIN + 2;
  if (logo) {
    const cx = MARGIN + 20;
    const cy = PAGE_H - 34;
    page.drawEllipse({ x: cx, y: cy, xScale: 21, yScale: 21, color: SKY });
    const logoSize = 36;
    page.drawImage(logo, { x: cx - logoSize / 2, y: cy - logoSize / 2, width: logoSize, height: logoSize });
    textX = MARGIN + 48;
  }

  page.drawText("Credics", { x: textX, y: PAGE_H - 32, size: 20, font: fontBold, color: WHITE });
  page.drawText(APP_TAGLINE, { x: textX, y: PAGE_H - 47, size: 9, font: fontRegular, color: rgb(0.75, 0.75, 0.8) });

  drawAligned(page, state.headerTitle, MARGIN, PAGE_H - 34, CONTENT_W, "right", fontBold, 13, SKY, 0);
  drawAligned(page, state.headerSubtitle, MARGIN, PAGE_H - 49, CONTENT_W, "right", fontRegular, 9, rgb(0.82, 0.82, 0.86), 0);
  drawAligned(
    page, `Generated: ${new Date().toLocaleString("en-IN")}`, MARGIN, PAGE_H - 62, CONTENT_W, "right",
    fontRegular, 7.5, rgb(0.65, 0.65, 0.7), 0
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
  if (state.y - height < BOTTOM_SAFE) addPage(state);
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

interface Column { header: string; width: number; align?: Align; }
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
      start: { x: MARGIN, y: yTop - rowH }, end: { x: MARGIN + CONTENT_W, y: yTop - rowH },
      thickness: 0.5, color: HAIRLINE,
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
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
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
// Public export — filtered transaction ledger (rotations / spends / bill payments)
// ─────────────────────────────────────────────────────────────────────────
export interface TransactionPdfRow {
  date: string;                 // display date (already localised)
  type: "Rotation" | "Bill Payment" | "Spend" | "Repayment";
  title: string;                // merchant name / remarks headline
  direction: "debit" | "credit";
  amount: number;
  cardDetails: string;          // e.g. "HDFC Regalia (**1234)"
  paymentMethod: string;        // "Credit Card" / "Cash on Hand" / "Own Pocket"
  cashBreakdown?: { cardLabel: string; amount: number }[]; // populated for cross-card cash bill payments
  recordedBy: string;
  remarks: string;
}

export async function exportTransactionsPdf(params: {
  rows: TransactionPdfRow[];
  filterLabel: string; // e.g. "All Users • This Month • Bill Paid"
}) {
  const { rows, filterLabel } = params;

  const state = await createBuilder("Transactions Ledger", filterLabel);

  const totalIn = rows.filter((r) => r.direction === "credit").reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amount, 0);
  const net = totalIn - totalOut;

  drawSummaryBoxes(state, [
    { label: "Total Out", value: money(totalOut), color: RED },
    { label: "Total In", value: money(totalIn), color: EMERALD },
    { label: "Net", value: money(net), color: net >= 0 ? EMERALD : RED },
  ]);

  const columns: Column[] = [
    { header: "Date", width: CONTENT_W * 0.09, align: "left" },
    { header: "Type", width: CONTENT_W * 0.1, align: "left" },
    { header: "Details", width: CONTENT_W * 0.23, align: "left" },
    { header: "Card", width: CONTENT_W * 0.15, align: "left" },
    { header: "Source", width: CONTENT_W * 0.2, align: "left" },
    { header: "Amount", width: CONTENT_W * 0.11, align: "right" },
    { header: "By", width: CONTENT_W * 0.12, align: "left" },
  ];

  const amountColIndex = 5;

  const tableRows = rows.map((r) => {
    const sourceLabel =
      r.cashBreakdown && r.cashBreakdown.length > 0
        ? r.cashBreakdown.map((b) => `${b.cardLabel}: ${money(b.amount)}`).join(" + ")
        : r.paymentMethod;
    return [
      r.date,
      r.type,
      r.title || r.remarks || "-",
      r.cardDetails,
      sourceLabel,
      `${r.direction === "debit" ? "-" : "+"}${money(r.amount)}`,
      r.recordedBy,
    ];
  });

  drawTable(state, columns, tableRows, (_ri, ci, value) => {
    if (ci === amountColIndex) return { color: value.startsWith("-") ? RED : EMERALD, bold: true };
    return undefined;
  });

  await finalize(state, `Credics_Transactions_${todayStamp()}.pdf`);
}