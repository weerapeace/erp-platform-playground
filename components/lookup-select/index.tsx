"use client";

/**
 * LookupSelect — ของกลาง: dropdown ที่ดึง "ตัวเลือก" จากตาราง erp_lookups (/api/lookups)
 *
 * ใช้ทำ field แบบ many-to-one ที่ผู้ใช้จัดการรายการตัวเลือกเองได้ที่ /admin/lookups
 * โดย "เก็บค่าเป็น code" (ไม่ใช่ uuid) → ปลอดภัยกับ logic เดิมที่อ้าง code เป็นข้อความ
 *
 * ตัวอย่าง:
 *   <LookupSelect type="contract_type" label="ประเภทสัญญา" value={v} onChange={set} />
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Opt = { code: string; name: string };

// แคชระดับโมดูล — กันยิงซ้ำเมื่อ field re-render บ่อย (รีเฟรชเมื่อ reload หน้า)
const cache: Record<string, Opt[]> = {};

export function clearLookupCache(type?: string) {
  if (type) delete cache[type];
  else for (const k of Object.keys(cache)) delete cache[k];
}

export function LookupSelect({
  type,
  value,
  onChange,
  label,
  disabled,
  placeholder = "— เลือก —",
  className,
  manageHref = "/admin/lookups",
}: {
  type: string;
  value: string;
  onChange: (code: string) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  manageHref?: string | null;
}) {
  const [opts, setOpts] = useState<Opt[]>(cache[type] ?? []);
  const [loading, setLoading] = useState(!cache[type]);

  useEffect(() => {
    let alive = true;
    if (cache[type]) {
      setOpts(cache[type]);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch(`/api/lookups?type=${encodeURIComponent(type)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list = ((j.data ?? []) as Array<Record<string, unknown>>)
          .map((o) => ({
            code: String(o.code ?? o.name ?? "").trim(),
            name: String(o.name ?? o.code ?? "").trim(),
          }))
          .filter((o) => o.code);
        cache[type] = list;
        setOpts(list);
      })
      .catch(() => { /* ปล่อยว่าง — โชว์เฉพาะค่าปัจจุบัน */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [type]);

  // ค่าปัจจุบันอาจเป็น code เก่าที่ยังไม่มีในรายการ → ใส่เป็น option พิเศษ เพื่อไม่ให้ค่าหาย
  const valueMissing = !!value && !opts.some((o) => o.code === value);

  const selectEl = (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className={
        className ??
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
      }
    >
      <option value="">{loading ? "กำลังโหลด..." : placeholder}</option>
      {valueMissing && <option value={value}>{value} (ค่าเดิม)</option>}
      {opts.map((o) => (
        <option key={o.code} value={o.code}>{o.name}</option>
      ))}
    </select>
  );

  if (!label) return selectEl;

  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
        <span>{label}</span>
        {manageHref && (
          <a
            href={manageHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-normal text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            จัดการตัวเลือก
          </a>
        )}
      </span>
      {selectEl}
    </label>
  );
}
