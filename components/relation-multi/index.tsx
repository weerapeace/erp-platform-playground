"use client";

/**
 * C2b: widget สำหรับ many2many + one2many
 * - RelationMany2Many: เลือกหลายค่า (จัดการ link ใน junction table ทันที)
 * - RelationOne2Many: แสดงรายการลูกที่ชี้กลับมา (read-only)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { RelationPeekModal } from "@/components/relation-peek";
import { resolveRelationLabels, readRelationLabel, type RelationConfig } from "@/lib/relation";

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

// ---- ตัวเลือกคอลัมน์ตารางลูก (บันทึกกลาง) ----
function O2MColumnPicker({ allFields, titleField, imageField, current, onSave, onClose }: {
  allFields: { key: string; label: string }[];
  titleField: string;
  imageField?: string;
  current: string[];
  onSave: (next: string[]) => void;
  onClose: () => void;
}) {
  const hidden = new Set(["id", titleField, imageField].filter(Boolean) as string[]);
  const valid = (k: string) => allFields.some((f) => f.key === k);
  const [selected, setSelected] = useState<string[]>(current.filter(valid));
  const labelOf = (k: string) => allFields.find((f) => f.key === k)?.label ?? k;
  const available = allFields.filter((f) => !hidden.has(f.key) && !selected.includes(f.key));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected]; [next[i], next[j]] = [next[j], next[i]]; setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">⚙ เลือกคอลัมน์ตารางลูก</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-100">
          คอลัมน์หลัก: <b className="text-slate-600">{labelOf(titleField)}</b> (แสดงเสมอ) — เลือกคอลัมน์เพิ่มด้านล่าง
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">แสดงอยู่ ({selected.length}) — เรียงลำดับได้</div>
            {selected.length === 0 && <div className="text-xs text-slate-300 italic">— ยังไม่เลือกคอลัมน์เพิ่ม —</div>}
            <ul className="space-y-1">
              {selected.map((k, i) => (
                <li key={k} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50/60 border border-blue-100 rounded-md text-sm">
                  <span className="flex-1 truncate text-slate-700">{labelOf(k)}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="ขึ้น" className="w-6 h-6 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === selected.length - 1} title="ลง" className="w-6 h-6 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30">▼</button>
                  <button onClick={() => setSelected(selected.filter((x) => x !== k))} title="เอาออก" className="w-6 h-6 rounded text-slate-400 hover:text-red-500">✕</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">เพิ่มคอลัมน์ ({available.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {available.map((f) => (
                <button key={f.key} onClick={() => setSelected([...selected, f.key])}
                  className="px-2 py-1 text-xs rounded-full border border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                  + {f.label}
                </button>
              ))}
              {available.length === 0 && <span className="text-xs text-slate-300 italic">— เลือกครบทุกคอลัมน์แล้ว —</span>}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 text-sm text-slate-600 hover:bg-slate-100 rounded-md">ยกเลิก</button>
          <button onClick={() => onSave(selected)} className="h-8 px-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">บันทึก (ทุกคนเห็น)</button>
        </div>
      </div>
    </div>
  );
}

export function RelationOne2Many({ config, recordId, title, fieldId, configurable }: { config: RelConfig; recordId?: string | null; title?: string; fieldId?: string; configurable?: boolean }) {
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const fk = config.target_fk_column ?? "";
  const titleField = config.list_title_field ?? config.target_label_field ?? "name";
  const imageField = config.list_image_field;
  // คอลัมน์ที่โชว์ (list_sub_fields) — เก็บเป็น state เพื่อให้ปุ่ม "เลือกคอลัมน์" อัปเดตทันทีไม่ต้อง refresh
  const [subFields, setSubFields] = useState<string[]>(config.list_sub_fields ?? []);
  useEffect(() => { setSubFields(config.list_sub_fields ?? []); }, [config.list_sub_fields]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canConfig = !!configurable && !!fieldId;
  const PAGE = 20;   // โหลดทีละ 20 (ลดภาระ worker) แล้วกด "ดูเพิ่ม"
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [peek, setPeek] = useState<{ id: string; edit: boolean } | null>(null);  // กดรายการลูก → ดู/แก้ record นั้น

  // ดึงทีละหน้า (filter fk ที่ server)
  const fetchPage = useCallback(async (offset: number) => {
    const flt = encodeURIComponent(JSON.stringify({ [fk]: { type: "text", value: recordId } }));
    const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=${PAGE}&offset=${offset}&filters=${flt}`).then((r) => r.json());
    return { data: (j.data ?? j.rows ?? []) as Record<string, unknown>[], total: Number(j.total ?? 0) };
  }, [moduleKey, fk, recordId]);

  const load = useCallback(() => {
    if (!recordId || !fk) return;
    setLoaded(false);
    fetchPage(0).then(({ data, total }) => { setRows(data); setTotal(total); setLoaded(true); }).catch(() => setLoaded(true));
  }, [recordId, fk, fetchPage]);

  useEffect(() => { load(); }, [load]);

  // ดึง label หัวคอลัมน์ + รายการ field + config ของฟิลด์เชื่อม (FK) จากทะเบียน field ของโมดูลลูก (ของกลาง)
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [allFields, setAllFields] = useState<{ key: string; label: string }[]>([]);
  const [relCfgByField, setRelCfgByField] = useState<Record<string, RelationConfig>>({});
  useEffect(() => {
    if (!moduleKey) return;
    apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(moduleKey)}`).then((r) => r.json())
      .then((j) => {
        const m: Record<string, string> = {};
        const list: { key: string; label: string }[] = [];
        const rels: Record<string, RelationConfig> = {};
        (j.fields ?? []).forEach((f: Record<string, unknown>) => {
          const k = String(f.column_name ?? f.field_key);
          const lbl = String(f.field_label ?? k);
          m[k] = lbl; list.push({ key: k, label: lbl });
          // ฟิลด์เชื่อม = มี relation_config ที่ชี้ตารางปลายทาง → ใช้แปลง id→ชื่อ
          const rc = f.relation_config as RelationConfig | undefined;
          if (rc && (rc.target_table || rc.lookup_type)) rels[k] = rc;
        });
        setLabels(m); setAllFields(list); setRelCfgByField(rels);
      }).catch(() => {});
  }, [moduleKey]);
  const labelOf = (k: string) => labels[k] ?? k;

  // แปลง id→ชื่อ ของคอลัมน์ที่เป็นฟิลด์เชื่อม (batch ทีเดียวต่อคอลัมน์) — ของกลาง lib/relation
  const [relLabels, setRelLabels] = useState<Record<string, Map<string, string>>>({});
  useEffect(() => {
    const relCols = subFields.filter((f) => relCfgByField[f]);
    if (relCols.length === 0 || rows.length === 0) return;
    let alive = true;
    (async () => {
      const out: Record<string, Map<string, string>> = {};
      for (const f of relCols) {
        // เก็บเฉพาะ id ที่ยังไม่มี label denormalized ติดมา ({base}_label)
        const ids = rows
          .filter((r) => readRelationLabel(r, f) == null && r[f] != null && r[f] !== "")
          .map((r) => String(r[f]));
        if (ids.length === 0) continue;
        try {
          const map = await resolveRelationLabels(apiFetch, relCfgByField[f], ids);
          const labelMap = new Map<string, string>();
          map.forEach((opt, id) => labelMap.set(id, opt.label));
          out[f] = labelMap;
        } catch { /* ignore — fallback แสดง id */ }
      }
      if (alive) setRelLabels(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subFields, relCfgByField]);

  // ค่าที่จะแสดงในเซลล์ — ถ้าเป็นฟิลด์เชื่อม แปลงเป็นชื่อ ไม่งั้นแสดงค่าปกติ
  const cellValue = (r: Record<string, unknown>, f: string): string | null => {
    if (relCfgByField[f]) {
      const denorm = readRelationLabel(r, f);
      if (denorm) return denorm;
      const id = r[f] != null ? String(r[f]) : "";
      const name = id ? relLabels[f]?.get(id) : undefined;
      return name ?? (id ? fmtVal(id) : null);
    }
    return fmtVal(r[f]);
  };

  // บันทึกคอลัมน์ที่เลือก → ทะเบียน field กลาง (ทุกคนเห็นเหมือนกัน)
  const saveColumns = async (next: string[]) => {
    if (!fieldId) { alert("บันทึกไม่ได้ — ไม่พบรหัส field"); return; }
    try {
      const res = await apiFetch(`/api/admin/field-registry-v2/${fieldId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation_config: { ...config, list_sub_fields: next } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("บันทึกคอลัมน์ไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setSubFields(next);
      setPickerOpen(false);
      // โหลดใหม่ให้ค่าจาก DB มีผลทุกที่ (และยืนยันว่าบันทึกจริง)
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      alert("บันทึกคอลัมน์ไม่สำเร็จ: " + (e instanceof Error ? e.message : "network error"));
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try { const { data } = await fetchPage(rows.length); setRows((p) => [...p, ...data]); }
    catch { /* ignore */ } finally { setLoadingMore(false); }
  };

  // ปุ่มตั้งค่าคอลัมน์ (เฉพาะคนมีสิทธิ์ + เป็น field จริง)
  const gearBtn = canConfig ? (
    <button type="button" onClick={() => setPickerOpen(true)} title="เลือกคอลัมน์ที่จะแสดง"
      className="flex-shrink-0 w-6 h-6 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center text-xs">⚙</button>
  ) : null;
  const pickerModal = pickerOpen ? (
    <O2MColumnPicker allFields={allFields} titleField={titleField} imageField={imageField}
      current={subFields} onSave={saveColumns} onClose={() => setPickerOpen(false)} />
  ) : null;

  // หัวข้อ + จำนวน (สำหรับ 360 view)
  const header = title ? (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-sm font-medium text-slate-700">{title}</span>
      {loaded && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{total}</span>}
      <div className="flex-1" />
      {gearBtn}
    </div>
  ) : gearBtn ? (
    <div className="flex justify-end mb-1">{gearBtn}</div>
  ) : null;

  if (!recordId) return <>{header}<div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div>{pickerModal}</>;
  if (!loaded) return <>{header}<div className="text-xs text-slate-400">กำลังโหลด…</div>{pickerModal}</>;
  if (rows.length === 0) return <>{header}<div className="text-xs text-slate-300">— ไม่มีรายการ —</div>{pickerModal}</>;

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
  ) : (() => {
    // แบบตาราง (ของกลาง) — คอลัมน์ = title + sub fields, มียอดรวมท้ายตาราง
    const sums: Record<string, number> = {};
    let anySum = false;
    for (const f of subFields) {
      let s = 0, has = false;
      for (const r of rows) { const n = Number(r[f]); if (r[f] !== null && r[f] !== "" && typeof r[f] !== "boolean" && isFinite(n)) { s += n; has = true; } }
      if (has) { sums[f] = s; anySum = true; }
    }
    return (
      <div className="overflow-x-auto border border-slate-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {imageField && <th className="px-2 py-1.5 w-10" />}
              <th className="px-2 py-1.5 text-left font-medium">{labelOf(titleField)}</th>
              {subFields.map((f) => <th key={f} className={`px-2 py-1.5 font-medium whitespace-nowrap ${relCfgByField[f] ? "text-left" : "text-right"}`}>{labelOf(f)}</th>)}
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={String(r.id)} className="group hover:bg-blue-50/40 cursor-pointer" onClick={() => setPeek({ id: String(r.id), edit: false })}>
                {imageField && (
                  <td className="px-2 py-1.5">
                    <div className="w-8 h-8 rounded bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                      {r2img(r[imageField])
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r2img(r[imageField])!} alt="" className="w-full h-full object-cover" />
                        : <span className="text-slate-300 text-xs">📦</span>}
                    </div>
                  </td>
                )}
                <td className="px-2 py-1.5 text-slate-700">{String(r[titleField] ?? r.name ?? r.id)}</td>
                {subFields.map((f) => {
                  const isRel = !!relCfgByField[f];
                  return <td key={f} className={`px-2 py-1.5 text-slate-600 whitespace-nowrap ${isRel ? "text-left" : "text-right tabular-nums"}`}>{cellValue(r, f) ?? "—"}</td>;
                })}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" title="แก้ไข" onClick={(e) => { e.stopPropagation(); setPeek({ id: String(r.id), edit: true }); }}
                    className="w-6 h-6 rounded text-xs text-slate-400 hover:text-blue-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">✎</button>
                </td>
              </tr>
            ))}
          </tbody>
          {anySum && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                {imageField && <td />}
                <td className="px-2 py-1.5 text-xs text-slate-500">รวม ({rows.length})</td>
                {subFields.map((f) => <td key={f} className="px-2 py-1.5 text-right tabular-nums">{sums[f] != null ? sums[f].toLocaleString() : ""}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  })();

  return (
    <>
      {header}
      {list}
      {rows.length < total && (
        <button type="button" onClick={loadMore} disabled={loadingMore}
          className="mt-1.5 w-full h-8 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {loadingMore ? "กำลังโหลด…" : `ดูเพิ่ม (เหลืออีก ${total - rows.length})`}
        </button>
      )}
      {peek && moduleKey && (
        <RelationPeekModal moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit}
          onChanged={load} onClose={() => setPeek(null)} />
      )}
      {pickerModal}
    </>
  );
}
