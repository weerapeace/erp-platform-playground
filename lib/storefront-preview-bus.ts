"use client";

/**
 * 📡 ช่องคุยกับพรีวิวเว็บร้าน (iframe ในแท็บดีไซน์) — ของกลาง
 * แท็บดีไซน์ (website-theme-panel) ลงทะเบียน iframe ด้วย setPreviewFrame · แผงตั้งค่าลูก ๆ ส่งข้อความเข้า/ฟังข้อความออกได้โดยไม่ต้องส่ง ref ต่อกันหลายชั้น
 * ฟังเฉพาะข้อความที่มาจาก iframe พรีวิวจริง (เทียบ e.source) — หน้าอื่นส่งปลอมเข้ามาไม่ได้
 * ใช้: ชุดปรับหน้าตาชิ้นส่วน (คลิกเลือกชิ้นในพรีวิว — เว็บร้าน PartPickBridge)
 */
import { useEffect, useRef } from "react";

let frame: HTMLIFrameElement | null = null;

export function setPreviewFrame(el: HTMLIFrameElement | null) {
  frame = el;
}

export function sendToPreview(msg: Record<string, unknown>) {
  frame?.contentWindow?.postMessage(msg, "*");
}

/** ฟังข้อความจากพรีวิว (handler เปลี่ยนได้ทุก render — ไม่ต้อง useCallback) */
export function usePreviewMessages(handler: (data: Record<string, unknown>) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow) return;
      if (e.data && typeof e.data === "object") ref.current(e.data as Record<string, unknown>);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
}
