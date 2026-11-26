"use client";
/**
 * 🔒 ชุดกระดานแก้งาน (ของกลาง) — เจ้าของขอ 2026-11-26 "lock กระดานไว้ + ปุ่มขยายกระดาน + กล่องเครื่องมือใช้สะดวก" (เลือกแบบ A + ข้อ 1-4)
 *   useBoardLock     = ล็อกกระดาน (ค่าเริ่มต้นล็อก · จำต่อคน): ลูกกลิ้ง = เลื่อนหน้าเว็บ · Ctrl/⌘ + ลูกกลิ้ง = ซูม · ล็อกเข้ม = ห้ามแก้บนกระดาน (ดู/เลือกได้)
 *                      ปลด = กดกุญแจ หรือคีย์ L · มือถือ: ล็อก = นิ้วเดียวเลื่อนหน้าเว็บได้
 *   BoardLockButton  = ปุ่มกุญแจ (วางในแถบปุ่มซูมของกระดาน) + ฟองเตือนตอนหมุนลูกกลิ้ง/กดแก้ขณะล็อก (มีปุ่ม "ปลดล็อก")
 *   BoardToolbox     = กล่องเครื่องมือลอยข้างซ้าย (แบบ A): ไอคอน + ชื่อ + ปุ่มลัด · ลากย้ายได้ · พับเหลือไอคอนได้ · จำตำแหน่งต่อคน
 *                      มือถือ = แถบล่างของกระดาน · เครื่องมือที่ editing = ต้องปลดล็อกก่อน
 *   BoardShortcuts   = ป๊อปปุ่มลัดทั้งหมด (กด ?)
 *   ปุ่มขยายเต็มจอ = ใช้ของกลางเดิม FullscreenStage (useFullscreenStage(..., { phoneAlways: false }))
 * ใช้:
 *   const lock = useBoardLock("embroidery_board_lock");
 *   <div className="relative">            ← กรอบกระดาน
 *     <MyCanvas locked={lock.locked} onLockedWheel={lock.nudge} />
 *     <BoardToolbox prefKey="embroidery_toolbox" lock={lock} groups={[{ key: "edit", label: "แก้งาน", tools: [...] }]} />
 *     <BoardLockButton lock={lock} />    ← ในแถบปุ่มซูม
 *   </div>
 * doc: docs/board-kit.md
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { useUserPref } from "@/lib/use-user-pref";
import { clampToolboxPos, DEFAULT_TOOLBOX_POS, hotkeyCode, isTypingTarget, parseToolboxPos, type ToolboxPos } from "@/lib/board-kit";

const parseBool = (v: unknown) => (typeof v === "boolean" ? v : null);

export type BoardLock = {
  locked: boolean;
  set: (v: boolean) => void;
  toggle: () => void;
  /** แจ้งว่าผู้ใช้พยายามซูม/แก้ตอนล็อก → โชว์ฟองเตือน · why = "wheel" | "edit" */
  nudge: (why?: "wheel" | "edit") => void;
  /** ฟองเตือนที่กำลังโชว์ (null = ไม่โชว์) */
  hint: "wheel" | "edit" | null;
};

/** prefKey = ชื่อจำค่าต่อคน (แยกตามกระดาน เช่น "embroidery_board_lock") · hotkey L = ล็อก/ปลด */
export function useBoardLock(prefKey: string, opts: { hotkey?: boolean } = {}): BoardLock {
  const [locked, setLocked] = useUserPref<boolean>(prefKey, true, parseBool);
  const [hint, setHint] = useState<"wheel" | "edit" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const set = useCallback((v: boolean) => { setLocked(v); if (!v) setHint(null); }, [setLocked]);
  const toggle = useCallback(() => set(!lockedRef.current), [set]);
  const nudge = useCallback((why: "wheel" | "edit" = "wheel") => {
    setHint(why);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHint(null), why === "edit" ? 3200 : 1800);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const hotkey = opts.hotkey ?? true;
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyL" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey, toggle]);

  return { locked, set, toggle, nudge, hint };
}

/** ปุ่มกุญแจ (ขนาดเท่าปุ่มซูมของกระดาน) — ฟองเตือนลอยกลางกระดาน (ต้องอยู่ในกรอบ relative เดียวกับกระดาน) */
export function BoardLockButton({ lock, className = "" }: { lock: BoardLock; className?: string }) {
  return (
    <button type="button" onClick={lock.toggle} aria-pressed={lock.locked}
      title={lock.locked ? "กระดานล็อกอยู่ (L) — ลูกกลิ้ง = เลื่อนหน้าเว็บ · Ctrl + ลูกกลิ้ง = ซูม · กดเพื่อปลดล็อกแล้วแก้งาน" : "ปลดล็อกแล้ว (L) — ลูกกลิ้ง = ซูม · กดเพื่อล็อก"}
      aria-label={lock.locked ? "ปลดล็อกกระดาน" : "ล็อกกระดาน"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm shadow-sm ${lock.locked ? "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50" : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"} ${className}`}>
      <Icon value={lock.locked ? "i:lock" : "i:lock-open"} />
    </button>
  );
}

/** ฟองเตือนกลางกระดาน (ตอนหมุนลูกกลิ้ง/กดแก้ขณะล็อก) — วางในกรอบ relative ของกระดาน */
export function BoardLockHint({ lock }: { lock: BoardLock }) {
  if (!lock.hint || !lock.locked) return null;
  return (
    <div className="pointer-events-none absolute inset-x-2 top-1/2 z-20 flex -translate-y-1/2 justify-center">
      <div className="pointer-events-auto flex max-w-sm flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-center text-xs text-amber-900 shadow-lg">
        <Icon value="i:lock" />
        <span>{lock.hint === "edit" ? "กระดานล็อกอยู่ — ปลดล็อกก่อนแก้งาน" : "กระดานล็อกอยู่ · ลูกกลิ้ง = เลื่อนหน้าเว็บ · Ctrl + ลูกกลิ้ง = ซูม"}</span>
        <button type="button" onClick={() => lock.set(false)} className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100">ปลดล็อก (L)</button>
      </div>
    </div>
  );
}

export type BoardTool = {
  key: string;
  /** ไอคอน "i:<ชื่อ>" (ทะเบียน lib/erp-icons) */
  icon: string;
  label: string;
  /** ปุ่มลัดตัวอักษรเดียว (เช่น "V") — ชุดกลางผูกให้เอง (แป้นไทยก็ได้) */
  hotkey?: string;
  /** ปุ่มลัดที่หน้าผูกเอง แค่โชว์ (เช่น "Ctrl+Z") */
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  /** เป็นการแก้งาน → ล็อกอยู่ = กดไม่ได้ (โชว์ฟองให้ปลดล็อก) */
  editing?: boolean;
  onClick: () => void;
};
export type BoardToolGroup = { key: string; label?: string; tools: BoardTool[] };

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return phone;
}

/**
 * กล่องเครื่องมือลอย (แบบ A) — วางเป็นลูกของกรอบกระดานที่เป็น relative
 *   PC: ลอยมุมซ้ายบน · ลากที่หัวกล่องเพื่อย้าย · ปุ่ม "ย่อ" = เหลือไอคอน · จำตำแหน่ง/ย่อต่อคน (prefKey)
 *   มือถือ: แถบล่างของกระดาน (ไอคอน + ชื่อสั้น) · ปุ่ม ? = ปุ่มลัดทั้งหมด
 */
export function BoardToolbox({ prefKey, groups, lock, extraShortcuts = [], hotkeys = true }: {
  prefKey: string;
  groups: BoardToolGroup[];
  lock?: BoardLock;
  /** ปุ่มลัดเพิ่มในป๊อป ? (เช่น { keys: "Ctrl+S", label: "บันทึก" }) */
  extraShortcuts?: { keys: string; label: string }[];
  hotkeys?: boolean;
}) {
  const phone = useIsPhone();
  const [pos, setPos] = useUserPref<ToolboxPos>(prefKey, DEFAULT_TOOLBOX_POS, parseToolboxPos);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 160, h: 200 });

  // วัดขนาดกระดาน (พ่อ) + กล่อง → กันหลุดนอกกระดานตอนจอเปลี่ยน
  useEffect(() => {
    const el = boxRef.current, parent = el?.parentElement;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => { setArea({ w: parent.clientWidth, h: parent.clientHeight }); setBoxSize({ w: el.offsetWidth, h: el.offsetHeight }); });
    ro.observe(parent); ro.observe(el);
    return () => ro.disconnect();
  }, [phone]);

  const run = useCallback((t: BoardTool) => {
    if (t.disabled) return;
    if (t.editing && lock?.locked) { lock.nudge("edit"); return; }
    t.onClick();
  }, [lock]);

  // ปุ่มลัดตัวอักษร + ? = ป๊อปปุ่มลัด
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "?" || (e.shiftKey && e.code === "Slash")) { e.preventDefault(); setHelpOpen((o) => !o); return; }
      if (e.shiftKey) return;
      for (const g of groupsRef.current) for (const t of g.tools) {
        if (t.hotkey && hotkeyCode(t.hotkey) === e.code) { e.preventDefault(); run(t); return; }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkeys, run]);

  // ลากย้าย (ที่หัวกล่อง)
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const onGripDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onGripMove = (e: ReactPointerEvent) => {
    const s = start.current; if (!s) return;
    const next = { x: s.x + e.clientX - s.px, y: s.y + e.clientY - s.py };
    setDrag(area ? clampToolboxPos(next, boxSize, area) : next);
  };
  const onGripUp = () => {
    if (start.current && drag) setPos({ ...pos, ...drag });
    start.current = null;
    setDrag(null);
  };

  const help = (
    <BoardShortcuts open={helpOpen} onClose={() => setHelpOpen(false)} groups={groups} lock={!!lock} extra={extraShortcuts} />
  );

  if (phone) {
    const all = groups.flatMap((g, gi) => g.tools.map((t, ti) => ({ t, sep: gi > 0 && ti === 0 })));
    return (
      <>
        <div ref={boxRef} className="absolute inset-x-2 bottom-2 z-10 flex items-stretch gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur" data-board-toolbox>
          {all.map(({ t, sep }) => (
            <div key={t.key} className="flex flex-shrink-0 items-stretch">
              {sep ? <span aria-hidden className="mx-0.5 w-px self-stretch bg-slate-200" /> : null}
              <button type="button" onClick={() => run(t)} disabled={t.disabled} aria-pressed={t.active}
                className={`flex min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] leading-tight disabled:opacity-40 ${t.active ? "bg-indigo-50 text-indigo-700" : "text-slate-600"} ${t.editing && lock?.locked ? "opacity-60" : ""}`}>
                <Icon value={t.icon} size={18} />
                <span className="max-w-[4.5rem] truncate">{t.label}</span>
              </button>
            </div>
          ))}
        </div>
        {help}
      </>
    );
  }

  const cur = drag ?? (area ? clampToolboxPos(pos, boxSize, area) : pos);
  const fold = pos.fold;
  return (
    <>
      <div ref={boxRef} data-board-toolbox
        className="absolute z-10 flex flex-col rounded-xl border border-slate-200 bg-white/95 p-1 text-sm shadow-lg backdrop-blur"
        style={{ left: cur.x, top: cur.y }}>
        <div onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}
          className={`flex cursor-grab touch-none select-none items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-50 active:cursor-grabbing ${fold ? "justify-center" : ""}`}
          title="ลากเพื่อย้ายกล่องเครื่องมือ">
          <Icon value="i:grip-vertical" />{fold ? null : <span>เครื่องมือ</span>}
        </div>
        {groups.map((g, gi) => (
          <div key={g.key} className="flex flex-col">
            {gi > 0 ? <div className="mx-1 my-1 h-px bg-slate-100" /> : null}
            {!fold && g.label ? <div className="px-2 pb-0.5 pt-0.5 text-[10px] text-slate-400">{g.label}</div> : null}
            {g.tools.map((t) => {
              const keys = t.hotkey ?? t.hint;
              const lockedEdit = t.editing && lock?.locked;
              return (
                <button key={t.key} type="button" onClick={() => run(t)} disabled={t.disabled} aria-pressed={t.active}
                  title={`${t.label}${keys ? ` (${keys})` : ""}${lockedEdit ? " — ปลดล็อกก่อน" : ""}`}
                  className={`flex h-8 items-center gap-2 rounded-lg px-2 text-left disabled:opacity-40 ${fold ? "justify-center" : ""} ${t.active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-700 hover:bg-slate-50"} ${lockedEdit ? "opacity-55" : ""}`}>
                  <Icon value={t.icon} size={17} />
                  {fold ? null : <span className="flex-1 whitespace-nowrap">{t.label}</span>}
                  {!fold && keys ? <kbd className="rounded border border-slate-200 px-1 font-sans text-[10px] text-slate-400">{keys}</kbd> : null}
                </button>
              );
            })}
          </div>
        ))}
        <div className="mx-1 my-1 h-px bg-slate-100" />
        <div className={`flex ${fold ? "flex-col" : "items-center"} gap-0.5`}>
          <button type="button" onClick={() => setHelpOpen(true)} title="ปุ่มลัดทั้งหมด (?)"
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[11px] text-slate-500 hover:bg-slate-50">
            <Icon value="i:keyboard" />{fold ? null : <span>ปุ่มลัด ?</span>}
          </button>
          <button type="button" onClick={() => setPos({ ...pos, fold: !fold })} title={fold ? "กางกล่อง (โชว์ชื่อ)" : "ย่อกล่อง (เหลือไอคอน)"}
            className="flex h-7 items-center justify-center rounded-lg px-2 text-slate-500 hover:bg-slate-50">
            <Icon value={fold ? "i:chevron-down" : "i:chevron-up"} />
          </button>
        </div>
      </div>
      {help}
    </>
  );
}

/** ป๊อปปุ่มลัดทั้งหมด (กด ?) */
export function BoardShortcuts({ open, onClose, groups, lock = true, fullscreen = true, extra = [] }: {
  open: boolean; onClose: () => void; groups: BoardToolGroup[]; lock?: boolean; fullscreen?: boolean; extra?: { keys: string; label: string }[];
}) {
  const rows: { keys: string; label: string }[] = [];
  for (const g of groups) for (const t of g.tools) { const k = t.hotkey ?? t.hint; if (k) rows.push({ keys: k, label: t.label }); }
  const view: { keys: string; label: string }[] = [
    ...(lock ? [{ keys: "L", label: "ล็อก / ปลดล็อกกระดาน" }, { keys: "Ctrl + ลูกกลิ้ง", label: "ซูม (ใช้ได้ทั้งตอนล็อก)" }, { keys: "ลูกกลิ้ง", label: "ล็อกอยู่ = เลื่อนหน้าเว็บ · ปลดแล้ว = ซูม" }] : []),
    ...(fullscreen ? [{ keys: "F", label: "ขยายกระดานเต็มจอ" }, { keys: "Esc", label: "ออกจากเต็มจอ" }] : []),
    { keys: "?", label: "เปิด/ปิดหน้านี้" },
  ];
  const Row = ({ r }: { r: { keys: string; label: string } }) => (
    <li className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-slate-700">{r.label}</span>
      <kbd className="whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-xs text-slate-600">{r.keys}</kbd>
    </li>
  );
  return (
    <ERPModal open={open} onClose={onClose} title="ปุ่มลัดของกระดาน" size="sm">
      <div className="space-y-3">
        {rows.length + extra.length > 0 ? (
          <section>
            <div className="mb-1 text-xs font-medium text-slate-500">เครื่องมือ</div>
            <ul className="divide-y divide-slate-100">{[...rows, ...extra].map((r) => <Row key={r.keys + r.label} r={r} />)}</ul>
          </section>
        ) : null}
        <section>
          <div className="mb-1 text-xs font-medium text-slate-500">มุมมอง</div>
          <ul className="divide-y divide-slate-100">{view.map((r) => <Row key={r.keys + r.label} r={r} />)}</ul>
        </section>
      </div>
    </ERPModal>
  );
}

/** ปุ่มขยายเต็มจอขนาดเท่าปุ่มซูม (ใช้คู่ useFullscreenStage) */
export function BoardFullscreenButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} title={on ? "ออกจากเต็มจอ (Esc)" : "ขยายกระดานเต็มจอ (F)"} aria-label={on ? "ออกจากเต็มจอ" : "ขยายเต็มจอ"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm shadow-sm ${on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50"}`}>
      <Icon value={on ? "i:minimize" : "i:maximize"} />
    </button>
  );
}
