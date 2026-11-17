"use client";

/** หน้าสินค้า — Style · ลำดับส่วนประกอบ · ⚙️ ตั้งค่าต่อส่วน · หัวข้อรายละเอียด · ค่ามือถือ (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { categoryChoiceLabel } from "@/lib/website-category-tree";
import { ImageUploadField } from "@/components/website-theme-media";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { FieldCreatorModal } from "@/components/field-creator";
import { newExtraBanner, extraBannerId, extraBannerSection, MAX_EXTRA_BANNERS, PART_CHOICES, resolveMobileProduct, mobileOverrideCount, normalizeMobile, SHOWCASE_FAMILY, GRADIENT_ANGLES, PRODUCT_IMAGE_EFFECTS, PRODUCT_IMAGE_SIZES, BUY_ITEM_DEFS, DEFAULT_BUY_ITEMS, defaultBuyItem, PART_WIDTH_OPTIONS, PART_SPACE_OPTIONS, partHasWidth, type ExtraBanner, type BannerPart, type ProductParts, type ProductMobile, type ProductImageBgKind, type ProductImageEffect, type ProductImageFit, type BuyItem, type PartBox } from "@/lib/website-theme";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { LangInput } from "@/components/bilingual-field";
import { BANNER_LAYOUTS, textPosFor, fixTextPos, type BannerLayout, type BannerTextPos } from "@/lib/website-banners";
import { ConfirmDialog } from "@/components/modal";
import { ContentSourcesModal } from "@/components/website-content-sources";
import { SHIPPING_SOURCE_ID, detailSourceValue, parseDetailSourceValue } from "@/lib/website-content-sources";
import { ColorPicker } from "@/components/color-picker";
import { WheelSelect } from "@/components/wheel-select";
import { RelatedSettings } from "@/components/website-related-settings";
import { MaterialViewSetting } from "@/components/website-material-view-setting";
import { ProductExtrasSetting } from "@/components/website-product-extras-setting";
import { ProductLuxeSetting } from "@/components/website-product-luxe-setting";
import { PolicySettings, WishSettings } from "@/components/website-wish-policy-settings";
import { POLICY_TEXT } from "@/lib/website-wish-policy";
import { FONT_LABELS, FONT_SIZES, type ProductTitleStyle, type ProductImageBg, type ProductSection, type ProductGalleryStyle, type ProductDetailsStyle, type ProductDetailsOpen, type DetailSource, type DetailApply, type DetailOpen, type DetailItem, PRODUCT_DETAIL_SOURCES, SHOP_DETAIL_SOURCES, type Theme, inputCls, labelCls } from "./shared";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { useAreaFold } from "./shared";
import { PRODUCT_PARTS } from "@/lib/website-page-parts";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";

export function ProductTab() {
  const { shopSlug, theme, published, choices, setChoices, toast, setProduct, setDevice, editDevice, setEditDevice, storePages } = useDesign();
  const areaFold = useAreaFold();
  const t = useT();
  const setMobile = (p: Partial<ProductMobile>) => theme && setProduct({ mobile: { ...theme.product.mobile, ...p } });
  const viewProduct = (th: Theme) => (editDevice === "mobile" ? resolveMobileProduct(th.product) : th.product);
  const setSections = (sections: ProductSection[]) => (editDevice === "mobile" ? setMobile({ sections }) : setProduct({ sections }));
  const setHidden = (hidden: ProductSection[]) => (editDevice === "mobile" ? setMobile({ hidden }) : setProduct({ hidden }));
  const sectionDrag = useDragReorder((from, to) => theme && setSections(moveItem(viewProduct(theme).sections, from, to)));
  // ⚙️ ตั้งค่าต่อส่วนประกอบ (จับคู่ข้อมูล) — เปิดได้ทีละส่วน
  const [openPart, setOpenPart] = useState<ProductSection | null>(null);
  // ➕ แบนเนอร์เพิ่ม — ตั้งค่าที่โหมดคอม (มือถือใช้ร่วม) · อยู่ในลำดับเป็น banner:<id>
  const [delExtra, setDelExtra] = useState<ExtraBanner | null>(null);
  const [imgFieldCreator, setImgFieldCreator] = useState(false);
  const afterBanner = (secs: ProductSection[], sec: ProductSection) => {
    const out = [...secs];
    const last = out.reduce((acc, k, i) => (k === "banner" || k.startsWith("banner:") ? i : acc), -1);
    out.splice(last + 1, 0, sec);
    return out;
  };
  const addExtraBanner = () => {
    if (!theme) return;
    const xs = theme.product.parts.extraBanners;
    if (xs.length >= MAX_EXTRA_BANNERS) return;
    const nb = newExtraBanner(xs.length + 2);
    const sec = extraBannerSection(nb.id) as ProductSection;
    const m = theme.product.mobile;
    setProduct({
      parts: { ...theme.product.parts, extraBanners: [...xs, nb] },
      sections: afterBanner(theme.product.sections, sec),
      mobile: m.sections ? { ...m, sections: afterBanner(m.sections, sec) } : m,
    });
    setOpenPart(sec);
  };
  const setExtraBanner = (id: string, patch: Partial<ExtraBanner>) =>
    theme && setProduct({ parts: { ...theme.product.parts, extraBanners: theme.product.parts.extraBanners.map((x) => (x.id === id ? { ...x, ...patch } : x)) } });
  const removeExtraBanner = (id: string) => {
    if (!theme) return;
    const sec = extraBannerSection(id);
    const m = theme.product.mobile;
    const drop = (arr: ProductSection[] | null) => (arr ? arr.filter((k) => k !== sec) : arr);
    setProduct({
      parts: { ...theme.product.parts, extraBanners: theme.product.parts.extraBanners.filter((x) => x.id !== id) },
      sections: drop(theme.product.sections) as ProductSection[],
      hidden: drop(theme.product.hidden) as ProductSection[],
      mobile: { ...m, sections: drop(m.sections), hidden: drop(m.hidden) },
    });
    if (openPart === sec) setOpenPart(null);
  };
  /** สร้างฟิลด์รูปใหม่ใน Parent SKU แล้ว → โหลดรายการฟิลด์รูปใหม่ (ไม่แตะธีมที่กำลังแก้) */
  const reloadImageFields = async () => {
    try {
      const j = await apiFetch(`/api/website/theme?shop=${encodeURIComponent(shopSlug)}&freshFields=1`).then((r) => r.json());
      setChoices((c) => (c ? { ...c, imageFields: j.choices?.imageFields ?? c.imageFields } : c));
    } catch {
      /* ไม่เป็นไร — เปิดหน้าใหม่ก็เห็น */
    }
  };
  const setPart = <K extends keyof ProductParts>(k: K, p: Partial<ProductParts[K]>) => {
    if (!theme) return;
    // มือถือ: ทุกส่วนตั้งแยกได้ — ราคา-ตะกร้าเก็บทั้งชุด (buyItems/buyColumns) · ส่วนอื่นเก็บเฉพาะช่องที่ตั้ง
    if (editDevice === "mobile") {
      if (k === "buy") {
        const pb = p as Partial<ProductParts["buy"]>;
        const patch: Partial<ProductMobile> = {};
        if (pb.items !== undefined) patch.buyItems = pb.items;
        if (pb.columns !== undefined) patch.buyColumns = pb.columns;
        const legacy: Record<string, unknown> = {};
        for (const key of ["showUnit", "showBadge", "showStock", "showShortDesc", "noteSource", "noteText"] as const) if (pb[key] !== undefined) legacy[key] = pb[key];
        if (Object.keys(legacy).length) patch.buy = { ...theme.product.mobile.buy, ...legacy };
        setMobile(patch);
        return;
      }
      const mk = k as "gallery" | "banner" | "related";
      setMobile({ [mk]: { ...(theme.product.mobile[mk] as Record<string, unknown>), ...p } } as Partial<ProductMobile>);
      return;
    }
    setProduct({ parts: { ...theme.product.parts, [k]: { ...theme.product.parts[k], ...p } } });
  };
  const detailDrag = useDragReorder((from, to) => theme && setProduct({ detailItems: moveItem(theme.product.detailItems, from, to) }));
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  // 📚 ป๊อปจัดการแหล่งข้อมูล (⚙ ข้างช่อง "เอาข้อมูลจาก") — เปิดจากหัวข้อไหน + เลือกแหล่งไหนไว้
  const [srcMgr, setSrcMgr] = useState<{ focusId: string | null; itemId: string | null } | null>(null);
  // ป๊อปอัปเลือกฟิลด์ Parent SKU ให้หัวข้อไหน (id ของหัวข้อ) + คำค้น
  const [prodQuery, setProdQuery] = useState("");
  const setDetailItem = (id: string, patch: Partial<DetailItem>) =>
    theme && setProduct({ detailItems: theme.product.detailItems.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  // ค่าที่กำลังแก้ (คอม = ค่าหลัก · มือถือ = ค่าหลัก + ที่ตั้งแยก)
  const pv = viewProduct(theme);
  const mob = theme.product.mobile;
  const isMobileEdit = editDevice === "mobile";
  // ขนาดรูปในกรอบ: "cover" = เต็มกรอบ (ตัดรูป) · ตัวเลข = เห็นรูปครบทั้งใบ (% ของกรอบ) · "__pc" = มือถือตามคอม
  // ใช้ร่วม 2 ที่: ช่องในแท็บหน้าสินค้า + ⚙️ ชื่อรุ่น + รูปใหญ่
  // "auto" = อัตโนมัติตามรูป (รูปสัดส่วนใกล้กรอบเต็มกรอบ · ที่เหลือย่อพอดีตาม %)
  const fitOf = (fit: ProductImageFit, size: number) => (fit === "cover" || fit === "auto" ? fit : String(size));
  const imageFitValue = isMobileEdit
    ? !mob.imageFit && !mob.imageSize ? "__pc" : fitOf(mob.imageFit ?? theme.product.imageFit, mob.imageSize ?? theme.product.imageSize)
    : fitOf(theme.product.imageFit, theme.product.imageSize);
  const setImageFitValue = (v: string) => {
    if (isMobileEdit) {
      if (v === "__pc") setMobile({ imageFit: null, imageSize: null });
      else if (v === "cover" || v === "auto") setMobile({ imageFit: v });
      else setMobile({ imageFit: "contain", imageSize: Number(v) });
    } else if (v === "cover" || v === "auto") setProduct({ imageFit: v });
    else setProduct({ imageFit: "contain", imageSize: Number(v) });
  };
  const fitLabel = (fit: ProductImageFit, size: number) => (fit === "cover" ? t("เต็มกรอบ", "Fill frame") : fit === "auto" ? t("อัตโนมัติตามรูป", "Auto by image") : `${size}%`);
  const mobCount = mobileOverrideCount(mob);
  return (
    <>
    <DesignCard title="หน้าสินค้า — เลือก Style" right={<><div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs" title={t("ตั้งค่าแยกตามจอ: ช่องที่ยังเป็น 'ตามคอม' ใช้ค่าเดียวกับคอม", "Settings per screen: fields still set to 'Follow desktop' use the desktop value")}>
          <button type="button" onClick={() => { setEditDevice("pc"); setDevice("desktop"); }} className={`px-2.5 py-1 ${!isMobileEdit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t("🖥 คอม", "🖥 Desktop")}</button>
          <button type="button" onClick={() => { setEditDevice("mobile"); setDevice("mobile"); }} className={`px-2.5 py-1 ${isMobileEdit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            {t("📱 มือถือ", "📱 Mobile")}{mobCount > 0 && <span className={`ml-1 rounded-full px-1.5 text-[10px] ${isMobileEdit ? "bg-white/20" : "bg-blue-100 text-blue-700"}`}>{mobCount}</span>}
          </button>
        </div></>}>
      {isMobileEdit && (
        <div className="mb-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-800 flex items-center justify-between gap-2 flex-wrap">
          <span>{t("📱 กำลังตั้งค่าสำหรับ", "📱 Editing settings for")} <b>{t("มือถือ", "mobile")}</b> {t("(จอแคบกว่า 768px) — ช่องที่เป็น \"ตามคอม\" ใช้ค่าเดียวกับคอม · ตั้งแยกได้ทุกอย่าง: วิธีโชว์รายละเอียด, พับ/เปิด, ลำดับ/ซ่อนส่วนประกอบ, ⚙️ ทุกส่วน (รูปใหญ่ · ราคา-ตะกร้าทั้งชุด · แบนเนอร์ · คุณอาจชอบ), เอฟเฟกต์/ขนาดรูป, ขนาดตัวอักษร", "(screens narrower than 768px) — fields set to \"Follow desktop\" use the desktop value · everything can be set separately: details display, open/collapsed, section order/hide, ⚙️ every section (main image · whole price-cart set · banners · you may like), image effect/size, font sizes")}</span>
          {mobCount > 0 && <button type="button" onClick={() => setProduct({ mobile: normalizeMobile(null) })} className="text-blue-700 hover:underline whitespace-nowrap">{t("ล้างค่ามือถือทั้งหมด (ตามคอม)", "Clear all mobile values (follow desktop)")}</button>}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mb-3">{t("Style เป็นของกลาง ทุกร้าน/ทุกแบรนด์เลือกใช้ได้ สลับกลับได้ตลอด · ข้อมูลสินค้าชุดเดิม ไม่ต้องกรอกเพิ่ม", "Styles are shared — every shop/brand can use them and switch back anytime · same product data, nothing extra to fill in")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {(choices.productLayouts ?? []).map((p) => {
          const on = theme.product.layout === p.value;
          return (
            <button
              key={p.value}
              onClick={() => setProduct({ layout: p.value })}
              className={`text-left rounded-xl border p-3 transition ${on ? "border-blue-600 bg-blue-50/60" : "border-slate-200 hover:border-slate-400"}`}
            >
              {/* ภาพจำลองโครงหน้า */}
              <div className="rounded-lg bg-white border border-slate-200 p-2 mb-2" style={{ height: 96 }}>
                {p.value === "classic" ? (
                  <div className="flex gap-2 h-full">
                    <div className="w-1/2 rounded-md" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                    <div className="w-1/2 flex flex-col gap-1.5 pt-1">
                      <div className="h-2.5 w-4/5 rounded bg-slate-300" />
                      <div className="h-2 w-1/3 rounded" style={{ background: theme.colors.brand }} />
                      <div className="h-1.5 w-full rounded bg-slate-200" />
                      <div className="h-1.5 w-5/6 rounded bg-slate-200" />
                      <div className="mt-auto h-4 w-2/3 rounded" style={{ background: theme.colors.brand }} />
                    </div>
                  </div>
                ) : p.value === "stack" ? (
                  /* ภาพเรียงลงซ้าย (มีรูปถัดไปโผล่ใต้) + แผงข้อมูลค้างขวา */
                  <div className="flex gap-2 h-full">
                    <div className="w-3/5 flex flex-col gap-1 overflow-hidden">
                      <div className="flex-[3] rounded-sm" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                      <div className="flex-1 rounded-sm" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                    </div>
                    <div className="w-2/5 flex flex-col gap-1.5 pt-2">
                      <div className="h-2.5 w-4/5 rounded bg-slate-300" />
                      <div className="h-1.5 w-1/3 rounded bg-slate-400" />
                      <div className="flex gap-0.5 mt-1">{[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-slate-300" />)}</div>
                      <div className="h-3.5 w-full rounded-sm bg-slate-800" />
                      <div className="h-1 w-full rounded bg-slate-200" />
                      <div className="h-1 w-full rounded bg-slate-200" />
                    </div>
                  </div>
                ) : p.value === "columns" ? (
                  /* 3 คอลัมน์: ข้อความ · รูปเรียงลง · ปุ่มซื้อ */
                  <div className="flex gap-2 h-full">
                    <div className="w-1/4 flex flex-col gap-1 pt-2">
                      <div className="h-1.5 w-full rounded bg-slate-400" />
                      <div className="h-1 w-full rounded bg-slate-200" />
                      <div className="h-1 w-4/5 rounded bg-slate-200" />
                      <div className="h-1 w-3/5 rounded bg-slate-200" />
                    </div>
                    <div className="w-1/2 flex flex-col gap-1 overflow-hidden px-2" style={{ background: "#f4f4f2" }}>
                      <div className="flex-[3] rounded-sm mt-1" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                      <div className="flex-1 rounded-sm" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                    </div>
                    <div className="w-1/4 flex flex-col gap-1 pt-2">
                      <div className="h-1.5 w-1/2 rounded bg-slate-400" />
                      <div className="flex gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300" />)}</div>
                      <div className="h-3 w-full rounded-sm bg-slate-800 mt-1" />
                    </div>
                  </div>
                ) : p.value === "story" ? (
                  /* รูปเต็มจอ + ชื่อรุ่นตัวใหญ่ทับ → แถบเรื่องราวสีเข้ม */
                  <div className="flex flex-col gap-1 h-full">
                    <div className="relative flex-[3] rounded-sm overflow-hidden" style={{ background: `color-mix(in srgb, ${theme.colors.brand} 14%, white)`, border: "1px solid #e5e7eb" }}>
                      <span className="absolute left-1.5 bottom-1 font-serif italic text-[15px] leading-none text-slate-700">Arc</span>
                    </div>
                    <div className="flex-[2] flex gap-1">
                      <div className="w-1/2 rounded-sm" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                      <div className="w-1/2 rounded-sm bg-slate-800 flex flex-col gap-1 p-1">
                        <div className="h-1 w-2/3 rounded bg-slate-500" />
                        <div className="h-1 w-full rounded bg-slate-600" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative h-full flex flex-col items-center">
                    <div className="h-3 w-1/3 rounded italic" style={{ background: theme.colors.brand }} />
                    <div className="mt-1.5 w-11 h-11 rounded-full" style={{ background: `color-mix(in srgb, ${theme.colors.brand} 12%, white)`, border: "1px solid #e5e7eb" }} />
                    <div className="absolute left-1 bottom-1 flex flex-col gap-1 w-1/4">
                      <div className="h-2 w-2/3 rounded bg-slate-400" />
                      <div className="h-1.5 w-full rounded bg-slate-200" />
                    </div>
                    <div className="absolute right-1 bottom-1 flex flex-col gap-1 w-1/4 items-end">
                      <div className="flex gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-slate-300" />)}</div>
                      <div className="h-3.5 w-full rounded" style={{ background: theme.colors.brand }} />
                    </div>
                  </div>
                )}
              </div>
              <p className={`text-sm font-medium ${on ? "text-blue-700" : "text-slate-800"}`}>{labelEn(p.label)}{on && " ✓"}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{labelEn(p.hint ?? "")}</p>
            </button>
          );
        })}
      </div>

      <MaterialViewSetting value={theme.product.materialView} onChange={(materialView) => setProduct({ materialView })} brand={theme.colors.brand} />

      {SHOWCASE_FAMILY.includes(theme.product.layout) && theme.product.layout !== "showcase" && (
        <>
          <ProductLuxeSetting value={theme.product.luxe} onChange={(x) => setProduct({ luxe: { ...theme.product.luxe, ...x } })} layout={theme.product.layout as "stack" | "columns" | "story"} colors={theme.colors} />
          <ProductExtrasSetting value={theme.product.extras} onChange={(x) => setProduct({ extras: { ...theme.product.extras, ...x } })} layout={theme.product.layout} />
        </>
      )}

      {SHOWCASE_FAMILY.includes(theme.product.layout) && (
        <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
          {theme.product.layout === "showcase" && (
          <div>
            <label className={labelCls}>{t("แกลเลอรีรูปสินค้า", "Product image gallery")}</label>
            <select className={inputCls} value={theme.product.galleryStyle} onChange={(e) => setProduct({ galleryStyle: e.target.value as ProductGalleryStyle })}>
              {(choices.productGalleryStyles ?? []).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">{labelEn((choices.productGalleryStyles ?? []).find((o) => o.value === theme.product.galleryStyle)?.hint ?? "")}</p>
          </div>
          )}
          <div>
            <label className={labelCls}>{t("รายละเอียดสินค้า", "Product details")}</label>
            <select
              className={`${inputCls} ${isMobileEdit && mob.detailsStyle ? "border-blue-400" : ""}`}
              value={isMobileEdit ? (mob.detailsStyle ?? "__pc") : theme.product.detailsStyle}
              onChange={(e) => (isMobileEdit ? setMobile({ detailsStyle: e.target.value === "__pc" ? null : (e.target.value as ProductDetailsStyle) }) : setProduct({ detailsStyle: e.target.value as ProductDetailsStyle }))}
            >
              {isMobileEdit && <option value="__pc">{t("ตามคอม", "Follow desktop")} ({labelEn((choices.productDetailsStyles ?? []).find((o) => o.value === theme.product.detailsStyle)?.label ?? "")})</option>}
              {(choices.productDetailsStyles ?? []).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            {pv.detailsStyle === "accordion" && (
              <select
                className={`${inputCls} mt-1.5 ${isMobileEdit && mob.detailsOpen ? "border-blue-400" : ""}`}
                value={isMobileEdit ? (mob.detailsOpen ?? "__pc") : theme.product.detailsOpen}
                onChange={(e) => (isMobileEdit ? setMobile({ detailsOpen: e.target.value === "__pc" ? null : (e.target.value as ProductDetailsOpen) }) : setProduct({ detailsOpen: e.target.value as ProductDetailsOpen }))}
                title={t("หัวข้อพับเก็บเริ่มต้น", "Default accordion state")}
              >
                {isMobileEdit && <option value="__pc">{t("ค่าเริ่มต้น: ตามคอม", "Default: follow desktop")} ({labelEn((choices.productDetailsOpen ?? []).find((o) => o.value === theme.product.detailsOpen)?.label ?? "")})</option>}
                {(choices.productDetailsOpen ?? []).map((o) => <option key={o.value} value={o.value}>{t("ค่าเริ่มต้น:", "Default:")} {labelEn(o.label)}</option>)}
              </select>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("🔠 ขนาดตัวอักษร (% ของปกติ)", "🔠 Font size (% of normal)")}{isMobileEdit && t(" — สำหรับมือถือ", " — for mobile")}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FONT_LABELS.map((f) => {
                const pcVal = theme.product.fonts[f.k];
                const mVal = mob.fonts[f.k];
                const val = isMobileEdit ? (mVal != null ? String(mVal) : "__pc") : String(pcVal);
                return (
                  <div key={f.k}>
                    <span className="block text-[11px] text-slate-500 mb-0.5" title={labelEn(f.hint)}>{labelEn(f.label)}</span>
                    <WheelSelect
                      highlight={!!(isMobileEdit && mVal != null)}
                      value={val}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isMobileEdit) {
                          const next = { ...mob.fonts };
                          if (v === "__pc") delete next[f.k];
                          else next[f.k] = Number(v);
                          setMobile({ fonts: next });
                        } else setProduct({ fonts: { ...theme.product.fonts, [f.k]: Number(v) } });
                      }}
                    >
                      {isMobileEdit && <option value="__pc">{t("ตามคอม", "Follow desktop")} ({pcVal}%)</option>}
                      {FONT_SIZES.map((n) => <option key={n} value={n}>{n}%{n === 100 ? t(" (ปกติ)", " (normal)") : ""}</option>)}
                    </WheelSelect>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t("ใช้กับหน้าสินค้าแบบโชว์เคส · เนื้อหา = คำอธิบาย/รายละเอียด/ข้อความแบนเนอร์ · หัวข้อ = หัวข้อพับเก็บ/แท็บ/แบนเนอร์/คุณอาจชอบ", "For showcase product pages · Content = description/details/banner text · Heading = accordion/tab/banner/you-may-like headings")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("ชื่อรุ่น", "Model name")}</label>
            <select className={inputCls} value={theme.product.titleStyle} onChange={(e) => setProduct({ titleStyle: e.target.value as ProductTitleStyle })}>
              {(choices.productTitleStyles ?? []).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("เอฟเฟกต์รูปสินค้า", "Product image effect")}</label>
            <select
              className={`${inputCls} ${isMobileEdit && mob.imageEffect ? "border-blue-400" : ""}`}
              value={isMobileEdit ? (mob.imageEffect ?? "__pc") : theme.product.imageEffect}
              onChange={(e) => (isMobileEdit ? setMobile({ imageEffect: e.target.value === "__pc" ? null : (e.target.value as ProductImageEffect) }) : setProduct({ imageEffect: e.target.value as ProductImageEffect }))}
            >
              {isMobileEdit && <option value="__pc">{t("ตามคอม", "Follow desktop")} ({labelEn(PRODUCT_IMAGE_EFFECTS.find((o) => o.value === theme.product.imageEffect)?.label ?? "")})</option>}
              {PRODUCT_IMAGE_EFFECTS.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("ขนาดรูปในกรอบ", "Image size in frame")}</label>
            <WheelSelect
              highlight={!!(isMobileEdit && (mob.imageFit || mob.imageSize))}
              value={imageFitValue}
              onChange={(e) => setImageFitValue(e.target.value)}
            >
              {isMobileEdit && <option value="__pc">{t("ตามคอม", "Follow desktop")} ({fitLabel(theme.product.imageFit, theme.product.imageSize)})</option>}
              {PRODUCT_IMAGE_SIZES.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
              {theme.product.imageFit === "contain" && !PRODUCT_IMAGE_SIZES.some((o) => o.value === String(theme.product.imageSize)) && (
                <option value={String(theme.product.imageSize)}>{theme.product.imageSize}%</option>
              )}
            </WheelSelect>
            <p className="text-[11px] text-slate-400 mt-1">{t("อัตโนมัติ = รูปที่สัดส่วนใกล้กรอบ (นายแบบ/จัตุรัส) เต็มกรอบ ส่วนรูปที่ต้องตัดเยอะย่อพอดี · เต็มกรอบ = ทุกรูปกางเต็ม (ตัดขอบ) · % = ย่อรูปให้อยู่ในกรอบ", "Auto = images close to the frame ratio (model/square) fill the frame, heavily cropped ones fit · Fill frame = every image fills (edges cropped) · % = shrink to fit inside the frame")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("พื้นหลังหลังรูปสินค้า", "Background behind product image")}</label>
            <select className={inputCls} value={theme.product.imageBgKind} onChange={(e) => setProduct({ imageBgKind: e.target.value as ProductImageBgKind })}>
              <option value="preset">{t("สีตามตัวเลือก (สีแบรนด์จาง / สีพื้นการ์ด / ไม่มี)", "Preset color (light brand / card background / none)")}</option>
              <option value="color">{t("สีเดียว เลือกเอง", "Single custom color")}</option>
              <option value="gradient">{t("ไล่สี 2 สี", "2-color gradient")}</option>
              <option value="image">{t("รูปภาพ", "Image")}</option>
            </select>
            {theme.product.imageBgKind === "preset" && (
              <select className={`${inputCls} mt-1.5`} value={theme.product.imageBg} onChange={(e) => setProduct({ imageBg: e.target.value as ProductImageBg })}>
                {(choices.productImageBgs ?? []).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
              </select>
            )}
          </div>
          <div>
            {theme.product.imageBgKind === "color" && (
              <>
                <label className={labelCls}>{t("สีพื้นหลัง", "Background color")}</label>
                <div className="flex items-center gap-2">
                  <ColorPicker value={theme.product.imageBgColor} onChange={(hex) => setProduct({ imageBgColor: hex })} />
                  <div className="h-9 flex-1 rounded-lg border border-slate-200" style={{ background: theme.product.imageBgColor }} title={t("ตัวอย่าง", "Preview")} />
                </div>
              </>
            )}
            {theme.product.imageBgKind === "gradient" && (
              <>
                <label className={labelCls}>{t("ไล่สี (สีเริ่ม → สีปลาย · ทิศทาง)", "Gradient (start → end · direction)")}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <ColorPicker value={theme.product.imageBgGradient.from} onChange={(hex) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, from: hex } })} />
                  <span className="text-slate-400 text-xs">→</span>
                  <ColorPicker value={theme.product.imageBgGradient.to} onChange={(hex) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, to: hex } })} />
                  <select className={inputCls} style={{ width: "auto" }} value={theme.product.imageBgGradient.angle} onChange={(e) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, angle: Number(e.target.value) } })}>
                    {GRADIENT_ANGLES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div className="h-9 mt-1.5 rounded-lg border border-slate-200" style={{ background: `linear-gradient(${theme.product.imageBgGradient.angle}deg, ${theme.product.imageBgGradient.from}, ${theme.product.imageBgGradient.to})` }} title={t("ตัวอย่าง", "Preview")} />
              </>
            )}
          </div>
          {theme.product.imageBgKind === "image" && (
          <div className="sm:col-span-2">
            <ImageUploadField
              label={t("รูปพื้นหลังหลังรูปสินค้า", "Background image behind product image")}
              hint={t("แนะนำรูปโทนอ่อน ไม่รก (เช่น พื้นผิวหนัง/ผ้า หรือฉากสตูดิโอ) กว้าง 1600px+ · ใช้กับทุกสินค้า", "Use a light, uncluttered image (e.g. leather/fabric texture or studio backdrop) 1600px+ wide · used for all products")}
              value={theme.product.imageBgKey}
              onChange={(k) => setProduct({ imageBgKey: k })}
              previewBg={theme.colors.page}
              height={64}
            />
          </div>
          )}
        </div>
      )}

      {SHOWCASE_FAMILY.includes(theme.product.layout) && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls} style={{ marginBottom: 0 }}>{t("ลำดับส่วนประกอบ (ลากที่ ⠿ เพื่อสลับ · ⚙️ เลือกจับคู่ข้อมูล · 👁️ ซ่อน/แสดง)", "Section order (drag ⠿ to reorder · ⚙️ data mapping · 👁️ hide/show)")}</label>
            {isMobileEdit ? (
              (mob.sections || mob.hidden) && (
                <button onClick={() => setMobile({ sections: null, hidden: null })} className="text-[11px] text-blue-600 hover:underline">{t("มือถือ: ใช้ตามคอม", "Mobile: follow desktop")}</button>
              )
            ) : (
              (JSON.stringify(theme.product.sections) !== JSON.stringify(published.product.sections) || theme.product.hidden.length > 0) && (
                <button onClick={() => setProduct({ sections: ["gallery", "buy", "details", "banner", ...theme.product.parts.extraBanners.map((x) => extraBannerSection(x.id) as ProductSection), "related"], hidden: [] })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">{t("คืนค่าเริ่มต้น", "Reset to default")}</button>
              )
            )}
          </div>
          <ul className="space-y-1">
            {pv.sections.map((k, i) => {
              const xid = extraBannerId(k);
              const xb = xid ? pv.parts.extraBanners.find((x) => x.id === xid) ?? null : null;
              const meta = xb
                ? { label: `🖼 ${xb.name}`, hint: `${t("แบนเนอร์เพิ่ม", "Extra banner")} · ${labelEn(PART_CHOICES.bannerImages.find((o) => o.value === xb.imageSource)?.label ?? "")}`, hideable: true }
                : (choices.productSections ?? []).find((x) => x.value === k);
              const isHidden = pv.hidden.includes(k);
              const hasPart = true;
              const partOpen = openPart === k;
              return (
                <li key={k} {...sectionDrag.rowProps(i)} className={`rounded-lg border bg-white px-2 py-1.5 ${sectionDrag.rowCls(i)} ${isHidden ? "opacity-60" : ""} ${partOpen ? "border-blue-300" : "border-slate-200"}`}>
                <div className="flex items-center gap-2">
                  <DragHandle {...sectionDrag.handleProps(i)} />
                  <span className="w-5 text-[11px] text-slate-400 text-center">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${isHidden ? "line-through text-slate-400" : "text-slate-800"}`}>{xb ? meta?.label : meta?.label ? labelEn(meta.label) : k}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{xb ? meta?.hint : labelEn(meta?.hint ?? "")}</span>
                  </span>
                  {hasPart ? (
                    <button
                      onClick={() => setOpenPart(partOpen ? null : k)}
                      title={t("เลือกว่าส่วนนี้จับคู่กับข้อมูลไหน / โชว์อะไรบ้าง", "Choose what data this section uses / what it shows")}
                      className={`w-7 h-7 rounded-lg border text-xs ${partOpen ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                    >
                      ⚙️
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-300 px-1" title={t("ตั้งค่าที่กล่อง ชุดรายละเอียดสินค้า ด้านล่าง", "Set in the Product detail set box below")}>{t("↓ ด้านล่าง", "↓ Below")}</span>
                  )}
                  {xb && !isMobileEdit && (
                    <button onClick={() => setDelExtra(xb)} title={t("ลบแบนเนอร์นี้", "Delete this banner")} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:border-rose-300 hover:text-rose-600">🗑</button>
                  )}
                  {meta?.hideable ? (
                    <button
                      onClick={() => setHidden(isHidden ? pv.hidden.filter((x) => x !== k) : [...pv.hidden, k])}
                      title={isHidden ? t("แสดงส่วนนี้", "Show this section") : t("ซ่อนส่วนนี้", "Hide this section")}
                      className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400"
                    >
                      {isHidden ? "🚫" : "👁️"}
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-300 px-1" title={t("ส่วนหลัก ซ่อนไม่ได้", "Main section, can't be hidden")}>{t("หลัก", "Main")}</span>
                  )}
                </div>
                {partOpen && (
                  <PartBoxControls
                    k={k}
                    value={theme.product.partBox[k]}
                    onChange={(p) => {
                      const base: PartBox = theme.product.partBox[k] ?? { width: "auto", spaceTop: "auto" };
                      const cur: PartBox = { ...base, ...p };
                      const next = { ...theme.product.partBox };
                      if (cur.width === "auto" && cur.spaceTop === "auto") delete next[k];
                      else next[k] = cur;
                      setProduct({ partBox: next });
                    }}
                    mobile={isMobileEdit}
                  />
                )}
                {partOpen && k === "details" && <p className="mt-2 text-[11px] text-slate-400">{t("เนื้อหา/หัวข้อของรายละเอียด ตั้งที่กล่อง \"ชุดรายละเอียดสินค้า\" ด้านล่าง", "Detail content/headings are set in the \"Product detail set\" box below")}</p>}
                {partOpen && (k === "related" || k === "recent") &&
                  (isMobileEdit ? (
                    <p className="mt-2 text-[11px] text-slate-400">{t("กฎ/หัวข้อ/จำนวน ใช้ร่วมกับคอม (ตั้งที่โหมด 🖥 คอม หรือแท็บ 🔗 แนะนำสินค้า) · ซ่อน/แสดงบนมือถือ กด 👁️", "Rules/heading/count are shared with desktop (set in 🖥 Desktop mode or the 🔗 Related products tab) · hide/show on mobile with 👁️")}</p>
                  ) : (
                    <div className="mt-2">
                      <RelatedSettings only={k} product={theme.product} onChange={setProduct} shopSlug={shopSlug} />
                    </div>
                  ))}
                {partOpen && k !== "details" && k !== "related" && k !== "recent" && (
                  <PartSettings
                    part={k}
                    parts={pv.parts}
                    setPart={setPart}
                    mobile={isMobileEdit ? mob : null}
                    onResetMobile={(k) => (k === "buy" ? setMobile({ buyItems: null, buyColumns: null, buy: {} }) : setMobile({ [k]: {} } as Partial<ProductMobile>))}
                    onCopyBuyToMobile={() => setMobile({ buyItems: pv.parts.buy.items.map((it) => ({ ...it })), buyColumns: pv.parts.buy.columns, buy: {} })}
                    products={choices.products ?? []}
                    fields={choices.specFields ?? []}
                    fieldGroups={choices.fieldGroups}
                    imageFields={choices.imageFields ?? []}
                    onCreateImageField={() => setImgFieldCreator(true)}
                    imageFitValue={imageFitValue}
                    onImageFit={setImageFitValue}
                    pcImageFitLabel={fitLabel(theme.product.imageFit, theme.product.imageSize)}
                    onGalleryPreset={() => setProduct({ galleryStyle: "editorial", imageFit: "contain", imageSize: 90, parts: { ...theme.product.parts, gallery: { ...theme.product.parts.gallery, width: "full", height: "screen", perView: 2 } } })}
                    luxe={theme.product.layout !== "showcase"}
                    extra={xb}
                    setExtra={xb ? (p) => setExtraBanner(xb.id, p) : undefined}
                    previewBg={theme.colors.page}
                  />
                )}
                </li>
              );
            })}
          </ul>
          {isMobileEdit ? (
            <p className="text-[11px] text-slate-400 mt-2">{t("➕ เพิ่ม/ลบแบนเนอร์ได้ที่โหมด 🖥 คอม (มือถือจัดลำดับ/ซ่อนแยกได้)", "➕ Add/remove banners in 🖥 Desktop mode (mobile can reorder/hide separately)")}</p>
          ) : pv.parts.extraBanners.length < MAX_EXTRA_BANNERS ? (
            <button type="button" onClick={addExtraBanner} className="mt-2 w-full rounded-lg border border-dashed border-orange-300 text-orange-700 text-xs py-2 hover:bg-orange-50">
              {t("＋ เพิ่มแบนเนอร์", "＋ Add banner")} <span className="text-orange-400">({pv.parts.extraBanners.length}/{MAX_EXTRA_BANNERS})</span>
            </button>
          ) : (
            <p className="text-[11px] text-slate-400 mt-2">{t(`เพิ่มแบนเนอร์ได้สูงสุด ${MAX_EXTRA_BANNERS} อัน`, `Up to ${MAX_EXTRA_BANNERS} banners`)}</p>
          )}
          <ConfirmDialog
            open={!!delExtra}
            onClose={() => setDelExtra(null)}
            onConfirm={() => { if (delExtra) removeExtraBanner(delExtra.id); setDelExtra(null); }}
            title={t("ลบแบนเนอร์นี้?", "Delete this banner?")}
            message={t(`ลบ "${delExtra?.name ?? ""}" ออกจากหน้าสินค้า — ยังไม่หายจากเว็บจริงจนกว่าจะกดเผยแพร่ (ย้อนได้ด้วยปุ่มเลิกทำ)`, `Remove "${delExtra?.name ?? ""}" from the product page — stays on the live site until you publish (undo available)`)}
            confirmText={t("ลบแบนเนอร์", "Delete banner")}
            variant="danger"
          />
          {imgFieldCreator && (
            <FieldCreatorModal
              moduleKey="parent-skus-v2"
              moduleTitle="Parent SKU"
              onClose={() => setImgFieldCreator(false)}
              onCreated={() => { setImgFieldCreator(false); void reloadImageFields(); toast.success(t("สร้างฟิลด์แล้ว — ไปอัปโหลดรูปในแต่ละ Parent SKU ได้เลย", "Field created — you can now upload images in each Parent SKU")); }}
            />
          )}
        </div>
      )}

      {SHOWCASE_FAMILY.includes(theme.product.layout) && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls} style={{ marginBottom: 0 }}>{t("ชุดรายละเอียดสินค้า — หัวข้อที่โชว์ใต้ราคา (พับเก็บ/แท็บ ตามที่เลือกด้านบน)", "Product detail set — headings shown under the price (accordion/tabs as chosen above)")}</label>
            <button
              onClick={() => {
                const id = `d${Date.now().toString(36).slice(-5)}`;
                setProduct({ detailItems: [...theme.product.detailItems, { id, label: "หัวข้อใหม่", source: "text", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" }] });
                setOpenDetail(id);
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              {t("+ เพิ่มหัวข้อ", "+ Add heading")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">{t("ตั้งที่เดียว ใช้ทุกสินค้า · แต่ละหัวข้อเลือกได้ว่าเอาข้อมูลจากไหน และใช้กับรุ่นไหน · สินค้าที่ไม่มีข้อมูลในหัวข้อนั้น หัวข้อจะหายไปเอง", "Set once for all products · each heading picks its data source and which models it applies to · headings with no data for a product hide automatically")}</p>
          <ul className="space-y-1.5">
            {theme.product.detailItems.map((it, i) => {
              const open = openDetail === it.id;
              const src = (choices.detailSources ?? []).find((x) => x.value === it.source);
              const scope = it.applyTo === "all" ? t("ทุกสินค้า", "All products") : it.applyTo === "categories" ? t(`${it.categories.length} หมวด`, `${it.categories.length} categories`) : t(`${it.products.length} รุ่น`, `${it.products.length} models`);
              // 📚 แหล่งที่ร้านเพิ่มเอง (custom) — หาไม่เจอ = ถูกลบไปแล้ว
              const contentSources = theme.product.contentSources ?? [];
              const customSrc = it.source === "custom" ? contentSources.find((s) => s.id === it.sourceId) : undefined;
              const srcLabel = it.source === "custom" ? (customSrc ? `📚 ${customSrc.name}` : t("⚠️ แหล่งถูกลบแล้ว", "⚠️ Source deleted")) : src?.label ? labelEn(src.label) : it.source;
              // ตัวอย่างบรรทัดของแหล่ง "ข้อความของร้าน" (การจัดส่ง = อัตโนมัติที่ไม่ได้ซ่อน + ที่พิมพ์เพิ่ม)
              const shipSrc = contentSources.find((s) => s.id === SHIPPING_SOURCE_ID);
              const srcLines =
                it.source === "shipping"
                  ? [
                      ...(choices.shippingAuto ?? []).filter((a) => a.text && !(shipSrc?.hideAuto ?? []).includes(a.key)).map((a) => a.text),
                      ...(shipSrc?.lines ?? []).map((l) => l.text.trim()).filter(Boolean),
                    ]
                  : (customSrc?.lines ?? []).map((l) => l.text.trim()).filter(Boolean);
              return (
                <li key={it.id} {...detailDrag.rowProps(i)} className={`rounded-lg border border-slate-200 bg-white ${detailDrag.rowCls(i)} ${it.enabled ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <DragHandle {...detailDrag.handleProps(i)} />
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={it.enabled} onChange={(e) => setDetailItem(it.id, { enabled: e.target.checked })} title={t("แสดง/ซ่อนหัวข้อนี้", "Show/hide this heading")} />
                    <button onClick={() => setOpenDetail(open ? null : it.id)} className="flex-1 min-w-0 text-left">
                      <span className={`block text-sm ${it.enabled ? "text-slate-800" : "line-through text-slate-400"}`}>{it.label}</span>
                      <span className={`block text-[11px] truncate ${it.source === "custom" && !customSrc ? "text-amber-600" : "text-slate-400"}`}>{srcLabel} · {scope}</span>
                    </button>
                    {pv.detailsStyle === "accordion" && (
                      <select
                        value={isMobileEdit ? (mob.itemsOpen[it.id] ?? "__pc") : it.defaultOpen}
                        onChange={(e) => {
                          if (!isMobileEdit) return setDetailItem(it.id, { defaultOpen: e.target.value as DetailOpen });
                          const next = { ...mob.itemsOpen };
                          if (e.target.value === "__pc") delete next[it.id];
                          else next[it.id] = e.target.value as DetailOpen;
                          setMobile({ itemsOpen: next });
                        }}
                        title={t("หัวข้อนี้เริ่มต้นพับหรือเปิด", "Whether this heading starts open or collapsed")}
                        className={`h-7 rounded-lg border text-[11px] px-1.5 bg-white ${(isMobileEdit ? !mob.itemsOpen[it.id] : it.defaultOpen === "auto") ? "border-slate-200 text-slate-500" : "border-blue-300 text-blue-700"}`}
                      >
                        {isMobileEdit ? <option value="__pc">{t("ตามคอม", "Follow desktop")}</option> : <option value="auto">{t("ตามค่ารวม", "Follow overall setting")}</option>}
                        <option value="open">{t("▾ เปิดไว้", "▾ Open")}</option>
                        <option value="closed">{t("▸ พับไว้", "▸ Collapsed")}</option>
                      </select>
                    )}
                    <button onClick={() => setOpenDetail(open ? null : it.id)} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400" title={open ? t("พับ", "Collapse") : t("ตั้งค่า", "Settings")}>{open ? "▾" : "✎"}</button>
                    <button onClick={() => { if (confirm(t(`ลบหัวข้อ "${it.label}"?`, `Delete heading "${it.label}"?`))) setProduct({ detailItems: theme.product.detailItems.filter((x) => x.id !== it.id) }); }} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-red-600 hover:border-red-300" title={t("ลบ", "Delete")}>🗑️</button>
                  </div>
                  {open && (
                    <div className="border-t border-slate-100 px-3 py-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>{t("ชื่อหัวข้อ", "Heading name")}</label>
                        <LangInput className={inputCls} obj={it} k="label" onPatch={(p) => setDetailItem(it.id, p)} maxLength={60} />
                      </div>
                      <div>
                        <label className={labelCls}>{t("เอาข้อมูลจาก", "Data source")}</label>
                        <div className="flex gap-1.5">
                          <select
                            className={inputCls}
                            value={detailSourceValue(it)}
                            onChange={(e) => {
                              const v = parseDetailSourceValue(e.target.value);
                              setDetailItem(it.id, { source: v.source as DetailSource, sourceId: v.sourceId });
                            }}
                          >
                            {it.source === "custom" && !customSrc && <option value={detailSourceValue(it)} disabled>{t("⚠️ แหล่งถูกลบแล้ว — เลือกใหม่", "⚠️ Source deleted — pick again")}</option>}
                            <optgroup label={t("ดึงจากสินค้า", "From product")}>
                              {(choices.detailSources ?? []).filter((o) => PRODUCT_DETAIL_SOURCES.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
                            </optgroup>
                            <optgroup label={t("ข้อความของร้าน", "Shop text")}>
                              {(choices.detailSources ?? []).filter((o) => SHOP_DETAIL_SOURCES.includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.value === "text" ? t("ข้อความตายตัว (พิมพ์ในหัวข้อนี้)", "Fixed text (typed in this heading)") : labelEn(o.label)}</option>)}
                              {contentSources.filter((s) => s.id !== SHIPPING_SOURCE_ID).map((s) => <option key={s.id} value={`custom:${s.id}`}>📚 {s.name}</option>)}
                            </optgroup>
                          </select>
                          <button
                            type="button"
                            onClick={() => setSrcMgr({ focusId: it.source === "custom" ? it.sourceId ?? null : it.source === "shipping" ? SHIPPING_SOURCE_ID : null, itemId: it.id })}
                            className="shrink-0 w-9 rounded-lg border border-slate-200 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-700"
                            title={t("จัดการแหล่งข้อมูล — เพิ่ม / แก้ / ลบ", "Manage data sources — add / edit / delete")}
                            aria-label={t("จัดการแหล่งข้อมูล", "Manage data sources")}
                          >
                            ⚙
                          </button>
                        </div>
                        {it.source === "custom" ? (
                          <p className={`text-[11px] mt-1 ${customSrc ? "text-slate-400" : "text-amber-600"}`}>{customSrc ? t("แหล่งที่ร้านเพิ่มเอง — แก้บรรทัดได้ที่ ⚙", "Shop-added source — edit lines with ⚙") : t("แหล่งนี้ถูกลบไปแล้ว หัวข้อนี้จะไม่โชว์บนเว็บ — เลือกแหล่งใหม่", "This source was deleted; the heading won't show on the site — pick a new source")}</p>
                        ) : (
                          src?.hint && <p className="text-[11px] text-slate-400 mt-1">{it.source === "shipping" ? `${labelEn(src.hint)} · ${t("ซ่อน/เพิ่มบรรทัดได้ที่ ⚙", "hide/add lines with ⚙")}` : labelEn(src.hint)}</p>
                        )}
                      </div>
                      {(it.source === "shipping" || (it.source === "custom" && customSrc)) && (
                        <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-medium text-slate-500">{t(`ตัวอย่างบนเว็บ (${srcLines.length} บรรทัด)`, `On-site preview (${srcLines.length} lines)`)}</span>
                            <button
                              type="button"
                              onClick={() => setSrcMgr({ focusId: it.source === "shipping" ? SHIPPING_SOURCE_ID : it.sourceId ?? null, itemId: it.id })}
                              className="text-xs px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-700"
                            >
                              {t("✏️ แก้เนื้อหา", "✏️ Edit content")}
                            </button>
                          </div>
                          {srcLines.length ? (
                            <ul className="space-y-0.5 text-xs text-slate-600">
                              {srcLines.map((l, n) => <li key={n}>• {l}</li>)}
                            </ul>
                          ) : (
                            <p className="text-xs text-amber-600">{t("ยังไม่มีบรรทัด — หัวข้อนี้จะไม่โชว์บนเว็บ", "No lines yet — this heading won't show on the site")}</p>
                          )}
                        </div>
                      )}
                      {it.source === "fields" && (
                        <div className="sm:col-span-2">
                          <label className={labelCls}>{t(`ฟิลด์ที่โชว์ (${it.fields.length}) — เรียงตามที่เลือก`, `Fields shown (${it.fields.length}) — in selected order`)}</label>
                          <FieldChipsPicker
                            value={it.fields}
                            onChange={(f) => setDetailItem(it.id, { fields: f })}
                            fields={choices.specFields ?? []}
                            groups={choices.fieldGroups}
                            description={t("ติ๊กฟิลด์ที่จะโชว์ในหัวข้อนี้ — เรียงตามลำดับที่ติ๊ก · ฟิลด์ที่สินค้าไม่ได้กรอกจะไม่โชว์เอง", "Tick the fields to show in this heading — in tick order · fields a product hasn't filled in don't show")}
                          />
                          <p className="text-[11px] text-slate-400 mt-1">{t("เลือกได้ทุกฟิลด์ของ Parent SKU (ยกเว้นต้นทุน/ข้อมูลภายใน) · ช่องที่ว่างจะไม่โชว์ · เปลี่ยนป้ายชื่อได้ที่ทะเบียนฟิลด์กลาง", "Any Parent SKU field (except cost/internal data) · empty fields don't show · rename labels in the central field registry")}</p>
                          {/* 📏 หัวข้อที่มีฟิลด์ขนาด → ปุ่มเทียบขนาด (เว็บร้าน: SIZE_FIELD_KEYS ใน src/lib/product-details.ts) */}
                          {it.fields.some((k) => ["size_summary", "custom_size", "size_length_cm", "size_height_cm", "size_thickness_cm"].includes(k)) && (
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-2">
                              <input type="checkbox" className="accent-orange-500" checked={it.sizeCompare !== false} onChange={(e) => setDetailItem(it.id, { sizeCompare: e.target.checked })} />
                              {t("📏 ปุ่ม \"เทียบขนาด\" (ป๊อปภาพเทียบกับ มือถือ / iPad / A4 / โน้ตบุ๊ก / ขวดน้ำ · ใช้ กว้าง/สูง/หนา ของสินค้า)", "📏 \"Compare size\" button (popup comparing with phone / iPad / A4 / laptop / water bottle · uses product width/height/thickness)")}
                            </label>
                          )}
                        </div>
                      )}
                      {it.source === "text" && (
                        <div className="sm:col-span-2">
                          <label className={labelCls}>{t("ข้อความ", "Text")}</label>
                          <LangInput multiline className={`${inputCls} min-h-[96px]`} obj={it} k="text" onPatch={(p) => setDetailItem(it.id, p)} maxLength={4000} placeholder={t("เช่น รับประกันงานเย็บ 6 เดือน\nเช็ดด้วยผ้าแห้ง หลีกเลี่ยงแสงแดดจัด", "e.g. 6-month stitching warranty\nWipe with a dry cloth, avoid strong sunlight")} />
                          <p className="text-[11px] text-slate-400 mt-1">{t("ขึ้นบรรทัดใหม่ได้ · ใช้กับทุกรุ่นที่เลือกด้านล่าง", "Line breaks allowed · applies to every model chosen below")}</p>
                        </div>
                      )}
                      {it.source === "dimensions" && (
                        <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" className="accent-orange-500" checked={it.showInch !== false} onChange={(e) => setDetailItem(it.id, { showInch: e.target.checked })} />
                            {t("โชว์เป็นนิ้วด้วย (ระบบแปลงให้เอง)", "Also show in inches (converted automatically)")}
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-1">
                            <input type="checkbox" className="accent-orange-500" checked={it.sizeCompare !== false} onChange={(e) => setDetailItem(it.id, { sizeCompare: e.target.checked })} />
                            {t("📏 ปุ่ม \"เทียบขนาด\" (ป๊อปภาพเทียบกับ มือถือ / iPad / A4 / โน้ตบุ๊ก / ขวดน้ำ)", "📏 \"Compare size\" button (popup comparing with phone / iPad / A4 / laptop / water bottle)")}
                          </label>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {t("ตัวอย่าง: • ใส่ได้: สมาร์ทโฟน (ถึง 6.7 นิ้ว), กระเป๋าสตางค์ (ใบยาว) · • กว้าง: 23 ซม.", "Example: • Fits: smartphone (up to 6.7\"), wallet (long) · • Width: 23 cm")}{it.showInch !== false ? ' | 9.1"' : ""} {t("· • ความยาวสายสะพาย: 50–60 ซม. (ปรับได้)", "· • Strap length: 50–60 cm (adjustable)")}{it.showInch !== false ? ' | 19.7–23.6"' : ""}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">{t("ข้อมูลมาจากหน้า Parent SKU: กว้าง/สูง/หนา · ความสูงหูหิ้ว · ความยาวสายสะพาย (+ ปรับได้ถึง) · ใส่อะไรได้บ้าง", "Data comes from the Parent SKU page: width/height/thickness · handle drop · strap length (+ adjustable to) · what fits")}</p>
                        </div>
                      )}
                      <div>
                        <label className={labelCls}>{t("ใช้กับรุ่นไหน", "Applies to")}</label>
                        <select className={inputCls} value={it.applyTo} onChange={(e) => setDetailItem(it.id, { applyTo: e.target.value as DetailApply })}>
                          <option value="all">{t("ทุกสินค้า", "All products")}</option>
                          <option value="categories">{t("เฉพาะหมวด", "Specific categories")}</option>
                          <option value="products">{t("เลือกเป็นรายตัว", "Pick individually")}</option>
                        </select>
                      </div>
                      {it.applyTo === "categories" && (
                        <div>
                          <label className={labelCls}>{t("หมวด", "Categories")} ({it.categories.length})</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(choices.categories ?? []).map((c) => {
                              const on = it.categories.includes(c.key);
                              return (
                                <button key={c.key} onClick={() => setDetailItem(it.id, { categories: on ? it.categories.filter((k) => k !== c.key) : [...it.categories, c.key] })} className={`px-2.5 py-1 rounded-full border text-xs ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                                  {on ? "✓ " : ""}{categoryChoiceLabel(c)}
                                </button>
                              );
                            })}
                            {!(choices.categories ?? []).length && <span className="text-[11px] text-slate-400">{t("ยังไม่มีหมวด — ตั้งที่แท็บจับคู่ฟิลด์", "No categories yet — set them in the Field mapping tab")}</span>}
                          </div>
                        </div>
                      )}
                      {it.applyTo === "products" && (
                        <div className="sm:col-span-2">
                          <label className={labelCls}>{t(`รุ่นที่ใช้ (${it.products.length} รุ่น)`, `Models (${it.products.length})`)}</label>
                          <input className={`${inputCls} mb-1.5`} value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder={t("ค้นหารหัส/ชื่อรุ่น", "Search code/model name")} />
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                            {(choices.products ?? [])
                              .filter((pr) => !prodQuery.trim() || `${pr.code} ${pr.name}`.toLowerCase().includes(prodQuery.trim().toLowerCase()))
                              .slice(0, 80)
                              .map((pr) => {
                                const on = it.products.includes(pr.code.toUpperCase());
                                return (
                                  <label key={pr.code} className="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={on} onChange={(e) => setDetailItem(it.id, { products: e.target.checked ? [...it.products, pr.code.toUpperCase()] : it.products.filter((k) => k !== pr.code.toUpperCase()) })} />
                                    <span className="font-mono text-[11px] text-slate-500">{pr.code}</span>
                                    <span className="truncate">{pr.name}</span>
                                  </label>
                                );
                              })}
                            {!(choices.products ?? []).length && <p className="px-2 py-2 text-[11px] text-slate-400">{t("ยังไม่มีสินค้าบนเว็บร้านนี้", "No products on this shop's site yet")}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {!theme.product.detailItems.length && <li className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">{t("ยังไม่มีหัวข้อ — กด \"+ เพิ่มหัวข้อ\"", "No headings yet — click \"+ Add heading\"")}</li>}
          </ul>
          {/* 📚 คลังแหล่งข้อมูล — แก้แล้วเข้าธีมทันที (บันทึกพร้อมธีม) */}
          {(() => {
            const pickItem = srcMgr?.itemId ? theme.product.detailItems.find((x) => x.id === srcMgr.itemId) : undefined;
            return (
              <ContentSourcesModal
                open={!!srcMgr}
                onClose={() => setSrcMgr(null)}
                sources={theme.product.contentSources ?? []}
                onChange={(contentSources) => setProduct({ contentSources })}
                items={theme.product.detailItems}
                productSources={(choices.detailSources ?? []).filter((o) => PRODUCT_DETAIL_SOURCES.includes(o.value))}
                shippingAuto={choices.shippingAuto}
                focusId={srcMgr?.focusId}
                pickFor={pickItem ? { label: pickItem.label, value: detailSourceValue(pickItem) } : null}
                onPick={(value) => {
                  if (!pickItem) return;
                  const v = parseDetailSourceValue(value);
                  setDetailItem(pickItem.id, { source: v.source as DetailSource, sourceId: v.sourceId });
                }}
              />
            );
          })()}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-3">{t("ดูผล: พรีวิวด้านขวาเปิด \"หน้าสินค้า (ตัวอย่าง)\" ให้แล้ว (เลือกหน้าอื่นได้จากเมนูบนพรีวิว) — ยังไม่ขึ้นเว็บจริงจนกว่าจะกดเผยแพร่", "Result: the preview on the right shows \"Product page (sample)\" (pick other pages from the preview menu) — not live until you publish")}</p>
    </DesignCard>
    {(() => {
      // 📜 หัวข้อรายละเอียดที่ดึง "การจัดส่ง & ชำระเงิน" — ปุ่มเปลี่ยนชื่อเป็น "การจัดส่งและคืนสินค้า" เมื่อเปิดบรรทัด/ลิงก์นโยบาย
      const ship = theme.product.detailItems.find((x) => x.source === "shipping");
      return (
        <PolicySettings
          value={theme.product.policy}
          onChange={(x) => setProduct({ policy: { ...theme.product.policy, ...x } })}
          pages={storePages}
          shopSlug={shopSlug}
          returnsDays={choices.returnsDays}
          shippingTitle={ship?.label}
          onRenameShipping={ship ? () => setDetailItem(ship.id, { label: POLICY_TEXT.shipping.th }) : undefined}
        />
      );
    })()}
    <WishSettings value={theme.product.wish} onChange={(x) => setProduct({ wish: { ...theme.product.wish, ...x } })} />
    {areaFold("product", PRODUCT_PARTS, t("ชื่อ · ราคา · ตัวเลือก · ปุ่มใส่ตะกร้า · แถบลอย · หัวข้อ", "Name · price · options · add-to-cart button · floating bar · headings"))}
    </>
  );
}

/* ─────────── ⚙️ ตั้งค่าต่อส่วนประกอบของหน้าสินค้า (จับคู่ข้อมูล) ─────────── */
export const partInputCls = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white";
export function PartToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      {label}
    </label>
  );
}
/** 📐 ความกว้าง + ระยะห่างด้านบน ของส่วนประกอบหน้าสินค้า (ของกลาง ทุกส่วน · lib/website-theme PartBox) */
export function PartBoxControls({ k, value, onChange, mobile }: { k: string; value?: PartBox; onChange: (p: Partial<PartBox>) => void; mobile: boolean }) {
  const t = useT();
  const v: PartBox = { width: "auto", spaceTop: "auto", ...value };
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 grid gap-2 sm:grid-cols-2">
      {partHasWidth(k) ? (
        <label className="block">
          <span className="block text-[11px] text-slate-500 mb-1">{t("ความกว้าง", "Width")}</span>
          <WheelSelect value={v.width} onChange={(e) => onChange({ width: e.target.value as PartBox["width"] })} highlight={!!(v.width !== "auto")}>
            {PART_WIDTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{labelEn(o.label)}</option>
            ))}
          </WheelSelect>
        </label>
      ) : (
        <p className="text-[11px] text-slate-400 self-end pb-1.5">{t("ความกว้างของส่วนนี้ตั้งในตัวเลือกด้านล่าง (เต็มจอ/ในกรอบ)", "This section's width is set in the options below (full screen/in frame)")}</p>
      )}
      <label className="block">
        <span className="block text-[11px] text-slate-500 mb-1">{t("ระยะห่างจากส่วนด้านบน", "Space from section above")}</span>
        <WheelSelect value={v.spaceTop} onChange={(e) => onChange({ spaceTop: e.target.value as PartBox["spaceTop"] })} highlight={!!(v.spaceTop !== "auto")}>
          {PART_SPACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{labelEn(o.label)}</option>
          ))}
        </WheelSelect>
      </label>
      {mobile && <p className="sm:col-span-2 text-[11px] text-blue-700">{t("📱 ใช้ค่าเดียวกับคอม — มือถือระยะห่างย่อลงให้เองตามจอ", "📱 Same as desktop — mobile spacing shrinks automatically")}</p>}
    </div>
  );
}
export function PartSettings({
  part,
  parts,
  setPart,
  products,
  fields = [],
  fieldGroups,
  imageFields = [],
  onCreateImageField,
  onGalleryPreset,
  imageFitValue,
  onImageFit,
  pcImageFitLabel,
  extra = null,
  setExtra,
  previewBg,
  mobile = null,
  onResetMobile,
  onCopyBuyToMobile,
  luxe = false,
}: {
  part: ProductSection;
  parts: ProductParts;
  setPart: <K extends keyof ProductParts>(k: K, p: Partial<ProductParts[K]>) => void;
  products: { code: string; name: string }[];
  /** ฟิลด์ Parent SKU (จากทะเบียนฟิลด์) ให้คำอธิบายย่อเลือกดึง */
  fields?: { key: string; label: string; group?: string }[];
  fieldGroups?: Record<string, string>;
  /** ฟิลด์รูปของ Parent SKU (แบนเนอร์ source = field) */
  imageFields?: { key: string; label: string }[];
  /** เปิดตัวสร้างฟิลด์ใหม่ใน Parent SKU (ชนิดรูปภาพ) */
  onCreateImageField?: () => void;
  /** ✨ ตั้งแกลเลอรีแบบเต็มจอในคลิกเดียว (แตะค่าระดับหน้าสินค้าด้วย จึงให้ผู้เรียกทำ) */
  onGalleryPreset?: () => void;
  /** การแสดงรูป (ตัด/ไม่ตัด) — ค่าระดับหน้าสินค้า ผู้เรียกจัดการคอม/มือถือ */
  imageFitValue?: string;
  onImageFit?: (v: string) => void;
  pcImageFitLabel?: string;
  /** แบนเนอร์เพิ่ม (part = banner:<id>) */
  extra?: ExtraBanner | null;
  setExtra?: (p: Partial<ExtraBanner>) => void;
  previewBg: string;
  /** กำลังตั้งค่าสำหรับมือถือ → ค่ามือถือที่ตั้งแยกไว้ (null = กำลังตั้งคอม) */
  mobile?: ProductMobile | null;
  onResetMobile?: (k: "gallery" | "buy" | "banner" | "related") => void;
  /** มือถือ: คัดลอกชุดราคา-ตะกร้าของคอมมาตั้งแยก */
  onCopyBuyToMobile?: () => void;
  /** Style จากเว็บแบรนด์หรู (ภาพเรียงลง / 3 คอลัมน์ / เรื่องราว) — ช่องของแกลเลอรีโชว์เคส (กี่รูป/กว้าง/สูง/แถบลอยล่างรูป) ไม่ใช้ → ซ่อน */
  luxe?: boolean;
}) {
  const t = useT();
  const lbl = "block text-[11px] text-slate-500 mb-1";
  const mobileCount = (k: "gallery" | "buy" | "banner" | "related") =>
    !mobile ? 0 : k === "buy" ? (mobile.buyItems ? 1 : 0) + (mobile.buyColumns ? 1 : 0) + Object.keys(mobile.buy).length : Object.keys(mobile[k]).length;
  const mobileNote = (k: "gallery" | "buy" | "banner" | "related") =>
    mobile ? (
      <div className="flex items-center justify-between gap-2 text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1">
        <span>{t("📱 ค่าสำหรับมือถือ", "📱 Mobile values")}{mobileCount(k) ? t(` (ตั้งแยกไว้ ${mobileCount(k)} ${k === "buy" ? "รายการ" : "ช่อง"})`, ` (${mobileCount(k)} ${k === "buy" ? "items" : "fields"} set separately)`) : t(" — ยังตามคอมทั้งหมด (แก้ช่องไหน = ตั้งแยกช่องนั้น)", " — all follow desktop (editing a field sets it separately)")}</span>
        {mobileCount(k) > 0 && <button type="button" onClick={() => onResetMobile?.(k)} className="hover:underline">{t("ใช้ตามคอม", "Follow desktop")}</button>}
      </div>
    ) : null;
  if (part === "gallery") {
    const g = parts.gallery;
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("gallery")}
        {luxe && <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1">{t("🏛 Style นี้: ชุดรูป 1/2 คอลัมน์ · ความกว้าง · ความสูง · ช่องห่างรูป ตั้งที่กล่อง \"ปรับหน้าตา Style นี้\" ด้านบน", "🏛 This style: 1/2-column images · width · height · image gap are set in the \"Adjust this style\" box above")}</p>}
        {!mobile && !luxe && (
        <div>
          <label className={lbl}>{t("จอคอมโชว์กี่รูปพร้อมกัน (แกลเลอรีเลื่อนซ้าย-ขวา · มือถือทีละรูปเสมอ)", "Images shown at once on desktop (gallery slides left-right · mobile always one at a time)")}</label>
          <WheelSelect value={g.perView} onChange={(e) => setPart("gallery", { perView: Number(e.target.value) === 2 ? 2 : 1 })}>
            {PART_CHOICES.perViews.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </WheelSelect>
        </div>
        )}
        <div>
          <label className={lbl}>{t("กดเลือกสีแล้วรูปใหญ่ทำอย่างไร", "What the main image does when a color is picked")}</label>
          <select className={partInputCls} value={g.colorMode} onChange={(e) => setPart("gallery", { colorMode: e.target.value as ProductParts["gallery"]["colorMode"] })}>
            {PART_CHOICES.colorModes.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{labelEn(PART_CHOICES.colorModes.find((o) => o.value === g.colorMode)?.hint ?? "")}</p>
        </div>
        {onImageFit && (
          <div>
            <label className={lbl}>{t("การแสดงรูป", "Image display")}</label>
            <WheelSelect warn={!!(imageFitValue === "cover")} value={imageFitValue ?? ""} onChange={(e) => onImageFit(e.target.value)}>
              {mobile && <option value="__pc">{t("ตามคอม", "Follow desktop")} ({pcImageFitLabel})</option>}
              <option value="auto">{t("อัตโนมัติตามรูป — รูปนายแบบเต็มกรอบ · รูปที่ต้องตัดเยอะย่อพอดี", "Auto by image — model shots fill the frame · heavily cropped shots fit")}</option>
              {PRODUCT_IMAGE_SIZES.filter((o) => o.value !== "cover" && o.value !== "auto").map((o) => (
                <option key={o.value} value={o.value}>{t(`เห็นรูปครบทั้งใบ — ไม่ตัดรูป (${o.value}% ของกรอบ)`, `Show whole image — no crop (${o.value}% of frame)`)}</option>
              ))}
              {imageFitValue && imageFitValue !== "cover" && imageFitValue !== "auto" && imageFitValue !== "__pc" && !PRODUCT_IMAGE_SIZES.some((o) => o.value === imageFitValue) && (
                <option value={imageFitValue}>{t(`เห็นรูปครบทั้งใบ (${imageFitValue}%)`, `Show whole image (${imageFitValue}%)`)}</option>
              )}
              <option value="cover">{t("เต็มกรอบ — ตัดขอบรูปให้เต็มพื้นที่", "Fill frame — crop edges to fill the area")}</option>
            </WheelSelect>
            {imageFitValue === "cover" && <p className="text-[11px] text-amber-600 mt-1">{t("⚠️ รูปจะถูกตัดบน-ล่าง/ซ้าย-ขวาให้เต็มกรอบ — เลือก “เห็นรูปครบทั้งใบ” ถ้าไม่อยากให้ตัด", "⚠️ Images are cropped top-bottom/left-right to fill the frame — choose “Show whole image” to avoid cropping")}</p>}
          </div>
        )}
        {!luxe && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>{t("ความกว้างแกลเลอรี", "Gallery width")}</label>
            <WheelSelect value={g.width} onChange={(e) => setPart("gallery", { width: e.target.value as ProductParts["gallery"]["width"] })}>
              {PART_CHOICES.galleryWidths.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className={lbl}>{t("ความสูงแกลเลอรี", "Gallery height")}</label>
            <WheelSelect value={g.height} onChange={(e) => setPart("gallery", { height: e.target.value as ProductParts["gallery"]["height"] })}>
              {PART_CHOICES.galleryHeights.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </WheelSelect>
          </div>
        </div>
        )}
        {!mobile && !luxe && onGalleryPreset && (
          <button type="button" onClick={onGalleryPreset} className="w-full text-xs rounded-lg border border-dashed border-blue-300 text-blue-700 py-1.5 hover:bg-blue-50">
            {t("✨ ตั้งแบบเต็มจอ (Gucci): เต็มขอบจอ · สูงเต็มจอ · 2 รูปคู่กัน · เห็นรูปครบทั้งใบ (ไม่ตัดรูป)", "✨ Full-screen preset (Gucci): edge to edge · full height · 2 images side by side · whole image (no crop)")}
          </button>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <PartToggle label={t("เส้นทางหน้า (หน้าแรก / สินค้า / หมวด)", "Breadcrumb (Home / Products / Category)")} on={g.showBreadcrumb} onChange={(v) => setPart("gallery", { showBreadcrumb: v })} />
          <PartToggle label={luxe ? t("ชื่อรุ่น (ในแผงข้อมูล)", "Model name (in info panel)") : t("ชื่อรุ่นตัวใหญ่เหนือรูป", "Large model name above image")} on={g.showTitle} onChange={(v) => setPart("gallery", { showTitle: v })} />
          <PartToggle label={t("ชื่อรองใต้ชื่อรุ่น", "Subtitle under model name")} on={g.showSubtitle} onChange={(v) => setPart("gallery", { showSubtitle: v })} />
          {!mobile && !luxe && <PartToggle label={t("แถบลอยล่างรูป (ชื่อ · สี · ราคา · ใส่ตะกร้า) — หายเมื่อเลื่อนลง (จอคอม)", "Floating bar under image (name · color · price · add to cart) — hides on scroll (desktop)")} on={g.bar} onChange={(v) => setPart("gallery", { bar: v })} />}
        </div>
        <p className="text-[11px] text-slate-400">{t("รูปมาจากไหน (ปก Parent / SKU ลูก) ตั้งที่แท็บ ⚙️ จับคู่ฟิลด์ · รูปรายสีหลายรูป ตั้งที่ Parent SKU → แท็บ 🛍 เว็บไซต์", "Image source (Parent cover / child SKU) is set in the ⚙️ Field mapping tab · multiple images per color are set in Parent SKU → 🛍 Website tab")}</p>
      </div>
    );
  }
  if (part === "buy") {
    const b = parts.buy;
    if (mobile && !mobile.buyItems) {
      // โหมดมือถือ ยังตามคอม: ให้กดคัดลอกชุดของคอมมาตั้งแยกก่อน (จะได้แก้ทุกอย่างได้เหมือนคอม)
      return (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
          {mobileNote("buy")}
          <div className="rounded-lg border border-dashed border-blue-200 p-3 text-center">
            <p className="text-xs text-slate-600 mb-2">{t("มือถือใช้ชุดชิ้นส่วนเดียวกับคอมอยู่ (เรียงเป็นคอลัมน์เดียว ซ้ายก่อนขวา)", "Mobile uses the same parts as desktop (one column, left before right)")}</p>
            <button type="button" onClick={() => onCopyBuyToMobile?.()} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">{t("📱 ตั้งแยกสำหรับมือถือ (คัดลอกค่าคอมมาแก้)", "📱 Set separately for mobile (copy desktop values to edit)")}</button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("buy")}
        <BuyItemsEditor buy={b} onChange={(p) => setPart("buy", p)} fields={fields} />
      </div>
    );
  }
  if (part === "banner" || extra) {
    const bn: BannerPart = extra ?? parts.banner;
    const set = (p: Partial<ExtraBanner>) => (extra ? setExtra?.(p) : setPart("banner", p));
    const needsIndex = bn.imageSource === "nth" || bn.imageSource === "parent";
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2.5">
        {extra ? (
          <div className="flex items-center gap-2">
            <label className={`${lbl} mb-0 shrink-0`}>{t("ชื่อในรายการ", "Name in list")}</label>
            <input className={partInputCls} value={extra.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder={t("เช่น แบนเนอร์ไลฟ์สไตล์", "e.g. Lifestyle banner")} />
          </div>
        ) : (
          mobileNote("banner")
        )}
        {extra && mobile && <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1">{t("📱 แบนเนอร์เพิ่มใช้ค่าเดียวกันทั้งคอมและมือถือ — สัดส่วนบนมือถือตั้งได้ที่ช่อง “มือถือ” ใน 📐 ขนาด", "📱 Extra banners use the same values on desktop and mobile — set the mobile ratio in the “Mobile” field under 📐 Size")}</p>}

        {/* 🖼 รูป */}
        <div>
          <label className={lbl}>{t("รูปแบนเนอร์เอาจาก", "Banner image from")}</label>
          <div className="flex gap-1.5">
            <select className={partInputCls} value={bn.imageSource} onChange={(e) => set({ imageSource: e.target.value as BannerPart["imageSource"] })}>
              {PART_CHOICES.bannerImages.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            {needsIndex && (
              <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                {t("รูปที่", "Image no.")}
                <input type="number" min={1} max={20} value={bn.imageIndex} onChange={(e) => set({ imageIndex: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs text-center" />
              </label>
            )}
          </div>
          {bn.imageSource === "field" && (
            <div className="mt-1.5 space-y-1">
              <div className="flex gap-1.5">
                <select className={partInputCls} value={bn.imageField} onChange={(e) => set({ imageField: e.target.value })}>
                  <option value="">{t("— เลือกฟิลด์รูป —", "— Pick image field —")}</option>
                  {imageFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                {onCreateImageField && (
                  <button type="button" onClick={onCreateImageField} className="shrink-0 text-[11px] px-2 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700" title={t("เพิ่มฟิลด์ชนิดรูปภาพให้ Parent SKU", "Add an image field to Parent SKU")}>{t("＋ ฟิลด์รูปใหม่", "＋ New image field")}</button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{t("อัปโหลดรูปต่อรุ่นในหน้า Parent SKU (ช่องของฟิลด์นี้) · รุ่นที่ยังไม่มีรูปในช่องนี้ = ไม่โชว์แบนเนอร์", "Upload images per model on the Parent SKU page (this field) · models without an image here = no banner")}</p>
            </div>
          )}
          {bn.imageSource === "fixed" && (
            <div className="mt-1.5">
              <ImageUploadField label={t("รูปกลาง (ใช้ทุกสินค้า)", "Shared image (all products)")} hint={t("แนะนำแนวนอน 16:10", "Landscape 16:10 recommended")} value={bn.imageKey} onChange={(k) => set({ imageKey: k })} previewBg={previewBg} height={56} />
            </div>
          )}
          {bn.imageSource !== "field" && <p className="text-[11px] text-slate-400 mt-1">{t("ไม่มีรูปตามแหล่งที่เลือก = ส่วนนี้ไม่โชว์สำหรับสินค้านั้น", "No image from the chosen source = this section doesn't show for that product")}</p>}
        </div>

        {/* 📐 ขนาด */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>{t("📐 ความกว้าง", "📐 Width")}</label>
            <WheelSelect value={bn.width} onChange={(e) => set({ width: e.target.value as BannerPart["width"] })}>
              {PART_CHOICES.bannerWidths.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className={lbl}>{t("สัดส่วนรูป · คอม", "Image ratio · desktop")}</label>
            <select className={partInputCls} value={bn.ratio} onChange={(e) => set({ ratio: e.target.value as BannerPart["ratio"] })}>
              {PART_CHOICES.bannerRatios.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t("สัดส่วนรูป · มือถือ", "Image ratio · mobile")}</label>
            <select className={partInputCls} value={bn.ratioMobile} onChange={(e) => set({ ratioMobile: e.target.value as BannerPart["ratioMobile"] })}>
              <option value="same">{t("เท่าคอม", "Same as desktop")}</option>
              {PART_CHOICES.bannerRatios.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
        </div>

        {/* ✍️ ข้อความ + จัดวาง */}
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className={lbl}>{t("หัวข้อ", "Heading")}</label>
            <select className={partInputCls} value={bn.titleSource} onChange={(e) => set({ titleSource: e.target.value as BannerPart["titleSource"] })}>
              {PART_CHOICES.bannerTitles.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            {bn.titleSource === "text" && <LangInput className={`${partInputCls} mt-1.5`} obj={bn} k="titleText" onPatch={set} placeholder={t("หัวข้อแบนเนอร์", "Banner heading")} />}
          </div>
          <div>
            <label className={lbl}>{t("ข้อความ", "Text")}</label>
            <select className={partInputCls} value={bn.textSource} onChange={(e) => set({ textSource: e.target.value as BannerPart["textSource"] })}>
              {PART_CHOICES.bannerTexts.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
            {bn.textSource === "text" && <LangInput multiline rows={3} className={`${partInputCls} mt-1.5`} obj={bn} k="text" onPatch={set} placeholder={t("ข้อความใต้หัวข้อ", "Text under heading")} />}
          </div>
          <div>
            <label className={lbl}>{t("จัดวาง", "Layout")}</label>
            <select className={partInputCls} value={bn.layout} onChange={(e) => { const layout = e.target.value as BannerLayout; set({ layout, textPos: fixTextPos(layout, bn.textPos) }); }}>
              {BANNER_LAYOUTS.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t("ตำแหน่งข้อความ", "Text position")}</label>
            <select className={partInputCls} value={bn.textPos} onChange={(e) => set({ textPos: e.target.value as BannerTextPos })}>
              {textPosFor(bn.layout).map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
            </select>
          </div>
        </div>

        {/* ฟิลด์ (กะทัดรัด: ชิป + ป๊อปอัปเลือก) */}
        <div>
          <label className={lbl}>{t("ฟิลด์ Parent SKU ที่โชว์ในแบนเนอร์", "Parent SKU fields shown in banner")} ({bn.fields.length}/12)</label>
          <FieldChipsPicker compact value={bn.fields} onChange={(f) => set({ fields: f })} fields={fields} groups={fieldGroups} max={12} description={t("ติ๊กฟิลด์ที่จะโชว์เป็นตารางในแบนเนอร์ — เรียงตามลำดับที่ติ๊ก · ช่องที่สินค้าไม่ได้กรอกจะไม่โชว์", "Tick fields to show as a table in the banner — in tick order · fields a product hasn't filled in don't show")} />
        </div>
        {!extra && <p className="text-[11px] text-slate-400">{t("สินค้าที่ตั้ง \"🖼 แบนเนอร์หน้าสินค้า\" ไว้เองในแท็บ 🛍 เว็บไซต์ ของ Parent SKU จะใช้ของตัวเองแทนแบนเนอร์นี้ (แบนเนอร์เพิ่มยังโชว์ตามปกติ)", "Products with their own \"🖼 Product page banner\" in the Parent SKU 🛍 Website tab use that instead of this banner (extra banners still show)")}</p>}
      </div>
    );
  }
  // 🔗 "related" / 👀 "recent" ตั้งที่ components/website-related-settings (การ์ดเดียวกับแท็บ 🔗 แนะนำสินค้า)
  return null;
}
/* ─────────── 🧩 จัดชิ้นส่วนในส่วน "ราคา · ตัวเลือก · ใส่ตะกร้า" ─────────── */
export const BUY_SIZES = [70, 80, 90, 100, 110, 125, 150, 175, 200];
export function BuyItemsEditor({ buy, onChange, fields = [] }: { buy: ProductParts["buy"]; onChange: (p: Partial<ProductParts["buy"]>) => void; fields?: { key: string; label: string }[] }) {
  const t = useT();
  const items = buy.items;
  const [openId, setOpenId] = useState<string | null>(null);
  const drag = useDragReorder((from, to) => onChange({ items: moveItem(items, from, to) }));
  const setItem = (id: string, patch: Partial<BuyItem>) => onChange({ items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const lbl = "block text-[11px] text-slate-500 mb-1";
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  const ColorBtn = ({ value, onChange: oc, title }: { value: string | null; onChange: (v: string | null) => void; title: string }) => (
    <span className="inline-flex items-center gap-1">
      <input type="color" value={value ?? "#000000"} onChange={(e) => oc(e.target.value.toUpperCase())} title={title} className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
      {value ? <button type="button" onClick={() => oc(null)} className="text-[11px] text-slate-500 hover:text-rose-600" title={t("ใช้สีตามธีม", "Use theme color")}>✕</button> : <span className="text-[10px] text-slate-400">{t("ตามธีม", "Theme")}</span>}
    </span>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className={`${lbl} mb-0`}>{t("จัดเป็น", "Arrange as")}</label>
          <WheelSelect value={buy.columns} onChange={(e) => onChange({ columns: Number(e.target.value) === 1 ? 1 : 2 })}>
            <option value={2}>{t("2 คอลัมน์ (ซ้าย / ขวา)", "2 columns (left / right)")}</option>
            <option value={1}>{t("1 คอลัมน์ (เรียงตามลำดับ)", "1 column (in order)")}</option>
          </WheelSelect>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const it = defaultBuyItem("text", "right"); onChange({ items: [...items, it] }); setOpenId(it.id); }} className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">{t("+ ข้อความอิสระ", "+ Free text")}</button>
          <button type="button" onClick={() => { if (confirm(t("คืนค่าเริ่มต้นของส่วนราคา-ตะกร้า?", "Reset the price-cart section to default?"))) onChange({ items: DEFAULT_BUY_ITEMS(), columns: 2 }); }} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">{t("คืนค่าเริ่มต้น", "Reset to default")}</button>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">{t("ลาก ⠿ สลับลำดับ · ติ๊กเปิด/ปิด · เลือกคอลัมน์ · ✎ ตั้งค่าขนาด/สี/จัดชิด และค่าเฉพาะชิ้น · มือถือเรียงเป็นคอลัมน์เดียว (ซ้ายก่อนขวา)", "Drag ⠿ to reorder · tick to show/hide · pick column · ✎ size/color/alignment and part-specific settings · mobile stacks in one column (left before right)")}</p>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const def = BUY_ITEM_DEFS[it.key];
          const open = openId === it.id;
          const title = it.key === "text" ? (it.text.trim().split("\n")[0] || t("ข้อความอิสระ", "Free text")) : labelEn(def.label);
          return (
            <li key={it.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${drag.rowCls(i)} ${it.enabled ? "border-slate-200" : "border-slate-100 opacity-60"} ${open ? "border-blue-300" : ""}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={it.enabled} onChange={(e) => setItem(it.id, { enabled: e.target.checked })} title={t("แสดง/ซ่อน", "Show/hide")} />
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="flex-1 min-w-0 text-left">
                  <span className={`block text-sm truncate ${it.enabled ? "text-slate-800" : "line-through text-slate-400"}`}>{title}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{labelEn(def.hint)}{it.size !== 100 ? ` · ${it.size}%` : ""}{it.color ? t(" · สี", " · color") : ""}{it.align !== "left" ? (it.align === "center" ? t(" · กลาง", " · center") : t(" · ขวา", " · right")) : ""}</span>
                </button>
                {buy.columns === 2 && (
                  <select className={mini} value={it.col} onChange={(e) => setItem(it.id, { col: e.target.value as BuyItem["col"] })} title={t("อยู่คอลัมน์ไหน", "Which column")}>
                    <option value="left">{t("ซ้าย", "Left")}</option>
                    <option value="right">{t("ขวา", "Right")}</option>
                  </select>
                )}
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400" title={open ? t("พับ", "Collapse") : t("ตั้งค่า", "Settings")}>{open ? "▾" : "✎"}</button>
                {it.key === "text" && (
                  <button type="button" onClick={() => onChange({ items: items.filter((x) => x.id !== it.id) })} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-red-600 hover:border-red-300" title={t("ลบ", "Delete")}>🗑️</button>
                )}
              </div>
              {open && (
                <div className="border-t border-slate-100 px-3 py-2 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className={lbl}>{t("จัดชิด", "Align")}</label>
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                        {([["left", "⇤"], ["center", "☰"], ["right", "⇥"]] as const).map(([a, ic]) => (
                          <button key={a} type="button" onClick={() => setItem(it.id, { align: a })} className={`w-8 h-7 text-xs ${it.align === a ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} title={a === "left" ? t("ชิดซ้าย", "Align left") : a === "center" ? t("กึ่งกลาง", "Center") : t("ชิดขวา", "Align right")}>{ic}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>{t("ขนาด", "Size")}</label>
                      <WheelSelect value={it.size} onChange={(e) => setItem(it.id, { size: Number(e.target.value) })}>
                        {[...new Set([...BUY_SIZES, it.size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}%{n === 100 ? t(" (ปกติ)", " (normal)") : ""}</option>)}
                      </WheelSelect>
                    </div>
                    <div>
                      <label className={lbl}>{t("สีตัวอักษร", "Text color")}</label>
                      <ColorBtn value={it.color} onChange={(v) => setItem(it.id, { color: v })} title={t("สีตัวอักษรของชิ้นนี้", "Text color of this part")} />
                    </div>
                    <div>
                      <label className={lbl}>{t("ระยะห่างด้านบน", "Top spacing")}</label>
                      <WheelSelect value={it.gap} onChange={(e) => setItem(it.id, { gap: e.target.value as BuyItem["gap"] })}>
                        <option value="sm">{t("ชิด", "Tight")}</option>
                        <option value="md">{t("ปกติ", "Normal")}</option>
                        <option value="lg">{t("ห่าง", "Loose")}</option>
                      </WheelSelect>
                    </div>
                  </div>

                  {it.key === "price" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <PartToggle label={t("หน่วย (/ ใบ)", "Unit (/ pc)")} on={it.showUnit} onChange={(v) => setItem(it.id, { showUnit: v })} />
                      <PartToggle label={t("ป้าย (ใหม่/ลดราคา)", "Badge (new/sale)")} on={it.showBadge} onChange={(v) => setItem(it.id, { showBadge: v })} />
                      <PartToggle label={t("ราคาเต็มขีดฆ่า (fake_price ใน Parent SKU)", "Struck-through full price (fake_price in Parent SKU)")} on={it.showCompare} onChange={(v) => setItem(it.id, { showCompare: v })} />
                    </div>
                  )}
                  {it.key === "desc" && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>{t("ดึงข้อความจาก", "Text from")}</label>
                        <select className={partInputCls} value={it.field} onChange={(e) => setItem(it.id, { field: e.target.value })}>
                          <option value="">{t("คำอธิบาย (ตามที่จับคู่ฟิลด์)", "Description (per field mapping)")}</option>
                          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        {it.field && <p className="text-[11px] text-slate-500 mt-1">{t("สินค้าไหนช่องนี้ว่าง = ใช้คำอธิบายแทน (ข้อความไม่หาย) · Introduction = “คำแนะนำสินค้า”", "If this field is empty for a product, the description is used instead · Introduction = “Product introduction”")}</p>}
                      </div>
                    <div>
                      <label className={lbl}>{t("ตัดกี่บรรทัด", "Clamp to lines")}</label>
                      <WheelSelect value={it.lines} onChange={(e) => setItem(it.id, { lines: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{t(`${n} บรรทัด`, `${n} lines`)}</option>)}
                      </WheelSelect>
                      <div className="mt-1.5"><PartToggle label={t("ปุ่ม “ดูเพิ่มเติม” เมื่อยาวเกิน", "“Read more” button when too long")} on={it.more} onChange={(v) => setItem(it.id, { more: v })} /></div>
                    </div>
                    </div>
                  )}
                  {def.styles && (
                    <div>
                      <label className={lbl}>{t("รูปแบบ", "Style")}</label>
                      <select className={mini} value={it.style} onChange={(e) => setItem(it.id, { style: e.target.value })}>
                        {def.styles.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
                      </select>
                      {it.key === "options" && it.style === "swatches" && <div className="mt-1.5"><ColorSwatchButton /></div>}
                    </div>
                  )}
                  {(it.key === "qty" || it.key === "options" || it.key === "options2") && (
                    <div>
                      <label className={lbl}>{it.key === "options2" ? t("ป้ายกำกับ (ว่าง = ชื่อชุดจาก SKU เช่น ไซส์)", "Label (empty = option set name from SKU, e.g. Size)") : t("ป้ายกำกับ (ว่าง = ค่าเดิม)", "Label (empty = default)")}</label>
                      <LangInput className={partInputCls} obj={it} k="label" onPatch={(p) => setItem(it.id, p)} placeholder={it.key === "qty" ? t("จำนวน", "Quantity") : it.key === "options2" ? t("ไซส์", "Size") : t("สี / ตัวเลือก", "Color / option")} />
                    </div>
                  )}
                  {/* 📐 ตัวเลือกที่ 2 (ไซส์) — ส่วนเสริมจากตารางไซส์ (เว็บไซต์ → 📏 ตารางไซส์) · ไม่มีตารางของสินค้านั้น = ไม่โชว์เอง */}
                  {it.key === "options2" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <PartToggle label={t("ลิงก์ 📏 ตารางไซส์", "📏 Size guide link")} on={it.showGuide} onChange={(v) => setItem(it.id, { showGuide: v })} />
                      <PartToggle label={t("ช่วงใต้ปุ่มไซส์ (เช่น 28–32″)", "Range under size buttons (e.g. 28–32″)")} on={it.showFit} onChange={(v) => setItem(it.id, { showFit: v })} />
                      <PartToggle label={t("ตัวช่วยกรอกรอบเอว → แนะนำไซส์", "Waist helper → size suggestion")} on={it.showHelper} onChange={(v) => setItem(it.id, { showHelper: v })} />
                    </div>
                  )}
                  {it.key === "button" && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>{t("ข้อความบนปุ่ม (ว่าง = \"ใส่ตะกร้า · ราคา\")", "Button text (empty = \"Add to cart · price\")")}</label>
                        <LangInput className={partInputCls} obj={it} k="label" onPatch={(p) => setItem(it.id, p)} placeholder={t("ใส่ตะกร้า · ฿890", "Add to cart · ฿890")} />
                      </div>
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <label className={lbl}>{t("สีพื้นปุ่ม", "Button background")}</label>
                          <ColorBtn value={it.bg} onChange={(v) => setItem(it.id, { bg: v })} title={t("สีพื้นปุ่ม (ว่าง = สีแบรนด์)", "Button background (empty = brand color)")} />
                        </div>
                        <PartToggle label={t("เต็มความกว้าง", "Full width")} on={it.fullWidth} onChange={(v) => setItem(it.id, { fullWidth: v })} />
                      </div>
                    </div>
                  )}
                  {it.key === "note" && (
                    <div>
                      <label className={lbl}>{t("เอาข้อความจาก", "Text from")}</label>
                      <select className={partInputCls} value={buy.noteSource} onChange={(e) => onChange({ noteSource: e.target.value as ProductParts["buy"]["noteSource"] })}>
                        {PART_CHOICES.buyNotes.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
                      </select>
                      {buy.noteSource === "text" && (
                        <LangInput className={`${partInputCls} mt-1.5`} obj={buy} k="noteText" onPatch={onChange} placeholder={t("เช่น ส่งฟรีเมื่อครบ ฿1,500 · จัดส่งใน 1–2 วัน", "e.g. Free shipping over ฿1,500 · ships in 1–2 days")} />
                      )}
                    </div>
                  )}
                  {it.key === "text" && (
                    <div>
                      <label className={lbl}>{t("ข้อความ (ขึ้นบรรทัดใหม่ได้)", "Text (line breaks allowed)")}</label>
                      <LangInput multiline rows={3} className={partInputCls} obj={it} k="text" onPatch={(p) => setItem(it.id, p)} placeholder={t("✓ ส่งฟรีเมื่อครบ ฿1,500\n✓ รับประกันงานเย็บ 6 เดือน", "✓ Free shipping over ฿1,500\n✓ 6-month stitching warranty")} />
                      <div className="mt-1"><PartToggle label={t("ตัวหนา", "Bold")} on={it.bold} onChange={(v) => setItem(it.id, { bold: v })} /></div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}