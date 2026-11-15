"use client";

/**
 * การ์ด "ประวัติการแก้ไข" ของใบสำคัญรับ — ทุกเวอร์ชัน (ใหม่ → เก่า) · ใคร · เมื่อไร · เหตุผล · อะไรเปลี่ยน · ดูใบเวอร์ชันนั้นทั้งใบ
 * ★ 2026-11-15 เจ้าของ: "อยากให้ใบที่ยืนยันแล้ว แก้ไขได้ด้วย แต่ต้องเก็บประวัติ"
 * ข้อมูล: GET /api/purchasing/vouchers/[id]/revise (ตารางกลาง document_revisions)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/landed-cost";
import type { RevisionRow } from "@/lib/document-revisions";

type Row = Record<string, unknown>;
const SHOW = 4;

export function RevisionHistory({ voucherId, sym }: { voucherId: string; sym: string }) {
  const [revs, setRevs] = useState<RevisionRow[] | null>(null);
  const [openRev, setOpenRev] = useState<Record<number, boolean>>({});
  const [view, setView] = useState<RevisionRow | null>(null);
  const [viewBusy, setViewBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    try { const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/revise`).then((r) => r.json()); setRevs((j.data ?? []) as RevisionRow[]); }
    catch { setRevs([]); }
  }, [voucherId]);
  useEffect(() => { void load(); }, [load]);
  const openView = async (rev: number) => {
    setViewBusy(rev);
    try { const j = await apiFetch(`/api/purchasing/vouchers/${voucherId}/revise?rev=${rev}`).then((r) => r.json()); if (j.data) setView(j.data as RevisionRow); }
    finally { setViewBusy(null); }
  };
  if (!revs || revs.length === 0) return null;

  const snap = (view?.snapshot ?? null) as { header?: Row; lines?: Row[] } | null;
  const lineCols: MiniColumn<Row>[] = [
    { key: "n", header: "สินค้า", width: "minmax(10rem,2fr)", cell: (l) => <span className="line-clamp-2">{String(l.item_name ?? "").replace(/^\s*\[[^\]]*\]\s*/, "")}</span> },
    { key: "q", header: "จำนวน", align: "right", width: "5rem", cell: (l) => <span className="tabular-nums">{Number(l.qty ?? 0).toLocaleString()}</span> },
    { key: "p", header: `ราคา (${sym.trim() || "฿"})`, align: "right", width: "6rem", cell: (l) => <span className="tabular-nums">{l.unit_price == null ? "—" : Number(l.unit_price).toLocaleString("th-TH", { maximumFractionDigits: 4 })}</span> },
    { key: "d", header: "ส่วนลด", align: "right", width: "5rem", cell: (l) => <span className="tabular-nums text-red-600">{Number(l.discount_pct) > 0 ? `${l.discount_pct}%` : Number(l.discount) > 0 ? Number(l.discount).toLocaleString() : ""}</span> },
    { key: "t", header: "ค่าสินค้า ฿", align: "right", width: "6.5rem", cell: (l) => <span className="tabular-nums">{l.line_total_thb == null ? "—" : fmtMoney(Number(l.line_total_thb))}</span> },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="history" mode="line" size={15} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">ประวัติการแก้ไข</span>
        <span className="text-[11px] text-slate-400">{revs.length} เวอร์ชัน</span>
      </div>
      <div className="space-y-2">
        {revs.map((r, i) => {
          const diff = r.diff ?? [];
          const all = !!openRev[r.rev_no];
          return (
            <div key={r.id} className={`rounded-lg border px-2.5 py-2 text-xs ${i === 0 ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${i === 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>v{r.rev_no}{i === 0 ? " · ล่าสุด" : ""}</span>
                <span className="text-slate-600">{formatDate(r.created_at)} · {r.actor_name ?? "—"}</span>
                <button type="button" onClick={() => void openView(r.rev_no)} disabled={viewBusy === r.rev_no} className="ml-auto text-[11px] text-blue-600 hover:underline disabled:opacity-50">{viewBusy === r.rev_no ? "กำลังเปิด…" : "ดูใบนี้"}</button>
              </div>
              <div className="mt-1 text-slate-700">{r.action === "confirm" ? "ยืนยันครั้งแรก" : <>แก้: <span className="text-slate-800">&ldquo;{r.reason ?? "—"}&rdquo;</span></>}</div>
              {diff.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {(all ? diff : diff.slice(0, SHOW)).map((d, k) => (
                    <li key={k} className="text-[11px] text-slate-500"><span className="text-slate-600">{d.label}</span> · {d.before ?? "—"} → <b className="font-medium text-slate-800">{d.after ?? "—"}</b></li>
                  ))}
                  {diff.length > SHOW && <li><button type="button" onClick={() => setOpenRev((p) => ({ ...p, [r.rev_no]: !all }))} className="text-[11px] text-blue-600 hover:underline">{all ? "ย่อ" : `ดูอีก ${diff.length - SHOW} จุด`}</button></li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {view && snap && (
        <ERPModal open onClose={() => setView(null)} size="lg" storageKey="pv-revision-view"
          title={`ใบเวอร์ชัน v${view.rev_no}`} description={`${formatDate(view.created_at)} · ${view.actor_name ?? "—"}${view.reason ? ` · ${view.reason}` : view.action === "confirm" ? " · ยืนยันครั้งแรก" : ""}`}>
          <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[["เรท", snap.header?.fx_rate], ["ค่าสินค้า ฿", snap.header?.subtotal_thb], ["ค่าส่งในจีน", snap.header?.seller_ship_foreign], ["ค่าธรรมเนียม ฿", snap.header?.pay_fee_thb], ["ค่าส่งขนส่ง ฿", snap.header?.ship_total_thb], ["รวมทั้งสิ้น ฿", snap.header?.grand_total_thb]]
              .filter(([, v]) => v != null && v !== "")
              .map(([k, v]) => (
                <div key={String(k)} className="rounded-md bg-slate-50 px-2 py-1.5"><div className="text-[10px] text-slate-500">{String(k)}</div><div className="tabular-nums font-medium text-slate-800">{Number(v).toLocaleString("th-TH", { maximumFractionDigits: 4 })}</div></div>
              ))}
          </div>
          <MiniTable rows={snap.lines ?? []} rowKey={(l) => String(l.id)} columns={lineCols} hideToolbar zebra={false} dense />
        </ERPModal>
      )}
    </div>
  );
}
