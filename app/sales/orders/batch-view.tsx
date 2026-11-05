"use client";

/**
 * ใบสั่งขาย — มุมมอง "ตามชุด" (/sales/orders)
 *   1 การ์ด = 1 ชุด (กลุ่มใบสั่งงาน) · 5 ขั้น รับออเดอร์ → เปิดผลิต → กำลังผลิต → ทำเสร็จ → ส่งลูกค้า
 *   ขั้นคิดให้เองจากใบสั่งผลิต (GET /api/so-orders/batches → lib/so-order-stage) — ไม่มีปุ่มเปลี่ยนสถานะชุดเอง
 *   ปุ่มทำทั้งชุด: เปิดใบสั่งผลิต (open_mo + group_id ทีละใบสั่งขาย) · พิมพ์ใบซื้อ-ตัด (familyPrintUrl) · ส่งของ (ship ทีละใบ)
 *   · จ่ายงานชุดนี้ = เปิดบอร์ดจ่ายงาน /master/work-board?view=shop&group=<ชื่อชุด> (บอร์ดกรองกลุ่มให้เอง)
 *   · รายการยังไม่มี SKU → กดเลขใบสั่งขายเปิดใบ (onOpenOrder) ไปเลือก SKU ในแถว
 *   · ส่งลูกค้าแล้ว x/y ต่อรายการ = ใบขายที่ผูกกับใบสั่งผลิต (API คิดให้ · soShipState) — ผูก/แก้ที่บอร์ดจ่ายงาน › อัปเดตเป็นชุด
 * ของกลาง: MiniTable · ERPModal · ConfirmDialog · Icon · familyPrintUrl
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { familyPrintUrl } from "@/lib/family-print";
import { SO_LINE_STAGES, SO_SHIP_LABEL, type SoShipState } from "@/lib/so-order-stage";
import type { SoBatch, BatchLine } from "@/app/api/so-orders/batches/route";

const STAGE_TONE = ["bg-slate-100 text-slate-600", "bg-blue-50 text-blue-700", "bg-amber-50 text-amber-700", "bg-teal-50 text-teal-700", "bg-emerald-50 text-emerald-700"];
const STAGE_BAR = ["bg-slate-400", "bg-blue-500", "bg-amber-500", "bg-teal-600", "bg-emerald-600"];
const SHIP_TONE: Record<SoShipState, string> = { full: "bg-emerald-50 text-emerald-700", part: "bg-amber-50 text-amber-700", none: "bg-slate-100 text-slate-500" };
const SHIP_BAR: Record<SoShipState, string> = { full: "bg-emerald-600", part: "bg-amber-400", none: "bg-slate-300" };
const SHIP_ORDER: SoShipState[] = ["full", "part", "none"];
const dayText = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");

export function SoBatchView({ groupFilter, canEdit, canShip, reloadKey, onChanged, onOpenOrder }: {
  groupFilter: string;
  canEdit: boolean;
  canShip: boolean;
  reloadKey: number;
  onChanged: () => void;
  /** เปิดใบสั่งขายใบนั้นมาแก้ (เช่น เลือก SKU ให้รายการที่ลงเป็นชื่อไว้) */
  onOpenOrder: (orderId: string) => void;
}) {
  const toast = useToast();
  const canDispatch = usePermission("work_board.dispatch");
  const [batches, setBatches] = useState<SoBatch[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [askOpen, setAskOpen] = useState<SoBatch | null>(null);
  const [askShip, setAskShip] = useState<SoBatch | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch("/api/so-orders/batches").then((r) => r.json());
      setBatches((j.data ?? []) as SoBatch[]);
    } catch { setBatches([]); toast.error("โหลดชุดไม่สำเร็จ"); }
  }, [toast]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  if (batches === null) return <div className="py-20 text-center text-sm text-slate-400">กำลังโหลดชุด…</div>;
  const shown = batches.filter((b) => !groupFilter || b.id === groupFilter);
  if (shown.length === 0) return (
    <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-400">
      ยังไม่มีชุด — ตอนลงออเดอร์ ("เพิ่มหลายรายการ" หรือช่อง "ชุด" ในใบ) เลือกชุดให้รายการ แล้วชุดจะขึ้นที่นี่
    </div>
  );

  // ── ทำทั้งชุด ──
  const toOpenOf = (b: SoBatch) => b.lines.filter((l) => l.stage === 0 && l.sku && !l.mo_id);
  const runOpen = async (b: SoBatch) => {
    setBusy(true);
    let created = 0, linked = 0;
    try {
      for (const orderId of [...new Set(toOpenOf(b).map((l) => l.order_id))]) {
        const r = await apiFetch(`/api/so-orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open_mo", group_id: b.id }) });
        const j = await r.json(); if (!r.ok || j?.error) throw new Error(j?.error || "เปิดใบสั่งผลิตไม่สำเร็จ");
        created += j.opened?.created ?? 0; linked += j.opened?.linked ?? 0;
      }
      toast.success(`เปิดใบสั่งผลิต ${created} ใบ${linked ? ` · ผูกเดิม ${linked} ใบ` : ""} เข้าชุด "${b.name}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดใบสั่งผลิตไม่สำเร็จ"); }
    finally { setBusy(false); setAskOpen(null); onChanged(); }          // หน้าแม่โหลดใหม่ → reloadKey เปลี่ยน → ชุดโหลดใหม่
  };
  const shipPlan = (b: SoBatch) => b.orders.map((o) => {
    const ls = b.lines.filter((l) => l.order_id === o.id);
    const reason = o.status === "shipped" ? "ส่งแล้ว"
      : !o.all_in_batch ? "ใบนี้มีรายการอยู่ชุดอื่นด้วย — ส่งที่ตัวใบ"
      : ls.some((l) => l.stage < 3) ? `ยังทำไม่เสร็จ ${ls.filter((l) => l.stage < 3).length} รายการ` : null;
    return { ...o, reason };
  });
  const runShip = async (b: SoBatch, createInvoice: boolean) => {
    setBusy(true);
    let n = 0;
    const warns: string[] = [];   // ออกใบขายแล้วแต่ยืนยัน/จัดส่งใบขายไม่สำเร็จ (ใบสั่งขายยังบันทึกส่งแล้ว)
    try {
      for (const o of shipPlan(b).filter((x) => !x.reason)) {
        const r = await apiFetch(`/api/so-orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ship", create_invoice: createInvoice }) });
        const j = await r.json(); if (!r.ok || j?.error) throw new Error(`${o.order_no ?? ""}: ${j?.error || "บันทึกส่งไม่สำเร็จ"}`);
        if (j?.warning) warns.push(`${o.order_no ?? ""}: ${j.warning}`);
        n++;
      }
      toast.success(`บันทึกส่งแล้ว ${n} ใบ${createInvoice ? " + ออกใบขาย (จัดส่ง · ตัดสต็อก) ให้แล้ว" : ""}`);
      if (warns.length) toast.error(warns.join("\n"));
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกส่งไม่สำเร็จ"); }
    finally { setBusy(false); setAskShip(null); onChanged(); }
  };

  const lineCols: MiniColumn<BatchLine>[] = [
    { key: "so", header: "ใบสั่งขาย", width: "8rem", sortValue: (l) => l.order_no ?? "",
      cell: (l) => <div>
        <button type="button" onClick={() => onOpenOrder(l.order_id)} title="เปิดใบสั่งขายนี้" className="font-mono text-[11px] text-blue-700 hover:underline">{l.order_no ?? "—"}</button>
        <div className="truncate text-[10px] text-slate-400">{l.customer_name ?? ""}</div></div> },
    { key: "sku", header: "สินค้า", width: "minmax(12rem,2fr)", sortValue: (l) => l.sku ?? l.product_name,
      cell: (l) => <div className="min-w-0"><div className="truncate text-sm text-slate-700">{l.product_name}</div>
        {l.sku ? <code className="font-mono text-[10px] text-orange-600">{l.sku}</code> : <span className="text-[10px] text-amber-700">ยังไม่มี SKU</span>}
        {l.note && <div className="truncate text-[10px] text-slate-400" title={l.note}>{l.note}</div>}</div> },
    { key: "qty", header: "จำนวน", width: "5rem", align: "right", sortValue: (l) => l.qty, cell: (l) => <span className="tabular-nums">{l.qty.toLocaleString("th-TH")}</span> },
    { key: "ship", header: "ส่งแล้ว", width: "7.5rem", align: "center", sortValue: (l) => SHIP_ORDER.indexOf(l.ship ?? "none") * 1e6 - (l.shipped ?? 0), sortLabel: "ส่งแล้ว",
      cell: (l) => { const st = l.ship ?? "none"; return <div title={l.mo_no ? "นับจากใบขายที่ผูกกับใบสั่งผลิตนี้" : "ยังไม่มีใบสั่งผลิต — นับไม่ได้"}>
        <div className="tabular-nums text-[12px] text-slate-700">{(l.shipped ?? 0).toLocaleString("th-TH")}/{l.qty.toLocaleString("th-TH")}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${SHIP_TONE[st]}`}>{SO_SHIP_LABEL[st]}</span></div>; } },
    { key: "due", header: "กำหนดส่ง", width: "6rem", align: "center", sortValue: (l) => l.due_date ?? "9999", cell: (l) => <span className="text-[12px] text-slate-500">{dayText(l.due_date)}</span> },
    { key: "mo", header: "ใบสั่งผลิต", width: "8rem", sortValue: (l) => l.mo_no ?? "", cell: (l) => <span className="font-mono text-[11px] text-slate-600">{l.mo_no ?? "—"}</span> },
    { key: "stage", header: "ขั้น", width: "7rem", align: "center", sortValue: (l) => l.stage,
      cell: (l) => <span className={`rounded-full px-2 py-0.5 text-[10px] ${STAGE_TONE[l.stage]}`}>{SO_LINE_STAGES[l.stage].label}</span> },
  ];

  return (
    <div className="space-y-3">
      {shown.map((b) => {
        const n = b.lines.length;
        const toOpen = toOpenOf(b).length;
        const noSkuLines = b.lines.filter((l) => l.stage === 0 && !l.sku);
        const noSku = noSkuLines.length;
        const noSkuOrders = [...new Map(noSkuLines.map((l) => [l.order_id, l.order_no ?? "ใบสั่งขาย"])).entries()];
        const toDispatch = b.reached[1] - b.reached[2];   // เปิดใบสั่งผลิตแล้ว แต่ยังไม่ได้จ่ายงาน
        const moIds = b.lines.map((l) => l.mo_id).filter((x): x is string => !!x);
        const isOpen = open.has(b.id);
        return (
          <section key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-base font-semibold text-slate-800"><Icon name="folders" className="text-teal-700" /> {b.name}</div>
                <div className="mt-0.5 text-[12px] text-slate-500">
                  {n} รายการ · {b.qty.toLocaleString("th-TH")} ชิ้น{b.due_min ? ` · ส่งเร็วสุด ${dayText(b.due_min)}` : ""} · ลูกค้า {b.customers.join(", ") || "—"}
                </div>
                <div className="text-[11px] text-slate-400">ใบสั่งขาย {b.orders.map((o) => o.order_no ?? "—").join(", ")}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${STAGE_TONE[b.min_stage]}`}>ทั้งชุด: {SO_LINE_STAGES[b.min_stage].label}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {SO_LINE_STAGES.map((s) => {
                const c = s.key === 0 ? n : b.reached[s.key];
                const done = c === n;
                return (
                  <div key={s.key} className={`rounded-lg px-2.5 py-1.5 ${done ? STAGE_TONE[s.key] : "bg-slate-50 text-slate-500"}`}>
                    <div className="text-[11px]">{s.key === 0 ? "รับออเดอร์" : s.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{c}/{n}</div>
                    <div className="mt-1 h-1 rounded bg-slate-200"><div className={`h-1 rounded ${STAGE_BAR[s.key]}`} style={{ width: `${Math.round((c / Math.max(1, n)) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>

            {(() => {
              const sc = b.ship_count ?? { full: 0, part: 0, none: n };
              const shippedQty = b.shipped_qty ?? 0;
              return (
                <div className="mt-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-medium text-slate-700">ส่งลูกค้าแล้ว {shippedQty.toLocaleString("th-TH")} / {b.qty.toLocaleString("th-TH")} ชิ้น</span>
                    <span className="text-slate-500">ค้างส่ง <b className="text-slate-700">{Math.max(0, b.qty - shippedQty).toLocaleString("th-TH")}</b> ชิ้น</span>
                  </div>
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded bg-slate-100">
                    {SHIP_ORDER.map((k) => sc[k] > 0 && <div key={k} className={SHIP_BAR[k]} style={{ width: `${(sc[k] / Math.max(1, n)) * 100}%` }} />)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    {SHIP_ORDER.map((k) => <span key={k}><span className={`mr-1 inline-block h-2 w-2 rounded-sm ${SHIP_BAR[k]}`} />{SO_SHIP_LABEL[k]} {sc[k]}</span>)}
                    <span className="text-slate-400">รายการ</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canEdit && toOpen > 0 && (
                <button onClick={() => setAskOpen(b)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  <Icon name="factory" /> เปิดใบสั่งผลิตทั้งชุด ({toOpen})</button>
              )}
              {moIds.length > 0 && (
                <a href={familyPrintUrl({ ids: [...new Set(moIds)] })} target="_blank" rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">
                  <Icon name="print" /> พิมพ์ใบซื้อ-ตัดทั้งชุด</a>
              )}
              {canDispatch && toDispatch > 0 && (
                <a href={`/master/work-board?view=shop&group=${encodeURIComponent(b.name)}`} target="_blank" rel="noreferrer"
                  title="เปิดบอร์ดจ่ายงาน กรองเฉพาะชุดนี้ไว้ให้"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 px-3 text-xs text-indigo-700 hover:bg-indigo-50">
                  <Icon name="truck" /> จ่ายงานชุดนี้ ({toDispatch})</a>
              )}
              {canShip && b.min_stage < 4 && (
                <button onClick={() => setAskShip(b)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                  <Icon name="done" /> ส่งของทั้งชุด</button>
              )}
              <button onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(b.id)) x.delete(b.id); else x.add(b.id); return x; })}
                className="ml-auto h-8 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-50">{isOpen ? "ซ่อนรายการ ▴" : `ดูรายการ (${n}) ▾`}</button>
            </div>
            {noSku > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-700">
                <span>มี {noSku} รายการที่ยังไม่มี SKU — สร้าง SKU ที่ใบงานออกแบบก่อน แล้วเปิดใบสั่งขายเลือก SKU ในแถว ถึงจะเปิดใบสั่งผลิตได้</span>
                {canEdit && noSkuOrders.map(([id, no]) => (
                  <button key={id} type="button" onClick={() => onOpenOrder(id)}
                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-medium hover:bg-amber-100">
                    <Icon name="edit" /> เลือก SKU ใน {no}</button>
                ))}
              </div>
            )}

            {isOpen && (
              <div className="mt-3">
                <MiniTable rows={b.lines} rowKey={(l) => l.line_id} columns={lineCols} countUnit="รายการ"
                  searchText={(l) => `${l.order_no ?? ""} ${l.sku ?? ""} ${l.product_name} ${l.mo_no ?? ""} ${l.customer_name ?? ""}`}
                  searchPlaceholder="ค้นหา ใบสั่งขาย / สินค้า / ใบสั่งผลิต" />
              </div>
            )}
          </section>
        );
      })}
      <p className="text-[11px] text-slate-400">สถานะชุดคิดให้เองจากใบสั่งผลิตในชุด (กติกากลางเดียวกับบอร์ดจ่ายงาน) — ทั้งชุดอยู่ขั้นของรายการที่ช้าที่สุด · "ส่งแล้ว" นับจากใบขายที่ผูกกับใบสั่งผลิต (ผูก/แก้ที่บอร์ดจ่ายงาน › อัปเดตเป็นชุด)</p>

      <ConfirmDialog open={!!askOpen} onClose={() => !busy && setAskOpen(null)} onConfirm={() => askOpen && void runOpen(askOpen)} loading={busy}
        title="เปิดใบสั่งผลิตทั้งชุด?" confirmText="เปิดใบสั่งผลิต"
        message={askOpen ? <>จะเปิดใบสั่งผลิตให้ <b>{toOpenOf(askOpen).length} รายการ</b> ของชุด “{askOpen.name}” (กางสูตร BOM ให้) แล้วเอาเข้าชุดนี้ · รายการที่ยังไม่มี SKU จะรอไว้</> : ""} />

      <ERPModal open={!!askShip} onClose={() => !busy && setAskShip(null)} size="md" title={askShip ? `ส่งของทั้งชุด — ${askShip.name}` : ""}
        footer={askShip ? (() => {
          const ok = shipPlan(askShip).filter((x) => !x.reason).length;
          return <>
            <button onClick={() => setAskShip(null)} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
            <button onClick={() => void runShip(askShip, false)} disabled={busy || ok === 0} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">แค่ติ๊กว่าส่งแล้ว ({ok})</button>
            <button onClick={() => void runShip(askShip, true)} disabled={busy || ok === 0} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">ส่งแล้ว + ออกใบขายให้เลย ({ok})</button>
          </>;
        })() : null}>
        {askShip && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">ส่งได้เฉพาะใบสั่งขายที่ <b>ทุกรายการอยู่ในชุดนี้</b> และ <b>ทำเสร็จครบแล้ว</b> — ใบอื่นจะข้ามไว้</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {shipPlan(askShip).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="font-mono text-[12px] text-slate-700">{o.order_no ?? "—"}</span>
                  {o.reason ? <span className="text-[11px] text-amber-700">{o.reason}</span> : <span className="text-[11px] text-emerald-700">พร้อมส่ง</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
