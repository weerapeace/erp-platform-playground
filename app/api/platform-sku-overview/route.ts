/**
 * มุมกลับ: สินค้าเรา (Parent SKU) ขายอยู่บนแพลตฟอร์มไหนบ้าง — /api/platform-sku-overview
 *  GET ?brand_id=&search=  (products.platforms.view)
 *   → รายการ Parent SKU ที่มีสินค้าจับคู่บนแพลตฟอร์มอย่างน้อย 1 ช่อง + ช่องที่ขาย (code/ราคา/จำนวนรายการ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const brandId = (sp.get("brand_id") ?? "").trim();
  const search = (sp.get("search") ?? "").trim().toLowerCase();
  const admin = supabaseAdmin();

  // แพลตฟอร์มทั้งหมด (id → code/ชื่อ/ไอคอน)
  const { data: pf } = await admin.from("erp_platforms").select("id, code, name_th, icon_key");
  const pMeta = new Map<string, { code: string; name_th: string; icon_key: string | null }>();
  for (const p of ((pf ?? []) as Record<string, unknown>[])) pMeta.set(String(p.id), { code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""), icon_key: (p.icon_key as string) ?? null });

  // รายการสินค้าบนแพลตฟอร์มที่จับคู่ ERP แล้ว
  let lq = admin.from("platform_catalog_listings").select("matched_parent_sku_id, platform_id, price").not("matched_parent_sku_id", "is", null).limit(20000);
  if (brandId) lq = lq.eq("brand_id", brandId);
  const { data: listings } = await lq;
  const rows = (listings ?? []) as { matched_parent_sku_id: string; platform_id: string; price: number | null }[];

  // จัดกลุ่มตาม parent → ช่อง (รวมตาม platform: นับจำนวน + ราคาต่ำสุด)
  type Ch = { platform_id: string; count: number; minPrice: number | null };
  const byParent = new Map<string, Map<string, Ch>>();
  for (const r of rows) {
    let chans = byParent.get(r.matched_parent_sku_id); if (!chans) { chans = new Map(); byParent.set(r.matched_parent_sku_id, chans); }
    let c = chans.get(r.platform_id); if (!c) { c = { platform_id: r.platform_id, count: 0, minPrice: null }; chans.set(r.platform_id, c); }
    c.count += 1;
    if (r.price != null) c.minPrice = c.minPrice == null ? r.price : Math.min(c.minPrice, r.price);
  }

  // ชื่อ/รหัส Parent (ถามชุดย่อย)
  const parentIds = [...byParent.keys()];
  const pInfo = new Map<string, { code: string; name: string }>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", parentIds.slice(i, i + 200));
    for (const p of ((data ?? []) as Record<string, unknown>[])) pInfo.set(String(p.id), { code: String(p.code ?? ""), name: String(p.name_th ?? p.code ?? "") });
  }

  let items = parentIds.map((pid) => {
    const info = pInfo.get(pid) ?? { code: "?", name: "" };
    const channels = [...byParent.get(pid)!.values()].map((c) => ({
      platform_id: c.platform_id, code: pMeta.get(c.platform_id)?.code ?? "", name_th: pMeta.get(c.platform_id)?.name_th ?? "",
      icon_key: pMeta.get(c.platform_id)?.icon_key ?? null, count: c.count, price: c.minPrice,
    })).sort((a, b) => a.name_th.localeCompare(b.name_th));
    return { parent_sku_id: pid, code: info.code, name: info.name, channels };
  });
  if (search) items = items.filter((x) => `${x.code} ${x.name}`.toLowerCase().includes(search));
  items.sort((a, b) => a.code.localeCompare(b.code, "th"));

  return NextResponse.json({ items, total: parentIds.length, error: null });
}
