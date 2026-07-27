"use client";

/**
 * รายงาน "รายการค้าง" (ของกลาง) — ใช้ทั้งแดชบอร์ดจัดซื้อและแดชบอร์ดผลิต
 *
 * - <PendingDataButton scope> = ปุ่มบนหัวแดชบอร์ด + ป้ายจำนวนค้าง → กดเปิดป๊อปรายงาน
 * - <PendingDataPanel scope>  = ตัวรายงาน (ใช้ซ้ำได้ถ้าอยากฝังในหน้าอื่น)
 *
 * ในตารางทำได้ 2 อย่าง:
 *   1. "ใส่ค่าเร็ว" ของเล็ก ๆ (ราคา/ค่าแรง/เครดิต) → บันทึกกลับต้นทางจริง แล้ว "แถวหายไปเลย" (ค้างลดลง)
 *   2. ปุ่ม ↗ สำหรับงานใหญ่ → ไปหน้าจัดการ พร้อมเปิดรายการนั้นให้
 * เพิ่มหัวข้อใหม่ = เติมที่ /api/pending-data อย่างเดียว ไม่ต้องแก้หน้าจอ
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import type { PendingSection, PendingRow, PendingDataResponse } from "@/app/api/pending-data/route";
import type { PriceSibling } from "@/app/api/pending-data/siblings/route";

export type PendingScope = "purchasing" | "production";

const fmt = (n: number) => n.toLocaleString("th-TH");

// ตัวเลือกเครดิตเทอม — ต้องตรงกับรูปแบบใน lib/credit-term (immediate | eom | days:N | monthday:N)
const CREDIT_OPTS: { v: string; label: string }[] = [
  { v: "immediate", label: "จ่ายเลย (เงินสด)" },
  { v: "days:7", label: "7 วัน" },
  { v: "days:15", label: "15 วัน" },
  { v: "days:30", label: "30 วัน" },
  { v: "days:45", label: "45 วัน" },
  { v: "days:60", label: "60 วัน" },
  { v: "eom", label: "สิ้นเดือน" },
  { v: "monthday:5", label: "ทุกวันที่ 5" },
  { v: "monthday:15", label: "ทุกวันที่ 15" },
];

/** รูปย่อในตาราง (ไม่มีรูป → กล่องจาง ๆ กันตารางเต้น) */
function Thumb({ k }: { k: string | null | undefined }) {
  const src = r2ImageUrl(k, 80);
  if (!src) return <span className="inline-block w-8 h-8 rounded bg-slate-100 border border-slate-200" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className="w-8 h-8 rounded object-cover border border-slate-200 bg-white" />;
}

/** ช่องใส่ค่าเร็ว — บันทึกแล้วเรียก onSaved (แถวจะหายออกจากรายการ) */
function QuickEdit({ sec, row, onSaved }: { sec: PendingSection; row: PendingRow; onSaved: () => void }) {
  const toast = useToast();
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkVal, setLinkVal] = useState(row.link ?? "");     // ลิงก์สินค้า (ร้านออนไลน์)
  const [linkOpen, setLinkOpen] = useState(false);
  // popup ถาม "ใส่ราคาให้พี่น้อง Parent เดียวกันด้วยไหม"
  const [ask, setAsk] = useState<{ value: string; parent: string | null; sibs: PriceSibling[]; picked: Set<string> } | null>(null);
  const ed = sec.edit!;

  const saveLink = async () => {
    if (!row.id) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/pending-data", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "supplier_item_link", id: row.id, value: linkVal }),
      });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกลิงก์แล้ว"); setLinkOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกลิงก์ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const save = async (v: string, ids?: string[]) => {
    if (!v.trim() || !row.id) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/pending-data", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sec.key, id: row.id, value: v, qty: row.qty, ...(ids?.length ? { ids } : {}) }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      toast.success(ids?.length ? `บันทึก${ed.label} ${ids.length} รายการแล้ว` : `บันทึก${ed.label}แล้ว`);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); setBusy(false); }
  };

  // ใส่ราคา: ถ้ามี "พี่น้อง" (Parent เดียวกัน ร้านเดียวกัน ยังไม่มีราคา) → ถามก่อนว่าจะใส่ให้ด้วยไหม
  const saveWithSiblingCheck = async (v: string) => {
    if (!v.trim() || !row.id) return;
    if (sec.key !== "supplier_item_price" || !(row.siblings && row.siblings > 0)) { void save(v); return; }
    setBusy(true);
    try {
      const j = await apiFetch(`/api/pending-data/siblings?supplier_item_id=${encodeURIComponent(row.id)}`).then((x) => x.json());
      const sibs = (j.data ?? []) as PriceSibling[];
      setBusy(false);
      if (sibs.length === 0) { void save(v); return; }
      setAsk({ value: v, parent: (j.parent_name as string) ?? null, sibs, picked: new Set(sibs.map((x) => x.supplier_item_id)) });
    } catch { setBusy(false); void save(v); }
  };

  if (ed.kind === "credit_term") {
    return (
      <select value={val} disabled={busy} onChange={(e) => { setVal(e.target.value); void save(e.target.value); }}
        className="h-7 w-full max-w-[130px] px-1 text-[11px] border border-amber-300 rounded bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50">
        <option value="">— เลือก —</option>
        {CREDIT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <input type="number" min={0} step="any" value={val} disabled={busy}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void saveWithSiblingCheck(val); }}
        placeholder={ed.label}
        className="h-7 w-[76px] px-1.5 text-[11px] text-right border border-amber-300 rounded bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50" />
      {ed.suffix && <span className="text-[10px] text-slate-400">{ed.suffix}</span>}
      <button type="button" disabled={busy || !val.trim()} onClick={() => void saveWithSiblingCheck(val)}
        title={row.siblings ? `บันทึก (มีพี่น้อง Parent เดียวกันอีก ${row.siblings} ตัว — จะถามให้ใส่ด้วย)` : "บันทึกกลับเข้าระบบ"}
        className="h-7 px-1.5 text-[11px] rounded bg-emerald-600 text-white disabled:opacity-30 hover:bg-emerald-700">✓</button>
      {/* ร้านออนไลน์ → ใส่ลิงก์สินค้าได้ตรงนี้เลย */}
      {row.taobao && (linkOpen ? (
        <span className="flex items-center gap-1">
          <input type="url" value={linkVal} disabled={busy} onChange={(e) => setLinkVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveLink(); }} placeholder="วางลิงก์ taobao"
            className="h-7 w-[150px] px-1.5 text-[11px] border border-orange-300 rounded bg-orange-50/40 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <button type="button" disabled={busy} onClick={() => void saveLink()}
            className="h-7 px-1.5 text-[11px] rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40">✓</button>
        </span>
      ) : (
        <button type="button" onClick={() => setLinkOpen(true)} title={row.link ?? "ใส่ลิงก์สินค้าของร้านนี้"}
          className={`h-7 px-1.5 text-[11px] rounded border ${row.link ? "border-orange-300 text-orange-700 bg-orange-50" : "border-dashed border-slate-300 text-slate-400 hover:border-orange-300 hover:text-orange-500"}`}>
          {row.link ? "淘 แก้ลิงก์" : "🔗 ลิงก์"}
        </button>
      ))}

      {/* ถามก่อนบันทึก: ใส่ราคาเดียวกันให้พี่น้อง Parent เดียวกันด้วยไหม */}
      {ask && (
        <ERPModal open onClose={() => setAsk(null)} size="md" title="ใส่ราคาให้รหัสอื่นใน Parent เดียวกันด้วยไหม?"
          description={ask.parent ? `Parent: ${ask.parent}` : undefined}>
          <div className="space-y-2">
            <div className="text-sm text-slate-600">
              ราคาที่จะใส่: <b className="text-slate-800">{ask.value} {ed.suffix}</b> · พบอีก <b>{ask.sibs.length}</b> รหัสในกลุ่มเดียวกัน (ร้านเดียวกัน) ที่ยังไม่มีราคา
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
              {ask.sibs.map((sb) => (
                <label key={sb.supplier_item_id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={ask.picked.has(sb.supplier_item_id)}
                    onChange={(e) => setAsk((a) => {
                      if (!a) return a;
                      const n = new Set(a.picked);
                      if (e.target.checked) n.add(sb.supplier_item_id); else n.delete(sb.supplier_item_id);
                      return { ...a, picked: n };
                    })} />
                  <span className="font-mono text-xs text-slate-500">{sb.code}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-700">{sb.name}</span>
                  {sb.supplier_sku && <span className="text-[11px] text-slate-400">รหัสร้าน {sb.supplier_sku}</span>}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { const v = ask.value; setAsk(null); void save(v); }}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ใส่เฉพาะตัวนี้</button>
              <button disabled={ask.picked.size === 0}
                onClick={() => { const v = ask.value, ids = [row.id!, ...ask.picked]; setAsk(null); void save(v, ids); }}
                className="h-9 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                ใส่ทั้งหมด ({ask.picked.size + 1} รายการ)
              </button>
            </div>
          </div>
        </ERPModal>
      )}
    </span>
  );
}

function SectionCard({ sec }: { sec: PendingSection }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());   // แถวที่ใส่ค่าแล้ว (ซ่อนออก)
  const left = sec.count - done.size;
  const empty = left <= 0;

  return (
    <div className={`rounded-xl border ${empty ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
      <button type="button" onClick={() => sec.count > 0 && setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left">
        <span className="text-lg leading-none mt-0.5">{empty ? "✅" : "⚠️"}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-800">{sec.title}</span>
          <span className="block text-[11px] text-slate-500 mt-0.5">{sec.hint}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-lg font-bold tabular-nums ${empty ? "text-emerald-600" : "text-amber-700"}`}>{fmt(Math.max(0, left))}</span>
          {sec.count > 0 && <span className="block text-[10px] text-slate-400">{open ? "▲ ซ่อน" : "▼ ดูรายการ"}</span>}
        </span>
      </button>

      {sec.count > 0 && open && (
        <div className="px-3 pb-3">
          {sec.edit && (
            <p className="text-[11px] text-amber-700 mb-1.5">
              ✏️ ใส่{sec.edit.label}ในช่องสีเหลืองแล้วกด <b>Enter</b> หรือ ✓ — บันทึกกลับเข้าระบบทันที แถวนั้นจะหายไป
            </p>
          )}
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr>
                  {sec.hasImage && <th className="w-10 px-2 py-1.5" />}
                  {sec.columns.map((c) => <th key={c} className="text-left font-semibold text-slate-600 px-2 py-1.5 whitespace-nowrap">{c}</th>)}
                  {sec.edit && <th className="text-left font-semibold text-amber-700 px-2 py-1.5 whitespace-nowrap bg-amber-50">ใส่{sec.edit.label}ตรงนี้</th>}
                  <th className="w-8 px-1 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((r, i) => done.has(i) ? null : (
                  <tr key={i} className={i % 2 ? "bg-slate-50/50" : ""}>
                    {sec.hasImage && <td className="px-2 py-1 border-t border-slate-100"><Thumb k={r.image} /></td>}
                    {r.cells.map((cell, j) => (
                      <td key={j} className="px-2 py-1 text-slate-700 border-t border-slate-100">{cell || <span className="text-slate-300">—</span>}</td>
                    ))}
                    {sec.edit && (
                      <td className="px-2 py-1 border-t border-slate-100 bg-amber-50/30">
                        {r.id ? <QuickEdit sec={sec} row={r} onSaved={() => setDone((s) => new Set(s).add(i))} />
                              : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className="px-1 py-1 border-t border-slate-100 text-center">
                      {r.openHref && (
                        <a href={r.openHref} target="_blank" rel="noreferrer" title="เปิดรายการนี้ในหน้าจัดการ"
                          className="inline-block px-1 text-slate-400 hover:text-blue-600 text-sm leading-none">↗</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400">
              {sec.truncated ? `แสดง ${fmt(sec.rows.length)} จาก ${fmt(sec.count)} รายการ` : `ทั้งหมด ${fmt(sec.rows.length)} รายการ`}
              {done.size > 0 && <span className="text-emerald-600"> · ใส่ไปแล้ว {fmt(done.size)}</span>}
            </span>
            {sec.fixHref && <Link href={sec.fixHref} className="text-[11px] text-blue-600 hover:underline">{sec.fixLabel ?? "ไปแก้"} →</Link>}
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
        💡 ของเล็ก ๆ ใส่ในตารางได้เลย · งานใหญ่กด ↗ ไปหน้าจัดการ · หรือกด “🖨 พิมพ์ A4” พกกระดาษไปกรอกมือ
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
        title="ดูว่ามีข้อมูลอะไรยังรอใส่อยู่บ้าง + ใส่ค่าได้เลย + พิมพ์ A4 ไปกรอกมือ"
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
