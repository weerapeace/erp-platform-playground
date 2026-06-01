"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="stock-counts" moduleKey="stock-counts" title="Stock Count" icon="🔢" description="รอบนับสต็อก — นับ → review → approve (Phase 3)" />;
}
