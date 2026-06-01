"use client";
import { MasterPage } from "@/components/master-page";
export default function Page() {
  return <MasterPage apiPath="qc-inspections" moduleKey="qc-inspections" title="QC Inspections" icon="✅" description="การตรวจคุณภาพ — pass/fail/rework (Phase 9)" />;
}
