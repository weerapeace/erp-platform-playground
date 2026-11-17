"use client";

/**
 * 📏 ช่อง "วางจริง" ที่หัวกลุ่มตารางตีราคา (เจ้าของขอ 2026-11-17) — หน้าคอม + มือถือใช้ตัวเดียวกัน
 *   ต่อจาก "ใช้ต่อใบ ≈ (ประมาณจากพื้นที่)" → พิมพ์ตัวเลขที่ลองวางชิ้นบนผ้าจริง → บอกว่าประหยัด/ใช้มากกว่ากี่ %
 *   จำว่าใครใส่ วันไหน + หมายเหตุสั้น ๆ (ชี้ดู) · ยืนยันตอนออกจากช่อง/กด Enter (ไม่บันทึกเอง — หน้าแม่รวมกับปุ่มบันทึกตีราคา)
 *   ค่า/ตัวตรวจ: lib/nest-usage
 * ใช้ที่: components/design-sheet-detail/index.tsx (groupNote) · components/design-sheet-mobile/cost-tab.tsx
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { nestDiffLabel, nestDiffPct, type NestEntry } from "@/lib/nest-usage";

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const fmtWhen = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};

export function NestUsageChip({ entry, estimate, unit, editable, userName, onChange }: {
  entry: NestEntry | undefined;
  /** ใช้ต่อใบที่ประมาณจากพื้นที่ (ไม่มี = ไม่โชว์ % ต่าง) */
  estimate: number | null;
  /** หน่วยของตัวเลข (เช่น หลา / ผืน) — ตามหน่วยของค่าประมาณ */
  unit: string;
  editable: boolean;
  userName?: string | null;
  onChange: (e: NestEntry | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(entry ? fmt(entry.qty) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  useEffect(() => { setQty(entry ? fmt(entry.qty) : ""); setNote(entry?.note ?? ""); }, [entry]);

  const commit = () => {
    const n = Number(qty.replace(",", "."));
    const nextQty = qty.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
    const nextNote = note.trim().slice(0, 200);
    if (nextQty == null) { if (entry) onChange(null); setOpen(false); return; }
    if (entry && entry.qty === nextQty && (entry.note ?? "") === nextNote && entry.unit === unit) return;
    onChange({ qty: nextQty, unit, ...(nextNote ? { note: nextNote } : {}), ...(userName ? { by: userName } : {}), at: new Date().toISOString() });
  };

  const pct = entry ? nestDiffPct(entry.qty, entry.unit === unit ? estimate : null) : null;
  const diff = nestDiffLabel(pct, t);
  const who = entry ? [entry.by, fmtWhen(entry.at)].filter(Boolean).join(" · ") : "";
  const tip = entry ? [t("ตัวเลขจากการลองวางบนผ้าจริง", "From an actual layout on fabric"), who && t(`ใส่โดย ${who}`, `By ${who}`), entry.note && t(`หมายเหตุ: ${entry.note}`, `Note: ${entry.note}`)].filter(Boolean).join("\n") : "";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!entry && !open) {
    if (!editable) return null;
    return (
      <button type="button" onClick={(e) => { stop(e); setOpen(true); }}
        className="inline-flex items-center gap-1 rounded border border-dashed border-blue-300 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
        title={t("ลองวางชิ้นบนผ้าจริงแล้ว ใส่ตัวเลขที่ใช้จริงต่อใบ", "After an actual layout on fabric, enter the real usage per unit")}>
        <Icon value="i:measure" className="text-[12px]" />{t("ใส่ตัวเลขวางจริง", "Add actual layout")}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1" onClick={stop}>
      <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800" title={tip || undefined}>
        <Icon value="i:measure" className="text-[12px]" />{t("วางจริง", "Actual")}
        {editable ? (
          <input value={qty} inputMode="decimal" autoFocus={!entry} onChange={(e) => setQty(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setQty(entry ? fmt(entry.qty) : ""); setOpen(false); } }}
            aria-label={t("ใช้ต่อใบจากการวางจริง", "Actual usage per unit")}
            className="h-6 w-14 rounded border border-blue-200 bg-white px-1 text-right text-xs tabular-nums text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        ) : <span className="font-semibold tabular-nums">{entry ? fmt(entry.qty) : ""}</span>}
        <span>{entry?.unit || unit}</span>
      </span>
      {diff && <span className={`rounded px-1.5 py-0.5 text-[11px] ${pct != null && pct > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{diff}</span>}
      {editable && (entry || qty.trim()) ? (
        <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={t("หมายเหตุ เช่น วางหน้า 150", "Note e.g. 150 cm width")}
          className="h-6 w-36 rounded border border-slate-200 bg-white px-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      ) : entry?.note ? <span className="max-w-[12rem] truncate text-[11px] text-slate-500" title={entry.note}>{entry.note}</span> : null}
      {who && <span className="text-[10px] text-slate-400">{who}</span>}
    </span>
  );
}
