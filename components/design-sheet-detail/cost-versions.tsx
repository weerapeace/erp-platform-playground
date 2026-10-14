"use client";
/**
 * เวอร์ชันตีราคา (ข้อ C) — ป๊อปเปรียบเทียบ "เวอร์ชันที่เคยบันทึก" กับ "ปัจจุบันบนหน้าจอ" หรือกับอีกเวอร์ชัน
 *
 * ของกลางที่ใช้: ERPModal / ConfirmDialog / MiniTable / useToast / apiFetch
 * ข้อมูล: /api/design-sheets/[id]/cost-snapshots (สร้างอัตโนมัติตอนกด 💾 บันทึกตีราคา เมื่อเนื้อหาเปลี่ยน)
 * เปรียบเทียบเฉพาะแท็บ Parent ที่กำลังดู (parentKey) — จับคู่บรรทัดด้วย lib/design-sheet-cost-snapshot.diffCostLines
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { diffCostLines, diffExtras, costTotals, type DiffRow, type SnapExtra, type SnapExtraMap, type SnapLine } from "@/lib/design-sheet-cost-snapshot";
import type { CostSnapshot } from "@/app/api/design-sheets/[id]/cost-snapshots/route";

const fmtBaht = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtQty = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtBaht(Math.abs(n))}`;
const signCls = (n: number) => (n > 0.004 ? "text-rose-700" : n < -0.004 ? "text-emerald-700" : "text-slate-400");
const fmtWhen = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };

type Side = { label: string; lines: SnapLine[]; extra: SnapExtra[] };

export function CostVersionsModal({ open, onClose, sheetId, parentKey, parentLabel, currentLines, currentExtra, canEdit, onRestore, initialA, initialB }: {
  open: boolean; onClose: () => void; sheetId: string;
  initialA?: string | null; initialB?: string | null;   // เปิดมาพร้อมเลือกซ้าย/ขวาให้เลย (เช่น จากคอลัมน์ "อะไรเปลี่ยน" ของรอบเสนอราคา)
  parentKey: string; parentLabel: string;
  currentLines: SnapLine[]; currentExtra: SnapExtraMap;   // ที่อยู่บนหน้าจอตอนนี้ (รวมที่ยังไม่บันทึก)
  canEdit: boolean;
  onRestore: (lines: SnapLine[], extra: SnapExtra[]) => void;   // ↩ ใช้เวอร์ชันนี้ → ใส่กลับเข้าตารางของ Parent ที่ดูอยู่
}) {
  const toast = useToast();
  const [list, setList] = useState<CostSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aId, setAId] = useState<string | null>(null);        // ซ้าย = เวอร์ชันเก่า
  const [bId, setBId] = useState<string>("current");           // ขวา = ปัจจุบัน หรือเวอร์ชันอื่น
  const [full, setFull] = useState<Record<string, CostSnapshot>>({});   // cache เวอร์ชันแบบเต็ม (lines)
  const [delId, setDelId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch(`/api/design-sheets/${sheetId}/cost-snapshots`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const rows = (j.data ?? []) as CostSnapshot[];
      setList(rows);
      setAId((cur) => cur && rows.some((s) => s.id === cur) ? cur : (rows[0]?.id ?? null));
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดเวอร์ชันไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [sheetId]);
  useEffect(() => { if (open) { if (initialA) setAId(initialA); setBId(initialB ?? "current"); void load(); } }, [open, load, initialA, initialB]);

  // ดึงเวอร์ชันเต็ม (lines) เมื่อถูกเลือก
  const ensureFull = useCallback(async (id: string | null) => {
    if (!id || id === "current" || full[id]) return;
    try {
      const r = await apiFetch(`/api/design-sheets/${sheetId}/cost-snapshots?id=${id}`);
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setFull((m) => ({ ...m, [id]: j.data as CostSnapshot }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดเวอร์ชันไม่สำเร็จ"); }
  }, [sheetId, full, toast]);
  useEffect(() => { void ensureFull(aId); }, [aId, ensureFull]);
  useEffect(() => { void ensureFull(bId); }, [bId, ensureFull]);

  const sideOf = useCallback((id: string | null): Side | null => {
    if (!id) return null;
    if (id === "current") return { label: "ปัจจุบัน (บนหน้าจอ)", lines: currentLines.filter((l) => (l.parent_code ?? "") === parentKey), extra: currentExtra[parentKey] ?? [] };
    const s = full[id]; if (!s) return null;
    const meta = list.find((x) => x.id === id);
    return { label: meta ? `${meta.label ? `${meta.label} · ` : ""}${fmtWhen(meta.taken_at)}` : "เวอร์ชัน", lines: (s.lines ?? []).filter((l) => (l.parent_code ?? "") === parentKey), extra: (s.cost_extra ?? {})[parentKey] ?? [] };
  }, [currentLines, currentExtra, parentKey, full, list]);

  const A = sideOf(aId), B = sideOf(bId);
  const rows = useMemo(() => (A && B ? diffCostLines(A.lines, B.lines) : []), [A, B]);
  const extras = useMemo(() => (A && B ? diffExtras(A.extra, B.extra) : []), [A, B]);
  const tA = A ? costTotals(A.lines, { [parentKey]: A.extra }).totals[parentKey] ?? { material: 0, extra: 0, total: 0 } : null;
  const tB = B ? costTotals(B.lines, { [parentKey]: B.extra }).totals[parentKey] ?? { material: 0, extra: 0, total: 0 } : null;
  const shown = onlyChanged ? rows.filter((r) => r.status !== "same") : rows;
  const nChanged = rows.filter((r) => r.status !== "same").length;

  const cols: MiniColumn<DiffRow>[] = [
    { key: "st", header: "", width: "4.5rem", cell: (r) => {
      const m = { same: ["เท่าเดิม", "bg-slate-100 text-slate-500"], changed: ["เปลี่ยน", "bg-amber-100 text-amber-800"], added: ["เพิ่ม", "bg-emerald-100 text-emerald-800"], removed: ["ลบ", "bg-rose-100 text-rose-800"] }[r.status];
      return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m[1]}`}>{m[0]}</span>;
    } },
    { key: "name", header: "วัสดุ", width: "1.6fr", cell: (r) => { const l = r.b ?? r.a; return <span className="truncate" title={l?.note ?? undefined}><b>{l?.item_name ?? l?.group_name ?? "—"}</b>{l?.note ? <span className="ml-1 text-[10px] text-slate-400">· {l.note}</span> : null}</span>; } },
    { key: "qty", header: "ปริมาณ", width: "7.5rem", align: "right", cell: (r) => <Pair a={r.a ? `${fmtQty(r.a.qty)} ${r.a.uom ?? ""}` : null} b={r.b ? `${fmtQty(r.b.qty)} ${r.b.uom ?? ""}` : null} hot={r.changedFields.includes("qty") || r.changedFields.includes("uom")} /> },
    { key: "price", header: "ราคา/หน่วย", width: "7rem", align: "right", cell: (r) => <Pair a={r.a ? fmtBaht(r.a.unit_price) : null} b={r.b ? fmtBaht(r.b.unit_price) : null} hot={r.changedFields.includes("unit_price")} /> },
    { key: "amt", header: "ยอด", width: "7rem", align: "right", cell: (r) => <Pair a={r.a ? fmtBaht(r.a.amount) : null} b={r.b ? fmtBaht(r.b.amount) : null} hot={r.changedFields.includes("amount")} /> },
    { key: "diff", header: "ต่าง", width: "6.5rem", align: "right", sortValue: (r) => r.amountDiff, cell: (r) => <b className={`tabular-nums ${signCls(r.amountDiff)}`}>{fmtSigned(r.amountDiff)}</b> },
  ];

  const doDelete = async () => {
    if (!delId) return;
    try {
      const r = await apiFetch(`/api/design-sheets/${sheetId}/cost-snapshots?id=${delId}`, { method: "DELETE" });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบเวอร์ชันแล้ว"); setDelId(null); void load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const doRename = async () => {
    if (!renameId) return;
    try {
      const r = await apiFetch(`/api/design-sheets/${sheetId}/cost-snapshots`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: renameId, label: renameVal }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setList((l) => l.map((s) => (s.id === renameId ? { ...s, label: j.label } : s))); setRenameId(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้งชื่อไม่สำเร็จ"); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title={`🕘 เวอร์ชันตีราคา — ${parentLabel}`} size="xl"
      footer={<div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">ระบบเก็บเวอร์ชันให้เองทุกครั้งที่กด 💾 บันทึกตีราคา แล้วเนื้อหาเปลี่ยน (เก็บล่าสุด 50 เวอร์ชัน)</span>
        <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ปิด</button>
      </div>}>
      <div className="grid gap-3 md:grid-cols-[15rem_1fr]">
        {/* รายการเวอร์ชัน (ซ้าย) */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          <div className="text-[11px] font-semibold text-slate-500 px-1">เลือกเวอร์ชันเก่า (ซ้าย)</div>
          {loading && <p className="px-2 py-4 text-xs text-slate-400 text-center">กำลังโหลด…</p>}
          {error && <p className="px-2 py-2 text-xs text-rose-600">⚠ {error} <button type="button" onClick={() => void load()} className="underline">ลองใหม่</button></p>}
          {!loading && !error && list.length === 0 && <p className="px-2 py-4 text-xs text-slate-400 text-center">ยังไม่มีเวอร์ชัน — กด 💾 บันทึกตีราคา ครั้งแรกจะเริ่มเก็บให้</p>}
          {list.map((s, i) => {
            const t = s.totals?.[parentKey];
            const prev = list[i + 1]?.totals?.[parentKey];
            const d = t && prev ? t.total - prev.total : null;
            const on = s.id === aId;
            return (
              <div key={s.id} className={`rounded-md border px-2 py-1.5 text-xs cursor-pointer ${on ? "border-blue-400 bg-white ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-blue-300"}`} onClick={() => setAId(s.id)}>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-800 truncate flex-1">{s.label || `เวอร์ชัน ${list.length - i}`}</span>
                  {i === 0 && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">ล่าสุด</span>}
                </div>
                <div className="text-[10px] text-slate-500">{fmtWhen(s.taken_at)}{s.taken_by_name ? ` · ${s.taken_by_name.split("@")[0]}` : ""}</div>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="tabular-nums text-slate-700">{t ? fmtBaht(t.total) : "—"} บ.</span>
                  {d != null && <span className={`tabular-nums text-[10px] ${signCls(d)}`}>{fmtSigned(d)}</span>}
                </div>
                {canEdit && on && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setRenameId(s.id); setRenameVal(s.label ?? ""); }} className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600 hover:bg-slate-50">✏️ ตั้งชื่อ</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); const f = full[s.id]; if (!f) { toast.error("กำลังโหลดเวอร์ชันนี้ ลองอีกครั้ง"); return; } onRestore((f.lines ?? []).filter((l) => (l.parent_code ?? "") === parentKey), (f.cost_extra ?? {})[parentKey] ?? []); }} className="h-6 rounded border border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700 hover:bg-blue-100" title="ใส่บรรทัดของเวอร์ชันนี้กลับเข้าตาราง (ต้องกด 💾 บันทึก จึงมีผล)">↩ ใช้เวอร์ชันนี้</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDelId(s.id); }} className="h-6 rounded border border-rose-200 bg-white px-1.5 text-[10px] text-rose-600 hover:bg-rose-50">🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* เปรียบเทียบ (ขวา) */}
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">เทียบกับ (ขวา):</span>
            <select value={bId} onChange={(e) => setBId(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
              <option value="current">ปัจจุบัน (บนหน้าจอ)</option>
              {list.filter((s) => s.id !== aId).map((s, i) => <option key={s.id} value={s.id}>{s.label || `เวอร์ชัน ${list.length - list.indexOf(s)}`} · {fmtWhen(s.taken_at)}{i === 0 && list[0]?.id === s.id ? " (ล่าสุด)" : ""}</option>)}
            </select>
            <label className="ml-auto flex items-center gap-1 text-slate-600"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="h-3.5 w-3.5" /> เฉพาะที่ต่าง ({nChanged})</label>
          </div>

          {A && B && tA && tB ? (
            <>
              {/* สรุปยอด A → B */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {([["วัสดุ", tA.material, tB.material], ["ค่าใช้จ่ายเพิ่ม", tA.extra, tB.extra], ["ต้นทุนรวม", tA.total, tB.total]] as const).map(([lab, a, b]) => (
                  <div key={lab} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <div className="text-[10px] text-slate-500">{lab}</div>
                    <div className="tabular-nums text-slate-500">{fmtBaht(a)} <span className="text-slate-300">→</span> <b className="text-slate-800">{fmtBaht(b)}</b></div>
                    <div className={`tabular-nums text-[11px] font-semibold ${signCls(b - a)}`}>{fmtSigned(b - a)}{a ? ` (${((b - a) / a * 100).toFixed(1)}%)` : ""}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-400">ซ้าย = <b>{A.label}</b> · ขวา = <b>{B.label}</b> · ต่าง = ขวา − ซ้าย</div>
              <MiniTable<DiffRow> rows={shown} columns={cols} rowKey={(r) => r.key} dense maxHeightClass="max-h-[42vh]"
                emptyText={rows.length ? "ไม่มีบรรทัดที่ต่างกัน — วัสดุเหมือนกันทุกบรรทัด" : "ทั้งสองเวอร์ชันไม่มีบรรทัดวัสดุ"} />
              {extras.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500">💼 ค่าใช้จ่ายเพิ่ม</div>
                  {extras.map((e) => (
                    <div key={e.label} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-slate-700">{e.label}</span>
                      <span className="tabular-nums text-slate-500">{e.a == null ? "—" : fmtBaht(e.a)} → <b className="text-slate-800">{e.b == null ? "—" : fmtBaht(e.b)}</b></span>
                      <span className={`w-20 text-right tabular-nums font-semibold ${signCls(e.diff)}`}>{fmtSigned(e.diff)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">{list.length ? "กำลังโหลดเวอร์ชันที่เลือก…" : "เลือกเวอร์ชันทางซ้ายเพื่อเปรียบเทียบ"}</p>
          )}
        </div>
      </div>

      <ConfirmDialog open={delId !== null} onClose={() => setDelId(null)} onConfirm={doDelete} title="ลบเวอร์ชันตีราคา" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message="ลบเวอร์ชันนี้ออกจากประวัติ? บรรทัดตีราคาปัจจุบันไม่ได้รับผลกระทบ" />
      <ERPModal open={renameId !== null} onClose={() => setRenameId(null)} title="ตั้งชื่อเวอร์ชัน" size="sm"
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setRenameId(null)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">ยกเลิก</button><button type="button" onClick={() => void doRename()} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg">บันทึก</button></div>}>
        <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void doRename(); }} placeholder="เช่น ราคาก่อนปรับผ้า / เสนอลูกค้ารอบ 2" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </ERPModal>
    </ERPModal>
  );
}

/** ค่า A → B ในช่องเดียว (ไฮไลต์เมื่อเปลี่ยน) */
function Pair({ a, b, hot }: { a: string | null; b: string | null; hot: boolean }) {
  if (a == null) return <span className="tabular-nums text-emerald-800">{b}</span>;
  if (b == null) return <span className="tabular-nums text-rose-700 line-through">{a}</span>;
  if (!hot) return <span className="tabular-nums text-slate-600">{b}</span>;
  return <span className="tabular-nums"><span className="text-slate-400 line-through">{a}</span> <b className="text-amber-800">{b}</b></span>;
}
