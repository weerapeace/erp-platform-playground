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
import type { BuiltReport, ReportRow, ReportTone } from "@/lib/email-report/render";
import { thaiDateLabel } from "@/lib/email-report/render";

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

  // หัว
  let y = 24;
  const t1 = await text(esc(r.heading), { x: PAD, y, size: 32, bold: true });
  y += t1.h + 2;
  const t2 = await text(esc(`${ctx.reportName} · ${thaiDateLabel(now)}`), { x: PAD, y, size: 19, color: "#64748b" });
  y += t2.h + 16;

  // ตัวเลขสรุป
  if (r.stats.length) {
    const gap = 10; const n = r.stats.length;
    const tw = Math.floor((W - PAD * 2 - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
      const s = r.stats[i]; const x = PAD + i * (tw + gap);
      shapes.push(`<rect x="${x}" y="${y}" width="${tw}" height="78" rx="10" fill="#f1f5f9"/>`);
      await text(s.value.toLocaleString("th-TH"), { x: x + 14, y: y + 8, size: 30, bold: true, color: s.tone ? TONE[s.tone] : "#0f172a" });
      await text(esc(clipCols(s.label, Math.max(8, Math.floor(tw / 9.5)))), { x: x + 14, y: y + 48, size: 17, color: "#64748b" });
    }
    y += 78 + 12;
  }
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
  const foot = await text(esc(`${r.total > shown ? `แสดง ${shown.toLocaleString("th-TH")} จาก ${r.total.toLocaleString("th-TH")} งาน · ` : ""}กดลิงก์ในข้อความเพื่อดูทั้งหมดในระบบ`), { x: PAD, y, size: 16, color: "#94a3b8" });
  y += foot.h + 22;

  const H = Math.ceil(y);
  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#ffffff"/>${shapes.join("")}</svg>`);
  return sharp(bg).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}
