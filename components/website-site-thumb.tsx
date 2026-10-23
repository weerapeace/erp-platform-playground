"use client";

/**
 * 🖥 SiteThumb — ภาพย่อ "เว็บจริง" แบบสด (ของกลาง) — ใช้ใน: หน้ารวมเว็บไซต์ /website (หัวการ์ดร้าน)
 *
 * เปิดหน้าเว็บใน iframe ขนาดจอคอม (VIEW_W × VIEW_H) แล้วย่อให้พอดีกรอบ (ResizeObserver) → เห็นหน้าตาจริงล่าสุดเสมอ
 *   โหลดเมื่อเลื่อนถึง (loading=lazy) · โหลดเสร็จค่อย ๆ ขึ้น (ระหว่างรอ = พื้นหลังของผู้เรียก เช่น สีแบรนด์ + โลโก้)
 *   กดไม่ได้ (pointer-events none) — การ์ดรอบนอกเป็นตัวรับคลิก · sandbox กันเว็บพาหน้าหลักไปที่อื่น
 *   เว็บร้านไม่นับสถิติ/โฆษณาเมื่ออยู่ใน iframe (storefront lib/analytics trackingBlocked) → เปิดหน้านี้ไม่ทำยอดเข้าชมเพี้ยน
 * ห้ามใช้: แสดงหลายสิบอันในหน้าเดียว (แต่ละอันคือเว็บเต็มหน้า) → ใช้รูปแทน
 */
import { useEffect, useRef, useState } from "react";

const VIEW_W = 1440;
const VIEW_H = 900;

export function SiteThumb({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / VIEW_W);
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={boxRef} className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {scale > 0 && (
        <iframe
          src={url}
          title={title}
          tabIndex={-1}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          // หน้าเว็บ "โหลดเสร็จ" ก่อนรูปใหญ่ขึ้นจริง → รออีกนิดค่อยโชว์ (ไม่เห็นหน้าขาวแวบ)
          onLoad={() => window.setTimeout(() => setLoaded(true), 1500)}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white transition-opacity duration-500"
          style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${scale})`, opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}
