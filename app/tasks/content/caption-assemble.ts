// ============================================================
// ประกอบข้อความแคปชั่นที่จะโพสต์ (ของกลาง) — แม่แบบ + แคปชั่น + แฮชแท็ก + ตัวแปรสินค้า (ราคา/สี/ลิงก์ร้าน/หลายสินค้า)
// ใช้ร่วม: drawer คอนเทนต์ (ปุ่ม 📋 / 👁 ของแต่ละแพลตฟอร์ม) + ปฏิทินคอนเทนต์ (ปุ่ม 📋 ในการ์ดลอย)
// → กดคัดลอกที่ไหนก็ได้ข้อความเดียวกันเป๊ะ · แก้กติกาที่นี่ที่เดียว
// ============================================================

import { renderCaption, type ShopChannel } from "@/lib/caption-template";
import {
  getContent, getCaptionTemplates, getParentSkuChildren, getPlatformSettings, getCaptionConfig, defaultHashtags,
  type ContentCaption, type ContentDetail, type CaptionTemplate, type PlatformSetting, type PlatformSettings, type ParentSkuChild, type CaptionConfig,
} from "../data";
import { platformLabel } from "../use-options";
import { multiProductVars, activeChildren, extrasFromDetail, type ExtraProduct } from "./content-products-editor";

/** ตัวแปรสินค้าที่ใช้ร่วมทุกแพลตฟอร์ม (ไม่รวม caption/hashtags ที่ต่างกันต่อแพลตฟอร์ม) */
export type SharedVars = { shop: ShopChannel[]; fake_price: number | string | null; real_price: number | string | null; price: number | string | null; color: string | null; sku: string | null; product: string | null; link: string | null };

export type CaptionVarsInput = {
  sku: { code: string; name: string; color?: string | null; list_price?: number | null; fake_price?: number | null } | null;
  parent: { code: string; name: string } | null;
  productName: string | null;
  skuColorTh: string | null; skuColorEn: string | null;   // สีของ SKU เดี่ยว (จาก detail)
  children: ParentSkuChild[];        // SKU ลูกของ Parent ตัวหลัก
  skuIds: string[];                  // เลือกหลายสี (ว่าง = ทุกสี)
  priceSkuId: string;                // ราคาจาก SKU ลูกตัวไหน ("" = ตัวแรก)
  colorSource: "th" | "en";
  links: { platform: string; url: string }[];
  extras: ExtraProduct[];
  shopChannels: ShopChannel[];
};

/** ราคา/สี/ลิงก์ → ตัวแปรแม่แบบ (+ ค่าที่หน้าจอใช้โชว์ต่อ) — pure ไม่ยิง API */
export function buildCaptionVars(i: CaptionVarsInput) {
  // สี: Parent → รวมสีลูก (ไทย/อังกฤษ) · SKU เดี่ยว → สีของตัวเอง
  const usedChildren = activeChildren(i.children, i.skuIds);
  const childColors = [...new Set(usedChildren.map((c) => ((i.colorSource === "en" ? c.color_en : c.color_th) ?? "").trim()).filter(Boolean))];
  const singleColor = i.colorSource === "en" ? (i.skuColorEn ?? i.sku?.color ?? null) : (i.skuColorTh ?? i.sku?.color ?? null);
  const colorText = childColors.length ? childColors.join(", ") : (i.sku ? singleColor : null);
  // ราคา: SKU เดี่ยว → ราคาตัวเอง · Parent → ราคาจาก SKU ลูกที่เลือก (default ตัวแรก)
  const priceChild = usedChildren.find((c) => c.id === i.priceSkuId) ?? usedChildren[0] ?? null;
  const realSelling = i.sku?.list_price ?? priceChild?.list_price ?? null;   // ราคาขายจริง
  const fakeVal = i.sku?.fake_price ?? priceChild?.fake_price ?? null;        // ราคาขีดฆ่า
  const liveLinks = i.links.filter((l) => l.url.trim());
  const multiVars = multiProductVars({ code: i.sku?.code ?? i.parent?.code ?? null, name: i.sku?.name ?? i.parent?.name ?? i.productName ?? null, color: colorText, price: realSelling, fake: fakeVal, links: liveLinks }, i.extras, i.colorSource);
  const vars: SharedVars = {
    shop: i.shopChannels, fake_price: fakeVal, real_price: realSelling,
    price: realSelling, color: colorText, sku: i.sku?.code ?? null, product: i.sku?.name ?? i.productName ?? null,
    // {link} = ลิงก์สินค้าทุกแพลตฟอร์มเป็นบล็อก (เช่น "Shopee: TEST1\nLazada: TEST2")
    link: liveLinks.map((l) => `${platformLabel(l.platform)}: ${l.url.trim()}`).join("\n") || null,
    ...(multiVars ?? {}),
  };
  return { vars, usedChildren, colorText, realSelling, fakeVal };
}

/** แม่แบบของแพลตฟอร์มนี้: ที่เลือกไว้ในแคปชั่น → ค่าเริ่มต้นของแพลตฟอร์ม → แม่แบบแรก */
export function captionTemplateFor(cap: Pick<ContentCaption, "caption_type">, setting: PlatformSetting | undefined, templates: CaptionTemplate[]): CaptionTemplate | undefined {
  const typeKey = cap.caption_type ?? setting?.template_key ?? templates[0]?.key ?? "short";
  return templates.find((x) => x.key === typeKey) ?? templates[0];
}

/** ข้อความที่จะโพสต์ของ 1 แพลตฟอร์ม (ตัดแคปชั่น/แฮชแท็กออกถ้าตั้งปิดไว้) — ตัวเดียวกับปุ่ม 📋 ใน drawer */
export function assembleCaption(cap: ContentCaption, setting: PlatformSetting | undefined, templates: CaptionTemplate[], vars: SharedVars): string {
  const useCaption = setting?.use_caption !== false;
  const useHashtags = setting?.use_hashtags !== false;
  const tpl = captionTemplateFor(cap, setting, templates);
  return tpl
    ? renderCaption(tpl.body, { caption: useCaption ? cap.caption : "", hashtags: useHashtags ? cap.hashtags : "", ...vars })
    : `${useCaption ? (cap.caption ?? "") : ""}\n\n${useHashtags ? (cap.hashtags ?? "") : ""}`.trim();
}

/** แคปชั่นของทุกแพลตฟอร์มในคอนเทนต์ — แพลตฟอร์มที่ยังไม่มีแถวแคปชั่น = แฮชแท็กเริ่มต้น (เหมือนตอนเปิด drawer) */
export function captionsForDetail(detail: ContentDetail, cfg: CaptionConfig): ContentCaption[] {
  const byPlat = new Map(detail.captions.map((c) => [c.platform, c]));
  return (detail.platforms ?? []).map((p) => byPlat.get(p) ?? { platform: p, caption: "", hashtags: defaultHashtags(cfg, detail.brand_id, p) });
}

/** ค่าตั้งต้นของตัวแปรสินค้าจากข้อมูลที่บันทึกไว้ (ไม่รวม children/extras/shopChannels ที่ต้องโหลดเพิ่ม) */
export function varsInputFromDetail(detail: ContentDetail): Omit<CaptionVarsInput, "children" | "extras" | "shopChannels" | "priceSkuId"> {
  const prim = (detail.products ?? []).find((p) => p.is_primary);
  return {
    sku: detail.sku_id ? { code: detail.sku_code ?? "", name: detail.sku_name ?? detail.product_name ?? "", color: detail.sku_color, list_price: detail.sku_price, fake_price: detail.sku_fake_price ?? null } : null,
    parent: detail.parent_sku_id ? { code: String(detail.parent_sku_code ?? ""), name: String(detail.parent_sku_name ?? "") } : null,
    productName: detail.product_name ?? null,
    skuColorTh: (detail.sku_color_th as string | null | undefined) ?? null, skuColorEn: (detail.sku_color_en as string | null | undefined) ?? null,
    skuIds: detail.sku_id ? [] : (prim?.sku_ids ?? []),
    colorSource: detail.color_source === "en" ? "en" : "th",
    links: Array.isArray(detail.product_links) && detail.product_links.length ? detail.product_links : ((detail.parent_links as { platform: string; url: string }[] | undefined) ?? []),
  };
}

/**
 * โหลดทุกอย่างแล้วประกอบข้อความที่จะโพสต์ของทุกแพลตฟอร์ม (ใช้ข้อมูลที่ "บันทึกแล้ว") — สำหรับหน้าที่ไม่ได้เปิด drawer เช่น การ์ดลอยในปฏิทิน
 * คืน { platform: ข้อความ } — แพลตฟอร์มที่ไม่ใช้แคปชั่น/ไม่มีข้อความ = ""
 */
export async function loadCaptionTexts(contentId: string, pset?: PlatformSettings | null): Promise<Record<string, string>> {
  const detail = await getContent(contentId);
  const [settings, cfg, tpl, children, extras] = await Promise.all([
    pset ? Promise.resolve(pset) : getPlatformSettings().catch(() => ({} as PlatformSettings)),
    getCaptionConfig().catch(() => ({} as CaptionConfig)),
    getCaptionTemplates(detail.brand_id ?? null).catch(() => ({ templates: [] as CaptionTemplate[], shop_channels: [] as ShopChannel[] })),
    detail.parent_sku_id ? getParentSkuChildren(detail.parent_sku_id).catch(() => [] as ParentSkuChild[]) : Promise.resolve([] as ParentSkuChild[]),
    // สินค้าเพิ่มเติม: โหลดสีลูกเหมือนตัวแก้สินค้า (ExtraProductsEditor) ทำ
    Promise.all(extrasFromDetail(detail.products).map(async (e) => {
      if (!e.parent?.id) return e;
      const cs = await getParentSkuChildren(e.parent.id).catch(() => [] as ParentSkuChild[]);
      return { ...e, children: cs, childrenLoaded: true, sku: e.sku ? (cs.find((c) => c.id === e.sku!.id) ?? e.sku) : null };
    })),
  ]);
  const { vars } = buildCaptionVars({ ...varsInputFromDetail(detail), children, extras, shopChannels: tpl.shop_channels, priceSkuId: "" });
  const out: Record<string, string> = {};
  for (const cap of captionsForDetail(detail, cfg)) out[cap.platform] = settings[cap.platform]?.use_caption === false ? "" : assembleCaption(cap, settings[cap.platform], tpl.templates, vars).trim();
  return out;
}
