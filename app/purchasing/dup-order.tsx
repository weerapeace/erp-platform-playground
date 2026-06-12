"use client";

// ============================================================
// เตือน "สั่งซ้ำ" — ป้ายบนการ์ด + รายการคำสั่งซื้อที่ยังค้าง (ในป๊อปยืนยัน)
// ข้อมูลจาก /api/purchasing/sku-open-orders (เช็คใบขอซื้อที่ยังค้างของ SKU)
// ไม่บล็อก — แค่เตือน + โชว์รายการเก่า (วันที่/จำนวน/ร้าน/สถานะ)
// ============================================================

import { formatDate } from "@/lib/date";

export type OpenOrder = { pr_no: string; date: string | null; qty: number; uom: string; seller_name: string; status: string };

const STATUS_TH: Record<string, string> = {
  waiting: "รออนุมัติ", approved: "อนุมัติแล้ว", rfq_created: "ออกใบสั่งซื้อแล้ว",
  confirmed: "ยืนยันแล้ว", partial: "รับบางส่วน",
};
const statusLabel = (s: string) => STATUS_TH[s] ?? s;

// ป้ายเล็กบนการ์ด — โชว์เมื่อมีของค้าง
export function DupOrderBadge({ orders, className }: { orders: OpenOrder[] | undefined; className?: string }) {
  if (!orders || orders.length === 0) return null;
  return (
    <span title={`เคยสั่ง ${orders.length} รายการที่ยังค้างอยู่`}
      className={`px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-medium shadow-sm ${className ?? ""}`}>
      ⚠️ เคยสั่ง {orders.length}
    </span>
  );
}

// กล่องรายการของซ้ำ (ในป๊อปยืนยันใส่ตะกร้า) — ไม่บล็อก แค่เตือน
export function DupOrderList({ orders }: { orders: OpenOrder[] | undefined }) {
  if (!orders || orders.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5">
      <div className="text-sm font-medium text-amber-800">⚠️ สินค้านี้มีคำสั่งซื้อที่ยังค้างอยู่ {orders.length} รายการ — ยังสั่งเพิ่มได้</div>
      <div className="mt-1.5 max-h-40 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-amber-700/70 text-left">
              <th className="font-normal py-0.5 pr-2">วันที่สั่ง</th>
              <th className="font-normal py-0.5 pr-2">เลขใบ</th>
              <th className="font-normal py-0.5 pr-2 text-right">จำนวน</th>
              <th className="font-normal py-0.5 pr-2">ร้าน</th>
              <th className="font-normal py-0.5">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={i} className="border-t border-amber-200/60 text-amber-900">
                <td className="py-0.5 pr-2 whitespace-nowrap">{o.date ? formatDate(o.date) : "—"}</td>
                <td className="py-0.5 pr-2 font-mono text-[11px]">{o.pr_no || "—"}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums">{o.qty.toLocaleString()} {o.uom}</td>
                <td className="py-0.5 pr-2 truncate max-w-[120px]">{o.seller_name}</td>
                <td className="py-0.5 whitespace-nowrap">{statusLabel(o.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
