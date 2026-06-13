/**
 * ดึงค่าสำเร็จจาก "ตารางเทมเพลต" → เติมหลายฟิลด์ (cascade)
 * GET /api/bom/lookup-cascade?table=belt_template&value=<ชื่อรูปแบบ>
 *   → { fields: { <field key>: <ชื่อค่า> } } เอาไปเติมฟิลด์ในหน้าแก้รายละเอียดสั่งงาน
 * ตอนนี้รองรับ belt_template (รูปแบบเข็มขัด → เจาะรู/ห่วง/ปลายหาง/ไซส์กว้าง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// แมป: คอลัมน์ในตารางเทมเพลต → (ตารางที่ uuid ชี้, field key ปลายทาง)
const CASCADE: Record<string, { col: string; refTable: string; fieldKey: string }[]> = {
  belt_template: [
    { col: "belt_hole", refTable: "belt_hole", fieldKey: "belt_punch_print" },
    { col: "belt_loops", refTable: "belt_loops", fieldKey: "belt_loop" },
    { col: "belt_tail", refTable: "belt_tails", fieldKey: "belt_tail_end" },
    { col: "belt_size", refTable: "belt_width_size", fieldKey: "belt_width" },
  ],
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const table = sp.get("table") ?? "";
  const value = (sp.get("value") ?? "").trim();
  const map = CASCADE[table];
  if (!map || !value) return NextResponse.json({ fields: {}, error: null });

  const admin = supabaseAdmin();
  const cols = map.map((m) => m.col).join(", ");
  const { data: rows } = await admin.from(table).select(cols).eq("name", value).limit(1);
  const row = ((rows ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) return NextResponse.json({ fields: {}, error: null });

  const fields: Record<string, string> = {};
  await Promise.all(map.map(async (m) => {
    const refId = row[m.col] as string | null;
    if (!refId) return;
    const { data: ref } = await admin.from(m.refTable).select("name").eq("id", refId).maybeSingle();
    const name = (ref as { name?: string } | null)?.name;
    if (name) fields[m.fieldKey] = name;
  }));
  return NextResponse.json({ fields, error: null });
}
