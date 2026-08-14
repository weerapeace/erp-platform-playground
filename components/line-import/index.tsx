"use client";

/**
 * ของกลาง — "ลงรายการสินค้าแบบตาราง" (โหลดแม่แบบ → กรอกใน Excel → โยนกลับเข้าระบบ)
 *
 * ใช้กับเอกสารที่มีรายการสินค้าได้ทุกชนิด (ใบขาย / ใบสั่งซื้อ / ใบเสนอราคา)
 * เพราะคืนค่าเป็น "แถวข้อมูล" กลับให้หน้าที่เรียก ไม่ได้บันทึกลงฐานข้อมูลเอง
 *
 * เข้าได้ 3 ทาง:
 *   1. ⬇ ดาวน์โหลดแม่แบบ .xlsx (มีหัวคอลัมน์ + ตัวอย่าง 1 แถว)
 *   2. 📋 วางจาก Excel — คัดลอกจากชีตแล้ววางในช่อง (เร็วสุด ไม่ต้องเซฟไฟล์)
 *   3. 📎 อัปโหลดไฟล์ .xlsx / .csv
 *
 * จับคู่รหัสสินค้ากับของจริงให้อัตโนมัติ (POST /api/skus/lookup) แล้วโชว์ว่าแถวไหนไม่เจอ
 * ⚠️ xlsx เป็นไลบรารีหนัก — โหลดเฉพาะตอนใช้ (dynamic import) ไม่ถ่วงหน้าอื่น
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { parsePastedTable, parseNumberCell } from "@/lib/paste-table";
import type { SkuLookupHit } from "@/app/api/skus/lookup/route";

/** แถวที่คืนกลับให้หน้าที่เรียก */
export type ImportedLine = {
  sku: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  discount_value: number;
  note: string;
  /** จับคู่กับสินค้าจริงได้ไหม (ไม่เจอ = ยังเพิ่มได้ แต่เป็นรายการอิสระ) */
  matched: boolean;
};

const HEADERS = ["รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย", "ส่วนลด(%)", "หมายเหตุ"] as const;
const SAMPLE = ["CTL110-02", "(เว้นว่างได้ ระบบดึงชื่อจากรหัสให้)", "10", "ชิ้น", "165", "0", ""];

// อ่านตัวเลข + แยกตารางที่วางมา — ใช้ของกลาง lib/paste-table (เดิมเขียนซ้ำในไฟล์นี้)
const num = (v: unknown) => parseNumberCell(v);
const txt = (v: unknown) => String(v ?? "").trim();

/** แถวหัวตาราง? (กันผู้ใช้วางทั้งตารางรวมหัวมา) */
const looksLikeHeader = (row: string[]) =>
  /รหัส|sku|code/i.test(row[0] ?? "") || /ชื่อสินค้า|name|description/i.test(row[1] ?? "");

const parsePasted = parsePastedTable;

export function LineImportModal({ open, onClose, onConfirm, title = "ลงรายการแบบตาราง" }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: ImportedLine[]) => void;
  title?: string;
}) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ImportedLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** แปลงตาราง 2 มิติ → แถวข้อมูล + จับคู่รหัสสินค้ากับของจริง */
  const buildRows = useCallback(async (grid: string[][]) => {
    const body = grid.length && looksLikeHeader(grid[0]) ? grid.slice(1) : grid;
    if (body.length === 0) { setErr("ไม่พบข้อมูลในตาราง"); setRows([]); return; }

    const draft = body.map((c) => ({
      sku: txt(c[0]), name: txt(c[1]), qty: num(c[2]) || 1, unit: txt(c[3]),
      price: num(c[4]), disc: num(c[5]), note: txt(c[6]),
    }));

    // จับคู่รหัสสินค้าทีเดียวทั้งชุด (ไม่ยิงทีละแถว)
    const codes = draft.map((d) => d.sku).filter(Boolean);
    let hits: Record<string, SkuLookupHit | null> = {};
    if (codes.length) {
      try {
        const r = await apiFetch("/api/skus/lookup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes }),
        });
        const j = (await r.json()) as { data?: Record<string, SkuLookupHit | null> };
        hits = j.data ?? {};
      } catch { /* จับคู่ไม่ได้ = ยังเพิ่มเป็นรายการอิสระได้ */ }
    }

    setRows(draft.map((d) => {
      const hit = d.sku ? hits[d.sku] ?? null : null;
      return {
        sku: d.sku,
        product_id: hit?.id ?? null,
        // ชื่อ: ที่กรอกมาก่อน → ชื่อจริงจากรหัส → รหัส
        product_name: d.name || hit?.name || d.sku,
        qty: d.qty,
        unit: d.unit || hit?.uom || "ชิ้น",
        unit_price: d.price || hit?.price || 0,
        discount_value: d.disc,
        note: d.note,
        matched: !!hit,
      };
    }));
    setErr(null);
  }, []);

  const handlePaste = useCallback(async () => {
    if (!raw.trim()) { setErr("ยังไม่ได้วางข้อมูล"); return; }
    setBusy(true);
    try { await buildRows(parsePasted(raw)); }
    finally { setBusy(false); }
  }, [raw, buildRows]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
      await buildRows(grid.map((r) => (r ?? []).map((c) => String(c ?? "").trim())));
    } catch {
      setErr("อ่านไฟล์ไม่ได้ — รองรับ .xlsx และ .csv");
    } finally { setBusy(false); }
  }, [buildRows]);

  const downloadTemplate = useCallback(async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([[...HEADERS], SAMPLE]);
    ws["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายการสินค้า");
    XLSX.writeFile(wb, "แม่แบบรายการสินค้า.xlsx");
  }, []);

  const stat = useMemo(() => ({
    total: rows.length,
    matched: rows.filter((r) => r.matched).length,
    unmatched: rows.filter((r) => !r.matched && r.sku).length,
    noSku: rows.filter((r) => !r.sku).length,
  }), [rows]);

  const inp = "h-8 px-2 text-sm border border-slate-200 rounded";

  return (
    <ERPModal
      open={open} onClose={onClose} size="lg" title={`📋 ${title}`}
      description="โหลดแม่แบบไปกรอกใน Excel แล้วโยนกลับเข้ามา หรือคัดลอกจากชีตมาวางตรงนี้ได้เลย"
      hasUnsavedChanges={rows.length > 0}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-sm text-slate-600">
            {rows.length > 0 && (
              <>
                {stat.total} รายการ
                {stat.matched > 0 && <span className="text-emerald-600"> · จับคู่สินค้าได้ {stat.matched}</span>}
                {stat.unmatched > 0 && <span className="text-amber-600"> · ไม่พบรหัส {stat.unmatched}</span>}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm">ยกเลิก</button>
            <button onClick={() => { onConfirm(rows); setRows([]); setRaw(""); }} disabled={rows.length === 0}
              className="h-9 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40">
              เพิ่ม {rows.length || ""} รายการเข้าใบ
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void downloadTemplate()}
            className="h-9 px-3 text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-medium">
            ⬇ ดาวน์โหลดแม่แบบ Excel
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white text-slate-700">
            📎 อัปโหลดไฟล์ (.xlsx / .csv)
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden
            onChange={(e) => void handleFile(e.target.files?.[0])} />
          {busy && <span className="text-sm text-slate-500">กำลังอ่านข้อมูล…</span>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            หรือคัดลอกจาก Excel มาวางตรงนี้ (เลือกทั้งตารางแล้ว Ctrl+C → Ctrl+V)
          </label>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4}
            onPaste={() => setTimeout(() => void handlePaste(), 0)}
            placeholder={`${HEADERS.join("\t")}\nCTL110-02\tกระเป๋าผ้า\t10\tชิ้น\t165\t0`}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg" />
          <div className="flex items-center gap-2 mt-1.5">
            <button type="button" onClick={() => void handlePaste()} disabled={busy || !raw.trim()}
              className="h-8 px-3 text-xs rounded-md bg-slate-800 text-white disabled:opacity-40">อ่านข้อมูลที่วาง</button>
            <span className="text-[11px] text-slate-400">ลำดับคอลัมน์: {HEADERS.join(" · ")}</span>
          </div>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">⚠️ {err}</div>}

        {rows.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
              <span>ตรวจก่อนเพิ่ม — แก้ในตารางนี้ได้</span>
              <button type="button" onClick={() => { setRows([]); setRaw(""); }} className="text-slate-400 hover:text-rose-600">ล้างทั้งหมด</button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0">
                  <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="px-2 py-1.5 text-left w-32">รหัส</th>
                    <th className="px-2 py-1.5 text-left">ชื่อสินค้า</th>
                    <th className="px-2 py-1.5 text-right w-20">จำนวน</th>
                    <th className="px-2 py-1.5 text-left w-20">หน่วย</th>
                    <th className="px-2 py-1.5 text-right w-24">ราคา</th>
                    <th className="px-2 py-1.5 text-right w-20">ส่วนลด%</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r, i) => {
                    const set = (p: Partial<ImportedLine>) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, ...p } : x)));
                    return (
                      <tr key={i} className={r.sku && !r.matched ? "bg-amber-50/50" : ""}>
                        <td className="px-2 py-1">
                          <div className="font-mono text-xs">{r.sku || <span className="text-slate-300">—</span>}</div>
                          {r.sku && !r.matched && <div className="text-[10px] text-amber-600">ไม่พบในระบบ</div>}
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.product_name} onChange={(e) => set({ product_name: e.target.value })} className={inp + " w-full"} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" value={r.qty} onChange={(e) => set({ qty: num(e.target.value) })} className={inp + " w-full text-right"} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.unit} onChange={(e) => set({ unit: e.target.value })} className={inp + " w-full"} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" value={r.unit_price} onChange={(e) => set({ unit_price: num(e.target.value) })} className={inp + " w-full text-right"} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="any" value={r.discount_value} onChange={(e) => set({ discount_value: num(e.target.value) })} className={inp + " w-full text-right"} />
                        </td>
                        <td className="px-1 py-1">
                          <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                            className="text-slate-300 hover:text-rose-600">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stat.unmatched > 0 && (
              <div className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-200">
                มี {stat.unmatched} แถวที่หารหัสสินค้าไม่เจอ — ยังเพิ่มเข้าใบได้ (เป็นรายการอิสระ ไม่ผูกสินค้าจริง)
                แต่จะไม่ตัดสต๊อกให้ · ตรวจว่าพิมพ์รหัสถูกไหม
              </div>
            )}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
