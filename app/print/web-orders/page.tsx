"use client";

/**
 * 📦 พิมพ์ใบปะหน้า + ใบแพ็ก ออเดอร์เว็บร้าน — /print/web-orders?shop=<slug>[&ids=<orderId,...>]
 *   ไม่ส่ง ids = ทุกออเดอร์ที่ "พร้อมแพ็ก" (รอดำเนินการ/กำลังเตรียมของ + จ่ายแล้ว/เก็บปลายทาง)
 *   แบบ: ใบปะหน้า + ใบแพ็ก (1 ออเดอร์/แผ่น) · ใบปะหน้าอย่างเดียว (4 ใบ/แผ่น มีเส้นตัด)
 *   ใบปะหน้า: ผู้ส่ง (ชื่อร้าน+เบอร์/ที่อยู่จากแท็บข้อมูลร้าน) · ผู้รับ · รหัสไปรษณีย์ตัวใหญ่ · บาร์โค้ดเลขออเดอร์ · วิธีส่ง/กล่อง · COD ตัวใหญ่
 * ของกลาง: lib/website-fulfillment (จัดหน้า) · PrintFrame + printReportHtmlInNewWindow · jsbarcode
 * ข้อมูล: /api/website/orders · ปุ่ม "📦 เปลี่ยนเป็นกำลังเตรียมของ" = PATCH bulk (audit ครบ)
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { fulfillmentPrintHtml, isReadyToPack, type PackOrder, type PrintKind, type Sender } from "@/lib/website-fulfillment";

type Order = PackOrder & { id: string };

/** บาร์โค้ด Code128 ของเลขออเดอร์เป็น SVG (สร้างในเบราว์เซอร์) */
function barcodeSvg(text: string): string {
  try {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(el, text, { format: "CODE128", displayValue: false, height: 40, width: 1.4, margin: 0 });
    return el.outerHTML;
  } catch {
    return "";
  }
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const shop = sp.get("shop") ?? "";
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").filter(Boolean), [sp]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [sender, setSender] = useState<Sender | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<PrintKind>("both");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/website/orders?shop=${encodeURIComponent(shop)}`).then((r) => r.json());
      if (j.error) return setErr(j.error);
      const all = (j.orders ?? []) as Order[];
      setOrders(ids.length ? all.filter((o) => ids.includes(o.id)) : all.filter(isReadyToPack));
      setSender(j.sender ?? { name: j.shop?.name ?? "", phone: "", address: "" });
    } catch {
      setErr("โหลดข้อมูลไม่สำเร็จ");
    }
  }, [shop, ids]);
  useEffect(() => {
    void load();
  }, [load]);

  const html = useMemo(() => {
    if (!orders?.length || !sender) return "";
    const codes: Record<string, string> = {};
    for (const o of orders) codes[o.orderNo] = barcodeSvg(o.orderNo);
    return fulfillmentPrintHtml(orders, sender, kind, codes, `ใบปะหน้า ${orders.length} ออเดอร์`);
  }, [orders, sender, kind]);

  const toPreparing = async () => {
    const list = (orders ?? []).filter((o) => o.status === "pending");
    if (!list.length) return toast.success("ทุกออเดอร์ในชุดนี้เป็น 'กำลังเตรียมของ' อยู่แล้ว");
    setBusy(true);
    try {
      const j = await apiFetch("/api/website/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: { orderIds: list.map((o) => o.id), status: "preparing" } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(`เปลี่ยนเป็น "กำลังเตรียมของ" ${j.done} ออเดอร์${j.failed?.length ? ` · ไม่สำเร็จ ${j.failed.length}` : ""}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const pending = (orders ?? []).filter((o) => o.status === "pending").length;
  const noSender = sender && !sender.phone && !sender.address;
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push(`/website/${shop}?tab=orders`))} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">
          ← กลับ
        </button>
        <span className="text-sm text-slate-600">📦 {orders ? `${orders.length} ออเดอร์` : "กำลังโหลด…"}{!ids.length && " (พร้อมแพ็กทั้งหมด)"}</span>
        <span className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm">
          {([["both", "ใบปะหน้า + ใบแพ็ก (ออเดอร์ละแผ่น)"], ["labels", "ใบปะหน้าอย่างเดียว (4 ใบ/แผ่น)"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 h-9 ${kind === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </span>
        <div className="flex-1" />
        {pending > 0 && (
          <button onClick={() => void toPreparing()} disabled={busy} className="h-9 rounded-lg border border-blue-200 bg-white px-3 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50" title="ลูกค้าเห็นสถานะ 'กำลังเตรียมของ' ในหน้าติดตามคำสั่งซื้อ">
            📦 เปลี่ยน {pending} ออเดอร์เป็น &quot;กำลังเตรียมของ&quot;
          </button>
        )}
        <button onClick={() => html && printReportHtmlInNewWindow(html)} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          🖨 พิมพ์
        </button>
      </div>
      <p className="no-print px-6 pt-3 text-xs text-slate-500">
        ตอนพิมพ์ให้ตั้ง &quot;ขนาดจริง (100%)&quot; · กระดาษ A4 · ใบปะหน้าตัดแปะหน้ากล่อง ใบแพ็กใช้หยิบของ/ใส่ในกล่อง
        {noSender && <span className="ml-1 text-amber-700">⚠️ ยังไม่มีเบอร์/ที่อยู่ผู้ส่ง — ใส่ที่แท็บ 🏪 ข้อมูลร้าน (เบอร์โทร/ที่อยู่ร้าน)</span>}
      </p>
      {err && <div className="mx-6 mt-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div>}
      {!err && orders && !orders.length && <div className="p-10 text-center text-slate-500 text-sm">ไม่มีออเดอร์ที่พร้อมแพ็ก — ออเดอร์ที่จ่ายแล้ว (หรือเก็บปลายทาง) และยังไม่ส่งจะขึ้นที่นี่</div>}
      {html ? (
        <div className="p-6">
          <PrintFrame html={html} maxWidth={860} />
        </div>
      ) : null}
    </div>
  );
}

export default function WebOrdersPrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">กำลังโหลด…</div>}>
      <Inner />
    </Suspense>
  );
}
