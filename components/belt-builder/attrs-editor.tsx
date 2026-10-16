"use client";

/**
 * AttrsEditor — แก้ "คุณสมบัติ" (jsonb object แบน) เป็นแถว ชื่อ=ค่า โดยไม่ต้องพิมพ์ JSON เอง
 * ใช้กับ belt_parts.attrs (สี / ความกว้างสาย / ทรงหัว / สีโลหะ) — เว็บลูกค้า (ก้อน 3) ใช้คีย์พวกนี้ทำตัวกรอง
 */
import { useMemo } from "react";

/** คีย์แนะนำต่อประเภท (กดเพิ่มได้ทีเดียว · พิมพ์คีย์อื่นเองก็ได้) */
export const SUGGESTED_ATTR_KEYS: Record<string, { key: string; label: string; hint?: string }[]> = {
  strap:  [{ key: "color", label: "สี (รหัส)", hint: "black / tan" }, { key: "color_th", label: "สี (ไทย)" }, { key: "color_hex", label: "สีกล่องแทนรูป", hint: "#1f1f1f" }, { key: "width_mm", label: "กว้างสาย (มม.)", hint: "35 / 40" }],
  buckle: [{ key: "shape", label: "ทรง (รหัส)", hint: "pin / plate" }, { key: "shape_th", label: "ทรง (ไทย)" }, { key: "metal", label: "สีโลหะ (รหัส)", hint: "silver / gold" }, { key: "metal_th", label: "สีโลหะ (ไทย)" }, { key: "metal_hex", label: "สีกล่องแทนรูป", hint: "#d4af37" }, { key: "width_mm", label: "ใช้กับสายกว้าง (มม.)" }],
  keeper: [{ key: "style", label: "แบบ (รหัส)", hint: "leather / metal" }, { key: "color", label: "สี", hint: "match = ตามสาย" }, { key: "color_hex", label: "สีกล่องแทนรูป" }],
};

function toObj(v: unknown): Record<string, string> {
  let o: unknown = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = {}; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o as Record<string, unknown>)) out[k] = val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
  return out;
}

export function AttrsEditor({ value, onChange, disabled, partType }: { value: unknown; onChange: (v: Record<string, unknown>) => void; disabled?: boolean; partType?: string }) {
  const obj = useMemo(() => toObj(value), [value]);
  const entries = Object.entries(obj);
  const suggested = (SUGGESTED_ATTR_KEYS[partType ?? ""] ?? []).filter((s) => !(s.key in obj));

  const emit = (next: Record<string, string>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      const key = k.trim();
      if (!key) continue;
      // ตัวเลขล้วน → เก็บเป็น number (width_mm) · อื่น ๆ เก็บ string
      out[key] = /^-?\d+(\.\d+)?$/.test(v.trim()) && key !== "color_hex" ? Number(v) : v;
    }
    onChange(out);
  };
  const setKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === oldKey ? newKey : k] = v;
    emit(next);
  };
  const setVal = (k: string, v: string) => emit({ ...obj, [k]: v });
  const remove = (k: string) => { const n = { ...obj }; delete n[k]; emit(n); };
  const add = (k = "") => { if (k && k in obj) return; emit({ ...obj, [k || `key${entries.length + 1}`]: "" }); };

  const inp = "border border-slate-300 rounded px-2 py-1 text-sm disabled:bg-slate-50";
  if (disabled) {
    return entries.length === 0
      ? <span className="text-slate-300 text-sm">—</span>
      : <div className="flex flex-wrap gap-1.5">{entries.map(([k, v]) => <span key={k} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"><b className="font-medium">{k}</b>: {v}</span>)}</div>;
  }
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5">
          <input className={`${inp} w-36`} value={k} onChange={(e) => setKey(k, e.target.value)} placeholder="ชื่อ" />
          <span className="text-slate-400">=</span>
          <input className={`${inp} flex-1`} value={v} onChange={(e) => setVal(k, e.target.value)} placeholder="ค่า" />
          <button type="button" onClick={() => remove(k)} className="text-slate-400 hover:text-red-600 px-1" title="ลบ">✕</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {suggested.map((s) => (
          <button key={s.key} type="button" onClick={() => add(s.key)} className="text-[11px] px-2 py-0.5 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50" title={s.hint}>+ {s.label}</button>
        ))}
        <button type="button" onClick={() => add()} className="text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">+ คีย์อื่น</button>
      </div>
    </div>
  );
}
