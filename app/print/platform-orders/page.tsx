"use client";

/**
 * 🖨 พิมพ์งานจากศูนย์ออเดอร์ออนไลน์ — /print/platform-orders?kind=pick|pack|label&ids=<id,...>
 *   pick  = ใบหยิบรวม (รวมรหัสทุกออเดอร์) · ตั้งค่าหน้าพิมพ์ด้วยของกลาง ListPrintPanel
 *   pack  = ใบแพ็ก ออเดอร์ละใบ 2 ใบ/แผ่น A4 + บาร์โค้ดเลขออเดอร์
 *   label = ใบปะหน้า: ออเดอร์ตัวอย่าง = ใบจำลองมีลายน้ำ · ออเดอร์จริง = ต้องใช้ไฟล์ของ Shopee (เฟส B หลังเชื่อมร้าน)
 * ตัวสร้างใบ = lib/platform-order-print (มีเทสต์) · ข้อมูล = /api/platform-orders?ids=
 */
import { shortcutKey } from "@/lib/shortcut-key";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";
import { PrintFrame, printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { ListPrintPanel } from "@/components/report/list-print-panel";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { estimateListPages } from "@/lib/list-print";
import {
  PICK_GROUPS, PICK_PRESETS, PICK_SORTS, PICK_TITLE, buildPickPrint, demoLabelsHtml, packSlipsHtml, pickColumns, pickDefaults, type PrintOrder,
} from "@/lib/platform-order-print";

type Kind = "pick" | "pack" | "label";
type ApiOrder = PrintOrder & { source: string | null; platform_id: string | null; brand_id: string | null };
type Company = { id: string; name: string; logo_key: string | null };
const KIND_LABEL: Record<Kind, string> = { pick: "ใบหยิบรวม", pack: "ใบแพ็ก", label: "ใบปะหน้า" };

/** บาร์โค้ด Code128 ของเลขออเดอร์เป็น SVG (สร้างในเบราว์เซอร์) */
function barcodeSvg(text: string): string {
  try {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(el, text, { format: "CODE128", displayValue: false, height: 40, width: 1.4, margin: 0 });
    return el.outerHTML;
  } catch { return ""; }
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const kindParam = sp.get("kind");
  const [kind, setKind] = useState<Kind>(kindParam === "pack" || kindParam === "label" ? kindParam : "pick");
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean), [sp]);
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [shop, setShop] = useState("ออเดอร์ออนไลน์");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ids.length) { setErr("ไม่ได้เลือกออเดอร์ — กลับไปติ๊กออเดอร์ในศูนย์ออเดอร์ก่อน"); return; }
    let live = true;
    Promise.all([
      apiFetch(`/api/platform-orders?ids=${encodeURIComponent(ids.join(","))}`).then((r) => r.json()),
      apiFetch("/api/platform-accounts").then((r) => r.json()).catch(() => ({})),
    ]).then(([j, a]) => {
      if (!live) return;
      if (j.error) { setErr(j.error); return; }
      const list = (j.orders ?? []) as ApiOrder[];
      setOrders(list);
      if (j.demo) { setShop("Shopee · ร้านตัวอย่าง"); return; }
      const pName = new Map(((a.platforms ?? []) as { id: string; name_th: string }[]).map((p) => [p.id, p.name_th]));
      const bName = new Map(((a.brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
      const shops = [...new Set(list.map((o) => [o.platform_id && pName.get(o.platform_id), o.brand_id && bName.get(o.brand_id)].filter(Boolean).join(" · ")).filter(Boolean))];
      if (shops.length) setShop(shops.join(", "));
    }).catch(() => live && setErr("โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่"));
    return () => { live = false; };
  }, [ids]);

  const isDemo = !!orders?.length && orders.every((o) => o.source === "demo");
  const barcodes = useMemo(() => {
    const m: Record<string, string> = {};
    if (typeof document !== "undefined") for (const o of orders ?? []) { const no = o.order_no ?? o.id; m[no] = barcodeSvg(no); }
    return m;
  }, [orders]);
  const simpleHtml = useMemo(() => {
    if (!orders?.length) return "";
    if (kind === "pack") return packSlipsHtml(orders, { shop, barcodes });
    if (kind === "label" && isDemo) return demoLabelsHtml(orders, { shop, barcodes });
    return "";
  }, [orders, kind, shop, barcodes, isDemo]);

  const tabs = (
    <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
        <button key={k} onClick={() => setKind(k)} className={`h-9 px-3 ${kind === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{KIND_LABEL[k]}</button>
      ))}
    </span>
  );
  const back = <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/master/platform-orders"))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon value="i:arrow-left" />กลับ</button>;

  if (err) return <div className="min-h-screen bg-slate-100 p-6"><div className="mb-4">{back}</div><div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div></div>;
  if (!orders) return <div className="min-h-screen bg-slate-100 py-20 text-center text-slate-400">กำลังโหลด…</div>;
  if (kind === "pick") return <PickView orders={orders} shop={shop} header={<>{back}{tabs}</>} />;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:px-6">
        {back}{tabs}
        <span className="text-sm text-slate-600">{orders.length} ออเดอร์ · {shop}</span>
        <div className="flex-1" />
        {simpleHtml && <button onClick={() => printReportHtmlInNewWindow(simpleHtml)} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">พิมพ์ / บันทึก PDF</button>}
      </div>
      {kind === "label" && !isDemo ? (
        <div className="mx-auto mt-10 max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          <p className="font-medium text-slate-900"><Icon value="i:printer" className="mr-1.5" />ใบปะหน้าจริงต้องใช้ไฟล์ของ Shopee</p>
          <p className="mt-2">ใบปะหน้ามีเลขพัสดุและบาร์โค้ดของขนส่งที่ Shopee ออกให้ — ระบบจะดึงไฟล์มารวมพิมพ์ให้ได้หลังเชื่อมร้าน Shopee (เฟส B)</p>
          <p className="mt-2 text-slate-500">ระหว่างนี้: พิมพ์ใบปะหน้าจาก Seller Centre ตามเดิม · ใช้ <b>ใบหยิบรวม</b> และ <b>ใบแพ็ก</b> จากหน้านี้ได้เลย</p>
        </div>
      ) : (
        <>
          <p className="no-print px-6 pt-3 text-xs text-slate-500">ตอนพิมพ์ให้ตั้ง “ขนาดจริง (100%)”{kind === "label" ? " · กระดาษสติกเกอร์ 100×150 มม. (4×6 นิ้ว)" : " · กระดาษ A4 ตัดครึ่ง"}</p>
          <div className="p-6"><PrintFrame html={simpleHtml} maxWidth={kind === "label" ? 420 : 860} /></div>
        </>
      )}
    </div>
  );
}

function PickView({ orders, shop, header }: { orders: PrintOrder[]; shop: string; header: ReactNode }) {
  const { can } = useAuth();
  const available = useMemo(() => pickColumns(), []);
  const defaults = useMemo(() => pickDefaults(), []);
  const print = useListPrintSettings({ reportKey: "platform-order-pick", family: "platform-order-pick", available, defaults });
  const s = print.settings;
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;
  const result = useMemo(() => buildPickPrint({
    orders, settings: s, shop, company, origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }), [orders, s, shop, company]);
  const html = result.html;
  const doPrint = () => { if (html) printReportHtmlInNewWindow(html); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const frameWidth = s.orientation === "landscape" ? 1180 : 840;
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        {header}
        <span className="min-w-0 truncate text-sm text-slate-600">{orders.length} ออเดอร์ · {result.lines} รายการ · {result.pieces} ชิ้น</span>
        <div className="flex-1" />
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1"><ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} /></div>
        <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[330px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
          <ListPrintPanel state={print} available={available} sorts={PICK_SORTS} groups={PICK_GROUPS} builtinPresets={PICK_PRESETS} companies={companies}
            estimatedPages={estimateListPages(result.groupCounts, s)} defaultTitle={PICK_TITLE} canSaveTeam={can("admin.users")} signatureHint="ผู้หยิบ / ผู้ตรวจ" />
        </aside>
      </div>
    </div>
  );
}

export default function PlatformOrdersPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
