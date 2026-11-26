// ตัวดึงใบปะหน้าจริงของ Shopee (2026-11-26) — เรียกจาก app/api/shipping-labels (ทะเบียน adapters.ts) · ไม่เปลี่ยนสถานะออเดอร์
// ขั้นตอน: เลขพัสดุ (ไม่มี = ดึง get_tracking_number · ยังไม่มี = "ยังไม่นัดส่ง") → ชนิดใบ → สร้างงานไฟล์ → รอ READY → ดาวน์โหลดทีละใบ
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  shopeeCreateShippingDoc, shopeeDownloadShippingDoc, shopeeErrorText, shopeeGetShippingDocParams, shopeeGetShippingDocResult, shopeeGetTrackingNumber,
  type ShopeeDocOrder,
} from "@/lib/shopee";
import { labelFailureText, type LabelFetchResult } from "@/lib/shipping-label";
import { shopeeTokenOrReason } from "./shared";

export type LabelOrderRow = {
  id: string; order_no: string | null; external_order_id: string | null; package_no: string | null; tracking_no: string | null;
  brand_id: string | null; platform_id: string | null; status: string | null; platform_status: string | null; source: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keyOf = (sn: string, pkg: string | null | undefined) => `${sn}|${pkg ?? ""}`;

/** ออเดอร์ร้านเดียวกัน (แบรนด์ × แพลตฟอร์ม) ≤ 50 ใบ → ผลต่อออเดอร์ */
export async function fetchShopeeLabels(admin: SupabaseClient, rows: LabelOrderRow[], userId: string | null): Promise<LabelFetchResult[]> {
  const out = new Map<string, LabelFetchResult>();
  const fail = (r: LabelOrderRow, code: string, message?: string | null) => out.set(r.id, { id: r.id, order_no: r.order_no, ok: false, code, reason: labelFailureText(code, message) });
  const first = rows[0];
  if (!first?.brand_id || !first.platform_id) { rows.forEach((r) => fail(r, "no_shop", "ออเดอร์นี้ไม่ได้ผูกร้าน Shopee")); return rows.map((r) => out.get(r.id)!); }
  const tok = await shopeeTokenOrReason(admin, first.brand_id, first.platform_id, userId);
  if (!tok.ok) { rows.forEach((r) => fail(r, "token", tok.reason)); return rows.map((r) => out.get(r.id)!); }
  const { accessToken, shopId } = tok;

  // 1) เลขพัสดุ — ระบบเติมทุก 15 นาที (fillShopeeTracking) · ยังว่าง = ถาม Shopee ตรง (อ่านอย่างเดียว) แล้วเก็บไว้
  const todo: (LabelOrderRow & { sn: string; tn: string })[] = [];
  await Promise.all(rows.map(async (r) => {
    const sn = (r.external_order_id ?? "").trim();
    if (!sn) return fail(r, "no_order_sn", "ไม่มีเลขออเดอร์ Shopee");
    if (r.status === "cancelled") return fail(r, "cancelled");
    let tn = (r.tracking_no ?? "").trim();
    if (!tn) {
      try { tn = (await shopeeGetTrackingNumber(accessToken, shopId, sn, r.package_no)) ?? ""; }
      catch (e) { return fail(r, "tracking", shopeeErrorText(e)); }
      if (!tn) return fail(r, "no_tracking");
      await admin.from("platform_orders").update({ tracking_no: tn }).eq("id", r.id).is("tracking_no", null);
    }
    todo.push({ ...r, sn, tn });
  }));
  if (!todo.length) return rows.map((r) => out.get(r.id)!);
  const byKey = new Map(todo.map((r) => [keyOf(r.sn, r.package_no), r]));
  const rowOf = (sn: string, pkg: string | null) => byKey.get(keyOf(sn, pkg)) ?? todo.find((r) => r.sn === sn);
  const docOrder = (r: (typeof todo)[number]): ShopeeDocOrder => ({ order_sn: r.sn, package_number: r.package_no, tracking_number: r.tn });

  try {
    // 2) ชนิดใบ (ใบความร้อนก่อน)
    const params = await shopeeGetShippingDocParams(accessToken, shopId, todo.map(docOrder));
    const typed: (ShopeeDocOrder & { doc_type: string; row: (typeof todo)[number] })[] = [];
    for (const p of params) {
      const r = rowOf(p.order_sn, p.package_number); if (!r) continue;
      if (p.fail_error) fail(r, p.fail_error, p.fail_message);
      else typed.push({ ...docOrder(r), doc_type: p.doc_type, row: r });
    }
    for (const r of todo) if (!out.has(r.id) && !typed.some((t) => t.row.id === r.id)) typed.push({ ...docOrder(r), doc_type: "THERMAL_AIR_WAYBILL", row: r });   // Shopee ไม่ตอบใบนี้ = ใช้ค่าเริ่ม

    // 3) สร้างงานไฟล์
    let ready = typed;
    if (typed.length) {
      const created = await shopeeCreateShippingDoc(accessToken, shopId, typed);
      const bad = new Set<string>();
      for (const c of created) if (c.fail_error) { const t = typed.find((x) => x.order_sn === c.order_sn); if (t) { fail(t.row, c.fail_error, c.fail_message); bad.add(t.row.id); } }
      ready = typed.filter((t) => !bad.has(t.row.id));
    }

    // 4) รอจนไฟล์พร้อม (≤ ~10 วิ)
    let waiting = ready;
    const done: typeof ready = [];
    for (let i = 0; i < 8 && waiting.length; i++) {
      await sleep(i === 0 ? 800 : 1200);
      const res = await shopeeGetShippingDocResult(accessToken, shopId, waiting);
      const still: typeof ready = [];
      for (const t of waiting) {
        const s = res.find((x) => x.order_sn === t.order_sn && (x.package_number ?? null) === (t.package_number ?? null)) ?? res.find((x) => x.order_sn === t.order_sn);
        if (!s || s.status === "PROCESSING" || (!s.status && !s.fail_error)) still.push(t);
        else if (s.status === "READY") done.push(t);
        else fail(t.row, s.fail_error ?? "failed", s.fail_message);
      }
      waiting = still;
    }
    waiting.forEach((t) => fail(t.row, "not_ready"));

    // 5) ดาวน์โหลดทีละใบ (ทีละ 3 ใบขนานกัน)
    for (let i = 0; i < done.length; i += 3) {
      await Promise.all(done.slice(i, i + 3).map(async (t) => {
        try {
          const bytes = await shopeeDownloadShippingDoc(accessToken, shopId, t, t.doc_type);
          out.set(t.row.id, { id: t.row.id, order_no: t.row.order_no, ok: true, pdf: Buffer.from(bytes).toString("base64"), doc_type: t.doc_type });
        } catch (e) {
          const code = String((e as { code?: string }).code ?? "");
          fail(t.row, code || "download", code.startsWith("logistics.") ? (e as Error).message : shopeeErrorText(e));
        }
      }));
    }
  } catch (e) {
    // ทั้งชุดพัง (กุญแจ/ระบบ Shopee) — ใบที่ยังไม่มีผลได้เหตุผลเดียวกัน
    const msg = shopeeErrorText(e);
    for (const r of todo) if (!out.has(r.id)) fail(r, String((e as { code?: string }).code ?? "error"), msg);
  }
  return rows.map((r) => out.get(r.id) ?? { id: r.id, order_no: r.order_no, ok: false, code: "unknown", reason: labelFailureText("unknown") });
}
