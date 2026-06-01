"use client";

/**
 * C2b: widget สำหรับ many2many + one2many
 * - RelationMany2Many: เลือกหลายค่า (จัดการ link ใน junction table ทันที)
 * - RelationOne2Many: แสดงรายการลูกที่ชี้กลับมา (read-only)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type RelConfig = {
  kind?: string;
  junction_table?: string;
  target_table?: string;
  target_module_key?: string;
  target_label_field?: string;
  target_fk_column?: string;
};

type Opt = { id: string; label: string };

async function fetchOptions(moduleKey: string, labelField: string): Promise<Opt[]> {
  const r = await apiFetch(`/api/master-v2/${moduleKey}?limit=500`);
  const j = await r.json();
  return (j.data ?? j.rows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: String(row[labelField] ?? row.name ?? row.id),
  }));
}

// ---- many2many ----
export function RelationMany2Many({ config, recordId, editable }: { config: RelConfig; recordId?: string | null; editable: boolean }) {
  const junction = config.junction_table ?? "";
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const labelField = config.target_label_field ?? "name";
  const [linked, setLinked] = useState<string[]>([]);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!recordId || !junction) return;
    const [lr, os] = await Promise.all([
      apiFetch(`/api/admin/schema/m2m-links?junction=${junction}&src_id=${recordId}`).then((r) => r.json()),
      fetchOptions(moduleKey, labelField),
    ]);
    setLinked(lr.links ?? []);
    setOpts(os);
  }, [recordId, junction, moduleKey, labelField]);

  useEffect(() => { void load(); }, [load]);

  if (!recordId) return <div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเพิ่มความสัมพันธ์ได้</div>;

  const labelOf = (id: string) => opts.find((o) => o.id === id)?.label ?? id.slice(0, 8);
  const unlinked = opts.filter((o) => !linked.includes(o.id));

  const add = async (id: string) => {
    if (!id) return;
    setBusy(true);
    await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, src_id: recordId, tgt_id: id }) });
    setLinked((p) => [...p, id]); setBusy(false);
  };
  const remove = async (id: string) => {
    setBusy(true);
    await apiFetch("/api/admin/schema/m2m-links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, src_id: recordId, tgt_id: id }) });
    setLinked((p) => p.filter((x) => x !== id)); setBusy(false);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {linked.length === 0 && <span className="text-xs text-slate-300">— ยังไม่มี —</span>}
        {linked.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
            {labelOf(id)}
            {editable && <button type="button" onClick={() => remove(id)} disabled={busy} className="text-blue-400 hover:text-red-500">✕</button>}
          </span>
        ))}
      </div>
      {editable && (
        <select value="" disabled={busy} onChange={(e) => add(e.target.value)}
          className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white max-w-full">
          <option value="">+ เพิ่ม…</option>
          {unlinked.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

// ---- one2many (read-only) ----
export function RelationOne2Many({ config, recordId }: { config: RelConfig; recordId?: string | null }) {
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const fk = config.target_fk_column ?? "";
  const labelField = config.target_label_field ?? "name";
  const [rows, setRows] = useState<Opt[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!recordId || !fk) return;
    const filters = encodeURIComponent(JSON.stringify({ [fk]: { type: "text", value: recordId } }));
    apiFetch(`/api/master-v2/${moduleKey}?limit=200&filters=${filters}`).then((r) => r.json()).then((j) => {
      setRows((j.data ?? j.rows ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), label: String(row[labelField] ?? row.name ?? row.id) })));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [recordId, fk, moduleKey, labelField]);

  if (!recordId) return <div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div>;
  if (!loaded) return <div className="text-xs text-slate-400">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-xs text-slate-300">— ไม่มีรายการ —</div>;

  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.id} className="text-sm text-slate-700 px-2 py-1 bg-slate-50 rounded border border-slate-100">{r.label}</li>
      ))}
    </ul>
  );
}
