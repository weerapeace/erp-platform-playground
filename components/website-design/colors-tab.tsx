"use client";

/** สีและธีม — ธีมที่บันทึก · ธีมทั้งชุด · ชุดสี · สีหลัก/สีละเอียด · ตรวจความอ่านง่าย (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import { contrastRatio, wcagLevel, WCAG_LABEL, suggestReadable, shades, darken } from "@/lib/color-utils";
import { FULL_THEME_PRESETS, applyFullPreset } from "@/lib/website-theme-presets";
import { FINE_COLOR_DEFAULTS, SOFT_PCT_RANGE, tintPctOf, resolveOnBrand, ON_BRAND_DARK } from "@/lib/website-theme";
import { applySavedTheme } from "@/lib/website-saved-themes";
import { SavedThemesCard } from "@/components/website-saved-themes";
import { RangeInput } from "@/components/range-input";
import { type SampleItem, type Theme, type ColorKey, FINE_COLOR_KEYS, COLOR_FIELDS, PRESETS, inputCls, labelCls, ColorField, ResetBtn } from "./shared";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-admin-en";

export function ColorsTab() {
  const t = useT();
  const { shopId, theme, published, apply, toast, setColor, setCard, sampleItems } = useDesign();
  const checks = colorChecks(theme, setColor);
  const failCount = checks.filter((c) => c.level === "fail").length;
  return (
    <>
      {/* 💾 ธีมที่บันทึกไว้ (ของกลาง components/website-saved-themes · ใช้ข้ามร้านได้) */}
      <SavedThemesCard shopId={shopId} theme={theme} onApply={(s) => apply(applySavedTheme(theme, s))} />
      {/* 🎨 ธีมทั้งชุด (lib/website-theme-presets) — สี ฟอนต์ ปุ่ม การ์ด หัวเว็บ การเปลี่ยนหน้า ในคลิกเดียว */}
      <DesignCard title={t("🎨 ธีมทั้งชุด (กดครั้งเดียว)", "🎨 Full themes (one click)")} hint={t("เปลี่ยน สี · ฟอนต์ · ปุ่ม · การ์ดสินค้า · หัวเว็บ · การเปลี่ยนหน้า พร้อมกัน — ไม่แตะโลโก้/เมนู/เนื้อหา · กดแล้วปรับต่อได้ · ↶ ย้อนกลับได้ก่อนบันทึก", "Changes colors · fonts · buttons · product cards · header · page transitions at once — logo/menu/content untouched · keep tweaking after · ↶ undo before saving")} summary={labelEn(FULL_THEME_PRESETS.find((p) => p.colors.brand === theme.colors.brand && p.colors.page === theme.colors.page)?.label ?? "") || t("ยังไม่ได้ใช้ธีมชุด — กดเลือกได้", "No full theme used yet — pick one")}>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {FULL_THEME_PRESETS.map((p) => {
            const on = theme.colors.brand === p.colors.brand && theme.colors.page === p.colors.page && theme.fonts.display === p.fonts.display;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  apply(applyFullPreset(theme, p));
                  toast.success(t(`ใช้ธีม "${p.label}" แล้ว — ปรับต่อได้ · กด ↶ เพื่อย้อนกลับ`, `Applied theme "${labelEn(p.label)}" — keep tweaking · press ↶ to undo`));
                }}
                className={`text-left rounded-xl border p-2 transition ${on ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-400"}`}
              >
                <div className="rounded-lg h-16 px-3 flex flex-col justify-center gap-1.5 border border-black/5" style={{ background: p.colors.page }}>
                  <span style={{ fontFamily: `"${p.fonts.display}", serif`, color: p.colors.ink, fontSize: 15, letterSpacing: p.key === "luxury" ? "0.12em" : undefined }}>LOUIS MONTINI</span>
                  <span className="inline-block w-fit text-[10px] px-2.5 py-0.5" style={{ background: p.colors.brand, color: "#fff", borderRadius: p.shape.button === "pill" ? 999 : p.shape.button === "square" ? 0 : 6 }}>
                    {t("ช้อปเลย", "Shop now")}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-800 mt-1.5">{labelEn(p.label)}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{labelEn(p.hint)}</p>
              </button>
            );
          })}
        </div>
      </DesignCard>
      <DesignCard title={t("ชุดสีสำเร็จรูป", "Color presets")} hint={t("เลือกแล้วปรับต่อได้ · ย้อนกลับได้ก่อนบันทึก", "Pick one, then keep tweaking · undo before saving")}>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => apply({ ...theme, ...p.theme, colors: { ...theme.colors, ...p.theme.colors }, fonts: { ...theme.fonts, ...p.theme.fonts } })} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500">
              <span className="flex gap-0.5">
                {[p.theme.colors?.brand, p.theme.colors?.ink, p.theme.colors?.page].map((c, i) => (
                  <span key={i} style={{ background: c, width: 10, height: 10, borderRadius: 3, border: "1px solid rgba(0,0,0,.1)" }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </DesignCard>

      <DesignCard title={t("สี", "Colors")} summary={<span className="inline-flex items-center gap-1">{[theme.colors.brand, theme.colors.brandDeep, theme.colors.ink, theme.colors.muted, theme.colors.page, theme.colors.surface].map((c, i) => <span key={i} className="inline-block w-3 h-3 rounded border border-black/10" style={{ background: c }} />)}</span>} right={<><button onClick={() => apply({ ...theme, colors: { ...theme.colors, brandDeep: darken(theme.colors.brand) } })} className="text-[11px] text-blue-600 hover:underline">
            {t("สร้างสีเข้มจากสีหลักอัตโนมัติ", "Auto-generate dark shade from brand color")}
          </button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>
                {f.label} <span className="text-slate-400">· {f.hint}</span>
              </label>
              <div className="flex items-center gap-2">
                <input type="color" value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5" aria-label={f.label} />
                <input value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className={inputCls} />
                <ResetBtn show={theme.colors[f.key] !== published.colors[f.key]} onClick={() => setColor(f.key, published.colors[f.key])} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className={labelCls}>{t("เฉดสีจากสีหลัก (ระบบสร้างให้อัตโนมัติ)", "Shades of brand color (auto-generated)")}</p>
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {Object.entries(shades(theme.colors.brand)).map(([k, v]) => (
              <div key={k} className="flex-1 h-8" style={{ background: v }} title={`${k} · ${v}`} />
            ))}
          </div>
        </div>
      </DesignCard>

      <FineColorsCard
        theme={theme}
        published={published}
        sample={sampleItems[0] ?? null}
        setColor={setColor}
        setSoft={(n) => apply({ ...theme, colors: { ...theme.colors, softPct: n } })}
        setSaleBadge={(v) => setCard({ autoBadges: { ...theme.card.autoBadges, saleColor: v } })}
        onResetAll={() => apply({ ...theme, colors: { ...theme.colors, ...FINE_COLOR_DEFAULTS } })}
      />

      <DesignCard title={t("ตรวจความอ่านง่าย (WCAG)", "Readability check (WCAG)")} hint={<>{failCount ? t(`⚠️ พบ ${failCount} จุดที่อ่านยาก`, `⚠️ ${failCount} hard-to-read spots`) : t("✓ ผ่านทุกจุด", "✓ All pass")}</>} summary={failCount ? t(`ต้องแก้ ${failCount} คู่สี`, `${failCount} color pairs need fixing`) : t(`อ่านง่ายครบ ${checks.length} คู่สี`, `All ${checks.length} color pairs readable`)}>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded shrink-0" style={{ background: c.bg, color: c.fg, minWidth: 46 }}>Aa</span>
              <span className="flex-1 text-slate-600">{c.label}</span>
              <span className={c.level === "fail" ? "text-red-600" : c.level === "AA-large" ? "text-amber-600" : "text-emerald-600"}>
                {c.ratio}:1 · {labelEn(WCAG_LABEL[c.level])}
              </span>
              {c.suggest && c.fix && (
                <button onClick={() => c.fix!(c.suggest!)} className="text-blue-600 hover:underline whitespace-nowrap">
                  {t("ใช้", "Use")} {c.suggest}
                </button>
              )}
              {c.level === "fail" && !c.fix && <span className="text-[10px] text-slate-400 whitespace-nowrap">{t("ปรับสีป้ายในช่องด้านบน", "Adjust the badge color above")}</span>}
            </li>
          ))}
        </ul>
      </DesignCard>
    </>
  );
}

/* ─────────── 🎨 สีละเอียด + การ์ดตัวอย่างสด (แท็บสี) ─────────── */
export const ON_BRAND_CHOICES: { v: string; label: string }[] = [
  { v: "#FFFFFF", get label() { return tr("ขาว", "White"); } },
  { v: ON_BRAND_DARK, get label() { return tr("ดำ", "Black"); } },
  { v: "auto", get label() { return tr("อัตโนมัติ", "Auto"); } },
];
export function FineColorsCard({
  theme,
  published,
  sample,
  setColor,
  setSoft,
  setSaleBadge,
  onResetAll,
}: {
  theme: Theme;
  published: Theme;
  sample: SampleItem | null;
  setColor: (k: ColorKey, v: string) => void;
  setSoft: (n: number) => void;
  setSaleBadge: (v: string) => void;
  onResetAll: () => void;
}) {
  const t = useT();
  const c = theme.colors;
  const d = FINE_COLOR_DEFAULTS;
  const changed = FINE_COLOR_KEYS.filter((k) => c[k] !== d[k]).length;
  const pubChanged = FINE_COLOR_KEYS.some((k) => c[k] !== published.colors[k]);
  // ช่องที่ "ว่าง = ค่าเริ่มต้น": โชว์ว่างเมื่อเท่าค่าเริ่มต้น · ล้าง = กลับค่าเริ่มต้น
  const fine = (k: "line" | "stockIn" | "stockLow", label: string) => (
    <ColorField label={label} value={c[k] === d[k] ? "" : c[k]} emptyLabel={t(`ค่าเริ่มต้น ${d[k]}`, `Default ${d[k]}`)} onChange={(v) => setColor(k, v || d[k])} />
  );
  const customOn = c.onBrand !== "auto" && !ON_BRAND_CHOICES.some((o) => o.v === c.onBrand);
  return (
    <DesignCard title={t("🎨 ปรับสีละเอียด", "🎨 Fine-tune colors")} hint={<>{t("ไม่ตั้ง = หน้าตาเดิมของเว็บ · ตัวอย่างด้านล่างเปลี่ยนตามทันที", "Not set = site's original look · the preview below updates instantly")} {pubChanged && <span className="text-amber-600">{t("· มีค่าที่ยังไม่เผยแพร่", "· has unpublished changes")}</span>}</>} summary={changed ? t(`ปรับแล้ว ${changed} สี`, `${changed} colors customized`) : t("ใช้สีตามธีมทั้งหมด", "All colors follow the theme")} right={<>{changed > 0 && (
          <button type="button" onClick={onResetAll} className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0" title={t("สีละเอียดทั้งหมดกลับเป็นค่าเริ่มต้น", "Reset all fine colors to default")}>
            ↺ {t("ค่าเริ่มต้นทั้งหมด", "Reset all")}
          </button>
        )}</>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,260px)]">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">{t("ปุ่ม · เส้นขอบ · ลิงก์", "Buttons · borders · links")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("ตัวอักษรบนปุ่ม/ป้ายสีหลัก", "Text on brand buttons/badges")}</label>
                <div className="flex flex-wrap items-center gap-1">
                  {ON_BRAND_CHOICES.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setColor("onBrand", o.v)}
                      className={`h-7 px-2.5 rounded-lg border text-xs ${c.onBrand === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    >
                      {o.v !== "auto" && <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px] border border-black/10" style={{ background: o.v }} />}
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5">
                  <ColorField label="" value={customOn ? c.onBrand : ""} emptyLabel={t("เลือกสีเอง…", "Custom color…")} onChange={(v) => setColor("onBrand", v || d.onBrand)} />
                </div>
                {c.onBrand === "auto" && <p className="mt-1 text-[10px] text-slate-400">{resolveOnBrand(c) === "#FFFFFF" ? t("ตอนนี้ใช้ ขาว (เปลี่ยนเองตามสีหลัก)", "Currently white (changes with brand color)") : t("ตอนนี้ใช้ ดำ (เปลี่ยนเองตามสีหลัก)", "Currently black (changes with brand color)")}</p>}
              </div>
              {fine("line", t("เส้นขอบ / เส้นคั่น (ทั้งเว็บ)", "Borders / dividers (whole site)"))}
              <ColorField label={t("สีลิงก์ (ลิงก์ในข้อความ + ตอนชี้ชื่อสินค้า/เมนูย่อย)", "Link color (text links + product name/submenu hover)")} value={c.link} emptyLabel={t("ใช้สีหลัก", "Use brand color")} onChange={(v) => setColor("link", v)} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">{t("ราคา · ป้ายลดราคา", "Price · sale badge")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label={t("สีราคา", "Price color")} value={c.price} emptyLabel={t("ตามเดิม", "Unchanged")} onChange={(v) => setColor("price", v)} />
              <ColorField label={t("สีราคาตอนลดราคา", "Sale price color")} value={c.sale} emptyLabel={t("เท่าสีราคา", "Same as price")} onChange={(v) => setColor("sale", v)} />
              <div>
                <ColorField label={t("สีป้ายลดราคา (ลด xx%)", "Sale badge color (-xx%)")} value={theme.card.autoBadges.saleColor} emptyLabel={t("ค่าเริ่มต้น", "Default")} onChange={(v) => setSaleBadge(v || "#C62828")} />
                {!theme.card.autoBadges.sale && <p className="mt-1 text-[10px] text-amber-600">{t("ป้ายลด % ยังปิดอยู่ — เปิดที่แท็บ การ์ดสินค้า → ป้ายอัตโนมัติ", "The % off badge is off — turn it on in Product card → Auto badges")}</p>}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">{t("สถานะสต๊อก", "Stock status")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fine("stockIn", t("“พร้อมส่ง”", "“In stock”"))}
              {fine("stockLow", t("“เหลือน้อย”", "“Low stock”"))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-1">{t("ความเข้มสีอ่อน (พื้นป้าย/กล่องเน้น)", "Soft tint strength (badge/highlight backgrounds)")}</p>
            <div className="flex items-center gap-3">
              <RangeInput min={SOFT_PCT_RANGE.min} max={SOFT_PCT_RANGE.max} value={c.softPct} onChange={(v) => setSoft(v)} className="flex-1" ariaLabel={t("ความเข้มสีอ่อน", "Soft tint strength")} />
              <span className="text-xs text-slate-600 w-10 text-right">{c.softPct}%</span>
              {c.softPct !== d.softPct && (
                <button type="button" onClick={() => setSoft(d.softPct)} className="text-[11px] text-slate-400 hover:text-slate-700" title={t(`กลับค่าเริ่มต้น ${d.softPct}%`, `Back to default ${d.softPct}%`)}>
                  ↺
                </button>
              )}
            </div>
            <div className="mt-1.5 flex gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c.brand} ${c.softPct}%, white)`, color: c.brandDeep }}>{t("สีอ่อน", "Soft")}</span>
              <span className="px-2.5 py-1 rounded-full border border-black/5" style={{ background: `color-mix(in srgb, ${c.brand} ${tintPctOf(c.softPct)}%, white)`, color: c.ink }}>{t("สีจางมาก", "Very faint")}</span>
            </div>
          </div>
        </div>
        <ColorsLivePreview theme={theme} sample={sample} />
      </div>
    </DesignCard>
  );
}
/** 👁 ตัวอย่างสด: การ์ดราคาปกติ + การ์ดลดราคา + ปุ่ม/ลิงก์/เส้น — ใช้สีจริงของธีมที่กำลังแก้ */
export function ColorsLivePreview({ theme, sample }: { theme: Theme; sample: SampleItem | null }) {
  const t = useT();
  const [hoverBtn, setHoverBtn] = useState(false);
  const [hoverName, setHoverName] = useState<number | null>(null);
  const c = theme.colors;
  const name = sample?.name || t("กระเป๋าหนังแท้ รุ่นตัวอย่าง", "Sample leather bag");
  const img = sample?.images[0] ?? null;
  const price = sample?.price || 1290;
  const compare = sample?.comparePrice && sample.comparePrice > price ? sample.comparePrice : Math.round((price * 1.25) / 10) * 10;
  const pct = Math.round((1 - price / compare) * 100);
  const ab = theme.card.autoBadges;
  const soft = `color-mix(in srgb, ${c.brand} ${c.softPct}%, white)`;
  const tint = `color-mix(in srgb, ${c.brand} ${tintPctOf(c.softPct)}%, white)`;
  const card = (i: number, sale: boolean) => (
    <div key={i} className="rounded-lg overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
      <div className="relative" style={{ aspectRatio: "1 / 1", background: tint }}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {sale && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 text-white" style={{ background: ab.saleColor, borderRadius: ab.shape === "pill" ? 99 : 2 }}>
            {ab.saleText.replace("{pct}", String(pct))}
          </span>
        )}
      </div>
      <div className="p-1.5">
        <span className="inline-flex items-center gap-1 text-[8px]" style={{ color: sale ? c.stockLow : c.stockIn }}>
          <span className="w-1 h-1 rounded-full" style={{ background: sale ? c.stockLow : c.stockIn }} />
          {sale ? t("เหลือน้อย", "Low stock") : t("พร้อมส่ง", "In stock")}
        </span>
        <div
          className="text-[10px] leading-snug line-clamp-2 cursor-pointer"
          style={{ fontFamily: theme.fonts.display, color: hoverName === i ? c.link || c.brand : c.ink }}
          onMouseEnter={() => setHoverName(i)}
          onMouseLeave={() => setHoverName(null)}
        >
          {name}
        </div>
        <div className="mt-0.5 text-[10px]">
          <span className="font-semibold" style={{ fontFamily: theme.fonts.display, color: (sale && c.sale) || c.price || c.ink }}>฿{price.toLocaleString("th-TH")}</span>
          {sale && <s className="ml-1 text-[8px]" style={{ color: c.muted }}>฿{compare.toLocaleString("th-TH")}</s>}
        </div>
      </div>
    </div>
  );
  return (
    <div className="rounded-xl p-2.5 self-start" style={{ background: c.page, border: `1px solid ${c.line}`, fontFamily: theme.fonts.body }}>
      <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: c.muted }}>{t("ตัวอย่างสด", "Live preview")}</p>
      <div className="grid grid-cols-2 gap-1.5">{[card(0, false), card(1, true)]}</div>
      <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${c.line}` }}>
        <button
          type="button"
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
          className="w-full h-7 rounded-md text-[11px] font-medium transition-colors"
          style={{ background: hoverBtn ? c.brandDeep : c.brand, color: resolveOnBrand(c) }}
        >
          {t("ใส่ตะกร้า", "Add to cart")}
        </button>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] underline cursor-pointer" style={{ color: c.link || c.brand }}>{t("ดูรายละเอียดเพิ่มเติม", "View details")}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: soft, color: c.brandDeep }}>{t("ส่งฟรี", "Free shipping")}</span>
        </div>
        <p className="text-[9px]" style={{ color: c.muted }}>{t("ชี้ปุ่ม/ชื่อสินค้าเพื่อดูสีตอนชี้", "Hover the button/product name to see hover colors")}</p>
      </div>
    </div>
  );
}

/** 🔎 ตรวจความอ่านง่าย — ทุกคู่สีที่ลูกค้าเห็นจริง · fix = ช่องที่จะเปลี่ยนเมื่อกด "ใช้ #xxx" — ใช้ร่วม แท็บสี + หน้าภาพรวม ("ข้อความอ่านยาก") */
export function colorChecks(theme: Theme, setColor?: (k: ColorKey, v: string) => void) {
  const fx = (k: ColorKey) => (setColor ? (v: string) => setColor(k, v) : null);
  const tc = theme.colors;
  const onBrand = resolveOnBrand(tc);
  return (
    [
      { label: tr("ตัวอักษรบนพื้นหลังเว็บ", "Text on page background"), fg: tc.ink, bg: tc.page, fix: fx("ink") },
      { label: tr("ตัวอักษรรองบนพื้นการ์ด", "Secondary text on card background"), fg: tc.muted, bg: tc.surface, fix: fx("muted") },
      { label: tr("ตัวอักษรบนปุ่มสีหลัก", "Text on brand button"), fg: onBrand, bg: tc.brand, fix: fx("onBrand") },
      { label: tr("สีแบรนด์บนพื้นหลังเว็บ", "Brand color on page background"), fg: tc.brand, bg: tc.page, fix: fx("brand") },
      tc.link ? { label: tr("ลิงก์บนพื้นหลังเว็บ", "Links on page background"), fg: tc.link, bg: tc.page, fix: fx("link") } : null,
      tc.price ? { label: tr("ราคาบนพื้นการ์ด", "Price on card background"), fg: tc.price, bg: tc.surface, fix: fx("price") } : null,
      tc.sale ? { label: tr("ราคาลดบนพื้นการ์ด", "Sale price on card background"), fg: tc.sale, bg: tc.surface, fix: fx("sale") } : null,
      { label: tr("“พร้อมส่ง” บนพื้นการ์ด", "“In stock” on card background"), fg: tc.stockIn, bg: tc.surface, fix: fx("stockIn") },
      { label: tr("“เหลือน้อย” บนพื้นการ์ด", "“Low stock” on card background"), fg: tc.stockLow, bg: tc.surface, fix: fx("stockLow") },
      { label: tr("ตัวอักษรขาวบนป้ายลดราคา", "White text on sale badge"), fg: "#FFFFFF", bg: theme.card.autoBadges.saleColor, fix: null },
    ].filter((c): c is { label: string; fg: string; bg: string; fix: ((v: string) => void) | null } => !!c)
  ).map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const level = wcagLevel(ratio);
    return { ...c, ratio, level, suggest: level === "fail" ? suggestReadable(c.fg, c.bg) : null };
  });
}
