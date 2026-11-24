"use client";
/**
 * 🧱 บล็อกพิมพ์ — ชิ้นส่วนหน้าจอของคลังสัญลักษณ์ (ใช้ร่วม: หน้าตั้งขนาด · หน้าจัดวางในบล็อก · หน้าคลัง)
 *   SymbolThumb = รูปตัวอย่างวาดจากเส้น · useSymbols = โหลดรายการ · SymbolPickerModal = เลือกจากคลัง (หลายตัว)
 *   SaveSymbolsModal = บันทึกชิ้นเข้าคลัง (ชื่อ + หมวด) · ป๊อปทั้งหมดใช้ ERPModal กลาง
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { opsToSvgPath, toUnit, type BlockUnit } from "@/lib/block-print";
import type { BlockSymbol, SymbolInput } from "@/lib/block-print-symbols";
import { api } from "./shared";

export const SYMBOLS_API = "/api/block-print/symbols";
export const SYMBOLS_HREF = "/master/block-print/symbols";

export function SymbolThumb({ s, size = 44 }: { s: Pick<SymbolInput, "parts" | "ow" | "oh">; size?: number }) {
  const m = Math.max(s.ow, s.oh), pad = m * 0.08;
  return (
    <svg width={size} height={size} viewBox={`${(s.ow - m) / 2 - pad} ${(s.oh - m) / 2 - pad} ${m + 2 * pad} ${m + 2 * pad}`} className="shrink-0">
      {s.parts.map((p, i) => <path key={i} d={opsToSvgPath(p.d)} fill="#111" fillRule={p.fill} />)}
    </svg>
  );
}

/** โหลดสัญลักษณ์ (trash = ในถังขยะ) */
export function useSymbols(trash = false, enabled = true) {
  const [rows, setRows] = useState<BlockSymbol[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api<BlockSymbol[]>(`${SYMBOLS_API}${trash ? "?trash=1" : ""}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดคลังไม่สำเร็จ"); }
  }, [trash]);
  useEffect(() => { if (enabled) void load(); }, [load, enabled]);
  return { rows, setRows, err, load };
}

export const categoriesOf = (rows: Pick<BlockSymbol, "category">[]) =>
  [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "th"));

/** ค้นหา + กรองหมวด (ใช้ร่วมหน้าคลัง/ป๊อปเลือก) */
export function filterSymbols(rows: BlockSymbol[], q: string, cat: string | null): BlockSymbol[] {
  const s = q.trim().toLowerCase();
  return rows.filter((r) => (!cat || r.category === cat) && (!s || r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s) || (r.category ?? "").toLowerCase().includes(s)));
}

export function SymbolFilters({ q, setQ, cat, setCat, cats }: { q: string; setQ: (v: string) => void; cat: string | null; setCat: (v: string | null) => void; cats: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / หมวด" aria-label="ค้นหาสัญลักษณ์"
        className="h-8 min-w-[160px] flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
      {[null, ...cats].map((c) => (
        <button key={c ?? "_all"} type="button" onClick={() => setCat(c)}
          className={`h-8 rounded-lg border px-2.5 text-xs ${cat === c ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{c ?? "ทั้งหมด"}</button>
      ))}
    </div>
  );
}

export function SymbolCard({ s, selected, onClick, unit }: { s: BlockSymbol; selected: boolean; onClick: () => void; unit: BlockUnit }) {
  return (
    <button type="button" onClick={onClick} title={`${s.code} ${s.name}`}
      className={`flex flex-col items-center gap-1 rounded-xl border bg-white p-2 text-center ${selected ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"}`}>
      <SymbolThumb s={s} size={52} />
      <span className="line-clamp-1 w-full text-xs font-medium text-slate-800">{s.name}</span>
      <span className="w-full truncate text-[11px] text-slate-400">{s.category ?? "ไม่มีหมวด"} · {toUnit(Number(s.w), unit)}×{toUnit(Number(s.h), unit)}</span>
    </button>
  );
}

/** ป๊อปเลือกจากคลัง (เลือกได้หลายตัว) */
export function SymbolPickerModal({ open, onClose, onPick, unit, title = "เลือกจากคลังสัญลักษณ์" }: {
  open: boolean; onClose: () => void; onPick: (s: BlockSymbol[]) => void; unit: BlockUnit; title?: string;
}) {
  const { rows, err, load } = useSymbols(false, open);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (open) setSel([]); }, [open]);
  const list = useMemo(() => filterSymbols(rows ?? [], q, cat), [rows, q, cat]);
  const picked = (rows ?? []).filter((r) => sel.includes(r.id));
  return (
    <ERPModal open={open} onClose={onClose} title={title} size="lg"
      footer={
        <div className="flex w-full items-center gap-2">
          <a href={SYMBOLS_HREF} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">เปิดหน้าคลัง</a>
          <span className="ml-auto text-xs text-slate-500">เลือก {picked.length} ตัว</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">ยกเลิก</button>
          <button type="button" disabled={!picked.length} onClick={() => { onPick(picked); onClose(); }}
            className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-50">ใช้ ({picked.length})</button>
        </div>
      }>
      <div className="space-y-3">
        <SymbolFilters q={q} setQ={setQ} cat={cat} setCat={setCat} cats={categoriesOf(rows ?? [])} />
        {err ? <div className="text-sm text-red-600">{err} <button type="button" onClick={() => void load()} className="underline">ลองใหม่</button></div>
          : !rows ? <div className="py-8 text-center text-sm text-slate-500">กำลังโหลดคลัง…</div>
          : !rows.length ? <div className="py-8 text-center text-sm text-slate-500">คลังยังว่าง — กด &quot;บันทึกเข้าคลัง&quot; ที่ชิ้น หรือเพิ่มไฟล์ที่หน้าคลัง</div>
          : !list.length ? <div className="py-8 text-center text-sm text-slate-500">ไม่พบ ลองเปลี่ยนคำค้นหา</div>
          : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {list.map((s) => <SymbolCard key={s.id} s={s} unit={unit} selected={sel.includes(s.id)} onClick={() => setSel((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} />)}
            </div>}
      </div>
    </ERPModal>
  );
}

/** ป๊อปบันทึกเข้าคลัง: ชื่อทีละตัว + หมวดเดียวกันทั้งชุด */
export function SaveSymbolsModal({ open, onClose, items, onSaved }: {
  open: boolean; onClose: () => void; items: SymbolInput[]; onSaved?: (rows: BlockSymbol[]) => void;
}) {
  const toast = useToast();
  const { rows } = useSymbols(false, open);
  const [names, setNames] = useState<string[]>([]);
  const [cat, setCat] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setNames(items.map((i) => i.name)); setCat(""); } }, [open, items]);
  const cats = categoriesOf(rows ?? []);
  const dirty = names.some((n, i) => n !== items[i]?.name) || !!cat;
  const save = async () => {
    if (saving) return;
    if (names.some((n) => !n.trim())) { toast.error("ใส่ชื่อให้ครบทุกตัว"); return; }
    setSaving(true);
    try {
      const out = await api<BlockSymbol[]>(SYMBOLS_API, { json: { symbols: items.map((it, i) => ({ ...it, name: names[i].trim(), category: cat.trim() || null })) } });
      toast.success(`บันทึกเข้าคลังแล้ว ${out.length} ตัว`);
      onSaved?.(out);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    setSaving(false);
  };
  return (
    <ERPModal open={open} onClose={onClose} title={`บันทึกเข้าคลังสัญลักษณ์ (${items.length} ตัว)`} size="md" hasUnsavedChanges={dirty}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">ยกเลิก</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60">{saving ? "กำลังบันทึก…" : "บันทึกเข้าคลัง"}</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-xs text-slate-500">หมวด (พิมพ์ใหม่หรือเลือกที่มี · ไม่ใส่ได้)</span>
          <input list="block-symbol-cats" value={cat} onChange={(e) => setCat(e.target.value.slice(0, 40))} placeholder="เช่น ไพ่ · โลโก้ · ลายเข็มขัด"
            className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2" />
          <datalist id="block-symbol-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <SymbolThumb s={it} size={32} />
              <input value={names[i] ?? ""} aria-label={`ชื่อสัญลักษณ์ ${i + 1}`} onChange={(e) => setNames((cur) => cur.map((n, k) => (k === i ? e.target.value.slice(0, 80) : n)))}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
              <span className="whitespace-nowrap text-xs text-slate-400">{+it.w.toFixed(2)}×{+it.h.toFixed(2)} มม.</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">เก็บเป็นเส้นในระบบ ใช้ซ้ำได้ทุกงาน · ขนาดที่ใช้บ่อย = ขนาดที่ตั้งไว้ตอนนี้ (แก้ได้ที่หน้าคลัง)</p>
      </div>
    </ERPModal>
  );
}
