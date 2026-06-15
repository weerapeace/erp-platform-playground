"use client";

/**
 * LineColumnsManager — ของกลาง: จัดคอลัมน์ตาราง "บรรทัดเอกสาร" (line items)
 *
 * ใช้กับตารางกรอกข้อมูลเอกสาร (ใบเสนอ/ใบสั่งขาย/ใบเสนอราคา) ที่อยากให้
 * เลือกโชว์/ซ่อน + ลากเรียงคอลัมน์ + จัดกลุ่ม โดยไม่ hardcode
 *
 * - defs: รายการคอลัมน์ที่ "มีให้เลือก" (locked = ต้องโชว์เสมอ เช่น จำนวน/ราคา)
 * - config: { order, hidden, groupBy } — เก็บที่ไหนก็ได้ (ผู้เรียกจัดการ persist เอง)
 * - visibleColumns(defs, config): helper คืนคอลัมน์ที่ต้องแสดงตามลำดับ
 */

import { useEffect, useRef, useState } from "react";

export type LineColumnDef = {
  key:    string;
  label:  string;
  locked?: boolean;   // โชว์เสมอ ซ่อนไม่ได้
};

export type LineColumnConfig = {
  order:   string[];
  hidden:  string[];
  groupBy: string | null;
};

export const EMPTY_COLUMN_CONFIG: LineColumnConfig = { order: [], hidden: [], groupBy: null };

// คืนคอลัมน์ที่ต้องแสดง เรียงตาม config (locked โชว์เสมอ)
export function visibleColumns(defs: LineColumnDef[], config: LineColumnConfig): LineColumnDef[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const ordered: LineColumnDef[] = [];
  for (const k of config.order ?? []) { const d = byKey.get(k); if (d) { ordered.push(d); byKey.delete(k); } }
  for (const d of defs) if (byKey.has(d.key)) ordered.push(d);   // ที่เหลือต่อท้าย
  const hidden = new Set(config.hidden ?? []);
  return ordered.filter((d) => d.locked || !hidden.has(d.key));
}

export function LineColumnsManager({
  defs, config, onChange, groupableKeys = [], canEdit = true,
}: {
  defs: LineColumnDef[];
  config: LineColumnConfig;
  onChange: (c: LineColumnConfig) => void;
  groupableKeys?: string[];
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // รายการคอลัมน์ตามลำดับปัจจุบัน (รวม hidden เพื่อให้ติ๊กกลับมาได้)
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const ordered: LineColumnDef[] = [];
  for (const k of config.order ?? []) { const d = byKey.get(k); if (d) { ordered.push(d); byKey.delete(k); } }
  for (const d of defs) if (byKey.has(d.key)) ordered.push(d);

  const hidden = new Set(config.hidden ?? []);

  const toggleHidden = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange({ ...config, hidden: Array.from(next) });
  };

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target) { setDragKey(null); return; }
    const keys = ordered.map((d) => d.key);
    const from = keys.indexOf(dragKey), to = keys.indexOf(target);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    onChange({ ...config, order: keys });
    setDragKey(null);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="h-10 px-4 rounded-full border border-pink-200 bg-white text-rose-500 text-sm font-medium hover:bg-pink-50">
        ⚙ คอลัมน์
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-pink-100 shadow-xl z-30 p-3">
          <div className="text-xs font-semibold text-rose-500 mb-2 px-1">เลือก / ลากเรียงคอลัมน์</div>
          <ul className="space-y-0.5 max-h-72 overflow-auto">
            {ordered.map((d) => (
              <li key={d.key}
                draggable={canEdit} onDragStart={() => setDragKey(d.key)} onDragEnd={() => setDragKey(null)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(d.key)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${dragKey === d.key ? "opacity-40" : "hover:bg-pink-50/60"}`}>
                <span className="cursor-grab active:cursor-grabbing text-pink-300 select-none">⠿</span>
                <label className="flex items-center gap-2 flex-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={d.locked || !hidden.has(d.key)} disabled={!canEdit || d.locked}
                    onChange={() => toggleHidden(d.key)} className="rounded border-pink-300 text-pink-500" />
                  <span className={d.locked ? "text-slate-400" : "text-slate-700"}>{d.label}{d.locked ? " 🔒" : ""}</span>
                </label>
              </li>
            ))}
          </ul>

          {groupableKeys.length > 0 && (
            <div className="mt-3 pt-3 border-t border-pink-50">
              <div className="text-xs font-semibold text-rose-500 mb-1 px-1">จัดกลุ่มตาม</div>
              <select value={config.groupBy ?? ""} disabled={!canEdit}
                onChange={(e) => onChange({ ...config, groupBy: e.target.value || null })}
                className="w-full h-9 px-2 rounded-lg border border-pink-200 text-sm bg-white outline-none focus:border-pink-400">
                <option value="">— ไม่จัดกลุ่ม —</option>
                {groupableKeys.map((k) => {
                  const d = defs.find((x) => x.key === k);
                  return <option key={k} value={k}>{d?.label ?? k}</option>;
                })}
              </select>
              <p className="text-[11px] text-rose-300 mt-1 px-1">เปิดกลุ่มแล้วจะปิดการลากสลับแถวชั่วคราว</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
