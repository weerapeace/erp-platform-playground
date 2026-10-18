"use client";
/**
 * FooterSave — ปุ่ม "บันทึก" ของแท็บย่อย ไปอยู่ "แถบล่าง" ของหน้าต่าง (ของกลาง)
 * --------------------------------------------------------------------------
 * ปัญหาเดิม: แท็บที่บันทึกแยกเอง (เช่น 🛍 เว็บไซต์ ใน Parent SKU) มีปุ่มบันทึกอยู่ท้ายเนื้อหา ต้องเลื่อนหา
 * วิธีใช้:
 *   - ฝั่ง host (drawer ของ MasterCRUD ทำให้แล้ว): const host = useFooterSaveHost()
 *       ครอบเนื้อหาด้วย <FooterSaveProvider value={host.register}> · แถบล่างวาง <FooterSaveButton host={host} />
 *       ปิดหน้าต่างตอน host.anyDirty = ถามก่อน (hasUnsavedChanges)
 *   - ฝั่งแท็บ: const inFooter = useFooterSave({ label, dirty, saving, onSave })
 *       inFooter = true → มีแถบล่างรับปุ่มแล้ว (ซ่อนปุ่มในเนื้อหาได้) · false = ไม่ได้อยู่ใน host → โชว์ปุ่มของตัวเองตามเดิม
 * ปุ่มล่าง: ไม่มีอะไรเปลี่ยน = จาง "บันทึก" · มีของค้าง = "💾 บันทึก" กดแล้วบันทึกทุกแท็บที่ค้าง
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

export interface FooterSaveSlot {
  /** ชื่อส่วนที่บันทึก (โชว์ใน tooltip) เช่น "เว็บไซต์" */
  label?: string;
  /** มีของแก้ที่ยังไม่บันทึก */
  dirty: boolean;
  /** กำลังบันทึกอยู่ */
  saving: boolean;
  onSave: () => Promise<void> | void;
}

type Register = (id: string, slot: FooterSaveSlot | null) => void;
const Ctx = createContext<Register | null>(null);
export const FooterSaveProvider = Ctx.Provider;

/** ฝั่งแท็บ: ฝากปุ่มบันทึกไว้ที่แถบล่าง · คืน true = มีแถบล่างรับแล้ว */
export function useFooterSave(slot: FooterSaveSlot | null): boolean {
  const register = useContext(Ctx);
  const id = useId();
  // onSave เปลี่ยนทุก render → ส่งผ่าน ref (ลงทะเบียนใหม่เฉพาะตอนสถานะเปลี่ยน)
  const ref = useRef(slot);
  ref.current = slot;
  const has = !!slot;
  const dirty = !!slot?.dirty;
  const saving = !!slot?.saving;
  const label = slot?.label;
  useEffect(() => {
    if (!register) return;
    register(id, has ? { label, dirty, saving, onSave: () => ref.current?.onSave() } : null);
  }, [register, id, has, label, dirty, saving]);
  useEffect(() => () => register?.(id, null), [register, id]);
  return !!register;
}

/** ฝากปุ่มบันทึกจากตัวที่ "ไม่ได้อยู่ใต้" Provider เอง (เช่น MasterCRUD ฝากปุ่มบันทึกแท็กที่แก้ในหน้าดู)
 *  วางคอมโพเนนต์นี้ไว้ใต้ <FooterSaveProvider> แล้วส่ง slot เข้ามา · null = ไม่ฝาก (ไม่มีปุ่ม) */
export function FooterSaveRegistrar({ slot }: { slot: FooterSaveSlot | null }) {
  useFooterSave(slot);
  return null;
}

/** ฝั่ง host: รวมปุ่มที่แท็บฝากไว้ */
export function useFooterSaveHost() {
  const [slots, setSlots] = useState<Record<string, FooterSaveSlot>>({});
  const register = useCallback<Register>(
    (id, slot) =>
      setSlots((s) => {
        if (slot) return { ...s, [id]: slot };
        if (!(id in s)) return s;
        const n = { ...s };
        delete n[id];
        return n;
      }),
    [],
  );
  const list = Object.values(slots);
  const anyDirty = list.some((x) => x.dirty);
  const saving = list.some((x) => x.saving);
  const saveDirty = async () => {
    for (const x of list) if (x.dirty) await x.onSave();
  };
  return { register, slots: list, has: list.length > 0, anyDirty, saving, saveDirty };
}
export type FooterSaveHost = ReturnType<typeof useFooterSaveHost>;

/** ปุ่มบนแถบล่าง (ไม่มีแท็บฝาก = ไม่โชว์) */
export function FooterSaveButton({ host, className }: { host: FooterSaveHost; className?: string }) {
  if (!host.has) return null;
  const labels = host.slots.filter((x) => x.dirty && x.label).map((x) => x.label);
  return (
    <button
      type="button"
      onClick={() => void host.saveDirty()}
      disabled={!host.anyDirty || host.saving}
      title={host.anyDirty ? `บันทึก${labels.length ? ` (${labels.join(", ")})` : ""}` : "ยังไม่มีอะไรเปลี่ยน"}
      className={className ?? "h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1.5"}
    >
      {host.saving ? "กำลังบันทึก…" : host.anyDirty ? "💾 บันทึก" : "บันทึก"}
    </button>
  );
}
