/**
 * ออเดอร์จากเว็บร้าน (ฝั่ง ERP) — /api/website/orders (แท็บ "🧾 ออเดอร์")
 *
 * GET   ?shop=<slug>[&status=pending|...|all]  → รายการออเดอร์ของร้าน (ล่าสุด 300) พร้อมรายการสินค้า
 * PATCH { orderId, status?, paymentStatus?, note? } → เปลี่ยนสถานะ/สถานะจ่าย/โน้ตภายใน + audit
 *
 * ไม่มีลบ: ออเดอร์เป็นเอกสารที่ลูกค้าถืออยู่ (มีเลขที่) จึงให้ "ยกเลิก" (status=cancelled) แทน
 * ของกลาง: lib/website-orders.ts · guardApi(products.view/edit) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_LABEL, toOrderView } from "@/lib/website-orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_KEYS = new Set(ORDER_STATUSES.map((s) => s.key));
const PAY_KEYS = new Set(PAYMENT_STATUSES.map((s) => s.key));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "all").trim();

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, status, payment_method, payment_status, customer_name, customer_phone, customer_email, ship_address_line, ship_subdistrict, ship_district, ship_province, ship_postal, subtotal, shipping_fee, discount, grand_total, note, created_at, erp_so_number"
    )
    .eq("shop_id", s.id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all" && STATUS_KEYS.has(status as never)) q = q.eq("status", status);
  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ" }, { status: 500 });

  const rows = (orders ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  if (ids.length) {
    const { data: items } = await sb
      .from("store_order_items")
      .select("order_id, name, variant_label, sku_code, unit_price, qty, line_total")
      .in("order_id", ids)
      .order("id");
    for (const it of (items ?? []) as Record<string, unknown>[]) {
      const arr = itemsByOrder.get(it.order_id as string) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id as string, arr);
    }
  }

  // นับทุกสถานะไว้โชว์ตัวเลขบนตัวกรอง (นับจากทั้งร้าน ไม่ใช่แค่หน้าที่กรอง)
  const { data: allStatus } = await sb.from("store_orders").select("status").eq("shop_id", s.id);
  const counts: Record<string, number> = {};
  for (const r of (allStatus ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return NextResponse.json({
    shop: s,
    counts,
    statuses: ORDER_STATUSES,
    paymentStatuses: PAYMENT_STATUSES,
    paymentMethods: PAYMENT_METHOD_LABEL,
    orders: rows.map((r) => {
      const items = itemsByOrder.get(r.id as string) ?? [];
      const view = toOrderView(
        r as unknown as Parameters<typeof toOrderView>[0],
        items as unknown as Parameters<typeof toOrderView>[1],
        null
      );
      return {
        id: r.id,
        ...view,
        customerEmail: (r.customer_email as string | null) ?? "",
        erpSoNumber: (r.erp_so_number as string | null) ?? null,
        skuCodes: items.map((i) => i.sku_code).filter(Boolean),
      };
    }),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { orderId?: string; status?: string; paymentStatus?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.orderId) return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUS_KEYS.has(body.status as never)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    patch.status = body.status;
  }
  if (body.paymentStatus !== undefined) {
    if (!PAY_KEYS.has(body.paymentStatus as never)) return NextResponse.json({ error: "สถานะชำระเงินไม่ถูกต้อง" }, { status: 400 });
    patch.payment_status = body.paymentStatus;
  }
  if (body.note !== undefined) patch.note = String(body.note).trim().slice(0, 1000) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from("store_orders")
    .select("id, shop_id, order_no, status, payment_status, note")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const b = before as { id: string; shop_id: string; order_no: string; status: string; payment_status: string; note: string | null };

  const { error } = await sb.from("store_orders").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: patch.status === "cancelled" ? "cancel" : "update",
    entityType: "store_orders",
    entityId: b.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: {
      orderNo: b.order_no,
      shopId: b.shop_id,
      before: { status: b.status, paymentStatus: b.payment_status, note: b.note },
      after: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
