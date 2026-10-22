"use client";

/**
 * 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1) — ตั้งครั้งเดียว ทุกหน้า/ทุก Section เปลี่ยนตาม
 * ค่าเก็บที่ theme.page / theme.shape / theme.header.iconStyle (lib/website-site-design · มิเรอร์เว็บร้าน src/lib/site-design.ts)
 * เว็บร้านวาดเป็น CSS ที่ src/lib/site-design-css.ts · ค่าเริ่มต้นทุกตัว = หน้าตาเดิม
 */
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";
import { RangeInput } from "@/components/range-input";
import { LangInput } from "@/components/bilingual-field";
import {
  DEFAULT_SITE_PAGE,
  DEFAULT_SITE_SHAPE,
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
  type HeaderIconStyle,
  type InputStyle,
  type IntroStyle,
  type LinkHover,
  type MobileNavItem,
  type MotionSpeed,
  type PriceFormat,
  type SearchEmpty,
  type SectionEntrance,
  type SiteDensity,
  type SitePageDesign,
  type SiteShapeDesign,
  type SiteTexture,
  type SiteWidth,
} from "@/lib/website-site-design";

type Colors = { brand: string; ink: string; page: string; onBrand: string };

const cardCls = "rounded-2xl border border-slate-200 bg-white p-4";
const labelCls = "block text-xs font-medium text-slate-600 mb-1.5";

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

const Def = ({ show }: { show: boolean }) => (show ? <span className="ml-1 text-[10px] text-slate-400">(แบบเดิม)</span> : null);

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
  const d = DEFAULT_SITE_PAGE;
  return (
    <div className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">🧱 พื้นที่ · พื้นหลัง · มือถือ (ทั้งเว็บ)</h3>
      <p className="text-xs text-slate-500 mb-3">ตั้งครั้งเดียว ทุกหน้าเปลี่ยนตาม · ค่าที่มีป้าย &quot;แบบเดิม&quot; คือหน้าตาก่อนมีตัวเลือกนี้</p>

      <label className={labelCls}>ความโปร่งของทั้งหน้า</label>
      <Choice<SiteDensity>
        value={value.density}
        onChange={(v) => onChange({ density: v })}
        options={[
          { v: "dense", l: "แน่น", d: "Section ชิดกันขึ้น เห็นของเยอะในจอเดียว", pv: <DensityPv gap={1} /> },
          { v: "normal", l: "ปกติ", d: "ระยะห่างแบบเดิม", pv: <DensityPv gap={3} /> },
          { v: "airy", l: "โล่งแบบแบรนด์หรู", d: "เว้นที่ว่างมากขึ้น ดูแพงขึ้น", pv: <DensityPv gap={6} /> },
        ]}
      />
      <p className="text-[11px] text-slate-400 mt-1 mb-3">ปรับระยะบน-ล่างของทุก Section ที่ใช้ระยะ &quot;ตามเดิม&quot; · Section ที่ตั้งระยะห่างเองคงค่าที่ตั้งไว้</p>

      <label className={labelCls}>ความกว้างของเนื้อหา</label>
      <Choice<SiteWidth>
        value={value.width}
        onChange={(v) => onChange({ width: v })}
        options={[
          { v: "narrow", l: "แคบ", d: "1,080px · อ่านง่าย แบบนิตยสาร", pv: <WidthPv pct={62} /> },
          { v: "normal", l: "ปกติ", d: "1,240px (แบบเดิม)", pv: <WidthPv pct={76} /> },
          { v: "wide", l: "กว้าง", d: "1,440px · จอใหญ่เห็นสินค้าเยอะ", pv: <WidthPv pct={90} /> },
          { v: "full", l: "เต็มจอ", d: "ยาวสุดขอบจอ (เว้นขอบข้างเล็กน้อย)", pv: <WidthPv pct={100} /> },
        ]}
      />

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>ผิวพื้นหลัง</label>
        <Choice<SiteTexture>
          value={value.texture}
          onChange={(v) => onChange({ texture: v })}
          options={[
            { v: "none", l: "เรียบ", d: "แบบเดิม", pv: <TexturePv kind="none" page={colors.page} /> },
            { v: "paper", l: "ผิวกระดาษ", d: "เม็ดละเอียดโทนอุ่นบนพื้นหลัง", pv: <TexturePv kind="paper" page={colors.page} /> },
            { v: "grain", l: "เกรนฟิล์ม", d: "เม็ดฟิล์มบาง ๆ ทับทั้งจอ แบบนิตยสาร", pv: <TexturePv kind="grain" page={colors.page} /> },
          ]}
        />
        {value.texture !== "none" && (
          <div className="mt-2 max-w-sm">
            <label className={labelCls}>ความเข้มของลาย</label>
            <RangeInput value={value.textureStrength} onChange={(n) => onChange({ textureStrength: n })} min={TEXTURE_STRENGTH_RANGE.min} max={TEXTURE_STRENGTH_RANGE.max} step={5} unit="%" ariaLabel="ความเข้มของลาย" />
            <p className="text-[11px] text-slate-400 mt-1">{value.texture === "paper" ? "Section ที่ตั้งสีพื้นเองจะไม่มีลาย (ลายอยู่บนพื้นหลังเว็บ)" : "ทับทั้งจอรวมรูป · ไม่บังการกด"}</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            ขนาดตัวอักษรบนมือถือ (ทั้งเว็บ)
            <Def show={value.mobileScale === d.mobileScale} />
          </label>
          <RangeInput value={value.mobileScale} onChange={(n) => onChange({ mobileScale: n })} min={MOBILE_SCALE_RANGE.min} max={MOBILE_SCALE_RANGE.max} step={5} unit="%" ariaLabel="ขนาดตัวอักษรบนมือถือ" />
          <p className="text-[11px] text-slate-400 mt-1">100% = เดิม · ขยายตัวอักษรและระยะห่างทั้งหน้าบนจอมือถือ (คอมไม่เปลี่ยน) · ทำงานคู่กับขนาดรายบทบาทในแท็บตัวอักษร</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer self-start mt-5">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-blue-600" checked={value.bigTap} onChange={(e) => onChange({ bigTap: e.target.checked })} />
          <span>
            ปุ่ม/ช่องกรอกใหญ่ขึ้นบนมือถือ
            <span className="block text-[11px] text-slate-400">สูงอย่างน้อย 48px ให้นิ้วกดง่าย (เหมาะกับลูกค้าผู้ใหญ่)</span>
          </span>
        </label>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>รูปแบบราคา (ทุกจุดในเว็บ)</label>
        <Choice<PriceFormat>
          value={value.priceFormat}
          onChange={(v) => onChange({ priceFormat: v })}
          options={(["baht", "word", "dash", "thb"] as const).map((f) => ({
            v: f,
            l: formatMoneyAs(1090, f),
            d: f === "baht" ? "แบบเดิม" : f === "word" ? "หน้าอังกฤษ = 1,090 THB" : f === "dash" ? "แบบป้ายราคาร้าน" : "แบบสากล",
          }))}
        />
        <p className="text-[11px] text-slate-400 mt-1">ใช้กับการ์ด หน้าสินค้า ตะกร้า ชำระเงิน · ข้อความโปรที่คิดจากระบบโปร/ค่าส่ง ยังเขียนแบบ ฿ ตามเดิม</p>
      </div>
    </div>
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
  const d = DEFAULT_SITE_SHAPE;
  return (
    <div className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">🔘 ปุ่ม · ลิงก์ · ช่องกรอก (ทั้งเว็บ)</h3>
      <p className="text-xs text-slate-500 mb-3">ทรงปุ่ม/ขนาดปุ่มตั้งในกล่องด้านล่าง · ตัวอย่างในแต่ละตัวเลือก เอาเมาส์ชี้ดูลูกเล่นได้</p>

      <label className={labelCls}>
        แบบปุ่มใน Section<Def show={value.buttonKind === d.buttonKind} />
      </label>
      <Choice<ButtonKind>
        value={value.buttonKind}
        onChange={(v) => onChange({ buttonKind: v })}
        options={[
          { v: "fill", l: "ทึบ", d: "พื้นสีหลัก (แบบเดิม)", pv: <BtnPv kind="fill" colors={colors} /> },
          { v: "outline", l: "ขอบ", d: "โปร่ง มีเส้นขอบ · ชี้แล้วเติมสี", pv: <BtnPv kind="outline" colors={colors} /> },
          { v: "under", l: "เส้นใต้", d: "ตัวหนังสือ + เส้นใต้ แบบแบรนด์หรู", pv: <BtnPv kind="under" colors={colors} /> },
        ]}
      />
      <p className="text-[11px] text-slate-400 mt-1 mb-3">ใช้กับปุ่มในหน้าแรก/หน้าเว็บ · ปุ่มใส่ตะกร้า ตะกร้า และชำระเงิน คงแบบทึบเสมอ (เห็นชัด กดง่าย) · ปุ่มที่ตั้งสีเองใน Section คงสีที่ตั้ง</p>

      <label className={labelCls}>
        ปุ่มตอนชี้เมาส์<Def show={value.buttonHover === d.buttonHover} />
      </label>
      <Choice<ButtonHover>
        value={value.buttonHover}
        onChange={(v) => onChange({ buttonHover: v })}
        options={[
          { v: "auto", l: "แบบเดิม", d: "สีเข้มขึ้นนิด", pv: <BtnPv kind="fill" colors={colors} /> },
          { v: "fill", l: "สีเลื่อนเติม", d: "สีไหลเติมจากซ้ายไปขวา", pv: <BtnPv kind="fill" colors={colors} hover="fill" /> },
          { v: "arrow", l: "ลูกศรขยับ", d: "มีลูกศรท้ายปุ่ม (เฉพาะปุ่มใน Section)", pv: <BtnPv kind="fill" colors={colors} hover="arrow" /> },
          { v: "lift", l: "ลอยขึ้น", d: "ยกขึ้นนิด มีเงา", pv: <BtnPv kind="fill" colors={colors} hover="lift" /> },
        ]}
      />

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          ลิงก์ตัวหนังสือตอนชี้<Def show={value.linkHover === d.linkHover} />
        </label>
        <Choice<LinkHover>
          value={value.linkHover}
          onChange={(v) => onChange({ linkHover: v })}
          options={[
            { v: "auto", l: "แบบเดิม", d: "แต่ละที่ตามเดิม", pv: <LinkPv mode="auto" colors={colors} /> },
            { v: "color", l: "เปลี่ยนสี", d: "ไม่มีเส้นใต้", pv: <LinkPv mode="color" colors={colors} /> },
            { v: "run", l: "เส้นใต้วิ่ง", d: "เส้นค่อย ๆ ลากใต้คำ", pv: <LinkPv mode="run" colors={colors} /> },
            { v: "fade", l: "จางลง", d: "", pv: <LinkPv mode="fade" colors={colors} /> },
            { v: "always", l: "มีเส้นใต้ตลอด", d: "ชี้แล้วเส้นหนาขึ้น", pv: <LinkPv mode="always" colors={colors} /> },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">ใช้กับเส้นทางหน้า (หน้าแรก › ร้านค้า) ลิงก์เล็กในตะกร้า/ชำระเงิน และลิงก์ท้ายเว็บ · เมนูด้านบนตั้งแยกที่แท็บเมนู · สีตอนชี้ = &quot;สีลิงก์&quot; ในแท็บสี</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          ช่องกรอกข้อมูล<Def show={value.inputStyle === d.inputStyle} />
        </label>
        <Choice<InputStyle>
          value={value.inputStyle}
          onChange={(v) => onChange({ inputStyle: v })}
          options={[
            { v: "box", l: "กล่อง", d: "มีขอบรอบ (แบบเดิม)", pv: <InputPv mode="box" colors={colors} /> },
            { v: "under", l: "เส้นใต้", d: "เส้นเดียวด้านล่าง ดูเรียบหรู", pv: <InputPv mode="under" colors={colors} /> },
            { v: "filled", l: "พื้นเทา", d: "ไม่มีขอบ พื้นจาง ๆ", pv: <InputPv mode="filled" colors={colors} /> },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">หน้าชำระเงิน สมัครสมาชิก ติดต่อเรา รับข่าวสาร รีวิว · ความมนของกล่องตั้งที่ &quot;ขอบช่องกรอก&quot; ด้านล่าง</p>
      </div>
    </div>
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
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <label className={labelCls}>🧱 ชุดไอคอนหัวเว็บ (ค้นหา · ตะกร้า · บัญชี)</label>
      <Choice<HeaderIconStyle>
        value={value}
        onChange={onChange}
        options={[
          { v: "regular", l: "เส้นปกติ", d: "แบบเดิม", pv: <IconsPv style="regular" ink={ink} /> },
          { v: "thin", l: "เส้นบาง", d: "บางเบา ดูหรู", pv: <IconsPv style="thin" ink={ink} /> },
          { v: "bold", l: "เส้นหนา", d: "ชัด เห็นง่าย", pv: <IconsPv style="bold" ink={ink} /> },
          { v: "circle", l: "ในวงกลม", d: "มีวงกลมรอบไอคอน", pv: <IconsPv style="circle" ink={ink} /> },
          { v: "text", l: "ตัวหนังสือ", d: "จอคอมใช้คำแทนไอคอน · มือถือยังเป็นไอคอน", pv: <IconsPv style="text" ink={ink} /> },
        ]}
      />
    </div>
  );
}

/** ✨ ชุด 2 — ลูกเล่นทั้งเว็บ (theme.page: sectionMotion/… · intro · cursor · readProgress · backToTop) · เว็บร้าน BlockRenderer / IntroScreen / CustomCursor / ScrollAids */
export function SiteMotionSetting({ value, onChange }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void }) {
  const d = DEFAULT_SITE_PAGE;
  return (
    <div className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">✨ ลูกเล่นทั้งเว็บ</h3>
      <p className="text-xs text-slate-500 mb-3">ปิดทุกตัวเป็นค่าเริ่ม · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหวจะไม่เห็นลูกเล่นเหล่านี้</p>

      <label className={labelCls}>
        Section โผล่ตอนเลื่อนมาถึง (ค่าทั้งเว็บ)<Def show={value.sectionMotion === d.sectionMotion} />
      </label>
      <Choice<SectionEntrance>
        value={value.sectionMotion}
        onChange={(v) => onChange({ sectionMotion: v })}
        options={[
          { v: "none", l: "ไม่ขยับ", d: "แบบเดิม" },
          { v: "fade-up", l: "ลอยขึ้น", d: "แนะนำ ดูเรียบหรู" },
          { v: "fade-in", l: "จางเข้า" },
          { v: "zoom", l: "ซูมเบา ๆ" },
          { v: "blur", l: "เบลอเป็นชัด" },
        ]}
      />
      {value.sectionMotion !== "none" && (
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <Choice<MotionSpeed> value={value.sectionSpeed} onChange={(v) => onChange({ sectionSpeed: v })} options={[{ v: "fast", l: "เร็ว" }, { v: "normal", l: "ปกติ" }, { v: "slow", l: "ช้า นุ่ม" }]} />
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.sectionStagger} onChange={(e) => onChange({ sectionStagger: e.target.checked })} />
            การ์ด/ชิ้นย่อยทยอยโผล่ทีละใบ
          </label>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-1 mb-3">ใช้กับ Section ที่ลูกเล่นเป็น &quot;ตามค่าทั้งเว็บ&quot; (ค่าเดิมของทุก Section) · Section ที่เลือกลูกเล่นเองคงแบบของตัวเอง · Section แรกของหน้าโผล่ทันทีเสมอ · ไม่อยากให้ Section ไหนขยับ เลือก &quot;ไม่ขยับ&quot; ในแท็บลูกเล่นของ Section นั้น</p>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          หน้าโหลดแรก (ครั้งแรกที่ลูกค้าเข้าเว็บ)<Def show={value.intro === d.intro} />
        </label>
        <Choice<IntroStyle>
          value={value.intro}
          onChange={(v) => onChange({ intro: v })}
          options={[
            { v: "off", l: "ไม่มี", d: "แบบเดิม" },
            { v: "logo", l: "โลโก้ค่อย ๆ ขึ้น", d: "แล้วจางเปิดเว็บ" },
            { v: "line", l: "โลโก้ + เส้นโหลด", d: "เส้นบางวิ่งใต้โลโก้" },
            { v: "curtain", l: "ม่านเข้มเปิดขึ้น", d: "ใช้โลโก้สำหรับพื้นเข้ม" },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">ประมาณ 1.5 วินาที · ขึ้นครั้งเดียวต่อการเข้าเว็บ 1 รอบ · ไม่ขึ้นในพรีวิวนี้และไม่ขึ้นให้บอทค้นหา — ดูผลได้โดยเปิดเว็บจริงในหน้าต่างไม่ระบุตัวตน</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          เคอร์เซอร์ (คอม)<Def show={value.cursor === d.cursor} />
        </label>
        <Choice<CursorStyle>
          value={value.cursor}
          onChange={(v) => onChange({ cursor: v })}
          options={[
            { v: "off", l: "ปกติ", d: "แบบเดิม" },
            { v: "ring", l: "วงกลมตามเมาส์", d: "ลูกศรเดิมยังอยู่" },
            { v: "dot", l: "จุด + วงแหวน", d: "ชี้ลิงก์/ปุ่มแล้วขยาย" },
            { v: "view", l: "วงกลม + คำว่า ดู", d: "ชี้รูปสินค้าแล้วขึ้น ดู" },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">เฉพาะคอมที่ใช้เมาส์ (มือถือ/แท็บเล็ตไม่มีผล) · ชี้ช่องกรอกข้อมูลแล้วกลับเป็นลูกศรปกติ</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer self-start">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-blue-600" checked={value.readProgress} onChange={(e) => onChange({ readProgress: e.target.checked })} />
          <span>
            แถบบอกว่าเลื่อนอ่านถึงไหน
            <span className="block text-[11px] text-slate-400">เส้นบางสีหลักบนสุดของจอ ยาวขึ้นตามที่เลื่อนลง</span>
          </span>
        </label>
        <div>
          <label className={labelCls}>
            ปุ่มกลับขึ้นบน<Def show={value.backToTop === d.backToTop} />
          </label>
          <Choice<BackToTop>
            value={value.backToTop}
            onChange={(v) => onChange({ backToTop: v })}
            options={[
              { v: "off", l: "ไม่มี" },
              { v: "circle", l: "วงกลม" },
              { v: "ring", l: "วงกลม + วงแหวน", d: "บอกความคืบหน้า" },
            ]}
          />
          {value.backToTop !== "off" && (
            <div className="mt-2">
              <Choice<"right" | "left"> value={value.backToTopSide} onChange={(v) => onChange({ backToTopSide: v })} options={[{ v: "right", l: "ขวา", d: "เหนือปุ่มแชท" }, { v: "left", l: "ซ้าย" }]} />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">โผล่เมื่อเลื่อนลงเกินเกือบ 1 จอ · ไม่โชว์หน้าชำระเงิน</p>
        </div>
      </div>
    </div>
  );
}

const NAV_LABEL: Record<MobileNavItem, string> = { home: "หน้าแรก", shop: "ร้านค้า", categories: "หมวด", search: "ค้นหา", wishlist: "ถูกใจ", cart: "ตะกร้า", account: "บัญชี", chat: "แชท" };
const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/** 📱 ชุด 3 — มือถือและช่วยขาย (theme.page: mobileNav · chat · searchEmpty · cookie) · เว็บร้าน MobileNav / FloatingChat / SearchOverlay / Tracking */
export function SiteSalesSetting({ value, onChange }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void }) {
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
    <div className={cardCls}>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">📱 มือถือและช่วยขาย</h3>
      <p className="text-xs text-slate-500 mb-3">ค่าที่มีป้าย &quot;แบบเดิม&quot; คือหน้าตาตอนนี้ · ดูผลได้ในพรีวิวด้านขวา (เลือกจอมือถือ)</p>

      <label className={labelCls}>
        แถบเมนูล่างแบบแอป (มือถือ)<Def show={nav.style === "off"} />
      </label>
      <Choice<"off" | "label" | "icon">
        value={nav.style}
        onChange={(v) => setNav({ style: v })}
        options={[
          { v: "off", l: "ไม่มี", d: "แบบเดิม" },
          { v: "label", l: "ไอคอน + คำ", d: "อ่านง่าย แนะนำ" },
          { v: "icon", l: "ไอคอนอย่างเดียว", d: "เรียบ ประหยัดที่" },
        ]}
      />
      {nav.style !== "off" && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-500 mb-1.5">เลือกปุ่ม 2–{MOBILE_NAV_MAX} ปุ่ม (เรียงตามลำดับนี้)</p>
          <div className="flex flex-wrap gap-2">
            {MOBILE_NAV_ITEMS.map((k) => {
              const on = nav.items.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggleItem(k)} className={`px-3 py-1.5 rounded-full border text-xs transition ${on ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {on ? "✓ " : ""}
                  {NAV_LABEL[k]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-2">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nav.hideOnScroll} onChange={(e) => setNav({ hideOnScroll: e.target.checked })} />
            เลื่อนลงแล้วซ่อนแถบ (เลื่อนขึ้นโผล่)
          </label>
          <p className="text-[11px] text-slate-400 mt-1">ถูกใจ/บัญชี โชว์เมื่อเปิดระบบสมาชิก · แชท โชว์เมื่อเปิดปุ่มแชท (มีปุ่มแชทในแถบแล้ว ปุ่มแชทลอยบนมือถือจะซ่อนเอง) · ไม่โชว์ในหน้าสินค้า (มีแถบใส่ตะกร้าอยู่แล้ว) และหน้าชำระเงิน</p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>💬 ปุ่มแชทลอย (ช่องทางแชทตั้งที่แท็บ ข้อมูลร้าน › 💬)</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">สีปุ่ม<Def show={chat.color === "brand"} /></p>
            <Choice<"brand" | "line" | "ink" | "white"> value={chat.color} onChange={(v) => setChat({ color: v })} options={[{ v: "brand", l: "สีหลัก" }, { v: "line", l: "เขียว LINE" }, { v: "ink", l: "เข้ม" }, { v: "white", l: "ขาว" }]} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">ทรงปุ่ม<Def show={chat.shape === "pill"} /></p>
            <Choice<"pill" | "round"> value={chat.shape} onChange={(v) => setChat({ shape: v })} options={[{ v: "pill", l: "แคปซูล + คำ" }, { v: "round", l: "วงกลมไอคอน" }]} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">แสดงที่<Def show={chat.where === "all"} /></p>
            <Choice<"all" | "mobile" | "desktop"> value={chat.where} onChange={(v) => setChat({ where: v })} options={[{ v: "all", l: "ทุกจอ" }, { v: "mobile", l: "เฉพาะมือถือ" }, { v: "desktop", l: "เฉพาะคอม" }]} />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          🔍 ค้นหาเต็มจอ — ตอนยังไม่พิมพ์<Def show={value.searchEmpty === "cats"} />
        </label>
        <Choice<SearchEmpty>
          value={value.searchEmpty}
          onChange={(v) => onChange({ searchEmpty: v })}
          options={[
            { v: "cats", l: "หมวดอย่างเดียว", d: "แบบเดิม" },
            { v: "terms", l: "+ คำยอดนิยม", d: "กดแล้วค้นทันที" },
            { v: "prods", l: "+ คำยอดนิยม + สินค้าแนะนำ", d: "แนะนำของร้าน → ขายดี → มาใหม่" },
          ]}
        />
        <p className="text-[11px] text-slate-400 mt-1">คำยอดนิยม = คำที่ตั้งเองในแท็บ ข้อมูลร้าน › 🔍 ค้นหา + คำที่ลูกค้าค้นจริงบ่อย ๆ และหาเจอ (ระบบเติมให้เอง · ยังไม่มีข้อมูล = โชว์เฉพาะคำที่ตั้ง)</p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>
          🍪 แถบขอความยินยอมคุกกี้ (PDPA)<Def show={ck.layout === "card"} />
        </label>
        <Choice<CookieLayout>
          value={ck.layout}
          onChange={(v) => setCk({ layout: v })}
          options={[
            { v: "card", l: "การ์ดล่างจอ", d: "แบบเดิม" },
            { v: "bar", l: "แถบเต็มความกว้าง", d: "ติดขอบล่าง" },
            { v: "center", l: "กล่องกลางจอ", d: "พื้นหลังมืดลง" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          {ck.layout === "card" && (
            <div>
              <p className="text-[11px] text-slate-500 mb-1">มุม (จอคอม)</p>
              <Choice<"left" | "right"> value={ck.side} onChange={(v) => setCk({ side: v })} options={[{ v: "left", l: "ซ้าย (เดิม)" }, { v: "right", l: "ขวา" }]} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer self-end pb-1">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={ck.icon} onChange={(e) => setCk({ icon: e.target.checked })} />
            มีรูปคุกกี้ 🍪 หน้าหัวข้อ
          </label>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">หัวข้อ (ว่าง = &quot;เว็บนี้ใช้คุกกี้&quot;)</p>
            <LangInput className={inputCls} obj={ck} k="title" maxLength={60} placeholder="เว็บนี้ใช้คุกกี้" onPatch={(p) => setCk(p)} />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] text-slate-500 mb-1">ข้อความ (ว่าง = ข้อความตั้งต้น)</p>
            <LangInput className={inputCls} obj={ck} k="text" multiline rows={2} maxLength={400} placeholder="เราใช้คุกกี้ที่จำเป็นให้เว็บทำงาน และขออนุญาตใช้คุกกี้วัดผลและโฆษณา…" onPatch={(p) => setCk(p)} />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">ปุ่ม &quot;เฉพาะที่จำเป็น&quot; อยู่ข้างปุ่ม &quot;ยอมรับทั้งหมด&quot; เสมอทุกแบบ (PDPA ให้ปฏิเสธได้ง่ายเท่ายอมรับ) · แถบนี้โผล่เมื่อใส่รหัสวัดผลในแท็บ ข้อมูลร้าน › 📊 · ไม่ขึ้นในพรีวิว</p>
      </div>
    </div>
  );
}

/** 📄 ชุด 4 — หน้าพิเศษ (theme.page: notFound · thanks · popup · share · login) · เว็บร้าน NotFoundView / ThanksExtras / PromoPopup / /api/og/product / LoginShell */
export function SitePagesSetting({ value, onChange, shopSlug, onPreview }: { value: SitePageDesign; onChange: (v: Partial<SitePageDesign>) => void; shopSlug: string; onPreview: (path: string) => void }) {
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
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-800">🧭 หน้า 404 (ไม่พบหน้า)</h3>
          {pvBtn("/zz-page-not-found", "ดูในพรีวิว")}
        </div>
        <p className="text-xs text-slate-500 mb-3">หน้าที่ลูกค้าเห็นเมื่อกดลิงก์ที่ไม่มีแล้ว · ลิงก์ที่ตั้ง &quot;ย้ายลิงก์&quot; ไว้ (ข้อมูลร้าน › 🔀) ยังพาไปหน้าใหม่ก่อนเสมอ</p>
        <Choice<"plain" | "image" | "big">
          value={nf.style}
          onChange={(v) => setNf({ style: v })}
          options={[
            { v: "plain", l: "ไอคอน + ข้อความ", d: "แบบเดิม" },
            { v: "image", l: "รูปใหญ่ + ข้อความ", d: "ใช้รูปของร้าน" },
            { v: "big", l: "ตัวเลข 404 ใหญ่", d: "แบบแบรนด์" },
          ]}
        />
        {nf.style === "image" && (
          <div className="mt-2 max-w-xs">
            <ImageInput value={nf.imageKey} onChange={(k) => setNf({ imageKey: k ?? "" })} folder="website-pages" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">หัวข้อ (ว่าง = &quot;ไม่พบหน้านี้&quot;)</p>
            <LangInput className={inputCls} obj={nf} k="title" maxLength={80} placeholder="ไม่พบหน้านี้" onPatch={(p) => setNf(p)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">ข้อความ (ว่าง = ข้อความตั้งต้น)</p>
            <LangInput className={inputCls} obj={nf} k="text" maxLength={240} placeholder="ลิงก์อาจเปลี่ยนไปหรือหน้านี้ถูกย้ายแล้ว" onPatch={(p) => setNf(p)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nf.search} onChange={(e) => setNf({ search: e.target.checked })} />
            ช่องค้นหาในหน้า
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={nf.products} onChange={(e) => setNf({ products: e.target.checked })} />
            สินค้าแนะนำ 4 ชิ้น (แนะนำของร้าน → ขายดี → มาใหม่)
          </label>
        </div>
      </div>

      {/* ── หน้าขอบคุณ ── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-800">🎉 หน้าขอบคุณหลังสั่งซื้อ</h3>
          {pvBtn("/checkout?pv=thanks", "ดูในพรีวิว")}
        </div>
        <p className="text-xs text-slate-500 mb-3">หัวข้อ/ข้อความของหน้านี้ตั้งที่แท็บ 💳 หน้าชำระเงิน · ที่นี่เพิ่มของเสริม</p>
        <label className={labelCls}>ด้านบนการ์ด<Def show={th.top === "emoji"} /></label>
        <Choice<"emoji" | "image" | "none"> value={th.top} onChange={(v) => setTh({ top: v })} options={[{ v: "emoji", l: "อีโมจิ 🎉" }, { v: "image", l: "รูปแบนเนอร์" }, { v: "none", l: "ไม่มี" }]} />
        {th.top === "image" && (
          <div className="mt-2 max-w-xs">
            <ImageInput value={th.imageKey} onChange={(k) => setTh({ imageKey: k ?? "" })} folder="website-pages" />
          </div>
        )}
        <div className="mt-3">
          <label className={labelCls}>🎟️ คูปองครั้งหน้า</label>
          <select className={inputCls} value={th.coupon} onChange={(e) => setTh({ coupon: e.target.value })}>
            <option value="">ไม่โชว์ (แบบเดิม)</option>
            {th.coupon && !(coupons ?? []).some((c) => c.code === th.coupon) && <option value={th.coupon}>{th.coupon} (ตอนนี้ใช้ไม่ได้ — ลูกค้าจะไม่เห็น)</option>}
            {(coupons ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.note ? ` · ${c.note}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{coupons === null ? "กำลังโหลดคูปอง…" : coupons.length ? "เลือกได้เฉพาะคูปองที่เปิดอยู่ ยังไม่หมดอายุ และใช้ได้ทุกคน · คูปองปิด/หมดอายุ/ใช้ครบ ระบบซ่อนให้เอง" : "ยังไม่มีคูปองที่ใช้ได้ทุกคน — สร้างได้ที่แท็บ 🎟️ คูปอง"}</p>
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={th.follow} onChange={(e) => setTh({ follow: e.target.checked })} />
            ❤️ ปุ่มติดตามโซเชียลของร้าน (จากข้อมูลร้าน)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={th.products} onChange={(e) => setTh({ products: e.target.checked })} />
            ⭐ สินค้าแนะนำ 4 ชิ้นใต้การ์ด
          </label>
        </div>
      </div>

      {/* ── ป๊อปอัป ── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-800">🎁 ป๊อปอัปรับส่วนลด</h3>
          {pvBtn("/?pv=popup", "ดูตัวอย่าง")}
        </div>
        <p className="text-xs text-slate-500 mb-3">เปิด/โค้ด/ข้อความ/วินาที ตั้งที่แท็บ ข้อมูลร้าน › 🎁 · ที่นี่ตั้งหน้าตาและจังหวะ · ตัวอย่างในพรีวิวไม่ส่งอีเมลจริง</p>
        <Choice<"center" | "split" | "sheet" | "corner">
          value={pp.layout}
          onChange={(v) => setPp({ layout: v })}
          options={[
            { v: "center", l: "กล่องกลางจอ", d: "แบบเดิม" },
            { v: "split", l: "รูปซ้าย ข้อความขวา", d: "ต้องใส่รูป" },
            { v: "sheet", l: "แผ่นเลื่อนจากล่าง", d: "เหมาะกับมือถือ" },
            { v: "corner", l: "กล่องเล็กมุมขวาล่าง", d: "ไม่บังหน้าเว็บ" },
          ]}
        />
        <div className="mt-2 max-w-xs">
          <p className="text-[11px] text-slate-500 mb-1">รูปในป๊อปอัป (ไม่ใส่ = ไอคอน 🎁)</p>
          <ImageInput value={pp.imageKey} onChange={(k) => setPp({ imageKey: k ?? "" })} folder="website-pages" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <label className={labelCls}>โผล่เมื่อ<Def show={pp.trigger === "delay"} /></label>
            <Choice<"delay" | "scroll" | "exit"> value={pp.trigger} onChange={(v) => setPp({ trigger: v })} options={[{ v: "delay", l: "หลังเข้าเว็บ X วิ" }, { v: "scroll", l: "เลื่อนถึงครึ่งหน้า" }, { v: "exit", l: "กำลังจะออก (คอม)" }]} />
            <p className="text-[11px] text-slate-400 mt-1">&quot;กำลังจะออก&quot; = เมาส์ขยับออกนอกหน้าเว็บ · มือถือใช้ &quot;เลื่อนถึงครึ่งหน้า&quot; แทน</p>
          </div>
          <div>
            <label className={labelCls}>โผล่ซ้ำ<Def show={pp.again === "once"} /></label>
            <Choice<"once" | "7d"> value={pp.again} onChange={(v) => setPp({ again: v })} options={[{ v: "once", l: "ครั้งเดียว" }, { v: "7d", l: "ทุก 7 วัน ถ้ายังไม่รับโค้ด" }]} />
          </div>
        </div>
      </div>

      {/* ── รูปตอนแชร์ ── */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">🖼 รูปตอนแชร์ลิงก์สินค้า (Facebook · LINE)</h3>
        <p className="text-xs text-slate-500 mb-3">แบบการ์ด/กรอบ = ระบบวาดรูปใหม่ให้สินค้าทุกตัวเอง · แอปแชทอาจจำรูปเก่าไว้สักพัก (ลิงก์ที่แชร์ใหม่ได้รูปใหม่)</p>
        <Choice<"photo" | "card" | "frame">
          value={sh.style}
          onChange={(v) => setSh({ style: v })}
          options={[
            { v: "photo", l: "รูปสินค้ารูปแรก", d: "แบบเดิม" },
            { v: "card", l: "การ์ด", d: "รูป + ชื่อ + ราคา + โลโก้" },
            { v: "frame", l: "รูป + แถบโลโก้", d: "แถบโลโก้/ราคาด้านล่าง" },
          ]}
        />
        {sh.style !== "photo" && (
          <div className="mt-2">
            <p className="text-[11px] text-slate-500 mb-1">สีพื้นการ์ด/แถบ</p>
            <Choice<"paper" | "brand" | "ink"> value={sh.bg} onChange={(v) => setSh({ bg: v })} options={[{ v: "paper", l: "สีพื้นเว็บ" }, { v: "brand", l: "สีหลัก" }, { v: "ink", l: "เข้ม" }]} />
          </div>
        )}
      </div>

      {/* ── หน้าเข้าสู่ระบบ ── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-800">👤 หน้าเข้าสู่ระบบ / สมัครสมาชิก</h3>
          {pvBtn("/account/login", "ดูในพรีวิว")}
        </div>
        <p className="text-xs text-slate-500 mb-3">ลูกค้าเห็นเมื่อเปิดระบบสมาชิก (แท็บ 👥 สมาชิก)</p>
        <Choice<"center" | "split" | "cover">
          value={lg.layout}
          onChange={(v) => setLg({ layout: v })}
          options={[
            { v: "center", l: "กล่องกลาง", d: "แบบเดิม" },
            { v: "split", l: "รูปซ้าย ฟอร์มขวา" },
            { v: "cover", l: "รูปพื้นหลังเต็มจอ" },
          ]}
        />
        {lg.layout !== "center" && (
          <div className="mt-2 max-w-xs">
            <ImageInput value={lg.imageKey} onChange={(k) => setLg({ imageKey: k ?? "" })} folder="website-pages" />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-1">หัวข้อต้อนรับ (ว่าง = &quot;เข้าสู่ระบบ / สมัครสมาชิก&quot;)</p>
            <LangInput className={inputCls} obj={lg} k="title" maxLength={80} placeholder="ยินดีต้อนรับสู่ …" onPatch={(p) => setLg(p)} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">ข้อความ (ว่าง = ข้อความตั้งต้น)</p>
            <LangInput className={inputCls} obj={lg} k="text" maxLength={240} placeholder="สะสมแต้มทุกออเดอร์ · รับสิทธิ์ก่อนใคร" onPatch={(p) => setLg(p)} />
          </div>
        </div>
      </div>
    </div>
  );
}
