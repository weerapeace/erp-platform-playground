"use client";

/**
 * ข้อมูลตั้งต้น (Master Lookups) — /master/lookups
 *
 * หน้าเดียว หลายแท็บ — แต่ละแท็บ = ตารางอ้างอิงที่ใช้ในสินค้า (Parent SKU/SKU)
 * ใช้ตารางกลาง (MasterPage/DataTable) ทุกแท็บ ผ่าน API กลาง master-v2
 * (โมดูลลงทะเบียนใน erp_modules + field registry แล้ว)
 */

import { useState } from "react";
import { ShellPresentContext } from "@/components/playground-shell";
import { MasterPage } from "@/components/master-page";

const TABS: { key: string; title: string; icon: string }[] = [
  { key: "brands",               title: "แบรนด์ (Brands)",            icon: "🏷️" },
  { key: "product_categories",   title: "หมวดหมู่สินค้า",             icon: "🗂️" },
  { key: "collections",          title: "คอลเลกชัน (Collections)",    icon: "📚" },
  { key: "platform_categories",  title: "หมวดแพลตฟอร์ม",              icon: "🛒" },
  { key: "parcel_sizes",         title: "ขนาดพัสดุ",                  icon: "📦" },
  { key: "size_descriptions",    title: "คำอธิบายขนาด",               icon: "📐" },
  { key: "special_descriptions", title: "คำอธิบายพิเศษ",              icon: "📝" },
  { key: "product_families",     title: "ประเภทสินค้า (แท็ก)",        icon: "🏷️" },
];

export default function MasterLookupsPage() {
  const [active, setActive] = useState(TABS[0].key);
  const cur = TABS.find((t) => t.key === active) ?? TABS[0];

  // หมายเหตุ: app/master/layout.tsx ครอบ PlaygroundShell ให้แล้ว → ห้ามครอบซ้ำ (กัน shell ซ้อน)
  return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="bg-white border-b border-slate-200 px-6 pt-4">
          <h1 className="text-xl font-bold text-slate-900">🧱 ข้อมูลตั้งต้น</h1>
          <p className="text-sm text-slate-500 mt-0.5">จัดการตารางอ้างอิงที่ใช้กับสินค้า — เลือกแท็บด้านล่าง</p>
          <div className="flex gap-1 mt-3 -mb-px overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setActive(t.key)}
                className={`h-10 px-4 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  active === t.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                {t.icon} {t.title}
              </button>
            ))}
          </div>
        </div>
        {active === "product_families" && (
          <div className="px-6 pt-3">
            <a href="/admin/product-families"
              className="inline-flex items-center gap-1.5 text-sm px-3 h-8 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100">
              🧱 ตั้งค่าประเภทสินค้า (กลุ่ม + แท็ก + เทมเพลต)
            </a>
          </div>
        )}
        <div className="flex-1">
          {/* MasterPage ไม่เรนเดอร์ shell ซ้อน (อยู่ใต้ shell นี้แล้ว) */}
          <ShellPresentContext.Provider value={true}>
            <MasterPage key={cur.key} apiPath={cur.key} moduleKey={cur.key} title={cur.title} icon={cur.icon} />
          </ShellPresentContext.Provider>
        </div>
      </div>
  );
}
