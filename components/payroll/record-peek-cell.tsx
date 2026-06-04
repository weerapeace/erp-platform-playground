"use client";

/**
 * RecordPeekCell — ปุ่มที่กดแล้วเปิด drawer ดูข้อมูลที่เกี่ยวกับพนักงานในหน้าเดียว (ไม่เด้งออก)
 * ใช้ซ้ำได้: ค่าประจำ / เงินเดือน / สลิป (ดึงผ่าน view API กรองด้วย employee_id, อ่านอย่างเดียว)
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

export function RecordPeekCell({
  label, btnClass, title, employeeId, employeeCode, employeeName, apiPath, renderRow, empty = "ไม่มีข้อมูล",
}: {
  label: string;
  btnClass?: string;
  title: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  apiPath: string;
  renderRow: (row: Record<string, unknown>) => React.ReactNode;
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || rows || err) return;
    const flt = encodeURIComponent(JSON.stringify({ employee_id: { type: "text", value: employeeId } }));
    apiFetch(`${apiPath}?include_inactive=true&limit=200&filters=${flt}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setRows((j.data ?? []) as Record<string, unknown>[]); })
      .catch(() => setErr("โหลดไม่ได้"));
  }, [open, rows, err, employeeId, apiPath]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={btnClass ?? "text-xs px-2 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 whitespace-nowrap"}>
        {label}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-400">{title}</div>
                <div className="font-semibold text-slate-800">{employeeCode}{employeeName ? ` · ${employeeName}` : ""}</div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="ปิด">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div>}
              {!rows && !err && <div className="text-center text-slate-400 py-10 text-sm">กำลังโหลด...</div>}
              {rows && rows.length === 0 && <div className="text-center text-slate-400 py-10 text-sm">{empty}</div>}
              {rows?.map((r, i) => <div key={String(r.id ?? i)}>{renderRow(r)}</div>)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
