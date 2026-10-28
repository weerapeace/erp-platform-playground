"use client";

/**
 * 🗂 DesignCard — การ์ดตั้งค่าพับ/กางได้ของหน้าดีไซน์ (การ์ดในโฟลเดอร์นี้ + Card ของตะกร้า/ชำระเงิน/แนะนำสินค้า ใช้ร่วม)
 *   - พับอยู่ = เห็นหัวการ์ด + สรุปค่าบรรทัดเดียว (ไม่ส่ง summary = ใช้คำอธิบาย hint)
 *   - จำว่าพับ/กางไว้ "ต่อคน" (user_ui_prefs website_design_cards) · ยังไม่เคยกด = การ์ดใบแรกของหน้ากาง ที่เหลือพับ (หรือ defaultOpen)
 *   - ปุ่ม "กางทั้งหมด / พับทั้งหมด" (DesignCardsToggleAll) + ค้นหาเจอการ์ด = กางให้เอง (event website-design-focus)
 * ใช้: <DesignCard title="🖼 โลโก้ท้ายเว็บ" summary="ใช้โลโก้พื้นเข้ม · 36px">…ช่องตั้งค่า…</DesignCard>
 * นอก DesignCardsProvider = การ์ดธรรมดา กางตลอด (ที่อื่นที่ยืมไปใช้หน้าตาเหมือนเดิม)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { normTitle } from "@/lib/website-design-nav";

type OpenMap = Record<string, boolean>;
interface CardsCtx {
  /** หน้าที่เปิดอยู่ (คีย์จำค่าพับ = หน้า:ชื่อการ์ด) */
  page: string;
  saved: OpenMap;
  setSaved: (v: OpenMap) => void;
  /** การ์ดที่อยู่บนจอ (เรียงตามลำดับบนจอ) → ค่าเริ่มต้นที่การ์ดขอ */
  mounted: MutableRefObject<Map<string, boolean | undefined>>;
  register: (key: string, fallback: boolean | undefined) => () => void;
}
const Ctx = createContext<CardsCtx | null>(null);
const parseMap = (v: unknown): OpenMap | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "boolean")) as OpenMap) : null;

/** สถานะจริงของการ์ด: ที่จำไว้ → defaultOpen → ใบแรกของหน้ากาง */
function effectiveOpen(c: CardsCtx, key: string, fallback: boolean | undefined): boolean {
  if (key in c.saved) return c.saved[key];
  if (fallback !== undefined) return fallback;
  return c.mounted.current.keys().next().value === key;
}

/** ครอบเนื้อหาหน้าดีไซน์ — การ์ดข้างในพับได้ + จำค่าต่อคน */
export function DesignCardsProvider({ page, children }: { page: string; children: ReactNode }) {
  const [saved, setSaved] = useUserPref<OpenMap>("website_design_cards", {}, parseMap);
  const mounted = useRef(new Map<string, boolean | undefined>());
  // ver เปลี่ยนเมื่อการ์ดลงทะเบียน → การ์ดวาดใหม่ (รู้ว่าใบไหนเป็นใบแรกของหน้า)
  const [ver, bump] = useState(0);
  // คงที่ตลอด (ไม่งั้นการ์ดลงทะเบียนใหม่ทุกครั้งที่กด แล้วลำดับ "ใบแรก" เพี้ยน)
  const register = useCallback((key: string, fallback: boolean | undefined) => {
    mounted.current.set(key, fallback);
    bump((n) => n + 1);
    return () => {
      mounted.current.delete(key);
      bump((n) => n + 1);
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<CardsCtx>(() => ({ page, saved, setSaved, mounted, register }), [page, saved, setSaved, register, ver]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** อยู่ในหน้าดีไซน์ (การ์ดพับได้) ไหม — ให้การ์ดของไฟล์อื่น (เช่น Card ตะกร้า) เลือกหน้าตาได้ */
export const useInDesignCards = () => useContext(Ctx) !== null;

/** ปุ่ม "กางทั้งหมด / พับทั้งหมด" ของหน้าที่เปิดอยู่ — ไม่โชว์ถ้าการ์ดพับได้ไม่ถึง 2 ใบ */
export function DesignCardsToggleAll({ className = "" }: { className?: string }) {
  const c = useContext(Ctx);
  if (!c || c.mounted.current.size < 2) return null;
  const entries = [...c.mounted.current.entries()];
  const allOpen = entries.every(([k, fb]) => effectiveOpen(c, k, fb));
  const setAll = (open: boolean) => c.setSaved({ ...c.saved, ...Object.fromEntries(entries.map(([k]) => [k, open])) });
  return (
    <button type="button" onClick={() => setAll(!allOpen)} className={`shrink-0 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:border-slate-400 ${className}`} data-design-toggle-all>
      {allOpen ? "พับทั้งหมด" : "กางทั้งหมด"}
    </button>
  );
}

export function DesignCard({
  title,
  hint,
  summary,
  right,
  defaultOpen,
  children,
  className = "",
}: {
  /** หัวการ์ด (ข้อความ — ใช้เป็นคีย์จำค่าพับ + ให้ค้นหาเจอ) */
  title: string;
  hint?: ReactNode;
  /** สรุปค่าตอนพับ (บรรทัดเดียว) */
  summary?: ReactNode;
  /** ของด้านขวาหัวการ์ด เช่น สวิตช์เปิด/ปิด (กดแล้วการ์ดไม่พับ/กาง) */
  right?: ReactNode;
  /** ไม่ใส่ = ใบแรกของหน้ากาง ที่เหลือพับ */
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  const key = ctx ? `${ctx.page}:${normTitle(title)}` : "";
  const register = ctx?.register;
  useEffect(() => (register ? register(key, defaultOpen) : undefined), [register, key, defaultOpen]);
  const open = ctx ? effectiveOpen(ctx, key, defaultOpen) : true;
  const setOpen = (v: boolean) => ctx?.setSaved({ ...ctx.saved, [key]: v });
  // ค้นหาเจอการ์ดนี้ → กางให้
  const openRef = useRef({ open, setOpen });
  openRef.current = { open, setOpen };
  useEffect(() => {
    if (!ctx) return;
    const want = normTitle(title);
    const on = (e: Event) => {
      const d = normTitle(String((e as CustomEvent).detail ?? ""));
      if (d && want.startsWith(d) && !openRef.current.open) openRef.current.setOpen(true);
    };
    window.addEventListener("website-design-focus", on);
    return () => window.removeEventListener("website-design-focus", on);
  }, [ctx, title]);

  if (!ctx) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`} data-design-card={title}>
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
          </div>
          {right}
        </div>
        {children}
      </div>
    );
  }
  const brief = summary ?? hint;
  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${className}`} data-design-card={title} data-open={open ? "1" : "0"}>
      <div className="flex items-start gap-2 px-4 py-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `พับ ${title}` : `กาง ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className={`mt-0.5 w-4 h-4 shrink-0 text-[10px] leading-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {open ? hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p> : brief && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{brief}</p>}
        </div>
        {right && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {right}
          </div>
        )}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
