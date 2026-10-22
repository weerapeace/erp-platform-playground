/**
 * API สาธารณะ — ตั้งค่าเว็บร้าน (ธีม/โลโก้) : /api/public/storefront/site?shop=<slug>
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้านภายนอกดึงไปตกแต่งหน้าเว็บ
 * ส่งเฉพาะข้อมูลหน้าตาเว็บ ไม่มีข้อมูลภายใน (คู่กับ /api/public/storefront/products)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา + มี CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allowDraftPreview } from "@/lib/storefront-preview-access";
import { normalizeBlocks } from "@/lib/website-blocks";
import { normalizeTheme } from "@/lib/website-theme";
import { loadParentWebFields } from "@/lib/website-parent-fields";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { readSiteInfo, publicSiteInfo, popularTermsOf } from "@/lib/website-site-info";
import { mergePopularTerms, readSearchTerms } from "@/lib/website-search-terms";
import { fitTargetOf, type FitTarget } from "@/lib/fit-check";
import { readGiftCards } from "@/lib/website-gift-cards-db";
import { publicShipping, readShipping } from "@/lib/website-shipping-db";
import { readPublicPromotions } from "@/lib/website-promotions-db";
import { couponLabel, evaluateCoupon } from "@/lib/website-coupons";
import { couponUsage, loadCouponByCode } from "@/lib/website-coupons-db";
import { buildBeltBuilderPayload } from "@/lib/belt-builder-public";
import { SwatchIndex, rowToSwatchEntry, SWATCH_SELECT } from "@/lib/color-swatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * ไม่แคชที่ edge เลย — เว็บร้านแคชเอง 60 วิ (ISR + tag) และถูก ERP สั่งล้างตอนเผยแพร่ (lib/storefront-revalidate.ts)
 * ⚠️ เคยพลาด: Vercel edge แคชไว้ 60 วิ → เผยแพร่/บันทึกร่างแล้ว เว็บยังโชว์ของเก่า
 */
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  // preview=1 → ใช้ "ร่าง" ที่ยังไม่เผยแพร่ (หน้าตั้งค่าธีมใช้ดูผลก่อนกดเผยแพร่)
  // 🔑 ร่าง = ต้องมีรหัสพรีวิว/พนักงาน (lib/storefront-preview-access · ช่วงเปลี่ยนผ่านยังปล่อย + จด log)
  const preview = url.searchParams.get("preview") === "1" && !!shopSlug && (await allowDraftPreview(request, shopSlug, "site"));
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, theme, theme_draft, home_layout, home_layout_draft, field_map")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);

  const s = shop as {
    id: string;
    name: string;
    slug: string;
    status: string;
    theme: unknown;
    theme_draft: unknown;
    home_layout: unknown;
    home_layout_draft: unknown;
    field_map: unknown;
  };

  // ข้อมูลร้าน (คำโปรย/ติดต่อ/ค่าส่ง/ช่องทางจ่าย) — ส่งเฉพาะชุดสาธารณะ
  const fullInfo = await readSiteInfo(sb, s.id);
  const info: ReturnType<typeof publicSiteInfo> & { promo_label?: string } = publicSiteInfo(fullInfo);
  // 🚚 วิธีจัดส่ง (lib/website-shipping) — เว็บรุ่นเก่าที่ยังใช้ค่าส่งเหมา: เทียบค่าส่ง/ส่งฟรีจากวิธีส่งถึงบ้านวิธีแรก ให้ตะกร้าบอกตรงกับตอนสั่ง
  const shipping = publicShipping(await readShipping(sb, s.id, fullInfo));
  const firstShip = shipping.methods.find((m) => m.kind === "ship");
  if (!shipping.legacy && firstShip) {
    info.shipping_flat = firstShip.fee.kind === "flat" ? firstShip.fee.amount : Math.min(...firstShip.fee.tiers.map((t) => t.fee));
    info.free_shipping_min = firstShip.freeMin;
  }
  // 🎁 ป๊อปอัปลูกค้าใหม่: แนบคำอธิบายส่วนลดของโค้ด · คูปองปิด/หมดอายุ/ไม่มีจริง = ปิดป๊อปอัปให้เอง (ไม่แจกโค้ดที่ใช้ไม่ได้)
  if (info.promo_enabled) {
    const cp = info.promo_code ? await loadCouponByCode(sb, s.id, info.promo_code) : null;
    // ยอดสมมุติ = ถึงขั้นต่ำพอดี (ดูแค่ว่าโค้ดยังเปิด/ไม่หมดอายุ/ยังไม่ครบจำนวน) · ไม่รู้เบอร์ลูกค้า
    const usable = cp && evaluateCoupon(cp, Math.max(cp.minSubtotal, 1000), await couponUsage(sb, cp));
    if (cp && usable && usable.ok) info.promo_label = couponLabel(cp);
    else info.promo_enabled = false;
  }

  // 📐 เช็คขนาด: ตุ๊กตา/ของที่มีขนาด (ทะเบียน product_fit_items · ตุ๊กตาขึ้นก่อน) — ร้านไม่เปิด = ไม่ส่ง
  let fitTargets: FitTarget[] | undefined;
  if (info.fit_check_enabled) {
    const { data: fr } = await sb.from("product_fit_items").select("id, name, name_en, is_active, kind, width_cm, height_cm, depth_cm, is_soft, size_estimated, sort_order, image_key").eq("is_active", true).order("sort_order");
    const all = ((fr ?? []) as Parameters<typeof fitTargetOf>[0][]).map((r) => fitTargetOf(r)).filter((x): x is FitTarget => !!x);
    fitTargets = [...all.filter((t) => t.kind === "doll"), ...all.filter((t) => t.kind !== "doll")];
  }

  // 🧵 ออกแบบเข็มขัด: ชิ้นส่วน + กติกาไซซ์ + ราคาฐาน (เฉพาะร้านที่เปิด belt_enabled และมีสาย+หัวอย่างน้อยอย่างละ 1) — lib/belt-builder-public
  const beltBuilder = info.belt_enabled ? await buildBeltBuilderPayload(sb, s.id, info) : null;

  const themeSource = preview && s.theme_draft != null ? s.theme_draft : s.theme;
  const layoutSource = preview && s.home_layout_draft != null ? s.home_layout_draft : s.home_layout;
  const theme = normalizeTheme(themeSource);
  // 🔍 คำยอดนิยม (ค้นหาเต็มจอตอนยังไม่พิมพ์) — เฉพาะร้านที่เปิด page.searchEmpty · คำที่ร้านตั้ง + คำที่ลูกค้าค้นจริงบ่อยและหาเจอ
  const popularSearches = theme.page.searchEmpty !== "cats" ? mergePopularTerms(popularTermsOf(fullInfo.search_popular), await readSearchTerms(sb, s.id, 30)) : undefined;

  return json({
    shop: s.slug,
    shopName: s.name,
    active: s.status === "active",
    preview,
    theme,
    ...(popularSearches ? { popularSearches } : {}),
    /** โครงหน้าแรก — [] = ยังไม่เคยตั้ง ให้เว็บใช้โครงเริ่มต้นของตัวเอง */
    // normalize ก่อนส่ง: เติม id ให้ Block ย่อยเหมือนที่ตัวจัดหน้าเห็น (บล็อกชนิดเก่าของร้านอื่นถูกเก็บไว้ทั้งก้อน)
    layout: normalizeBlocks(layoutSource),
    /**
     * หมวดสินค้าของร้าน [{key,label,icon}] — เจ้าของเพิ่ม/แก้เองได้ในแท็บจับคู่ฟิลด์
     * เว็บร้านต้องวาดเมนูหมวดจากรายการนี้ ห้ามฝังไว้ในโค้ดเว็บ ไม่งั้นเพิ่มหมวดแล้วไม่ขึ้น
     */
    categories: normalizeFieldMap(s.field_map).categories,
    /** 📐 ตุ๊กตา/ของที่มีขนาด (เฉพาะร้านที่เปิดเช็คขนาด) [{id,name,w,h,d,soft,estimated,kind,imageKey?}] — Section เช็คขนาดบนเว็บ (lib/fit-check) */
    ...(fitTargets ? { fitTargets } : {}),
    /** 🧵 ออกแบบเข็มขัด (เฉพาะร้านที่เปิด) {canvas,basePrice,engraving,parts[],sizeRules[]} — Section "ออกแบบเข็มขัด" + หน้า /belt-builder (lib/belt-builder-public) */
    ...(beltBuilder ? { beltBuilder } : {}),
    /**
     * 📖 หน้าคอลเลกชัน (เปิดไว้ในแท็บ 🎞 คอลเลกชัน) [{id,slug,name,title,bannerKey,mobileBannerKey,story,seoTitle,seoDescription}] เรียงตามที่จัด
     * เว็บร้าน: /collection/<slug> + Section "คอลเลกชัน" · สินค้าในคอลเลกชัน = products API ช่อง collection (id)
     */
    collections: await (async () => {
      const cs = normalizeFieldMap(s.field_map).collections.filter((c) => c.enabled);
      if (!cs.length) return [];
      const { data } = await sb.from("collections").select("id, name").in("id", cs.map((c) => c.id));
      const name = new Map(((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
      return cs.filter((c) => name.has(c.id)).map((c) => ({ ...c, name: name.get(c.id) ?? "" }));
    })(),
    /**
     * ข้อมูลร้าน — เว็บร้านใช้วาด footer/หน้าติดต่อ/เงื่อนไขค่าส่ง (แก้ได้ที่แท็บ "🏪 ข้อมูลร้าน")
     * เว็บรุ่นเก่าที่ยังไม่รู้จักฟิลด์นี้จะข้ามไปเอง
     */
    info,
    /** 🏷 โปรโมชันอัตโนมัติที่เปิด + ยังไม่หมดเวลา — เว็บร้านโชว์ป้าย/ราคา ⚡/ส่วนลดในตะกร้า ด้วยไฟล์มิเรอร์ src/lib/promotions.ts (ERP คิดใหม่ตอนรับออเดอร์เสมอ) */
    promotions: await readPublicPromotions(sb, s.id),
    /** 🚚 วิธีจัดส่งที่เปิด + กติกาค่าส่ง + รหัสไปรษณีย์ห่างไกล — เว็บร้านคิดค่าส่งด้วยไฟล์มิเรอร์ lib/website-shipping.ts (ERP คิดใหม่ตอนรับออเดอร์เสมอ) */
    shipping,
    /** ป้ายชื่อฟิลด์สเปก (key → label) ให้เว็บร้านวาดตาราง "วัสดุและขนาด" */
    specFields: (await loadParentWebFields(sb)).map((f) => ({ key: f.key, label: f.label })),
    /**
     * 🎨 โทนสี (ของกลางทุกร้าน) [{key,name,hex}] เรียงตามที่จัด — ปุ่ม "กรองตามสี" ในหน้าสินค้า
     * สินค้าแต่ละตัวบอกโทนของแต่ละสีเองใน products API (options.items[].tones) · เว็บโชว์เฉพาะโทนที่มีสินค้า
     */
    /**
     * 🎴 การ์ดของขวัญ (ร้านเปิดห่อของขวัญ + ให้เขียนการ์ด) — ขนาด/ลายที่เปิด/โอกาส+ไอเดียข้อความ · ปิด = null
     * ตั้งใน ERP แท็บ 🏪 ข้อมูลร้าน → 🎴 ตั้งค่าการ์ด · ตัววาดต้องตรงกับ lib/website-gift-cards.ts giftCardHtml
     */
    giftCards:
      (info.gift_enabled && info.gift_allow_message) || info.card_enabled // 💌 ขายการ์ดแยกก็ใช้ลายการ์ดชุดเดียวกัน
        ? await readGiftCards(sb, s.id).then((c) => ({ ...c, designs: c.designs.filter((d) => d.enabled) }))
        : null,
    colorTones: await (async () => {
      const [{ data }, { data: dict }] = await Promise.all([
        sb.from("erp_color_tones").select("key, name, hex").eq("is_active", true).order("sort_order"),
        sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
      ]);
      // 🌐 ชื่อโทนภาษาอังกฤษจากทะเบียนสีกลาง (ดำ → Black · "ขาว / ครีม" แปลทีละคำ) — หน้า /en ของตัวกรองสี
      const idx = new SwatchIndex(((dict ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry));
      return ((data ?? []) as { key: string; name: string; hex: string }[]).map((t) => {
        const en = idx.english(t.name);
        return en ? { ...t, name_en: en } : t;
      });
    })(),
  });
}
