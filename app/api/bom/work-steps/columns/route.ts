/**
 * คอลัมน์ "ประเภทงาน" ของแม่แบบตารางขั้นตอนงาน — /api/bom/work-steps/columns
 *   GET → string[] (เช่น ทับ, เย็บตรง, เย็บโค้ง, ทากาว…)   สิทธิ์ products.view
 *   PUT { columns: string[] } → บันทึก (ทั้งระบบใช้ชุดเดียวกัน)  สิทธิ์ products.edit
 * เก็บใน app_settings.work_step_columns (singleton id=1) — แบบเดียวกับ offer_columns
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const DEFAULT_WORK_STEP_COLUMNS = ["ทับ", "เย็บตรง", "เย็บโค้ง", "เย็บเข้าไป", "ทากาว", "ติดกาว", "เจาะรู"];

const clean = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 20) : [];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("app_settings").select("work_step_columns").eq("id", 1).maybeSingle();
  const cols = clean((data as { work_step_columns?: unknown } | null)?.work_step_columns);
  return NextResponse.json({ data: cols.length ? cols : DEFAULT_WORK_STEP_COLUMNS, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { columns?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const cols = clean(body.columns);
  if (cols.length === 0) return NextResponse.json({ error: "ต้องมีคอลัมน์อย่างน้อย 1 ช่อง" }, { status: 400 });
  const { error } = await supabaseAdmin().from("app_settings").update({ work_step_columns: cols }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: cols, error: null });
}
