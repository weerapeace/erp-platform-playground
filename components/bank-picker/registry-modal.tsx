"use client";

/**
 * BankRegistryModal — จัดการทะเบียนธนาคาร (ของกลาง คู่กับ BankPicker)
 *   ✏️ แก้ชื่อ / รหัสย่อ / จำนวนหลักเลขบัญชี · ปิดใช้งาน (ไม่ขึ้นให้เลือกอีก) · ↩ เปิดใช้งานอีกครั้ง
 * ไม่มี "ลบ": เอกสารเก่าเก็บชื่อธนาคารเป็นข้อความ — แก้ชื่อที่นี่ ของเก่าที่บันทึกไปแล้วไม่เปลี่ยนตาม
 * เปิดจากปุ่ม "⚙️ จัดการทะเบียนธนาคาร" ท้ายรายการของ BankPicker
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

type Row = { id: string; name: string; code: string | null; account_digits: number | null; is_active: boolean | null };

export function BankRegistryModal({ country = "TH", onClose }: { country?: string; onClose: (changed: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [ed, setEd] = useState<{ id: string; name: string; code: string; digits: string } | null>(null);
  const [offAsk, setOffAsk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/payroll/banks?all=1&country=${encodeURIComponent(country)}`).then((r) => r.json());
      if (j.error) setErr(j.error); else setRows((j.data ?? []) as Row[]);
    } catch { setErr("โหลดทะเบียนธนาคารไม่ได้"); }
    finally { setLoading(false); }
  }, [country]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("/api/payroll/banks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setChanged(true);
      await load();
      return true;
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };

  const saveEd = async () => {
    if (!ed || !ed.name.trim()) return;
    if (await patch({ id: ed.id, name: ed.name.trim(), code: ed.code.trim(), account_digits: Number(ed.digits) || 10 })) setEd(null);
  };

  return (
    <ERPModal open onClose={() => onClose(changed)} size="md" title="⚙️ ทะเบียนธนาคาร"
      description="แก้ชื่อที่พิมพ์ผิด หรือปิดธนาคารที่ไม่ใช้แล้ว — เอกสารเก่าที่บันทึกชื่อไปแล้วไม่เปลี่ยนตาม"
      footer={<button onClick={() => onClose(changed)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>}>
      {err && <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">⚠ {err}</div>}
      {loading ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
        : rows.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีธนาคารในทะเบียน — เพิ่มได้จากช่องเลือกธนาคาร</div>
        : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows.map((b) => ed?.id === b.id ? (
              <div key={b.id} className="space-y-2 bg-blue-50/40 px-3 py-2">
                <div className="grid grid-cols-[1fr_90px_90px] gap-1.5">
                  <label className="text-[11px] text-slate-500">ชื่อธนาคาร
                    <input value={ed.name} autoFocus onChange={(e) => setEd({ ...ed, name: e.target.value })}
                      className="mt-0.5 h-8 w-full rounded border border-slate-300 px-2 text-sm" /></label>
                  <label className="text-[11px] text-slate-500">รหัสย่อ
                    <input value={ed.code} onChange={(e) => setEd({ ...ed, code: e.target.value })} placeholder="SCB"
                      className="mt-0.5 h-8 w-full rounded border border-slate-300 px-2 font-mono text-sm" /></label>
                  <label className="text-[11px] text-slate-500">เลขบัญชี (หลัก)
                    <input value={ed.digits} type="number" min={1} max={30} onChange={(e) => setEd({ ...ed, digits: e.target.value })}
                      className="mt-0.5 h-8 w-full rounded border border-slate-300 px-2 text-right text-sm" /></label>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setEd(null)} disabled={busy} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600">ยกเลิก</button>
                  <button onClick={() => void saveEd()} disabled={busy || !ed.name.trim()} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
                </div>
              </div>
            ) : (
              <div key={b.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${b.is_active === false ? "bg-slate-50 text-slate-400" : "text-slate-700"}`}>
                <span className="min-w-0 flex-1 truncate">{b.name}{b.is_active === false && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">ปิดใช้งาน</span>}</span>
                {b.code && <span className="shrink-0 font-mono text-[11px] text-slate-400">{b.code}</span>}
                <span className="shrink-0 text-[11px] text-slate-400">{b.account_digits ?? 10} หลัก</span>
                {offAsk === b.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button onClick={() => { setOffAsk(null); void patch({ id: b.id, is_active: false }); }} disabled={busy} className="h-7 rounded-md bg-rose-600 px-2 text-[11px] text-white hover:bg-rose-700">ยืนยันปิด</button>
                    <button onClick={() => setOffAsk(null)} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-500">ไม่ปิด</button>
                  </span>
                ) : b.is_active === false ? (
                  <button onClick={() => void patch({ id: b.id, is_active: true })} disabled={busy} className="shrink-0 text-xs text-emerald-600 hover:underline">↩ เปิดใช้งาน</button>
                ) : (
                  <>
                    <button onClick={() => setEd({ id: b.id, name: b.name, code: b.code ?? "", digits: String(b.account_digits ?? 10) })} className="shrink-0 text-xs text-blue-600 hover:underline">✏️ แก้</button>
                    <button onClick={() => setOffAsk(b.id)} className="shrink-0 text-xs text-rose-600 hover:underline">ปิดใช้งาน</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
    </ERPModal>
  );
}
