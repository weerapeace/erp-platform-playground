"use client";

import { SendPdfButton } from "./send-pdf";
import { shortcutKey } from "@/lib/shortcut-key";
import { PRINT_EVENT, type PrintHow } from "@/lib/print-log";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "@/components/popover";
import { Icon } from "@/components/icon";
import {
  compactReportLayout,
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  REPORT_FONT_ADJ_MAX,
  REPORT_FONT_ADJ_MIN,
  REPORT_IMAGE_SIZE_MAX_MM,
  REPORT_IMAGE_SIZE_MIN_MM,
  withReportImageSize,
  type ReportLayoutSettings,
} from "@/lib/report-layout";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";

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

/**
 * สั่งพิมพ์เอกสารในกรอบพรีวิว
 * @param fileName ชื่อไฟล์ตั้งต้นตอนเลือก "บันทึกเป็น PDF" — เบราว์เซอร์อ่านจาก <title> ของเอกสารที่พิมพ์
 *   ตั้งทั้งใน iframe และหน้าแม่ (แต่ละเบราว์เซอร์หยิบคนละที่) แล้วคืนค่าเดิมหลังหน้าต่างพิมพ์อ่านไปแล้ว
 */
/** ประกาศว่ากำลังพิมพ์ (หน้าพิมพ์ที่ใช้ usePrintLog บันทึกประวัติการพิมพ์ — lib/print-log.ts) */
function announcePrint(how: PrintHow) {
  try { window.dispatchEvent(new CustomEvent(PRINT_EVENT, { detail: { how } })); } catch { /* ไม่มีใครฟังก็ไม่เป็นไร */ }
}

export function printReportFrameOrWindow(fileName?: string) {
  announcePrint("print");
  const name = typeof fileName === "string" ? fileName.trim() : "";
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-report-print-frame="true"]');
  const frameWindow = frame?.contentWindow;
  const frameDoc = frame?.contentDocument;
  const prevParent = document.title;
  const prevFrame = frameDoc?.title;
  if (name) {
    document.title = name;
    if (frameDoc) frameDoc.title = name;
  }
  try {
    if (frameWindow) {
      frameWindow.focus();
      frameWindow.print();
    } else {
      window.print();
    }
  } finally {
    if (name) {
      // คืนชื่อเดิมหลังหน้าต่างพิมพ์อ่าน title เสร็จ (บางเบราว์เซอร์อ่านแบบ async)
      window.setTimeout(() => {
        document.title = prevParent;
        if (frameDoc && prevFrame != null) frameDoc.title = prevFrame;
      }, 1500);
    }
  }
}

/**
 * ป๊อปอัปโดนบล็อก → โชว์แถบพร้อมลิงก์จริงให้กดเอง
 * (คลิกลิงก์ด้วยมือผู้ใช้ เบราว์เซอร์ไม่บล็อก — ต่างจาก window.open ที่สคริปต์เรียก)
 * เดิมเงียบแล้วถอยไปพิมพ์จาก iframe ซึ่งเอกสารหลายแผ่นจะออกไม่ครบ = ผู้ใช้เห็นเป็น "กดแล้วไม่มีอะไรเกิดขึ้น"
 */
function showPopupBlockedBar(url: string) {
  const ID = "report-popup-blocked-bar";
  document.getElementById(ID)?.remove();
  const bar = document.createElement("div");
  bar.id = ID;
  bar.className = "no-print";
  bar.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:99999;display:flex;align-items:center;gap:12px;background:#0f172a;color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:14px;max-width:92vw;";
  const msg = document.createElement("span");
  msg.textContent = "เบราว์เซอร์บล็อกหน้าต่างพิมพ์ไว้ —";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "กดตรงนี้เพื่อเปิดเอกสารแล้วสั่งพิมพ์";
  link.style.cssText = "color:#93c5fd;text-decoration:underline;font-weight:600;white-space:nowrap;";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✕";
  close.style.cssText = "background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;";
  const dispose = () => { bar.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  close.onclick = dispose;
  link.onclick = () => { setTimeout(dispose, 100); };
  bar.append(msg, link, close);
  document.body.appendChild(bar);
}

/**
 * พิมพ์เอกสารหลายหน้าให้ถูกต้อง — เปิด HTML เอกสารจริงในแท็บใหม่ แล้วสั่งพิมพ์ที่นั่น
 * แก้ปัญหา "พรีวิวเต็มแต่พิมพ์ตัด" เพราะ iframe ในหน้าเพจไม่ไหลข้ามหน้า (พิมพ์ Ctrl+P จะตัดทิ้ง)
 * ป๊อปอัปโดนบล็อก → โชว์ลิงก์ให้กดเอง (ห้ามถอยไปพิมพ์ iframe เงียบ ๆ — เอกสารหลายแผ่นจะออกไม่ครบ)
 */
export function printReportHtmlInNewWindow(html: string) {
  announcePrint("print");
  try {
    const url = URL.createObjectURL(new Blob([printDocHtml(html)], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) { showPopupBlockedBar(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    printReportFrameOrWindow();
  }
}

/**
 * ⚠️⚠️ รูปแตกตอนพิมพ์ — ใส่ที่อยู่เว็บจริงให้เอกสารก่อนเปิดแท็บใหม่
 *
 * เอกสารที่เปิดในแท็บใหม่ถูกสร้างเป็นไฟล์ชั่วคราวในเบราว์เซอร์ (Blob URL = `blob:https://โดเมน/uuid`)
 * ที่อยู่แบบ blob **ต่อ path ไม่ได้** → รูป/ลิงก์ที่เขียนแบบย่อ เช่น `src="/api/r2-image?key=..."`
 * จะ resolve ไม่ออกเลย กลายเป็นรูปแตกทั้งใบ (QR ยังขึ้นเพราะเป็นรูปฝังในตัว data: URL)
 * นี่คือเหตุผลที่ "พรีวิวรูปมา แต่พิมพ์แล้วรูปหาย" — พรีวิวใช้ iframe ซึ่งอ้างที่อยู่หน้าแม่ได้
 *
 * แก้ที่เดียว: ใส่ `<base href="<เว็บจริง>/">` ในหัวเอกสาร → ที่อยู่แบบย่อทุกอันกลับไปชี้เว็บจริง
 * (ห้ามถอด — ถอดเมื่อไหร่ทุกหน้าพิมพ์รวมรูปแตกหมด)
 */
function withDocBase(html: string): string {
  if (typeof window === "undefined" || /<base[\s>]/i.test(html)) return html;
  const base = `<base href="${window.location.origin}/" />`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${base}`) : `${base}\n${html}`;
}

/** ฝังสคริปต์ให้เอกสารเด้งหน้าต่างพิมพ์เองทันทีที่เปิด */
function withAutoPrintScript(html: string): string {
  return html.includes("</body>")
    // รอฟอนต์เว็บ (เช่น ลายมือบนการ์ดของขวัญ) โหลดครบก่อน — ไม่งั้นพิมพ์ออกมาเป็นฟอนต์สำรอง
    ? html.replace("</body>", `<script>window.onload=function(){var go=function(){setTimeout(function(){window.focus();window.print();},350);};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go,go);}else{go();}};</script></body>`)
    : html;
}

/** เอกสารพร้อมเปิดแท็บใหม่ = ใส่ที่อยู่เว็บจริง (กันรูปแตก) + เด้งหน้าต่างพิมพ์เอง */
function printDocHtml(html: string): string {
  return withAutoPrintScript(withDocBase(html));
}

/**
 * ปุ่มพิมพ์แบบ "ลิงก์จริง" — ของกลาง ใช้กับหน้าพิมพ์รวมหลายใบ
 *
 * ⭐ ทำไมต้องเป็น <a> ไม่ใช่ <button> ที่เรียก window.open:
 *    window.open ที่สคริปต์เรียก โดนตัวบล็อกป๊อปอัปได้ (บล็อกแล้วเงียบ = ผู้ใช้เห็นว่า "กดแล้วไม่มีอะไรเกิดขึ้น")
 *    แต่การคลิกลิงก์ด้วยมือผู้ใช้ เบราว์เซอร์ไม่บล็อก → กดแล้วเปิดเอกสารเสมอ
 * เอกสารที่เปิดจะเด้งหน้าต่างพิมพ์เองอัตโนมัติ
 */
export function PrintDocLinkButton({ html, fileName, className, children }: {
  html: string;
  /** ชื่อไฟล์ตอนบันทึก PDF — เบราว์เซอร์อ่านจาก <title> ของเอกสาร (buildReportHtmlMulti ใส่ให้แล้ว) */
  fileName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!html) { setUrl(null); return; }
    const u = URL.createObjectURL(new Blob([printDocHtml(html)], { type: "text/html" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [html]);

  if (!url) return <span className={`${className ?? ""} pointer-events-none opacity-50`}>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noopener" download={undefined} title={fileName} className={className} onClick={() => announcePrint("link")}>
      {children}
    </a>
  );
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

/**
 * @param fileName ใส่แล้วจะมีปุ่ม "⬇ ดาวน์โหลด PDF" + ตั้งชื่อไฟล์ให้ตอนเลือก "บันทึกเป็น PDF"
 *                 (เว็บสั่งเซฟไฟล์เองเงียบ ๆ ไม่ได้ — ต้องผ่านหน้าต่างพิมพ์ของเบราว์เซอร์)
 */
export function PrintToolbar({ onBack, onPrint, fileName }: {
  onBack?: () => void;
  onPrint?: (fileName?: string) => void;
  fileName?: string;
}) {
  const name = typeof fileName === "string" ? fileName.trim() : "";
  const run = () => (onPrint ? onPrint(name || undefined) : printReportFrameOrWindow(name || undefined));
  return (
    <div className="no-print sticky top-0 z-10 bg-slate-100 border-b border-slate-200 px-6 py-3 flex items-center gap-3">
      <button onClick={() => closeOrBack(onBack)} title="ปิดหน้านี้" className="h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
        ✕ ปิด
      </button>
      <div className="flex-1" />
      {name && (
        <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[280px]" title={`ชื่อไฟล์: ${name}.pdf`}>
          ชื่อไฟล์: {name}.pdf
        </span>
      )}
      {name ? (
        <>
          {/* 📤 ส่ง PDF ไป LINE/อีเมล (ของกลาง components/report/send-pdf) — มีให้ทุกหน้าที่ตั้งชื่อไฟล์ */}
          <SendPdfButton fileName={name} />
          <button onClick={run} title="เปิดหน้าต่างพิมพ์เพื่อพิมพ์ออกกระดาษ"
            className="h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
            🖨️ พิมพ์
          </button>
          <button onClick={run}
            title={`กดแล้วเลือกปลายทางเป็น "บันทึกเป็น PDF" — ชื่อไฟล์ตั้งให้แล้วเป็น "${name}.pdf"`}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
            ⬇ ดาวน์โหลด PDF
          </button>
        </>
      ) : (
        <button onClick={run}
          className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2">
          🖨️ พิมพ์ / บันทึก PDF
        </button>
      )}
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
  lines,
  leading,
  trailing,
  cardFieldsPanel,
}: {
  value: ReportLayoutSettings;
  onChange: (next: ReportLayoutSettings) => void;
  onSaveDefault?: () => void;
  onUseDefault?: () => void;
  savingDefault?: boolean;
  defaultMessage?: string | null;
  /** รายการในเอกสาร (ตามลำดับที่บันทึก) — ส่งมา = มีปุ่ม "สลับรายการ" ลากเรียงเองได้ */
  lines?: { label: string; sub?: string | null }[];
  /** ซ้ายสุดของแถบ เช่น เมนู "แบบ" (PrintPresetMenu) — ส่งมา = ปุ่มค่าเริ่มต้นย้ายไปอยู่ในเมนูนั้น ไม่โชว์ปุ่มแยก */
  leading?: ReactNode;
  /** ขวาสุดของแถบ เช่น ปุ่ม "แก้ใบเสนอราคา" */
  trailing?: ReactNode;
  /** แผงจัดช่องในการ์ด (usePrintBlocksEditor().cardPanel) — ส่งมา = เมนูหน้าตามี "ช่องในการ์ด" */
  cardFieldsPanel?: ReactNode;
}) {
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const layout = normalizeReportLayout(value);
  const patch = (next: Partial<ReportLayoutSettings>) => onChange(normalizeReportLayout({ ...layout, ...next }));
  const setImageSize = (mm: number) => onChange(withReportImageSize(layout, mm));
  const [hideOpen, setHideOpen] = useState(false);
  // ลำดับที่ลากเอง: ใช้ได้เมื่อครบทุกบรรทัด (รายการในใบเปลี่ยน = กลับไปตามที่บันทึก)
  const lineCount = lines?.length ?? 0;
  const identity = Array.from({ length: lineCount }, (_, i) => i);
  const orderValid = layout.manualOrder.length === lineCount && layout.manualOrder.every(i => i < lineCount);
  const currentOrder = orderValid ? layout.manualOrder : identity;
  const orderChanged = orderValid && currentOrder.some((v, i) => v !== i);
  const drag = useDragReorder((from, to) => patch({ manualOrder: moveItem(currentOrder, from, to), sortBy: "none" }));
  // ซ่อนข้อมูล — จำนวน/ราคารวมรายการ/เลขลำดับ มีเฉพาะแบบการ์ด (ตารางขาดไม่ได้)
  type ShowKey = "showSku" | "showCustomer" | "showImage" | "showQty" | "showLineTotal" | "showCardNo" | "showNote" | "showTotals" | "showCustomerApproval";
  const hideItems: { key: ShowKey; label: string }[] = [
    { key: "showSku", label: "รหัสสินค้า" },
    { key: "showCustomer", label: "ลูกค้า" },
    { key: "showImage", label: "รูปสินค้า" },
    ...(layout.lineStyle === "cards" ? [
      { key: "showQty" as const, label: "จำนวน" },
      { key: "showLineTotal" as const, label: "ราคารวมรายการ" },
      { key: "showCardNo" as const, label: "เลขลำดับมุมการ์ด" },
    ] : []),
    { key: "showNote", label: "หมายเหตุ" },
    { key: "showTotals", label: "ยอดรวมท้ายใบ" },
    { key: "showCustomerApproval", label: "ช่องลูกค้าอนุมัติ" },
  ];
  const hiddenCount = hideItems.filter(item => !layout[item.key]).length;
  type AdjKey = "cardNameAdjPx" | "cardNoteAdjPx" | "cardPriceAdjPx" | "headerAdjPx";
  const fontItems: { key: AdjKey; label: string }[] = [
    { key: "cardNameAdjPx", label: "ชื่อสินค้า" },
    { key: "cardNoteAdjPx", label: "หมายเหตุ / รุ่น" },
    { key: "cardPriceAdjPx", label: "ราคา" },
    { key: "headerAdjPx", label: "หัวกระดาษ" },
  ];
  const fontAdjusted = fontItems.some(item => layout[item.key] !== 0);
  const menuRow = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50";
  const menuIcon = "shrink-0 text-[15px] text-slate-400";
  const tabBtn = (on: boolean, active = false) => `h-9 rounded-lg border px-4 text-sm font-medium ${on ? "border-slate-900 bg-slate-900 text-white" : active ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

  return (
    // แถบจัดกลุ่มใหม่ (เจ้าของขอ 2026-11-20 "เมนูข้างบนดูใช้ยาก"): แบบ ▾ · ตาราง/การ์ด · ต่อแถว · หน้าตา ▾ · ข้อมูล ▾ · (ปุ่มขวา)
    // ติดใต้แถบพิมพ์ตอนเลื่อนดูใบยาว ๆ (เปิดแผงอยู่ = ไม่ติด กันบังใบ) · แผงรายละเอียด (จัดหน้า/ลายเซ็น/ซ่อน/สลับ/ตัวหนังสือ/เงื่อนไข) เปิดใต้แถบเหมือนเดิม
    <div className={`no-print ${open || signatureOpen || orderOpen || fontOpen || termsOpen || hideOpen || fieldsOpen ? "" : "sticky top-[61px] z-[9] "}mx-auto mb-4 max-w-[1120px] rounded-xl border border-slate-200 bg-white shadow-sm`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        {leading}
        {/* แบบรายการ: ตาราง / การ์ดรูปใหญ่ */}
        <div className="flex h-9 items-center gap-0.5 rounded-lg bg-slate-100 p-1 text-sm" title="แบบการแสดงรายการสินค้า">
          {([["table", "ตาราง"], ["cards", "การ์ด"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => patch({ lineStyle: v })} aria-pressed={layout.lineStyle === v}
              className={`h-7 rounded-md px-3 text-sm font-medium ${layout.lineStyle === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>
          ))}
        </div>
        {layout.lineStyle === "cards" && (
          <div className="flex h-9 items-center gap-0.5 rounded-lg bg-slate-100 p-1 text-sm" title="จำนวนการ์ดต่อแถว — น้อย = รูปและตัวหนังสือใหญ่ขึ้น">
            <span className="px-1.5 text-xs text-slate-500">ต่อแถว</span>
            {[1, 2, 3, 4].map(n => (
              <button key={n} type="button" onClick={() => patch({ cardsPerRow: n })} aria-pressed={layout.cardsPerRow === n}
                className={`h-7 w-7 rounded-md text-sm font-semibold ${layout.cardsPerRow === n ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{n}</button>
            ))}
          </div>
        )}
        {/* หน้าตา ▾ */}
        <Popover align="left" panelClassName="w-64 py-1"
          trigger={(toggle, isOpen) => (
            <button type="button" onClick={toggle} className={tabBtn(isOpen || open || signatureOpen || fontOpen || fieldsOpen, fontAdjusted || layout.cardFields.length > 0)}>
              <span className="inline-flex items-center gap-1.5"><Icon value="i:adjustments-horizontal" className="text-[15px]" />หน้าตา<Icon value="i:chevron-down" className="text-[12px] opacity-60" /></span>
            </button>
          )}>
          {(close) => (
            <>
              <button type="button" className={menuRow} onClick={() => { close(); setOpen(c => !c); }}><Icon value="i:ruler" className={menuIcon} />จัดหน้า (ขอบ · ขนาดตัวอักษร){open ? " ✓" : ""}</button>
              {layout.lineStyle === "cards" && cardFieldsPanel && (
                <button type="button" className={menuRow} onClick={() => { close(); setFieldsOpen(c => !c); }}><Icon value="i:list-check" className={menuIcon} />ช่องในการ์ด (เพิ่ม · เรียง){layout.cardFields.length ? ` • ${layout.cardFields.length}` : ""}</button>
              )}
              {layout.lineStyle === "cards" && (
                <button type="button" className={menuRow} onClick={() => { close(); setFontOpen(c => !c); }}><Icon value="i:typography" className={menuIcon} />ตัวหนังสือแยกส่วน{fontAdjusted ? " •" : ""}</button>
              )}
              {layout.showImage && layout.lineStyle === "table" && (
                <div className="flex items-center gap-1 px-3 py-1.5 text-[13px] text-slate-700" title="ขนาดรูปสินค้าในตาราง — แถวสูง/เตี้ยตามรูปอัตโนมัติ">
                  <Icon value="i:photo" className={menuIcon} /><span className="flex-1">ขนาดรูป</span>
                  <button type="button" onClick={() => setImageSize(layout.imageSizeMm - 2)} disabled={layout.imageSizeMm <= REPORT_IMAGE_SIZE_MIN_MM}
                    aria-label="ลดขนาดรูป" className="h-7 w-7 rounded border border-slate-200 text-base font-semibold hover:bg-slate-50 disabled:opacity-30">−</button>
                  <span className="w-11 text-center font-mono text-xs">{layout.imageSizeMm}mm</span>
                  <button type="button" onClick={() => setImageSize(layout.imageSizeMm + 2)} disabled={layout.imageSizeMm >= REPORT_IMAGE_SIZE_MAX_MM}
                    aria-label="เพิ่มขนาดรูป" className="h-7 w-7 rounded border border-slate-200 text-base font-semibold hover:bg-slate-50 disabled:opacity-30">+</button>
                </div>
              )}
              <button type="button" className={menuRow} onClick={() => { close(); onChange(compactReportLayout(layout)); }}><Icon value="i:minimize" className={menuIcon} />บีบให้ 1 หน้า</button>
              <div className="my-1 border-t border-slate-100" />
              <button type="button" className={menuRow} onClick={() => { close(); setSignatureOpen(c => !c); }}><Icon value="i:signature" className={menuIcon} />ลายเซ็น / ตรา{signatureOpen ? " ✓" : ""}</button>
              <button type="button" className={menuRow} onClick={() => { close(); patch({ signatureToBottom: true }); }}><Icon value="i:chevron-down" className={menuIcon} />ลายเซ็นชิดล่าง{layout.signatureToBottom ? " ✓" : ""}</button>
              <div className="my-1 border-t border-slate-100" />
              <button type="button" className={`${menuRow} text-slate-500`} onClick={() => { close(); onChange(DEFAULT_REPORT_LAYOUT); }}><Icon value="i:refresh" className={menuIcon} />รีเซ็ตหน้าตาทั้งหมด</button>
            </>
          )}
        </Popover>
        {/* ข้อมูล ▾ */}
        <Popover align="left" panelClassName="w-72 py-1"
          trigger={(toggle, isOpen) => (
            <button type="button" onClick={toggle} className={tabBtn(isOpen || hideOpen || orderOpen || termsOpen, hiddenCount > 0 || !layout.showTotals || layout.sortBy !== "none" || orderChanged)}>
              <span className="inline-flex items-center gap-1.5"><Icon value="i:list" className="text-[15px]" />ข้อมูล
                {hiddenCount + (layout.showTotals ? 0 : 1) > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">ซ่อน {hiddenCount + (layout.showTotals ? 0 : 1)}</span>}
                <Icon value="i:chevron-down" className="text-[12px] opacity-60" /></span>
            </button>
          )}>
          {(close) => (
            <>
              <button type="button" className={menuRow} onClick={() => { close(); setHideOpen(c => !c); }}><Icon value="i:eye-off" className={menuIcon} />ซ่อนข้อมูล{hiddenCount ? ` (${hiddenCount})` : ""}</button>
              <label className={`${menuRow} cursor-pointer`} title="ไม่พิมพ์ยอดรวมท้ายใบ (แถวรวม, รวมเงิน, VAT, จำนวนเงินทั้งสิ้น) — เหมาะกับใบที่เสนอหลายราคาตามจำนวน">
                <input type="checkbox" checked={!layout.showTotals} onChange={(e) => patch({ showTotals: !e.target.checked })} className="h-4 w-4 cursor-pointer" />ไม่รวมยอดทั้งหมด
              </label>
              <div className="my-1 border-t border-slate-100" />
              <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-[13px] text-slate-700" title="เรียงรายการเฉพาะตอนพิมพ์ — ลำดับในเอกสารจริงไม่เปลี่ยน">
                <Icon value="i:arrows-sort" className={menuIcon} /><span>เรียง</span>
                <select value={layout.sortBy} onChange={(e) => patch({ sortBy: e.target.value as ReportLayoutSettings["sortBy"] })}
                  className="h-7 flex-1 cursor-pointer rounded border border-slate-200 bg-white px-1 text-[13px] focus:outline-none">
                  <option value="none">ตามที่บันทึก</option>
                  <option value="qty">จำนวน</option>
                  <option value="price">ราคา/หน่วย</option>
                  <option value="sku">รหัสสินค้า</option>
                </select>
                {layout.sortBy !== "none" && (<>
                  <button type="button" onClick={() => patch({ sortDesc: !layout.sortDesc })}
                    className="h-7 rounded border border-slate-200 px-1.5 text-xs font-medium hover:bg-slate-50">{layout.sortDesc ? "มาก→น้อย ↓" : "น้อย→มาก ↑"}</button>
                  <label className="flex w-full cursor-pointer items-center gap-1 pl-6 text-xs" title="เรียงแยกเป็นกลุ่มตามตัวเลือก (สี/ไซส์)">
                    <input type="checkbox" checked={layout.sortGroupByNote} onChange={(e) => patch({ sortGroupByNote: e.target.checked })} className="h-3.5 w-3.5 cursor-pointer" />
                    แยกตามตัวเลือก
                  </label>
                </>)}
              </div>
              {lineCount > 1 && (
                <button type="button" className={menuRow} onClick={() => { close(); setOrderOpen(c => !c); }} title="ลากสลับลำดับรายการเฉพาะตอนพิมพ์">
                  <Icon value="i:grip-vertical" className={menuIcon} />สลับรายการ (ลากเรียงเอง){orderChanged ? " •" : ""}</button>
              )}
              <div className="my-1 border-t border-slate-100" />
              <button type="button" className={menuRow} onClick={() => { close(); setTermsOpen(c => !c); }}><Icon value="i:file-text" className={menuIcon} />เงื่อนไขท้ายใบ{layout.showTerms ? " •" : ""}</button>
            </>
          )}
        </Popover>
        {!leading && onUseDefault && (
          <button type="button" onClick={onUseDefault} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">ใช้ค่าเริ่มต้น</button>
        )}
        {!leading && onSaveDefault && (
          <button type="button" onClick={onSaveDefault} disabled={savingDefault}
            className="h-9 rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {savingDefault ? "กำลังบันทึก..." : "บันทึกเป็นค่าเริ่มต้น"}
          </button>
        )}
        {defaultMessage && <span className="text-xs text-slate-500">{defaultMessage}</span>}
        <span className="flex-1" />
        {trailing}
      </div>

      {fieldsOpen && layout.lineStyle === "cards" && cardFieldsPanel}

      {hideOpen && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          {hideItems.map(item => (
            <label key={item.key} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!layout[item.key]} onChange={(e) => patch({ [item.key]: !e.target.checked } as Partial<ReportLayoutSettings>)} className="h-4 w-4 cursor-pointer" />
              ซ่อน{item.label}
            </label>
          ))}
        </div>
      )}

      {orderOpen && lines && lineCount > 1 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>ลากที่หูจับ ⠿ เพื่อสลับลำดับ — เปลี่ยนเฉพาะตอนพิมพ์ ใบเสนอราคาจริงไม่เปลี่ยน · จำไว้ต่อใบ</span>
            {layout.sortBy !== "none" && <span className="text-amber-700">ตอนนี้เรียงตาม &ldquo;เรียง&rdquo; อยู่ — ลากแล้วจะเปลี่ยนเป็นเรียงตามที่ลาก</span>}
            {orderChanged && (
              <button type="button" onClick={() => patch({ manualOrder: [] })} className="ml-auto h-7 rounded-lg border border-slate-200 px-3 font-medium text-slate-600 hover:bg-slate-50">กลับลำดับเดิม</button>
            )}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {currentOrder.map((lineIdx, pos) => {
              const line = lines[lineIdx];
              return (
                <div key={lineIdx} {...drag.rowProps(pos)} className={`flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm ${drag.rowCls(pos)}`}>
                  <DragHandle {...drag.handleProps(pos)} title="ลากเพื่อสลับลำดับ" />
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{pos + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={`${line?.label ?? ""}${line?.sub ? ` · ${line.sub}` : ""}`}>
                    {line?.label}{line?.sub ? <span className="text-slate-400"> · {line.sub}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fontOpen && layout.lineStyle === "cards" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          {fontItems.map(item => {
            const v = layout[item.key];
            return (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className="font-medium">{item.label}</span>
                <button type="button" onClick={() => patch({ [item.key]: v - 1 } as Partial<ReportLayoutSettings>)} disabled={v <= REPORT_FONT_ADJ_MIN}
                  aria-label={`ลดขนาด${item.label}`} className="h-7 w-8 rounded border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-30">A−</button>
                <span className={`w-12 text-center font-mono text-xs ${v ? "text-sky-700" : "text-slate-400"}`}>{v === 0 ? "ปกติ" : `${v > 0 ? "+" : ""}${v}px`}</span>
                <button type="button" onClick={() => patch({ [item.key]: v + 1 } as Partial<ReportLayoutSettings>)} disabled={v >= REPORT_FONT_ADJ_MAX}
                  aria-label={`เพิ่มขนาด${item.label}`} className="h-7 w-8 rounded border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-30">A+</button>
              </div>
            );
          })}
          {fontAdjusted && (
            <button type="button" onClick={() => patch({ cardNameAdjPx: 0, cardNoteAdjPx: 0, cardPriceAdjPx: 0, headerAdjPx: 0 })}
              className="h-7 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">รีเซ็ตขนาดตัวหนังสือ</button>
          )}
        </div>
      )}

      {termsOpen && (
        <div className="grid gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          <label className="flex w-fit cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" checked={layout.showTerms} onChange={(e) => patch({ showTerms: e.target.checked })} className="h-4 w-4 cursor-pointer" />
            แสดงกล่องเงื่อนไขท้ายใบ
          </label>
          <textarea value={layout.termsText} onChange={(e) => patch({ termsText: e.target.value })} rows={3} maxLength={800}
            placeholder="1 บรรทัด = 1 ข้อ เช่น ยืนราคา 30 วัน"
            className="w-full max-w-2xl rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>1 บรรทัด = 1 ข้อ · กด &ldquo;บันทึกเป็นค่าเริ่มต้น&rdquo; เพื่อใช้ทุกใบ</span>
            <button type="button" onClick={() => patch({ termsText: DEFAULT_REPORT_LAYOUT.termsText })} className="h-7 rounded-lg border border-slate-200 px-3 font-medium text-slate-600 hover:bg-slate-50">ใช้ข้อความตัวอย่าง</button>
          </div>
        </div>
      )}

      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberControl label="ขอบบน" value={layout.topMarginMm} min={0} max={30} unit="mm" onChange={(topMarginMm) => patch({ topMarginMm })} />
            <NumberControl label="ขอบข้าง" value={layout.horizontalMarginMm} min={6} max={25} unit="mm" onChange={(horizontalMarginMm) => patch({ horizontalMarginMm })} />
            <NumberControl label="ขอบล่าง" value={layout.bottomMarginMm} min={0} max={30} unit="mm" onChange={(bottomMarginMm) => patch({ bottomMarginMm })} />
            <NumberControl label="ตัวอักษร" value={layout.fontSizePx} min={8} max={14} unit="px" onChange={(fontSizePx) => patch({ fontSizePx })} />
            <NumberControl label="ความสูงแถว" value={layout.rowHeightMm} min={10} max={36} unit="mm" onChange={(rowHeightMm) => patch({ rowHeightMm })} />
            {layout.showImage && (
              <NumberControl label="ขนาดรูป" value={layout.imageSizeMm} min={REPORT_IMAGE_SIZE_MIN_MM} max={REPORT_IMAGE_SIZE_MAX_MM} unit="mm" onChange={setImageSize} />
            )}
            <NumberControl label="ช่องลายเซ็น" value={layout.signatureGapMm} min={0} max={45} unit="mm" onChange={(signatureGapMm) => patch({ signatureGapMm })} />
          </div>

          <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
            <VisibilityToggle label="รหัสสินค้า" checked={layout.showSku} onChange={(showSku) => patch({ showSku })} />
            <VisibilityToggle label="รูปสินค้า" checked={layout.showImage} onChange={(showImage) => patch({ showImage })} />
            <VisibilityToggle label="เบอร์โทร" checked={layout.showPhone} onChange={(showPhone) => patch({ showPhone })} />
            <VisibilityToggle label="ผู้รับผิดชอบ" checked={layout.showResponsible} onChange={(showResponsible) => patch({ showResponsible })} />
            <VisibilityToggle label="หมายเหตุ" checked={layout.showNote} onChange={(showNote) => patch({ showNote })} />
            <VisibilityToggle label="ยอดรวมท้ายใบ" checked={layout.showTotals} onChange={(showTotals) => patch({ showTotals })} />
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

/** fit = ย่อกระดาษให้พอดีกรอบเมื่อที่แคบ (เช่น มีแผงตั้งค่าอยู่ข้าง ๆ) — ย่อเฉพาะบนจอ ไม่กระทบตอนพิมพ์ */
export function PrintFrame({ html, maxWidth = 840, onPrint, fileName, fit = false, onDocLoad }: {
  html: string; maxWidth?: number; onPrint?: () => void; fileName?: string; fit?: boolean;
  /** เอกสารพรีวิวโหลดเสร็จ (ทุกครั้งที่ html เปลี่ยน) — เช่น ติดตัวจับลากปรับความกว้างคอลัมน์ (ListPrintFrame) */
  onDocLoad?: (doc: Document) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(400);
  // วัดความสูงเนื้อหาจริง — ซ้ำหลายรอบเผื่อฟอนต์/รูปจัดเสร็จช้า
  const measure = () => {
    const d = ref.current?.contentDocument;
    if (!d?.documentElement) return;   // iframe กำลังเปลี่ยนเอกสาร (srcdoc ใหม่) — ยังไม่มีเนื้อ ไม่ต้องวัด
    if (fit) {
      const page = d.querySelector<HTMLElement>(".doc");
      d.documentElement.style.zoom = "1";
      const natural = page?.offsetWidth ?? 0;
      const avail = boxRef.current?.clientWidth ?? 0;
      d.documentElement.style.zoom = natural > 0 && avail > 0 ? String(Math.min(1, avail / natural)) : "1";
    }
    // ย่อแล้ว body = ความสูงหลังย่อ (html ยังนับความสูงก่อนย่อ → เหลือที่ว่างท้ายกรอบ)
    const hh = fit ? d.body?.scrollHeight ?? 0 : Math.max(d.body?.scrollHeight ?? 0, d.documentElement?.scrollHeight ?? 0);
    if (hh > 0) setH(hh);
  };
  // กรอบกว้าง/แคบลง (เปิด-ปิดแผงข้าง ย่อหน้าต่าง) → ย่อกระดาษใหม่
  useEffect(() => {
    if (!fit || typeof ResizeObserver === "undefined" || !boxRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(boxRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);
  const onLoad = () => {
    const ld = ref.current?.contentDocument as (Document & { __pfLoaded?: boolean }) | null | undefined;
    if (ld) { if (ld.__pfLoaded) return; ld.__pfLoaded = true; }
    measure(); setTimeout(measure, 120); setTimeout(measure, 400);
    // กด Ctrl/Cmd+P ขณะโฟกัสอยู่ใน iframe → เด้งหน้าต่างพิมพ์สะอาด (กันพิมพ์ทั้งหน้าเพจแล้วได้หน้าว่าง)
    const doc = ref.current?.contentDocument;
    // ตั้งชื่อเอกสารไว้ล่วงหน้า → กด Ctrl+P เองก็ได้ชื่อไฟล์ถูกเหมือนกดปุ่ม
    if (doc && fileName) doc.title = fileName;
    if (doc && onDocLoad) onDocLoad(doc);
    if (doc) {
      doc.addEventListener("keydown", (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") {
          e.preventDefault();
          if (onPrint) onPrint(); else printReportFrameOrWindow(fileName);
        }
      });
    }
  };
  // กันพลาดเหตุการณ์โหลด: iframe โหลดเสร็จก่อน React ติดตัวฟัง (เจอตอน dev / html พร้อมตั้งแต่แรก) → เรียกเองครั้งเดียว
  useEffect(() => {
    const t = setTimeout(() => {
      const d = ref.current?.contentDocument as (Document & { __pfLoaded?: boolean }) | null | undefined;
      if (d && d.readyState === "complete" && d.body?.childElementCount && !d.__pfLoaded) onLoad();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  return (
    <div ref={boxRef} className="mx-auto bg-white shadow-lg print-document" style={{ maxWidth }}>
      <iframe ref={ref} srcDoc={html} onLoad={onLoad} scrolling="no" data-report-print-frame="true"
        className="w-full bg-white border-0 block" style={{ height: h }} title="Print preview" />
    </div>
  );
}
