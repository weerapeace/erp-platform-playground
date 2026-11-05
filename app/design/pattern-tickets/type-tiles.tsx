"use client";

/**
 * แผ่นประเภทงาน (บนสุดของหน้าตั๋วงาน Pattern)
 *   โชว์เฉพาะคนที่เปิดตั๋วได้ (me.can_create = ผู้จัดการ/แอดมิน/ฝ่ายออกแบบ) · พนักงานไม่เห็นส่วนนี้ (เห็นแค่รายการตั๋ว — เจ้าของขอ 2026-11-05)
 *   กดแผ่น = เปิดป๊อปเปิดตั๋วโดยเลือกประเภทนั้นไว้ · โหมด English = ชื่ออังกฤษนำ
 *   ป้าย "ค้าง X" = ตั๋วที่ยังไม่ปิดของประเภทนั้น (open_counts จาก GET /api/pattern-tickets)
 *   ผู้จัดการ (me.can_manage) = ปุ่มรูปภาพมุมขวาบน → ป๊อปเปลี่ยนไอคอน · ปุ่ม ⚙ "ตั้งค่าประเภทงาน" (เพิ่ม/แก้/ปิดใช้/ลบ/เรียง — ./type-settings)
 * ไอคอน: มาตรฐาน Lottie (lib/lottie-library) / ไอคอนเส้น / อัปเอง — ตัวเลือกกลาง ./type-icon-picker · บันทึกผ่าน PATCH /api/pattern-tickets/types
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useLang, useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { defaultTypeIcon, typeIconOf, typeLabelPair } from "@/lib/pattern-tickets";
import { TypeIconBox, TypeIconPicker } from "./type-icon-picker";
import type { Me, TicketType } from "./types";

export function TypeTiles({ types, counts, me, onPick, onTypeSaved, onOpenSettings }: {
  types: TicketType[];
  counts: Record<string, number>;
  me: Me | null;
  onPick: (key: string) => void;
  onTypeSaved: (t: TicketType) => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const isEn = useLang().lang === "en";
  const [editing, setEditing] = useState<TicketType | null>(null);
  const active = types.filter((x) => x.is_active);
  if (!me?.can_create) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Icon name="add" />
        <span className="flex-1">{t("เปิดตั๋วงานใหม่ — กดเลือกประเภทงาน", "New ticket — pick a job type")}</span>
        {me.can_manage && (
          <button type="button" onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-normal text-slate-600 hover:border-slate-300">
            <Icon name="settings" /> {t("ตั้งค่าประเภทงาน", "Job type settings")}
          </button>
        )}
      </div>
      {!active.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {t("ยังไม่มีประเภทงานที่เปิดใช้", "No active job types yet")}
          {me.can_manage && <> — <button type="button" onClick={onOpenSettings} className="text-blue-600 hover:underline">{t("เพิ่มประเภทงาน", "Add a job type")}</button></>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {active.map((x) => {
            const n = counts[x.key] ?? 0;
            const [main, sub] = typeLabelPair(x, isEn);
            return (
              <div key={x.key} className="relative">
                <button type="button" onClick={() => onPick(x.key)}
                  title={t(`เปิดตั๋ว "${x.label_th}"`, `New "${x.label_en}" ticket`)}
                  className="flex w-full flex-col items-center rounded-xl border border-slate-200 bg-white px-2 pb-3 pt-4 text-center transition hover:border-slate-300 hover:shadow-sm">
                  <span className="mb-2"><TypeIconBox value={typeIconOf(x)} color={x.color} box={56} /></span>
                  <span className="text-sm font-medium text-slate-800">{main}</span>
                  <span className="text-xs text-slate-400">{sub}</span>
                </button>
                {n > 0 && (
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-700">
                    {t(`ค้าง ${n}`, `${n} open`)}
                  </span>
                )}
                {me.can_manage && (
                  <button type="button" onClick={() => setEditing(x)} aria-label={t("เปลี่ยนไอคอน", "Change icon")} title={t("เปลี่ยนไอคอน", "Change icon")}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-500 hover:border-slate-300 hover:text-slate-700">
                    <Icon name="image" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <TypeIconModal type={editing} onClose={() => setEditing(null)}
          onSaved={(nt) => { onTypeSaved(nt); setEditing(null); }} />
      )}
    </section>
  );
}

/** ป๊อปเปลี่ยนไอคอนของประเภทงาน — เลือกจากมาตรฐาน / ไอคอนเส้น / อัปเอง → ดูตัวอย่าง → บันทึก */
function TypeIconModal({ type, onClose, onSaved }: { type: TicketType; onClose: () => void; onSaved: (t: TicketType) => void }) {
  const t = useT();
  const toast = useToast();
  const def = defaultTypeIcon(type.key);
  const [draft, setDraft] = useState<string>(typeIconOf(type));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== typeIconOf(type);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/pattern-tickets/types", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: type.key, icon: draft === def ? "" : draft }),
      });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(t("บันทึกไอคอนแล้ว", "Icon saved"));
      onSaved(j.data as TicketType);
    } catch (e) {
      toast.error(t(`บันทึกไม่สำเร็จ: ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`));
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={t(`ไอคอนของ "${type.label_th}"`, `Icon for "${type.label_en}"`)}
      hasUnsavedChanges={dirty && !saving} loading={saving} defaultExpanded={false}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void save()} disabled={saving || uploading || !dirty} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>
        </div>
      }>
      <div className="py-1">
        <TypeIconPicker value={draft} color={type.color} defaultValue={def} onChange={setDraft} onBusy={setUploading} />
      </div>
    </ERPModal>
  );
}
