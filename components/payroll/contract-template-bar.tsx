"use client";

/**
 * ContractTemplateBar — แถบ "แม่แบบสัญญา" ใช้ตอนสร้างสัญญาใหม่
 *
 * - "ใช้แม่แบบ": เลือกแม่แบบที่บันทึกไว้ → เติมค่าทุกช่องให้ (ยกเว้นพนักงาน/เลขสัญญา/วันที่)
 * - "บันทึกเป็นแม่แบบ": เก็บค่าปัจจุบันเป็นแม่แบบใหม่ (ตั้งชื่อ)
 *
 * เก็บแม่แบบในตารางกลาง erp_lookups (lookup_type='payroll_contract_template', metadata=ค่าฟิลด์)
 * → จัดการ/ลบได้ที่ /admin/lookups
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const LOOKUP_TYPE = "payroll_contract_template";

// ฟิลด์ที่ไม่เก็บลงแม่แบบ (เฉพาะตัวพนักงาน/เลขที่/วันที่)
const DEFAULT_EXCLUDE = [
  "id", "employee_id", "employee_code", "employee_name", "employee_label",
  "contract_no", "contract_label", "start_date", "end_date", "is_current", "active",
];

type Template = { id: string; name: string; values: Record<string, unknown> };

export function ContractTemplateBar({
  values,
  onApply,
  excludeKeys = DEFAULT_EXCLUDE,
}: {
  values: Record<string, unknown>;
  onApply: (vals: Record<string, unknown>) => void;
  excludeKeys?: string[];
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/lookups?type=${LOOKUP_TYPE}`);
      const j = await r.json();
      const list = ((j.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
        id: String(o.id),
        name: String(o.name ?? ""),
        values: (o.metadata as Record<string, unknown>) ?? {},
      }));
      setTemplates(list);
    } catch { /* เงียบ */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const apply = (id: string) => {
    setSel(id);
    setMsg(null);
    const t = templates.find((x) => x.id === id);
    if (t) {
      onApply(t.values);
      setMsg(`เติมค่าจากแม่แบบ "${t.name}" แล้ว`);
    }
  };

  const saveTemplate = async () => {
    const name = window.prompt("ตั้งชื่อแม่แบบ (เช่น พนักงานรายเดือนทั่วไป)");
    if (!name || !name.trim()) return;
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (excludeKeys.includes(k)) continue;
      if (v === "" || v == null) continue;
      metadata[k] = v;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiFetch("/api/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup_type: LOOKUP_TYPE, name: name.trim(), metadata }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกแม่แบบไม่สำเร็จ");
      setMsg(`บันทึกแม่แบบ "${name.trim()}" แล้ว`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "บันทึกแม่แบบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block text-xs font-medium text-blue-800">ใช้แม่แบบ (เติมค่าให้อัตโนมัติ)</span>
          <select
            value={sel}
            onChange={(e) => apply(e.target.value)}
            disabled={loading}
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{loading ? "กำลังโหลด..." : templates.length ? "— เลือกแม่แบบ —" : "ยังไม่มีแม่แบบ"}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={saveTemplate}
          disabled={saving}
          className="h-9 whitespace-nowrap rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "💾 บันทึกค่าปัจจุบันเป็นแม่แบบ"}
        </button>
      </div>
      {msg && <div className="mt-2 text-[11px] text-blue-700">{msg}</div>}
    </div>
  );
}
