"use client";

/**
 * 🧭 ตัวจัดแผงเมนูใหญ่ (Mega menu) — ของกลาง ใช้ในแท็บ "เมนู" ของหน้าดีไซน์เว็บ (website-theme-panel MenuEditor)
 *
 * MegaModeChips   = เลือกหน้าตาเมนูย่อย: เมนูย่อยธรรมดา / แบบ A / แบบ B / แบบ C / แม่แบบที่บันทึก
 * MegaPanelEditor = แก้แผง: คอลัมน์ (รายการลิงก์ · กลุ่มหัวข้อย่อย · การ์ดสินค้า · รูปเด่น · การ์ดรูป) หรือแท็บ (การ์ดคอลเลกชัน)
 * MenuTemplatesModal / บันทึกแม่แบบ = /api/website/menu-templates (ใช้ข้ามร้านได้ · ใช้แล้วได้สำเนา)
 * MegaIcon = วาดไอคอนชุดกลาง MEGA_ICONS (เว็บร้านวาดแบบเดียวกัน)
 * ระหว่างแก้: ส่ง window event "website-menu-pin" → หน้าดีไซน์สั่งพรีวิวเปิดแผงของเมนูนี้ค้างไว้
 * ข้อมูล/ตัวกรอง: lib/website-mega-menu (มิเรอร์ storefront src/lib/mega-menu.ts)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { categoryChoiceLabel, categoryTree } from "@/lib/website-category-tree";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { WheelSelect } from "@/components/wheel-select";
import { Seg } from "@/components/website-block-editor";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ColorInput } from "@/components/color-picker";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { CategoryCheckList } from "@/components/category-check-list";
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
  MEGA_ICONS,
  MEGA_LIMITS,
  MEGA_LINK_STYLES,
  MEGA_RATIOS,
  MEGA_TEMPLATES,
  megaCategoryHref,
  megaHasContent,
  megaPreset,
  newMegaBlock,
  newMegaCard,
  newMegaGroup,
  newMegaLink,
  newMegaTab,
  type MegaBlock,
  type MegaBlockKind,
  type MegaCard,
  type MegaLink,
  type MegaLinkStyle,
  type MegaPanel,
  type MegaTemplate,
  type MenuTemplate,
} from "@/lib/website-mega-menu";

export interface MegaEditorCtx {
  link: SchemaFormContext;
  categories: { key: string; label: string; parent?: string | null }[];
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
const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
const lbl = "block text-[11px] text-slate-500 mb-1";
const KIND_ICON: Record<MegaBlockKind, string> = { links: "☰", groups: "⋮☰", products: "🛍", feature: "🖼", cards: "🗂" };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** ไอคอนชุดกลาง (เส้น) — iconKey (รูปอัปโหลด) มาก่อน */
export function MegaIcon({ name, iconKey, size = 20 }: { name: string; iconKey?: string | null; size?: number }) {
  if (iconKey) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={keyUrl(iconKey, 96) ?? undefined} alt="" style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  const ic = MEGA_ICONS.find((i) => i.key === name);
  if (!ic) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ic.d.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/* ───────── ช่องลิงก์แบบย่อ: โชว์ปลายทาง · กด = เปิดตัวเลือกลิงก์กลาง ───────── */
function LinkField({ value, onChange, ctx }: { value: string; onChange: (href: string) => void; ctx: SchemaFormContext }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${mini} w-full text-left truncate ${value ? "text-blue-700" : "text-slate-400"}`} title={value || "ยังไม่ได้ใส่ลิงก์"}>
        🔗 {value || "ใส่ลิงก์…"}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <LinkTargetPicker value={value} onChange={onChange} ctx={ctx} size="sm" />
          <button type="button" onClick={() => setOpen(false)} className="mt-1 text-[11px] text-blue-600 hover:underline">
            เสร็จ
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── เลือกไอคอน: ชุดในตัว หรืออัปโหลดเอง ───────── */
function IconPicker({ link, onChange }: { link: MegaLink; onChange: (p: Partial<MegaLink>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${mini} inline-flex items-center gap-1`} title="เลือกไอคอน">
        <span className="w-5 h-5 inline-flex items-center justify-center text-slate-700">{link.icon || link.iconKey ? <MegaIcon name={link.icon} iconKey={link.iconKey} size={16} /> : "—"}</span>
        ไอคอน ▾
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2 w-[260px]">
          <div className="grid grid-cols-8 gap-1">
            <button type="button" onClick={() => onChange({ icon: "", iconKey: null })} className={`h-7 rounded border text-[10px] ${!link.icon && !link.iconKey ? "border-blue-500 bg-blue-50" : "border-slate-200"}`} title="ไม่มีไอคอน">
              —
            </button>
            {MEGA_ICONS.map((ic) => (
              <button
                key={ic.key}
                type="button"
                title={ic.label}
                onClick={() => onChange({ icon: ic.key, iconKey: null })}
                className={`h-7 rounded border inline-flex items-center justify-center text-slate-700 ${link.icon === ic.key && !link.iconKey ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <MegaIcon name={ic.key} size={16} />
              </button>
            ))}
          </div>
          <div className="mt-2">
            <ImageUploadField label="หรืออัปโหลดไอคอนเอง (PNG/SVG พื้นใส)" value={link.iconKey} onChange={(k) => onChange({ iconKey: k })} height={36} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── 🔎 ตรวจลิงก์เสีย (ส่งผ่าน context ทั้งตัวจัด) ───────── */
type IssueSets = { categories: Set<string>; products: Set<string>; pages: Set<string>; collections?: Set<string> };
const IssueCtx = createContext<IssueSets | null>(null);
function IssueBadge({ href }: { href: string }) {
  const sets = useContext(IssueCtx);
  const msg = sets ? megaLinkIssue(href, sets) : null;
  if (!msg || msg === "ยังไม่ได้ใส่ลิงก์") return null;
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title="ลิงก์นี้อาจพา ลูกค้าไปหน้าที่ไม่มีแล้ว — แก้ลิงก์ใหม่">
      ⚠️ {msg}
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
  // ค่าเก่าที่ยังไม่มีช่องนี้ = ว่าง
  const dt = (v: string | undefined) => (!v ? "" : v.length === 10 ? `${v}T00:00` : v);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <span>⏰ แสดงช่วง</span>
      <input type="datetime-local" className={`${mini} w-[11.5rem]`} value={dt(from)} onChange={(e) => onChange({ showFrom: e.target.value })} aria-label="เริ่มแสดง" />
      <span>ถึง</span>
      <input type="datetime-local" className={`${mini} w-[11.5rem]`} value={dt(until)} onChange={(e) => onChange({ showUntil: e.target.value })} aria-label="หยุดแสดง" />
      {(from || until) && (
        <>
          <span className={`px-1.5 py-0.5 rounded ${live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{live ? "กำลังแสดง" : "ยังไม่แสดง/หมดเวลา"}</span>
          <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => onChange({ showFrom: "", showUntil: "" })} title="ล้าง = แสดงตลอด">
            ✕
          </button>
        </>
      )}
    </div>
  );
}

/* ───────── รายการลิงก์ ───────── */
function LinksEditor({ links, style, onChange, ctx, max = MEGA_LIMITS.links, plainOnly = false }: { links: MegaLink[]; style: MegaLinkStyle; onChange: (links: MegaLink[]) => void; ctx: MegaEditorCtx; max?: number; plainOnly?: boolean }) {
  const drag = useDragReorder((from, to) => onChange(moveItem(links, from, to)));
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
      const link = newMegaLink(ctx.categories.find((c) => c.key === k)?.label ?? k, megaCategoryHref(k));
      const prev = order.slice(0, order.indexOf(k)).reverse().find((p) => out.some((l) => l.href === megaCategoryHref(p)));
      const at = prev ? out.findIndex((l) => l.href === megaCategoryHref(prev)) + 1 : out.length;
      out.splice(at, 0, link);
    }
    onChange(out.slice(0, max));
    setCatPick(null);
  };
  const catPickTotal = catPick ? links.filter((l) => !catByHref.has(l.href)).length + catPick.length : 0;
  return (
    <div className="space-y-1">
      {links.map((l, i) => {
        const more = moreId === l.id;
        const extras = (l.hoverImageKey ? 1 : 0) + (l.bold ? 1 : 0) + (l.textColor ? 1 : 0) + (l.showFrom || l.showUntil ? 1 : 0);
        return (
          <div key={l.id} {...drag.rowProps(i)} className={`rounded-md border ${more ? "border-blue-300" : "border-slate-200"} bg-white p-1.5 ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1">
              <DragHandle {...drag.handleProps(i)} />
              <input
                className={`${mini} flex-1 min-w-0 ${l.bold ? "font-semibold" : ""}`}
                style={l.textColor ? { color: l.textColor } : undefined}
                value={l.label}
                maxLength={60}
                placeholder="ชื่อลิงก์"
                onChange={(e) => set(l.id, { label: e.target.value })}
              />
              <IssueBadge href={l.href} />
              <div className="w-36 shrink-0">
                <LinkField value={l.href} onChange={(href) => set(l.id, { href })} ctx={ctx.link} />
              </div>
              {!plainOnly && (
                <button
                  type="button"
                  onClick={() => setMoreId(more ? null : l.id)}
                  className={`h-7 px-1.5 rounded-md border text-[11px] ${more ? "border-blue-500 text-blue-700 bg-blue-50" : extras ? "border-blue-200 text-blue-700" : "border-slate-200 text-slate-500"}`}
                  title="รูปตอนชี้ · ตัวหนา/สี · ตั้งเวลาแสดง"
                >
                  ⋯{extras ? ` ${extras}` : ""}
                </button>
              )}
              <button type="button" onClick={() => onChange(links.filter((x) => x.id !== l.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">
                ✕
              </button>
            </div>
            {st !== "plain" && (
              <div className="mt-1 pl-6 flex flex-wrap items-start gap-1.5">
                {st === "icon" && <IconPicker link={l} onChange={(p) => set(l.id, p)} />}
                {st === "dot" && (
                  <span className="w-32">
                    <ColorInput value={l.color} onChange={(v) => set(l.id, { color: v })} />
                  </span>
                )}
                {st === "thumb" && (
                  <span className="w-40">
                    <ImageUploadField label="รูปเล็ก" value={l.imageKey} onChange={(k) => set(l.id, { imageKey: k })} height={36} />
                  </span>
                )}
                <input className={`${mini} flex-1 min-w-[8rem]`} value={l.desc} maxLength={120} placeholder="คำอธิบายสั้น (ไม่ใส่ก็ได้)" onChange={(e) => set(l.id, { desc: e.target.value })} />
                <input className={`${mini} w-20`} value={l.badge} maxLength={20} placeholder="ป้าย" title="ป้ายเล็ก เช่น ใหม่ / ลด" onChange={(e) => set(l.id, { badge: e.target.value })} />
              </div>
            )}
            {more && (
              <div className="mt-1.5 pl-6 pt-1.5 border-t border-slate-100 space-y-1.5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-44">
                    <ImageUploadField label="🖼 รูปตอนชี้ (เปลี่ยนรูปเด่นในแผง)" value={l.hoverImageKey} onChange={(k) => set(l.id, { hoverImageKey: k })} height={44} />
                  </span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={l.bold} onChange={(e) => set(l.id, { bold: e.target.checked })} />
                      ตัวหนา
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      สีตัวอักษร
                      <span className="w-28">
                        <ColorInput value={l.textColor} onChange={(v) => set(l.id, { textColor: v })} />
                      </span>
                      {l.textColor && (
                        <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => set(l.id, { textColor: "" })} title="กลับเป็นสีปกติ">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <ShowWindowFields from={l.showFrom} until={l.showUntil} onChange={(p) => set(l.id, p)} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pt-0.5">
        <button type="button" disabled={links.length >= max} onClick={() => onChange([...links, newMegaLink()])} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
          ＋ เพิ่มลิงก์
        </button>
        {ctx.categories.length > 0 && (
          <button type="button" onClick={() => (catPick ? setCatPick(null) : openCatPick())} className={`text-[11px] hover:underline ${catPick ? "text-slate-500" : "text-blue-600"}`} title="ติ๊กเลือกหมวดของร้าน (หลายหมวด · มีหมวดย่อย) ที่จะเป็นลิงก์ในรายการนี้">
            {catPick ? "ปิดตัวเลือกหมวด" : "☑ เลือกหมวดของร้าน (ติ๊กได้หลายหมวด)"}
          </button>
        )}
      </div>
      {/* ☑ แผงติ๊กหมวด (ของกลาง CategoryCheckList) */}
      {catPick && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2 space-y-2">
          <p className="text-[11px] text-slate-600">ติ๊กหมวดที่จะเป็นลิงก์ในรายการนี้ — หมวดย่อยอยู่เยื้องใต้หมวดแม่ · เอาติ๊กออก = ลบลิงก์หมวดนั้น (ลิงก์ที่ใส่เองไม่หาย)</p>
          <CategoryCheckList categories={ctx.categories} value={catPick} onChange={setCatPick} />
          <div className="flex items-center gap-2">
            {catPickTotal > max && <span className="text-[11px] text-amber-700">⚠ เกิน {max} ลิงก์ — ส่วนเกินจะไม่ถูกเพิ่ม</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setCatPick(null)} className="h-7 px-2.5 rounded-md text-[11px] text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button type="button" onClick={applyCatPick} className="h-7 px-3 rounded-md bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700">
              ใช้ {catPick.length} หมวด
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
  return (
    <div className="space-y-1">
      {cards.map((c, i) => (
        <div key={c.id} {...drag.rowProps(i)} className={`rounded-md border border-slate-200 bg-white p-1.5 flex gap-2 ${drag.rowCls(i)}`}>
          <DragHandle {...drag.handleProps(i)} />
          <div className="w-28 shrink-0">
            <ImageUploadField label="รูป" value={c.imageKey} onChange={(k) => set(c.id, { imageKey: k })} height={44} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <input className={`${mini} w-full`} value={c.title} maxLength={60} placeholder="ชื่อ เช่น Alpha Bravo" onChange={(e) => set(c.id, { title: e.target.value })} />
            <input className={`${mini} w-full`} value={c.desc} maxLength={160} placeholder="คำอธิบายสั้น" onChange={(e) => set(c.id, { desc: e.target.value })} />
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <LinkField value={c.href} onChange={(href) => set(c.id, { href })} ctx={ctx.link} />
              </div>
              <IssueBadge href={c.href} />
            </div>
          </div>
          <button type="button" onClick={() => onChange(cards.filter((x) => x.id !== c.id))} className="self-start text-slate-300 hover:text-rose-600 px-1" title="ลบ">
            ✕
          </button>
        </div>
      ))}
      <button type="button" disabled={cards.length >= MEGA_LIMITS.cards} onClick={() => onChange([...cards, newMegaCard()])} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
        ＋ เพิ่มการ์ด
      </button>
    </div>
  );
}

const check = "flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer";

/* ───────── กล่อง 1 คอลัมน์ ───────── */
function BlockBody({ b, set, ctx }: { b: MegaBlock; set: (p: Partial<MegaBlock>) => void; ctx: MegaEditorCtx }) {
  // หัวคอลัมน์กดได้ + "ดูทั้งหมด" ท้ายคอลัมน์ (ทุกชนิด)
  const head = (
    <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-2 border-b border-dashed border-slate-200">
      <span className="text-[11px] text-slate-500 shrink-0">ลิงก์หัวคอลัมน์</span>
      <div className="w-40">
        <LinkField value={b.titleHref} onChange={(titleHref) => set({ titleHref })} ctx={ctx.link} />
      </div>
      <IssueBadge href={b.titleHref} />
      <input className={`${mini} flex-1 min-w-[9rem]`} value={b.moreLabel} maxLength={40} placeholder='ท้ายคอลัมน์ เช่น "ดูทั้งหมด →" (ไปลิงก์หัวคอลัมน์)' onChange={(e) => set({ moreLabel: e.target.value })} />
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
              <span className={lbl}>รูปแบบรายการ</span>
              <Seg value={b.style} onChange={(v) => set({ style: v })} options={MEGA_LINK_STYLES.map((o) => ({ v: o.value, l: o.label }))} />
            </div>
            <label className="block">
              <span className={lbl}>แบ่งคอลัมน์ย่อย</span>
              <WheelSelect value={b.cols} onChange={(e) => set({ cols: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n === 1 ? "ไม่แบ่ง" : `${n} คอลัมน์`}</option>
                ))}
              </WheelSelect>
            </label>
            <label className={`${check} pb-1.5`} title="ลิงก์ไปหมวด/คอลเลกชัน ต่อท้ายด้วยจำนวนสินค้า เช่น กระเป๋าเป้ (7)">
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showCount} onChange={(e) => set({ showCount: e.target.checked })} />
              โชว์จำนวนสินค้า
            </label>
          </div>
          <div>
            <span className={lbl}>รายการ</span>
            <Seg value={b.auto} onChange={(v) => set({ auto: v })} options={MEGA_AUTOS.map((a) => ({ v: a.value, l: a.value ? `⚡ ${a.label}` : a.label }))} />
            {auto?.value && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-blue-50/60 border border-blue-100 px-2 py-1.5">
                <span className="text-[11px] text-blue-800">⚡ {auto.hint}</span>
                <span className="flex-1" />
                <label className="flex items-center gap-1 text-[11px] text-slate-600">
                  สูงสุด
                  <WheelSelect value={b.autoMax} onChange={(e) => set({ autoMax: Number(e.target.value) })}>
                    {[4, 6, 8, 10, 12, 16, 20, 30].map((n) => (
                      <option key={n} value={n}>{n} รายการ</option>
                    ))}
                  </WheelSelect>
                </label>
                <span className="text-[11px] text-slate-500">ตอนนี้ได้ {autoCount} รายการ</span>
              </div>
            )}
          </div>
          {b.auto && <p className="text-[11px] text-slate-500">ลิงก์ที่ใส่เองด้านล่าง (ถ้ามี) จะขึ้นก่อนรายการอัตโนมัติ เช่น “ดูทั้งหมด” “มาใหม่”</p>}
          <LinksEditor links={b.links} style={b.style} onChange={(links) => set({ links })} ctx={ctx} />
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
          <Seg value={b.source} onChange={(v) => set({ source: v })} options={[{ v: "auto", l: "อัตโนมัติจากหมวด" }, { v: "pick", l: "เลือกเอง" }]} />
          {b.source === "auto" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={lbl}>หมวด</span>
                <select className={mini} value={b.category} onChange={(e) => set({ category: e.target.value })}>
                  <option value="">ทุกหมวด</option>
                  {ctx.categories.map((c) => (
                    <option key={c.key} value={c.key}>{categoryChoiceLabel(c)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>เรียงตาม</span>
                <select className={mini} value={b.sort} onChange={(e) => set({ sort: e.target.value as MegaBlock["sort"] })}>
                  {MEGA_SORTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>จำนวน</span>
                <WheelSelect value={b.count} onChange={(e) => set({ count: Number(e.target.value) })}>
                  {range(MEGA_LIMITS.count[0], MEGA_LIMITS.count[1]).map((n) => (
                    <option key={n} value={n}>{n} ชิ้น</option>
                  ))}
                </WheelSelect>
              </label>
            </div>
          ) : (
            <div>
              <FieldChipsPicker
                value={b.codes}
                onChange={(codes) => set({ codes })}
                fields={ctx.products.map((p) => ({ key: p.code, label: `${p.code} · ${p.name}` }))}
                max={MEGA_LIMITS.codes}
                compact
                title="เลือกสินค้าในแผงเมนู"
                description="ติ๊กสินค้าที่จะโชว์ — เรียงตามลำดับที่ติ๊ก"
                addLabel="＋ เลือกสินค้า…"
                searchPlaceholder="ค้นหารหัส/ชื่อสินค้า…"
                unit="ชิ้น"
                showKeys={false}
                emptyText="ยังไม่ได้เลือกสินค้า"
              />
              <p className="mt-1 text-[10px] text-slate-400">สินค้าที่ร้านนี้ไม่มี (เช่น มาจากแม่แบบร้านอื่น) จะไม่โชว์เอง</p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={lbl}>การ์ดต่อแถว</span>
              <WheelSelect value={b.perRow} onChange={(e) => set({ perRow: Number(e.target.value) })}>
                {range(MEGA_LIMITS.perRow[0], MEGA_LIMITS.perRow[1]).map((n) => (
                  <option key={n} value={n}>{n} ใบ</option>
                ))}
              </WheelSelect>
            </label>
            <label className="block">
              <span className={lbl}>สัดส่วนรูป</span>
              <select className={mini} value={b.ratio} onChange={(e) => set({ ratio: e.target.value as MegaBlock["ratio"] })}>
                {MEGA_RATIOS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showPrice} onChange={(e) => set({ showPrice: e.target.checked })} />
              ราคา
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.showBadge} onChange={(e) => set({ showBadge: e.target.checked })} />
              ป้าย
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.hoverSwap} onChange={(e) => set({ hoverSwap: e.target.checked })} />
              ชี้แล้วสลับรูป
            </label>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.onSale} onChange={(e) => set({ onSale: e.target.checked })} />
              เฉพาะที่ลดราคา
            </label>
          </div>
          <p className={`text-[11px] ${preview.length ? "text-slate-500" : "text-amber-700"}`}>
            {preview.length ? `👁 จะโชว์ ${preview.length} ชิ้น: ${preview.slice(0, 4).map((p) => p.name).join(" · ")}${preview.length > 4 ? " …" : ""}` : "⚠️ ตอนนี้ไม่มีสินค้าที่ตรงเงื่อนไข — กล่องนี้จะไม่โชว์บนเว็บ"}
          </p>
        </div>
      );
    }
    case "feature":
      return (
        <div>
          {head}
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
            <ImageUploadField label="รูปเด่น" value={b.imageKey} onChange={(k) => set({ imageKey: k })} height={72} />
            <div className="space-y-1.5">
              <input className={`${mini} w-full`} value={b.caption} maxLength={120} placeholder="ข้อความบนรูป เช่น “The Valérie” ดูคอลเลกชัน" onChange={(e) => set({ caption: e.target.value })} />
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <LinkField value={b.href} onChange={(href) => set({ href })} ctx={ctx.link} />
                </div>
                <IssueBadge href={b.href} />
              </div>
              <label className="block">
                <span className={lbl}>สัดส่วนรูป</span>
                <select className={mini} value={b.ratio} onChange={(e) => set({ ratio: e.target.value as MegaBlock["ratio"] })}>
                  {MEGA_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className={check} title="ลิงก์ที่ตั้ง “รูปตอนชี้” ไว้ (หรือหมวด/คอลเลกชันอัตโนมัติที่มีรูป) — ชี้แล้วรูปนี้เปลี่ยนตาม">
                <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={b.swapOnHover} onChange={(e) => set({ swapOnHover: e.target.checked })} />
                เปลี่ยนรูปตามลิงก์ที่ชี้ในแผง
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
  return (
    <div className="space-y-1.5">
      {b.groups.map((g, i) => (
        <div key={g.id} {...drag.rowProps(i)} className={`rounded-md border border-slate-200 bg-slate-50/60 p-1.5 ${drag.rowCls(i)}`}>
          <div className="flex items-center gap-1">
            <DragHandle {...drag.handleProps(i)} />
            <input className={`${mini} flex-1 min-w-0 font-medium`} value={g.label} maxLength={60} placeholder="หัวข้อ เช่น กระเป๋าผู้หญิง" onChange={(e) => setG(g.id, { label: e.target.value })} />
            <IssueBadge href={g.href} />
            <div className="w-36 shrink-0">
              <LinkField value={g.href} onChange={(href) => setG(g.id, { href })} ctx={ctx.link} />
            </div>
            <button type="button" onClick={() => set({ groups: b.groups.filter((x) => x.id !== g.id) })} className="text-slate-300 hover:text-rose-600 px-1" title="ลบหัวข้อ">
              ✕
            </button>
          </div>
          <div className="mt-1 pl-5 border-l-2 border-slate-200 ml-2">
            <LinksEditor links={g.links} style="plain" plainOnly onChange={(links) => setG(g.id, { links })} ctx={ctx} max={MEGA_LIMITS.groupLinks} />
          </div>
        </div>
      ))}
      <button type="button" disabled={b.groups.length >= MEGA_LIMITS.groups} onClick={() => set({ groups: [...b.groups, newMegaGroup()] })} className="text-[11px] text-blue-600 hover:underline disabled:opacity-40">
        ＋ เพิ่มหัวข้อ
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
      toast.success("คัดลอกคอลัมน์แล้ว — ไปที่เมนูอื่นแล้วกด “📋 วางคอลัมน์”");
    } catch {
      toast.error("คัดลอกไม่ได้");
    }
  };
  const totalSpan = blocks.reduce((s, b) => s + b.span, 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-slate-400" title="สัดส่วนความกว้างของแต่ละคอลัมน์ในแผง (ซ้าย → ขวา)">
        {blocks.map((b) => (
          <span key={b.id} className="h-4 rounded bg-slate-200 text-slate-600 inline-flex items-center justify-center truncate px-1" style={{ flex: b.span }}>
            {KIND_ICON[b.kind]} {b.title || MEGA_BLOCK_KINDS.find((k) => k.value === b.kind)?.label}
          </span>
        ))}
        {!blocks.length && <span>ยังไม่มีคอลัมน์</span>}
        {totalSpan > 0 && <span className="shrink-0 pl-1">{totalSpan} ส่วน</span>}
      </div>
      {blocks.map((b, i) => {
        const open = openId === b.id;
        const kind = MEGA_BLOCK_KINDS.find((k) => k.value === b.kind);
        return (
          <div key={b.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <DragHandle {...drag.handleProps(i)} />
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0" title={kind?.hint}>
                {KIND_ICON[b.kind]} {kind?.label}
                {b.kind === "links" && b.auto ? " ⚡" : ""}
              </span>
              <input className={`${mini} flex-1 min-w-0`} value={b.title} maxLength={60} placeholder="หัวคอลัมน์ (ไม่ใส่ก็ได้)" onChange={(e) => set(b.id, { title: e.target.value })} />
              <WheelSelect value={b.span} onChange={(e) => set(b.id, { span: Number(e.target.value) })} title="ความกว้างของคอลัมน์นี้ (ชี้แล้วหมุนลูกกลิ้งได้)">
                {range(MEGA_LIMITS.span[0], MEGA_LIMITS.span[1]).map((n) => (
                  <option key={n} value={n}>กว้าง {n} ส่วน</option>
                ))}
              </WheelSelect>
              <button type="button" disabled={full} onClick={() => duplicate(i)} className="text-xs w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40" title="ทำซ้ำคอลัมน์นี้">
                ⧉
              </button>
              <button type="button" onClick={() => copy(b)} className="text-xs w-7 h-7 rounded-md border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-700" title="คัดลอกไปวางเมนูอื่น">
                📋
              </button>
              <button type="button" onClick={() => setOpenId(open ? null : b.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500"}`}>
                {open ? "▲" : "▼"}
              </button>
              <button type="button" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบคอลัมน์">
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
        <span className="text-[11px] text-slate-500">＋ เพิ่มคอลัมน์:</span>
        {MEGA_BLOCK_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            disabled={full}
            title={k.hint}
            onClick={() => {
              const nb = newMegaBlock(k.value);
              setBlocks([...blocks, nb]);
              setOpenId(nb.id);
            }}
            className="text-[11px] px-2 h-6 rounded-md border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40"
          >
            {KIND_ICON[k.value]} {k.label}
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
            title={`วาง: ${clip.title || MEGA_BLOCK_KINDS.find((k) => k.value === clip.kind)?.label}`}
          >
            📋 วางคอลัมน์ ({clip.title || MEGA_BLOCK_KINDS.find((k) => k.value === clip.kind)?.label})
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
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">การ์ดต่อแถว</span>
        <WheelSelect value={panel.cardsPerRow} onChange={(e) => onChange({ ...panel, cardsPerRow: Number(e.target.value) })}>
          {range(MEGA_LIMITS.cardsPerRow[0], MEGA_LIMITS.cardsPerRow[1]).map((n) => (
            <option key={n} value={n}>{n} ใบ</option>
          ))}
        </WheelSelect>
      </label>
      {tabs.map((t, i) => {
        const open = openId === t.id;
        return (
          <div key={t.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <DragHandle {...drag.handleProps(i)} />
              <input className={`${mini} flex-1 min-w-0 font-medium`} value={t.label} maxLength={40} placeholder="ชื่อแท็บ เช่น EVERYDAY" onChange={(e) => set(t.id, { label: e.target.value })} />
              <IssueBadge href={t.href} />
              <div className="w-36 shrink-0">
                <LinkField value={t.href} onChange={(href) => set(t.id, { href })} ctx={ctx.link} />
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">{t.cards.length} การ์ด</span>
              <button type="button" onClick={() => setOpenId(open ? null : t.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500"}`}>
                {open ? "▲" : "▼"}
              </button>
              <button type="button" onClick={() => setTabs(tabs.filter((x) => x.id !== t.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบแท็บ">
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
          ＋ เพิ่มแท็บ
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
            ＋ เติมแท็บจากหมวดของร้าน
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── ⚙️ หน้าตาแผง ───────── */
function PanelLook({ panel, onChange, ctx }: { panel: MegaPanel; onChange: (p: MegaPanel) => void; ctx: MegaEditorCtx }) {
  const [open, setOpen] = useState(false);
  const changed = (panel.width !== "full" ? 1 : 0) + (panel.bg ? 1 : 0) + (panel.divider ? 1 : 0) + (panel.promo ? 1 : 0) + (panel.mobileHideMedia ? 1 : 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-slate-600">
        <span>⚙️ หน้าตาแผง {changed > 0 && <span className="ml-1 text-blue-600">· ปรับแล้ว {changed}</span>}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-100 pt-2">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className={lbl}>ขนาดแผง</span>
              <Seg value={panel.width} onChange={(v) => onChange({ ...panel, width: v })} options={[{ v: "full", l: "เต็มความกว้างจอ" }, { v: "box", l: "กล่องลอยใต้เมนู" }]} />
            </div>
            <div>
              <span className={lbl}>สีพื้นแผง</span>
              <div className="flex items-center gap-1">
                <span className="w-32">
                  <ColorInput value={panel.bg} onChange={(v) => onChange({ ...panel, bg: v })} />
                </span>
                {panel.bg && (
                  <button type="button" className="text-[11px] text-slate-400 hover:text-rose-600" onClick={() => onChange({ ...panel, bg: "" })} title="กลับเป็นสีพื้นการ์ดของธีม">
                    ✕
                  </button>
                )}
              </div>
            </div>
            <label className={`${check} pb-1.5`}>
              <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={panel.divider} onChange={(e) => onChange({ ...panel, divider: e.target.checked })} />
              เส้นคั่นระหว่างคอลัมน์
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 shrink-0">แถบข้อความใต้แผง</span>
            <input className={`${mini} flex-1 min-w-[10rem]`} value={panel.promo} maxLength={120} placeholder="เช่น ส่งฟรีเมื่อครบ ฿1,500 · ผ่อน 0% 10 เดือน" onChange={(e) => onChange({ ...panel, promo: e.target.value })} />
            {panel.promo && (
              <div className="w-40">
                <LinkField value={panel.promoHref} onChange={(promoHref) => onChange({ ...panel, promoHref })} ctx={ctx.link} />
              </div>
            )}
          </div>
          <label className={check}>
            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={panel.mobileHideMedia} onChange={(e) => onChange({ ...panel, mobileHideMedia: e.target.checked })} />
            📱 มือถือ: ซ่อนการ์ดสินค้า / รูปเด่น / การ์ดรูป (เหลือแต่ลิงก์ · เมนูโหลดเร็ว)
          </label>
        </div>
      )}
    </div>
  );
}

/* ───────── แม่แบบที่บันทึก ───────── */
const panelSummary = (p: MegaPanel) => (p.layout === "tabs" ? `${p.tabs.length} แท็บ` : `${p.blocks.length} คอลัมน์`);

function SaveTemplateDialog({ open, onClose, shopId, panel, rename, onSaved }: { open: boolean; onClose: () => void; shopId: string; panel?: MegaPanel | null; rename?: MenuTemplate | null; onSaved?: () => void }) {
  const toast = useToast();
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
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(rename ? "แก้ชื่อแม่แบบแล้ว" : `บันทึกแม่แบบ “${n}” แล้ว — ใช้ได้กับทุกเมนูและทุกร้าน`);
      onSaved?.();
      onClose();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={rename ? "แก้ชื่อแม่แบบเมนู" : "💾 บันทึกแผงเมนูเป็นแม่แบบ"}
      description={rename ? undefined : "เก็บทั้งคอลัมน์ ลิงก์ ไอคอน รูป และแท็บ ไว้ใช้กับเมนูอื่นหรือร้านอื่น (ใช้แล้วได้สำเนา แก้แยกกันได้)"}
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            ยกเลิก
          </button>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="h-9 px-4 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? "กำลังบันทึก…" : rename ? "บันทึกชื่อ" : "💾 บันทึกแม่แบบ"}
          </button>
        </div>
      }
    >
      <label className="block text-[11px] font-medium text-slate-500 mb-1">ชื่อแม่แบบ</label>
      <input
        autoFocus
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        placeholder="เช่น เมนูกระเป๋า แบบไอคอน"
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
      if (!j.ok) toast.error(j.error ?? "ลบไม่สำเร็จ");
      else {
        toast.success("ลบแม่แบบแล้ว — เมนูที่เคยใช้ไปแล้วไม่กระทบ");
        setDeleting(null);
        load();
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
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
          {MEGA_TEMPLATES.find((x) => x.value === t.template)?.label} · {panelSummary(t.panel)}
          {t.shopId !== shopId && ` · จากร้าน ${t.shopName ?? "อื่น"}`}
        </span>
      </span>
      <button type="button" onClick={() => setRenaming(t)} title="แก้ชื่อ" className="w-7 h-7 text-xs text-slate-400 hover:text-slate-800">
        ✏️
      </button>
      <button type="button" onClick={() => setDeleting(t)} title="ลบแม่แบบ" className="w-7 h-7 text-xs text-slate-400 hover:text-red-600">
        🗑️
      </button>
      <button type="button" onClick={() => onUse(t)} className="h-8 px-3 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-50">
        ใช้แม่แบบนี้
      </button>
    </div>
  );
  return (
    <>
      <ERPModal open={open} onClose={onClose} title="📂 แม่แบบแผงเมนูที่บันทึกไว้" description="ใช้แล้วได้สำเนา แก้ต่อได้ — แทนแผงเดิมของเมนูนี้" size="md" defaultExpanded={false}>
        {list === null ? (
          <p className="text-sm text-slate-400 py-6 text-center">กำลังโหลด…</p>
        ) : !list.length ? (
          <p className="text-sm text-slate-400 py-6 text-center">ยังไม่มีแม่แบบ — จัดแผงเมนูจนพอใจแล้วกด “💾 บันทึกเป็นแม่แบบ”</p>
        ) : (
          <div className="space-y-3">
            {mine.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">ร้านนี้</p>
                {mine.map(row)}
              </div>
            )}
            {other.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">จากร้านอื่น</p>
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
        title={`ลบแม่แบบ “${deleting?.name ?? ""}”?`}
        message="เมนูที่เคยใช้แม่แบบนี้ไปแล้วจะไม่เปลี่ยน (เป็นสำเนาแยก) — ลบแล้วแม่แบบนี้จะหายจากทุกร้าน"
        confirmText="ลบแม่แบบ"
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
  const pickTemplate = (t: MegaTemplate) => change(megaPreset(t, { categories: ctx.categories }), `เปลี่ยนเป็นแบบ ${t}?`);
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
        <span className="block text-[11px] text-slate-500 mb-1">หน้าตาเมนูย่อย</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => panel && change(null, "กลับไปใช้เมนูย่อยธรรมดา?")}
            className={`text-[11px] px-2 h-7 rounded-md border ${!panel ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            title="รายการเลื่อนลง / แผงรูปหมวด (แบบเดิม)"
          >
            เมนูย่อยธรรมดา
          </button>
          {MEGA_TEMPLATES.map((t) => (
            <button
              key={t.value}
              type="button"
              title={t.hint}
              onClick={() => panel?.template !== t.value && pickTemplate(t.value)}
              className={`text-[11px] px-2 h-7 rounded-md border ${panel?.template === t.value ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
            >
              แบบ {t.value} · {t.label}
            </button>
          ))}
          <button type="button" onClick={() => setTplOpen(true)} className="text-[11px] px-2 h-7 rounded-md border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700">
            📂 แม่แบบที่บันทึก…
          </button>
        </div>
      </div>

      {panel && (
        <IssueCtx.Provider value={sets}>
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-2 space-y-2">
          {issues > 0 && <p className="text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1">⚠️ มีลิงก์ที่อาจเสีย {issues} จุด (หมวด/หน้า/สินค้าที่ไม่มีแล้ว) — ดูป้าย ⚠️ ในรายการด้านล่าง</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-blue-800">👁 พรีวิวด้านขวาเปิดแผงนี้ค้างไว้ (ดูที่จอคอม)</span>
            <span className="flex-1" />
            <button type="button" disabled={!megaHasContent(panel)} onClick={() => setSaveOpen(true)} className="text-[11px] px-2 h-7 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-blue-400 disabled:opacity-40">
              💾 บันทึกเป็นแม่แบบ
            </button>
          </div>
          {panel.layout === "tabs" ? <TabsEditor panel={panel} onChange={onChange} ctx={ctx} /> : <BlocksEditor panel={panel} onChange={onChange} ctx={ctx} />}
          <label className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">ลิงก์ท้ายแผง</span>
            <input className={`${mini} flex-1`} value={panel.viewAllLabel} maxLength={40} placeholder='เช่น "ดูสินค้าทั้งหมด →" (ไม่ใส่ = ไม่โชว์ · ไปที่ลิงก์ของเมนูนี้)' onChange={(e) => onChange({ ...panel, viewAllLabel: e.target.value })} />
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
          change(JSON.parse(JSON.stringify(t.panel)) as MegaPanel, `ใช้แม่แบบ “${t.name}”?`);
          if (!megaHasContent(panel)) toast.success(`ใช้แม่แบบ “${t.name}” แล้ว — แก้ต่อได้ · กด ↶ เพื่อย้อนกลับ`);
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
        message="แผงเมนูเดิม (คอลัมน์/ลิงก์/รูปที่จัดไว้) จะถูกแทน — ยังไม่ขึ้นเว็บจนกดเผยแพร่ และกด ↶ ย้อนได้"
        confirmText="แทนเลย"
      />
    </div>
  );
}
