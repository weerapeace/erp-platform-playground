"use client";

// ป๊อปเลือก "ที่เก็บ" ของกล่องที่เก็บในกระดาน flowchart (ใช้ภายใน components/flowchart-board)
// รายชื่อ/ไอคอน/คำอธิบาย: lib/storage-places (3 ตัวแรกดึงชื่อ+คำอธิบายจากที่เก็บจริงของระบบ lib/storage-policy)
// กดไอคอน = เลือกเลย (ไม่ต้องกดยืนยัน) · "ทรงกระบอก" = ไม่ใช้ไอคอน (หน้าตาแบบเดิม)

import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { STORAGE_PLACES, storagePlaceSvg } from "@/lib/storage-places";

export function StoragePlaceModal({ open, current, suggest, onClose, onPick }: {
  open: boolean;
  current: string | null;
  /** เดาจากชื่อกล่องเดิม (lib/storage-places guessPlace) → ป้าย "แนะนำ" */
  suggest?: string | null;
  onClose: () => void;
  onPick: (place: string) => void;
}) {
  const t = useT();
  const tile = (on: boolean) => `relative flex items-start gap-2.5 rounded-xl border p-2 text-left transition ${on ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`;
  return (
    <ERPModal open={open} onClose={onClose} title={t("เลือกที่เก็บ", "Choose storage")} size="lg">
      <p className="mb-2 text-[12px] text-slate-500">{t("กดเลือกได้เลย · 3 อันแรกคือที่เก็บที่ระบบใช้จริง ที่เหลือไว้วางแผน", "Tap to choose · the first 3 are where the system really stores files; the rest are for planning")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {STORAGE_PLACES.map((p) => (
          <button key={p.key} type="button" className={tile(current === p.key)} onClick={() => onPick(p.key)}>
            {/* SVG จากค่าคงที่ของเราเอง (lib/storage-places) */}
            <span className="shrink-0 leading-[0]" dangerouslySetInnerHTML={{ __html: storagePlaceSvg(p.key, 40) }} />
            {suggest === p.key && current !== p.key && <span className="absolute right-1.5 top-1.5 rounded-full bg-violet-600 px-1.5 text-[10px] font-medium text-white">{t("แนะนำ", "Suggested")}</span>}
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-slate-800">{t(p.th, p.en)}</span>
              <span className="block text-[11px] leading-snug text-slate-500">{t(p.hintTh, p.hintEn)}</span>
            </span>
          </button>
        ))}
        <button type="button" className={tile(!current)} onClick={() => onPick("")}>
          <span className="shrink-0 leading-[0]">
            <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 12 A16 5 0 0 1 40 12 V36 A16 5 0 0 1 8 36 Z" fill="#f5f3ff" stroke="#7c3aed" strokeWidth="2" /><path d="M8 12 A16 5 0 0 0 40 12" fill="none" stroke="#7c3aed" strokeWidth="2" /></svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-slate-800">{t("ทรงกระบอก (ไม่ใช้ไอคอน)", "Cylinder (no icon)")}</span>
            <span className="block text-[11px] leading-snug text-slate-500">{t("หน้าตาแบบเดิม พิมพ์ชื่อเองได้", "The classic look — type any name")}</span>
          </span>
        </button>
      </div>
    </ERPModal>
  );
}
