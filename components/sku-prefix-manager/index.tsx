"use client";

// ============================================================
// SkuPrefixManager — ตั้งค่าเริ่มต้นต่อแท็ก/ประเภท (ของกลาง)
// ใช้ที่: หน้าจัดการแท็ก + ปุ่มในป๊อป Wizard เพิ่ม SKU
// ต่อประเภทตั้งได้: รหัสนำหน้า (code_prefix) · ชื่อ default · หน่วย default
// → Wizard ดึงมาเสนอ/เติมให้อัตโนมัติ · ผ่าน /api/skus/tag-prefix (มี audit log)
// แก้ได้ทันทีหลายแถว (แถวที่แก้มีแถบส้ม) → "บันทึกทั้งหมด" ครั้งเดียว + ย้อนกลับได้ (ของกลาง useSaveAll/SaveAllBar · เจ้าของสั่ง 2026-11-23)
// ติ๊กหลายประเภท → ตั้งหน่วยให้ทีเดียว · ซ่อนตระกูล / ปลด SKU = มีผลทันที (ไม่รอบันทึกทั้งหมด)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { ConfirmDialog } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { useSaveAll, SaveAllBar, DIRTY_ROW_CLASS } from "@/components/save-bar/save-all";

type PrefixDefault = { name: string; uom_id: string | null; uom_label: string; hidden?: boolean };
type PrefixRow = {
  id: string; name: string; code_prefix: string; group_name: string | null;
  default_name: string; default_uom_id: string | null; default_uom_label: string;
  prefix_defaults: Record<string, PrefixDefault>;
};
type TagCode = { prefix: string; latest_code: string; latest_name: string; suggested: string; count: number };

// ค่าที่ "บันทึกทั้งหมด" ดูแล (ไม่นับ hidden — ซ่อนตระกูลบันทึกทันที)
const pdKey = (pd: Record<string, PrefixDefault>) =>
  JSON.stringify(Object.keys(pd ?? {}).sort().map((k) => [k, pd[k]?.name ?? "", pd[k]?.uom_id ?? null]).filter(([, n, u]) => n || u));
const sameRow = (a: PrefixRow, b: PrefixRow) =>
  a.code_prefix === b.code_prefix && a.default_name === b.default_name && (a.default_uom_id ?? null) === (b.default_uom_id ?? null) && pdKey(a.prefix_defaults) === pdKey(b.prefix_defaults);

async function patchRow(row: PrefixRow): Promise<string | null> {
  const pd = Object.fromEntries(Object.entries(row.prefix_defaults ?? {}).map(([k, v]) => [k, { name: v.name, uom_id: v.uom_id, hidden: v.hidden }]));
  const res = await apiFetch("/api/skus/tag-prefix", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: row.id, code_prefix: row.code_prefix, default_name: row.default_name, default_uom_id: row.default_uom_id, prefix_defaults: pd }),
  });
  const j = await res.json().catch(() => ({}));
  return !res.ok || j.error ? String(j.error ?? "บันทึกไม่สำเร็จ") : null;
}

export function SkuPrefixManager({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PrefixRow[]>([]);
  const [orig, setOrig] = useState<Map<string, PrefixRow>>(new Map());   // ค่าก่อนแก้ (ใช้นับแถวที่แก้ + ย้อนกลับ)
  const [q, setQ] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [uomOpts, setUomOpts] = useState<SelectOption[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);          // แท็กที่กางดูรายตระกูลรหัส
  const [codesCache, setCodesCache] = useState<Record<string, TagCode[]>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());            // ติ๊กไว้ → ตั้งหน่วยให้ทีเดียว
  const [showHidden, setShowHidden] = useState<Set<string>>(new Set());   // แท็กที่กำลังโชว์ตระกูลที่ซ่อน
  const [untagPending, setUntagPending] = useState<{ tagId: string; tagName: string; prefix: string } | null>(null);
  const [busyUntag, setBusyUntag] = useState(false);
  const toast = useToast();
  const inCls = "w-full h-9 px-2 text-sm rounded-md border border-slate-200 bg-white placeholder:text-slate-300";

  const load = useCallback(() => {
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => {
      const data = (j.data ?? []) as PrefixRow[];
      setRows(data); setOrig(new Map(data.map((r) => [r.id, r])));
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // โหลดหน่วยทั้งหมด (สำหรับ dropdown หน่วย default)
  useEffect(() => {
    apiFetch("/api/admin/picker?table=uoms&label=name&limit=500").then((r) => r.json())
      .then((j) => setUomOpts(((j.data ?? []) as { id: string; label: string }[]).map((o) => ({ value: o.id, label: o.label }))))
      .catch(() => {});
  }, []);
  const uomLabel = (id: string | null) => (id ? uomOpts.find((o) => o.value === id)?.label ?? "" : "");

  // 💾 บันทึกทั้งหมด (ของกลาง) — แถวที่แก้ค้าง · ย้อนกลับ = บันทึกค่าเดิมกลับ
  const sa = useSaveAll<PrefixRow>({
    items: rows, keyOf: (r) => r.id, original: useCallback((r: PrefixRow) => orig.get(r.id), [orig]),
    isDirty: useCallback((r: PrefixRow, o: PrefixRow | undefined) => !!o && !sameRow(r, o), []),
    // บันทึกสำเร็จ = ค่านี้กลายเป็นค่าเดิม (แถวที่พลาดยังค้างให้แก้ต่อ ไม่โหลดทับ)
    saveOne: async (r: PrefixRow) => { const e = await patchRow(r); if (!e) setOrig((mm) => new Map(mm).set(r.id, r)); return e; },
    undoOne: patchRow, afterUndo: load, label: (r) => r.name,
  });
  const discard = () => setRows((l) => l.map((r) => orig.get(r.id) ?? r));
  const close = async () => {
    if (sa.pending > 0 && !(await askConfirm({ title: "คุณมีข้อมูลที่ยังไม่ได้บันทึก", message: `แก้ค้าง ${sa.pending} ประเภท ต้องการออกโดยไม่บันทึกหรือไม่?`, confirmText: "ออกโดยไม่บันทึก", cancelText: "อยู่ต่อ", variant: "danger" }))) return;
    onClose();
  };

  const setField = (id: string, patch: Partial<PrefixRow>) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // แก้ค่า default ราย "ตระกูลรหัส" (prefix)
  const setPrefixDefault = (id: string, prefix: string, patch: Partial<PrefixDefault>) =>
    setRows((l) => l.map((r) => r.id === id
      ? { ...r, prefix_defaults: { ...r.prefix_defaults, [prefix]: { ...(r.prefix_defaults[prefix] ?? { name: "", uom_id: null, uom_label: "" }), ...patch } } }
      : r));
  // เติมค่าให้ "ทุกตระกูลรหัส" — name=ชื่อ default ด้านบน · latestName=ชื่อ SKU ตัวล่าสุดของแต่ละตระกูล · uom=หน่วย default
  const fillAllPrefix = (row: PrefixRow, field: "name" | "latestName" | "uom") => {
    const codes = codesCache[row.id] ?? [];
    setRows((l) => l.map((r) => {
      if (r.id !== row.id) return r;
      const pd = { ...r.prefix_defaults };
      for (const c of codes) {
        const cur = pd[c.prefix] ?? { name: "", uom_id: null, uom_label: "" };
        pd[c.prefix] = field === "name" ? { ...cur, name: row.default_name }
          : field === "latestName" ? { ...cur, name: c.latest_name || cur.name }
          : { ...cur, uom_id: row.default_uom_id, uom_label: row.default_uom_label };
      }
      return { ...r, prefix_defaults: pd };
    }));
  };
  // ติ๊กหลายประเภท → ตั้งหน่วยให้ทีเดียว (ยังไม่บันทึก — รวมใน "บันทึกทั้งหมด")
  const bulkUom = (uomId: string | null) => {
    if (picked.size === 0) return;
    setRows((l) => l.map((r) => (picked.has(r.id) ? { ...r, default_uom_id: uomId, default_uom_label: uomLabel(uomId) } : r)));
    toast.info(`ตั้งหน่วยให้ ${picked.size} ประเภทแล้ว — กด "บันทึกทั้งหมด" เพื่อบันทึก`);
  };
  // ซ่อน/เลิกซ่อน ตระกูลรหัส (เก็บใน prefix_defaults[prefix].hidden) — บันทึกทันที (ใช้ค่าที่บันทึกแล้ว ไม่พาที่แก้ค้างไปด้วย) · ไม่แตะ SKU
  const setHidden = async (row: PrefixRow, prefix: string, hidden: boolean) => {
    const saved = orig.get(row.id) ?? row;
    const mark = (pd: Record<string, PrefixDefault>) => ({ ...pd, [prefix]: { ...(pd[prefix] ?? { name: "", uom_id: null, uom_label: "" }), hidden } });
    setRows((l) => l.map((r) => (r.id === row.id ? { ...r, prefix_defaults: mark(r.prefix_defaults) } : r)));
    setOrig((m) => new Map(m).set(row.id, { ...saved, prefix_defaults: mark(saved.prefix_defaults) }));
    try {
      const pd = mark(saved.prefix_defaults);
      const body = Object.fromEntries(Object.entries(pd).map(([k, v]) => [k, { name: v.name, uom_id: v.uom_id, hidden: v.hidden }]));
      await apiFetch("/api/skus/tag-prefix", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, prefix_defaults: body }) });
      toast.undo(hidden ? "ซ่อนตระกูลแล้ว" : "เลิกซ่อนแล้ว", () => setHidden(row, prefix, !hidden));
    } catch { toast.error("บันทึกไม่สำเร็จ"); load(); }
  };
  // โหลดตระกูลรหัสของแท็กใหม่ (หลังปลด SKU)
  const reloadCodes = (tagId: string) => {
    apiFetch(`/api/skus/tag-codes?family_tag_id=${tagId}`).then((r) => r.json())
      .then((j) => setCodesCache((c) => ({ ...c, [tagId]: (j.prefixes ?? []) as TagCode[] }))).catch(() => {});
  };
  // ปลด SKU ของตระกูลนี้ออกจากแท็ก (หลังยืนยัน) — แก้ที่ต้นเหตุ
  const doUntag = async (tagId: string, prefix: string) => {
    setBusyUntag(true);
    try {
      const res = await apiFetch("/api/skus/tag-prefix/untag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family_tag_id: tagId, prefix }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error ?? "ปลดไม่สำเร็จ");
      toast.success(`ปลด ${j.removed} SKU ออกจากแท็กแล้ว`);
      reloadCodes(tagId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ปลดไม่สำเร็จ"); }
    finally { setBusyUntag(false); setUntagPending(null); }
  };
  // กาง/พับ + โหลดตระกูลรหัสของแท็ก (จาก tag-codes)
  const toggleExpand = (id: string) => {
    setExpanded((cur) => (cur === id ? null : id));
    if (!codesCache[id]) reloadCodes(id);
  };

  const shown = rows.filter((r) => {
    if (onlySet && !r.code_prefix && !r.default_name && !r.default_uom_id) return false;
    const s = q.trim().toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || (r.group_name ?? "").toLowerCase().includes(s) || r.code_prefix.toLowerCase().includes(s);
  });
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ความกว้างคอลัมน์ (PC ตรงกับหัวตาราง · มือถือ = ชื่อประเภทเต็มบรรทัด แล้วช่องกรอกเรียงต่อ)
  const cTag = "basis-full sm:basis-auto sm:flex-1 min-w-0", cPrefix = "w-[calc(50%-4px)] sm:w-28 shrink-0", cName = "w-[calc(50%-4px)] sm:w-auto sm:flex-[1.6] min-w-0",
    cUom = "basis-full sm:basis-auto sm:w-32 shrink-0", cAct = "basis-full sm:basis-auto sm:w-[84px] shrink-0 flex items-center justify-end gap-1";

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => void close()}>
      <div className="w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">🔢 ค่าเริ่มต้น SKU ต่อประเภท</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">แก้ได้หลายแถวเลย แล้วกด <b>บันทึกทั้งหมด</b> ทีเดียว · Wizard เพิ่ม SKU เติมรหัส/ชื่อ/หน่วยให้อัตโนมัติ · กด <b>▸ ตระกูล</b> เพื่อตั้งแยกรายตระกูลรหัส</p>
        </div>
        <div className="px-4 sm:px-5 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาประเภท..." className="flex-1 min-w-[160px] h-8 px-2 text-sm border border-slate-200 rounded-md" />
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} className="rounded border-slate-300" /> เฉพาะที่ตั้งแล้ว</label>
          {picked.size > 0 && (
            <div className="flex items-center gap-1.5 basis-full sm:basis-auto">
              <span className="text-xs text-blue-700 whitespace-nowrap">ตั้งหน่วยให้ที่ติ๊ก ({picked.size})</span>
              <div className="w-32"><SearchableSelect value="" options={uomOpts} placeholder="เลือกหน่วย" onChange={(v) => bulkUom(v || null)} /></div>
              <button type="button" onClick={() => setPicked(new Set())} className="text-[11px] text-slate-400 hover:text-slate-600">ล้างที่ติ๊ก</button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* หัวตาราง — โผล่ครั้งเดียว (มือถือซ่อน) */}
          <div className="hidden sm:flex sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-5 py-1.5 items-center gap-2 text-[10px] font-semibold text-slate-400">
            <div className={`${cTag} flex items-center gap-2`}>
              <input type="checkbox" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? new Set() : new Set(shown.map((r) => r.id)))} className="rounded border-slate-300" title="ติ๊กทั้งหมดที่เห็น" />
              ประเภท / ตระกูลรหัส
            </div>
            <div className={cPrefix}>รหัสนำหน้า</div>
            <div className={cName}>ชื่อ default</div>
            <div className={cUom}>หน่วย</div>
            <div className={cAct} />
          </div>
          {shown.length === 0 && <div className="px-5 py-8 text-center text-xs text-slate-400">— ไม่พบประเภท —</div>}
          {shown.map((r) => (
            <div key={r.id}>
              {/* แถวประเภท (แท็ก) — แก้ได้เลย แถวที่แก้ค้างมีแถบส้ม */}
              <div className={`px-4 sm:px-5 py-2 sm:py-1.5 flex flex-wrap sm:flex-nowrap items-center gap-2 border-b border-slate-100 ${sa.isDirty(r) ? DIRTY_ROW_CLASS : "hover:bg-slate-50/50"}`}>
                <div className={`${cTag} flex items-center gap-2`}>
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} className="rounded border-slate-300 shrink-0" />
                  <div className="text-sm text-slate-800 truncate leading-tight">{r.name}
                    {r.group_name && <span className="text-[10px] text-slate-400 font-normal ml-1.5">{r.group_name}</span>}
                    {sa.isDirty(r) && <span className="ml-1.5 text-[10px] text-amber-700">● แก้แล้ว</span>}</div>
                </div>
                <div className={cPrefix}><input value={r.code_prefix} onChange={(e) => setField(r.id, { code_prefix: e.target.value })} placeholder="— รหัสนำหน้า" title="เช่น LEA-SAF-"
                  className={`${inCls} font-mono`} /></div>
                <div className={cName}><input value={r.default_name} onChange={(e) => setField(r.id, { default_name: e.target.value })} placeholder="— ชื่อเริ่มต้น"
                  className={inCls} /></div>
                <div className={cUom}><SearchableSelect value={r.default_uom_id ?? ""} options={uomOpts} placeholder="— หน่วย" onChange={(v) => setField(r.id, { default_uom_id: v || null, default_uom_label: uomLabel(v || null) })} /></div>
                <div className={cAct}>
                  <button onClick={() => toggleExpand(r.id)} title="ตั้งค่าแยกรายตระกูลรหัส"
                    className={`h-9 px-2 text-[11px] rounded-md border whitespace-nowrap ${expanded === r.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {expanded === r.id ? "▾" : "▸"} ตระกูล{Object.keys(r.prefix_defaults ?? {}).length ? ` ${Object.keys(r.prefix_defaults).length}` : ""}</button>
                </div>
              </div>
              {/* กางรายตระกูลรหัส — คอลัมน์ตรงกับหัวตาราง */}
              {expanded === r.id && (
                <div className="bg-blue-50/30 border-b border-slate-100 py-1">
                  <div className="px-4 sm:px-5 py-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">ตั้งชื่อ/หน่วยแยกรายตระกูล · เว้นว่าง = ใช้ค่าด้านบน</span>
                    {(codesCache[r.id] ?? []).some((c) => c.latest_name) && (
                      <button type="button" onClick={() => fillAllPrefix(r, "latestName")} title="ดึงชื่อ SKU ตัวล่าสุดของแต่ละตระกูลมาใส่"
                        className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50">↓ ใช้ชื่อ SKU ล่าสุด (ทุกตระกูล)</button>
                    )}
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
                    : (() => {
                        const all = codesCache[r.id];
                        const hiddenCount = all.filter((c) => r.prefix_defaults?.[c.prefix]?.hidden).length;
                        const show = showHidden.has(r.id);
                        const vis = show ? all : all.filter((c) => !r.prefix_defaults?.[c.prefix]?.hidden);
                        return (<>
                          {vis.map((c) => {
                            const pd = r.prefix_defaults?.[c.prefix] ?? { name: "", uom_id: null, uom_label: "" };
                            return (
                              <div key={c.prefix} className={`px-4 sm:px-5 py-1 flex flex-wrap sm:flex-nowrap items-center gap-2 ${pd.hidden ? "opacity-50" : ""}`}>
                                <div className={`${cTag} pl-2 min-w-0`}>
                                  <div className="flex items-center gap-1 min-w-0">
                                    <span className="text-slate-300 shrink-0">↳</span>
                                    <span className="font-mono text-[12px] text-slate-700 truncate" title={c.prefix}>{c.prefix}</span>
                                    {pd.hidden && <span className="text-[9px] text-slate-400 shrink-0">(ซ่อน)</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-400 pl-3.5 truncate">ล่าสุด {c.latest_code}</div>
                                </div>
                                <div className={`hidden sm:block ${cPrefix}`} />
                                <div className={cName}><input value={pd.name} onChange={(e) => setPrefixDefault(r.id, c.prefix, { name: e.target.value })} placeholder={c.latest_name || r.default_name || "— ชื่อเฉพาะตระกูลนี้"}
                                  className={inCls} /></div>
                                <div className={`w-[calc(50%-4px)] sm:w-32 shrink-0`}><SearchableSelect value={pd.uom_id ?? ""} options={uomOpts} placeholder="— หน่วย" onChange={(v) => setPrefixDefault(r.id, c.prefix, { uom_id: v || null })} /></div>
                                <div className={cAct}>
                                  <button type="button" title={pd.hidden ? "เลิกซ่อน" : "ซ่อนตระกูลนี้ (ไม่แตะ SKU)"} onClick={() => void setHidden(r, c.prefix, !pd.hidden)}
                                    className="h-7 w-7 text-xs rounded border border-slate-200 text-slate-400 hover:bg-white">{pd.hidden ? "👁" : "🙈"}</button>
                                  <button type="button" title="ปลด SKU ตระกูลนี้ออกจากแท็ก (แก้ที่ต้นเหตุ)" onClick={() => setUntagPending({ tagId: r.id, tagName: r.name, prefix: c.prefix })}
                                    className="h-7 w-7 text-xs rounded border border-rose-200 text-rose-500 hover:bg-rose-50">🗑</button>
                                </div>
                              </div>
                            );
                          })}
                          {hiddenCount > 0 && (
                            <button type="button" onClick={() => setShowHidden((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                              className="px-5 py-1 text-[10px] text-slate-400 hover:text-slate-600">{show ? "▲ ซ่อนที่ซ่อนไว้อีกครั้ง" : `▾ แสดงตระกูลที่ซ่อน (${hiddenCount})`}</button>
                          )}
                        </>);
                      })()}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200">
          <SaveAllBar sa={sa} unit="ประเภท" onDiscard={discard}
            extra={<button onClick={() => void close()} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>} />
        </div>
        {untagPending && (
          <ConfirmDialog open onClose={() => !busyUntag && setUntagPending(null)} variant="danger" loading={busyUntag}
            title="ปลด SKU ออกจากแท็ก"
            message={`ปลด SKU ตระกูล "${untagPending.prefix}" ทั้งหมด ออกจากแท็ก "${untagPending.tagName}"? (SKU ยังอยู่ในระบบ แค่ไม่ผูกแท็กนี้แล้ว)`}
            confirmText="ปลดออกจากแท็ก" onConfirm={() => void doUntag(untagPending.tagId, untagPending.prefix)} />
        )}
      </div>
    </div>
  );
}
