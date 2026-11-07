"use client";

// สินค้าชุดทดลอง (ตาราง erp_playground_products 100 ตัว) — ปิดแล้ว 2026-11-07 ตามที่เจ้าของเลือก
// ไม่มีใครแก้ตั้งแต่ 29 พ.ค. · สินค้าจริง = /master/skus (skus_v2) · ข้อมูลเดิมยังอยู่ในฐานข้อมูล
import { LegacyMovedNotice } from "@/components/legacy-moved";

export default function LegacyProductsCrudPage() {
  return <LegacyMovedNotice title="สินค้า (ชุดทดลอง)" to="/master/skus" toLabel="สินค้า (SKU)" />;
}
