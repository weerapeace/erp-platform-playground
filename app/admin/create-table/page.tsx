"use client";

/**
 * สร้างโมดูล/ตารางใหม่จากเว็บ (/admin/create-table)
 * ใช้ตัวช่วยกลาง CreateModuleWizard (3 ขั้น + แม่แบบสำเร็จรูป)
 * เมนูซ้าย (Settings → "สร้างโมดูลใหม่") ชี้มาที่หน้านี้
 */
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { CreateModuleWizard } from "@/components/create-module-wizard";

export default function CreateTablePage() {
  const canCreate = usePermission("products.create");
  const [open, setOpen] = useState(true);

  if (!canCreate) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.create" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-lg mx-auto px-6 py-12 text-center">
        <div className="text-4xl mb-2">🧩</div>
        <h1 className="text-2xl font-semibold text-slate-800">สร้างโมดูลใหม่</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">สร้างตารางจริงใน Supabase + เลือกช่องสำเร็จรูป แล้วได้หน้าจัดการทันที</p>
        <button onClick={() => setOpen(true)}
          className="h-10 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          ➕ เปิดตัวช่วยสร้างโมดูล
        </button>
      </div>
      {open && <CreateModuleWizard onClose={() => setOpen(false)} />}
    </PlaygroundShell>
  );
}
