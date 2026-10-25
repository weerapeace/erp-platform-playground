"use client";

/**
 * ของกลาง — ป๊อป "ความเคลื่อนไหวสต๊อก" ของสินค้า 1 ตัว ใน 1 คลัง (StockMovementHistory)
 *
 *   <StockMovementHistory code="RFID0001" warehouseCode="WH-RAW" onClose onCount={() => …} />
 *
 * - สรุป 4 ช่อง: ยอดตอนนี้ · รับเข้า · จ่ายงานออก (กี่ใบ) · นับ/ปรับยอด (กี่ครั้ง)
 * - แถบอธิบายภาษาคนเมื่อยอดติดลบ (จ่ายงานไปก่อนรับ/นับ) + ใบที่ใช้ต่อชิ้นผิดปกติดันยอดเท่าไร
 * - 2 มุมมอง: รวมตามใบงาน (ใบผิดปกติขึ้นก่อน + ป้ายเตือน) / ทีละรายการ · ตัวกรอง ทั้งหมด/รับเข้า/จ่ายงาน/นับ-ปรับยอด
 * ข้อมูล: /api/inventory/sku-movements (สิทธิ์ stock.view) · ใช้ที่: ป้ายสต๊อกบนการ์ดวัตถุดิบ แท็บใบสั่งผลิต (/purchasing)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import type { SkuMovementsResult, SkuMovement, SkuMoveKind } from "@/app/api/inventory/sku-movements/route";

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 3 });
const thDate = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const KIND_TAG: Record<SkuMoveKind, [string, string]> = {
  receive: ["รับเข้า", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  issue: ["จ่ายงาน", "bg-blue-50 text-blue-700 border-blue-200"],
  count: ["นับ/ปรับยอด", "bg-violet-50 text-violet-700 border-violet-200"],
  other: ["ออก", "bg-slate-50 text-slate-600 border-slate-200"],
};
type MoGroup = { mo_no: string; product_sku: string | null; mo_qty: number | null; qty: number; lines: number; per: number | null };

export function StockMovementHistory({ code, warehouseCode = "WH-RAW", onClose, onCount }: {
  code: string; warehouseCode?: string; onClose: () => void;
  /** ปุ่ม "นับสต๊อกตอนนี้" (ไม่ส่ง = ไม่โชว์ปุ่ม เช่น ไม่มีสิทธิ์ปรับยอด) */
  onCount?: () => void;
}) {
  const [d, setD] = useState<SkuMovementsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"mo" | "line">("mo");
  const [kind, setKind] = useState<"all" | SkuMoveKind>("all");
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/inventory/sku-movements?code=${encodeURIComponent(code)}&warehouse_code=${encodeURIComponent(warehouseCode)}`).then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.data) setD(j.data as SkuMovementsResult); else setErr(j.error ?? "โหลดไม่สำเร็จ"); })
      .catch(() => { if (alive) setErr("โหลดความเคลื่อนไหวสต๊อกไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [code, warehouseCode]);

  const u = d?.uom ?? "";
  const rows = useMemo(() => (d?.rows ?? []).filter((r) => kind === "all" || r.kind === kind), [d, kind]);
  // รวมรายการจ่ายงานตามใบงาน + ใช้ต่อชิ้น · ผิดปกติ = มากกว่า 10 เท่าของค่ากลาง (ต้องมี ≥ 3 ใบ)
  const groups = useMemo(() => {
    const m = new Map<string, MoGroup>();
    for (const r of d?.rows ?? []) {
      if (r.kind !== "issue") continue;
      const k = r.mo_no ?? r.ref_label ?? "—";
      const g = m.get(k) ?? { mo_no: k, product_sku: r.product_sku, mo_qty: r.mo_qty, qty: 0, lines: 0, per: null };
      g.qty += r.qty; g.lines += 1; m.set(k, g);
    }
    const list = [...m.values()].map((g) => ({ ...g, qty: Math.round(g.qty * 10000) / 10000, per: g.mo_qty ? g.qty / g.mo_qty : null }));
    const pers = list.map((g) => g.per ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const median = pers.length >= 3 ? pers[Math.floor(pers.length / 2)] : null;
    const odd = new Set(list.filter((g) => median != null && (g.per ?? 0) > median * 10).map((g) => g.mo_no));
    return { list: list.sort((a, b) => Number(odd.has(b.mo_no)) - Number(odd.has(a.mo_no)) || b.qty - a.qty), odd, oddQty: list.filter((g) => odd.has(g.mo_no)).reduce((n, g) => n + g.qty, 0) };
  }, [d]);

  const s = d?.summary;
  const chip = (on: boolean) => `h-8 px-3 text-xs rounded-md border ${on ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`;
  const neverCounted = s && s.count_n === 0;
  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="stock-movement-history" title={`ความเคลื่อนไหวสต๊อก · ${code}`}
      description={`${d?.name ?? ""}${d ? ` · ${warehouseCode}` : ""}`}
      footer={<>
        <a href="/inventory" target="_blank" rel="noreferrer" className="mr-auto px-3 h-9 inline-flex items-center text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ดูในหน้าคลังสินค้า ↗</a>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
        {onCount && <button onClick={onCount} className="px-4 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">🔢 นับสต๊อกตอนนี้</button>}
      </>}>
      {err && <div className="text-sm text-rose-600 py-6 text-center">{err}</div>}
      {!err && !d && <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลดความเคลื่อนไหวสต๊อก…</div>}
      {d && s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["ยอดตอนนี้", d.on_hand == null ? "—" : fmt(d.on_hand), d.on_hand != null && d.on_hand < 0 ? "text-rose-600" : "text-slate-800"],
              ["รับเข้า", fmt(s.in_qty), "text-slate-800"],
              [`จ่ายงานออก (${s.issue_mos} ใบ)`, fmt(s.issue_qty), "text-slate-800"],
              ["นับ / ปรับยอด", `${s.count_n} ครั้ง`, "text-slate-800"],
            ].map(([l, v, cls]) => (
              <div key={l} className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[11px] text-slate-500">{l}</div>
                <div className={`text-base font-semibold tabular-nums ${cls}`}>{v} <span className="text-[11px] font-normal text-slate-400">{l.startsWith("นับ") ? "" : u}</span></div>
              </div>
            ))}
          </div>
          {d.on_hand != null && d.on_hand < 0 && neverCounted && (
            <div className="mt-3 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              ⚠️ ติดลบเพราะจ่ายงานไปแล้ว แต่ยังไม่เคยรับของเข้าหรือนับสต๊อก — ไม่ใช่ของที่หายไปจริง
              {groups.odd.size > 0 && <> · <b>{fmt(groups.oddQty)} {u} มาจาก {groups.odd.size} ใบที่สูตรใช้ต่อชิ้นสูงผิดปกติ</b> (เช็กสูตรผลิต)</>}
              {" "}— นับของจริงเพื่อตั้งยอดใหม่
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-3 mb-2">
            <button type="button" onClick={() => setView("mo")} className={chip(view === "mo")}>รวมตามใบงาน</button>
            <button type="button" onClick={() => setView("line")} className={chip(view === "line")}>ทีละรายการ</button>
            <span className="w-px h-5 bg-slate-200 mx-1" />
            {([["all", "ทั้งหมด"], ["receive", "รับเข้า"], ["issue", "จ่ายงาน"], ["count", "นับ/ปรับยอด"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>{l}</button>
            ))}
          </div>
          {view === "mo" && kind !== "receive" && kind !== "count" ? (
            groups.list.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-lg">ยังไม่เคยจ่ายงานวัตถุดิบตัวนี้</div> : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-auto">
                <div className="grid grid-cols-[8.5rem_1fr_6rem] gap-2 px-3 py-1.5 text-[11px] text-slate-500 bg-slate-50 sticky top-0"><span>ใบงาน</span><span>รุ่น · จำนวนผลิต · ต่อชิ้น</span><span className="text-right">จ่ายออก</span></div>
                {groups.list.map((g) => {
                  const odd = groups.odd.has(g.mo_no);
                  return (
                    <div key={g.mo_no} className={`grid grid-cols-[8.5rem_1fr_6rem] gap-2 px-3 py-1.5 text-xs items-center ${odd ? "bg-amber-50/50" : ""}`}>
                      <span className="font-mono text-[11px] text-slate-600">{g.mo_no}</span>
                      <span className="text-slate-600 truncate">{g.product_sku ?? "—"}{g.mo_qty ? ` · ${fmt(g.mo_qty)} ชิ้น` : ""}{g.per != null && <span className={odd ? "text-amber-700 font-medium" : "text-slate-400"}> · {fmt(g.per)} {u}/ชิ้น{odd ? " ⚠️ ผิดปกติ" : ""}</span>}</span>
                      <span className={`text-right tabular-nums font-semibold ${odd ? "text-amber-700" : "text-rose-600"}`}>-{fmt(g.qty)}</span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            rows.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-lg">{kind === "receive" ? "ยังไม่เคยรับของเข้าคลังนี้" : kind === "count" ? "ยังไม่เคยนับหรือปรับยอด" : "ยังไม่มีความเคลื่อนไหว"}</div> : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-auto">
                {rows.map((r: SkuMovement) => {
                  const [label, cls] = KIND_TAG[r.kind];
                  const sign = r.dir === "set" ? "=" : r.dir === "in" ? "+" : "-";
                  return (
                    <div key={r.id} className="grid grid-cols-[5.5rem_1fr_6rem] gap-2 px-3 py-1.5 text-xs items-center">
                      <span className="text-slate-500">{thDate(r.date ?? r.created_at)}</span>
                      <span className="min-w-0 truncate text-slate-600" title={[r.number, r.note, r.by].filter(Boolean).join(" · ")}>
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border mr-1 ${cls}`}>{label}</span>
                        {r.mo_no ? <span className="font-mono text-[11px]">{r.mo_no}</span> : (r.ref_label ?? "")}
                        {r.product_sku ? ` · ${r.product_sku}` : ""}
                        <span className="text-slate-400"> · {r.from ?? "—"} → {r.to ?? "—"}{r.by ? ` · ${r.by}` : ""}</span>
                      </span>
                      <span className={`text-right tabular-nums font-semibold ${r.dir === "in" ? "text-emerald-600" : r.dir === "set" ? "text-violet-700" : "text-rose-600"}`}>{sign}{fmt(r.qty)}</span>
                    </div>
                  );
                })}
              </div>
            )
          )}
          <div className="mt-1.5 text-[11px] text-slate-400">ทั้งหมด {d.rows.length} รายการ · หน่วย {u || "—"}</div>
        </>
      )}
    </ERPModal>
  );
}
