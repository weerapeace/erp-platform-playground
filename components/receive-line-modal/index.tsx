"use client";

/**
 * ของกลาง — ป๊อป "รับของเข้า" ทีละบรรทัดใบสั่งซื้อ (ReceiveLineModal)
 *
 * กติกาเดียวกับหน้ารับสินค้า (/purchasing/receive) + บันทึกผ่าน API กลางตัวเดียวกัน /api/purchasing/receive
 * (ออกเลขใบรับ GR · อัปเดตสถานะบรรทัด/ใบ PO · บวกสต๊อกของดี · audit · แจ้งไลน์ — เหมือนกันเองทั้งหมด):
 *   - ต้องแนบ ใบรับของ + บิล (API ก็บังคับ ยกเว้นหน้าสแกน QR)
 *   - วันที่รับ · ผู้รับ (เติมชื่อคนที่ login แก้ได้) · คลังที่เก็บ (เริ่มที่ WH-RAW)
 *   - จำนวนรับ + ของเสีย/ผิด (ของเสียไม่เข้าสต๊อก) · รับไม่ครบ → เลือก "รอรับเพิ่ม" / "ปิดบิล" · รับเกิน → เตือน
 *   - แผงใบงานที่รอวัตถุดิบนี้ (MaterialDemandPanel — แบ่งของเข้าใบงานได้)
 *
 *   <ReceiveLineModal line={{ po_id, po_no, po_line_id, name, code, uom, qty, qty_received }} onClose onSaved />
 *
 * ใช้ที่: การ์ดวัตถุดิบ แท็บใบสั่งผลิต (/purchasing) · ต่อไป: ป๊อปรับรายบรรทัดของหน้ารับของ
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

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 3 });
/** วันนี้ตามเวลาเครื่อง (ไม่ใช้ toISOString — เวลาไทยตอนเช้ามืดจะได้วันของเมื่อวาน) */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function ReceiveLineModal({ line, onClose, onSaved }: { line: ReceiveLine; onClose: () => void; onSaved: (grNo: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const remaining = Math.max(0, line.qty - line.qty_received);
  const [recv, setRecv] = useState<number>(remaining);
  const [def, setDef] = useState<number>(0);
  const [close, setClose] = useState(false);              // รับไม่ครบ: false = รอรับเพิ่ม · true = ปิดบิล
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

  const short = recv > 0 && recv < remaining;
  const over = recv > remaining;

  const save = async () => {
    setErr(null);
    if (!(recv > 0) && !(def > 0)) { setErr("ใส่จำนวนที่รับก่อน"); return; }
    if (!receiptKey || !billKey) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return; }
    const caseType = recv >= remaining ? "full" : close ? "partial_close" : "partial_wait";   // สูตรเดียวกับหน้ารับของ
    setSaving(true);
    try {
      const res = await apiFetch("/api/purchasing/receive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: line.po_id, warehouse_id: wh?.id ?? null, receive_date: date, receiver: receiver.trim() || user?.name,
          lines: [{ po_line_id: line.po_line_id, qty_received: recv, qty_defective: def, case_type: caseType }],
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

      <div className="grid grid-cols-[1fr_8rem] gap-3 mt-4">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">รับรอบนี้ (ของดี)</span>
          <div className="relative">
            <input type="number" inputMode="decimal" min={0} step="any" value={recv} onFocus={(e) => e.target.select()} onChange={(e) => { setRecv(Number(e.target.value)); setErr(null); }}
              className="w-full h-11 px-16 text-center text-lg font-medium border border-slate-200 rounded-md tabular-nums" />
            {line.uom && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-w-[3.5rem] truncate text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">{line.uom}</span>}
          </div>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1">ของเสีย/ผิด</span>
          <input type="number" inputMode="decimal" min={0} step="any" value={def} onFocus={(e) => e.target.select()} onChange={(e) => setDef(Number(e.target.value))}
            className="w-full h-11 px-2 text-center text-lg border border-slate-200 rounded-md tabular-nums" />
        </label>
      </div>
      {over && <div className="mt-1 text-[11px] text-amber-600">⚠ รับเกินจำนวนคงเหลือ {fmt(recv - remaining)} {line.uom}</div>}
      {short && (
        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
          <div className="text-xs font-medium text-amber-800 mb-2">รับไม่ครบ (ขาด {fmt(remaining - recv)} {line.uom}) — จะจัดการส่วนที่ขาดอย่างไร?</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setClose(false)} className={`text-left px-3 py-2 rounded-lg border text-xs ${!close ? "border-amber-400 bg-white ring-1 ring-amber-200" : "border-slate-200 bg-white hover:border-amber-300"}`}>
              <div className="font-medium text-slate-800">🟡 รอรับเพิ่ม</div><div className="text-[11px] text-slate-500 mt-0.5">ส่วนที่เหลือยังค้างรับต่อ</div>
            </button>
            <button type="button" onClick={() => setClose(true)} className={`text-left px-3 py-2 rounded-lg border text-xs ${close ? "border-orange-400 bg-white ring-1 ring-orange-200" : "border-slate-200 bg-white hover:border-orange-300"}`}>
              <div className="font-medium text-slate-800">🔴 ปิดบิล (จบยอด)</div><div className="text-[11px] text-slate-500 mt-0.5">ไม่รอของที่ขาดแล้ว</div>
            </button>
          </div>
        </div>
      )}

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
      {/* ของกลาง: ใบงานที่รอวัตถุดิบนี้ · พอไหม · แบ่งเข้าใบงาน — ตัวเดียวกับหน้ารับของ */}
      {line.code && (
        <div className="mt-4">
          <MaterialDemandPanel code={line.code} uom={line.uom} incomingQty={recv} allocatable refType="po_line" refId={line.po_line_id} refLabel={line.po_no} />
        </div>
      )}
      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}
    </ERPModal>
  );
}
