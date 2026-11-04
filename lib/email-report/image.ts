/**
 * 🖼 รูปรายงาน (PNG) จาก "รายงานที่ประกอบแล้ว" (BuiltReport ชุดเดียวกับอีเมล) — ใช้ส่งเข้า Discord
 * วาดด้วย sharp (มีในโปรเจกต์อยู่แล้ว): ตัวหนังสือผ่าน Pango/HarfBuzz → สระ/วรรณยุกต์ไทยซ้อนถูก
 *   (เครื่องมือวาดรูปของ Next / satori ทำวรรณยุกต์บนสระหาย เช่น "ที่" → "ที" — ทดสอบแล้ว 2026-10-23 จึงไม่ใช้)
 * ฟอนต์ Sarabun โหลดจาก Google Fonts ครั้งแรกแล้วเก็บไว้ใน /tmp · โหลดไม่ได้ = โยน error (ผู้เรียกส่งแบบไม่มีรูปแทน)
 * ฝั่งเซิร์ฟเวอร์เท่านั้น
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BuiltReport, ReportRow, ReportTable, ReportTone } from "@/lib/email-report/render";
import { sizedImage, statText, thaiDateLabel } from "@/lib/email-report/render";

type SharpFn = typeof import("sharp");
const getSharp = async (): Promise<SharpFn> => { const m = (await import("sharp")) as unknown as { default?: SharpFn }; return m.default ?? (m as unknown as SharpFn); };

// ---- ฟอนต์ ----
const FONT_DIR = path.join(os.tmpdir(), "erp-fonts");
const fontFiles = new Map<number, Promise<string>>();
function fontFile(weight: 400 | 600): Promise<string> {
  let p = fontFiles.get(weight);
  if (!p) {
    p = (async () => {
      const file = path.join(FONT_DIR, `Sarabun-${weight}.ttf`);
      try { await fs.access(file); return file; } catch { /* ยังไม่มี → โหลด */ }
      // User-Agent เก่า = Google ส่ง TTF (Pango ใช้ woff2 ไม่ได้)
      const css = await fetch(`https://fonts.googleapis.com/css2?family=Sarabun:wght@${weight}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } }).then((r) => r.text());
      const url = css.match(/url\((https:[^)]+)\)/)?.[1];
      if (!url) throw new Error("โหลดฟอนต์ไม่ได้");
      const buf = Buffer.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
      await fs.mkdir(FONT_DIR, { recursive: true });
      await fs.writeFile(file, buf);
      return file;
    })();
    p.catch(() => fontFiles.delete(weight));   // พลาด = ครั้งหน้าลองใหม่
    fontFiles.set(weight, p);
  }
  return p;
}

const TONE: Record<ReportTone, string> = { danger: "#dc2626", warn: "#d97706", muted: "#64748b", good: "#059669" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#94a3b8");
/** ตัดข้อความตาม "ช่องตัวอักษร" (สระบน/ล่าง วรรณยุกต์ไม่กินที่) — Pango ไม่มี … ให้เอง */
function clipCols(s: string, cols: number): string {
  let n = 0; let out = "";
  for (const ch of s) {
    const mark = /[ัิ-ฺ็-๎]/.test(ch);
    if (!mark) { if (n >= cols) return `${out}…`; n += /[A-Z@WMmw]/.test(ch) ? 1.3 : 1; }
    out += ch;
  }
  return out;
}

type Layer = { input: Buffer; left: number; top: number };

export async function renderReportPng(r: BuiltReport, ctx: { reportName: string; maxRows: number; now?: Date }): Promise<Buffer> {
  const sharp = await getSharp();
  const [reg, semi] = await Promise.all([fontFile(400), fontFile(600)]);
  const now = ctx.now ?? new Date();
  const W = 900, PAD = 28;
  const layers: Layer[] = [];
  const shapes: string[] = [];

  /** วาดข้อความ (markup Pango) → วางที่ x,y · คืนขนาด */
  const text = async (markup: string, o: { x: number; y: number; size: number; bold?: boolean; color?: string; alignRight?: boolean }) => {
    const { data, info } = await sharp({ text: {
      text: `<span foreground="${o.color ?? "#0f172a"}">${markup}</span>`, font: `Sarabun${o.bold ? " SemiBold" : ""} ${o.size}`,
      fontfile: o.bold ? semi : reg, rgba: true, dpi: 72,
    } }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input: data, left: Math.round(o.alignRight ? o.x - info.width : o.x), top: Math.round(o.y) });
    return { w: info.width, h: info.height };
  };

  let y = await drawHead(r, { reportName: ctx.reportName, now, W, PAD, text, shapes });
  // แถบนับแยกกลุ่ม — จุดสีวาดเป็นรูปทรง (ฟอนต์บนเซิร์ฟเวอร์อาจไม่มีอักขระ ● / อีโมจิ)
  const breakdown = (r.breakdown ?? []).filter((b) => b.count > 0);
  if (breakdown.length) {
    let bx = PAD; let by = y; let bh = 0;
    for (const b of breakdown) {
      const label = `${esc(b.label)} ${b.count.toLocaleString("th-TH")}`;
      const t = await text(label, { x: bx + 14, y: by, size: 17, color: "#64748b" });
      if (bx + 14 + t.w > W - PAD && bx > PAD) {   // ล้นบรรทัด → ย้ายลงบรรทัดใหม่
        layers.pop(); bx = PAD; by += bh + 4;
        const t2 = await text(label, { x: bx + 14, y: by, size: 17, color: "#64748b" });
        shapes.push(`<circle cx="${bx + 5}" cy="${by + t2.h / 2}" r="5" fill="${safeColor(b.color)}"/>`);
        bx += 14 + t2.w + 22; bh = t2.h; continue;
      }
      shapes.push(`<circle cx="${bx + 5}" cy="${by + t.h / 2}" r="5" fill="${safeColor(b.color)}"/>`);
      bx += 14 + t.w + 22; bh = Math.max(bh, t.h);
    }
    y = by + bh + 10;
  }

  // แถวงาน = "ด่วนสุด N งาน" ข้ามกลุ่ม (เกินกำหนด → ส้ม → ที่เหลือ · ในระดับเดียวกันคงลำดับเดิมของรายงาน)
  // ไม่ใช้โควตาตามกลุ่มแบบอีเมล ไม่งั้นกลุ่มแรกกินที่หมด งานเกินกำหนดที่อยู่กลุ่มหลังจะไม่ติดรูป · ชื่อกลุ่มย้ายไปเป็นจุดสี + ข้อความในบรรทัดรอง
  type Item = { kind: "row"; row: ReportRow; group: string; color: string | null };
  const RANK: Record<ReportTone, number> = { danger: 0, warn: 1, good: 2, muted: 3 };
  const items: Item[] = r.sections.flatMap((s) => s.rows.map((row) => ({ kind: "row" as const, row, group: s.label, color: s.color })))
    .sort((a, b) => RANK[a.row.flag?.tone ?? "muted"] - RANK[b.row.flag?.tone ?? "muted"])
    .slice(0, ctx.maxRows);
  const shown = items.length;

  // รูปปก (โหลดพร้อมกัน · พลาด = กรอบเทา)
  const TH = 52;
  const mask = Buffer.from(`<svg width="${TH}" height="${TH}"><rect width="${TH}" height="${TH}" rx="8" fill="#fff"/></svg>`);
  const thumbs = new Map<string, Buffer>();
  if (r.showImages) {
    await Promise.all(items.map(async (it) => {
      if (it.kind !== "row" || !it.row.imageUrl) return;
      try {
        const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 4000);
        const res = await fetch(it.row.imageUrl, { signal: ac.signal }).finally(() => clearTimeout(timer));
        if (!res.ok) return;
        const img = await sharp(Buffer.from(await res.arrayBuffer())).resize(TH, TH, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
        thumbs.set(it.row.id, img);
      } catch { /* ไม่มีรูปก็ได้ */ }
    }));
  }

  shapes.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`);
  // 🧮 แบบตาราง (layout "table") — หัวคอลัมน์ · หัวกลุ่ม · แถว (สูงสุด maxRows) · แถวรวม
  let tableShown = 0;
  if (r.table && r.total > 0) {
    const res = await drawTable(r.table, { y, maxRows: ctx.maxRows, W, PAD, text, shapes, layers, sharp });
    y = res.y; tableShown = res.shown;
  }
  for (const it of items) {
    const row = it.row; const rowH = 70;
    let x = PAD + 6;
    if (r.showImages) {
      const th = thumbs.get(row.id);
      if (th) layers.push({ input: th, left: x, top: y + 9 });
      else shapes.push(`<rect x="${x}" y="${y + 9}" width="${TH}" height="${TH}" rx="8" fill="#f1f5f9" stroke="#e2e8f0"/>`);
      x += TH + 14;
    }
    // ขวา: ป้าย (วาดก่อนเพื่อรู้ความกว้าง → ตัดชื่อไม่ให้ชน)
    let flagW = 0;
    if (row.flag) flagW = (await text(esc(row.flag.text), { x: W - PAD - 6, y: y + 14, size: 17, color: TONE[row.flag.tone], alignRight: true })).w + 16;
    const cols = Math.max(14, Math.floor((W - PAD - 6 - flagW - x) / 11.5));
    const title = `${row.code ? `<span foreground="#94a3b8" size="${15 * 1024}" weight="normal">${esc(row.code)}</span>  ` : ""}${esc(clipCols(row.title, cols - (row.code ? 13 : 0)))}`;
    await text(title, { x, y: y + 10, size: 21, bold: true });
    const metaParts = row.parts.filter((p) => p.kind === "meta").map((p) => p.text);
    if (it.group && !metaParts.includes(it.group)) metaParts.unshift(it.group);   // ชื่อกลุ่ม (เช่น สถานะ) ขึ้นก่อน พร้อมจุดสี
    const meta = metaParts.join(" · ");
    // ไม่ใช้อีโมจิในรูป (ฟอนต์บนเซิร์ฟเวอร์อาจไม่มี) — tag ขึ้นต้น "รอ:" อยู่แล้ว
    const extra = row.parts.filter((p) => p.kind !== "meta").map((p) => (p.kind === "note" ? `โน้ต: ${p.text}` : p.text));
    const dot = it.group ? 14 : 0;
    if (dot) shapes.push(`<circle cx="${x + 5}" cy="${y + 53}" r="4.5" fill="${safeColor(it.color)}"/>`);
    const sub = [meta && `<span foreground="#64748b">${esc(clipCols(meta, Math.floor(cols * 1.15)))}</span>`, extra[0] && `<span foreground="#b45309">${esc(clipCols(extra[0], 40))}</span>`].filter(Boolean).join("   ");
    if (sub) await text(sub, { x: x + dot, y: y + 42, size: 17 });
    shapes.push(`<line x1="${PAD}" y1="${y + rowH}" x2="${W - PAD}" y2="${y + rowH}" stroke="#eef2f6" stroke-width="1"/>`);
    y += rowH;
  }
  if (r.total === 0) {
    const t = await text(esc(r.emptyText), { x: PAD, y: y + 18, size: 21, color: "#059669" });
    y += t.h + 36;
  }

  // ท้าย
  y += 12;
  const shownAll = r.table ? tableShown : shown;
  const foot = await text(esc(`${r.total > shownAll ? `แสดง ${shownAll.toLocaleString("th-TH")} จาก ${r.total.toLocaleString("th-TH")} ${r.unit ?? "งาน"} · ` : ""}กดลิงก์ในข้อความเพื่อดูทั้งหมดในระบบ`), { x: PAD, y, size: 16, color: "#94a3b8" });
  y += foot.h + 22;

  const H = Math.ceil(y);
  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#ffffff"/>${shapes.join("")}</svg>`);
  return sharp(bg).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

type TextFn = (markup: string, o: { x: number; y: number; size: number; bold?: boolean; color?: string; alignRight?: boolean }) => Promise<{ w: number; h: number }>;

/** หัวรูป (ชื่อรายงาน · วันที่) + กล่องตัวเลขสรุป — ใช้ทั้งรูปตาราง/รายการ และรูปกริด → คืน y ถัดไป */
async function drawHead(r: BuiltReport, c: { reportName: string; now: Date; W: number; PAD: number; text: TextFn; shapes: string[] }): Promise<number> {
  const { W, PAD, text, shapes } = c;
  let y = 24;
  const t1 = await text(esc(r.heading), { x: PAD, y, size: 32, bold: true });
  y += t1.h + 2;
  const t2 = await text(esc(`${c.reportName} · ${thaiDateLabel(c.now)}`), { x: PAD, y, size: 19, color: "#64748b" });
  y += t2.h + 16;
  if (r.stats.length) {
    const gap = 10; const n = r.stats.length;
    const tw = Math.floor((W - PAD * 2 - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
      const s = r.stats[i]; const x = PAD + i * (tw + gap);
      shapes.push(`<rect x="${x}" y="${y}" width="${tw}" height="78" rx="10" fill="#f1f5f9"/>`);
      await text(esc(statText(s)), { x: x + 14, y: y + 8, size: 30, bold: true, color: s.tone ? TONE[s.tone] : "#0f172a" });
      const lbl = s.hint ? `${s.label} · ${s.hint}` : s.label;
      await text(esc(clipCols(lbl, Math.max(8, Math.floor(tw / 9.5)))), { x: x + 14, y: y + 48, size: 17, color: "#64748b" });
    }
    y += 78 + 12;
  }
  return y;
}

/**
 * 🖼 รูปกริด "ขายดี" 3 คอลัมน์ (Discord แบบ grid) — หัว + ตัวเลขสรุป + รูปสินค้าใหญ่พร้อม อันดับ/รหัส · สี · จำนวน/ยอด ใต้รูป
 * ใช้ BuiltReport.spotlight (≤9) · รูปโหลดไม่ได้ = กรอบเทา "ไม่มีรูป" · ฝั่งเซิร์ฟเวอร์เท่านั้น
 */
export async function renderGridPng(r: BuiltReport, ctx: { reportName: string; count?: number; now?: Date }): Promise<Buffer> {
  const sharp = await getSharp();
  const [reg, semi] = await Promise.all([fontFile(400), fontFile(600)]);
  const now = ctx.now ?? new Date();
  const W = 900, PAD = 28, GAP = 16, COLS = 3;
  const layers: Layer[] = [];
  const shapes: string[] = [];
  const text: TextFn = async (markup, o) => {
    const { data, info } = await sharp({ text: {
      text: `<span foreground="${o.color ?? "#0f172a"}">${markup}</span>`, font: `Sarabun${o.bold ? " SemiBold" : ""} ${o.size}`,
      fontfile: o.bold ? semi : reg, rgba: true, dpi: 72,
    } }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input: data, left: Math.round(o.alignRight ? o.x - info.width : o.x), top: Math.round(o.y) });
    return { w: info.width, h: info.height };
  };
  let y = await drawHead(r, { reportName: ctx.reportName, now, W, PAD, text, shapes });
  const items = (r.spotlight ?? []).slice(0, Math.min(9, Math.max(1, ctx.count ?? 9)));
  const CELL = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const CAP = 92;

  if (items.length) {
    await text("ขายดี", { x: PAD, y: y + 2, size: 20, bold: true, color: "#334155" });
    y += 36;
    const mask = Buffer.from(`<svg width="${CELL}" height="${CELL}"><rect width="${CELL}" height="${CELL}" rx="12" fill="#fff"/></svg>`);
    // ป้ายอันดับเป็นชั้นภาพ (วางทับรูปสินค้า — ถ้าวาดในพื้นหลังจะโดนรูปบัง)
    const badge = await sharp(Buffer.from(`<svg width="46" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="46" height="30" rx="8" fill="#0f172a" fill-opacity="0.8"/></svg>`)).png().toBuffer();
    const pics = await Promise.all(items.map(async (it) => {
      const url = sizedImage(it.imageUrl, 540);
      if (!url) return null;
      try {
        const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 5000);
        const res = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
        if (!res.ok) return null;
        return await sharp(Buffer.from(await res.arrayBuffer())).resize(CELL, CELL, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      } catch { return null; }
    }));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const x = PAD + (i % COLS) * (CELL + GAP);
      const top = y + Math.floor(i / COLS) * (CELL + CAP + GAP);
      const pic = pics[i];
      if (pic) layers.push({ input: pic, left: x, top });
      else {
        shapes.push(`<rect x="${x}" y="${top}" width="${CELL}" height="${CELL}" rx="12" fill="#f1f5f9" stroke="#e2e8f0"/>`);
        await text("ไม่มีรูป", { x: x + CELL / 2 - 28, y: top + CELL / 2 - 12, size: 18, color: "#94a3b8" });
      }
      // ป้ายอันดับมุมซ้ายบน (ทับรูป)
      layers.push({ input: badge, left: x + 8, top: top + 8 });
      await text(`#${it.rank}`, { x: x + 15, y: top + 11, size: 18, bold: true, color: "#ffffff" });
      const cols = Math.floor((CELL - 4) / 10.5);
      await text(esc(clipCols(it.title, cols)), { x, y: top + CELL + 6, size: 20, bold: true });
      if (it.sub) await text(esc(clipCols(it.sub, Math.floor(cols * 1.15))), { x, y: top + CELL + 34, size: 16, color: "#64748b" });
      await text(esc(it.value), { x, y: top + CELL + 58, size: 19, bold: true, color: "#059669" });
    }
    y += Math.ceil(items.length / COLS) * (CELL + CAP + GAP);
  } else if (r.total === 0) {
    const t = await text(esc(r.emptyText), { x: PAD, y: y + 18, size: 21, color: "#059669" });
    y += t.h + 36;
  }
  y += 6;
  const foot = await text(esc(`${r.total > items.length ? `ขายดี ${items.length} อันดับจากทั้งหมด ${r.total.toLocaleString("th-TH")} ${r.unit ?? "งาน"} · ` : ""}รายการเต็มอยู่ในไฟล์แนบ / ลิงก์ในข้อความ`), { x: PAD, y, size: 16, color: "#94a3b8" });
  y += foot.h + 22;
  const H = Math.ceil(y);
  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#ffffff"/>${shapes.join("")}</svg>`);
  return sharp(bg).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

/** 🧮 วาดตาราง (layout "table") ลงรูป — คอลัมน์ชิดขวากว้างคงที่ · คอลัมน์ข้อความแบ่งที่เหลือตามน้ำหนัก (ชื่อกว้างสุด) */
async function drawTable(t: ReportTable, c: { y: number; maxRows: number; W: number; PAD: number; text: TextFn; shapes: string[]; layers: Layer[]; sharp: SharpFn }): Promise<{ y: number; shown: number }> {
  const { W, PAD, text, shapes, layers, sharp } = c;
  const showImg = t.columns.some((k) => k.key === "img");
  const cols = t.columns.filter((k) => k.key !== "img");
  const right = cols.filter((k) => k.align === "right");
  const left = cols.filter((k) => k.align !== "right");
  const RIGHT_W = 130, IMG_W = showImg ? 52 : 0, ROW_H = 50, TH = 38;
  const WEIGHT: Record<string, number> = { name: 3, color: 1.5, code: 1.4, shop: 1.4 };
  const leftW = W - PAD * 2 - IMG_W - right.length * RIGHT_W;
  const weightSum = left.reduce((a, k) => a + (WEIGHT[k.key] ?? 1.2), 0) || 1;
  const pos = new Map<string, { x: number; w: number }>();
  let x = PAD + IMG_W;
  for (const k of left) { const w = Math.floor((leftW * (WEIGHT[k.key] ?? 1.2)) / weightSum); pos.set(k.key, { x, w }); x += w; }
  for (const k of right) { pos.set(k.key, { x, w: RIGHT_W }); x += RIGHT_W; }
  const put = async (key: string, align: "left" | "right" | undefined, s: string, yy: number, o: { bold?: boolean; color?: string; size?: number } = {}) => {
    const p = pos.get(key); if (!p || !s) return;
    if (align === "right") await text(esc(s), { x: p.x + p.w - 6, y: yy, size: o.size ?? 18, bold: o.bold, color: o.color, alignRight: true });
    else await text(esc(clipCols(s, Math.max(4, Math.floor((p.w - 12) / 10.5)))), { x: p.x + 6, y: yy, size: o.size ?? 18, bold: o.bold, color: o.color });
  };

  let y = c.y + 8;
  for (const k of cols) await put(k.key, k.align, k.label, y, { size: 15, color: "#64748b" });
  y += 30;
  shapes.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`);

  // แถวที่จะวาด (สูงสุด maxRows ข้ามกลุ่ม ตามลำดับของรายงาน)
  const plan: { label?: string; row?: ReportTable["sections"][number]["rows"][number] }[] = [];
  let shown = 0;
  for (const s of t.sections) {
    if (shown >= c.maxRows) break;
    if (s.label) plan.push({ label: s.label });
    for (const row of s.rows) { if (shown >= c.maxRows) break; plan.push({ row }); shown++; }
  }
  const mask = Buffer.from(`<svg width="${TH}" height="${TH}"><rect width="${TH}" height="${TH}" rx="6" fill="#fff"/></svg>`);
  const thumbs = new Map<string, Buffer>();
  if (showImg) {
    await Promise.all(plan.map(async (p) => {
      if (!p.row?.imageUrl) return;
      try {
        const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 4000);
        const res = await fetch(p.row.imageUrl, { signal: ac.signal }).finally(() => clearTimeout(timer));
        if (!res.ok) return;
        thumbs.set(p.row.id, await sharp(Buffer.from(await res.arrayBuffer())).resize(TH, TH, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer());
      } catch { /* ไม่มีรูปก็ได้ */ }
    }));
  }
  for (const p of plan) {
    if (p.label) {
      shapes.push(`<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="34" fill="#f8fafc"/>`);
      await text(esc(p.label), { x: PAD + 8, y: y + 5, size: 17, bold: true, color: "#334155" });
      y += 34; continue;
    }
    const row = p.row!;
    if (showImg) {
      const th = thumbs.get(row.id);
      if (th) layers.push({ input: th, left: PAD + 4, top: y + 6 });
      else shapes.push(`<rect x="${PAD + 4}" y="${y + 6}" width="${TH}" height="${TH}" rx="6" fill="#f1f5f9" stroke="#e2e8f0"/>`);
    }
    for (const k of cols) await put(k.key, k.align, row.cells[k.key] ?? "", y + 12, { color: k.key === "code" || k.key === "color" ? "#475569" : "#0f172a" });
    shapes.push(`<line x1="${PAD}" y1="${y + ROW_H}" x2="${W - PAD}" y2="${y + ROW_H}" stroke="#eef2f6" stroke-width="1"/>`);
    y += ROW_H;
  }
  if (t.total) {
    shapes.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#cbd5e1" stroke-width="2"/>`);
    const firstLeft = left[0];
    if (firstLeft) await put(firstLeft.key, "left", t.totalLabel, y + 12, { bold: true });
    for (const k of right) await put(k.key, "right", t.total[k.key] ?? "", y + 12, { bold: true });
    y += ROW_H;
  }
  return { y, shown };
}
