"use client";

/**
 * 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1) — ตั้งครั้งเดียว ทุกหน้า/ทุก Section เปลี่ยนตาม
 * ค่าเก็บที่ theme.page / theme.shape / theme.header.iconStyle (lib/website-site-design · มิเรอร์เว็บร้าน src/lib/site-design.ts)
 * เว็บร้านวาดเป็น CSS ที่ src/lib/site-design-css.ts · ค่าเริ่มต้นทุกตัว = หน้าตาเดิม
 */
import type { ReactNode } from "react";
import { RangeInput } from "@/components/range-input";
import {
  DEFAULT_SITE_PAGE,
  DEFAULT_SITE_SHAPE,
  MOBILE_SCALE_RANGE,
  TEXTURE_STRENGTH_RANGE,
  formatMoneyAs,
  type ButtonHover,
  type ButtonKind,
  type HeaderIconStyle,
  type InputStyle,
  type LinkHover,
  type PriceFormat,
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
