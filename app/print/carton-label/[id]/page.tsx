"use client";

/**
 * พิมพ์ใบปะหน้ากล่อง (Carton Label / Shipping Mark) — A5 แนวนอน กล่องละ 1 ใบ
 * โหลดเอกสารจาก /api/carton-labels/[id] แล้วสร้างใบต่อกล่อง (CARTON NO. i/N)
 * หน้าตาเอกสารตายตัว → สร้าง HTML เอง (ไม่ต้องตั้ง template ที่ admin) + ใช้ของกลาง PrintFrame/PrintToolbar
 */
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PrintToolbar, PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import type { CartonLabelRow } from "@/app/api/carton-labels/route";

const esc = (v: unknown) =>
  v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

function buildHtml(doc: CartonLabelRow): string {
  const cartons = Array.isArray(doc.cartons) ? doc.cartons : [];
  const total = cartons.length;
  // ฟิลด์ที่ไม่มีค่า → ไม่ต้องแสดงในใบ (เว้น QUANTITY / CARTON NO. ที่มีเสมอ)
  const rowsFor = (c: { qty: number }, i: number): [string, string][] =>
    ([
      ["จาก", doc.from_text],
      ["ส่ง", doc.to_text],
      ["PO No.", doc.po_no],
      ["STYLE NO.", doc.style_no],
      ["COLOR", doc.color],
      ["QUANTITY", fmt(Number(c.qty) || 0)],
      ["CARTON NO.", `${i + 1}/${total}`],
    ] as [string, string | null | undefined][])
      .filter(([, v]) => String(v ?? "").trim() !== "")
      .map(([k, v]) => [k, String(v)]);

  const labels = cartons.map((c, i) => `
    <section class="label">
      ${rowsFor(c, i).map(([k, v]) => `<div class="r"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}
    </section>`).join("");

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", "Sarabun", sans-serif; color: #111; background: #fff; }
  .label {
    width: 210mm; height: 148mm; padding: 18mm 20mm; margin: 0 auto;
    display: flex; flex-direction: column; justify-content: center;
    page-break-after: always; break-after: page; background: #fff;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .label .r { display: grid; grid-template-columns: 42mm 1fr; align-items: start; padding: 2.4mm 0; }
  .label .k { font-weight: 700; font-size: 17pt; }
  .label .v { font-size: 17pt; }
  @page { size: A5 landscape; margin: 0; }
  @media print { html, body { background: #fff; } .label { margin: 0; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body>${labels}</body></html>`;
}

export default function PrintCartonLabelPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<CartonLabelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/carton-labels/${id}`).then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setDoc(j.data as CartonLabelRow); })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const html = useMemo(() => (doc ? buildHtml(doc) : ""), [doc]);

  return (
    <div className="min-h-screen bg-slate-100">
      <PrintToolbar onBack={() => router.back()} />
      <div className="py-6 px-4">
        {loading ? (
          <div className="text-center py-20 text-slate-400">กำลังโหลด...</div>
        ) : error || !doc ? (
          <div className="text-center py-20 text-red-500">⚠️ {error ?? "ไม่พบเอกสาร"}</div>
        ) : !Array.isArray(doc.cartons) || doc.cartons.length === 0 ? (
          <div className="text-center py-20 text-amber-600">⚠️ เอกสารนี้ยังไม่มีกล่อง</div>
        ) : (
          <PrintFrame html={html} maxWidth={794} />
        )}
      </div>
    </div>
  );
}
