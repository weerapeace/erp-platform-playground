"use client";

/**
 * แถบล่างซ้อน 2 แถบในแอปเดี่ยว (ของกลาง · เจ้าของสั่ง 2026-11-11 "เอาเมนูข้างล่างออก มันซ้อนกัน ให้ไปอยู่ใน ขีด 3 ขีด")
 *
 * ปัญหา: หน้าที่มีแถบล่างของตัวเอง (เช่น Design Dashboard มือถือ: บอร์ด/วันนี้/ไลน์/เมนู) เปิดในกรอบแอปเดี่ยว /app/<key>
 *        → เชลล์แอปมีแถบเมนูแอปอีกแถบใต้กัน = 2 แถบซ้อน
 * ทางแก้: หน้าแจ้งเชลล์ว่า "หน้านี้มีแถบล่างเอง" → เชลล์ซ่อนแถบเมนูแอป (เมนูแอปยังเปิดได้ที่ ☰ มุมซ้ายบน)
 *         หน้าที่ไม่ได้แจ้ง = แถบเมนูแอปอยู่ตามเดิม (แอปอื่น/หน้าอื่นไม่เปลี่ยน)
 *
 *   ในหน้า:  usePageOwnsBottomBar(isPhone)                       // หน้านี้มีแถบล่างของตัวเองบนมือถือ
 *   ในเชลล์: const pageBar = useEmbeddedPageBar(iframeRef, key)  // true = ซ่อนแถบเมนูแอป
 *
 * ส่งข้อความผ่าน postMessage เฉพาะโดเมนเดียวกัน · เปลี่ยนหน้าในกรอบ = หน้าเก่าบอก "ไม่มีแล้ว" · โหลดหน้าใหม่ทั้งหน้า = เชลล์ถามใหม่
 */
import { useEffect, useState, type RefObject } from "react";

const SRC = "erp-app-shell";
type BarMsg = { source: typeof SRC; type: "page-bar"; on: boolean } | { source: typeof SRC; type: "ask-page-bar" };
const isMsg = (d: unknown): d is BarMsg => !!d && typeof d === "object" && (d as { source?: unknown }).source === SRC;

/** หน้า (เปิดในกรอบแอปเดี่ยว) บอกเชลล์ว่ามีแถบล่างของตัวเองไหม — ไม่ได้อยู่ในกรอบ = ไม่ทำอะไร */
export function usePageOwnsBottomBar(on: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const send = (v: boolean) => {
      try { window.parent.postMessage({ source: SRC, type: "page-bar", on: v } satisfies BarMsg, window.location.origin); } catch { /* กรอบต่างโดเมน */ }
    };
    send(on);
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && isMsg(e.data) && e.data.type === "ask-page-bar") send(on); };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); if (on) send(false); };
  }, [on]);
}

/** เชลล์แอปเดี่ยว: หน้าในกรอบมีแถบล่างของตัวเองไหม (true = ซ่อนแถบเมนูแอป)
 *  resetKey = เปลี่ยนเมื่อสร้างกรอบใหม่ (เปลี่ยนเมนู) → เริ่มจาก false แล้วรอหน้าบอก */
export function useEmbeddedPageBar(frame: RefObject<HTMLIFrameElement | null>, resetKey: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [resetKey]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !isMsg(e.data) || e.data.type !== "page-bar") return;
      if (frame.current && e.source !== frame.current.contentWindow) return;   // มาจากกรอบอื่น
      setOn(!!e.data.on);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [frame]);
  // กรอบโหลดหน้าใหม่ทั้งหน้า → ล้างค่า แล้วถามหน้าใหม่ (หน้าที่บอกไว้ก่อนโหลดเสร็จจะตอบกลับมาอีกครั้ง)
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const onLoad = () => {
      setOn(false);
      try { f.contentWindow?.postMessage({ source: SRC, type: "ask-page-bar" } satisfies BarMsg, window.location.origin); } catch { /* ยังไม่พร้อม */ }
    };
    f.addEventListener("load", onLoad);
    return () => f.removeEventListener("load", onLoad);
  }, [frame, resetKey]);
  return on;
}
