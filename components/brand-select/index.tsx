"use client";
/**
 * BrandSelect — ของกลาง: ช่องเลือกแบรนด์ (dropdown)
 * ใช้แทน <select>/<ERPSelect> + brands.map(...) ที่แต่ละหน้าเขียนเอง — ตัวเลือก/ตัวเลือกว่าง/ค่าที่ยังไม่อยู่ในรายการ จัดที่เดียว
 *
 *   <BrandSelect brands={brands} value={form.brand_id} onChange={(id) => setForm({ ...form, brand_id: id })} emptyLabel={t("— ไม่ระบุ —", "— None —")} />
 *
 * - brands: รายการแบรนด์ที่หน้าโหลดไว้แล้ว (เช่น listBrands() ของแอปจัดการงาน)
 * - emptyLabel: ป้ายตัวเลือกว่าง เช่น "— ไม่ระบุ —" / "ทุกแบรนด์" · ไม่ใส่ = ไม่มีตัวเลือกว่าง
 * - emptyValue: ค่าของตัวเลือกว่าง (ค่าเริ่ม "") · onChange คืนค่านี้เมื่อเลือกตัวว่าง
 * - หน้าตาเริ่มต้น = ERPSelect (className ต่อท้ายได้) · plain = ใช้ className เป็นหน้าตาทั้งหมด (คงขนาดเดิมของหน้าที่ตัวเล็ก)
 * - ค่าที่เลือกไว้แต่ยังไม่อยู่ในรายการ (เช่น แบรนด์ยังโหลดไม่เสร็จ) จะโชว์ "(กำลังโหลด…)" แทนการโชว์ตัวเลือกแรกผิด ๆ
 */
import type { CSSProperties } from "react";
import { ERPSelect } from "@/components/form";
import { tr } from "@/lib/lang";

export type BrandSelectOption = { id: string; name: string };

export function brandSelectOptions(brands: BrandSelectOption[], value: string | null | undefined, emptyLabel?: string | null, emptyValue = "") {
  const opts: { value: string; label: string }[] = [];
  if (emptyLabel != null) opts.push({ value: emptyValue, label: emptyLabel });
  for (const b of brands) opts.push({ value: b.id, label: b.name });
  if (value && value !== emptyValue && !brands.some((b) => b.id === value)) opts.push({ value, label: tr("(กำลังโหลด…)", "(loading…)") });
  return opts;
}

export function BrandSelect({ brands, value, onChange, emptyLabel, emptyValue = "", plain = false, className, style, disabled, error, title }: {
  brands: BrandSelectOption[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  emptyLabel?: string | null;
  emptyValue?: string;
  plain?: boolean;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  error?: boolean;
  title?: string;
}) {
  const options = brandSelectOptions(brands, value, emptyLabel, emptyValue);
  const v = value ?? emptyValue;
  if (!plain) return <ERPSelect value={v} options={options} onChange={(e) => onChange(e.target.value)} className={className} style={style} disabled={disabled} error={error} title={title} />;
  return (
    <select value={v} onChange={(e) => onChange(e.target.value)} className={className} style={style} disabled={disabled} title={title}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
