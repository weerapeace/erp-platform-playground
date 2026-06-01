"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="bom-lines" moduleKey="bom-lines" title="BOM Lines" icon="📋" description="บรรทัดวัตถุดิบใน BOM (slot/วัสดุ/จำนวน — Phase 4)" />;
}
