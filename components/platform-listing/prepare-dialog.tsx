"use client";

/**
 * 📤 เตรียมลงสินค้า (หลายตัว) — ป๊อปยืนยันของหน้า ลงสินค้าบนแพลตฟอร์ม
 * ตั้งกฎราคา + เลือกว่าจะทับร่างเดิมไหม → POST /api/product-platforms/prepare ทีละ 100 → สรุปผล
 * ไม่ส่งอะไรไปที่ร้าน (บันทึกร่าง + ตรวจความครบ)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput } from "@/components/form";
import { apiFetch } from "@/lib/api";
import { platformPrice, normalizePriceRule } from "@/lib/platform-listing-builder";

export type PrepareRow = { id: string; code: string; status: string };
type Summary = { created: number; updated: number; skipped_listed: number; failed: number; ready: number; not_ready: number };

export function PrepareListingDialog({ open, platform, rows, onClose, onDone }: {
  open: boolean;
  platform: { code: string; name_th: string } | null;
  rows: PrepareRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"same" | "pct">("same");
  const [pct, setPct] = useState("5");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setResult(null); setError(null); setProgress(0); } }, [open]);

  const listed = rows.filter((r) => r.status === "listed").length;
  const withDraft = rows.filter((r) => r.status === "ready" || r.status === "missing").length;
  const todo = rows.length - listed;
  const rule = useMemo(() => normalizePriceRule({ mode, pct: Number(pct) }), [mode, pct]);
  const pctOk = mode === "same" || (Number(pct) > 0 && Number(pct) <= 100);

  const run = async () => {
    if (!platform || !pctOk) return;
    setBusy(true); setError(null);
    const total: Summary = { created: 0, updated: 0, skipped_listed: 0, failed: 0, ready: 0, not_ready: 0 };
    const ids = rows.map((r) => r.id);
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const res = await apiFetch("/api/product-platforms/prepare", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform_code: platform.code, parent_sku_ids: ids.slice(i, i + 100), price_rule: rule, overwrite }),
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error);
        for (const k of Object.keys(total) as (keyof Summary)[]) total[k] += Number(j.summary?.[k] ?? 0);
        setProgress(Math.min(ids.length, i + 100));
      }
      setResult(total);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เตรียมลงสินค้าไม่สำเร็จ");
      if (total.created + total.updated > 0) { setResult(total); onDone(); }
    } finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !busy && onClose()} size="md" defaultExpanded={false} storageKey="platform-listing-prepare"
      title={`📤 เตรียมลงสินค้าบน ${platform?.name_th ?? ""}`}
      description="ระบบเติมชื่อ รายละเอียด หมวด รูป และแบรนด์จาก ERP แล้วบันทึกเป็นร่าง พร้อมตรวจความครบ — ยังไม่ส่งอะไรไปที่ร้าน"
      footer={result ? (
        <button onClick={onClose} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">ปิด</button>
      ) : (
        <>
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={run} disabled={busy || todo === 0 || !pctOk}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {busy ? `กำลังเตรียม ${progress}/${rows.length}...` : `เตรียมลงสินค้า ${todo.toLocaleString()} รายการ`}
          </button>
        </>
      )}>
      {result ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800">
            บันทึกร่างแล้ว {(result.created + result.updated).toLocaleString()} รายการ (ใหม่ {result.created} · เติมร่างเดิม {result.updated})
          </div>
          <ul className="space-y-1 text-slate-600">
            <li>✓ พร้อมลง <b className="text-emerald-700">{result.ready}</b> รายการ</li>
            <li>✗ ยังขาดข้อมูล <b className="text-rose-700">{result.not_ready}</b> รายการ — ดูคอลัมน์ "ยังขาด" ในตาราง</li>
            {result.skipped_listed > 0 && <li>ข้ามที่ลงบนร้านแล้ว {result.skipped_listed} รายการ</li>}
            {result.failed > 0 && <li className="text-rose-700">ไม่สำเร็จ {result.failed} รายการ — ลองใหม่อีกครั้ง</li>}
          </ul>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700">
            เลือกไว้ <b>{rows.length.toLocaleString()}</b> รายการ
            {listed > 0 && <> · ข้ามที่ลงแล้ว {listed}</>}
            {withDraft > 0 && <> · มีร่างอยู่แล้ว {withDraft}</>}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-600 mb-1">ราคาบน {platform?.name_th ?? "ร้าน"}</legend>
            <label className="flex items-center gap-2 text-sm min-h-[40px]">
              <input type="radio" name="prep-rule" checked={mode === "same"} onChange={() => setMode("same")} className="w-4 h-4" />
              เท่ากับราคาขายใน ERP
            </label>
            <label className="flex items-center gap-2 text-sm min-h-[40px] flex-wrap">
              <input type="radio" name="prep-rule" checked={mode === "pct"} onChange={() => setMode("pct")} className="w-4 h-4" />
              บวกเพิ่มจากราคา ERP
              <span className="w-20"><ERPInput type="number" min={1} max={100} step={1} value={pct} onChange={(e) => { setPct(e.target.value); setMode("pct"); }} error={!pctOk} aria-label="เปอร์เซ็นต์ที่บวกเพิ่ม" /></span>
              %
            </label>
            <p className="text-xs text-slate-500">ตัวอย่าง: ราคา ERP 75 บาท → บนร้าน <b>{platformPrice(75, rule).toLocaleString("th-TH")} บาท</b> (ปัดขึ้นเป็นบาทเต็ม)</p>
          </fieldset>
          <ERPFormField label="ร่างที่มีอยู่แล้ว" hint="ไม่ติ๊ก = เติมเฉพาะช่องที่ยังว่าง (ไม่ทับที่แก้เองไว้) · ติ๊ก = ทับชื่อ รายละเอียด หมวด รูป ด้วยค่าจาก ERP">
            <label className="flex items-center gap-2 text-sm min-h-[40px]">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="w-4 h-4" />
              ทับข้อมูลร่างเดิมด้วยค่าจาก ERP
            </label>
          </ERPFormField>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
      )}
    </ERPModal>
  );
}
