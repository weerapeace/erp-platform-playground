"use client";

/**
 * 🔣 พรีวิวระบบไอคอนกลาง (components/icon + lib/icon-registry) — ไม่ต้องล็อกอิน/ไม่ต่อ DB
 *   สลับโหมด อีโมจิ / ไอคอนเส้น / ไอคอนเส้น+สี · เมนูข้างตัวอย่าง (อีโมจิจริงจากเมนู) · ป๊อปเลือกไอคอน
 *   ของจริง: /admin/icons · เอกสาร docs/icon-system.md
 *   (โฟลเดอร์ _demos ไม่ build — ก๊อปไปไว้ใต้ app/ ชั่วคราวถ้าจะเปิดดู)
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { IconPickerModal } from "@/components/icon/icon-picker-modal";
import { DEFAULT_ICON_SETTINGS, ICON_MODE_LABEL, type IconMode, type IconSettings } from "@/lib/icon-registry";

const MENU: [string, string][] = [
  ["🏠", "หน้าหลัก"], ["📊", "แดชบอร์ด"], ["🛒", "สั่งซื้อ (ออก PO)"], ["📥", "รับสินค้าเข้า"], ["🧾", "ใบสั่งขาย"],
  ["🏭", "ผลิต"], ["📋", "บอร์ดจ่ายงาน"], ["🏷️", "SKUs"], ["🏦", "หนี้ธนาคาร"], ["🧑‍💼", "ลูกค้า"], ["⚙️", "ตั้งค่า"], ["LINE", "LINE พนักงาน"],
];
const BUTTONS: [string, string][] = [["save", "บันทึก"], ["edit", "แก้ไข"], ["delete", "ลบ"], ["print", "พิมพ์"], ["export", "ส่งออก"]];
const STATUS: [string, string][] = [["warning", "ข้อมูลไม่ครบ"], ["done", "ผ่าน QC"], ["waiting", "รออนุมัติ"], ["cancel", "ยกเลิก"]];

export default function IconPreviewPage() {
  const [s, setS] = useState<IconSettings>({ ...DEFAULT_ICON_SETTINGS, mode: "line" });
  const [pickFor, setPickFor] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <h1 className="text-2xl font-semibold text-slate-800">พรีวิว: ไอคอนทั้งระบบ</h1>
        <div className="flex gap-2">
          {(Object.keys(ICON_MODE_LABEL) as IconMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setS((x) => ({ ...x, mode: m }))}
              className={`px-3 py-1.5 rounded-lg border text-sm ${s.mode === m ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
              {ICON_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="grid gap-5 md:grid-cols-[240px_1fr]">
          <nav className="rounded-xl border border-slate-200 bg-white p-3 space-y-0.5" aria-label="เมนูตัวอย่าง">
            {MENU.map(([icon, label]) => (
              <div key={label} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                <span className="text-base leading-none"><Icon value={icon} settings={s} /></span>{label}
              </div>
            ))}
          </nav>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500 mb-2">ปุ่มคำสั่ง (กดเพื่อเปลี่ยนไอคอน)</div>
              <div className="flex flex-wrap gap-2">
                {BUTTONS.map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setPickFor(k)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 inline-flex items-center gap-1.5 hover:bg-slate-50">
                    <Icon name={k} settings={s} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500 mb-2">ป้ายสถานะ</div>
              <div className="flex flex-wrap gap-2">
                {STATUS.map(([k, label]) => (
                  <span key={k} className="px-2.5 py-1 rounded-full bg-slate-100 text-sm text-slate-700 inline-flex items-center gap-1.5">
                    <Icon name={k} settings={s} /> {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {pickFor && (
        <IconPickerModal open onClose={() => setPickFor(null)} title={`เลือกไอคอนให้ “${pickFor}”`}
          value={s.overrides[pickFor] ?? null} settings={s}
          onPick={(v) => setS((x) => { const o = { ...x.overrides }; if (v) o[pickFor] = v; else delete o[pickFor]; return { ...x, overrides: o }; })} />
      )}
    </div>
  );
}
