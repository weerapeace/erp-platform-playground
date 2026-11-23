"use client";
/**
 * 💾 บันทึกทั้งหมด (Save all) — ของกลาง สำหรับหน้า/ป๊อปที่แก้ได้หลายแถว (เจ้าของสั่ง 2026-11-23)
 * --------------------------------------------------------------------------
 * แทนการกด 💾 ทีละแถว: แก้หลายแถว → แถวที่แก้มีแถบส้ม → กด "บันทึกทั้งหมด (N)" ครั้งเดียว
 *   · บอกผล สำเร็จ/ไม่สำเร็จกี่รายการ (แถวที่พลาดยังค้างไว้ให้แก้ต่อ)
 *   · มีปุ่ม "ย้อนกลับ" ในแจ้งผลมุมจอ (ถ้าผู้เรียกส่ง undoOne มา) → คืนค่าเดิมทุกแถวที่เพิ่งบันทึก
 *   · Ctrl+S = บันทึกทั้งหมด · ปิดหน้า/รีโหลดตอนยังแก้ค้าง = เบราว์เซอร์ถามก่อน (useReportUnsaved)
 *
 * ใช้:
 *   const sa = useSaveAll({ items: rows, keyOf: (r) => r.id, original: (r) => orig.get(r.id),
 *     isDirty: (r, o) => !o || r.name !== o.name, saveOne: (r) => patch(r), undoOne: (o) => patch(o), label: (r) => r.name });
 *   <tr className={sa.isDirty(r) ? DIRTY_ROW_CLASS : ""}> …
 *   <SaveAllBar sa={sa} unit="ประเภท" onDiscard={reset} />          // ในท้ายป๊อป/ขอบล่างหน้า
 * ห้ามใช้: ฟอร์มเดียว (ใช้ SaveBar) · หน้าที่บันทึกทันทีทุกคลิก (ไม่ต้องมีปุ่ม)
 * คู่มือ: docs/save-bar.md
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { useSaveShortcut } from "./use-save-shortcut";
import { useReportUnsaved } from "./index";

/** คลาสแถวที่แก้ค้าง (แถบส้มซ้าย) — ใช้ให้เหมือนกันทุกหน้า */
export const DIRTY_ROW_CLASS = "bg-amber-50/70 shadow-[inset_3px_0_0_0_#f59e0b]";

export type SaveAllResult = { ok: number; fail: number; errors: string[] };

export type SaveAllApi<T> = {
  isDirty: (item: T) => boolean;
  dirtyItems: T[];
  pending: number;
  saving: boolean;
  saveAll: () => Promise<SaveAllResult>;
  keyOf: (item: T) => string;
  /** ข้อความผลล่าสุด (สำเร็จ/ไม่สำเร็จ) */
  lastResult: SaveAllResult | null;
};

export function useSaveAll<T>({ items, keyOf, original, isDirty, saveOne, undoOne, afterSave, afterUndo, label }: {
  items: T[];
  keyOf: (item: T) => string;
  /** ค่าก่อนแก้ของแถวนั้น (ไม่มี = แถวใหม่ → นับว่าแก้) */
  original: (item: T) => T | undefined;
  isDirty: (item: T, orig: T | undefined) => boolean;
  /** บันทึก 1 แถว — คืนข้อความ error หรือ throw ถ้าพลาด · คืน null/void = สำเร็จ */
  saveOne: (item: T) => Promise<string | null | void>;
  /** ย้อนกลับ 1 แถว (บันทึกค่าเดิมกลับ) — ไม่ส่ง = ไม่มีปุ่มย้อนกลับ */
  undoOne?: (orig: T) => Promise<string | null | void>;
  /** หลังบันทึกเสร็จ — ⚠️ ถ้าโหลดใหม่ แถวที่บันทึกพลาดจะหาย ควรอัปเดตค่าเดิมใน saveOne แทน */
  afterSave?: () => void;
  /** หลังย้อนกลับเสร็จ (เช่น โหลดใหม่) */
  afterUndo?: () => void;
  label?: (item: T) => string;
}): SaveAllApi<T> {
  const t = useT();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<SaveAllResult | null>(null);
  const dirtyFn = useCallback((it: T) => isDirty(it, original(it)), [isDirty, original]);
  const dirtyItems = useMemo(() => items.filter(dirtyFn), [items, dirtyFn]);
  const busy = useRef(false);

  const saveAll = useCallback(async (): Promise<SaveAllResult> => {
    if (busy.current || dirtyItems.length === 0) return { ok: 0, fail: 0, errors: [] };
    busy.current = true; setSaving(true);
    const errors: string[] = []; const savedOrig: T[] = [];
    let ok = 0;
    for (const it of dirtyItems) {
      try {
        const e = await saveOne(it);
        if (e) errors.push(label ? `${label(it)}: ${e}` : e);
        else { ok++; const o = original(it); if (o) savedOrig.push(o); }
      } catch (e) { errors.push(`${label ? label(it) + ": " : ""}${e instanceof Error ? e.message : String(e)}`); }
    }
    const res = { ok, fail: errors.length, errors };
    setLastResult(res); busy.current = false; setSaving(false);
    if (res.fail) toast.error(t(`บันทึกไม่สำเร็จ ${res.fail} รายการ — ${errors[0]}`, `${res.fail} failed to save — ${errors[0]}`));
    if (ok) {
      const msg = t(`บันทึกแล้ว ${ok} รายการ`, `Saved ${ok} items`);
      if (undoOne && savedOrig.length) {
        toast.undo(msg, async () => {
          let bad = 0;
          for (const o of savedOrig) { try { if (await undoOne(o)) bad++; } catch { bad++; } }
          if (bad) toast.error(t(`ย้อนกลับไม่สำเร็จ ${bad} รายการ`, `${bad} couldn't be undone`));
          else toast.success(t(`ย้อนกลับแล้ว ${savedOrig.length} รายการ`, `Undid ${savedOrig.length} items`));
          afterUndo?.();
        }, { ms: 10000 });
      } else toast.success(msg);
    }
    afterSave?.();
    return res;
  }, [dirtyItems, saveOne, undoOne, afterSave, afterUndo, label, original, toast, t]);

  return { keyOf, isDirty: dirtyFn, dirtyItems, pending: dirtyItems.length, saving, saveAll, lastResult };
}

/** แถบ/ท้ายป๊อป "แก้ค้าง N · [ละทิ้ง] · [บันทึกทั้งหมด (N)]" — Ctrl+S ได้ · แจ้งเตือนก่อนออกถ้ายังแก้ค้าง */
export function SaveAllBar<T>({ sa, unit, onDiscard, extra, sticky = false }: {
  sa: SaveAllApi<T>;
  /** หน่วยที่นับ เช่น "ประเภท" "แถว" (ค่าเริ่ม "รายการ") */
  unit?: string;
  onDiscard?: () => void;
  /** ปุ่มเพิ่ม (เช่น ปิด) — วางขวาสุดก่อนปุ่มบันทึก */
  extra?: ReactNode;
  /** ติดขอบล่างหน้า (ใช้ในหน้าเต็ม) · ค่าเริ่ม = วางในท้ายป๊อป */
  sticky?: boolean;
}) {
  const t = useT();
  const u = unit ?? t("รายการ", "items");
  useReportUnsaved(sa.pending > 0);
  useSaveShortcut(() => { void sa.saveAll(); }, { enabled: sa.pending > 0 && !sa.saving });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${sticky ? "sticky bottom-0 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm" : ""}`}>
      <span className="mr-auto text-xs">
        {sa.saving ? <span className="text-slate-500">{t("กำลังบันทึก…", "Saving…")}</span>
          : sa.pending > 0 ? <span className="text-amber-700 font-medium">{t(`แก้ค้าง ${sa.pending} ${u} — ยังไม่บันทึก`, `${sa.pending} ${u} changed — not saved`)}</span>
          : sa.lastResult?.ok ? <span className="text-emerald-700">✓ {t(`บันทึกแล้ว ${sa.lastResult.ok} ${u}`, `Saved ${sa.lastResult.ok} ${u}`)}</span>
          : null}
      </span>
      {onDiscard && (
        <button type="button" onClick={onDiscard} disabled={sa.pending === 0 || sa.saving}
          className="h-9 px-3 text-sm rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-40">{t("ละทิ้ง", "Discard")}</button>
      )}
      {extra}
      <button type="button" onClick={() => void sa.saveAll()} disabled={sa.pending === 0 || sa.saving} title={t("Ctrl+S", "Ctrl+S")}
        className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
        {sa.saving ? t("กำลังบันทึก…", "Saving…") : sa.pending > 0 ? t(`บันทึกทั้งหมด (${sa.pending})`, `Save all (${sa.pending})`) : t("บันทึกทั้งหมด", "Save all")}
      </button>
    </div>
  );
}
