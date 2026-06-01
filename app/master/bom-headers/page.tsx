"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="bom-headers" moduleKey="bom-headers" title="BOM (สูตรผลิต)" icon="📐" description="สูตรการผลิตต่อสินค้า + เวอร์ชัน (Phase 4)" />;
}
