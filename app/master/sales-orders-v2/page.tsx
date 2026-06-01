"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="sales-orders-v2" moduleKey="sales-orders-v2" title="Sales Orders (v2)" icon="🧾" description="ใบสั่งขาย — ยืนยัน=จอง, ส่ง=ตัด stock (Phase 5)" />;
}
