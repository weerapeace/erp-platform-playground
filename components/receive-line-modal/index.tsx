"use client";

/**
 * ของกลาง — รับของเข้าทีละบรรทัดใบสั่งซื้อ (2 ชิ้น)
 *
 * 1) <ReceiveLineFields> = ช่องกรอกของบรรทัดเดียว: รับครั้งนี้ / เสีย-ผิด (ปุ่ม −/+) · ปุ่ม "รับครบ" · เตือนรับเกิน
 *    · รับไม่ครบ → เลือก "รอรับเพิ่ม" / "ปิดบิล" · แผงใบงานที่รอวัตถุดิบนี้ (MaterialDemandPanel แบ่งเข้าใบงานได้)
 *    ควบคุมจากข้างนอก (value/onChange) → หน้ารับของ (/purchasing/receive) ผูกกับตะกร้ารับหลายรายการ (pendInputs) ได้
 *
 * 2) <ReceiveLineModal> = ป๊อปรับของจบในตัว: ReceiveLineFields + วันที่รับ · ผู้รับ · คลัง (WH-RAW) · แนบใบรับของ + บิล (บังคับ)
 *    → บันทึกผ่าน API กลาง /api/purchasing/receive ตัวเดียวกับหน้ารับของ
 *    (ออกเลขใบรับ GR · สถานะบรรทัด/ใบ PO · บวกสต๊อกของดี · audit · แจ้งไลน์ — เหมือนกันเอง · API ก็บังคับแนบ ยกเว้นสแกน QR)
 *
 *   <ReceiveLineModal line={{ po_id, po_no, po_line_id, name, code, uom, qty, qty_received }} onClose onSaved />
 *
 * ใช้ที่: ReceiveLineFields → ป๊อปรายบรรทัดหน้ารับของ · ReceiveLineModal → การ์ดวัตถุดิบ แท็บใบสั่งผลิต (/purchasing)
 * สูตรเคสเดียวกันทุกที่: รับ ≥ คงเหลือ = full · รับไม่ครบ + ปิดบิล = partial_close · รับไม่ครบ = partial_wait (receiveCaseType)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { FileInput } from "@/components/file-input";
import { WarehousePicker, type WarehousePickerValue } from "@/components/pickers";
import { MaterialDemandPanel } from "@/components/material-demand-panel";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export type ReceiveLine = {
  po_id: string; po_no: string; po_line_id: string; seller_name?: string | null;
  name: string; code: string | null; uom: string; qty: number; qty_received: number; qty_defective?: number;
};
/** ค่าที่กรอกต่อบรรทัด (เก็บเป็นข้อความตามช่องกรอก) · close=true → ปิดบิล (จบยอดที่ขาด) */
export type ReceiveInput = { recv: string; def: string; close?: boolean };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
const step = (v: string, d: number) => String(Math.max(0, Math.round((num(v) + d) * 100) / 100));
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 3 });
/** วันนี้ตามเวลาเครื่อง (ไม่ใช้ toISOString — เวลาไทยตอนเช้ามืดจะได้วันของเมื่อวาน) */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** เคสการรับ (ส่งให้ /api/purchasing/receive) — สูตรเดียวทุกหน้า */
export function receiveCaseType(recv: number, remaining: number, close?: boolean): "full" | "partial_close" | "partial_wait" {
  return recv >= remaining ? "full" : close ? "partial_close" : "partial_wait";
}

export function ReceiveLineFields({ remaining, uom, code, poLineId, poNo, value, onChange, autoFocus }: {
  /** คงเหลือรอรับของบรรทัดนี้ */
  remaining: number; uom: string; code: string | null;
  poLineId: string; poNo: string;
  value: ReceiveInput;
  onChange: (patch: Partial<ReceiveInput>) => void;
  autoFocus?: boolean;
}) {
  const recv = num(value.recv);
  const short = recv > 0 && recv < remaining;
  const over = recv > remaining;
  const stepBtn = "w-9 h-11 flex items-center justify-center text-xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 active:scale-95 shrink-0";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">รับครั้งนี้ ({uom})</label>
          {/* ปุ่ม −/+ ตัวใหญ่ + แป้นตัวเลข (กดง่ายบนมือถือ ไม่ต้องพิมพ์) */}
          <div className="flex items-stretch gap-1.5">
            <button type="button" aria-label="ลด" onClick={() => onChange({ recv: step(value.recv, -1) })} className={stepBtn}>−</button>
            <input type="number" inputMode="decimal" step="any" min={0} autoFocus={autoFocus} value={value.recv} onChange={(e) => onChange({ recv: e.target.value })} onFocus={(e) => e.target.select()}
              className={`flex-1 min-w-0 h-11 px-2 text-lg text-center border rounded-md ${short || over ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
            <button type="button" aria-label="เพิ่ม" onClick={() => onChange({ recv: step(value.recv, 1) })} className={stepBtn}>+</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">เสีย / ผิด ({uom})</label>
          <div className="flex items-stretch gap-1.5">
            <button type="button" aria-label="ลด" onClick={() => onChange({ def: step(value.def, -1) })} className={stepBtn}>−</button>
            <input type="number" inputMode="decimal" step="any" min={0} value={value.def} onChange={(e) => onChange({ def: e.target.value })} onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 h-11 px-2 text-lg text-center border border-slate-200 rounded-md" />
            <button type="button" aria-label="เพิ่ม" onClick={() => onChange({ def: step(value.def, 1) })} className={stepBtn}>+</button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button type="button" onClick={() => onChange({ recv: String(remaining) })} className="h-8 px-3 text-xs font-medium rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">รับครบ ({remaining.toLocaleString()})</button>
        {over && <span className="text-[11px] text-amber-600">⚠ รับเกินจำนวนคงเหลือ</span>}
      </div>
      {short && (
        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
          <div className="text-xs font-medium text-amber-800 mb-2">รับไม่ครบ (ขาด {(remaining - recv).toLocaleString()} {uom}) — จะจัดการส่วนที่ขาดอย่างไร?</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onChange({ close: false })} className={`text-left px-3 py-2 rounded-lg border text-xs ${!value.close ? "border-amber-400 bg-white ring-1 ring-amber-200" : "border-slate-200 bg-white hover:border-amber-300"}`}>
              <div className="font-medium text-slate-800">🟡 รอรับเพิ่ม</div><div className="text-[11px] text-slate-500 mt-0.5">ส่วนที่เหลือยังค้างรับต่อ</div>
            </button>
            <button type="button" onClick={() => onChange({ close: true })} className={`text-left px-3 py-2 rounded-lg border text-xs ${value.close ? "border-orange-400 bg-white ring-1 ring-orange-200" : "border-slate-200 bg-white hover:border-orange-300"}`}>
              <div className="font-medium text-slate-800">🔴 ปิดบิล (จบยอด)</div><div className="text-[11px] text-slate-500 mt-0.5">ไม่รอของที่ขาดแล้ว</div>
            </button>
          </div>
        </div>
      )}
      {/* ของกลาง: ใบงานที่รอวัตถุดิบนี้ · พอไหม · แบ่งเข้าใบงาน (เฟส 2) · ไม่พอกดขอซื้อ */}
      <MaterialDemandPanel code={code} uom={uom} incomingQty={recv}
        allocatable refType="po_line" refId={poLineId} refLabel={poNo} />
    </>
  );
}

export function ReceiveLineModal({ line, onClose, onSaved }: { line: ReceiveLine; onClose: () => void; onSaved: (grNo: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const remaining = Math.max(0, line.qty - line.qty_received);
  const [inp, setInp] = useState<ReceiveInput>({ recv: String(remaining), def: "0" });
  const [date, setDate] = useState(today);
  const [receiver, setReceiver] = useState("");
  const [wh, setWh] = useState<WarehousePickerValue | null>(null);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [billKey, setBillKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (user?.name) setReceiver((r) => r || user.name); }, [user?.name]);
  // คลังเริ่มต้น = โซนวัตถุดิบ (WH-RAW) เหมือนหน้ารับของ
  useEffect(() => {
    apiFetch("/api/master/warehouses?limit=50").then((r) => r.json())
      .then((j) => { const m = ((j.data ?? []) as WarehousePickerValue[]).find((w) => w.code === "WH-RAW"); if (m) setWh((cur) => cur ?? m); })
      .catch(() => { /* ไม่มี = API ใช้ WH-RAW ให้เอง */ });
  }, []);

  const save = async () => {
    setErr(null);
    const recv = num(inp.recv), def = num(inp.def);
    if (!(recv > 0) && !(def > 0)) { setErr("ใส่จำนวนที่รับก่อน"); return; }
    if (!receiptKey || !billKey) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/purchasing/receive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: line.po_id, warehouse_id: wh?.id ?? null, receive_date: date, receiver: receiver.trim() || user?.name,
          lines: [{ po_line_id: line.po_line_id, qty_received: recv, qty_defective: def, case_type: receiveCaseType(recv, remaining, inp.close) }],
          receipt_doc_r2_key: receiptKey, bill_doc_r2_key: billKey,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { gr_no?: string; stock_warnings?: string[]; error?: string };
      if (!res.ok || j.error) { setErr(j.error ?? "บันทึกรับของไม่สำเร็จ"); return; }
      toast.success(`รับของแล้ว · ${j.gr_no ?? ""}`);
      if (j.stock_warnings?.length) toast.warning(`บันทึกรับแล้ว แต่ยังไม่บวกสต๊อก: ${j.stock_warnings.join(" · ")}`);
      onSaved(String(j.gr_no ?? ""));
    } catch { setErr("บันทึกรับของไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" storageKey="receive-line" title={`รับของเข้า · ${line.po_no}`}
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving || remaining <= 0} title={!receiptKey || !billKey ? "แนบใบรับของ + บิลก่อน" : undefined}
          className="px-5 h-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึกรับสินค้า"}</button>
      </>}>
      <div className="text-sm font-medium text-slate-800">{line.name}</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {line.seller_name ? `${line.seller_name} · ` : ""}สั่ง {fmt(line.qty)} · รับแล้ว {fmt(line.qty_received)}{line.qty_defective ? ` · เสีย ${fmt(line.qty_defective)}` : ""} · คงเหลือ <b className="text-slate-700">{fmt(remaining)}</b> {line.uom}
      </div>
      {remaining <= 0 && <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">รายการนี้รับครบแล้ว</div>}

      <ReceiveLineFields remaining={remaining} uom={line.uom} code={line.code} poLineId={line.po_line_id} poNo={line.po_no}
        value={inp} onChange={(p) => { setInp((v) => ({ ...v, ...p })); setErr(null); }} autoFocus />

      <div className="grid grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">วันที่รับ</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">ผู้รับ</span>
          <input value={receiver} onChange={(e) => setReceiver(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-md" />
        </label>
      </div>
      <div className="mt-3">
        <span className="block text-xs font-medium text-slate-600 mb-1">รับเข้าคลัง <span className="font-normal text-slate-400">(ของดีบวกสต๊อกเข้าคลังนี้)</span></span>
        <WarehousePicker value={wh} onChange={setWh} />
      </div>
      <div className="mt-3">
        <span className="block text-xs font-medium text-slate-600 mb-1">📎 เอกสารแนบ (บังคับ) <span className="font-normal text-slate-400">— รูปถ่ายหรือ PDF</span></span>
        <div className="grid grid-cols-2 gap-3">
          <FileInput label="📄 ใบรับของ / ใบส่งของขนส่ง" value={receiptKey} onChange={(k) => { setReceiptKey(k); setErr(null); }} folder="goods-receipts" required hasError={!receiptKey && !!err} />
          <FileInput label="🧾 บิล / ใบเสร็จ" value={billKey} onChange={(k) => { setBillKey(k); setErr(null); }} folder="goods-receipts" required hasError={!billKey && !!err} />
        </div>
      </div>
      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}
    </ERPModal>
  );
}
