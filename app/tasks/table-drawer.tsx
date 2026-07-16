"use client";

// สเปรดชีตของการ์ดตารางบนกระดานแคมเปญ — กรอกค่า/สูตร (=A1+B1, =SUM(A1:A5)) คำนวณสด · บันทึกแล้ว re-render การ์ด
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { computeGrid, indexToCol } from "@/lib/canvas-formula";

type Toast = { type: "success" | "error" | "info"; message: string };
type Grid = string[][];

export function TableDrawer({ tableId, onClose, onSaved, onDeleted, pushToast }: {
  tableId: string;
  onClose: () => void;
  onSaved: (t: { id: string; title: string; data: Grid }) => void;   // หลังบันทึก → ให้กระดาน re-render การ์ด
  onDeleted: (tableId: string) => void;                              // ลบตาราง → เอาการ์ดออก
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [grid, setGrid] = useState<Grid>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);  // ช่องที่กำลังแก้
  const [editVal, setEditVal] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = grid.length;
  const cols = grid.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
  const computed = useMemo(() => computeGrid(grid), [grid]);

  useEffect(() => {
    apiFetch(`/api/canvas-tables/${tableId}`).then((r) => r.json()).then((j) => {
      if (j.error) { pushToast("error", j.error); return; }
      setTitle(j.title ?? ""); setGrid(normalize(j.data ?? []));
    }).catch((e) => pushToast("error", (e as Error).message)).finally(() => setLoading(false));
  }, [tableId, pushToast]);

  // ทำ grid ให้เป็นสี่เหลี่ยม (ทุกแถวยาวเท่ากัน) อย่างน้อย 3x3
  function normalize(g: unknown): Grid {
    const arr = Array.isArray(g) ? (g as unknown[]).map((r) => Array.isArray(r) ? (r as unknown[]).map((c) => (c == null ? "" : String(c))) : []) : [];
    const R = Math.max(arr.length, 3);
    const C = Math.max(arr.reduce((m, r) => Math.max(m, r.length), 0), 3);
    return Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => arr[r]?.[c] ?? ""));
  }

  const setCell = useCallback((r: number, c: number, v: string) => {
    setGrid((g) => { const n = g.map((row) => row.slice()); while (n.length <= r) n.push(Array(cols).fill("")); n[r][c] = v; return n; });
    setDirty(true);
  }, [cols]);

  const startEdit = (r: number, c: number) => { setActive({ r, c }); setEditVal(grid[r]?.[c] ?? ""); setTimeout(() => inputRef.current?.focus(), 0); };
  const commitEdit = () => { if (active) setCell(active.r, active.c, editVal); };
  const onCellKey = (e: React.KeyboardEvent) => {
    if (!active) return;
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); const nr = Math.min(active.r + 1, rows - 1); startEdit(nr, active.c); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit(); const nc = active.c + 1 < cols ? active.c + 1 : 0; const nr = active.c + 1 < cols ? active.r : Math.min(active.r + 1, rows - 1); startEdit(nr, nc); }
    else if (e.key === "Escape") { e.preventDefault(); setActive(null); }
  };

  const addRow = () => { setGrid((g) => [...g, Array(cols).fill("")]); setDirty(true); };
  const delRow = () => { if (rows <= 1) return; setGrid((g) => g.slice(0, -1)); setDirty(true); };
  const addCol = () => { setGrid((g) => g.map((r) => [...r, ""])); setDirty(true); };
  const delCol = () => { if (cols <= 1) return; setGrid((g) => g.map((r) => r.slice(0, Math.max(1, cols - 1)))); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const j = await apiFetch(`/api/canvas-tables/${tableId}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() || "ตาราง", data: grid }) }).then((r) => r.json());
      if (j.error) { pushToast("error", j.error); return; }
      setDirty(false);
      pushToast("success", t("บันทึกตารางแล้ว", "Table saved"));
      onSaved({ id: tableId, title: j.title ?? title, data: (j.data ?? grid) as Grid });
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    try { await apiFetch(`/api/canvas-tables/${tableId}`, { method: "DELETE" }); pushToast("success", t("ลบตารางแล้ว", "Table deleted")); onDeleted(tableId); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setConfirmDel(false); }
  };

  const cellDisplay = (r: number, c: number) => (computed[r]?.[c] ?? "").toString();
  const isFormula = (r: number, c: number) => (grid[r]?.[c] ?? "").trim().startsWith("=");

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => (dirty ? undefined : onClose())} />
      <div className="fixed right-0 top-0 h-full w-[820px] max-w-[98vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="h-1 shrink-0 bg-teal-500" />
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-teal-600 text-lg">▦</span>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder={t("ชื่อตาราง", "Table name")}
              className="text-base font-semibold text-slate-900 border-b border-transparent hover:border-slate-200 focus:border-teal-400 focus:outline-none min-w-0 flex-1" />
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0">✕</button>
        </div>

        {/* คำอธิบายสูตร */}
        <div className="px-6 py-2 bg-teal-50/50 border-b border-teal-100 text-[11px] text-slate-500 shrink-0">
          {t("พิมพ์สูตรขึ้นต้นด้วย = เช่น ", "Start a formula with = e.g. ")}
          <code className="bg-white border border-slate-200 rounded px-1">=A1+B1</code> · <code className="bg-white border border-slate-200 rounded px-1">=(A1+A2)*3</code> · <code className="bg-white border border-slate-200 rounded px-1">=SUM(A1:A5)</code>
          {t(" · รองรับ + − × ÷ ( ) และ SUM/AVERAGE/MIN/MAX/COUNT", " · supports + − × ÷ ( ) and SUM/AVERAGE/MIN/MAX/COUNT")}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? <div className="py-12 text-center text-slate-400 text-sm">{t("กำลังโหลด…", "Loading…")}</div> : (
            <div className="inline-block border border-slate-300 rounded-lg overflow-hidden">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-9 bg-slate-100 border border-slate-200" />
                    {Array.from({ length: cols }, (_, c) => (
                      <th key={c} className="min-w-[96px] h-7 bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-500">{indexToCol(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }, (_, r) => (
                    <tr key={r}>
                      <td className="w-9 h-8 bg-slate-100 border border-slate-200 text-center text-[11px] text-slate-500 font-medium">{r + 1}</td>
                      {Array.from({ length: cols }, (_, c) => {
                        const isActive = active?.r === r && active?.c === c;
                        return (
                          <td key={c} onClick={() => !isActive && startEdit(r, c)}
                            className={`min-w-[96px] h-8 border border-slate-200 p-0 align-middle cursor-cell ${isActive ? "ring-2 ring-teal-400 ring-inset" : "hover:bg-teal-50/40"}`}>
                            {isActive ? (
                              <input ref={inputRef} value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => { commitEdit(); setActive(null); }} onKeyDown={onCellKey}
                                className="w-full h-8 px-1.5 text-[13px] outline-none bg-white" />
                            ) : (
                              <div className={`w-full h-8 px-1.5 flex items-center truncate text-[13px] ${isFormula(r, c) ? "text-teal-700" : "text-slate-800"}`} title={grid[r]?.[c] || ""}>{cellDisplay(r, c)}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* เพิ่ม/ลบ แถว-คอลัมน์ */}
          {!loading && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[11px] text-slate-400">{t("จัดตาราง:", "Table:")}</span>
              <button onClick={addRow} className="h-7 px-2.5 text-[12px] border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">＋ {t("แถว", "Row")}</button>
              <button onClick={delRow} disabled={rows <= 1} className="h-7 px-2.5 text-[12px] border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">－ {t("แถว", "Row")}</button>
              <button onClick={addCol} className="h-7 px-2.5 text-[12px] border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">＋ {t("คอลัมน์", "Col")}</button>
              <button onClick={delCol} disabled={cols <= 1} className="h-7 px-2.5 text-[12px] border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40">－ {t("คอลัมน์", "Col")}</button>
              <span className="text-[11px] text-slate-400">{rows} × {cols}</span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-3 shrink-0 flex items-center gap-2">
          <button onClick={() => setConfirmDel(true)} className="h-9 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">🗑 {t("ลบตาราง", "Delete")}</button>
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 ml-auto">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
        </div>
      </div>

      {confirmDel && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => setConfirmDel(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] bg-white rounded-xl shadow-2xl border border-slate-200 p-5 w-[360px]">
            <p className="text-base font-semibold text-slate-900 mb-1">{t("ลบตารางนี้?", "Delete this table?")}</p>
            <p className="text-sm text-slate-500 mb-4">{t("ลบตาราง + เอาการ์ดออกจากกระดาน (กู้คืนไม่ได้)", "Deletes the table and removes the card (cannot be undone)")}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
              <button onClick={doDelete} className="h-9 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">{t("ลบ", "Delete")}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
