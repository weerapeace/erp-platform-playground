/**
 * 🧊 ตัวโหลดไลบรารี 3D (three.js r128 · MIT) — วางเป็นไฟล์สำเร็จรูปใน public/vendor ไม่ผ่านขั้น build
 *   เหตุผล: ไลบรารีหนัก (~600KB) ถ้าลงเป็นแพ็กเกจ ขั้น build บน Vercel เสี่ยงหน่วยความจำหมด (เคยเกิดกับ heic2any 2026-11-01)
 *   โหลดครั้งเดียวตอนมีคนเปิดภาพ 3D จริง → หน้าอื่นไม่หนักขึ้น
 *   ไฟล์: public/vendor/three-r128.min.js (จาก cdnjs · ตรวจ sha512 ตรงกับที่ cdnjs ประกาศแล้ว 2026-11-10)
 *
 * ใช้ที่: components/pattern-3d · คู่มือ: docs/pattern-studio.md
 */
// three.js ไม่มีไฟล์ชนิดข้อมูลในโปรเจกต์ (ไม่ได้ลงเป็นแพ็กเกจ) → ใช้ any เฉพาะจุดนี้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Three = any;

const THREE_SRC = "/vendor/three-r128.min.js";
let loader: Promise<Three> | null = null;

export function loadThree(): Promise<Three> {
  const w = window as unknown as { THREE?: Three };
  if (w.THREE) return Promise.resolve(w.THREE);
  loader ??= new Promise<Three>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = THREE_SRC;
    s.async = true;
    s.onload = () => (w.THREE ? resolve(w.THREE) : reject(new Error("three not found")));
    s.onerror = () => reject(new Error("load three failed"));
    document.head.appendChild(s);
  }).catch((e) => { loader = null; throw e; });   // โหลดพลาด = ครั้งหน้าลองใหม่
  return loader;
}
