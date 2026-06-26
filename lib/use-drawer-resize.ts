"use client";

// ============================================================
// useDrawerResize (ของกลาง) — ลากขอบซ้ายของ drawer ชิดขวาเพื่อปรับความกว้าง + จำค่าไว้ (localStorage)
// ใช้: const { width, startResize } = useDrawerResize("taskDrawerWidth", 640)
//   <div style={{ width }} className="fixed right-0 ... max-w-[97vw]">
//     <div onMouseDown={startResize} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize ..." />
// ============================================================

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

export function useDrawerResize(storageKey: string, defaultWidth = 640, min = 480) {
  const [width, setWidth] = useState(defaultWidth);
  // โหลดค่าที่จำไว้ (หลัง mount เพื่อกัน SSR mismatch)
  useEffect(() => { const v = Number(localStorage.getItem(storageKey)); if (v && v >= min) setWidth(v); }, [storageKey, min]);

  // drawer ชิดขวา → ความกว้าง = ระยะจากขอบขวาจอถึงเมาส์
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setWidth(Math.min(window.innerWidth * 0.97, Math.max(min, window.innerWidth - ev.clientX)));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setWidth((w) => { try { localStorage.setItem(storageKey, String(Math.round(w))); } catch { /* ignore */ } return w; });
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  return { width, startResize };
}
