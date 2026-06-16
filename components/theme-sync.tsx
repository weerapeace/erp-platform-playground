"use client";

/**
 * ThemeSync (ของกลาง) — ใช้สีเน้น (accent) ของผู้ใช้
 * - mount: ตั้งค่า --accent จาก localStorage ทันที (กันกระพริบ)
 * - ล็อกอินแล้ว: โหลดสีของบัญชี → ตั้งให้ตรง · เปลี่ยนสี → บันทึกกลับเข้าบัญชี
 * วางในเชลล์ (หน้าที่ล็อกอิน) — ทำงานเงียบ ไม่มี UI
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth";
import { getTheme, initTheme, setTheme, subscribeTheme } from "@/lib/theme";
import { apiFetch } from "@/lib/api";

export function ThemeSync() {
  const { user, ready } = useAuth();
  const loaded = useRef(false);
  const skipSave = useRef(true);

  // init จาก localStorage ทันทีตอน mount
  useEffect(() => { initTheme(); }, []);

  // โหลดสีของบัญชีหลังล็อกอิน
  useEffect(() => {
    if (!ready || !user || loaded.current) return;
    loaded.current = true;
    apiFetch("/api/me/theme").then((r) => r.json()).then((j) => {
      if (typeof j.theme_color === "string" || j.theme_color === null) setTheme(j.theme_color);
    }).catch(() => {}).finally(() => { skipSave.current = false; });
  }, [ready, user]);

  // บันทึกเมื่อสลับสี (ข้ามตอนโหลดครั้งแรก)
  useEffect(() => {
    const unsub = subscribeTheme(() => {
      if (!ready || !user || skipSave.current) return;
      apiFetch("/api/me/theme", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme_color: getTheme() }),
      }).catch(() => {});
    });
    return unsub;
  }, [ready, user]);

  return null;
}
