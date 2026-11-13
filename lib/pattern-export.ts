/**
 * 📤 ส่งออก / นำเข้าแพทเทิร์น (Bag CAD รอบ H) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   1) CSV รายการตัด + CSV สรุปวัสดุ (BOM) — เปิดใน Excel ภาษาไทยได้ (มี BOM UTF-8)
 *   2) ไฟล์โปรเจกต์ (.json) — ชิ้น ตะเข็บ ค่าแม่แบบ/วัสดุ/ชุดสี ครบ · นำเข้าแล้วได้แพทเทิร์นใหม่ที่แก้ต่อได้
 *   3) เทียบ 2 รุ่น (revision) — ชิ้นไหนเปลี่ยนขนาด / เพิ่ม / หาย
 *   4) ตรวจไฟล์ DXF ที่เพิ่งสร้างด้วยตัวอ่านของระบบเอง (อ่านกลับได้ครบชิ้น เส้นปิดครบ)
 *
 * ใช้ที่: components/pattern-sheet/print-view (CSV · ตรวจ DXF) · app/pattern-studio (ไฟล์โปรเจกต์ · เทียบรุ่น)
 * เทสต์: lib/__tests__/pattern-export.test.ts · คู่มือ: docs/pattern-studio.md (Bag CAD รอบ H)
 */
import type { PatternPiece } from "./pattern-sheet";
import { cleanProjectPieces, type ProjectPiece } from "./pattern-project";
import { cleanSeams, type Seam } from "./pattern-seams";
import { parseDxfPattern } from "./pattern-dxf-import";
import { pieceGeometry, shapeBox } from "./pattern-shape";

const r1 = (n: number) => Math.round(n * 10) / 10;

// ───────── 1) CSV ─────────
/** ช่องเดียวของ CSV (ครอบเครื่องหมายคำพูดเมื่อมี , " หรือขึ้นบรรทัด) */
export const csvCell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** ตาราง → ข้อความ CSV (ขึ้นต้นด้วย BOM ให้ Excel อ่านภาษาไทยถูก) */
export const toCsv = (rows: (string | number | null | undefined)[][]): string => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** CSV รายการตัด: 1 แถว = 1 แบบชิ้น — รหัส · ชื่อ · วัสดุ · ชนิด · กว้าง/ยาวตัด · จำนวนตัด · พื้นที่ตัดรวม · หมายเหตุ · รุ่น */
export function cutListCsv(pieces: PatternPiece[], meta: { rev?: number | null; code?: string } = {}): string {
  const rows: (string | number | null)[][] = [["รหัสชิ้น", "ชื่อ", "วัสดุ", "ชนิด", "กว้างตัด (ซม.)", "ยาวตัด (ซม.)", "ตัดต่อใบ", "พื้นที่ตัดรวม (ตร.ซม.)", "หมายเหตุ", "แพทเทิร์น", "รุ่น"]];
  for (const p of pieces) rows.push([p.id, p.name, p.material, p.group, p.w, p.h, p.count, r1((p.area ?? p.w * p.h) * p.count), p.note ?? "", meta.code ?? "", meta.rev ?? ""]);
  return toCsv(rows);
}
/** สรุปวัสดุต่อ 1 ใบ: วัสดุ · จำนวนชิ้นที่ตัด · พื้นที่ตัดรวม (ตร.ซม. / ตร.ม.) — ไม่รวมเผื่อเสียจากการวาง */
export function bomRows(pieces: PatternPiece[]): { material: string; pieces: number; area: number }[] {
  const m = new Map<string, { material: string; pieces: number; area: number }>();
  for (const p of pieces) { const x = m.get(p.material) ?? { material: p.material, pieces: 0, area: 0 }; x.pieces += p.count; x.area += (p.area ?? p.w * p.h) * p.count; m.set(p.material, x); }
  return [...m.values()].map((x) => ({ ...x, area: r1(x.area) })).sort((a, b) => b.area - a.area);
}
export function bomCsv(pieces: PatternPiece[], meta: { rev?: number | null; code?: string; qty?: number } = {}): string {
  const q = Math.max(1, Math.round(meta.qty ?? 1));
  const rows: (string | number | null)[][] = [["วัสดุ", "ชิ้นที่ตัดต่อใบ", "พื้นที่ตัดต่อใบ (ตร.ซม.)", "พื้นที่ตัดต่อใบ (ตร.ม.)", `ผลิต ${q} ใบ (ตร.ม.)`, "แพทเทิร์น", "รุ่น"]];
  for (const b of bomRows(pieces)) rows.push([b.material, b.pieces, b.area, Math.round(b.area / 100) / 100, Math.round((b.area * q) / 100) / 100, meta.code ?? "", meta.rev ?? ""]);
  return toCsv(rows);
}

// ───────── 2) ไฟล์โปรเจกต์ ─────────
export const PROJECT_FILE_KIND = "erp-pattern-project";
export type ProjectFile = { kind: typeof PROJECT_FILE_KIND; v: 1; exported_at: string; pattern_no?: string | null; name: string; sku_code?: string | null; note?: string; basis: "box" | "area"; pieces: ProjectPiece[]; seams: Seam[]; template: Record<string, unknown> | null };
export function buildProjectFile(p: { pattern_no?: string | null; name: string; sku_code?: string | null; note?: string; basis?: "box" | "area"; pieces: ProjectPiece[]; seams: Seam[]; template: Record<string, unknown> | null }, at = new Date()): string {
  const f: ProjectFile = { kind: PROJECT_FILE_KIND, v: 1, exported_at: at.toISOString(), pattern_no: p.pattern_no ?? null, name: p.name, sku_code: p.sku_code ?? null, note: p.note ?? "", basis: p.basis ?? "box", pieces: p.pieces, seams: p.seams, template: p.template };
  return JSON.stringify(f, null, 1);
}
/**
 * อ่านไฟล์โปรเจกต์ (หรือไฟล์สำรองจากปุ่มดาวน์โหลดสำรองเดิม) → ข้อมูลที่ผ่านตัวตรวจของระบบแล้ว · อ่านไม่ได้ = null
 *   ชิ้น/ตะเข็บผ่าน cleanProjectPieces / cleanSeams ตัวเดียวกับตอนบันทึก — ค่าแปลกถูกทิ้ง
 */
export function parseProjectFile(text: string): { name: string; basis: "box" | "area"; sku_code: string | null; note: string; pieces: ProjectPiece[]; seams: Seam[]; template: Record<string, unknown> | null; from: string | null } | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== PROJECT_FILE_KIND && r.kind !== "pattern-project-backup") return null;
  const pieces = cleanProjectPieces(r.pieces);
  if (!pieces.length) return null;
  const seams = cleanSeams(r.seams, new Set(pieces.map((p) => p.pid)));
  const tpl = r.template && typeof r.template === "object" && !Array.isArray(r.template) ? (r.template as Record<string, unknown>) : null;
  const { rev: _rev, ...template } = tpl ?? {}; void _rev;   // รุ่นเริ่มนับใหม่ในแพทเทิร์นใหม่
  return {
    name: (typeof r.name === "string" ? r.name : "").trim().slice(0, 120), basis: r.basis === "area" ? "area" : "box",
    sku_code: typeof r.sku_code === "string" && r.sku_code.trim() ? r.sku_code.trim().slice(0, 60) : null, note: typeof r.note === "string" ? r.note.slice(0, 2000) : "",
    pieces, seams, template: tpl ? template : null, from: typeof r.pattern_no === "string" ? r.pattern_no : null,
  };
}

// ───────── 3) เทียบ 2 รุ่น ─────────
export type RevDiff = { pid: string; name: string; status: "same" | "changed" | "added" | "removed"; dw: number; dh: number; darea: number };
/** เทียบชิ้นรุ่นเก่า (a) กับรุ่นใหม่ (b) ด้วยรหัสชิ้น: ขนาดสำเร็จ/พื้นที่ต่างกันเกิน 0.05 ซม. = เปลี่ยน */
export function compareRevisions(a: ProjectPiece[], b: ProjectPiece[]): RevDiff[] {
  const A = new Map(a.map((p) => [p.pid, p])), out: RevDiff[] = [];
  const size = (p: ProjectPiece) => { const g = pieceGeometry({ shape: p.shape, holes: p.holes }); const bx = shapeBox(p.shape); return { w: bx.w, h: bx.h, area: g.finishedArea }; };
  b.forEach((p, i) => {
    const o = A.get(p.pid), name = p.name || `ชิ้น ${i + 1}`;
    if (!o) { const s = size(p); out.push({ pid: p.pid, name, status: "added", dw: r1(s.w), dh: r1(s.h), darea: r1(s.area) }); return; }
    const s0 = size(o), s1 = size(p), dw = r1(s1.w - s0.w), dh = r1(s1.h - s0.h), darea = r1(s1.area - s0.area);
    out.push({ pid: p.pid, name, status: Math.abs(s1.w - s0.w) > 0.05 || Math.abs(s1.h - s0.h) > 0.05 || Math.abs(s1.area - s0.area) > 0.05 || (o.holes?.length ?? 0) !== (p.holes?.length ?? 0) ? "changed" : "same", dw, dh, darea });
  });
  const B = new Set(b.map((p) => p.pid));
  a.forEach((p, i) => { if (!B.has(p.pid)) { const s = size(p); out.push({ pid: p.pid, name: p.name || `ชิ้น ${i + 1}`, status: "removed", dw: -r1(s.w), dh: -r1(s.h), darea: -r1(s.area) }); } });
  return out;
}

// ───────── 4) ตรวจไฟล์ DXF ─────────
/** อ่านไฟล์ DXF ที่เพิ่งสร้างกลับด้วยตัวอ่านของระบบ: ได้ชิ้นครบไหม · ชั้นที่มี — ไม่ได้รับรองว่าใช้กับเครื่องตัดทุกยี่ห้อ */
export function checkDxf(text: string, expected: number): { ok: boolean; pieces: number; layers: string[] } {
  const layers = new Set<string>();
  const L = text.split(/\r?\n/);
  for (let i = 0; i + 1 < L.length; i += 2) if (L[i].trim() === "8") layers.add(L[i + 1].trim());
  const imp = parseDxfPattern(text, "mm");
  const n = imp?.pieces.length ?? 0;
  return { ok: n === expected && expected > 0, pieces: n, layers: [...layers].sort() };
}
