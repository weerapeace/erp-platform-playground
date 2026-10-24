"use client";
/**
 * 💾 SaveBar — แถบบันทึกติดขอบล่างของหน้า (ของกลาง) — ทุกหน้าที่แก้ข้อมูลได้ต้องเห็นปุ่ม/สถานะบันทึกเสมอ ไม่ต้องเลื่อนหา
 * --------------------------------------------------------------------------
 * mode "manual" (กดบันทึกเอง):
 *   แก้แล้ว → "มีการแก้ไขที่ยังไม่บันทึก" + [ละทิ้ง] + [💾 บันทึก] · ไม่ได้แก้ → "✓ บันทึกแล้ว" (ปุ่มจาง)
 * mode "auto" (บันทึกเองหลังหยุดแก้):
 *   "กำลังบันทึก…" / "✓ บันทึกอัตโนมัติแล้ว 10:32" / "⚠ บันทึกไม่สำเร็จ" + [💾 บันทึกเดี๋ยวนี้] (ตอนรอ/พลาด)
 * ยังไม่บันทึก → ถามก่อนปิด/รีโหลดเบราว์เซอร์ (beforeunload) + แจ้ง UnsavedGuard (ถ้ามี) → หน้าแม่ถามก่อนสลับแท็บ
 *
 * ใช้: <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={reset} />
 *      <SaveBar mode="auto" dirty={pending} saving={saving} error={err} savedAt={at} onSave={saveNow} />
 * หน้าแม่ที่มีแท็บ: const guard = useUnsavedGuardHost() → <UnsavedGuardProvider value={guard.register}> · ก่อนสลับแท็บเช็ก guard.anyDirty()
 * หน้าที่มีแถบบันทึกของตัวเองอยู่แล้ว (เช่น ดีไซน์) ใช้ useReportUnsaved(dirty) แจ้ง guard อย่างเดียวได้
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { useLang, useT } from "@/components/i18n";

/* ── UnsavedGuard: หน้าแม่รู้ว่ามีแท็บไหนยังไม่บันทึก ── */
type Register = (id: string, dirty: boolean) => void;
const GuardCtx = createContext<Register | null>(null);
export const UnsavedGuardProvider = GuardCtx.Provider;

export function useUnsavedGuardHost() {
  const map = useRef(new Map<string, boolean>());
  const register = useCallback<Register>((id, dirty) => {
    if (dirty) map.current.set(id, true);
    else map.current.delete(id);
  }, []);
  const anyDirty = useCallback(() => map.current.size > 0, []);
  return { register, anyDirty };
}

/** แจ้งหน้าแม่ว่า "ยังไม่บันทึก" + ถามก่อนปิดเบราว์เซอร์ */
export function useReportUnsaved(dirty: boolean) {
  const register = useContext(GuardCtx);
  const id = useId();
  useEffect(() => {
    register?.(id, dirty);
    return () => register?.(id, false);
  }, [register, id, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);
}

const hhmm = (d: Date, lang: string) => d.toLocaleTimeString(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit" });

export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  mode = "manual",
  error,
  savedAt,
  note,
  saveLabel,
  extra,
}: {
  /** มีของที่ยังไม่บันทึก (auto = แก้แล้วรอบันทึก) */
  dirty: boolean;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  /** ละทิ้งการแก้ไข (manual) — ไม่ส่ง = ไม่มีปุ่ม */
  onDiscard?: () => void;
  mode?: "manual" | "auto";
  /** บันทึกไม่สำเร็จ (โชว์เตือน + ให้กดลองใหม่) */
  error?: string | null;
  /** บันทึกสำเร็จล่าสุด (โชว์เวลา) */
  savedAt?: Date | null;
  /** ข้อความเพิ่ม เช่น "เผยแพร่ขึ้นเว็บทันที" */
  note?: ReactNode;
  saveLabel?: string;
  /** ปุ่มเพิ่ม (ซ้ายของปุ่มบันทึก) */
  extra?: ReactNode;
}) {
  useReportUnsaved(dirty || !!error);
  const t = useT();
  const { lang } = useLang();
  const auto = mode === "auto";
  const status = saving ? (
    <span className="text-slate-500">{t("กำลังบันทึก…", "Saving…")}</span>
  ) : error ? (
    <span className="text-red-600">⚠ {t("บันทึกไม่สำเร็จ", "Save failed")} — {error}</span>
  ) : dirty ? (
    <span className="text-amber-700 font-medium">{auto ? t("มีการแก้ไข — กำลังจะบันทึกอัตโนมัติ", "Changed — saving automatically soon") : t("มีการแก้ไขที่ยังไม่บันทึก", "You have unsaved changes")}</span>
  ) : (
    <span className="text-emerald-700">
      ✓ {auto ? t("บันทึกอัตโนมัติแล้ว", "Saved automatically") : t("บันทึกแล้ว", "Saved")}
      {savedAt ? ` ${hhmm(savedAt, lang)}` : ""}
    </span>
  );
  const canSave = (dirty || !!error) && !saving;
  return (
    <div className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm" role="region" aria-label={t("บันทึก", "Save")}>
      <span className="text-xs">{status}</span>
      {note && <span className="text-[11px] text-slate-400">{note}</span>}
      <div className="ml-auto flex items-center gap-2">
        {extra}
        {onDiscard && !auto && (
          <button type="button" onClick={onDiscard} disabled={!dirty || saving} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">
            {t("ละทิ้งการเปลี่ยนแปลง", "Discard changes")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!canSave}
          className={`px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${canSave ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-200 text-slate-500"}`}
        >
          {saving ? t("กำลังบันทึก…", "Saving…") : auto ? (error ? t("↻ ลองบันทึกอีกครั้ง", "↻ Try saving again") : t("💾 บันทึกเดี๋ยวนี้", "💾 Save now")) : (saveLabel ?? t("💾 บันทึก", "💾 Save"))}
        </button>
      </div>
    </div>
  );
}
