/**
 * ✂️ วางแบบบนผ้าลาย — ของใช้ร่วมของ API /api/fabric-lay/{fabrics|patterns|plans}
 *   สิทธิ์ fabric_lay.view (ดู) / fabric_lay.edit (สร้าง/แก้/ลบ) · ตาราง fabric_lay_* (RLS service-only)
 *   ตรวจค่าทุกครั้งด้วย lib/fabric-lay (cleanLayPieces · cleanBags · cleanItems) · audit ทุกการเขียน (ก้อน JSON จดเป็น "แก้รายละเอียด" + จำนวน)
 *   ลบ = ย้ายเข้าถังขยะ (is_active=false) · ลบถาวรได้เฉพาะในถังขยะ
 */
import { NextResponse } from "next/server";
import { cleanBags, cleanChecks, cleanItems, cleanLayPieces, cleanSettings, type LayBag } from "@/lib/fabric-lay";

export const VIEW_PERM = "fabric_lay.view";
export const EDIT_PERM = "fabric_lay.edit";
export const UUID = /^[0-9a-f-]{36}$/i;

export const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

type Clean = { ok: true; patch: Record<string, unknown> } | { ok: false; error: string };
type Before = Record<string, unknown> | null;

export type Resource = {
  table: string; entity: string; noun: string;
  listCols: string;
  /** ช่องก้อน JSON — audit จดแค่ว่าแก้ (ไม่จดค่าเต็ม) */
  opaque: string[];
  clean: (body: Record<string, unknown>, partial: boolean, before: Before) => Clean;
};

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
const num = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
};
const uuidOrNull = (v: unknown): string | null | undefined => (v == null || v === "" ? null : UUID.test(String(v)) ? String(v) : undefined);
const needName = (body: Record<string, unknown>, partial: boolean, patch: Record<string, unknown>, what: string): string | null => {
  if ("name" in body || !partial) {
    const n = text(body.name, 120);
    if (!n) return `ต้องใส่ชื่อ${what}`;
    patch.name = n;
  }
  return null;
};
const done = (patch: Record<string, unknown>, partial: boolean): Clean =>
  partial && !Object.keys(patch).length ? { ok: false, error: "ไม่มีช่องที่ต้องแก้" } : { ok: true, patch };

export const FABRICS: Resource = {
  table: "fabric_lay_fabrics", entity: "fabric_lay_fabrics", noun: "ผ้า",
  listCols: "id, code, name, kind, note, image_key, photo_key, img_w, img_h, width_cm, height_cm, used_area_cm2, is_active, created_at, updated_at, deleted_at",
  opaque: ["quad", "checks"],
  clean(body, partial) {
    const patch: Record<string, unknown> = {};
    const e = needName(body, partial, patch, "ผ้า"); if (e) return { ok: false, error: e };
    for (const k of ["kind", "note"] as const) if (k in body) patch[k] = text(body[k], k === "note" ? 2000 : 60);
    for (const k of ["photo_key", "image_key"] as const) if (k in body) {
      const v = text(body[k], 400);
      if (v && !/^[A-Za-z0-9._/-]+$/.test(v)) return { ok: false, error: "ที่เก็บรูปไม่ถูกต้อง" };
      patch[k] = v;
    }
    for (const [k, min, max] of [["img_w", 1, 20000], ["img_h", 1, 20000], ["width_cm", 1, 2000], ["height_cm", 1, 2000]] as const) if (k in body) {
      const v = num(body[k], min, max);
      if (v === undefined) return { ok: false, error: k.endsWith("cm") ? "ขนาดผ้าต้องอยู่ระหว่าง 1–2000 ซม." : "ขนาดรูปไม่ถูกต้อง" };
      patch[k] = k.startsWith("img") && v != null ? Math.round(v) : v;
    }
    if ("quad" in body) {
      const q = body.quad;
      if (q == null) patch.quad = null;
      else if (Array.isArray(q) && q.length === 4 && q.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(Number(n))))) patch.quad = q.map((p) => (p as unknown[]).map(Number));
      else return { ok: false, error: "มุมผ้าไม่ถูกต้อง" };
    }
    if ("checks" in body) patch.checks = cleanChecks(body.checks);
    if ("is_active" in body) patch.is_active = body.is_active === true;
    return done(patch, partial);
  },
};

export const PATTERNS: Resource = {
  table: "fabric_lay_patterns", entity: "fabric_lay_patterns", noun: "แบบตัด",
  listCols: "id, code, name, parent_sku_id, parent_code, design_sheet_id, design_sheet_code, bag_image, piece_count, note, is_active, created_at, updated_at, deleted_at",
  opaque: ["pieces"],
  clean(body, partial) {
    const patch: Record<string, unknown> = {};
    const e = needName(body, partial, patch, "แบบตัด"); if (e) return { ok: false, error: e };
    for (const k of ["parent_sku_id", "design_sheet_id", "pattern_project_id"] as const) if (k in body) {
      const v = uuidOrNull(body[k]);
      if (v === undefined) return { ok: false, error: "สินค้า/ใบงานที่เลือกไม่ถูกต้อง" };
      patch[k] = v;
    }
    for (const k of ["parent_code", "design_sheet_code"] as const) if (k in body) patch[k] = text(body[k], 80);
    if ("bag_image" in body) patch.bag_image = text(body.bag_image, 600);
    if ("note" in body) patch.note = text(body.note, 2000);
    if ("pieces" in body) {
      const r = cleanLayPieces(body.pieces);
      if (!r.ok) return { ok: false, error: r.error };
      patch.pieces = r.value;
    }
    if ("is_active" in body) patch.is_active = body.is_active === true;
    return done(patch, partial);
  },
};

export const PLANS: Resource = {
  table: "fabric_lay_plans", entity: "fabric_lay_plans", noun: "แผนวาง",
  listCols: "id, code, name, fabric_id, bags, note, cut_area_cm2, cut_done_at, cut_done_by, is_active, created_at, updated_at, deleted_at",
  opaque: ["bags", "items", "settings"],
  clean(body, partial, before) {
    const patch: Record<string, unknown> = {};
    const e = needName(body, partial, patch, "แผน"); if (e) return { ok: false, error: e };
    if ("fabric_id" in body || !partial) {
      if (!UUID.test(String(body.fabric_id ?? ""))) return { ok: false, error: "ต้องเลือกผ้า" };
      patch.fabric_id = String(body.fabric_id);
    }
    let bags: LayBag[] = (before?.bags as LayBag[] | undefined) ?? [];
    if ("bags" in body) {
      const r = cleanBags(body.bags);
      if (!r.ok) return { ok: false, error: r.error };
      bags = r.value; patch.bags = bags;
    }
    if ("items" in body) {
      const r = cleanItems(body.items, bags);
      if (!r.ok) return { ok: false, error: r.error };
      patch.items = r.value;
    } else if ("bags" in body && before) {
      // เอากระเป๋าออก → ชิ้นของใบนั้นออกด้วย
      const keys = new Set(bags.map((b) => b.key));
      patch.items = ((before.items as { bag: string }[] | undefined) ?? []).filter((i) => keys.has(i.bag));
    }
    if ("settings" in body) patch.settings = cleanSettings(body.settings);
    if ("note" in body) patch.note = text(body.note, 2000);
    if ("cut_area_cm2" in body) {
      const v = num(body.cut_area_cm2, 0, 4_000_000);
      if (v === undefined || v === null) return { ok: false, error: "พื้นที่ที่ตัดไม่ถูกต้อง" };
      patch.cut_area_cm2 = v;
    }
    if ("cut_done" in body) patch.cut_done_at = body.cut_done === true ? new Date().toISOString() : null;
    if ("is_active" in body) patch.is_active = body.is_active === true;
    return done(patch, partial);
  },
};

export const RESOURCES: Record<string, Resource> = { fabrics: FABRICS, patterns: PATTERNS, plans: PLANS };

/** ป้ายสรุปในประวัติ (แทนก้อน JSON) */
export function auditSummary(r: Resource, row: Record<string, unknown>): Record<string, unknown> {
  if (r === PATTERNS) return { pieces: Array.isArray(row.pieces) ? row.pieces.length : undefined, parent: row.parent_code ?? undefined };
  if (r === PLANS) return { bags: Array.isArray(row.bags) ? row.bags.length : undefined, items: Array.isArray(row.items) ? row.items.length : undefined };
  return { size: row.width_cm ? `${row.width_cm}×${row.height_cm} ซม.` : undefined };
}

/** ข้อผิดพลาดฐานข้อมูลที่รู้จัก → ภาษาคน */
export function knownDbError(msg: string): string | null {
  if (/fabric_lay_patterns_parent_uq/.test(msg)) return "สินค้านี้มีแบบตัดอยู่แล้ว — เปิดแบบตัดเดิมแทน (1 สินค้า = 1 แบบตัด)";
  if (/fabric_lay_patterns_sheet_uq/.test(msg)) return "ใบงานนี้มีแบบตัดอยู่แล้ว — เปิดแบบตัดเดิมแทน";
  if (/fabric_lay_plans_fabric_id_fkey/.test(msg)) return "ผ้าผืนนี้ยังมีแผนวางอยู่ — ลบแผนของผ้านี้ถาวรก่อน";
  return null;
}
