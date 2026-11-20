"use client";

/**
 * UomPicker — ของกลาง: เลือก "หน่วยนับ" จากทะเบียนหน่วย (ตาราง uoms) แทนการพิมพ์เอง
 *   - ค้นหาได้ (SearchableSelect ของกลาง) · โหลดรายชื่อจาก /api/admin/picker?table=uoms (เฉพาะหน่วยที่ยังใช้ ไม่เอาตัวที่รวม/ลบแล้ว)
 *   - โชว์ 2 ภาษา "หลา · Yard" · ค้นได้ทั้งชื่อไทย/อังกฤษ/ชื่ออื่น (พิมพ์ yd / Units ก็เจอ) — lib/uom-names
 *   - เก็บค่าเป็น "ชื่อหลักของหน่วย" (uoms.name, text) เหมือนเดิม เพราะที่ใช้งานจริงหลายที่เก็บเป็นข้อความ เช่น หลา / ชิ้น
 *   - ค่าเก่าที่เป็นชื่ออื่น (เช่น Yard ในเอกสารเก่า) → โชว์ว่าเป็นหน่วยไหน "Yard (= หลา · Yard)"
 *   - พิมพ์ค่าที่ไม่มีในทะเบียนได้ (onCreate) — ใช้ค่าที่พิมพ์เลย ไม่บังคับต้องมีในทะเบียน
 *
 * ใช้ที่: ตารางร้านที่จำหน่าย (หน่วยซื้อรายร้าน) · ขอเพิ่มวัตถุดิบ · บรรทัดใบขาย (ใบเสนอราคา/ใบสั่งขาย/ใบส่งของ — sales-line-items) · ที่อื่นที่ต้องเลือกหน่วย
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { normUom, splitAliases } from "@/lib/uom-names";

type Opt = SelectOption & { names: string[] };
let cache: Opt[] | null = null;   // โหลดครั้งเดียวต่อหน้า (หน่วยไม่ค่อยเปลี่ยน)

export function UomPicker({ value, onChange, placeholder = "— หน่วย —", disabled, className }: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [opts, setOpts] = useState<Opt[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    apiFetch("/api/admin/picker?table=uoms&label=name&secondary=display_name&limit=100").then((r) => r.json())
      .then((j) => {
        const list = ((j.data ?? []) as Record<string, unknown>[])
          .map((u) => {
            const name = String(u.label ?? ""), disp = String(u.secondary ?? "") || name, aliases = splitAliases(u.aliases as string);
            return { value: name, label: disp, sub: disp.includes(name) ? undefined : name, searchText: [name, disp, ...aliases].join(" "), names: [name, disp, ...aliases].map(normUom) };
          })
          .filter((u, i, arr) => u.value && arr.findIndex((x) => x.value === u.value) === i);
        cache = list; setOpts(list);
      }).catch(() => {});
  }, []);

  // ค่าที่ใช้อยู่แต่ไม่ใช่ชื่อหลักในทะเบียน → ใส่เพิ่มให้เลือกค้างไว้ได้ (ถ้าเป็นชื่ออื่นของหน่วยไหน บอกด้วย)
  let options: SelectOption[] = opts;
  if (value && !opts.some((o) => o.value === value)) {
    const same = opts.find((o) => o.names.includes(normUom(value)));
    options = [{ value, label: same ? `${value} (= ${same.label})` : value }, ...opts];
  }

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
