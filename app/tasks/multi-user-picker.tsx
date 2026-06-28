"use client";

// ============================================================
// MultiUserPicker (ของกลางในโมดูลงาน) — เลือกผู้ใช้ได้หลายคน (chips + UserPicker)
// ใช้กับ: ผู้ตรวจหลายคน (แม่แบบ / ฟอร์มสร้างงาน / รายละเอียดงาน)
// ============================================================

import { UserPicker, type UserPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";

export function MultiUserPicker({ value, onChange, disableCreate }: {
  value: UserPickerValue[];
  onChange: (v: UserPickerValue[]) => void;
  disableCreate?: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">
              {u.name || u.id}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== u.id))} className="text-slate-400 hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}
      <UserPicker value={null} onChange={(v) => { if (v && !value.some((x) => x.id === v.id)) onChange([...value, v]); }} disableCreate={disableCreate} />
      {value.length === 0 && <p className="text-[11px] text-slate-400">{t("ยังไม่เลือก — เลือกได้หลายคน", "None — you can pick several")}</p>}
    </div>
  );
}
