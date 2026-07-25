/**
 * GET /api/purchasing/calendar?mode=in|pay — รายการ PO สำหรับปฏิทินจัดซื้อ
 *   in  = ของเข้า (PO ที่สั่งแล้วยังรับไม่ครบ · date = expected_date)
 *   pay = จ่ายเงิน (PO ที่ยังไม่จ่าย · date = payment_due_date)
 * POST /api/purchasing/calendar — อัปเดตวัน/ติดตาม { id, expected_date?, payment_due_date?, follow_up? }
 * ของกลาง: guardApi + supabaseAdmin + writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoCalProduct = { name: string; qty: number; img: string | null };
export type PoCalItem = {
  id: string; po_no: string; seller_name: string | null;
  date: string | null; amount_thb: number; currency: string | null;
  follow_up: boolean; payment_status: string | null; status: string | null;
  products: PoCalProduct[]; product_count: number;   // สินค้าในใบ (โชว์รูปเล็กๆ ในการ์ด)
};
export type PoCalResponse = { data: PoCalItem[]; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const mode = new URL(request.url).searchParams.get("mode") === "pay" ? "pay" : "in";
  const admin = supabaseAdmin();

  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  let q = admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, grand_total, currency, expected_date, payment_due_date, follow_up, payment_status, status, order_date")
    .eq("is_active", true).neq("status", "cancelled").limit(2000);
  q = mode === "pay" ? q.eq("payment_status", "unpaid").neq("status", "draft")
                     : q.in("status", ["purchase", "partial"]);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const items: PoCalItem[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id), po_no: String(p.po_no ?? "—"), seller_name: (p.seller_name as string) ?? null,
    date: (mode === "pay" ? (p.payment_due_date as string) : (p.expected_date as string)) ?? null,
    amount_thb: Math.round(num(p.grand_total) * (isCNY(p.currency) ? rmb : 1)),
    currency: (p.currency as string) ?? null,
    follow_up: !!p.follow_up, payment_status: (p.payment_status as string) ?? null, status: (p.status as string) ?? null,
    products: [], product_count: 0,
  }));

  // สินค้าในแต่ละใบ (โชว์รูปเล็กๆ ในการ์ด) — purchase_order_lines_v2 + รูปปก skus_v2
  const poIds = items.map((i) => i.id);
  const linesByPo = new Map<string, { name: string; qty: number; sku_id: string | null }[]>();
  const skuIds = new Set<string>();
  for (let i = 0; i < poIds.length; i += 200) {
    const chunk = poIds.slice(i, i + 200);
    const { data: ls } = await admin.from("purchase_order_lines_v2")
      .select("po_id, item_sku_id, item_name, qty, sort_order").in("po_id", chunk).order("sort_order", { ascending: true });
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      const pid = String(l.po_id);
      const arr = linesByPo.get(pid) ?? []; linesByPo.set(pid, arr);
      arr.push({ name: String(l.item_name ?? ""), qty: num(l.qty), sku_id: l.item_sku_id ? String(l.item_sku_id) : null });
      if (l.item_sku_id) skuIds.add(String(l.item_sku_id));
    }
  }
  const coverMap = new Map<string, string | null>();
  const skuArr = [...skuIds];
  for (let i = 0; i < skuArr.length; i += 300) {
    const chunk = skuArr.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, cover_image_r2_key").in("id", chunk);
    for (const s of (sk ?? []) as Record<string, unknown>[]) coverMap.set(String(s.id), (s.cover_image_r2_key as string) ?? null);
  }
  for (const it of items) {
    const ls = linesByPo.get(it.id) ?? [];
    it.product_count = ls.length;
    it.products = ls.slice(0, 8).map((l) => {
      const key = l.sku_id ? coverMap.get(l.sku_id) : null;
      return { name: l.name, qty: l.qty, img: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null };
    });
  }

  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; expected_date?: string | null; payment_due_date?: string | null; follow_up?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.expected_date !== undefined)     patch.expected_date = body.expected_date || null;
  if (body.payment_due_date !== undefined)  patch.payment_due_date = body.payment_due_date || null;
  if (body.follow_up !== undefined)         patch.follow_up = body.follow_up === true;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("purchase_orders_v2").update(patch).eq("id", id).select("id, po_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "purchase_orders_v2", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { po_no: data?.po_no, ...patch },
  });
  return NextResponse.json({ ok: true, error: null });
}
