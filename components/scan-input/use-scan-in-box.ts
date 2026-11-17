"use client";
// useScanInBox — ยิงบาร์โค้ดเข้า "ช่องค้นหาที่โฟกัสอยู่" (ของกลาง · คู่กับ useScanGun ที่จับตอนไม่ได้โฟกัสช่อง)
//   const scan = useScanInBox((code) => { setQuery(code); pickExact(code); });
//   <input onKeyDown={scan.onKeyDown} … />
// คนพิมพ์ = ทำงานปกติ · เครื่องยิง (รัว + Enter) = ได้รหัสตามปุ่มจริง (แป้นไทยก็ถูก) แล้วเรียก onScan
import { useRef } from "react";
import { typedChar } from "@/lib/shortcut-key";
import { detectScanBurst, type KeyStamp } from "@/lib/scan-burst";

export function useScanInBox(onScan: (code: string) => void) {
  const stamps = useRef<KeyStamp[]>([]);
  const cb = useRef(onScan);
  cb.current = onScan;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) { stamps.current = []; return; }
    const now = performance.now();
    if (e.key === "Enter") {
      const code = detectScanBurst(stamps.current, now);
      stamps.current = [];
      if (code) { e.preventDefault(); cb.current(code); }
      return;
    }
    const ch = typedChar(e.nativeEvent);
    if (!ch) return;
    stamps.current.push({ t: now, ch });
    if (stamps.current.length > 64) stamps.current.splice(0, stamps.current.length - 64);
  };
  return { onKeyDown };
}
