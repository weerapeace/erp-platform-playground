"use client";

import React, { useRef, useState } from "react";

// ============================================================
// PrintDocument — เอกสารสำหรับพิมพ์/บันทึก PDF (component กลาง)
// ใช้ window.print() ของ browser → Save as PDF ได้เลย
// ใช้ซ้ำได้ทุกเอกสาร: PR, PO, ใบเสนอราคา, ใบส่งของ ฯลฯ
// ============================================================

export type SignatureSlot = {
  label: string;       // เช่น "ผู้ขอซื้อ"
  name?: string;       // ชื่อผู้เซ็น (ถ้ามี)
  date?: string;       // วันที่
};

export type CompanyInfo = {
  name:     string;
  address?: string;
  phone?:   string;
  taxId?:   string;
  logo?:    string;    // emoji หรือ URL
};

const DEFAULT_COMPANY: CompanyInfo = {
  name: "บริษัท ตัวอย่าง ERP จำกัด",
  address: "123 ถนนตัวอย่าง แขวงทดสอบ เขตสาธิต กรุงเทพฯ 10000",
  phone: "02-000-0000",
  taxId: "0-0000-00000-00-0",
  logo: "🏢",
};

export function PrintDocument({
  company = DEFAULT_COMPANY,
  docTitle,
  docNumber,
  statusLabel,
  meta = [],
  children,
  signatures = [],
  note,
}: {
  company?: CompanyInfo;
  docTitle: string;                       // "ใบขอซื้อ / Purchase Request"
  docNumber?: string;                     // "PR-2026-00001"
  statusLabel?: string;
  meta?: { label: string; value: string }[];  // ผู้ขอ, แผนก, วันที่ ...
  children: React.ReactNode;              // เนื้อหา (ตารางรายการ)
  signatures?: SignatureSlot[];           // ช่องเซ็น
  note?: string;
}) {
  return (
    <div className="print-document mx-auto bg-white text-slate-900" style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}>
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-4xl leading-none">{company.logo}</span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{company.name}</h1>
            {company.address && <p className="text-xs text-slate-500 mt-0.5 max-w-xs">{company.address}</p>}
            <p className="text-xs text-slate-500">
              {company.phone && <>โทร {company.phone}</>}
              {company.taxId && <> · เลขผู้เสียภาษี {company.taxId}</>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-800">{docTitle}</h2>
          {docNumber && <p className="text-sm font-mono text-slate-600 mt-1">{docNumber}</p>}
          {statusLabel && (
            <span className="inline-block mt-1 text-xs border border-slate-300 rounded px-2 py-0.5 text-slate-600">{statusLabel}</span>
          )}
        </div>
      </div>

      {/* ---- Meta grid ---- */}
      {meta.length > 0 && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-sm">
          {meta.map((m, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 w-24 shrink-0">{m.label}</span>
              <span className="text-slate-800 font-medium">{m.value || "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- Body ---- */}
      <div className="mb-6">{children}</div>

      {/* ---- Note ---- */}
      {note && (
        <div className="mb-6 text-sm">
          <p className="text-slate-400 mb-1">หมายเหตุ</p>
          <p className="text-slate-700 border border-slate-200 rounded p-2 min-h-[3em]">{note}</p>
        </div>
      )}

      {/* ---- Signatures ---- */}
      {signatures.length > 0 && (
        <div className="mt-12 grid gap-8" style={{ gridTemplateColumns: `repeat(${signatures.length}, 1fr)` }}>
          {signatures.map((s, i) => (
            <div key={i} className="text-center">
              <div className="border-b border-slate-400 mb-2 pb-8">
                {s.name && <span className="text-sm text-slate-700">{s.name}</span>}
              </div>
              <p className="text-xs text-slate-600">{s.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">วันที่ {s.date || "____/____/____"}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---- Footer ---- */}
      <div className="mt-12 pt-3 border-t border-slate-200 text-center text-xs text-slate-400">
        เอกสารนี้พิมพ์จากระบบ ERP Platform · {new Date().toLocaleString("th-TH")}
      </div>
    </div>
  );
}

// ============================================================
// PrintToolbar — แถบปุ่มพิมพ์ (ซ่อนตอนพิมพ์จริงด้วย .no-print)
// ============================================================

export function PrintToolbar({ onBack }: { onBack?: () => void }) {
  return (
    <div className="no-print sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
          ← กลับ
        </button>
      )}
      <div className="flex-1" />
      <button onClick={() => window.print()}
        className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
        🖨️ พิมพ์ / บันทึก PDF
      </button>
    </div>
  );
}

// ============================================================
// PrintFrame — กรอบแสดง HTML เอกสารพิมพ์ (component กลาง)
// ปรับความสูงตามเนื้อหาจริง (วัด scrollHeight ของ iframe) → ไม่มีช่องว่าง/หน้าว่างเกิน/scroll
// ใช้แทน <iframe srcDoc=... minHeight=1180> เดิมในทุกหน้าพิมพ์ (PR/PO/SO/QT/Design Sheets ฯลฯ)
// ============================================================

export function PrintFrame({ html, maxWidth = 840 }: { html: string; maxWidth?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(400);
  // วัดความสูงเนื้อหาจริง — ซ้ำหลายรอบเผื่อฟอนต์/รูปจัดเสร็จช้า
  const measure = () => {
    const d = ref.current?.contentDocument;
    if (!d) return;
    const hh = Math.max(d.body?.scrollHeight ?? 0, d.documentElement?.scrollHeight ?? 0);
    if (hh > 0) setH(hh);
  };
  const onLoad = () => { measure(); setTimeout(measure, 120); setTimeout(measure, 400); };
  return (
    <div className="mx-auto bg-white shadow-lg print-document" style={{ maxWidth }}>
      <iframe ref={ref} srcDoc={html} onLoad={onLoad} scrolling="no"
        className="w-full bg-white border-0 block" style={{ height: h }} title="Print preview" />
    </div>
  );
}
