"use client";

/**
 * ช่องเลือก "ทักษะ / ความสามารถ" รายพนักงาน (ช่องติ๊ก 3 ภาษา)
 * - คลังทักษะ = erp_lookups type=employee_skill (ตั้งค่าที่ฟอร์มประวัติ ⚙️ ตั้งค่าทักษะ)
 * - value = string[] ของ lookup id (เก็บที่ employees.skills text[])
 * - ใช้เป็น custom renderForm ของ field "skills" ทั้ง drawer ตาราง + drawer บอร์ด (ผ่าน MasterRecordDrawer)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { FieldDef } from "@/components/master-crud";

type Skill = { id: string; th: string; en: string; my: string };

export function EmployeeSkillsField({ value, onChange, disabled }: {
  value: string[] | null | undefined;
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value]);

  useEffect(() => {
    let active = true;
    apiFetch("/api/lookups?type=employee_skill&limit=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const rows = (j.data ?? []) as Array<{ id: string; name: string; metadata?: { en?: string; my?: string } }>;
        setSkills(rows.map((r) => ({ id: r.id, th: r.name, en: r.metadata?.en ?? "", my: r.metadata?.my ?? "" })));
      })
      .catch(() => setSkills([]))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const ids = Array.isArray(value) ? value : [];
  const toggle = (id: string) => {
    if (disabled) return;
    onChange(selected.has(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  if (loading) return <div className="text-xs text-slate-400 py-2">กำลังโหลดรายการทักษะ…</div>;
  if (skills.length === 0) {
    return <div className="text-xs text-slate-400 py-2">ยังไม่มีรายการทักษะในคลัง — ตั้งค่าที่ฟอร์มประวัติ (⚙️ ตั้งค่าทักษะ)</div>;
  }

  // view mode + ไม่ได้เลือกอะไร → ขึ้น "—" ให้ดูสะอาด
  if (disabled && selected.size === 0) return <span className="text-sm text-slate-300">—</span>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {skills
        .filter((s) => !disabled || selected.has(s.id)) // view mode = โชว์เฉพาะที่ติ๊ก
        .map((s) => {
          const on = selected.has(s.id);
          return (
            <button key={s.id} type="button" onClick={() => toggle(s.id)} disabled={disabled}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
                on ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
              } ${disabled ? "cursor-default" : "cursor-pointer"}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
              }`}>{on ? "✓" : ""}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-slate-700">{s.th}</span>
                {(s.en || s.my) && <span className="block truncate text-[10px] text-slate-400">{[s.en, s.my].filter(Boolean).join(" · ")}</span>}
              </span>
            </button>
          );
        })}
    </div>
  );
}

/** custom renderForm สำหรับ field "skills" — ใช้ได้ทั้งโหมด view (อ่าน) และ edit */
export const employeeSkillsRenderer: FieldDef["renderForm"] = (ctx) => (
  <EmployeeSkillsField
    value={ctx.value as string[] | null}
    onChange={(v) => ctx.onChange(v)}
    disabled={ctx.disabled || ctx.mode === "view"}
  />
);
