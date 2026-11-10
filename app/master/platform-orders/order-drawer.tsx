"use client";

// แผงรายละเอียดออเดอร์ (ลิ้นชักกลาง Drawer) — ปุ่มสถานะตามกติกากลาง lib/platform-order-status · เลขพัสดุ · ใบกำกับภาษี

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, Drawer } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import {
  SHOPEE_STATUS_LABEL, SHIP_DUE_LABEL, allowedNext, isPlatformOrderStatus, isReportOnly, platformStatusWarning, shipDue,
  type PlatformOrderItemRow, type PlatformOrderStatus,
} from "@/lib/platform-order-status";
import { StatusChip } from "./status-chip";

const ACTION_LABEL: Partial<Record<PlatformOrderStatus, string>> = {
  confirmed: "ยืนยัน (ตัดสต๊อก)", packed: "แพ็กแล้ว", shipped: "ส่งแล้ว", cancelled: "ยกเลิกออเดอร์",
};

export function OrderDrawer({ id, canManage, onClose, onChanged, onInvoice }: {
  id: string; canManage: boolean; onClose: () => void; onChanged: () => void; onInvoice: (id: string) => void;
}) {
  const toast = useToast();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<PlatformOrderItemRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [askCancel, setAskCancel] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/platform-orders?id=${encodeURIComponent(id)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setOrder(j.order); setItems((j.items ?? []) as PlatformOrderItemRow[]);
      setTracking(String(j.order?.tracking_no ?? "")); setCarrier(String(j.order?.carrier ?? ""));
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (p: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch("/api/platform-orders", { method: "PATCH", body: JSON.stringify({ id, ...p }) });
      const j = await r.json();
      if (j.error) { toast.error(j.error); return; }
      if (j.demo) toast.info("โหมดทดลอง — ไม่ได้บันทึกจริง");
      else toast.success("บันทึกแล้ว");
      if (j.warnings?.length && !j.demo) setMsg(j.warnings.join(" · "));
      await load(); onChanged();
    } catch { toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  const status = String(order?.status ?? "new");
  const source = (order?.source as string | null) ?? null;
  const reportOnly = isReportOnly(source);
  const pStatus = (order?.platform_status as string | null) ?? null;
  const warn = platformStatusWarning(pStatus);
  const due = order ? shipDue({ status, ship_by_at: (order.ship_by_at as string | null) ?? null }) : "none";
  const next = reportOnly ? [] : allowedNext(status).filter((s) => s !== "cancelled");
  const canCancel = !reportOnly && allowedNext(status).includes("cancelled");
  const unmatched = items.filter((i) => !i.matched_sku_id).length;
  const invoiced = !!order?.invoice_so_id;
  const askedInvoice = order?.tax_invoice_request != null;
  const title = `ออเดอร์ ${String(order?.order_no ?? order?.external_order_id ?? "")}`;

  return (
    <>
      <Drawer open onClose={onClose} title={title} size="md" storageKey="platform-order-drawer"
        footer={canManage && order ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            {next.map((s) => (
              <button key={s} onClick={() => void patch(s === "shipped" ? { status: s, tracking_no: tracking, carrier } : { status: s })} disabled={busy}
                className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{ACTION_LABEL[s] ?? s}</button>
            ))}
            {status === "shipped" && !reportOnly && <button onClick={() => void patch({ tracking_no: tracking, carrier })} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">บันทึกเลขพัสดุ</button>}
            <div className="flex-1" />
            {canCancel && <button onClick={() => setAskCancel(true)} disabled={busy} className="h-9 rounded-lg border border-rose-200 px-3 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">ยกเลิก</button>}
          </div>
        ) : undefined}>
        {err ? <p className="py-10 text-center text-sm text-rose-600">{err}</p> : !order ? <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p> : (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip s={status} />
              {pStatus && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">บนร้าน: {SHOPEE_STATUS_LABEL[pStatus] ?? pStatus}</span>}
              {due !== "none" && due !== "later" && <span className={`rounded-full px-2 py-0.5 text-xs ${due === "late" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{SHIP_DUE_LABEL[due]}</span>}
              {source === "demo" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">ตัวอย่าง</span>}
            </div>
            {reportOnly && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><Icon value="i:mail" className="mr-1" />ออเดอร์นี้มาจากอีเมลแจ้งยอดขาย — ร้านส่งของไปแล้วผ่าน Seller Centre จึงเปลี่ยนสถานะ/ตัดสต๊อกที่นี่ไม่ได้ (ออกใบกำกับภาษีได้)</p>}
            {warn && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="warning" className="mr-1" />{warn}</p>}

            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-slate-400">ลูกค้า</dt><dd>{String(order.customer_name ?? "—")}</dd>
              <dt className="text-slate-400">ยอดรวม</dt><dd>{order.total != null ? `${Number(order.total).toLocaleString("th-TH")} ฿` : "—"}</dd>
              <dt className="text-slate-400">สั่งเมื่อ</dt><dd>{formatDateTime(order.ordered_at ?? order.created_at) || "—"}</dd>
              <dt className="text-slate-400">ส่งภายใน</dt><dd>{order.ship_by_at ? formatDateTime(order.ship_by_at) : "—"}</dd>
              <dt className="text-slate-400">ตัดสต๊อก</dt><dd>{order.stock_deducted ? "ตัดแล้ว" : "ยังไม่ตัด"}</dd>
            </dl>

            <div>
              <p className="mb-1 text-xs text-slate-400">รายการ ({items.length}){unmatched > 0 && source !== "demo" && <span className="text-rose-500"> · จับคู่สินค้าไม่ได้ {unmatched} (จะไม่ตัดสต๊อก)</span>}</p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="shrink-0 font-mono text-slate-600">{it.sku_code || "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{it.name || "—"}{it.variant ? <span className="text-slate-400"> ({it.variant})</span> : null}</span>
                    <span className="shrink-0 text-slate-500">×{it.qty}</span>
                  </div>
                ))}
              </div>
            </div>

            {!reportOnly && (status === "packed" || status === "shipped") && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-400">เลขพัสดุ / ขนส่ง</p>
                <div className="flex gap-1.5">
                  <ERPInput value={tracking} disabled={!canManage} placeholder="เลขพัสดุ" onChange={(e) => setTracking(e.target.value)} />
                  <ERPInput value={carrier} disabled={!canManage} placeholder="ขนส่ง" className="max-w-[140px]" onChange={(e) => setCarrier(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
              <span className="text-xs text-slate-600"><Icon value="i:file-invoice" className="mr-1" />{invoiced ? "ออกใบกำกับภาษีแล้ว" : askedInvoice ? "ผู้ซื้อขอใบกำกับภาษี" : "ใบกำกับภาษี"}</span>
              {status !== "cancelled" && <button onClick={() => onInvoice(id)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">{invoiced ? "ดู / พิมพ์" : "ออกใบกำกับ"}</button>}
            </div>
            {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</p>}
            {!isPlatformOrderStatus(status) && <p className="text-xs text-rose-600">สถานะ “{status}” ไม่อยู่ในกติกากลาง — แจ้งผู้ดูแลระบบ</p>}
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={askCancel} onClose={() => setAskCancel(false)} variant="danger" title="ยกเลิกออเดอร์นี้?"
        message={order?.stock_deducted ? "ระบบจะคืนสต๊อกที่ตัดไปแล้วกลับเข้าคลัง" : "ออเดอร์จะย้ายไปอยู่ในกลุ่ม ยกเลิก"}
        confirmText="ยกเลิกออเดอร์" cancelText="ไม่ยกเลิก" loading={busy}
        onConfirm={() => { setAskCancel(false); void patch({ status: "cancelled" }); }} />
    </>
  );
}
