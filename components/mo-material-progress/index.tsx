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
  if (p.skipped) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap" title="แอดมินข้ามขั้นซื้อของแล้ว (เอาคืนได้ในแผงความคืบหน้า)">⏭ ข้ามซื้อของ</span>;
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
/** จำนวนวันจาก from ถึง today (YYYY-MM-DD) */
const daysSince = (from: string | null | undefined, today: string) =>
  from ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000)) : null;
/** ลำดับ: ยังไม่สั่ง → ขอแล้วรออนุมัติ → สั่งแล้วรอของ → มีของ/ครบแล้ว · สีชื่อวัตถุดิบตามสถานะ */
const STATUS_RANK: Record<string, number> = { buy: 0, requested: 1, ordered: 2 };
const NAME_TONE: Record<string, string> = { buy: "text-rose-700", requested: "text-amber-700", ordered: "text-blue-700" };
const earliest = (it: MoMaterialStatus, key: "pr_date" | "po_date") => it.links.map((l) => l[key]).filter((d): d is string => !!d).sort()[0] ?? null;

/**
 * รายการวัตถุดิบที่ "ยังไม่ครบ" ของใบสั่งผลิตใบเดียว (ต้องซื้อ → รออนุมัติ → สั่งแล้วรอของ)
 * โหลดเองตอนแสดง · อ่านอย่างเดียว (จะขอซื้อ/รับของ ไปทำที่หน้าขอซื้อหรือแท็บ "ของซื้อ" ในเช็กลิสต์)
 */
export function MoShortMaterials({ moNo, allowShowAll = false }: { moNo: string; /** มีติ๊ก "โชว์ที่ครบแล้วด้วย" = ดู BOM ครบทุกรายการ */ allowShowAll?: boolean }) {
  const [items, setItems] = useState<MoMaterialStatus[] | null>(null);
  const [err, setErr] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [moDate, setMoDate] = useState<string | null>(null);   // วันเปิดใบสั่งผลิต — นับ "ยังไม่ซื้อมากี่วัน"
  useEffect(() => {
    let cancel = false;
    setItems(null); setErr(false);
    apiFetch(`/api/mo/material-status?mo_no=${encodeURIComponent(moNo)}`).then((r) => r.json())
      .then((j: { data?: MoMaterialStatusResult | null }) => { if (!cancel) { if (j.data) { setItems(j.data.items); setMoDate(j.data.mo_date ?? null); } else setErr(true); } })
      .catch(() => { if (!cancel) setErr(true); });
    return () => { cancel = true; };
  }, [moNo]);

  if (err) return <p className="text-xs text-rose-500">โหลดรายการวัตถุดิบไม่สำเร็จ ลองกดปิดแล้วเปิดใหม่</p>;
  if (!items) return <p className="text-xs text-slate-400">กำลังโหลดรายการวัตถุดิบ…</p>;
  if (items.length === 0) return <p className="text-xs text-slate-400">ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM)</p>;
  // ยังไม่สั่ง → รออนุมัติ (ขอนานสุดก่อน) → สั่งแล้วรอของ (สั่งนานสุดก่อน)
  const open = items.filter((it) => OPEN.includes(it.status)).sort((a, b) =>
    (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
    || (a.status === "ordered" ? (earliest(a, "po_date") ?? "9999").localeCompare(earliest(b, "po_date") ?? "9999")
      : a.status === "requested" ? (earliest(a, "pr_date") ?? "9999").localeCompare(earliest(b, "pr_date") ?? "9999") : 0));
  const doneN = items.length - open.length;
  if (open.length === 0 && !showAll) return (
    <div className="flex items-center gap-3 flex-wrap">
      <p className="text-xs text-emerald-700">✓ วัตถุดิบครบทั้ง {items.length} รายการ (มีของ / ได้ของ / เตรียมแล้ว)</p>
      {allowShowAll && <button type="button" onClick={() => setShowAll(true)} className="text-[11px] text-blue-600 underline">ดูทั้ง {items.length} รายการ</button>}
    </div>
  );
  const list = showAll ? [...open, ...items.filter((it) => !OPEN.includes(it.status))] : open;

  const today = ymdBkk();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-500">ของที่ยังไม่ครบ <b className="text-slate-700">{open.length}</b> จาก {items.length} รายการ{doneN > 0 ? ` · ครบแล้ว ${doneN}` : ""}</p>
        {allowShowAll && doneN > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" /> โชว์ที่ครบแล้วด้วย
          </label>
        )}
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {list.map((it) => {
          if (!OPEN.includes(it.status)) {
            // ครบแล้ว: มีของ / รับของแล้ว / เตรียมแล้ว / ไม่ต้องซื้อ
            const doneLabel = it.status === "received" ? "รับของแล้ว" : it.status === "ready" ? "เตรียมแล้ว" : it.status === "skip" ? "ไม่ต้องซื้อ" : "มีของแล้ว";
            return (
              <div key={it.summary_id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] bg-slate-50/50">
                <HoverImage url={it.image} size={28} previewSize={200} />
                <div className="min-w-0 flex-1">
                  <div className="text-emerald-700 truncate" title={it.name ?? ""}>{it.name ?? it.code}</div>
                  {it.code && <div className="text-[10px] font-mono text-slate-400 truncate">{it.code}</div>}
                </div>
                <span className="shrink-0 tabular-nums text-slate-400 whitespace-nowrap">ใช้ {fmtQty(it.required)} {it.uom ?? ""}</span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${it.status === "skip" ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>✓ {doneLabel}</span>
                <span className="shrink-0 w-56" />
              </div>
            );
          }
          const u = it.uom ?? "";
          const prNos = [...new Set(it.links.map((l) => l.pr_no).filter(Boolean))].join(", ");
          const poNos = [...new Set(it.links.map((l) => l.po_no).filter(Boolean))].join(", ");
          const eta = it.links.map((l) => l.expected_date).filter((d): d is string => !!d).sort()[0] ?? null;
          const late = !!eta && eta < today;
          const poDate = earliest(it, "po_date");
          const prDate = earliest(it, "pr_date");
          const waitBuy = it.status === "buy" ? daysSince(moDate, today) : null;
          const waitReq = it.status === "requested" ? daysSince(prDate, today) : null;
          const [cls, label] = it.status === "buy" ? ["bg-rose-50 text-rose-700 border-rose-200", "ต้องซื้อ"]
            : it.status === "requested" ? ["bg-amber-50 text-amber-700 border-amber-200", "ขอแล้ว รออนุมัติ"]
            : ["bg-blue-50 text-blue-700 border-blue-200", "สั่งแล้ว รอของ"];
          return (
            <div key={it.summary_id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px]">
              <HoverImage url={it.image} size={28} previewSize={200} />
              <div className="min-w-0 flex-1">
                <div className={`font-medium truncate ${NAME_TONE[it.status] ?? "text-slate-800"}`} title={it.name ?? ""}>{it.name ?? it.code}</div>
                {it.code && <div className="text-[10px] font-mono text-slate-400 truncate">{it.code}</div>}
              </div>
              <span className="shrink-0 tabular-nums text-slate-600 whitespace-nowrap">
                {it.status === "buy" ? <>ขาด <b className="text-rose-600">{fmtQty(it.remaining)}</b> {u}</> : <>{fmtQty(it.requested || it.required)} {u}</>}
              </span>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>{label}</span>
              <span className="shrink-0 w-56 text-[11px] leading-tight" title={[poNos || prNos, poDate ? `สั่ง ${poDate}` : "", eta ? `ของถึง ${eta}` : "", moDate && it.status === "buy" ? `นับจากวันเปิดใบสั่งผลิต ${moDate}` : ""].filter(Boolean).join(" · ")}>
                {it.status === "ordered" ? (<>
                  <span className="block truncate text-slate-500">{poNos || prNos}{poDate ? <> · <b className="font-medium text-blue-700">สั่ง {thShort(poDate)}</b></> : null}</span>
                  <span className={`block truncate ${late ? "text-rose-600" : "text-slate-400"}`}>{eta ? `ถึง ${thShort(eta)}` : "ยังไม่ระบุวันถึง"}{late ? " (เลยกำหนด)" : ""}</span>
                </>) : it.status === "requested" ? (<>
                  <span className="block truncate text-slate-500">{prNos || "—"}</span>
                  <span className="block truncate text-amber-700">{prDate ? `ขอเมื่อ ${thShort(prDate)}` : "รออนุมัติ"}{waitReq != null ? ` · รออนุมัติ ${waitReq} วัน` : ""}</span>
                </>) : (<>
                  <span className="block truncate text-slate-400">{it.requested > 0 ? `ขอแล้วบางส่วน ${prNos}` : "ยังไม่มีใบขอซื้อ"}</span>
                  {waitBuy != null && (
                    <span className={`mt-0.5 inline-block rounded px-1.5 py-px font-medium ${waitBuy >= 14 ? "bg-rose-100 text-rose-700" : waitBuy >= 7 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
                      ยังไม่ซื้อ {waitBuy} วันแล้ว
                    </span>
                  )}
                </>)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
