"use client";

/**
 * 🏷 ป๊อป "ใส่ Fake Price" (ของกลาง) — เลือกสูตร → ดูตัวอย่างทุกตัว → บันทึกทีเดียว
 *   สูตรคิดที่ lib/fake-price (คูณ / บวก / โชว์ส่วนลด % + ปัดลงท้าย 90 ฯลฯ)
 *   รายการสูตรเก็บรวมที่ ui_config `fake_price_formulas` — เพิ่ม/แก้/ลบได้ในป๊อปนี้ (สิทธิ์ products.edit · audit ที่ /api/ui-config)
 *   ค่าเริ่ม: ใส่เฉพาะตัวที่ยังไม่มี Fake Price (0/ว่าง) · ติ๊กเพื่อเขียนทับ
 * ผู้เรียกเป็นคนบันทึก (onApply) — เช่น ตาราง SKU ลูก ส่งผ่าน bulk-update กลาง (สิทธิ์ + audit)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import {
  computeFakePrice, describeFormula, discountPercent, formulaProblem, parseFormulas,
  FAKE_PRICE_CONFIG_KEY, MODE_LABEL, ROUND_LABEL,
  type FakePriceFormula, type FakePriceMode, type FakePriceRound,
} from "@/lib/fake-price";

export type FakePriceRow = { id: string; code: string; sale: unknown; fake: unknown };

const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const numOf = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Draft = { id: string | null; name: string; mode: FakePriceMode; value: string; round: FakePriceRound };

export function FakePriceDialog({ rows, onApply, onClose }: {
  rows: FakePriceRow[];
  /** บันทึกค่าใหม่ (เฉพาะตัวที่เปลี่ยน) — คืน false = ไม่ปิดป๊อป */
  onApply: (edits: { id: string; fake_price: number }[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const canEditFormulas = can("products.edit");
  const [formulas, setFormulas] = useState<FakePriceFormula[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [askDel, setAskDel] = useState<FakePriceFormula | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadErr(false);
    try {
      const j = await apiFetch(`/api/ui-config?key=${FAKE_PRICE_CONFIG_KEY}`).then((r) => r.json());
      const list = parseFormulas(j?.value);
      setFormulas(list);
      setSelId((cur) => (cur && list.some((f) => f.id === cur) ? cur : list[0]?.id ?? null));
    } catch { setLoadErr(true); setFormulas([]); }
  };
  useEffect(() => { void load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const sel = formulas?.find((f) => f.id === selId) ?? null;
  const sample = useMemo(() => numOf(rows.find((r) => numOf(r.sale) > 0)?.sale) || 890, [rows]);

  // ตัวอย่างทุกแถว: ราคาใหม่ / คงเดิม / ข้าม
  const preview = useMemo(() => rows.map((r) => {
    const sale = numOf(r.sale);
    const cur = numOf(r.fake);
    const next = sel ? computeFakePrice(sale, sel) : null;
    const state: "new" | "keep" | "skip" | "same" = !sel || next == null ? "skip" : cur > 0 && !overwrite ? "keep" : next === cur ? "same" : "new";
    return { ...r, sale, cur, next, state };
  }), [rows, sel, overwrite]);
  const edits = preview.filter((p) => p.state === "new" && p.next != null).map((p) => ({ id: p.id, fake_price: p.next as number }));
  const keepCount = preview.filter((p) => p.state === "keep").length;
  const skipNoSale = preview.filter((p) => p.state === "skip" && p.sale <= 0).length;

  // ── จัดการสูตร (บันทึกรวมทั้งรายการ) ──
  const saveFormulas = async (next: FakePriceFormula[], msg: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: FAKE_PRICE_CONFIG_KEY, value: { formulas: next } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกสูตรไม่สำเร็จ");
      setFormulas(next);
      toast.success(msg);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกสูตรไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };
  const draftFormula = draft ? { name: draft.name.trim(), mode: draft.mode, value: Number(draft.value), round: draft.round } : null;
  const draftProblem = draftFormula ? formulaProblem(draftFormula) : null;
  const saveDraft = async () => {
    if (!draft || !draftFormula || !formulas) return;
    if (draftProblem) { toast.warning(draftProblem); return; }
    const f: FakePriceFormula = { id: draft.id ?? newId(), ...draftFormula };
    const next = draft.id ? formulas.map((x) => (x.id === draft.id ? f : x)) : [...formulas, f];
    if (await saveFormulas(next, draft.id ? `แก้สูตร "${f.name}" แล้ว` : `เพิ่มสูตร "${f.name}" แล้ว — ใช้ได้ทุกสินค้า`)) { setSelId(f.id); setDraft(null); }
  };
  const removeFormula = async () => {
    const f = askDel; if (!f || !formulas) return;
    if (await saveFormulas(formulas.filter((x) => x.id !== f.id), `ลบสูตร "${f.name}" แล้ว`)) { setAskDel(null); if (selId === f.id) setSelId(formulas.find((x) => x.id !== f.id)?.id ?? null); }
  };
  const moveFormula = (i: number, dir: -1 | 1) => {
    if (!formulas) return;
    const j = i + dir; if (j < 0 || j >= formulas.length) return;
    const next = [...formulas]; [next[i], next[j]] = [next[j], next[i]];
    void saveFormulas(next, "จัดลำดับสูตรแล้ว");
  };

  const apply = async () => {
    if (!edits.length) { toast.warning("ไม่มีตัวที่ต้องเปลี่ยน"); return; }
    setSaving(true);
    try { if (await onApply(edits)) onClose(); }
    finally { setSaving(false); }
  };

  const input = "h-8 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400";
  return (
    <>
      <ERPModal open onClose={() => { if (!saving) onClose(); }} size="md" defaultExpanded={false} hasUnsavedChanges={!!draft}
        title="🏷 ใส่ Fake Price (ราคาเต็มขีดฆ่า)"
        description="เลือกสูตร → ดูตัวอย่างราคาใหม่ทุกตัว → บันทึกทีเดียว"
        footer={
          <div className="flex w-full items-center gap-2">
            <span className="flex-1 text-[11.5px] text-slate-500">
              {sel ? <>จะเปลี่ยน <b className="text-slate-800">{edits.length}</b> ตัว{keepCount ? ` · คงเดิม ${keepCount} (มีอยู่แล้ว)` : ""}{skipNoSale ? ` · ข้าม ${skipNoSale} (ไม่มีราคาขาย)` : ""}</> : "เลือกสูตรก่อน"}
            </span>
            <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void apply()} disabled={saving || !edits.length || !!draft} data-fake-apply
              className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : `บันทึก Fake Price ${edits.length} ตัว`}
            </button>
          </div>
        }>
        <div className="space-y-3 text-sm">
          {/* ── สูตร ── */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">เลือกสูตร</p>
            {formulas === null ? (
              <div className="space-y-1.5" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />)}</div>
            ) : loadErr ? (
              <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                <span>⚠ โหลดสูตรไม่สำเร็จ</span>
                <button type="button" onClick={() => void load()} className="h-7 rounded border border-red-200 bg-white px-2">ลองใหม่</button>
              </div>
            ) : (
              <div className="space-y-1.5" data-fake-formulas>
                {formulas.length === 0 && <p className="text-xs text-slate-400">ยังไม่มีสูตร — กด &quot;＋ เพิ่มสูตร&quot;</p>}
                {formulas.map((f, i) => {
                  const on = f.id === selId;
                  const ex = computeFakePrice(sample, f);
                  return (
                    <div key={f.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300" : "border-slate-200 hover:border-slate-300"}`}>
                      <button type="button" onClick={() => setSelId(f.id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2 text-left" data-fake-formula={f.id}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-orange-500" : "border-slate-300"}`}>{on && <span className="h-2 w-2 rounded-full bg-orange-500" />}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800">{f.name}</span>
                          <span className="block truncate text-[11px] text-slate-500">{describeFormula(f)} · เช่น {fmt(sample)} → {ex != null ? `${fmt(ex)} (ลด ${discountPercent(sample, ex)}%)` : "ไม่สูงกว่าราคาขาย"}</span>
                        </span>
                      </button>
                      {canEditFormulas && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px]">
                          <button type="button" disabled={busy || i === 0} onClick={() => moveFormula(i, -1)} title="เลื่อนขึ้น" className="h-6 w-6 rounded text-slate-400 hover:bg-white disabled:opacity-30">↑</button>
                          <button type="button" disabled={busy || i === formulas.length - 1} onClick={() => moveFormula(i, 1)} title="เลื่อนลง" className="h-6 w-6 rounded text-slate-400 hover:bg-white disabled:opacity-30">↓</button>
                          <button type="button" disabled={busy} onClick={() => setDraft({ id: f.id, name: f.name, mode: f.mode, value: String(f.value), round: f.round })} title="แก้สูตร" className="h-6 w-6 rounded hover:bg-white">✏️</button>
                          <button type="button" disabled={busy} onClick={() => setAskDel(f)} title="ลบสูตร" className="h-6 w-6 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600">🗑</button>
                        </span>
                      )}
                    </div>
                  );
                })}
                {canEditFormulas && !draft && (
                  <button type="button" onClick={() => setDraft({ id: null, name: "", mode: "multiply", value: "2", round: "end90" })} className="text-[12px] text-orange-600 hover:underline" data-fake-add>＋ เพิ่มสูตร</button>
                )}
              </div>
            )}
          </div>

          {/* ── ตัวแก้สูตร ── */}
          {draft && (
            <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-2.5" data-fake-editor>
              <p className="text-xs font-medium text-slate-700">{draft.id ? "แก้สูตร" : "สูตรใหม่"} <span className="font-normal text-slate-400">— ใช้ได้ทุกสินค้า</span></p>
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-600">
                <select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as FakePriceMode })} className={`${input} bg-white`} aria-label="วิธีคิด">
                  {(Object.keys(MODE_LABEL) as FakePriceMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                </select>
                <span>{draft.mode === "multiply" ? "×" : draft.mode === "add" ? "+" : "ลด"}</span>
                <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) })} inputMode="decimal" aria-label="ตัวเลข" className={`${input} w-20 bg-white text-right tabular-nums`} />
                {draft.mode === "discount" && <span>%</span>}
                <span>แล้ว</span>
                <select value={draft.round} onChange={(e) => setDraft({ ...draft, round: e.target.value as FakePriceRound })} className={`${input} bg-white`} aria-label="การปัด">
                  {(Object.keys(ROUND_LABEL) as FakePriceRound[]).map((r) => <option key={r} value={r}>{ROUND_LABEL[r]}</option>)}
                </select>
              </div>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 60) })} placeholder="ชื่อสูตร เช่น ×2 ลงท้าย 90" aria-label="ชื่อสูตร" className={`${input} w-full bg-white`} />
              <p className={`text-[11.5px] ${draftProblem ? "text-amber-700" : "text-slate-500"}`}>
                {draftProblem ?? (() => { const ex = computeFakePrice(sample, { mode: draft.mode, value: Number(draft.value), round: draft.round }); return `${describeFormula({ mode: draft.mode, value: Number(draft.value), round: draft.round })} · เช่น ${fmt(sample)} → ${ex != null ? `${fmt(ex)} (ลด ${discountPercent(sample, ex)}%)` : "ไม่สูงกว่าราคาขาย"}`; })()}
              </p>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setDraft(null)} disabled={busy} className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600">ยกเลิก</button>
                <button type="button" onClick={() => void saveDraft()} disabled={busy || !!draftProblem} data-fake-save-formula className="h-8 rounded-md bg-slate-800 px-3 text-xs font-medium text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึกสูตร"}</button>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="h-4 w-4 accent-orange-500" data-fake-overwrite />
            เขียนทับตัวที่มี Fake Price อยู่แล้ว <span className="text-slate-400">(ไม่ติ๊ก = ใส่เฉพาะตัวที่ยังเป็น 0 / ว่าง)</span>
          </label>

          {/* ── ตัวอย่างทุกแถว ── */}
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200" data-fake-preview>
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-500">
                <tr><th className="px-2 py-1.5 text-left font-medium">Code</th><th className="px-2 py-1.5 text-right font-medium">ราคาขาย</th><th className="px-2 py-1.5 text-right font-medium">Fake เดิม</th><th className="px-2 py-1.5 text-right font-medium">Fake ใหม่</th></tr>
              </thead>
              <tbody>
                {preview.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-400">ไม่มีรายการ</td></tr>}
                {preview.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono text-[11.5px] text-slate-700">{p.code}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-700">{p.sale > 0 ? fmt(p.sale) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-400">{p.cur > 0 ? fmt(p.cur) : "0"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {p.state === "new" && p.next != null ? <span className="font-medium text-orange-700">{fmt(p.next)} <span className="text-[10.5px] font-normal text-slate-400">ลด {discountPercent(p.sale, p.next)}%</span></span>
                        : p.state === "keep" ? <span className="text-[11px] text-slate-400">คงเดิม</span>
                        : p.state === "same" ? <span className="text-[11px] text-slate-400">เท่าเดิม</span>
                        : <span className="text-[11px] text-slate-400">{p.sale <= 0 ? "ข้าม (ไม่มีราคาขาย)" : "—"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ERPModal>
      <ConfirmDialog open={!!askDel} onClose={() => { if (!busy) setAskDel(null); }} onConfirm={() => void removeFormula()} loading={busy} variant="danger"
        title={`ลบสูตร "${askDel?.name ?? ""}"?`} message="สูตรจะหายจากรายการ (ทุกสินค้า) — Fake Price ที่ใส่ไปแล้วไม่เปลี่ยน" confirmText="ลบสูตร" cancelText="ไม่ลบ" />
    </>
  );
}
