"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="supplier-items" moduleKey="supplier-items" title="Supplier Items" icon="🏷️" description="รายการสินค้าต่อ supplier — รหัส/ราคา/MOQ/lead time (Phase 2)" />;
}
