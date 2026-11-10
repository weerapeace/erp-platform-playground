"use client";

// 🧾 ออกใบกำกับภาษีของออเดอร์แพลตฟอร์ม (ผ่านใบขาย — เลขชุดเดียวกับใบกำกับที่ออกอยู่ · เข้ารายงานภาษีขายเอง)
// ข้อมูล/กติกา: /api/platform-orders/invoice · พิมพ์ด้วยหน้าใบขายเดิม /print/sales-order/<id>

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { TaxInvoiceRequest } from "@/lib/website-tax-invoice";

type Line = { sku: string | null; name: string; qty: number; unit_price: number; line_total: number };
type Info = {
  demo?: boolean;
  order: { id: string; order_no: string | null; total: number | null; status: string };
  request: TaxInvoiceRequest | null;
  lines: Line[]; lines_total: number;
  company: { id: string; company_code: string | null; name_th: string | null; name: string | null } | null;
  invoice: { so_id: string; tax_invoice_no: string | null; status: string } | null;
  warnings: string[];
};
const EMPTY: TaxInvoiceRequest = { kind: "person", name: "", taxId: "", branch: "", address: "" };
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceModal({ orderId, canManage, onClose, onIssued }: { orderId: string; canManage: boolean; onClose: () => void; onIssued: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [req, setReq] = useState<TaxInvoiceRequest>(EMPTY);
  const [shipping, setShipping] = useState("0");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ so_id: string | null; no: string | null; demo?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch(`/api/platform-orders/invoice?order_id=${encodeURIComponent(orderId)}`).then((r) => r.json()).then((j) => {
      if (!live) return;
      if (j.error) { setErr(j.error); return; }
      setInfo(j as Info);
      if (j.request) setReq({ ...EMPTY, ...j.request });
      const gap = j.order?.total != null ? Math.round((Number(j.order.total) - Number(j.lines_total)) * 100) / 100 : 0;
      if (gap > 0) setShipping(String(gap));   // ยอดออเดอร์มากกว่ายอดสินค้า = น่าจะเป็นค่าส่งที่ผู้ซื้อจ่าย (ตรวจได้ก่อนกดออก)
    }).catch(() => live && setErr("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
    return () => { live = false; };
  }, [orderId]);

  const set = (patch: Partial<TaxInvoiceRequest>) => { setReq((r) => ({ ...r, ...patch })); setDirty(true); setFormErr(null); };

  const issue = async () => {
    const digits = req.taxId.replace(/\D/g, "");
    if (req.name.trim().length < 2) return setFormErr("กรอกชื่อ/ชื่อบริษัทของผู้ขอ");
    if (digits.length !== 13) return setFormErr("เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก");
    if (req.address.trim().length < 10) return setFormErr("กรอกที่อยู่ตามใบทะเบียนให้ครบ");
    setBusy(true); setFormErr(null);
    try {
      const r = await apiFetch("/api/platform-orders/invoice", { method: "POST", body: JSON.stringify({ order_id: orderId, request: { ...req, taxId: digits }, shipping_fee: Number(shipping) || 0 }) });
      const j = await r.json();
      if (j.error) { setFormErr(j.error); return; }
      setIssued({ so_id: j.so_id ?? null, no: j.tax_invoice_no ?? null, demo: !!j.demo });
      setDirty(false);
      toast.success(j.demo ? "โหมดทดลอง — แสดงผลตัวอย่าง ไม่ได้ออกใบจริง" : `ออกใบกำกับแล้ว ${j.tax_invoice_no ?? ""}`);
      onIssued();
    } catch { setFormErr("ออกใบกำกับไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  const done = issued ?? (info?.invoice ? { so_id: info.invoice.so_id, no: info.invoice.tax_invoice_no } : null);
  const blocked = !!info && (!info.company || info.order.status === "cancelled");
  const coName = info?.company ? (info.company.name_th || info.company.name || info.company.company_code || "") : "";

  return (
    <ERPModal open onClose={onClose} title={`ใบกำกับภาษี — ออเดอร์ ${info?.order.order_no ?? ""}`} size="lg" defaultExpanded={false} hasUnsavedChanges={dirty && !done} storageKey="platform-order-invoice"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {done?.so_id && <a href={`/print/sales-order/${done.so_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"><Icon value="i:printer" />พิมพ์ใบกำกับภาษี</a>}
          {done?.so_id && <a href="/sales-orders" target="_blank" rel="noopener noreferrer" title={`ค้นเลข ${done.no ?? ""} ในหน้าใบขาย เพื่อแก้รายการ/ราคาก่อนพิมพ์`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:edit" />เปิดหน้าใบขาย</a>}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ปิด</button>
          {!done && canManage && <button onClick={issue} disabled={busy || !info || blocked} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังออกใบ…" : "ออกใบกำกับภาษี"}</button>}
        </div>
      }>
      {err ? <p className="py-10 text-center text-sm text-rose-600">{err}</p> : !info ? <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p> : (
        <div className="space-y-5 text-sm">
          {info.demo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon value="i:flask" className="mr-1" />โหมดทดลอง — กดออกได้ แต่ไม่ได้สร้างใบจริง</p>}
          {done && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              <Icon value="i:circle-check" className="mr-1.5" />ออกใบกำกับแล้ว เลขที่ <b>{done.no ?? "—"}</b>
              {issued?.demo ? " (ตัวอย่าง)" : <span className="block text-xs text-emerald-700 mt-1">อยู่ในรายงานภาษีขายของเดือนนี้แล้ว (สถานะ "ร่าง" เพราะไม่ตัดสต๊อกซ้ำ)</span>}
            </div>
          )}

          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">ออกในนามบริษัท</p>
            <p className="font-medium text-slate-900">{coName || <span className="text-rose-600">ยังไม่ได้เลือก</span>}</p>
            {!info.company && <p className="mt-1 text-xs text-slate-500">ตั้งที่ <a href="/admin/platform-accounts" className="text-blue-600 hover:underline">บัญชีแพลตฟอร์ม</a> › ร้านนี้ › ใบกำกับภาษี (ระบบไม่เดาบริษัทให้)</p>}
          </div>

          {!done && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs text-slate-500">ประเภทผู้ขอ</span>
                <ERPSelect value={req.kind} onChange={(e) => set({ kind: e.target.value === "company" ? "company" : "person", branch: e.target.value === "company" ? (req.branch || "00000") : "" })} options={[{ value: "person", label: "บุคคลธรรมดา" }, { value: "company", label: "นิติบุคคล (บริษัท/ห้าง)" }]} disabled={!canManage} />
              </label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">ชื่อ / ชื่อบริษัท</span>
                <ERPInput value={req.name} onChange={(e) => set({ name: e.target.value })} disabled={!canManage} placeholder="บริษัท ตัวอย่าง จำกัด" />
              </label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">เลขประจำตัวผู้เสียภาษี (13 หลัก)</span>
                <ERPInput value={req.taxId} onChange={(e) => set({ taxId: e.target.value })} disabled={!canManage} inputMode="numeric" placeholder="0105550123451" />
              </label>
              {req.kind === "company" && (
                <label className="block"><span className="mb-1 block text-xs text-slate-500">สาขา (00000 = สำนักงานใหญ่)</span>
                  <ERPInput value={req.branch} onChange={(e) => set({ branch: e.target.value })} disabled={!canManage} inputMode="numeric" placeholder="00000" />
                </label>
              )}
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-slate-500">ที่อยู่ตามใบทะเบียน</span>
                <ERPTextarea value={req.address} onChange={(e) => set({ address: e.target.value })} disabled={!canManage} rows={2} />
              </label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">อีเมลรับใบกำกับ (ถ้ามี)</span>
                <ERPInput value={req.email ?? ""} onChange={(e) => set({ email: e.target.value })} disabled={!canManage} placeholder="name@company.com" />
              </label>
              <label className="block"><span className="mb-1 block text-xs text-slate-500">ค่าส่งที่ผู้ซื้อจ่าย (บาท)</span>
                <ERPInput value={shipping} onChange={(e) => { setShipping(e.target.value); setDirty(true); }} disabled={!canManage} inputMode="decimal" />
              </label>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs text-slate-500">รายการในใบกำกับ (ราคารวมภาษีมูลค่าเพิ่มแล้ว)</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {info.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="w-24 shrink-0 truncate font-mono text-slate-500">{l.sku ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{l.name}</span>
                  <span className="shrink-0 text-slate-500">{l.qty} × {money(l.unit_price)}</span>
                  <span className="w-20 shrink-0 text-right font-medium">{money(l.line_total)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-1.5 text-xs text-slate-600"><span>รวมสินค้า</span><span className="font-medium">{money(info.lines_total)}</span></div>
              {info.order.total != null && <div className="flex justify-between px-3 py-1.5 text-xs text-slate-600"><span>ยอดออเดอร์บนร้าน</span><span>{money(info.order.total)}</span></div>}
            </div>
          </div>

          {!done && info.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {info.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</li>)}
            </ul>
          )}
          {formErr && <p className="text-[13px] text-rose-600">{formErr}</p>}
        </div>
      )}
    </ERPModal>
  );
}
