"use client";

/**
 * บันทึกการเข้าใช้หน้า (ของกลาง) — วางใน app/layout ครั้งเดียว ทุกหน้าได้ · ไม่วาดอะไรบนจอ
 *
 * - เปลี่ยนหน้า = +1 ในก้อนที่ค้างส่ง (รวมตามวัน+หน้า ในหน่วยความจำของแท็บนี้)
 * - ส่งขึ้นเซิร์ฟเวอร์ทุก ~60 วินาที และตอนสลับแท็บ/ปิดหน้า (keepalive) → ไม่ยิงทุกคลิก (ประหยัดเซิร์ฟเวอร์)
 * - ไม่ได้ล็อกอิน = ไม่ส่ง · ส่งแล้วโดน 401 = ทิ้งก้อน (กันค้างโต)
 * - แอปเดี่ยว /app/<key>: เปลือกนอกไม่นับ (หน้าจริงในกรอบนับเอง) · กรอบอื่น (พรีวิวอุปกรณ์/พิมพ์) ไม่นับ กันนับซ้ำ
 * กติกา path/วัน: lib/page-views · ผู้อ่าน: แท็บ "การเข้าใช้หน้า" ใน /admin/audit-log
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { addPageView, normalizePagePath, PAGE_VIEW_MAX_ITEMS, type PageViewItem } from "@/lib/page-views";

const FLUSH_MS = 60_000;
const buf = new Map<string, PageViewItem>();
let token: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastPath: string | null = null;

/** หน้านี้ควรนับไหม (ตามตำแหน่งหน้าต่าง) */
function shouldCount(path: string): boolean {
  let inFrame = false;
  let topPath = "";
  try { inFrame = window.self !== window.top; topPath = inFrame ? window.top!.location.pathname : window.location.pathname; }
  catch { return false; }   // อยู่ในกรอบของเว็บอื่น = ไม่นับ
  if (!inFrame) return !path.startsWith("/app/");        // เปลือกแอปเดี่ยว — ให้หน้าในกรอบนับเอง
  return topPath.startsWith("/app/");                     // ในกรอบ: นับเฉพาะกรอบของแอปเดี่ยว
}

async function refreshToken(): Promise<void> {
  try { token = (await supabaseBrowser.auth.getSession()).data.session?.access_token ?? null; } catch { token = null; }
}

function flush(final = false): void {
  if (buf.size === 0) return;
  if (!token) { if (final) buf.clear(); return; }
  const items = [...buf.values()].slice(0, PAGE_VIEW_MAX_ITEMS);
  buf.clear();
  void fetch("/api/page-views", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items }),
    keepalive: true,
  }).then((res) => {
    if (res.status === 401) { buf.clear(); void refreshToken(); return; }   // หมดสิทธิ์/ออกจากระบบ = ไม่เก็บต่อ
    if (!res.ok && !final) for (const it of items) if (!buf.has(`${it.day}|${it.path}`)) buf.set(`${it.day}|${it.path}`, it);   // ล้มชั่วคราว → ส่งรอบหน้า
  }).catch(() => { if (!final) for (const it of items) if (!buf.has(`${it.day}|${it.path}`)) buf.set(`${it.day}|${it.path}`, it); });
}

export function PageViewRecorder() {
  const pathname = usePathname();

  // ตั้งตัวส่งครั้งเดียวต่อแท็บ
  useEffect(() => {
    void refreshToken();
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => { token = s?.access_token ?? null; if (!token) buf.clear(); });
    if (!timer) timer = setInterval(() => { void refreshToken().then(() => flush()); }, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // เปลี่ยนหน้า = นับ 1 (หน้าเดิมแค่ query เปลี่ยน ไม่นับซ้ำ)
  useEffect(() => {
    const path = normalizePagePath(pathname);
    if (!path || pathname === lastPath) return;
    lastPath = pathname;
    if (shouldCount(pathname ?? "")) addPageView(buf, path);
  }, [pathname]);

  return null;
}
