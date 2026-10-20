"use client";

/**
 * 🪟 Design Dashboard: ชี้ที่การ์ดใบงาน = กล่องรูปใหญ่ + รายละเอียดงาน (เจ้าของ 2026-10-20: "อยากได้ที่หน้า design dashboard ด้วย" — แบบเดียวกับบอร์ดงาน)
 *   - กล่องลอย/ตำแหน่ง/ชิปตั้งค่า = ของกลาง components/hover-card
 *   - ตั้งค่าต่อคน (user_ui_prefs key design_dashboard_hover = { on, fields }) · ไม่เคยตั้ง = เปิด + DEFAULT_SHEET_HOVER_FIELDS
 *   - ปุ่มตั้งค่า "⚙️ ตั้งค่า Hover ▾" บนแถบเครื่องมือ (จอคอมเท่านั้น — ทัชไม่เด้งอยู่แล้ว)
 *     (เดิมชื่อ "🪟 ชี้ที่การ์ด" — เจ้าของหาไม่เจอ เพราะไม่รู้ว่าเป็นปุ่มตั้งค่า → ชื่อต้องมีคำว่า "ตั้งค่า" + "Hover")
 * ใช้ที่: การ์ดบอร์ด (renderBoardCard) + การ์ดรูปใหญ่ (renderGalleryCard) ใน components/design-dashboard
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { QUOTE_STATUS } from "@/lib/design-sheets-meta";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { HoverCardWrap, HoverFieldsPicker, HoverRow, type HoverFieldDef } from "@/components/hover-card";

export type SheetHoverField =
  | "image" | "name" | "code" | "status" | "waiting" | "brand" | "jobType" | "orderDate" | "deadline"
  | "steps" | "quoteStatus" | "quotePrice" | "comments" | "detail" | "note" | "updated";

/** รายการที่เลือกได้ (ลำดับ = ลำดับที่โชว์ในกล่อง) */
export const SHEET_HOVER_FIELDS: HoverFieldDef<SheetHoverField>[] = [
  { key: "image", th: "รูปใหญ่", en: "Large image" },
  { key: "name", th: "ชื่องาน", en: "Name" },
  { key: "code", th: "เลขที่ใบงาน", en: "Sheet no." },
  { key: "status", th: "สถานะ", en: "Status" },
  { key: "waiting", th: "⏳ รออะไรอยู่", en: "Waiting for" },
  { key: "brand", th: "แบรนด์", en: "Brand" },
  { key: "jobType", th: "งานลูกค้า / แบรนด์เรา", en: "Customer / own brand" },
  { key: "orderDate", th: "วันที่สั่ง", en: "Order date" },
  { key: "deadline", th: "กำหนดส่ง", en: "Deadline" },
  { key: "steps", th: "ตีราคา / มีราคา / มี SKU", en: "Costed / quoted / SKU" },
  { key: "quoteStatus", th: "สถานะตีราคา", en: "Quote status" },
  { key: "quotePrice", th: "ราคาที่เสนอ", en: "Offered price" },
  { key: "comments", th: "Comment ลูกค้า", en: "Customer comments" },
  { key: "detail", th: "รายละเอียดงาน", en: "Details" },
  { key: "note", th: "โน้ต", en: "Note" },
  { key: "updated", th: "แก้ล่าสุด", en: "Last updated" },
];
export const DEFAULT_SHEET_HOVER_FIELDS: SheetHoverField[] = ["image", "name", "code", "status", "waiting", "brand", "deadline", "steps", "quoteStatus", "quotePrice", "comments", "detail", "note"];

const PREF_KEY = "design_dashboard_hover";
type Pref = { on: boolean; fields: SheetHoverField[] | null };

/** ค่าตั้ง "ชี้ที่การ์ด" ต่อคน (โหลด/บันทึก user_ui_prefs) */
export function useSheetHoverPref() {
  const [pref, setPref] = useState<Pref>({ on: true, fields: null });
  useEffect(() => {
    apiFetch(`/api/user-prefs?key=${PREF_KEY}`).then((r) => r.json())
      .then((j) => {
        const v = j?.value;
        if (!v || typeof v !== "object") return;
        const known = new Set(SHEET_HOVER_FIELDS.map((f) => f.key));
        const fields = Array.isArray(v.fields) ? (v.fields as unknown[]).map(String).filter((k): k is SheetHoverField => known.has(k as SheetHoverField)) : null;
        setPref({ on: v.on !== false, fields });
      })
      .catch(() => {});
  }, []);
  const save = (next: Pref) => {
    setPref(next);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: PREF_KEY, value: next }) }).catch(() => {});
  };
  return {
    on: pref.on,
    fields: pref.fields ?? DEFAULT_SHEET_HOVER_FIELDS,
    custom: pref.fields,
    setOn: (on: boolean) => save({ ...pref, on }),
    setFields: (fields: SheetHoverField[] | null) => save({ ...pref, fields }),
  };
}
export type SheetHoverPref = ReturnType<typeof useSheetHoverPref>;

type Tone = "danger" | "warn" | "good" | "done" | "normal";
const TONE_CLS: Record<Tone, string> = {
  danger: "font-semibold text-rose-600", warn: "font-semibold text-amber-600", good: "text-emerald-600", done: "text-violet-600", normal: "text-slate-500",
};

/** "2026-10-20" → "20 ต.ค. 2569" (ไม่เลื่อนวันตามเวลาเครื่อง) */
function fmtDate(v: string | null): string | null {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v || null;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
const fmtNum = (n: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(n);
function fmtDateTime(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** ห่อการ์ดใบงาน — off = ไม่เด้ง (เช่น กำลังลาก/กำลังย้าย) */
export function SheetHoverWrap({ sheet, pref, status, deadline, own, off, className, children }: {
  sheet: DesignSheetListItem;
  pref: SheetHoverPref;
  status?: { label: string; color: string } | null;
  deadline: { label: string; tone: Tone };
  own: boolean;
  off?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const has = (k: SheetHoverField) => pref.fields.includes(k);
  const img = has("image") ? withImageWidth(sheet.cover_url, 640) : null;
  return (
    <HoverCardWrap enabled={pref.on && pref.fields.length > 0} off={off} className={className} image={img}
      hint="เลือกสิ่งที่โชว์: ปุ่ม ⚙️ ตั้งค่า Hover บนแถบเครื่องมือ"
      details={() => {
        const anyStep = sheet.has_cost || sheet.has_quote || sheet.parent_count > 0;
        const detail = (sheet.detail_excerpt ?? "").trim();
        const note = (sheet.note ?? "").trim();
        const waiting = (sheet.waiting_for ?? "").trim();
        const quote = sheet.quote_latest ?? null;
        const priced = (quote?.cells ?? []).filter((c): c is typeof c & { price: number } => c.price != null);
        const comments = sheet.comments_latest ?? [];
        return (
          <>
            {(has("status") || has("code")) && (
              <div className="flex flex-wrap items-center gap-1">
                {has("status") && status && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: status.color, backgroundColor: `${status.color}1a` }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />{status.label}
                  </span>
                )}
                {has("code") && <span className="ml-auto font-mono text-[10.5px] text-slate-400">{sheet.code}</span>}
              </div>
            )}
            {has("name") && <p className="text-[15px] font-semibold leading-snug text-slate-900">{sheet.name}</p>}
            {has("waiting") && waiting && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12.5px] leading-snug text-amber-800">
                <span className="font-semibold">⏳ รออยู่:</span> {waiting}
              </p>
            )}
            {has("brand") && (
              <HoverRow label="แบรนด์">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: sheet.brand_color || "#cbd5e1" }} />{sheet.brand_name ?? "ไม่ระบุแบรนด์"}</span>
              </HoverRow>
            )}
            {has("jobType") && <HoverRow label="ประเภท">{own ? "งานแบรนด์เรา" : "งานลูกค้า"}</HoverRow>}
            {has("orderDate") && sheet.order_date && <HoverRow label="วันที่สั่ง">{fmtDate(sheet.order_date)}</HoverRow>}
            {has("deadline") && (
              <HoverRow label="กำหนดส่ง">
                {sheet.deadline && <span className="mr-1.5">{fmtDate(sheet.deadline)}</span>}
                <span className={TONE_CLS[deadline.tone]}>{deadline.tone === "danger" ? "⚠ " : ""}{deadline.label}</span>
              </HoverRow>
            )}
            {has("steps") && (
              <HoverRow label="ความคืบหน้า">
                {anyStep ? (
                  <span className="flex flex-wrap gap-1 text-[11px]">
                    {sheet.has_cost && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">ตีราคาแล้ว</span>}
                    {sheet.has_quote && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">มีราคาแล้ว</span>}
                    {sheet.parent_count > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">มี SKU ({sheet.parent_count})</span>}
                  </span>
                ) : <span className="text-slate-400">ยังไม่ตีราคา / ยังไม่มี SKU</span>}
              </HoverRow>
            )}
            {has("quoteStatus") && (
              <HoverRow label="สถานะตีราคา">
                {quote ? (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <span>เสนอครั้งที่ {quote.no}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${quote.status === "mixed" ? "bg-amber-50 text-amber-700" : (QUOTE_STATUS[quote.status] ?? QUOTE_STATUS.pending).cls}`}>
                      {quote.status === "mixed" ? "◐ ผลต่างกันในครั้งนี้" : (QUOTE_STATUS[quote.status] ?? QUOTE_STATUS.pending).label}
                    </span>
                    {quote.date && <span className="text-[11px] text-slate-400">{fmtDate(quote.date)}</span>}
                  </span>
                ) : sheet.has_cost ? <span className="text-violet-600">ตีราคาแล้ว · ยังไม่เสนอราคา</span>
                  : <span className="text-slate-400">ยังไม่ตีราคา</span>}
              </HoverRow>
            )}
            {has("quotePrice") && priced.length > 0 && (
              <HoverRow label="ราคาที่เสนอ">
                <span className="block space-y-0.5">
                  {priced.slice(0, 6).map((c, i) => {
                    const what = [c.size, c.qty != null ? `${fmtNum(c.qty)} ชิ้น` : null, c.label].filter(Boolean).join(" · ");
                    return (
                      <span key={i} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[11.5px] text-slate-500">{what || (priced.length > 1 ? `ราคา ${i + 1}` : "")}</span>
                        <span className="shrink-0 font-semibold text-slate-800">฿{fmtNum(c.price)}</span>
                      </span>
                    );
                  })}
                  {priced.length > 6 && <span className="block text-[11px] text-slate-400">+ อีก {priced.length - 6} ราคา (ดูในแท็บเสนอราคา)</span>}
                </span>
              </HoverRow>
            )}
            {has("updated") && sheet.updated_at && <HoverRow label="แก้ล่าสุด">{fmtDateTime(sheet.updated_at)}</HoverRow>}
            {has("comments") && comments.length > 0 && (
              <div className="space-y-1 rounded-md bg-sky-50 px-2 py-1.5">
                <div className="text-[11px] font-semibold text-sky-700">💬 Comment ลูกค้า (ล่าสุด)</div>
                {comments.slice(0, 2).map((c, i) => (
                  <p key={i} className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                    {c.date && <span className="mr-1 text-[11px] text-sky-600">{fmtDate(c.date)}</span>}{c.body}
                  </p>
                ))}
              </div>
            )}
            {has("note") && note &&<p className="whitespace-pre-wrap rounded-md bg-amber-50 px-2 py-1 text-[12px] leading-relaxed text-amber-800 line-clamp-4">📝 {note}</p>}
            {has("detail") && detail && (
              <p className="line-clamp-6 whitespace-pre-wrap border-t border-slate-100 pt-1.5 text-[12px] leading-relaxed text-slate-600">{detail}</p>
            )}
          </>
        );
      }}>
      {children}
    </HoverCardWrap>
  );
}

/** ปุ่ม "⚙️ ตั้งค่า Hover ▾" + ป๊อปตั้งค่า (เปิด/ปิด + เลือกสิ่งที่โชว์) */
export function SheetHoverSettingsButton({ pref }: { pref: SheetHoverPref }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <div className="relative" ref={anchorRef}>
      <button type="button" onClick={() => setOpen((o) => !o)} data-sheet-hover-settings-btn
        title="ตั้งค่า Hover: ชี้ที่การ์ดแล้วโชว์รูปใหญ่ + รายละเอียดงาน — เลือกได้ว่าจะโชว์อะไร (จำค่าของคุณ)"
        className={`h-9 rounded-md border px-3 text-xs font-medium transition ${pref.on ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        ⚙️ ตั้งค่า Hover{pref.on ? "" : " (ปิดอยู่)"} ▾
      </button>
      <FloatingDropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} minWidth={300} maxWidth={360}>
        <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl">
          <HoverFieldsPicker on={pref.on} onToggle={pref.setOn} fields={SHEET_HOVER_FIELDS}
            value={pref.custom} defaults={DEFAULT_SHEET_HOVER_FIELDS} onChange={pref.setFields} />
        </div>
      </FloatingDropdown>
    </div>
  );
}
