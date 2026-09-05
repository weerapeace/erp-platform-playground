/**
 * คอลัมน์ "ประเภทงาน" ของแม่แบบตารางขั้นตอนงาน — /api/bom/work-steps/columns
 *   GET → { data: string[] (คอลัมน์ที่ใช้พิมพ์), ops: string[] (ทะเบียนประเภทงานที่บันทึกไว้ — ตัวช่วย @) }   สิทธิ์ products.view
 *   PUT { columns?: string[], ops?: string[] } → บันทึกส่วนที่ส่งมา (ทั้งระบบใช้ชุดเดียวกัน)  สิทธิ์ products.edit
 *       บันทึก columns แล้ว ชื่อใหม่ (แยกตาม "+") จะถูกเติมเข้าทะเบียน ops ให้อัตโนมัติ
 * เก็บใน app_settings.work_step_columns / work_step_ops (singleton id=1) — แบบเดียวกับ offer_columns
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const DEFAULT_WORK_STEP_COLUMNS = ["ทับ", "เย็บตรง", "เย็บโค้ง", "เย็บเข้าไป", "ทากาว", "ติดกาว", "เจาะรู"];

const clean = (v: unknown, max = 20): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, max) : [];

async function readAll() {
  const { data } = await supabaseAdmin().from("app_settings").select("work_step_columns, work_step_ops").eq("id", 1).maybeSingle();
  const row = data as { work_step_columns?: unknown; work_step_ops?: unknown } | null;
  const cols = clean(row?.work_step_columns);
  return { columns: cols.length ? cols : DEFAULT_WORK_STEP_COLUMNS, ops: clean(row?.work_step_ops, 200) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const all = await readAll();
  return NextResponse.json({ data: all.columns, ops: all.ops, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { columns?: unknown; ops?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const cur = await readAll();
  const patch: Record<string, unknown> = {};
  let ops = cur.ops;
  if (body.ops !== undefined) { ops = clean(body.ops, 200); patch.work_step_ops = ops; }
  if (body.columns !== undefined) {
    const cols = clean(body.columns);
    if (cols.length === 0) return NextResponse.json({ error: "ต้องมีคอลัมน์อย่างน้อย 1 ช่อง" }, { status: 400 });
    patch.work_step_columns = cols;
    // เรียนรู้ชื่อใหม่เข้าทะเบียน (แยก "ทากาว + ติดกาว" เป็น 2 ชื่อ)
    const learned = cols.flatMap((c) => c.split("+").map((x) => x.trim()).filter(Boolean));
    const merged = [...new Set([...ops, ...learned])];
    if (merged.length !== ops.length) { ops = merged; patch.work_step_ops = ops; }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้บันทึก" }, { status: 400 });
  const { error } = await supabaseAdmin().from("app_settings").update(patch).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (patch.work_step_columns as string[] | undefined) ?? cur.columns, ops, error: null });
}
