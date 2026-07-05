"use client";

/**
 * useViewPref — จำ "มุมมองเริ่มต้น" ของหน้า ต่อผู้ใช้ (per-user)
 *   • เก็บใน user_ui_prefs ผ่าน /api/user-prefs (RLS เจ้าของเท่านั้น) → sync ข้ามเครื่อง
 *   • cache localStorage ด้วย → เปิดหน้าครั้งถัดไปได้มุมมองที่ตั้งไว้เกือบทันที (กระพริบน้อยสุด)
 * ใช้: const { view, setView, defaultView, saveDefault } = useViewPref("work_board_view", VIEWS, "board")
 *   - view / setView: มุมมองปัจจุบัน (setView = เปลี่ยนชั่วคราว ไม่บันทึก)
 *   - defaultView: มุมมองเริ่มต้นที่ผู้ใช้ตั้งไว้ (null = ยังไม่ตั้ง)
 *   - saveDefault(v): บันทึกให้ v เป็นค่าเริ่มต้นของฉัน
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export function useViewPref<T extends string>(key: string, options: readonly T[], fallback: T) {
  const lsKey = `viewpref:${key}`;
  const [view, setViewState] = useState<T>(fallback);
  const [defaultView, setDefaultView] = useState<T | null>(null);
  const touched = useRef(false);   // ผู้ใช้กดเปลี่ยนมุมมองเองแล้วหรือยัง (กันเซิร์ฟเวอร์เด้งทับ)

  useEffect(() => {
    let cancel = false;
    const valid = (v: unknown): v is T => typeof v === "string" && (options as readonly string[]).includes(v);
    // 1) localStorage (เร็ว) — ตั้งมุมมองก่อน network
    try {
      const v = localStorage.getItem(lsKey);
      if (valid(v)) { setDefaultView(v); if (!touched.current) setViewState(v); }
    } catch { /* ignore */ }
    // 2) เซิร์ฟเวอร์ (ของจริง ข้ามเครื่อง) — reconcile
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => {
      if (cancel) return;
      const v = (j?.value as { view?: unknown } | undefined)?.view;
      if (valid(v)) { setDefaultView(v); try { localStorage.setItem(lsKey, v); } catch { /* ignore */ } if (!touched.current) setViewState(v); }
    }).catch(() => { /* ignore */ });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setView = useCallback((v: T) => { touched.current = true; setViewState(v); }, []);
  const saveDefault = useCallback(async (v: T) => {
    setDefaultView(v);
    try { localStorage.setItem(lsKey, v); } catch { /* ignore */ }
    await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: { view: v } }) }).catch(() => { /* ignore */ });
  }, [key, lsKey]);

  return { view, setView, defaultView, saveDefault };
}
