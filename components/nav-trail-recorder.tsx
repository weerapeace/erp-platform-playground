"use client";

// บันทึกทางเดินหน้า (lib/nav-trail) ทุกครั้งที่เปลี่ยนหน้า — วางใน app/layout ครั้งเดียว · ไม่วาดอะไรบนจอ
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/lib/nav-trail";

export function NavTrailRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordVisit(pathname, window.location.search);
  }, [pathname]);
  return null;
}
