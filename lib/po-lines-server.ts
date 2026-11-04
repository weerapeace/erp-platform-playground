/**
 * รายการสินค้าในใบสั่งซื้อ (PO) — ของกลางฝั่งเซิร์ฟเวอร์ อ่านได้ทีละหลายใบในครั้งเดียว
 *
 * ใช้ที่:
 *   /api/purchasing/po-detail  (ใบเดียว — ป๊อปรายละเอียด PO · ใบพิมพ์ · หน้าสแกนรับของ)
 *   /api/cashflow/po-lines     (หลายใบ — แท็บ "ต้องจ่าย" หน้ากระแสเงินสด กางแถวร้านแล้วเห็นของในแต่ละ PO)
 *
 * รูป = รูปปกของสินค้า (ของกลาง lib/sku-cover) · หน่วย = ช่อง uom ของบรรทัด ถ้าว่างใช้หน่วยของสินค้า
 * ⚠️ ไฟล์นี้ใช้ supabaseAdmin — ห้าม import จาก client component (import type ได้)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SKU_COVER_SELECT, resolveSkuCover } from "@/lib/sku-cover";

export type PoDetailLine = {
  name: string; qty: number; received: number; uom: string | null;
  price: number; total: number; img: string | null; done: boolean;
  /** รหัสสินค้า — ใช้บนใบพิมพ์ที่แขวนไว้ที่โต๊ะรับของ */
  sku: string | null;
  /** id สินค้าจริงที่ผูกไว้ (null = พิมพ์ชื่อเอง) — ใช้ตอนแก้ใบให้ตัวเลือกสินค้าจำค่าเดิม */
  sku_id: string | null;
  /** id ของบรรทัด PO — ต้องมีเพื่อยืนยันรับของจากหน้าสแกน */
  id: string;
  defective: number;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const CHUNK = 150;

/**
 * อ่านบรรทัดสินค้าของ PO หลายใบ → Map<po_id, บรรทัด[]> (เรียงตาม sort_order · ข้ามบรรทัดที่ปิดใช้งาน)
 * PO ที่ไม่มีบรรทัดจะไม่อยู่ใน Map · อ่านพลาด = throw (ผู้เรียกเลือกเองว่าจะแจ้ง error หรือทำต่อแบบว่าง)
 */
export async function loadPoLines(admin: SupabaseClient, poIds: string[]): Promise<Map<string, PoDetailLine[]>> {
  const out = new Map<string, PoDetailLine[]>();
  const ids = [...new Set(poIds.filter(Boolean))];
  if (!ids.length) return out;

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin.from("purchase_order_lines_v2")
      .select("id, po_id, item_sku_id, item_name, qty, qty_received, qty_defective, uom, price_est, line_total, sort_order, line_status, is_active")
      .in("po_id", ids.slice(i, i + CHUNK)).order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    for (const l of (data ?? []) as Record<string, unknown>[]) if (l.is_active !== false) rows.push(l);
  }

  const skuIds = [...new Set(rows.map((l) => l.item_sku_id).filter(Boolean) as string[])];
  const coverMap = new Map<string, string | null>();
  const uomBySku = new Map<string, string | null>();
  const codeBySku = new Map<string, string | null>();
  if (skuIds.length) {
    const skus: Record<string, unknown>[] = [];
    for (let i = 0; i < skuIds.length; i += CHUNK) {
      const { data: sk } = await admin.from("skus_v2").select("id, code, " + SKU_COVER_SELECT + ", uom_id").in("id", skuIds.slice(i, i + CHUNK));
      skus.push(...((sk ?? []) as unknown as Record<string, unknown>[]));
    }
    const uomIds = [...new Set(skus.map((s) => s.uom_id).filter(Boolean) as string[])];
    const uomName = new Map<string, string>();
    if (uomIds.length) {
      const { data: us } = await admin.from("uoms").select("id, name").in("id", uomIds);
      for (const u of (us ?? []) as Record<string, unknown>[]) uomName.set(String(u.id), String(u.name ?? ""));
    }
    for (const s of skus) {
      coverMap.set(String(s.id), resolveSkuCover(s).key);
      uomBySku.set(String(s.id), s.uom_id ? (uomName.get(String(s.uom_id)) ?? null) : null);
      codeBySku.set(String(s.id), (s.code as string) ?? null);
    }
  }

  for (const l of rows) {
    const sid = l.item_sku_id ? String(l.item_sku_id) : null;
    const key = sid ? coverMap.get(sid) : null;
    const st = String(l.line_status ?? "");
    const remain = Math.max(0, num(l.qty) - num(l.qty_received));
    const line: PoDetailLine = {
      name: String(l.item_name ?? ""), qty: num(l.qty), received: num(l.qty_received),
      uom: (l.uom as string) || (sid ? (uomBySku.get(sid) ?? null) : null),
      price: num(l.price_est), total: num(l.line_total),
      img: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
      done: st === "received" || st === "short_closed" || st === "closed_short" || remain === 0,
      sku: sid ? (codeBySku.get(sid) ?? null) : null,
      sku_id: sid,
      id: String(l.id),
      defective: num(l.qty_defective),
    };
    const poId = String(l.po_id);
    const list = out.get(poId);
    if (list) list.push(line); else out.set(poId, [line]);
  }
  return out;
}
