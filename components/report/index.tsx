"use client";

import React, { useRef, useState } from "react";
import {
  compactReportLayout,
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  type ReportLayoutSettings,
} from "@/lib/report-layout";

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

export function printReportFrameOrWindow() {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-report-print-frame="true"]');
  const frameWindow = frame?.contentWindow;
  if (frameWindow) {
    frameWindow.focus();
    frameWindow.print();
    return;
  }
  window.print();
}

/**
 * พิมพ์เอกสารหลายหน้าให้ถูกต้อง — เปิด HTML เอกสารจริงในแท็บใหม่ แล้วสั่งพิมพ์ที่นั่น
 * แก้ปัญหา "พรีวิวเต็มแต่พิมพ์ตัด" เพราะ iframe ในหน้าเพจไม่ไหลข้ามหน้า (พิมพ์ Ctrl+P จะตัดทิ้ง)
 * ใช้ Blob URL เพื่อให้รูป/ลิงก์แบบ /api/... resolve ถูก (มี origin จริง) · มี fallback ไป iframe ถ้าป๊อปอัปถูกบล็อก
 */
export function printReportHtmlInNewWindow(html: string) {
  try {
    const withAutoPrint = html.includes("</body>")
      ? html.replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},350);};</script></body>`)
      : html;
    const blob = new Blob([withAutoPrint], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) { URL.revokeObjectURL(url); printReportFrameOrWindow(); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    printReportFrameOrWindow();
  }
}

// ปุ่ม "ปิด" ของหน้าพิมพ์ (ของกลาง): หน้าพิมพ์มักเปิดในแท็บใหม่ → พยายามปิดแท็บก่อน
// ถ้าปิดไม่ได้ (เบราว์เซอร์บล็อกเพราะไม่ได้เปิดด้วยสคริปต์ window.open) → fallback กลับหน้าเดิม
function closeOrBack(onBack?: () => void) {
  try { window.close(); } catch { /* ignore */ }
  window.setTimeout(() => {
    if (typeof window !== "undefined" && !window.closed) {
      if (onBack) onBack();
      else if (window.history.length > 1) window.history.back();
    }
  }, 150);
}

export function PrintToolbar({ onBack, onPrint }: { onBack?: () => void; onPrint?: () => void }) {
  return (
    <div className="no-print sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center gap-3">
      <button onClick={() => closeOrBack(onBack)} title="ปิดหน้านี้" className="h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
        ✕ ปิด
      </button>
      <div className="flex-1" />
      <button onClick={onPrint ?? printReportFrameOrWindow}
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

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-slate-600">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-mono text-slate-900">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-slate-900"
      />
    </label>
  );
}

function VisibilityToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-slate-900"
      />
      <span>{label}</span>
    </label>
  );
}

function ImageAssetControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("เลือกได้เฉพาะไฟล์รูปภาพ");
      return;
    }
    if (file.size > 700 * 1024) {
      setError("รูปใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 700KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ""));
    reader.onerror = () => setError("อ่านไฟล์รูปไม่สำเร็จ");
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="วาง URL รูป หรือเลือกไฟล์จากเครื่อง"
        className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
          เลือกรูป
          <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-8 rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            ล้างรูป
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <img src={value} alt={label} className="h-12 max-w-[120px] object-contain" />
          <span className="text-xs text-slate-500">ตัวอย่างรูปที่จะวางบนเอกสาร</span>
        </div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

export function ReportLayoutControls({
  value,
  onChange,
  onSaveDefault,
  onUseDefault,
  savingDefault = false,
  defaultMessage,
}: {
  value: ReportLayoutSettings;
  onChange: (next: ReportLayoutSettings) => void;
  onSaveDefault?: () => void;
  onUseDefault?: () => void;
  savingDefault?: boolean;
  defaultMessage?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const layout = normalizeReportLayout(value);
  const patch = (next: Partial<ReportLayoutSettings>) => onChange(normalizeReportLayout({ ...layout, ...next }));

  return (
    <div className="no-print mx-auto mb-4 max-w-[1120px] rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className={`h-9 rounded-lg border px-4 text-sm font-medium ${open ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          จัดหน้า
        </button>
        <button
          type="button"
          onClick={() => setSignatureOpen(current => !current)}
          className={`h-9 rounded-lg border px-4 text-sm font-medium ${signatureOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          ลายเซ็น / ตรา
        </button>
        <button
          type="button"
          onClick={() => onChange(compactReportLayout(layout))}
          className="h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          บีบให้ 1 หน้า
        </button>
        <button
          type="button"
          onClick={() => patch({ signatureToBottom: true })}
          className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          ลายเซ็นชิดล่าง
        </button>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_REPORT_LAYOUT)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          รีเซ็ต
        </button>
        {onUseDefault && (
          <button
            type="button"
            onClick={onUseDefault}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ใช้ค่าเริ่มต้น
          </button>
        )}
        {onSaveDefault && (
          <button
            type="button"
            onClick={onSaveDefault}
            disabled={savingDefault}
            className="h-9 rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingDefault ? "กำลังบันทึก..." : "บันทึกเป็นค่าเริ่มต้น"}
          </button>
        )}
        {defaultMessage && <span className="text-xs text-slate-500">{defaultMessage}</span>}
      </div>

      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberControl label="ขอบบน" value={layout.topMarginMm} min={0} max={30} unit="mm" onChange={(topMarginMm) => patch({ topMarginMm })} />
            <NumberControl label="ขอบข้าง" value={layout.horizontalMarginMm} min={6} max={25} unit="mm" onChange={(horizontalMarginMm) => patch({ horizontalMarginMm })} />
            <NumberControl label="ขอบล่าง" value={layout.bottomMarginMm} min={0} max={30} unit="mm" onChange={(bottomMarginMm) => patch({ bottomMarginMm })} />
            <NumberControl label="ตัวอักษร" value={layout.fontSizePx} min={8} max={14} unit="px" onChange={(fontSizePx) => patch({ fontSizePx })} />
            <NumberControl label="ความสูงแถว" value={layout.rowHeightMm} min={10} max={36} unit="mm" onChange={(rowHeightMm) => patch({ rowHeightMm })} />
            <NumberControl label="ช่องลายเซ็น" value={layout.signatureGapMm} min={0} max={45} unit="mm" onChange={(signatureGapMm) => patch({ signatureGapMm })} />
          </div>

          <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
            <VisibilityToggle label="รหัสสินค้า" checked={layout.showSku} onChange={(showSku) => patch({ showSku })} />
            <VisibilityToggle label="รูปสินค้า" checked={layout.showImage} onChange={(showImage) => patch({ showImage })} />
            <VisibilityToggle label="เบอร์โทร" checked={layout.showPhone} onChange={(showPhone) => patch({ showPhone })} />
            <VisibilityToggle label="ผู้รับผิดชอบ" checked={layout.showResponsible} onChange={(showResponsible) => patch({ showResponsible })} />
            <VisibilityToggle label="หมายเหตุ" checked={layout.showNote} onChange={(showNote) => patch({ showNote })} />
            <VisibilityToggle label="ลายเซ็นชิดล่าง" checked={layout.signatureToBottom} onChange={(signatureToBottom) => patch({ signatureToBottom })} />
          </div>
        </div>
      )}

      {signatureOpen && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 lg:grid-cols-2">
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
            <VisibilityToggle
              label="ใส่ลายเซ็นผู้มีอำนาจ"
              checked={layout.showAuthorizedSignature}
              onChange={(showAuthorizedSignature) => patch({ showAuthorizedSignature })}
            />
            <ImageAssetControl
              label="รูปลายเซ็น"
              value={layout.authorizedSignatureUrl}
              onChange={(authorizedSignatureUrl) => patch({ authorizedSignatureUrl })}
            />
            <NumberControl label="ขนาดลายเซ็น" value={layout.authorizedSignatureWidthMm} min={10} max={70} unit="mm" onChange={(authorizedSignatureWidthMm) => patch({ authorizedSignatureWidthMm })} />
            <NumberControl label="เลื่อนซ้าย/ขวา" value={layout.authorizedSignatureOffsetXMm} min={-60} max={60} unit="mm" onChange={(authorizedSignatureOffsetXMm) => patch({ authorizedSignatureOffsetXMm })} />
            <NumberControl label="เลื่อนขึ้น/ลง" value={layout.authorizedSignatureOffsetYMm} min={-40} max={40} unit="mm" onChange={(authorizedSignatureOffsetYMm) => patch({ authorizedSignatureOffsetYMm })} />
          </div>

          <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
            <VisibilityToggle
              label="ใส่ตราประทับบริษัท"
              checked={layout.showCompanyStamp}
              onChange={(showCompanyStamp) => patch({ showCompanyStamp })}
            />
            <ImageAssetControl
              label="รูปตราประทับ"
              value={layout.companyStampUrl}
              onChange={(companyStampUrl) => patch({ companyStampUrl })}
            />
            <NumberControl label="ขนาดตรา" value={layout.companyStampWidthMm} min={10} max={60} unit="mm" onChange={(companyStampWidthMm) => patch({ companyStampWidthMm })} />
            <NumberControl label="เลื่อนซ้าย/ขวา" value={layout.companyStampOffsetXMm} min={-60} max={60} unit="mm" onChange={(companyStampOffsetXMm) => patch({ companyStampOffsetXMm })} />
            <NumberControl label="เลื่อนขึ้น/ลง" value={layout.companyStampOffsetYMm} min={-40} max={40} unit="mm" onChange={(companyStampOffsetYMm) => patch({ companyStampOffsetYMm })} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PrintFrame({ html, maxWidth = 840, onPrint }: { html: string; maxWidth?: number; onPrint?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(400);
  // วัดความสูงเนื้อหาจริง — ซ้ำหลายรอบเผื่อฟอนต์/รูปจัดเสร็จช้า
  const measure = () => {
    const d = ref.current?.contentDocument;
    if (!d) return;
    const hh = Math.max(d.body?.scrollHeight ?? 0, d.documentElement?.scrollHeight ?? 0);
    if (hh > 0) setH(hh);
  };
  const onLoad = () => {
    measure(); setTimeout(measure, 120); setTimeout(measure, 400);
    // กด Ctrl/Cmd+P ขณะโฟกัสอยู่ใน iframe → เด้งหน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่าง)
    const doc = ref.current?.contentDocument;
    if (doc && onPrint) {
      doc.addEventListener("keydown", (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); onPrint(); }
      });
    }
  };
  return (
    <div className="mx-auto bg-white shadow-lg print-document" style={{ maxWidth }}>
      <iframe ref={ref} srcDoc={html} onLoad={onLoad} scrolling="no" data-report-print-frame="true"
        className="w-full bg-white border-0 block" style={{ height: h }} title="Print preview" />
    </div>
  );
}
