"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="stock-adjustments" moduleKey="stock-adjustments" title="Stock Adjustments" icon="⚖️" description="ปรับยอดสต็อก (ต้อง approve ก่อน — Phase 3)" />;
}
