"use client";

/**
 * แถว "ขอแก้หน้านี้" ในเมนูโปรไฟล์ (AccountMenu — ทั้งแถบบนมือถือและแถบข้าง PC)
 * เห็นเฉพาะคนที่มีสิทธิ์จัดการงานแก้ (report.manage) · กดแล้วเปิดป๊อป AppChangeRequestModal ผูกหน้าที่เปิดอยู่
 * (ไม่ทำปุ่มลอยแยก — ศูนย์แจ้งเตือน Pet เป็นของลอยตัวเดียวของระบบ)
 */
import { useState } from "react";
import { usePathname } from "next/navigation";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import dynamic from "next/dynamic";

// ป๊อปโหลดเมื่อกดเท่านั้น (เมนูโปรไฟล์อยู่ทุกหน้า — ไม่ให้ทุกหน้าแบกโค้ดป๊อป/อัปโหลด)
const AppChangeRequestModal = dynamic(() => import("./request-modal").then((m) => m.AppChangeRequestModal), { ssr: false });

export function useAppChangeMenu() {
  const can = usePermission("report.manage");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  return {
    can,
    openFor: () => { setTitle(typeof document !== "undefined" ? document.title.split(/\s[|·–-]\s/)[0].trim() || null : null); setOpen(true); },
    modal: can && open ? <AppChangeRequestModal open={open} onClose={() => setOpen(false)} pagePath={path} pageTitle={title} /> : null,
  };
}

export function AppChangeMenuRow({ className, onClick }: { className: string; onClick: () => void }) {
  return (
    <button type="button" className={className} onClick={onClick}>
      <Icon value="i:pencil" /> ขอแก้หน้านี้
    </button>
  );
}
