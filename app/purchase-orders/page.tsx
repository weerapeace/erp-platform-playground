"use client";

// ระบบจัดซื้อชุดเก่า (ตาราง erp_playground_purchase_orders) — ปิดแล้ว 2026-11-07 ตามที่เจ้าของเลือก
// ไม่เคยมีใบจริง (0 ใบ) · ระบบจริง = /purchasing/po-list (purchase_orders_v2) · ข้อมูลเดิมยังอยู่ในฐานข้อมูล
// หน้าพิมพ์เดิม /print/purchase-order/[id] ยังเปิดได้ (แม่แบบเอกสารใช้)
import { LegacyMovedNotice } from "@/components/legacy-moved";

export default function LegacyPurchaseOrdersPage() {
  return <LegacyMovedNotice title="ใบสั่งซื้อ (ระบบเก่า)" to="/purchasing/po-list" toLabel="รายการใบสั่งซื้อ" />;
}
