"use client";
/**
 * รอบเสนอราคา แบบ "1 ครั้ง = 1 การ์ด" (เจ้าของขอ 2026-10-14: แถวซ้ำ 8 แถวจริง ๆ คือครั้งเดียว 2 ไซส์ × 4 ขั้นจำนวน)
 *
 * การ์ด = ครั้งที่ (batch) · วันที่ · สถานะรวม · หมายเหตุ · "ที่เปลี่ยนจากครั้งก่อน" (ต่อไซส์)
 * ข้างใน = ตารางไขว้: แถว = ไซส์ · คอลัมน์ = ขั้นจำนวน · ช่อง = ราคาที่เสนอ + กำไร/ชิ้น (+%) + สถานะช่อง + เทียบครั้งก่อน
 * เพิ่มครั้งใหม่ = ฟอร์มตารางไขว้กรอกทีเดียว (เตรียมไซส์/ขั้นจำนวนจากครั้งล่าสุดให้)
 *
 * ข้อมูล: design_sheet_quotes (1 แถว = 1 ช่อง; batch = ครั้งที่) · API /quotes (ช่อง) + /quotes/batch (ทั้งครั้ง)
 * ของกลาง: ConfirmDialog · useToast · apiFetch
 */
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { QUOTE_STATUS, QUOTE_STATUS_OPTS } from "@/lib/design-sheets-meta";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";

const fmtBaht = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("th-TH"));
const sgn = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtBaht(Math.abs(n))}`;
const upDown = (n: number) => (n > 0.004 ? "text-emerald-700" : n < -0.004 ? "text-rose-600" : "text-slate-400");
const costCls = (n: number) => (n > 0.004 ? "text-rose-600" : n < -0.004 ? "text-emerald-700" : "text-slate-400");
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d: string | null) => { if (!d) return "—"; const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const qtyKey = (q: number | null | undefined) => (q == null ? "" : String(q));

type Size = { key: string; label: string };
type Batch = { batch: number; part: number; quotes: DesignSheetQuote[]; date: string | null; note: string | null; sizes: string[]; qtys: (number | null)[]; status: string | "mixed" };

export function QuoteRounds({ sheetId, quotes, sizes, sizeLabel, currentCost, canEdit, costDirty, saveCost, onReload, onOpenVersions, onSendToQuotation, compact = false }: {
  sheetId: string;
  quotes: DesignSheetQuote[];
  sizes: Size[];                                  // ไซส์/แท็บทั้งหมดของใบ (เรียงตามแท็บตีราคา)
  sizeLabel: (code: string | null) => string;
  currentCost: (key: string) => number;           // ตีราคาปัจจุบันของไซส์ (รวมที่ยังไม่บันทึก)
  canEdit: boolean;
  costDirty: boolean; saveCost: () => Promise<boolean>;   // เพิ่มครั้งใหม่ → บันทึกตีราคาที่ค้างก่อน
  onReload: () => Promise<void>;
  onOpenVersions?: (a: string | null, b: string, parent: string) => void;   // ไม่ส่ง (มือถือ) = บอกให้ไปดูในหน้าเต็ม
  onSendToQuotation?: () => void;
  compact?: boolean;                              // มือถือ: ซ่อนคำอธิบายยาว ๆ
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [delBatch, setDelBatch] = useState<Batch | null>(null);
  const [delCell, setDelCell] = useState<DesignSheetQuote | null>(null);
  const [editCell, setEditCell] = useState<{ id: string; val: string } | null>(null);
  const [editNote, setEditNote] = useState<{ batch: number; val: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addFrom, setAddFrom] = useState<Batch | null>(null);   // 📋 คัดลอกครั้งไหนมาเป็นครั้งใหม่ (null = ครั้งล่าสุด)
  const openV = onOpenVersions ?? (() => toast.warning("ดูรายละเอียดเทียบเวอร์ชันตีราคาได้ในหน้าเต็ม (คอมพิวเตอร์)"));

  // จัดกลุ่มเป็น "ครั้ง" (batch) — แถวเก่าที่ยังไม่มี batch ใช้วันที่แทน
  const batches = useMemo<Batch[]>(() => {
    const m = new Map<number, DesignSheetQuote[]>();
    const dateKeys = new Map<string, number>();
    for (const q of quotes) {
      let b = q.batch ?? null;
      if (b == null) { const dk = q.quote_date ?? "?"; if (!dateKeys.has(dk)) dateKeys.set(dk, -(dateKeys.size + 1)); b = dateKeys.get(dk)!; }
      (m.get(b) ?? m.set(b, []).get(b)!).push(q);
    }
    const order = new Map(sizes.map((s, i) => [s.key, i]));
    const out: Batch[] = [];
    [...m.entries()].sort((a, b) => a[0] - b[0]).forEach(([batch, all], i) => {
      // ข้อมูลเก่าอาจมีหลายแถวที่ไซส์+จำนวนซ้ำกันในวันเดียว (เช่น เสนอใหม่ไม่ระบุจำนวน) → แยกเป็น "รายการที่ 2, 3…" ไม่ให้แถวหาย
      const parts: DesignSheetQuote[][] = [];
      for (const q of [...all].sort((a, b) => a.round - b.round)) {
        const k = `${q.parent_code ?? ""}|${qtyKey(q.qty)}`;
        let part = parts.find((p) => !p.some((x) => `${x.parent_code ?? ""}|${qtyKey(x.qty)}` === k));
        if (!part) { part = []; parts.push(part); }
        part.push(q);
      }
      parts.forEach((qs, pi) => {
        const sz = [...new Set(qs.map((q) => q.parent_code ?? ""))].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
        const qtys = [...new Set(qs.map((q) => q.qty ?? null))].sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b));
        const sts = new Set(qs.map((q) => q.status));
        out.push({ batch: batch > 0 ? batch : i + 1, part: pi, quotes: qs, date: qs[0]?.quote_date ?? null, note: qs.find((q) => q.note)?.note ?? null, sizes: sz, qtys, status: sts.size === 1 ? qs[0].status : "mixed" });
      });
    });
    return out;
  }, [quotes, sizes]);
  const cellOf = (b: Batch, size: string, qty: number | null) => b.quotes.find((q) => (q.parent_code ?? "") === size && qtyKey(q.qty) === qtyKey(qty)) ?? null;

  const call = async (fn: () => Promise<void>, ok?: string) => {
    if (busy) return; setBusy(true);
    try { await fn(); await onReload(); if (ok) toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const api = async (path: string, init?: RequestInit) => { const r = await apiFetch(path, init); const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
  const json = (body: unknown, method = "PATCH"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const patchCell = (q: DesignSheetQuote, patch: Record<string, unknown>) => call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/${q.id}`, json(patch)); });
  const patchBatch = (b: Batch, patch: Record<string, unknown>, ok?: string) => call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/batch`, json({ batch: b.batch, ...patch })); }, ok);
  const commitCell = (q: DesignSheetQuote) => {
    if (!editCell || editCell.id !== q.id) return;
    const v = editCell.val.trim(); setEditCell(null);
    const n = v === "" ? null : Number(v);
    if (v !== "" && (!Number.isFinite(n) || (n as number) < 0)) { toast.error("ราคาต้องเป็นตัวเลขไม่ติดลบ"); return; }
    if ((n ?? null) === (q.offered_price ?? null)) return;
    void patchCell(q, { offered_price: n });
  };
  const addCell = (b: Batch, size: string, qty: number | null) => call(async () => {
    const cost = currentCost(size);
    await api(`/api/design-sheets/${sheetId}/quotes`, json({ quote_date: b.date ?? todayStr(), price: cost > 0 ? cost : null, offered_price: cost > 0 ? cost : null, qty, status: b.status === "mixed" ? "pending" : b.status, note: null, parent_code: size, batch: b.batch }, "POST"));
  }, "เพิ่มช่องแล้ว — กดตัวเลขเพื่อแก้ราคาที่เสนอ");

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">{compact ? "" : "1 ครั้ง = 1 การ์ด (หลายไซส์ × หลายขั้นจำนวน) · กดตัวเลขราคาเพื่อแก้ · สถานะตั้งได้ทั้งครั้งหรือรายช่อง"}</div>
          <div className="flex gap-1.5">
            {onSendToQuotation && <button type="button" onClick={onSendToQuotation} className="h-8 px-3 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap">🧾 ส่งไปใบเสนอราคา</button>}
            <button type="button" onClick={() => { setAddFrom(null); setAddOpen(true); }} disabled={addOpen} className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">＋ เสนอราคาครั้งที่ {Math.max(0, ...batches.map((x) => x.batch)) + 1}</button>
          </div>
        </div>
      )}

      {addOpen && (
        <NewRoundEditor sheetId={sheetId} nextBatch={Math.max(0, ...batches.map((x) => x.batch)) + 1} sizes={sizes} sizeLabel={sizeLabel} currentCost={currentCost} last={addFrom ?? batches.at(-1) ?? null} copiedFrom={addFrom?.batch ?? null}
          costDirty={costDirty} saveCost={saveCost} onClose={() => { setAddOpen(false); setAddFrom(null); }}
          onSaved={async (n) => { setAddOpen(false); setAddFrom(null); await onReload(); toast.success(`เสนอราคาครั้งที่ ${n} แล้ว`); }} />
      )}

      {batches.length === 0 && !addOpen && <div className="py-8 text-center text-sm text-slate-300">— ยังไม่เคยเสนอราคา —</div>}

      {[...batches].reverse().map((b, bi) => {
        void bi;
        const prev = [...batches].reverse().find((x) => x.batch < b.batch) ?? null;   // ครั้งก่อนหน้า (ไว้เทียบราคาที่เสนอช่องต่อช่อง)
        const st = b.status === "mixed" ? null : (QUOTE_STATUS[b.status] ?? QUOTE_STATUS.pending);
        // "ที่เปลี่ยนจากครั้งก่อน" ต่อไซส์ (API คำนวณจากเวอร์ชันตีราคา) — เอาช่องแรกของแต่ละไซส์
        const changes = b.sizes.map((s) => ({ size: s, q: b.quotes.find((q) => (q.parent_code ?? "") === s) })).filter((x) => x.q?.changes || x.q?.cost_snapshot_id);
        return (
          <div key={`${b.batch}-${b.part}`} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* หัวการ์ด: ครั้งที่ · วันที่ · สถานะรวม · หมายเหตุ · ลบ */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="h-7 min-w-[2.5rem] px-2 rounded-lg bg-slate-800 text-white text-xs font-semibold flex items-center justify-center" title={b.part > 0 ? "วันเดียวกันมีหลายรายการที่ไซส์/จำนวนซ้ำกัน (ข้อมูลเก่า) — แยกให้เห็นครบ" : undefined}>ครั้งที่ {b.batch}{b.part > 0 ? ` · รายการที่ ${b.part + 1}` : ""}</span>
              {canEdit
                ? <input type="date" value={b.date ?? ""} onChange={(e) => void patchBatch(b, { quote_date: e.target.value || null })} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white" />
                : <span className="text-xs text-slate-600">{fmtDate(b.date)}</span>}
              {canEdit ? (
                <select value={b.status} onChange={(e) => { if (e.target.value !== "mixed") void patchBatch(b, { status: e.target.value }, "ตั้งสถานะทั้งครั้งแล้ว"); }} title="สถานะทั้งครั้ง (ทุกช่อง) — ตั้งรายช่องได้ในตาราง"
                  className={`h-7 px-1.5 text-xs rounded-md cursor-pointer ${st ? st.cls : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                  {b.status === "mixed" && <option value="mixed">◐ ผสม (ตั้งรายช่อง)</option>}
                  {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : <span className={`text-xs px-2 py-0.5 rounded ${st ? st.cls : "bg-amber-50 text-amber-700"}`}>{st ? st.label : "◐ ผสม"}</span>}
              {/* หมายเหตุ — กดเพื่อแก้ (บันทึกทุกช่องของครั้งนี้) */}
              {editNote?.batch === b.batch ? (
                <input autoFocus value={editNote.val} onChange={(e) => setEditNote({ batch: b.batch, val: e.target.value })}
                  onBlur={() => { const v = editNote.val; setEditNote(null); if (v.trim() !== (b.note ?? "")) void patchBatch(b, { note: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditNote(null); }}
                  className="h-7 flex-1 min-w-[10rem] px-2 text-xs border border-blue-300 rounded-md" placeholder="หมายเหตุ" />
              ) : (
                <button type="button" disabled={!canEdit} onClick={() => setEditNote({ batch: b.batch, val: b.note ?? "" })} className="flex-1 min-w-[8rem] text-left text-xs text-slate-500 truncate hover:text-slate-800 disabled:cursor-default" title={canEdit ? "กดเพื่อแก้หมายเหตุ" : undefined}>
                  {b.note ? `📝 ${b.note}` : (canEdit ? <span className="text-slate-300">＋ หมายเหตุ</span> : null)}
                </button>
              )}
              {canEdit && <button type="button" onClick={() => { setAddFrom(b); setAddOpen(true); }} title="เปิดฟอร์มครั้งใหม่ โดยใส่ไซส์/ขั้นจำนวน/ราคาของครั้งนี้มาให้แก้ต่อ (ต่อรองรอบถัดไป)" className="h-7 px-2 text-xs border border-blue-200 rounded-md text-blue-700 bg-white hover:bg-blue-50">📋 คัดลอกเป็นครั้งใหม่</button>}
              {canEdit && <button type="button" onClick={() => setDelBatch(b)} title="ลบทั้งครั้ง" className="h-7 px-2 text-xs border border-rose-200 rounded-md text-rose-500 hover:bg-rose-50">🗑 ลบครั้งนี้</button>}
            </div>

            {/* ที่เปลี่ยนจากครั้งก่อน (ต่อไซส์) */}
            {changes.length > 0 && (
              <div className="px-3 py-1.5 border-b border-slate-100 bg-amber-50/40 text-[11px] space-y-0.5">
                {changes.map(({ size, q }) => q!.changes ? (
                  q!.changes.text
                    ? <div key={size}><span className="text-slate-500">{sizeLabel(size)}:</span>{" "}
                        <button type="button" onClick={() => openV(q!.changes!.prev_snapshot_id, q!.changes!.snapshot_id, size)} className={`text-left hover:underline ${q!.changes.total_diff > 0 ? "text-rose-700" : q!.changes.total_diff < 0 ? "text-emerald-700" : "text-slate-600"}`} title="กดดูรายละเอียดเทียบเวอร์ชันตีราคา">🔁 {q!.changes.text}</button></div>
                    : <div key={size} className="text-slate-400">{sizeLabel(size)}: ต้นทุนเหมือนครั้งที่ {q!.changes.prev_round}</div>
                ) : (
                  <div key={size} className="text-slate-400">{sizeLabel(size)}: <button type="button" onClick={() => openV(q!.cost_snapshot_id ?? null, "current", size)} className="hover:underline">ครั้งแรกของไซส์นี้ · ดูต้นทุนที่ใช้</button></div>
                ))}
              </div>
            )}

            {/* ตารางไขว้: ไซส์ × ขั้นจำนวน */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] text-slate-500">
                    <th className="px-3 py-1.5 text-left font-medium w-28">ไซส์</th>
                    <th className="px-2 py-1.5 text-right font-medium w-44" title="ราคาจากตีราคาตอนเสนอ → ตีราคาปัจจุบันของไซส์นี้ (ต้นทุนขึ้น=แดง ลง=เขียว)">ตีราคา → ปัจจุบัน</th>
                    {b.qtys.map((qty) => <th key={qtyKey(qty)} className="px-2 py-1.5 text-right font-medium min-w-[7rem] bg-blue-50/60 text-blue-700">{qty == null ? "ไม่ระบุจำนวน" : `${fmtInt(qty)} ชิ้น`}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {b.sizes.map((size) => {
                    const first = b.quotes.find((q) => (q.parent_code ?? "") === size);
                    const costAt = first?.price ?? null; const cur = currentCost(size); const dCost = costAt != null && cur > 0 ? cur - costAt : null;
                    return (
                      <tr key={size} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-xs font-medium text-slate-700">{sizeLabel(size)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums leading-tight">
                          <div className="text-slate-500 text-xs">{fmtBaht(costAt)}</div>
                          {dCost != null && (first?.cost_snapshot_id
                            ? <button type="button" onClick={() => openV(first.cost_snapshot_id ?? null, "current", size)} className={`text-[10px] hover:underline ${Math.abs(dCost) < 0.005 ? "text-slate-400" : costCls(dCost)}`} title="กดดูว่าวัสดุอะไรเปลี่ยน">{Math.abs(dCost) < 0.005 ? "= ปัจจุบัน" : `→ ${fmtBaht(cur)} (${sgn(dCost)})`}</button>
                            : <div className={`text-[10px] ${Math.abs(dCost) < 0.005 ? "text-slate-400" : costCls(dCost)}`} title={`ตีราคาปัจจุบัน ${fmtBaht(cur)} − ตอนเสนอ ${fmtBaht(costAt)}`}>{Math.abs(dCost) < 0.005 ? "= ปัจจุบัน" : `→ ${fmtBaht(cur)} (${sgn(dCost)})`}</div>)}
                        </td>
                        {b.qtys.map((qty) => {
                          const q = cellOf(b, size, qty);
                          if (!q) return (
                            <td key={qtyKey(qty)} className="px-2 py-1.5 text-right text-slate-300 bg-blue-50/20">
                              {canEdit ? <button type="button" onClick={() => void addCell(b, size, qty)} className="text-xs hover:text-blue-600" title="เพิ่มช่องนี้ (ราคาเริ่มต้น = ตีราคาปัจจุบัน)">＋</button> : "—"}
                            </td>
                          );
                          const offered = q.offered_price ?? q.price;
                          const margin = offered != null && q.price != null ? offered - q.price : null;
                          const pct = margin != null && offered ? (margin / offered) * 100 : null;
                          const pq = prev ? cellOf(prev, size, qty) : null; const pOff = pq ? (pq.offered_price ?? pq.price) : null;
                          const vs = pOff != null && offered != null ? offered - pOff : null;
                          const cst = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.pending;
                          const isEd = editCell?.id === q.id;
                          return (
                            <td key={q.id} className="px-2 py-1.5 text-right tabular-nums bg-blue-50/20 leading-tight align-top group">
                              {isEd ? (
                                <input autoFocus type="number" min={0} step="any" value={editCell!.val} onChange={(e) => setEditCell({ id: q.id, val: e.target.value })}
                                  onBlur={() => commitCell(q)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }}
                                  className="h-7 w-24 px-1 text-sm text-right border border-blue-400 rounded-md" />
                              ) : (
                                <button type="button" disabled={!canEdit} onClick={() => setEditCell({ id: q.id, val: offered != null ? String(offered) : "" })} className="font-semibold text-blue-700 hover:underline disabled:no-underline disabled:cursor-default" title={canEdit ? "กดเพื่อแก้ราคาที่เสนอ" : undefined}>{fmtBaht(offered)}</button>
                              )}
                              {margin != null && (
                                <div className={`text-[10px] ${upDown(margin)}`} title={`กำไร ${sgn(margin)}/ชิ้น${pct != null ? ` (${pct.toFixed(1)}% ของราคาที่เสนอ)` : ""}${q.qty != null ? ` · รวม ${sgn(margin * q.qty)} (${fmtInt(q.qty)} ชิ้น)` : ""}`}>
                                  {sgn(margin)}{pct != null ? ` (${pct.toFixed(0)}%)` : ""}
                                </div>
                              )}
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                {vs != null && <span className={`text-[10px] ${vs === 0 ? "text-slate-300" : "text-slate-500"}`} title={`ครั้งที่ ${prev?.batch} เสนอ ${fmtBaht(pOff)}`}>{vs === 0 ? "=" : sgn(vs)}</span>}
                                {canEdit
                                  ? <select value={q.status} onChange={(e) => void patchCell(q, { status: e.target.value })} title="สถานะช่องนี้" className={`h-5 px-1 text-[10px] rounded cursor-pointer ${cst.cls}`}>{QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                                  : <span className={`text-[10px] px-1 rounded ${cst.cls}`}>{cst.label}</span>}
                                {canEdit && <button type="button" onClick={() => setDelCell(q)} className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-500" title="ลบช่องนี้">✕</button>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <ConfirmDialog open={delBatch !== null} onClose={() => setDelBatch(null)} title={`ลบการเสนอราคาครั้งที่ ${delBatch?.batch ?? ""}`} variant="danger" confirmText="ลบทั้งครั้ง" cancelText="ยกเลิก"
        message={`ลบทุกช่องของครั้งนี้ (${delBatch?.quotes.length ?? 0} ช่อง · ${delBatch?.sizes.length ?? 0} ไซส์) หรือไม่? ย้อนกลับไม่ได้`}
        onConfirm={async () => { const b = delBatch; setDelBatch(null); if (b) await call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/batch?batch=${b.batch}`, { method: "DELETE" }); }, "ลบครั้งนี้แล้ว"); }} />
      <ConfirmDialog open={delCell !== null} onClose={() => setDelCell(null)} title="ลบช่องราคา" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message={delCell ? `ลบ ${sizeLabel(delCell.parent_code)} ${delCell.qty != null ? `${fmtInt(delCell.qty)} ชิ้น` : ""} ราคา ${fmtBaht(delCell.offered_price ?? delCell.price)} ออกจากครั้งนี้?` : ""}
        onConfirm={async () => { const q = delCell; setDelCell(null); if (q) await call(async () => { await api(`/api/design-sheets/${sheetId}/quotes/${q.id}`, { method: "DELETE" }); }, "ลบช่องแล้ว"); }} />
    </div>
  );
}

/** ฟอร์มเสนอราคาครั้งใหม่ — ตารางไขว้กรอกทีเดียว (ไซส์ × ขั้นจำนวน) · เตรียมค่าจากครั้งล่าสุด */
function NewRoundEditor({ sheetId, nextBatch, sizes, sizeLabel, currentCost, last, copiedFrom = null, costDirty, saveCost, onClose, onSaved }: {
  copiedFrom?: number | null;   // คัดลอกมาจากครั้งที่ (โชว์ที่หัวฟอร์ม)
  sheetId: string; nextBatch: number; sizes: Size[]; sizeLabel: (code: string | null) => string; currentCost: (key: string) => number;
  last: Batch | null; costDirty: boolean; saveCost: () => Promise<boolean>; onClose: () => void; onSaved: (batch: number) => Promise<void>;
}) {
  const toast = useToast();
  const [date, setDate] = useState(todayStr());
  const [status, setStatus] = useState("pending");
  const [note, setNote] = useState("");
  const [qtys, setQtys] = useState<(number | null)[]>(() => (last?.qtys.length ? last.qtys : [100, 200, 500, 1000]));
  const [onSizes, setOnSizes] = useState<string[]>(() => (last?.sizes.length ? last.sizes.filter((s) => sizes.some((x) => x.key === s)) : sizes.map((s) => s.key)));
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of sizes) for (const qty of (last?.qtys.length ? last.qtys : [100, 200, 500, 1000])) {
      const pq = last?.quotes.find((q) => (q.parent_code ?? "") === s.key && qtyKey(q.qty) === qtyKey(qty));
      const v = pq ? (pq.offered_price ?? pq.price) : null;
      m[`${s.key}|${qtyKey(qty)}`] = v != null ? String(v) : "";
    }
    return m;
  });
  const [newQty, setNewQty] = useState("");
  const [saving, setSaving] = useState(false);
  const key = (s: string, qty: number | null) => `${s}|${qtyKey(qty)}`;
  const addQty = () => { const n = Number(newQty); if (!Number.isFinite(n) || n <= 0) { toast.error("ใส่จำนวนเป็นตัวเลขมากกว่า 0"); return; } if (qtys.some((q) => q === n)) { toast.error("มีขั้นจำนวนนี้แล้ว"); return; } setQtys((qs) => [...qs, n].sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b))); setNewQty(""); };
  const fillFromCost = () => setCells((m) => { const n = { ...m }; for (const s of sizes) for (const qty of qtys) { const c = currentCost(s.key); if (c > 0 && !n[key(s.key, qty)]) n[key(s.key, qty)] = String(Math.round(c * 100) / 100); } return n; });
  const save = async () => {
    const list: { parent_code: string; qty: number | null; price: number | null; offered_price: number | null }[] = [];
    for (const s of sizes.filter((x) => onSizes.includes(x.key))) for (const qty of qtys) {
      const v = cells[key(s.key, qty)]?.trim(); if (!v) continue;
      const n = Number(v); if (!Number.isFinite(n) || n < 0) { toast.error(`ราคา ${sizeLabel(s.key)} ${qty ?? ""} ไม่ถูกต้อง`); return; }
      const c = currentCost(s.key);
      list.push({ parent_code: s.key, qty, price: c > 0 ? Math.round(c * 100) / 100 : null, offered_price: n });
    }
    if (!list.length) { toast.error("ใส่ราคาที่เสนออย่างน้อย 1 ช่อง"); return; }
    setSaving(true);
    try {
      if (costDirty && !(await saveCost())) return;   // ผูกครั้งนี้กับเวอร์ชันตีราคาที่เห็นจริง
      const r = await apiFetch(`/api/design-sheets/${sheetId}/quotes/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote_date: date, status, note: note || null, cells: list }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      await onSaved(j.batch as number);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border-2 border-blue-300 bg-blue-50/30 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
        <span className="h-7 px-2 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center">＋ ครั้งที่ {nextBatch}</span>
        {copiedFrom != null && <span className="text-[11px] text-blue-700">คัดลอกจากครั้งที่ {copiedFrom} — แก้ราคาแล้วบันทึก</span>}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white">{QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (เช่น ลูกค้าขอลด 5%)" className="h-7 flex-1 min-w-[10rem] px-2 text-xs border border-slate-200 rounded-md bg-white" />
        <button type="button" onClick={fillFromCost} className="h-7 px-2 text-xs border border-slate-200 bg-white rounded-md text-slate-600 hover:bg-slate-50" title="ช่องที่ยังว่าง ใส่ราคาเท่าตีราคาปัจจุบัน">เติมจากตีราคา</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="px-3 py-1.5 text-left font-medium w-28">ไซส์</th>
              <th className="px-2 py-1.5 text-right font-medium w-28">ตีราคาปัจจุบัน</th>
              {qtys.map((qty) => (
                <th key={qtyKey(qty)} className="px-2 py-1.5 text-right font-medium min-w-[7rem] text-blue-700">
                  <span>{qty == null ? "ไม่ระบุ" : `${fmtInt(qty)} ชิ้น`}</span>
                  {qtys.length > 1 && <button type="button" onClick={() => setQtys((qs) => qs.filter((q) => q !== qty))} className="ml-1 text-slate-300 hover:text-rose-500" title="เอาขั้นจำนวนนี้ออก">✕</button>}
                </th>
              ))}
              <th className="px-2 py-1.5 text-left font-normal">
                <span className="inline-flex items-center gap-1"><input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addQty(); }} placeholder="เพิ่มจำนวน" className="h-6 w-20 px-1 text-[11px] border border-slate-200 rounded" /><button type="button" onClick={addQty} className="h-6 px-1.5 text-[11px] border border-slate-200 bg-white rounded hover:bg-slate-50">＋</button></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => {
              const on = onSizes.includes(s.key); const cost = currentCost(s.key);
              return (
                <tr key={s.key} className={`border-t border-blue-100 ${on ? "" : "opacity-40"}`}>
                  <td className="px-3 py-1 text-xs"><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={on} onChange={(e) => setOnSizes((xs) => (e.target.checked ? [...xs, s.key] : xs.filter((x) => x !== s.key)))} className="h-3.5 w-3.5" /><span className="font-medium text-slate-700">{s.label}</span></label></td>
                  <td className="px-2 py-1 text-right text-xs text-slate-500 tabular-nums">{cost > 0 ? fmtBaht(cost) : <span className="text-slate-300" title="ยังไม่ได้ตีราคาไซส์นี้">—</span>}</td>
                  {qtys.map((qty) => {
                    const v = cells[key(s.key, qty)] ?? ""; const n = Number(v); const margin = v && cost > 0 && Number.isFinite(n) ? n - cost : null;
                    return (
                      <td key={qtyKey(qty)} className="px-2 py-1 text-right align-top">
                        <input type="number" min={0} step="any" disabled={!on} value={v} onChange={(e) => setCells((m) => ({ ...m, [key(s.key, qty)]: e.target.value }))} placeholder="—"
                          className="h-8 w-24 px-1.5 text-sm text-right border border-blue-300 bg-white rounded-md font-medium text-blue-700 disabled:bg-slate-50" />
                        {margin != null && <div className={`text-[10px] tabular-nums ${upDown(margin)}`}>{sgn(margin)}{n ? ` (${((margin / n) * 100).toFixed(0)}%)` : ""}</div>}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-blue-200 bg-blue-50/60">
        <span className="text-[11px] text-slate-500">ช่องว่าง = ไม่เสนอขั้นนั้น · ตัวเลขเล็กใต้ช่อง = กำไร/ชิ้น เทียบตีราคาปัจจุบัน{costDirty ? " · ตีราคาที่ยังไม่บันทึก ระบบจะบันทึกให้ก่อน" : ""}</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={onClose} disabled={saving} className="h-8 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="h-8 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : `💾 บันทึกครั้งที่ ${nextBatch}`}</button>
        </div>
      </div>
    </div>
  );
}
