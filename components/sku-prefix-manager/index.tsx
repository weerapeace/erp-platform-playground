"use client";

// ============================================================
// SkuPrefixManager — ตั้ง "รหัสนำหน้า SKU" ต่อแท็ก/ประเภท (ของกลาง)
// ใช้ที่: หน้าจัดการแท็ก + ปุ่มในป๊อป Wizard เพิ่ม SKU
// ตั้ง prefix รายแท็ก ผ่าน /api/skus/tag-prefix · เช่น ซาเฟียโน่ = 'LEA-SAF-'
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PrefixRow = { id: string; name: string; code_prefix: string; group_name: string | null };

export function SkuPrefixManager({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PrefixRow[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [onlySet, setOnlySet] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => setRows((j.data ?? []) as PrefixRow[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const setVal = (id: string, v: string) => setRows((l) => l.map((r) => (r.id === id ? { ...r, code_prefix: v } : r)));
  const save = async (row: PrefixRow) => {
    setSaving(row.id);
    try {
      const res = await apiFetch("/api/skus/tag-prefix", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, code_prefix: row.code_prefix }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) { alert((e as Error).message); load(); }
    finally { setSaving(null); }
  };

  const shown = rows.filter((r) => {
    if (onlySet && !r.code_prefix) return false;
    const s = q.trim().toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || (r.group_name ?? "").toLowerCase().includes(s) || r.code_prefix.toLowerCase().includes(s);
  });

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">🔢 รหัสนำหน้า SKU ต่อประเภท</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">ตั้งครั้งเดียวต่อประเภท · Wizard จะใช้หาเลขล่าสุดแล้วเสนอเลขถัดไป (เช่น <code>LEA-SAF-</code> → LEA-SAF-028)</p>
        </div>
        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาประเภท..." className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md" />
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} className="rounded border-slate-300" /> เฉพาะที่ตั้งแล้ว</label>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {shown.length === 0 && <div className="px-5 py-8 text-center text-xs text-slate-400">— ไม่พบประเภท —</div>}
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-5 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-800 truncate">{r.name}</div>
                {r.group_name && <div className="text-[10px] text-slate-400">{r.group_name}</div>}
              </div>
              <input value={r.code_prefix} onChange={(e) => setVal(r.id, e.target.value)} placeholder="เช่น LEA-SAF-"
                className="w-40 h-8 px-2 text-sm font-mono border border-slate-200 rounded-md" />
              <button onClick={() => save(r)} disabled={saving === r.id}
                className="h-8 px-2.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving === r.id ? "..." : "บันทึก"}</button>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 text-right">
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
        </div>
      </div>
    </div>
  );
}
