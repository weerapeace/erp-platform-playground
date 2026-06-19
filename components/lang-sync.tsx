"use client";

/**
 * LangSync (ของกลาง) — ผูกภาษาที่เลือกกับ "บัญชี" (user_profiles.language)
 * - ล็อกอินแล้ว: โหลดภาษาที่บันทึกไว้ของบัญชี → ตั้งให้ตรง
 * - สลับภาษา: บันทึกกลับเข้าบัญชีอัตโนมัติ
 * วางไว้ในเชลล์ (เฉพาะหน้าที่ล็อกอิน) — ทำงานเงียบ ไม่มี UI
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth";
import { useLang } from "@/components/i18n";
import { apiFetch } from "@/lib/api";

export function LangSync() {
  const { user, ready } = useAuth();
  const { lang, setLang } = useLang();
  const loaded = useRef(false);
  const skipSave = useRef(true);

  // โหลดภาษาของบัญชี (ครั้งแรกหลังล็อกอิน)
  useEffect(() => {
    if (!ready || !user || loaded.current) return;
    loaded.current = true;
    // perf: ภาษามีค่า default อยู่แล้ว → เลื่อนซิงก์จากบัญชีไปหลังเนื้อหาหลักโหลด (กันแย่ง resource)
    const t = setTimeout(() => {
      apiFetch("/api/me/language").then((r) => r.json()).then((j) => {
        if (j.language === "en" || j.language === "th") setLang(j.language);
      }).catch(() => {}).finally(() => { skipSave.current = false; });
    }, 1200);
    return () => clearTimeout(t);
  }, [ready, user, setLang]);

  // บันทึกเมื่อสลับภาษา (ข้ามตอนโหลดครั้งแรก)
  useEffect(() => {
    if (!ready || !user || skipSave.current) return;
    apiFetch("/api/me/language", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  }, [lang, ready, user]);

  return null;
}
