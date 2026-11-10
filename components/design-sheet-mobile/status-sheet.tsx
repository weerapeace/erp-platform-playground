"use client";

/**
 * DesignStatusSheet — แผ่นเลือกสถานะใบงานออกแบบ (มือถือ · ของกลางในโมดูลใบงาน)
 *   ใช้ที่: หน้าใบงานมือถือ (แถบล่าง "เปลี่ยนสถานะ") · Design Dashboard มือถือ (กดค้างที่การ์ด)
 *   ตัวเลือกตามกฎกลาง statusOptsFor — แบรนด์เรา = ไม่มีสถานะ "เฉพาะงานลูกค้า" (เหมือนบอร์ด/ป๊อปอัปจอคอม)
 *   คนเรียกเป็นคนบันทึกเอง (onPick) — บอร์ดใช้ moveSheetToStatus · หน้าใบงานใช้ patchField (ทั้งคู่ PATCH /api/design-sheets/[id] มีประวัติ)
 */
import { BottomSheet } from "@/components/modal";
import { useT } from "@/components/i18n";
import { statusOptsFor, type StatusMeta } from "@/lib/design-sheets-meta";

export function DesignStatusSheet({ open, onClose, statusMeta, own, current, subtitle, onPick }: {
  open: boolean;
  onClose: () => void;
  statusMeta: StatusMeta;
  /** งานแบรนด์เรา (ซ่อนสถานะเฉพาะงานลูกค้า) */
  own: boolean;
  current: string | null;
  /** บรรทัดเล็กใต้หัว เช่น รหัส + ชื่องาน */
  subtitle?: string;
  /** เลือกสถานะใหม่ (ไม่เรียกถ้าเลือกตัวเดิม) */
  onPick: (status: string) => void;
}) {
  const t = useT();
  return (
    <BottomSheet open={open} onClose={onClose} title={t("เปลี่ยนสถานะ", "Change status")} subtitle={subtitle} backKey="ds-status" maxHeight="75dvh">
      <div className="space-y-0.5">
        {statusOptsFor(statusMeta, own, current).map(([key, label]) => {
          const on = key === current; const color = statusMeta.colorHex[key] ?? "#94a3b8";
          return (
            <button key={key} type="button" onClick={() => { onClose(); if (!on) onPick(key); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${on ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 active:bg-slate-50"}`}>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />{label}
              {on && <span className="ml-auto text-xs text-slate-400">{t("ปัจจุบัน", "Current")}</span>}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
