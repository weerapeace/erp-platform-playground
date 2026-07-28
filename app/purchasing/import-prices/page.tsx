"use client";

// ============================================================
// นำเข้า "ราคาวัตถุดิบต่อร้าน" จาก Excel/CSV
// ใช้ของกลาง ImportWizard (อ่านไฟล์ → จับคู่คอลัมน์ → ตรวจ → นำเข้า → ดาวน์โหลดแถวที่พลาด)
// commit ไปที่ /api/purchasing/import-prices → เขียนลงตารางร้านที่จำหน่าย (supplier_items)
// ============================================================
import { useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ImportWizard } from "@/components/import-wizard";
import { useAuth } from "@/components/auth";
import type { ImportSchema } from "@/lib/import";

const SCHEMA: ImportSchema = {
  entityType: "supplier_item_price",
  label: "ราคาวัตถุดิบต่อร้าน",
  uniqueKey: "sku_code",
  fields: [
    { key: "sku_code", label: "รหัสวัตถุดิบ", type: "text", required: true, aliases: ["sku", "code", "รหัส", "รหัสสินค้า", "รหัสวัตถุดิบ", "material code"] },
    { key: "shop", label: "ชื่อร้าน", type: "text", required: true, aliases: ["ร้าน", "ร้านค้า", "ผู้จำหน่าย", "supplier", "shop", "vendor", "seller"] },
    { key: "price", label: "ราคาต่อหน่วย", type: "number", required: true, aliases: ["ราคา", "ราคาต่อหน่วย", "unit price", "price", "ต้นทุน"] },
    { key: "currency", label: "สกุลเงิน (THB/RMB)", type: "text", aliases: ["สกุลเงิน", "currency", "หน่วยเงิน"] },
    { key: "supplier_sku", label: "รหัสของร้าน", type: "text", aliases: ["รหัสร้าน", "รหัสของร้าน", "supplier sku", "shop code", "item no"] },
    { key: "purchase_link", label: "ลิงก์สินค้า", type: "text", aliases: ["ลิงก์", "link", "url", "taobao", "ลิงค์"] },
    { key: "is_default", label: "ตั้งเป็นร้านหลัก ★", type: "text", aliases: ["ร้านหลัก", "default", "หลัก"] },
  ],
};

export default function ImportPricesPage() {
  const { user } = useAuth();
  const [done, setDone] = useState(0);

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="max-w-5xl mx-auto w-full flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">⬆ นำเข้าราคาวัตถุดิบจาก Excel</h1>
            <p className="text-sm text-slate-500 mt-1">ใส่ราคาหลายร้อยรายการทีเดียว — เข้าตารางร้านที่จำหน่ายของวัตถุดิบแต่ละตัว</p>
          </div>
          <Link href="/purchasing/dashboard"
            className="h-[38px] px-4 text-[13px] font-semibold rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center no-underline">
            ← กลับแดชบอร์ดจัดซื้อ
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full space-y-4">
        <div className="text-[12.5px] text-sky-900 bg-sky-50 border border-sky-200 rounded-[10px] px-3.5 py-3 space-y-1.5">
          <div><b>ไฟล์ต้องมีอย่างน้อย 3 คอลัมน์:</b> รหัสวัตถุดิบ · ชื่อร้าน · ราคา (ใส่เพิ่มได้: สกุลเงิน · รหัสของร้าน · ลิงก์สินค้า · ร้านหลัก)</div>
          <div>ชื่อหัวคอลัมน์ตั้งเป็นอะไรก็ได้ — ขั้นตอนที่ 2 ให้เลือกจับคู่เองได้ (กดโหลดไฟล์ตัวอย่างได้ในตัวช่วย)</div>
          <div><b>ชื่อร้านต้องมีในทะเบียนร้านก่อน</b> — ระบบไม่สร้างร้านใหม่ให้เอง (พิมพ์สลับคำ/มีวงเล็บได้ ระบบจับคู่ให้)</div>
          <div>ไม่ใส่สกุลเงิน → ร้านจีนเป็น ¥ ร้านไทยเป็น ฿ · แถวไหนพลาดจะบอกเหตุผลรายแถว + โหลดกลับมาแก้ได้</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[14px] shadow-sm p-4">
          <ImportWizard key={done} schema={SCHEMA} commitUrl="/api/purchasing/import-prices"
            actor={user?.email ?? undefined}
            onClose={() => setDone((n) => n + 1)} />
        </div>
      </div>
    </PlaygroundShell>
  );
}
