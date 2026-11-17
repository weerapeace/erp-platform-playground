"use client";

/**
 * 🚪 โซนของเว็บ — แบ่งเว็บเป็นหลายส่วนที่เมนูต่างกัน (เช่น "รับผลิต" | "ร้านอะไหล่") + แถบสลับโซนบนสุด
 * ข้อมูล theme.siteZones (ร่าง/เผยแพร่พร้อมธีม) · กฎกลาง lib/website-site-zones (มิเรอร์เว็บร้าน src/lib/site-zones)
 * เมนูของโซนใช้ MenuEditor ตัวเดียวกับแท็บเมนู · เว็บร้านวาดแถบ + เลือกเมนูใน Navbar
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import { LangInput } from "@/components/bilingual-field";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ColorInput } from "@/components/color-picker";
import { ConfirmDialog } from "@/components/modal";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { newMenuItem, type MenuItem } from "@/lib/website-theme";
import { SITE_ZONE_HIDE_ELS, SITE_ZONE_MAX, cleanSiteZonePath, siteZoneHref, type SiteZone, type SiteZoneConfig } from "@/lib/website-site-zones";
import { MenuEditor } from "./menu-tab";
import { useDesign } from "./context";
import { DesignCard } from "./design-card";
import { inputCls, labelCls } from "./shared";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-admin-en";

type Zone = SiteZone<MenuItem>;

const newZone = (label: string, extra: Partial<Zone> = {}): Zone => ({
  id: `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  label,
  home: "",
  paths: [],
  items: null,
  button: { text: "", href: "" },
  hide: [],
  ...extra,
});

/** หน้าของระบบที่เลือกใส่โซนได้ (หน้าลูกนับด้วย เช่น /product = ทุกหน้าสินค้า) */
const SYSTEM_PATHS: { path: string; label: string }[] = [
  { path: "/shop", get label() { return tr("สินค้าทั้งหมด", "All products"); } },
  { path: "/c", get label() { return tr("ทุกหน้าหมวดสินค้า", "All category pages"); } },
  { path: "/product", get label() { return tr("ทุกหน้าสินค้า", "All product pages"); } },
  { path: "/new", get label() { return tr("หน้ามาใหม่", "New drops page"); } },
  { path: "/collection", get label() { return tr("ทุกหน้าคอลเลกชัน", "All collection pages"); } },
  { path: "/blog", get label() { return tr("บล็อก", "Blog"); } },
  { path: "/contact", get label() { return tr("ติดต่อ", "Contact"); } },
];

const seg = (on: boolean) =>
  `text-[11px] px-2.5 h-7 rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";

export function SiteZonesCard() {
  const { theme, apply, choices, storePages, megaCtx, linkCtx, setPage } = useDesign();
  const t = useT();
  const cfg = theme.siteZones;
  const set = (p: Partial<SiteZoneConfig<MenuItem>>) => apply({ ...theme, siteZones: { ...cfg, ...p } });
  const setZone = (id: string, patch: Partial<Zone>) => set({ items: cfg.items.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const drag = useDragReorder((from, to) => set({ items: moveItem(cfg.items, from, to) }));
  // โซนหลัก = โซนแรกที่ไม่ได้เลือกหน้า (รับหน้าอื่นทั้งหมด) — โซนถัดไปที่ไม่ได้เลือกหน้า ลูกค้าจะเข้าไม่ถึง
  const mainId = cfg.items.find((z) => !z.paths.length)?.id ?? null;
  const btnOnHeader = [...theme.header.zones.left, ...theme.header.zones.center, ...theme.header.zones.right].includes("button");

  const summary = !cfg.enabled ? t("ปิดอยู่ — ทั้งเว็บใช้เมนูหลักชุดเดียว", "Off — the whole site uses one main menu") : cfg.items.length ? t(`${cfg.items.length} โซน: ${cfg.items.map((z) => z.label).join(" | ")}`, `${cfg.items.length} zones: ${cfg.items.map((z) => z.label).join(" | ")}`) : t("เปิดแล้ว แต่ยังไม่มีโซน", "On, but no zones yet");

  return (
    <DesignCard
      title="โซนของเว็บ"
      summary={summary}
      hint={t("แบ่งเว็บเป็นหลายส่วนที่เมนูต่างกัน เช่น “รับผลิต” กับ “ร้านค้า” · ลูกค้าสลับส่วนได้จากแถบบนสุด · ใช้คู่กับ Section หน้าเปิดแบ่งช่องที่หน้าแรก", "Split the site into parts with different menus, e.g. “Manufacturing” and “Shop” · customers switch parts from the top bar · pair with the split landing section on the home page")}
    >
      <div className="space-y-3" data-site-zones>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleSwitch
            on={cfg.enabled}
            onChange={(v) => set({ enabled: v, ...(v && !cfg.items.length ? { items: [newZone("หน้าร้าน", { home: "/shop" }), newZone("โซนที่ 2")] } : {}) })}
            label={<span className="text-sm text-slate-700">{t("เปิดใช้โซน", "Enable zones")}</span>}
          />
          <span className="text-[11px] text-slate-500">{t("ปิด = ทั้งเว็บใช้เมนูหลักชุดเดียวเหมือนเดิม (ค่าที่ตั้งไว้ไม่หาย) · มีผลหลังกดเผยแพร่ธีม", "Off = the whole site uses one main menu as before (settings are kept) · takes effect after publishing the theme")}</span>
        </div>

        {cfg.enabled && (
          <>
            <p className="text-[11px] text-slate-500">
              {t("แต่ละโซนบอกว่า “หน้าไหนอยู่ในโซนนี้” · ลูกค้าอยู่หน้าไหน หัวเว็บใช้เมนูของโซนนั้น · โซนที่ไม่เลือกหน้าเลย = ", "Each zone says “which pages are in this zone” · the header uses the menu of the zone the customer is in · a zone with no pages = ")}<b>{t("โซนหลัก", "main zone")}</b>{t(" (หน้าอื่นทั้งหมด เช่น ตะกร้า ชำระเงิน) มีได้โซนเดียว", " (all other pages, e.g. cart, checkout) — only one allowed")}
            </p>
            <ul className="space-y-1.5">
              {cfg.items.map((z, i) => {
                const open = openId === z.id;
                const isMain = z.id === mainId;
                const lost = !z.paths.length && !isMain;
                return (
                  <li key={z.id} {...drag.rowProps(i)} data-zone-row={z.id} className={`rounded-lg border bg-white ${open ? "border-blue-300" : lost ? "border-amber-300" : "border-slate-200"} ${drag.rowCls(i)}`}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <DragHandle {...drag.handleProps(i)} />
                      <LangInput className={`${mini} w-36 min-w-0`} obj={z} k="label" maxLength={40} onPatch={(p) => setZone(z.id, p)} placeholder={t("ชื่อโซน", "Zone name")} />
                      <span className={`shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] ${isMain ? "bg-blue-50 text-blue-700" : lost ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {isMain ? t("โซนหลัก · หน้าอื่นทั้งหมด", "Main zone · all other pages") : lost ? t("ยังไม่ได้เลือกหน้า", "No pages selected") : z.paths.join(" · ")}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{z.items ? t(`เมนูเฉพาะ ${z.items.length}`, `Own menu ${z.items.length}`) : t("เมนูหลัก", "Main menu")}</span>
                      <span className="flex-1" />
                      <button type="button" className="text-slate-400 hover:text-blue-600 px-1" title={t(`ดูพรีวิวหน้า ${siteZoneHref(z)}`, `Preview page ${siteZoneHref(z)}`)} onClick={() => setPage(siteZoneHref(z))}>
                        <Icon name="view" />
                      </button>
                      <button type="button" onClick={() => setOpenId(open ? null : z.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                        {t("✎ ตั้งค่า", "✎ Settings")}
                      </button>
                      <button type="button" onClick={() => setDelId(z.id)} className="text-slate-300 hover:text-rose-600 px-1" title={t("ลบโซน", "Delete zone")}>
                        <Icon name="delete" />
                      </button>
                    </div>
                    {lost && <p className="mx-2 mb-1.5 text-[11px] text-amber-700">{t("มีโซนหลักแล้ว — โซนนี้ต้องเลือกหน้าอย่างน้อย 1 หน้า ไม่งั้นลูกค้าเข้าโซนนี้ไม่ได้", "There is already a main zone — pick at least 1 page for this zone, or customers can't reach it")}</p>}
                    {open && <ZoneEditor z={z} isMain={isMain} setZone={(p) => setZone(z.id, p)} pages={storePages} mainItems={theme.menu.items} btnOnHeader={btnOnHeader} linkCtx={linkCtx} choices={choices} megaCtx={megaCtx} />}
                  </li>
                );
              })}
            </ul>
            {cfg.items.length < SITE_ZONE_MAX && (
              <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => { const z = newZone(`โซนที่ ${cfg.items.length + 1}`); set({ items: [...cfg.items, z] }); setOpenId(z.id); }}>
                {t("+ เพิ่มโซน", "+ Add zone")}
              </button>
            )}
            {cfg.items.length < 2 && <p className="text-[11px] text-amber-700">{t("ต้องมีอย่างน้อย 2 โซน แถบสลับโซนถึงจะขึ้นบนเว็บ", "Needs at least 2 zones for the zone switcher bar to show on the site")}</p>}
            {!mainId && cfg.items.length > 0 && <p className="text-[11px] text-slate-500">{t("ทุกโซนเลือกหน้าไว้แล้ว — หน้าที่ไม่อยู่ในโซนไหน (เช่น ตะกร้า) ใช้เมนูหลักของร้าน และแถบสลับไม่ไฮไลต์โซนใด", "Every zone has pages — pages in no zone (e.g. cart) use the shop's main menu and the switcher highlights no zone")}</p>}

            {/* แถบสลับโซนบนสุด */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">{t("แถบสลับโซน (บนสุดเหนือหัวเว็บ)", "Zone switcher bar (top, above the header)")}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 w-20">{t("สีแถบ", "Bar color")}</span>
                <button type="button" className={seg(cfg.bar.bg === "ink")} onClick={() => set({ bar: { ...cfg.bar, bg: "ink" } })}>{t("เข้ม (สีตัวหนังสือหลัก)", "Dark (main text color)")}</button>
                <button type="button" className={seg(cfg.bar.bg === "brand")} onClick={() => set({ bar: { ...cfg.bar, bg: "brand" } })}>{t("สีหลักร้าน", "Shop main color")}</button>
                <button type="button" className={seg(cfg.bar.bg === "custom")} onClick={() => set({ bar: { ...cfg.bar, bg: "custom", bgColor: cfg.bar.bgColor || "#1d1d1d" } })}>{t("เลือกเอง", "Custom")}</button>
                {cfg.bar.bg === "custom" && (
                  <span className="w-32">
                    <ColorInput value={cfg.bar.bgColor || "#1d1d1d"} onChange={(v) => set({ bar: { ...cfg.bar, bgColor: v } })} />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 w-20">{t("จัดแท็บ", "Tab alignment")}</span>
                <button type="button" className={seg(cfg.bar.align === "left")} onClick={() => set({ bar: { ...cfg.bar, align: "left" } })}>{t("ชิดซ้าย", "Left")}</button>
                <button type="button" className={seg(cfg.bar.align === "center")} onClick={() => set({ bar: { ...cfg.bar, align: "center" } })}>{t("ตรงกลาง", "Center")}</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t("ลิงก์กลับหน้าแรกท้ายแถบ (ว่าง = ไม่มี)", "Home link at end of bar (empty = none)")}</label>
                  <LangInput obj={cfg.bar} k="homeText" maxLength={30} placeholder={t("เช่น หน้าแรก", "e.g. Home")} onPatch={(p) => set({ bar: { ...cfg.bar, ...p } })} />
                </div>
                <label className="flex items-center gap-2 self-end pb-1.5 text-[11px] text-slate-600 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={cfg.bar.onHome} onChange={(e) => set({ bar: { ...cfg.bar, onHome: e.target.checked } })} />
                  {t("โชว์แถบบนหน้าแรกด้วย (ปกติหน้าแรกเป็นหน้าเปิดแบ่งช่อง ไม่ต้องมีแถบ)", "Also show the bar on the home page (usually the home page is a split landing page without a bar)")}
                </label>
              </div>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => {
          set({ items: cfg.items.filter((z) => z.id !== delId) });
          setDelId(null);
        }}
        title={t("ลบโซนนี้?", "Delete this zone?")}
        message={t("เมนูเฉพาะของโซนนี้จะหายด้วย · หน้าที่เคยอยู่ในโซนนี้จะกลับไปใช้โซนหลัก/เมนูหลัก", "This zone's own menu will be removed too · its pages go back to the main zone/main menu")}
        confirmText={t("ลบโซน", "Delete zone")}
        variant="danger"
      />
    </DesignCard>
  );
}

function ZoneEditor({
  z,
  isMain,
  setZone,
  pages,
  mainItems,
  btnOnHeader,
  linkCtx,
  choices,
  megaCtx,
}: {
  z: Zone;
  isMain: boolean;
  setZone: (p: Partial<Zone>) => void;
  pages: { slug: string; title: string; status?: string }[];
  mainItems: MenuItem[] | null;
  btnOnHeader: boolean;
  linkCtx: ReturnType<typeof useDesign>["linkCtx"];
  choices: ReturnType<typeof useDesign>["choices"];
  megaCtx: ReturnType<typeof useDesign>["megaCtx"];
}) {
  const t = useT();
  const [custom, setCustom] = useState("");
  const addPath = (raw: string) => {
    const p = cleanSiteZonePath(raw);
    if (p && !z.paths.includes(p)) setZone({ paths: [...z.paths, p] });
  };
  // เริ่มเมนูเฉพาะโซนจากเมนูหลัก (รหัสใหม่ทั้งชุด — แก้แล้วไม่กระทบเมนูหลัก)
  const copyMain = (): MenuItem[] =>
    (mainItems ?? [newMenuItem("หน้าแรกของโซน", "url", z.home || "/")]).map((it) => ({ ...it, id: `${z.id}${it.id}`.slice(0, 40), children: it.children.map((c) => ({ ...c, id: `${z.id}${c.id}`.slice(0, 40) })) }));
  return (
    <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
      <div>
        <label className={labelCls}>{t("หน้าแรกของโซน — กดแท็บบนแถบสลับแล้วไปที่นี่", "Zone home page — clicking the tab on the switcher goes here")}</label>
        <LinkTargetPicker size="sm" value={z.home} onChange={(home) => setZone({ home })} ctx={linkCtx} />
      </div>

      <div>
        <label className={labelCls}>{t("หน้าที่อยู่ในโซนนี้ (นับหน้าลูกด้วย เช่น /oem = /oem/…)", "Pages in this zone (sub-pages count too, e.g. /oem = /oem/…)")}</label>
        {z.paths.length ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {z.paths.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                {p}
                <button type="button" className="text-slate-400 hover:text-rose-600" title={t("เอาออก", "Remove")} onClick={() => setZone({ paths: z.paths.filter((x) => x !== p) })}>✕</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-1.5 text-[11px] text-slate-500">{isMain ? t("ยังไม่เลือกหน้า = โซนหลัก (หน้าอื่นทั้งหมด)", "No pages = main zone (all other pages)") : t("ยังไม่เลือกหน้า", "No pages selected")}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <select className={mini} value="" onChange={(e) => addPath(e.target.value)}>
            <option value="">{t("＋ เพิ่มหน้า…", "＋ Add page…")}</option>
            {pages.length > 0 && (
              <optgroup label={t("หน้าที่สร้างเอง", "Custom pages")}>
                {pages.map((pg) => (
                  <option key={pg.slug} value={`/${pg.slug}`} disabled={z.paths.includes(`/${pg.slug}`)}>{pg.title} (/{pg.slug}){pg.status && pg.status !== "published" ? t(" · ร่าง", " · Draft") : ""}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={t("หน้าของระบบ", "System pages")}>
              {SYSTEM_PATHS.map((s) => (
                <option key={s.path} value={s.path} disabled={z.paths.includes(s.path)}>{s.label} ({s.path})</option>
              ))}
            </optgroup>
          </select>
          <input className={`${mini} w-36`} value={custom} placeholder={t("หรือพิมพ์ เช่น /oem", "or type, e.g. /oem")} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addPath(custom); setCustom(""); } }} />
          <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => { addPath(custom); setCustom(""); }}>{t("เพิ่ม", "Add")}</button>
        </div>
      </div>

      <div>
        <label className={labelCls}>{t("เมนูของโซนนี้ (ใช้ทั้งจอคอมและมือถือ)", "Menu for this zone (desktop and mobile)")}</label>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <button type="button" className={seg(z.items === null)} onClick={() => setZone({ items: null })}>{t("ใช้เมนูหลักของร้าน", "Use shop main menu")}</button>
          <button type="button" className={seg(z.items !== null)} onClick={() => z.items === null && setZone({ items: copyMain() })}>{t("ตั้งเมนูเฉพาะโซนนี้", "Set a menu for this zone")}</button>
        </div>
        {z.items !== null && <MenuEditor items={z.items} onChange={(items) => setZone({ items })} choices={choices} pages={pages} megaCtx={megaCtx} />}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t("ปุ่มบนหัวเว็บเฉพาะโซนนี้ (ว่าง = ปุ่มเดิมของหัวเว็บ)", "Header button for this zone (empty = header's usual button)")}</label>
          <LangInput className={inputCls} obj={z.button} k="text" maxLength={30} placeholder={t("เช่น ขอใบเสนอราคา", "e.g. Request a quote")} onPatch={(p) => setZone({ button: { ...z.button, ...p } })} />
        </div>
        <div>
          <label className={labelCls}>{t("ลิงก์ของปุ่ม", "Button link")}</label>
          <LinkTargetPicker size="sm" value={z.button.href} onChange={(href) => setZone({ button: { ...z.button, href } })} ctx={linkCtx} />
        </div>
      </div>
      {z.button.text && !btnOnHeader && (
        <p className="flex items-center gap-1 text-[11px] text-amber-700">
          <Icon name="warning" /> {t("หัวเว็บยังไม่ได้วางชิ้น “ปุ่ม” — ไปที่ ดีไซน์ › หัวเว็บ › ตำแหน่งชิ้นส่วน แล้วเพิ่มชิ้นปุ่ม ปุ่มของโซนถึงจะขึ้น", "The header has no “Button” part yet — go to Design › Header › Part positions and add a button part for the zone button to show")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">{t("ซ่อนบนหัวเว็บในโซนนี้", "Hide in header for this zone")}</span>
        {SITE_ZONE_HIDE_ELS.map((o) => {
          const on = z.hide.includes(o.value);
          return (
            <button key={o.value} type="button" className={seg(on)} onClick={() => setZone({ hide: on ? z.hide.filter((h) => h !== o.value) : [...z.hide, o.value] })}>
              {on ? "✓ " : ""}{labelEn(o.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
