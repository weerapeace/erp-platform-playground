"use client";

/**
 * 🏷 แผงพิมพ์ใบปะหน้าจริงจากแพลตฟอร์ม (ของกลาง · 2026-11-26) — ใช้ในหน้าพิมพ์ /print/platform-orders?kind=label
 *   1) ตรวจก่อน (GET /api/shipping-labels): ใบไหนดึงได้ · ใบไหนพิมพ์ไปแล้ว (เมื่อไร โดยใคร)
 *   2) มีใบที่พิมพ์แล้ว → ป๊อปยืนยัน (ConfirmDialog กลาง) เลือกพิมพ์ซ้ำหรือข้าม
 *   3) ขอไฟล์ทีละ 10 ใบ (POST) → รวมเป็น PDF เดียวตามขนาดกระดาษ (จำต่อเครื่อง) → เปิดแท็บใหม่ + พรีวิวในหน้า
 *   4) บันทึก "พิมพ์แล้ว" เฉพาะใบที่ได้ไฟล์ (usePrintLog po_label · track("pdf"))
 *   ใบที่ดึงไม่ได้ = รายชื่อ + เหตุผลภาษาคน + ปุ่มเปิด Seller Centre · ลองใหม่เฉพาะใบที่พลาดได้
 *   กติกา = lib/shipping-label · วางใบลงกระดาษ = ./build-label-pdf
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_LABEL_PAPER, LABEL_FETCH_BATCH, LABEL_PAPERS, LABEL_SOURCES, SMALL_SCALE, alreadyPrinted, chunk, labelPaperOf, printedText,
  type LabelCheckRow, type LabelFetchResult,
} from "@/lib/shipping-label";
import { b64ToBytes, buildLabelPdf } from "./build-label-pdf";

type OrderLite = { id: string; order_no: string | null; source: string | null };
type Fetched = { id: string; order_no: string | null; pdf: Uint8Array };
const PAPER_KEY = "shipping-label.paper";
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ = ข้าม */ } };

export function RealLabelPanel({ orders }: { orders: OrderLite[] }) {
  const ids = useMemo(() => orders.map((o) => o.id), [orders]);
  const [check, setCheck] = useState<LabelCheckRow[] | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [paperCode, setPaperCode] = useState<string>(() => (typeof window !== "undefined" ? safeGet(PAPER_KEY) : null) ?? DEFAULT_LABEL_PAPER);
  const paper = labelPaperOf(paperCode);
  const [askReprint, setAskReprint] = useState(false);
  const [includeReprint, setIncludeReprint] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [fetched, setFetched] = useState<Fetched[]>([]);
  const [failed, setFailed] = useState<LabelFetchResult[]>([]);
  const [pdf, setPdf] = useState<{ url: string; pages: number; minScale: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const openedFor = useRef<string>("");

  const logItems = useMemo(() => fetched.map((f) => ({ doc_id: f.id, doc_no: f.order_no })), [fetched]);
  const track = usePrintLog("po_label", logItems);

  useEffect(() => {
    let live = true;
    apiFetch(`/api/shipping-labels?ids=${encodeURIComponent(ids.join(","))}`).then((r) => r.json())
      .then((j) => { if (!live) return; if (j.error) setCheckErr(j.error); else setCheck(j.orders ?? []); })
      .catch(() => live && setCheckErr("ตรวจออเดอร์ไม่สำเร็จ กรุณาลองใหม่"));
    return () => { live = false; };
  }, [ids]);

  const ready = useMemo(() => (check ?? []).filter((r) => r.supported), [check]);
  const blockedRows = useMemo(() => (check ?? []).filter((r) => !r.supported), [check]);
  const printedRows = useMemo(() => alreadyPrinted(check ?? []), [check]);

  // ประกอบ PDF ใหม่เมื่อได้ไฟล์ / เปลี่ยนขนาดกระดาษ
  useEffect(() => {
    if (!fetched.length) { setPdf(null); return; }
    let live = true; let url = "";
    buildLabelPdf(fetched, paper, `ใบปะหน้า ${fetched.length} ใบ`).then((r) => {
      if (!live) return;
      url = URL.createObjectURL(r.blob);
      setPdf({ url, pages: r.pages, minScale: r.minScale });
    }).catch(() => live && setCheckErr("รวมไฟล์ใบปะหน้าไม่สำเร็จ — ลองกดใหม่ หรือเลือก “ขนาดเดิมจาก Shopee”"));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [fetched, paper]);

  // ได้ไฟล์ชุดใหม่ → เปิดแท็บใหม่ (ครั้งเดียวต่อชุด) + บันทึกว่าพิมพ์แล้ว
  useEffect(() => {
    if (!pdf) return;
    const key = fetched.map((f) => f.id).join(",");
    if (openedFor.current === key) return;
    openedFor.current = key;
    track("pdf");
    const w = window.open(pdf.url, "_blank");
    setBlocked(!w);
  }, [pdf, fetched, track]);

  /** merge = ลองใหม่เฉพาะใบที่พลาด (เก็บใบที่ได้แล้วไว้ แล้วรวมไฟล์ใหม่ทั้งชุด) */
  const run = useCallback(async (list: LabelCheckRow[] | { id: string }[], merge = false) => {
    const todo = list.map((r) => r.id);
    if (!todo.length) return;
    setBusy({ done: 0, total: todo.length }); setFailed([]);
    const got: Fetched[] = []; const bad: LabelFetchResult[] = [];
    for (const part of chunk(todo, LABEL_FETCH_BATCH)) {
      try {
        const j = await apiFetch("/api/shipping-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: part }) }).then((r) => r.json());
        if (j.error) part.forEach((id) => bad.push({ id, order_no: ready.find((r) => r.id === id)?.order_no ?? null, ok: false, reason: j.error }));
        for (const r of (j.results ?? []) as LabelFetchResult[]) {
          if (r.ok && r.pdf) got.push({ id: r.id, order_no: r.order_no, pdf: b64ToBytes(r.pdf) }); else bad.push(r);
        }
      } catch {
        part.forEach((id) => bad.push({ id, order_no: ready.find((r) => r.id === id)?.order_no ?? null, ok: false, reason: "เชื่อมต่อไม่สำเร็จ — ลองใหม่" }));
      }
      setBusy((b) => (b ? { ...b, done: Math.min(b.total, b.done + part.length) } : b));
    }
    const order = (a: Fetched, b: Fetched) => ids.indexOf(a.id) - ids.indexOf(b.id);
    setFailed(bad);
    setFetched((prev) => (merge ? [...prev.filter((p) => !got.some((g) => g.id === p.id)), ...got] : got).sort(order));
    setBusy(null);
  }, [ids, ready]);

  const start = () => { if (printedRows.length) setAskReprint(true); else void run(ready); };
  const confirmReprint = () => {
    setAskReprint(false);
    const skip = new Set(includeReprint ? [] : printedRows.map((r) => r.id));
    void run(ready.filter((r) => !skip.has(r.id)));
  };
  const pickPaper = (code: string) => { setPaperCode(code); safeSet(PAPER_KEY, code); openedFor.current = fetched.map((f) => f.id).join(","); };

  if (checkErr && !check) return <div className="mx-auto mt-6 max-w-xl rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{checkErr}</div>;
  if (!check) return <LoadingState />;
  const sellerCenter = LABEL_SOURCES[orders.find((o) => o.source && LABEL_SOURCES[o.source])?.source ?? "shopee_api"]?.sellerCenter;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-slate-900"><Icon value="i:printer" className="mr-1.5" />ใบปะหน้าจริงจาก Shopee</p>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">พร้อมดึง {ready.length} ใบ</span>
          {printedRows.length > 0 && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">พิมพ์แล้ว {printedRows.length}</span>}
          {blockedRows.length > 0 && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">ดึงไม่ได้ {blockedRows.length}</span>}
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm text-slate-600">ขนาดกระดาษ
            <select value={paper.code} onChange={(e) => pickPaper(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800">
              {LABEL_PAPERS.map((p) => <option key={p.code} value={p.code}>{p.label} · {p.hint}</option>)}
            </select>
          </label>
          <button onClick={start} disabled={!!busy || !ready.length} className="h-10 w-full rounded-lg bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto">
            {busy ? `กำลังดึง ${busy.done}/${busy.total}…` : fetched.length ? "ดึงใหม่ทั้งหมด" : `ดึงใบปะหน้า ${ready.length} ใบ`}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">ดึงได้เฉพาะออเดอร์ที่กด “นัดส่ง” ใน Seller Centre แล้ว · การดึงไม่เปลี่ยนสถานะออเดอร์บน Shopee · ไฟล์ไม่ถูกเก็บในระบบ (มีข้อมูลลูกค้า)</p>
      </div>

      {pdf && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium"><Icon value="i:circle-check" className="mr-1" />ได้ใบปะหน้า {fetched.length} ใบ ({pdf.pages} หน้า)</span>
            <div className="flex-1" />
            <a href={pdf.url} target="_blank" rel="noopener noreferrer" onClick={() => track("pdf")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-800"><Icon value="i:external-link" />เปิดไฟล์ PDF เพื่อพิมพ์</a>
          </div>
          {blocked && <p className="mt-2 text-xs">เบราว์เซอร์กันแท็บใหม่ไว้ — กดปุ่ม “เปิดไฟล์ PDF เพื่อพิมพ์”</p>}
          {pdf.minScale < SMALL_SCALE && <p className="mt-2 text-xs text-amber-700">ใบถูกย่อเหลือ {Math.round(pdf.minScale * 100)}% — ลองสแกนบาร์โค้ดก่อนส่ง ถ้าไม่ติดให้เลือกกระดาษใหญ่ขึ้น</p>}
          <p className="mt-1 text-xs text-emerald-700">ตอนพิมพ์ตั้ง “ขนาดจริง (100%)” · กระดาษ {paper.label}</p>
        </div>
      )}

      {(failed.length > 0 || blockedRows.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">พิมพ์จากระบบไม่ได้ {failed.length + blockedRows.length} ใบ</p>
            <div className="flex-1" />
            {failed.length > 0 && <button onClick={() => void run(failed, true)} disabled={!!busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">ลองใหม่เฉพาะใบที่พลาด</button>}
            {sellerCenter && <a href={sellerCenter} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50"><Icon value="i:external-link" />เปิด Seller Centre</a>}
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {[...failed.map((f) => ({ id: f.id, no: f.order_no, why: f.reason ?? "" })), ...blockedRows.map((b) => ({ id: b.id, no: b.order_no, why: b.reason ?? "" }))].map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
                <span className="shrink-0 font-mono text-xs text-slate-800 sm:w-40">{r.no ?? r.id.slice(0, 8)}</span>
                <span className="min-w-0 text-xs text-slate-600">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pdf && <iframe title="ตัวอย่างใบปะหน้า" src={pdf.url} className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white" />}

      <ConfirmDialog
        open={askReprint}
        onClose={() => setAskReprint(false)}
        onConfirm={confirmReprint}
        title={`มี ${printedRows.length} ใบที่พิมพ์ไปแล้ว`}
        confirmText="พิมพ์ต่อ"
        message={
          <div className="space-y-2">
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {printedRows.map((r) => <li key={r.id}><span className="font-mono text-slate-800">{r.order_no ?? r.id.slice(0, 8)}</span> — {printedText(r.printed)}</li>)}
            </ul>
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={includeReprint} onChange={(e) => setIncludeReprint(e.target.checked)} />
              พิมพ์ใบที่พิมพ์แล้วซ้ำด้วย
            </label>
            {!includeReprint && <p className="text-xs text-slate-500">จะดึงเฉพาะ {ready.length - printedRows.length} ใบที่ยังไม่เคยพิมพ์</p>}
          </div>
        }
      />
    </div>
  );
}
