"use client";

/**
 * PriceFillInput — ของกลาง: ช่องใส่ "ราคาต่อหน่วย" พร้อมเตือนเมื่อยังไม่มีราคา
 *
 * ใช้ที่ไหนก็ได้ที่ต้องเติมราคาย้อนกลับ (ปฏิทินจัดซื้อ, การ์ดสั่งซื้อ, ใบรับของ ฯลฯ)
 *  - ยังไม่มีราคา → ป้ายเตือนสีเหลือง "ยังไม่มีราคา" + ช่องกรอก + ปุ่มบันทึก
 *  - มีราคาแล้ว   → โชว์ราคา (+ ยอดรวมถ้าส่ง qty) + ปุ่ม ✎ แก้
 * ผู้เรียกส่ง onSave(price) มาเอง → จะบันทึกเข้าที่ไหนก็ได้ (เช่น /api/purchasing/po-line-price
 * ที่อัปเดตบรรทัด PO + ตารางราคาหลายร้านกลาง supplier_items ให้พร้อมกัน)
 */
import { useState } from "react";

const CUR = (c?: string | null) => (["RMB", "YUAN", "CNY"].includes(String(c ?? "").toUpperCase()) ? "¥" : "฿");
const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function PriceFillInput({
  value, currency, qty, onSave, disabled, compact = true, warnText = "ยังไม่มีราคา",
}: {
  value: number;                                  // ราคาต่อหน่วยปัจจุบัน (0 = ยังไม่มี)
  currency?: string | null;
  qty?: number;                                   // ถ้าส่งมา จะโชว์ยอดรวม = ราคา × จำนวน
  onSave: (price: number) => Promise<void> | void;
  disabled?: boolean;
  compact?: boolean;
  warnText?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sym = CUR(currency);

  const submit = async () => {
    const p = Number(draft);
    if (!isFinite(p) || p <= 0) { setErr("ใส่ราคามากกว่า 0"); return; }
    setSaving(true); setErr(null);
    try { await onSave(p); setEditing(false); setDraft(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus type="number" step="any" min={0} value={draft} disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } if (e.key === "Escape") { setEditing(false); setErr(null); } }}
          placeholder={`ราคา/หน่วย (${sym})`}
          className={`h-7 ${compact ? "w-24" : "w-32"} px-2 text-sm text-right border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400`} />
        <button type="button" onClick={() => void submit()} disabled={saving}
          className="h-7 px-2 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "…" : "บันทึก"}
        </button>
        <button type="button" onClick={() => { setEditing(false); setErr(null); }} disabled={saving}
          className="h-7 px-1.5 text-xs text-slate-400 hover:text-slate-600">✕</button>
        {err && <span className="text-[10px] text-red-600">{err}</span>}
      </span>
    );
  }

  if (!(value > 0)) {
    return (
      <button type="button" onClick={() => { setDraft(""); setEditing(true); }} disabled={disabled}
        title="ใส่ราคา — จะบันทึกเข้าใบสั่งซื้อ + ตารางราคาของร้านนี้ให้ด้วย"
        className="inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50">
        ⚠ {warnText} · ใส่ราคา
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-sm tabular-nums text-slate-700">
        {sym}{fmt(qty && qty > 0 ? value * qty : value)}
        {qty && qty > 0 ? <span className="text-[10px] text-slate-400 ml-1">({sym}{fmt(value)}/หน่วย)</span> : null}
      </span>
      <button type="button" onClick={() => { setDraft(String(value)); setEditing(true); }} disabled={disabled}
        title="แก้ราคา" className="text-slate-300 hover:text-slate-600 text-xs">✎</button>
    </span>
  );
}
