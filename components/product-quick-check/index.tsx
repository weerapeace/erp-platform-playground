"use client";

// ============================================================
// ProductQuickCheck (ของกลาง) — แผงตรวจสินค้าเร็ว (ดูอย่างเดียว) เปิดเป็นลิ้นชักข้างจอ
//   ต่อสินค้า 1 รุ่น: กล่อง "ระบบเช็กเจอ" (กดแล้วเลื่อนไปจุดนั้น) → รูป → Description ไทย/อังกฤษ → สีและราคา
//   ตัวเช็ก = lib/product-listing-checks (เตือนอย่างเดียว ไม่บล็อก) · ไม่มีปุ่มแก้/ลบ · ไม่แสดงต้นทุน
//   footer = ช่องให้ผู้เรียกใส่ปุ่มของตัวเอง (เช่น อนุมัติ / ตีกลับแก้ ของงาน) — ได้รายการจุดที่เช็กเจอไปใช้เติมเหตุผล
// ใช้ที่: ลิ้นชักงาน Task Manager ปุ่ม "ตรวจเร็ว" (app/tasks/task-quick-check.tsx)
// คู่มือ: docs/product-quick-check.md
// ============================================================

import { useState, type ReactNode } from "react";
import { DrawerShell } from "@/components/modal";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { r2ImageUrl } from "@/lib/r2-image";
import { tr } from "@/lib/lang";
import {
  descLines, duplicateLines, groupSkusByBase, isDuplicateLine, listingChecks, plainColor, priceSummary, skuFlags,
  type ListingCheck, type ListingSku, type QuickCheckParent,
} from "@/lib/product-listing-checks";

export type QuickCheckItem = ListingCheck & { parentCode: string };

const money = (v: number | null | undefined) => (Number(v) > 0 ? Number(v).toLocaleString("th-TH") : "—");
const flagCls = "bg-amber-50 text-amber-800";

function ParentSection({ p, multi, lang, onOpenParent, onViewImages }: {
  p: QuickCheckParent; multi: boolean; lang: "th" | "en";
  onOpenParent?: (id: string) => void; onViewImages?: () => void;
}) {
  const [showIntro, setShowIntro] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const checks = listingChecks(p);
  const big = p.skus.length > 8;
  const groups = groupSkusByBase(p.skus);
  const canGroup = big && groups.length < p.skus.length;
  const [grouped, setGrouped] = useState(true);
  const price = priceSummary(p.skus);
  const text = lang === "th" ? p.description : p.english_description;
  const lines = descLines(text);
  const dups = duplicateLines(text);
  const anchor = (s: string) => `qc-${p.id}-${s}`;
  const jump = (s: string) => {
    document.getElementById(anchor(s))?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(s); setTimeout(() => setFlash(null), 1200);
  };
  const ring = (s: string) => (flash === s ? "ring-2 ring-amber-300 rounded-lg" : "");

  const row = (s: ListingSku, codeCell: ReactNode, extraImgs?: { have: number; total: number }) => {
    const f = skuFlags(s);
    const th = plainColor(s.color_th), en = plainColor(s.color_en);
    const imgBad = extraImgs ? extraImgs.have < extraImgs.total : f.images;
    return (
      <tr key={s.code} className="border-b border-slate-100 align-top">
        <td className="py-1.5 pr-2">{codeCell}</td>
        <td className={`py-1.5 px-1.5 ${f.colorTh || f.colorEn ? flagCls : ""}`}>{th || <i className="text-slate-400">{tr("ว่าง", "empty")}</i>} / {en || <i className="text-slate-400">{tr("ว่าง", "empty")}</i>}</td>
        <td className={`py-1.5 px-1.5 text-right ${f.listPrice ? flagCls : ""}`}>{money(s.list_price)}</td>
        <td className={`py-1.5 px-1.5 text-right ${f.fakePrice ? flagCls : ""}`}>{money(s.fake_price)}</td>
        <td className={`py-1.5 pl-1.5 text-right ${imgBad ? flagCls : ""}`}>{extraImgs ? `${extraImgs.have}/${extraImgs.total}` : s.images}</td>
      </tr>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{p.code}</p>
          <p className="text-xs text-slate-500">{p.name}</p>
        </div>
        {onOpenParent && <button type="button" onClick={() => onOpenParent(p.id)} className="shrink-0 h-8 px-2.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="open" />{tr("เปิดหน้าเต็ม", "Open full")}</button>}
      </div>

      {/* ระบบเช็กเจอ — กดแล้วเลื่อนไปจุดนั้น */}
      <div className={`rounded-lg border px-3 py-2 ${checks.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <p className={`text-xs font-medium flex items-center gap-1.5 ${checks.length ? "text-amber-800" : "text-emerald-700"}`}>
          <Icon name={checks.length ? "warning" : "done"} />
          {checks.length ? tr(`ระบบเช็กเจอ ${checks.length} จุด — กดเพื่อไปดู`, `${checks.length} things to check — click to jump`) : tr("ระบบไม่เจออะไรผิดปกติ", "Nothing unusual found")}
        </p>
        {checks.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {checks.map((c) => <li key={c.key}><button type="button" onClick={() => jump(c.section)} className="text-left text-xs text-amber-800 hover:underline">· {c.text}</button></li>)}
          </ul>
        )}
      </div>

      {/* รูป */}
      <div id={anchor("img")} className={ring("img")}>
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Icon name="image" className="text-slate-400" />{tr("รูป", "Images")}</p>
          <span className="text-xs text-slate-400">Parent {p.parent_images} · Description {p.description_images}</span>
          <span className="flex-1" />
          {onViewImages && <button type="button" onClick={onViewImages} className="text-xs text-violet-700 hover:underline">{tr("ดูรูปทั้งหมด", "View all images")}</button>}
        </div>
        {(p.thumbs?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-6 gap-1.5">
            {p.thumbs!.map((k) => (
              <button key={k} type="button" onClick={onViewImages} className="aspect-square rounded-md overflow-hidden border border-slate-200 bg-white cursor-zoom-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r2ImageUrl(k, 200) ?? ""} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-amber-700">{tr("Parent นี้ยังไม่มีรูป", "This parent has no images yet")}</p>}
      </div>

      {/* Description */}
      <div id={anchor("desc")} className={ring("desc")}>
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1.5"><Icon name="document" className="text-slate-400" />Description {lang === "en" && <span className="text-xs font-normal text-slate-400">English</span>}</p>
        {lang === "th" && p.introduction && (
          <div className="mb-1.5">
            <p className={`text-xs text-slate-600 leading-relaxed whitespace-pre-line ${showIntro ? "" : "line-clamp-2"}`}>{p.introduction}</p>
            <button type="button" onClick={() => setShowIntro((v) => !v)} className="text-[11px] text-violet-700 hover:underline">{showIntro ? tr("ย่อ", "Less") : tr("อ่านคำนำต่อ", "Read intro")}</button>
          </div>
        )}
        {lines.length ? (
          <ul className="list-disc pl-5 text-xs text-slate-700 leading-relaxed space-y-0.5">
            {lines.map((l, i) => {
              const dup = isDuplicateLine(l, dups);
              return <li key={i} className={dup ? `${flagCls} rounded px-1` : ""}>{l}{dup ? ` (${tr("ซ้ำ", "duplicate")})` : ""}</li>;
            })}
          </ul>
        ) : <p className="text-xs text-amber-700">{lang === "th" ? tr("ยังไม่มี Description ไทย", "No Thai description") : tr("ยังไม่มี Description อังกฤษ", "No English description")}</p>}
        <p className="text-xs text-slate-500 mt-1.5">
          {tr("ขนาด", "Size")}: {p.size
            ? `${tr("กว้าง", "W")} ${p.size.length ?? "—"} × ${tr("สูง", "H")} ${p.size.height ?? "—"} × ${tr("หนา", "D")} ${p.size.thickness ?? "—"} ${tr("ซม.", "cm")}`
            : <span className="text-amber-700">{tr("ยังไม่ใส่", "not set")}</span>}
        </p>
      </div>

      {/* สีและราคา */}
      <div id={anchor("sku")} className={ring("sku")}>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Icon name="design" className="text-slate-400" />{tr("สีและราคา", "Colors and prices")}</p>
          <span className="text-xs text-slate-400">{p.skus.length} SKU</span>
          <span className="flex-1" />
          {canGroup && (
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px]">
              <button type="button" onClick={() => setGrouped(true)} className={`px-2 py-0.5 ${grouped ? "bg-violet-50 text-violet-700" : "text-slate-500"}`}>{tr("รวมตามสี", "By color")}</button>
              <button type="button" onClick={() => setGrouped(false)} className={`px-2 py-0.5 ${!grouped ? "bg-violet-50 text-violet-700" : "text-slate-500"}`}>{tr("ทุกตัว", "All")}</button>
            </div>
          )}
        </div>
        {p.skus.length === 0 ? <p className="text-xs text-slate-400">{tr("ยังไม่มี SKU ลูก", "No child SKUs yet")}</p> : (
          <>
            <p className="text-xs text-slate-600 mb-1.5">
              {price.same
                ? <>{tr("ราคาเท่ากันทุกสี", "Same price for all")}: {tr("ขาย", "sale")} {money(price.list)} {tr("บาท", "THB")}{price.fake ? <> · {tr("ขีดฆ่า", "strikethrough")} {money(price.fake)}{price.discountPct != null ? ` (${tr("ลด", "off")} ${price.discountPct}%)` : ""}</> : <span className="text-amber-700"> · {tr("ยังไม่มีราคาขีดฆ่า", "no strikethrough price")}</span>}</>
                : tr("ราคาต่างกันตามสี — ดูในตาราง", "Prices differ by color — see table")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs table-fixed min-w-[420px]">
                <colgroup><col className="w-[26%]" /><col className="w-[36%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[10%]" /></colgroup>
                <thead><tr className="text-[11px] text-slate-500 border-b border-slate-200">
                  <th className="text-left font-medium py-1 pr-2">{tr("รหัส", "Code")}</th><th className="text-left font-medium py-1 px-1.5">{tr("ชื่อสี ไทย / อังกฤษ", "Color TH / EN")}</th>
                  <th className="text-right font-medium py-1 px-1.5">{tr("ราคาขาย", "Sale")}</th><th className="text-right font-medium py-1 px-1.5">{tr("ขีดฆ่า", "Strike")}</th><th className="text-right font-medium py-1 pl-1.5">{tr("รูป", "Img")}</th>
                </tr></thead>
                <tbody>
                  {canGroup && grouped
                    ? groups.map((g) => row(g.items[0], <>{g.base}{g.items.length > 1 && <span className="block text-[10px] text-slate-400">+{g.items.length - 1} {tr("แบบย่อย", "variants")}</span>}</>, { have: g.items.filter((x) => x.images > 0).length, total: g.items.length }))
                    : p.skus.map((s) => row(s, s.code))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{tr("ต้นทุนไม่แสดงในแผงนี้ (ดูได้ในหน้าเต็มเฉพาะคนที่มีสิทธิ์)", "Cost isn't shown here (full page, with permission)")}</p>
          </>
        )}
      </div>
      {multi && <hr className="border-slate-200" />}
    </section>
  );
}

export function ProductQuickCheck({ open = true, onClose, title, parents, loading = false, error = null, onRetry, onViewImages, onOpenParent, footer, emptyTitle, emptyHint }: {
  open?: boolean;
  onClose: () => void;
  title: string;
  parents: QuickCheckParent[] | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onViewImages?: () => void;
  onOpenParent?: (id: string) => void;
  /** ปุ่มท้ายแผงของผู้เรียก — ได้จุดที่เช็กเจอทั้งหมด (ไว้เติมเหตุผลตอนตีกลับ) */
  footer?: (checks: QuickCheckItem[]) => ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const [lang, setLang] = useState<"th" | "en">("th");
  const list = parents ?? [];
  const allChecks: QuickCheckItem[] = list.flatMap((p) => listingChecks(p).map((c) => ({ ...c, parentCode: p.code })));

  let body: ReactNode;
  if (loading) body = <LoadingState />;
  else if (error) body = <ErrorState title={tr("โหลดข้อมูลไม่สำเร็จ", "Couldn't load")} hint={error} onRetry={onRetry} />;
  else if (!list.length) body = <EmptyState icon={<Icon name="package" />} title={emptyTitle ?? tr("ยังไม่ผูกสินค้า", "No product linked")} hint={emptyHint} />;
  else body = <div className="space-y-6">{list.map((p) => <ParentSection key={p.id} p={p} multi={list.length > 1} lang={lang} onOpenParent={onOpenParent} onViewImages={onViewImages} />)}</div>;

  return (
    <DrawerShell open={open} onClose={onClose} width={600}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 shrink-0">
        <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">{title}</p>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"><Icon name="lock" />{tr("ดูอย่างเดียว", "Read-only")}</span>
        {list.length > 0 && (
          <div className="shrink-0 inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button type="button" onClick={() => setLang("th")} className={`px-2.5 py-1 ${lang === "th" ? "bg-violet-50 text-violet-700" : "text-slate-500"}`}>ไทย</button>
            <button type="button" onClick={() => setLang("en")} className={`px-2.5 py-1 ${lang === "en" ? "bg-violet-50 text-violet-700" : "text-slate-500"}`}>English</button>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label={tr("ปิด", "Close")} className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Icon value="i:x" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
      {footer && !loading && !error && list.length > 0 && <div className="border-t border-slate-200 px-5 py-3 shrink-0">{footer(allChecks)}</div>}
    </DrawerShell>
  );
}
