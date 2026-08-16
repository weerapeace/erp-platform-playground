"use client";

/**
 * DeliveryAlert — แถบเตือน "งวดส่งที่เลยกำหนดแต่ยังไม่ได้ส่ง" บนหน้าแรก
 *
 * ดึงจาก /api/mo/delivery-plan?view=alerts (งวดที่ยังไม่ติ๊ก "ส่งแล้ว")
 *   · แดง = เลยกำหนดแล้ว   · ส้ม = ต้องส่งวันนี้
 * ไม่มีอะไรค้าง = ไม่ขึ้นอะไรเลย (ไม่กินที่หน้าแรก)
 *
 * กดรายการ = เปิดปฏิทินนัดส่งลูกค้าในบอร์ดจ่ายงาน
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Row = {
  id: string; mo_id: string; mo_no: string; due_date: string; qty: number;
  product_sku: string | null; product_name: string | null;
  dn_number: string | null; overdue: boolean; today: boolean;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const thDate = (v: string) => new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function DeliveryAlert() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        // days=0 → เอาเฉพาะที่ถึงกำหนดแล้ว (เลยกำหนด + วันนี้) ไม่กวนด้วยของอนาคต
        const r = await apiFetch(`/api/mo/delivery-plan?view=alerts&days=0&today=${todayLocal()}`);
        const j = await r.json();
        if (!cancel && !j.error) setRows((j.data ?? []) as Row[]);
      } catch { /* เงียบ — แถบนี้เป็นของเสริม ไม่ควรทำหน้าแรกพัง */ }
    })();
    return () => { cancel = true; };
  }, []);

  if (rows.length === 0) return null;
  const late = rows.filter((r) => r.overdue);
  const due = rows.filter((r) => r.today);
  const lateQty = late.reduce((n, r) => n + (Number(r.qty) || 0), 0);
  const dueQty = due.reduce((n, r) => n + (Number(r.qty) || 0), 0);

  return (
    <div className={`rounded-xl border ${late.length > 0 ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"} px-4 py-3`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className={`text-sm font-semibold ${late.length > 0 ? "text-rose-800" : "text-amber-800"}`}>
          🚚 งวดส่งที่ยังไม่ได้ส่ง
          {late.length > 0 && <> · <b>เลยกำหนด {late.length} งวด</b> ({fmt(lateQty)} ชิ้น)</>}
          {due.length > 0 && <> · ต้องส่งวันนี้ {due.length} งวด ({fmt(dueQty)} ชิ้น)</>}
        </span>
        <span className="text-xs text-slate-500 shrink-0">{open ? "ซ่อน ▲" : "ดูรายการ ▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
          {rows.map((r) => (
            <a key={r.id} href="/master/work-board" className="flex items-center gap-2 rounded-lg bg-white/80 border border-white px-2 py-1 hover:border-slate-300">
              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${r.overdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                {r.overdue ? "เลยกำหนด" : "วันนี้"} {thDate(r.due_date)}
              </span>
              <span className="text-[12px] font-medium text-slate-700 truncate">{r.product_sku ?? "—"}</span>
              <span className="text-[11px] text-slate-400 truncate hidden sm:inline">{r.mo_no}</span>
              <span className="ml-auto text-[12px] font-semibold tabular-nums text-slate-700 shrink-0">{fmt(r.qty)} ชิ้น</span>
              {r.dn_number && <span className="text-[10px] text-emerald-700 shrink-0">🧾 {r.dn_number}</span>}
            </a>
          ))}
          <p className="text-[11px] text-slate-500 pt-1">กดรายการ = ไปที่บอร์ดจ่ายงาน (มุมมองปฏิทิน) · ส่งของแล้วอย่าลืมติ๊ก “ส่งแล้ว” ที่งวดนั้น</p>
        </div>
      )}
    </div>
  );
}
