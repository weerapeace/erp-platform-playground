"use client";

/**
 * KeepWarm — heartbeat กัน Cloudflare Worker "เย็น" (cold-start) ระหว่าง user ใช้งาน
 *
 * ปัญหา: traffic น้อย → Cloudflare evict isolate → เกือบทุก request เป็น cold (~2 วิ) แม้ query เบา
 * วิธี: ขณะแท็บเปิดอยู่ (visible) ยิง /api/ping ทุก ~25 วิ → isolate ของ colo ผู้ใช้อุ่นไว้
 *       → request จริงของผู้ใช้เป็น warm = เร็วขึ้นทั้งระบบ
 * - ping แค่ตอนแท็บ visible (ไม่กินเน็ต/แบตเปล่าตอนพับไว้)
 * - ยิงทันที 1 ครั้งตอนเปิด (อุ่นก่อนผู้ใช้กดอะไร) แล้ววนทุก 25 วิ
 */
import { useEffect } from "react";

export function KeepWarm({ intervalMs = 25000 }: { intervalMs?: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = () => { if (document.visibilityState === "visible") { void fetch("/api/ping", { cache: "no-store" }).catch(() => {}); } };
    const start = () => { if (timer) return; ping(); timer = setInterval(ping, intervalMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.visibilityState === "visible") start(); else stop(); };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [intervalMs]);
  return null;
}
