import { useEffect, useRef } from "react";

/** โหลดข้อมูลใหม่เมื่อกลับมาที่แท็บ/หน้าต่าง (กันข้อมูลค้างเก่าหลังไปทำที่อื่นมา) */
export function useRefetchOnFocus(refetch: () => void) {
  const ref = useRef(refetch); ref.current = refetch;
  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible") ref.current(); };
    window.addEventListener("focus", fn);
    document.addEventListener("visibilitychange", fn);
    return () => { window.removeEventListener("focus", fn); document.removeEventListener("visibilitychange", fn); };
  }, []);
}
