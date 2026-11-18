"use client";

/**
 * 🎨 ป้าย "สี/แบบ" ของบรรทัดตีราคา (เจ้าของขอ 2026-11-18 — PU หลายสีในใบเดียว เปลี่ยนวัสดุเฉพาะสีเดียวได้)
 *   มีค่า = ชิปสี (กดแก้) · ว่าง + แก้ได้ = ปุ่มเส้นประ "+ สี"
 *   ป๊อปเล็ก: เลือกจากสีที่ใช้ในใบนี้แล้ว / พิมพ์ใหม่ (Enter) / เอาออก
 *   ค่าเก็บที่ design_sheet_cost_lines.variant · ตารางจัดกลุ่มตามวัสดุแยกตามสีให้เอง (groupLabel ใน index.tsx)
 * ใช้ที่: components/design-sheet-detail/index.tsx (คอลัมน์วัสดุ)
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";

/** สีชิปจากชื่อ (ชื่อเดียวกัน = สีเดียวกันทุกครั้ง) */
const TONES = ["bg-slate-800 text-white", "bg-amber-100 text-amber-900", "bg-sky-100 text-sky-900", "bg-rose-100 text-rose-900", "bg-emerald-100 text-emerald-900", "bg-violet-100 text-violet-900", "bg-orange-100 text-orange-900"];
export const variantTone = (v: string) => { let h = 0; for (const ch of v) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };

export function VariantChip({ value, options, editable, onChange }: {
  value: string | null | undefined;
  /** สีที่ใช้ในใบนี้แล้ว (เลือกซ้ำได้เร็ว) */
  options: string[];
  editable: boolean;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const v = value?.trim() || "";
  if (!v && !editable) return null;
  const pick = (x: string | null) => { onChange(x?.trim() ? x.trim().slice(0, 40) : null); setOpen(false); setQ(""); };
  const list = options.filter((o) => o !== v && (!q.trim() || o.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      {v ? (
        <button type="button" disabled={!editable} onClick={() => setOpen((o) => !o)} title={editable ? t("เปลี่ยนสี/แบบ", "Change colour/variant") : undefined}
          className={`max-w-[6rem] truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${variantTone(v)} disabled:cursor-default`}>{v}</button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} title={t("ใส่สี/แบบ — แยกกลุ่มย่อยในวัสดุเดียวกัน", "Add a colour/variant — splits the material into sub-groups")}
          className="rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-400 hover:border-slate-400 hover:text-slate-600">+ {t("สี", "colour")}</button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1.5 text-left shadow-lg" onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("พิมพ์สี/แบบ เช่น ดำ", "Type e.g. black")} maxLength={40}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); if (q.trim()) pick(q); } if (e.key === "Escape") setOpen(false); }}
            className="mb-1 h-8 w-full rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="max-h-40 overflow-y-auto">
            {list.map((o) => (
              <button key={o} type="button" onClick={() => pick(o)} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <span className={`h-2.5 w-2.5 rounded-full ${variantTone(o).split(" ")[0]}`} />{o}</button>
            ))}
            {q.trim() && !options.includes(q.trim()) && (
              <button type="button" onClick={() => pick(q)} className="w-full rounded px-1.5 py-1 text-left text-sm text-blue-600 hover:bg-blue-50">+ {t(`ใช้ "${q.trim()}"`, `Use "${q.trim()}"`)}</button>
            )}
            {v && <button type="button" onClick={() => pick(null)} className="w-full rounded px-1.5 py-1 text-left text-sm text-rose-600 hover:bg-rose-50">{t("เอาสีออก", "Remove colour")}</button>}
          </div>
        </div>
      )}
    </span>
  );
}
