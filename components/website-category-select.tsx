"use client";

/**
 * WebCategorySelect — ช่องเลือกหมวดบนเว็บของร้าน (ของกลาง)
 *   เรียงแบบต้นไม้ (หมวดย่อยมี ↳ นำหน้า ใต้หมวดแม่) · emptyLabel = มีตัวเลือก "ว่าง"
 * ใช้ที่: แท็บ ⚙️ จับคู่ฟิลด์ (กฎหมวด ERP + 🏷️ กฎแท็ก) · ป๊อป 🔗 ของแท็ก (components/tag-usage)
 */
import { categoryChoiceLabel, categoryTree, type CatNode } from "@/lib/website-category-tree";

const selectCls =
  "rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 [&>option]:text-slate-800";

export function WebCategorySelect({
  cats,
  value,
  onChange,
  emptyLabel,
  className = "w-full border-slate-200 text-slate-800",
  ariaLabel,
  disabled,
}: {
  cats: (CatNode & { label: string })[];
  value: string;
  onChange: (v: string) => void;
  emptyLabel?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select className={`${selectCls} ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} disabled={disabled}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {categoryTree(cats).map(({ cat }) => (
        <option key={cat.key} value={cat.key}>
          {categoryChoiceLabel(cat)}
        </option>
      ))}
    </select>
  );
}
