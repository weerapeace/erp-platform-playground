"use client";

// ระบบจัดซื้อชุดเก่า (ตาราง erp_playground_purchase_requests) — ปิดแล้ว 2026-11-07 ตามที่เจ้าของเลือก
// ไม่มีใครใช้ตั้งแต่ 29 พ.ค. (1 ใบ) · ระบบจริง = /purchasing (purchase_requests_v2) · ข้อมูลเดิมยังอยู่ในฐานข้อมูล
// หน้าพิมพ์เดิม /print/purchase-request/[id] ยังเปิดได้ (แม่แบบเอกสารใช้)
import { LegacyMovedNotice } from "@/components/legacy-moved";

export default function LegacyPurchaseRequestsPage() {
  return <LegacyMovedNotice title="ใบขอซื้อ (ระบบเก่า)" to="/purchasing" toLabel="จัดซื้อ (ขอซื้อ)" />;
}
