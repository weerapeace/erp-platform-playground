"use client";

/**
 * 📚 Design Library — ⚙️ จัดการตัวเลือก (เพิ่ม / แก้ / ลบ) ทุกรายการในที่เดียว
 * แท็บ: หมวด · สีอะไหล่ · สีด้าย · แบบช่อง · กฎห้ามคู่ (lib/design-library CHOICE_LISTS)
 * แก้หลายแถวแล้วกด "บันทึกทั้งหมด" ครั้งเดียว · ลบ = ปิดไว้ (กู้คืนได้จาก "โมดูลทั้งหมด") ผ่าน ConfirmDialog กลาง
 * สิทธิ์ design_library.manage · audit ทุกแถว (handler กลาง lib/crud-resource-api)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { CATEGORY_SOURCES, CHOICE_LISTS, type Choice, type ChoiceListKey } from "@/lib/design-library";
import { api, newId } from "./shared";

type Row = Choice & { _new?: boolean; _dirty?: boolean };

export function ChoicesManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<ChoiceListKey>("category");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api<Choice[]>(`/api/design-library/choices?limit=2000`)); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const list = useMemo(() => (rows ?? []).filter((r) => r.list_key === tab), [rows, tab]);
  const dirty = (rows ?? []).some((r) => r._dirty || r._new);
  const cats = useMemo(() => (rows ?? []).filter((r) => r.list_key === "category"), [rows]);

  const patch = (id: string, p: Partial<Row>) => setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...p, _dirty: true } : r)));
  const patchCfg = (r: Row, p: Record<string, unknown>) => patch(r.id, { config: { ...r.config, ...p } });
  const add = () => setRows((prev) => [...(prev ?? []), {
    id: `new-${newId()}`, list_key: tab, code: "", name: "", name_en: null, hex: tab === "hw_color" || tab === "thread_color" ? "#cccccc" : null,
    config: tab === "category" ? { source: "sku_text" } : tab === "rule" ? { a: "", b: "", reason: "" } : {},
    sort_order: (list.at(-1)?.sort_order ?? 0) + 10, is_active: true, _new: true,
  }]);

  const saveAll = async () => {
    const todo = (rows ?? []).filter((r) => r._dirty || r._new);
    const bad = todo.find((r) => !r.code.trim() || !r.name.trim());
    if (bad) { setTab(bad.list_key); toast.error("ทุกแถวต้องมีรหัสและชื่อ"); return; }
    setSaving(true);
    let ok = 0; const fails: string[] = [];
    for (const r of todo) {
      const body = { list_key: r.list_key, code: r.code.trim(), name: r.name.trim(), name_en: r.name_en?.trim() || null, hex: r.hex || null, config: r.config, sort_order: r.sort_order };
      try {
        if (r._new) await api(`/api/design-library/choices`, { json: body });
        else { const { list_key: _lk, ...rest } = body; void _lk; await api(`/api/design-library/choices/${r.id}`, { method: "PATCH", json: rest }); }
        ok++;
      } catch (e) { fails.push(`${r.name || r.code}: ${(e as Error).message}`); }
    }
    setSaving(false);
    if (fails.length) toast.error(`บันทึกไม่ผ่าน ${fails.length} แถว — ${fails[0]}`);
    if (ok) { toast.success(`บันทึกแล้ว ${ok} แถว`); onChanged(); }
    await load();
  };

  const remove = async (r: Row) => {
    if (r._new) { setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); setDel(null); return; }
    try { await api(`/api/design-library/choices/${r.id}`, { method: "DELETE" }); toast.success("ลบแล้ว"); onChanged(); setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); }
    catch (e) { toast.error((e as Error).message); }
    setDel(null);
  };

  const inp = "h-8 px-2 border border-slate-200 rounded-md text-[13px] text-slate-800 w-full";
  const info = CHOICE_LISTS.find((l) => l.key === tab)!;

  return (
    <ERPModal open={open} onClose={onClose} title="ตั้งค่าตัวเลือก Design Library" size="xl" hasUnsavedChanges={dirty} storageKey="design-library-choices"
      footer={<div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500">{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}</span>
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ปิด</button>
        <button type="button" onClick={() => void saveAll()} disabled={!dirty || saving} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกทั้งหมด"}</button>
      </div>}>
      <div className="flex flex-wrap gap-1 mb-3">
        {CHOICE_LISTS.map((l) => (
          <button key={l.key} type="button" onClick={() => setTab(l.key)}
            className={`h-8 px-3 text-[13px] rounded-full border ${tab === l.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {l.label} <span className="text-slate-400">{(rows ?? []).filter((r) => r.list_key === l.key).length}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-slate-500 mb-2">{info.hint}</p>
      {err ? <ErrorState title="โหลดตัวเลือกไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดตัวเลือก…" />
        : (
          <div className="space-y-2">
            {list.length === 0 && <div className="text-center text-[13px] text-slate-400 py-6">ยังไม่มีรายการ — กด “เพิ่ม” ด้านล่าง</div>}
            {list.map((r) => (
              <div key={r.id} className={`grid gap-2 items-center rounded-lg border px-2 py-2 ${r._dirty || r._new ? "border-amber-300 bg-amber-50/40" : "border-slate-200"} grid-cols-2 sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_64px_32px]`}>
                <input className={`${inp} font-mono`} value={r.code} placeholder="รหัส" onChange={(e) => patch(r.id, { code: e.target.value })} title="รหัส (ตัวอังกฤษ/ตัวเลข)" />
                <input className={inp} value={r.name} placeholder="ชื่อ" onChange={(e) => patch(r.id, { name: e.target.value })} />
                {tab === "rule" ? (
                  <input className={inp} value={String(r.config.reason ?? "")} placeholder="เหตุผลที่ทีมเห็น" onChange={(e) => patchCfg(r, { reason: e.target.value })} />
                ) : (
                  <input className={inp} value={r.name_en ?? ""} placeholder="ชื่ออังกฤษ (ใช้ใน prompt)" onChange={(e) => patch(r.id, { name_en: e.target.value })} />
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  {(tab === "hw_color" || tab === "thread_color") && (
                    <><input type="color" value={r.hex ?? "#cccccc"} onChange={(e) => patch(r.id, { hex: e.target.value })} className="h-8 w-10 rounded border border-slate-200 shrink-0" title="สี" />
                      <span className="text-[11px] text-slate-400 font-mono">{r.hex}</span></>
                  )}
                  {tab === "category" && (
                    <>
                      <select value={String(r.config.source ?? "sku_text")} onChange={(e) => patchCfg(r, { source: e.target.value })} className={inp} title="เลือกจากไหน">
                        {CATEGORY_SOURCES.map((s) => <option key={s.key} value={s.key}>เลือกจาก: {s.label}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 whitespace-nowrap" title="หมวดนี้ใช้สีอะไหล่ทั้งใบ">
                        <input type="checkbox" checked={r.config.hw === true} onChange={(e) => patchCfg(r, { hw: e.target.checked })} />สีอะไหล่
                      </label>
                    </>
                  )}
                  {tab === "rule" && (
                    <div className="grid grid-cols-2 gap-1 w-full">
                      <RuleSide value={String(r.config.a ?? "")} cats={cats} onChange={(v) => patchCfg(r, { a: v })} label="ถ้ามี" />
                      <RuleSide value={String(r.config.b ?? "")} cats={cats} onChange={(v) => patchCfg(r, { b: v })} label="คู่กับ" />
                    </div>
                  )}
                </div>
                <input type="number" className={inp} value={r.sort_order} onChange={(e) => patch(r.id, { sort_order: Number(e.target.value) || 0 })} title="ลำดับ (น้อย = ขึ้นก่อน)" />
                <button type="button" onClick={() => setDel(r)} className="h-8 w-8 rounded-md text-rose-600 hover:bg-rose-50" aria-label="ลบ" title="ลบ">✕</button>
              </div>
            ))}
            <button type="button" onClick={add} className="h-9 px-4 text-sm rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เพิ่ม{info.label}</button>
            {tab === "rule" && <p className="text-[11px] text-slate-400">ตัวอย่าง: ถ้ามี “ซิป : ZP-5G” คู่กับ “สีอะไหล่ : silver” → เตือนในหน้าสูตรและใบสรุป (รหัสต้องตรงกับรหัสของสิ่งที่เลือก)</p>}
          </div>
        )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && void remove(del)} variant="danger"
        title="ลบตัวเลือกนี้?" message={`“${del?.name || del?.code || ""}” จะไม่โผล่ให้เลือกอีก (สูตรเดิมที่ใช้อยู่ยังเห็นชื่อเดิม)`} confirmText="ลบ" />
    </ERPModal>
  );
}

/** ฝั่งหนึ่งของกฎ: หมวด (หรือสีอะไหล่) + รหัส → เก็บเป็น "หมวด:รหัส" */
function RuleSide({ value, cats, onChange, label }: { value: string; cats: Choice[]; onChange: (v: string) => void; label: string }) {
  const [cat, code] = value.includes(":") ? [value.split(":")[0], value.split(":").slice(1).join(":")] : ["", value];
  return (
    <div className="flex gap-1 min-w-0" title={label}>
      <select value={cat} onChange={(e) => onChange(`${e.target.value}:${code}`)} className="h-8 px-1 border border-slate-200 rounded-md text-[12px] min-w-0 flex-1">
        <option value="">{label}…</option>
        <option value="hw_color">สีอะไหล่</option>
        {cats.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
      </select>
      <input value={code} onChange={(e) => onChange(`${cat}:${e.target.value}`)} placeholder="รหัส" className="h-8 px-1 border border-slate-200 rounded-md text-[12px] font-mono w-20" />
    </div>
  );
}
