/**
 * 📊 ข้อมูลสรุปผลงาน — GET /api/work-logs/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   คืนบรรทัดผลงานที่ยืนยันแล้ว (work_log_entries) แบบกระชับ + ชื่อพนักงาน + สินค้าของใบสั่งผลิต
 *   การคำนวณ (ชิ้น/ชม. · ค่ามาตรฐาน · เร็ว/ช้า) ทำที่ lib/work-log-stats.ts ฝั่งหน้าเว็บ ให้สลับมุมมองได้ทันที
 *   ค่าเริ่มต้น = 90 วันล่าสุด · สูงสุด 5,000 บรรทัด · สิทธิ์ products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { todayBangkok } from "@/lib/work-log-read";
import type { StatEntry } from "@/lib/work-log-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 5000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const today = todayBangkok();
  const back = new Date(`${today}T00:00:00Z`); back.setUTCDate(back.getUTCDate() - 90);
  const from = ISO.test(sp.get("from") ?? "") ? String(sp.get("from")) : back.toISOString().slice(0, 10);
  const to = ISO.test(sp.get("to") ?? "") ? String(sp.get("to")) : today;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("work_log_entries")
    .select("id, mo_id, step_id, step_name, employee_id, name_written, work_date, minutes, qty_done, qty_waste")
    .eq("is_active", true).gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: false }).limit(LIMIT);
  if (error) return NextResponse.json({ data: [], error: "โหลดข้อมูลผลงานไม่สำเร็จ" }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];

  const empIds = [...new Set(rows.map((r) => r.employee_id as string | null).filter(Boolean))] as string[];
  const moIds = [...new Set(rows.map((r) => r.mo_id as string | null).filter(Boolean))] as string[];
  const [emps, mos] = await Promise.all([
    empIds.length ? admin.from("employees").select("id, nickname, first_name, first_name_th").in("id", empIds) : Promise.resolve({ data: [] }),
    moIds.length ? admin.from("manufacturing_orders").select("id, product_sku, product_name").in("id", moIds) : Promise.resolve({ data: [] }),
  ]);
  const empName = new Map(((emps.data ?? []) as Record<string, string | null>[]).map((e) => [String(e.id), e.nickname || e.first_name_th || e.first_name || "?"]));
  const moOf = new Map(((mos.data ?? []) as Record<string, string | null>[]).map((m) => [String(m.id), m]));

  const out: StatEntry[] = rows.map((r) => {
    const mo = moOf.get(String(r.mo_id ?? ""));
    return {
      id: String(r.id), step_id: (r.step_id as string) ?? null, step_name: String(r.step_name ?? ""),
      product_sku: mo?.product_sku ?? null, product_name: mo?.product_name ?? null,
      employee_id: (r.employee_id as string) ?? null,
      employee_name: (r.employee_id ? empName.get(String(r.employee_id)) : null) ?? String(r.name_written ?? "ไม่ระบุ"),
      work_date: (r.work_date as string) ?? null, minutes: r.minutes == null ? null : Number(r.minutes),
      qty_done: r.qty_done == null ? null : Number(r.qty_done), qty_waste: r.qty_waste == null ? null : Number(r.qty_waste),
    };
  });
  return NextResponse.json({ data: out, from, to, today, truncated: rows.length >= LIMIT, error: null });
}
