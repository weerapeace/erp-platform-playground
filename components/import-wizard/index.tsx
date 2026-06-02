"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  parseImportFile, autoMapHeaders, validateRows,
  type ImportSchema, type ParsedFile, type ValidationError,
} from "@/lib/import";
import { apiFetch } from "@/lib/api";

// ---- Types ----

export type ImportResult = {
  total:    number;
  created:  number;
  updated:  number;
  failed:   { row: number; sku?: string; code?: string; error: string }[];
  audit_id: string;
};

export type ImportWizardProps = {
  schema:  ImportSchema;
  /** ปิด wizard / กลับไป list */
  onClose: () => void;
  /** หลัง commit สำเร็จ — refresh list */
  onDone?: () => void;
  actor?:  string;
  /** endpoint ที่ใช้ commit — default /api/admin/import (legacy). ของกลาง: /api/master-v2/<entity>/import */
  commitUrl?: string;
};

// ============================================================
// ImportWizard — 4 step
// ============================================================

export function ImportWizard({ schema, onClose, onDone, actor, commitUrl }: ImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file,      setFile]      = useState<File | null>(null);
  const [parsed,    setParsed]    = useState<ParsedFile | null>(null);
  const [mapping,   setMapping]   = useState<Record<string, string>>({});
  const [mode,      setMode]      = useState<"create" | "upsert">("create");
  const [parsing,   setParsing]   = useState(false);
  const [committing,setCommitting]= useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [dragging,  setDragging]  = useState(false);

  // ---- Step 1 → Step 2 ----
  const handleFile = async (f: File) => {
    setError(null); setParsing(true);
    try {
      const p = await parseImportFile(f);
      if (p.rows.length === 0) throw new Error("ไม่พบข้อมูลในไฟล์");
      setFile(f);
      setParsed(p);
      setMapping(autoMapHeaders(p.headers, schema.fields));
      setStep(2);
    } catch (err) { setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ"); }
    finally { setParsing(false); }
  };

  // ---- Step 3 validate ----
  const validation = useMemo(() => {
    if (!parsed || step < 3) return null;
    return validateRows(parsed.rows, schema, mapping);
  }, [parsed, mapping, schema, step]);

  const errorsByRow = useMemo(() => {
    const m: Record<number, ValidationError[]> = {};
    validation?.errors.forEach(e => { (m[e.row] ??= []).push(e); });
    return m;
  }, [validation]);

  // ---- Step 4 commit ----
  const commit = async () => {
    if (!validation || validation.errors.length > 0) { setError("แก้ error ก่อน import"); return; }
    setCommitting(true); setError(null);
    try {
      const res = await apiFetch(commitUrl ?? "/api/admin/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity:    schema.entityType,
          uniqueKey: schema.uniqueKey,
          rows:      validation.mappedRows,
          mode,
          actor,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json.data as ImportResult);
      setStep(4);
      onDone?.();
    } catch (err) { setError(err instanceof Error ? err.message : "import ล้มเหลว"); }
    finally { setCommitting(false); }
  };

  // ---- Download failed rows as CSV ----
  const downloadFailed = () => {
    if (!result || result.failed.length === 0) return;
    const headers = ["row", schema.uniqueKey ?? "sku", "error"];
    const rows = result.failed.map(f => [
      String(f.row),
      String((f.sku ?? f.code ?? "")),
      f.error,
    ]);
    const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    const csv = "﻿" + [headers, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `import-errors-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
      {/* Stepper */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs font-medium">
          {[
            { n: 1, label: "อัปโหลด" },
            { n: 2, label: "Map คอลัมน์" },
            { n: 3, label: "ตรวจสอบ" },
            { n: 4, label: "เสร็จสิ้น" },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              <div className={`flex items-center gap-1.5 ${step >= s.n ? "text-blue-700" : "text-slate-400"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step > s.n ? "bg-emerald-500 text-white"
                    : step === s.n ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}>{step > s.n ? "✓" : s.n}</div>
                <span>{s.label}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-px ${step > s.n ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </React.Fragment>
          ))}
        </div>
        <h2 className="text-base font-semibold text-slate-800 mt-2">
          Import {schema.label}
          {parsed && step >= 2 && <span className="ml-2 text-xs font-normal text-slate-400">· {parsed.rows.length} แถว</span>}
        </h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {/* ============ Step 1: Upload ============ */}
        {step === 1 && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-300 hover:bg-slate-50"
            }`}>
            <div className="text-4xl mb-3 opacity-40">📥</div>
            <p className="text-sm font-medium text-slate-700 mb-1">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
            <p className="text-xs text-slate-400 mb-4">รองรับ CSV, Excel (.xlsx, .xls)</p>
            <label className="inline-block h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700">
              {parsing ? "กำลังอ่าน..." : "เลือกไฟล์"}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            <details className="mt-6 text-left max-w-md mx-auto">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">📋 ดูคอลัมน์ที่รองรับ</summary>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                {schema.fields.map(f => (
                  <div key={f.key} className="flex gap-2">
                    <code className="font-mono text-slate-700 min-w-[100px]">{f.key}</code>
                    <span className="text-slate-500">{f.label}</span>
                    {f.required && <span className="text-red-500">*</span>}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* ============ Step 2: Mapping ============ */}
        {step === 2 && parsed && (
          <div>
            <p className="text-sm text-slate-600 mb-3">
              จับคู่คอลัมน์ในไฟล์ → field ของระบบ (auto-match แล้ว, แก้ได้)
            </p>
            <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Field</th>
                    <th className="text-left px-3 py-2 font-medium">CSV Column</th>
                    <th className="text-left px-3 py-2 font-medium">ตัวอย่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.fields.map(f => {
                    const csvCol = mapping[f.key];
                    const sample = csvCol ? parsed.rows[0]?.[csvCol] : "";
                    return (
                      <tr key={f.key} className="border-b border-slate-100 last:border-0 bg-white">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-800 flex items-center gap-1">
                            {f.label} {f.required && <span className="text-red-500">*</span>}
                          </div>
                          <code className="text-[10px] text-slate-400 font-mono">{f.key}</code>
                          <div className="text-[10px] text-slate-400">{f.type}</div>
                        </td>
                        <td className="px-3 py-2">
                          <select value={csvCol ?? ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                            className="w-full h-8 px-2 text-xs border border-slate-200 rounded bg-white">
                            <option value="">— ไม่จับคู่ —</option>
                            {parsed.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[200px]">
                          {sample || <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              💡 <strong>Mode:</strong>
              <label className="ml-3 mr-3"><input type="radio" name="mode" checked={mode==="create"} onChange={() => setMode("create")} className="mr-1" /> Create (ใหม่เท่านั้น, fail ถ้า {schema.uniqueKey} ซ้ำ)</label>
              <label><input type="radio" name="mode" checked={mode==="upsert"} onChange={() => setMode("upsert")} className="mr-1" /> Upsert (อัปเดตถ้า {schema.uniqueKey} ซ้ำ)</label>
            </div>
          </div>
        )}

        {/* ============ Step 3: Preview + validation ============ */}
        {step === 3 && parsed && validation && (
          <div>
            <div className="mb-3 flex items-center gap-3 text-sm">
              <span className="text-slate-600">📋 {parsed.rows.length} แถว</span>
              <span className={`text-${validation.errors.length === 0 ? "emerald" : "red"}-700 font-medium`}>
                {validation.errors.length === 0 ? "✓ ผ่านทั้งหมด" : `⚠ ${validation.errors.length} error`}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-1.5 text-left font-medium text-slate-500 w-10">#</th>
                      {schema.fields.filter(f => mapping[f.key]).map(f => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium text-slate-500 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, i) => {
                      const rowErrors = errorsByRow[i + 1] ?? [];
                      const hasError = rowErrors.length > 0;
                      return (
                        <tr key={i} className={`border-b border-slate-100 ${hasError ? "bg-red-50" : ""}`}>
                          <td className="px-2 py-1 text-slate-400 font-mono">{i + 1}</td>
                          {schema.fields.filter(f => mapping[f.key]).map(f => {
                            const csvCol = mapping[f.key];
                            const fieldErrors = rowErrors.filter(e => e.field === f.key);
                            return (
                              <td key={f.key} className={`px-2 py-1 ${fieldErrors.length > 0 ? "text-red-700 bg-red-100" : "text-slate-700"}`}
                                title={fieldErrors.map(e => e.message).join("\n")}>
                                {row[csvCol] || <span className="text-slate-300">—</span>}
                                {fieldErrors.length > 0 && <span className="ml-1 text-[10px]">⚠</span>}
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

            {validation.errors.length > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-red-700 hover:underline">ดู error ทั้งหมด ({validation.errors.length})</summary>
                <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                  {validation.errors.map((e, i) => (
                    <li key={i} className="text-red-700">
                      <span className="font-mono">แถว {e.row}</span> · <code className="text-red-900">{e.field}</code>: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* ============ Step 4: Result ============ */}
        {step === 4 && result && (
          <div>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Stat label="ทั้งหมด" value={result.total}   color="bg-slate-100 text-slate-700" />
              <Stat label="สร้างใหม่" value={result.created} color="bg-emerald-100 text-emerald-700" />
              <Stat label="อัปเดต"    value={result.updated} color="bg-blue-100 text-blue-700" />
              <Stat label="ล้มเหลว"   value={result.failed.length} color="bg-red-100 text-red-700" />
            </div>
            {result.failed.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-red-700">⚠ {result.failed.length} แถวที่ล้มเหลว</p>
                  <button onClick={downloadFailed}
                    className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
                    📥 Download CSV
                  </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5">แถว</th>
                        <th className="text-left px-3 py-1.5">{schema.uniqueKey ?? "key"}</th>
                        <th className="text-left px-3 py-1.5">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1 font-mono text-slate-500">{f.row}</td>
                          <td className="px-3 py-1 font-mono">{f.sku ?? f.code ?? "—"}</td>
                          <td className="px-3 py-1 text-red-700">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-emerald-50 rounded-lg">
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-emerald-800 font-semibold">Import สำเร็จทั้งหมด!</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
        {step > 1 && step < 4 && (
          <button onClick={() => setStep(s => (s - 1) as 1|2|3)} disabled={committing}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-white disabled:opacity-50">
            ← ย้อนกลับ
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onClose}
          className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-white">
          {step === 4 ? "ปิด" : "ยกเลิก"}
        </button>
        {step === 2 && (
          <button onClick={() => setStep(3)} disabled={Object.keys(mapping).length === 0}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            ตรวจสอบ →
          </button>
        )}
        {step === 3 && validation && (
          <button onClick={commit} disabled={validation.errors.length > 0 || committing}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {committing ? "กำลัง import..." : `Import ${validation.mappedRows.length} แถว →`}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`p-3 rounded-lg ${color} text-center`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}
