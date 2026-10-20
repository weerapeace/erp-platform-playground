"use client";

// ============================================================
// ตั้งค่า Kanban + การ์ด (ของกลาง) — ใช้ซ้ำได้ทั้งในป๊อปแต่งหน้า + ปุ่ม ⚙️ บนบอร์ด + แท็บ Kanban เดี่ยว
// คุม: จัดกลุ่มคอลัมน์ + ข้อมูลที่โชว์บนการ์ด + กรอบสีแบรนด์
// มุมมอง WIP (wip): ไม่มีจัดกลุ่ม (คอลัมน์ตายตัว) แต่เลือกจำนวนคอลัมน์การ์ดในช่องใหญ่ 1–3 แทน
// ============================================================

import { useState } from "react";
import { useT } from "@/components/i18n";
import type { KanbanTheme, WipCols } from "./overview-customizer";

// ปุ่มเลือกจำนวนคอลัมน์การ์ดในช่องใหญ่ของมุมมอง WIP (1–6 · มากขึ้น = การ์ดเล็กลง) — ใช้ทั้งบนบอร์ดและในตั้งค่า
export function WipColsControl({ value, onChange, accent }: { value: WipCols; onChange: (v: WipCols) => void; accent?: string }) {
  const t = useT();
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" title={t("จำนวนคอลัมน์การ์ดในช่อง \"กำลังดำเนินการ\"", "Card columns in the in-progress lane")}>
      <span className="px-1.5 text-[11px] text-slate-400">{t("คอลัมน์", "Cols")}</span>
      {([1, 2, 3, 4, 5, 6] as const).map((n) => {
        const on = value === n;
        return <button key={n} type="button" onClick={() => onChange(n)} style={on ? { background: accent || "#7c3aed" } : undefined}
          className={`h-7 min-w-[28px] px-2 rounded-md text-xs font-medium transition-colors ${on ? "text-white" : "text-slate-500 hover:text-slate-700"}`}>{n}</button>;
      })}
    </div>
  );
}

// ตัวควบคุม (ใช้ฝังในป๊อปแต่งหน้า หรือใน popover ของปุ่ม ⚙️)
export function KanbanSettingsControls({ cfg, onChange, wip }: { cfg: KanbanTheme; onChange: (c: KanbanTheme) => void; wip?: boolean }) {
  const t = useT();
  const set = (p: Partial<KanbanTheme>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      {wip ? (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">{t("การ์ดในช่อง \"กำลังดำเนินการ\"", "Cards in the in-progress lane")}</div>
          <WipColsControl value={cfg.wipCols ?? 2} onChange={(v) => set({ wipCols: v })} />
          <p className="text-[11px] text-slate-400 mt-1">{t("ช่องใหญ่ = รอคิว + พร้อมทำ + กำลังทำ · รอตรวจ / ต้องแก้ เป็นช่องเล็ก · ถ้ามีงานต้องแก้ ช่องนั้นขึ้นหน้าสุด", "Big lane = queued + ready + in progress · review / revision are narrow lanes · revision moves first when it has tasks")}</p>
        </div>
      ) : (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">{t("จัดกลุ่มคอลัมน์ตาม", "Group columns by")}</div>
          <div className="flex flex-wrap gap-1.5">
            {([["status", t("สถานะ", "Status")], ["brand", t("แบรนด์", "Brand")], ["priority", t("ความสำคัญ", "Priority")], ["task_type", t("ประเภทงาน", "Task type")]] as const).map(([g, label]) => (
              <button key={g} onClick={() => set({ groupBy: g })} className={`h-8 px-3 text-sm rounded-lg border ${cfg.groupBy === g ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{t("ลากการ์ดข้ามคอลัมน์ = เปลี่ยนค่านั้น (สถานะผ่าน workflow)", "Drag a card across columns to change that value (status via workflow)")}</p>
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">{t("ข้อมูลบนการ์ด", "Card fields")}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {/* WIP ไม่โชว์บรรทัดสินค้า/SKU บนการ์ด (เจ้าของเลือก) → ซ่อนตัวเลือกนี้ */}
          {([["cover", t("รูปปก", "Cover")], ["brand", t("แบรนด์", "Brand")], ["assignee", t("ผู้รับผิดชอบ", "Assignee")], ["due", t("กำหนดส่ง", "Due date")], ["priority", t("ความสำคัญ", "Priority")], ["taskType", t("ประเภทงาน", "Task type")], ["progress", t("ความคืบหน้า", "Progress")], ["sku", t("สินค้า/SKU", "Product/SKU")], ["taskNo", t("เลขที่งาน", "Task no.")], ["brandBorder", t("กรอบสีตามแบรนด์", "Brand color border")], ["compact", t("การ์ดกะทัดรัด", "Compact card")]] as const).filter(([k]) => !(wip && k === "sku")).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={k === "sku" || k === "taskNo" || k === "taskType" ? cfg[k] !== false : !!cfg[k]} onChange={(e) => set({ [k]: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />{label}
            </label>
          ))}
        </div>
      </div>
      {cfg.cover && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-slate-500">{t("รูปปก", "Cover image")}</div>
          <SegRow label={t("ตำแหน่ง", "Position")} value={cfg.coverPos ?? "top"} onChange={(v) => set({ coverPos: v })}
            options={[["top", t("บนการ์ด", "On top")], ["side", t("ข้างซ้าย", "Left side")]]} />
          <SegRow label={t("การแสดง", "Fit")} value={cfg.coverFit ?? "cover"} onChange={(v) => set({ coverFit: v })}
            options={[["cover", t("ครอปเต็มกรอบ", "Crop to fill")], ["contain", t("เห็นทั้งรูป", "Whole image")]]} />
          <SegRow label={t("ขนาด", "Size")} value={cfg.coverSize ?? "auto"} onChange={(v) => set({ coverSize: v })}
            options={[["auto", t("อัตโนมัติ", "Auto")], ["sm", t("เล็ก", "S")], ["md", t("กลาง", "M")], ["lg", t("ใหญ่", "L")], ["square", t("จัตุรัส", "Square")]]} />
        </div>
      )}
      <SegRow label={t("ขนาดการ์ด", "Card size")} value={cfg.cardScale ?? "md"} onChange={(v) => set({ cardScale: v })}
        options={[["sm", t("เล็ก", "Small")], ["md", t("ปกติ", "Normal")], ["lg", t("ใหญ่", "Large")]]} />
      <SegRow label={t("ระยะห่างการ์ด", "Card spacing")} value={cfg.cardGap ?? "normal"} onChange={(v) => set({ cardGap: v })}
        options={[["tight", t("ชิด", "Tight")], ["normal", t("ปกติ", "Normal")], ["loose", t("ห่าง", "Loose")], ["xloose", t("ห่างมาก", "Extra")]]} />
    </div>
  );
}

// แถวปุ่มเลือก 1 ค่า (ใช้ในตั้งค่ารูปปก/ระยะห่าง)
function SegRow<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-slate-400 w-20 shrink-0">{label}</span>
      <div className="inline-flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`h-7 px-2 rounded-md border text-xs ${value === v ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// ปุ่ม ⚙️ + popover (วางบนบอร์ดได้เลย)
export function KanbanSettings({ cfg, onChange, accent, wip }: { cfg: KanbanTheme; onChange: (c: KanbanTheme) => void; accent?: string; wip?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title={t("ตั้งค่า Kanban / การ์ด", "Kanban / card settings")}
        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm">⚙️ {t("ตั้งค่า", "Settings")}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-80 max-h-[75vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">⚙️ {wip ? t("ตั้งค่า WIP", "WIP settings") : t("ตั้งค่า Kanban", "Kanban settings")}</p>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-600 text-xs">✕</button>
            </div>
            <KanbanSettingsControls cfg={cfg} onChange={onChange} wip={wip} />
            <p className="text-[11px] text-slate-400 mt-2" style={accent ? { color: accent } : undefined}>{t("บันทึกอัตโนมัติ (ของฉัน)", "Saves automatically (yours)")}</p>
          </div>
        </>
      )}
    </div>
  );
}
