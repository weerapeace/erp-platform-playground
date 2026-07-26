"use client";

/**
 * ใบพิมพ์ A4 "รายการค้าง" — /print/pending-data?scope=purchasing|production
 *
 * จุดประสงค์: พกกระดาษไปกรอกด้วยมือ (เดินถามร้าน/ถามช่าง) แล้วกลับมาใส่ในระบบ
 *   → ทุกหัวข้อจึงมี "ช่องว่าง" (blanks) ต่อท้ายให้เขียน
 * ใช้ข้อมูลชุดเดียวกับป๊อปรายงานบนแดชบอร์ด (/api/pending-data)
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { PendingSection, PendingDataResponse } from "@/app/api/pending-data/route";

const SCOPE_LABEL: Record<string, string> = { purchasing: "จัดซื้อ", production: "ผลิต" };
const fmt = (n: number) => n.toLocaleString("th-TH");
const today = () => new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

function SectionTable({ sec, index }: { sec: PendingSection; index: number }) {
  if (sec.count === 0) return null;
  return (
    <section className="pd-section">
      <h2 className="pd-h2">{index}. {sec.title} <span className="pd-count">({fmt(sec.count)} รายการ)</span></h2>
      <p className="pd-hint">{sec.hint}</p>
      <table className="pd-table">
        <thead>
          <tr>
            <th className="pd-no">#</th>
            {sec.hasImage && <th className="pd-img-h">รูป</th>}
            {sec.columns.map((c) => <th key={c}>{c}</th>)}
            {sec.blanks.map((b) => <th key={b} className="pd-blank-h">{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {sec.rows.map((r, i) => {
            const src = r2ImageUrl(r.image, 120);
            return (
              <tr key={i}>
                <td className="pd-no">{i + 1}</td>
                {sec.hasImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <td className="pd-img">{src ? <img src={src} alt="" /> : null}</td>
                )}
                {r.cells.map((cell, j) => <td key={j}>{cell || "—"}</td>)}
                {sec.blanks.map((b) => <td key={b} className="pd-blank" />)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sec.truncated && <p className="pd-note">* แสดง {fmt(sec.rows.length)} จากทั้งหมด {fmt(sec.count)} รายการ</p>}
    </section>
  );
}

// ⚠️ useSearchParams ต้องอยู่ใต้ <Suspense> ไม่งั้น build ไม่ผ่าน (ตาม pattern หน้าพิมพ์อื่น)
function PendingDataPrintInner() {
  const sp = useSearchParams();
  const scope = sp.get("scope") ?? "purchasing";
  const [secs, setSecs] = useState<PendingSection[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch(`/api/pending-data?scope=${encodeURIComponent(scope)}`);
        const j = (await r.json()) as PendingDataResponse;
        if (j.error) { setErr(j.error); setSecs([]); return; }
        setSecs(j.sections);
      } catch { setErr("โหลดข้อมูลไม่สำเร็จ"); setSecs([]); }
    })();
  }, [scope]);

  const total = (secs ?? []).reduce((s, x) => s + x.count, 0);
  const shown = (secs ?? []).filter((s) => s.count > 0);

  return (
    <div className="pd-page">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="pd-toolbar">
        <button onClick={() => window.print()} className="pd-btn pd-btn-primary">🖨 พิมพ์ / บันทึก PDF</button>
        <button onClick={() => window.close()} className="pd-btn">ปิด</button>
        <span className="pd-toolbar-note">กระดาษ A4 · ช่องว่างด้านขวาไว้เขียนด้วยมือ</span>
      </div>

      <div className="pd-doc">
        <header className="pd-header">
          <h1>รายการค้าง — {SCOPE_LABEL[scope] ?? scope}</h1>
          <div className="pd-meta">
            <span>ข้อมูลที่ยังรอใส่ในระบบ · พิมพ์วันที่ {today()}</span>
            <span>รวม {fmt(total)} รายการ</span>
          </div>
          <p className="pd-lead">กรอกช่องว่างด้วยปากกา แล้วนำกลับไปใส่ในระบบตามลิงก์ท้ายใบ</p>
        </header>

        {secs === null ? <p className="pd-loading">กำลังโหลด…</p>
          : err ? <p className="pd-loading">{err}</p>
          : shown.length === 0 ? <p className="pd-loading">🎉 ไม่มีรายการค้าง — ข้อมูลครบทุกหัวข้อแล้ว</p>
          : shown.map((sec, i) => <SectionTable key={sec.key} sec={sec} index={i + 1} />)}

        {shown.length > 0 && (
          <footer className="pd-footer">
            <div className="pd-where">
              <b>กลับไปใส่ข้อมูลที่:</b>
              <ul>{shown.filter((s) => s.fixHref).map((s) => <li key={s.key}>{s.title} → {s.fixLabel} ({s.fixHref})</li>)}</ul>
            </div>
            <div className="pd-sign"><span>ผู้กรอก ______________________</span><span>วันที่ ____________</span></div>
          </footer>
        )}
      </div>

      <style jsx global>{`
        .pd-page { background:#f1f5f9; min-height:100vh; padding:16px; }
        .pd-toolbar { display:flex; gap:8px; align-items:center; max-width:210mm; margin:0 auto 12px; }
        .pd-btn { height:36px; padding:0 16px; font-size:14px; border:1px solid #cbd5e1; background:#fff; border-radius:8px; cursor:pointer; }
        .pd-btn-primary { background:#2563eb; color:#fff; border-color:#2563eb; font-weight:500; }
        .pd-toolbar-note { font-size:12px; color:#64748b; }
        .pd-doc { max-width:210mm; margin:0 auto; background:#fff; padding:14mm 12mm; box-shadow:0 1px 4px rgba(0,0,0,.1);
                  font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif; color:#0f172a; }
        .pd-header { border-bottom:2px solid #0f172a; padding-bottom:8px; margin-bottom:12px; }
        .pd-header h1 { font-size:20px; font-weight:700; margin:0; }
        .pd-meta { display:flex; justify-content:space-between; font-size:12px; color:#475569; margin-top:4px; }
        .pd-lead { font-size:11px; color:#64748b; margin:6px 0 0; }
        .pd-loading { text-align:center; color:#94a3b8; font-size:13px; padding:24px 0; }
        .pd-section { margin:14px 0; break-inside:auto; }
        .pd-h2 { font-size:14px; font-weight:700; margin:0 0 2px; }
        .pd-count { font-weight:400; color:#b45309; font-size:12px; }
        .pd-hint { font-size:11px; color:#64748b; margin:0 0 5px; }
        .pd-table { width:100%; border-collapse:collapse; font-size:11px; }
        .pd-table th, .pd-table td { border:1px solid #94a3b8; padding:3px 5px; text-align:left; vertical-align:top; }
        .pd-table thead th { background:#e2e8f0; font-weight:600; }
        .pd-table thead { display:table-header-group; }   /* ขึ้นหน้าใหม่ให้หัวตารางซ้ำ */
        .pd-table tr { break-inside:avoid; }
        .pd-no { width:26px; text-align:center; color:#64748b; }
        .pd-img-h { width:34px; }
        .pd-img { width:34px; padding:2px !important; text-align:center; }
        .pd-img img { width:30px; height:30px; object-fit:cover; border-radius:3px; display:block; margin:0 auto; }
        .pd-blank-h { background:#fefce8; }
        .pd-blank { background:#fffdf5; min-width:70px; height:20px; }
        .pd-note { font-size:10px; color:#64748b; margin:3px 0 0; }
        .pd-footer { margin-top:16px; border-top:1px solid #cbd5e1; padding-top:8px; break-inside:avoid; }
        .pd-where { font-size:10px; color:#475569; }
        .pd-where ul { margin:3px 0 0; padding-left:16px; }
        .pd-sign { display:flex; gap:40px; justify-content:flex-end; font-size:12px; margin-top:16px; }
        @media print {
          /* บังคับพิมพ์สีพื้น/รูป (เบราว์เซอร์ตัดพื้นหลังทิ้งโดยดีฟอลต์ → ช่องเหลืองกับรูปจะหาย) */
          .pd-doc, .pd-doc * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
          .pd-page { background:#fff; padding:0; }
          .pd-toolbar { display:none; }
          .pd-doc { max-width:none; box-shadow:none; padding:0; }
          @page { size:A4; margin:12mm; }
        }
      `}</style>
    </div>
  );
}

export default function PendingDataPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PendingDataPrintInner /></Suspense>;
}
