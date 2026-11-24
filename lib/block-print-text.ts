"use client";
/**
 * 🧱 บล็อกพิมพ์ — แปลงข้อความเป็นเส้น (ฝั่งหน้าเว็บเท่านั้น)
 *   ฟอนต์ในรายการ BLOCK_FONTS → ไฟล์ TTF จาก /api/block-print/font · หรืออัปโหลดฟอนต์เอง (.ttf / .otf / .woff / .woff2)
 *   อ่านฟอนต์ด้วย fontkit (จัดวางสระ/วรรณยุกต์ไทยตามตารางในฟอนต์ให้เอง) → เส้นหน่วย มม. → เก็บในชิ้นข้อความ
 *   PDF/SVG ใช้เส้นที่แปลงแล้ว — โรงงานไม่ต้องมีฟอนต์
 *   ข้อจำกัด: ฟอนต์ที่อัปโหลดจำไว้แค่ในหน้าที่เปิดอยู่ (เปิดใหม่แล้วจะแก้ข้อความต้องอัปโหลดอีกครั้ง · เส้นที่แปลงแล้วไม่หาย)
 */
import { apiFetch } from "@/lib/api";
import { OP, mapOps, opsBox, type DrawOps } from "@/lib/block-print";

type FkCmd = { command: string; args: number[] };
type FkGlyph = { id: number; codePoints?: number[]; path: { commands: FkCmd[] } };
type FkPos = { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number };
type FkFont = {
  unitsPerEm: number; ascent: number; descent: number; lineGap: number; familyName: string;
  layout(text: string): { glyphs: FkGlyph[]; positions: FkPos[] };
};

/** ชื่อฟอนต์ที่อัปโหลด ลงท้ายแบบนี้เสมอ */
export const UPLOADED_SUFFIX = " (อัปโหลด)";
const loaded = new Map<string, Promise<FkFont>>();
const uploaded = new Map<string, FkFont>();

async function fontkit(): Promise<{ create(b: Uint8Array): FkFont }> {
  const m = await import("fontkit");
  return (m.default ?? m) as { create(b: Uint8Array): FkFont };
}

function loadGoogleFont(family: string, weight: number): Promise<FkFont> {
  const key = `${family}@${weight}`;
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      const res = await apiFetch(`/api/block-print/font?family=${encodeURIComponent(family)}&weight=${weight}`);
      if (!res.ok) throw new Error(res.status === 403 ? "คุณไม่มีสิทธิ์ใช้ฟอนต์" : "โหลดฟอนต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      const fk = await fontkit();
      return fk.create(new Uint8Array(await res.arrayBuffer()));
    })();
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}

/** อัปโหลดฟอนต์เอง → คืนชื่อที่ใช้เลือกในรายการ */
export async function uploadFont(file: File): Promise<string> {
  if (file.size > 30 * 1024 * 1024) throw new Error("ไฟล์ฟอนต์ใหญ่เกิน 30MB");
  const fk = await fontkit();
  let font: FkFont;
  try { font = fk.create(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new Error("อ่านไฟล์ฟอนต์ไม่ได้ — ใช้ไฟล์ .ttf / .otf / .woff / .woff2"); }
  if (!font || typeof font.layout !== "function") throw new Error("ไฟล์นี้เป็นชุดฟอนต์หลายตัว (.ttc) — แยกเป็นไฟล์เดียวก่อน");
  const name = `${(font.familyName || file.name.replace(/\.[^.]+$/, "")).slice(0, 60)}${UPLOADED_SUFFIX}`;
  uploaded.set(name, font);
  return name;
}
export const isUploadedFont = (name: string) => name.endsWith(UPLOADED_SUFFIX);
export const hasUploadedFont = (name: string) => uploaded.has(name);
export const uploadedFontNames = () => [...uploaded.keys()];

/**
 * ข้อความ → เส้น (หน่วย มม. ที่ขนาดตัวอักษร 10 มม. · มุมซ้ายบนของกรอบตัวอักษรที่ 0,0)
 *   ขึ้นบรรทัดใหม่ได้ (Enter) · คืน w/h = ขนาดกรอบจริงของตัวอักษร
 */
export async function textToOps(text: string, font: string, weight: number): Promise<{ d: DrawOps; w: number; h: number }> {
  const lines = text.replace(/\r/g, "").split("\n");
  if (!text.trim()) throw new Error("พิมพ์ข้อความก่อน");
  const f = uploaded.get(font) ?? (isUploadedFont(font) ? null : await loadGoogleFont(font, weight));
  if (!f) throw new Error("ฟอนต์ที่อัปโหลดไว้หายไปแล้ว (เปิดหน้าใหม่) — อัปโหลดฟอนต์อีกครั้งเพื่อแก้ข้อความ");
  const s = 10 / f.unitsPerEm;
  const lineH = (f.ascent - f.descent + (f.lineGap || 0)) || f.unitsPerEm * 1.2;
  const raw: number[] = [];
  lines.forEach((line, li) => {
    if (!line) return;
    const run = f.layout(line);
    if (run.glyphs.some((g) => g.id === 0 && (g.codePoints ?? []).some((cp) => cp > 32)))
      throw new Error("ฟอนต์นี้ไม่มีบางตัวอักษรที่พิมพ์ (เช่น ฟอนต์อังกฤษกับข้อความไทย) — ลองฟอนต์อื่น");
    let pen = 0;
    const base = li * lineH;
    run.glyphs.forEach((g, i) => {
      const pos = run.positions[i];
      const ox = pen + pos.xOffset, oy = pos.yOffset;
      const X = (x: number) => (ox + x) * s, Y = (y: number) => (base - (oy + y)) * s;
      for (const c of g.path.commands) {
        const a = c.args;
        if (c.command === "moveTo") raw.push(OP.M, X(a[0]), Y(a[1]));
        else if (c.command === "lineTo") raw.push(OP.L, X(a[0]), Y(a[1]));
        else if (c.command === "quadraticCurveTo") raw.push(OP.Q, X(a[0]), Y(a[1]), X(a[2]), Y(a[3]));
        else if (c.command === "bezierCurveTo") raw.push(OP.C, X(a[0]), Y(a[1]), X(a[2]), Y(a[3]), X(a[4]), Y(a[5]));
        else if (c.command === "closePath") raw.push(OP.Z);
      }
      pen += pos.xAdvance;
    });
  });
  const cubic = mapOps(raw, (x, y) => [x, y]);
  const b = opsBox(cubic);
  if (!b || b.w <= 0 || b.h <= 0) throw new Error("ฟอนต์นี้ไม่มีตัวอักษรที่พิมพ์ (เช่น ฟอนต์อังกฤษกับข้อความไทย) — ลองฟอนต์อื่น");
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { d: mapOps(cubic, (x, y) => [r3(x - b.x), r3(y - b.y)]), w: r3(b.w), h: r3(b.h) };
}
