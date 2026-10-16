"use client";

/**
 * 🖱 WheelSelect — ตัวเลือกแบบกล่องเล็ก + ▴▾ + หมุนลูกกลิ้งเมาส์ปรับค่า (ของกลาง)
 *
 * ใช้แทน <select> ของช่องที่เป็น "ระดับ" เช่น ระยะห่าง ความกว้าง ขนาด จำนวนคอลัมน์ ความหนา (ค่ามีลำดับ)
 *   - ชี้ที่กล่องแล้วหมุนลูกกลิ้ง = เลื่อนไปตัวบน/ตัวล่างในรายการ (ไม่ต้องกดเปิดรายการ)
 *   - ▴ = ตัวบนในรายการ · ▾ = ตัวล่างในรายการ (ทิศเดียวกับรายการที่เปิดดู และปุ่มลูกศรคีย์บอร์ด)
 *   - กดที่ค่า = เปิดรายการเต็มเหมือนเดิม
 * กันเปลี่ยนค่าโดยไม่ตั้งใจ: ตอนเลื่อนหน้าผ่าน (เมาส์ไม่ขยับ) ลูกกลิ้งเลื่อนหน้าตามปกติ — ต้องขยับเมาส์มาชี้ที่กล่อง (หรือกดเลือกกล่องอยู่) ก่อน
 *
 * ใช้แบบเดียวกับ <select>: value + onChange(e => e.target.value) + <option> ข้างใน → เปลี่ยนจาก select ได้ทันที
 * ห้ามใช้กับ: ตัวเลือกชนิด/รูปแบบที่ไม่มีลำดับ (ฟอนต์ เลย์เอาต์ ที่มาข้อมูล) — ใช้ <select> ปกติ
 * useWheelStep = ตัวจับลูกกลิ้ง (ใช้กับปุ่มแบ่งช่อง Seg ของตัวจัดหน้าด้วย)
 * เอกสาร: docs/wheel-select.md
 */
import { useCallback, useEffect, useRef, type ReactNode, type RefObject, type SelectHTMLAttributes } from "react";

/** ลูกกลิ้งสะสมเท่านี้ (px) = 1 ขั้น · เมาส์ 1 คลิกลูกกลิ้ง ≈ 100 · ทัชแพดทยอยมาทีละน้อย */
const STEP_PX = 50;
/** เว้นระยะขั้นต่ำระหว่างขั้น (กันทัชแพดเลื่อนทีเดียวกระโดดหลายขั้น) */
const STEP_GAP_MS = 70;

/**
 * จับลูกกลิ้งบนกล่อง → onStep(+1 = ตัวล่างในรายการ / -1 = ตัวบน)
 * ทำงานเมื่อ "ขยับเมาส์มาชี้ที่กล่องจริง" หรือกล่องถูกเลือกอยู่ — ตอนแค่เลื่อนหน้าผ่าน ลูกกลิ้งเลื่อนหน้าตามปกติ
 */
export function useWheelStep(ref: RefObject<HTMLElement | null>, onStep: (dir: 1 | -1) => void, enabled = true) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let armed = false;
    let acc = 0;
    let last = 0;
    const onMove = (e: PointerEvent) => {
      if (e.movementX || e.movementY) armed = true;
    };
    const onLeave = () => {
      armed = false;
      acc = 0;
    };
    const onWheel = (e: WheelEvent) => {
      const focused = el.contains(document.activeElement);
      if (!armed && !focused) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const now = Date.now();
      // เมาส์ (1 คลิกลูกกลิ้ง ≥ STEP_PX) = 1 ขั้นทุกคลิก แม้หมุนเร็ว · ทัชแพด (ทยอยทีละน้อย) = สะสมแล้วเว้นจังหวะ
      if (Math.abs(dy) >= STEP_PX) {
        acc = 0;
        last = now;
        // หมุนเร็ว เบราว์เซอร์รวมหลายคลิกเป็นครั้งเดียว (เช่น 300 = 3 คลิก) → เลื่อนเท่าจำนวนคลิก (สูงสุด 5)
        const n = Math.max(1, Math.min(5, Math.round(Math.abs(dy) / 100)));
        for (let k = 0; k < n; k++) stepRef.current(dy > 0 ? 1 : -1);
        return;
      }
      acc += dy;
      if (Math.abs(acc) < STEP_PX || now - last < STEP_GAP_MS) return;
      const dir = acc > 0 ? 1 : -1;
      acc = 0;
      last = now;
      stepRef.current(dir);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref, enabled]);
}

/** ตัวถัดไปในรายการ (ข้ามตัวที่ปิดไว้) · ชนขอบ = null */
export function nextOptionValue(values: { value: string; disabled?: boolean }[], current: string, dir: 1 | -1): string | null {
  const live = values.filter((o) => !o.disabled);
  if (!live.length) return null;
  const i = live.findIndex((o) => o.value === current);
  const j = i < 0 ? (dir > 0 ? 0 : live.length - 1) : i + dir;
  if (j < 0 || j >= live.length) return null;
  return live[j].value;
}

type WheelSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "className"> & {
  value: string | number;
  /** แบบเดียวกับ <select> — ได้ e.target.value */
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  /** กรอบนอก (ความกว้าง/ระยะ) — ไม่ใส่ = กว้างพอดีค่า */
  className?: string;
  /** ขอบฟ้า = ตั้งค่าไว้ต่างจากเดิม (เช่น ค่ามือถือแยก) */
  highlight?: boolean;
  /** ขอบส้ม = เตือน */
  warn?: boolean;
};

export function WheelSelect({ value, onChange, children, className, highlight, warn, disabled, title, ...rest }: WheelSelectProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const selRef = useRef<HTMLSelectElement>(null);
  const cur = String(value);
  // ค่าล่าสุดที่ส่งออกไป — หมุนเร็วหลายคลิกก่อนหน้าจอวาดใหม่ ก็นับต่อจากค่าล่าสุด (ไม่ค้างที่ค่าเดิม)
  const curRef = useRef(cur);
  curRef.current = cur;

  const step = useCallback(
    (dir: 1 | -1) => {
      const sel = selRef.current;
      if (!sel || sel.disabled) return;
      const from = curRef.current;
      const next = nextOptionValue(
        Array.from(sel.options).map((o) => ({ value: o.value, disabled: o.disabled })),
        from,
        dir
      );
      if (next == null || next === from) return;
      curRef.current = next;
      onChange({ target: { value: next } });
    },
    [onChange]
  );
  useWheelStep(wrapRef, step, !disabled);

  const border = warn ? "border-amber-400" : highlight ? "border-blue-400" : "border-slate-200 hover:border-slate-400";
  const arrow = "flex-1 flex items-center justify-center text-[7px] leading-none text-slate-400 hover:text-blue-600 disabled:opacity-30";
  return (
    <span ref={wrapRef} className={`relative inline-flex max-w-full align-middle ${className ?? ""}`} title={title ?? "ชี้แล้วหมุนลูกกลิ้งเมาส์ หรือกด ▴▾ เพื่อเลื่อนตัวเลือก"}>
      <select
        ref={selRef}
        {...rest}
        disabled={disabled}
        value={cur}
        onChange={(e) => onChange(e)}
        className={`appearance-none w-full h-7 min-w-[4.5rem] rounded-md border bg-white pl-2 pr-6 text-xs text-slate-700 cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed ${border}`}
      >
        {children}
      </select>
      <span className="absolute right-px inset-y-px flex flex-col w-5 border-l border-slate-100">
        <button type="button" tabIndex={-1} aria-label="ตัวบนในรายการ" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)} className={arrow}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label="ตัวล่างในรายการ" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)} className={arrow}>
          ▼
        </button>
      </span>
    </span>
  );
}
