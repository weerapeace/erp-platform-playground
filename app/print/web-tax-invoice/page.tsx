"use client";

/**
 * 🧾 พิมพ์ใบกำกับภาษีเต็มรูปของออเดอร์เว็บ — /print/web-tax-invoice?id=<orderId>
 * ต้นฉบับ + สำเนา (A4) · พิมพ์/บันทึก PDF จาก PrintFrame กลาง · ข้อมูล /api/website/orders/tax-invoice (ต้องออกเลขก่อน)
 * หน้าตา: lib/website-tax-invoice-print
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintFrame } from "@/components/report";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { taxInvoiceHtml, type TaxInvoiceDoc } from "@/lib/website-tax-invoice-print";
import { ErrorState, LoadingState } from "@/components/state-views";

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  const [doc, setDoc] = useState<TaxInvoiceDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch(`/api/website/orders/tax-invoice?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setDoc(j.doc)))
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"));
  }, [id]);
  const html = useMemo(() => (doc ? taxInvoiceHtml(doc) : ""), [doc]);
  if (err) return <ErrorState title={err} />;
  if (!doc) return <LoadingState label="กำลังเตรียมใบกำกับภาษี…" />;
  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3">
      <PrintFrame html={html} fileName={docFileName(doc.company.vatRegistered ? "ใบกำกับภาษี" : "ใบเสร็จรับเงิน", doc.no)} />
    </div>
  );
}

export default function WebTaxInvoicePrintPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Inner />
    </Suspense>
  );
}
