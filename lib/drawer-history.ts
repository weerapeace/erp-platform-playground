"use client";
/**
 * lib/drawer-history.ts — ผูก drawer เข้ากับปุ่มย้อนกลับของเบราว์เซอร์ (ของกลาง)
 *
 * เปิด drawer แต่ละชั้น = ดัน 1 รายการในสแต็ก + 1 entry ในประวัติเบราว์เซอร์
 * กด Back (หรือปุ่มปิด/Esc/แตะนอก) = ปิด "เฉพาะชั้นบนสุด" ทีละชั้น — ไม่หลุดออกจากหน้า
 *
 * รองรับ drawer ซ้อนกัน เช่น เปิดสินค้าหลัก → กดเข้า SKU ลูก (drawer ซ้อน)
 * → กด Back ครั้งแรกปิด SKU ลูก (เหลือสินค้าหลัก) · Back อีกครั้งปิดสินค้าหลัก
 *
 * ทุกเส้นทางการปิด (ปุ่ม ✕ / Esc / แตะนอก / ปุ่ม Back) วิ่งผ่าน popstate จุดเดียว → ปิดทีละชั้นแน่นอน
 */

type Entry = { id: number; close: () => void };
let SEQ = 0;
const stack: Entry[] = [];
let listening = false;

function onPop() {
  // กด Back → history ถูกถอยไป 1 ชั้นแล้ว → ปิด drawer ชั้นบนสุดตัวเดียว
  const top = stack.pop();
  if (top) top.close();
}
function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", onPop);
}

/** มี drawer เปิดค้างอยู่ไหม — ใช้แยกว่า popstate ที่เกิดขึ้นเป็น "ปิด drawer" หรือ "ย้อนการเดินของหน้า"
 *  (listener ของหน้าเพจถูกผูกไว้ก่อน drawer เสมอ → ตอนหน้าเพจอ่านค่านี้ drawer ยังไม่ถูก pop) */
export function hasOpenDrawer(): boolean { return stack.length > 0; }

export type DrawerHistoryHandle = {
  /** ปิดเอง (ปุ่ม ✕ / Esc / แตะนอก) → ถอยประวัติ 1 ก้าว ให้ popstate ปิด + เคลียร์ entry */
  requestClose: () => void;
  /** unmount โดยไม่ผ่าน history (ปิดเชิงโปรแกรม) → เอา entry ออกจากสแต็กเฉยๆ */
  dispose: () => void;
};

/** เรียกตอน drawer เปิด (mount). close = ฟังก์ชันปิดจริง (เช่น setPeek(null)) */
export function pushDrawerHistory(close: () => void): DrawerHistoryHandle {
  ensureListener();
  const entry: Entry = { id: ++SEQ, close };
  stack.push(entry);
  // ⚠️ ต้องพา state เดิมของหน้าไปด้วย (เช่น __skuNav ที่เก็บหน้า/โฟลเดอร์/แท็กที่กำลังดู)
  //    ถ้า push ทับด้วย { __drawer } เปล่า ๆ → ตอนปิด drawer (history.back) หน้าจะอ่าน state ที่ไม่มีข้อมูล
  //    แล้วเด้งกลับหน้า 1 (เคสจริง: อยู่หน้า 4/70 เปิดสินค้า แก้ แล้วปิด → เด้งหน้า 1)
  try {
    const prev = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...prev, __drawer: entry.id }, "");
  } catch { /* ignore */ }

  let done = false;
  return {
    requestClose: () => {
      if (done) return;
      const idx = stack.findIndex((e) => e.id === entry.id);
      if (idx < 0) { done = true; return; }            // ถูกปิดผ่าน popstate ไปแล้ว
      if (idx === stack.length - 1) {
        done = true;
        try { window.history.back(); }                  // → popstate → onPop → close()
        catch { stack.pop(); entry.close(); }
      } else {
        // ไม่ใช่ตัวบนสุด (กรณีหายาก) → ปิดตรงๆ ไม่ยุ่งประวัติ
        done = true; stack.splice(idx, 1); entry.close();
      }
    },
    dispose: () => {
      const idx = stack.findIndex((e) => e.id === entry.id);
      if (idx >= 0) stack.splice(idx, 1);
    },
  };
}
