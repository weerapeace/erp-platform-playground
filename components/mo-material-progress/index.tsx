"use client";

/**
 * ความคืบหน้าการซื้อวัตถุดิบของใบสั่งผลิต — ของกลาง (UI)
 * --------------------------------------------------------------------------
 * ข้อมูล: /api/mo/material-progress (สรุปทุกใบในคำขอเดียว) · /api/mo/material-status?mo_no= (รายวัตถุดิบของใบเดียว)
 * กติกาสถานะอยู่ที่ lib/mo-material-status ตัวเดียว → ตัวเลขทุกหน้าที่ใช้ชิ้นนี้ตรงกันเสมอ
 *
 * ใช้ที่: หน้าขอซื้อ (แท็บใบสั่งผลิต) · บอร์ดจ่ายงาน มุมมองตาราง
 *
 *   <MoProgressBar counts={moProgCounts(p)} className="h-1.5" />   แถบสีล้วน
 *   <MoProgressCell p={prog[moNo]} loading={!prog} />              แถบสี + ตัวเลข (ช่องในตาราง)
 *   <MoShortMaterials moNo="MO-2026-00004" />                       รายการของที่ยังไม่ครบ (โหลดเอง)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HoverImage } from "@/components/hover-image";
import type { MoProgress } from "@/app/api/mo/material-progress/route";
import type { MoMaterialStatus, MoMaterialStatusResult } from "@/app/api/mo/material-status/route";

/** สี/ชื่อของแต่ละช่วงในแถบ — ลำดับเดียวกับ moProgCounts */
export const MO_SEGS: [string, string][] = [["bg-rose-500", "ต้องซื้อ"], ["bg-amber-400", "ขอแล้ว รออนุมัติ"], ["bg-blue-500", "สั่งซื้อแล้ว (มี PO)"], ["bg-emerald-500", "มีของ / ได้ของแล้ว"]];
export const moProgCounts = (p: MoProgress) => [p.buy, p.requested, p.ordered, p.done];

/** แถบสีความคืบหน้า (ต้องซื้อ / ขอแล้ว / สั่งแล้ว / มีของ) — counts เรียงตาม MO_SEGS */
export function MoProgressBar({ counts, className }: { counts: number[]; className: string }) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className={`flex rounded-full overflow-hidden bg-slate-100 ${className}`}>
      {total > 0 && counts.map((n, i) => n > 0 && <div key={MO_SEGS[i][1]} className={MO_SEGS[i][0]} style={{ width: `${(n / total) * 100}%` }} title={`${MO_SEGS[i][1]} ${n}`} />)}
    </div>
  );
}

/** ช่อง "ซื้อของ" ในตาราง: แถบสี + ต้องซื้อ / รออนุมัติ / รอของ (ครบแล้ว = ป้ายเขียว) · ไม่มี p = ใบยังไม่มีสูตร */
export function MoProgressCell({ p, loading }: { p: MoProgress | null | undefined; loading?: boolean }) {
  if (loading) return <span className="text-[11px] text-slate-300">กำลังโหลด…</span>;
  if (!p || p.total === 0) return <span className="text-[11px] text-slate-400">— ยังไม่มีสูตร —</span>;
  if (p.buy + p.requested + p.ordered === 0) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">✓ ของครบ {p.total} รายการ</span>;
  }
  const parts: [number, string, string][] = [[p.buy, "ต้องซื้อ", "text-rose-600"], [p.requested, "รออนุมัติ", "text-amber-600"], [p.ordered, "รอของ", "text-blue-600"]];
  return (
    <div className="min-w-0">
      <MoProgressBar counts={moProgCounts(p)} className="h-1.5 w-full max-w-[9rem]" />
      <div className="text-[11px] mt-1 leading-tight">
        {parts.filter(([n]) => n > 0).map(([n, label, cls], i) => (
          <span key={label} className={cls}>{i > 0 && <span className="text-slate-300"> · </span>}{label} {n}</span>
        ))}
        <span className="text-slate-400"> / {p.total}</span>
      </div>
    </div>
  );
}

const OPEN: MoMaterialStatus["status"][] = ["buy", "requested", "ordered"];
const fmtQty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
const ymdBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const thShort = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/**
 * รายการวัตถุดิบที่ "ยังไม่ครบ" ของใบสั่งผลิตใบเดียว (ต้องซื้อ → รออนุมัติ → สั่งแล้วรอของ)
 * โหลดเองตอนแสดง · อ่านอย่างเดียว (จะขอซื้อ/รับของ ไปทำที่หน้าขอซื้อหรือแท็บ "ของซื้อ" ในเช็กลิสต์)
 */
export function MoShortMaterials({ moNo }: { moNo: string }) {
  const [items, setItems] = useState<MoMaterialStatus[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let cancel = false;
    setItems(null); setErr(false);
    apiFetch(`/api/mo/material-status?mo_no=${encodeURIComponent(moNo)}`).then((r) => r.json())
      .then((j: { data?: MoMaterialStatusResult | null }) => { if (!cancel) { if (j.data) setItems(j.data.items); else setErr(true); } })
      .catch(() => { if (!cancel) setErr(true); });
    return () => { cancel = true; };
  }, [moNo]);

  if (err) return <p className="text-xs text-rose-500">โหลดรายการวัตถุดิบไม่สำเร็จ ลองกดปิดแล้วเปิดใหม่</p>;
  if (!items) return <p className="text-xs text-slate-400">กำลังโหลดรายการวัตถุดิบ…</p>;
  if (items.length === 0) return <p className="text-xs text-slate-400">ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM)</p>;
  const open = items.filter((it) => OPEN.includes(it.status)).sort((a, b) => OPEN.indexOf(a.status) - OPEN.indexOf(b.status));
  const doneN = items.length - open.length;
  if (open.length === 0) return <p className="text-xs text-emerald-700">✓ วัตถุดิบครบทั้ง {items.length} รายการ (มีของ / ได้ของ / เตรียมแล้ว)</p>;

  const today = ymdBkk();
  return (
    <div>
      <p className="text-[11px] text-slate-500 mb-1.5">ของที่ยังไม่ครบ <b className="text-slate-700">{open.length}</b> จาก {items.length} รายการ{doneN > 0 ? ` · ครบแล้ว ${doneN}` : ""}</p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {open.map((it) => {
          const u = it.uom ?? "";
          const prNos = [...new Set(it.links.map((l) => l.pr_no).filter(Boolean))].join(", ");
          const poNos = [...new Set(it.links.map((l) => l.po_no).filter(Boolean))].join(", ");
          const eta = it.links.map((l) => l.expected_date).filter((d): d is string => !!d).sort()[0] ?? null;
          const late = !!eta && eta < today;
          const [cls, label] = it.status === "buy" ? ["bg-rose-50 text-rose-700 border-rose-200", "ต้องซื้อ"]
            : it.status === "requested" ? ["bg-amber-50 text-amber-700 border-amber-200", "ขอแล้ว รออนุมัติ"]
            : ["bg-blue-50 text-blue-700 border-blue-200", "สั่งแล้ว รอของ"];
          return (
            <div key={it.summary_id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px]">
              <HoverImage url={it.image} size={28} previewSize={200} />
              <div className="min-w-0 flex-1">
                <div className="text-slate-800 truncate" title={it.name ?? ""}>{it.name ?? it.code}</div>
                {it.code && <div className="text-[10px] font-mono text-slate-400 truncate">{it.code}</div>}
              </div>
              <span className="shrink-0 tabular-nums text-slate-600 whitespace-nowrap">
                {it.status === "buy" ? <>ขาด <b className="text-rose-600">{fmtQty(it.remaining)}</b> {u}</> : <>{fmtQty(it.requested || it.required)} {u}</>}
              </span>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>{label}</span>
              <span className={`shrink-0 w-44 text-[11px] truncate ${late ? "text-rose-600" : "text-slate-400"}`} title={[poNos || prNos, eta ? `ของถึง ${eta}` : ""].filter(Boolean).join(" · ")}>
                {it.status === "ordered"
                  ? <>{poNos || prNos}{eta ? ` · ถึง ${thShort(eta)}` : " · ยังไม่ระบุวันถึง"}{late ? " (เลยกำหนด)" : ""}</>
                  : it.status === "requested" ? (prNos || "—") : (it.requested > 0 ? `ขอแล้วบางส่วน ${prNos}` : "ยังไม่มีใบขอซื้อ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
