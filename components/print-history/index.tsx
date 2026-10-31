"use client";

/**
 * 🖨 PrintHistoryBadge — ของกลาง: ป้าย "พิมพ์แล้ว N ครั้ง · ล่าสุด …" + กดดูประวัติทุกครั้ง (ใคร · เมื่อไหร่ · แบบไหน · จำนวนตอนพิมพ์)
 *   ยังไม่เคยพิมพ์ = ป้ายเส้นประ "ยังไม่พิมพ์" · จำนวนสั่งตอนนี้ไม่ตรงกับตอนพิมพ์ล่าสุด = ป้ายเหลือง (ใบที่ช่างถืออยู่เป็นฉบับเก่า)
 *   โหลดใหม่เองตอนกลับมาที่แท็บนี้ (พิมพ์ในแท็บใหม่แล้วกลับมา = ป้ายอัปเดต) · ข้อมูล = GET /api/print-logs · ดู lib/print-log.ts
 *
 *   <PrintHistoryBadge docType="mo" docId={mo.id} currentQty={mo.qty} label="ใบงาน" />
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { apiFetch } from "@/lib/api";
import { PRINT_HOW_LABEL, printQtyChanged, type PrintDocType, type PrintLogRow } from "@/lib/print-log";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
/** วันเวลาไทยแบบสั้น: 31 ต.ค. 69 14:05 */
export const printWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
};

export function PrintHistoryBadge({ docType, docId, currentQty, label = "" }: {
  docType: PrintDocType; docId: string | null | undefined;
  /** จำนวนตอนนี้ (เทียบกับตอนพิมพ์ล่าสุด) */
  currentQty?: number | null;
  /** คำต่อท้าย เช่น "ใบงาน" → "ยังไม่พิมพ์ใบงาน" */
  label?: string;
}) {
  const [rows, setRows] = useState<PrintLogRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const load = useCallback(async () => {
    if (!docId) { setRows([]); return; }
    try {
      const r = await apiFetch(`/api/print-logs?doc_type=${docType}&doc_id=${encodeURIComponent(docId)}`);
      const j = await r.json();
      if (r.ok && Array.isArray(j?.data)) setRows(j.data as PrintLogRow[]);
    } catch { /* โหลดไม่ได้ = ไม่โชว์ป้าย */ }
  }, [docType, docId]);
  useEffect(() => { setRows(null); void load(); }, [load]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [load]);

  if (!rows) return null;
  if (!rows.length) {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500" title="ยังไม่มีประวัติการพิมพ์ (นับตั้งแต่ 31 ต.ค. 69)"><Icon name="print" /> ยังไม่พิมพ์{label}</span>;
  }
  const last = rows[0];
  const changed = printQtyChanged({ qty: last.qty_at_print }, currentQty);
  return (
    <span ref={anchor} className="inline-flex shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} title="กดดูประวัติการพิมพ์"
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${changed ? "bg-amber-50 text-amber-800 ring-1 ring-amber-300" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"} hover:brightness-95`}>
        <Icon name={changed ? "warning" : "print"} />
        พิมพ์{label}แล้ว {fmt(rows.length)} ครั้ง · ล่าสุด {printWhen(last.printed_at)}{changed ? " · จำนวนเปลี่ยน" : ""} ▾
      </button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={360} maxWidth={520}>
        <div className="rounded-xl border border-slate-200 bg-white p-2 text-[12px] shadow-xl">
          <div className="mb-1.5 px-1 font-medium text-slate-700">ประวัติการพิมพ์{label} ({fmt(rows.length)} ครั้ง)</div>
          {changed && <div className="mb-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">จำนวนตอนนี้ {fmt(Number(currentQty))} ไม่ตรงกับตอนพิมพ์ล่าสุด ({fmt(Number(last.qty_at_print))}) — ใบที่ช่างถืออยู่เป็นฉบับเก่า ควรพิมพ์ใหม่</div>}
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="text-left text-[11px] text-slate-500"><tr>
                <th className="px-1 py-1 font-medium">#</th><th className="px-1 py-1 font-medium">เมื่อ</th><th className="px-1 py-1 font-medium">ใคร</th>
                <th className="px-1 py-1 font-medium">แบบ</th><th className="px-1 py-1 text-right font-medium">จำนวนตอนพิมพ์</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-1 py-1 text-slate-400">{rows.length - i}</td>
                    <td className="whitespace-nowrap px-1 py-1 tabular-nums text-slate-700">{printWhen(r.printed_at)}</td>
                    <td className="px-1 py-1 text-slate-700">{r.printed_by_name ?? "—"}</td>
                    <td className="px-1 py-1 text-slate-500">{PRINT_HOW_LABEL[r.variant] ?? r.variant}{r.batch_size > 1 ? ` · รวม ${fmt(r.batch_size)} ใบ` : ""}</td>
                    <td className="px-1 py-1 text-right tabular-nums text-slate-700">{r.qty_at_print == null ? "—" : fmt(Number(r.qty_at_print))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 px-1 text-[10px] text-slate-400">นับเมื่อกดพิมพ์ / Ctrl+P / เปิดไฟล์พิมพ์ (ยกเลิกในหน้าต่างพิมพ์ก็นับ) · เริ่มเก็บ 31 ต.ค. 69</div>
        </div>
      </FloatingDropdown>
    </span>
  );
}
