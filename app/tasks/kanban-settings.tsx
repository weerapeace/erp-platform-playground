"use client";

// ============================================================
// ตั้งค่า Kanban + การ์ด (ของกลาง) — ใช้ซ้ำได้ทั้งในป๊อปแต่งหน้า + ปุ่ม ⚙️ บนบอร์ด + แท็บ Kanban เดี่ยว
// คุม: จัดกลุ่มคอลัมน์ + ข้อมูลที่โชว์บนการ์ด + กรอบสีแบรนด์
// ============================================================

import { useState } from "react";
import { useT } from "@/components/i18n";
import type { KanbanTheme } from "./overview-customizer";

// ตัวควบคุม (ใช้ฝังในป๊อปแต่งหน้า หรือใน popover ของปุ่ม ⚙️)
export function KanbanSettingsControls({ cfg, onChange }: { cfg: KanbanTheme; onChange: (c: KanbanTheme) => void }) {
  const t = useT();
  const set = (p: Partial<KanbanTheme>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">{t("จัดกลุ่มคอลัมน์ตาม", "Group columns by")}</div>
        <div className="flex flex-wrap gap-1.5">
          {([["status", t("สถานะ", "Status")], ["brand", t("แบรนด์", "Brand")], ["priority", t("ความสำคัญ", "Priority")], ["task_type", t("ประเภทงาน", "Task type")]] as const).map(([g, label]) => (
            <button key={g} onClick={() => set({ groupBy: g })} className={`h-8 px-3 text-sm rounded-lg border ${cfg.groupBy === g ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{t("ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่านั้น (สถานะผ่าน workflow)", "Drag a card across columns to change that value (status via workflow)")}</p>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">{t("ข้อมูลบนการ์ด", "Card fields")}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {([["cover", t("รูปปก", "Cover")], ["brand", t("แบรนด์", "Brand")], ["assignee", t("ผู้รับผิดชอบ", "Assignee")], ["due", t("กำหนดส่ง", "Due date")], ["priority", t("ความสำคัญ", "Priority")], ["progress", t("ความคืบหน้า", "Progress")], ["sku", t("สินค้า/SKU", "Product/SKU")], ["taskNo", t("เลขที่งาน", "Task no.")], ["brandBorder", t("กรอบสีตามแบรนด์", "Brand color border")], ["compact", t("การ์ดกะทัดรัด", "Compact card")]] as const).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={k === "sku" || k === "taskNo" ? cfg[k] !== false : !!cfg[k]} onChange={(e) => set({ [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ปุ่ม ⚙️ + popover (วางบนบอร์ดได้เลย)
export function KanbanSettings({ cfg, onChange, accent }: { cfg: KanbanTheme; onChange: (c: KanbanTheme) => void; accent?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title={t("ตั้งค่า Kanban / การ์ด", "Kanban / card settings")}
        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm">⚙️ {t("ตั้งค่า", "Settings")}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">⚙️ {t("ตั้งค่า Kanban", "Kanban settings")}</p>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-600 text-xs">✕</button>
            </div>
            <KanbanSettingsControls cfg={cfg} onChange={onChange} />
            <p className="text-[11px] text-slate-400 mt-2" style={accent ? { color: accent } : undefined}>{t("บันทึกอัตโนมัติ (ของฉัน)", "Saves automatically (yours)")}</p>
          </div>
        </>
      )}
    </div>
  );
}
