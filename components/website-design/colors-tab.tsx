"use client";

/** สีและธีม — ธีมที่บันทึก · ธีมทั้งชุด · ชุดสี · สีหลัก/สีละเอียด · ตรวจความอ่านง่าย (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import { contrastRatio, wcagLevel, WCAG_LABEL, suggestReadable, shades, darken } from "@/lib/color-utils";
import { FULL_THEME_PRESETS, applyFullPreset } from "@/lib/website-theme-presets";
import { FINE_COLOR_DEFAULTS, SOFT_PCT_RANGE, tintPctOf, resolveOnBrand, ON_BRAND_DARK } from "@/lib/website-theme";
import { applySavedTheme } from "@/lib/website-saved-themes";
import { SavedThemesCard } from "@/components/website-saved-themes";
import { RangeInput } from "@/components/range-input";
import { type SampleItem, type Theme, type ColorKey, FINE_COLOR_KEYS, COLOR_FIELDS, PRESETS, inputCls, labelCls, cardCls, ColorField, ResetBtn } from "./shared";
import { useDesign } from "./context";

export function ColorsTab() {
  const { shopId, theme, published, apply, toast, setColor, setCard, sampleItems } = useDesign();
  // 🔎 ตรวจความอ่านง่าย — ทุกคู่สีที่ลูกค้าเห็นจริง · fix = ช่องที่จะเปลี่ยนเมื่อกด "ใช้ #xxx"
  const tc = theme.colors;
  const onBrand = resolveOnBrand(tc);
  const checks = (
    [
      { label: "ตัวอักษรบนพื้นหลังเว็บ", fg: tc.ink, bg: tc.page, fix: (v: string) => setColor("ink", v) },
      { label: "ตัวอักษรรองบนพื้นการ์ด", fg: tc.muted, bg: tc.surface, fix: (v: string) => setColor("muted", v) },
      { label: "ตัวอักษรบนปุ่มสีหลัก", fg: onBrand, bg: tc.brand, fix: (v: string) => setColor("onBrand", v) },
      { label: "สีแบรนด์บนพื้นหลังเว็บ", fg: tc.brand, bg: tc.page, fix: (v: string) => setColor("brand", v) },
      tc.link ? { label: "ลิงก์บนพื้นหลังเว็บ", fg: tc.link, bg: tc.page, fix: (v: string) => setColor("link", v) } : null,
      tc.price ? { label: "ราคาบนพื้นการ์ด", fg: tc.price, bg: tc.surface, fix: (v: string) => setColor("price", v) } : null,
      tc.sale ? { label: "ราคาลดบนพื้นการ์ด", fg: tc.sale, bg: tc.surface, fix: (v: string) => setColor("sale", v) } : null,
      { label: "“พร้อมส่ง” บนพื้นการ์ด", fg: tc.stockIn, bg: tc.surface, fix: (v: string) => setColor("stockIn", v) },
      { label: "“เหลือน้อย” บนพื้นการ์ด", fg: tc.stockLow, bg: tc.surface, fix: (v: string) => setColor("stockLow", v) },
      { label: "ตัวอักษรขาวบนป้ายลดราคา", fg: "#FFFFFF", bg: theme.card.autoBadges.saleColor, fix: null },
    ].filter((c): c is { label: string; fg: string; bg: string; fix: ((v: string) => void) | null } => !!c)
  ).map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const level = wcagLevel(ratio);
    return { ...c, ratio, level, suggest: level === "fail" ? suggestReadable(c.fg, c.bg) : null };
  });
  const failCount = checks.filter((c) => c.level === "fail").length;
  return (
    <>
      {/* 💾 ธีมที่บันทึกไว้ (ของกลาง components/website-saved-themes · ใช้ข้ามร้านได้) */}
      <SavedThemesCard shopId={shopId} theme={theme} onApply={(s) => apply(applySavedTheme(theme, s))} />
      {/* 🎨 ธีมทั้งชุด (lib/website-theme-presets) — สี ฟอนต์ ปุ่ม การ์ด หัวเว็บ การเปลี่ยนหน้า ในคลิกเดียว */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">🎨 ธีมทั้งชุด (กดครั้งเดียว)</h3>
        <p className="text-[11px] text-slate-500 mb-3">เปลี่ยน สี · ฟอนต์ · ปุ่ม · การ์ดสินค้า · หัวเว็บ · การเปลี่ยนหน้า พร้อมกัน — ไม่แตะโลโก้/เมนู/เนื้อหา · กดแล้วปรับต่อได้ · ↶ ย้อนกลับได้ก่อนบันทึก</p>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {FULL_THEME_PRESETS.map((p) => {
            const on = theme.colors.brand === p.colors.brand && theme.colors.page === p.colors.page && theme.fonts.display === p.fonts.display;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  apply(applyFullPreset(theme, p));
                  toast.success(`ใช้ธีม "${p.label}" แล้ว — ปรับต่อได้ · กด ↶ เพื่อย้อนกลับ`);
                }}
                className={`text-left rounded-xl border p-2 transition ${on ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-400"}`}
              >
                <div className="rounded-lg h-16 px-3 flex flex-col justify-center gap-1.5 border border-black/5" style={{ background: p.colors.page }}>
                  <span style={{ fontFamily: `"${p.fonts.display}", serif`, color: p.colors.ink, fontSize: 15, letterSpacing: p.key === "luxury" ? "0.12em" : undefined }}>LOUIS MONTINI</span>
                  <span className="inline-block w-fit text-[10px] px-2.5 py-0.5" style={{ background: p.colors.brand, color: "#fff", borderRadius: p.shape.button === "pill" ? 999 : p.shape.button === "square" ? 0 : 6 }}>
                    ช้อปเลย
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-800 mt-1.5">{p.label}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{p.hint}</p>
              </button>
            );
          })}
        </div>
      </div>
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">ชุดสีสำเร็จรูป</h3>
        <p className="text-[11px] text-slate-500 mb-3">เลือกแล้วปรับต่อได้ · ย้อนกลับได้ก่อนบันทึก</p>
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
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">สี</h3>
          <button onClick={() => apply({ ...theme, colors: { ...theme.colors, brandDeep: darken(theme.colors.brand) } })} className="text-[11px] text-blue-600 hover:underline">
            สร้างสีเข้มจากสีหลักอัตโนมัติ
          </button>
        </div>
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
          <p className={labelCls}>เฉดสีจากสีหลัก (ระบบสร้างให้อัตโนมัติ)</p>
          <div className="flex rounded-lg overflow-hidden border border-slate-200">
            {Object.entries(shades(theme.colors.brand)).map(([k, v]) => (
              <div key={k} className="flex-1 h-8" style={{ background: v }} title={`${k} · ${v}`} />
            ))}
          </div>
        </div>
      </div>

      <FineColorsCard
        theme={theme}
        published={published}
        sample={sampleItems[0] ?? null}
        setColor={setColor}
        setSoft={(n) => apply({ ...theme, colors: { ...theme.colors, softPct: n } })}
        setSaleBadge={(v) => setCard({ autoBadges: { ...theme.card.autoBadges, saleColor: v } })}
        onResetAll={() => apply({ ...theme, colors: { ...theme.colors, ...FINE_COLOR_DEFAULTS } })}
      />

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">ตรวจความอ่านง่าย (WCAG)</h3>
        <p className="text-[11px] text-slate-500 mb-3">{failCount ? `⚠️ พบ ${failCount} จุดที่อ่านยาก` : "✓ ผ่านทุกจุด"}</p>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded shrink-0" style={{ background: c.bg, color: c.fg, minWidth: 46 }}>Aa</span>
              <span className="flex-1 text-slate-600">{c.label}</span>
              <span className={c.level === "fail" ? "text-red-600" : c.level === "AA-large" ? "text-amber-600" : "text-emerald-600"}>
                {c.ratio}:1 · {WCAG_LABEL[c.level]}
              </span>
              {c.suggest && c.fix && (
                <button onClick={() => c.fix!(c.suggest!)} className="text-blue-600 hover:underline whitespace-nowrap">
                  ใช้ {c.suggest}
                </button>
              )}
              {c.level === "fail" && !c.fix && <span className="text-[10px] text-slate-400 whitespace-nowrap">ปรับสีป้ายในช่องด้านบน</span>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ─────────── 🎨 สีละเอียด + การ์ดตัวอย่างสด (แท็บสี) ─────────── */
export const ON_BRAND_CHOICES: { v: string; label: string }[] = [
  { v: "#FFFFFF", label: "ขาว" },
  { v: ON_BRAND_DARK, label: "ดำ" },
  { v: "auto", label: "อัตโนมัติ" },
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
  const c = theme.colors;
  const d = FINE_COLOR_DEFAULTS;
  const changed = FINE_COLOR_KEYS.filter((k) => c[k] !== d[k]).length;
  const pubChanged = FINE_COLOR_KEYS.some((k) => c[k] !== published.colors[k]);
  // ช่องที่ "ว่าง = ค่าเริ่มต้น": โชว์ว่างเมื่อเท่าค่าเริ่มต้น · ล้าง = กลับค่าเริ่มต้น
  const fine = (k: "line" | "stockIn" | "stockLow", label: string) => (
    <ColorField label={label} value={c[k] === d[k] ? "" : c[k]} emptyLabel={`ค่าเริ่มต้น ${d[k]}`} onChange={(v) => setColor(k, v || d[k])} />
  );
  const customOn = c.onBrand !== "auto" && !ON_BRAND_CHOICES.some((o) => o.v === c.onBrand);
  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-800">🎨 ปรับสีละเอียด</h3>
        {changed > 0 && (
          <button type="button" onClick={onResetAll} className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0" title="สีละเอียดทั้งหมดกลับเป็นค่าเริ่มต้น">
            ↺ ค่าเริ่มต้นทั้งหมด
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        ไม่ตั้ง = หน้าตาเดิมของเว็บ · ตัวอย่างด้านล่างเปลี่ยนตามทันที {pubChanged && <span className="text-amber-600">· มีค่าที่ยังไม่เผยแพร่</span>}
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,260px)]">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">ปุ่ม · เส้นขอบ · ลิงก์</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ตัวอักษรบนปุ่ม/ป้ายสีหลัก</label>
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
                  <ColorField label="" value={customOn ? c.onBrand : ""} emptyLabel="เลือกสีเอง…" onChange={(v) => setColor("onBrand", v || d.onBrand)} />
                </div>
                {c.onBrand === "auto" && <p className="mt-1 text-[10px] text-slate-400">ตอนนี้ใช้ {resolveOnBrand(c) === "#FFFFFF" ? "ขาว" : "ดำ"} (เปลี่ยนเองตามสีหลัก)</p>}
              </div>
              {fine("line", "เส้นขอบ / เส้นคั่น (ทั้งเว็บ)")}
              <ColorField label="สีลิงก์ (ลิงก์ในข้อความ + ตอนชี้ชื่อสินค้า/เมนูย่อย)" value={c.link} emptyLabel="ใช้สีหลัก" onChange={(v) => setColor("link", v)} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">ราคา · ป้ายลดราคา</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label="สีราคา" value={c.price} emptyLabel="ตามเดิม" onChange={(v) => setColor("price", v)} />
              <ColorField label="สีราคาตอนลดราคา" value={c.sale} emptyLabel="เท่าสีราคา" onChange={(v) => setColor("sale", v)} />
              <div>
                <ColorField label="สีป้ายลดราคา (ลด xx%)" value={theme.card.autoBadges.saleColor} emptyLabel="ค่าเริ่มต้น" onChange={(v) => setSaleBadge(v || "#C62828")} />
                {!theme.card.autoBadges.sale && <p className="mt-1 text-[10px] text-amber-600">ป้ายลด % ยังปิดอยู่ — เปิดที่แท็บ การ์ดสินค้า → ป้ายอัตโนมัติ</p>}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">สถานะสต๊อก</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fine("stockIn", "“พร้อมส่ง”")}
              {fine("stockLow", "“เหลือน้อย”")}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-1">ความเข้มสีอ่อน (พื้นป้าย/กล่องเน้น)</p>
            <div className="flex items-center gap-3">
              <RangeInput min={SOFT_PCT_RANGE.min} max={SOFT_PCT_RANGE.max} value={c.softPct} onChange={(v) => setSoft(v)} className="flex-1" ariaLabel="ความเข้มสีอ่อน" />
              <span className="text-xs text-slate-600 w-10 text-right">{c.softPct}%</span>
              {c.softPct !== d.softPct && (
                <button type="button" onClick={() => setSoft(d.softPct)} className="text-[11px] text-slate-400 hover:text-slate-700" title={`กลับค่าเริ่มต้น ${d.softPct}%`}>
                  ↺
                </button>
              )}
            </div>
            <div className="mt-1.5 flex gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c.brand} ${c.softPct}%, white)`, color: c.brandDeep }}>สีอ่อน</span>
              <span className="px-2.5 py-1 rounded-full border border-black/5" style={{ background: `color-mix(in srgb, ${c.brand} ${tintPctOf(c.softPct)}%, white)`, color: c.ink }}>สีจางมาก</span>
            </div>
          </div>
        </div>
        <ColorsLivePreview theme={theme} sample={sample} />
      </div>
    </div>
  );
}
/** 👁 ตัวอย่างสด: การ์ดราคาปกติ + การ์ดลดราคา + ปุ่ม/ลิงก์/เส้น — ใช้สีจริงของธีมที่กำลังแก้ */
export function ColorsLivePreview({ theme, sample }: { theme: Theme; sample: SampleItem | null }) {
  const [hoverBtn, setHoverBtn] = useState(false);
  const [hoverName, setHoverName] = useState<number | null>(null);
  const c = theme.colors;
  const name = sample?.name || "กระเป๋าหนังแท้ รุ่นตัวอย่าง";
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
          {sale ? "เหลือน้อย" : "พร้อมส่ง"}
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
      <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: c.muted }}>ตัวอย่างสด</p>
      <div className="grid grid-cols-2 gap-1.5">{[card(0, false), card(1, true)]}</div>
      <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${c.line}` }}>
        <button
          type="button"
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
          className="w-full h-7 rounded-md text-[11px] font-medium transition-colors"
          style={{ background: hoverBtn ? c.brandDeep : c.brand, color: resolveOnBrand(c) }}
        >
          ใส่ตะกร้า
        </button>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] underline cursor-pointer" style={{ color: c.link || c.brand }}>ดูรายละเอียดเพิ่มเติม</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: soft, color: c.brandDeep }}>ส่งฟรี</span>
        </div>
        <p className="text-[9px]" style={{ color: c.muted }}>ชี้ปุ่ม/ชื่อสินค้าเพื่อดูสีตอนชี้</p>
      </div>
    </div>
  );
}