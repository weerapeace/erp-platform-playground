/**
 * ของใช้ร่วมของ API งานจัดเรียงงานพิมพ์ (Nesting) — ตาราง erp_nesting_jobs
 *
 * ตัวคำนวณจริง = "ตัวช่วยจัดเรียง" ที่ลงในเครื่องผู้ใช้ (tools/nesting-app) — ERP เก็บแค่งาน:
 *   settings = ค่าตั้งแผ่น/ระยะ/การหมุน/โหมด (รูปแบบเดียวกับหน้าตัวช่วย)
 *   items    = ลายที่จะจัด (จากคลัง Artwork + ขนาด + จำนวน) + ไฟล์ PNG จริงที่ลากในเครื่อง (ชื่อ + sha)
 *   result   = สรุปผลล่าสุด (ยาวที่ใช้ / จำนวนแผ่น / วางได้กี่ชิ้น)
 */
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

type Admin = ReturnType<typeof supabaseAdmin>;

export const NESTING_STATUSES = ["draft", "done", "printed"] as const;
export type NestingStatus = (typeof NESTING_STATUSES)[number];
export const SIZE_MODES = ["natural", "width", "height", "scale", "max"] as const;
export type SizeMode = (typeof SIZE_MODES)[number];

export type NestingItem = {
  key: string;                       // รหัสแถว (ใช้จับคู่ผล "ได้จริงกี่ชิ้น" กลับไปที่แถว)
  asset_id: string | null;           // ลายในคลัง Artwork (ไม่บังคับ — ลากไฟล์อย่างเดียวก็ได้)
  title: string;
  size: { mode: SizeMode; value: number | null };   // value = mm (หรือ % เมื่อ mode=scale)
  qty: number;
  fill_pct: number;                  // โหมดเติมเต็มแผ่น: สัดส่วนจำนวนชิ้นที่เติม (%)
  file: { name: string; sha: string } | null;       // ไฟล์ PNG จริงที่ลากในเครื่อง (sha = รหัสไฟล์ในตัวช่วย)
};

export type NestingResult = {
  used_length_mm: number; sheets: number; placed: number; total: number; utilization: number; filled: number;
};

export type NestingJobRow = {
  id: string; name: string; status: NestingStatus; print_type_id: string | null;
  print_type: { code: string; name: string } | null;
  settings: Record<string, unknown>; items: NestingItem[]; result: NestingResult | null;
  created_by_name: string | null; updated_by_name: string | null; created_at: string; updated_at: string;
};

export const SELECT = "id, name, status, print_type_id, settings, items, result, created_by_name, updated_by_name, created_at, updated_at, print_type:erp_print_types(code, name)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{16}$/;
const MAX_ITEMS = 300;

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function cleanName(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function cleanStatus(v: unknown): NestingStatus | null {
  return (NESTING_STATUSES as readonly string[]).includes(String(v)) ? (v as NestingStatus) : null;
}

export function cleanUuid(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v : null;
}

/** ค่าตั้ง = object เล็ก ๆ (กันใครยัดข้อมูลก้อนใหญ่) */
export function cleanSettings(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return JSON.stringify(v).length > 20_000 ? null : (v as Record<string, unknown>);
}

export function cleanItems(v: unknown): NestingItem[] | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, MAX_ITEMS).map((raw, i) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const s = (o.size && typeof o.size === "object" ? o.size : {}) as Record<string, unknown>;
    const mode = (SIZE_MODES as readonly string[]).includes(String(s.mode)) ? (s.mode as SizeMode) : "natural";
    const f = (o.file && typeof o.file === "object" ? o.file : null) as Record<string, unknown> | null;
    const sha = f && typeof f.sha === "string" && SHA.test(f.sha) ? f.sha : null;
    return {
      key: String(o.key ?? "").slice(0, 40) || `i${i}`,
      asset_id: cleanUuid(o.asset_id),
      title: String(o.title ?? "").trim().slice(0, 200),
      size: { mode, value: mode === "natural" ? null : num(s.value) },
      qty: Math.max(0, Math.floor(num(o.qty) ?? 0)),
      fill_pct: Math.min(100, Math.max(0, num(o.fill_pct) ?? 0)),
      file: sha ? { name: String(f?.name ?? "").slice(0, 200), sha } : null,
    };
  });
}

export function cleanResult(v: unknown): NestingResult | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    used_length_mm: num(o.used_length_mm) ?? 0, sheets: num(o.sheets) ?? 0, placed: num(o.placed) ?? 0,
    total: num(o.total) ?? 0, utilization: num(o.utilization) ?? 0, filled: num(o.filled) ?? 0,
  };
}

/** ผู้ทำ — ชื่อจาก user_profiles (ไม่มีใช้อีเมล) */
export async function actorOf(request: NextRequest, admin: Admin): Promise<{ id: string | null; name: string | null }> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return { id: null, name: null };
  const { data: prof } = await admin.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { id: user.id, name: (prof?.display_name as string | null) || user.email || null };
}

export function toJob(r: Record<string, unknown>): NestingJobRow {
  const pt = (Array.isArray(r.print_type) ? r.print_type[0] : r.print_type) as { code: string; name: string } | null;
  return {
    id: String(r.id), name: String(r.name ?? ""), status: (cleanStatus(r.status) ?? "draft"),
    print_type_id: (r.print_type_id as string | null) ?? null, print_type: pt ?? null,
    settings: (r.settings as Record<string, unknown>) ?? {}, items: cleanItems(r.items) ?? [],
    result: r.result ? cleanResult(r.result) : null,
    created_by_name: (r.created_by_name as string | null) ?? null, updated_by_name: (r.updated_by_name as string | null) ?? null,
    created_at: String(r.created_at), updated_at: String(r.updated_at),
  };
}
