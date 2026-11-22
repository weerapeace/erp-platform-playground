/**
 * เช็กกับร้านตอนนี้ — สินค้า 1 ตัว × ร้าน 1 ร้าน (ปุ่มในแท็บแพลตฟอร์มของ Parent SKU · เจ้าของเลือก 2026-11-21 ข้อ 3)
 *  POST { parent_sku_id, platform_code }  (products.platforms.edit — บันทึกรายการสินค้าบนร้านในระบบ)
 *   → ดึงสินค้าร้านนั้น "เฉพาะตัวที่เปลี่ยน" ต่อจากรอบก่อน (app/api/platform-catalog/refresh-changed · Lazada / Shopee / TikTok · LINE = ทั้งร้าน)
 *   → ดูว่าสินค้านี้จับคู่อยู่บนร้านแล้วไหม (จับคู่รหัสตรงให้ระหว่างบันทึก)
 *   ← { on_shop: { id, external_id, title } | null, fresh_at, refreshed: { ok, done, saved, newly_matched, error } }
 * ⚠️ อ่านจากร้านอย่างเดียว ไม่แก้อะไรบนร้าน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { checkParentOnShop } from "../../platform-catalog/refresh-changed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
const CHECKABLE = new Set(["lazada", "shopee", "tiktok", "line_shopping"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { parent_sku_id?: string; platform_code?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const parentId = String(body.parent_sku_id ?? "").trim();
  const code = String(body.platform_code ?? "").trim();
  if (!parentId || !code) return NextResponse.json({ error: "ต้องมี parent_sku_id + platform_code" }, { status: 400 });
  if (!CHECKABLE.has(code)) return NextResponse.json({ error: "ร้านนี้ยังเช็กอัตโนมัติไม่ได้ — กด \"ดึงสินค้าจากร้าน\" ในหน้าสินค้าบนแพลตฟอร์มแทน" }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const c = await checkParentOnShop(admin, code, parentId, 25_000, { force: true });
  if (!c.brandId) return NextResponse.json({ error: "สินค้านี้ยังไม่มีแบรนด์ — ตั้งแบรนด์ก่อน (ร้านผูกกับแบรนด์)" }, { status: 400 });
  const r = c.result;
  if ((r?.saved ?? 0) > 0 || c.onShop) {
    await writeAudit(admin, {
      action: "import", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: `${code}_shop_check`, parent_sku_id: parentId, brand_id: c.brandId, saved: r?.saved ?? 0, newly_matched: r?.newly_matched ?? 0, on_shop: c.onShop?.external_id ?? null, error: r?.error ?? null },
    });
  }
  return NextResponse.json({
    on_shop: c.onShop, fresh_at: c.freshAt,
    refreshed: r ? { ok: r.ok, done: r.done, saved: r.saved, newly_matched: r.newly_matched, error: r.error } : null,
    error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}
