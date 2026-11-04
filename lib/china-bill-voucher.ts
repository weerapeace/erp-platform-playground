/**
 * ของกลางฝั่ง server — ออกใบสำคัญรับจาก "บิลโอนเงินจีน" (แอป China Pay · ตาราง china_bills)
 *   ป๊อป ＋ ออกใบสำคัญรับ แท็บ "จากบิลโอนเงินจีน" — เลือกได้หลายบิล (หน้าเว็บเรียกทีละบิล + แถบความคืบหน้า)
 *   listChinaBillsForVoucher()  บิลโอน (ไม่รวมยกเลิก) + ร้าน + จำนวนรูปบิล + PO ที่ผูก + ใบสำคัญที่ออกแล้ว
 *   createVoucherFromChinaBill() 1 บิล → 1 ใบสำคัญร่าง (ร้าน/สกุล ¥/วันที่/เรท จากบิลโอน · ผูก purchase_vouchers_v2.china_bill_id)
 *     รายการ: มีรูปบิล → AI อ่าน + จับคู่ PO ร้านนั้น (lib/seller-bill ตัวเดิม · PO ที่ผูกกับบิลขึ้นก่อน)
 *             ไม่มีรูปแต่มี PO ผูก (china_bill_po_links) → ใส่บรรทัด PO นั้น (จำนวนที่ค้าง · ราคา PO)
 *             ไม่มีทั้งคู่ → ใบเปล่า (ถ้าเลือก) ไม่งั้นข้าม
 *     ยอดที่อ่านได้ ≠ ยอดบิลโอน → บันทึกเตือนในหมายเหตุใบ
 * เอกสาร: docs/seller-bill-match.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { createManualVoucher, recomputeVoucher, loadSkus, parentBasis } from "@/lib/purchase-voucher-server";
import { loadVoucherLite, loadShopGroups, loadAliases, parseSellerBill } from "@/lib/seller-bill";
import { matchBillLines, checkBillMath, type PoGroup } from "@/lib/seller-bill-match";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const CANCELLED = "ยกเลิก";
const MAX_FILES = 6;
const todayBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** รูปบิลของบิลโอน (attachments = R2 key/ref ของแอปโอนเงินจีน) */
export const chinaBillFiles = (b: Row): string[] => (Array.isArray(b.attachments) ? (b.attachments as unknown[]).map(str).filter(Boolean) : []).slice(0, MAX_FILES);

export type ChinaBillRow = {
  id: string; bill_date: string | null; supplier_id: string | null; shop: string | null; amount_rmb: number; rate: number | null;
  status: string; is_shipping: boolean; files: number; po_links: { po_id: string; po_no: string }[];
  voucher: { id: string; pv_no: string | null; status: string } | null;
};

export async function listChinaBillsForVoucher(admin: Admin): Promise<ChinaBillRow[]> {
  const { data } = await admin.from("china_bills").select("id, supplier_id, amount_rmb, rate, bill_date, status, is_shipping, attachments, is_active")
    .not("is_active", "is", false).order("bill_date", { ascending: false }).limit(500);
  const bills = ((data ?? []) as Row[]).filter((b) => str(b.status) !== CANCELLED);
  const ids = bills.map((b) => String(b.id));
  const supIds = [...new Set(bills.map((b) => str(b.supplier_id)).filter(Boolean))];
  const [{ data: ps }, { data: links }, { data: vs }] = await Promise.all([
    supIds.length ? admin.from("partners_v2").select("id, display_name, name_th").in("id", supIds) : Promise.resolve({ data: [] as Row[] }),
    ids.length ? admin.from("china_bill_po_links").select("bill_id, po_id, is_active").in("bill_id", ids) : Promise.resolve({ data: [] as Row[] }),
    ids.length ? admin.from("purchase_vouchers_v2").select("id, pv_no, status, china_bill_id").in("china_bill_id", ids) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const shopOf = new Map(((ps ?? []) as Row[]).map((p) => [String(p.id), str(p.display_name) || str(p.name_th)]));
  const linkRows = ((links ?? []) as Row[]).filter((l) => l.is_active !== false);
  const poIds = [...new Set(linkRows.map((l) => str(l.po_id)).filter(Boolean))];
  const { data: pos } = poIds.length ? await admin.from("purchase_orders_v2").select("id, po_no").in("id", poIds) : { data: [] as Row[] };
  const poNo = new Map(((pos ?? []) as Row[]).map((p) => [String(p.id), str(p.po_no)]));
  const vOf = new Map<string, ChinaBillRow["voucher"]>();
  for (const v of (vs ?? []) as Row[]) if (str(v.status) !== "cancelled") vOf.set(str(v.china_bill_id), { id: String(v.id), pv_no: (v.pv_no as string) ?? null, status: str(v.status) });
  return bills.map((b) => ({
    id: String(b.id), bill_date: (b.bill_date as string) ?? null, supplier_id: (b.supplier_id as string) ?? null, shop: b.supplier_id ? shopOf.get(String(b.supplier_id)) ?? null : null,
    amount_rmb: num(b.amount_rmb), rate: num(b.rate) > 0 ? num(b.rate) : null, status: str(b.status), is_shipping: b.is_shipping === true,
    files: chinaBillFiles(b).length,
    po_links: linkRows.filter((l) => str(l.bill_id) === String(b.id)).map((l) => ({ po_id: str(l.po_id), po_no: poNo.get(str(l.po_id)) ?? "" })),
    voucher: vOf.get(String(b.id)) ?? null,
  }));
}

export type ChinaBillVoucherResult =
  | { status: "created"; voucher_id: string; mode: "ai" | "po" | "blank"; ok: number; mid: number; no: number; po_lines: number; total_warn: string | null; warn: string | null }
  | { status: "skipped"; reason: string };

/** 1 บิลโอน → 1 ใบสำคัญร่าง · โยน Error ภาษาคนเมื่อออกไม่ได้ (ยกเลิก/ค่าส่ง/ไม่มีร้าน/ออกแล้ว) */
export async function createVoucherFromChinaBill(admin: Admin, billId: string, opts: { blankIfNone: boolean; actor: { id: string | null; name: string | null } }): Promise<ChinaBillVoucherResult> {
  const { data: b0 } = await admin.from("china_bills").select("id, supplier_id, amount_rmb, rate, bill_date, status, is_shipping, attachments, is_active").eq("id", billId).maybeSingle();
  const b = b0 as Row | null;
  if (!b || b.is_active === false) throw new Error("ไม่พบบิลโอน");
  if (str(b.status) === CANCELLED) throw new Error("บิลนี้ถูกยกเลิกแล้ว");
  if (b.is_shipping === true) throw new Error("บิลค่าส่ง — ผูกที่การ์ดค่าส่งในหน้าใบสำคัญแทน");
  const { data: dup } = await admin.from("purchase_vouchers_v2").select("id, pv_no, status").eq("china_bill_id", billId).neq("status", "cancelled").limit(1);
  const d = ((dup ?? []) as Row[])[0];
  if (d) throw new Error(`บิลนี้ออกใบสำคัญแล้ว (${str(d.pv_no) || "ใบร่าง"})`);
  const { data: p } = b.supplier_id ? await admin.from("partners_v2").select("id, display_name, name_th, is_active").eq("id", String(b.supplier_id)).maybeSingle() : { data: null };
  const partner = p as Row | null;
  if (!partner || partner.is_active === false) throw new Error("บิลนี้ยังไม่ได้ผูกร้านในทะเบียน — ไปเลือกร้านในแอปโอนเงินจีนก่อน");

  const files = chinaBillFiles(b);
  const { data: lk } = await admin.from("china_bill_po_links").select("po_id, is_active").eq("bill_id", billId);
  const linkedPo = new Set(((lk ?? []) as Row[]).filter((l) => l.is_active !== false).map((l) => str(l.po_id)).filter(Boolean));
  const mode: "ai" | "po" | "blank" = files.length ? "ai" : linkedPo.size ? "po" : "blank";
  if (mode === "blank" && !opts.blankIfNone) return { status: "skipped", reason: "ไม่มีรูปบิลและไม่มี PO ที่ผูก" };

  const billDate = str(b.bill_date) || null;
  const amount = num(b.amount_rmb);
  const baseNote = `จากบิลโอนเงินจีน${billDate ? ` ${billDate}` : ""} · ¥${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const voucherId = await createManualVoucher(admin, {
    seller_name: str(partner.display_name) || str(partner.name_th), seller_partner_id: String(partner.id), currency: "RMB",
    voucher_date: billDate && billDate <= todayBkk() ? billDate : null, note: baseNote, actor: opts.actor.name,
  });
  const patch: Row = { china_bill_id: billId };
  if (num(b.rate) > 0) patch.fx_rate = num(b.rate);   // เรทในบิลโอน (ไม่มี = เรทวันที่ใบ จาก createManualVoucher)
  await admin.from("purchase_vouchers_v2").update(patch).eq("id", voucherId);

  const v = (await loadVoucherLite(admin, voucherId))!;
  const groups = await loadShopGroups(admin, v);
  // PO ที่ผูกกับบิลโอนขึ้นก่อน (AI เห็นก่อน · เสมอกันได้เปรียบ)
  const sorted: PoGroup[] = [...groups.filter((g) => linkedPo.has(g.po_id)), ...groups.filter((g) => !linkedPo.has(g.po_id))];
  let ok = 0, mid = 0, no = 0, poLines = 0;
  let totalWarn: string | null = null, warn: string | null = null;

  if (mode === "ai") {
    try {
      const { header, lines, raw } = await parseSellerBill(admin, files, sorted);
      const matched = matchBillLines(lines, sorted, await loadAliases(admin, v.seller_partner_id));
      await admin.from("purchase_delivery_bills").insert({
        voucher_id: voucherId, r2_key: files[0], kind: "seller", bill_no: header.bill_no, seller_text: header.seller_text, bill_date: header.bill_date ?? billDate,
        total_amount: header.total_amount, currency: header.currency, lines: matched, raw: { ...raw, files, china_bill_id: billId }, status: "parsed", created_by: opts.actor.name,
      });
      ok = matched.filter((l) => l.level === "ok").length; mid = matched.filter((l) => l.level === "mid").length; no = matched.filter((l) => l.level === "no").length;
      const read = header.total_amount ?? checkBillMath(matched, null).sum;
      if (amount > 0 && read > 0 && Math.abs(read - amount) > Math.max(1, amount * 0.005)) totalWarn = `ยอดที่อ่านได้ ¥${read.toLocaleString("en-US")} ≠ บิลโอน ¥${amount.toLocaleString("en-US")}`;
      if (matched.length === 0) warn = "AI อ่านรายการไม่ได้ — เปิดใบแล้วอ่านใหม่ / ใส่เอง";
    } catch (e) {
      // อ่านไม่ได้ก็ยังมีใบ + รูปบิลแนบไว้ ให้ไปอ่านใหม่ในหน้าใบ
      warn = `อ่านรูปไม่สำเร็จ: ${String((e as Error).message ?? e)}`;
      await admin.from("purchase_delivery_bills").insert({ voucher_id: voucherId, r2_key: files[0], kind: "seller", bill_date: billDate, lines: [], raw: { files, china_bill_id: billId, error: warn }, status: "parsed", created_by: opts.actor.name });
    }
  } else if (mode === "po") {
    // ใส่บรรทัด PO ที่ผูกกับบิลโอน (จำนวนที่ค้าง · ราคา PO) — แก้ราคา/จำนวนต่อในหน้าใบได้
    const target = groups.filter((g) => linkedPo.has(g.po_id));
    if (target.length < linkedPo.size) warn = "บาง PO ที่ผูกไม่ใช่ของร้านนี้หรือปิดไปแล้ว — ไม่ได้ใส่";
    const skuMap = await loadSkus(admin, [...new Set(target.map((g) => g.item_sku_id ?? "").filter(Boolean))]);
    const { data: full } = target.length ? await admin.from("purchase_order_lines_v2").select("id, item_name").in("id", target.flatMap((g) => g.lines.map((l) => l.id))) : { data: [] as Row[] };
    const nameOf = new Map(((full ?? []) as Row[]).map((r) => [String(r.id), str(r.item_name)]));
    let sort = 0;
    for (const g of target) {
      const basis = parentBasis(g.item_sku_id ? skuMap.get(g.item_sku_id) : undefined);
      for (const l of g.lines.filter((x) => x.remaining > 0)) {
        const { error } = await admin.from("purchase_voucher_lines_v2").insert({
          voucher_id: voucherId, po_id: g.po_id, po_line_id: l.id, po_no: g.po_no, item_sku_id: g.item_sku_id,
          item_name: nameOf.get(l.id) || (g.code ? `[${g.code}] ${g.item_name}` : g.item_name), uom: g.uom, qty: l.remaining,
          unit_price: g.unit_price, price_source: g.unit_price != null ? "po" : "none", cbm_per_unit: basis.cbm, kg_per_unit: basis.kg, sort_order: sort++,
        });
        if (!error) poLines++;
      }
    }
    const sumPo = target.reduce((a, g) => a + g.lines.reduce((s, l) => s + l.remaining * num(g.unit_price), 0), 0);
    if (amount > 0 && sumPo > 0 && Math.abs(sumPo - amount) > Math.max(1, amount * 0.005)) totalWarn = `ยอดตาม PO ¥${Math.round(sumPo * 100) / 100} ≠ บิลโอน ¥${amount}`;
  }
  if (totalWarn) await admin.from("purchase_vouchers_v2").update({ note: `${baseNote} · ⚠ ${totalWarn}` }).eq("id", voucherId);
  await recomputeVoucher(admin, voucherId);
  await writeAudit(admin, { action: "create", entityType: "purchase_vouchers_v2", entityId: voucherId, actorId: opts.actor.id, actorName: opts.actor.name,
    metadata: { from_china_bill: billId, mode, files: files.length, linked_po: linkedPo.size, po_lines: poLines, total_warn: totalWarn } });
  return { status: "created", voucher_id: voucherId, mode, ok, mid, no, po_lines: poLines, total_warn: totalWarn, warn };
}
