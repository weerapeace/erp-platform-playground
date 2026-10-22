"use client";

/**
 * 🚚 พิมพ์ใบปะหน้า Shippop — /print/shippop-labels?ids=<orderId,...>
 * จองจริง = ใบปะหน้าจาก Shippop (สติกเกอร์ 4×6 นิ้ว) · จองจำลอง = ใบปะหน้าของเราเอง มีลายน้ำ "จำลอง" (ห้ามใช้ส่งจริง)
 * ข้อมูล /api/website/orders/shippop (GET) · พิมพ์/บันทึก PDF ผ่าน PrintFrame กลาง
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { courierLabel } from "@/lib/shippop";
import { ErrorState, LoadingState } from "@/components/state-views";

type Sim = { orderNo: string; name: string; tel: string; address: string; courier: string; tracking: string; cod: number };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function simHtml(list: Sim[]): string {
  const page = (s: Sim) => `<section class="lb"><div class="wm">จำลอง · ห้ามใช้ส่งจริง</div>
<div class="c">${esc(courierLabel(s.courier))}</div><div class="tr">${esc(s.tracking)}</div>
<div class="to"><b>ผู้รับ</b> ${esc(s.name)} · ${esc(s.tel)}<br>${esc(s.address)}</div>
${s.cod > 0 ? `<div class="cod">เก็บเงินปลายทาง ฿${s.cod.toLocaleString("th-TH")}</div>` : ""}<div class="ref">ออเดอร์ ${esc(s.orderNo)}</div></section>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>@page{size:100mm 150mm;margin:0}body{margin:0;font-family:Sarabun,sans-serif}
.lb{position:relative;width:100mm;height:150mm;box-sizing:border-box;padding:8mm;border:1px dashed #999;page-break-after:always;overflow:hidden}
.wm{position:absolute;top:60mm;left:-10mm;right:-10mm;transform:rotate(-25deg);text-align:center;font-size:22px;font-weight:700;color:rgba(220,38,38,.35)}
.c{font-size:16px;font-weight:700}.tr{font-family:monospace;font-size:20px;letter-spacing:1px;margin:4mm 0;border:2px solid #111;padding:2mm;text-align:center}
.to{font-size:14px;line-height:1.5}.cod{margin-top:4mm;font-size:18px;font-weight:700;border:2px solid #111;padding:2mm;text-align:center}.ref{position:absolute;bottom:6mm;font-size:11px;color:#555}</style></head><body>${list.map(page).join("")}</body></html>`;
}

function Inner() {
  const ids = useSearchParams().get("ids") ?? "";
  const [data, setData] = useState<{ html: string | null; sims: Sim[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch(`/api/website/orders/shippop?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setData({ html: j.html ?? null, sims: j.sims ?? [] })))
      .catch(() => setErr("โหลดใบปะหน้าไม่สำเร็จ"));
  }, [ids]);
  const html = useMemo(() => (data ? data.html ?? (data.sims.length ? simHtml(data.sims) : "") : ""), [data]);
  if (err) return <ErrorState title={err} />;
  if (!data) return <LoadingState label="กำลังเตรียมใบปะหน้า…" />;
  if (!html) return <ErrorState title="ยังไม่มีออเดอร์ที่จองขนส่งในรายการนี้" />;
  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <PrintFrame html={html} maxWidth={420} fileName="ใบปะหน้า Shippop" />
    </div>
  );
}

export default function ShippopLabelsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Inner />
    </Suspense>
  );
}
