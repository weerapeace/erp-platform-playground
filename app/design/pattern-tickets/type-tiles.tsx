"use client";

/**
 * แผ่นประเภทงาน (บนสุดของหน้าตั๋วงาน Pattern)
 *   กดแผ่น: คนเปิดตั๋วได้ (me.can_create) = เปิดป๊อปเปิดตั๋วโดยเลือกประเภทนั้นไว้ · คนอื่น = กรองรายการตามประเภท
 *   ป้าย "ค้าง X" = ตั๋วที่ยังไม่ปิดของประเภทนั้น (open_counts จาก GET /api/pattern-tickets)
 *   ผู้จัดการ (me.can_manage) = ปุ่มรูปภาพมุมขวาบน → ป๊อปเปลี่ยนไอคอน (อัปรูปเอง / กลับเป็นไอคอนเดิม)
 * อัปรูปด้วยตัวอัปกลาง uploadMediaFile (→ /api/admin/upload · R2 · ลงคลังกลาง) · บันทึกผ่าน PATCH /api/pattern-tickets/types
 */
import { useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { apiFetch } from "@/lib/api";
import { MediaUploadError, uploadMediaFile } from "@/lib/media-upload";
import { defaultTypeIcon, isUploadedTypeIcon, PATTERN_ICON_FOLDER, typeColorCls } from "@/lib/pattern-tickets";
import type { Me, TicketType } from "./types";

export function TypeTiles({ types, counts, me, activeType, onPick, onTypeSaved }: {
  types: TicketType[];
  counts: Record<string, number>;
  me: Me | null;
  /** ประเภทที่กำลังกรองอยู่ (โชว์กรอบเน้นให้คนที่กดแล้วเป็นการกรอง) */
  activeType: string;
  onPick: (key: string) => void;
  onTypeSaved: (t: TicketType) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<TicketType | null>(null);
  const active = types.filter((x) => x.is_active);
  if (!active.length) return null;
  const canCreate = !!me?.can_create;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Icon name="add" />
        {canCreate ? t("เปิดตั๋วงานใหม่ — กดเลือกประเภทงาน", "New ticket — pick a job type") : t("ประเภทงาน — กดเพื่อดูตั๋วของประเภทนั้น", "Job types — tap to filter tickets")}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {active.map((x) => {
          const n = counts[x.key] ?? 0;
          const on = !canCreate && activeType === x.key;
          return (
            <div key={x.key} className="relative">
              <button type="button" onClick={() => onPick(x.key)}
                title={canCreate ? t(`เปิดตั๋ว "${x.label_th}"`, `New "${x.label_en}" ticket`) : t(`ดูตั๋ว "${x.label_th}"`, `Show "${x.label_en}" tickets`)}
                className={`flex w-full flex-col items-center rounded-xl border bg-white px-2 pb-3 pt-4 text-center transition hover:border-slate-300 hover:shadow-sm ${on ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}>
                <span className={`mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl text-[28px] ${isUploadedTypeIcon(x.icon) ? "bg-slate-50" : typeColorCls(x.color)}`}>
                  <Icon value={x.icon || defaultTypeIcon(x.key)} size={isUploadedTypeIcon(x.icon) ? 48 : "1em"} />
                </span>
                <span className="text-sm font-medium text-slate-800">{x.label_th}</span>
                <span className="text-xs text-slate-400">{x.label_en}</span>
              </button>
              {n > 0 && (
                <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-700">
                  {t(`ค้าง ${n}`, `${n} open`)}
                </span>
              )}
              {me?.can_manage && (
                <button type="button" onClick={() => setEditing(x)} aria-label={t("เปลี่ยนไอคอน", "Change icon")} title={t("เปลี่ยนไอคอน", "Change icon")}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-500 hover:border-slate-300 hover:text-slate-700">
                  <Icon name="image" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <TypeIconModal type={editing} onClose={() => setEditing(null)}
          onSaved={(nt) => { onTypeSaved(nt); setEditing(null); }} />
      )}
    </section>
  );
}

const ICON_TYPES = /^image\/(png|jpeg|webp|gif)$/;
/** ไฟล์ Lottie (.json) — ไอคอนเคลื่อนไหว (components/animated-icon) · บางเครื่องไม่บอกชนิดไฟล์ → ดูนามสกุล */
const isLottieFile = (f: File) => f.type === "application/json" || /\.json$/i.test(f.name);

/** ป๊อปเปลี่ยนไอคอนของประเภทงาน — อัปรูป (มีแถบความคืบหน้า) → ดูตัวอย่าง → บันทึก · หรือกลับเป็นไอคอนเดิม */
function TypeIconModal({ type, onClose, onSaved }: { type: TicketType; onClose: () => void; onSaved: (t: TicketType) => void }) {
  const t = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<string>(type.icon || defaultTypeIcon(type.key));
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const def = defaultTypeIcon(type.key);
  const dirty = draft !== (type.icon || def);
  const busy = saving || !!up;

  const upload = async (file: File) => {
    if (!ICON_TYPES.test(file.type) && !isLottieFile(file)) { toast.warning(t("ใช้รูป PNG / JPG / WEBP / GIF หรือไฟล์ Lottie (.json)", "Use a PNG / JPG / WEBP / GIF image or a Lottie (.json) file")); return; }
    setUp({ name: file.name, size: file.size, pct: null });
    try {
      const key = await uploadMediaFile(file, {
        folder: PATTERN_ICON_FOLDER,
        onProgress: (pct) => setUp((u) => u && { ...u, pct }),
      });
      setDraft(`img:${key}`);
    } catch (e) {
      if (!(e instanceof MediaUploadError && e.code === "aborted")) toast.error(t(`อัปโหลดไม่สำเร็จ: ${(e as Error).message}`, `Upload failed: ${(e as Error).message}`));
    } finally {
      setUp(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (icon: string) => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/pattern-tickets/types", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: type.key, icon: icon === def ? "" : icon }),
      });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(t("บันทึกไอคอนแล้ว", "Icon saved"));
      onSaved(j.data as TicketType);
    } catch (e) {
      toast.error(t(`บันทึกไม่สำเร็จ: ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`));
    } finally { setSaving(false); }
  };

  const uploaded = isUploadedTypeIcon(draft);
  return (
    <ERPModal open onClose={onClose} size="sm" title={t(`ไอคอนของ "${type.label_th}"`, `Icon for "${type.label_en}"`)}
      hasUnsavedChanges={dirty && !saving} loading={saving}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void save(draft)} disabled={busy || !dirty} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>
        </div>
      }>
      <div className="flex flex-col items-center gap-3 py-2">
        <span className={`flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl text-[48px] ${uploaded ? "bg-slate-50" : typeColorCls(type.color)}`}>
          <Icon value={draft} size={uploaded ? 84 : "1em"} />
        </span>
        <div className="text-xs text-slate-500">{uploaded ? t("รูปที่อัปโหลด", "Uploaded image") : t("ไอคอนระบบ", "System icon")}</div>
        {up ? <UploadProgress {...up} className="max-w-xs" /> : (
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="upload" /> {t("อัปโหลดรูปไอคอน", "Upload icon image")}
            </button>
            {draft !== def && (
              <button type="button" onClick={() => setDraft(def)} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                <Icon name="refresh" /> {t("กลับเป็นไอคอนเดิม", "Reset to default icon")}
              </button>
            )}
          </div>
        )}
        <p className="text-center text-xs text-slate-400">{t("แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นใส (PNG) — ขนาดเล็กก็พอ", "A square image with a transparent background (PNG) works best")}</p>
        <p className="text-center text-xs text-slate-400">{t("ไอคอนขยับ: ไฟล์ Lottie (.json) จาก Lordicon / LottieFiles — ขยับเมื่อเอาเมาส์ชี้ · หรือ GIF ขยับตลอด", "Animated: a Lottie (.json) file from Lordicon / LottieFiles plays on hover · GIF loops")}</p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
    </ERPModal>
  );
}
