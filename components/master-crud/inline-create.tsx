"use client";

/**
 * InlineCreatePanel — "เพิ่มหลายรายการแบบ inline" (ของกลาง ใช้ได้ทุกโมดูล)
 * --------------------------------------------------------------------------
 * ปัญหาเดิม: จะเพิ่ม 10 รายการ ต้องเปิดฟอร์ม → กรอก → บันทึก → เปิดใหม่ 10 รอบ
 *
 * ตัวนี้: ตารางกรอกหลายแถวรวดเดียว (เหมือน Excel) — พิมพ์เอง หรือ 📋 วางจาก Excel ก็ได้
 *   • ช่องกรอกใช้ของกลางตามชนิดฟิลด์: MoneyInput (เงิน) · DateInput (วันที่)
 *     RelationPicker (ช่องเชื่อมโยง) · dropdown (select) · ติ๊ก (boolean)
 *   • บันทึกผ่าน API นำเข้าของกลาง `<apiBase><apiPath>/import`
 *     → ได้ของแถมครบ: แปลงชื่อ/รหัสเป็น id, สิทธิ์ระดับฟิลด์, ค่า default,
 *       และ "รายงานรายแถว" ว่าแถวไหนเข้าไม่ได้เพราะอะไร
 *
 * เปิดจากปุ่ม "➕ เพิ่มหลายรายการ" บนหัวหน้าโมดูล (ปิดได้ด้วย config.inlineCreate = false)
 */

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { apiFetch } from "@/lib/api";
import { parsePastedTable, parseNumberCell, parseDateCell } from "@/lib/paste-table";

/** รูปแบบฟิลด์เท่าที่ตารางกรอกต้องรู้ (ตัดมาจาก FieldDef ของ MasterCRUD) */
export type InlineField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  hideInForm?: boolean;
  options?: string[];
  optionLabels?: Record<string, string>;
  relationConfig?: RelationConfig;
  currencyCode?: string;
  currencyField?: string;
  placeholder?: string;
  order?: number;
};

type Row = { key: string; data: Record<string, unknown> };
type FailRow = { row: number; error: string };

const BLANK_ROWS = 3;
const MAX_ROWS = 200;
const MAX_COLS = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ชนิดที่กรอกในตารางแถวเดียวไม่ไหว (รูป/รายการลูก/ค่าที่ระบบคิดเอง) */
const SKIP_TYPES = new Set(["image", "one2many", "many2many", "computed", "textarea"]);

const inputCls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";

export function InlineCreatePanel({
  open, onClose, onSaved, fields, apiBase, apiPath, title, rowCheck,
}: {
  open: boolean;
  onClose: () => void;
  /** บันทึกสำเร็จอย่างน้อย 1 แถว → ให้หน้าหลักโหลดตารางใหม่ */
  onSaved: () => void | Promise<void>;
  fields: InlineField[];
  apiBase: string;
  apiPath: string;
  title: string;
  /** ตรวจความสมเหตุสมผลของแต่ละแถวก่อนบันทึก (เช่น ยอดแยกต้องรวมได้เท่ายอดจ่าย) */
  rowCheck?: (data: Record<string, unknown>) => { ok: boolean; message?: string } | null;
}) {
  // คอลัมน์ที่กรอกได้จริง — เรียงตามทะเบียนฟิลด์ · ฟิลด์บังคับมาก่อนเสมอ
  const cols = useMemo(() => {
    const usable = fields
      .filter((f) => !f.readonly && !f.hideInForm && !SKIP_TYPES.has(f.type) && f.key !== "id")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const required = usable.filter((f) => f.required);
    const rest = usable.filter((f) => !f.required);
    return [...required, ...rest].slice(0, MAX_COLS);
  }, [fields]);

  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: BLANK_ROWS }, (_, i) => ({ key: `r${i}`, data: {} })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<{ created: number; failed: FailRow[] } | null>(null);

  const reset = () => {
    setRows(Array.from({ length: BLANK_ROWS }, (_, i) => ({ key: `r${i}-${Date.now()}`, data: {} })));
    setErr(""); setResult(null); setPasteText(""); setPasteOpen(false);
  };

  const setCell = (key: string, col: string, val: unknown) =>
    setRows((p) => p.map((r) => (r.key === key ? { ...r, data: { ...r.data, [col]: val } } : r)));

  const addRows = (n: number) =>
    setRows((p) => [...p, ...Array.from({ length: n }, (_, i) => ({ key: `r${p.length + i}-${Date.now()}`, data: {} }))]);

  const removeRow = (key: string) => setRows((p) => (p.length <= 1 ? p : p.filter((r) => r.key !== key)));

  /**
   * เติมลงล่าง (flash fill / fill down) — เอาค่าของ "แถวบนสุดที่กรอกไว้" ในคอลัมน์นั้น
   * ไปใส่ทุกแถวที่อยู่ต่ำกว่า · ใช้ตอนหลายแถวใช้ค่าเดียวกัน เช่น สัญญาเดียวกัน วันเดียวกัน
   */
  const fillDown = (colKey: string) => setRows((p) => {
    const from = p.findIndex((r) => { const v = r.data[colKey]; return v != null && String(v).trim() !== ""; });
    if (from < 0) return p;
    const val = p[from].data[colKey];
    return p.map((r, i) => (i > from ? { ...r, data: { ...r.data, [colKey]: val } } : r));
  });

  /** เติมลงล่างให้ทุกคอลัมน์รวดเดียว */
  const fillDownAll = () => cols.forEach((c) => fillDown(c.key));

  /** มีค่าให้เติมลงล่างไหม (ใช้เปิด/ปิดปุ่ม) */
  const canFill = (colKey: string) => {
    const from = rows.findIndex((r) => { const v = r.data[colKey]; return v != null && String(v).trim() !== ""; });
    return from >= 0 && from < rows.length - 1;
  };
  const canFillAny = useMemo(() => cols.some((c) => canFill(c.key)), // eslint-disable-line react-hooks/exhaustive-deps
    [rows, cols]);

  /** ผลตรวจของแต่ละแถว (เฉพาะแถวที่กรอกแล้ว) */
  const checks = useMemo(() => {
    const m = new Map<string, { ok: boolean; message?: string }>();
    if (!rowCheck) return m;
    rows.forEach((r) => {
      const hasData = Object.values(r.data).some((v) => v != null && String(v).trim() !== "");
      if (!hasData) return;
      const res = rowCheck(r.data);
      if (res) m.set(r.key, res);
    });
    return m;
  }, [rows, rowCheck]);
  const badRows = useMemo(() => [...checks.values()].filter((c) => !c.ok).length, [checks]);

  /** แถวที่มีข้อมูลจริง (ไม่นับแถวเปล่า) */
  const filled = useMemo(
    () => rows.filter((r) => Object.values(r.data).some((v) => v != null && String(v).trim() !== "")),
    [rows],
  );

  /** แปลงข้อความ 1 ช่อง → ค่าที่เก็บจริง ตามชนิดของคอลัมน์นั้น */
  const toCellValue = (f: InlineField, raw: string): unknown => {
    const s = raw.trim();
    if (s === "") return "";
    if (f.type === "number") return parseNumberCell(s);
    if (f.type === "date") return parseDateCell(s) || s;
    if (f.type === "boolean") return /^(true|1|ใช่|yes|y|เปิด)$/i.test(s);
    return s;   // relation/select ส่งเป็นชื่อ/รหัสได้ — API นำเข้าจับคู่ให้ตอนบันทึก
  };

  /**
   * วางข้อมูลลงตารางโดยเริ่มที่ช่องที่เคอร์เซอร์อยู่ (แบบ Excel)
   *  • คัดลอกมา 1 คอลัมน์ 8 ค่า → ไหลลง 8 แถวของคอลัมน์นั้น
   *  • คัดลอกมาเป็นบล็อกหลายคอลัมน์ → วางเป็นบล็อกจากช่องนั้นไปทางขวา/ลงล่าง
   *  • แถวไม่พอ → เพิ่มแถวให้อัตโนมัติ
   */
  const pasteAt = (rowIdx: number, colIdx: number, text: string): boolean => {
    const grid = parsePastedTable(text);
    // ค่าเดียวช่องเดียว → ปล่อยให้เบราว์เซอร์วางตามปกติ
    if (grid.length === 0 || (grid.length === 1 && grid[0].length <= 1)) return false;
    setRows((p) => {
      const need = rowIdx + grid.length;
      const next = [...p];
      for (let i = next.length; i < Math.min(need, MAX_ROWS); i++) next.push({ key: `a${i}-${Date.now()}`, data: {} });
      grid.forEach((cells, ri) => {
        const target = next[rowIdx + ri];
        if (!target) return;                       // เกิน MAX_ROWS แล้ว
        const data = { ...target.data };
        cells.forEach((cell, ci) => {
          const f = cols[colIdx + ci];
          if (!f) return;                          // เกินคอลัมน์ที่แสดงอยู่
          data[f.key] = toCellValue(f, cell);
        });
        next[rowIdx + ri] = { ...target, data };
      });
      return next;
    });
    return true;
  };

  /** วางจาก Excel (ทั้งตาราง) — คอลัมน์เรียงตามหัวตารางที่เห็นบนจอ */
  const applyPaste = () => {
    const grid = parsePastedTable(pasteText);
    if (grid.length === 0) { setErr("อ่านตารางที่วางมาไม่ได้"); return; }
    // แถวแรกเป็นหัวตาราง (ตรงกับชื่อคอลัมน์) → ตัดทิ้ง
    const body = grid[0]?.some((c) => cols.some((f) => f.label === c.trim())) ? grid.slice(1) : grid;
    const next: Row[] = body.slice(0, MAX_ROWS).map((cells, i) => {
      const data: Record<string, unknown> = {};
      cols.forEach((f, ci) => {
        const raw = (cells[ci] ?? "").trim();
        if (raw === "") return;
        if (f.type === "number") data[f.key] = parseNumberCell(raw);
        else if (f.type === "date") data[f.key] = parseDateCell(raw) || raw;
        else if (f.type === "boolean") data[f.key] = /^(true|1|ใช่|yes|y|เปิด)$/i.test(raw);
        else data[f.key] = raw;   // relation ส่งเป็นชื่อ/รหัสได้ — API นำเข้าจับคู่ให้เอง
      });
      return { key: `p${i}-${Date.now()}`, data };
    });
    setRows(next.length ? next : rows);
    setErr(""); setPasteOpen(false); setPasteText("");
  };

  const save = async () => {
    setErr(""); setResult(null);
    if (filled.length === 0) { setErr("ยังไม่ได้กรอกข้อมูลสักแถว"); return; }
    // ตรวจฟิลด์บังคับก่อนยิง (จะได้ไม่เสียรอบไปกลับ)
    const req = cols.filter((c) => c.required);
    for (let i = 0; i < filled.length; i++) {
      const miss = req.filter((c) => { const v = filled[i].data[c.key]; return v == null || String(v).trim() === ""; });
      if (miss.length) { setErr(`แถวที่ ${i + 1} ยังไม่ได้กรอก: ${miss.map((m) => m.label).join(", ")}`); return; }
    }
    if (badRows > 0) { setErr(`มี ${badRows} แถวที่ยอดยังไม่ถูกต้อง — ดูเครื่องหมาย ⚠ ท้ายแถว`); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`${apiBase}${apiPath}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filled.map((r) => r.data), mode: "create" }),
      });
      const j = await res.json();
      if (!res.ok || (j?.error && !j?.created)) { setErr(j?.error || "บันทึกไม่สำเร็จ"); setSaving(false); return; }
      const failed = (j?.failed ?? []) as FailRow[];
      setResult({ created: Number(j?.created ?? 0), failed });
      if (Number(j?.created ?? 0) > 0) await onSaved();
      // เข้าครบทุกแถว → ล้างตารางให้พร้อมกรอกชุดถัดไป
      if (failed.length === 0) setRows(Array.from({ length: BLANK_ROWS }, (_, i) => ({ key: `n${i}-${Date.now()}`, data: {} })));
    } catch {
      setErr("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (f: InlineField, r: Row) => {
    const v = r.data[f.key];
    const set = (val: unknown) => setCell(r.key, f.key, val);
    if (f.type === "relation" && f.relationConfig) {
      const s = v == null ? "" : String(v);
      // วางชื่อ/รหัสมาเป็นข้อความ (ยังไม่ใช่ id) → โชว์ตามที่วาง แล้วให้ระบบจับคู่ตอนบันทึก
      if (s && !UUID_RE.test(s)) {
        return (
          <div className="h-8 flex items-center gap-1 px-2 rounded-md border border-amber-200 bg-amber-50" title="จะจับคู่กับข้อมูลจริงตอนบันทึก">
            <span className="flex-1 truncate text-sm text-amber-800">{s}</span>
            <button type="button" onClick={() => set(null)} title="ล้างค่า" className="shrink-0 text-amber-400 hover:text-red-600">✕</button>
          </div>
        );
      }
      return <RelationPicker value={s || null} onChange={(id) => set(id)} config={f.relationConfig}
        placeholder="— เลือก —" siblingValues={r.data} />;
    }
    if (f.type === "select") {
      return (
        <select value={(v as string) ?? ""} onChange={(e) => set(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">—</option>
          {f.options?.map((o) => <option key={o} value={o}>{f.optionLabels?.[o] || o}</option>)}
        </select>
      );
    }
    if (f.type === "boolean") {
      return <div className="h-8 flex items-center"><input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} className="rounded border-slate-300" /></div>;
    }
    if (f.type === "date") {
      return <DateInput value={(v as string) ?? ""} onChange={(iso) => set(iso)} />;
    }
    if (f.type === "number" && (f.currencyCode || f.currencyField)) {
      return <MoneyInput value={(v as string | number) ?? ""} onChange={(raw) => set(raw)} className={`${inputCls} text-right tabular-nums`} />;
    }
    return (
      <input type={f.type === "number" ? "number" : "text"} value={(v as string) ?? ""}
        onChange={(e) => set(e.target.value)} placeholder={f.placeholder}
        className={`${inputCls} ${f.type === "number" ? "text-right tabular-nums" : ""}`} />
    );
  };

  const gridCols = `2.25rem ${cols.map(() => "minmax(9rem, 1fr)").join(" ")}${rowCheck ? " 2.5rem" : ""} 2.25rem`;
  // ความกว้างขั้นต่ำของตาราง = คอลัมน์ลำดับ + คอลัมน์ข้อมูล + คอลัมน์ลบ + ช่องไฟระหว่างคอลัมน์
  // ต้องคิดให้ครบ ไม่งั้นกล่องแถวจะกว้างเกินกล่องนอก แล้วเกิดแถบเลื่อนซ้อนกัน 2 ชั้น
  const minWidthRem = 2.25 + cols.length * 9 + (rowCheck ? 2.5 : 0) + 2.25 + 0.5 * (cols.length + 1);

  return (
    <ERPModal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={`เพิ่มหลายรายการ — ${title}`}
      description="กรอกหลายแถวรวดเดียว หรือคัดลอกจาก Excel มาวางก็ได้ · ช่องเชื่อมโยงใส่ชื่อหรือรหัสก็จับคู่ให้เอง"
      size="xl"
      resizable
      storageKey={`inline-create-${apiPath}`}
      hasUnsavedChanges={filled.length > 0}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-slate-500">
            กรอกแล้ว <b className="text-slate-700">{filled.length}</b> แถว จาก {rows.length}
            {rowCheck && filled.length > 0 && (
              badRows > 0
                ? <span className="ml-2 text-red-600">· ⚠ ยอดไม่ตรง <b>{badRows}</b> แถว</span>
                : <span className="ml-2 text-emerald-600">· ✓ ยอดตรงทุกแถว</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => { reset(); onClose(); }} disabled={saving}
              className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button onClick={save} disabled={saving || filled.length === 0 || badRows > 0}
              className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : `บันทึก ${filled.length} รายการ`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {err}</div>}

        {result && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${result.failed.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
            บันทึกสำเร็จ <b>{result.created}</b> รายการ
            {result.failed.length > 0 && (
              <>
                {" · "}ไม่สำเร็จ <b>{result.failed.length}</b> แถว
                <ul className="mt-1 space-y-0.5">
                  {result.failed.slice(0, 8).map((fr, i) => <li key={i}>• แถวที่ {fr.row}: {fr.error}</li>)}
                  {result.failed.length > 8 && <li>• … อีก {result.failed.length - 8} แถว</li>}
                </ul>
                <div className="mt-1 text-[11px]">แถวที่ไม่สำเร็จยังอยู่ในตาราง แก้แล้วกดบันทึกใหม่ได้</div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => addRows(1)} className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">➕ เพิ่มแถว</button>
          <button onClick={() => addRows(5)} className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">+5 แถว</button>
          <button onClick={() => setPasteOpen((v) => !v)}
            className={`h-8 px-3 text-xs rounded-lg border ${pasteOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            📋 วางจาก Excel
          </button>
          <button onClick={fillDownAll} disabled={!canFillAny}
            title="เอาค่าที่กรอกไว้แถวบนสุดของทุกคอลัมน์ ไปใส่ทุกแถวข้างล่าง"
            className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent">
            ⤓ เติมลงทุกช่อง
          </button>
          <span className="text-[11px] text-slate-400 ml-auto">แสดง {cols.length} คอลัมน์แรก · ช่องอื่นแก้ทีหลังในตารางได้</span>
        </div>

        {pasteOpen && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
            <div className="text-[11px] text-slate-600">
              คัดลอกจาก Excel แล้ววางที่นี่ · เรียงคอลัมน์ตามหัวตารางข้างล่าง:
              <b className="ml-1">{cols.map((c) => c.label).join(" · ")}</b>
              <span className="text-slate-400"> (มีหัวตารางติดมาก็ได้)</span>
            </div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <div className="flex items-center gap-2">
              <button onClick={applyPaste} disabled={!pasteText.trim()}
                className="h-8 px-3 text-xs font-medium rounded-lg border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                ใส่ลงตาราง
              </button>
              <button onClick={() => { setPasteOpen(false); setPasteText(""); }}
                className="h-8 px-3 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-white">ปิดแผงนี้</button>
            </div>
          </div>
        )}

        {/* กล่องเลื่อน "ตัวเดียว" คุมทั้งแนวนอน+แนวตั้ง — หัวตารางติดหนึบด้านบนตอนเลื่อนดูแถวล่าง
            (เดิมแยกเป็น 2 กล่องซ้อนกัน ทำให้มีแถบเลื่อนแนวนอน 2 ชั้น) */}
        <div className="border border-slate-200 rounded-lg overflow-auto max-h-[46vh]">
          <div style={{ minWidth: `${minWidthRem}rem` }}>
            <div className="grid gap-2 px-2 py-2 bg-slate-100 text-[11px] font-semibold text-slate-600 sticky top-0 z-10" style={{ gridTemplateColumns: gridCols }}>
              <span className="text-center">#</span>
              {cols.map((c) => (
                <span key={c.key} className="flex items-center gap-1 min-w-0">
                  <span className="truncate">{c.label}{c.required && <span className="text-red-500 ml-0.5">*</span>}</span>
                  {/* ⤓ เติมค่าจากแถวบนสุดลงทุกแถวข้างล่าง (flash fill) */}
                  <button type="button" onClick={() => fillDown(c.key)} disabled={!canFill(c.key)}
                    title="เติมค่าจากแถวบนสุดลงทุกแถวข้างล่าง"
                    className="shrink-0 w-5 h-5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400">⤓</button>
                </span>
              ))}
              {rowCheck && <span className="text-center" title="ตรวจว่ายอดตรงกันไหม">ตรวจ</span>}
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <div key={r.key} className="grid gap-2 px-2 py-1.5 items-start" style={{ gridTemplateColumns: gridCols }}>
                  <span className="text-[11px] text-slate-400 text-center pt-2">{i + 1}</span>
                  {cols.map((c, ci) => (
                    <div key={c.key} className="min-w-0"
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text/plain");
                        if (text && pasteAt(i, ci, text)) e.preventDefault();   // หลายค่า → วางลงตาราง
                      }}>
                      {renderCell(c, r)}
                    </div>
                  ))}
                  {rowCheck && (() => {
                    const c = checks.get(r.key);
                    return (
                      <div className="flex justify-center pt-1.5" title={c?.message ?? ""}>
                        {!c ? <span className="text-slate-200 text-xs">—</span>
                          : c.ok ? <span className="text-emerald-600 text-sm">✓</span>
                          : <span className="text-red-600 text-sm cursor-help">⚠</span>}
                      </div>
                    );
                  })()}
                  <div className="flex justify-center pt-1">
                    <button type="button" onClick={() => removeRow(r.key)} title="ลบแถวนี้"
                      className="w-6 h-6 rounded text-slate-300 hover:text-red-600 hover:bg-red-50">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          📋 คัดลอกคอลัมน์เดียวจาก Excel แล้วคลิกช่องแรกของคอลัมน์นั้น กด Ctrl+V → ค่าจะไหลลงทุกแถวให้เอง (แถวไม่พอระบบเพิ่มให้) ·
          ⤓ ที่หัวคอลัมน์ = เติมค่าจากแถวบนสุดลงทุกแถวข้างล่าง ·
          บันทึกผ่านช่องทางเดียวกับ “นำเข้าไฟล์” จึงมีรายงานรายแถวว่าแถวไหนเข้าไม่ได้เพราะอะไร
        </p>
      </div>
    </ERPModal>
  );
}
