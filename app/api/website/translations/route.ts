/**
 * 🌐 ศูนย์แปลภาษา — GET /api/website/translations?shop=<slug>
 *
 * รวบข้อความทุกแหล่งของร้านมาในครั้งเดียว ให้แท็บ "🌐 แปลภาษา" ทำตารางเดียว (components/website-translation-center)
 *   layout   = หน้าแรก (ร่างถ้ามี ไม่งั้นที่เผยแพร่) + ที่เผยแพร่ (ไว้ตัดสินว่าบันทึกเป็นร่างหรือเผยแพร่ได้เลย)
 *   pages    = หน้าเว็บที่สร้างเอง (เหมือนกัน)
 *   theme    = ธีม (เมนู/ท้ายเว็บ/หน้าสินค้า…)
 *   fieldMap = หมวด + หัวข้อตัวเลือก/หน่วย · collections = คอลเลกชันที่ตั้งไว้ (+ ชื่อใน ERP)
 *   info     = ข้อมูลร้าน (ข้อความที่มี _en)
 *   products = สินค้าที่ขึ้นเว็บ: ชื่อ + คำอธิบาย (ช่องอังกฤษอยู่ที่ Parent SKU: name_en / english_description / introduction_en)
 *
 * บันทึก: หน้าจอส่งกลับทาง API เดิมของแต่ละแท็บ (สิทธิ์ + audit + ล้างแคชเว็บตามเดิม) — เส้นนี้อ่านอย่างเดียว
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeBlocks, defaultLayout } from "@/lib/website-blocks";
import { normalizeTheme } from "@/lib/website-theme";
import { normalizeFieldMap, type FieldMap } from "@/lib/website-field-map";
import { maskSiteInfoSecrets, readSiteInfo } from "@/lib/website-site-info";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ช่องคำอธิบายบนเว็บ (ตามที่ร้านตั้งในแท็บจับคู่ฟิลด์) → ช่องไทยที่ใช้แปล + ช่องอังกฤษที่เก็บ */
function descFields(map: FieldMap, p: Record<string, unknown>): { thField: string; th: string; enField: string } | null {
  const src = map.description.source;
  if (src === "none" || src === "english_description") return null;
  const order = [src, "platform_description", "introduction", "description"];
  const thField = order.find((f) => clean(p[f])) ?? src;
  return { thField, th: clean(p[thField]), enField: thField === "introduction" ? "introduction_en" : "english_description" };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, home_layout, home_layout_draft, theme, theme_draft, field_map")
    .eq("slug", slug)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string; home_layout: unknown; home_layout_draft: unknown; theme: unknown; theme_draft: unknown; field_map: unknown };
  const fieldMap = normalizeFieldMap(s.field_map);

  const [{ data: pageRows }, info, { data: listings }] = await Promise.all([
    sb.from("store_pages").select("id, slug, title, is_home, layout, draft_layout, sort_order").eq("shop_id", s.id).order("sort_order"),
    readSiteInfo(sb, s.id),
    sb.from("store_listings").select("parent_sku_id, web_name, sort_order").eq("shop_id", s.id).eq("is_published", true).order("sort_order"),
  ]);

  // สินค้า: ชื่อ + คำอธิบาย (เฉพาะที่ขึ้นเว็บร้านนี้)
  const ids = ((listings ?? []) as { parent_sku_id: string }[]).map((l) => l.parent_sku_id).filter(Boolean);
  const { data: parents } = ids.length
    ? await sb
        .from("parent_skus_v2")
        .select("id, code, name_th, name_en, name_platform, sku_name, introduction, introduction_en, description, platform_description, english_description, cover_image_r2_key")
        .in("id", ids)
    : { data: [] };
  const byId = new Map(((parents ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p]));
  const products = ((listings ?? []) as { parent_sku_id: string; web_name: string | null }[])
    .map((l) => {
      const p = byId.get(l.parent_sku_id);
      if (!p) return null;
      const nameField = clean(p[fieldMap.name.source]) ? fieldMap.name.source : "name_th";
      const d = descFields(fieldMap, p);
      return {
        id: String(p.id),
        code: clean(p.code),
        webName: clean(l.web_name),
        imageKey: clean(p.cover_image_r2_key) || null,
        name: { th: clean(p[nameField]) || clean(p.name_th) || clean(p.code), en: clean(p.name_en) },
        desc: d ? { th: d.th, en: clean(p[d.enField]), enField: d.enField } : null,
      };
    })
    .filter(Boolean);

  // คอลเลกชันที่ตั้งไว้ + ชื่อใน ERP (ชื่อบนเว็บว่าง = ใช้ชื่อนี้)
  const colIds = fieldMap.collections.map((c) => c.id);
  const { data: colNames } = colIds.length ? await sb.from("collections").select("id, name").in("id", colIds) : { data: [] };
  const nameOf = new Map(((colNames ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const layoutPublished = normalizeBlocks(s.home_layout);
  return NextResponse.json({
    shop: { id: s.id, slug: s.slug, name: s.name },
    layout: {
      published: layoutPublished.length ? layoutPublished : defaultLayout(),
      draft: s.home_layout_draft != null ? normalizeBlocks(s.home_layout_draft) : null,
    },
    pages: ((pageRows ?? []) as { id: string; slug: string; title: string; is_home: boolean | null; layout: unknown; draft_layout: unknown }[])
      .filter((p) => !p.is_home)
      .map((p) => ({ id: p.id, slug: p.slug, title: p.title, published: normalizeBlocks(p.layout), draft: p.draft_layout != null ? normalizeBlocks(p.draft_layout) : null })),
    theme: { published: normalizeTheme(s.theme), draft: s.theme_draft != null ? normalizeTheme(s.theme_draft) : null },
    fieldMap,
    collections: fieldMap.collections.map((c) => ({ ...c, name: nameOf.get(c.id) ?? "" })),
    info: maskSiteInfoSecrets(info),
    products,
  });
}
