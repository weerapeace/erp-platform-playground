"use client";

/**
 * UomPicker — ของกลาง: เลือก "หน่วยนับ" จากทะเบียนหน่วย (ตาราง uoms) แทนการพิมพ์เอง
 *   - ค้นหาได้ (SearchableSelect ของกลาง) · โหลดรายชื่อจาก /api/admin/picker?table=uoms
 *   - เก็บค่าเป็น "ชื่อหน่วย" (text) เพราะที่ใช้งานจริงหลายที่เก็บเป็นข้อความ เช่น pcs / roll / หลา
 *   - พิมพ์ค่าที่ไม่มีในทะเบียนได้ (onCreate) — ใช้ค่าที่พิมพ์เลย ไม่บังคับต้องมีในทะเบียน
 *
 * ใช้ที่: ตารางร้านที่จำหน่าย (หน่วยซื้อรายร้าน) · ที่อื่นที่ต้องเลือกหน่วย
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SearchableSelect } from "@/components/searchable-select";

let cache: { value: string; label: string }[] | null = null;   // โหลดครั้งเดียวต่อหน้า (หน่วยไม่ค่อยเปลี่ยน)

export function UomPicker({ value, onChange, placeholder = "— หน่วย —", disabled, className }: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    apiFetch("/api/admin/picker?table=uoms&label=name&limit=500").then((r) => r.json())
      .then((j) => {
        const list = ((j.data ?? []) as Record<string, unknown>[])
          .map((u) => ({ value: String(u.label ?? ""), label: String(u.label ?? "") }))
          .filter((u) => u.value);
        cache = list; setOpts(list);
      }).catch(() => {});
  }, []);

  // ค่าที่ใช้อยู่แต่ไม่มีในทะเบียน → ใส่เพิ่มให้เลือกค้างไว้ได้
  const options = value && !opts.some((o) => o.value === value) ? [{ value, label: value }, ...opts] : opts;

  return (
    <SearchableSelect
      value={value ?? ""}
      options={options}
      onChange={(v) => onChange(v || null)}
      onCreate={(q) => onChange(q.trim() || null)}
      createLabel="ใช้หน่วยนี้"
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
