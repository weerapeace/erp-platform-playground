"use client";
// useFormDraft — จำข้อมูลที่พิมพ์ค้างในเครื่อง แล้วถามกู้คืนตอนเปิดใหม่ (ของกลาง · แกน lib/form-draft)
//   const draft = useFormDraft({ key: "suppliers:123", values: form, dirty, active: open && editing, sensitiveKeys });
//   draft.pending → โชว์แถบ <FormDraftBanner draft={draft} onRestore={(v) => setForm({ ...form, ...v })} />
// เก็บเมื่อ dirty (หน่วง 0.8 วิ) · บันทึกสำเร็จ (dirty → false) = ลบร่างของคีย์ที่เก็บไว้
import { useEffect, useRef, useState } from "react";
import { DRAFT_PREFIX, decodeDraft, encodeDraft, type StoredDraft } from "@/lib/form-draft";

const read = (key: string) => { try { return decodeDraft(localStorage.getItem(DRAFT_PREFIX + key)); } catch { return null; } };
const remove = (key: string) => { try { localStorage.removeItem(DRAFT_PREFIX + key); } catch { /* ignore */ } };

export function useFormDraft({ key, values, dirty, active, sensitiveKeys = [] }: {
  key: string | null;              // null = ไม่ใช้
  values: Record<string, unknown>;
  dirty: boolean;
  active: boolean;                 // ฟอร์มเปิดอยู่
  sensitiveKeys?: string[];
}) {
  const [pending, setPending] = useState<StoredDraft | null>(null);
  const savedKeyRef = useRef<string | null>(null);
  const prevDirty = useRef(dirty);
  const sensRef = useRef(sensitiveKeys);
  sensRef.current = sensitiveKeys;

  // เปิดฟอร์ม/เปลี่ยนรายการ → มีร่างค้างไหม
  useEffect(() => {
    if (!active || !key) { setPending(null); return; }
    setPending(read(key));
  }, [active, key]);

  // พิมพ์ค้าง → เก็บ (หน่วงนิดหน่อย)
  useEffect(() => {
    if (!active || !key || !dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_PREFIX + key, encodeDraft(values, sensRef.current)); savedKeyRef.current = key; } catch { /* เต็ม/โหมดส่วนตัว */ }
    }, 800);
    return () => clearTimeout(t);
  }, [active, key, dirty, values]);

  // บันทึกแล้ว/คืนค่า (dirty true → false) = ลบร่างที่เก็บ
  useEffect(() => {
    if (prevDirty.current && !dirty && savedKeyRef.current) { remove(savedKeyRef.current); savedKeyRef.current = null; }
    prevDirty.current = dirty;
  }, [dirty]);

  return {
    pending,
    /** กดกู้คืน → คืนค่าที่จำไว้ (ผู้เรียกเอาไปใส่ฟอร์มเอง) */
    take: (): Record<string, unknown> | null => { const v = pending?.values ?? null; setPending(null); return v; },
    discard: () => { if (key) remove(key); setPending(null); },
  };
}
export type FormDraftState = ReturnType<typeof useFormDraft>;
