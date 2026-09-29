/**
 * ของกลาง — "ใส่ราคาให้บรรทัดใบสั่งซื้อ" แล้วกระจายไปทุกที่ที่ต้องรู้ราคา
 *   1. บรรทัด PO (price_est + line_total)  2. ยอดรวมใบ (grand_total ผ่าน lib/po-total)
 *   3. ราคาต่อร้านของ SKU (supplier_items + ประวัติ supplier_price_history)
 *   4. (ตัวเลือก) ราคาบน SKU เอง: rmb_cost (¥) / standard_price (฿ ไม่รวมค่าส่ง)
 *
 * ใครใช้: POST /api/purchasing/po-line-price (ใส่ราคาทีละบรรทัดจากหน้าสั่งซื้อ/ปฏิทิน)
 *         POST /api/purchasing/vouchers/[id]/confirm (ยืนยันใบสำคัญรับ = หลายบรรทัดรวด)
 *         POST /api/purchasing/vouchers/[id]/void    (ยกเลิกใบที่ยืนยันแล้ว = ย้อนราคากลับ ด้วย snapshotLinePrices/restoreLinePrices)
 * ห้ามเขียน logic นี้ซ้ำในหน้า/route อื่น — แก้ที่นี่ที่เดียว
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPartnerMatcher } from "@/lib/partner-match";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";
import { writeAudit } from "@/lib/audit";
import { isCNY } from "@/lib/landed-cost";

type Admin = SupabaseClient;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type PartnerLike = { id: string; display_name: string | null; name_th: string | null; is_supplier: boolean | null; is_active: boolean | null };
export type PartnerMatcher = ReturnType<typeof buildPartnerMatcher>;

/** โหลดร้านทั้งหมดมาสร้างตัวจับคู่ชื่อ (ทำครั้งเดียวต่อ request แล้วส่งต่อให้ applyPoLinePrice หลายบรรทัด) */
export async function loadPartnerMatcher(admin: Admin): Promise<PartnerMatcher> {
  // ⚠️ ห้ามกรอง is_supplier=true — ร้านบนใบหลายร้านยังไม่ได้ติ๊ก "เป็นผู้จำหน่าย" ราคาจะไม่ถูกเก็บเข้าตารางร้าน
  const { data: partners } = await admin.from("partners_v2").select("id, display_name, name_th, is_supplier, is_active");
  return buildPartnerMatcher((partners ?? []) as unknown as PartnerLike[]);
}

export type ApplyLinePriceInput = {
  lineId: string;
  price: number;                       // ราคา/หน่วย ตามสกุลของใบ PO
  actorId?: string | null;
  actorName?: string | null;
  matcher?: PartnerMatcher;            // ส่งมาเมื่อทำหลายบรรทัด (กันโหลดร้านซ้ำ)
  skipAudit?: boolean;                 // ผู้เรียกเขียน audit รวมเองแล้ว
};
export type ApplyLinePriceResult = { price: number; line_total: number; grand_total: number; saved_to_price_list: boolean; sku_id: string | null; currency: string; seller_name: string };

/** ใส่ราคา 1 บรรทัด — โยน Error เมื่อไม่พบ/บันทึกไม่สำเร็จ */
export async function applyPoLinePrice(admin: Admin, input: ApplyLinePriceInput): Promise<ApplyLinePriceResult> {
  const price = num(input.price);
  if (!(price > 0)) throw new Error("ราคาต้องมากกว่า 0");

  const { data: line, error: lineErr } = await admin.from("purchase_order_lines_v2")
    .select("id, po_id, item_sku_id, item_name, qty").eq("id", input.lineId).single();
  if (lineErr || !line) throw new Error("ไม่พบรายการนี้");
  const l = line as Record<string, unknown>;
  const qty = num(l.qty);
  const lineTotal = Math.round(qty * price * 100) / 100;

  // 1. อัปเดตบรรทัด
  const { error: upErr } = await admin.from("purchase_order_lines_v2")
    .update({ price_est: price, line_total: lineTotal }).eq("id", input.lineId);
  if (upErr) throw new Error(upErr.message);

  // 2. ยอดรวมใบใหม่ — ผ่าน lib/po-total (ใบที่มีภาษีไม่โดนล้าง VAT)
  const poId = String(l.po_id);
  const [{ data: allLines }, { data: poRow }] = await Promise.all([
    admin.from("purchase_order_lines_v2").select("line_total, is_active").eq("po_id", poId),
    admin.from("purchase_orders_v2").select("vat_rate, vat_included, seller_name, currency").eq("id", poId).maybeSingle(),
  ]);
  const lineSum = sumActiveLines((allLines ?? []) as { line_total?: number | null; is_active?: boolean | null }[]);
  const pr = (poRow ?? {}) as Record<string, unknown>;
  const grand = computePoTotals(lineSum, num(pr.vat_rate), !!pr.vat_included).total;
  await admin.from("purchase_orders_v2").update({ grand_total: grand }).eq("id", poId);

  // 3. ราคาต่อร้านของ SKU (supplier_items) — จับคู่ร้านจากชื่อบนใบ (lib/partner-match)
  const sellerName = String(pr.seller_name ?? "").trim();
  const currency = String(pr.currency ?? "THB") || "THB";
  const skuId = l.item_sku_id ? String(l.item_sku_id) : null;
  let savedToPriceList = false;
  if (skuId && sellerName) {
    const matcher = input.matcher ?? await loadPartnerMatcher(admin);
    const partner = matcher.match(sellerName) as Record<string, unknown> | undefined;
    if (partner) {
      savedToPriceList = await upsertSupplierPrice(admin, {
        skuId, partnerId: String(partner.id), price, currency, actorId: input.actorId, actorName: input.actorName,
      });
    }
  }

  if (!input.skipAudit) {
    await writeAudit(admin, {
      action: "update", entityType: "purchase_order_lines_v2", entityId: input.lineId,
      actorId: input.actorId ?? null, actorName: input.actorName ?? null,
      metadata: { item_name: l.item_name, price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList },
    });
  }
  return { price, line_total: lineTotal, grand_total: grand, saved_to_price_list: savedToPriceList, sku_id: skuId, currency, seller_name: sellerName };
}

/** บันทึกราคาต่อร้าน (supplier_items) + ประวัติราคาเมื่อเปลี่ยน · ร้านแรกของสินค้า = ร้านหลัก */
export async function upsertSupplierPrice(admin: Admin, o: { skuId: string; partnerId: string; price: number; currency: string; actorId?: string | null; actorName?: string | null }): Promise<boolean> {
  const { data: existing } = await admin.from("supplier_items")
    .select("id, price").eq("item_sku_id", o.skuId).eq("supplier_partner_id", o.partnerId).maybeSingle();
  if (existing) {
    const ex = existing as Record<string, unknown>;
    const oldPrice = ex.price == null ? null : num(ex.price);
    const { error } = await admin.from("supplier_items").update({ price: o.price, currency: o.currency, is_active: true }).eq("id", String(ex.id));
    if (error) return false;
    if (oldPrice !== o.price) {
      await admin.from("supplier_price_history").insert({
        supplier_item_id: String(ex.id), item_sku_id: o.skuId, supplier_partner_id: o.partnerId,
        old_price: oldPrice, new_price: o.price, currency: o.currency,
        changed_by: o.actorId ?? null, changed_by_name: o.actorName ?? null,
      });
    }
    return true;
  }
  const { count } = await admin.from("supplier_items").select("id", { count: "exact", head: true }).eq("item_sku_id", o.skuId);
  const { error } = await admin.from("supplier_items").insert({
    item_sku_id: o.skuId, supplier_partner_id: o.partnerId, price: o.price, currency: o.currency, is_active: true, is_default: (count ?? 0) === 0,
  });
  return !error;
}

/**
 * เขียนราคากลับ SKU เอง (ไม่รวมค่าส่ง — เจ้าของสั่ง 2026-09-26)
 *   สกุลหยวน → rmb_cost = ราคา ¥ และ standard_price = ราคาแปลงบาท
 *   สกุลบาท  → standard_price = ราคา ฿
 */
export async function writeBackSkuPrice(admin: Admin, o: { skuId: string; currency: string; unitPrice: number; unitPriceThb: number; actorId?: string | null; actorName?: string | null; refLabel?: string }): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (isCNY(o.currency)) { if (o.unitPrice > 0) patch.rmb_cost = o.unitPrice; if (o.unitPriceThb > 0) patch.standard_price = o.unitPriceThb; }
  else if (o.unitPriceThb > 0) patch.standard_price = o.unitPriceThb;
  if (Object.keys(patch).length === 0) return false;
  const { data: before } = await admin.from("skus_v2").select("code, rmb_cost, standard_price").eq("id", o.skuId).maybeSingle();
  const { error } = await admin.from("skus_v2").update(patch).eq("id", o.skuId);
  if (error) return false;
  const b = (before ?? {}) as Record<string, unknown>;
  await writeAudit(admin, {
    action: "update", entityType: "skus_v2", entityId: o.skuId,
    actorId: o.actorId ?? null, actorName: o.actorName ?? null,
    metadata: { source: "purchase_voucher", ref: o.refLabel ?? null, code: b.code ?? null, changed: Object.keys(patch), old: { rmb_cost: b.rmb_cost ?? null, standard_price: b.standard_price ?? null }, new: patch },
  });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// ย้อนราคา (ใช้ตอน "ยกเลิกใบสำคัญรับที่ยืนยันแล้ว")
//   ตอนยืนยัน: จด "ราคาก่อนเขียนทับ" + "ราคาที่เขียนลงไป" ของทุกบรรทัด เก็บไว้ในประวัติ (audit_logs)
//   ตอนยกเลิก: คืนราคาเดิมเฉพาะจุดที่ "ยังเป็นราคาที่ใบนี้เขียน" — ถ้ามีคนแก้ราคาทีหลังแล้ว จะไม่ไปทับของเขา
// ─────────────────────────────────────────────────────────────────────────────
const optN = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const same = (a: number | null, b: number | null) => (a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.000001);

export type PriceSnapshot = {
  item_name: string;
  po_line_id: string | null;
  po_price_before: number | null;
  sku_id: string | null;
  sku_before: { rmb_cost: number | null; standard_price: number | null } | null;
  supplier_item_id: string | null;        // null = ยังไม่เคยมีราคาร้านนี้ (ใบนี้เป็นคนสร้าง)
  partner_id: string | null;
  supplier_price_before: number | null;
  /** ราคาที่ใบนี้เขียนลงไปจริง (null = ไม่ได้เขียนจุดนั้น) */
  written: { po_price: number | null; rmb_cost: number | null; standard_price: number | null; supplier_price: number | null };
};

/** จดราคาก่อนเขียนทับของ 1 บรรทัด (เรียกก่อน applyPoLinePrice / writeBackSkuPrice) */
export async function snapshotLinePrice(admin: Admin, o: { itemName: string; poLineId: string | null; skuId: string | null; fallbackPartnerId: string | null; matcher: PartnerMatcher }): Promise<PriceSnapshot> {
  const snap: PriceSnapshot = {
    item_name: o.itemName, po_line_id: o.poLineId, po_price_before: null, sku_id: o.skuId, sku_before: null,
    supplier_item_id: null, partner_id: o.fallbackPartnerId, supplier_price_before: null,
    written: { po_price: null, rmb_cost: null, standard_price: null, supplier_price: null },
  };
  if (o.poLineId) {
    const { data: pl } = await admin.from("purchase_order_lines_v2").select("price_est, po_id").eq("id", o.poLineId).maybeSingle();
    const l = (pl ?? {}) as Record<string, unknown>;
    snap.po_price_before = optN(l.price_est);
    if (l.po_id) {
      // ร้านของบรรทัด PO = ร้านบนใบ PO (ตรงกับที่ applyPoLinePrice ใช้)
      const { data: po } = await admin.from("purchase_orders_v2").select("seller_name").eq("id", String(l.po_id)).maybeSingle();
      const name = String(((po ?? {}) as Record<string, unknown>).seller_name ?? "").trim();
      const partner = name ? (o.matcher.match(name) as Record<string, unknown> | undefined) : undefined;
      snap.partner_id = partner ? String(partner.id) : null;
    }
  }
  if (o.skuId) {
    const { data: sk } = await admin.from("skus_v2").select("rmb_cost, standard_price").eq("id", o.skuId).maybeSingle();
    const k = (sk ?? {}) as Record<string, unknown>;
    snap.sku_before = { rmb_cost: optN(k.rmb_cost), standard_price: optN(k.standard_price) };
    if (snap.partner_id) {
      const { data: si } = await admin.from("supplier_items").select("id, price").eq("item_sku_id", o.skuId).eq("supplier_partner_id", snap.partner_id).maybeSingle();
      if (si) { snap.supplier_item_id = String((si as Record<string, unknown>).id); snap.supplier_price_before = optN((si as Record<string, unknown>).price); }
    }
  }
  return snap;
}

export type RestoreResult = { line: string; po: "restored" | "kept" | "none"; sku: "restored" | "kept" | "none"; price_list: "restored" | "removed" | "kept" | "none" };

/**
 * คืนราคาเดิมตามที่จดไว้ — ไล่จากบรรทัดท้ายขึ้นมา (ใบเดียวมีสินค้าเดียวกันหลายบรรทัดได้)
 *   restored = คืนราคาเดิมแล้ว · kept = ราคาถูกแก้ทีหลัง ไม่แตะ · none = ใบนี้ไม่ได้เขียนจุดนั้น
 */
export async function restoreLinePrices(admin: Admin, snaps: PriceSnapshot[], o: { actorId?: string | null; actorName?: string | null; refLabel?: string }): Promise<RestoreResult[]> {
  const out: RestoreResult[] = [];
  const touchedPo = new Set<string>();
  for (const sn of [...snaps].reverse()) {
    const r: RestoreResult = { line: sn.item_name, po: "none", sku: "none", price_list: "none" };
    const w = sn.written ?? { po_price: null, rmb_cost: null, standard_price: null, supplier_price: null };

    // 1. บรรทัด PO
    if (sn.po_line_id && w.po_price != null) {
      const { data: pl } = await admin.from("purchase_order_lines_v2").select("price_est, qty, po_id").eq("id", sn.po_line_id).maybeSingle();
      const l = (pl ?? null) as Record<string, unknown> | null;
      if (l && same(optN(l.price_est), w.po_price)) {
        const before = sn.po_price_before ?? 0;
        const { error } = await admin.from("purchase_order_lines_v2")
          .update({ price_est: before, line_total: Math.round(num(l.qty) * before * 100) / 100 }).eq("id", sn.po_line_id);
        if (!error) { r.po = "restored"; if (l.po_id) touchedPo.add(String(l.po_id)); } else r.po = "kept";
      } else r.po = "kept";
    }

    // 2. ราคาบน SKU
    if (sn.sku_id && sn.sku_before && (w.rmb_cost != null || w.standard_price != null)) {
      const { data: sk } = await admin.from("skus_v2").select("code, rmb_cost, standard_price").eq("id", sn.sku_id).maybeSingle();
      const k = (sk ?? null) as Record<string, unknown> | null;
      const patch: Record<string, unknown> = {};
      if (k && w.rmb_cost != null && same(optN(k.rmb_cost), w.rmb_cost)) patch.rmb_cost = sn.sku_before.rmb_cost;
      if (k && w.standard_price != null && same(optN(k.standard_price), w.standard_price)) patch.standard_price = sn.sku_before.standard_price;
      if (k && Object.keys(patch).length) {
        const { error } = await admin.from("skus_v2").update(patch).eq("id", sn.sku_id);
        if (!error) {
          r.sku = "restored";
          await writeAudit(admin, {
            action: "update", entityType: "skus_v2", entityId: sn.sku_id, actorId: o.actorId ?? null, actorName: o.actorName ?? null,
            metadata: { source: "purchase_voucher_void", ref: o.refLabel ?? null, code: k.code ?? null, changed: Object.keys(patch), old: { rmb_cost: k.rmb_cost ?? null, standard_price: k.standard_price ?? null }, new: patch },
          });
        } else r.sku = "kept";
      } else r.sku = "kept";
    }

    // 3. ราคาต่อร้าน
    if (sn.sku_id && sn.partner_id && w.supplier_price != null) {
      const { data: si } = await admin.from("supplier_items").select("id, price, currency").eq("item_sku_id", sn.sku_id).eq("supplier_partner_id", sn.partner_id).maybeSingle();
      const it = (si ?? null) as Record<string, unknown> | null;
      if (it && same(optN(it.price), w.supplier_price)) {
        if (sn.supplier_item_id && sn.supplier_price_before != null) {
          const { error } = await admin.from("supplier_items").update({ price: sn.supplier_price_before }).eq("id", String(it.id));
          if (!error) {
            r.price_list = "restored";
            await admin.from("supplier_price_history").insert({
              supplier_item_id: String(it.id), item_sku_id: sn.sku_id, supplier_partner_id: sn.partner_id,
              old_price: w.supplier_price, new_price: sn.supplier_price_before, currency: String(it.currency ?? "THB"),
              changed_by: o.actorId ?? null, changed_by_name: o.actorName ?? null,
            });
          } else r.price_list = "kept";
        } else if (!sn.supplier_item_id) {
          // ราคาร้านนี้ใบนี้เป็นคนสร้าง → ปิดไว้ (ออกใบใหม่แล้วยืนยัน ระบบเปิดกลับเอง)
          const { error } = await admin.from("supplier_items").update({ is_active: false }).eq("id", String(it.id));
          r.price_list = error ? "kept" : "removed";
        } else r.price_list = "kept";
      } else r.price_list = "kept";
    }
    out.push(r);
  }

  // ยอดรวมใบ PO ที่โดนแก้ราคา — คิดใหม่ผ่าน lib/po-total
  for (const poId of touchedPo) {
    const [{ data: allLines }, { data: poRow }] = await Promise.all([
      admin.from("purchase_order_lines_v2").select("line_total, is_active").eq("po_id", poId),
      admin.from("purchase_orders_v2").select("vat_rate, vat_included").eq("id", poId).maybeSingle(),
    ]);
    const pr = (poRow ?? {}) as Record<string, unknown>;
    const lineSum = sumActiveLines((allLines ?? []) as { line_total?: number | null; is_active?: boolean | null }[]);
    await admin.from("purchase_orders_v2").update({ grand_total: computePoTotals(lineSum, num(pr.vat_rate), !!pr.vat_included).total }).eq("id", poId);
  }
  return out.reverse();
}
