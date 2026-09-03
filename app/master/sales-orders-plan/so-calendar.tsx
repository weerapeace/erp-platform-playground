"use client";

/**
 * ปฏิทินใบสั่งขาย (ใช้ในหน้า /master/sales-orders-plan)
 * วางใบตาม "กำหนดส่ง" — ใบที่ยังไม่ใส่กำหนดส่ง วางตาม "วันที่สั่ง" แล้วติดเครื่องหมาย ~ ไว้
 * กดใบ = เปิดใบขายใบนั้น (ลิงก์ ?open=<id> ของกลาง)
 */
import { useMemo } from "react";
import { openLink } from "@/lib/open-param";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import type { SOListItem } from "@/app/api/sales-orders/route";

const money = (n: number) => "฿" + (Math.round(n) || 0).toLocaleString("th-TH");
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** วันที่ที่ใช้วางบนปฏิทิน — กำหนดส่งก่อน ไม่มีค่อยใช้วันที่สั่ง */
export const planDate = (o: SOListItem) => (o.expected_ship_date || o.order_date || "").slice(0, 10);

/** ปฏิทินรายเดือน — วางใบตามกำหนดส่ง (ไม่มี = วันที่สั่ง) · กดใบ = เปิดใบขายใบนั้น */
export function SoCalendar({ rows, cursor, onCursor }: { rows: SOListItem[]; cursor: Date; onCursor: (d: Date) => void }) {
  const byDay = useMemo(() => {
    const m = new Map<string, SOListItem[]>();
    for (const o of rows) { const k = planDate(o); if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(o); }
    return m;
  }, [rows]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = ymd(new Date());
  const monthKeys = cells.filter((d) => d.getMonth() === cursor.getMonth()).map(ymd);
  const monthOrders = monthKeys.flatMap((k) => byDay.get(k) ?? []);
  const monthTotal = monthOrders.reduce((n, o) => n + (Number(o.grand_total) || 0), 0);

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">‹</button>
        <span className="min-w-[150px] text-center text-sm font-semibold text-slate-700">{cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span>
        <button onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">›</button>
        <button onClick={() => { const d = new Date(); onCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">วันนี้</button>
        <span className="ml-auto text-[12px] text-slate-500">เดือนนี้ <b className="text-slate-700">{monthOrders.length}</b> ใบ · {money(monthTotal)}</span>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-slate-400 border-b border-slate-100 pb-1">
        {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-slate-100">
        {cells.map((d) => {
          const k = ymd(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const sum = list.reduce((n, o) => n + (Number(o.grand_total) || 0), 0);
          return (
            <div key={k} className={`min-h-[104px] border-b border-r border-slate-100 p-1 ${inMonth ? "bg-white" : "bg-slate-50/60"} ${k === today ? "ring-2 ring-inset ring-indigo-400" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${k === today ? "text-indigo-700" : inMonth ? "text-slate-600" : "text-slate-300"}`}>{d.getDate()}</span>
                {list.length > 0 && <span className="text-[9px] px-1 rounded bg-indigo-50 text-indigo-700">{list.length} · {money(sum)}</span>}
              </div>
              <div className="space-y-0.5 mt-0.5 max-h-[86px] overflow-y-auto scrollbar-hide">
                {list.map((o) => (
                  <a key={o.id} href={openLink("/sales-orders", o.id)}
                    title={`${o.so_number ?? ""} · ${o.customer_name ?? ""}\n${money(o.grand_total)} · ${soStatusLabel(o.status)}${o.expected_ship_date ? "" : "\n(ยังไม่ใส่กำหนดส่ง — วางตามวันที่สั่ง)"}`}
                    className="block rounded border border-slate-200 bg-white px-1 py-0.5 hover:border-indigo-300">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: soStatusColor(o.status) }} />
                      <span className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 truncate">{o.so_number ?? "—"}</span>
                      {!o.expected_ship_date && <span className="text-[9px] text-amber-500 shrink-0" title="ยังไม่ใส่กำหนดส่ง">~</span>}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">{o.customer_name ?? "—"}</div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        วางใบตาม <b>กำหนดส่ง</b> · ใบที่ยังไม่ใส่กำหนดส่ง (มีเครื่องหมาย <b>~</b>) วางไว้ตาม <b>วันที่สั่ง</b> ก่อน · กดใบเพื่อเปิดใบขายใบนั้น
      </p>
    </div>
  );
}
