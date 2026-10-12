/**
 * หลัง "เผยแพร่" (หน้าแรก / หน้าเว็บ / ธีม) → สั่งเว็บร้านล้างแคช ให้เว็บจริงเปลี่ยนทันที
 *
 * เว็บร้าน (repo storefront) แคชข้อมูลจาก ERP ไว้ 60 วิ (ISR) — ถ้าไม่สั่งล้าง เจ้าของกดเผยแพร่แล้วเห็นของเก่าอยู่ ~1 นาที
 * ปลายทาง: <โดเมนร้านใน shop_domains>/api/revalidate?shop=<slug> (เว็บร้านเช็กว่า slug ตรงกับร้านตัวเอง)
 * ล้มเหลว/ไม่มีโดเมน = ไม่เป็นไร เว็บจะอัปเดตเองใน ≤60 วิ — คืน false ให้ผู้เรียกบอกผู้ใช้ตามจริง
 */
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export async function purgeStorefrontCache(sb: Admin, shopId: string): Promise<boolean> {
  try {
    const { data: shop } = await sb.from("shops").select("slug").eq("id", shopId).maybeSingle();
    const slug = (shop as { slug: string } | null)?.slug;
    if (!slug) return false;
    const { data: dom } = await sb.from("shop_domains").select("domain").eq("shop_id", shopId).limit(1).maybeSingle();
    const raw = (dom as { domain: string } | null)?.domain ?? null;
    if (!raw) return false;
    const base = raw.startsWith("http") ? raw : `https://${raw}`;
    const res = await fetch(`${base.replace(/\/$/, "")}/api/revalidate?shop=${encodeURIComponent(slug)}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
