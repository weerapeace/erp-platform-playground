"use client";

/**
 * C2b: widget สำหรับ many2many + one2many
 * - RelationMany2Many: เลือกหลายค่า (จัดการ link ใน junction table ทันที)
 * - RelationOne2Many: แสดงรายการลูกที่ชี้กลับมา (read-only)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { RelationPeekModal } from "@/components/relation-peek";

type RelConfig = {
  kind?: string;
  junction_table?: string;
  target_table?: string;
  target_module_key?: string;
  target_label_field?: string;
  target_fk_column?: string;
  // one2many: แสดงผลแบบครบ (รูป + ชื่อ + ข้อมูลย่อย) — ถ้าไม่ระบุ จะโชว์แค่ label
  list_image_field?: string;          // column ที่เป็น R2 key รูป
  list_title_field?: string;          // column ชื่อหลัก (default = target_label_field)
  list_sub_fields?: string[];         // columns ข้อมูลย่อย แสดงต่อท้าย คั่นด้วย ·
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
const r2img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);
const fmtVal = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
};

export function RelationOne2Many({ config, recordId, title }: { config: RelConfig; recordId?: string | null; title?: string }) {
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const fk = config.target_fk_column ?? "";
  const titleField = config.list_title_field ?? config.target_label_field ?? "name";
  const imageField = config.list_image_field;
  const subFields  = config.list_sub_fields ?? [];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [peek, setPeek] = useState<{ id: string; edit: boolean } | null>(null);  // กดรายการลูก → ดู/แก้ record นั้น

  const load = useCallback(() => {
    if (!recordId || !fk) return;
    setLoaded(false);
    // กรองที่ server ด้วย fk โดยตรง (uuid-eq) — รองรับตารางใหญ่ (เช่น skus 12,000+ แถว)
    const flt = encodeURIComponent(JSON.stringify({ [fk]: { type: "text", value: recordId } }));
    apiFetch(`/api/master-v2/${moduleKey}?limit=200&filters=${flt}`).then((r) => r.json()).then((j) => {
      setRows((j.data ?? j.rows ?? []) as Record<string, unknown>[]);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [recordId, fk, moduleKey]);

  useEffect(() => { load(); }, [load]);

  // หัวข้อ + จำนวน (สำหรับ 360 view)
  const header = title ? (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-sm font-medium text-slate-700">{title}</span>
      {loaded && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{rows.length}{rows.length >= 200 ? "+" : ""}</span>}
    </div>
  ) : null;

  if (!recordId) return <>{header}<div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div></>;
  if (!loaded) return <>{header}<div className="text-xs text-slate-400">กำลังโหลด…</div></>;
  if (rows.length === 0) return <>{header}<div className="text-xs text-slate-300">— ไม่มีรายการ —</div></>;

  const rich = !!(imageField || subFields.length > 0);

  const list = !rich ? (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={String(r.id)} className="group flex items-center gap-1 px-2 py-1 bg-slate-50 rounded border border-slate-100 hover:border-blue-300 hover:bg-blue-50/40">
          <button type="button" onClick={() => setPeek({ id: String(r.id), edit: false })} className="flex-1 min-w-0 text-left text-sm text-slate-700 inline-flex items-center gap-1">
            <span className="flex-1 truncate">{String(r[titleField] ?? r.name ?? r.id)}</span>
          </button>
          <button type="button" onClick={() => setPeek({ id: String(r.id), edit: true })} title="แก้ไข"
            className="flex-shrink-0 w-6 h-6 rounded text-xs text-slate-400 hover:text-blue-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">✎</button>
        </li>
      ))}
    </ul>
  ) : (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const sub = subFields.map((f) => fmtVal(r[f])).filter(Boolean).join(" · ");
        const imgKey = imageField ? r[imageField] : null;
        return (
          <li key={String(r.id)} className="group flex items-center gap-2.5 px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/40">
            <button type="button" onClick={() => setPeek({ id: String(r.id), edit: false })} className="flex-1 min-w-0 text-left flex items-center gap-2.5">
              {imageField && (
                <div className="w-9 h-9 rounded bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {r2img(imgKey)
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r2img(imgKey)!} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-sm">📦</span>}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-700 truncate">{String(r[titleField] ?? r.name ?? r.id)}</div>
                {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
              </div>
            </button>
            <button type="button" onClick={() => setPeek({ id: String(r.id), edit: true })} title="แก้ไข"
              className="flex-shrink-0 w-6 h-6 rounded text-xs text-slate-400 hover:text-blue-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">✎</button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {header}
      {list}
      {peek && moduleKey && (
        <RelationPeekModal moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit}
          onChanged={load} onClose={() => setPeek(null)} />
      )}
    </>
  );
}
