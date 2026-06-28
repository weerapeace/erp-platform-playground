"use client";

// ของกลาง: เช็คขนาดจอแบบ reactive (responsive) — คืน false ฝั่ง SSR กัน hydration เพี้ยน
// ใช้: const isWide = useMediaQuery("(min-width: 1024px)")
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
