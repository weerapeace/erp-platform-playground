"use client";

/**
 * ค่ากลาง (erp_lookups) แบบเล็ก — ใช้/แก้ได้จากหน้างานเลย ไม่ต้องไปหน้า ตั้งค่า → ค่ากลาง (ของกลาง)
 *   useLookupNames(type)  = ชื่อค่าที่เปิดใช้ เรียงตามลำดับ (แคชร่วมทั้งหน้า · แก้ในป๊อปแล้วทุกที่อัปเดตเอง)
 *   <LookupValuesEditor lookupType open onClose title /> = ป๊อปเพิ่ม / แก้ชื่อ / เอาออก / ลากเรียง
 * ใช้กับ: ปุ่มลัด "ค่าที่ใช้บ่อย" ของเช็กลิสต์ (components/record-tasks/checklist)
 * API กลาง /api/lookups (+ /[id]) · เอาออก = ปิดใช้ (is_active=false) เรียกคืนได้ที่หน้าค่ากลาง
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { apiFetch } from "@/lib/api";

type Row = { id: string; name: string; sort_order: number };

// แคชร่วมต่อชนิด — หลายช่องในหน้าเดียวยิงครั้งเดียว · แก้แล้วแจ้งทุกช่อง
const cache = new Map<string, Row[]>();
const listeners = new Map<string, Set<() => void>>();
async function fetchRows(type: string): Promise<Row[]> {
  const j = await apiFetch(`/api/lookups?type=${encodeURIComponent(type)}&limit=200`).then((r) => r.json());
  if (j.error) throw new Error(j.error);
  return ((j.data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, sort_order: r.sort_order }));
}
export function refreshLookup(type: string) {
  fetchRows(type).then((rows) => { cache.set(type, rows); listeners.get(type)?.forEach((f) => f()); }).catch(() => {});
}

export function useLookupNames(type: string | null | undefined): string[] {
  const [, force] = useState(0);
  useEffect(() => {
    if (!type) return;
    const set = listeners.get(type) ?? new Set<() => void>();
    listeners.set(type, set);
    const f = () => force((n) => n + 1);
    set.add(f);
    if (!cache.has(type)) { cache.set(type, []); refreshLookup(type); }
    return () => { set.delete(f); };
  }, [type]);
  return type ? (cache.get(type) ?? []).map((r) => r.name) : [];
}

export function LookupValuesEditor({ lookupType, open, onClose, title = "ค่าที่ใช้บ่อย", description = "เพิ่ม · กดชื่อเพื่อแก้ · ลากเรียงลำดับ · ใช้ร่วมกันทั้งทีม" }: {
  lookupType: string; open: boolean; onClose: () => void; title?: string; description?: string;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchRows(lookupType)); } catch { toast.error("โหลดค่าที่ใช้บ่อยไม่สำเร็จ"); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setErr(null); setText(""); void load(); } }, [open, lookupType]);

  const call = async (path: string, init: RequestInit) => {
    const j = await apiFetch(path, { headers: { "Content-Type": "application/json" }, ...init }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
  };
  const dup = (name: string, exceptId?: string) => rows.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  const { rowProps, handleProps, rowCls } = useDragReorder(async (from, to) => {
    const next = moveItem(rows, from, to);
    setRows(next);
    const jobs = next.map((r, i) => ({ r, order: (i + 1) * 10 })).filter(({ r, order }) => r.sort_order !== order);
    try {
      await Promise.all(jobs.map(({ r, order }) => call(`/api/lookups/${r.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: order }) })));
      setRows(next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 })));
      refreshLookup(lookupType);
    } catch { toast.error("เรียงลำดับไม่สำเร็จ"); void load(); }
  });

  const add = async () => {
    const name = text.trim();
    if (!name) { setErr("พิมพ์ชื่อก่อน"); return; }
    if (dup(name)) { setErr("มีค่านี้แล้ว"); return; }
    try {
      await call("/api/lookups", { method: "POST", body: JSON.stringify({ lookup_type: lookupType, name, sort_order: (rows.length + 1) * 10 }) });
      setText(""); await load(); refreshLookup(lookupType);
    } catch (e) { setErr(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const rename = async () => {
    const e = editing; setEditing(null);
    if (!e) return;
    const row = rows.find((r) => r.id === e.id); const name = e.name.trim();
    if (!row || !name || name === row.name) return;
    if (dup(name, row.id)) { toast.error("มีค่านี้แล้ว"); return; }
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, name } : r)));
    try { await call(`/api/lookups/${row.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); refreshLookup(lookupType); }
    catch { toast.error("แก้ชื่อไม่สำเร็จ"); void load(); }
  };
  const remove = async (row: Row) => {
    setRows((p) => p.filter((r) => r.id !== row.id));
    try { await call(`/api/lookups/${row.id}`, { method: "DELETE" }); refreshLookup(lookupType); }
    catch { toast.error("เอาออกไม่สำเร็จ"); void load(); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="sm" title={title} description={description} storageKey="lookup-values-editor"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <a href="/admin/lookups" target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-blue-600">หน้าค่ากลางทั้งหมด ↗</a>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">เสร็จ</button>
        </div>
      }>
      <div className="space-y-2">
        {loading && rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">ยังไม่มีค่า — พิมพ์เพิ่มด้านล่าง</div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((r, i) => (
              <div key={r.id} {...rowProps(i)} className={`group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50 ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} />
                {editing?.id === r.id ? (
                  <input autoFocus value={editing.name} maxLength={100} aria-label="ชื่อค่า"
                    onChange={(e) => setEditing({ id: r.id, name: e.target.value })} onBlur={() => void rename()}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-blue-400 px-2 text-sm" />
                ) : (
                  <button type="button" onClick={() => setEditing({ id: r.id, name: r.name })} title="กดเพื่อแก้ชื่อ" className="min-w-0 flex-1 truncate text-left text-sm text-slate-700">{r.name}</button>
                )}
                <button type="button" onClick={() => void remove(r)} title="เอาออกจากปุ่มลัด (เรียกคืนได้ที่หน้าค่ากลาง)" aria-label={`เอา ${r.name} ออก`}
                  className="shrink-0 px-1 text-xs text-slate-300 opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 border-t border-slate-100 pt-2">
          <input value={text} maxLength={100} onChange={(e) => { setText(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
            placeholder="เพิ่มค่าใหม่ เช่น รอซิป" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" onClick={() => void add()} className="h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">＋ เพิ่ม</button>
        </div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
