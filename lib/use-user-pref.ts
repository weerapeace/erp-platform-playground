"use client";

/**
 * useUserPref — จำค่าตั้งของหน้าจอ "ต่อคน" (ค่าอะไรก็ได้ที่เป็น JSON เช่น รายการหมวดโปรด / โหมดที่เลือกไว้)
 *   • เก็บใน user_ui_prefs ผ่าน /api/user-prefs (เจ้าของเท่านั้น) → ตามไปทุกเครื่อง
 *   • cache localStorage → เปิดหน้าครั้งถัดไปได้ค่าเดิมเกือบทันที
 * ใช้: const [favs, setFavs] = useUserPref("website_sorter_favs", [] as string[], (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : null))
 *   - parse = ตรวจ/แปลงค่าที่อ่านมา (ผิดรูป = null → ใช้ fallback)
 *   - setValue(v) = เปลี่ยนทันที + บันทึก (ไม่ต้องกดบันทึก)
 * ค่าที่เป็น "มุมมองเริ่มต้น" (string จากชุดตัวเลือก) ใช้ useViewPref เดิม
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export function useUserPref<T>(key: string, fallback: T, parse: (raw: unknown) => T | null): [T, (v: T) => void] {
  const lsKey = `userpref:${key}`;
  const [value, setValueState] = useState<T>(fallback);
  const touched = useRef(false); // ผู้ใช้เปลี่ยนเองแล้ว = ค่าจากเซิร์ฟเวอร์ที่มาทีหลังไม่ทับ
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    let cancel = false;
    touched.current = false;
    try {
      const raw = localStorage.getItem(lsKey);
      const v = raw == null ? null : parseRef.current(JSON.parse(raw));
      if (v !== null) setValueState(v);
    } catch {
      /* ignore */
    }
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel || touched.current) return;
        const raw = (j?.value as { v?: unknown } | undefined)?.v;
        if (raw === undefined) return;
        const v = parseRef.current(raw);
        if (v === null) return;
        setValueState(v);
        try {
          localStorage.setItem(lsKey, JSON.stringify(raw));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* ignore — ใช้ค่าในเครื่อง */
      });
    return () => {
      cancel = true;
    };
  }, [key, lsKey]);

  const setValue = useCallback(
    (v: T) => {
      touched.current = true;
      setValueState(v);
      try {
        localStorage.setItem(lsKey, JSON.stringify(v));
      } catch {
        /* ignore */
      }
      void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: { v } }) }).catch(() => {
        /* ignore */
      });
    },
    [key, lsKey],
  );

  return [value, setValue];
}
