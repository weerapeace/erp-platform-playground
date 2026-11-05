"use client";

/**
 * PrHistoryButton — ปุ่ม "ประวัติการขอซื้อ" + ป๊อปรายการ PR ล่าสุด (self-contained)
 * ใช้ในหน้าขอซื้อ: <PrHistoryButton /> (แตะ page แค่บรรทัดเดียว)
 * 2026-11-05 (เจ้าของสั่ง "ดูง่าย มีสถานะที่สั่ง group เป็นร้าน/วันที่สั่งได้ มี view การ์ด"):
 *   • แถบ 5 ช่อง ขอซื้อ → ออกใบสั่งซื้อ → สั่งร้าน → รับบางส่วน → รับครบ (กติกา lib/pr-progress ที่เดียว)
 *   • ชิปสถานะจ่ายเงิน = ของกลาง PoPayChip · กดเลขใบสั่งซื้อ = เปิดป๊อปใบสั่งซื้อ (PoDetailModal)
 *   • จัดกลุ่ม ตามสถานะ / ร้าน / วันที่สั่ง + มุมมอง แถว / การ์ด — จำต่อคน (useUserPref)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { PoDetailModal } from "@/components/po-detail-modal";
import { PoPayChip } from "@/components/po-pay-chip";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { useUserPref } from "@/lib/use-user-pref";
import { PR_STAGE_LABEL, PR_STAGE_STEPS, type PrProgress, type PrStage } from "@/lib/pr-progress";
import type { PoPayState } from "@/lib/po-pay-state";

type Row = {
  id: string; pr_no: string; seller_name: string; item_name: string; code: string; image_url: string | null;
  qty: number; uom: string; line_total: number; currency: string;
  order_date: string | null; created_at: string | null; requester: string; status: string; reject_reason: string | null;
  mo_nos: string[]; po_id: string | null; po_no: string | null; qty_received: number;
  progress: PrProgress; pay: PoPayState | null;
};

// สีต่อขั้น (Tailwind ตัวหนังสือตรง ๆ · "blue" ในระบบถูก override เป็นส้ม → ใช้ sky/violet/amber/rose/emerald)
const STAGE_UI: Record<PrStage, { chip: string; bar: string }> = {
  requested: { chip: "bg-rose-50 text-rose-700 border-rose-200", bar: "bg-rose-400" },
  po_draft:  { chip: "bg-amber-50 text-amber-800 border-amber-300", bar: "bg-amber-400" },
  ordered:   { chip: "bg-sky-50 text-sky-700 border-sky-200", bar: "bg-sky-500" },
  receiving: { chip: "bg-violet-50 text-violet-700 border-violet-200", bar: "bg-violet-500" },
  received:  { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" },
  rejected:  { chip: "bg-slate-100 text-slate-600 border-slate-300", bar: "bg-slate-400" },
  cancelled: { chip: "bg-slate-100 text-slate-500 border-slate-200", bar: "bg-slate-300" },
};
const STAGE_ORDER: PrStage[] = [...PR_STAGE_STEPS, "rejected", "cancelled"];
const STEP_SHORT = ["ขอซื้อ", "ออกใบสั่งซื้อ", "สั่งร้าน", "รับบางส่วน", "รับครบ"];

type GroupBy = "stage" | "shop" | "date";
type ViewMode = "list" | "card";
const GROUPS: [GroupBy, string][] = [["stage", "ตามสถานะ"], ["shop", "ตามร้าน"], ["date", "ตามวันที่สั่ง"]];
const parseGroup = (v: unknown): GroupBy | null => (v === "stage" || v === "shop" || v === "date" ? v : null);
const parseView = (v: unknown): ViewMode | null => (v === "list" || v === "card" ? v : null);

/** แถบ 5 ช่อง — ถึงขั้นไหนแล้ว (นอกเส้น = เทาทั้งแถบ) */
function StageBar({ p }: { p: PrProgress }) {
  const ui = STAGE_UI[p.stage];
  return (
    <div className="flex gap-0.5" title={PR_STAGE_STEPS.map((_, i) => `${i <= p.step ? "✓" : "·"} ${STEP_SHORT[i]}`).join("  ")}>
      {PR_STAGE_STEPS.map((_, i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${p.step >= 0 && i <= p.step ? ui.bar : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

function StageChip({ p }: { p: PrProgress }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${STAGE_UI[p.stage].chip}`}>{p.label}</span>;
}

export function PrHistoryButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stageF, setStageF] = useState<PrStage | "">("");
  const [poOpen, setPoOpen] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useUserPref<GroupBy>("pr_history_group", "stage", parseGroup);
  const [view, setView] = useUserPref<ViewMode>("pr_history_view", "list", parseView);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch("/api/purchasing/pr-history").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as Row[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  // ค้นหาก่อน → นับชิปสถานะจากผลค้นหา (ตัวเลขตรงกับที่จะเห็น) → ค่อยกรองสถานะ
  const searched = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => [r.item_name, r.code, r.seller_name, r.requester, r.pr_no, r.po_no ?? "", r.mo_nos.join(" ")].some((s) => s.toLowerCase().includes(ql)));
  }, [rows, q]);
  const stageCount = useMemo(() => {
    const c = new Map<PrStage, number>();
    for (const r of searched) c.set(r.progress.stage, (c.get(r.progress.stage) ?? 0) + 1);
    return c;
  }, [searched]);
  const shown = useMemo(() => (stageF ? searched.filter((r) => r.progress.stage === stageF) : searched), [searched, stageF]);

  const groups = useMemo(() => {
    const by = new Map<string, Row[]>();
    const keyOf = (r: Row) => groupBy === "stage" ? r.progress.stage
      : groupBy === "shop" ? (r.seller_name || "—")
      : ((r.order_date ?? r.created_at ?? "").slice(0, 10) || "—");
    for (const r of shown) { const k = keyOf(r); const a = by.get(k); if (a) a.push(r); else by.set(k, [r]); }
    const keys = [...by.keys()];
    if (groupBy === "stage") keys.sort((a, b) => STAGE_ORDER.indexOf(a as PrStage) - STAGE_ORDER.indexOf(b as PrStage));
    else if (groupBy === "date") keys.sort((a, b) => b.localeCompare(a));
    // ร้าน: ตามลำดับที่เจอ = ร้านที่ขอล่าสุดขึ้นก่อน (แถวเรียงใหม่สุดก่อนจาก API)
    return keys.map((k) => ({
      key: k,
      title: groupBy === "stage" ? PR_STAGE_LABEL[k as PrStage] ?? k
        : groupBy === "date" ? (k === "—" ? "ไม่ระบุวันที่" : `สั่งวันที่ ${formatDate(k)}`) : k,
      rows: by.get(k)!,
    }));
  }, [shown, groupBy]);

  const meta = (r: Row) => (
    <>
      {r.code || "—"}{groupBy !== "shop" && <> · {r.seller_name}</>}{groupBy !== "date" && <> · {r.order_date ? formatDate(r.order_date) : "—"}</>} · โดย {r.requester || "—"}
      {r.mo_nos.length > 0 && <span className="text-slate-500"> · {r.mo_nos.length > 2 ? `${r.mo_nos[0]} +${r.mo_nos.length - 1}` : r.mo_nos.join(", ")}</span>}
    </>
  );
  const poLink = (r: Row) => r.po_id && r.po_no
    ? <button type="button" onClick={() => setPoOpen(r.po_id)} className="text-[11px] text-sky-700 hover:underline whitespace-nowrap">{r.po_no}</button>
    : null;
  const img = (r: Row, cls: string) => (
    <div className={`${cls} rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 shrink-0`}>
      {r.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <Icon name="package" className="text-slate-300" />}
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-10 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
        <Icon name="history" /> ประวัติการขอซื้อ
      </button>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} size="xl" storageKey="pr-history"
          title="ประวัติการขอซื้อ"
          description="ขอซื้อแล้วไปถึงไหน — สั่งร้าน / รับของ / จ่ายเงิน"
          footer={<button onClick={() => setOpen(false)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ปิด</button>}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / รหัส / ร้าน / ผู้ขอ / เลขใบ…" className="flex-1 min-w-[200px] h-9 px-3 text-sm border border-slate-200 rounded-md" />
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs">
              {GROUPS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setGroupBy(k)} className={`h-9 px-2.5 border-l first:border-l-0 border-slate-200 ${groupBy === k ? "bg-sky-50 text-sky-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs">
              <button type="button" onClick={() => setView("list")} className={`h-9 px-2.5 inline-flex items-center gap-1 ${view === "list" ? "bg-sky-50 text-sky-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="list" /> แถว</button>
              <button type="button" onClick={() => setView("card")} className={`h-9 px-2.5 border-l border-slate-200 inline-flex items-center gap-1 ${view === "card" ? "bg-sky-50 text-sky-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="image" /> การ์ด</button>
            </div>
          </div>
          {/* ชิปกรองสถานะ + จำนวน */}
          {!loading && !err && searched.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button type="button" onClick={() => setStageF("")} className={`text-[11px] px-2 py-0.5 rounded-full border ${stageF === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>ทั้งหมด {searched.length}</button>
              {STAGE_ORDER.filter((s) => stageCount.get(s)).map((s) => (
                <button key={s} type="button" onClick={() => setStageF(stageF === s ? "" : s)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${STAGE_UI[s].chip} ${stageF === s ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}>
                  {PR_STAGE_LABEL[s]} {stageCount.get(s)}
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : err ? (
            <div className="py-10 text-center text-red-500 text-sm">เกิดข้อผิดพลาดในการโหลดข้อมูล ({err}) <button onClick={load} className="underline ml-1">ลองใหม่</button></div>
          ) : shown.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">{q.trim() || stageF ? "ไม่พบรายการ ลองเปลี่ยนคำค้นหาหรือตัวกรอง" : "ยังไม่มีประวัติการขอซื้อ"}</div>
          ) : (
            <div className="border border-slate-200 rounded-lg max-h-[62vh] overflow-auto">
              {groups.map((g) => (
                <div key={g.key}>
                  {/* หัวกลุ่ม — เหนียวบนสุดตอนเลื่อน */}
                  <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-3 py-1.5 flex items-center gap-2 border-y border-slate-100 first:border-t-0">
                    {groupBy === "stage"
                      ? <span className={`text-[11px] px-1.5 py-0.5 rounded border ${STAGE_UI[g.key as PrStage]?.chip ?? ""}`}>{g.title}</span>
                      : <span className="text-xs font-medium text-slate-700 inline-flex items-center gap-1"><Icon name={groupBy === "shop" ? "store" : "calendar"} className="text-slate-400" />{g.title}</span>}
                    <span className="text-[11px] text-slate-400">{g.rows.length} รายการ</span>
                  </div>
                  {view === "card" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
                      {g.rows.map((r) => (
                        <div key={r.id} className="border border-slate-200 rounded-lg p-2 bg-white flex flex-col gap-1">
                          {img(r, "w-full aspect-square")}
                          <div className="text-xs text-slate-800 line-clamp-2 leading-snug" title={r.item_name}>{r.item_name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{groupBy !== "shop" ? r.seller_name : r.code || "—"}{groupBy !== "date" && r.order_date ? ` · ${formatDate(r.order_date)}` : ""}</div>
                          <StageBar p={r.progress} />
                          {groupBy !== "stage" && <div><StageChip p={r.progress} /></div>}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs tabular-nums text-slate-700">{r.qty.toLocaleString()} {r.uom}</span>
                            <span className="text-[10px] text-slate-400 tabular-nums">{formatAmount(r.line_total, r.currency)}</span>
                          </div>
                          {(r.po_no || r.pay) && (
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              {poLink(r) ?? <span />}
                              {r.pay && <PoPayChip pay={r.pay} />}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {g.rows.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                          {img(r, "w-10 h-10")}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-800 truncate" title={r.item_name}>{r.item_name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{meta(r)}</div>
                            {r.progress.stage === "rejected" && r.reject_reason && <div className="text-[11px] text-rose-500">เหตุผล: {r.reject_reason}</div>}
                            {/* จอเล็ก: แถบสถานะลงมาใต้ชื่อ */}
                            <div className="sm:hidden flex items-center gap-1.5 mt-1"><StageBar p={r.progress} />{groupBy !== "stage" && <StageChip p={r.progress} />}{poLink(r)}</div>
                          </div>
                          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-44">
                            <StageBar p={r.progress} />
                            <div className="flex items-center gap-1.5">
                              {groupBy !== "stage" && <StageChip p={r.progress} />}
                              {poLink(r)}
                            </div>
                          </div>
                          <div className="text-right shrink-0 w-28">
                            <div className="text-sm tabular-nums text-slate-700">{r.qty.toLocaleString()} {r.uom}</div>
                            {r.qty_received > 0 && r.progress.stage !== "received" && <div className="text-[10px] text-violet-600 tabular-nums">ได้แล้ว {r.qty_received.toLocaleString()}</div>}
                            <div className="text-[11px] text-slate-400 tabular-nums">{formatAmount(r.line_total, r.currency)}</div>
                            {r.pay && <div className="mt-0.5"><PoPayChip pay={r.pay} /></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ERPModal>
      )}
      {poOpen && <PoDetailModal poId={poOpen} onClose={() => setPoOpen(null)} onSaved={() => void load()} />}
    </>
  );
}
