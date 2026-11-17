"use client";

/**
 * 🧭 ตัวจัดแผงเมนูใหญ่ (Mega menu) — ของกลาง ใช้ในแท็บ "เมนู" ของหน้าดีไซน์เว็บ (website-theme-panel MenuEditor)
 *
 * MegaModeChips   = เลือกหน้าตาเมนูย่อย: เมนูย่อยธรรมดา / แบบ A / แบบ B / แบบ C / แม่แบบที่บันทึก
 * MegaPanelEditor = แก้แผง: คอลัมน์ (รายการลิงก์ · กลุ่มหัวข้อย่อย · การ์ดสินค้า · รูปเด่น · การ์ดรูป) หรือแท็บ (การ์ดคอลเลกชัน)
 * MenuTemplatesModal / บันทึกแม่แบบ = /api/website/menu-templates (ใช้ข้ามร้านได้ · ใช้แล้วได้สำเนา)
 * ไอคอนลิงก์ = ของกลาง SiteIconPicker (ชุดไอคอนกลาง lib/website-icons · อีโมจิ · อัปโหลด → iconKey) — เว็บร้านวาดด้วย SiteIcon
 * ระหว่างแก้: ส่ง window event "website-menu-pin" → หน้าดีไซน์สั่งพรีวิวเปิดแผงของเมนูนี้ค้างไว้
 * ข้อมูล/ตัวกรอง: lib/website-mega-menu (มิเรอร์ storefront src/lib/mega-menu.ts)
 */
import { LangInput } from "@/components/bilingual-field";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { categoryChoiceLabel, categoryTree } from "@/lib/website-category-tree";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { WheelSelect } from "@/components/wheel-select";
import { Seg } from "@/components/website-block-editor";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ImageUploadField } from "@/components/website-theme-media";
import { SiteIconPicker } from "@/components/site-icon-picker";
import { imageIconValue, lineIconValue } from "@/lib/website-icons";
import { ColorInput } from "@/components/color-picker";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { CategoryCheckList } from "@/components/category-check-list";
import { translationPatch } from "@/lib/content-i18n";
import type { SchemaFormContext } from "@/components/website-schema-form";
import {
  MEGA_AUTOS,
  MEGA_SORTS,
  cloneMegaBlock,
  inShowWindow,
  megaBlockLinks,
  megaLinkIssue,
  normalizeMegaPanel,
  pickMegaProducts,
  type MegaAutoData,
  type MegaProductLike,
  MEGA_BLOCK_KINDS,
  MEGA_LIMITS,
  MEGA_LINK_KINDS,
  MEGA_LINK_EFFECTS,
  MEGA_ARROW_CHAR,
  MEGA_LINK_STYLES,
  MEGA_RATIOS,
  MEGA_TEMPLATES,
  megaCategoryHref,
  megaCategoryKeyOf,
  megaHasContent,
  megaIsSep,
  megaPreset,
  newMegaBlock,
  newMegaCard,
  newMegaGroup,
  newMegaLink,
  newMegaRow,
  newMegaTab,
  type MegaBlock,
  type MegaBlockKind,
  type MegaCard,
  type MegaLink,
  type MegaLinkStyle,
  type MegaLinkEffect,
  type MegaPanel,
  type MegaTemplate,
  type MenuTemplate,
} from "@/lib/website-mega-menu";
import { webForm } from "@/lib/website-form-styles";
import { FontSelect } from "@/components/font-select";
import { DEFAULT_FONT_NAMES, canvasFontNames, canvasFontOptions, fontFamilyOf } from "@/components/website-text-pickers";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { labelEn } from "@/lib/website-schema-en";

/** 🔤 ฟอนต์ลิงก์/หัวข้อในแผงเมนู (ชุดเดียวกับ CANVAS_FONTS · auto = ตามเมนู) — เรียกตอนวาด (ป้าย 2 ภาษา) */
const linkFontOptions = () => canvasFontOptions(DEFAULT_FONT_NAMES, tr("ตามเมนู", "Follow menu")).map((o) => ({ ...o, label: labelEn(o.label) }));
const LINK_FONT_NAMES = canvasFontNames(DEFAULT_FONT_NAMES);
const fontFamilyCss = (f: string) => `"${fontFamilyOf(f, DEFAULT_FONT_NAMES)}", sans-serif`;

export interface MegaEditorCtx {
  link: SchemaFormContext;
  categories: { key: string; label: string; parent?: string | null; label_en?: string }[];
  products: { code: string; name: string }[];
  shopId: string;
  /** หน้าที่สร้างเอง (ตรวจลิงก์เสีย) */
  pages: { slug: string; title: string }[];
  /** สินค้าบนเว็บ (API สาธารณะ) — พรีวิว "จะโชว์กี่ชิ้น" ของการ์ดสินค้า */
  liveProducts: (MegaProductLike & { code: string; name: string })[];
  /** หมวด/คอลเลกชัน/โทนสีของร้าน — รายการอัตโนมัติ + ตรวจลิงก์ */
  autoData: MegaAutoData | null;
}

const API = "/api/website/menu-templates";
const mini = webForm.mini;
const lbl = webForm.labelPlain;
const KIND_ICON: Record<MegaBlockKind, string> = { links: "☰", groups: "⋮☰", products: "🛍", feature: "🖼", cards: "🗂" };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ───────── ช่องลิงก์แบบย่อ: โชว์ปลายทาง · กด = เปิดตัวเลือกลิงก์กลาง ───────── */
function LinkField({ value, onChange, ctx }: { value: string; onChange: (href: string) => void; ctx: SchemaFormContext }) {
  const [open, setOpen] = useState(false);
  const tx = useT();
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${mini} w-full text-left truncate ${value ? "text-blue-700" : "text-slate-400"}`} title={value || tx("ยังไม่ได้ใส่ลิงก์", "No link yet")}>
        🔗 {value || tx("ใส่ลิงก์…", "Add link…")}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <LinkTargetPicker value={value} onChange={onChange} ctx={ctx} size="sm" />
          <button type="button" onClick={() => setOpen(false)} className="mt-1 text-[11px] text-blue-600 hover:underline">
            {tx("เสร็จ", "Done")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── เลือกไอคอน: ของกลาง SiteIconPicker (ไอคอนเส้นชุดกลาง · อีโมจิ · อัปโหลด) ───────── */
/** ค่าไอคอนของลิงก์ในรูปแบบกลาง — รูปอัปโหลด (iconKey) มาก่อน · ชื่อเปล่าแบบเก่า ("belt") = ไอคอนเส้น */
const linkIconValue = (l: MegaLink) => (l.iconKey ? imageIconValue(l.iconKey) : /^[a-z0-9-]+$/.test(l.icon) ? lineIconValue(l.icon) : l.icon);
function IconPicker({ link, onChange }: { link: MegaLink; onChange: (p: Partial<MegaLink>) => void }) {
  return <SiteIconPicker value={linkIconValue(link)} onChange={(v) => onChange(v.startsWith("img:") ? { icon: "", iconKey: v.slice(4) } : { icon: v, iconKey: null })} />;
}

/* ───────── 🔎 ตรวจลิงก์เสีย (ส่งผ่าน context ทั้งตัวจัด) ───────── */
type IssueSets = { categories: Set<string>; products: Set<string>; pages: Set<string>; collections?: Set<string> };
const IssueCtx = createContext<IssueSets | null>(null);
function IssueBadge({ href }: { href: string }) {
  const sets = useContext(IssueCtx);
  const tx = useT();
  const msg = sets ? megaLinkIssue(href, sets) : null;
  if (!msg || msg === "ยังไม่ได้ใส่ลิงก์") return null;
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title={tx("ลิงก์นี้อาจพา ลูกค้าไปหน้าที่ไม่มีแล้ว — แก้ลิงก์ใหม่", "This link may take customers to a page that no longer exists — fix the link")}>
      ⚠️ {labelEn(msg)}
    </span>
  );
}
/** นับลิงก์เสียทั้งแผง */
function panelIssues(p: MegaPanel, sets: IssueSets): number {
  const hrefs: string[] = [];
  for (const b of p.blocks) {
    if (b.titleHref) hrefs.push(b.titleHref);
    b.links.forEach((l) => l.href && hrefs.push(l.href));
    b.groups.forEach((g) => {
      if (g.href) hrefs.push(g.href);
      g.links.forEach((l) => l.href && hrefs.push(l.href));
    });
    b.cards.forEach((c) => c.href && hrefs.push(c.href));
    if (b.kind === "feature" && b.href) hrefs.push(b.href);
  }
  p.tabs.forEach((t) => {
    if (t.href) hrefs.push(t.href);
    t.cards.forEach((c) => c.href && hrefs.push(c.href));
  });
  return hrefs.filter((h) => megaLinkIssue(h, sets)).length;
}

/* ───────── วัน-เวลาแสดง (เวลาไทย) ───────── */
export function ShowWindowFields({ from, until, onChange }: { from: string; until: string; onChange: (p: { showFrom?: string; showUntil?: string }) => void }) {
  const live = inShowWindow(from, until);
  const tx = useT();
  // ค่าเก่าที่ยังไม่มีช่องนี้ = ว่าง
  const dt = (v: string | undefined) => (!v ? "" : v.length === 10 ? `${v}T00:00` : v);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <span>{tx("⏰ แสดงช่วง", "⏰ Show from")}</span>
      <input type="datetime-local" className={`${mini} w-[11.5rem]`} value={dt(from)} onChange={(e) => onChange({ showFrom: e.target.value })} aria-label={tx("เริ่มแสดง", "Start showing")} />
      <span>{tx("ถึง", "to")}</span>
      <input type="datetime-local" className={`${mini} w-[11.5rem]`} value={dt(until)} onChange={(e) => onChange({ showUntil: e.target.value })} aria-label={tx("หยุดแสดง", "Stop showing")} />
      {(from || until) && (
        <>
          <span className={`px-1.5 py-0.5 rounded ${live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{live ? tx("กำลังแสดง", "Showing now") : tx("ยังไม่แสดง/หมดเวลา", "Not yet / expired")}</span>
          <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => onChange({ showFrom: "", showUntil: "" })} title={tx("ล้าง = แสดงตลอด", "Clear = always show")}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}

/* ───────── รายการลิงก์ ───────── */
function LinksEditor({ links, style, onChange, ctx, max = MEGA_LIMITS.links, plainOnly = false, cols = 1 }: { links: MegaLink[]; style: MegaLinkStyle; onChange: (links: MegaLink[]) => void; ctx: MegaEditorCtx; max?: number; plainOnly?: boolean; /** แบ่งคอลัมน์ย่อย (≥2 = แต่ละลิงก์เลือกคอลัมน์ได้) */ cols?: number }) {
  const drag = useDragReorder((from, to) => onChange(moveItem(links, from, to)));
  const tx = useT();
  const [moreId, setMoreId] = useState<string | null>(null);
  const set = (id: string, p: Partial<MegaLink>) => onChange(links.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const st = plainOnly ? "plain" : style;
  // ☑ ติ๊กเลือกหมวด (หลายหมวด + หมวดย่อย) — ติ๊ก = มีลิงก์ · เอาติ๊กออก = ลบลิงก์หมวดนั้น · ลิงก์อื่น (ใส่เอง) ไม่แตะ
  const [catPick, setCatPick] = useState<string[] | null>(null);
  const catByHref = useMemo(() => new Map(ctx.categories.map((c) => [megaCategoryHref(c.key), c.key])), [ctx.categories]);
  const openCatPick = () => setCatPick(links.map((l) => catByHref.get(l.href)).filter((k): k is string => !!k));
  const applyCatPick = () => {
    if (!catPick) return;
    const want = new Set(catPick);
    const keep = links.filter((l) => {
      const k = catByHref.get(l.href);
      return !k || want.has(k);
    });
    // หมวดที่เพิ่งติ๊ก → แทรกต่อจากหมวดก่อนหน้าในต้นไม้ที่มีอยู่แล้ว (หมวดย่อยไปอยู่ใต้แม่) · ไม่มีเลย = ต่อท้าย
    const order = categoryTree(ctx.categories).map((r) => r.cat.key);
    const out = [...keep];
    for (const k of order) {
      if (!want.has(k) || out.some((l) => l.href === megaCategoryHref(k))) continue;
      // ชื่อว่าง = ใช้ชื่อหมวดปัจจุบันเสมอ (เปลี่ยนชื่อหมวดแล้วเมนูเปลี่ยนตาม · 2 ภาษา)
      const link = newMegaLink("", megaCategoryHref(k));
      const prev = order.slice(0, order.indexOf(k)).reverse().find((p) => out.some((l) => l.href === megaCategoryHref(p)));
      const at = prev ? out.findIndex((l) => l.href === megaCategoryHref(prev)) + 1 : out.length;
      out.splice(at, 0, link);
    }
    onChange(out.slice(0, max));
    setCatPick(null);
  };
  const catPickTotal = catPick ? links.filter((l) => !catByHref.has(l.href)).length + catPick.length : 0;

  // 🔗 ลิงก์หมวด: ชื่อว่าง = ตามชื่อหมวด · ชื่อที่ตรงกับชื่อหมวด (ไทยหรืออังกฤษ) = คัดลอกมาจากหมวด → เปลี่ยนเป็น "ตามหมวด" ได้ทีเดียว
  const catOf = (href: string) => {
    const k = megaCategoryKeyOf(href);
    return k ? ctx.categories.find((c) => c.key === k) ?? { key: k, label: k, label_en: "" } : null;
  };
  const same = (a: string, b?: string) => !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const copiedNames = links.filter((l) => {
    const c = catOf(l.href);
    return !!c && !!l.label.trim() && (same(l.label, c.label) || same(l.label, c.label_en));
  });
  const followCategory = (ids: Set<string>) =>
    onChange(
      links.map((l) => {
        if (!ids.has(l.id)) return l;
        const x: Record<string, unknown> = { ...(l as unknown as Record<string, unknown>), label: "", label_en: "" };
        const meta = { ...((x._i18n as Record<string, unknown> | undefined) ?? {}) };
        delete meta.label;
        return { ...x, _i18n: meta } as unknown as MegaLink;
      })
    );
  return (
    <div className="space-y-1">
      {links.map((l, i) => {
        const more = moreId === l.id;
        const extras = (l.hoverImageKey ? 1 : 0) + (l.bold ? 1 : 0) + (l.textColor ? 1 : 0) + (l.showFrom || l.showUntil ? 1 : 0) + (l.effect ? 1 : 0) + (l.font ? 1 : 0) + (l.arrow ? 1 : 0) + (l.underline ? 1 : 0);
        const kind = l.kind ?? "link";
        const colPick = cols > 1 && (
          <select
            className={`${mini} w-[5.5rem] shrink-0 ${l.col ? "border-blue-300 text-blue-700" : "text-slate-500"}`}
            value={l.col > cols ? cols : l.col}
            onChange={(e) => set(l.id, { col: Number(e.target.value) })}
            title={tx("แถวนี้อยู่คอลัมน์ไหน (ตอนแบ่งคอลัมน์ย่อย)", "Which column this row is in (when split into sub-columns)")}
          >
            <option value={0}>{tx("คอลัมน์: อัตโนมัติ", "Column: auto")}</option>
            {Array.from({ length: cols }, (_, c) => (
              <option key={c} value={c + 1}>
                {tx("คอลัมน์", "Column")} {c + 1}
              </option>
            ))}
          </select>
        );
        const delBtn = (
          <button type="button" onClick={() => onChange(links.filter((x) => x.id !== l.id))} className="text-slate-300 hover:text-rose-600 px-1" title={tx("ลบ", "Delete")}>
            ✕
          </button>
        );
        // ➖ ตัวคั่น (เส้น / เว้นบรรทัด): แถวเตี้ย ไม่มีชื่อ/ลิงก์ — ลากย้าย + เลือกคอลัมน์ได้เหมือนลิงก์
        if (megaIsSep(l))
          return (
            <div key={l.id} {...drag.rowProps(i)} data-mega-sep={kind} className={`rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-1.5 py-1 ${drag.rowCls(i)}`}>
              <div className="flex items-center gap-1">
                <DragHandle {...drag.handleProps(i)} />
                <span className="shrink-0 text-[11px] text-slate-600">{kind === "divider" ? tx("➖ เส้นคั่น", "➖ Divider") : tx("↕ เว้นบรรทัด", "↕ Blank line")}</span>
                <span className="flex-1 min-w-0 px-2" aria-hidden>
                  {kind === "divider" ? <span className="block border-t border-slate-400" /> : <span className="block h-2" />}
                </span>
                {colPick}
                {delBtn}
              </div>
            </div>
          );
        // 🔤 หัวข้อ: ตัวหนังสือหัวกลุ่ม · ใส่ลิงก์ได้ (ว่าง = กดไม่ได้) · ⋯ = ตัวหนา/สี/ชื่ออังกฤษ/ตั้งเวลา
        const heading = kind === "heading";
        return (
          <div key={l.id} {...drag.rowProps(i)} className={`rounded-md border ${more ? "border-blue-300" : "border-slate-200"} bg-white p-1.5 ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1">
              <DragHandle {...drag.handleProps(i)} />
              {heading && (
                <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700" title={l.href.trim() ? tx("หัวข้อ — ลูกค้ากดแล้วไปลิงก์ที่ตั้งไว้", "Heading — customers tap to go to the set link") : tx("หัวข้อ — ตัวหนังสือหัวกลุ่ม ยังไม่ใส่ลิงก์ = ลูกค้ากดไม่ได้", "Heading — group heading text, no link = not tappable")}>
                  {tx("🔤 หัวข้อ", "🔤 Heading")}
                </span>
              )}
              {(() => {
                const c = heading ? null : catOf(l.href);
                const auto = !!c && !l.label.trim();
                return (
                  <>
                    <LangInput
                      className={`${mini} flex-1 min-w-0 ${l.bold ? "font-semibold" : ""} ${l.underline ? "underline underline-offset-2" : ""} ${auto ? "placeholder:text-slate-700" : ""}`}
                      style={l.textColor || l.font ? { color: l.textColor || undefined, fontFamily: l.font ? fontFamilyCss(l.font) : undefined } : undefined}
                      obj={l}
                      k="label"
                      maxLength={60}
                      placeholder={c ? `${c.label}` : heading ? tx("ข้อความหัวข้อ", "Heading text") : tx("ชื่อลิงก์", "Link name")}
                      // ชื่อตามหมวด (ไม่ได้ตั้งเอง) → โหมด EN เห็นชื่อหมวดภาษาอังกฤษเป็นตัวจาง
                      enPlaceholder={c ? String((c as { label_en?: string }).label_en || c.label) : undefined}
                      title={auto ? tx("ชื่อตามหมวด — เปลี่ยนชื่อหมวดแล้วเมนูเปลี่ยนตาม · พิมพ์ทับ = ตั้งชื่อเอง", "Name follows category — rename the category and the menu follows · type over = custom name") : undefined}
                      onPatch={(p) => set(l.id, p)}
                    />
                    {auto ? (
                      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700" title={tx("ชื่อตามหมวด (ไทย/อังกฤษ) — เปลี่ยนชื่อหมวดในแท็บ 📂 หมวดหมู่ แล้วเมนูเปลี่ยนตามเอง", "Name follows category (Thai/English) — rename the category in the 📂 Categories tab and the menu follows")}>
                        {tx("🔗 ตามหมวด", "🔗 From category")}
                      </span>
                    ) : (
                      c && (
                        <button type="button" onClick={() => followCategory(new Set([l.id]))} className="shrink-0 rounded px-1 text-[11px] text-slate-400 hover:text-emerald-700" title={tx(`กลับไปใช้ชื่อหมวด (${c.label})`, `Use category name again (${c.label})`)}>
                          ↺
                        </button>
                      )
                    )}
                  </>
                );
              })()}
              {(!heading || !!l.href.trim()) && <IssueBadge href={l.href} />}
              {/* ลิงก์ที่ไม่ใส่ปลายทาง (เคยใช้ทำหัวข้อ เช่น NEW ARRIVAL ตัวหนา) → เปลี่ยนเป็นหัวข้อจริงได้คลิกเดียว */}
              {!heading && !l.href.trim() && !!l.label.trim() && (
                <button type="button" onClick={() => set(l.id, { kind: "heading", href: "" })} className="shrink-0 rounded border border-violet-200 px-1.5 h-7 text-[10px] text-violet-700 hover:bg-violet-50" title={tx("ลิงก์นี้ยังไม่มีปลายทาง — เปลี่ยนเป็นหัวข้อ (ตัวหนังสือ ลูกค้ากดไม่ได้)", "This link has no destination — turn it into a heading (text, not tappable)")} data-to-heading>
                  {tx("→ 🔤 หัวข้อ", "→ 🔤 Heading")}
                </button>
              )}
              {/* แบ่งคอลัมน์ย่อย: เลือกว่าลิงก์นี้อยู่คอลัมน์ไหน · อัตโนมัติ = ลงคอลัมน์ที่สั้นกว่า (megaSplitColumns) */}
              {colPick}
              {/* 🔗 ลิงก์ (หัวข้อ: ไม่ใส่ = กดไม่ได้) — ตัวเลือกลิงก์กลางตัวเดียวกับลิงก์อื่น */}
              <div className="w-36 shrink-0" title={heading ? tx("ลิงก์ของหัวข้อ — ไม่ใส่ = ตัวหนังสือกดไม่ได้", "Heading link — none = text not tappable") : undefined}>
                <LinkField value={l.href} onChange={(href) => set(l.id, { href })} ctx={ctx.link} />
              </div>
              {!plainOnly && (
                <button
                  type="button"
                  onClick={() => setMoreId(more ? null : l.id)}
                  className={`h-7 px-1.5 rounded-md border text-[11px] ${more ? "border-blue-500 text-blue-700 bg-blue-50" : extras ? "border-blue-200 text-blue-700" : "border-slate-200 text-slate-500"}`}
                  title={tx("รูปตอนชี้ · ตัวหนา/สี · ✨ เอฟเฟกต์/ฟอนต์/ลูกศร/เส้นใต้ · ตั้งเวลาแสดง", "Hover image · bold/color · ✨ effect/font/arrow/underline · show schedule")}
                >
                  ⋯{extras ? ` ${extras}` : ""}
                </button>
              )}
              {delBtn}
            </div>
            {st !== "plain" && !heading && (
              <div className="mt-1 pl-6 flex flex-wrap items-start gap-1.5">
                {st === "icon" && <IconPicker link={l} onChange={(p) => set(l.id, p)} />}
                {st === "dot" && (
                  <span className="w-32">
                    <ColorInput value={l.color} onChange={(v) => set(l.id, { color: v })} />
                  </span>
                )}
                {st === "thumb" && (
                  <span className="w-40">
                    <ImageUploadField label={tx("รูปเล็ก", "Small image")} value={l.imageKey} onChange={(k) => set(l.id, { imageKey: k })} height={36} />
                  </span>
                )}
                <LangInput className={`${mini} flex-1 min-w-[8rem]`} obj={l} k="desc" maxLength={120} placeholder={tx("คำอธิบายสั้น (ไม่ใส่ก็ได้)", "Short description (optional)")} onPatch={(p) => set(l.id, p)} />
                <LangInput className={`${mini} w-20`} obj={l} k="badge" maxLength={20} placeholder={tx("ป้าย", "Badge")} title={tx("ป้ายเล็ก เช่น ใหม่ / ลด", "Small badge, e.g. New / Sale")} onPatch={(p) => set(l.id, p)} />
              </div>
            )}
            {more && (
              <div className="mt-1.5 pl-6 pt-1.5 border-t border-slate-100 space-y-1.5">
                <div className="flex flex-wrap items-start gap-3">
                  {!heading && (
                    <span className="w-44">
                      <ImageUploadField label={tx("🖼 รูปตอนชี้ (เปลี่ยนรูปเด่นในแผง)", "🖼 Hover image (changes the featured image in the panel)")} value={l.hoverImageKey} onChange={(k) => set(l.id, { hoverImageKey: k })} height={44} />
                    </span>
                  )}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={l.bold} onChange={(e) => set(l.id, { bold: e.target.checked })} />
                      {tx("ตัวหนา", "Bold")}
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      {tx("สีตัวอักษร", "Text color")}
                      <span className="w-28">
                        <ColorInput value={l.textColor} onChange={(v) => set(l.id, { textColor: v })} />
                      </span>
                      {l.textColor && (
                        <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => set(l.id, { textColor: "" })} title={tx("กลับเป็นสีปกติ", "Back to normal color")}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {/* ✨ หน้าตาตัวอักษร: เอฟเฟกต์ · ฟอนต์ · ลูกศรท้ายชื่อ · เส้นใต้ (ค่าเริ่ม = เหมือนเดิม) */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600" data-mega-link-look>
                  <label className="flex items-center gap-1">
                    {tx("✨ เอฟเฟกต์", "✨ Effect")}
                    <select className={`${mini} w-[7.5rem] ${l.effect ? "border-blue-300 text-blue-700" : ""}`} value={l.effect ?? ""} onChange={(e) => set(l.id, { effect: e.target.value as MegaLinkEffect })}>
                      {MEGA_LINK_EFFECTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {labelEn(o.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="flex items-center gap-1">
                    {tx("🔤 ฟอนต์", "🔤 Font")}
                    <span className="w-44">
                      <FontSelect size="sm" value={l.font || "auto"} options={linkFontOptions()} googleFonts={LINK_FONT_NAMES} onChange={(v) => set(l.id, { font: v === "auto" ? "" : v })} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {tx("ลูกศร", "Arrow")}
                    {(["", "right", "up-right", "chevron"] as const).map((a) => (
                      <button
                        key={a || "none"}
                        type="button"
                        onClick={() => set(l.id, { arrow: a })}
                        className={`h-7 min-w-[1.9rem] rounded-md border px-1.5 ${(l.arrow ?? "") === a ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                        title={a ? tx(`ลูกศร ${MEGA_ARROW_CHAR[a]} ท้ายชื่อ (ชี้แล้วขยับ)`, `Arrow ${MEGA_ARROW_CHAR[a]} after name (moves on hover)`) : tx("ไม่มีลูกศร", "No arrow")}
                      >
                        {a ? MEGA_ARROW_CHAR[a] : tx("ไม่มี", "None")}
                      </button>
                    ))}
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={!!l.underline} onChange={(e) => set(l.id, { underline: e.target.checked })} />
                    {tx("เส้นใต้", "Underline")}
                  </label>
                </div>
                {/* 🌐 ชื่อภาษาอังกฤษของลิงก์ (หน้า /en) — ว่าง = ลิงก์หมวดใช้ชื่ออังกฤษของหมวด · ลิงก์อื่นใช้ชื่อไทย */}
                {(() => {
                  const x = l as MegaLink & { label_en?: string };
                  const c = catOf(l.href);
                  return (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="shrink-0">{tx("🇬🇧 ชื่ออังกฤษ", "🇬🇧 English name")}</span>
                      <input
                        className={`${mini} flex-1 min-w-0`}
                        value={x.label_en ?? ""}
                        maxLength={90}
                        placeholder={!l.label.trim() && c ? `${c.label_en || c.label} ${tx("(ตามหมวด)", "(from category)")}` : tx("ว่าง = ใช้ชื่อไทย", "Empty = use Thai name")}
                        onChange={(e) => onChange(links.map((y) => (y.id === l.id ? ({ ...y, ...translationPatch(y as unknown as Record<string, unknown>, "label", y.label, e.target.value, false) } as MegaLink) : y)))}
                      />
                    </label>
                  );
                })()}
                <ShowWindowFields from={l.showFrom} until={l.showUntil} onChange={(p) => set(l.id, p)} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pt-0.5">
        <button type="button" disabled={links.length >= max} onClick={() => onChange([...links, newMegaLink()])} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
          {tx("＋ เพิ่มลิงก์", "＋ Add link")}
        </button>
        {/* ➖ ตัวคั่น / 🔤 หัวข้อ — ต่อท้ายรายการ แล้วลากไปวางตรงที่ต้องการ */}
        {!plainOnly &&
          MEGA_LINK_KINDS.map((k) => (
            <button key={k.value} type="button" disabled={links.length >= max} onClick={() => onChange([...links, newMegaRow(k.value)])} className="text-[11px] text-slate-600 hover:text-blue-700 hover:underline disabled:opacity-40" title={`${labelEn(k.hint)} — ${tx("เพิ่มท้ายรายการ แล้วลากไปวางตรงที่ต้องการ", "added at the end of the list, then drag it where you want")}`} data-add-row={k.value}>
              ＋ {labelEn(k.label)}
            </button>
          ))}
        {copiedNames.length > 0 && (
          <button type="button" onClick={() => followCategory(new Set(copiedNames.map((l) => l.id)))} className="text-[11px] text-emerald-700 hover:underline" title={tx("ลิงก์หมวดที่ชื่อเหมือนชื่อหมวด (คัดลอกมา) → ให้ใช้ชื่อหมวดปัจจุบัน เปลี่ยนชื่อหมวดแล้วเมนูเปลี่ยนตาม · ชื่อที่ตั้งเองอย่างอื่นไม่แตะ", "Category links named the same as the category (copied) → use the live category name, so renaming the category updates the menu · other custom names untouched")}>
            {tx("🔗 ให้ใช้ชื่อหมวด", "🔗 Use category names")} ({copiedNames.length})
          </button>
        )}
        {ctx.categories.length > 0 && (
          <button type="button" onClick={() => (catPick ? setCatPick(null) : openCatPick())} className={`text-[11px] hover:underline ${catPick ? "text-slate-500" : "text-blue-600"}`} title={tx("ติ๊กเลือกหมวดของร้าน (หลายหมวด · มีหมวดย่อย) ที่จะเป็นลิงก์ในรายการนี้", "Tick shop categories (several · with subcategories) to become links in this list")}>
            {catPick ? tx("ปิดตัวเลือกหมวด", "Close category picker") : tx("☑ เลือกหมวดของร้าน (ติ๊กได้หลายหมวด)", "☑ Pick shop categories (tick several)")}
          </button>
        )}
      </div>
      {/* ☑ แผงติ๊กหมวด (ของกลาง CategoryCheckList) */}
      {catPick && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2 space-y-2">
          <p className="text-[11px] text-slate-600">{tx("ติ๊กหมวดที่จะเป็นลิงก์ในรายการนี้ — หมวดย่อยอยู่เยื้องใต้หมวดแม่ · เอาติ๊กออก = ลบลิงก์หมวดนั้น (ลิงก์ที่ใส่เองไม่หาย)", "Tick categories to become links in this list — subcategories are indented under their parent · untick = remove that category link (manual links stay)")}</p>
          <CategoryCheckList categories={ctx.categories} value={catPick} onChange={setCatPick} />
          <div className="flex items-center gap-2">
            {catPickTotal > max && <span className="text-[11px] text-amber-700">{tx(`⚠ เกิน ${max} ลิงก์ — ส่วนเกินจะไม่ถูกเพิ่ม`, `⚠ Over ${max} links — the extra won't be added`)}</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setCatPick(null)} className="h-7 px-2.5 rounded-md text-[11px] text-slate-600 hover:bg-slate-100">
              {tx("ยกเลิก", "Cancel")}
            </button>
            <button type="button" onClick={applyCatPick} className="h-7 px-3 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">
              {tx(`ใช้ ${catPick.length} หมวด`, `Use ${catPick.length} categories`)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── การ์ดรูป (ใช้ทั้งกล่องการ์ดรูป และในแท็บ) ───────── */
function CardsEditor({ cards, onChange, ctx }: { cards: MegaCard[]; onChange: (cards: MegaCard[]) => void; ctx: MegaEditorCtx }) {
  const drag = useDragReorder((from, to) => onChange(moveItem(cards, from, to)));
  const set = (id: string, p: Partial<MegaCard>) => onChange(cards.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const tx = useT();
  return (
    <div className="space-y-1">
      {cards.map((c, i) => (
        <div key={c.id} {...drag.rowProps(i)} className={`rounded-md border border-slate-200 bg-white p-1.5 flex gap-2 ${drag.rowCls(i)}`}>
          <DragHandle {...drag.handleProps(i)} />
          <div className="w-28 shrink-0">
            <ImageUploadField label={tx("รูป", "Image")} value={c.imageKey} onChange={(k) => set(c.id, { imageKey: k })} height={44} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <LangInput className={`${mini} w-full`} obj={c} k="title" maxLength={60} placeholder={tx("ชื่อ เช่น Alpha Bravo", "Name, e.g. Alpha Bravo")} onPatch={(p) => set(c.id, p)} />
            <LangInput className={`${mini} w-full`} obj={c} k="desc" maxLength={160} placeholder={tx("คำอธิบายสั้น", "Short description")} onPatch={(p) => set(c.id, p)} />
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <LinkField value={c.href} onChange={(href) => set(c.id, { href })} ctx={ctx.link} />
              </div>
              <IssueBadge href={c.href} />
            </div>
          </div>
          <button type="button" onClick={() => onChange(cards.filter((x) => x.id !== c.id))} className="self-start text-slate-300 hover:text-rose-600 px-1" title={tx("ลบ", "Delete")}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" disabled={cards.length >= MEGA_LIMITS.cards} onClick={() => onChange([...cards, newMegaCard()])} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
        {tx("＋ เพิ่มการ์ด", "＋ Add card")}
      </button>
    </div>
  );
}

const check = "flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer";

/* ───────── กล่อง 1 คอลัมน์ ───────── */
function BlockBody({ b, set, ctx }: { b: MegaBlock; set: (p: Partial<MegaBlock>) => void; ctx: MegaEditorCtx }) {
  const tx = useT();
  // หัวคอลัมน์กดได้ + "ดูทั้งหมด" ท้ายคอลัมน์ (ทุกชนิด)
  const head = (
    <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-2 border-b border-dashed border-slate-200">
      <span className="text-[11px] text-slate-500 shrink-0">{tx("ลิงก์หัวคอลัมน์", "Column title link")}</span>
      <div className="w-40">
        <LinkField value={b.titleHref} onChange={(titleHref) => set({ titleHref })} ctx={ctx.link} />
      </div>
      <IssueBadge href={b.titleHref} />
      <LangInput className={`${mini} flex-1 min-w-[9rem]`} obj={b} k="moreLabel" maxLength={40} placeholder={tx('ท้ายคอลัมน์ เช่น "ดูทั้งหมด →" (ไปลิงก์หัวคอลัมน์)', 'Column footer, e.g. "See all →" (goes to the column title link)')} onPatch={set} />
    </div>
  );
  switch (b.kind) {
    case "links": {
      const auto = MEGA_AUTOS.find((a) => a.value === b.auto);
      const autoCount = b.auto ? megaBlockLinks({ links: [], auto: b.auto, autoMax: b.autoMax }, ctx.autoData).length : 0;
      return (
        <div className="space-y-2">
          {head}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className={lbl}>{tx("รูปแบบรายการ", "List style")}</span>
              <Seg value={b.style} onChange={(v) => set({ style: v })} options={MEGA_LINK_STYLES.map((o) => ({ v: o.value, l: labelEn(o.label) }))} />
            </div>
            <label className="block">
              <span className={lbl}>{tx("แบ่งคอลัมน์ย่อย", "Sub-columns")}</span>
              <WheelSelect value={b.cols} onChange={(e) => set({ cols: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n === 1 ? tx("ไม่แบ่ง", "None") : tx(`${n} คอลัมน์`, `${n} columns`)}</option>
                ))}
              </WheelSelect>
            </label>
            <label className={`${check} pb-1.5`} title={tx("ลิงก์ไปหมวด/คอลเลกชัน ต่อท้ายด้วยจำนวนสินค้า เช่น กระเป๋าเป้ (7)", "Category/collection links followed by product count, e.g. Backpacks (7)")}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showCount} onChange={(e) => set({ showCount: e.target.checked })} />
              {tx("โชว์จำนวนสินค้า", "Show product count")}
            </label>
          </div>
          <div>
            <span className={lbl}>{tx("รายการ", "Items")}</span>
            <Seg value={b.auto} onChange={(v) => set({ auto: v })} options={MEGA_AUTOS.map((a) => ({ v: a.value, l: a.value ? `⚡ ${labelEn(a.label)}` : labelEn(a.label) }))} />
            {auto?.value && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-blue-50/60 border border-blue-100 px-2 py-1.5">
                <span className="text-[11px] text-blue-800">⚡ {labelEn(auto.hint)}</span>
                <span className="flex-1" />
                <label className="flex items-center gap-1 text-[11px] text-slate-600">
                  {tx("สูงสุด", "Max")}
                  <WheelSelect value={b.autoMax} onChange={(e) => set({ autoMax: Number(e.target.value) })}>
                    {[4, 6, 8, 10, 12, 16, 20, 30].map((n) => (
                      <option key={n} value={n}>{tx(`${n} รายการ`, `${n} items`)}</option>
                    ))}
                  </WheelSelect>
                </label>
                <span className="text-[11px] text-slate-500">{tx(`ตอนนี้ได้ ${autoCount} รายการ`, `Currently ${autoCount} items`)}</span>
              </div>
            )}
          </div>
          {b.auto && <p className="text-[11px] text-slate-500">{tx("ลิงก์ที่ใส่เองด้านล่าง (ถ้ามี) จะขึ้นก่อนรายการอัตโนมัติ เช่น “ดูทั้งหมด” “มาใหม่”", "Manual links below (if any) show before the auto list, e.g. “See all” “New”")}</p>}
          {b.cols > 1 && (
            <p className="text-[11px] text-slate-500">
              {tx(
                `แบ่ง ${b.cols} คอลัมน์: เลือกช่อง “คอลัมน์” ของแต่ละลิงก์ว่าให้อยู่คอลัมน์ไหน · อัตโนมัติ = ลงคอลัมน์ที่สั้นกว่า${b.auto ? " (รายการ ⚡ อัตโนมัติก็เช่นกัน)" : ""} · ไม่เลือกเลยสักลิงก์ = เรียงต่อกันเองแบบเดิม`,
                `${b.cols} columns: use each link's “Column” field to choose its column · auto = goes to the shorter column${b.auto ? " (⚡ auto items too)" : ""} · none chosen = flows in order as before`,
              )}
            </p>
          )}
          <LinksEditor links={b.links} style={b.style} onChange={(links) => set({ links })} ctx={ctx} cols={b.cols} />
        </div>
      );
    }
    case "groups":
      return (
        <div>
          {head}
          <GroupsEditor b={b} set={set} ctx={ctx} />
        </div>
      );
    case "products": {
      const preview = pickMegaProducts(b, ctx.liveProducts);
      return (
        <div className="space-y-2">
          {head}
          <Seg value={b.source} onChange={(v) => set({ source: v })} options={[{ v: "auto", l: tx("อัตโนมัติจากหมวด", "Auto from category") }, { v: "pick", l: tx("เลือกเอง", "Pick manually") }]} />
          {b.source === "auto" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={lbl}>{tx("หมวด", "Category")}</span>
                <select className={mini} value={b.category} onChange={(e) => set({ category: e.target.value })}>
                  <option value="">{tx("ทุกหมวด", "All categories")}</option>
                  {ctx.categories.map((c) => (
                    <option key={c.key} value={c.key}>{categoryChoiceLabel(c)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>{tx("เรียงตาม", "Sort by")}</span>
                <select className={mini} value={b.sort} onChange={(e) => set({ sort: e.target.value as MegaBlock["sort"] })}>
                  {MEGA_SORTS.map((o) => (
                    <option key={o.value} value={o.value}>{labelEn(o.label)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>{tx("จำนวน", "Count")}</span>
                <WheelSelect value={b.count} onChange={(e) => set({ count: Number(e.target.value) })}>
                  {range(MEGA_LIMITS.count[0], MEGA_LIMITS.count[1]).map((n) => (
                    <option key={n} value={n}>{tx(`${n} ชิ้น`, `${n} items`)}</option>
                  ))}
                </WheelSelect>
              </label>
            </div>
          ) : (
            <div>
              {/* ตัวเลือกสินค้ากลาง (ลากเรียง · ✕ เอาออก) + 🖼 ต่อแถว = รูปบนการ์ด: รูป SKU (สี) / อัปโหลด / คลังรูป / ↺ รูปแรกของสินค้า */}
              <WebsiteProductPicker
                shopSlug={ctx.link.shopSlug}
                value={b.codes}
                max={MEGA_LIMITS.codes}
                imageLabel={tx("รูปบนการ์ด", "Card image")}
                defaultImageLabel={tx("รูปแรกของสินค้า", "First product image")}
                onChange={(codes) => {
                  // เอารุ่นออก = ล้างรูปที่ตั้งไว้ของรุ่นนั้นด้วย
                  const keep = new Set(codes.map((c) => c.toUpperCase()));
                  set({
                    codes,
                    images: Object.fromEntries(Object.entries(b.images ?? {}).filter(([c]) => keep.has(c.toUpperCase()))),
                    skuImages: (b.skuImages ?? []).filter((r) => keep.has(r.split(":")[0].toUpperCase())),
                  });
                }}
                rowImages={{
                  images: b.images ?? {},
                  skus: b.skuImages ?? [],
                  onSet: (code, pick) => {
                    const up = code.toUpperCase();
                    const restImgs = Object.fromEntries(Object.entries(b.images ?? {}).filter(([c]) => c.toUpperCase() !== up));
                    const restSkus = (b.skuImages ?? []).filter((r) => r.split(":")[0].toUpperCase() !== up);
                    set({ images: pick?.key ? { ...restImgs, [code]: pick.key } : restImgs, skuImages: pick?.sku ? [...restSkus, pick.sku] : restSkus });
                  },
                }}
              />
              <p className="mt-1 text-[10px] text-slate-400">{tx("🖼 ที่แถว = เลือกรูปที่โชว์บนการ์ด (รูปของสีไหน กดการ์ดแล้วเปิดหน้าสินค้าที่สีนั้น) · สินค้าที่ร้านนี้ไม่มี (เช่น มาจากแม่แบบร้านอื่น) จะไม่โชว์เอง", "🖼 on a row = pick the card image (whichever color's image, tapping the card opens the product in that color) · products this shop doesn't have (e.g. from another shop's template) are hidden automatically")}</p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={lbl}>{tx("การ์ดต่อแถว", "Cards per row")}</span>
              <WheelSelect value={b.perRow} onChange={(e) => set({ perRow: Number(e.target.value) })}>
                {range(MEGA_LIMITS.perRow[0], MEGA_LIMITS.perRow[1]).map((n) => (
                  <option key={n} value={n}>{tx(`${n} ใบ`, `${n} cards`)}</option>
                ))}
              </WheelSelect>
            </label>
            <label className="block">
              <span className={lbl}>{tx("สัดส่วนรูป", "Image ratio")}</span>
              <select className={mini} value={b.ratio} onChange={(e) => set({ ratio: e.target.value as MegaBlock["ratio"] })}>
                {MEGA_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>{labelEn(r.label)}</option>
                ))}
              </select>
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showPrice} onChange={(e) => set({ showPrice: e.target.checked })} />
              {tx("ราคา", "Price")}
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showBadge} onChange={(e) => set({ showBadge: e.target.checked })} />
              {tx("ป้าย", "Badge")}
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.hoverSwap} onChange={(e) => set({ hoverSwap: e.target.checked })} />
              {tx("ชี้แล้วสลับรูป", "Swap image on hover")}
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.onSale} onChange={(e) => set({ onSale: e.target.checked })} />
              {tx("เฉพาะที่ลดราคา", "On sale only")}
            </label>
          </div>
          <p className={`text-[11px] ${preview.length ? "text-slate-500" : "text-amber-700"}`}>
            {preview.length ? `${tx(`👁 จะโชว์ ${preview.length} ชิ้น:`, `👁 Will show ${preview.length} items:`)} ${preview.slice(0, 4).map((p) => p.name).join(" · ")}${preview.length > 4 ? " …" : ""}` : tx("⚠️ ตอนนี้ไม่มีสินค้าที่ตรงเงื่อนไข — กล่องนี้จะไม่โชว์บนเว็บ", "⚠️ No products match right now — this box won't show on the site")}
          </p>
        </div>
      );
    }
    case "feature":
      return (
        <div>
          {head}
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
            <ImageUploadField label={tx("รูปเด่น", "Featured image")} value={b.imageKey} onChange={(k) => set({ imageKey: k })} height={72} />
            <div className="space-y-1.5">
              <LangInput className={`${mini} w-full`} obj={b} k="caption" maxLength={120} placeholder={tx("ข้อความบนรูป เช่น “The Valérie” ดูคอลเลกชัน", "Text on image, e.g. “The Valérie” View collection")} onPatch={set} />
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <LinkField value={b.href} onChange={(href) => set({ href })} ctx={ctx.link} />
                </div>
                <IssueBadge href={b.href} />
              </div>
              <label className="block">
                <span className={lbl}>{tx("สัดส่วนรูป", "Image ratio")}</span>
                <select className={mini} value={b.ratio} onChange={(e) => set({ ratio: e.target.value as MegaBlock["ratio"] })}>
                  {MEGA_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>{labelEn(r.label)}</option>
                  ))}
                </select>
              </label>
              <label className={check} title={tx("ลิงก์ที่ตั้ง “รูปตอนชี้” ไว้ (หรือหมวด/คอลเลกชันอัตโนมัติที่มีรูป) — ชี้แล้วรูปนี้เปลี่ยนตาม", "Links with a “hover image” (or auto categories/collections with images) — hovering changes this image")}>
                <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.swapOnHover} onChange={(e) => set({ swapOnHover: e.target.checked })} />
                {tx("เปลี่ยนรูปตามลิงก์ที่ชี้ในแผง", "Change image with the hovered link")}
              </label>
            </div>
          </div>
        </div>
      );
    case "cards":
      return (
        <div>
          {head}
          <CardsEditor cards={b.cards} onChange={(cards) => set({ cards })} ctx={ctx} />
        </div>
      );
  }
}

function GroupsEditor({ b, set, ctx }: { b: MegaBlock; set: (p: Partial<MegaBlock>) => void; ctx: MegaEditorCtx }) {
  const drag = useDragReorder((from, to) => set({ groups: moveItem(b.groups, from, to) }));
  const setG = (id: string, p: Partial<MegaBlock["groups"][number]>) => set({ groups: b.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) });
  const tx = useT();
  return (
    <div className="space-y-1.5">
      {b.groups.map((g, i) => (
        <div key={g.id} {...drag.rowProps(i)} className={`rounded-md border border-slate-200 bg-slate-50/60 p-1.5 ${drag.rowCls(i)}`}>
          <div className="flex items-center gap-1">
            <DragHandle {...drag.handleProps(i)} />
            <LangInput className={`${mini} flex-1 min-w-0 font-medium`} obj={g} k="label" maxLength={60} placeholder={tx("หัวข้อ เช่น กระเป๋าผู้หญิง", "Heading, e.g. Women's bags")} onPatch={(p) => setG(g.id, p)} />
            <IssueBadge href={g.href} />
            <div className="w-36 shrink-0">
              <LinkField value={g.href} onChange={(href) => setG(g.id, { href })} ctx={ctx.link} />
            </div>
            <button type="button" onClick={() => set({ groups: b.groups.filter((x) => x.id !== g.id) })} className="text-slate-300 hover:text-rose-600 px-1" title={tx("ลบหัวข้อ", "Delete heading")}>
              ✕
            </button>
          </div>
          <div className="mt-1 pl-5 border-l-2 border-slate-200 ml-2">
            <LinksEditor links={g.links} style="plain" plainOnly onChange={(links) => setG(g.id, { links })} ctx={ctx} max={MEGA_LIMITS.groupLinks} />
          </div>
        </div>
      ))}
      <button type="button" disabled={b.groups.length >= MEGA_LIMITS.groups} onClick={() => set({ groups: [...b.groups, newMegaGroup()] })} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
        {tx("＋ เพิ่มหัวข้อ", "＋ Add heading")}
      </button>
    </div>
  );
}

/* ───────── 📋 คลิปบอร์ดคอลัมน์ (คัดลอกไปวางเมนูอื่น/ร้านอื่นได้ · เก็บในเครื่องนี้) ───────── */
const CLIP_KEY = "mega-block-clipboard";
function readClip(): MegaBlock | null {
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return null;
    const p = normalizeMegaPanel({ blocks: [JSON.parse(raw)] });
    return p?.blocks[0] ?? null;
  } catch {
    return null;
  }
}

/* ───────── แผงแบบคอลัมน์ ───────── */
function BlocksEditor({ panel, onChange, ctx }: { panel: MegaPanel; onChange: (p: MegaPanel) => void; ctx: MegaEditorCtx }) {
  const toast = useToast();
  const tx = useT();
  const blocks = panel.blocks;
  const setBlocks = (next: MegaBlock[]) => onChange({ ...panel, blocks: next });
  const drag = useDragReorder((from, to) => setBlocks(moveItem(blocks, from, to)));
  const [openId, setOpenId] = useState<string | null>(blocks[0]?.id ?? null);
  const [clip, setClip] = useState<MegaBlock | null>(null);
  useEffect(() => {
    setClip(readClip());
    const onStore = () => setClip(readClip());
    window.addEventListener("mega-clip", onStore);
    window.addEventListener("storage", onStore);
    return () => {
      window.removeEventListener("mega-clip", onStore);
      window.removeEventListener("storage", onStore);
    };
  }, []);
  const set = (id: string, p: Partial<MegaBlock>) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const full = blocks.length >= MEGA_LIMITS.blocks;
  const duplicate = (i: number) => {
    if (full) return;
    const c = cloneMegaBlock(blocks[i]);
    setBlocks([...blocks.slice(0, i + 1), c, ...blocks.slice(i + 1)]);
    setOpenId(c.id);
  };
  const copy = (b: MegaBlock) => {
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(b));
      window.dispatchEvent(new Event("mega-clip"));
      toast.success(tx("คัดลอกคอลัมน์แล้ว — ไปที่เมนูอื่นแล้วกด “📋 วางคอลัมน์”", "Column copied — go to another menu and tap “📋 Paste column”"));
    } catch {
      toast.error(tx("คัดลอกไม่ได้", "Can't copy"));
    }
  };
  const totalSpan = blocks.reduce((s, b) => s + b.span, 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-slate-400" title={tx("สัดส่วนความกว้างของแต่ละคอลัมน์ในแผง (ซ้าย → ขวา)", "Width ratio of each column in the panel (left → right)")}>
        {blocks.map((b) => (
          <span key={b.id} className="h-4 rounded bg-slate-200 text-slate-600 inline-flex items-center justify-center truncate px-1" style={{ flex: b.span }}>
            {KIND_ICON[b.kind]} {b.title || labelEn(MEGA_BLOCK_KINDS.find((k) => k.value === b.kind)?.label)}
          </span>
        ))}
        {!blocks.length && <span>{tx("ยังไม่มีคอลัมน์", "No columns yet")}</span>}
        {totalSpan > 0 && <span className="shrink-0 pl-1">{tx(`${totalSpan} ส่วน`, `${totalSpan} parts`)}</span>}
      </div>
      {blocks.map((b, i) => {
        const open = openId === b.id;
        const kind = MEGA_BLOCK_KINDS.find((k) => k.value === b.kind);
        return (
          <div key={b.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <DragHandle {...drag.handleProps(i)} />
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0" title={labelEn(kind?.hint)}>
                {KIND_ICON[b.kind]} {labelEn(kind?.label)}
                {b.kind === "links" && b.auto ? " ⚡" : ""}
              </span>
              <LangInput className={`${mini} flex-1 min-w-0`} obj={b} k="title" maxLength={60} placeholder={tx("หัวคอลัมน์ (ไม่ใส่ก็ได้)", "Column title (optional)")} onPatch={(p) => set(b.id, p)} />
              <WheelSelect value={b.span} onChange={(e) => set(b.id, { span: Number(e.target.value) })} title={tx("ความกว้างของคอลัมน์นี้ (ชี้แล้วหมุนลูกกลิ้งได้)", "Width of this column (hover and scroll the wheel)")}>
                {range(MEGA_LIMITS.span[0], MEGA_LIMITS.span[1]).map((n) => (
                  <option key={n} value={n}>{tx(`กว้าง ${n} ส่วน`, `Width ${n} parts`)}</option>
                ))}
              </WheelSelect>
              <button type="button" disabled={full} onClick={() => duplicate(i)} className="text-xs w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40" title={tx("ทำซ้ำคอลัมน์นี้", "Duplicate this column")}>
                ⧉
              </button>
              <button type="button" onClick={() => copy(b)} className="text-xs w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-700" title={tx("คัดลอกไปวางเมนูอื่น", "Copy to paste into another menu")}>
                📋
              </button>
              <button type="button" onClick={() => setOpenId(open ? null : b.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500"}`}>
                {open ? "▲" : "▼"}
              </button>
              <button type="button" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))} className="text-slate-300 hover:text-rose-600 px-1" title={tx("ลบคอลัมน์", "Delete column")}>
                ✕
              </button>
            </div>
            {open && (
              <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-100">
                <BlockBody b={b} set={(p) => set(b.id, p)} ctx={ctx} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-slate-500">{tx("＋ เพิ่มคอลัมน์:", "＋ Add column:")}</span>
        {MEGA_BLOCK_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            disabled={full}
            title={labelEn(k.hint)}
            onClick={() => {
              const nb = newMegaBlock(k.value);
              setBlocks([...blocks, nb]);
              setOpenId(nb.id);
            }}
            className="text-[11px] px-2 h-6 rounded-md border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
          >
            {KIND_ICON[k.value]} {labelEn(k.label)}
          </button>
        ))}
        {clip && (
          <button
            type="button"
            disabled={full}
            onClick={() => {
              const c = cloneMegaBlock(clip);
              setBlocks([...blocks, c]);
              setOpenId(c.id);
            }}
            className="text-[11px] px-2 h-6 rounded-md border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
            title={`${tx("วาง:", "Paste:")} ${clip.title || labelEn(MEGA_BLOCK_KINDS.find((k) => k.value === clip.kind)?.label)}`}
          >
            {tx("📋 วางคอลัมน์", "📋 Paste column")} ({clip.title || labelEn(MEGA_BLOCK_KINDS.find((k) => k.value === clip.kind)?.label)})
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── แผงแบบแท็บ ───────── */
function TabsEditor({ panel, onChange, ctx }: { panel: MegaPanel; onChange: (p: MegaPanel) => void; ctx: MegaEditorCtx }) {
  const tabs = panel.tabs;
  const setTabs = (next: MegaPanel["tabs"]) => onChange({ ...panel, tabs: next });
  const drag = useDragReorder((from, to) => setTabs(moveItem(tabs, from, to)));
  const [openId, setOpenId] = useState<string | null>(tabs[0]?.id ?? null);
  const set = (id: string, p: Partial<MegaPanel["tabs"][number]>) => setTabs(tabs.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const tx = useT();
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">{tx("การ์ดต่อแถว", "Cards per row")}</span>
        <WheelSelect value={panel.cardsPerRow} onChange={(e) => onChange({ ...panel, cardsPerRow: Number(e.target.value) })}>
          <option value={0}>{tx("อัตโนมัติ", "Auto")}</option>
          {range(MEGA_LIMITS.cardsPerRow[0], MEGA_LIMITS.cardsPerRow[1]).map((n) => (
            <option key={n} value={n}>{tx(`${n} ใบ`, `${n} cards`)}</option>
          ))}
        </WheelSelect>
        {panel.cardsPerRow === 0 && <span className="text-[10px] text-slate-400">{tx("เต็มแถวพอดีจำนวนการ์ดของแต่ละแท็บ (2 ใบ = เต็ม 2 · 3 ใบ = เต็ม 3 · สูงสุด 6)", "Fills the row to fit each tab's card count (2 cards = 2 wide · 3 cards = 3 wide · max 6)")}</span>}
      </label>
      {/* ➕ การ์ด "ดูทั้งหมด" ต่อท้ายทุกแท็บ — ไปที่ลิงก์ของแท็บนั้น (นับรวมในการ์ดต่อแถวอัตโนมัติ) */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 space-y-1.5">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={!!panel.viewAllCard} onChange={(e) => onChange({ ...panel, viewAllCard: e.target.checked })} />
          {tx('➕ การ์ด "ดูทั้งหมด" ท้ายทุกแท็บ', '➕ "See all" card at the end of every tab')}
          <span className="text-[10px] text-slate-400">{tx("กดแล้วไปที่ลิงก์ของแท็บนั้น", "Goes to that tab's link")}</span>
        </label>
        {panel.viewAllCard && (
          <div className="flex items-start gap-2">
            <LangInput className={`${mini} flex-1 min-w-0`} obj={panel} k="viewAllCardLabel" maxLength={40} placeholder={tx('ข้อความบนการ์ด (ไม่ใส่ = "ดูทั้งหมด")', 'Card text (empty = "See all")')} onPatch={(p) => onChange({ ...panel, ...p })} />
            <div className="w-44 shrink-0">
              <ImageUploadField label={tx("รูปพื้นการ์ด (ไม่ใส่ก็ได้)", "Card background image (optional)")} value={panel.viewAllCardImageKey ?? null} onChange={(k) => onChange({ ...panel, viewAllCardImageKey: k })} height={44} />
            </div>
          </div>
        )}
        {panel.viewAllCard && tabs.some((t) => !t.href) && <p className="text-[10px] text-amber-600">{tx("แท็บที่ยังไม่ใส่ลิงก์ = การ์ดดูทั้งหมดไปที่ลิงก์ของเมนูนี้แทน", "Tabs without a link = the see-all card goes to this menu's link instead")}</p>}
      </div>
      {tabs.map((t, i) => {
        const open = openId === t.id;
        return (
          <div key={t.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <DragHandle {...drag.handleProps(i)} />
              <LangInput className={`${mini} flex-1 min-w-0 font-medium`} obj={t} k="label" maxLength={40} placeholder={tx("ชื่อแท็บ เช่น EVERYDAY", "Tab name, e.g. EVERYDAY")} onPatch={(p) => set(t.id, p)} />
              <IssueBadge href={t.href} />
              <div className="w-36 shrink-0">
                <LinkField value={t.href} onChange={(href) => set(t.id, { href })} ctx={ctx.link} />
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">
                {t.cards.length} {tx("การ์ด", "cards")}{panel.viewAllCard ? tx(" + ดูทั้งหมด", " + see all") : ""}
              </span>
              <button type="button" onClick={() => setOpenId(open ? null : t.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500"}`}>
                {open ? "▲" : "▼"}
              </button>
              <button type="button" onClick={() => setTabs(tabs.filter((x) => x.id !== t.id))} className="text-slate-300 hover:text-rose-600 px-1" title={tx("ลบแท็บ", "Delete tab")}>
                ✕
              </button>
            </div>
            {open && (
              <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-100">
                <CardsEditor cards={t.cards} onChange={(cards) => set(t.id, { cards })} ctx={ctx} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={tabs.length >= MEGA_LIMITS.tabs}
          onClick={() => {
            const nt = newMegaTab();
            setTabs([...tabs, nt]);
            setOpenId(nt.id);
          }}
          className="text-[11px] text-blue-600 hover:underline disabled:opacity-40"
        >
          {tx("＋ เพิ่มแท็บ", "＋ Add tab")}
        </button>
        {ctx.categories.length > 0 && (
          <button
            type="button"
            disabled={tabs.length >= MEGA_LIMITS.tabs}
            onClick={() => {
              const have = new Set(tabs.map((t) => t.href));
              const add = ctx.categories.filter((c) => !c.parent && !have.has(megaCategoryHref(c.key))).map((c) => ({ ...newMegaTab(c.label, megaCategoryHref(c.key)), cards: [newMegaCard(c.label, megaCategoryHref(c.key))] }));
              setTabs([...tabs, ...add].slice(0, MEGA_LIMITS.tabs));
            }}
            className="text-[11px] text-blue-600 hover:underline disabled:opacity-40"
          >
            {tx("＋ เติมแท็บจากหมวดของร้าน", "＋ Fill tabs from shop categories")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── ⚙️ หน้าตาแผง ───────── */
function PanelLook({ panel, onChange, ctx }: { panel: MegaPanel; onChange: (p: MegaPanel) => void; ctx: MegaEditorCtx }) {
  const [open, setOpen] = useState(false);
  const tx = useT();
  const changed = (panel.width !== "full" ? 1 : 0) + (panel.bg ? 1 : 0) + (panel.divider ? 1 : 0) + (panel.promo ? 1 : 0) + (panel.mobileHideMedia ? 1 : 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-600">
        <span>{tx("⚙️ หน้าตาแผง", "⚙️ Panel look")} {changed > 0 && <span className="ml-1 text-blue-600">· {tx("ปรับแล้ว", "changed")} {changed}</span>}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-100 pt-2">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className={lbl}>{tx("ขนาดแผง", "Panel size")}</span>
              <Seg value={panel.width} onChange={(v) => onChange({ ...panel, width: v })} options={[{ v: "full", l: tx("เต็มความกว้างจอ", "Full screen width") }, { v: "box", l: tx("กล่องลอยใต้เมนู", "Floating box under menu") }]} />
            </div>
            <div>
              <span className={lbl}>{tx("สีพื้นแผง", "Panel background")}</span>
              <div className="flex items-center gap-1">
                <span className="w-32">
                  <ColorInput value={panel.bg} onChange={(v) => onChange({ ...panel, bg: v })} />
                </span>
                {panel.bg && (
                  <button type="button" className="text-[11px] text-slate-400 hover:text-rose-600" onClick={() => onChange({ ...panel, bg: "" })} title={tx("กลับเป็นสีพื้นการ์ดของธีม", "Back to theme card background")}>
                    ✕
                  </button>
                )}
              </div>
            </div>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={panel.divider} onChange={(e) => onChange({ ...panel, divider: e.target.checked })} />
              {tx("เส้นคั่นระหว่างคอลัมน์", "Dividers between columns")}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 shrink-0">{tx("แถบข้อความใต้แผง", "Text bar under panel")}</span>
            <LangInput className={`${mini} flex-1 min-w-[10rem]`} obj={panel} k="promo" maxLength={120} placeholder={tx("เช่น ส่งฟรีเมื่อครบ ฿1,500 · ผ่อน 0% 10 เดือน", "e.g. Free shipping over ฿1,500 · 0% installments for 10 months")} onPatch={(p) => onChange({ ...panel, ...p })} />
            {panel.promo && (
              <div className="w-40">
                <LinkField value={panel.promoHref} onChange={(promoHref) => onChange({ ...panel, promoHref })} ctx={ctx.link} />
              </div>
            )}
          </div>
          <label className={check}>
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={panel.mobileHideMedia} onChange={(e) => onChange({ ...panel, mobileHideMedia: e.target.checked })} />
            {tx("📱 มือถือ: ซ่อนการ์ดสินค้า / รูปเด่น / การ์ดรูป (เหลือแต่ลิงก์ · เมนูโหลดเร็ว)", "📱 Phone: hide product cards / featured image / image cards (links only · menu loads faster)")}
          </label>
        </div>
      )}
    </div>
  );
}

/* ───────── แม่แบบที่บันทึก ───────── */
const panelSummary = (p: MegaPanel) => (p.layout === "tabs" ? `${p.tabs.length} แท็บ` : `${p.blocks.length} คอลัมน์`);
/** ข้อความสรุปที่โชว์บนจอ (2 ภาษา) — ชื่อแม่แบบที่บันทึกยังใช้ panelSummary ไทย */
const panelSummaryText = (p: MegaPanel) => (p.layout === "tabs" ? tr(`${p.tabs.length} แท็บ`, `${p.tabs.length} tabs`) : tr(`${p.blocks.length} คอลัมน์`, `${p.blocks.length} columns`));

function SaveTemplateDialog({ open, onClose, shopId, panel, rename, onSaved }: { open: boolean; onClose: () => void; shopId: string; panel?: MegaPanel | null; rename?: MenuTemplate | null; onSaved?: () => void }) {
  const toast = useToast();
  const tx = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(rename ? rename.name : panel ? `แผงเมนูแบบ ${panel.template} · ${panelSummary(panel)}` : "");
  }, [open, rename, panel]);
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(API, { method: rename ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rename ? { id: rename.id, name: n } : { shopId, name: n, panel }) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? tx("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      toast.success(rename ? tx("แก้ชื่อแม่แบบแล้ว", "Template renamed") : tx(`บันทึกแม่แบบ “${n}” แล้ว — ใช้ได้กับทุกเมนูและทุกร้าน`, `Template “${n}” saved — usable in every menu and shop`));
      onSaved?.();
      onClose();
    } catch {
      toast.error(tx("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={rename ? tx("แก้ชื่อแม่แบบเมนู", "Rename menu template") : tx("💾 บันทึกแผงเมนูเป็นแม่แบบ", "💾 Save menu panel as template")}
      description={rename ? undefined : tx("เก็บทั้งคอลัมน์ ลิงก์ ไอคอน รูป และแท็บ ไว้ใช้กับเมนูอื่นหรือร้านอื่น (ใช้แล้วได้สำเนา แก้แยกกันได้)", "Keeps columns, links, icons, images and tabs for other menus or shops (using it makes a copy you can edit separately)")}
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {tx("ยกเลิก", "Cancel")}
          </button>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="h-9 px-4 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? tx("กำลังบันทึก…", "Saving…") : rename ? tx("บันทึกชื่อ", "Save name") : tx("💾 บันทึกแม่แบบ", "💾 Save template")}
          </button>
        </div>
      }
    >
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{tx("ชื่อแม่แบบ", "Template name")}</label>
      <input
        autoFocus
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        placeholder={tx("เช่น เมนูกระเป๋า แบบไอคอน", "e.g. Bags menu, icon style")}
      />
    </ERPModal>
  );
}

function MenuTemplatesModal({ open, onClose, shopId, onUse }: { open: boolean; onClose: () => void; shopId: string; onUse: (t: MenuTemplate) => void }) {
  const toast = useToast();
  const [list, setList] = useState<MenuTemplate[] | null>(null);
  const [renaming, setRenaming] = useState<MenuTemplate | null>(null);
  const [deleting, setDeleting] = useState<MenuTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const tx = useT();
  const load = useCallback(() => {
    apiFetch(API)
      .then((r) => r.json())
      .then((j) => setList(j.templates ?? []))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API}?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? tx("ลบไม่สำเร็จ", "Delete failed"));
      else {
        toast.success(tx("ลบแม่แบบแล้ว — เมนูที่เคยใช้ไปแล้วไม่กระทบ", "Template deleted — menus that already used it are unaffected"));
        setDeleting(null);
        load();
      }
    } catch {
      toast.error(tx("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
    }
  };
  const mine = (list ?? []).filter((t) => t.shopId === shopId);
  const other = (list ?? []).filter((t) => t.shopId !== shopId);
  const row = (t: MenuTemplate) => (
    <div key={t.id} className="group flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 hover:border-slate-400">
      <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center justify-center shrink-0">{t.template}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-800 truncate">{t.name}</span>
        <span className="block text-[11px] text-slate-400 truncate">
          {labelEn(MEGA_TEMPLATES.find((x) => x.value === t.template)?.label)} · {panelSummaryText(t.panel)}
          {t.shopId !== shopId && tx(` · จากร้าน ${t.shopName ?? "อื่น"}`, ` · from shop ${t.shopName ?? "other"}`)}
        </span>
      </span>
      <button type="button" onClick={() => setRenaming(t)} title={tx("แก้ชื่อ", "Rename")} className="w-7 h-7 text-xs text-slate-400 hover:text-slate-800">
        ✏️
      </button>
      <button type="button" onClick={() => setDeleting(t)} title={tx("ลบแม่แบบ", "Delete template")} className="w-7 h-7 text-xs text-slate-400 hover:text-red-600">
        🗑️
      </button>
      <button type="button" onClick={() => onUse(t)} className="h-8 px-3 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-50">
        {tx("ใช้แม่แบบนี้", "Use this template")}
      </button>
    </div>
  );
  return (
    <>
      <ERPModal open={open} onClose={onClose} title={tx("📂 แม่แบบแผงเมนูที่บันทึกไว้", "📂 Saved menu panel templates")} description={tx("ใช้แล้วได้สำเนา แก้ต่อได้ — แทนแผงเดิมของเมนูนี้", "Using one makes an editable copy — replaces this menu's current panel")} size="md" defaultExpanded={false}>
        {list === null ? (
          <p className="text-sm text-slate-400 py-6 text-center">{tx("กำลังโหลด…", "Loading…")}</p>
        ) : !list.length ? (
          <p className="text-sm text-slate-400 py-6 text-center">{tx("ยังไม่มีแม่แบบ — จัดแผงเมนูจนพอใจแล้วกด “💾 บันทึกเป็นแม่แบบ”", "No templates yet — set up a menu panel you like, then tap “💾 Save as template”")}</p>
        ) : (
          <div className="space-y-3">
            {mine.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">{tx("ร้านนี้", "This shop")}</p>
                {mine.map(row)}
              </div>
            )}
            {other.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">{tx("จากร้านอื่น", "From other shops")}</p>
                {other.map(row)}
              </div>
            )}
          </div>
        )}
      </ERPModal>
      <SaveTemplateDialog open={!!renaming} onClose={() => setRenaming(null)} shopId={shopId} rename={renaming} onSaved={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        onConfirm={() => void remove()}
        loading={busy}
        variant="danger"
        title={tx(`ลบแม่แบบ “${deleting?.name ?? ""}”?`, `Delete template “${deleting?.name ?? ""}”?`)}
        message={tx("เมนูที่เคยใช้แม่แบบนี้ไปแล้วจะไม่เปลี่ยน (เป็นสำเนาแยก) — ลบแล้วแม่แบบนี้จะหายจากทุกร้าน", "Menus that already used this template won't change (they're separate copies) — deleting removes it from every shop")}
        confirmText={tx("ลบแม่แบบ", "Delete template")}
      />
    </>
  );
}

/* ───────── ตัวหลัก: เลือกหน้าตา + แก้แผง ───────── */
export function MegaMenuEditor({ itemId, panel, onChange, ctx }: { itemId: string; panel: MegaPanel | null; onChange: (panel: MegaPanel | null) => void; ctx: MegaEditorCtx }) {
  const [confirm, setConfirm] = useState<{ next: MegaPanel | null; title: string } | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const toast = useToast();
  const tx = useT();

  // 👁 พรีวิว: เปิดแผงของเมนูนี้ค้างไว้ระหว่างแก้ (หน้าดีไซน์รับ event แล้วส่งต่อให้เว็บร้าน)
  const hasPanel = !!panel;
  useEffect(() => {
    if (!hasPanel) return;
    window.dispatchEvent(new CustomEvent("website-menu-pin", { detail: itemId }));
    return () => {
      window.dispatchEvent(new CustomEvent("website-menu-pin", { detail: null }));
    };
  }, [itemId, hasPanel]);

  // เปลี่ยนหน้าตา — แผงเดิมมีเนื้อหา = ถามก่อนแทน
  const change = (next: MegaPanel | null, title: string) => {
    if (megaHasContent(panel)) setConfirm({ next, title });
    else onChange(next);
  };
  const pickTemplate = (t: MegaTemplate) => change(megaPreset(t, { categories: ctx.categories }), tx(`เปลี่ยนเป็นแบบ ${t}?`, `Switch to style ${t}?`));
  // 🔎 ชุดตรวจลิงก์เสีย (หมวด/สินค้า/หน้า/คอลเลกชันที่มีอยู่จริง)
  const sets = useMemo<IssueSets>(
    () => ({
      categories: new Set(ctx.categories.map((c) => c.key)),
      products: new Set(ctx.products.map((p) => p.code.toLowerCase())),
      pages: new Set(ctx.pages.map((p) => p.slug)),
      collections: ctx.autoData ? new Set(ctx.autoData.collections.map((c) => c.slug)) : undefined,
    }),
    [ctx]
  );
  const issues = panel ? panelIssues(panel, sets) : 0;

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-[11px] text-slate-500 mb-1">{tx("หน้าตาเมนูย่อย", "Submenu look")}</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => panel && change(null, tx("กลับไปใช้เมนูย่อยธรรมดา?", "Go back to a plain submenu?"))}
            className={`text-[11px] px-2 h-7 rounded-md border ${!panel ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            title={tx("รายการเลื่อนลง / แผงรูปหมวด (แบบเดิม)", "Dropdown list / category image panel (classic)")}
          >
            {tx("เมนูย่อยธรรมดา", "Plain submenu")}
          </button>
          {MEGA_TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              title={labelEn(t.hint)}
              onClick={() => panel?.template !== t.value && pickTemplate(t.value)}
              className={`text-[11px] px-2 h-7 rounded-md border ${panel?.template === t.value ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              {tx("แบบ", "Style")} {t.value} · {labelEn(t.label)}
            </button>
          ))}
          <button type="button" onClick={() => setTplOpen(true)} className="text-[11px] px-2 h-7 rounded-md border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700">
            {tx("📂 แม่แบบที่บันทึก…", "📂 Saved templates…")}
          </button>
        </div>
      </div>

      {panel && (
        <IssueCtx.Provider value={sets}>
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-2 space-y-2">
          {issues > 0 && <p className="text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1">{tx(`⚠️ มีลิงก์ที่อาจเสีย ${issues} จุด (หมวด/หน้า/สินค้าที่ไม่มีแล้ว) — ดูป้าย ⚠️ ในรายการด้านล่าง`, `⚠️ ${issues} possibly broken links (categories/pages/products that no longer exist) — see the ⚠️ badges below`)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-blue-800">{tx("👁 พรีวิวด้านขวาเปิดแผงนี้ค้างไว้ (ดูที่จอคอม)", "👁 The preview on the right keeps this panel open (view on desktop)")}</span>
            <span className="flex-1" />
            <button type="button" disabled={!megaHasContent(panel)} onClick={() => setSaveOpen(true)} className="text-[11px] px-2 h-7 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-blue-400 disabled:opacity-40">
              {tx("💾 บันทึกเป็นแม่แบบ", "💾 Save as template")}
            </button>
          </div>
          {panel.layout === "tabs" ? <TabsEditor panel={panel} onChange={onChange} ctx={ctx} /> : <BlocksEditor panel={panel} onChange={onChange} ctx={ctx} />}
          <label className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">{tx("ลิงก์ท้ายแผง", "Panel footer link")}</span>
            <LangInput className={`${mini} flex-1`} obj={panel} k="viewAllLabel" maxLength={40} placeholder={tx('เช่น "ดูสินค้าทั้งหมด →" (ไม่ใส่ = ไม่โชว์ · ไปที่ลิงก์ของเมนูนี้)', 'e.g. "See all products →" (empty = hidden · goes to this menu\'s link)')} onPatch={(p) => onChange({ ...panel, ...p })} />
          </label>
          <PanelLook panel={panel} onChange={onChange} ctx={ctx} />
        </div>
        </IssueCtx.Provider>
      )}

      <MenuTemplatesModal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        shopId={ctx.shopId}
        onUse={(t) => {
          setTplOpen(false);
          change(JSON.parse(JSON.stringify(t.panel)) as MegaPanel, tx(`ใช้แม่แบบ “${t.name}”?`, `Use template “${t.name}”?`));
          if (!megaHasContent(panel)) toast.success(tx(`ใช้แม่แบบ “${t.name}” แล้ว — แก้ต่อได้ · กด ↶ เพื่อย้อนกลับ`, `Template “${t.name}” applied — keep editing · tap ↶ to undo`));
        }}
      />
      <SaveTemplateDialog open={saveOpen} onClose={() => setSaveOpen(false)} shopId={ctx.shopId} panel={panel} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) onChange(confirm.next);
          setConfirm(null);
        }}
        title={confirm?.title ?? ""}
        message={tx("แผงเมนูเดิม (คอลัมน์/ลิงก์/รูปที่จัดไว้) จะถูกแทน — ยังไม่ขึ้นเว็บจนกดเผยแพร่ และกด ↶ ย้อนได้", "The current menu panel (columns/links/images) will be replaced — not live until you publish, and ↶ can undo")}
        confirmText={tx("แทนเลย", "Replace")}
      />
    </div>
  );
}
