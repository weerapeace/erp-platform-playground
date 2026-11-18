"use client";

/**
 * 📤 SendPdfButton — ส่ง PDF ของหน้าพิมพ์ไป LINE / อีเมล (ของกลาง · อยู่ในแถบพิมพ์ PrintToolbar ให้เองทุกหน้าที่มีชื่อไฟล์)
 * --------------------------------------------------------------------------
 * - กดปุ่ม → เลือก LINE (กลุ่มที่ตั้งไว้) และ/หรือ อีเมล → แก้ข้อความ → "ส่งตอนนี้" (ส่งเมื่อกดเท่านั้น)
 * - ทำ PDF ในเครื่องจากพรีวิว (jsPDF + html2canvas · โหลดเฉพาะตอนกดส่ง จาก public/vendor)
 * - ไฟล์เก็บ Google Drive "ERP เอกสารที่ส่ง/YYYY-MM" (ไม่ใช่ R2) · LINE ได้ข้อความ+ลิงก์ · อีเมลได้ไฟล์แนบ+ลิงก์
 * - จำผู้รับ + ข้อความล่าสุดต่อชนิดเอกสาร (ในเครื่อง) · บันทึกประวัติการส่งทุกครั้ง
 * ฝั่งเซิร์ฟเวอร์ = /api/print-send · กติกา = lib/print-send
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuthOptional } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import {
  PRINT_SEND_MAX_BYTES, defaultSendMessage, docIdFromPath, docTypeFromPath, parseEmails, readSendMemory, safePdfName, saveSendMemory,
} from "@/lib/print-send";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Win = Window & { jspdf?: { jsPDF: any }; html2canvas?: any };
const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  loaded[src] ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete loaded[src]; reject(new Error("โหลดตัวทำ PDF ไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  });
  return loaded[src];
}

/** พรีวิวเอกสาร (iframe ของ PrintFrame) → PDF A4 (ตัดเป็นหน้าตามความสูง) */
export async function renderPrintFrameToPdf(quality = 0.85, scale = 2): Promise<Blob> {
  await Promise.all([loadScript("/vendor/html2canvas-1.4.1.min.js"), loadScript("/vendor/jspdf-2.5.1.umd.min.js")]);
  const w = window as Win;
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-report-print-frame="true"]');
  const doc = frame?.contentDocument;
  const root = doc?.body ?? document.body;
  if (!w.html2canvas || !w.jspdf) throw new Error("โหลดตัวทำ PDF ไม่สำเร็จ");
  const canvas: HTMLCanvasElement = await w.html2canvas(root, {
    scale, useCORS: true, backgroundColor: "#ffffff", logging: false,
    windowWidth: root.scrollWidth, windowHeight: root.scrollHeight,
  });
  const pdf = new w.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageW = 210, pageH = 297;
  const pxPerPage = Math.floor((canvas.width * pageH) / pageW);
  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  const ctx = slice.getContext("2d")!;
  for (let y = 0, i = 0; y < canvas.height; y += pxPerPage, i++) {
    const h = Math.min(pxPerPage, canvas.height - y);
    slice.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, slice.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (i > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", quality), "JPEG", 0, 0, pageW, (h * pageW) / canvas.width);
  }
  return pdf.output("blob") as Blob;
}

type Targets = { line: { key: string; label: string }[]; email: boolean; drive: boolean };

export function SendPdfButton({ fileName, docType: docTypeProp, docId: docIdProp, className }: {
  fileName: string; docType?: string; docId?: string | null; className?: string;
}) {
  const auth = useAuthOptional();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [useLine, setUseLine] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [lineSel, setLineSel] = useState<string[]>([]);
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "pdf" | "send">("");
  const [err, setErr] = useState<string | null>(null);
  const docType = docTypeProp ?? (typeof location !== "undefined" ? docTypeFromPath(location.pathname) : "doc");
  const docId = docIdProp ?? (typeof location !== "undefined" ? docIdFromPath(location.pathname) : null);
  const pdfName = safePdfName(fileName);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    // ข้อเสนอ 1+3: จำผู้รับ/ข้อความล่าสุดของเอกสารชนิดนี้
    const m = readSendMemory(docType);
    setLineSel(m?.line ?? []); setEmails(m?.emails ?? ""); setUseLine(m?.channels.line ?? false); setUseEmail(m?.channels.email ?? false);
    setMessage(defaultSendMessage(pdfName.replace(/\.pdf$/i, "")));
    if (m?.message) setMessage(m.message.replace(/\{file\}/g, pdfName.replace(/\.pdf$/i, "")));
    apiFetch("/api/print-send").then((r) => r.json()).then((j) => {
      const t: Targets = { line: j.line ?? [], email: !!j.email, drive: !!j.drive };
      setTargets(t);
      setLineSel((s) => s.filter((k) => t.line.some((x) => x.key === k)));
      if (!m) { setUseLine(t.line.length > 0); setUseEmail(t.line.length === 0 && t.email); }
    }).catch(() => setTargets({ line: [], email: false, drive: false }));
  }, [open, docType, pdfName]);

  if (!auth?.can("reports.view" as Parameters<NonNullable<typeof auth>["can"]>[0])) return null;

  const send = async () => {
    setErr(null);
    const em = parseEmails(useEmail ? emails : "");
    if (em.bad.length) { setErr(`อีเมลไม่ถูกต้อง: ${em.bad.join(", ")}`); return; }
    const lines = useLine ? lineSel : [];
    if (!lines.length && !em.ok.length) { setErr("เลือกกลุ่ม LINE หรือใส่อีเมลผู้รับอย่างน้อย 1 ที่"); return; }
    try {
      setBusy("pdf");
      let blob = await renderPrintFrameToPdf();
      if (blob.size > PRINT_SEND_MAX_BYTES) blob = await renderPrintFrameToPdf(0.6, 1.4);   // ใหญ่ไป = ลดคุณภาพรูป
      if (blob.size > PRINT_SEND_MAX_BYTES) throw new Error("ไฟล์ PDF ใหญ่เกิน 4 MB — ลองพิมพ์ทีละน้อยลง");
      setBusy("send");
      const fd = new FormData();
      fd.append("pdf", blob, pdfName);
      fd.append("fileName", pdfName);
      fd.append("docType", docType);
      if (docId) fd.append("docId", docId);
      fd.append("message", message);
      fd.append("lineTargets", JSON.stringify(lines));
      fd.append("emails", JSON.stringify(em.ok));
      const res = await apiFetch("/api/print-send", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "ส่งไม่สำเร็จ");
      saveSendMemory(docType, {
        line: lineSel, emails, channels: { line: useLine, email: useEmail },
        message: message.split(pdfName.replace(/\.pdf$/i, "")).join("{file}"),
      });
      const failed = (j.results ?? []).filter((r: { ok: boolean }) => !r.ok) as { to: string; error?: string }[];
      if (failed.length) toast.error(`ส่งไม่ถึง ${failed.length} ที่: ${failed.map((f) => `${f.to} (${f.error ?? "?"})`).join(" · ")}`, { details: j });
      if (j.ok > 0) toast.action(`ส่งแล้ว ${j.ok} ที่`, "เปิดไฟล์", () => window.open(j.link, "_blank", "noopener"));
      if (!failed.length) setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally { setBusy(""); }
  };

  const chip = (on: boolean) => `h-8 px-3 rounded-full border text-sm ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="ส่ง PDF นี้ไป LINE หรืออีเมล"
        className={className ?? "h-9 px-4 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50"}>📤 ส่ง PDF</button>
      <ERPModal open={open} onClose={() => !busy && setOpen(false)} title={`ส่ง PDF — ${pdfName.replace(/\.pdf$/i, "")}`} size="md" storageKey="print-send-pdf"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={!!busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button type="button" onClick={() => void send()} disabled={!!busy}
              className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {busy === "pdf" ? "กำลังทำ PDF…" : busy === "send" ? "กำลังส่ง…" : "ส่งตอนนี้"}
            </button>
          </div>
        }>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-slate-500">ส่งทาง</span>
            <button type="button" className={chip(useLine)} onClick={() => setUseLine((v) => !v)}>LINE</button>
            <button type="button" className={chip(useEmail)} onClick={() => setUseEmail((v) => !v)}>อีเมล</button>
          </div>
          {useLine && (
            <div className="flex flex-wrap items-start gap-2">
              <span className="w-16 shrink-0 pt-1.5 text-slate-500">LINE ถึง</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {targets == null ? <span className="text-slate-400">กำลังโหลดกลุ่ม…</span>
                  : targets.line.length === 0 ? <span className="text-amber-700">ยังไม่ได้ตั้งกลุ่ม LINE — ตั้งได้ที่ศูนย์ LINE ในหน้าตั้งค่า</span>
                  : targets.line.map((g) => (
                    <button key={g.key} type="button" className={chip(lineSel.includes(g.key))}
                      onClick={() => setLineSel((s) => (s.includes(g.key) ? s.filter((x) => x !== g.key) : [...s, g.key]))}>{g.label}</button>
                  ))}
              </div>
            </div>
          )}
          {useEmail && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-slate-500">อีเมลถึง</span>
              <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@company.com (หลายคนคั่นด้วย ,)"
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3" />
              {targets && !targets.email && <span className="w-full pl-[4.5rem] text-xs text-amber-700">ยังไม่ได้ตั้งค่าการส่งอีเมลของระบบ — แจ้งผู้ดูแล</span>}
            </div>
          )}
          <div>
            <div className="mb-1 text-slate-500">ข้อความ (แก้ได้ · จำไว้ใช้ครั้งหน้ากับเอกสารชนิดนี้)</div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000}
              className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            📄 {pdfName} · เก็บที่ Google Drive › ERP เอกสารที่ส่ง · LINE ได้ลิงก์ (LINE ส่งไฟล์ PDF ตรง ๆ ไม่ได้) · อีเมลได้ไฟล์แนบ · บันทึกประวัติการส่ง
            {targets && !targets.drive && <div className="mt-1 text-amber-700">ยังไม่ได้ตั้งค่า Google Drive — ส่งไม่ได้จนกว่าผู้ดูแลจะตั้ง</div>}
          </div>
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ {err}</div>}
        </div>
      </ERPModal>
    </>
  );
}
