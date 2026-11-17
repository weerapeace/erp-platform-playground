"use client";

/** การ์ดสินค้า — ชุดสำเร็จรูป · กรอบ/รูป · ป้าย · จุดสี · ระหว่างรอรูปโหลด · การ์ดจำลอง (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { type ImagePlaceholder, type Shape } from "@/lib/website-theme";
import { LangInput } from "@/components/bilingual-field";
import { CARD_LOOKS } from "@/lib/website-card-looks";
import { ColorInput } from "@/components/color-picker";
import { WheelSelect } from "@/components/wheel-select";
import { RangeInput } from "@/components/range-input";
import { RATIO_CSS, SampleCard } from "./sample-card";
import { type ImageRatio, type CardHover, type Theme, inputCls, labelCls, useAreaFold } from "./shared";
import { CARD_PARTS } from "@/lib/website-page-parts";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";

export function CardTab() {
  const t = useT();
  const { theme, choices, setLogo, setCard, setShape, sampleItems } = useDesign();
  const areaFold = useAreaFold();
  return (
    <>
    {/* การ์ดจำลองจากสินค้าจริง — เปลี่ยนค่าแล้วเห็นทันที (ชี้เมาส์ดูเอฟเฟกต์) */}
    <DesignCard title={t("ตัวอย่างการ์ด (ดูผลทันที)", "Card preview (live)")} hint={t("จากสินค้าจริงในร้าน · ชี้เมาส์เพื่อดูเอฟเฟกต์", "From real products in the shop · hover to see effects")} defaultOpen>
      {sampleItems.length ? (
        <div className="rounded-xl p-4" style={{ background: theme.colors.page }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(sampleItems.length, theme.card.columns.desktop)}, minmax(0, 1fr))`, gap: theme.card.gap === "sm" ? 8 : theme.card.gap === "lg" ? 24 : 16, maxWidth: 560 }}>
            {sampleItems.slice(0, Math.min(sampleItems.length, theme.card.columns.desktop)).map((it, i) => (
              <SampleCard key={i} item={it} card={theme.card} colors={theme.colors} fonts={theme.fonts} radius={theme.radius} shape={theme.shape} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">{t("ยังไม่มีสินค้าบนเว็บ — การ์ดจำลองจะโชว์เมื่อมีสินค้าที่เผยแพร่แล้ว", "No web products yet — preview cards show once products are published")}</p>
      )}
    </DesignCard>

    <DesignCard
      title={t("หน้าตาการ์ด — ชุดสำเร็จรูป · รูปแบบ · ช่องหลัก", "Card look — presets · style · main fields")}
      summary={`${labelEn(choices.cardPresets.find((p) => p.value === theme.card.preset)?.label ?? theme.card.preset)} · ${t("รูป", "image")} ${theme.card.imageRatio} · ${t(`ชื่อ ${theme.card.titleLines} บรรทัด`, `name ${theme.card.titleLines} line(s)`)}`}
    >

      {/* 🃏 ชุดสำเร็จรูป — กดทีเดียวตั้งหลายช่อง แล้วปรับต่อเองได้ (lib/website-card-looks · ใช้ชุดเดียวกับ "การ์ดในส่วนนี้" ของ Section) */}
      <label className={labelCls}>{t("ชุดหน้าตาสำเร็จรูป", "Look presets")}</label>
      <div className="flex flex-wrap gap-2 mb-1">
        {CARD_LOOKS.map((l) => (
          <button key={l.key} type="button" onClick={() => setCard({ ...(l.card as Partial<Theme["card"]>), ...(l.card.showBadge === false ? { autoBadges: { ...theme.card.autoBadges, sale: false, new: false, best: false } } : null) })} title={labelEn(l.hint)} className="px-3.5 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-blue-500 hover:text-blue-700">
            {labelEn(l.label)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">{t("กดแล้วตั้งช่องด้านล่างให้ทีเดียว (ปรับต่อทีละช่องได้ · กด ↶ ย้อนได้ถ้าไม่ชอบ)", "Sets the fields below in one click (tweak each field after · press ↶ to undo)")}</p>

      <label className={labelCls}>{t("รูปแบบการ์ด", "Card style")}</label>
      <div className="flex flex-wrap gap-2 mb-4">
        {choices.cardPresets.map((p) => (
          <button
            key={p.value}
            onClick={() => setCard({ preset: p.value })}
            title={labelEn(p.hint)}
            className={`px-3.5 py-2 rounded-lg border text-sm transition ${
              theme.card.preset === p.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {labelEn(p.label)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{t("สัดส่วนรูปสินค้า", "Product image ratio")}</label>
          <select className={inputCls} value={theme.card.imageRatio} onChange={(e) => setCard({ imageRatio: e.target.value as ImageRatio })}>
            {choices.imageRatios.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("ชื่อสินค้าแสดงกี่บรรทัด", "Product name lines")}</label>
          <WheelSelect value={theme.card.titleLines} onChange={(e) => setCard({ titleLines: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t(`${n} บรรทัด`, `${n} line${n > 1 ? "s" : ""}`)}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>{t("เอฟเฟกต์ตอนชี้เมาส์", "Hover effect")}</label>
          <select className={inputCls} value={theme.card.hover} onChange={(e) => setCard({ hover: e.target.value as CardHover })}>
            {choices.cardHovers.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </select>
        </div>
      </div>

      {/* "รูปในกรอบ" (เต็มกรอบ/เห็นทั้งรูป) ย้ายไปอยู่กลุ่ม 🖼 รูปบนการ์ด ข้างล่าง คู่กับสีพื้นหลัง/ระยะห่าง */}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>{t("ปุ่ม \"เพิ่มลงตะกร้า\" บนรูป", "\"Add to cart\" button on image")}</label>
          <select className={inputCls} value={theme.card.quickAdd} onChange={(e) => setCard({ quickAdd: e.target.value as Theme["card"]["quickAdd"] })}>
            <option value="hover">{t("โผล่ตอนชี้เมาส์ (มือถือไม่มี)", "Show on hover (not on mobile)")}</option>
            <option value="always">{t("โชว์ตลอด", "Always show")}</option>
            <option value="none">{t("ไม่มีปุ่ม", "No button")}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("จัดข้อความ", "Text alignment")}</label>
          <select className={inputCls} value={theme.card.align} onChange={(e) => setCard({ align: e.target.value as Theme["card"]["align"] })}>
            <option value="left">{t("ชิดซ้าย", "Left")}</option>
            <option value="center">{t("กึ่งกลาง", "Center")}</option>
          </select>
        </div>
      </div>

      {/* ⬜ ความมน/เหลี่ยมของกรอบ — ค่าเดียวกับแท็บรูปทรง (theme.shape) แก้ที่ไหนก็เปลี่ยนตาม */}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        {([
          ["cardRadius", t("ความมนของกรอบการ์ด", "Card corner roundness"), t("มีผลกับแบบ มีกรอบ / เงานุ่ม / ลอย", "Applies to Bordered / Soft shadow / Floating styles")],
          ["imageRadius", t("ความมนของรูปสินค้า", "Product image roundness"), t("มีผลกับแบบ เรียบ / มินิมอล (รูปไม่มีกรอบการ์ด)", "Applies to Plain / Minimal styles (image without card frame)")],
        ] as const).map(([k, label, hint]) => (
          <div key={k}>
            <label className={labelCls}>{label}</label>
            <div className="flex flex-wrap gap-1.5">
              {([null, 0, 4, 8, 12, 20, 32] as const).map((n) => {
                const on = theme.shape[k] === n;
                const preview = n == null ? (theme.radius === "sharp" ? 4 : theme.radius === "round" ? 20 : 12) : n;
                return (
                  <button key={String(n)} type="button" onClick={() => setShape({ [k]: n } as Partial<Shape>)}
                    title={n == null ? t("ตามค่ารวมของธีม (แท็บรูปทรง)", "Theme default (Shape tab)") : n === 0 ? t("เหลี่ยม", "Square") : t(`มน ${n}px`, `Rounded ${n}px`)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    <span className="block w-6 h-6 border-2 border-current" style={{ borderRadius: Math.min(preview, 12) }} />
                    {n == null ? t("ตามธีม", "Theme") : n === 0 ? t("เหลี่ยม", "Square") : n}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-4 mt-3">
        <div>
          <label className={labelCls}>{t("คอลัมน์ · คอม", "Columns · desktop")}</label>
          <WheelSelect value={theme.card.columns.desktop} onChange={(e) => setCard({ columns: { ...theme.card.columns, desktop: Number(e.target.value) } })}>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>{t("คอลัมน์ · แท็บเล็ต", "Columns · tablet")}</label>
          <WheelSelect value={theme.card.columns.tablet} onChange={(e) => setCard({ columns: { ...theme.card.columns, tablet: Number(e.target.value) } })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>{t("คอลัมน์ · มือถือ", "Columns · mobile")}</label>
          <WheelSelect value={theme.card.columns.mobile} onChange={(e) => setCard({ columns: { ...theme.card.columns, mobile: Number(e.target.value) } })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </WheelSelect>
        </div>
        <div>
          <label className={labelCls}>{t("ระยะห่างการ์ด", "Card spacing")}</label>
          <WheelSelect value={theme.card.gap} onChange={(e) => setCard({ gap: e.target.value as Theme["card"]["gap"] })}>
            <option value="sm">{t("ชิด", "Tight")}</option>
            <option value="md">{t("ปกติ", "Normal")}</option>
            <option value="lg">{t("ห่าง", "Wide")}</option>
          </WheelSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>{t("ขนาดชื่อสินค้า", "Product name size")} ({theme.card.nameSize}%)</label>
          <RangeInput min={60} max={180} step={5} value={theme.card.nameSize} onChange={(v) => setCard({ nameSize: v })} className="w-full" />
        </div>
        <div>
          <label className={labelCls}>{t("ขนาดราคา", "Price size")} ({theme.card.priceSize}%)</label>
          <RangeInput min={60} max={180} step={5} value={theme.card.priceSize} onChange={(v) => setCard({ priceSize: v })} className="w-full" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelCls}>{t("ชื่อ-ราคา", "Name & price")}</label>
          <select className={inputCls} value={theme.card.infoLayout} onChange={(e) => setCard({ infoLayout: e.target.value as Theme["card"]["infoLayout"] })}>
            <option value="stack">{t("ราคาอยู่ใต้ชื่อ (แบบเดิม)", "Price under name (as before)")}</option>
            <option value="split">{t("ชื่อซ้าย · ราคาขวา บรรทัดเดียวกัน", "Name left · price right on one line")}</option>
          </select>
          {theme.card.infoLayout === "split" && <p className="text-[11px] text-slate-400 mt-0.5">{t("ชื่อยาวตัดเหลือ 1 บรรทัด · ราคาชิดขวาเสมอ", "Long names cut to 1 line · price always right-aligned")}</p>}
        </div>
        <div>
          <label className={labelCls}>{t("ความหนาราคา", "Price weight")}</label>
          <WheelSelect value={theme.card.priceWeight} onChange={(e) => setCard({ priceWeight: Number(e.target.value) as Theme["card"]["priceWeight"] })}>
            <option value={400}>{t("บาง", "Light")}</option>
            <option value={500}>{t("กลาง", "Medium")}</option>
            <option value={600}>{t("หนา (แบบเดิม)", "Semibold (as before)")}</option>
            <option value={700}>{t("หนามาก", "Bold")}</option>
          </WheelSelect>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100">
        {([
          ["showBadge", t("ป้าย (ขายดี/แนะนำ)", "Badges (best seller/featured)")],
          ["showStock", t("สถานะสต๊อก", "Stock status")],
          ["showCategory", t("ชื่อหมวดเหนือชื่อสินค้า", "Category above product name")],
          ["showUnit", t("หน่วย (/ ใบ)", "Unit (/ pc)")],
          ["showCompare", t("ราคาเต็มขีดฆ่า (fake_price)", "Struck-through full price (fake_price)")],
          ["showSwatches", t("จุดสีตัวเลือก", "Color swatches")],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card[k]} onChange={(e) => setCard({ [k]: e.target.checked } as Partial<Theme["card"]>)} />
            {label}
          </label>
        ))}
        {/* หน้าตาจุดสีมาจากทะเบียนสีกลาง (ใช้ทุกร้าน) — บันทึกแล้วเว็บเปลี่ยนทันที ไม่ต้องกดเผยแพร่ธีม */}
        <span className="ml-auto"><ColorSwatchButton /></span>
      </div>

    </DesignCard>

    {/* 🎨 จุดสีบนการ์ด */}
    <DesignCard
      title={t("จุดสีบนการ์ด", "Color swatches on cards")}
      summary={theme.card.showSwatches ? `${t(`โชว์สูงสุด ${theme.card.swatchMax} จุด`, `Up to ${theme.card.swatchMax} swatches`)}${theme.card.swatchSwap ? t(" · ชี้แล้วเปลี่ยนรูป", " · hover swaps image") : ""}` : t("ปิดอยู่ (เปิด “จุดสีตัวเลือก” ในการ์ดหน้าตาการ์ด)", "Off (turn on “Color swatches” in Card look)")}
    >
      {!theme.card.showSwatches && <p className="text-xs text-slate-400">{t("ยังไม่ได้เปิด “จุดสีตัวเลือก” — ติ๊กในการ์ด “หน้าตาการ์ด” ด้านบนก่อน", "“Color swatches” is off — tick it in “Card look” above first")}</p>}
      {theme.card.showSwatches && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {t("ตำแหน่ง", "Position")}
              <WheelSelect value={theme.card.swatchPos} onChange={(e) => setCard({ swatchPos: e.target.value as Theme["card"]["swatchPos"] })}>
                <option value="below">{t("ใต้ราคา (แบบเดิม)", "Under price (as before)")}</option>
                <option value="name">{t("ขวาของชื่อ (1 ช่อง + จำนวนที่เหลือ)", "Right of name (1 swatch + remaining count)")}</option>
              </WheelSelect>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {t("ทรง", "Shape")}
              <WheelSelect value={theme.card.swatchShape} onChange={(e) => setCard({ swatchShape: e.target.value as Theme["card"]["swatchShape"] })}>
                <option value="circle">{t("วงกลม (แบบเดิม)", "Circle (as before)")}</option>
                <option value="square">{t("สี่เหลี่ยม", "Square")}</option>
                <option value="rounded">{t("มุมมน", "Rounded")}</option>
              </WheelSelect>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {theme.card.swatchPos !== "name" && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {t("จุดสีสูงสุด", "Max swatches")}
              <WheelSelect value={theme.card.swatchMax} onChange={(e) => setCard({ swatchMax: Number(e.target.value) })}>
                {[3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{t(`${n} จุด`, `${n}`)}</option>)}
              </WheelSelect>
              <span className="text-[11px] text-slate-400">{t("เกินโชว์ +N", "More shows +N")}</span>
            </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.swatchSwap} onChange={(e) => setCard({ swatchSwap: e.target.checked })} />
              {t("ชี้ (คอม) / แตะ (มือถือ) จุดสี แล้วรูปการ์ดเปลี่ยนเป็นสีนั้น", "Hover (desktop) / tap (mobile) a swatch to switch the card image to that color")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showColorCount} onChange={(e) => setCard({ showColorCount: e.target.checked })} />
              {t("โชว์จำนวนสี (เช่น \"4 สี\")", "Show color count (e.g. \"4 colors\")")}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{t("เลือกว่าแต่ละรุ่นโชว์สีไหนบ้าง + ★ สีหลัก (รูปแรกบนการ์ด) ได้ที่ Parent SKU → แท็บ 🛍 เว็บไซต์ · ไม่ตั้ง = ทุกสีตามลำดับเดิม · กดการ์ดหลังเลือกสี = เปิดหน้าสินค้าโดยเลือกสีนั้นไว้", "Choose which colors each model shows + ★ main color (first card image) in Parent SKU → 🛍 Website tab · not set = all colors in original order · clicking a card after picking a color opens the product with that color selected")}</p>
        </div>
      )}

    </DesignCard>

    <DesignCard title={t("ป้าย · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน", "Badges · card image · name/price · quick view")} hint={t("ป้ายอัตโนมัติ (ลด/ใหม่/ขายดี) · รูปในกรอบ · ตำแหน่งรูป · ขนาดชื่อ/ราคา · ปุ่มดูด่วน", "Auto badges (sale/new/best seller) · image fit · image position · name/price size · quick view button")}>
      <CardExtras card={theme.card} setCard={setCard} />
    </DesignCard>


    {/* 🖼 ระหว่างรอรูปโหลด — ใช้ทั้งการ์ดและหน้าสินค้า (เก็บใน logo.placeholder) */}
    <DesignCard title={t("ระหว่างรอรูปโหลด", "While images load")} hint={t("ใช้ทั้งการ์ดสินค้าและหน้าสินค้า", "Used on product cards and product pages")}>
      <PlaceholderSettings
        value={theme.logo.placeholder}
        onChange={(p) => setLogo({ placeholder: { ...theme.logo.placeholder, ...p } })}
        logoKey={theme.logo.imageKey}
        surface={theme.colors.surface}
        colors={theme.colors}
        ratio={RATIO_CSS[theme.card.imageRatio] ?? "4 / 5"}
      />
    </DesignCard>
    {areaFold("card", CARD_PARTS, t("กรอบ · รูป · ชื่อ · ราคา · ป้าย · ปุ่มใส่ตะกร้า — ทุกที่ที่มีการ์ด", "Frame · image · name · price · badges · add-to-cart button — everywhere cards appear"), "/shop")}
    </>
  );
}

/* ─────────── การ์ดสินค้า: ป้ายอัตโนมัติ · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน ─────────── */
export function CardExtras({ card, setCard }: { card: Theme["card"]; setCard: (p: Partial<Theme["card"]>) => void }) {
  const t = useT();
  const ab = card.autoBadges;
  const setAb = (p: Partial<typeof ab>) => setCard({ autoBadges: { ...ab, ...p } });
  const mini = "rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white";
  const badgeRow = (
    on: boolean,
    label: string,
    text: string,
    color: string,
    param: React.ReactNode,
    set: (p: { on?: boolean; text?: string; color?: string }) => void,
    placeholder: string,
    textKey: "saleText" | "newText" | "bestText"
  ) => (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${on ? "bg-white border border-slate-200" : "bg-slate-50"}`}>
      <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer w-24 shrink-0">
        <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => set({ on: e.target.checked })} />
        {label}
      </label>
      <LangInput className={`${mini} w-28`} obj={ab} k={textKey} maxLength={24} onPatch={(p) => setAb(p)} placeholder={placeholder} disabled={!on} />
      {param}
      <span className="w-36"><ColorInput value={color} onChange={(v) => set({ color: v })} /></span>
      <span className="text-[11px] px-2 py-0.5 text-white" style={{ background: color, borderRadius: ab.shape === "pill" ? 99 : 3 }}>{text.replace("{pct}", "20") || placeholder}</span>
    </div>
  );
  return (
    <>
      {/* 🏷 ป้ายอัตโนมัติ */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🏷 {t("ป้ายอัตโนมัติ (ซ้อนกับป้ายที่ตั้งเองรายรุ่น)", "Auto badges (stack with per-model custom badges)")}</label>
        <div className="space-y-1.5">
          {badgeRow(ab.sale, t("ลดราคา", "Sale"), ab.saleText, ab.saleColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">{t("ลดอย่างน้อย", "At least")}
              <WheelSelect value={ab.saleMin} disabled={!ab.sale} onChange={(e) => setAb({ saleMin: Number(e.target.value) })}>
                {[1, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { sale: p.on } : {}), ...(p.text !== undefined ? { saleText: p.text } : {}), ...(p.color !== undefined ? { saleColor: p.color } : {}) }),
            "ลด {pct}%", "saleText")}
          {badgeRow(ab.new, t("สินค้าใหม่", "New"), ab.newText, ab.newColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">{t("ขึ้นเว็บภายใน", "Live within")}
              <WheelSelect value={ab.newDays} disabled={!ab.new} onChange={(e) => setAb({ newDays: Number(e.target.value) })}>
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{t(`${n} วัน`, `${n} days`)}</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { new: p.on } : {}), ...(p.text !== undefined ? { newText: p.text } : {}), ...(p.color !== undefined ? { newColor: p.color } : {}) }),
            "ใหม่", "newText")}
          {badgeRow(ab.best, t("ขายดี", "Best seller"), ab.bestText, ab.bestColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">{t("อันดับ 1 –", "Top 1 –")}
              <WheelSelect value={ab.bestTop} disabled={!ab.best} onChange={(e) => setAb({ bestTop: Number(e.target.value) })}>
                {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { best: p.on } : {}), ...(p.text !== undefined ? { bestText: p.text } : {}), ...(p.color !== undefined ? { bestColor: p.color } : {}) }),
            "ขายดี", "bestText")}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">{t("มุมป้าย", "Badge corner")}
            <select className={mini} value={ab.pos} onChange={(e) => setAb({ pos: e.target.value as typeof ab.pos })}>
              <option value="top-left">{t("บนซ้าย", "Top left")}</option>
              <option value="top-right">{t("บนขวา", "Top right")}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">{t("รูปทรงป้าย", "Badge shape")}
            <select className={mini} value={ab.shape} onChange={(e) => setAb({ shape: e.target.value as typeof ab.shape })}>
              <option value="pill">{t("มน (แคปซูล)", "Rounded (pill)")}</option>
              <option value="square">{t("เหลี่ยม", "Square")}</option>
              <option value="ribbon">{t("ริบบิ้นชิดขอบ", "Edge ribbon")}</option>
              <option value="corner">{t("ชิดมุมการ์ด", "Card corner")}</option>
              <option value="text">{t("ตัวหนังสือล้วน", "Text only")}</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("ลด % คิดจาก “ราคาเต็มขีดฆ่า (fake_price)” · {pct} = เลขเปอร์เซ็นต์ · ใหม่ = นับจากวันที่เพิ่มรุ่นเข้าร้าน · ขายดี = อันดับยอดขายบนเว็บ (ยังไม่มีออเดอร์ = ยังไม่ขึ้น)", "% off is based on the “struck-through full price (fake_price)” · {pct} = the percentage · New = counted from the date the model was added to the shop · Best seller = web sales rank (no orders = not shown)")}</p>
      </div>

      {/* 🖼 รูปบนการ์ด — รูปในกรอบ (ตัด/ไม่ตัด) · ตำแหน่งรูป · สีพื้นหลัง · ระยะห่างจากขอบ */}
      <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
        <div>
          <label className={labelCls}>🖼 {t("รูปในกรอบ", "Image fit")}</label>
          <select className={inputCls} value={card.imageFit} onChange={(e) => setCard({ imageFit: e.target.value as Theme["card"]["imageFit"] })}>
            <option value="cover">{t("เต็มกรอบ (ตัดขอบรูปให้เต็มช่อง)", "Fill frame (crop edges to fill)")}</option>
            <option value="contain">{t("โชว์เต็มรูป (ไม่ตัด · ย่อให้เห็นครบ)", "Show whole image (no crop · scaled to fit)")}</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-0.5">{t("ไม่ตัด = เห็นสินค้าครบทั้งชิ้น · ช่องว่างรอบรูปใช้ “สีพื้นหลัง” ข้าง ๆ", "No crop = whole product visible · space around the image uses the “background color” next to it")}</p>
        </div>
        <div>
          <label className={labelCls}>📍 {t("ตำแหน่งรูปในกรอบ", "Image position in frame")}</label>
          <select className={inputCls} value={card.imagePos} onChange={(e) => setCard({ imagePos: e.target.value as Theme["card"]["imagePos"] })}>
            <option value="center">{t("กึ่งกลาง (แบบเดิม)", "Center (as before)")}</option>
            <option value="top">{t("ชิดบน", "Top")}</option>
            <option value="bottom">{t("ชิดล่าง", "Bottom")}</option>
            <option value="custom">{t("กำหนดเอง (เลื่อนเอง)", "Custom (slide)")}</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-0.5">{card.imageFit === "contain" ? t("ไม่ตัด = รูปไปวางชิดตรงนี้ในกรอบ", "No crop = image sits at this spot in the frame") : t("เต็มกรอบ = เลือกว่าเห็นส่วนไหนของรูป (เช่น ชิดบน = ไม่ตัดหัวสินค้า)", "Fill frame = choose which part of the image shows (e.g. Top = don't crop the top of the product)")}</p>
          {card.imagePos === "custom" && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-20 shrink-0">{t("ซ้าย ↔ ขวา", "Left ↔ right")} {card.imagePosX}%</span>
                <RangeInput min={0} max={100} step={1} value={card.imagePosX} onChange={(v) => setCard({ imagePosX: v })} className="flex-1" />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-20 shrink-0">{t("บน ↕ ล่าง", "Top ↕ bottom")} {card.imagePosY}%</span>
                <RangeInput min={0} max={100} step={1} value={card.imagePosY} onChange={(v) => setCard({ imagePosY: v })} className="flex-1" />
              </label>
              <button type="button" onClick={() => setCard({ imagePosX: 50, imagePosY: 50 })} className="text-[11px] text-slate-500 hover:text-blue-600">↺ {t("กลับกึ่งกลาง", "Back to center")}</button>
            </div>
          )}
          {/* 🔍 ขนาดรูปในกรอบ — ย่อ/ขยายรอบจุดตำแหน่งที่เลือก (ชิดบน = ย่อแล้วยังชิดบน) */}
          <div className="mt-2">
            <label className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-0.5">
              <span>🔍 {t("ขนาดรูปในกรอบ", "Image size in frame")} ({card.imageScale}%)</span>
              {card.imageScale !== 100 && (
                <button type="button" onClick={() => setCard({ imageScale: 100 })} className="font-normal text-slate-500 hover:text-blue-600">
                  ↺ 100%
                </button>
              )}
            </label>
            <RangeInput min={50} max={200} step={5} value={card.imageScale} onChange={(v) => setCard({ imageScale: v })} className="w-full" />
            <p className="text-[11px] text-slate-400">{t("น้อยกว่า 100 = ย่อรูป เห็นพื้นรอบ · มากกว่า 100 = ซูมเข้า (ตัดขอบเพิ่ม)", "Below 100 = shrink image, background shows around it · above 100 = zoom in (crops more)")}</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t("สีพื้นหลังหลังรูปสินค้า", "Background behind product image")}</label>
          <div className="flex items-center gap-2">
            <span className="flex-1"><ColorInput value={card.imageBg} onChange={(v) => setCard({ imageBg: v })} /></span>
            {card.imageBg && <button type="button" onClick={() => setCard({ imageBg: "" })} className="text-xs text-slate-500 hover:text-red-600">{t("ล้าง (ตามสินค้า)", "Clear (use product's)")}</button>}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{t("เช่น เทาอ่อน #F2F2F0 ให้รูปพื้นขาวดูเป็นชุดเดียวกัน · ว่าง = แบบเดิม", "e.g. light gray #F2F2F0 so white-background images look consistent · empty = as before")}</p>
        </div>
        <div>
          <label className={labelCls}>{t("ระยะห่างรูปจากขอบกรอบ", "Image padding from frame edge")}</label>
          <WheelSelect value={card.imagePad == null ? "" : String(card.imagePad)} onChange={(e) => setCard({ imagePad: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">{t("อัตโนมัติ (ไม่ตัด = เว้นนิดหน่อย · เต็มกรอบ = ชิดขอบ)", "Auto (no crop = small gap · fill frame = flush)")}</option>
            {[0, 2, 4, 6, 8, 12, 16].map((n) => <option key={n} value={n}>{n === 0 ? t("ชิดขอบ (0)", "Flush (0)") : `${n}%`}</option>)}
          </WheelSelect>
        </div>
      </div>

      {/* 🔤 ชื่อ / ราคา */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🔤 {t("ชื่อสินค้า / ราคา", "Product name / price")}</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("ความหนาชื่อ", "Name weight")}</label>
            <WheelSelect value={card.nameWeight} onChange={(e) => setCard({ nameWeight: Number(e.target.value) as Theme["card"]["nameWeight"] })}>
              <option value={400}>{t("ปกติ", "Regular")}</option>
              <option value={500}>{t("กลาง", "Medium")}</option>
              <option value={600}>{t("หนา", "Semibold")}</option>
              <option value={700}>{t("หนามาก", "Bold")}</option>
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("ระยะห่างตัวอักษร", "Letter spacing")}</label>
            <WheelSelect value={card.nameTracking} onChange={(e) => setCard({ nameTracking: Number(e.target.value) })}>
              {[0, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 0 ? t("ปกติ", "Normal") : `+${n}`}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("ชื่อหมวด", "Category name")}</label>
            <select className={inputCls} value={card.categoryPos} onChange={(e) => setCard({ categoryPos: e.target.value as Theme["card"]["categoryPos"] })}>
              <option value="above">{t("เหนือชื่อสินค้า", "Above product name")}</option>
              <option value="below">{t("ใต้ราคา", "Under price")}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.nameUpper} onChange={(e) => setCard({ nameUpper: e.target.checked })} />
            {t("ชื่อเป็นตัวพิมพ์ใหญ่ (ชื่ออังกฤษ แบบแบรนด์หรู)", "Uppercase names (English names, luxury-brand style)")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.priceFrom} onChange={(e) => setCard({ priceFrom: e.target.checked })} />
            {t("ราคา “เริ่มต้น ฿…” เมื่อแต่ละสีราคาไม่เท่ากัน", "Price “From ฿…” when colors have different prices")}
          </label>
        </div>
      </div>

      {/* 👁 ดูด่วน */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>👁 {t("ดูด่วน (Quick view) — เลือกสี/จำนวนแล้วใส่ตะกร้าได้โดยไม่ต้องเข้าหน้าสินค้า", "Quick view — pick color/quantity and add to cart without opening the product page")}</label>
        <select className={inputCls} value={card.quickView} onChange={(e) => setCard({ quickView: e.target.value as Theme["card"]["quickView"] })}>
          <option value="none">{t("ไม่มี", "None")}</option>
          <option value="button">{t("ปุ่ม 👁 มุมรูป (คอมโผล่ตอนชี้ · มือถือโชว์ตลอด)", "👁 button on image corner (desktop on hover · mobile always)")}</option>
          <option value="replace">{t("ปุ่มบนรูป \"เลือกสี / ใส่ตะกร้า\" เปิดดูด่วน (แทนใส่ตะกร้าทันที)", "\"Choose color / Add to cart\" button on image opens quick view (instead of adding right away)")}</option>
        </select>
      </div>
    </>
  );
}
/** 🖼 ระหว่างรอรูปโหลด: โลโก้จาง ๆ กลางกรอบรูป (การ์ด + หน้าสินค้า) — ตัวอย่างสดด้านขวา */
export function PlaceholderSettings({
  value,
  onChange,
  logoKey,
  surface,
  colors,
  ratio,
}: {
  value: ImagePlaceholder;
  onChange: (p: Partial<ImagePlaceholder>) => void;
  logoKey: string | null;
  surface: string;
  colors: Theme["colors"];
  ratio: string;
}) {
  const t = useT();
  const k = value.imageKey ?? logoKey;
  const url = k ? keyUrl(k, 400) : null;
  // สีพื้นตอนรอ: ชื่อสีธีม (เปลี่ยนธีมแล้วตาม) — แบรนด์จาง = สูตรเดียวกับเว็บร้าน (แบรนด์ 14% บนขาว)
  const soft = `color-mix(in srgb, ${colors.brand} 14%, white)`;
  const BG_CHOICES: { v: string; l: string; css: string }[] = [
    { v: "page", l: t("พื้นเว็บ", "Page"), css: colors.page },
    { v: "surface", l: t("พื้นการ์ด", "Card"), css: colors.surface },
    { v: "brandSoft", l: t("แบรนด์จาง", "Soft brand"), css: soft },
    { v: "brand", l: t("แบรนด์", "Brand"), css: colors.brand },
    { v: "muted", l: t("ตัวอักษรรอง", "Secondary text"), css: colors.muted },
    { v: "ink", l: t("เข้ม", "Dark"), css: colors.ink },
    { v: "white", l: t("ขาว", "White"), css: "#ffffff" },
  ];
  const custom = /^#[0-9a-f]{6}$/i.test(value.bg);
  const bgCss = !value.bg ? surface : custom ? value.bg : BG_CHOICES.find((c) => c.v === value.bg)?.css ?? surface;
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <label className={labelCls}>🖼 {t("ระหว่างรอรูปโหลด (การ์ดสินค้า + หน้าสินค้า)", "While images load (product cards + product page)")}</label>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-2">
          <select className={inputCls} value={value.mode} onChange={(e) => onChange({ mode: e.target.value as ImagePlaceholder["mode"] })}>
            <option value="logo">{t("โลโก้แบรนด์จาง ๆ กลางกรอบ แล้วรูปจริงค่อย ๆ ขึ้นทับ", "Faint brand logo in the frame, then the real image fades in")}</option>
            <option value="none">{t("พื้นเปล่า (ไม่มีโลโก้)", "Plain background (no logo)")}</option>
          </select>
          {value.mode === "logo" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500">{t("ความจาง", "Opacity")} ({value.opacity}%)</label>
                  <RangeInput min={4} max={40} step={2} value={value.opacity} onChange={(v) => onChange({ opacity: v })} className="w-full" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">{t(`ขนาดโลโก้ (${value.size}% ของกรอบ)`, `Logo size (${value.size}% of frame)`)}</label>
                  <RangeInput min={20} max={70} step={2} value={value.size} onChange={(v) => onChange({ size: v })} className="w-full" />
                </div>
              </div>
              <ImageUploadField label={t("โลโก้สำหรับจุดนี้ (ว่าง = ใช้โลโก้หลัก)", "Logo for this spot (empty = main logo)")} hint={t("แนะนำโลโก้สีเดียว พื้นใส", "A single-color logo on transparent background works best")} value={value.imageKey} onChange={(key) => onChange({ imageKey: key })} height={44} />
              {!k && <p className="text-[11px] text-amber-600">{t("ยังไม่มีรูปโลโก้ — อัปโหลดที่แท็บ “โลโก้” หรือช่องด้านบน (ไม่มีรูป = พื้นเปล่า)", "No logo image yet — upload in the “Logo” tab or the field above (no image = plain background)")}</p>}
            </>
          )}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">{t("สีพื้นตอนรอ (หายไปเมื่อรูปจริงขึ้น)", "Background while loading (disappears when the image shows)")}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ bg: "" })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${!value.bg ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                title={t("ใช้พื้นหลังรูปเดิม (ตั้งที่ “พื้นหลังหลังรูปสินค้า”)", "Use the image background (set in “Background behind product image”)")}
              >
                {t("ตามพื้นหลังรูป", "Image background")}
              </button>
              {BG_CHOICES.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  title={c.l}
                  onClick={() => onChange({ bg: c.v })}
                  className={`w-6 h-6 rounded-full border border-black/10 ${value.bg === c.v ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                  style={{ background: c.css }}
                />
              ))}
              {/* สีเอง: ตัวเลือกสีของกลาง (มีปุ่ม 💧 ดูดสีจากหน้าจอ/พรีวิว) */}
              <span title={t("สีเอง (มี 💧 ดูดสีจากหน้าจอ)", "Custom color (💧 pick from screen)")} className={`rounded ${custom ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                <ColorInput
                  value={custom ? value.bg : "#f4e3e6"}
                  allowText={false}
                  onChange={(hex) => {
                    if (/^#[0-9a-f]{6}$/i.test(hex)) onChange({ bg: hex.toLowerCase() });
                  }}
                />
              </span>
            </div>
            {custom && <p className="mt-1 text-[11px] text-amber-600">{t("สีที่เลือกเองจะไม่เปลี่ยนตามธีมร้าน", "A custom color won't follow the shop theme")}</p>}
          </div>
        </div>
        <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ aspectRatio: ratio, background: bgCss }} title={t("ตัวอย่างตอนรูปยังโหลดไม่เสร็จ", "Preview while the image is still loading")}>
          {value.mode === "logo" && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ width: `${value.size}%`, opacity: value.opacity / 100, filter: "grayscale(1)" }} />
          )}
          <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-slate-400">{t("ตัวอย่าง", "Preview")}</span>
        </div>
      </div>
    </div>
  );
}