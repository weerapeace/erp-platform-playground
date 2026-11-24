/**
 * 🧱 บล็อกพิมพ์ — ของใช้ร่วมของ API /api/block-print/jobs
 *   สิทธิ์ block_print.view (ดู) / block_print.edit (สร้าง/แก้/ลบ) · ตาราง block_print_jobs (RLS service-only)
 *   ตรวจค่าทุกครั้งด้วย cleanPieces (lib/block-print) + cleanLayouts (lib/block-print-layout — แท็บจัดวางในบล็อก) · audit ทุกการเขียน (ชิ้นจดเป็นรายชิ้น ไม่จดเส้นทั้งก้อน)
 */
import { NextResponse } from "next/server";
import { cleanPieces, PAPERS, type BlockPiece } from "@/lib/block-print";
import { cleanLayouts, type BlockLayout } from "@/lib/block-print-layout";

export const VIEW_PERM = "block_print.view";
export const EDIT_PERM = "block_print.edit";
export const TABLE = "block_print_jobs";
export const ENTITY = "block_print_jobs";
/** คอลัมน์หน้ารายการ (ไม่ดึงเส้นของชิ้น — ก้อนใหญ่) */
export const LIST_COLS = "id, code, name, note, source_file_name, unit, paper, is_active, created_at, updated_at, deleted_at, piece_count, piece_on";

export const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export type JobPatch = { name?: string; note?: string | null; source_file_name?: string | null; unit?: string; paper?: string; pieces?: BlockPiece[]; layouts?: BlockLayout[]; is_active?: boolean };

/** ตรวจ/ทำความสะอาดค่าที่ส่งมา · partial = แก้บางช่อง */
export function cleanJobBody(body: Record<string, unknown>, partial: boolean): { ok: true; patch: JobPatch } | { ok: false; error: string } {
  const patch: JobPatch = {};
  if ("name" in body || !partial) {
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "ต้องใส่ชื่องาน" };
    patch.name = name;
  }
  if ("note" in body) patch.note = String(body.note ?? "").trim().slice(0, 2000) || null;
  if ("source_file_name" in body) patch.source_file_name = String(body.source_file_name ?? "").trim().slice(0, 200) || null;
  if ("unit" in body) {
    if (body.unit !== "cm" && body.unit !== "mm") return { ok: false, error: "หน่วยต้องเป็น ซม. หรือ มม." };
    patch.unit = body.unit;
  }
  if ("paper" in body) {
    if (typeof body.paper !== "string" || !(body.paper in PAPERS)) return { ok: false, error: "ขนาดกระดาษไม่ถูกต้อง" };
    patch.paper = body.paper;
  }
  if ("pieces" in body) {
    const r = cleanPieces(body.pieces);
    if (!r.ok) return { ok: false, error: r.error };
    patch.pieces = r.pieces;
  }
  if ("layouts" in body) {
    const r = cleanLayouts(body.layouts);
    if (!r.ok) return { ok: false, error: r.error };
    patch.layouts = r.layouts;
  }
  if ("is_active" in body) patch.is_active = body.is_active === true;
  if (partial && !Object.keys(patch).length) return { ok: false, error: "ไม่มีช่องที่ต้องแก้" };
  return { ok: true, patch };
}
