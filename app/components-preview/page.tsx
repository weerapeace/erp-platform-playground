"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
      <span className="flex-1 border-t border-slate-200" />
      <span>{children}</span>
      <span className="flex-1 border-t border-slate-200" />
    </h2>
  );
}

/* ─── Inline components (เหมือนกับ packages/ui แต่ inline สำหรับ preview) ─── */

type BtnVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type BtnSize = "sm" | "md" | "lg";

const variantCls: Record<BtnVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border-transparent shadow-sm",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-transparent",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent shadow-sm",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 border-transparent",
  outline: "bg-white text-slate-700 hover:bg-slate-50 border-slate-300",
};
const sizeCls: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-base gap-2.5 rounded-lg",
};
function Btn({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  children,
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium border transition-colors select-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]}`}
    >
      {loading && (
        <span className="animate-spin border-2 border-current border-t-transparent rounded-full w-3.5 h-3.5 mr-2" />
      )}
      {children}
    </button>
  );
}

const statusBadges = [
  { labelTH: "ร่าง", label: "Draft", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { labelTH: "ส่งแล้ว", label: "Submitted", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { labelTH: "รออนุมัติ", label: "Waiting Approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { labelTH: "อนุมัติแล้ว", label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { labelTH: "เสร็จสิ้น", label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { labelTH: "ปฏิเสธ", label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" },
  { labelTH: "ยกเลิก", label: "Cancelled", cls: "bg-red-50 text-red-600 border-red-200" },
  { labelTH: "บันทึกแล้ว", label: "Posted", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  { labelTH: "เก็บถาวร", label: "Archived", cls: "bg-slate-50 text-slate-500 border-slate-200" },
];

export default function ComponentsPreviewPage() {
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const handleValidate = () => {
    if (!inputValue.trim()) {
      setInputError("กรุณากรอกข้อมูล");
    } else {
      setInputError("");
    }
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Phase 4 — เสร็จแล้ว
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🧩 UI Components</h1>
        <p className="text-slate-500 mt-1">ชิ้นส่วน UI — คลังชิ้นส่วนกลางจาก packages/ui</p>
      </div>

      <div className="px-8 py-8 space-y-12 max-w-5xl">

        {/* Buttons */}
        <section>
          <SectionTitle>Button — ปุ่มกลาง</SectionTitle>

          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {/* Variants */}
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-3">Variants</p>
              <div className="flex flex-wrap gap-3">
                <Btn variant="primary">Primary</Btn>
                <Btn variant="secondary">Secondary</Btn>
                <Btn variant="danger">Danger</Btn>
                <Btn variant="ghost">Ghost</Btn>
                <Btn variant="outline">Outline</Btn>
              </div>
            </div>

            {/* Sizes */}
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-3">Sizes</p>
              <div className="flex items-center flex-wrap gap-3">
                <Btn size="sm">Small</Btn>
                <Btn size="md">Medium (default)</Btn>
                <Btn size="lg">Large</Btn>
              </div>
            </div>

            {/* States */}
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-3">States</p>
              <div className="flex flex-wrap gap-3">
                <Btn variant="primary" loading>กำลังบันทึก...</Btn>
                <Btn variant="primary" disabled>Disabled</Btn>
                <Btn variant="secondary" disabled>Disabled</Btn>
              </div>
            </div>

            {/* ERP Patterns */}
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 mb-3">ERP Patterns ที่ใช้บ่อย</p>
              <div className="flex flex-wrap gap-3">
                <Btn variant="primary">+ สร้างใหม่</Btn>
                <Btn variant="secondary">📥 Import</Btn>
                <Btn variant="secondary">📤 Export</Btn>
                <Btn variant="outline">⚙️ ตั้งค่า</Btn>
                <Btn variant="danger">🗑 ลบที่เลือก</Btn>
                <Btn variant="ghost">ยกเลิก</Btn>
              </div>
            </div>
          </div>
        </section>

        {/* Status Badges */}
        <section>
          <SectionTitle>StatusBadge — ป้ายสถานะ</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap gap-3">
              {statusBadges.map((b) => (
                <div key={b.label} className="flex flex-col items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${b.cls}`}
                  >
                    {b.labelTH}
                  </span>
                  <span className="text-xs text-slate-400">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Badges */}
        <section>
          <SectionTitle>Badge — ป้ายทั่วไป</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap gap-3 mb-4">
              {(["blue", "green", "yellow", "red", "purple", "gray"] as const).map((color) => {
                const colorMap = {
                  blue: "bg-blue-50 text-blue-700 border-blue-200",
                  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  yellow: "bg-amber-50 text-amber-700 border-amber-200",
                  red: "bg-red-50 text-red-700 border-red-200",
                  purple: "bg-purple-50 text-purple-700 border-purple-200",
                  gray: "bg-slate-100 text-slate-600 border-slate-200",
                };
                const dotMap = {
                  blue: "bg-blue-500", green: "bg-emerald-500", yellow: "bg-amber-500",
                  red: "bg-red-500", purple: "bg-purple-500", gray: "bg-slate-400",
                };
                return (
                  <span
                    key={color}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorMap[color]}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotMap[color]}`} />
                    {color}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">ใช้สำหรับ tag, label, category</p>
          </div>
        </section>

        {/* Input */}
        <section>
          <SectionTitle>Input — ช่องกรอกข้อมูล</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Normal */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input
                  className="w-full h-9 border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="กรอกชื่อสินค้า..."
                />
              </div>

              {/* Search */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">ค้นหา</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
                  <input
                    className="w-full h-9 border border-slate-300 rounded-lg pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ค้นหาสินค้า..."
                  />
                </div>
              </div>

              {/* Validation */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Validation Test</label>
                <input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleValidate}
                  className={`w-full h-9 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ${
                    inputError
                      ? "border-red-300 focus:ring-red-500"
                      : "border-slate-300 focus:ring-blue-500"
                  }`}
                  placeholder="ลองกด tab โดยไม่กรอก..."
                />
                {inputError && <p className="text-xs text-red-600">{inputError}</p>}
                {!inputError && <p className="text-xs text-slate-400">กด tab หรือ blur เพื่อ validate</p>}
              </div>

              {/* Disabled */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-400">Disabled</label>
                <input
                  disabled
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                  defaultValue="ไม่สามารถแก้ไขได้"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Loading / Empty / Error States */}
        <section>
          <SectionTitle>Loading / Empty / Error States</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Loading */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-700">กำลังโหลด...</p>
              <p className="text-xs text-slate-400 text-center">แสดงขณะดึงข้อมูลจาก Supabase</p>
            </div>

            {/* Empty */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-2xl">
                📭
              </div>
              <p className="text-sm font-medium text-slate-700">ไม่พบข้อมูล</p>
              <p className="text-xs text-slate-400 text-center">ลองเปลี่ยนคำค้นหา หรือสร้างรายการใหม่</p>
              <button className="text-xs text-blue-600 hover:underline">+ สร้างใหม่</button>
            </div>

            {/* Error */}
            <div className="bg-white rounded-xl border border-red-200 p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-2xl">
                ⚠️
              </div>
              <p className="text-sm font-medium text-red-700">เกิดข้อผิดพลาด</p>
              <p className="text-xs text-red-500 text-center">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</p>
              <button className="text-xs text-blue-600 hover:underline">🔄 ลองใหม่</button>
            </div>
          </div>
        </section>

        {/* Toast */}
        <section>
          <SectionTitle>Toast — การแจ้งเตือน</SectionTitle>
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            {[
              { icon: "✅", color: "bg-emerald-50 border-emerald-200 text-emerald-800", msg: "บันทึกสำเร็จแล้ว" },
              { icon: "❌", color: "bg-red-50 border-red-200 text-red-800", msg: "เกิดข้อผิดพลาด กรุณาลองใหม่" },
              { icon: "⚠️", color: "bg-amber-50 border-amber-200 text-amber-800", msg: "คุณมีรายการที่ยังไม่ได้บันทึก" },
              { icon: "ℹ️", color: "bg-blue-50 border-blue-200 text-blue-800", msg: "Import เสร็จสิ้น: เพิ่ม 48 รายการ" },
            ].map((t, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${t.color}`}
              >
                <span>{t.icon}</span>
                <span className="flex-1">{t.msg}</span>
                <span className="text-xs opacity-60 cursor-pointer">✕</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </PlaygroundShell>
  );
}
