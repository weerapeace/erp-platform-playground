"use client";

/**
 * ของกลาง — ตะกร้ารับของหลายรายการ (รับข้ามหลายใบสั่งซื้อได้ในครั้งเดียว)
 *
 * useReceiveCart()    = ฟอร์มตะกร้า: วันที่รับ · ผู้รับ (คนที่ login) · คลัง (WH-RAW) · ใบรับของ + บิล (บังคับ)
 *                       save()   → ยิง /api/purchasing/receive แยกตามใบสั่งซื้อ (1 ใบสั่งซื้อ = 1 ใบรับ GR)
 *                                  หลายใบสั่งซื้อในครั้งเดียว = "ชุดรับของ" เลขเดียว (RB-…) → พิมพ์รวม /print/goods-receipt/RB-… · ใบสำคัญเลือกทั้งชุด · แจ้งไลน์ครั้งเดียว
 *                       postOne() → รับทีละใบ (แท็บ "ตามใบสั่งซื้อ" หน้ารับสินค้า)
 * <ReceiveCartMeta>   = ช่องวันที่รับ / ผู้รับ / รับเข้าคลัง
 * <ReceiveAttachBox>  = กล่องแนบใบรับของ + บิล
 * <ReceiveCartRows>   = รายการในตะกร้า: รับ / ครบ / เสีย / รอรับเพิ่ม-ปิดบิล / เอาออก + ปุ่มรับครบทุกตัว
 * compact = แบบแคบ (แผงตะกร้าข้างจอ หน้าสั่งซื้อ) · ไม่ใส่ = แบบกว้าง (ป๊อปตะกร้า หน้ารับสินค้า)
 *
 * ใช้ที่: หน้ารับสินค้า (/purchasing/receive) ป๊อป 🧺 ตะกร้ารับของ + แท็บตามใบสั่งซื้อ · หน้าสั่งซื้อ (/purchasing/orders) โหมด 📥 รับของ
 * ค่าที่กรอกต่อบรรทัด (ReceiveInput) หน้าที่เรียกถือเอง · สูตรเคสใช้ receiveCaseType ตัวเดียวกับ ReceiveLineModal
 */
import { useCallback, useEffect, useState } from "react";
import { FileInput } from "@/components/file-input";
import { WarehousePicker, type WarehousePickerValue } from "@/components/pickers";
import { HoverPreview } from "@/components/hover-image";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { receiveCaseType, type ReceiveInput } from "./index";

/** บรรทัดใบสั่งซื้อที่รอรับ (โครงเดียวกับ /api/purchasing/receivable) */
export type ReceiveCartItem = {
  id: string;   // = po_line_id
  po_id: string; po_no: string; seller_name?: string | null;
  item_name: string; code?: string | null; image_url?: string | null; uom: string;
  qty: number; qty_received: number; remaining: number;
};
export type ReceivePostLine = { po_line_id: string; qty_received: number; qty_defective: number; case_type: string };
export type ReceivePostResult = { gr_no?: string; po_status?: string; stock_warnings?: string[]; receipt_batch_no?: string | null; error?: string };
/** ส่งต่อเรื่องชุดรับของ: newBatch = ใบแรกขอเลขชุด · batchNo = ใบถัดไป · batchLast = ใบสุดท้าย (แจ้งไลน์ครั้งเดียวทั้งชุด) */
export type ReceiveBatchOpts = { newBatch?: boolean; batchNo?: string | null; batchLast?: boolean };
/** ผลบันทึกตะกร้า — failed = ข้อความของใบที่ล้มเหลว (ใบก่อนหน้าที่บันทึกแล้วอยู่ใน grNos) · batchNo = เลขชุดรับ (หลายใบสั่งซื้อ) */
export type ReceiveSaveResult = { grNos: string[]; savedPoIds: string[]; failed: string | null; batchNo: string | null };

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
/** วันนี้ตามเวลาเครื่อง (ไม่ใช้ toISOString — เวลาไทยตอนเช้ามืดจะได้วันของเมื่อวาน) */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const stripCode = (name: string) => name?.replace(/^\s*\[[^\]]*\]\s*/, "").trim() || name;

/** รายการที่ใส่จำนวนแล้ว จัดกลุ่มตามใบสั่งซื้อ (1 ใบสั่งซื้อ = 1 ใบรับ) */
export function groupReceiveByPo(items: ReceiveCartItem[], inputs: Record<string, ReceiveInput>) {
  const byPo = new Map<string, { po_no: string; lines: ReceivePostLine[] }>();
  for (const it of items) {
    const inp = inputs[it.id];
    const recv = num(inp?.recv), def = num(inp?.def);
    if (recv <= 0 && def <= 0) continue;
    const g = byPo.get(it.po_id) ?? { po_no: it.po_no, lines: [] };
    g.lines.push({ po_line_id: it.id, qty_received: recv, qty_defective: def, case_type: receiveCaseType(recv, it.remaining, inp?.close) });
    byPo.set(it.po_id, g);
  }
  return byPo;
}

export function useReceiveCart() {
  const { user } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [receiver, setReceiver] = useState("");
  const [wh, setWh] = useState<WarehousePickerValue | null>(null);
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [billKey, setBillKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const attachReady = !!receiptKey && !!billKey;

  // ผู้รับ = คนที่ login อยู่ (เติมให้เลย แก้ได้ถ้ารับแทนคนอื่น)
  useEffect(() => { if (user?.name) setReceiver((r) => r || user.name); }, [user?.name]);
  // คลังเริ่มต้น = โซนวัตถุดิบ (WH-RAW) — ของจาก PO เข้าวัตถุดิบ (เลือกโซนอื่นได้)
  useEffect(() => {
    apiFetch("/api/master/warehouses?limit=50").then((r) => r.json())
      .then((j) => { const m = ((j.data ?? []) as WarehousePickerValue[]).find((w) => w.code === "WH-RAW"); if (m) setWh((cur) => cur ?? m); })
      .catch(() => { /* ไม่มี = API ใช้ WH-RAW ให้เอง */ });
  }, []);

  const resetAttach = useCallback(() => { setReceiptKey(null); setBillKey(null); }, []);

  /** รับของ 1 ใบสั่งซื้อ (ใช้วันที่/ผู้รับ/คลัง/ไฟล์แนบของตะกร้านี้) */
  const postOne = useCallback(async (poId: string, lines: ReceivePostLine[], batch?: ReceiveBatchOpts): Promise<ReceivePostResult> => {
    const res = await apiFetch("/api/purchasing/receive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poId, warehouse_id: wh?.id ?? null, receive_date: date, receiver: receiver.trim() || user?.name, lines, receipt_doc_r2_key: receiptKey, bill_doc_r2_key: billKey,
        new_batch: batch?.newBatch || undefined, receipt_batch_no: batch?.batchNo || undefined, batch_last: batch?.batchLast || undefined }),
    });
    const j = (await res.json().catch(() => ({}))) as ReceivePostResult;
    if (!res.ok && !j.error) j.error = `HTTP ${res.status}`;
    if (!j.error && j.stock_warnings?.length) toast.warning(`บันทึกรับแล้ว แต่ยังไม่บวกสต๊อก: ${j.stock_warnings.join(" · ")}`);
    return j;
  }, [wh?.id, date, receiver, user?.name, receiptKey, billKey, toast]);

  /** บันทึกทั้งตะกร้า — ยิงทีละใบสั่งซื้อ · ใบไหนล้มเหลวหยุดตรงนั้น (ใบก่อนหน้าบันทึกไปแล้ว) */
  const save = useCallback(async (items: ReceiveCartItem[], inputs: Record<string, ReceiveInput>): Promise<ReceiveSaveResult | null> => {
    setErr(null);
    if (!attachReady) { setErr("ต้องแนบ ใบรับของ + บิล ให้ครบก่อนบันทึก"); return null; }
    const byPo = groupReceiveByPo(items, inputs);
    if (byPo.size === 0) { setErr("กรอกจำนวนรับอย่างน้อย 1 รายการ"); return null; }
    setSaving(true);
    const grNos: string[] = [], savedPoIds: string[] = [];
    let failed: string | null = null;
    // หลายใบสั่งซื้อ = ชุดรับของ: ใบแรกขอเลขชุด แล้วใบถัดไปใช้เลขเดิม (ออกเลขไม่ได้ = รับต่อแบบไม่มีชุด)
    const multi = byPo.size > 1;
    let batchNo: string | null = null;
    try {
      const entries = [...byPo];
      for (let i = 0; i < entries.length; i++) {
        const [poId, g] = entries[i];
        const opts: ReceiveBatchOpts | undefined = !multi ? undefined : i === 0 ? { newBatch: true } : { batchNo, batchLast: i === entries.length - 1 };
        const j = await postOne(poId, g.lines, opts);
        if (j.error || !j.gr_no) { failed = `${g.po_no}: ${j.error ?? "บันทึกรับของไม่สำเร็จ"}`; break; }
        if (i === 0 && multi) batchNo = j.receipt_batch_no ?? null;
        grNos.push(String(j.gr_no)); savedPoIds.push(poId);
      }
    } catch (e) { failed = String((e as Error)?.message ?? e); }
    finally { setSaving(false); }
    if (failed) {
      failed = grNos.length ? `บันทึกแล้ว ${grNos.length} ใบ (${grNos.join(", ")}) แต่ใบ ${failed}` : failed;
      setErr(failed);   // ไฟล์แนบเก็บไว้ ให้กดบันทึกใบที่เหลือต่อได้
    } else resetAttach();
    return { grNos, savedPoIds, failed, batchNo };
  }, [attachReady, postOne, resetAttach]);

  return { date, setDate, receiver, setReceiver, wh, setWh, receiptKey, setReceiptKey, billKey, setBillKey, attachReady, saving, err, setErr, resetAttach, postOne, save, user };
}
export type ReceiveCart = ReturnType<typeof useReceiveCart>;

/** วันที่รับ · ผู้รับ · รับเข้าคลัง */
export function ReceiveCartMeta({ cart, compact }: { cart: ReceiveCart; compact?: boolean }) {
  const inputCls = `w-full ${compact ? "h-9" : "h-10"} px-3 text-sm border border-slate-200 rounded-md`;
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">📅 วันที่รับของ</label>
        <input type="date" value={cart.date} onChange={(e) => cart.setDate(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">👤 ผู้รับ</label>
        <input value={cart.receiver} onChange={(e) => cart.setReceiver(e.target.value)} placeholder={cart.user?.name ?? "ชื่อผู้รับ"} className={inputCls} />
      </div>
      <div className={compact ? "col-span-2" : ""}>
        <label className="block text-xs font-medium text-slate-600 mb-1">📥 รับเข้าคลัง <span className="font-normal text-slate-400">(ของดีบวกสต๊อกเข้าคลังนี้)</span></label>
        <WarehousePicker value={cart.wh} onChange={cart.setWh} />
      </div>
    </div>
  );
}

/** แนบใบรับของ + บิล (บังคับ) · invalid = บังคับโชว์กรอบแดงตอนยังไม่แนบ (ไม่ใส่ = ตาม error ของตะกร้า) */
export function ReceiveAttachBox({ cart, compact, invalid }: { cart: ReceiveCart; compact?: boolean; invalid?: boolean }) {
  const showErr = invalid ?? !!cart.err;
  return (
    <div className={compact ? "" : "bg-white border border-slate-200 rounded-xl p-4 mb-4"}>
      <div className={compact ? "text-xs font-medium text-slate-600 mb-1" : "text-sm font-semibold text-slate-700 mb-2"}>📎 เอกสารแนบ (บังคับ) <span className="text-xs font-normal text-slate-400">— รูปถ่ายหรือ PDF</span></div>
      <div className="grid grid-cols-2 gap-3">
        {/* ใบส่งของจากขนส่ง (Delivery Bill) แนบตรงนี้ → ตอนออกใบสำคัญรับ จัดซื้อกด "อ่านด้วย AI" ได้เลย (รหัสขนส่ง EK- + น้ำหนัก/คิวรายกล่อง) */}
        <FileInput label={compact ? "📄 ใบรับของ / ใบส่งขนส่ง" : "📄 ใบรับของ / ใบส่งของขนส่ง"} value={cart.receiptKey} onChange={(k) => { cart.setReceiptKey(k); cart.setErr(null); }} folder="goods-receipts" required hasError={!cart.receiptKey && showErr} />
        <FileInput label="🧾 บิล / ใบเสร็จ" value={cart.billKey} onChange={(k) => { cart.setBillKey(k); cart.setErr(null); }} folder="goods-receipts" required hasError={!cart.billKey && showErr} />
      </div>
    </div>
  );
}

/** รายการในตะกร้า — กรอกรับ/เสีย ต่อบรรทัด · รับไม่ครบเลือก รอรับเพิ่ม/ปิดบิล · ✕ เอาออก */
export function ReceiveCartRows({ items, inputs, onInput, onRemove, compact }: {
  items: ReceiveCartItem[];
  inputs: Record<string, ReceiveInput>;
  onInput: (id: string, patch: Partial<ReceiveInput>) => void;
  onRemove: (it: ReceiveCartItem) => void;
  compact?: boolean;
}) {
  const btn = compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs";
  return (
    <>
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button type="button" onClick={() => items.forEach((it) => onInput(it.id, { recv: String(it.remaining) }))}
            className={`${btn} font-medium rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100`}>✓ รับครบทุกตัว</button>
          <button type="button" onClick={() => items.forEach((it) => onInput(it.id, { recv: "0", def: "0" }))}
            className={`${btn} font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50`}>ล้างจำนวน</button>
          {!compact && <span className="text-[11px] text-slate-400">รับไม่ครบ = ค่าเริ่มต้น &quot;รอรับเพิ่ม&quot; · เปลี่ยนเป็น &quot;ปิดบิล&quot; ได้ทีละรายการ</span>}
        </div>
      )}
      <div className={`border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 ${compact ? "" : "max-h-[46vh] overflow-y-auto"}`}>
        {items.map((it) => {
          const inp = inputs[it.id] ?? { recv: "0", def: "0" };
          const recv = num(inp.recv);
          const short = recv > 0 && recv < it.remaining;
          const over = recv > it.remaining;
          const active = recv > 0 || num(inp.def) > 0;
          const thumb = (size: string) => (
            <HoverPreview url={it.image_url} previewW={240}>
              <div className={`${size} rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0`}>
                {it.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
              </div>
            </HoverPreview>
          );
          const shortSelect = short && (
            <select value={inp.close ? "close" : "wait"} onChange={(e) => onInput(it.id, { close: e.target.value === "close" })}
              className={`${compact ? "mt-1.5 w-full h-7 text-[11px]" : "h-9 text-xs"} px-1.5 border border-amber-300 bg-amber-50 rounded-md`}>
              <option value="wait">🟡 รอรับเพิ่ม{compact ? ` (ขาด ${(it.remaining - recv).toLocaleString()})` : ""}</option>
              <option value="close">🔴 ปิดบิล{compact ? " ไม่รอของที่ขาด" : ""}</option>
            </select>
          );
          const removeBtn = (
            <button type="button" onClick={() => onRemove(it)} title="เอาออกจากตะกร้า" className="w-7 h-7 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 shrink-0">✕</button>
          );

          if (compact) return (
            <div key={it.id} className={`px-2 py-2 ${active ? "bg-blue-50/40" : ""}`}>
              <div className="flex items-start gap-2">
                {thumb("w-9 h-9")}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-800 truncate" title={it.item_name}>{stripCode(it.item_name)}</div>
                  <div className="text-[10px] text-slate-400 truncate">{it.code ? `${it.code} · ` : ""}{it.po_no}</div>
                </div>
                {removeBtn}
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] text-slate-400">รับ</span>
                <input type="number" inputMode="decimal" step="any" min={0} value={inp.recv} onChange={(e) => onInput(it.id, { recv: e.target.value })} onFocus={(e) => e.target.select()}
                  className={`w-14 h-7 px-1 text-xs text-center border rounded-md tabular-nums ${short || over ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                <button type="button" onClick={() => onInput(it.id, { recv: String(it.remaining) })} title={`รับครบ ${it.remaining.toLocaleString()}`} className="h-7 px-1.5 text-[11px] rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">ครบ</button>
                <span className="text-[10px] text-slate-400 ml-1">เสีย</span>
                <input type="number" inputMode="decimal" step="any" min={0} value={inp.def} onChange={(e) => onInput(it.id, { def: e.target.value })} onFocus={(e) => e.target.select()}
                  className="w-12 h-7 px-1 text-xs text-center border border-slate-200 rounded-md tabular-nums" />
                <span className="ml-auto text-[10px] text-slate-400 whitespace-nowrap">/ {it.remaining.toLocaleString()} {it.uom}</span>
              </div>
              {shortSelect}
              {over && <div className="mt-1 text-[10px] text-amber-600">⚠ รับเกินจำนวนคงเหลือ</div>}
            </div>
          );

          return (
            <div key={it.id} className={`flex items-center gap-3 px-3 py-2 flex-wrap sm:flex-nowrap ${active ? "bg-blue-50/40" : ""}`}>
              {thumb("w-10 h-10")}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-800 truncate" title={it.item_name}>{stripCode(it.item_name)}</div>
                <div className="text-[11px] text-slate-400 truncate">{it.code ? `${it.code} · ` : ""}{it.seller_name ? `${it.seller_name} · ` : ""}{it.po_no}</div>
              </div>
              {/* สั่ง / คงเหลือ — วางติดช่องรับ จะได้เห็นว่าสั่งไปเท่าไหร่ตอนกรอก */}
              <div className="shrink-0 text-right leading-tight w-32">
                <div className="text-[11px] text-slate-400">สั่ง <b className="text-slate-600 tabular-nums">{it.qty.toLocaleString()}</b>{it.qty_received > 0 && <span className="text-emerald-600"> · รับแล้ว {it.qty_received.toLocaleString()}</span>}</div>
                <div className="text-xs text-slate-500">คงเหลือ <b className="text-blue-700 tabular-nums text-sm">{it.remaining.toLocaleString()}</b> <span className="text-[10px] text-slate-400">{it.uom}</span></div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-slate-400">รับ</span>
                <input type="number" inputMode="decimal" step="any" min={0} value={inp.recv} onChange={(e) => onInput(it.id, { recv: e.target.value })} onFocus={(e) => e.target.select()}
                  className={`w-20 h-9 px-2 text-sm text-center border rounded-md tabular-nums ${short || over ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} />
                <button type="button" onClick={() => onInput(it.id, { recv: String(it.remaining) })} title={`รับครบ ${it.remaining.toLocaleString()}`} className="h-9 px-2 text-xs rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">ครบ</button>
                <span className="text-[10px] text-slate-400 ml-1">เสีย</span>
                <input type="number" inputMode="decimal" step="any" min={0} value={inp.def} onChange={(e) => onInput(it.id, { def: e.target.value })} onFocus={(e) => e.target.select()}
                  className="w-16 h-9 px-2 text-sm text-center border border-slate-200 rounded-md tabular-nums" />
                {shortSelect}
                {over && <span className="text-[10px] text-amber-600">⚠ เกิน</span>}
                {removeBtn}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div className="py-8 text-center text-xs text-slate-300">— ตะกร้าว่าง —</div>}
      </div>
    </>
  );
}
