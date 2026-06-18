/**
 * ประวัติงานเสียต่อช่าง (กลุ่ม B) — /api/mo/craftsman-defects
 * GET → รวมจำนวนงานเสียจาก defect_logs จัดกลุ่มตามชื่อผู้รับงาน (worker = assignee_name)
 *       ใช้เตือนตอนจ่ายงานให้ช่างที่เคยมีงานเสีย (จับด้วยชื่อ — worker ยังไม่ผูก id)
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CraftsmanDefect = { worker: string; count: number; qty: number; last_at: string | null; types: string[] };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("defect_logs")
    .select("worker, defect_type, qty, created_at")
    .not("worker", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const map = new Map<string, CraftsmanDefect & { _types: Set<string> }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const worker = String(r.worker ?? "").trim();
    if (!worker) continue;
    const key = worker.toLowerCase();
    const cur = map.get(key) ?? { worker, count: 0, qty: 0, last_at: null as string | null, types: [], _types: new Set<string>() };
    cur.count += 1;
    cur.qty += Number(r.qty) || 0;
    const at = r.created_at ? String(r.created_at) : null;
    if (at && (!cur.last_at || at > cur.last_at)) cur.last_at = at;   // เรียง desc แล้ว แต่กันไว้
    const t = (r.defect_type as string) ?? "";
    if (t) cur._types.add(t);
    map.set(key, cur);
  }
  const out: CraftsmanDefect[] = [...map.values()].map((c) => ({ worker: c.worker, count: c.count, qty: c.qty, last_at: c.last_at, types: [...c._types] }));
  return NextResponse.json({ data: out, error: null });
}
