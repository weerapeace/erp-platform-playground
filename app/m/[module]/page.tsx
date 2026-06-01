"use client";

/**
 * C2: Catch-all master page — /m/<module_key>
 * เปิดหน้า master ของ "module ใดก็ได้" ที่ลงทะเบียนใน erp_modules
 * → table ที่สร้างจากเว็บได้หน้าใช้งานทันที โดยไม่ต้องสร้างไฟล์ page
 */
import { useParams } from "next/navigation";
import { MasterPage } from "@/components/master-page";

export default function GenericModulePage() {
  const params = useParams();
  const moduleKey = String(params.module ?? "");
  if (!moduleKey) return <div className="p-10 text-center text-slate-400">ไม่พบโมดูล</div>;
  return (
    <MasterPage
      apiPath={moduleKey}
      moduleKey={moduleKey}
      title={moduleKey}
      icon="🧩"
      description="โมดูลที่สร้างจากเว็บ — จัด field/layout ได้ที่ปุ่มด้านบน"
    />
  );
}
