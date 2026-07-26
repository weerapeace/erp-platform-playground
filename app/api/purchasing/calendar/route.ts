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
import { computeDueDate, computeArrivalDate, parseLeadTime } from "@/lib/credit-term";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const isCNY = (c: unknown) => ["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase());

export type PoCalProduct = {
  name: string; qty: number; uom: string | null; total: number; img: string | null;
  line_id: string; sku_id: string | null; price: number;   // ใส่ราคาย้อนกลับได้จาก popup (ของกลาง)
  // ที่มาจากใบขอซื้อ (PR) — ทำไมถึงสั่ง / ขอมาเมื่อไหร่ / ใช้กับงานไหน
  pr_no: string | null; pr_date: string | null; pr_note: string | null; pr_used_for: string | null; pr_mo_no: string | null; pr_requester: string | null;
  // ใบสั่งผลิตต้นทาง (MO) — เปิดดูรายละเอียด + รหัสสินค้าที่ผลิต
  mo_id: string | null; mo_sku: string | null; mo_product: string | null;
};
export type PoCalItem = {
  id: string; po_no: string; seller_name: string | null;
  date: string | null; amount_thb: number; currency: string | null;
  follow_up: boolean; payment_status: string | null; status: string | null;
  products: PoCalProduct[]; product_count: number;   // สินค้าในใบ (โชว์รูปเล็กๆ ในการ์ด)
  auto: boolean;   // วันจ่ายมาจากเครดิตร้านอัตโนมัติ (ยังไม่ได้ตั้งวันเอง)
  seller_partner_id: string | null;      // ร้านในทะเบียน (จับคู่จากชื่อ) — ไว้ตั้งเครดิตจาก popup
  seller_credit_term: string | null;     // เครดิตการจ่ายของร้าน (null = ยังไม่ตั้ง → เตือน)
  seller_lead_time: string | null;       // ระยะเวลาส่งของของร้าน ("N" | "N|after_pay") — null = ยังไม่ตั้ง
  order_date: string | null;             // วันที่สั่งซื้อ
};
export type PoCalResponse = { data: PoCalItem[]; error: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const mode = new URL(request.url).searchParams.get("mode") === "pay" ? "pay" : "in";
  const admin = supabaseAdmin();

  const rateRes = await admin.from("daily_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  const rmb = num((rateRes.data as { rate?: number } | null)?.rate) || 5;

  let q = admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, seller_partner_id, grand_total, currency, expected_date, payment_due_date, follow_up, payment_status, status, order_date")
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
    products: [], product_count: 0, auto: false, seller_partner_id: null, seller_credit_term: null, seller_lead_time: null,
    order_date: (p.order_date as string) ?? null,
  }));

  // จับคู่ร้าน (ชื่อ → id + เครดิต) — ใช้ทั้งคำนวณวันจ่ายอัตโนมัติ และให้ popup เตือน/ตั้งเครดิตได้
  const { data: partners } = await admin.from("partners_v2")
    .select("id, display_name, name_th, purchase_credit_term, purchase_lead_time").eq("is_supplier", true);
  const partnerByName = new Map<string, { id: string; term: string | null; lead: string | null }>();
  const partnerById = new Map<string, { id: string; term: string | null; lead: string | null }>();
  for (const pt of (partners ?? []) as Record<string, unknown>[]) {
    const ent = {
      id: String(pt.id),
      term: (String(pt.purchase_credit_term ?? "").trim() || null),
      lead: (String(pt.purchase_lead_time ?? "").trim() || null),
    };
    partnerById.set(ent.id, ent);
    for (const nm of [pt.display_name, pt.name_th]) { const k = String(nm ?? "").trim(); if (k && !partnerByName.has(k)) partnerByName.set(k, ent); }
  }
  // ผูกร้านตรงๆ ที่ใบ (seller_partner_id) ชนะการจับคู่ด้วยชื่อ
  const linkedPartnerByPo = new Map<string, string>();
  for (const p of (data ?? []) as Record<string, unknown>[]) if (p.seller_partner_id) linkedPartnerByPo.set(String(p.id), String(p.seller_partner_id));
  const orderDateById = new Map<string, string | null>();
  for (const p of (data ?? []) as Record<string, unknown>[]) orderDateById.set(String(p.id), (p.order_date as string) ?? null);

  for (const it of items) {
    const linkedId = linkedPartnerByPo.get(it.id);
    const pt = (linkedId ? partnerById.get(linkedId) : undefined)
      ?? (it.seller_name ? partnerByName.get(it.seller_name.trim()) : undefined);
    it.seller_partner_id = pt?.id ?? null;
    it.seller_credit_term = pt?.term ?? null;
    it.seller_lead_time = pt?.lead ?? null;
    const ordered = orderDateById.get(it.id);
    // โหมดจ่ายเงิน: ใบที่ยังไม่ตั้งวันจ่ายเอง → คำนวณจาก "เครดิตร้าน + วันซื้อ" อัตโนมัติ
    if (mode === "pay" && !it.date && pt?.term) {
      const due = computeDueDate(ordered, pt.term);
      if (due) { it.date = due; it.auto = true; }
    }
    // โหมดของเข้า: ใบที่ยังไม่ตั้งวันเอง → คำนวณจาก "ระยะเวลาส่งของ" อัตโนมัติ
    //   ปกตินับจากวันสั่ง · ถ้าร้านตั้ง "ส่งหลังชำระเงิน" → นับจากวันจ่าย (วันจ่ายจริง หรือคำนวณจากเครดิต)
    if (mode === "in" && !it.date && pt?.lead) {
      const lead = parseLeadTime(pt.lead);
      let base = ordered ?? null;
      if (lead?.afterPayment) {
        const poRow = (data ?? []).find((r) => String((r as Record<string, unknown>).id) === it.id) as Record<string, unknown> | undefined;
        base = ((poRow?.payment_due_date as string) ?? null) || computeDueDate(ordered, pt.term) || ordered || null;
      }
      const arrive = computeArrivalDate(base, pt.lead);
      if (arrive) { it.date = arrive; it.auto = true; }
    }
  }

  // สินค้าในแต่ละใบ (โชว์รูปเล็กๆ ในการ์ด) — purchase_order_lines_v2 + รูปปก skus_v2
  const poIds = items.map((i) => i.id);
  type LineRow = { line_id: string; name: string; qty: number; uom: string | null; total: number; price: number; sku_id: string | null; pr_id: string | null };
  const linesByPo = new Map<string, LineRow[]>();
  const skuIds = new Set<string>();
  const prIds = new Set<string>();
  for (let i = 0; i < poIds.length; i += 200) {
    const chunk = poIds.slice(i, i + 200);
    const { data: ls } = await admin.from("purchase_order_lines_v2")
      .select("id, po_id, pr_id, item_sku_id, item_name, qty, uom, price_est, line_total, sort_order").in("po_id", chunk).order("sort_order", { ascending: true });
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      const pid = String(l.po_id);
      const arr = linesByPo.get(pid) ?? []; linesByPo.set(pid, arr);
      arr.push({ line_id: String(l.id), name: String(l.item_name ?? ""), qty: num(l.qty), uom: (l.uom as string) ?? null,
        total: num(l.line_total), price: num(l.price_est), sku_id: l.item_sku_id ? String(l.item_sku_id) : null,
        pr_id: l.pr_id ? String(l.pr_id) : null });
      if (l.item_sku_id) skuIds.add(String(l.item_sku_id));
      if (l.pr_id) prIds.add(String(l.pr_id));
    }
  }

  // ใบขอซื้อต้นทาง (PR) — เหตุผลที่สั่ง / วันที่ขอซื้อ / ใช้กับงานไหน
  type PrRow = { pr_no: string | null; date: string | null; note: string | null; used_for: string | null; mo_no: string | null; requester: string | null };
  const prMap = new Map<string, PrRow>();
  // ใบเก่าที่บรรทัดไม่ได้ผูก pr_id → ใช้ PR ที่ชี้มาที่ใบนี้ (po_id) จับคู่ด้วย sku แทน
  const prByPoSku = new Map<string, PrRow>();
  {
    const { data: prsByPo } = await admin.from("purchase_requests_v2")
      .select("po_id, item_sku_id, pr_no, order_date, created_at, note, used_for_label, source_mo_no, requester")
      .in("po_id", poIds.slice(0, 500));
    for (const r of (prsByPo ?? []) as Record<string, unknown>[]) {
      if (!r.po_id || !r.item_sku_id) continue;
      const k = `${r.po_id}::${r.item_sku_id}`;
      if (prByPoSku.has(k)) continue;
      prByPoSku.set(k, {
        pr_no: (r.pr_no as string) ?? null,
        date: ((r.order_date as string) || (r.created_at ? String(r.created_at).slice(0, 10) : null)) ?? null,
        note: (r.note as string) ?? null, used_for: (r.used_for_label as string) ?? null,
        mo_no: (r.source_mo_no as string) ?? null, requester: (r.requester as string) ?? null,
      });
    }
  }
  const prArr = [...prIds];
  for (let i = 0; i < prArr.length; i += 300) {
    const chunk = prArr.slice(i, i + 300);
    const { data: prs2 } = await admin.from("purchase_requests_v2")
      .select("id, pr_no, order_date, created_at, note, used_for_label, source_mo_no, requester").in("id", chunk);
    for (const r of (prs2 ?? []) as Record<string, unknown>[]) {
      prMap.set(String(r.id), {
        pr_no: (r.pr_no as string) ?? null,
        date: ((r.order_date as string) || (r.created_at ? String(r.created_at).slice(0, 10) : null)) ?? null,
        note: (r.note as string) ?? null, used_for: (r.used_for_label as string) ?? null,
        mo_no: (r.source_mo_no as string) ?? null, requester: (r.requester as string) ?? null,
      });
    }
  }
  const coverMap = new Map<string, string | null>();
  const skuUomId = new Map<string, string | null>();
  const skuArr = [...skuIds];
  for (let i = 0; i < skuArr.length; i += 300) {
    const chunk = skuArr.slice(i, i + 300);
    const { data: sk } = await admin.from("skus_v2").select("id, cover_image_r2_key, uom_id").in("id", chunk);
    for (const s of (sk ?? []) as Record<string, unknown>[]) {
      coverMap.set(String(s.id), (s.cover_image_r2_key as string) ?? null);
      skuUomId.set(String(s.id), s.uom_id ? String(s.uom_id) : null);
    }
  }
  // ชื่อหน่วยนับ (uoms) — เติมให้บรรทัดที่ไม่มีหน่วย เช่น "ชิ้น" / "หลา"
  const uomIds = [...new Set([...skuUomId.values()].filter(Boolean) as string[])];
  const uomName = new Map<string, string>();
  for (let i = 0; i < uomIds.length; i += 300) {
    const chunk = uomIds.slice(i, i + 300);
    const { data: us } = await admin.from("uoms").select("id, name").in("id", chunk);
    for (const u of (us ?? []) as Record<string, unknown>[]) uomName.set(String(u.id), String(u.name ?? ""));
  }
  // ใบสั่งผลิตต้นทาง (MO) — เอา id (เปิด drawer ดูได้) + รหัส/ชื่อสินค้าที่ผลิต
  const moNos = new Set<string>();
  for (const p of [...prMap.values(), ...prByPoSku.values()]) if (p.mo_no) moNos.add(p.mo_no);
  const moMap = new Map<string, { id: string; sku: string | null; product: string | null }>();
  const moArr = [...moNos];
  for (let i = 0; i < moArr.length; i += 300) {
    const chunk = moArr.slice(i, i + 300);
    const { data: mos } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name").in("mo_no", chunk);
    for (const m of (mos ?? []) as Record<string, unknown>[]) {
      moMap.set(String(m.mo_no), { id: String(m.id), sku: (m.product_sku as string) ?? null, product: (m.product_name as string) ?? null });
    }
  }

  for (const it of items) {
    const ls = linesByPo.get(it.id) ?? [];
    it.product_count = ls.length;
    it.products = ls.slice(0, 50).map((l) => {
      const key = l.sku_id ? coverMap.get(l.sku_id) : null;
      // PR: ผูกตรงด้วย pr_id ก่อน · ใบเก่าไม่มี pr_id → จับคู่ด้วย (po + sku)
      const pr = (l.pr_id ? prMap.get(l.pr_id) : undefined)
        ?? (l.sku_id ? prByPoSku.get(`${it.id}::${l.sku_id}`) : undefined);
      const mo = pr?.mo_no ? moMap.get(pr.mo_no) : undefined;
      const uid = l.sku_id ? skuUomId.get(l.sku_id) : null;             // หน่วยจาก SKU ถ้าบรรทัดไม่มี
      const uom = l.uom || (uid ? (uomName.get(uid) ?? null) : null);
      return { name: l.name, qty: l.qty, uom, total: l.total, price: l.price, line_id: l.line_id, sku_id: l.sku_id,
        img: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        pr_no: pr?.pr_no ?? null, pr_date: pr?.date ?? null, pr_note: pr?.note ?? null,
        pr_used_for: pr?.used_for ?? null, pr_mo_no: pr?.mo_no ?? null, pr_requester: pr?.requester ?? null,
        mo_id: mo?.id ?? null, mo_sku: mo?.sku ?? null, mo_product: mo?.product ?? null };
    });
  }

  return NextResponse.json({ data: items, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { id?: string; expected_date?: string | null; payment_due_date?: string | null; follow_up?: boolean; seller_partner_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = body.id;
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบสั่งซื้อ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.expected_date !== undefined)     patch.expected_date = body.expected_date || null;
  if (body.payment_due_date !== undefined)  patch.payment_due_date = body.payment_due_date || null;
  if (body.follow_up !== undefined)         patch.follow_up = body.follow_up === true;
  if (body.seller_partner_id !== undefined) patch.seller_partner_id = body.seller_partner_id || null;   // ผูกใบนี้กับร้านในทะเบียน
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
