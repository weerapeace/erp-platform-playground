"use client";

/**
 * พิมพ์ใบสั่งงานหลายใบทีเดียว — /print/work-order?ids=id1,id2,...
 * โหลด MO + สเปกแต่ละใบ → ต่อเป็นเอกสารเดียว (ขึ้นหน้าใหม่ทุกใบ) ด้วยของกลาง
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PrintFrame, printReportFrameOrWindow } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { buildReportHtmlMulti } from "@/lib/template";
import { buildWorkOrderTemplate, woSectionDataList, buildWoHtmlData, woQrHtml, type MoDetail, type ProductSpec, type WoPrintColumns } from "@/lib/work-order-print";
import { scanUrl } from "@/lib/scan-code";
import { WoColumnSettings, useWoPrintColumns } from "@/components/wo-print-columns";

function BulkPrintInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ids = useMemo(() => (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean), [sp]);

  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { cols: savedCols, reload: reloadCols } = useWoPrintColumns();   // ตั้งค่าคอลัมน์ (ค่ากลางเดียวกับหน้าพิมพ์ใบเดียว)
  const [previewCols, setPreviewCols] = useState<WoPrintColumns | null>(null);   // ค่าที่กำลังปรับในแผง (ยังไม่บันทึก)
  const woCols = previewCols ?? savedCols;

  useEffect(() => {
    if (ids.length === 0) { setError("ไม่ได้เลือกใบสั่งงาน"); setData([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const specCache = new Map<string, ProductSpec | null>();
        const out: Record<string, unknown>[] = [];
        for (const id of ids) {
          const moRes = await apiFetch(`/api/mo/${id}`).then((r) => r.json()).catch(() => ({ error: "load" }));
          if (moRes.error || !moRes.data) { setDone((d) => d + 1); continue; }
          const mo = moRes.data as MoDetail;
          let spec: ProductSpec | null = null;
          const sku = mo.product_sku ?? "";
          if (sku) {
            if (specCache.has(sku)) spec = specCache.get(sku) ?? null;
            else {
              const sr = await apiFetch(`/api/product-spec?sku=${encodeURIComponent(sku)}`).then((r) => r.json()).catch(() => null);
              spec = sr && !sr.error ? (sr as ProductSpec) : null;
              specCache.set(sku, spec);
            }
          }
          // QR ชี้หน้ากลาง /s/<เลขใบ> — ปลายทางเปลี่ยนทีหลังได้โดยไม่ต้องพิมพ์ใบใหม่
          const qr_html = await woQrHtml(scanUrl(mo.mo_no || mo.id));
          out.push({ ...buildWoHtmlData(mo, spec), qr_html });
          if (!cancelled) setDone((d) => d + 1);
        }
        if (!cancelled) setData(out);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    })();
    return () => { cancelled = true; };
  }, [ids]);

  // โหมด "แยกใบ" → แต่ละใบสั่งงานแตกเป็นหลายแผ่นตามส่วนที่เปิดไว้
  const html = useMemo(() => {
    if (!data || !data.length) return "";
    const dataList = data.flatMap((d) => woSectionDataList(d, woCols));
    return buildReportHtmlMulti(buildWorkOrderTemplate(woCols), dataList);
  }, [data, woCols]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="text-sm text-slate-600">🖨️ พิมพ์ใบสั่งงานรวม <b>{ids.length}</b> ใบ {data === null && `(กำลังโหลด ${done}/${ids.length})`}</span>
        <WoColumnSettings onPreview={setPreviewCols} onSaved={reloadCols} />
        <div className="flex-1" />
        <button onClick={() => printReportFrameOrWindow(docFileName("ใบสั่งงานรวม", `${ids.length} ใบ`))} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">⬇ ดาวน์โหลด PDF</button>
      </div>
      <div className="px-4 py-6">
        {error ? <div className="py-20 text-center text-red-500">⚠ {error}</div>
          : data === null ? <div className="py-20 text-center text-slate-400">กำลังโหลด {done}/{ids.length}…</div>
          : data.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีใบสั่งงานให้พิมพ์</div>
          : <PrintFrame html={html} fileName={docFileName("ใบสั่งงานรวม", `${ids.length} ใบ`)} />}
      </div>
    </div>
  );
}

export default function BulkPrintWorkOrderPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><BulkPrintInner /></Suspense>;
}
