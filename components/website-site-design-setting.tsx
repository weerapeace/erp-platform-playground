"use client";

/**
 * 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1) — ตั้งครั้งเดียว ทุกหน้า/ทุก Section เปลี่ยนตาม
 * ค่าเก็บที่ theme.page / theme.shape / theme.header.iconStyle (lib/website-site-design · มิเรอร์เว็บร้าน src/lib/site-design.ts)
 * เว็บร้านวาดเป็น CSS ที่ src/lib/site-design-css.ts · ค่าเริ่มต้นทุกตัว = หน้าตาเดิม
 */
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";
import { ImageUploadField } from "@/components/website-theme-media";
import { RangeInput } from "@/components/range-input";
import { LangInput } from "@/components/bilingual-field";
import {
  DEFAULT_SITE_PAGE,
  DEFAULT_SITE_SHAPE,
  FESTIVE_HANGING,
  MOBILE_NAV_ITEMS,
  MOBILE_NAV_MAX,
  MOBILE_SCALE_RANGE,
  TEXTURE_STRENGTH_RANGE,
  formatMoneyAs,
  type BackToTop,
  type ButtonHover,
  type ButtonKind,
  type CookieLayout,
  type CursorStyle,
  type FestiveKind,
  type FestiveLook,
  type HeaderIconStyle,
  type InputStyle,
  type IntroStyle,
  type LinkHover,
  type MobileNavItem,
  type MotionSpeed,
  type PriceFormat,
  type ProofLook,
  type SearchEmpty,
  type SectionEntrance,
  type SiteDensity,
  type SitePageDesign,
  type SiteShapeDesign,
  type SiteTexture,
  type SiteWidth,
  type ThanksAnim,
  type ThanksIcon,
} from "@/lib/website-site-design";
import { webForm } from "@/lib/website-form-styles";
import { Text as LangText } from "@/components/website-cart-settings";
import { AccountPageSetting } from "@/components/website-account-design";
import { LoginExtraSetting } from "@/components/website-login-design";
import { PartStyleFold } from "@/components/website-part-style-editor";
import { COOKIE_PARTS, NF_PARTS, POPUP_PARTS, SEARCH_PARTS, THANKS_PARTS } from "@/lib/website-page-parts";
import type { SiteTheme } from "@/lib/website-theme";
import { DesignCard } from "@/components/website-design/design-card";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

type Colors = { brand: string; ink: string; page: string; onBrand: string };

const labelCls = webForm.labelRoomy;

/** ปุ่มตัวเลือกแบบมีชื่อ + คำอธิบาย + ภาพตัวอย่างเล็ก (เหมือนตัวเลือกการเปลี่ยนหน้า) */
function Choice<T extends string>({ value, options, onChange }: { value: T; onChange: (v: T) => void; options: { v: T; l: string; d?: string; pv?: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`text-left px-3 py-2 rounded-lg border text-sm transition min-w-[7.5rem] ${value === o.v ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
        >
          {o.pv && <span className="block mb-1.5">{o.pv}</span>}
          <span className="block font-medium">{o.l}</span>
          {o.d && <span className="block text-[11px] text-slate-500 leading-snug">{o.d}</span>}
        </button>
      ))}
    </div>
  );
}

const Def = ({ show }: { show: boolean }) => (show ? <span className="ml-1 text-[10px] text-slate-400">{tr("(แบบเดิม)", "(original)")}</span> : null);

/** ภาพตัวอย่างความโปร่ง: กล่อง 3 ชั้น ห่างต่างกัน */
const DensityPv = ({ gap }: { gap: number }) => (
  <span className="flex flex-col w-16 rounded bg-slate-100 p-1" style={{ gap }}>
    <span className="h-1.5 rounded-sm bg-slate-400" />
    <span className="h-1.5 rounded-sm bg-slate-300" />
    <span className="h-1.5 rounded-sm bg-slate-300" />
  </span>
);
const WidthPv = ({ pct }: { pct: number }) => (
  <span className="flex justify-center w-16 rounded bg-slate-100 py-1">
    <span className="h-3 rounded-sm bg-slate-400" style={{ width: `${pct}%` }} />
  </span>
);
const noiseUrl = (freq: string, alpha: number, warm: boolean) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${warm ? ".36" : "0"} 0 0 0 0 ${warm ? ".28" : "0"} 0 0 0 0 ${warm ? ".2" : "0"} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )}")`;
const TexturePv = ({ kind, page }: { kind: SiteTexture; page: string }) => (
  <span
    className="block w-16 h-8 rounded border border-slate-200"
    style={{ backgroundColor: page, backgroundImage: kind === "paper" ? noiseUrl(".6", 0.25, true) : kind === "grain" ? noiseUrl(".85", 0.45, false) : undefined }}
  />
);

export function SitePageSetting({ value, onChange, colors }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void; colors: Colors }) {
  const t = useT();
  const d = DEFAULT_SITE_PAGE;
  return (
    <DesignCard title={t("🧱 พื้นที่ · พื้นหลัง · มือถือ (ทั้งเว็บ)", "🧱 Spacing · background · mobile (whole site)")} hint={<>{t("ตั้งครั้งเดียว ทุกหน้าเปลี่ยนตาม · ค่าที่มีป้าย \"แบบเดิม\" คือหน้าตาก่อนมีตัวเลือกนี้", "Set once, every page follows · values tagged \"original\" are the look before this option existed")}</>}>

      <label className={labelCls}>{t("ความโปร่งของทั้งหน้า", "Page density")}</label>
      <Choice<SiteDensity>
        value={value.density}
        onChange={(v) => onChange({ density: v })}
        options={[
          { v: "dense", l: t("แน่น", "Compact"), d: t("Section ชิดกันขึ้น เห็นของเยอะในจอเดียว", "Sections closer together, more on one screen"), pv: <DensityPv gap={1} /> },
          { v: "normal", l: t("ปกติ", "Normal"), d: t("ระยะห่างแบบเดิม", "Original spacing"), pv: <DensityPv gap={3} /> },
          { v: "airy", l: t("โล่งแบบแบรนด์หรู", "Airy, luxury-brand style"), d: t("เว้นที่ว่างมากขึ้น ดูแพงขึ้น", "More white space, looks more premium"), pv: <DensityPv gap={6} /> },
        ]}
      />
      <p className="text-[11px] text-slate-400 mt-1 mb-3">{t("ปรับระยะบน-ล่างของทุก Section ที่ใช้ระยะ \"ตามเดิม\" · Section ที่ตั้งระยะห่างเองคงค่าที่ตั้งไว้", "Adjusts top/bottom spacing of every Section set to \"default\" spacing · Sections with their own spacing keep it")}</p>

      <label className={labelCls}>{t("ความกว้างของเนื้อหา", "Content width")}</label>
      <Choice<SiteWidth>
        value={value.width}
        onChange={(v) => onChange({ width: v })}
        options={[
          { v: "narrow", l: t("แคบ", "Narrow"), d: t("1,080px · อ่านง่าย แบบนิตยสาร", "1,080px · easy to read, magazine style"), pv: <WidthPv pct={62} /> },
          { v: "normal", l: t("ปกติ", "Normal"), d: t("1,240px (แบบเดิม)", "1,240px (original)"), pv: <WidthPv pct={76} /> },
          { v: "wide", l: t("กว้าง", "Wide"), d: t("1,440px · จอใหญ่เห็นสินค้าเยอะ", "1,440px · more products on large screens"), pv: <WidthPv pct={90} /> },
          { v: "full", l: t("เต็มจอ", "Full width"), d: t("ยาวสุดขอบจอ (เว้นขอบข้างเล็กน้อย)", "Edge to edge (small side margin)"), pv: <WidthPv pct={100} /> },
        ]}
      />

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>{t("ผิวพื้นหลัง", "Background texture")}</label>
        <Choice<SiteTexture>
          value={value.texture}
          onChange={(v) => onChange({ texture: v })}
          options={[
            { v: "none", l: t("เรียบ", "Plain"), d: t("แบบเดิม", "Original"), pv: <TexturePv kind="none" page={colors.page} /> },
            { v: "paper", l: t("ผิวกระดาษ", "Paper"), d: t("เม็ดละเอียดโทนอุ่นบนพื้นหลัง", "Fine warm grain on the background"), pv: <TexturePv kind="paper" page={colors.page} /> },
            { v: "grain", l: t("เกรนฟิล์ม", "Film grain"), d: t("เม็ดฟิล์มบาง ๆ ทับทั้งจอ แบบนิตยสาร", "Light film grain over the whole screen, magazine style"), pv: <TexturePv kind="grain" page={colors.page} /> },
          ]}
        />
        {value.texture !== "none" && (
          <div className="mt-2 max-w-sm">
            <label className={labelCls}>{t("ความเข้มของลาย", "Texture strength")}</label>
            <RangeInput value={value.textureStrength} onChange={(n) => onChange({ textureStrength: n })} min={TEXTURE_STRENGTH_RANGE.min} max={TEXTURE_STRENGTH_RANGE.max} step={5} unit="%" ariaLabel={t("ความเข้มของลาย", "Texture strength")} />
            <p className="text-[11px] text-slate-400 mt-1">{value.texture === "paper" ? t("Section ที่ตั้งสีพื้นเองจะไม่มีลาย (ลายอยู่บนพื้นหลังเว็บ)", "Sections with their own background color have no texture (texture is on the site background)") : t("ทับทั้งจอรวมรูป · ไม่บังการกด", "Covers the whole screen incl. images · does not block clicks")}</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            {t("ขนาดตัวอักษรบนมือถือ (ทั้งเว็บ)", "Mobile text size (whole site)")}
            <Def show={value.mobileScale === d.mobileScale} />
          </label>
          <RangeInput value={value.mobileScale} onChange={(n) => onChange({ mobileScale: n })} min={MOBILE_SCALE_RANGE.min} max={MOBILE_SCALE_RANGE.max} step={5} unit="%" ariaLabel={t("ขนาดตัวอักษรบนมือถือ", "Mobile text size")} />
          <p className="text-[11px] text-slate-400 mt-1">{t("100% = เดิม · ขยายตัวอักษรและระยะห่างทั้งหน้าบนจอมือถือ (คอมไม่เปลี่ยน) · ทำงานคู่กับขนาดรายบทบาทในแท็บตัวอักษร", "100% = original · scales text and spacing on mobile screens (desktop unchanged) · works together with per-role sizes in the Fonts tab")}</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer self-start mt-5">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-blue-600" checked={value.bigTap} onChange={(e) => onChange({ bigTap: e.target.checked })} />
          <span>
            {t("ปุ่ม/ช่องกรอกใหญ่ขึ้นบนมือถือ", "Bigger buttons/inputs on mobile")}
            <span className="block text-[11px] text-slate-400">{t("สูงอย่างน้อย 48px ให้นิ้วกดง่าย (เหมาะกับลูกค้าผู้ใหญ่)", "At least 48px tall, easy to tap (good for older customers)")}</span>
          </span>
        </label>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>{t("รูปแบบราคา (ทุกจุดในเว็บ)", "Price format (everywhere on the site)")}</label>
        <Choice<PriceFormat>
          value={value.priceFormat}
          onChange={(v) => onChange({ priceFormat: v })}
          options={(["baht", "word", "dash", "thb"] as const).map((f) => ({
            v: f,
            l: formatMoneyAs(1090, f),
            d: f === "baht" ? t("แบบเดิม", "Original") : f === "word" ? t("หน้าอังกฤษ = 1,090 THB", "English pages = 1,090 THB") : f === "dash" ? t("แบบป้ายราคาร้าน", "Shop price-tag style") : t("แบบสากล", "International"),
          }))}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("ใช้กับการ์ด หน้าสินค้า ตะกร้า ชำระเงิน · ข้อความโปรที่คิดจากระบบโปร/ค่าส่ง ยังเขียนแบบ ฿ ตามเดิม", "Used on cards, product page, cart, checkout · promo/shipping messages from the system still use ฿")}</p>
      </div>
    </DesignCard>
  );
}

/** ปุ่มตัวอย่าง (สีหลักของร้าน) ตามแบบที่เลือก */
function BtnPv({ kind, colors, hover }: { kind: ButtonKind; colors: Colors; hover?: ButtonHover }) {
  const base = "relative inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider overflow-hidden transition";
  const style =
    kind === "fill"
      ? { background: colors.brand, color: colors.onBrand, padding: "6px 12px", borderRadius: 99 }
      : kind === "outline"
        ? { border: `1px solid ${colors.ink}`, color: colors.ink, padding: "5px 11px", borderRadius: 99 }
        : { borderBottom: `1px solid ${colors.ink}`, color: colors.ink, padding: "4px 0" };
  return (
    <span className={`${base} group ${hover === "lift" ? "hover:-translate-y-0.5 hover:shadow-md" : ""}`} style={style}>
      {hover === "fill" && kind !== "under" && <span aria-hidden className="absolute inset-0 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" style={{ background: "rgba(0,0,0,.28)" }} />}
      <span className="relative">ช้อปเลย</span>
      {hover === "arrow" && <span className="relative transition-transform group-hover:translate-x-1">→</span>}
    </span>
  );
}

/** ลิงก์ตัวอย่างตามลูกเล่นที่เลือก (ชี้ดูได้) */
function LinkPv({ mode, colors }: { mode: LinkHover; colors: Colors }) {
  const cls =
    mode === "run"
      ? "bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-[length:0_1px] bg-[position:0_100%] hover:bg-[length:100%_1px] transition-[background-size] duration-300"
      : mode === "fade"
        ? "hover:opacity-50 transition-opacity"
        : mode === "always"
          ? "underline underline-offset-4 hover:decoration-2"
          : mode === "color"
            ? "hover:text-[var(--pv-link)] transition-colors"
            : "hover:underline";
  return (
    <span className={`text-xs cursor-pointer ${cls}`} style={{ color: colors.ink, ["--pv-link" as string]: colors.brand }}>
      อ่านเรื่องราวของเรา
    </span>
  );
}

function InputPv({ mode, colors }: { mode: InputStyle; colors: Colors }) {
  const style =
    mode === "under"
      ? { borderBottom: `1px solid ${colors.ink}`, background: "transparent", padding: "5px 2px" }
      : mode === "filled"
        ? { background: "color-mix(in srgb, " + colors.ink + " 6%, white)", padding: "5px 8px", borderRadius: 6 }
        : { border: "1px solid #DEDEDA", background: "#fff", padding: "5px 8px", borderRadius: 6 };
  return (
    <span className="block w-28 text-[11px] text-slate-400" style={style}>
      อีเมลของคุณ
    </span>
  );
}

export function SiteControlsSetting({ value, onChange, colors }: { value: SiteShapeDesign; onChange: (v: Partial<SiteShapeDesign>) => void; colors: Colors }) {
  const t = useT();
  const d = DEFAULT_SITE_SHAPE;
  return (
    <DesignCard title={t("🔘 ปุ่ม · ลิงก์ · ช่องกรอก (ทั้งเว็บ)", "🔘 Buttons · links · inputs (whole site)")} hint={t("ทรงปุ่ม/ขนาดปุ่มตั้งในกล่องด้านล่าง · ตัวอย่างในแต่ละตัวเลือก เอาเมาส์ชี้ดูลูกเล่นได้", "Button shape/size is set in the box below · hover the samples to see the effects")}>

      <label className={labelCls}>
        {t("แบบปุ่มใน Section", "Section button style")}<Def show={value.buttonKind === d.buttonKind} />
      </label>
      <Choice<ButtonKind>
        value={value.buttonKind}
        onChange={(v) => onChange({ buttonKind: v })}
        options={[
          { v: "fill", l: t("ทึบ", "Solid"), d: t("พื้นสีหลัก (แบบเดิม)", "Brand color fill (original)"), pv: <BtnPv kind="fill" colors={colors} /> },
          { v: "outline", l: t("ขอบ", "Outline"), d: t("โปร่ง มีเส้นขอบ · ชี้แล้วเติมสี", "Transparent with border · fills on hover"), pv: <BtnPv kind="outline" colors={colors} /> },
          { v: "under", l: t("เส้นใต้", "Underline"), d: t("ตัวหนังสือ + เส้นใต้ แบบแบรนด์หรู", "Text + underline, luxury-brand style"), pv: <BtnPv kind="under" colors={colors} /> },
        ]}
      />
      <p className="text-[11px] text-slate-400 mt-1 mb-3">{t("ใช้กับปุ่มในหน้าแรก/หน้าเว็บ · ปุ่มใส่ตะกร้า ตะกร้า และชำระเงิน คงแบบทึบเสมอ (เห็นชัด กดง่าย) · ปุ่มที่ตั้งสีเองใน Section คงสีที่ตั้ง", "Used for buttons on home/web pages · add-to-cart, cart and checkout buttons stay solid (clear, easy to tap) · buttons with their own color keep it")}</p>

      <label className={labelCls}>
        {t("ปุ่มตอนชี้เมาส์", "Button hover")}<Def show={value.buttonHover === d.buttonHover} />
      </label>
      <Choice<ButtonHover>
        value={value.buttonHover}
        onChange={(v) => onChange({ buttonHover: v })}
        options={[
          { v: "auto", l: t("แบบเดิม", "Original"), d: t("สีเข้มขึ้นนิด", "Slightly darker"), pv: <BtnPv kind="fill" colors={colors} /> },
          { v: "fill", l: t("สีเลื่อนเติม", "Sliding fill"), d: t("สีไหลเติมจากซ้ายไปขวา", "Color fills from left to right"), pv: <BtnPv kind="fill" colors={colors} hover="fill" /> },
          { v: "arrow", l: t("ลูกศรขยับ", "Moving arrow"), d: t("มีลูกศรท้ายปุ่ม (เฉพาะปุ่มใน Section)", "Arrow at the end of the button (Section buttons only)"), pv: <BtnPv kind="fill" colors={colors} hover="arrow" /> },
          { v: "lift", l: t("ลอยขึ้น", "Lift"), d: t("ยกขึ้นนิด มีเงา", "Lifts slightly with shadow"), pv: <BtnPv kind="fill" colors={colors} hover="lift" /> },
        ]}
      />

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("ลิงก์ตัวหนังสือตอนชี้", "Text link hover")}<Def show={value.linkHover === d.linkHover} />
        </label>
        <Choice<LinkHover>
          value={value.linkHover}
          onChange={(v) => onChange({ linkHover: v })}
          options={[
            { v: "auto", l: t("แบบเดิม", "Original"), d: t("แต่ละที่ตามเดิม", "Each place as before"), pv: <LinkPv mode="auto" colors={colors} /> },
            { v: "color", l: t("เปลี่ยนสี", "Change color"), d: t("ไม่มีเส้นใต้", "No underline"), pv: <LinkPv mode="color" colors={colors} /> },
            { v: "run", l: t("เส้นใต้วิ่ง", "Running underline"), d: t("เส้นค่อย ๆ ลากใต้คำ", "Line slowly draws under the word"), pv: <LinkPv mode="run" colors={colors} /> },
            { v: "fade", l: t("จางลง", "Fade"), d: "", pv: <LinkPv mode="fade" colors={colors} /> },
            { v: "always", l: t("มีเส้นใต้ตลอด", "Always underlined"), d: t("ชี้แล้วเส้นหนาขึ้น", "Line thickens on hover"), pv: <LinkPv mode="always" colors={colors} /> },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("ใช้กับเส้นทางหน้า (หน้าแรก › ร้านค้า) ลิงก์เล็กในตะกร้า/ชำระเงิน และลิงก์ท้ายเว็บ · เมนูด้านบนตั้งแยกที่แท็บเมนู · สีตอนชี้ = \"สีลิงก์\" ในแท็บสี", "Used for breadcrumbs (Home › Shop), small links in cart/checkout and footer links · top menu is set in the Menu tab · hover color = \"Link color\" in the Colors tab")}</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("ช่องกรอกข้อมูล", "Input fields")}<Def show={value.inputStyle === d.inputStyle} />
        </label>
        <Choice<InputStyle>
          value={value.inputStyle}
          onChange={(v) => onChange({ inputStyle: v })}
          options={[
            { v: "box", l: t("กล่อง", "Box"), d: t("มีขอบรอบ (แบบเดิม)", "Border all around (original)"), pv: <InputPv mode="box" colors={colors} /> },
            { v: "under", l: t("เส้นใต้", "Underline"), d: t("เส้นเดียวด้านล่าง ดูเรียบหรู", "Single bottom line, clean and elegant"), pv: <InputPv mode="under" colors={colors} /> },
            { v: "filled", l: t("พื้นเทา", "Gray fill"), d: t("ไม่มีขอบ พื้นจาง ๆ", "No border, light fill"), pv: <InputPv mode="filled" colors={colors} /> },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("หน้าชำระเงิน สมัครสมาชิก ติดต่อเรา รับข่าวสาร รีวิว · ความมนของกล่องตั้งที่ \"ขอบช่องกรอก\" ด้านล่าง", "Checkout, sign-up, contact, newsletter, reviews · box roundness is set at \"Input corners\" below")}</p>
      </div>
    </DesignCard>
  );
}

/** ไอคอนตัวอย่างหัวเว็บ (ค้นหา · ตะกร้า · บัญชี) */
function IconsPv({ style, ink }: { style: HeaderIconStyle; ink: string }) {
  if (style === "text")
    return (
      <span className="flex gap-2 text-[10px] tracking-wider" style={{ color: ink }}>
        <span>ค้นหา</span>
        <span>ตะกร้า (2)</span>
      </span>
    );
  const sw = style === "thin" ? 1.1 : style === "bold" ? 2.1 : 1.5;
  const ring = style === "circle";
  const icon = (paths: string[], k: string) => (
    <span key={k} className={`inline-flex items-center justify-center ${ring ? "w-6 h-6 rounded-full" : ""}`} style={ring ? { boxShadow: `inset 0 0 0 1px ${ink}55` } : undefined}>
      <svg width={ring ? 13 : 16} height={ring ? 13 : 16} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {paths.map((p, i) => <path key={i} d={p} />)}
      </svg>
    </span>
  );
  return (
    <span className="flex items-center gap-1.5">
      {icon(["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m20 20-3.5-3.5"], "s")}
      {icon(["M5 8h14l-1 12H6L5 8Z", "M9 8V6a3 3 0 0 1 6 0v2"], "c")}
      {icon(["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"], "u")}
    </span>
  );
}

export function HeaderIconStyleSetting({ value, onChange, ink }: { value: HeaderIconStyle; onChange: (v: HeaderIconStyle) => void; ink: string }) {
  const t = useT();
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <label className={labelCls}>{t("🧱 ชุดไอคอนหัวเว็บ (ค้นหา · ตะกร้า · บัญชี)", "🧱 Header icon set (search · cart · account)")}</label>
      <Choice<HeaderIconStyle>
        value={value}
        onChange={onChange}
        options={[
          { v: "regular", l: t("เส้นปกติ", "Regular line"), d: t("แบบเดิม", "Original"), pv: <IconsPv style="regular" ink={ink} /> },
          { v: "thin", l: t("เส้นบาง", "Thin line"), d: t("บางเบา ดูหรู", "Light, elegant"), pv: <IconsPv style="thin" ink={ink} /> },
          { v: "bold", l: t("เส้นหนา", "Bold line"), d: t("ชัด เห็นง่าย", "Clear, easy to see"), pv: <IconsPv style="bold" ink={ink} /> },
          { v: "circle", l: t("ในวงกลม", "In a circle"), d: t("มีวงกลมรอบไอคอน", "Circle around the icon"), pv: <IconsPv style="circle" ink={ink} /> },
          { v: "text", l: t("ตัวหนังสือ", "Text"), d: t("จอคอมใช้คำแทนไอคอน · มือถือยังเป็นไอคอน", "Desktop uses words instead of icons · mobile keeps icons"), pv: <IconsPv style="text" ink={ink} /> },
        ]}
      />
    </div>
  );
}

/** ✨ ชุด 2 — ลูกเล่นทั้งเว็บ (theme.page: sectionMotion/… · intro · cursor · readProgress · backToTop) · เว็บร้าน BlockRenderer / IntroScreen / CustomCursor / ScrollAids */
export function SiteMotionSetting({ value, onChange }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void }) {
  const t = useT();
  const d = DEFAULT_SITE_PAGE;
  return (
    <DesignCard title={t("✨ ลูกเล่นทั้งเว็บ", "✨ Site-wide effects")} hint={t("ปิดทุกตัวเป็นค่าเริ่ม · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหวจะไม่เห็นลูกเล่นเหล่านี้", "All off by default · customers with reduced motion on their device won't see these effects")}>

      <label className={labelCls}>
        {t("Section โผล่ตอนเลื่อนมาถึง (ค่าทั้งเว็บ)", "Section entrance on scroll (site default)")}<Def show={value.sectionMotion === d.sectionMotion} />
      </label>
      <Choice<SectionEntrance>
        value={value.sectionMotion}
        onChange={(v) => onChange({ sectionMotion: v })}
        options={[
          { v: "none", l: t("ไม่ขยับ", "No motion"), d: t("แบบเดิม", "Original") },
          { v: "fade-up", l: t("ลอยขึ้น", "Lift"), d: t("แนะนำ ดูเรียบหรู", "Recommended, elegant") },
          { v: "fade-in", l: t("จางเข้า", "Fade in") },
          { v: "zoom", l: t("ซูมเบา ๆ", "Soft zoom") },
          { v: "blur", l: t("เบลอเป็นชัด", "Blur to sharp") },
        ]}
      />
      {value.sectionMotion !== "none" && (
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <Choice<MotionSpeed> value={value.sectionSpeed} onChange={(v) => onChange({ sectionSpeed: v })} options={[{ v: "fast", l: t("เร็ว", "Fast") }, { v: "normal", l: t("ปกติ", "Normal") }, { v: "slow", l: t("ช้า นุ่ม", "Slow, smooth") }]} />
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.sectionStagger} onChange={(e) => onChange({ sectionStagger: e.target.checked })} />
            {t("การ์ด/ชิ้นย่อยทยอยโผล่ทีละใบ", "Cards/items appear one by one")}
          </label>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1 mb-3">{t("ใช้กับ Section ที่ลูกเล่นเป็น \"ตามค่าทั้งเว็บ\" (ค่าเดิมของทุก Section) · Section ที่เลือกลูกเล่นเองคงแบบของตัวเอง · Section แรกของหน้าโผล่ทันทีเสมอ · ไม่อยากให้ Section ไหนขยับ เลือก \"ไม่ขยับ\" ในแท็บลูกเล่นของ Section นั้น", "Applies to Sections whose effect is \"site default\" (the default for every Section) · Sections with their own effect keep it · the first Section on a page always shows instantly · to stop a Section moving, pick \"No motion\" in that Section's Effects tab")}</p>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("หน้าโหลดแรก (ครั้งแรกที่ลูกค้าเข้าเว็บ)", "Intro screen (first visit)")}<Def show={value.intro === d.intro} />
        </label>
        <Choice<IntroStyle>
          value={value.intro}
          onChange={(v) => onChange({ intro: v })}
          options={[
            { v: "off", l: t("ไม่มี", "None"), d: t("แบบเดิม", "Original") },
            { v: "logo", l: t("โลโก้ค่อย ๆ ขึ้น", "Logo fades in"), d: t("แล้วจางเปิดเว็บ", "then fades to the site") },
            { v: "line", l: t("โลโก้ + เส้นโหลด", "Logo + loading line"), d: t("เส้นบางวิ่งใต้โลโก้", "Thin line runs under the logo") },
            { v: "curtain", l: t("ม่านเข้มเปิดขึ้น", "Dark curtain lifts"), d: t("ใช้โลโก้สำหรับพื้นเข้ม", "Uses the dark-background logo") },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("ประมาณ 1.5 วินาที · ขึ้นครั้งเดียวต่อการเข้าเว็บ 1 รอบ · ไม่ขึ้นในพรีวิวนี้และไม่ขึ้นให้บอทค้นหา — ดูผลได้โดยเปิดเว็บจริงในหน้าต่างไม่ระบุตัวตน", "About 1.5 seconds · shows once per visit · not shown in this preview or to search bots — open the live site in an incognito window to see it")}</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("เคอร์เซอร์ (คอม)", "Cursor (desktop)")}<Def show={value.cursor === d.cursor} />
        </label>
        <Choice<CursorStyle>
          value={value.cursor}
          onChange={(v) => onChange({ cursor: v })}
          options={[
            { v: "off", l: t("ปกติ", "Normal"), d: t("แบบเดิม", "Original") },
            { v: "ring", l: t("วงกลมตามเมาส์", "Circle follows mouse"), d: t("ลูกศรเดิมยังอยู่", "Normal arrow stays") },
            { v: "dot", l: t("จุด + วงแหวน", "Dot + ring"), d: t("ชี้ลิงก์/ปุ่มแล้วขยาย", "Grows over links/buttons") },
            { v: "view", l: t("วงกลม + คำว่า ดู", "Circle + \"View\""), d: t("ชี้รูปสินค้าแล้วขึ้น ดู", "Shows \"View\" over product images") },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("เฉพาะคอมที่ใช้เมาส์ (มือถือ/แท็บเล็ตไม่มีผล) · ชี้ช่องกรอกข้อมูลแล้วกลับเป็นลูกศรปกติ", "Desktop with mouse only (no effect on mobile/tablet) · returns to normal arrow over input fields")}</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer self-start">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-blue-600" checked={value.readProgress} onChange={(e) => onChange({ readProgress: e.target.checked })} />
          <span>
            {t("แถบบอกว่าเลื่อนอ่านถึงไหน", "Reading progress bar")}
            <span className="block text-[11px] text-slate-400">{t("เส้นบางสีหลักบนสุดของจอ ยาวขึ้นตามที่เลื่อนลง", "Thin brand-color line at the top that grows as you scroll")}</span>
          </span>
        </label>
        <div>
          <label className={labelCls}>
            {t("ปุ่มกลับขึ้นบน", "Back-to-top button")}<Def show={value.backToTop === d.backToTop} />
          </label>
          <Choice<BackToTop>
            value={value.backToTop}
            onChange={(v) => onChange({ backToTop: v })}
            options={[
              { v: "off", l: t("ไม่มี", "None") },
              { v: "circle", l: t("วงกลม", "Circle") },
              { v: "ring", l: t("วงกลม + วงแหวน", "Circle + ring"), d: t("บอกความคืบหน้า", "Shows progress") },
            ]}
          />
          {value.backToTop !== "off" && (
            <div className="mt-2">
              <Choice<"right" | "left"> value={value.backToTopSide} onChange={(v) => onChange({ backToTopSide: v })} options={[{ v: "right", l: t("ขวา", "Right"), d: t("เหนือปุ่มแชท", "Above the chat button") }, { v: "left", l: t("ซ้าย", "Left") }]} />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">{t("โผล่เมื่อเลื่อนลงเกินเกือบ 1 จอ · ไม่โชว์หน้าชำระเงิน", "Appears after scrolling about 1 screen · hidden on checkout")}</p>
        </div>
      </div>
    </DesignCard>
  );
}

const navLabel = (): Record<MobileNavItem, string> => ({ home: tr("หน้าแรก", "Home"), shop: tr("ร้านค้า", "Shop"), categories: tr("หมวด", "Categories"), search: tr("ค้นหา", "Search"), wishlist: tr("ถูกใจ", "Wishlist"), cart: tr("ตะกร้า", "Cart"), account: tr("บัญชี", "Account"), chat: tr("แชท", "Chat") });
const inputCls = webForm.inputBasic;

/** 📱 ชุด 3 — มือถือและช่วยขาย (theme.page: mobileNav · chat · searchEmpty · cookie) · เว็บร้าน MobileNav / FloatingChat / SearchOverlay / Tracking */
export function SiteSalesSetting({ value, onChange, colors, onPreview }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void; /** สีร้าน + พาพรีวิวไปหน้าตัวอย่าง (ตัวปรับละเอียดแถบคุกกี้) */ colors?: SiteTheme["colors"]; onPreview?: (path: string) => void }) {
  const t = useT();
  const nav = value.mobileNav;
  const setNav = (p: Partial<SitePageDesign["mobileNav"]>) => onChange({ mobileNav: { ...nav, ...p } });
  const chat = value.chat;
  const setChat = (p: Partial<SitePageDesign["chat"]>) => onChange({ chat: { ...chat, ...p } });
  const ck = value.cookie;
  const setCk = (p: Partial<SitePageDesign["cookie"]>) => onChange({ cookie: { ...ck, ...p } });
  const toggleItem = (k: MobileNavItem) => {
    const has = nav.items.includes(k);
    if (has && nav.items.length <= 2) return;
    if (!has && nav.items.length >= MOBILE_NAV_MAX) return;
    // เรียงตามลำดับมาตรฐานเสมอ (หน้าแรก → … → แชท)
    setNav({ items: MOBILE_NAV_ITEMS.filter((x) => (x === k ? !has : nav.items.includes(x))) });
  };
  return (
    <DesignCard title={t("📱 มือถือและช่วยขาย", "📱 Mobile and sales helpers")} hint={<>{t("ค่าที่มีป้าย \"แบบเดิม\" คือหน้าตาตอนนี้ · ดูผลได้ในพรีวิวด้านขวา (เลือกจอมือถือ)", "Values tagged \"original\" are the current look · see the result in the preview on the right (pick mobile)")}</>}>

      <label className={labelCls}>
        {t("แถบเมนูล่างแบบแอป (มือถือ)", "App-style bottom nav (mobile)")}<Def show={nav.style === "off"} />
      </label>
      <Choice<"off" | "label" | "icon">
        value={nav.style}
        onChange={(v) => setNav({ style: v })}
        options={[
          { v: "off", l: t("ไม่มี", "None"), d: t("แบบเดิม", "Original") },
          { v: "label", l: t("ไอคอน + คำ", "Icon + label"), d: t("อ่านง่าย แนะนำ", "Easy to read, recommended") },
          { v: "icon", l: t("ไอคอนอย่างเดียว", "Icon only"), d: t("เรียบ ประหยัดที่", "Clean, saves space") },
        ]}
      />
      {nav.style !== "off" && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-500 mb-1.5">{t("เลือกปุ่ม 2–", "Pick 2–")}{MOBILE_NAV_MAX} {t("ปุ่ม (เรียงตามลำดับนี้)", "buttons (in this order)")}</p>
          <div className="flex flex-wrap gap-2">
            {MOBILE_NAV_ITEMS.map((k) => {
              const on = nav.items.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggleItem(k)} className={`px-3 py-1.5 rounded-full border text-xs transition ${on ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {on ? "✓ " : ""}
                  {navLabel()[k]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-2">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nav.hideOnScroll} onChange={(e) => setNav({ hideOnScroll: e.target.checked })} />
            {t("เลื่อนลงแล้วซ่อนแถบ (เลื่อนขึ้นโผล่)", "Hide bar on scroll down (shows on scroll up)")}
          </label>
          <p className="text-[11px] text-slate-400 mt-1">{t("ถูกใจ/บัญชี โชว์เมื่อเปิดระบบสมาชิก · แชท โชว์เมื่อเปิดปุ่มแชท (มีปุ่มแชทในแถบแล้ว ปุ่มแชทลอยบนมือถือจะซ่อนเอง) · ไม่โชว์ในหน้าสินค้า (มีแถบใส่ตะกร้าอยู่แล้ว) และหน้าชำระเงิน", "Wishlist/Account show when membership is on · Chat shows when the chat button is on (the floating chat button hides on mobile when the bar has one) · hidden on product pages (they have an add-to-cart bar) and checkout")}</p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>{t("💬 ปุ่มแชทลอย (ช่องทางแชทตั้งที่แท็บ ข้อมูลร้าน › 💬)", "💬 Floating chat button (chat channels are set in Shop info › 💬)")}</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("สีปุ่ม", "Button color")}<Def show={chat.color === "brand"} /></p>
            <Choice<"brand" | "line" | "ink" | "white"> value={chat.color} onChange={(v) => setChat({ color: v })} options={[{ v: "brand", l: t("สีหลัก", "Brand color") }, { v: "line", l: t("เขียว LINE", "LINE green") }, { v: "ink", l: t("เข้ม", "Dark") }, { v: "white", l: t("ขาว", "White") }]} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("ทรงปุ่ม", "Button shape")}<Def show={chat.shape === "pill"} /></p>
            <Choice<"pill" | "round"> value={chat.shape} onChange={(v) => setChat({ shape: v })} options={[{ v: "pill", l: t("แคปซูล + คำ", "Pill + label") }, { v: "round", l: t("วงกลมไอคอน", "Round icon") }]} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("แสดงที่", "Show on")}<Def show={chat.where === "all"} /></p>
            <Choice<"all" | "mobile" | "desktop"> value={chat.where} onChange={(v) => setChat({ where: v })} options={[{ v: "all", l: t("ทุกจอ", "All screens") }, { v: "mobile", l: t("เฉพาะมือถือ", "Mobile only") }, { v: "desktop", l: t("เฉพาะคอม", "Desktop only") }]} />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("🔍 ค้นหาเต็มจอ — ตอนยังไม่พิมพ์", "🔍 Full-screen search — before typing")}<Def show={value.searchEmpty === "cats"} />
        </label>
        <Choice<SearchEmpty>
          value={value.searchEmpty}
          onChange={(v) => onChange({ searchEmpty: v })}
          options={[
            { v: "cats", l: t("หมวดอย่างเดียว", "Categories only"), d: t("แบบเดิม", "Original") },
            { v: "terms", l: t("+ คำยอดนิยม", "+ Popular terms"), d: t("กดแล้วค้นทันที", "Tap to search instantly") },
            { v: "prods", l: t("+ คำยอดนิยม + สินค้าแนะนำ", "+ Popular terms + recommended products"), d: t("แนะนำของร้าน → ขายดี → มาใหม่", "Shop picks → best sellers → new") },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">{t("คำยอดนิยม = คำที่ตั้งเองในแท็บ ข้อมูลร้าน › 🔍 ค้นหา + คำที่ลูกค้าค้นจริงบ่อย ๆ และหาเจอ (ระบบเติมให้เอง · ยังไม่มีข้อมูล = โชว์เฉพาะคำที่ตั้ง)", "Popular terms = terms you set in Shop info › 🔍 Search + terms customers often search and find (added automatically · no data yet = only your terms)")}</p>
        {colors && (
          <div className="mt-3">
            <PartStyleFold parts={SEARCH_PARTS} value={value.areaParts.search} onChange={(search) => onChange({ areaParts: { ...value.areaParts, search } })} colors={colors} onOpen={() => onPreview?.("/?pv=search")} hint={t("ช่องพิมพ์ · หัวข้อ · การ์ดสินค้า · ค้นหาไม่เจอ", "Search box · heading · product cards · no results")} testId="search" />
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          {t("🍪 แถบขอความยินยอมคุกกี้ (PDPA)", "🍪 Cookie consent bar (PDPA)")}<Def show={ck.layout === "card"} />
        </label>
        <Choice<CookieLayout>
          value={ck.layout}
          onChange={(v) => setCk({ layout: v })}
          options={[
            { v: "card", l: t("การ์ดล่างจอ", "Bottom card"), d: t("แบบเดิม", "Original") },
            { v: "bar", l: t("แถบเต็มความกว้าง", "Full-width bar"), d: t("ติดขอบล่าง", "Stuck to the bottom") },
            { v: "center", l: t("กล่องกลางจอ", "Center box"), d: t("พื้นหลังมืดลง", "Dims the background") },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          {ck.layout === "card" && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">{t("มุม (จอคอม)", "Corner (desktop)")}</p>
              <Choice<"left" | "right"> value={ck.side} onChange={(v) => setCk({ side: v })} options={[{ v: "left", l: t("ซ้าย (เดิม)", "Left (original)") }, { v: "right", l: t("ขวา", "Right") }]} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer self-end pb-1">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={ck.icon} onChange={(e) => setCk({ icon: e.target.checked })} />
            {t("มีรูปคุกกี้ 🍪 หน้าหัวข้อ", "Cookie icon 🍪 before the title")}
          </label>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("หัวข้อ (ว่าง = \"เว็บนี้ใช้คุกกี้\")", "Title (empty = default)")}</p>
            <LangInput className={inputCls} obj={ck} k="title" maxLength={60} placeholder="เว็บนี้ใช้คุกกี้" onPatch={(p) => setCk(p)} />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] text-slate-500 mb-1">{t("ข้อความ (ว่าง = ข้อความตั้งต้น)", "Text (empty = default)")}</p>
            <LangInput className={inputCls} obj={ck} k="text" multiline rows={2} maxLength={400} placeholder="เราใช้คุกกี้ที่จำเป็นให้เว็บทำงาน และขออนุญาตใช้คุกกี้วัดผลและโฆษณา…" onPatch={(p) => setCk(p)} />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("ปุ่ม \"เฉพาะที่จำเป็น\" อยู่ข้างปุ่ม \"ยอมรับทั้งหมด\" เสมอทุกแบบ (PDPA ให้ปฏิเสธได้ง่ายเท่ายอมรับ) · แถบนี้โผล่เมื่อใส่รหัสวัดผลในแท็บ ข้อมูลร้าน › 📊 · พรีวิวโชว์เป็นตัวอย่างตอนเปิดตัวปรับละเอียด (กดปุ่มในตัวอย่างไม่บันทึกอะไร)", "The \"Necessary only\" button always sits next to \"Accept all\" in every layout (PDPA: declining must be as easy as accepting) · the bar appears once tracking codes are set in Shop info › 📊 · the preview shows a sample while the fine-tune panel is open (clicking sample buttons saves nothing)")}</p>
        {colors && (
          <div className="mt-3">
            <PartStyleFold parts={COOKIE_PARTS} value={ck.parts} onChange={(parts) => setCk({ parts })} colors={colors} onOpen={() => onPreview?.("/?pv=cookie")} hint={t("กรอบ · ข้อความ · ปุ่ม", "Frame · text · buttons")} testId="cookie" />
          </div>
        )}
      </div>
    </DesignCard>
  );
}

/** 📄 ชุด 4 — หน้าพิเศษ (theme.page: notFound · thanks · popup · share · login · account) · เว็บร้าน NotFoundView / ThanksExtras / PromoPopup / /api/og/product / LoginShell / AccountClient */
export function SitePagesSetting({ value, onChange, shopSlug, onPreview, colors }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void; shopSlug: string; onPreview: (path: string) => void; /** สีร้าน (ตัวอย่างสีในตัวปรับละเอียด) */ colors?: SiteTheme["colors"] }) {
  const t = useT();
  const nf = value.notFound;
  const setNf = (p: Partial<SitePageDesign["notFound"]>) => onChange({ notFound: { ...nf, ...p } });
  const th = value.thanks;
  const setTh = (p: Partial<SitePageDesign["thanks"]>) => onChange({ thanks: { ...th, ...p } });
  const pp = value.popup;
  const setPp = (p: Partial<SitePageDesign["popup"]>) => onChange({ popup: { ...pp, ...p } });
  const sh = value.share;
  const setSh = (p: Partial<SitePageDesign["share"]>) => onChange({ share: { ...sh, ...p } });
  const lg = value.login;
  const setLg = (p: Partial<SitePageDesign["login"]>) => onChange({ login: { ...lg, ...p } });
  // 🎟️ คูปองที่ใช้เป็น "ของขวัญครั้งหน้า" ได้: เปิดอยู่ · ยังไม่หมดอายุ · ใช้ได้ทุกคน (ไม่ใช่เฉพาะลูกค้าใหม่/สมาชิก/ชวนเพื่อน)
  const [coupons, setCoupons] = useState<{ code: string; note: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/website/coupons?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const now = new Date().toISOString();
        const list = (Array.isArray(j?.coupons) ? j.coupons : []) as Record<string, unknown>[];
        setCoupons(
          list
            .filter((c) => c.active === true && !c.membersOnly && !c.newCustomersOnly && !c.minTier && !c.referrerId && (!c.endsAt || String(c.endsAt) >= now) && (c.usageLimit == null || Number(c.used ?? 0) < Number(c.usageLimit)))
            .map((c) => ({ code: String(c.code ?? ""), note: String(c.note ?? "") }))
            .filter((c) => c.code),
        );
      })
      .catch(() => alive && setCoupons([]));
    return () => {
      alive = false;
    };
  }, [shopSlug]);
  const pvBtn = (path: string, label: string) => (
    <button type="button" onClick={() => onPreview(path)} className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:border-slate-500">
      👁 {label}
    </button>
  );
  return (
    <div className="space-y-4">
      {/* ── 404 ── */}
      <DesignCard title={t("🧭 หน้า 404 (ไม่พบหน้า)", "🧭 404 page (not found)")} hint={<>{t("หน้าที่ลูกค้าเห็นเมื่อกดลิงก์ที่ไม่มีแล้ว · ลิงก์ที่ตั้ง \"ย้ายลิงก์\" ไว้ (ข้อมูลร้าน › 🔀) ยังพาไปหน้าใหม่ก่อนเสมอ", "What customers see on a dead link · links with a \"redirect\" set (Shop info › 🔀) still go to the new page first")}</>} right={<>{pvBtn("/zz-page-not-found", t("ดูในพรีวิว", "View in preview"))}</>}>
        <Choice<"plain" | "image" | "big">
          value={nf.style}
          onChange={(v) => setNf({ style: v })}
          options={[
            { v: "plain", l: t("ไอคอน + ข้อความ", "Icon + text"), d: t("แบบเดิม", "Original") },
            { v: "image", l: t("รูปใหญ่ + ข้อความ", "Large image + text"), d: t("ใช้รูปของร้าน", "Uses your image") },
            { v: "big", l: t("ตัวเลข 404 ใหญ่", "Big 404 number"), d: t("แบบแบรนด์", "Brand style") },
          ]}
        />
        {nf.style === "image" && (
          <div className="mt-2 max-w-xs">
            <ImageInput value={nf.imageKey} onChange={(k) => setNf({ imageKey: k ?? "" })} folder="website-pages" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("หัวข้อ (ว่าง = \"ไม่พบหน้านี้\")", "Title (empty = default)")}</p>
            <LangInput className={inputCls} obj={nf} k="title" maxLength={80} placeholder="ไม่พบหน้านี้" onPatch={(p) => setNf(p)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("ข้อความ (ว่าง = ข้อความตั้งต้น)", "Text (empty = default)")}</p>
            <LangInput className={inputCls} obj={nf} k="text" maxLength={240} placeholder="ลิงก์อาจเปลี่ยนไปหรือหน้านี้ถูกย้ายแล้ว" onPatch={(p) => setNf(p)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nf.search} onChange={(e) => setNf({ search: e.target.checked })} />
            {t("ช่องค้นหาในหน้า", "Search box on the page")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nf.products} onChange={(e) => setNf({ products: e.target.checked })} />
            {t("สินค้าแนะนำ 4 ชิ้น (แนะนำของร้าน → ขายดี → มาใหม่)", "4 recommended products (shop picks → best sellers → new)")}
          </label>
        </div>
        {colors && (
          <div className="mt-3">
            <PartStyleFold parts={NF_PARTS} value={nf.parts} onChange={(parts) => setNf({ parts })} colors={colors} onOpen={() => onPreview("/zz-page-not-found")} hint={t("404 · หัวข้อ · ปุ่ม · ช่องค้นหา", "404 · title · button · search box")} testId="notfound" />
          </div>
        )}
      </DesignCard>

      {/* ── หน้าขอบคุณ ── */}
      <DesignCard title={t("🎉 หน้าขอบคุณหลังสั่งซื้อ", "🎉 Thank-you page after order")} hint={t("หัวข้อ/ข้อความของหน้านี้ตั้งที่แท็บ 💳 หน้าชำระเงิน · ที่นี่: ไอคอน/ลูกเล่น · รูปสินค้า · 2 คอลัมน์ · ขั้นตอนถัดไป · ข้อความจากร้าน · ของเสริม", "Title/text of this page is set in the 💳 Checkout tab · here: icon/effects · product images · 2 columns · next steps · shop message · extras")} right={<>{pvBtn("/checkout?pv=thanks", t("ดูในพรีวิว", "View in preview"))}</>}>
        <label className={labelCls}>{t("ด้านบนการ์ด", "Top of card")}<Def show={th.top === "emoji"} /></label>
        <Choice<"emoji" | "image" | "none"> value={th.top} onChange={(v) => setTh({ top: v })} options={[{ v: "emoji", l: t("ไอคอน", "Icon") }, { v: "image", l: t("รูปแบนเนอร์", "Banner image") }, { v: "none", l: t("ไม่มี", "None") }]} />
        {th.top === "emoji" && (
          <div className="mt-2">
            <Choice<ThanksIcon>
              value={th.icon}
              onChange={(v) => setTh({ icon: v })}
              options={[
                { v: "party", l: t("ปาร์ตี้", "Party"), d: t("แบบเดิม", "Original") },
                { v: "check", l: t("ติ๊กถูกในวง", "Check in circle") },
                { v: "heart", l: t("หัวใจ", "Heart") },
                { v: "gift", l: t("กล่องของขวัญ", "Gift box") },
              ]}
            />
            <p className="text-[11px] text-slate-400 mt-1">{t("ไอคอนเส้นใช้สีหลักของร้าน · ปรับขนาด/สีละเอียดได้ที่ชิ้น “ไอคอนด้านบน” ในตัวปรับละเอียดด้านล่าง", "Line icons use the brand color · fine-tune size/color at “Top icon” in the fine-tune panel below")}</p>
          </div>
        )}
        <label className={`${labelCls} mt-3`}>
          {t("ลูกเล่นตอนเปิดหน้า", "Page open effect")}<Def show={th.anim === "none"} />
        </label>
        <Choice<ThanksAnim>
          value={th.anim}
          onChange={(v) => setTh({ anim: v })}
          options={[
            { v: "none", l: t("ไม่มี", "None") },
            { v: "confetti", l: t("กระดาษสีพุ่ง", "Confetti burst"), d: t("ฉลองแบบสนุก", "Fun celebration") },
            { v: "hearts", l: t("หัวใจลอย", "Floating hearts"), d: t("สีหลักร้าน", "Brand color") },
            { v: "sparkle", l: t("ประกายวิบวับ", "Sparkles"), d: t("เรียบหรู", "Elegant") },
            { v: "pop", l: t("ไอคอนเด้ง", "Icon pop"), d: t("เบาที่สุด", "Lightest") },
            { v: "check", l: t("ติ๊กถูกวาดเอง", "Self-drawing check"), d: t("แทนไอคอน", "Replaces the icon") },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">
          {t("เล่นครั้งเดียวตอนหน้าขึ้น (1–3 วินาที) แล้วหายไป ไม่บังปุ่ม · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว = ไม่เล่น · เปลี่ยนแบบแล้วพรีวิวเล่นให้ดูทันที", "Plays once when the page opens (1–3 seconds) then disappears, never blocks buttons · reduced motion on the device = no play · the preview replays when you change it")}
          {(th.anim === "pop" || th.anim === "check") && th.top !== "emoji" && <span className="text-amber-700"> {t("· ⚠️ แบบนี้ใช้กับ “ด้านบนการ์ด = ไอคอน” เท่านั้น", "· ⚠️ Only works with “Top of card = Icon”")}</span>}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              {t("รูปสินค้าในสรุปรายการ", "Product images in order summary")}<Def show={th.items === "none"} />
            </label>
            <Choice<"none" | "thumb" | "grid">
              value={th.items}
              onChange={(v) => setTh({ items: v })}
              options={[
                { v: "none", l: t("ไม่มี", "None") },
                { v: "thumb", l: t("รูปเล็ก + ชื่อ", "Small image + name"), d: t("แนะนำ", "Recommended") },
                { v: "grid", l: t("การ์ดรูปใหญ่", "Large image cards") },
              ]}
            />
          </div>
          <div>
            <label className={labelCls}>
              {t("เค้าโครงจอคอม", "Desktop layout")}<Def show={th.layout === "one"} />
            </label>
            <Choice<"one" | "two">
              value={th.layout}
              onChange={(v) => setTh({ layout: v })}
              options={[
                { v: "one", l: t("คอลัมน์เดียว", "Single column") },
                { v: "two", l: t("2 คอลัมน์", "2 columns"), d: t("ซ้ายวิธีจ่าย · ขวาสรุปรายการ", "Payment on the left · summary on the right") },
              ]}
            />
            <p className="text-[11px] text-slate-400 mt-1">{t("มือถือเรียงลงมาเหมือนเดิมเสมอ", "Mobile always stacks as before")}</p>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={th.steps} onChange={(e) => setTh({ steps: e.target.checked })} />
          {t("แถบขั้นตอนถัดไป (สั่งแล้ว → ร้านแพ็กของ → จัดส่ง → ได้รับของ)", "Next-steps bar (ordered → packing → shipping → delivered)")}
        </label>
        <p className="text-[11px] text-slate-400 ml-6">{t("จ่ายพร้อมเพย์ที่ยังไม่โอน = มีขั้น “โอนเงิน” เพิ่มให้เอง", "Unpaid PromptPay orders get an extra “Transfer” step automatically")}</p>
        <div className="mt-3">
          <LangText label={t("ข้อความจากร้าน ({shop} = ชื่อร้าน · ว่าง = ไม่มีกล่อง)", "Shop message ({shop} = shop name · empty = no box)")} obj={th} k="note" onPatch={(p) => setTh(p as Partial<SitePageDesign["thanks"]>)} max={300} placeholder="เช่น ร้านจะแพ็กของภายใน 1–2 วัน และส่งเลขพัสดุทาง SMS" enPlaceholder="e.g. We'll pack your order within 1–2 days and text you the tracking number" />
        </div>
        {/* ช่องรูปของกลางเว็บ = มีปุ่ม 🔗 ใช้ชุดรูป (เปลี่ยนรูปทีเดียวหลายที่) */}
        {th.top === "image" && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ImageUploadField label={t("รูปแบนเนอร์ (คอม)", "Banner image (desktop)")} hint={t("แนวนอน 3:1", "Landscape 3:1")} value={th.imageKey} onChange={(k) => setTh({ imageKey: k })} height={80} />
            <ImageUploadField label={t("รูปมือถือ", "Mobile image")} hint={t("ไม่ใส่ = ใช้รูปคอม", "Empty = use desktop image")} value={th.mobileImageKey} onChange={(k) => setTh({ mobileImageKey: k })} height={80} />
            <div className="sm:col-span-2">
              <p className="text-[11px] text-slate-500 mb-1">{t("กดแบนเนอร์แล้วไปที่ (ว่าง = กดไม่ได้)", "Banner link (empty = not clickable)")}</p>
              <input className={inputCls} value={th.link} maxLength={500} placeholder={t("/c/new-arrival หรือ https://…", "/c/new-arrival or https://…")} onChange={(e) => setTh({ link: e.target.value })} />
              {th.link && !/^(\/(?!\/)|https?:\/\/)/i.test(th.link.trim()) && <p className="text-[11px] text-red-600 mt-1">{t("ต้องขึ้นต้นด้วย / (หน้าในเว็บ) หรือ https://", "Must start with / (site page) or https://")}</p>}
            </div>
          </div>
        )}
        <div className="mt-3">
          <label className={labelCls}>{t("🎟️ คูปองครั้งหน้า", "🎟️ Next-order coupon")}</label>
          <select className={inputCls} value={th.coupon} onChange={(e) => setTh({ coupon: e.target.value })}>
            <option value="">{t("ไม่โชว์ (แบบเดิม)", "Don't show (original)")}</option>
            {th.coupon && !(coupons ?? []).some((c) => c.code === th.coupon) && <option value={th.coupon}>{th.coupon} {t("(ตอนนี้ใช้ไม่ได้ — ลูกค้าจะไม่เห็น)", "(not usable now — customers won't see it)")}</option>}
            {(coupons ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.note ? ` · ${c.note}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{coupons === null ? t("กำลังโหลดคูปอง…", "Loading coupons…") : coupons.length ? t("เลือกได้เฉพาะคูปองที่เปิดอยู่ ยังไม่หมดอายุ และใช้ได้ทุกคน · คูปองปิด/หมดอายุ/ใช้ครบ ระบบซ่อนให้เอง", "Only active, unexpired coupons open to everyone can be picked · off/expired/used-up coupons are hidden automatically") : t("ยังไม่มีคูปองที่ใช้ได้ทุกคน — สร้างได้ที่แท็บ 🎟️ คูปอง", "No coupons open to everyone yet — create one in the 🎟️ Coupons tab")}</p>
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={th.follow} onChange={(e) => setTh({ follow: e.target.checked })} />
            {t("❤️ ปุ่มติดตามโซเชียลของร้าน (จากข้อมูลร้าน)", "❤️ Shop social follow buttons (from Shop info)")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={th.products} onChange={(e) => setTh({ products: e.target.checked })} />
            {t("⭐ สินค้าแนะนำ 4 ชิ้นใต้การ์ด", "⭐ 4 recommended products under the card")}
          </label>
        </div>
        {colors && (
          <div className="mt-3">
            <PartStyleFold parts={THANKS_PARTS} value={th.parts} onChange={(parts) => setTh({ parts })} colors={colors} onOpen={() => onPreview("/checkout?pv=thanks")} hint={t("หัวข้อ · ไอคอน · เลขออเดอร์ · ขั้นตอน · ข้อความจากร้าน · รายการสินค้า · คูปอง · โซเชียล", "Title · icon · order no. · steps · shop message · items · coupon · social")} testId="thanks" />
          </div>
        )}
      </DesignCard>

      {/* ── ป๊อปอัป ── */}
      <DesignCard title={t("🎁 ป๊อปอัปรับส่วนลด", "🎁 Discount popup")} hint={t("เปิด/โค้ด/ข้อความ/วินาที ตั้งที่แท็บ ข้อมูลร้าน › 🎁 · ที่นี่ตั้งหน้าตาและจังหวะ · ตัวอย่างในพรีวิวไม่ส่งอีเมลจริง", "On/code/text/seconds are set in Shop info › 🎁 · here you set the look and timing · the preview sample sends no real email")} right={<>{pvBtn("/?pv=popup", t("ดูตัวอย่าง", "Preview"))}</>}>
        <Choice<"center" | "split" | "sheet" | "corner">
          value={pp.layout}
          onChange={(v) => setPp({ layout: v })}
          options={[
            { v: "center", l: t("กล่องกลางจอ", "Center box"), d: t("แบบเดิม", "Original") },
            { v: "split", l: t("รูปซ้าย ข้อความขวา", "Image left, text right"), d: t("ต้องใส่รูป", "Needs an image") },
            { v: "sheet", l: t("แผ่นเลื่อนจากล่าง", "Bottom sheet"), d: t("เหมาะกับมือถือ", "Good for mobile") },
            { v: "corner", l: t("กล่องเล็กมุมขวาล่าง", "Small box, bottom right"), d: t("ไม่บังหน้าเว็บ", "Doesn't cover the page") },
          ]}
        />
        <div className="mt-2 max-w-xs">
          <p className="text-[11px] text-slate-500 mb-1">{t("รูปในป๊อปอัป (ไม่ใส่ = ไอคอน 🎁)", "Popup image (empty = 🎁 icon)")}</p>
          <ImageUploadField label={t("รูปป๊อปอัป", "Popup image")} value={pp.imageKey} onChange={(k) => setPp({ imageKey: k })} height={80} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <label className={labelCls}>{t("โผล่เมื่อ", "Show when")}<Def show={pp.trigger === "delay"} /></label>
            <Choice<"delay" | "scroll" | "exit"> value={pp.trigger} onChange={(v) => setPp({ trigger: v })} options={[{ v: "delay", l: t("หลังเข้าเว็บ X วิ", "X sec after arrival") }, { v: "scroll", l: t("เลื่อนถึงครึ่งหน้า", "Scrolled halfway") }, { v: "exit", l: t("กำลังจะออก (คอม)", "About to leave (desktop)") }]} />
            <p className="text-[11px] text-slate-400 mt-1">{t("\"กำลังจะออก\" = เมาส์ขยับออกนอกหน้าเว็บ · มือถือใช้ \"เลื่อนถึงครึ่งหน้า\" แทน", "\"About to leave\" = mouse moves off the page · mobile uses \"Scrolled halfway\" instead")}</p>
          </div>
          <div>
            <label className={labelCls}>{t("โผล่ซ้ำ", "Show again")}<Def show={pp.again === "once"} /></label>
            <Choice<"once" | "7d"> value={pp.again} onChange={(v) => setPp({ again: v })} options={[{ v: "once", l: t("ครั้งเดียว", "Once") }, { v: "7d", l: t("ทุก 7 วัน ถ้ายังไม่รับโค้ด", "Every 7 days if code not claimed") }]} />
          </div>
        </div>
        {colors && (
          <div className="mt-3">
            <PartStyleFold parts={POPUP_PARTS} value={pp.parts} onChange={(parts) => setPp({ parts })} colors={colors} onOpen={() => onPreview("/?pv=popup")} hint={t("กรอบ · หัวข้อ · ช่องกรอก · ปุ่ม · โค้ด", "Frame · title · input · button · code")} testId="popup" />
          </div>
        )}
      </DesignCard>

      {/* ── รูปตอนแชร์ ── */}
      <DesignCard title={t("🖼 รูปตอนแชร์ลิงก์สินค้า (Facebook · LINE)", "🖼 Product link share image (Facebook · LINE)")} hint={t("แบบการ์ด/กรอบ = ระบบวาดรูปใหม่ให้สินค้าทุกตัวเอง · แอปแชทอาจจำรูปเก่าไว้สักพัก (ลิงก์ที่แชร์ใหม่ได้รูปใหม่)", "Card/frame = the system draws a new image for every product · chat apps may cache the old image for a while (newly shared links get the new one)")}>
        <Choice<"photo" | "card" | "frame">
          value={sh.style}
          onChange={(v) => setSh({ style: v })}
          options={[
            { v: "photo", l: t("รูปสินค้ารูปแรก", "First product image"), d: t("แบบเดิม", "Original") },
            { v: "card", l: t("การ์ด", "Card"), d: t("รูป + ชื่อ + ราคา + โลโก้", "Image + name + price + logo") },
            { v: "frame", l: t("รูป + แถบโลโก้", "Image + logo bar"), d: t("แถบโลโก้/ราคาด้านล่าง", "Logo/price bar at the bottom") },
          ]}
        />
        {sh.style !== "photo" && (
          <div className="mt-2">
            <p className="text-[11px] text-slate-500 mb-1">{t("สีพื้นการ์ด/แถบ", "Card/bar background")}</p>
            <Choice<"paper" | "brand" | "ink"> value={sh.bg} onChange={(v) => setSh({ bg: v })} options={[{ v: "paper", l: t("สีพื้นเว็บ", "Site background") }, { v: "brand", l: t("สีหลัก", "Brand color") }, { v: "ink", l: t("เข้ม", "Dark") }]} />
          </div>
        )}
      </DesignCard>

      {/* ── หน้าเข้าสู่ระบบ ── */}
      <DesignCard title={t("👤 หน้าเข้าสู่ระบบ / สมัครสมาชิก", "👤 Login / sign-up page")} hint={t("ลูกค้าเห็นเมื่อเปิดระบบสมาชิก (แท็บ 👥 สมาชิก)", "Customers see it when membership is on (👥 Members tab)")} right={<>{pvBtn("/account/login", t("ดูในพรีวิว", "View in preview"))}</>}>
        <Choice<"center" | "split" | "cover">
          value={lg.layout}
          onChange={(v) => setLg({ layout: v })}
          options={[
            { v: "center", l: t("กล่องกลาง", "Center box"), d: t("แบบเดิม", "Original") },
            { v: "split", l: t("รูปซ้าย ฟอร์มขวา", "Image left, form right") },
            { v: "cover", l: t("รูปพื้นหลังเต็มจอ", "Full-screen background image") },
          ]}
        />
        {lg.layout !== "center" && (
          <div className="mt-2 max-w-xs">
            <ImageInput value={lg.imageKey} onChange={(k) => setLg({ imageKey: k ?? "" })} folder="website-pages" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("หัวข้อต้อนรับ (ว่าง = \"เข้าสู่ระบบ / สมัครสมาชิก\")", "Welcome title (empty = default)")}</p>
            <LangInput className={inputCls} obj={lg} k="title" maxLength={80} placeholder="ยินดีต้อนรับสู่ …" onPatch={(p) => setLg(p)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">{t("ข้อความ (ว่าง = ข้อความตั้งต้น)", "Text (empty = default)")}</p>
            <LangInput className={inputCls} obj={lg} k="text" maxLength={240} placeholder="สะสมแต้มทุกออเดอร์ · รับสิทธิ์ก่อนใคร" onPatch={(p) => setLg(p)} />
          </div>
        </div>
        {/* 💬 ป๊อปสมัคร + ปุ่มสมัครบนหัวเว็บ + 🎨 ปรับละเอียด (ชุดปรับหน้าตาชิ้นส่วน — ของกลาง) */}
        {colors && <LoginExtraSetting value={lg} onChange={(p) => setLg(p)} colors={colors} onPreview={onPreview} />}
      </DesignCard>

      {/* ── หน้าบัญชีของฉัน (ชุดปรับหน้าตาละเอียด — ของกลาง) ── */}
      {colors && (
        <DesignCard title={t("🧑 หน้าบัญชีของฉัน", "🧑 My account page")} hint={t("หน้าที่สมาชิกเห็นหลังเข้าสู่ระบบ · พรีวิวใช้ข้อมูลตัวอย่าง (ไม่ต้องล็อกอิน) · ไม่ตั้ง = หน้าตาเดิม", "What members see after login · the preview uses sample data (no login needed) · not set = original look")} right={<>{pvBtn("/account", t("ดูในพรีวิว (ข้อมูลตัวอย่าง)", "View in preview (sample data)"))}</>}>
          <AccountPageSetting value={value.account} onChange={(account) => onChange({ account })} colors={colors} onPreview={onPreview} />
        </DesignCard>
      )}
    </div>
  );
}

const festiveChoices = (): { v: FestiveKind; l: string; d?: string }[] => [
  { v: "none", l: tr("ไม่มี", "None"), d: tr("แบบเดิม", "Original") },
  { v: "snow", l: tr("❄️ หิมะ", "❄️ Snow"), d: tr("คริสต์มาส/ปีใหม่", "Christmas/New Year") },
  { v: "petals", l: tr("🌸 กลีบดอกไม้", "🌸 Petals"), d: tr("วาเลนไทน์/ฤดูใบไม้ผลิ", "Valentine's/spring") },
  { v: "confetti", l: tr("🎊 กระดาษสี", "🎊 Confetti"), d: tr("ฉลอง/เซลใหญ่", "Celebration/big sale") },
  { v: "hearts", l: tr("❤️ หัวใจ", "❤️ Hearts"), d: tr("วาเลนไทน์/วันแม่", "Valentine's/Mother's Day") },
  { v: "water", l: tr("💧 หยดน้ำ", "💧 Water drops"), d: tr("สงกรานต์", "Songkran") },
  { v: "leaves", l: tr("🍂 ใบไม้", "🍂 Leaves"), d: tr("หน้าหนาว", "Winter") },
  { v: "stars", l: tr("✨ ประกาย", "✨ Sparkles"), d: tr("เปิดตัวสินค้า", "Product launch") },
  { v: "lantern", l: tr("🏮 โคมแดงห้อย", "🏮 Hanging red lanterns"), d: tr("ตรุษจีน · ห้อยใต้หัวเว็บ", "Chinese New Year · hangs under the header") },
  { v: "flags", l: tr("🚩 ธงราวห้อย", "🚩 Hanging bunting"), d: tr("งานเทศกาล · ห้อยใต้หัวเว็บ", "Festival · hangs under the header") },
];

/** 🎄 ของตกแต่งเทศกาล (ชุด 5 · theme.page.festive) — เว็บร้าน components/layout/FestiveDecor */
export function FestiveSetting({ value, onChange }: { value: FestiveLook; onChange: (v: FestiveLook) => void }) {
  const t = useT();
  const set = (p: Partial<FestiveLook>) => onChange({ ...value, ...p });
  const hanging = FESTIVE_HANGING.includes(value.kind);
  return (
    <div className="space-y-3">
      <Choice<FestiveKind> value={value.kind} onChange={(kind) => set({ kind })} options={festiveChoices()} />
      {value.kind !== "none" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{hanging ? t("จำนวนที่ห้อย", "Number hanging") : t("ปริมาณที่โปรย", "Amount falling")}<Def show={value.amount === "some"} /></label>
            <Choice<"few" | "some" | "many"> value={value.amount} onChange={(amount) => set({ amount })} options={[{ v: "few", l: t("น้อย", "Few") }, { v: "some", l: t("กลาง", "Medium") }, { v: "many", l: t("มาก", "Many") }]} />
          </div>
          <div>
            <label className={labelCls}>{t("โชว์ที่", "Show on")}<Def show={value.where === "home"} /></label>
            <Choice<"home" | "all"> value={value.where} onChange={(where) => set({ where })} options={[{ v: "home", l: t("หน้าแรก", "Home") }, { v: "all", l: t("ทุกหน้า", "All pages") }]} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer sm:col-span-2">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.mobile} onChange={(e) => set({ mobile: e.target.checked })} />
            {t("โชว์บนมือถือด้วย", "Also show on mobile")}
          </label>
        </div>
      )}
      <p className="text-[11px] text-slate-400">{t("ไม่บังปุ่ม (กดทะลุได้) · ไม่ขึ้นหน้าตะกร้า/ชำระเงิน · เครื่องที่ตั้ง \"ลดการเคลื่อนไหว\" ไม่เห็นของที่โปรย · แบบห้อยอยู่ใต้หัวเว็บ เลื่อนจอแล้วหายไปกับหน้า", "Never blocks buttons (click-through) · not on cart/checkout · devices with \"reduce motion\" don't see falling items · hanging styles sit under the header and scroll away with the page")}</p>
    </div>
  );
}

/** 👀 ป้ายคนดู / 🔥 ขายแล้ว (ชุด 5 · theme.page.proof) — ตัวเลขจริงจาก ERP (lib/website-proof-db) · เว็บร้าน ProofBadges */
export function ProofSetting({ value, onChange }: { value: ProofLook; onChange: (v: ProofLook) => void }) {
  const t = useT();
  const set = (p: Partial<ProofLook>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-4">
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-800 font-medium cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.viewers} onChange={(e) => set({ viewers: e.target.checked })} />
          {t("👀 ป้ายคนดู — \"วันนี้มี N คนดูสินค้านี้\"", "👀 Viewers badge — \"N people viewed this today\"")}
        </label>
        <p className="text-[11px] text-slate-400 ml-6">{t("นับ 1 เครื่องต่อสินค้าต่อวัน (เวลาไทย) · เริ่มนับตั้งแต่เปิดใช้ชุดนี้", "Counts 1 device per product per day (Thai time) · counting starts when this is turned on")}</p>
        {value.viewers && (
          <div className="ml-6 mt-2 max-w-sm">
            <p className="text-[11px] text-slate-500 mb-1">{t("โชว์เมื่อมีคนดูอย่างน้อย", "Show when viewers are at least")}</p>
            <RangeInput value={value.viewersMin} onChange={(n) => set({ viewersMin: n })} min={1} max={50} hardMax={100} unit={t(" คน", " people")} ariaLabel={t("ขั้นต่ำคนดู", "Minimum viewers")} />
          </div>
        )}
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-800 font-medium cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.sold} onChange={(e) => set({ sold: e.target.checked })} />
          {t("🔥 ป้ายขายแล้ว — \"ขายแล้ว N ชิ้น\"", "🔥 Sold badge — \"N sold\"")}
        </label>
        {value.sold && (
          <div className="ml-6 mt-2 space-y-3">
            <div className="max-w-sm">
              <p className="text-[11px] text-slate-500 mb-1">{t("โชว์เมื่อขายได้อย่างน้อย", "Show when sold at least")}</p>
              <RangeInput value={value.soldMin} onChange={(n) => set({ soldMin: n })} min={1} max={200} hardMax={1000} unit={t(" ชิ้น", " pcs")} ariaLabel={t("ขั้นต่ำยอดขาย", "Minimum sold")} />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">{t("นับยอดจาก", "Count sales from")}<Def show={value.soldSource === "web"} /></p>
              <Choice<"web" | "all">
                value={value.soldSource}
                onChange={(soldSource) => set({ soldSource })}
                options={[
                  { v: "web", l: t("ออเดอร์บนเว็บ", "Web orders"), d: t("ตรงกับที่ลูกค้าเห็นที่สุด", "Closest to what customers see") },
                  { v: "all", l: t("เว็บ + ใบสั่งขาย ERP", "Web + ERP sales orders"), d: t("รวมขายส่ง/OEM ตัวเลขอาจสูง", "Includes wholesale/OEM, numbers may be high") },
                ]}
              />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">{t("ช่วงเวลา", "Period")}<Def show={value.soldPeriod === "30d"} /></p>
              <Choice<"30d" | "all"> value={value.soldPeriod} onChange={(soldPeriod) => set({ soldPeriod })} options={[{ v: "30d", l: t("30 วันล่าสุด", "Last 30 days"), d: t("ขึ้นว่า \"ใน 30 วัน\"", "Shows \"in 30 days\"") }, { v: "all", l: t("ทั้งหมด", "All") }]} />
            </div>
          </div>
        )}
      </div>
      {(value.viewers || value.sold) && (
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.onCard} onChange={(e) => set({ onCard: e.target.checked })} />
          {t("โชว์บนการ์ดสินค้าด้วย (ปกติ = หน้าสินค้าอย่างเดียว)", "Also show on product cards (default = product page only)")}
        </label>
      )}
      <p className="text-[11px] text-slate-400">{t("ตัวเลขจริงจากระบบเท่านั้น ไม่สุ่ม ไม่บวกเพิ่ม · ต่ำกว่าขั้นต่ำ = ป้ายซ่อนเอง · ตัวเลขอัปเดตทุก ~1 นาที · ในพรีวิว ถ้ายังไม่มีตัวเลขจริงจะโชว์ตัวเลข \"ตัวอย่าง\" ให้เห็นหน้าตา (ลูกค้าไม่เห็น)", "Real numbers from the system only, never random or padded · below the minimum = badge hides · numbers update every ~1 minute · in the preview, sample numbers show when there is no real data yet (customers don't see them)")}</p>
    </div>
  );
}
