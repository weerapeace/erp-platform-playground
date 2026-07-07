"use client";

/**
 * มุมมอง "อยากซื้อ" (wishlist / จำลองการซื้อ) — การ์ดของที่ติ๊ก want_to_buy
 * - รวมยอดถ้าซื้อทั้งหมด (ต่อเดือน/ปี ในหน่วยบาท)
 * - ปุ่ม "✅ ซื้อแล้ว" = จำลองการซื้อ → ย้ายเป็นรายการใช้งานจริง (want_to_buy=false, active=true)
 */
import { useMemo } from "react";
import {
  CYCLE_LABEL, fmtCost, fmtBaht, monthlyTHB, yearlyTHB,
  type SubSettings, type Subscription,
} from "@/lib/subscriptions";

export function WishlistView({ rows, settings, canEdit, onAdd, onEdit, onDelete, onPurchase }: {
  rows: Subscription[];
  settings: SubSettings;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (s: Subscription) => void;
  onDelete: (s: Subscription) => void;
  onPurchase: (s: Subscription) => void;
}) {
  const items = useMemo(() => rows.filter((r) => r.want_to_buy), [rows]);
  const totalMonthly = useMemo(() => items.reduce((s, x) => s + monthlyTHB(x, settings), 0), [items, settings]);
  const totalYearly = useMemo(() => items.reduce((s, x) => s + yearlyTHB(x, settings), 0), [items, settings]);

  return (
    <div className="space-y-4">
      {/* สรุปยอด */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div>
            <div className="text-[11px] text-slate-500">ถ้าซื้อทั้งหมด · ต่อเดือน</div>
            <div className="text-lg font-bold text-indigo-700 tabular-nums">{fmtBaht(totalMonthly)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">ต่อปี</div>
            <div className="text-lg font-bold text-violet-700 tabular-nums">{fmtBaht(totalYearly)}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">จำนวน</div>
            <div className="text-lg font-bold text-slate-700 tabular-nums">{items.length} รายการ</div>
          </div>
        </div>
        {canEdit && (
          <button onClick={onAdd} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">+ เพิ่มของอยากซื้อ</button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-14 text-center">
          <div className="text-4xl mb-2">🛒</div>
          <p className="text-sm text-slate-500">ยังไม่มีรายการอยากซื้อ</p>
          <p className="text-xs text-slate-400 mt-1">ติ๊ก &quot;🛒 อยากซื้อ&quot; ในฟอร์มรายการ หรือกดปุ่มเพิ่มด้านบน</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-100 bg-white shadow-sm p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-400">{s.category || "—"}</div>
                </div>
                <span className="text-lg">🛒</span>
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-slate-800 tabular-nums">{fmtCost(Number(s.cost), s.currency)}</span>
                <span className="text-xs text-slate-400">/ {CYCLE_LABEL[s.billing_cycle]}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                ≈ {fmtBaht(monthlyTHB(s, settings))}/เดือน · {fmtBaht(yearlyTHB(s, settings))}/ปี
              </div>
              {s.notes && <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{s.notes}</p>}

              {canEdit && (
                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-1.5">
                  <button onClick={() => onPurchase(s)} title="จำลองการซื้อ → ย้ายเป็นรายการใช้งาน"
                    className="flex-1 h-8 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">✅ ซื้อแล้ว</button>
                  <button onClick={() => onEdit(s)} title="แก้ไข"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                  <button onClick={() => onDelete(s)} title="ลบ"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
