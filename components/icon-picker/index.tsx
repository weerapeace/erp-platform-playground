"use client";

/**
 * IconPicker — ของกลาง: เลือกไอคอน (emoji) จากชุดพื้นฐาน หรือพิมพ์/วางเอง
 * ใช้ทุกที่ที่ต้องตั้งไอคอน (ตั้งค่าโมดูล, ตัวช่วยสร้างโมดูล ฯลฯ)
 *
 * <IconPicker value={icon} onChange={setIcon} />
 */
import { useState } from "react";

// ชุดไอคอนพื้นฐานสำหรับ ERP/ธุรกิจ (จัดกลุ่มคร่าว ๆ)
const PRESET_ICONS = [
  // ทั่วไป / เอกสาร
  "🧩", "📦", "🏷️", "🗂️", "📁", "📋", "📝", "🧾", "📄", "🗃️", "🗄️", "📚", "🔖", "📌",
  // ค้าขาย / เงิน
  "🛒", "🛍️", "💰", "💵", "💳", "🧮", "📊", "📈", "📉", "🏦", "🪙", "🧷",
  // คน / คู่ค้า
  "👤", "👥", "🧑‍💼", "🤝", "📇", "📞", "✉️", "📧",
  // สินค้า / แฟชั่น
  "👜", "👛", "🎒", "👟", "👕", "👗", "🧥", "💎", "⌚", "🕶️",
  // คลัง / ผลิต / ขนส่ง
  "🏢", "🏬", "🏭", "🚚", "🚛", "📮", "🔧", "🔩", "🧰", "⚙️", "🧱", "🪚",
  // เวลา / สถานะ
  "📅", "⏰", "✅", "☑️", "⭐", "🔔", "🚩", "🎯",
  // สื่อ / อื่น ๆ
  "🎨", "🖼️", "📷", "🎬", "🧪", "🔬", "🩺", "💊", "🌡️", "🍱",
];

export function IconPicker({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const applyCustom = () => {
    const v = custom.trim();
    if (v) { onChange(v); setCustom(""); setOpen(false); }
  };

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} title="เลือกไอคอน"
        className="h-10 w-14 inline-flex items-center justify-center text-xl border border-slate-200 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {value || "🧩"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl p-3">
            <div className="text-[11px] text-slate-400 mb-1.5">เลือกไอคอนพื้นฐาน</div>
            <div className="grid grid-cols-8 gap-1 max-h-44 overflow-y-auto">
              {PRESET_ICONS.map((ic) => (
                <button key={ic} type="button" onClick={() => { onChange(ic); setOpen(false); }}
                  className={`h-8 w-8 grid place-items-center text-lg rounded hover:bg-blue-50 ${value === ic ? "bg-blue-100 ring-1 ring-blue-400" : ""}`}>
                  {ic}
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-400 mb-1">หรือพิมพ์/วางไอคอนเอง</div>
              <div className="flex gap-1.5">
                <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={4}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
                  placeholder="เช่น 🦄 หรือ A" className="flex-1 h-8 px-2 text-base border border-slate-200 rounded-md" />
                <button type="button" onClick={applyCustom} disabled={!custom.trim()}
                  className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">ใช้</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
