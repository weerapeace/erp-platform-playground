"use client";

/**
 * จัดการแม่แบบสัญญา — แม่แบบที่สร้างจากปุ่ม "บันทึกเป็นแม่แบบ" ในฟอร์มเพิ่มสัญญา
 * เก็บในตารางกลาง erp_lookups (lookup_type = payroll_contract_template, metadata = ค่าฟิลด์)
 *
 * แก้แม่แบบ: เปลี่ยนชื่อ · แก้ค่าที่เป็นข้อความ/ตัวเลข (กดที่ค่า) · เอาค่าออก (✕) · ลบแม่แบบ
 * ค่าที่เป็นตัวเลือก (เช่น ตารางเวลาทำงาน) แก้ที่ฟอร์มเพิ่มสัญญา: เลือกแม่แบบ → ปรับค่า → "บันทึกทับแม่แบบนี้"
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { InlineEdit } from "@/components/inline-edit";

const LOOKUP_TYPE = "payroll_contract_template";

type Tpl = { id: string; name: string; values: Record<string, unknown> };

// ป้ายไทยของฟิลด์ที่พบบ่อย (ไว้โชว์ตัวอย่างค่าในแม่แบบ)
const FIELD_LABEL: Record<string, string> = {
  company_name: "บริษัท", contract_type: "ประเภทสัญญา", employment_type: "ประเภทการจ้าง",
  wage_type: "ประเภทค่าจ้าง", base_salary: "เงินเดือน", daily_wage: "ค่าจ้างรายวัน",
  hourly_wage: "ค่าจ้างรายชม.", payment_cycle: "รอบจ่าย", status: "สถานะ",
  work_schedule_id: "ตารางเวลาทำงาน", leave_policy_id: "นโยบายลา", overtime_policy_id: "นโยบาย OT",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// แก้ตรงนี้ได้เฉพาะค่าที่คนอ่านออก (ข้อความ/ตัวเลข) — รหัสอ้างอิงและค่าเปิด/ปิด ต้องแก้ผ่านฟอร์มสัญญา
const editableKind = (v: unknown): "number" | "text" | null => {
  if (typeof v === "boolean" || (typeof v === "object" && v !== null)) return null;
  if (typeof v === "number") return "number";
  const str = String(v ?? "");
  if (UUID_RE.test(str)) return null;
  return str.trim() !== "" && Number.isFinite(Number(str)) ? "number" : "text";
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

  // แก้ค่า 1 ช่องในแม่แบบ (value = undefined → เอาค่านั้นออกจากแม่แบบ)
  const setValue = async (t: Tpl, key: string, value: unknown) => {
    const metadata: Record<string, unknown> = { ...t.values };
    if (value === undefined || value === "") delete metadata[key]; else metadata[key] = value;
    setMsg(""); setErr("");
    try {
      const r = await apiFetch(`/api/lookups/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "แก้แม่แบบไม่สำเร็จ");
      setMsg(`แก้แม่แบบ "${t.name}" แล้ว`); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "แก้แม่แบบไม่สำเร็จ"); }
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
                        {entries.map(([k, v]) => {
                          const kind = editableKind(v);
                          return (
                            <span key={k} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                              <span className="text-slate-400">{FIELD_LABEL[k] ?? k}:</span>
                              {kind ? (
                                <InlineEdit type={kind} value={String(v)} compact width="7rem" className="font-medium text-slate-700"
                                  onSave={(nv) => setValue(t, k, nv === "" ? undefined : kind === "number" ? Number(nv) : nv)} />
                              ) : (
                                <span className="font-medium text-slate-700">{fmtVal(v)}</span>
                              )}
                              <button type="button" onClick={() => void setValue(t, k, undefined)} title="เอาค่านี้ออกจากแม่แบบ"
                                className="text-slate-300 hover:text-red-500">✕</button>
                            </span>
                          );
                        })}
                      </div>
                      {entries.length > 0 && <div className="mt-1.5 text-[11px] text-slate-400">กดที่ค่า (ข้อความ/ตัวเลข) เพื่อแก้ · ✕ = เอาค่านั้นออก · ค่าที่เป็นตัวเลือกแก้ที่ฟอร์มเพิ่มสัญญา แล้วกด “บันทึกทับแม่แบบนี้”</div>}
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
