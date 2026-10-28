/**
 * 🔔 "แจ้งฉันเมื่อมีของ" — ตรวจเป้าหมายที่ลูกค้าฝากไว้ (ฝั่งเซิร์ฟเวอร์ · ใช้ร่วม API สาธารณะ + API สมาชิก)
 *   สินค้า (productId) = เผยแพร่ในร้านนี้ + ตั้ง "สินค้าหมด" อยู่ · ชุดมาใหม่ (dropId) = ของร้านนี้ + ยังไม่ถึงเวลาเปิด
 * ⚠️ lib/website-restock.ts เป็นไฟล์มิเรอร์ (pure ไป storefront) — ของที่แตะ DB อยู่ไฟล์นี้
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RestockTarget = { parent_sku_id: string | null; drop_id: string | null };

export async function resolveRestockTarget(
  sb: Admin,
  shopId: string,
  raw: { productId?: unknown; dropId?: unknown },
  now = Date.now(),
): Promise<{ ok: true; target: RestockTarget } | { ok: false; error: string; status: number }> {
  const dropId = typeof raw.dropId === "string" ? raw.dropId.trim() : "";
  const productId = typeof raw.productId === "string" ? raw.productId.trim() : "";
  if (dropId) {
    if (!UUID.test(dropId)) return { ok: false, error: "รหัสชุดไม่ถูกต้อง", status: 400 };
    const { data } = await sb.from("store_new_drops").select("id, start_at").eq("shop_id", shopId).eq("id", dropId).maybeSingle();
    const d = data as { id: string; start_at: string } | null;
    if (!d) return { ok: false, error: "ไม่พบชุดนี้", status: 404 };
    if (Date.parse(d.start_at) <= now) return { ok: false, error: "ชุดนี้เปิดขายแล้ว สั่งซื้อได้เลย", status: 409 };
    return { ok: true, target: { parent_sku_id: null, drop_id: d.id } };
  }
  if (!UUID.test(productId)) return { ok: false, error: "รหัสสินค้าไม่ถูกต้อง", status: 400 };
  const { data: listing } = await sb.from("store_listings").select("is_published, web_stock_status").eq("shop_id", shopId).eq("parent_sku_id", productId).maybeSingle();
  const l = listing as { is_published: boolean; web_stock_status: string | null } | null;
  if (!l || !l.is_published) return { ok: false, error: "ไม่พบสินค้านี้บนเว็บ", status: 404 };
  if (l.web_stock_status !== "out") return { ok: false, error: "สินค้านี้มีของแล้ว สั่งซื้อได้เลย", status: 409 };
  return { ok: true, target: { parent_sku_id: productId, drop_id: null } };
}
