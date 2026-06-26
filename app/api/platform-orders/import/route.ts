/**
 * นำเข้าไฟล์ออเดอร์ → /api/platform-orders/import
 * POST { platform_id, brand_id?, headers, rows }  (platform_orders.manage)
 *  - จัดกลุ่มแถวตามเลขออเดอร์ → สร้าง platform_orders + platform_order_items (จับคู่ sku ↔ ERP)
 *  - กันซ้ำ: ออเดอร์ที่มีอยู่แล้ว (platform_id × external_order_id) จะข้าม
 * ฝั่ง client แกะไฟล์ (xlsx/csv) แล้วส่ง headers+rows มา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pick(lower: Record<string, unknown>, candidates: string[]): string | null {
  for (const c of candidates) { const v = lower[c.toLowerCase()]; if (v != null && String(v).trim() !== "") return String(v).trim(); }
  return null;
}
const num = (s: string | null): number | null => { if (!s) return null; const n = Number(String(s).replace(/[^0-9.\-]/g, "")); return Number.isNaN(n) ? null : n; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { platform_id?: string; brand_id?: string; headers?: string[]; rows?: Record<string, unknown>[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const platform_id = (body.platform_id ?? "").trim();
  if (!platform_id) return NextResponse.json({ error: "ต้องระบุ platform_id" }, { status: 400 });
  const brand_id = (body.brand_id ?? "").trim() || null;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลในไฟล์" }, { status: 400 });

  const admin = supabaseAdmin();
  const toLower = (r: Record<string, unknown>) => { const o: Record<string, unknown> = {}; for (const k of Object.keys(r)) o[k.toLowerCase()] = r[k]; return o; };

  // จัดกลุ่มแถวตามเลขออเดอร์
  type Grp = { external_order_id: string; head: Record<string, unknown>; items: { sku_code: string | null; name: string | null; qty: number; price: number | null; raw: Record<string, unknown> }[] };
  const groups = new Map<string, Grp>();
  for (const r of rows) {
    const lo = toLower(r);
    const oid = pick(lo, ["order id", "order sn", "order_sn", "order number", "order no", "เลขออเดอร์", "หมายเลขคำสั่งซื้อ"]);
    if (!oid) continue;
    if (!groups.has(oid)) groups.set(oid, { external_order_id: oid, head: r, items: [] });
    groups.get(oid)!.items.push({
      sku_code: pick(lo, ["sku", "seller sku", "sku code", "variation sku", "รหัสสินค้า", "รหัส"]),
      name: pick(lo, ["product name", "name", "ชื่อสินค้า"]),
      qty: num(pick(lo, ["quantity", "qty", "จำนวน"])) ?? 1,
      price: num(pick(lo, ["deal price", "price", "ราคา", "ราคาขาย", "unit price"])),
      raw: r,
    });
  }
  if (groups.size === 0) return NextResponse.json({ error: "อ่านเลขออเดอร์จากไฟล์ไม่ได้ (ไม่พบคอลัมน์ Order ID)" }, { status: 400 });

  // จับคู่ sku code → ERP
  const codes = [...new Set([...groups.values()].flatMap((g) => g.items.map((i) => i.sku_code).filter(Boolean)) as string[])];
  const skuMap = new Map<string, string>();
  if (codes.length) {
    const { data: skus } = await admin.from("skus_v2").select("id, code").in("code", codes);
    for (const s of ((skus ?? []) as Record<string, unknown>[])) skuMap.set(String(s.code), String(s.id));
  }

  // ข้ามออเดอร์ที่มีอยู่แล้ว
  const oids = [...groups.keys()];
  const { data: existing } = await admin.from("platform_orders").select("external_order_id").eq("platform_id", platform_id).in("external_order_id", oids);
  const existSet = new Set(((existing ?? []) as { external_order_id: string }[]).map((e) => e.external_order_id));

  let created = 0, skipped = 0, items = 0, matched = 0;
  for (const g of groups.values()) {
    if (existSet.has(g.external_order_id)) { skipped++; continue; }
    const lo = toLower(g.head);
    const { data: ins } = await admin.from("platform_orders").insert({
      platform_id, brand_id, source: "import", external_order_id: g.external_order_id,
      order_no: g.external_order_id, customer_name: pick(lo, ["buyer username", "recipient", "customer", "ชื่อผู้รับ", "ลูกค้า"]),
      total: num(pick(lo, ["order total", "total amount", "grand total", "ยอดรวม", "ยอดสุทธิ"])),
      currency: pick(lo, ["currency", "สกุลเงิน"]), status: "new",
      ordered_at: null, raw: g.head, created_by: user?.id ?? null,
    }).select("id").single();
    const orderId = (ins as { id?: string } | null)?.id;
    if (!orderId) continue;
    created++;
    const itemRows = g.items.map((it) => { const m = it.sku_code ? (skuMap.get(it.sku_code) ?? null) : null; if (m) matched++; items++; return { order_id: orderId, sku_code: it.sku_code, matched_sku_id: m, name: it.name, qty: it.qty, price: it.price, raw: it.raw }; });
    if (itemRows.length) await admin.from("platform_order_items").insert(itemRows);
  }

  await writeAudit(admin, { action: "import", entityType: "platform_order", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { platform_id, brand_id, created, skipped, items, matched } });
  return NextResponse.json({ ok: true, created, skipped, items, matched, error: null });
}
