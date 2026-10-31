"use client";

/**
 * Page Chrome — ของกลาง: ให้หน้าเอา "ชื่อหน้า / ช่องค้นหา / ปุ่ม / ตัวเลือกมุมมอง" ไปวางบนแถบบนของเชลล์ (แบบแอป)
 * --------------------------------------------------------------------------
 *   usePageChrome({ title, search, actions, viewOptions })   ← หน้าลงทะเบียน (หลายคอมโพเนนต์ลงคนละช่องได้ — รวมกันให้)
 *     ปุ่ม (actions) หลายชุด = วางต่อกัน ไม่ทับกัน (เดิมชุดหลังทับชุดแรก → ปุ่มสแกนของตารางบอร์ดทำปุ่ม อัปเดต/คำขอ/สร้างใบ/··· หาย)
 *
 * ใครวาด:
 *   - เชลล์หลัก จอ < xl (iPad/มือถือ): แถบบน = ☰ · <PageChromeBar/> · ปุ่มผู้ใช้ (ในเมนูผู้ใช้มี "มุมมองหน้านี้" = viewOptions)
 *   - จอคอม (xl+) / ไม่มีเชลล์ (iframe embed): หน้าวาด <PageChromeBar variant="page"/> เอง
 *       → useChromeHost() บอกว่ามีเชลล์รับวาดอยู่ไหม (มี = ซ่อนแถบของหน้าที่จอเล็กด้วย "hidden xl:flex")
 * ช่องค้นหามีปุ่มสลับ "ในหน้านี้ / ทั้งระบบ" (ทั้งระบบ = เปิดค้นหากลางของเชลล์)
 */
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FloatingDropdown } from "@/components/floating-dropdown";

export type PageChromeSearch = { value: string; onChange: (v: string) => void; placeholder?: string };
export type PageChromeSlots = { title?: ReactNode; search?: PageChromeSearch | null; actions?: ReactNode; viewOptions?: ReactNode };

// ---- store ระดับโมดูล (ไม่ต้องครอบ Provider) ----
const regs = new Map<number, PageChromeSlots>();
let merged: PageChromeSlots = {};
let hosts = 0;
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => {
  const m: PageChromeSlots = {};
  const acts: { id: number; node: ReactNode }[] = [];
  for (const [id, s] of regs) {
    for (const [k, v] of Object.entries(s)) if (v !== undefined && k !== "actions") (m as Record<string, unknown>)[k] = v;
    if (s.actions) acts.push({ id, node: s.actions });
  }
  // ปุ่มหลายชุด = วางต่อกัน · ชุดของคอมโพเนนต์ด้านใน (ลงทะเบียนทีหลัง) มาก่อน = ติดช่องค้นหา (เช่น "สแกน" ของตารางบอร์ด)
  if (acts.length) m.actions = acts.length === 1 ? acts[0].node : <>{acts.sort((a, b) => b.id - a.id).map((a) => <Fragment key={a.id}>{a.node}</Fragment>)}</>;
  merged = m;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** หน้าลงทะเบียนของบนแถบบน — เรียกทุก render ได้ (อัปเดตตามค่าล่าสุด) · ถอดออกเองตอนออกจากหน้า */
export function usePageChrome(slots: PageChromeSlots) {
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  useEffect(() => { regs.set(id.current, slots); emit(); });
  useEffect(() => { const k = id.current; return () => { regs.delete(k); emit(); }; }, []);
}

/** อ่านของที่หน้าลงทะเบียนไว้ (เชลล์ / เมนูผู้ใช้ / แถบของหน้า) */
export function usePageChromeSlots(): PageChromeSlots {
  return useSyncExternalStore(subscribe, () => merged, () => merged);
}

/** มีของบนแถบบนไหม (ชื่อ/ค้นหา/ปุ่ม) — คืน boolean: เชลล์ render ใหม่เฉพาะตอนค่านี้เปลี่ยน
 *  ไม่ใช่ทุกครั้งที่หน้า render (หน้าใหญ่อย่างบอร์ดจ่ายงานจะได้ไม่ลากเชลล์ทั้งก้อนวาดใหม่ตาม = กระตุก) */
export function usePageChromeHas(): boolean {
  return useSyncExternalStore(subscribe, () => !!(merged.title || merged.search || merged.actions), () => false);
}

/** เชลล์ประกาศว่า "รับวาดแถบบนให้" (เฉพาะจอ < xl) — คืนค่า: มีเชลล์รับวาดอยู่ไหม (ไว้ให้หน้าใช้) */
export function useChromeHost(register = false): boolean {
  useEffect(() => {
    if (!register) return;
    hosts += 1; emit();
    return () => { hosts -= 1; emit(); };
  }, [register]);
  // อ่านแค่ "มี/ไม่มี" (ค่า boolean) — หน้าที่เรียกจะ render ใหม่เฉพาะตอนค่านี้เปลี่ยน ไม่ใช่ทุกครั้งที่ช่องอื่นอัปเดต (กันวนไม่รู้จบ)
  return useSyncExternalStore(subscribe, () => hosts > 0, () => false);
}

/** จอคอม (xl = 1280px ขึ้นไป) — เชลล์วาดแถบเฉพาะจอเล็ก · หน้าวาดเองเฉพาะจอคอม (กันวาดซ้ำ 2 ชุด/ยิงข้อมูลซ้ำ) */
export function useIsDesktopXl(): boolean {
  const [xl, setXl] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const f = () => setXl(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return xl;
}

const fieldCls = "flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5";

/** ช่องค้นหาในหน้า + ปุ่มสลับไปค้นทั้งระบบ */
function ChromeSearch({ search, onGlobal, tall }: { search: PageChromeSearch; onGlobal?: () => void; tall?: boolean }) {
  return (
    <div className={`${fieldCls} ${tall ? "h-10" : "h-9"} flex-1`}>
      <span className="text-sm text-slate-400" aria-hidden>🔍</span>
      <input data-page-search value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder ?? "ค้นหาในหน้านี้"}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
      {search.value && <button type="button" onClick={() => search.onChange("")} title="ล้างคำค้น" className="px-1 text-slate-400 hover:text-slate-600">✕</button>}
      {onGlobal && (
        <button type="button" onClick={onGlobal} title="ค้นหาทั้งระบบ (ทุกโมดูล)"
          className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50">ทั้งระบบ</button>
      )}
    </div>
  );
}

/** ตัวเลือกมุมมองของหน้า (ปุ่มเปิดแผงลอย) — ใช้ในแถบของหน้าเอง (จอคอม / embed) */
function ViewOptionsButton({ node }: { node: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div ref={anchor} className="inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} title="มุมมองหน้านี้ (อุปกรณ์ · หน้าตา · เต็มจอ)"
        className={`h-9 rounded-lg border px-3 text-sm ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>🎛 มุมมอง</button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={280} maxWidth={340}>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 text-[11px] font-medium text-slate-500">มุมมองหน้านี้</div>
          {node}
        </div>
      </FloatingDropdown>
    </div>
  );
}

/**
 * แถบบนแบบแอป: [ชื่อหน้า] [ค้นหา] [ปุ่ม]
 *   variant "shell" = วาดในแถบบนของเชลล์ (กะทัดรัด ไม่มีปุ่มมุมมอง — อยู่ในเมนูผู้ใช้แล้ว)
 *   variant "page"  = หน้าวาดเอง (จอคอม/embed) มีปุ่ม 🎛 มุมมอง ถ้าหน้าลงทะเบียน viewOptions
 */
export function PageChromeBar({ variant = "page", onGlobalSearch, className = "" }: { variant?: "shell" | "page"; onGlobalSearch?: () => void; className?: string }) {
  const s = usePageChromeSlots();
  const shell = variant === "shell";
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      {s.title && <div className={`min-w-0 shrink-0 ${shell ? "max-w-[40%]" : ""}`}>{s.title}</div>}
      {s.search ? <ChromeSearch search={s.search} onGlobal={onGlobalSearch} tall={!shell} /> : <div className="flex-1" />}
      {s.actions && <div className="flex shrink-0 items-center gap-1.5">{s.actions}</div>}
      {!shell && s.viewOptions && <ViewOptionsButton node={s.viewOptions} />}
    </div>
  );
}

/** ส่วน "มุมมองหน้านี้" ในเมนูผู้ใช้ — ไม่มีหน้าไหนลงทะเบียน = ไม่แสดง */
export function PageViewOptionsSection({ className = "" }: { className?: string }) {
  const s = usePageChromeSlots();
  if (!s.viewOptions) return null;
  return (
    <div className={`border-t border-slate-100 px-3 py-2 ${className}`}>
      <div className="mb-1.5 text-[11px] text-slate-500">🎛 มุมมองหน้านี้</div>
      {s.viewOptions}
    </div>
  );
}
