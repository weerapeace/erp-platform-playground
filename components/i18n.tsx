"use client";

// ============================================================
// i18n (ของกลาง) — โหมด 2 ภาษา ไทย/อังกฤษ
//   useT() → t("ไทย","English") แปลตรงจุด (ไม่ต้องทำ dictionary key)
//   <LangToggle/> ปุ่มสลับภาษา · <LanguageProvider> ครอบที่ root
// ============================================================

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getLang, setLang as setLangCore, initLang, subscribeLang, type Lang } from "@/lib/lang";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "th", setLang: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th"); // เริ่ม th เสมอ (ตรงกับ SSR) แล้วค่อย sync จาก storage หลัง mount
  useEffect(() => {
    setLangState(initLang());
    return subscribeLang(setLangState);
  }, []);
  const setLang = useCallback((l: Lang) => setLangCore(l), []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() { return useContext(Ctx); }

/** t("ไทย","English") — คืนข้อความตามภาษาปัจจุบัน (re-render เมื่อสลับภาษา) */
export function useT() {
  const { lang } = useLang();
  return useCallback((th: string, en: string) => (lang === "en" ? en : th), [lang]);
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <button onClick={() => setLang(lang === "th" ? "en" : "th")} title={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      className={`h-9 px-2.5 flex items-center gap-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors ${className}`}>
      <span className={lang === "th" ? "text-violet-700" : "text-slate-400"}>TH</span>
      <span className="text-slate-300">/</span>
      <span className={lang === "en" ? "text-violet-700" : "text-slate-400"}>EN</span>
    </button>
  );
}
