import { useEffect, useRef } from "react";

/** โหลดข้อมูลใหม่เมื่อกลับมาที่แท็บ/หน้าต่าง (กันข้อมูลค้างเก่าหลังไปทำที่อื่นมา)
 *  มี throttle: ไม่ refetch ถ้าเพิ่งทำไปไม่ถึง minIntervalMs (กันยิงซ้ำทุกครั้งที่สลับแท็บ = ประหยัด request) */
export function useRefetchOnFocus(refetch: () => void, minIntervalMs = 30000) {
  const ref = useRef(refetch); ref.current = refetch;
  const lastRef = useRef(0);
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRef.current < minIntervalMs) return; // เพิ่งโหลดไป → ข้าม
      lastRef.current = now;
      ref.current();
    };
    window.addEventListener("focus", fn);
    document.addEventListener("visibilitychange", fn);
    return () => { window.removeEventListener("focus", fn); document.removeEventListener("visibilitychange", fn); };
  }, [minIntervalMs]);
}
