"use client";

/**
 * 🏠 ภาพรวมดีไซน์ — หน้าแรกของแท็บดีไซน์ (เมนูซ้าย "ภาพรวม")
 * สถานะร่าง/เผยแพร่ · สิ่งที่ควรทำ (อ่านยาก · ไม่มี Favicon · คำแปลที่ขาด) · การ์ดทางลัดทุกหัวข้อพร้อมสรุปค่าปัจจุบัน
 * กดการ์ด = ไปหน้านั้น (หัวข้อ/สรุปจากทะเบียนกลาง lib/website-design-nav)
 */
import { useMemo, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { coverageOf, collectTextPaths } from "@/lib/content-i18n";
import { THEME_TEXT_KEYS } from "@/lib/website-theme";
import { FULL_THEME_PRESETS } from "@/lib/website-theme-presets";
import { CART_STYLES } from "@/lib/website-cart";
import { DESIGN_GROUPS, DESIGN_PAGES, type DesignPageKey } from "@/lib/website-design-nav";
import { colorChecks } from "./colors-tab";
import { timeAgo, type Choices, type Theme } from "./shared";
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
  const { theme, choices, schedules } = useDesign();
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

      {DESIGN_GROUPS.map((g) => (
        <section key={g.key}>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5 mt-1">
            <Icon name={g.icon} />
            {g.label}
          </h3>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
            {g.pages.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onGo(k)}
                data-design-tile={k}
                className="relative text-left rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 hover:border-blue-400 hover:shadow-sm transition"
              >
                <span className="block text-sm font-semibold text-slate-800 pr-4">{DESIGN_PAGES[k].label}</span>
                <span className="block text-xs text-slate-500 mt-0.5 truncate">{pageSummary(k, theme, choices, { schedules: pending, lastVersion })}</span>
                {dirty.includes(k) && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500" title="แก้แล้ว ยังไม่บันทึก" />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
