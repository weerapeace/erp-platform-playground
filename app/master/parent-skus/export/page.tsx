"use client";
/**
 * 📤 ส่งออกรายละเอียดสินค้า (หลายรุ่น → Excel) — /master/parent-skus/export
 *   ตัวหน้าอยู่ที่ components/spec-export · คู่มือ docs/spec-export.md
 */
import { SpecExportView } from "@/components/spec-export";
import { useAuth } from "@/components/auth";

export default function ParentSkuSpecExportPage() {
  const { can, permsReady } = useAuth();
  if (permsReady && !can("products.view")) {
    return <div className="p-8 text-center text-sm text-slate-500">คุณไม่มีสิทธิ์ดูข้อมูลสินค้า — ติดต่อผู้ดูแลระบบ</div>;
  }
  return <SpecExportView />;
}
