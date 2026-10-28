"use client";

/** หัวเว็บ (Header) — สี/ความสูง · ตำแหน่งชิ้นส่วน (ซ้าย·กลาง·ขวา) + ป๊อป ⚙ ตั้งค่าชิ้นส่วน (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
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

export function HeaderTab() {
  const { shopSlug, shopId, theme, choices, apply, setHeader, setMenu, page, setPage, sampleProduct, storePages, iframeRef, linkCtx, megaCtx } = useDesign();
  const roleEditor = useRoleEditor();
  const areaFold = useAreaFold();
  /** ป๊อปตั้งค่าชิ้นส่วนหัวเว็บที่เปิดอยู่ (กดชื่อชิ้นที่มี ⚙ ใน ZonesEditor) */
  const [zoneCfg, setZoneCfg] = useState<HeaderEl | null>(null);
  const zoneNames = (els: HeaderEl[]) => els.map((k) => HEADER_EL_DEFS.find((d) => d.key === k)?.label ?? k).join(" ") || "—";
  const z = theme.header.zones;
  return (
    <>
    <DesignCard
      title="แถบหัวเว็บ — ขนาด · สี · ตำแหน่งเมนู"
      summary={`${choices.headerBg.find((o) => o.value === theme.header.bg)?.label ?? theme.header.bg} · สูง ${theme.header.height}px${theme.header.sticky ? " · ตรึงด้านบน" : ""}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>ความสูง · {theme.header.height}px</label>
          <RangeInput min={48} max={240} value={theme.header.height} onChange={(v) => setHeader({ height: v })} className="w-full accent-blue-600" />
        </div>
        <div>
          <label className={labelCls}>สีพื้นหลัง</label>
          <select className={inputCls} value={theme.header.bg} onChange={(e) => setHeader({ bg: e.target.value as HeaderBg })}>
            {choices.headerBg.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>ตำแหน่งเมนู</label>
          <select className={inputCls} value={theme.header.menuAlign} onChange={(e) => setHeader({ menuAlign: e.target.value as MenuAlign })}>
            {choices.menuAligns.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.sticky} onChange={(e) => setHeader({ sticky: e.target.checked })} />
            ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.showCart} onChange={(e) => setHeader({ showCart: e.target.checked })} />
            แสดงไอคอนตะกร้า
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.border} onChange={(e) => setHeader({ border: e.target.checked })} />
            มีเส้นคั่นด้านล่าง
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
        <div>
          <label className={labelCls}>สีพื้น Header</label>
          <select className={inputCls} value={theme.header.bgKind} onChange={(e) => setHeader({ bgKind: e.target.value as "preset" | "custom" })}>
            <option value="preset">ตามตัวเลือกด้านบน</option>
            <option value="custom">กำหนดสีเอง</option>
          </select>
          {theme.header.bgKind === "custom" && (
            <div className="mt-2">
              <ColorPicker value={theme.header.bgColor} onChange={(hex) => setHeader({ bgColor: hex })} />
            </div>
          )}
        </div>
        <ColorField label="สีตัวอักษร/ไอคอนใน Header" value={theme.header.textColor} onChange={(hex) => setHeader({ textColor: hex })} emptyLabel="อัตโนมัติ (ขาว/ดำตามพื้น)" />
      </div>
    </DesignCard>

    <DesignCard
      title="ตำแหน่งชิ้นส่วน (ซ้าย · กลาง · ขวา)"
      hint="ลาก ⠿ จัดลำดับในโซน · ◀ ▶ ย้ายโซน · ✕ เอาออก"
      summary={`ซ้าย ${zoneNames(z.left)} · กลาง ${zoneNames(z.center)} · ขวา ${zoneNames(z.right)}`}
    >
      <div>
        <ZonesEditor zones={theme.header.zones} onChange={(zones) => setHeader({ zones })} onConfig={setZoneCfg} />
        <p className="text-[11px] text-slate-400 mt-1.5">กดชื่อชิ้นที่มี ⚙ (โลโก้ · เมนู · ค้นหา · ตะกร้า · โซเชียล) เพื่อตั้งค่าในป๊อปได้เลย · “บัญชีสมาชิก” โชว์เมื่อเว็บเปิดระบบสมาชิกแล้ว (ตั้งช่องทางเข้าสู่ระบบ)</p>
        {/* ⚙ ป๊อปตั้งค่าชิ้นส่วน: เมนู = แก้ในธีม (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) · โซเชียล = ข้อมูลร้าน บันทึกทันที */}
        <ERPModal
          open={zoneCfg === "menu"}
          onClose={() => setZoneCfg(null)}
          title="☰ เมนูด้านบน"
          description="จัดลำดับ ลิงก์ไปหน้า/หมวด/สินค้า/URL · ป้ายเล็ก · เมนูย่อย · ชุดมือถือแยกได้ — แก้แล้วเห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น"
          size="xl"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              เสร็จ
            </button>
          }
        >
          <MenuSettings menu={theme.menu} setMenu={setMenu} choices={choices} pages={storePages} megaCtx={megaCtx} typo={{ nav: roleOf(theme, "nav").uppercase, menu: roleOf(theme, "menu").uppercase, setUpper: (k, v) => apply({ ...theme, typography: { ...theme.typography, [k]: { ...roleOf(theme, k), uppercase: v } } }), editors: TEXT_ROLE_DEFS.filter((d) => d.key === "nav" || d.key === "menu").map(roleEditor) }} />
        </ERPModal>
        {/* ⚙ โลโก้ = เนื้อหาเดียวกับแท็บโลโก้ · ⚙ ตะกร้า/ค้นหา = theme.header.cart / .search (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) */}
        <ERPModal
          open={zoneCfg === "logo"}
          onClose={() => setZoneCfg(null)}
          title="🏷 โลโก้"
          description="ค่าเดียวกับแท็บโลโก้ — แก้ตรงนี้ แท็บโลโก้เปลี่ยนตาม · เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบน"
          size="xl"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              เสร็จ
            </button>
          }
        >
          <div className="space-y-3"><LogoSettings /></div>
        </ERPModal>
        <ERPModal
          open={zoneCfg === "cart" || zoneCfg === "search"}
          onClose={() => setZoneCfg(null)}
          title={zoneCfg === "cart" ? "🛒 ตะกร้า" : "🔍 ค้นหา"}
          description="เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น"
          size="md"
          footer={
            <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              เสร็จ
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
      title="ปุ่มบนหัวเว็บ · เมนูมือถือ"
      summary={`${theme.header.button.text ? `ปุ่ม “${theme.header.button.text}”` : "ไม่มีปุ่ม"} · เมนูมือถือ${theme.header.mobileMenuSide === "top" ? "คลี่ลง" : theme.header.mobileMenuSide === "left" ? "จากซ้าย" : "จากขวา"}${theme.header.hideOnScroll ? " · เลื่อนลงซ่อน" : ""}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>ข้อความปุ่มใน Header (ว่าง = ไม่มีปุ่ม)</label>
          <LangInput className={inputCls} obj={theme.header.button} k="text" maxLength={30} placeholder="เช่น ช้อปเลย" onPatch={(p) => setHeader({ button: { ...theme.header.button, ...p } })} />
        </div>
        <div>
          <label className={labelCls}>ลิงก์ของปุ่ม</label>
          <LinkTargetPicker value={theme.header.button.href} onChange={(href) => setHeader({ button: { ...theme.header.button, href } })} ctx={linkCtx} />
        </div>
        <div>
          <label className={labelCls}>เมนูมือถือเปิดจาก</label>
          <select className={inputCls} value={theme.header.mobileMenuSide} onChange={(e) => setHeader({ mobileMenuSide: e.target.value as "left" | "right" | "top" })}>
            <option value="top">คลี่ลงใต้แถบเมนู</option>
            <option value="left">ลิ้นชักจากซ้าย</option>
            <option value="right">ลิ้นชักจากขวา</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.hideOnScroll} onChange={(e) => setHeader({ hideOnScroll: e.target.checked })} />
            เลื่อนลงซ่อนแถบเมนู · เลื่อนขึ้นโผล่
          </label>
        </div>
      </div>
    </DesignCard>

    <DesignCard title="หัวเว็บทับรูปใหญ่ (โปร่งใสตอนอยู่บนสุด)" summary={theme.header.overPages.home.on ? "เปิดที่หน้าแรก" : "ปิดที่หน้าแรก"}>
      <HeaderOverPagesSettings
        value={theme.header.overPages}
        onChange={(overPages) => setHeader({ overPages, overHero: overPages.home.on })}
        previewPath={{ home: "/", product: sampleProduct ? `/product/${sampleProduct}` : null, listing: "/shop", new: "/new", custom: storePages[0] ? `/${storePages[0].slug}` : null, other: "/cart" }}
        currentPath={page}
        onPreview={setPage}
      />
    </DesignCard>

    <DesignCard title="ไอคอนบนหัวเว็บ" summary="หน้าตาไอคอนค้นหา · บัญชี · ตะกร้า">
      <HeaderIconStyleSetting value={theme.header.iconStyle} onChange={(iconStyle) => setHeader({ iconStyle })} ink={theme.header.textColor || theme.colors.ink} />
      <p className="text-[11px] text-slate-400 mt-3">* รายการในเมนูตั้งที่แท็บ "เมนู" · ยังไม่ตั้ง = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้างเอง + ติดต่อ)</p>
    </DesignCard>
    {areaFold("header", HEADER_PARTS, "แถบประกาศ · โลโก้ · ลิงก์เมนู · ไอคอน · ป้ายตะกร้า", "/")}
    </>
  );
}

/* ─────────── Header: จัดชิ้นส่วน 3 โซน ─────────── */
/** ชิ้นที่กดแล้วเปิดป๊อปตั้งค่าได้ */
export const ZONE_CONFIGURABLE: HeaderEl[] = ["logo", "menu", "search", "cart", "social"];
export function ZonesEditor({ zones, onChange, onConfig }: { zones: HeaderZones; onChange: (z: HeaderZones) => void; onConfig?: (el: HeaderEl) => void }) {
  const ZK = ["left", "center", "right"] as const;
  const ZL: Record<(typeof ZK)[number], string> = { left: "ซ้าย", center: "กลาง", right: "ขวา" };
  const placed = new Set([...zones.left, ...zones.center, ...zones.right]);
  const missing = HEADER_EL_DEFS.filter((d) => !placed.has(d.key));
  const label = (k: HeaderEl) => HEADER_EL_DEFS.find((d) => d.key === k)?.label ?? k;
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
        <ZoneColumn key={z} title={ZL[z]} items={zones[z]} label={label} onConfig={onConfig} canLeft={z !== "left"} canRight={z !== "right"} missing={missing} onReorder={(from, to) => onChange({ ...zones, [z]: moveItem(zones[z], from, to) })} onMove={(i, d) => move(z, i, d)} onRemove={(i) => remove(z, i)} onAdd={(el) => add(z, el)} />
      ))}
    </div>
  );
}
export function ZoneColumn({ title, items, label, onConfig, canLeft, canRight, missing, onReorder, onMove, onRemove, onAdd }: { title: string; items: HeaderEl[]; label: (k: HeaderEl) => string; onConfig?: (el: HeaderEl) => void; canLeft: boolean; canRight: boolean; missing: { key: HeaderEl; label: string }[]; onReorder: (from: number, to: number) => void; onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void; onAdd: (el: HeaderEl) => void }) {
  const drag = useDragReorder(onReorder);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 min-h-[96px]">
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5 text-center">{title}</div>
      <ul className="space-y-1">
        {items.map((el, i) => (
          <li key={el} {...drag.rowProps(i)} className={`flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-1 text-xs text-slate-700 ${drag.rowCls(i)}`}>
            <DragHandle {...drag.handleProps(i)} />
            {onConfig && ZONE_CONFIGURABLE.includes(el) ? (
              <button type="button" onClick={() => onConfig(el)} className="flex-1 min-w-0 flex items-center gap-1 text-left text-blue-700 hover:underline" title={`ตั้งค่า${label(el)}`}>
                <span className="truncate">{label(el)}</span>
                <span aria-hidden className="text-[10px] text-slate-400">⚙</span>
              </button>
            ) : (
              <span className="flex-1 truncate" title={HEADER_EL_DEFS.find((d) => d.key === el)?.hint}>{label(el)}</span>
            )}
            <button type="button" disabled={!canLeft} onClick={() => onMove(i, -1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title="ย้ายไปโซนซ้าย">◀</button>
            <button type="button" disabled={!canRight} onClick={() => onMove(i, 1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title="ย้ายไปโซนขวา">▶</button>
            <button type="button" onClick={() => onRemove(i)} className="text-slate-300 hover:text-rose-600 px-0.5" title="เอาออก">✕</button>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <select className="mt-1.5 w-full h-7 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 bg-white px-1" value="" onChange={(e) => e.target.value && onAdd(e.target.value as HeaderEl)}>
          <option value="">+ เพิ่มชิ้นส่วน…</option>
          {missing.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      )}
    </div>
  );
}