/**
 * GET /api/purchasing/china-bills — รายชื่อ "บิลโอนเงินจีน" (china_bills) ไว้เลือกตอนกด "จ่ายแล้ว"
 *   ?q=<ค้นหา>  ?limit=<ค่าเริ่มต้น 50>
 * คืน: id, วันที่บิล/วันโอน, ยอด RMB/บาท, สถานะ, ชื่อร้าน (จาก partners_v2)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type ChinaBillOption = {
  id: string; bill_date: string | null; transfer_date: string | null;
  amount_rmb: number; amount_thb: number; status: string | null; supplier_name: string | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("china_bills")
    .select("id, supplier_id, bill_date, transfer_date, amount_rmb, amount_thb, status")
    .not("is_active", "is", false)   // เอาทั้ง true และ null (neq จะตัด null ทิ้ง)
    .order("bill_date", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const supIds = [...new Set(rows.map((r) => r.supplier_id).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (supIds.length) {
    const { data: ps } = await admin.from("partners_v2").select("id, display_name, name_th").in("id", supIds);
    for (const p of (ps ?? []) as Record<string, unknown>[]) {
      nameById.set(String(p.id), String(p.display_name || p.name_th || ""));
    }
  }

  let out: ChinaBillOption[] = rows.map((r) => ({
    id: String(r.id),
    bill_date: (r.bill_date as string) ?? null,
    transfer_date: (r.transfer_date as string) ?? null,
    amount_rmb: num(r.amount_rmb),
    amount_thb: num(r.amount_thb),
    status: (r.status as string) ?? null,
    supplier_name: r.supplier_id ? (nameById.get(String(r.supplier_id)) ?? null) : null,
  }));
  if (q) out = out.filter((b) => `${b.supplier_name ?? ""} ${b.status ?? ""} ${b.bill_date ?? ""}`.toLowerCase().includes(q));

  return NextResponse.json({ data: out, error: null });
}
