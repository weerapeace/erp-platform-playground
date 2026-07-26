"use client";

/**
 * รายงาน "รายการค้าง" (ของกลาง) — ใช้ทั้งแดชบอร์ดจัดซื้อและแดชบอร์ดผลิต
 *
 * - <PendingDataButton scope> = ปุ่มบนหัวแดชบอร์ด + ป้ายจำนวนค้าง → กดเปิดป๊อปรายงาน
 * - <PendingDataPanel scope>  = ตัวรายงาน (ใช้ซ้ำได้ถ้าอยากฝังในหน้าอื่น)
 * เพิ่มหัวข้อใหม่ = เติมที่ /api/pending-data อย่างเดียว ไม่ต้องแก้หน้าจอ
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { PendingSection, PendingDataResponse } from "@/app/api/pending-data/route";

export type PendingScope = "purchasing" | "production";

const fmt = (n: number) => n.toLocaleString("th-TH");

function SectionCard({ sec }: { sec: PendingSection }) {
  const [open, setOpen] = useState(false);
  const empty = sec.count === 0;
  return (
    <div className={`rounded-xl border ${empty ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
      <button type="button" onClick={() => !empty && setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left">
        <span className="text-lg leading-none mt-0.5">{empty ? "✅" : "⚠️"}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-800">{sec.title}</span>
          <span className="block text-[11px] text-slate-500 mt-0.5">{sec.hint}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-lg font-bold tabular-nums ${empty ? "text-emerald-600" : "text-amber-700"}`}>{fmt(sec.count)}</span>
          {!empty && <span className="block text-[10px] text-slate-400">{open ? "▲ ซ่อน" : "▼ ดูรายการ"}</span>}
        </span>
      </button>

      {!empty && open && (
        <div className="px-3 pb-3">
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-slate-100">
                <tr>{sec.columns.map((c) => <th key={c} className="text-left font-semibold text-slate-600 px-2 py-1.5 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody>
                {sec.rows.map((r, i) => (
                  <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                    {r.map((cell, j) => <td key={j} className="px-2 py-1 text-slate-700 border-t border-slate-100">{cell || <span className="text-slate-300">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400">
              {sec.truncated ? `แสดง ${fmt(sec.rows.length)} จาก ${fmt(sec.count)} รายการ (ที่เหลือดูในใบพิมพ์/หน้าจริง)` : `ทั้งหมด ${fmt(sec.rows.length)} รายการ`}
            </span>
            {sec.fixHref && (
              <Link href={sec.fixHref} className="text-[11px] text-blue-600 hover:underline">{sec.fixLabel ?? "ไปแก้"} →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PendingDataPanel({ scope, onTotal }: { scope: PendingScope; onTotal?: (n: number) => void }) {
  const [secs, setSecs] = useState<PendingSection[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const r = await apiFetch(`/api/pending-data?scope=${scope}`);
        const j = (await r.json()) as PendingDataResponse;
        if (cancel) return;
        if (j.error) { setErr(j.error); setSecs([]); return; }
        setSecs(j.sections);
        onTotal?.(j.sections.reduce((s, x) => s + x.count, 0));
      } catch { if (!cancel) { setErr("โหลดรายงานไม่สำเร็จ"); setSecs([]); } }
    })();
    return () => { cancel = true; };
  }, [scope, onTotal]);

  if (secs === null) return <div className="text-center py-10 text-sm text-slate-400">กำลังรวบรวมรายการค้าง…</div>;
  if (err) return <div className="text-center py-10 text-sm text-rose-600">{err}</div>;

  const total = secs.reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-3">
      <div className={`rounded-xl px-4 py-3 ${total === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
        <p className="text-sm text-slate-700">
          {total === 0
            ? "🎉 ไม่มีรายการค้าง — ข้อมูลครบทุกหัวข้อแล้ว"
            : <>ยังรอใส่ข้อมูลรวม <b className="text-amber-700 text-lg">{fmt(total)}</b> รายการ · กดที่หัวข้อเพื่อดูว่ามีอะไรบ้าง</>}
        </p>
      </div>
      {secs.map((s) => <SectionCard key={s.key} sec={s} />)}
      <p className="text-[11px] text-slate-400">
        💡 กด “🖨 พิมพ์ A4” เพื่อพกกระดาษไปกรอกด้วยมือ (ใบพิมพ์เว้นช่องว่างให้เขียน) แล้วค่อยกลับมาใส่ในระบบ
      </p>
    </div>
  );
}

export function PendingDataButton({ scope, className }: { scope: PendingScope; className?: string }) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const onTotal = useCallback((n: number) => setTotal(n), []);

  // นับยอดค้างไว้โชว์บนปุ่ม (โหลดเบา ๆ ครั้งเดียวตอนเข้าหน้า)
  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const r = await apiFetch(`/api/pending-data?scope=${scope}`);
        const j = (await r.json()) as PendingDataResponse;
        if (!cancel && !j.error) setTotal(j.sections.reduce((s, x) => s + x.count, 0));
      } catch { /* เงียบไว้ — ปุ่มยังกดได้ */ }
    })();
    return () => { cancel = true; };
  }, [scope]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        title="ดูว่ามีข้อมูลอะไรยังรอใส่อยู่บ้าง + พิมพ์ A4 ไปกรอกมือได้"
        className={className ?? "h-9 px-4 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 inline-flex items-center gap-1.5 whitespace-nowrap"}>
        📋 Report รายการค้าง
        {total != null && total > 0 && (
          <span className="text-[11px] font-bold bg-amber-600 text-white rounded-full px-1.5 py-0.5 leading-none">{fmt(total)}</span>
        )}
      </button>

      <ERPModal open={open} onClose={() => setOpen(false)} size="xl" storageKey={`pending-${scope}`}
        title={`📋 รายการค้าง — ${scope === "purchasing" ? "จัดซื้อ" : "ผลิต"}`}
        footer={<>
          <a href={`/print/pending-data?scope=${scope}`} target="_blank" rel="noreferrer"
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 พิมพ์ A4</a>
          <button onClick={() => setOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
        </>}>
        {open && <PendingDataPanel scope={scope} onTotal={onTotal} />}
      </ERPModal>
    </>
  );
}
