"use client";

/**
 * จัดการแม่แบบสัญญา — แม่แบบที่สร้างจากปุ่ม "บันทึกเป็นแม่แบบ" ในฟอร์มเพิ่มสัญญา
 * เก็บในตารางกลาง erp_lookups (lookup_type = payroll_contract_template, metadata = ค่าฟิลด์)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const LOOKUP_TYPE = "payroll_contract_template";

type Tpl = { id: string; name: string; values: Record<string, unknown> };

// ป้ายไทยของฟิลด์ที่พบบ่อย (ไว้โชว์ตัวอย่างค่าในแม่แบบ)
const FIELD_LABEL: Record<string, string> = {
  company_name: "บริษัท", contract_type: "ประเภทสัญญา", employment_type: "ประเภทการจ้าง",
  wage_type: "ประเภทค่าจ้าง", base_salary: "เงินเดือน", daily_wage: "ค่าจ้างรายวัน",
  hourly_wage: "ค่าจ้างรายชม.", payment_cycle: "รอบจ่าย", status: "สถานะ",
  work_schedule_id: "ตารางเวลาทำงาน", leave_policy_id: "นโยบายลา", overtime_policy_id: "นโยบาย OT",
};

const fmtVal = (v: unknown) => {
  if (v === true) return "เปิด";
  if (v === false) return "ปิด";
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n.toLocaleString("th-TH") : String(v ?? "");
};

export default function ContractTemplatesPage() {
  const [rows, setRows] = useState<Tpl[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setErr("");
    try {
      const j = await apiFetch(`/api/lookups?type=${LOOKUP_TYPE}`).then((r) => r.json());
      setRows(((j.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
        id: String(o.id), name: String(o.name ?? ""), values: (o.metadata as Record<string, unknown>) ?? {},
      })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดแม่แบบไม่สำเร็จ");
    }
  };
  useEffect(() => { void load(); }, []);

  const rename = async (t: Tpl) => {
    const name = window.prompt("เปลี่ยนชื่อแม่แบบ", t.name);
    if (!name || !name.trim() || name.trim() === t.name) return;
    setMsg("");
    try {
      const r = await apiFetch(`/api/lookups/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "เปลี่ยนชื่อไม่สำเร็จ");
      setMsg("เปลี่ยนชื่อแล้ว"); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "เปลี่ยนชื่อไม่สำเร็จ"); }
  };

  const remove = async (t: Tpl) => {
    if (!window.confirm(`ลบแม่แบบ "${t.name}" ?`)) return;
    setMsg("");
    try {
      const r = await apiFetch(`/api/lookups/${t.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "ลบไม่สำเร็จ");
      setMsg("ลบแล้ว"); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📄 แม่แบบสัญญา</h1>
          <p className="mt-1 text-sm text-slate-500">
            ชุดค่าเริ่มต้นที่ใช้ตอนสร้างสัญญาใหม่ (เลือกแม่แบบในฟอร์ม → เติมค่าทุกช่องให้) — สร้างแม่แบบได้จากปุ่ม
            <b> “บันทึกเป็นแม่แบบ” </b> ในฟอร์มเพิ่มสัญญา
          </p>
        </div>

        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>}

        {!rows && !err && <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">กำลังโหลด...</div>}

        {rows && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            ยังไม่มีแม่แบบสัญญา — ไปที่หน้า “สัญญาจ้าง” กด “＋ เพิ่มสัญญา” กรอกค่าที่ใช้บ่อย แล้วกด “บันทึกเป็นแม่แบบ”
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((t) => {
              const entries = Object.entries(t.values).filter(([, v]) => v !== "" && v != null);
              return (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-slate-900">{t.name}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entries.length === 0 && <span className="text-xs text-slate-400">— ไม่มีค่าที่บันทึก —</span>}
                        {entries.map(([k, v]) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                            <span className="text-slate-400">{FIELD_LABEL[k] ?? k}:</span>
                            <span className="font-medium text-slate-700">{fmtVal(v)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => rename(t)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">เปลี่ยนชื่อ</button>
                      <button onClick={() => remove(t)} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50">ลบ</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
