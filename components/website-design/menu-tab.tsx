"use client";

/** เมนู — รายการเมนูด้านบน · เมนูย่อย/แผงเมนูใหญ่ · การชี้เมาส์ · ชุดมือถือ (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useContext, useState } from "react";
import { categoryChoiceLabel } from "@/lib/website-category-tree";
import { ImageUploadField } from "@/components/website-theme-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { LangInput } from "@/components/bilingual-field";
import { TEXT_ROLE_DEFS, MENU_KINDS, MENU_ITEM_LOOKS, newMenuItem, menuItemHref, type MenuItem, type MenuConfig, type MenuKind } from "@/lib/website-theme";
import { pageLinkIssue, countLinkWarnings } from "@/lib/website-link-health";
import { ConfirmDialog } from "@/components/modal";
import { NEW_DROP_LINKS } from "@/lib/website-links";
import { DROP_STATUS_LABEL } from "@/lib/website-new-drops";
import { ColorInput } from "@/components/color-picker";
import { WheelSelect } from "@/components/wheel-select";
import { MegaMenuEditor, ShowWindowFields, type MegaEditorCtx } from "@/components/website-mega-menu-editor";
import { DEFAULT_MENU_BEHAVIOR, DESKTOP_MENU_STYLES, MENU_DELAYS, MOBILE_MENU_OPENS, NAV_HOVERS, SUB_HOVERS, type MenuBehavior } from "@/lib/website-mega-menu";
import { ToggleSwitch } from "@/components/toggle-switch";
import { type Choices, roleOf } from "./shared";
import { useRoleEditor } from "./fonts-tab";
import { PageHealthCtx, IssueNote } from "./link-health";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { SiteZonesCard } from "./zones-card";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";

export function MenuTab() {
  const { theme, choices, apply, setMenu, storePages, megaCtx } = useDesign();
  const roleEditor = useRoleEditor();
  const t = useT();
  return (
    <>
      <DesignCard title="เมนูด้านบน" hint={t("จัดลำดับ ลิงก์ไปหน้า/หมวด/สินค้า/URL · ใส่ป้ายเล็ก · เมนูย่อย (dropdown หรือแผง Mega มีรูป) · ตั้งชุดมือถือแยกได้", "Reorder · link to page/category/product/URL · add small badges · submenus (dropdown or Mega panel with images) · separate mobile set")}>
        <MenuSettings menu={theme.menu} setMenu={setMenu} choices={choices} pages={storePages} megaCtx={megaCtx} typo={{ nav: roleOf(theme, "nav").uppercase, menu: roleOf(theme, "menu").uppercase, setUpper: (k, v) => apply({ ...theme, typography: { ...theme.typography, [k]: { ...roleOf(theme, k), uppercase: v } } }), editors: TEXT_ROLE_DEFS.filter((d) => d.key === "nav" || d.key === "menu").map(roleEditor) }} />
      </DesignCard>
      {/* 🚪 แบ่งเว็บเป็นโซนที่เมนูต่างกัน + แถบสลับบนสุด (components/website-design/zones-card) */}
      <SiteZonesCard />
    </>
  );
}

/* ─────────── เมนู: ชุดตั้งค่าทั้งก้อน (แท็บ "เมนู" + ป๊อปจากชิ้น "เมนู" ใน Header ใช้ตัวเดียวกัน) ─────────── */
/** ✨ ตัวอย่างเอฟเฟกต์ตอนชี้ (CSS ชุดเดียวกับเว็บร้าน globals.css .nav-hv-* / .mm-hv-*) */
export function HoverDemo({ b }: { b: MenuBehavior }) {
  const t = useT();
  const c = b.hoverColor || "#1D4ED8";
  const top = (k: string) =>
    k === "fade" ? "hover:opacity-60" : k === "color" ? "hd-color" : k === "underline" ? "hd-under hd-color" : "hd-grow";
  const sub = (k: string) => (k === "color" ? "hd-color" : k === "underline" ? "hd-under2 hd-color" : k === "grow" ? "hd-grow" : "");
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800" style={{ ["--hd" as string]: c }}>
      <style>{`.hd-color{transition:color .2s}.hd-color:hover{color:var(--hd)}.hd-under{background-image:linear-gradient(var(--hd),var(--hd));background-size:0 1.5px;background-repeat:no-repeat;background-position:0 100%;padding-bottom:2px;transition:background-size .25s,color .2s}.hd-under:hover{background-size:100% 1.5px}.hd-under2{text-decoration:underline;text-decoration-color:transparent;text-underline-offset:4px;transition:text-decoration-color .2s,color .2s}.hd-under2:hover{text-decoration-color:var(--hd)}.hd-grow{display:inline-block;transition:transform .2s;transform-origin:left center}.hd-grow:hover{transform:scale(1.07)}`}</style>
      <p className="text-[10px] text-slate-400 mb-1">{t("ตัวอย่าง (ชี้เมาส์ดู)", "Preview (hover to see)")}</p>
      <div className="flex gap-3 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
        {["Bags", "Wallets", t("ติดต่อ", "Contact")].map((w) => (
          <span key={w} className={`cursor-pointer transition-opacity ${top(b.navHover)}`}>{w}</span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {[t("กระเป๋าเป้", "Backpacks"), t("กระเป๋าคาดอก", "Chest bags")].map((w) => (
          <span key={w} className={`cursor-pointer w-fit ${sub(b.subHover)}`}>{w}</span>
        ))}
      </div>
    </div>
  );
}
/** ⚙️ พฤติกรรมเมนูทั้งชุด (lib/website-mega-menu MenuBehavior) — ใช้กับทุกเมนูที่มีเมนูย่อย/แผง */
export function MenuBehaviorSettings({ value, onChange, typo }: { value: MenuBehavior; onChange: (p: Partial<MenuBehavior>) => void; typo?: MenuTypo }) {
  const t = useT();
  const [typoOpen, setTypoOpen] = useState(false);
  const seg = (on: boolean) => `text-[11px] px-2.5 h-7 rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-slate-700">{t("⚙️ หน้าตา + พฤติกรรมเมนู (ใช้กับทุกเมนู)", "⚙️ Menu look + behavior (applies to all menus)")}</p>
      {/* 🔠 ตัวอักษรเมนู — ค่าเดียวกับแท็บตัวอักษร (เมนูด้านบน / เมนูย่อย-แผงเมนู) แก้ที่ไหนก็ตรงกัน */}
      {typo && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">{t("🔠 เมนูด้านบน", "🔠 Top menu")}</span>
              <button type="button" className={seg(typo.nav)} onClick={() => typo.setUpper("nav", true)}>{t("ตัวพิมพ์ใหญ่ทั้งหมด (BAGS)", "All caps (BAGS)")}</button>
              <button type="button" className={seg(!typo.nav)} onClick={() => typo.setUpper("nav", false)}>{t("ตามที่พิมพ์ (Bags)", "As typed (Bags)")}</button>
            </div>
            <div className="flex items-center gap-1.5" title={t("หัวคอลัมน์ ลิงก์ แท็บ และชื่อการ์ดในเมนูย่อย/แผงเมนู (คำอธิบายและชื่อสินค้าไม่เปลี่ยน)", "Column headings, links, tabs and card names in submenus/menu panels (descriptions and product names unchanged)")}>
              <span className="text-[11px] text-slate-500">{t("เมนูย่อย/แผง", "Submenu/panel")}</span>
              <button type="button" className={seg(typo.menu)} onClick={() => typo.setUpper("menu", true)}>{t("ใหญ่ทั้งหมด", "All caps")}</button>
              <button type="button" className={seg(!typo.menu)} onClick={() => typo.setUpper("menu", false)}>{t("ตามที่พิมพ์", "As typed")}</button>
            </div>
          </div>
          <div>
            <button type="button" onClick={() => setTypoOpen((v) => !v)} className="text-[11px] text-blue-600 hover:underline">
              {typoOpen ? "▲" : "▼"} {t("ฟอนต์ · สี · ขนาด · น้ำหนัก · ระยะตัวอักษร ของเมนู", "Menu font · color · size · weight · letter spacing")}
            </button>
            {typoOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-slate-500">{t("ตัวเดียวกับ แท็บตัวอักษร → ปรับละเอียดรายบทบาท — แก้ตรงนี้ แท็บตัวอักษรเปลี่ยนตาม (และกลับกัน)", "Same as Fonts tab → Fine-tune by role — editing here changes the Fonts tab too (and vice versa)")}</p>
                {typo.editors}
              </div>
            )}
          </div>
        </>
      )}
      {/* ✨ เอฟเฟกต์ตอนชี้ลิงก์ — ตัวอย่างสดด้านขวา (ชี้เมาส์ดู) */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">{t("✨ ชี้เมนูด้านบน", "✨ Top menu hover")}</span>
            {NAV_HOVERS.map((o) => (
              <button key={o.value} type="button" className={seg(value.navHover === o.value)} onClick={() => onChange({ navHover: o.value })}>
                {labelEn(o.label)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">{t("✨ ชี้เมนูย่อย/แผง", "✨ Submenu/panel hover")}</span>
            {SUB_HOVERS.map((o) => (
              <button key={o.value} type="button" className={seg(value.subHover === o.value)} onClick={() => onChange({ subHover: o.value })}>
                {labelEn(o.label)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">{t("สีตอนชี้", "Hover color")}</span>
            <span className="w-32">
              <ColorInput value={value.hoverColor || "#1D4ED8"} onChange={(v) => onChange({ hoverColor: v })} />
            </span>
            {value.hoverColor ? (
              <button type="button" className="text-[11px] text-slate-400 hover:text-rose-600" onClick={() => onChange({ hoverColor: "" })}>
                {t("✕ ใช้สีลิงก์ของธีม", "✕ Use theme link color")}
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">{t("= สีลิงก์ของธีม (แท็บสี → ปรับละเอียด)", "= Theme link color (Colors tab → Fine-tune)")}</span>
            )}
          </div>
        </div>
        <HoverDemo b={value} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{t("เปิดแผงเมื่อ", "Open panel on")}</span>
          <button type="button" className={seg(value.open === "hover")} onClick={() => onChange({ open: "hover" })}>{t("ชี้เมาส์", "Hover")}</button>
          <button type="button" className={seg(value.open === "click")} onClick={() => onChange({ open: "click" })}>{t("กดก่อน", "Click")}</button>
        </div>
        {value.open === "hover" && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title={t("ชี้ค้างนานเท่านี้ก่อนแผงเปิด — กันแผงเด้งตอนแค่เลื่อนเมาส์ผ่านเมนู", "Hover this long before the panel opens — stops it popping when the mouse just passes over")}>
            {t("หน่วงก่อนเปิด", "Open delay")}
            <WheelSelect value={value.delay} onChange={(e) => onChange({ delay: Number(e.target.value) })}>
              {MENU_DELAYS.map((ms) => (
                <option key={ms} value={ms}>{ms === 0 ? t("ไม่หน่วง", "No delay") : `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)} ${t("วินาที", "s")}`}</option>
              ))}
            </WheelSelect>
          </label>
        )}
        <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.dim} onChange={(e) => onChange({ dim: e.target.checked })} />
          {t("ฉากหลังมืดลงตอนแผงเปิด", "Dim background when panel opens")}
        </label>
      </div>
      {/* ☰ จอคอม: เปลี่ยนแถบคำเมนูเป็นปุ่ม ☰ (เปิดลิ้นชักตัวเดียวกับมือถือ) */}
      <div className="space-y-1" data-desktop-style>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{t("🖥 เมนูจอคอม", "🖥 Desktop menu")}</span>
          {DESKTOP_MENU_STYLES.map((o) => (
            <button key={o.value} type="button" className={seg((value.desktopStyle ?? "links") === o.value)} onClick={() => onChange({ desktopStyle: o.value })}>
              {labelEn(o.label)}
            </button>
          ))}
          {value.desktopStyle === "burger-text" && (
            <input className="h-7 w-28 rounded-md border border-slate-200 px-2 text-[11px]" value={value.burgerLabel ?? ""} maxLength={20} placeholder="MENU" onChange={(e) => onChange({ burgerLabel: e.target.value })} title={t("คำข้างปุ่ม ☰ (ว่าง = MENU)", "Text beside the ☰ button (empty = MENU)")} />
          )}
        </div>
        {value.desktopStyle && value.desktopStyle !== "links" && (
          <p className="text-[11px] text-slate-500 pl-0.5">{t("กด ☰ แล้วเปิดลิ้นชักเมนูตัวเดียวกับมือถือ · เมนูที่ติ๊ก 📌 ติดหัวเว็บ (กด ✎ ที่เมนูนั้น) ยังโชว์เป็นคำข้างปุ่ม เช่น ALL PRODUCTS", "☰ opens the same menu drawer as mobile · menus ticked 📌 Pin to header (click ✎ on that menu) still show as text beside the button, e.g. ALL PRODUCTS")}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">{t("📱 มือถือ", "📱 Mobile")}</span>
          <button type="button" className={seg(value.mobileStyle === "accordion")} onClick={() => onChange({ mobileStyle: "accordion" })}>{t("พับ-กาง", "Accordion")}</button>
          <button type="button" className={seg(value.mobileStyle === "drill")} onClick={() => onChange({ mobileStyle: "drill" })}>{t("เลื่อนเข้าหน้าถัดไป (แบบแอป)", "Slide to next screen (app style)")}</button>
        </div>
        <div className="flex items-center gap-1.5" title={t("เปิดเมนู (มือถือ / ☰ จอคอม) แล้วเมนูย่อย เช่น SHOP ALL กางให้เห็นเลย ไม่ต้องกด ▾ อีกครั้ง · แบบแอป = เข้าหน้าของเมนูอันแรกเลย", "When the menu opens (mobile / desktop ☰), submenus like SHOP ALL are already expanded, no need to tap ▾ · app style = go straight into the first menu's screen")}>
          <span className="text-[11px] text-slate-500">{t("📂 กางเมนูย่อยไว้เลย", "📂 Keep submenus expanded")}</span>
          {MOBILE_MENU_OPENS.map((o) => (
            <button key={o.value} type="button" className={seg((value.mobileOpen ?? "none") === o.value)} onClick={() => onChange({ mobileOpen: o.value })}>
              {labelEn(o.label)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer" title={t("รูปหมวดวงกลมเลื่อนแนวนอนบนสุดของเมนูมือถือ (ต้องใส่รูปหมวดในแท็บหมวดหมู่)", "Round category images scrolling horizontally at the top of the mobile menu (add category images in the Categories tab)")}>
          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.mobileCats} onChange={(e) => onChange({ mobileCats: e.target.checked })} />
          {t("แถบรูปหมวดวงกลมบนสุด", "Round category image strip at top")}
        </label>
      </div>
    </div>
  );
}
/** 🔠 ตัวอักษรเมนู (theme.typography.nav / .menu) ที่ส่งจากหน้าดีไซน์ — ค่าเดียวกับแท็บตัวอักษร */
export type MenuTypo = { nav: boolean; menu: boolean; setUpper: (k: "nav" | "menu", v: boolean) => void; editors: React.ReactNode };
export function MenuSettings({ menu, setMenu, choices, pages, megaCtx, typo }: { menu: MenuConfig; setMenu: (p: Partial<MenuConfig>) => void; choices: Choices; pages: { slug: string; title: string }[]; megaCtx?: MegaEditorCtx; typo?: MenuTypo }) {
  const t = useT();
  const [askAuto, setAskAuto] = useState(false);
  return (
    <>
      {menu.items === null ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          {t("ตอนนี้ใช้เมนู", "Currently using the ")}<b>{t("อัตโนมัติ", "automatic")}</b>{t(": สินค้าทั้งหมด → หน้าที่สร้างเอง → ติดต่อ (ถ้ากรอกช่องทางติดต่อแล้ว)", " menu: All products → custom pages → Contact (if contact channels are filled in)")}
          <div className="mt-3">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setMenu({ items: [newMenuItem("สินค้าทั้งหมด", "shop"), ...pages.map((pg) => newMenuItem(pg.title, "page", pg.slug)), newMenuItem("ติดต่อ", "contact")] })}
            >
              {t("จัดเมนูเอง (เริ่มจากชุดอัตโนมัติ)", "Customize menu (start from the auto set)")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <MenuEditor items={menu.items} onChange={(items) => setMenu({ items })} choices={choices} pages={pages} megaCtx={megaCtx} />
          <button type="button" className="mt-3 text-xs text-slate-500 hover:text-rose-600 hover:underline" onClick={() => setAskAuto(true)}>
            {t("กลับไปใช้เมนูอัตโนมัติ", "Back to auto menu")}
          </button>
        </>
      )}

      <MenuBehaviorSettings value={menu.behavior ?? DEFAULT_MENU_BEHAVIOR} onChange={(p) => setMenu({ behavior: { ...DEFAULT_MENU_BEHAVIOR, ...menu.behavior, ...p } })} typo={typo} />

      <div className="mt-5 pt-3 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={menu.mobileItems !== null} onChange={(e) => setMenu({ mobileItems: e.target.checked ? (menu.items ?? []).map((it) => ({ ...it, id: `mb${it.id}`, children: it.children.map((c) => ({ ...c, id: `mb${c.id}` })) })) : null })} />
          {t("📱 มือถือใช้เมนูคนละชุด", "📱 Separate menu for mobile")}
        </label>
        {menu.mobileItems !== null && (
          <div className="mt-3">
            <MenuEditor items={menu.mobileItems} onChange={(mobileItems) => setMenu({ mobileItems })} choices={choices} pages={pages} megaCtx={megaCtx} />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={askAuto}
        onClose={() => setAskAuto(false)}
        onConfirm={() => {
          setMenu({ items: null, mobileItems: null });
          setAskAuto(false);
        }}
        title={t("กลับไปใช้เมนูอัตโนมัติ?", "Go back to the auto menu?")}
        message={t("รายการเมนูที่จัดไว้ (รวมชุดมือถือ) จะหาย แล้วเว็บใช้เมนูอัตโนมัติแทน", "Your menu items (incl. the mobile set) will be removed and the site will use the auto menu")}
        confirmText={t("ใช้เมนูอัตโนมัติ", "Use auto menu")}
        variant="danger"
      />
    </>
  );
}
export function MenuEditor({ items, onChange, choices, pages, depth = 0, parentMega = false, megaCtx }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void; choices: Choices; pages: { slug: string; title: string; status?: string }[]; depth?: number; parentMega?: boolean; /** มี = เมนูบนสุดเลือกแผงเมนูใหญ่ A/B/C ได้ */ megaCtx?: MegaEditorCtx }) {
  const t = useT();
  const drag = useDragReorder((from, to) => onChange(moveItem(items, from, to)));
  // 🩺 ลิงก์ชนิดหน้า → หน้าที่ไม่มี/ยังเป็นร่าง = ลูกค้ากดแล้วเจอไม่พบหน้า (พรีวิวโชว์ร่างด้วย เลยดูเหมือนปกติ)
  const health = useContext(PageHealthCtx);
  const issueOf = (it: MenuItem) => (health && it.kind === "page" ? pageLinkIssue(it.value, health) : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const setItem = (id: string, patch: Partial<MenuItem>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  const valueField = (it: MenuItem) => {
    switch (it.kind) {
      case "category":
        return (
          <div className="space-y-1">
            <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value, also: e.target.value === it.also ? "" : it.also })}>
              <option value="">{t("— เลือกหมวด —", "— Pick category —")}</option>
              {(choices.categories ?? []).map((c) => <option key={c.key} value={c.key}>{categoryChoiceLabel(c)}</option>)}
            </select>
            {/* ➕ หมวดที่ 2: เฉพาะสินค้าที่อยู่ทั้ง 2 หมวด (ลิงก์ /c/<หมวด>?also=<หมวด2>) */}
            {it.value && (
              <select className={`${mini} w-full ${it.also ? "" : "text-slate-400"}`} value={it.also ?? ""} onChange={(e) => setItem(it.id, { also: e.target.value })} title={t("โชว์เฉพาะสินค้าที่อยู่ทั้ง 2 หมวด", "Show only products in both categories")}>
                <option value="">{t("＋ และต้องอยู่ในหมวด… (ไม่บังคับ)", "＋ and also in category… (optional)")}</option>
                {(choices.categories ?? []).filter((c) => c.key !== it.value).map((c) => <option key={c.key} value={c.key}>{t("และอยู่ใน:", "and in:")} {categoryChoiceLabel(c)}</option>)}
              </select>
            )}
          </div>
        );
      case "product":
        return (
          <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
            <option value="">{t("— เลือกสินค้า —", "— Pick product —")}</option>
            {(choices.products ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
          </select>
        );
      case "page":
        return (
          <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
            <option value="">{t("— เลือกหน้า —", "— Pick page —")}</option>
            {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title}{p.status && p.status !== "published" ? t(" (ร่าง)", " (draft)") : ""}</option>)}
            {it.value && !pages.some((p) => p.slug === it.value) && <option value={it.value}>⚠️ /{it.value} {t("(ยังไม่มีหน้านี้)", "(page doesn't exist)")}</option>}
          </select>
        );
      case "new": {
        // 🆕 ทุกชุด / ชุดล่าสุด / ชุดที่กำลังจะเปิด / เลือกชุดเอง (ชุดสร้างที่แท็บ 🆕 มาใหม่)
        const drops = choices.newDrops ?? [];
        const gone = !!it.value && !NEW_DROP_LINKS.some((l) => l.value === it.value) && !drops.some((d) => d.id === it.value);
        return (
          <>
            <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
              {NEW_DROP_LINKS.map((l) => <option key={l.value} value={l.value}>{labelEn(l.label)}</option>)}
              {drops.length > 0 && (
                <optgroup label={t("เลือกชุดเอง", "Pick a drop")}>
                  {drops.map((d) => <option key={d.id} value={d.id}>{d.title} · {t(DROP_STATUS_LABEL[d.status].th, DROP_STATUS_LABEL[d.status].en)}</option>)}
                </optgroup>
              )}
              {gone && <option value={it.value}>{t("⚠️ ชุดที่เลือกไว้ถูกลบแล้ว — เลือกใหม่", "⚠️ The selected drop was deleted — pick again")}</option>}
            </select>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {menuItemHref(it)}
              {drops.length === 0 ? t(" · ยังไม่มีชุด — สร้างได้ที่แท็บ 🆕 มาใหม่", " · No drops yet — create one in the 🆕 New drops tab") : ""}
            </p>
          </>
        );
      }
      case "url":
        return <input className={`${mini} w-full`} value={it.value} placeholder={t("https://… หรือ /path", "https://… or /path")} onChange={(e) => setItem(it.id, { value: e.target.value })} />;
      default:
        return <span className="text-[11px] text-slate-400">{menuItemHref(it)}</span>;
    }
  };
  return (
    <div>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const open = openId === it.id;
          const iss = issueOf(it);
          const kidWarn = health && it.children.length ? countLinkWarnings(it.children, health) : 0;
          return (
            <li key={it.id} {...drag.rowProps(i)} data-menu-row={it.id} className={`rounded-lg border ${open ? "border-blue-300" : iss?.level === "warn" ? "border-amber-300" : "border-slate-200"} ${it.hidden ? "bg-slate-50" : "bg-white"} ${drag.rowCls(i)}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                {/* 👁 เปิด/ปิดเมนูนี้ (ไม่ต้องลบ) — ปิด = เว็บร้านไม่โชว์ (รวมเมนูย่อย) */}
                <ToggleSwitch size="sm" on={!it.hidden} onChange={(v) => setItem(it.id, { hidden: !v })} title={it.hidden ? t("ปิดอยู่ — ลูกค้าไม่เห็นเมนูนี้ · กดเพื่อเปิด", "Off — customers don't see this menu · click to turn on") : t("เปิดอยู่ · กดเพื่อปิดชั่วคราว (ไม่ลบ)", "On · click to turn off temporarily (not deleted)")} />
                <LangInput className={`${mini} flex-1 min-w-0 ${it.hidden ? "line-through text-slate-400" : ""}`} obj={it} k="label" maxLength={60} onPatch={(p) => setItem(it.id, p)} placeholder={t("ชื่อเมนู", "Menu name")} />
                {it.hidden && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{t("ปิดอยู่", "Off")}</span>}
                {depth === 0 && it.pin && <span className="shrink-0 text-[11px]" title={t("ติดหัวเว็บ — ตอนเมนูจอคอมเป็นปุ่ม ☰ ยังโชว์คำนี้ข้างปุ่ม", "Pinned to header — still shown beside the ☰ button when the desktop menu is a button")}>📌</span>}
                {depth === 0 && it.look && <span className="shrink-0 text-[11px] text-slate-500" title={t("จอคอมแสดงเมนูนี้เป็นไอคอน ☰ (ชี้แล้วแผงยังเปิดเหมือนเดิม)", "Desktop shows this menu as a ☰ icon (hover still opens the panel)")}>☰</span>}
                <select className={mini} value={it.kind} onChange={(e) => setItem(it.id, { kind: e.target.value as MenuKind, value: "" })}>
                  {MENU_KINDS.map((k) => <option key={k.value} value={k.value}>{labelEn(k.label)}</option>)}
                </select>
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : kidWarn ? "border-amber-300 text-amber-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`} title={kidWarn ? t(`ตั้งค่าเพิ่ม · เมนูย่อย ${kidWarn} อันพาไปหน้าที่ยังไม่มี/เป็นร่าง`, `More settings · ${kidWarn} submenus go to missing/draft pages`) : t("ตั้งค่าเพิ่ม", "More settings")}>✎{it.children.length ? ` ${it.children.length}` : ""}{kidWarn ? " ⚠️" : ""}</button>
                <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-slate-300 hover:text-rose-600 px-1" title={t("ลบ", "Delete")}>✕</button>
              </div>
              {iss && <IssueNote issue={iss} className="mx-2 mb-1.5" />}
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{t("ลิงก์ไป", "Link to")}</label>
                      {valueField(it)}
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{t("ป้ายเล็ก (เช่น ใหม่ / ลด)", "Small badge (e.g. New / Sale)")}</label>
                      <LangInput className={`${mini} w-full`} obj={it} k="badge" maxLength={20} onPatch={(p) => setItem(it.id, p)} />
                    </div>
                  </div>
                  <ShowWindowFields from={it.showFrom} until={it.showUntil} onChange={(p) => setItem(it.id, p)} />
                  {depth === 0 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer" title={t("ใช้ตอนตั้ง 🖥 เมนูจอคอม เป็นปุ่ม ☰ (ด้านล่าง)", "Used when 🖥 Desktop menu is set to the ☰ button (below)")}>
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={!!it.pin} onChange={(e) => setItem(it.id, { pin: e.target.checked })} />
                      {t("📌 ติดหัวเว็บ — ตอนเมนูจอคอมเป็นปุ่ม ☰ ยังโชว์เมนูนี้เป็นคำข้างปุ่ม (เช่น ALL PRODUCTS)", "📌 Pin to header — when the desktop menu is a ☰ button, still show this menu as text beside it (e.g. ALL PRODUCTS)")}
                    </label>
                  )}
                  {depth === 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600" data-menu-look>
                      {t("🖥 บนแถบเมนูจอคอม แสดงเป็น", "🖥 On the desktop menu bar, show as")}
                      {MENU_ITEM_LOOKS.map((o) => (
                        <button key={o.value || "word"} type="button" onClick={() => setItem(it.id, { look: o.value })} className={`h-7 rounded-md border px-2 ${(it.look ?? "") === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                          {labelEn(o.label)}
                        </button>
                      ))}
                      <span className="text-slate-400">{t("· ชี้แล้วแผง/เมนูย่อยยังเปิดเหมือนเดิม · มือถือไม่เปลี่ยน", "· hover still opens the panel/submenu · mobile unchanged")}</span>
                    </div>
                  )}
                  {depth === 0 && megaCtx && (
                    <MegaMenuEditor itemId={it.id} panel={it.panel} onChange={(panel) => setItem(it.id, { panel })} ctx={megaCtx} />
                  )}
                  {depth === 0 && it.kind === "categories" && !it.panel && (
                    <div className="rounded-md bg-blue-50 border border-blue-100 px-2 py-1.5 space-y-1">
                      <p className="text-[11px] text-blue-800">{t("📂 เมนูย่อย = ทุกหมวดในแท็บ \"หมวดหมู่\" เรียงตามนั้น (เพิ่ม/ลบหมวดแล้วเมนูเปลี่ยนเอง)", "📂 Submenu = every category in the \"Categories\" tab, in that order (updates when categories change)")}</p>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={it.mega} onChange={(e) => setItem(it.id, { mega: e.target.checked })} />
                        {t("แผง Mega (กว้าง โชว์รูปหมวด)", "Mega panel (wide, shows category images)")}
                      </label>
                    </div>
                  )}
                  {depth === 0 && it.kind !== "categories" && !it.panel && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] text-slate-500">{t("เมนูย่อย", "Submenu")} ({it.children.length})</label>
                        <div className="flex items-center gap-3">
                          {it.children.length > 0 && (
                            <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer"><input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={it.mega} onChange={(e) => setItem(it.id, { mega: e.target.checked })} />{t("แผง Mega (กว้าง มีรูป)", "Mega panel (wide, with images)")}</label>
                          )}
                          <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setItem(it.id, { children: [...it.children, newMenuItem("รายการย่อย", "shop")] })}>{t("+ เพิ่มรายการย่อย", "+ Add sub-item")}</button>
                        </div>
                      </div>
                      {it.children.length > 0 && (
                        <div className="pl-3 border-l-2 border-slate-100">
                          <MenuEditor items={it.children} onChange={(children) => setItem(it.id, { children })} choices={choices} pages={pages} depth={1} parentMega={it.mega} />
                        </div>
                      )}
                    </div>
                  )}
                  {depth === 1 && parentMega && (
                    <ImageUploadField label={t("รูปในแผง Mega", "Image in Mega panel")} hint={t("สัดส่วน 4:3", "Ratio 4:3")} value={it.imageKey} onChange={(key) => setItem(it.id, { imageKey: key })} height={48} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {depth === 0 && (
        <button type="button" className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => { const it = newMenuItem(); onChange([...items, it]); setOpenId(it.id); }}>{t("+ เพิ่มเมนู", "+ Add menu")}</button>
      )}
    </div>
  );
}