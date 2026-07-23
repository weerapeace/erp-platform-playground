/**
 * /api/print-types — ประเภทงานพิมพ์ (DTF/UV/…) + ขนาดเริ่มต้นต่อประเภท (ตั้งค่าเองได้ ไม่ต้องแก้โค้ด)
 *   GET  → รายการที่เปิดใช้ (เรียงตาม sort_order)
 *   POST → เพิ่มประเภทใหม่ { code, name, default_w, default_h, unit }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi, apiCan } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type PrintType = { id: string; code: string; name: string; default_w: number | null; default_h: number | null; unit: string; drive_subpath: string | null; sort_order: number };
const SEL = "id, code, name, default_w, default_h, unit, drive_subpath, sort_order";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // อ่านได้ทั้งคนใช้คลัง (assets.view) และคนสร้างงานเรียงพิมพ์ (tasks.view) — เป็น lookup กลาง
  if (!(await apiCan(request, "assets.view")) && !(await apiCan(request, "tasks.view")))
    return NextResponse.json({ data: [], error: "ต้องเข้าสู่ระบบและมีสิทธิ์ใช้งาน (assets.view หรือ tasks.view)" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_print_types")
    .select(SEL)
    .eq("is_active", true).order("sort_order", { ascending: true }).order("code", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as PrintType[], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  let b: { code?: string; name?: string; default_w?: number | string | null; default_h?: number | string | null; unit?: string; drive_subpath?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const code = String(b.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "ต้องใส่รหัสประเภท (เช่น DTF)" }, { status: 400 });
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

  const admin = supabaseAdmin();
  const { data: mx } = await admin.from("erp_print_types").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("erp_print_types").insert({
    code, name: String(b.name ?? "").trim() || code,
    default_w: num(b.default_w), default_h: num(b.default_h), unit: String(b.unit ?? "cm").trim() || "cm",
    drive_subpath: String(b.drive_subpath ?? "").trim() || null,
    sort_order: ((mx?.sort_order as number | undefined) ?? 0) + 1,
  }).select(SEL).single();
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? `มีประเภท "${code}" อยู่แล้ว` : error.message }, { status: 400 });
  return NextResponse.json({ data: data as PrintType, error: null });
}
