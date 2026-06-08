/**
 * สิทธิ์ระดับฟิลด์ (Field-level permission) — ของกลาง ใช้ทุกโมดูล
 *
 * อ่านจากทะเบียนฟิลด์ (erp_module_fields):
 *   - view_roles text[]  : roles ที่เห็นฟิลด์นี้ได้ (null/ว่าง = ทุกคน)
 *   - edit_roles text[]  : roles ที่แก้ฟิลด์นี้ได้ (null/ว่าง = ทุกคน)
 * admin เห็น/แก้ได้ทุกอย่างเสมอ (กันล็อกตัวเองออก)
 *
 * บังคับใช้ที่ "เซิร์ฟเวอร์" (ไม่ใช่แค่ซ่อนหน้าจอ):
 *   - hiddenCols   → ตัดออกจาก response (คนไม่มีสิทธิ์เห็นจะไม่ได้รับข้อมูลเลย)
 *   - readonlyCols → ตัดออกจาก payload ก่อนเขียน (แก้ไม่ได้ = ของเดิมไม่ถูกแตะ)
 */
import type { NextRequest } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export type FieldAccess = { hiddenCols: string[]; readonlyCols: string[] };
const EMPTY: FieldAccess = { hiddenCols: [], readonlyCols: [] };

// perf: แคช "ฟิลด์ที่จำกัดสิทธิ์ต่อตาราง" (config เปลี่ยนไม่บ่อย) — ลด DB round-trip 2 ครั้ง/คำขอ
// คีย์ = tableName · TTL สั้น ๆ (กันค่าค้างนานถ้า admin แก้สิทธิ์)
type RestrictedField = { column_name: string; view_roles: string[] | null; edit_roles: string[] | null };
const META_TTL_MS = 30_000;
const metaCache = new Map<string, { at: number; restricted: RestrictedField[] }>();

async function loadRestrictedMeta(admin: Admin, tableName: string): Promise<RestrictedField[]> {
  const hit = metaCache.get(tableName);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.restricted;

  const { data: mod } = await admin.from("erp_modules").select("id").eq("table_name", tableName).maybeSingle();
  if (!mod) { metaCache.set(tableName, { at: Date.now(), restricted: [] }); return []; }

  const { data: flds } = await admin.from("erp_module_fields")
    .select("column_name, view_roles, edit_roles")
    .eq("module_id", mod.id)
    .or("view_roles.not.is.null,edit_roles.not.is.null");

  const restricted = ((flds ?? []) as RestrictedField[]).filter((f) => {
    const vr = f.view_roles; const er = f.edit_roles;
    return f.column_name && (((vr?.length ?? 0) > 0) || ((er?.length ?? 0) > 0));
  });
  metaCache.set(tableName, { at: Date.now(), restricted });
  return restricted;
}

async function getUserRole(request: NextRequest): Promise<string> {
  try {
    const { data } = await supabaseFromRequest(request).rpc("erp_current_user");
    const p = data as { role?: string | null } | null;
    return p?.role ?? "viewer"; // ไม่ทราบ role → ถือว่าสิทธิ์ต่ำสุด (ปลอดภัยไว้ก่อน)
  } catch { return "viewer"; }
}

/**
 * คำนวณสิทธิ์ระดับฟิลด์ของ user ปัจจุบัน สำหรับตารางหนึ่ง
 * (ลัดวงจร: ถ้าโมดูลไม่มีฟิลด์ที่จำกัดสิทธิ์เลย → ไม่ต้องเช็ค role)
 */
export async function getFieldAccess(request: NextRequest, admin: Admin, tableName: string): Promise<FieldAccess> {
  const restricted = await loadRestrictedMeta(admin, tableName);
  if (restricted.length === 0) return EMPTY;

  const role = await getUserRole(request);
  if (role === "admin") return EMPTY;

  const hiddenCols: string[] = [];
  const readonlyCols: string[] = [];
  for (const f of restricted) {
    const col = String(f.column_name);
    const vr = (f.view_roles as string[] | null) ?? [];
    const er = (f.edit_roles as string[] | null) ?? [];
    if (vr.length > 0 && !vr.includes(role)) hiddenCols.push(col);
    if (er.length > 0 && !er.includes(role)) readonlyCols.push(col);
  }
  return { hiddenCols, readonlyCols };
}

/** ตัดคอลัมน์ที่ห้ามเห็นออกจากแต่ละแถว */
export function stripHidden<T extends Record<string, unknown>>(rows: T[], hiddenCols: string[]): T[] {
  if (hiddenCols.length === 0) return rows;
  const set = new Set(hiddenCols);
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(r)) if (!set.has(k)) o[k] = r[k];
    return o as T;
  });
}

/** ตัดคอลัมน์ที่ห้ามแก้ออกจาก payload — คืน {clean, skipped} */
export function stripReadonly(
  payload: Record<string, unknown>,
  readonlyCols: string[],
): { clean: Record<string, unknown>; skipped: string[] } {
  if (readonlyCols.length === 0) return { clean: payload, skipped: [] };
  const set = new Set(readonlyCols);
  const clean: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (set.has(k)) skipped.push(k); else clean[k] = v;
  }
  return { clean, skipped };
}
