"use client";

/**
 * Refresh Bus (ของกลาง) — "กริ่งกลาง" สั่งให้หน้า/ตารางที่อยู่เบื้องหลังโหลดข้อมูลใหม่
 *
 * ปัญหาเดิม: เปิด Popup/Drawer แก้ข้อมูล → ปิด → หน้าเบื้องหลังยังโชว์ของเก่า (ต้องกด F5 เอง)
 * เพราะ Popup/Drawer กลางเป็นแค่ "กล่องเปล่า" ไม่รู้ว่าต้องสั่งใครโหลดใหม่
 *
 * วิธีแก้ (ของกลาง — ทำที่เดียว ครอบทั้งระบบ):
 *   1. apiFetch เรียก markDirty() ทุกครั้งที่บันทึก/ลบสำเร็จ (POST/PATCH/PUT/DELETE)
 *   2. Popup/Drawer/ConfirmDialog กลาง เรียก refreshIfDirty() ตอน "ปิด"
 *      → สั่งกริ่งเฉพาะเมื่อมีการแก้จริง (แค่เปิดดูเฉย ๆ / เลือก Picker → ไม่รีเฟรช = ประหยัด)
 *   3. useSWRLite และ DataTable (server mode) subscribe กริ่งนี้ → โหลดใหม่ "เงียบ ๆ"
 *      (โชว์ของเก่าไว้ก่อน ไม่ขึ้น spinner/กระพริบ)
 *
 * หน้าที่โหลดข้อมูลเอง (ไม่ใช่ SWR/DataTable) เรียก useRefresh(refetch) หนึ่งบรรทัดก็พอ
 */

import { useEffect, useRef } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

// มีการเขียนข้อมูลสำเร็จค้างอยู่หรือยัง (ยังไม่รีเฟรชจนกว่าจะปิด overlay) — ตั้งโดย apiFetch
let dirty = false;

/** จำไว้ว่ามีการบันทึก/ลบสำเร็จ (เรียกโดย apiFetch) — ยังไม่สั่งกริ่งจนกว่าจะปิด overlay */
export function markDirty(): void {
  dirty = true;
}

/** ตอนนี้มีการแก้ค้างอยู่ไหม */
export function isDirty(): boolean {
  return dirty;
}

/** สั่งกริ่งทันที + ล้าง flag — ทุกที่ที่ subscribe จะโหลดข้อมูลใหม่ (ใช้เมื่ออยากบังคับรีเฟรชเอง) */
export function triggerRefresh(): void {
  dirty = false;
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ไม่ให้ listener ตัวหนึ่งพังแล้วลามตัวอื่น */ }
  });
}

/** ปิด overlay แล้วเรียก — สั่งกริ่งเฉพาะเมื่อมีการแก้จริง (แล้วล้าง flag) */
export function refreshIfDirty(): void {
  if (dirty) triggerRefresh();
}

/** subscribe แบบไม่ใช่ hook — คืนฟังก์ชัน unsubscribe */
export function subscribeRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * ของกลางสำหรับหน้า/ตารางที่โหลดข้อมูลเอง (ไม่ได้ใช้ useSWRLite/DataTable server mode)
 * วางบรรทัดเดียว: useRefresh(() => loadData())
 * → เมื่อปิด Popup/Drawer หลังมีการแก้ ระบบจะเรียก loadData ให้อัตโนมัติ
 */
export function useRefresh(cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => subscribeRefresh(() => ref.current()), []);
}
