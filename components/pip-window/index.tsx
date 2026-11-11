"use client";

/**
 * PipWindow — หน้าต่างจิ๋วลอยบนสุด (ของกลาง): ดึงเนื้อหาส่วนหนึ่งของหน้าออกไปเป็นหน้าต่างเล็กที่ลอยทับ "ทุกโปรแกรม"
 *   (ไปทำงานในโปรแกรมอื่น/แท็บอื่นก็ยังเห็น) — ใช้ Document Picture-in-Picture ของ Chrome / Edge
 *
 * ใช้เมื่อ: ตัวเลขหรือสถานะเล็ก ๆ ที่อยากให้เห็นตลอดขณะทำอย่างอื่น (นับถอยหลังขึ้นเว็บ · จับเวลา · สถานะงานยาว)
 * ห้ามใช้เมื่อ: แผงลอยแค่ในหน้าเว็บ (ใช้ FloatingPanel) · ฟอร์ม/ป๊อปอัปที่ต้องกรอก (ใช้ ERPModal) · แจ้งผลสั้น ๆ (ใช้ Toast)
 *
 *   const pip = usePipWindow();
 *   <button disabled={!pip.supported} onClick={() => void pip.open({ width: 320, height: 170 })}>ลอยไว้มุมจอ</button>
 *   <PipPortal win={pip.win}><MyMiniView /></PipPortal>
 *
 * - เนื้อหาใน PipPortal เป็นส่วนหนึ่งของหน้าเดิม (state เดียวกัน อัปเดตพร้อมกัน) · ปิดหน้าต่าง/ออกจากหน้า = หน้าต่างลอยปิดตาม
 * - หน้าต่างลอยมีได้ทีละ 1 บานต่อแท็บ (กฎของเบราว์เซอร์) · ต้องเปิดจากการกดปุ่มเท่านั้น
 * - ตัวจับเวลาที่อยากให้เดินแม้แท็บหลักอยู่เบื้องหลัง → ตั้งบน pip.win (หน้าต่างลอยมองเห็นอยู่ เบราว์เซอร์ไม่หน่วง) — ดู timerHost()
 * - ⚠️ ชิ้นส่วนที่ลอยตัวเองไปแปะ document.body (Toast · FloatingDropdown · ป๊อปอัปกลาง) จะไปโผล่ในหน้าหลัก ไม่ใช่ในหน้าต่างลอย
 * - เบราว์เซอร์อื่น (Safari/Firefox/มือถือ) supported = false → ซ่อนหรือปิดปุ่มไว้
 * คู่มือ: docs/pip-window.md
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DocumentPip = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
};

const documentPip = (): DocumentPip | null =>
  typeof window !== "undefined" && "documentPictureInPicture" in window
    ? (window as unknown as { documentPictureInPicture: DocumentPip }).documentPictureInPicture
    : null;

/** คัดหน้าตา (CSS/ฟอนต์/คลาสธีม) จากหน้าหลักไปเอกสารอื่นที่เว็บเดียวกัน (หน้าต่างลอย / หน้าต่างพิมพ์) ให้หน้าตาเหมือนกัน */
export function copyPageLook(to: Document) {
  const base = to.createElement("base");
  base.href = document.baseURI;          // ให้ลิงก์ฟอนต์/รูปแบบ "/_next/..." ในหน้าต่างลอยชี้ถูกเว็บ
  to.head.appendChild(base);
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = to.createElement("style");
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      to.head.appendChild(style);
    } catch {
      // CSS ข้ามเว็บ อ่านกฎไม่ได้ → แนบลิงก์เดิมแทน
      if (sheet.href) {
        const link = to.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
  to.documentElement.lang = document.documentElement.lang;
  to.documentElement.className = document.documentElement.className;
  to.body.className = document.body.className;
}

export type PipOpenOptions = { width: number; height: number; title?: string };

/** เบราว์เซอร์นี้เปิดหน้าต่างลอยได้ไหม (เรียกฝั่งเบราว์เซอร์เท่านั้น) */
export const pipSupported = (): boolean => !!documentPip();

/**
 * เปิดหน้าต่างลอยเปล่า (คัดหน้าตามาให้แล้ว) — ใช้นอก React tree ของหน้า เช่น ปุ่มในเมนูโปรไฟล์ แล้ว createRoot ลงไปเอง
 *   → ลอยค้างได้แม้เปลี่ยนหน้าในแท็บเดียวกัน (ปิดเมื่อปิดแท็บ/รีเฟรช) · ต้องเรียกจากการกดปุ่ม · ไม่รองรับ = null
 */
export async function openPipWindow(opts: PipOpenOptions): Promise<Window | null> {
  const api = documentPip();
  if (!api) return null;
  api.window?.close();                   // ทีละบาน
  const w = await api.requestWindow({ width: opts.width, height: opts.height });
  copyPageLook(w.document);
  if (opts.title) w.document.title = opts.title;
  return w;
}

/** หน้าต่างลอยผูกกับหน้า (ปิดตามเมื่อออกจากหน้า) — เนื้อหาวางด้วย <PipPortal> */
export function usePipWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(pipSupported()), []);   // เช็กหลังโหลด (กันหน้าจอ server/เบราว์เซอร์ไม่ตรงกัน)

  const open = useCallback(async (opts: PipOpenOptions): Promise<Window | null> => {
    const w = await openPipWindow(opts);
    if (!w) return null;
    w.addEventListener("pagehide", () => setWin(null), { once: true });
    setWin(w);
    return w;
  }, []);

  const close = useCallback(() => { win?.close(); setWin(null); }, [win]);

  // ออกจากหน้า (component หาย) → ปิดหน้าต่างลอยด้วย ไม่ให้ค้างเป็นหน้าว่าง
  useEffect(() => () => { win?.close(); }, [win]);

  return { supported, win, open, close };
}

/** วางเนื้อหาลงหน้าต่างลอย (win = null → ไม่วาดอะไร) */
export function PipPortal({ win, children }: { win: Window | null; children: ReactNode }) {
  if (!win) return null;
  return createPortal(children, win.document.body);
}

/** หน้าต่างที่ควรใช้ตั้งตัวจับเวลา: หน้าต่างลอย (ถ้าเปิดอยู่) ไม่งั้นหน้าหลัก */
export const timerHost = (win: Window | null | undefined): Window => win ?? window;
