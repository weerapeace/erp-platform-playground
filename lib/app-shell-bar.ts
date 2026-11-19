"use client";

/**
 * หน้า (ในกรอบแอปเดี่ยว /app/<key>) บอกเชลล์แอปให้ซ่อนของของเชลล์ (ของกลาง)
 *
 * 1) แถบล่างซ้อน 2 แถบ (เจ้าของสั่ง 2026-11-11 "เอาเมนูข้างล่างออก มันซ้อนกัน ให้ไปอยู่ใน ขีด 3 ขีด")
 *    ปัญหา: หน้าที่มีแถบล่างของตัวเอง (เช่น Design Dashboard มือถือ: บอร์ด/วันนี้/ไลน์/เมนู) เปิดในกรอบแอปเดี่ยว
 *           → เชลล์แอปมีแถบเมนูแอปอีกแถบใต้กัน = 2 แถบซ้อน
 *    ทางแก้: หน้าแจ้งเชลล์ว่า "หน้านี้มีแถบล่างเอง" → เชลล์ซ่อนแถบเมนูแอป (เมนูแอปยังเปิดได้ที่ ☰ มุมซ้ายบน)
 *      ในหน้า:  usePageOwnsBottomBar(isPhone)
 *      ในเชลล์: const pageBar = useEmbeddedPageBar(iframeRef, key)   // true = ซ่อนแถบเมนูแอป
 *
 * 2) หน้าเต็มจอ (เจ้าของขอ 2026-11-19 กระดานเต็มจอแบบ Miro แต่หัวแอปสีเข้มยังทับอยู่ เพราะหน้าอยู่ในกรอบ)
 *    หน้าแจ้ง "ขอเต็มกรอบ" → เชลล์ซ่อนหัวแอป + แถบเมนูแอป · ออกจากเต็มจอ/เปลี่ยนหน้า = กลับมาเหมือนเดิม
 *      ในหน้า:  usePageWantsFullFrame(on)        (ของกลาง FullscreenStage เรียกให้เอง)
 *      ในเชลล์: const full = useEmbeddedFullFrame(iframeRef, key)
 *
 * หน้าที่ไม่ได้แจ้ง = เชลล์เหมือนเดิม · ส่งข้อความผ่าน postMessage เฉพาะโดเมนเดียวกัน
 * เปลี่ยนหน้าในกรอบ = หน้าเก่าบอก "ไม่มีแล้ว" · โหลดหน้าใหม่ทั้งหน้า = เชลล์ถามใหม่
 */
import { useEffect, useState, type RefObject } from "react";

const SRC = "erp-app-shell";
type Flag = "page-bar" | "page-full";
type ShellMsg = { source: typeof SRC; type: Flag; on: boolean } | { source: typeof SRC; type: `ask-${Flag}` };
const isMsg = (d: unknown): d is ShellMsg => !!d && typeof d === "object" && (d as { source?: unknown }).source === SRC;

/** ฝั่งหน้า: บอกเชลล์ค่าธง (ไม่ได้อยู่ในกรอบ = ไม่ทำอะไร) */
function usePageFlag(flag: Flag, on: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const send = (v: boolean) => {
      try { window.parent.postMessage({ source: SRC, type: flag, on: v } satisfies ShellMsg, window.location.origin); } catch { /* กรอบต่างโดเมน */ }
    };
    send(on);
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && isMsg(e.data) && e.data.type === `ask-${flag}`) send(on); };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); if (on) send(false); };
  }, [flag, on]);
}

/** ฝั่งเชลล์: อ่านค่าธงจากหน้าในกรอบ · resetKey = เปลี่ยนเมื่อสร้างกรอบใหม่ (เปลี่ยนเมนู) → เริ่มจาก false แล้วรอหน้าบอก */
function useEmbeddedFlag(flag: Flag, frame: RefObject<HTMLIFrameElement | null>, resetKey: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [resetKey]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !isMsg(e.data) || e.data.type !== flag) return;
      if (frame.current && e.source !== frame.current.contentWindow) return;   // มาจากกรอบอื่น
      setOn(!!(e.data as { on?: boolean }).on);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [flag, frame]);
  // กรอบโหลดหน้าใหม่ทั้งหน้า → ล้างค่า แล้วถามหน้าใหม่ (หน้าที่บอกไว้ก่อนโหลดเสร็จจะตอบกลับมาอีกครั้ง)
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const onLoad = () => {
      setOn(false);
      try { f.contentWindow?.postMessage({ source: SRC, type: `ask-${flag}` } satisfies ShellMsg, window.location.origin); } catch { /* ยังไม่พร้อม */ }
    };
    f.addEventListener("load", onLoad);
    return () => f.removeEventListener("load", onLoad);
  }, [flag, frame, resetKey]);
  return on;
}

/** หน้า (เปิดในกรอบแอปเดี่ยว) บอกเชลล์ว่ามีแถบล่างของตัวเองไหม */
export function usePageOwnsBottomBar(on: boolean): void { usePageFlag("page-bar", on); }

/** เชลล์แอปเดี่ยว: หน้าในกรอบมีแถบล่างของตัวเองไหม (true = ซ่อนแถบเมนูแอป) */
export function useEmbeddedPageBar(frame: RefObject<HTMLIFrameElement | null>, resetKey: string): boolean {
  return useEmbeddedFlag("page-bar", frame, resetKey);
}

/** หน้า (เปิดในกรอบแอปเดี่ยว) ขอเต็มกรอบ — เชลล์ซ่อนหัวแอป + แถบเมนูแอป */
export function usePageWantsFullFrame(on: boolean): void { usePageFlag("page-full", on); }

/** เชลล์แอปเดี่ยว: หน้าในกรอบขอเต็มกรอบไหม (true = ซ่อนหัวแอป + แถบเมนูแอป) */
export function useEmbeddedFullFrame(frame: RefObject<HTMLIFrameElement | null>, resetKey: string): boolean {
  return useEmbeddedFlag("page-full", frame, resetKey);
}
