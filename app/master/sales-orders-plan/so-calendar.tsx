"use client";

/**
 * ปฏิทินใบขาย (ใช้ในหน้า /master/sales-orders-plan)
 * เป็นแค่ตัวแปลงข้อมูล → ใช้ปฏิทินกลาง <DocCalendar> วาดจริง (แก้หน้าตาที่ของกลางที่เดียว)
 * วางใบตาม "กำหนดส่ง" — ใบที่ยังไม่ใส่กำหนดส่ง วางตาม "วันที่สั่ง" แล้วติดเครื่องหมาย ~ ไว้
 */
import { openLink } from "@/lib/open-param";
import { soStatusLabel, soStatusColor } from "@/lib/so-status";
import { DocCalendar, type CalDoc } from "@/components/doc-calendar";
import type { SOListItem } from "@/app/api/sales-orders/route";

const money = (n: number) => "฿" + (Math.round(n) || 0).toLocaleString("th-TH");
/** วันที่ที่ใช้วางบนปฏิทิน — กำหนดส่งก่อน ไม่มีค่อยใช้วันที่สั่ง */
export const planDate = (o: SOListItem) => (o.expected_ship_date || o.order_date || "").slice(0, 10);

export function SoCalendar({ rows, cursor, onCursor }: { rows: SOListItem[]; cursor: Date; onCursor: (d: Date) => void }) {
  const docs: CalDoc[] = rows
    .filter((o) => planDate(o))
    .map((o) => ({
      id: o.id,
      no: o.so_number ?? null,
      sub: o.customer_name ?? null,
      date: planDate(o),
      amount: Number(o.grand_total) || 0,
      color: soStatusColor(o.status),
      approx: !o.expected_ship_date,
      href: openLink("/sales-orders", o.id),
      title: `${o.so_number ?? ""} · ${o.customer_name ?? ""}\n${money(Number(o.grand_total) || 0)} · ${soStatusLabel(o.status)}${o.expected_ship_date ? "" : "\n(ยังไม่ใส่กำหนดส่ง — วางตามวันที่สั่ง)"}`,
    }));

  return (
    <DocCalendar docs={docs} cursor={cursor} onCursor={onCursor}
      hint="วางใบตาม กำหนดส่ง · ใบที่ยังไม่ใส่กำหนดส่ง (มีเครื่องหมาย ~) วางไว้ตาม วันที่สั่ง ก่อน · กดใบเพื่อเปิดใบขายใบนั้น" />
  );
}
