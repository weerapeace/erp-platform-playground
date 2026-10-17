"use client";

/**
 * ☑ ติ๊กเลือกหลายหมวด (ของกลาง) — รายการแบบต้นไม้ หมวดหลัก + หมวดย่อยเยื้องใต้แม่
 * ใช้: ตัวจัดเมนู (เติมลิงก์หมวดทีละหลายหมวด) · ที่อื่นที่ต้องเลือกหลายหมวดพร้อมกันหยิบไปใช้ได้
 *   <CategoryCheckList categories={cats} value={keys} onChange={setKeys} />
 * ทุกแถวติ๊กแยกกัน (แม่กับลูกเป็นคนละลิงก์) · ปุ่ม "ทั้งกลุ่ม" ที่แม่ = ติ๊ก/เอาออก แม่ + หมวดย่อยทั้งหมด
 * ผลลัพธ์เรียงตามลำดับต้นไม้ (ลำดับเดียวกับแท็บ 📂 หมวดหมู่) ไม่ใช่ลำดับที่กด
 */
import { useMemo } from "react";
import { categoryTree, type CatNode } from "@/lib/website-category-tree";

export function CategoryCheckList({
  categories,
  value,
  onChange,
  maxHeight = 280,
}: {
  categories: CatNode[];
  value: string[];
  onChange: (keys: string[]) => void;
  maxHeight?: number;
}) {
  const rows = useMemo(() => categoryTree(categories), [categories]);
  const on = new Set(value);
  const kidsOf = (key: string) => rows.filter((r) => r.cat.parent === key).map((r) => r.cat.key);
  // คืนค่าเรียงตามต้นไม้เสมอ
  const emit = (next: Set<string>) => onChange(rows.map((r) => r.cat.key).filter((k) => next.has(k)));
  const toggle = (key: string) => {
    const next = new Set(on);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    emit(next);
  };
  const toggleGroup = (key: string) => {
    const group = [key, ...kidsOf(key)];
    const all = group.every((k) => on.has(k));
    const next = new Set(on);
    for (const k of group) {
      if (all) next.delete(k);
      else next.add(k);
    }
    emit(next);
  };
  const tops = rows.filter((r) => r.depth === 0).map((r) => r.cat.key);

  if (!rows.length) return <p className="text-[11px] text-slate-400 py-2">ร้านนี้ยังไม่มีหมวด — เพิ่มที่แท็บ 📂 หมวดหมู่</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-slate-500">เลือกแล้ว {value.length}/{rows.length}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => emit(new Set(rows.map((r) => r.cat.key)))} className="text-blue-600 hover:underline">
          ทั้งหมด
        </button>
        <button type="button" onClick={() => emit(new Set(tops))} className="text-blue-600 hover:underline">
          เฉพาะหมวดหลัก
        </button>
        <button type="button" onClick={() => emit(new Set())} className="text-slate-500 hover:underline">
          ล้าง
        </button>
      </div>
      <div className="rounded-md border border-slate-200 bg-white overflow-y-auto divide-y divide-slate-100" style={{ maxHeight }}>
        {rows.map(({ cat: c, depth }) => {
          const kids = depth === 0 ? kidsOf(c.key) : [];
          const groupAll = kids.length > 0 && [c.key, ...kids].every((k) => on.has(k));
          return (
            <div key={c.key} className={`flex items-center gap-2 py-1.5 ${depth ? "pl-7 pr-2" : "px-2"}`}>
              <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 shrink-0" checked={on.has(c.key)} onChange={() => toggle(c.key)} />
                {depth > 0 && <span className="text-slate-300 text-[10px] -ml-1" aria-hidden>└</span>}
                <span className={`truncate ${depth ? "text-[12px] text-slate-700" : "text-[13px] font-medium text-slate-800"}`}>{c.label}</span>
              </label>
              {kids.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(c.key)}
                  title={groupAll ? `เอาออกทั้ง ${c.label} และหมวดย่อย ${kids.length} หมวด` : `ติ๊ก ${c.label} พร้อมหมวดย่อย ${kids.length} หมวด`}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] border ${groupAll ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-blue-300"}`}
                >
                  {groupAll ? "✓ ทั้งกลุ่ม" : `+ ทั้งกลุ่ม (${kids.length + 1})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
