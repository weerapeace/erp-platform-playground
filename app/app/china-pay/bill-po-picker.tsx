"use client";
/**
 * 💴 แอปโอนเงินจีน — กล่อง "ใบสั่งซื้อที่จ่ายในบิลนี้" (หน้าลงบิล / แก้ไขบิล) + รายการใบที่บิลผูกอยู่ (รายละเอียดบิล)
 * เจ้าของอนุมัติตาม widget 2026-11-04: เลือกร้าน → ใบค้างจ่ายของร้าน → ติ๊กหลายใบ → ยอดรวมเติมให้ (แก้ได้)
 *   - ใบหยวน: ยอดตั้งต้น = ที่เหลือ · แก้เป็นจ่ายบางส่วนได้ · เกินที่เหลือไม่ได้
 *   - ใบที่ตั้งเป็นเงินบาท: แยกไว้ล่างสุด + เตือน "สกุลเงินไม่ตรง ตรวจก่อน" · ไม่รวมยอดเองจนกว่าจะติ๊กยืนยัน + ใส่ ¥ เอง
 *   - ร้านไม่มีใบค้าง → เสนอร้านชื่อคล้าย (ร้านเดียวกันลง 2 ชื่อ)
 * กติกากลาง lib/china-bill-po · API /api/china-pay/bill-pos · สถานะจ่ายของใบสั่งซื้อเปลี่ยนเองที่ DB
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PoDetailModal } from "@/components/po-detail-modal";
import { checkLink, defaultAmount, fmtRmb, poBlockReason, type BillPoCandidate, type BillPoLinkInput } from "@/lib/china-bill-po";

type Pick = { amount: string; settles: boolean; confirmed: boolean };
type Similar = { id: string; name: string; score: number; open_pos: number };
export type BillPoSummary = { links: BillPoLinkInput[]; sum: number; count: number; errors: string[]; loaded: boolean };

const thShort = (d: string | null) => d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ไม่ระบุวัน";
const n2 = (v: string) => Math.round((Number(String(v).replace(/,/g, "")) || 0) * 100) / 100;
const PAGE = 25;

const CHIP: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-orange-50 text-orange-700 border-orange-200",
  no_price: "bg-slate-50 text-slate-600 border-slate-200",
  need_amount: "bg-rose-50 text-rose-700 border-rose-200",
  over: "bg-rose-50 text-rose-700 border-rose-200",
  need_confirm: "bg-amber-50 text-amber-800 border-amber-300",
  blocked: "bg-slate-100 text-slate-500 border-slate-200",
};

export function BillPoPicker({ supplierId, billId, initial, onChange }: {
  supplierId: string | null;
  /** แก้บิลเดิม → ติ๊กใบที่ผูกอยู่ให้ + ยอดที่เหลือไม่นับบิลนี้ */
  billId?: string | null;
  /** เติมจากใบสำคัญรับ (ปุ่ม "ส่งไปโอนเงินจีน") */
  initial?: { po_id: string; amount_rmb: number }[];
  onChange: (s: BillPoSummary) => void;
}) {
  const [cands, setCands] = useState<BillPoCandidate[]>([]);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [extra, setExtra] = useState<Similar | null>(null);   // ร้านชื่อคล้ายที่กดดู
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);   // โหลดรายการของร้านนี้สำเร็จแล้ว (ก่อนนั้นห้ามบันทึกชุดผูก — กันล้างของเดิม)
  const [sel, setSel] = useState<Record<string, Pick>>({});
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showThb, setShowThb] = useState(false);
  const [reload, setReload] = useState(0);

  // เปลี่ยนร้าน = เริ่มใหม่
  useEffect(() => { setSel({}); setExtra(null); setQ(""); setShowAll(false); setShowThb(false); }, [supplierId]);

  useEffect(() => {
    if (!supplierId) { setCands([]); setSimilar([]); setError(null); setReady(false); return; }
    let alive = true;
    setLoading(true); setError(null); setReady(false);
    const ids = [supplierId, extra?.id].filter(Boolean).join(",");
    apiFetch(`/api/china-pay/bill-pos?supplier_id=${ids}${billId ? `&bill_id=${billId}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) { setError(String(j.error)); setCands([]); return; }
        const list = (j.pos ?? []) as BillPoCandidate[];
        setCands(list);
        setReady(true);
        if (!extra) setSimilar((j.similar ?? []) as Similar[]);
        // ติ๊กของเดิม (แก้บิล) / ของที่ส่งมาจากใบสำคัญรับ — ครั้งแรกเท่านั้น
        setSel((prev) => {
          if (Object.keys(prev).length) return prev;
          const next: Record<string, Pick> = {};
          for (const c of list) {
            if (c.this_amount_rmb != null) next[c.po_id] = { amount: String(c.this_amount_rmb), settles: c.this_settles !== false, confirmed: c.this_currency_confirmed === true };
          }
          for (const it of initial ?? []) {
            const c = list.find((x) => x.po_id === it.po_id);
            if (!c || next[c.po_id] || poBlockReason(c)) continue;
            next[c.po_id] = { amount: it.amount_rmb > 0 ? String(Math.round(it.amount_rmb * 100) / 100) : "", settles: true, confirmed: false };
          }
          return next;
        });
      })
      .catch((e) => { if (alive) setError(String((e as Error).message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, billId, extra?.id, reload]);

  const byId = useMemo(() => new Map(cands.map((c) => [c.po_id, c])), [cands]);

  // สรุปส่งให้ฟอร์ม (ยอดรวม + ข้อผิด)
  useEffect(() => {
    const links: BillPoLinkInput[] = [];
    const errors: string[] = [];
    let sum = 0;
    for (const [id, p] of Object.entries(sel)) {
      const c = byId.get(id); if (!c) continue;
      const chk = checkLink(c, { amount_rmb: p.amount, settles_po: p.settles, currency_confirmed: p.confirmed });
      if (chk.kind === "over" || chk.kind === "need_amount" || chk.kind === "need_confirm" || chk.kind === "blocked") errors.push(`${c.po_no}: ${chk.label}`);
      const amt = n2(p.amount);
      sum += amt;
      links.push({ po_id: id, amount_rmb: amt, settles_po: chk.settles, currency_confirmed: p.confirmed });
    }
    onChange({ links, sum: Math.round(sum * 100) / 100, count: links.length, errors, loaded: ready && !loading && !error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, byId, loading, error, ready]);

  if (!supplierId) return null;

  const toggle = (c: BillPoCandidate) => setSel((prev) => {
    const next = { ...prev };
    if (next[c.po_id]) delete next[c.po_id];
    else { const d = defaultAmount(c); next[c.po_id] = { amount: d != null ? String(d) : "", settles: true, confirmed: false }; }
    return next;
  });
  const patch = (id: string, p: Partial<Pick>) => setSel((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], ...p } } : prev);

  const ql = q.trim().toLowerCase();
  const visible = cands.filter((c) => !poBlockReason(c) || sel[c.po_id]);
  const hiddenDone = cands.length - visible.length;
  const match = (c: BillPoCandidate) => !ql || `${c.po_no} ${c.items} ${c.partner_name ?? ""}`.toLowerCase().includes(ql);
  const rmbList = visible.filter((c) => c.is_rmb && match(c));
  const thbList = visible.filter((c) => !c.is_rmb && match(c));
  const shownRmb = showAll || ql ? rmbList : rmbList.slice(0, PAGE);
  const groups: { day: string; items: BillPoCandidate[] }[] = [];
  for (const c of shownRmb) {
    const day = c.order_date?.slice(0, 10) ?? "";
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(c); else groups.push({ day, items: [c] });
  }
  const tickDay = (items: BillPoCandidate[]) => setSel((prev) => {
    const next = { ...prev };
    const all = items.every((c) => next[c.po_id] || poBlockReason(c));
    for (const c of items) {
      if (poBlockReason(c)) continue;
      if (all) delete next[c.po_id];
      else if (!next[c.po_id]) { const d = defaultAmount(c); next[c.po_id] = { amount: d != null ? String(d) : "", settles: true, confirmed: false }; }
    }
    return next;
  });
  const selCount = Object.keys(sel).length;
  const selSum = Object.values(sel).reduce((a, p) => a + n2(p.amount), 0);
  const nRmb = visible.filter((c) => c.is_rmb).length;

  const row = (c: BillPoCandidate) => {
    const p = sel[c.po_id];
    const chk = p ? checkLink(c, { amount_rmb: p.amount, settles_po: p.settles, currency_confirmed: p.confirmed }) : null;
    const noPrice = c.is_rmb && c.remaining_rmb == null;
    return (
      <div key={c.po_id} onClick={() => toggle(c)}
        className={`flex gap-2.5 py-2.5 border-t border-slate-100 cursor-pointer ${p ? "bg-orange-50/70 -mx-3 px-3" : ""}`}>
        <input type="checkbox" readOnly checked={!!p} className="mt-0.5 w-5 h-5 accent-orange-600 shrink-0 pointer-events-none" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-slate-800">{c.po_no}</span>
            <span className="tabular-nums text-slate-700 shrink-0">
              {c.is_rmb ? (c.grand_total > 0 ? `¥${fmtRmb(c.grand_total)}` : "ยังไม่มีราคา") : `฿${fmtRmb(c.grand_total)}`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {c.items || "—"}{c.line_count > 0 ? ` · ${c.line_count} รายการ` : ""}
            {extra && c.partner_name ? ` · ${c.partner_name}` : ""}
          </div>
          {c.linked_other_rmb > 0 && <div className="text-[11px] text-orange-700">บิลอื่นผูกแล้ว ¥{fmtRmb(c.linked_other_rmb)}{c.remaining_rmb != null ? ` · เหลือ ¥${fmtRmb(c.remaining_rmb)}` : ""}</div>}
          {p && (
            <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {!c.is_rmb && (
                <label className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  <input type="checkbox" checked={p.confirmed} onChange={(e) => patch(c.po_id, { confirmed: e.target.checked })} className="mt-0.5 w-4 h-4 accent-amber-600" />
                  <span>ใบนี้ตั้งเป็น {c.currency} — สกุลเงินไม่ตรง ตรวจก่อน · ติ๊กเมื่อแน่ใจว่าจ่ายด้วยบิลหยวนนี้ แล้วใส่ยอด ¥ เอง</span>
                </label>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] text-slate-600">จ่ายรอบนี้ ¥</span>
                <input inputMode="decimal" value={p.amount} onChange={(e) => patch(c.po_id, { amount: e.target.value.replace(/[^\d.,]/g, "") })}
                  placeholder="0" className="w-24 h-9 px-2 text-base text-right tabular-nums border border-slate-300 rounded-lg bg-white" />
                {chk && <span className={`text-[11px] px-2 py-0.5 rounded-full border ${CHIP[chk.kind]}`}>{chk.label}</span>}
              </div>
              {(noPrice || !c.is_rmb) && (
                <label className="flex items-center gap-2 text-[12px] text-slate-600">
                  <input type="checkbox" checked={p.settles} onChange={(e) => patch(c.po_id, { settles: e.target.checked })} className="w-4 h-4 accent-orange-600" />
                  ปิดยอดใบนี้ (จ่ายครบใบ)
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700">🧾 ใบสั่งซื้อที่จ่ายในบิลนี้</div>
        {!loading && !error && visible.length > 0 && <div className="text-[11px] text-slate-400">ค้างจ่าย {visible.length} ใบ</div>}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">ติ๊กใบที่ร้านเก็บเงินในบิลนี้ · ไม่ติ๊กก็บันทึกบิลได้</div>

      {loading && <div className="py-4 text-center text-sm text-slate-400">กำลังโหลดใบสั่งซื้อ…</div>}
      {!loading && error && (
        <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-700">
          โหลดใบสั่งซื้อไม่ได้ — บันทึกบิลได้ตามปกติ แล้วค่อยผูกทีหลังในหน้ารายละเอียดบิล
          <button type="button" onClick={() => setReload((x) => x + 1)} className="ml-2 underline">ลองใหม่</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {extra && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
              <span>รวมใบของร้าน “{extra.name}” ด้วย</span>
              <button type="button" onClick={() => setExtra(null)} className="underline">เอาออก</button>
            </div>
          )}
          {visible.length === 0 && (
            <div className="mt-2 text-sm text-slate-500">ร้านนี้ไม่มีใบสั่งซื้อค้างจ่าย</div>
          )}
          {!extra && nRmb === 0 && similar.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-800 space-y-2">
              {similar.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span>⚠️ เจอร้านชื่อคล้าย <b>{s.name}</b> มีใบค้าง {s.open_pos} ใบ</span>
                  <button type="button" onClick={() => setExtra(s)} className="shrink-0 h-8 px-3 rounded-lg bg-white border border-amber-300 font-medium">ดูใบ</button>
                </div>
              ))}
              <div className="text-[11px] text-amber-700">อาจเป็นร้านเดียวกันที่ลงไว้ 2 ชื่อ — รวมร้านซ้ำได้ที่ ERP › คู่ค้า › สแกนร้านซ้ำ</div>
            </div>
          )}

          {visible.length > 6 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลข PO หรือชื่อสินค้า"
              className="mt-2 w-full h-10 px-3 text-base border border-slate-200 rounded-lg" />
          )}

          {groups.map((g) => (
            <div key={g.day || "none"}>
              <div className="flex items-center justify-between pt-3 pb-1 text-[12px] text-slate-500">
                <span>{thShort(g.day || null)} · {g.items.length} ใบ</span>
                {g.items.length > 1 && <button type="button" onClick={() => tickDay(g.items)} className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600">ติ๊กทั้งวัน</button>}
              </div>
              {g.items.map(row)}
            </div>
          ))}
          {!showAll && !ql && rmbList.length > PAGE && (
            <button type="button" onClick={() => setShowAll(true)} className="w-full mt-1 py-2 text-[13px] text-orange-600 border-t border-slate-100">ดูเพิ่มอีก {rmbList.length - PAGE} ใบ</button>
          )}

          {thbList.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <button type="button" onClick={() => setShowThb((v) => !v)} className="w-full flex items-center justify-between text-[12px] text-amber-800">
                <span>⚠️ ใบที่ตั้งเป็นเงินบาท {thbList.length} ใบ — สกุลเงินไม่ตรง ตรวจก่อน</span>
                <span>{showThb ? "ซ่อน" : "ดู"}</span>
              </button>
              {(showThb || thbList.some((c) => sel[c.po_id])) && <div className="mt-1">{(showThb ? thbList : thbList.filter((c) => sel[c.po_id])).map(row)}</div>}
            </div>
          )}
          {hiddenDone > 0 && <div className="mt-2 text-[11px] text-slate-400">ซ่อน {hiddenDone} ใบที่ผูกบิลอื่นครบแล้ว</div>}

          {selCount > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm">
              <span className="text-slate-600">เลือก {selCount} ใบ</span>
              <span className="font-semibold text-orange-700 tabular-nums">¥{fmtRmb(selSum)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** รายการใบสั่งซื้อที่บิลผูกอยู่ (หน้ารายละเอียดบิล) — กดเปิดป๊อปใบสั่งซื้อกลาง · onModal บอกหน้าที่เรียกให้ซ่อนป๊อปตัวเองชั่วคราว */
export function BillLinkedPos({ billId, refreshKey, onModal }: { billId: string; refreshKey?: number; onModal?: (open: boolean) => void }) {
  const [rows, setRows] = useState<BillPoCandidate[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/china-pay/bill-pos?bill_id=${billId}`).then((r) => r.json())
      .then((j) => { if (alive) setRows(j.error ? [] : ((j.pos ?? []) as BillPoCandidate[])); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [billId, refreshKey]);
  if (!rows || rows.length === 0) return null;
  const total = rows.reduce((a, c) => a + (c.this_amount_rmb ?? 0), 0);
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">🧾 ใบสั่งซื้อในบิลนี้ ({rows.length})</span>
        <span className="text-slate-500 tabular-nums">¥{fmtRmb(total)}</span>
      </div>
      <div className="mt-1 divide-y divide-slate-100">
        {rows.map((c) => (
          <button key={c.po_id} type="button" onClick={() => { setOpen(c.po_id); onModal?.(true); }}
            className="w-full flex items-center justify-between gap-2 py-2 text-left">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{c.po_no}</div>
              <div className="text-[11px] text-slate-500 truncate">{c.items || "—"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm tabular-nums">¥{fmtRmb(c.this_amount_rmb ?? 0)}</div>
              <div className={`text-[10px] ${String(c.payment_status) === "paid" ? "text-emerald-600" : c.this_settles ? "text-amber-700" : "text-orange-600"}`}>
                {String(c.payment_status) === "paid" ? "จ่ายแล้ว" : c.this_settles ? "ปิดยอดใบ" : "จ่ายบางส่วน"}
              </div>
            </div>
          </button>
        ))}
      </div>
      {open && <PoDetailModal poId={open} onClose={() => { setOpen(null); onModal?.(false); }} />}
    </div>
  );
}
