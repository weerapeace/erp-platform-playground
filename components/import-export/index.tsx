"use client";

import React, { useState, useRef } from "react";
import { ERPModal } from "@/components/modal";

// ============================================================
// ImportDialog — นำเข้าข้อมูลจาก CSV (component กลาง)
// ใช้ได้ทุก module ผ่าน field config + onImport callback
// ============================================================

export type ImportField = {
  key:       string;
  label:     string;
  required?: boolean;
  /** แปลงค่าก่อนส่ง (เช่น string → number) */
  transform?: (raw: string) => unknown;
};

export type ImportResult = { success: number; failed: { row: number; error: string }[] };

type Step = "upload" | "mapping" | "result";

// ---- CSV parser (รองรับ quoted fields + comma/newline ในเครื่องหมายคำพูด) ----
function parseCsv(text: string): string[][] {
  // ตัด BOM
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

export function ImportDialog<T extends Record<string, unknown>>({
  open, onClose, title = "นำเข้าข้อมูลจาก CSV",
  fields, onImport, onDone,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  fields: ImportField[];
  /** สร้าง record จริง — return error string ถ้าล้มเหลว, null ถ้าสำเร็จ */
  onImport: (record: T) => Promise<string | null>;
  /** เรียกหลัง import เสร็จ (เพื่อ refresh list) */
  onDone?: () => void;
}) {
  const [step,    setStep]    = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows,    setRows]    = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // fieldKey → csvHeader
  const [importing, setImporting] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [dragging,  setDragging]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload"); setHeaders([]); setRows([]); setMapping({});
    setImporting(false); setProgress(0); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => { reset(); onClose(); };

  // ---- Upload + parse ----
  const handleFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      alert("กรุณาเลือกไฟล์ .csv เท่านั้น");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { alert("ไฟล์ว่างหรือมีแค่หัวตาราง"); return; }
    const hdrs = parsed[0].map(h => h.trim());
    setHeaders(hdrs);
    setRows(parsed.slice(1));
    // auto-map: จับคู่ field กับ header ที่ชื่อตรง/ใกล้เคียง
    const autoMap: Record<string, string> = {};
    fields.forEach(f => {
      const match = hdrs.find(h => h === f.label || h === f.key || h.toLowerCase() === f.key.toLowerCase());
      if (match) autoMap[f.key] = match;
    });
    setMapping(autoMap);
    setStep("mapping");
  };

  // ---- Validate ----
  const missingRequired = fields.filter(f => f.required && !mapping[f.key]);

  // ---- Run import ----
  const runImport = async () => {
    setImporting(true);
    const res: ImportResult = { success: 0, failed: [] };
    for (let i = 0; i < rows.length; i++) {
      const csvRow = rows[i];
      const record: Record<string, unknown> = {};
      let rowError: string | null = null;
      for (const f of fields) {
        const csvHeader = mapping[f.key];
        if (!csvHeader) continue;
        const colIdx = headers.indexOf(csvHeader);
        const raw = (csvRow[colIdx] ?? "").trim();
        if (f.required && !raw) { rowError = `ขาดข้อมูล "${f.label}"`; break; }
        record[f.key] = f.transform ? f.transform(raw) : raw;
      }
      if (rowError) { res.failed.push({ row: i + 2, error: rowError }); }
      else {
        try {
          const err = await onImport(record as T);
          if (err) res.failed.push({ row: i + 2, error: err });
          else res.success++;
        } catch (e: unknown) {
          res.failed.push({ row: i + 2, error: e instanceof Error ? e.message : "ผิดพลาด" });
        }
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setResult(res);
    setStep("result");
    setImporting(false);
    onDone?.();
  };

  return (
    <ERPModal open={open} onClose={handleClose} title={title} size="lg"
      footer={
        step === "mapping" ? (
          <>
            <button onClick={() => setStep("upload")} disabled={importing} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ย้อนกลับ</button>
            <button onClick={runImport} disabled={importing || missingRequired.length > 0}
              className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {importing ? `กำลังนำเข้า ${progress}%` : `นำเข้า ${rows.length} รายการ`}
            </button>
          </>
        ) : step === "result" ? (
          <button onClick={handleClose} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">เสร็จสิ้น</button>
        ) : undefined
      }
    >
      {/* STEP 1: Upload */}
      {step === "upload" && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
            }`}
          >
            <div className="text-4xl mb-2">{dragging ? "📥" : "📄"}</div>
            <p className="text-sm text-slate-600 mb-1">
              {dragging ? "วางไฟล์ที่นี่เลย" : "ลากไฟล์ CSV มาวาง หรือคลิกเพื่อเลือก"}
            </p>
            <p className="text-xs text-slate-400 mb-4">ไฟล์ต้องมีหัวตาราง (header) ในแถวแรก</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="hidden" />
            <span className="inline-block h-9 px-4 leading-9 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 pointer-events-none">
              เลือกไฟล์ CSV
            </span>
          </div>
          <div className="mt-4 bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-600 mb-2">คอลัมน์ที่รองรับ:</p>
            <div className="flex flex-wrap gap-1.5">
              {fields.map(f => (
                <span key={f.key} className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                  {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">* = จำเป็นต้องมี</p>
          </div>
        </div>
      )}

      {/* STEP 2: Mapping + preview */}
      {step === "mapping" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700">
            พบ <b>{rows.length}</b> แถวข้อมูล — จับคู่คอลัมน์ในไฟล์กับ field ของระบบ
          </div>

          {/* Field mapping */}
          <div className="space-y-2">
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-32 shrink-0">
                  {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                <span className="text-slate-300">←</span>
                <select value={mapping[f.key] ?? ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                  className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— ไม่นำเข้า —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              ⚠️ ยังไม่ได้จับคู่ field จำเป็น: {missingRequired.map(f => f.label).join(", ")}
            </div>
          )}

          {/* Preview 5 แถวแรก */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">ตัวอย่าง 5 แถวแรก</p>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>{fields.filter(f => mapping[f.key]).map(f => <th key={f.key} className="px-2 py-1.5 text-left text-slate-500">{f.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {fields.filter(f => mapping[f.key]).map(f => {
                        const idx = headers.indexOf(mapping[f.key]);
                        return <td key={f.key} className="px-2 py-1.5 text-slate-700 truncate max-w-[140px]">{r[idx] ?? ""}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {importing && (
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-emerald-700">{result.success}</p>
              <p className="text-xs text-emerald-600 mt-1">นำเข้าสำเร็จ</p>
            </div>
            <div className={`rounded-xl p-4 text-center border ${result.failed.length > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-3xl font-bold ${result.failed.length > 0 ? "text-red-600" : "text-slate-400"}`}>{result.failed.length}</p>
              <p className="text-xs text-slate-500 mt-1">ล้มเหลว</p>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">รายการที่ล้มเหลว</p>
              <div className="border border-red-100 rounded-lg max-h-48 overflow-y-auto divide-y divide-red-50">
                {result.failed.map((f, i) => (
                  <div key={i} className="px-3 py-1.5 text-xs flex gap-2">
                    <span className="text-slate-400 shrink-0">แถว {f.row}</span>
                    <span className="text-red-600">{f.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}
