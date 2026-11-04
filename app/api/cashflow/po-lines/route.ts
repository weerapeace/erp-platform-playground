/**
 * GET /api/cashflow/po-lines?ids=<po_id>,<po_id>,… — รายการสินค้าของ PO หลายใบในคำขอเดียว
 *
 * ใช้ที่แท็บ "ต้องจ่าย" หน้า /cashflow: กางแถวร้านแล้วโหลดของใน PO ของร้านนั้นทีเดียว
 * (ไม่ดึงของทุก PO ตั้งแต่เปิดหน้า · ไม่ยิงทีละใบ) — ตัวอ่านเป็นของกลาง lib/po-lines-server (ตัวเดียวกับป๊อปรายละเอียด PO)
 * สิทธิ์ cashflow.view (คนที่เห็นยอดต้องจ่ายในหน้านี้อยู่แล้ว) · อ่านอย่างเดียว ไม่มี audit
 * คืน { data: { [po_id]: { currency, lines } } } — PO ที่ไม่มีของ = lines ว่าง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadPoLines, type PoDetailLine } from "@/lib/po-lines-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_IDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CashflowPoLines = Record<string, { currency: string | null; lines: PoDetailLine[] }>;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view");
  if (denied) return denied;

  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)))];
  if (!ids.length) return NextResponse.json({ data: {}, error: null });
  if (ids.length > MAX_IDS) return NextResponse.json({ data: null, error: `ขอได้ครั้งละไม่เกิน ${MAX_IDS} ใบ` }, { status: 400 });

  const admin = supabaseAdmin();
  try {
    const [byPo, poRes] = await Promise.all([
      loadPoLines(admin, ids),
      admin.from("purchase_orders_v2").select("id, currency").in("id", ids),
    ]);
    if (poRes.error) throw new Error(poRes.error.message);
    const currency = new Map((poRes.data ?? []).map((p) => [String(p.id), (p.currency as string | null) ?? null]));
    const data: CashflowPoLines = {};
    for (const id of ids) data[id] = { currency: currency.get(id) ?? null, lines: byPo.get(id) ?? [] };
    return NextResponse.json({ data, error: null });
  } catch (e) {
    console.error("[cashflow/po-lines]", e);
    return NextResponse.json({ data: null, error: "โหลดรายการสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
