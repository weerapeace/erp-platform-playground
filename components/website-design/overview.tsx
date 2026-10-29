"use client";

/**
 * 🏠 ภาพรวมดีไซน์ — หน้าแรกของแท็บดีไซน์ (เมนูซ้าย "ภาพรวม")
 * สถานะร่าง/เผยแพร่ · สิ่งที่ควรทำ (อ่านยาก · ไม่มี Favicon · คำแปลที่ขาด) · การ์ดหมวดพร้อมตัวอย่างหน้าตาจริงย่อ ๆ
 * (สี ฟอนต์ ปุ่ม · หัว-ท้ายเว็บ · รูปสินค้า) + รายการหัวข้อพร้อมสรุปค่าปัจจุบัน
 * กดการ์ด = ไปหน้านั้น (หัวข้อ/สรุปจากทะเบียนกลาง lib/website-design-nav)
 */
import { useMemo, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { coverageOf, collectTextPaths } from "@/lib/content-i18n";
import { THEME_TEXT_KEYS, resolveOnBrand } from "@/lib/website-theme";
import { FULL_THEME_PRESETS } from "@/lib/website-theme-presets";
import { CART_STYLES } from "@/lib/website-cart";
import { DESIGN_GROUPS, DESIGN_PAGES, type DesignPageKey } from "@/lib/website-design-nav";
import { colorChecks } from "./colors-tab";
import { timeAgo, type Choices, type SampleItem, type Theme } from "./shared";
import { RATIO_CSS } from "./sample-card";
import { keyUrl } from "@/components/website-theme-media";
import { contrastRatio } from "@/lib/color-utils";
import { useDesign } from "./context";

type PageKey = Exclude<DesignPageKey, "overview">;

const labelOf = <T,>(list: { value: T; label: string }[] | undefined, v: T) => list?.find((o) => o.value === v)?.label ?? String(v);
const TRANSITION_LABEL: Record<string, string> = { fade: "จางเปลี่ยนหน้า", rise: "เลื่อนขึ้น", curtain: "ม่านสีแบรนด์", logo: "โลโก้วาบ", zoom: "ซูมเข้า", none: "ไม่มีเอฟเฟกต์" };
const CHECKOUT_LAYOUT_LABEL: Record<string, string> = { right: "สรุปอยู่ขวา", left: "สรุปอยู่ซ้าย", top: "สรุปอยู่บน" };
const Swatch = ({ c }: { c: string }) => <span className="inline-block w-3 h-3 rounded border border-black/10 align-middle" style={{ background: c }} />;

/** สรุปค่าปัจจุบันของแต่ละหน้า (บรรทัดเดียว) */
function pageSummary(k: PageKey, theme: Theme, choices: Choices, extra: { schedules: number; lastVersion: { version_no: number; created_at: string } | null }): ReactNode {
  switch (k) {
    case "colors": {
      const preset = FULL_THEME_PRESETS.find((p) => p.colors.brand === theme.colors.brand && p.colors.page === theme.colors.page);
      return (
        <span className="inline-flex items-center gap-1">
          <Swatch c={theme.colors.brand} />
          <Swatch c={theme.colors.ink} />
          <Swatch c={theme.colors.page} />
          <span className="ml-1">{preset ? preset.label : "สีของร้าน"}</span>
        </span>
      );
    }
    case "fonts":
      return `${theme.fonts.display} / ${theme.fonts.body}`;
    case "shape":
      return labelOf(choices.radius, theme.radius);
    case "motion":
      return `${TRANSITION_LABEL[theme.page.transition] ?? theme.page.transition}${theme.page.smoothScroll ? " · เลื่อนนุ่ม" : ""}`;
    case "mobile":
      return `แถบล่าง ${theme.page.mobileNav.items.length} ปุ่ม`;
    case "logo":
      return `${labelOf(choices.logoModes, theme.logo.mode)} · สูง ${theme.logo.height}px`;
    case "header":
      return `${labelOf(choices.headerBg, theme.header.bg)} · สูง ${theme.header.height}px${theme.header.sticky ? " · ตรึงด้านบน" : ""}`;
    case "menu": {
      const items = theme.menu.items;
      if (!items) return "เมนูอัตโนมัติ";
      const panels = items.filter((i) => i.panel || i.mega).length;
      return `${items.length} เมนู${panels ? ` · แผงใหญ่ ${panels}` : ""}`;
    }
    case "footer":
      return theme.footer.columns ? `${theme.footer.columns.length} คอลัมน์` : "คอลัมน์อัตโนมัติ";
    case "card":
      return `${labelOf(choices.cardPresets, theme.card.preset)} · รูป ${theme.card.imageRatio}`;
    case "listing":
      return `${theme.listing.pageSize} ชิ้นต่อหน้า`;
    case "product":
      return `Style ${labelOf(choices.productLayouts, theme.product.layout)}`;
    case "related":
      return theme.product.hidden.includes("related") ? "ปิด “คุณอาจชอบ”" : "เปิด “คุณอาจชอบ”";
    case "cart":
      return `${labelOf(CART_STYLES, theme.cart.style)}${theme.cart.freeShip ? " · แถบส่งฟรี" : ""}`;
    case "checkout":
      return CHECKOUT_LAYOUT_LABEL[theme.checkout.layout] ?? theme.checkout.layout;
    case "pages":
      return "404 · ขอบคุณ · ป๊อปอัป · เข้าสู่ระบบ";
    case "campaign":
      return extra.schedules ? `${extra.schedules} รายการรอทำงาน` : "ยังไม่มีตั้งเวลา/แคมเปญ";
    case "history":
      return extra.lastVersion ? `ล่าสุด เวอร์ชัน ${extra.lastVersion.version_no} · ${timeAgo(extra.lastVersion.created_at)}` : "ยังไม่เคยเผยแพร่";
  }
}

export function DesignOverview({
  dirty,
  hadDraft,
  lastVersion,
  onGo,
  onEnglish,
}: {
  dirty: PageKey[];
  hadDraft: boolean;
  lastVersion: { version_no: number; created_at: string } | null;
  /** ไปหน้า (+ การ์ดที่ต้องการ) */
  onGo: (page: PageKey, card?: string) => void;
  /** สลับไปแก้ภาษาอังกฤษ */
  onEnglish: () => void;
}) {
  const { theme, choices, schedules, sampleItems } = useDesign();
  const failCount = useMemo(() => colorChecks(theme).filter((c) => c.level === "fail").length, [theme]);
  const enMissing = useMemo(() => coverageOf(collectTextPaths(theme, THEME_TEXT_KEYS)).missing, [theme]);
  const pending = (schedules ?? []).filter((s) => s.status === "pending").length;
  const todos: { key: string; text: string; tone: "warn" | "en"; onClick: () => void }[] = [];
  if (failCount) todos.push({ key: "wcag", text: `ข้อความอ่านยาก ${failCount} คู่สี`, tone: "warn", onClick: () => onGo("colors", "ตรวจความอ่านง่าย (WCAG)") });
  if (!theme.logo.faviconKey) todos.push({ key: "favicon", text: "ยังไม่มีไอคอนแท็บเบราว์เซอร์ (Favicon)", tone: "warn", onClick: () => onGo("logo", "รูปโลโก้ & ไอคอน") });
  if (enMissing) todos.push({ key: "en", text: `ข้อความภาษาอังกฤษยังขาด ${enMissing} ช่อง`, tone: "en", onClick: onEnglish });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {dirty.length ? `แก้แล้ว ${dirty.length} หัวข้อ ยังไม่บันทึก` : hadDraft ? "มีร่างที่ยังไม่เผยแพร่" : "เผยแพร่ล่าสุดแล้ว ไม่มีอะไรค้าง"}
          </p>
          <p className="text-xs text-slate-500">{lastVersion ? `เว็บจริงใช้เวอร์ชัน ${lastVersion.version_no} · ${timeAgo(lastVersion.created_at)}` : "ยังไม่เคยเผยแพร่"}</p>
        </div>
        {todos.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-design-todos>
            {todos.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.onClick}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${t.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400" : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400"}`}
              >
                <Icon name={t.tone === "warn" ? "warning" : "web"} />
                {t.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* การ์ดหมวด + ตัวอย่างหน้าตาจริงย่อ ๆ (เจ้าของเลือกแบบ C 2026-10-29) */}
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {DESIGN_GROUPS.map((g) => (
          <section key={g.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden" data-design-group={g.key}>
            <button type="button" onClick={() => onGo(g.pages[0])} className="w-full flex items-center gap-1.5 px-3.5 pt-3 pb-2 text-left text-xs font-semibold text-slate-500 hover:text-slate-800">
              <Icon name={g.icon} />
              {g.label}
              {g.pages.some((k) => dirty.includes(k)) && <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" title="มีหัวข้อที่แก้แล้ว ยังไม่บันทึก" />}
            </button>
            <GroupPreview group={g.key} theme={theme} sampleItems={sampleItems} onGo={onGo} />
            <div className="mt-1">
              {g.pages.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onGo(k)}
                  data-design-tile={k}
                  className="w-full flex items-center gap-2 px-3.5 py-1.5 border-t border-slate-100 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800 whitespace-nowrap">{DESIGN_PAGES[k].label}</span>
                  <span className="ml-auto min-w-0 truncate text-xs text-slate-500 text-right">{pageSummary(k, theme, choices, { schedules: pending, lastVersion })}</span>
                  {dirty.includes(k) && <span className="w-2 h-2 shrink-0 rounded-full bg-amber-500" title="แก้แล้ว ยังไม่บันทึก" />}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** สีตัวอักษรอ่านง่ายบนพื้นนี้ (ตั้งเองไว้ = ใช้ค่าที่ตั้ง) */
const readableOn = (bg: string, ink: string, set?: string) => set || (contrastRatio("#FFFFFF", bg) >= contrastRatio(ink, bg) ? "#FFFFFF" : ink);
const RADIUS_PX: Record<string, number> = { sharp: 2, soft: 10, round: 18 };
/** รูปสินค้าจาก /api/r2-image → ขอขนาดเล็ก (รูปเต็มใหญ่หลายพัน px) */
const thumbOf = (url: string) => (url.includes("/api/r2-image") && !/[?&]w=/.test(url) ? `${url}&w=240` : url);
const fontOf = (name: string) => `"${name}", sans-serif`;

/** 👁 ตัวอย่างหน้าตาจริงย่อ ๆ ของหมวด — กดตรงไหนไปหน้านั้น (หมวดที่ไม่มีภาพ = ไม่มีตัวอย่าง) */
function GroupPreview({ group, theme, sampleItems, onGo }: { group: string; theme: Theme; sampleItems: SampleItem[]; onGo: (page: PageKey) => void }) {
  const c = theme.colors;
  const box = "mx-3.5 mb-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:border-blue-400 transition";
  if (group === "site") {
    const btnRadius = theme.shape.button === "pill" ? 999 : theme.shape.button === "rounded" ? 8 : 2;
    return (
      <div className={box} style={{ background: c.page }} onClick={() => onGo("colors")} title="สีและธีม">
        <div className="flex gap-1">
          {[c.brand, c.brandDeep, c.ink, c.muted, c.surface].map((x, i) => (
            <span key={i} className="h-5 flex-1 rounded border border-black/10" style={{ background: x }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="shrink-0 whitespace-nowrap text-2xl leading-none" style={{ fontFamily: fontOf(theme.fonts.display), color: c.ink }}>
            Aa กข
          </span>
          <span className="shrink-0 whitespace-nowrap px-3 py-1 text-xs" style={{ background: c.brand, color: resolveOnBrand(c), borderRadius: btnRadius, fontFamily: fontOf(theme.fonts.body) }}>
            ปุ่มหลัก
          </span>
          <span className="ml-auto min-w-0 text-[11px] truncate" style={{ color: c.muted, fontFamily: fontOf(theme.fonts.body) }}>
            {theme.fonts.display} / {theme.fonts.body}
          </span>
        </div>
      </div>
    );
  }
  if (group === "frame") {
    const h = theme.header;
    const headBg = h.bgKind === "custom" ? h.bgColor : h.bg === "brand" ? c.brand : h.bg === "ink" ? c.ink : h.bg === "surface" ? c.surface : c.page;
    const headFg = readableOn(headBg, c.ink, h.textColor);
    const f = theme.footer;
    const footBg = f.bg === "custom" ? f.bgColor : f.bg === "brand" ? c.brand : f.bg === "surface" ? c.surface : c.ink;
    const footFg = readableOn(footBg, c.ink, f.textColor);
    const menu = (theme.menu.items ?? []).slice(0, 3).map((m) => m.label).filter(Boolean);
    const logoImg = theme.logo.mode === "image" && theme.logo.imageKey ? keyUrl(theme.logo.imageKey, 160) : null;
    return (
      <div className="mx-3.5 mb-2 rounded-lg border border-slate-200 overflow-hidden" style={{ background: c.page }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:opacity-90" style={{ background: headBg, color: headFg }} onClick={() => onGo("header")} title="หัวเว็บ">
          <span
            onClick={(e) => {
              e.stopPropagation();
              onGo("logo");
            }}
            title="โลโก้"
            className="shrink-0"
          >
            {logoImg ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoImg} alt="" className="h-4 w-auto" />
            ) : (
              <span className="text-[11px] font-semibold">{theme.logo.text || theme.logo.mark}</span>
            )}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onGo("menu");
            }}
            title="เมนู"
            className="min-w-0 truncate text-[10px] opacity-90"
          >
            {menu.length ? menu.join(" · ") : "เมนูอัตโนมัติ"}
          </span>
          <span className="ml-auto shrink-0 opacity-80">
            <Icon name="cart" />
          </span>
        </div>
        <div className="h-5" />
        <div className="flex items-end gap-1.5 px-2.5 py-1.5 cursor-pointer hover:opacity-90" style={{ background: footBg }} onClick={() => onGo("footer")} title="ท้ายเว็บ">
          {Array.from({ length: Math.min(6, Math.max(2, f.columns?.length ?? 3)) }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: footFg, opacity: 0.45 }} />
          ))}
        </div>
      </div>
    );
  }
  if (group === "product") {
    const ratio = RATIO_CSS[theme.card.imageRatio] ?? "4 / 5";
    const r = theme.shape.cardRadius ?? RADIUS_PX[theme.radius] ?? 10;
    const items = Array.from({ length: 4 }, (_, i) => sampleItems[i] ?? null);
    return (
      <div className={box} style={{ background: c.page }} onClick={() => onGo("card")} title="การ์ดสินค้า">
        <div className="grid grid-cols-4 gap-1.5">
          {items.map((it, i) => (
            <div key={i} className="min-w-0">
              <div className="w-full overflow-hidden border border-black/5" style={{ aspectRatio: ratio, borderRadius: Math.min(r, 12), background: c.surface }}>
                {it?.images?.[0] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumbOf(it.images[0])} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="mt-1 block h-1 w-3/4 rounded-full" style={{ background: c.ink, opacity: 0.25 }} />
              <span className="mt-0.5 block h-1 w-1/3 rounded-full" style={{ background: c.price || c.brand, opacity: 0.6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
