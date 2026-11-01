/**
 * 📦 ยอดสต๊อกต่อ SKU — ของกลาง (ทุกหน้าที่โชว์สต๊อกราย SKU ใช้ตัวนี้)
 *   ตัวจริง = ledger กลาง erp_playground_stock_balances (product_id = skus_v2.id · รวมทุกคลัง) — ระบบคลังเขียนที่นี่
 *   สำรอง  = sku_stock_balances (ตารางเก่า · ยังไม่มีใครเขียน) ใช้เฉพาะ SKU ที่ ledger ไม่มีแถว
 *   ⚠️ SKU ที่ไม่อยู่ใน Map = "ยังไม่มีข้อมูลสต๊อก" — อย่าตีความเป็น 0 (หมด)
 *   ต้องเรียกด้วย supabaseAdmin หลังตรวจสิทธิ์แล้ว (ledger ไม่เปิดให้ผู้ใช้อ่านตรง)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/fetch-all";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type SkuStock = { onHand: number; reserved: number; lastMovementAt: string | null };
type LedgerRow = { product_id: string; qty_on_hand: number | string | null; qty_reserved: number | string | null; last_movement_at: string | null };
type LegacyRow = { sku_id: string; qty_on_hand: number | string | null; last_movement_at: string | null };

const CHUNK = 300;
const num = (v: unknown) => Number(v) || 0;
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** รวมแถว ledger (หลายคลัง → บวกกัน) แล้วเติมจากตารางเก่าเฉพาะ SKU ที่ ledger ไม่มี (pure) */
export function mergeSkuStock(ledger: LedgerRow[], legacy: LegacyRow[], out = new Map<string, SkuStock>()): Map<string, SkuStock> {
  const fromLedger = new Set<string>();
  for (const r of ledger) {
    if (!r.product_id) continue;
    fromLedger.add(r.product_id);
    const cur = out.get(r.product_id) ?? { onHand: 0, reserved: 0, lastMovementAt: null };
    out.set(r.product_id, { onHand: cur.onHand + num(r.qty_on_hand), reserved: cur.reserved + num(r.qty_reserved), lastMovementAt: later(cur.lastMovementAt, r.last_movement_at) });
  }
  for (const r of legacy) {
    if (!r.sku_id || fromLedger.has(r.sku_id) || out.has(r.sku_id)) continue;
    out.set(r.sku_id, { onHand: num(r.qty_on_hand), reserved: 0, lastMovementAt: r.last_movement_at });
  }
  return out;
}

const LEDGER_COLS = "product_id, qty_on_hand, qty_reserved, last_movement_at";
const LEGACY_COLS = "sku_id, qty_on_hand, last_movement_at";

/** ยอดของ SKU ที่ระบุ */
export async function loadSkuStock(admin: Admin, skuIds: string[]): Promise<Map<string, SkuStock>> {
  const ids = [...new Set(skuIds.filter(Boolean))];
  const out = new Map<string, SkuStock>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const [ledger, legacy] = await Promise.all([
      fetchAllPages<LedgerRow>((from, to) => admin.from("erp_playground_stock_balances").select(LEDGER_COLS).in("product_id", part).order("product_id").order("warehouse_id").order("location_code").range(from, to)),
      fetchAllPages<LegacyRow>((from, to) => admin.from("sku_stock_balances").select(LEGACY_COLS).in("sku_id", part).order("sku_id").range(from, to)),
    ]);
    mergeSkuStock(ledger, legacy, out);
  }
  return out;
}

/** ทุก SKU ที่มียอด (หน้า "ยอดคงเหลือ SKU") — เคลื่อนไหวล่าสุดก่อน */
export async function listSkuStock(admin: Admin, limit: number): Promise<{ skuId: string; stock: SkuStock }[]> {
  const [ledger, legacy] = await Promise.all([
    fetchAllPages<LedgerRow>((from, to) => admin.from("erp_playground_stock_balances").select(LEDGER_COLS).order("product_id").order("warehouse_id").order("location_code").range(from, to)),
    fetchAllPages<LegacyRow>((from, to) => admin.from("sku_stock_balances").select(LEGACY_COLS).order("sku_id").range(from, to)),
  ]);
  return [...mergeSkuStock(ledger, legacy)]
    .map(([skuId, stock]) => ({ skuId, stock }))
    .sort((a, b) => (b.stock.lastMovementAt ?? "").localeCompare(a.stock.lastMovementAt ?? ""))
    .slice(0, limit);
}
