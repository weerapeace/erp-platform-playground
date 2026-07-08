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

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">🔢 ค่าเริ่มต้น SKU ต่อประเภท</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">ตั้งครั้งเดียวต่อประเภท — <b>รหัสนำหน้า</b> (เช่น <code>LEA-SAF-</code> → LEA-SAF-028) · <b>ชื่อ default</b> · <b>หน่วย default</b> → Wizard เติมให้อัตโนมัติ</p>
        </div>
        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาประเภท..." className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md" />
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} className="rounded border-slate-300" /> เฉพาะที่ตั้งแล้ว</label>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {shown.length === 0 && <div className="px-5 py-8 text-center text-xs text-slate-400">— ไม่พบประเภท —</div>}
          {shown.map((r) => (
            <div key={r.id} className="px-5 py-2.5">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <span className="text-sm text-slate-800">{r.name}</span>
                  {r.group_name && <span className="text-[10px] text-slate-400 ml-1.5">{r.group_name}</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggleExpand(r.id)}
                    className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                    {expanded === r.id ? "▾" : "▸"} รายตระกูล{Object.keys(r.prefix_defaults ?? {}).length ? ` (${Object.keys(r.prefix_defaults).length})` : ""}</button>
                  <button onClick={() => save(r)} disabled={saving === r.id}
                    className="h-7 px-3 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving === r.id ? "..." : "บันทึก"}</button>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <label className="block"><span className="text-[10px] text-slate-400">รหัสนำหน้า</span>
                  <input value={r.code_prefix} onChange={(e) => setField(r.id, { code_prefix: e.target.value })} placeholder="LEA-SAF-"
                    className="mt-0.5 w-32 h-8 px-2 text-sm font-mono border border-slate-200 rounded-md" /></label>
                <label className="block flex-1 min-w-0"><span className="text-[10px] text-slate-400">ชื่อ default</span>
                  <input value={r.default_name} onChange={(e) => setField(r.id, { default_name: e.target.value })} placeholder="เช่น หนังซาเฟียโน่"
                    className="mt-0.5 w-full h-8 px-2 text-sm border border-slate-200 rounded-md" /></label>
                <label className="block w-40"><span className="text-[10px] text-slate-400">หน่วย default</span>
                  <div className="mt-0.5"><SearchableSelect value={r.default_uom_id ?? ""} options={uomOpts} placeholder="— หน่วย —"
                    onChange={(v) => setField(r.id, { default_uom_id: v || null })} /></div></label>
              </div>
              {/* กางรายตระกูลรหัส — ตั้งชื่อ/หน่วย default แยกราย prefix (แก้ปัญหา 1 แท็กมีหลายรหัสนำหน้า) */}
              {expanded === r.id && (
                <div className="mt-2 pl-3 border-l-2 border-blue-100 space-y-1.5">
                  <div className="text-[10px] text-slate-400">ตั้งชื่อ/หน่วย default แยกราย &ldquo;ตระกูลรหัส&rdquo; ที่ใช้จริงในประเภทนี้ (Wizard เลือกตระกูลแล้วเติมตามนี้ · ว่าง=ใช้ค่ารวมด้านบน)</div>
                  {!codesCache[r.id] ? <div className="text-[11px] text-slate-400">กำลังโหลด…</div>
                    : codesCache[r.id].length === 0 ? <div className="text-[11px] text-slate-400">— ยังไม่มีตระกูลรหัสที่ใช้อยู่ —</div>
                    : codesCache[r.id].map((c) => {
                        const pd = r.prefix_defaults?.[c.prefix] ?? { name: "", uom_id: null, uom_label: "" };
                        return (
                          <div key={c.prefix} className="flex items-end gap-2">
                            <div className="w-36 shrink-0"><span className="text-[10px] text-slate-400">ล่าสุด {c.latest_code}</span>
                              <div className="font-mono text-[12px] text-slate-700 truncate">{c.prefix}</div></div>
                            <label className="block flex-1 min-w-0"><span className="text-[10px] text-slate-400">ชื่อ default</span>
                              <input value={pd.name} onChange={(e) => setPrefixDefault(r.id, c.prefix, { name: e.target.value })} placeholder={r.default_name || "ชื่อสำหรับตระกูลนี้"}
                                className="mt-0.5 w-full h-8 px-2 text-sm border border-slate-200 rounded-md" /></label>
                            <label className="block w-36"><span className="text-[10px] text-slate-400">หน่วย</span>
                              <div className="mt-0.5"><SearchableSelect value={pd.uom_id ?? ""} options={uomOpts} placeholder="— หน่วย —"
                                onChange={(v) => setPrefixDefault(r.id, c.prefix, { uom_id: v || null })} /></div></label>
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
