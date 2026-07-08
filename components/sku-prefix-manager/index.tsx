"use client";

// ============================================================
// SkuPrefixManager — ตั้งค่าเริ่มต้นต่อแท็ก/ประเภท (ของกลาง)
// ใช้ที่: หน้าจัดการแท็ก + ปุ่มในป๊อป Wizard เพิ่ม SKU
// ต่อประเภทตั้งได้: รหัสนำหน้า (code_prefix) · ชื่อ default · หน่วย default
// → Wizard ดึงมาเสนอ/เติมให้อัตโนมัติ · ผ่าน /api/skus/tag-prefix
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

type PrefixDefault = { name: string; uom_id: string | null; uom_label: string };
type PrefixRow = {
  id: string; name: string; code_prefix: string; group_name: string | null;
  default_name: string; default_uom_id: string | null; default_uom_label: string;
  prefix_defaults: Record<string, PrefixDefault>;
};
type TagCode = { prefix: string; latest_code: string; suggested: string; count: number };

export function SkuPrefixManager({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PrefixRow[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [onlySet, setOnlySet] = useState(false);
  const [uomOpts, setUomOpts] = useState<SelectOption[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);          // แท็กที่กางดูรายตระกูลรหัส
  const [codesCache, setCodesCache] = useState<Record<string, TagCode[]>>({});

  const load = useCallback(() => {
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => setRows((j.data ?? []) as PrefixRow[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // โหลดหน่วยทั้งหมด (สำหรับ dropdown หน่วย default)
  useEffect(() => {
    apiFetch("/api/admin/picker?table=uoms&label=name&limit=500").then((r) => r.json())
      .then((j) => setUomOpts(((j.data ?? []) as { id: string; label: string }[]).map((o) => ({ value: o.id, label: o.label }))))
      .catch(() => {});
  }, []);

  const setField = (id: string, patch: Partial<PrefixRow>) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // แก้ค่า default ราย "ตระกูลรหัส" (prefix)
  const setPrefixDefault = (id: string, prefix: string, patch: Partial<PrefixDefault>) =>
    setRows((l) => l.map((r) => r.id === id
      ? { ...r, prefix_defaults: { ...r.prefix_defaults, [prefix]: { ...(r.prefix_defaults[prefix] ?? { name: "", uom_id: null, uom_label: "" }), ...patch } } }
      : r));
  // เติมค่า default ของแท็ก (ชื่อ/หน่วย ด้านบน) ให้ "ทุกตระกูลรหัส" ในแท็กนั้น
  const fillAllPrefix = (row: PrefixRow, field: "name" | "uom") => {
    const codes = codesCache[row.id] ?? [];
    setRows((l) => l.map((r) => {
      if (r.id !== row.id) return r;
      const pd = { ...r.prefix_defaults };
      for (const c of codes) {
        const cur = pd[c.prefix] ?? { name: "", uom_id: null, uom_label: "" };
        pd[c.prefix] = field === "name"
          ? { ...cur, name: row.default_name }
          : { ...cur, uom_id: row.default_uom_id, uom_label: row.default_uom_label };
      }
      return { ...r, prefix_defaults: pd };
    }));
  };
  // กาง/พับ + โหลดตระกูลรหัสของแท็ก (จาก tag-codes)
  const toggleExpand = (id: string) => {
    setExpanded((cur) => (cur === id ? null : id));
    if (!codesCache[id]) {
      apiFetch(`/api/skus/tag-codes?family_tag_id=${id}`).then((r) => r.json())
        .then((j) => setCodesCache((c) => ({ ...c, [id]: (j.prefixes ?? []) as TagCode[] }))).catch(() => {});
    }
  };
  const save = async (row: PrefixRow) => {
    setSaving(row.id);
    try {
      const pd = Object.fromEntries(Object.entries(row.prefix_defaults ?? {}).map(([k, v]) => [k, { name: v.name, uom_id: v.uom_id }]));
      const res = await apiFetch("/api/skus/tag-prefix", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, code_prefix: row.code_prefix, default_name: row.default_name, default_uom_id: row.default_uom_id, prefix_defaults: pd }),
      });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch (e) { alert((e as Error).message); load(); }
    finally { setSaving(null); }
  };

  const shown = rows.filter((r) => {
    if (onlySet && !r.code_prefix && !r.default_name && !r.default_uom_id) return false;
    const s = q.trim().toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || (r.group_name ?? "").toLowerCase().includes(s) || r.code_prefix.toLowerCase().includes(s);
  });

  // ความกว้างคอลัมน์ (ให้ทุกแถว/หัวตารางตรงกัน — ลดความลายตา)
  const cTag = "flex-1 min-w-0", cPrefix = "w-28 shrink-0", cName = "flex-[1.6] min-w-0", cUom = "w-32 shrink-0", cAct = "w-[120px] shrink-0 flex items-center justify-end gap-1";

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">🔢 ค่าเริ่มต้น SKU ต่อประเภท</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">ตั้งครั้งเดียวต่อประเภท → Wizard เติมรหัส/ชื่อ/หน่วยให้อัตโนมัติ · กด <b>▸ ตระกูล</b> เพื่อตั้งค่าแยกรายตระกูลรหัส (กรณีประเภทหนึ่งมีหลายรหัส)</p>
        </div>
        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาประเภท..." className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md" />
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} className="rounded border-slate-300" /> เฉพาะที่ตั้งแล้ว</label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* หัวตาราง — โผล่ครั้งเดียว (ไม่ต้องมีป้ายซ้ำทุกแถว) */}
          <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-5 py-1.5 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
            <div className={cTag}>ประเภท / ตระกูลรหัส</div>
            <div className={cPrefix}>รหัสนำหน้า</div>
            <div className={cName}>ชื่อ default</div>
            <div className={cUom}>หน่วย</div>
            <div className={cAct} />
          </div>
          {shown.length === 0 && <div className="px-5 py-8 text-center text-xs text-slate-400">— ไม่พบประเภท —</div>}
          {shown.map((r) => (
            <div key={r.id}>
              {/* แถวประเภท (แท็ก) */}
              <div className="px-5 py-1.5 flex items-center gap-2 border-b border-slate-50 hover:bg-slate-50/50">
                <div className={cTag}>
                  <div className="text-sm text-slate-800 truncate leading-tight">{r.name}
                    {r.group_name && <span className="text-[10px] text-slate-400 font-normal ml-1.5">{r.group_name}</span>}</div>
                </div>
                <div className={cPrefix}><input value={r.code_prefix} onChange={(e) => setField(r.id, { code_prefix: e.target.value })} placeholder="LEA-SAF-"
                  className="w-full h-9 px-2 text-sm font-mono border border-slate-200 rounded-md" /></div>
                <div className={cName}><input value={r.default_name} onChange={(e) => setField(r.id, { default_name: e.target.value })} placeholder="ชื่อเริ่มต้น"
                  className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md" /></div>
                <div className={cUom}><SearchableSelect value={r.default_uom_id ?? ""} options={uomOpts} placeholder="—" onChange={(v) => setField(r.id, { default_uom_id: v || null })} /></div>
                <div className={cAct}>
                  <button onClick={() => toggleExpand(r.id)} title="ตั้งค่าแยกรายตระกูลรหัส"
                    className={`h-9 px-2 text-[11px] rounded-md border whitespace-nowrap ${expanded === r.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {expanded === r.id ? "▾" : "▸"} ตระกูล{Object.keys(r.prefix_defaults ?? {}).length ? ` ${Object.keys(r.prefix_defaults).length}` : ""}</button>
                  <button onClick={() => save(r)} disabled={saving === r.id} title="บันทึก"
                    className="h-9 w-9 shrink-0 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving === r.id ? "…" : "💾"}</button>
                </div>
              </div>
              {/* กางรายตระกูลรหัส — คอลัมน์ตรงกับหัวตาราง */}
              {expanded === r.id && (
                <div className="bg-blue-50/30 border-b border-slate-100 py-1">
                  <div className="px-5 py-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">ตั้งชื่อ/หน่วยแยกรายตระกูล · เว้นว่าง = ใช้ค่าด้านบน</span>
                    {(codesCache[r.id]?.length ?? 0) > 0 && r.default_name && (
                      <button type="button" onClick={() => fillAllPrefix(r, "name")}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-white hover:border-blue-300">↓ เติมชื่อ &ldquo;{r.default_name}&rdquo; ทุกตระกูล</button>
                    )}
                    {(codesCache[r.id]?.length ?? 0) > 0 && r.default_uom_id && (
                      <button type="button" onClick={() => fillAllPrefix(r, "uom")}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-white hover:border-blue-300">↓ เติมหน่วย{r.default_uom_label ? ` "${r.default_uom_label}"` : ""} ทุกตระกูล</button>
                    )}
                  </div>
                  {!codesCache[r.id] ? <div className="px-5 py-1.5 text-[11px] text-slate-400">กำลังโหลด…</div>
                    : codesCache[r.id].length === 0 ? <div className="px-5 py-1.5 text-[11px] text-slate-400">— ยังไม่มีตระกูลรหัสที่ใช้อยู่ —</div>
                    : codesCache[r.id].map((c) => {
                        const pd = r.prefix_defaults?.[c.prefix] ?? { name: "", uom_id: null, uom_label: "" };
                        return (
                          <div key={c.prefix} className="px-5 py-1 flex items-center gap-2">
                            <div className={`${cTag} pl-2 min-w-0`}>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-slate-300 shrink-0">↳</span>
                                <span className="font-mono text-[12px] text-slate-700 truncate" title={c.prefix}>{c.prefix}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 pl-3.5 truncate">ล่าสุด {c.latest_code}</div>
                            </div>
                            <div className={cPrefix} />
                            <div className={cName}><input value={pd.name} onChange={(e) => setPrefixDefault(r.id, c.prefix, { name: e.target.value })} placeholder={r.default_name || "ชื่อเฉพาะตระกูลนี้"}
                              className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white" /></div>
                            <div className={cUom}><SearchableSelect value={pd.uom_id ?? ""} options={uomOpts} placeholder="—" onChange={(v) => setPrefixDefault(r.id, c.prefix, { uom_id: v || null })} /></div>
                            <div className={cAct} />
                          </div>
                        );
                      })}
                </div>
              )}
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
