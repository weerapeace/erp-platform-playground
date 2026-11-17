"use client";

/** หัวเว็บ (Header) — สี/ความสูง · ตำแหน่งชิ้นส่วน (ซ้าย·กลาง·ขวา) + ป๊อป ⚙ ตั้งค่าชิ้นส่วน (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MemberLoginSettingsModal } from "@/components/website-member-login-settings";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { LangInput } from "@/components/bilingual-field";
import { TEXT_ROLE_DEFS, HEADER_EL_DEFS, type HeaderEl, type HeaderZones } from "@/lib/website-theme";
import { ERPModal } from "@/components/modal";
import { SocialLinksModal } from "@/components/website-social-links";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ColorPicker } from "@/components/color-picker";
import { RangeInput } from "@/components/range-input";
import { HeaderCartSettings, HeaderSearchSettings } from "@/components/website-header-els";
import { HeaderOverPagesSettings } from "@/components/website-header-over-settings";
import { HeaderIconStyleSetting } from "@/components/website-site-design-setting";
import { DEFAULT_HEADER_CART, DEFAULT_HEADER_SEARCH } from "@/lib/website-header-els";
import { HEADER_PARTS } from "@/lib/website-page-parts";
import { type HeaderBg, type MenuAlign, roleOf, inputCls, labelCls, ColorField, useAreaFold } from "./shared";
import { useRoleEditor } from "./fonts-tab";
import { MenuSettings } from "./menu-tab";
import { LogoSettings } from "./logo-tab";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-admin-en";

export function HeaderTab() {
  const t = useT();
  const { shopSlug, shopId, theme, choices, apply, setHeader, setMenu, page, setPage, sampleProduct, storePages, iframeRef, linkCtx, megaCtx } = useDesign();
  const roleEditor = useRoleEditor();
  const areaFold = useAreaFold();
  /** ป๊อปตั้งค่าชิ้นส่วนหัวเว็บที่เปิดอยู่ (กดชื่อชิ้นที่มี ⚙ ใน ZonesEditor) */
  const [zoneCfg, setZoneCfg] = useState<HeaderEl | null>(null);
  const zoneNames = (els: HeaderEl[]) => els.map((k) => labelEn(HEADER_EL_DEFS.find((d) => d.key === k)?.label ?? k)).join(" ") || "—";
  const z = theme.header.zones;
  const memberLogin = useMemberLoginReady(shopSlug, [...z.left, ...z.center, ...z.right].includes("account"));
  const [loginOpen, setLoginOpen] = useState(false);
  return (
    <>
    <DesignCard
      title={t("แถบหัวเว็บ — ขนาด · สี · ตำแหน่งเมนู", "Header bar — size · color · menu position")}
      summary={`${labelEn(choices.headerBg.find((o) => o.value === theme.header.bg)?.label ?? theme.header.bg)} · ${t("สูง", "height")} ${theme.header.height}px${theme.header.sticky ? t(" · ตรึงด้านบน", " · sticky") : ""}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("ความสูง", "Height")} · {theme.header.height}px</label>
          <RangeInput min={48} max={240} value={theme.header.height} onChange={(v) => setHeader({ height: v })} className="w-full accent-blue-600" />
        </div>
        <div>
          <label className={labelCls}>{t("สีพื้นหลัง", "Background color")}</label>
          <select className={inputCls} value={theme.header.bg} onChange={(e) => setHeader({ bg: e.target.value as HeaderBg })}>
            {choices.headerBg.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("ตำแหน่งเมนู", "Menu position")}</label>
          <select className={inputCls} value={theme.header.menuAlign} onChange={(e) => setHeader({ menuAlign: e.target.value as MenuAlign })}>
            {choices.menuAligns.map((o) => <option key={o.value} value={o.value}>{labelEn(o.label)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.sticky} onChange={(e) => setHeader({ sticky: e.target.checked })} />
            {t("ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน", "Keep the menu bar pinned on scroll")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.showCart} onChange={(e) => setHeader({ showCart: e.target.checked })} />
            {t("แสดงไอคอนตะกร้า", "Show cart icon")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.border} onChange={(e) => setHeader({ border: e.target.checked })} />
            {t("มีเส้นคั่นด้านล่าง", "Bottom divider line")}
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
        <div>
          <label className={labelCls}>{t("สีพื้น Header", "Header background")}</label>
          <select className={inputCls} value={theme.header.bgKind} onChange={(e) => setHeader({ bgKind: e.target.value as "preset" | "custom" })}>
            <option value="preset">{t("ตามตัวเลือกด้านบน", "Use the option above")}</option>
            <option value="custom">{t("กำหนดสีเอง", "Custom color")}</option>
          </select>
          {theme.header.bgKind === "custom" && (
            <div className="mt-2">
              <ColorPicker value={theme.header.bgColor} onChange={(hex) => setHeader({ bgColor: hex })} />
            </div>
          )}
        </div>
        <ColorField label={t("สีตัวอักษร/ไอคอนใน Header", "Header text/icon color")} value={theme.header.textColor} onChange={(hex) => setHeader({ textColor: hex })} emptyLabel={t("อัตโนมัติ (ขาว/ดำตามพื้น)", "Auto (white/black by background)")} />
      </div>
    </DesignCard>

    <DesignCard
      title={t("ตำแหน่งชิ้นส่วน (ซ้าย · กลาง · ขวา)", "Element positions (left · center · right)")}
      hint={t("ลาก ⠿ จัดลำดับในโซน · ◀ ▶ ย้ายโซน · ✕ เอาออก", "Drag ⠿ to reorder in a zone · ◀ ▶ move zone · ✕ remove")}
      summary={`${t("ซ้าย", "Left")} ${zoneNames(z.left)} · ${t("กลาง", "Center")} ${zoneNames(z.center)} · ${t("ขวา", "Right")} ${zoneNames(z.right)}`}
    >
      <div>
        <ZonesEditor zones={theme.header.zones} onChange={(zones) => setHeader({ zones })} onConfig={setZoneCfg} hiddenEls={memberLogin.ready === false ? { account: t("ยังซ่อนอยู่บนเว็บร้าน — ยังไม่ได้ตั้งช่องทางเข้าสู่ระบบ", "Still hidden on the storefront — no sign-in method set up yet") } : undefined} />
        <p className="text-[11px] text-slate-400 mt-1.5">{t("กดชื่อชิ้นที่มี ⚙ (โลโก้ · เมนู · ค้นหา · ตะกร้า · โซเชียล) เพื่อตั้งค่าในป๊อปได้เลย · “บัญชีสมาชิก” โชว์เมื่อเว็บเปิดระบบสมาชิกแล้ว (ตั้งช่องทางเข้าสู่ระบบ)", "Click an element with ⚙ (logo · menu · search · cart · social) to set it up in a popup · “Member account” shows once the site has membership on (sign-in methods set up)")}</p>
        {/* 👤 วางชิ้นบัญชีสมาชิกไว้ แต่ยังไม่มีช่องทางเข้าสู่ระบบที่พร้อม = เว็บร้านซ่อนไอคอน (memberEnabled) → บอกเหตุผล + เปิดป๊อปตั้งค่าได้เลย */}
        {memberLogin.ready === false && (
          <div data-member-hint className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <span className="flex-1 min-w-[14rem]">{t("👤 ไอคอน “บัญชีสมาชิก” ยังไม่ขึ้นบนเว็บร้าน เพราะยังไม่ได้ตั้งช่องทางเข้าสู่ระบบ (Google / LINE / Facebook) สักทาง — ลูกค้าจะกดเข้าไปแล้วสมัครไม่ได้ ระบบเลยซ่อนไว้ให้", "👤 The “Member account” icon isn't on the storefront yet because no sign-in method (Google / LINE / Facebook) is set up — shoppers couldn't sign up, so the system hides it")}</span>
            <button type="button" onClick={() => setLoginOpen(true)} className="h-7 shrink-0 rounded-md bg-amber-600 px-3 text-[11px] font-medium text-white hover:bg-amber-700">
              🔑 {t("ตั้งค่าการเข้าสู่ระบบ", "Sign-in settings")}
            </button>
          </div>
        )}
        <MemberLoginSettingsModal open={loginOpen} shopSlug={shopSlug} onClose={() => setLoginOpen(false)} onSaved={memberLogin.reload} />
        {/* ⚙ ป๊อปตั้งค่าชิ้นส่วน: เมนู = แก้ในธีม (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) · โซเชียล = ข้อมูลร้าน บันทึกทันที */}
        <ERPModal
          open={zoneCfg === "menu"}
          onClose={() => setZoneCfg(null)}
          title={t("☰ เมนูด้านบน", "☰ Top menu")}
          description={t("จัดลำดับ ลิงก์ไปหน้า/หมวด/สินค้า/URL · ป้ายเล็ก · เมนูย่อย · ชุดมือถือแยกได้ — แก้แล้วเห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น", "Reorder, link to pages/categories/products/URLs · small badges · submenus · separate mobile set — changes show in the preview right away; remember to Save/Publish above like other design edits")}
          size="xl"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              {t("เสร็จ", "Done")}
            </button>
          }
        >
          <MenuSettings menu={theme.menu} setMenu={setMenu} choices={choices} pages={storePages} megaCtx={megaCtx} typo={{ nav: roleOf(theme, "nav").uppercase, menu: roleOf(theme, "menu").uppercase, setUpper: (k, v) => apply({ ...theme, typography: { ...theme.typography, [k]: { ...roleOf(theme, k), uppercase: v } } }), editors: TEXT_ROLE_DEFS.filter((d) => d.key === "nav" || d.key === "menu").map(roleEditor) }} />
        </ERPModal>
        {/* ⚙ โลโก้ = เนื้อหาเดียวกับแท็บโลโก้ · ⚙ ตะกร้า/ค้นหา = theme.header.cart / .search (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) */}
        <ERPModal
          open={zoneCfg === "logo"}
          onClose={() => setZoneCfg(null)}
          title={t("🏷 โลโก้", "🏷 Logo")}
          description={t("ค่าเดียวกับแท็บโลโก้ — แก้ตรงนี้ แท็บโลโก้เปลี่ยนตาม · เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบน", "Same settings as the Logo tab — edits here update it too · shows in the preview right away; remember to Save/Publish above")}
          size="xl"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              {t("เสร็จ", "Done")}
            </button>
          }
        >
          <div className="space-y-3"><LogoSettings /></div>
        </ERPModal>
        <ERPModal
          open={zoneCfg === "cart" || zoneCfg === "search"}
          onClose={() => setZoneCfg(null)}
          title={zoneCfg === "cart" ? t("🛒 ตะกร้า", "🛒 Cart") : t("🔍 ค้นหา", "🔍 Search")}
          description={t("เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น", "Shows in the preview right away; remember to Save/Publish above like other design edits")}
          size="md"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              {t("เสร็จ", "Done")}
            </button>
          }
        >
          {zoneCfg === "cart" ? (
            <HeaderCartSettings value={theme.header.cart ?? DEFAULT_HEADER_CART} onChange={(p) => setHeader({ cart: { ...(theme.header.cart ?? DEFAULT_HEADER_CART), ...p } })} theme={theme} />
          ) : (
            <HeaderSearchSettings value={theme.header.search ?? DEFAULT_HEADER_SEARCH} onChange={(p) => setHeader({ search: { ...(theme.header.search ?? DEFAULT_HEADER_SEARCH), ...p } })} theme={theme} />
          )}
        </ERPModal>
        <SocialLinksModal
          open={zoneCfg === "social"}
          onClose={() => setZoneCfg(null)}
          shopSlug={shopSlug}
          shopId={shopId}
          onSaved={() => setTimeout(() => { if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }, 1500)}
        />
      </div>
    </DesignCard>

    <DesignCard
      title={t("ปุ่มบนหัวเว็บ · เมนูมือถือ", "Header button · mobile menu")}
      summary={`${theme.header.button.text ? t(`ปุ่ม “${theme.header.button.text}”`, `Button “${theme.header.button.text}”`) : t("ไม่มีปุ่ม", "No button")} · ${t("เมนูมือถือ", "Mobile menu ")}${theme.header.mobileMenuSide === "top" ? t("คลี่ลง", "drops down") : theme.header.mobileMenuSide === "left" ? t("จากซ้าย", "from left") : t("จากขวา", "from right")}${theme.header.langMobile === "menu" ? t(" · TH/EN ในเมนู", " · TH/EN in menu") : ""}${theme.header.hideOnScroll ? t(" · เลื่อนลงซ่อน", " · hides on scroll") : ""}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("ข้อความปุ่มใน Header (ว่าง = ไม่มีปุ่ม)", "Header button text (empty = no button)")}</label>
          <LangInput className={inputCls} obj={theme.header.button} k="text" maxLength={30} placeholder={t("เช่น ช้อปเลย", "e.g. Shop now")} onPatch={(p) => setHeader({ button: { ...theme.header.button, ...p } })} />
        </div>
        <div>
          <label className={labelCls}>{t("ลิงก์ของปุ่ม", "Button link")}</label>
          <LinkTargetPicker value={theme.header.button.href} onChange={(href) => setHeader({ button: { ...theme.header.button, href } })} ctx={linkCtx} />
        </div>
        <div>
          <label className={labelCls}>{t("เมนูมือถือเปิดจาก", "Mobile menu opens from")}</label>
          <select className={inputCls} value={theme.header.mobileMenuSide} onChange={(e) => setHeader({ mobileMenuSide: e.target.value as "left" | "right" | "top" })}>
            <option value="top">{t("คลี่ลงใต้แถบเมนู", "Drop down under the menu bar")}</option>
            <option value="left">{t("ลิ้นชักจากซ้าย", "Drawer from left")}</option>
            <option value="right">{t("ลิ้นชักจากขวา", "Drawer from right")}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("มือถือ: ปุ่มภาษา TH / EN", "Mobile: TH / EN language button")}</label>
          <select className={inputCls} value={theme.header.langMobile} onChange={(e) => setHeader({ langMobile: e.target.value as "bar" | "menu" })}>
            <option value="bar">{t("บนหัวเว็บ (แบบเดิม)", "In the header (as before)")}</option>
            <option value="menu">{t("ย้ายไปในเมนู ☰", "Move into the ☰ menu")}</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{t("จอคอมยังอยู่บนหัวเว็บเหมือนเดิม · โชว์เฉพาะร้านที่เปิดภาษาอังกฤษ", "On desktop it stays in the header · only shown for shops with English turned on")}</p>
        </div>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.hideOnScroll} onChange={(e) => setHeader({ hideOnScroll: e.target.checked })} />
            {t("เลื่อนลงซ่อนแถบเมนู · เลื่อนขึ้นโผล่", "Hide menu bar on scroll down · show on scroll up")}
          </label>
        </div>
      </div>
    </DesignCard>

    <DesignCard title={t("หัวเว็บทับรูปใหญ่ (โปร่งใสตอนอยู่บนสุด)", "Header over hero image (transparent at top)")} summary={theme.header.overPages.home.on ? t("เปิดที่หน้าแรก", "On for home page") : t("ปิดที่หน้าแรก", "Off for home page")}>
      <HeaderOverPagesSettings
        value={theme.header.overPages}
        onChange={(overPages) => setHeader({ overPages, overHero: overPages.home.on })}
        previewPath={{ home: "/", product: sampleProduct ? `/product/${sampleProduct}` : null, listing: "/shop", new: "/new", custom: storePages[0] ? `/${storePages[0].slug}` : null, other: "/cart" }}
        currentPath={page}
        onPreview={setPage}
      />
    </DesignCard>

    <DesignCard title={t("ไอคอนบนหัวเว็บ", "Header icons")} summary={t("หน้าตาไอคอนค้นหา · บัญชี · ตะกร้า", "Look of search · account · cart icons")}>
      <HeaderIconStyleSetting value={theme.header.iconStyle} onChange={(iconStyle) => setHeader({ iconStyle })} ink={theme.header.textColor || theme.colors.ink} />
      <p className="text-[11px] text-slate-400 mt-3">{t("* รายการในเมนูตั้งที่แท็บ \"เมนู\" · ยังไม่ตั้ง = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้างเอง + ติดต่อ)", "* Menu items are set in the \"Menu\" tab · not set = automatic (all products + custom pages + contact)")}</p>
    </DesignCard>
    {areaFold("header", HEADER_PARTS, t("แถบประกาศ · โลโก้ · ลิงก์เมนู · ไอคอน · ป้ายตะกร้า", "Announcement bar · logo · menu links · icons · cart badge"), "/")}
    </>
  );
}

/** 👤 เว็บร้านโชว์ไอคอนบัญชีสมาชิกเมื่อมีช่องทางเข้าสู่ระบบพร้อมอย่างน้อย 1 ทาง (เว็บร้าน memberEnabled ← member-config)
 *  ready: true/false · null = ยังไม่รู้ (ไม่ได้วางชิ้น / ไม่มีสิทธิ์ดู / โหลดพลาด → ไม่เตือน) */
function useMemberLoginReady(shopSlug: string, placed: boolean) {
  const [ready, setReady] = useState<boolean | null>(null);
  const reload = useCallback(() => {
    if (!placed || !shopSlug) return setReady(null);
    apiFetch(`/api/website/members/login-settings?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tokensReady?: boolean; providers?: Record<string, { ready?: boolean }> } | null) => setReady(j ? !!j.tokensReady && Object.values(j.providers ?? {}).some((p) => p.ready) : null))
      .catch(() => setReady(null));
  }, [shopSlug, placed]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ready, reload };
}

/* ─────────── Header: จัดชิ้นส่วน 3 โซน ─────────── */
/** ชิ้นที่กดแล้วเปิดป๊อปตั้งค่าได้ */
export const ZONE_CONFIGURABLE: HeaderEl[] = ["logo", "menu", "search", "cart", "social"];
/** hiddenEls = ชิ้นที่วางไว้แต่เว็บร้านยังซ่อนอยู่ (เหตุผล) → ป้าย ⚠ บนชิ้นนั้น */
export function ZonesEditor({ zones, onChange, onConfig, hiddenEls }: { zones: HeaderZones; onChange: (z: HeaderZones) => void; onConfig?: (el: HeaderEl) => void; hiddenEls?: Partial<Record<HeaderEl, string>> }) {
  const t = useT();
  const ZK = ["left", "center", "right"] as const;
  const ZL: Record<(typeof ZK)[number], string> = { left: t("ซ้าย", "Left"), center: t("กลาง", "Center"), right: t("ขวา", "Right") };
  const placed = new Set([...zones.left, ...zones.center, ...zones.right]);
  const missing = HEADER_EL_DEFS.filter((d) => !placed.has(d.key));
  const label = (k: HeaderEl) => labelEn(HEADER_EL_DEFS.find((d) => d.key === k)?.label ?? k);
  const move = (from: (typeof ZK)[number], idx: number, dir: -1 | 1) => {
    const to = ZK[ZK.indexOf(from) + dir];
    if (!to) return;
    const el = zones[from][idx];
    onChange({ ...zones, [from]: zones[from].filter((_, i) => i !== idx), [to]: dir === 1 ? [el, ...zones[to]] : [...zones[to], el] });
  };
  const remove = (z: (typeof ZK)[number], idx: number) => onChange({ ...zones, [z]: zones[z].filter((_, i) => i !== idx) });
  const add = (z: (typeof ZK)[number], el: HeaderEl) => onChange({ ...zones, [z]: [...zones[z], el] });
  return (
    <div className="grid grid-cols-3 gap-2">
      {ZK.map((z) => (
        <ZoneColumn key={z} title={ZL[z]} items={zones[z]} label={label} onConfig={onConfig} hiddenEls={hiddenEls} canLeft={z !== "left"} canRight={z !== "right"} missing={missing} onReorder={(from, to) => onChange({ ...zones, [z]: moveItem(zones[z], from, to) })} onMove={(i, d) => move(z, i, d)} onRemove={(i) => remove(z, i)} onAdd={(el) => add(z, el)} />
      ))}
    </div>
  );
}
export function ZoneColumn({ title, items, label, onConfig, hiddenEls, canLeft, canRight, missing, onReorder, onMove, onRemove, onAdd }: { title: string; items: HeaderEl[]; label: (k: HeaderEl) => string; onConfig?: (el: HeaderEl) => void; hiddenEls?: Partial<Record<HeaderEl, string>>; canLeft: boolean; canRight: boolean; missing: { key: HeaderEl; label: string }[]; onReorder: (from: number, to: number) => void; onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void; onAdd: (el: HeaderEl) => void }) {
  const t = useT();
  const drag = useDragReorder(onReorder);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 min-h-[96px]">
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5 text-center">{title}</div>
      <ul className="space-y-1">
        {items.map((el, i) => (
          <li key={el} {...drag.rowProps(i)} className={`flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-1 text-xs text-slate-700 ${drag.rowCls(i)}`}>
            <DragHandle {...drag.handleProps(i)} />
            {onConfig && ZONE_CONFIGURABLE.includes(el) ? (
              <button type="button" onClick={() => onConfig(el)} className="flex-1 min-w-0 flex items-center gap-1 text-left text-blue-700 hover:underline" title={t(`ตั้งค่า${label(el)}`, `Set up ${label(el)}`)}>
                <span className="truncate">{label(el)}</span>
                <span aria-hidden className="text-[10px] text-slate-400">⚙</span>
              </button>
            ) : (
              <span className="flex-1 truncate" title={labelEn(HEADER_EL_DEFS.find((d) => d.key === el)?.hint ?? "") || undefined}>{label(el)}</span>
            )}
            {hiddenEls?.[el] && (
              <span data-el-hidden={el} className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title={hiddenEls[el]}>
                ⚠ {t("ซ่อนอยู่", "Hidden")}
              </span>
            )}
            <button type="button" disabled={!canLeft} onClick={() => onMove(i, -1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title={t("ย้ายไปโซนซ้าย", "Move to left zone")}>◀</button>
            <button type="button" disabled={!canRight} onClick={() => onMove(i, 1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title={t("ย้ายไปโซนขวา", "Move to right zone")}>▶</button>
            <button type="button" onClick={() => onRemove(i)} className="text-slate-300 hover:text-rose-600 px-0.5" title={t("เอาออก", "Remove")}>✕</button>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <select className="mt-1.5 w-full h-7 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 bg-white px-1" value="" onChange={(e) => e.target.value && onAdd(e.target.value as HeaderEl)}>
          <option value="">{t("+ เพิ่มชิ้นส่วน…", "+ Add element…")}</option>
          {missing.map((d) => <option key={d.key} value={d.key}>{labelEn(d.label)}</option>)}
        </select>
      )}
    </div>
  );
}