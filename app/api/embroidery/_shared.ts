/**
 * 🧵 ไฟล์ปัก — ของใช้ร่วมของ API /api/embroidery/designs
 *   สิทธิ์ embroidery.view (ดู/ดาวน์โหลด) / embroidery.edit (สร้าง/แก้/ลบ) · ตาราง embroidery_designs (RLS service-only)
 *   ชิ้นตรวจด้วย cleanPieces (lib/block-print — รูปแบบเดียวกับบล็อกพิมพ์) · ค่าตั้งตรวจด้วย cleanSettings (lib/embroidery)
 */
import { NextResponse } from "next/server";
import { cleanPieces, type BlockPiece } from "@/lib/block-print";
import { cleanSettings, STITCH_TYPES, type EmbSettings } from "@/lib/embroidery";

export const VIEW_PERM = "embroidery.view";
export const EDIT_PERM = "embroidery.edit";
export const TABLE = "embroidery_designs";
export const ENTITY = "embroidery_designs";
/** คอลัมน์หน้ารายการ (ไม่ดึงเส้นของชิ้น — ก้อนใหญ่) */
export const LIST_COLS = "id, code, name, note, source_file_name, parent_sku_id, stitch_count, color_count, width_mm, height_mm, is_active, created_at, updated_at, deleted_at, parent:parent_skus_v2(id, code, name)";

export const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });
const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v: unknown) => typeof v === "string" && UUID.test(v);

export type DesignPatch = {
  name?: string; note?: string | null; source_file_name?: string | null; parent_sku_id?: string | null;
  pieces?: BlockPiece[]; settings?: EmbSettings;
  stitch_count?: number; color_count?: number; width_mm?: number | null; height_mm?: number | null; is_active?: boolean;
};

const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const mm = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(9999, Math.round(Number(v) * 100) / 100) : null);

/** ตรวจ/ทำความสะอาดค่าที่ส่งมา · partial = แก้บางช่อง · piecesNow = ชิ้นเดิม (ใช้ตรวจค่าตั้งตอนแก้แค่ค่าตั้ง) */
export function cleanDesignBody(body: Record<string, unknown>, partial: boolean, piecesNow: BlockPiece[] = []): { ok: true; patch: DesignPatch } | { ok: false; error: string } {
  const patch: DesignPatch = {};
  if ("name" in body || !partial) {
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "ต้องใส่ชื่องาน" };
    patch.name = name;
  }
  if ("note" in body) patch.note = String(body.note ?? "").trim().slice(0, 2000) || null;
  if ("source_file_name" in body) patch.source_file_name = String(body.source_file_name ?? "").trim().slice(0, 200) || null;
  if ("parent_sku_id" in body) {
    if (body.parent_sku_id != null && body.parent_sku_id !== "" && !isUuid(body.parent_sku_id)) return { ok: false, error: "สินค้าที่ผูกไม่ถูกต้อง" };
    patch.parent_sku_id = body.parent_sku_id ? String(body.parent_sku_id) : null;
  }
  let pieces = piecesNow;
  if ("pieces" in body || !partial) {
    const r = cleanPieces(body.pieces);
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.pieces.length) return { ok: false, error: "ไฟล์นี้ไม่มีชิ้นเวกเตอร์ให้ปัก" };
    patch.pieces = r.pieces; pieces = r.pieces;
  }
  if ("settings" in body || patch.pieces) patch.settings = cleanSettings(body.settings ?? {}, pieces);
  if ("stitch_count" in body) patch.stitch_count = int(body.stitch_count, 10_000_000);
  if ("color_count" in body) patch.color_count = int(body.color_count, 999);
  if ("width_mm" in body) patch.width_mm = mm(body.width_mm);
  if ("height_mm" in body) patch.height_mm = mm(body.height_mm);
  if ("is_active" in body) patch.is_active = body.is_active === true;
  if (partial && !Object.keys(patch).length) return { ok: false, error: "ไม่มีช่องที่ต้องแก้" };
  return { ok: true, patch };
}

const typeTh = (k: string) => STITCH_TYPES.find((t) => t.key === k)?.th ?? k;
/** ค่าตั้งที่เปลี่ยน → แถวประวัติภาษาคน (ไม่จดทั้งก้อน) */
export function settingsAuditChanges(before: Partial<EmbSettings> | null | undefined, after: EmbSettings): { field: string; label: string; old: string | null; new: string | null }[] {
  const out: { field: string; label: string; old: string | null; new: string | null }[] = [];
  const b = before ?? {};
  const f = (k: keyof EmbSettings, label: string) => {
    const o = b[k] == null ? null : String(b[k]), n = after[k] == null ? null : String(after[k]);
    if (o !== n) out.push({ field: `settings.${k}`, label, old: o, new: n });
  };
  f("width_mm", "กว้าง (มม.)"); f("fill_spacing", "ระยะแถวถมเต็ม"); f("satin_spacing", "ระยะฝีซิกแซก"); f("fill_len", "ความยาวฝีถม"); f("run_len", "ความยาวฝีเดินเส้น"); f("pull_comp", "ชดเชยผ้าหด");
  for (const [c, v] of Object.entries(after.colors)) {
    const o = b.colors?.[c];
    if (!o) continue;
    if (o.type !== v.type) out.push({ field: `settings.colors.${c}.type`, label: `ฝีเข็มสี ${c}`, old: typeTh(o.type), new: typeTh(v.type) });
    if (o.angle !== v.angle) out.push({ field: `settings.colors.${c}.angle`, label: `มุมสี ${c}`, old: String(o.angle), new: String(v.angle) });
    if ((o.thread ?? "") !== v.thread) out.push({ field: `settings.colors.${c}.thread`, label: `รหัสด้ายสี ${c}`, old: o.thread || null, new: v.thread || null });
    if ((o.on !== false) !== v.on) out.push({ field: `settings.colors.${c}.on`, label: `ปักสี ${c}`, old: o.on !== false ? "ปัก" : "ไม่ปัก", new: v.on ? "ปัก" : "ไม่ปัก" });
  }
  if ((b.color_order ?? []).join(",") !== after.color_order.join(",")) out.push({ field: "settings.color_order", label: "ลำดับสี", old: (b.color_order ?? []).join(" → ") || null, new: after.color_order.join(" → ") });
  const bp = b.piece_types ?? {};
  for (const id of new Set([...Object.keys(bp), ...Object.keys(after.piece_types)])) {
    if (bp[id] !== after.piece_types[id]) out.push({ field: `settings.piece_types.${id}`, label: `ฝีเข็มชิ้น ${id}`, old: bp[id] ? typeTh(bp[id]) : "ตามสี", new: after.piece_types[id] ? typeTh(after.piece_types[id]) : "ตามสี" });
  }
  return out.slice(0, 60);
}
