"use client";

/**
 * ของกลาง — "วัตถุดิบตัวนี้ ใบงานไหนรออยู่บ้าง / พอไหม / แบ่งให้ใบไหนเท่าไร / ไม่พอกดขอซื้อ"
 * ใช้ตอนรับของเข้า (/purchasing/receive) เป็นหลัก แต่เสียบหน้าไหนก็ได้ที่มีรหัสวัตถุดิบ
 *
 *   <MaterialDemandPanel code="ZIP-001" uom="เส้น" incomingQty={100}
 *                        allocatable refLabel="PO-2026-00029" refType="po_line" refId={lineId} />
 *
 * โหมดดู   : รวมต้องใช้ · ยังขาด · รับรอบนี้ + รายการใบงาน (ใกล้ครบกำหนดก่อน) + 🛒 ขอซื้อส่วนที่ขาด
 * โหมดแบ่ง : ช่องกรอกต่อใบ + ⚡ แบ่งอัตโนมัติตามวันส่ง + ยอดคงเหลือที่ยังไม่แบ่ง + บันทึก (เฟส 2)
 *            บันทึกแล้วยอดไปเพิ่มที่ "จำนวนที่มี" ของใบนั้น → % ความพร้อมขยับทันที · ยกเลิกย้อนได้
 * ของกลางที่ใช้: apiFetch · useToast · HoverImage · addToPrCart · usePermission
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { HoverImage } from "@/components/hover-image";
import { addToPrCart } from "@/lib/pr-cart";
import type { MaterialDemand, DemandMo } from "@/app/api/mo/material-demand/route";
import type { Allocation } from "@/app/api/mo/material-allocations/route";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");
const dueText = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const dueCls = (d: string | null) => {
  if (!d) return "text-slate-400";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(d + "T00:00:00").getTime() - t.getTime()) / 86400000);
  return days < 0 ? "text-rose-600 font-semibold" : days < 3 ? "text-amber-600 font-semibold" : "text-slate-500";
};

export function MaterialDemandPanel({
  code, uom, incomingQty = 0, compact = false,
  allocatable = false, refType, refId, refLabel, source = "receive", onAllocated,
}: {
  /** รหัสวัตถุดิบ (component_sku / skus_v2.code) */
  code: string | null | undefined;
  uom?: string | null;
  /** จำนวนที่กำลังจะรับเข้ารอบนี้ — ใช้คำนวณว่า "พอไหม" และเป็นเพดานการแบ่ง */
  incomingQty?: number;
  compact?: boolean;
  /** เปิดโหมดแบ่งของเข้าใบงาน (เฟส 2) */
  allocatable?: boolean;
  refType?: string; refId?: string; refLabel?: string;
  /** receive = แบ่งตอนรับของ · manual = แบ่งของที่มีอยู่แล้วในโกดัง */
  source?: string;
  onAllocated?: () => void;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [d, setD] = useState<MaterialDemand | null>(null);
  const [hist, setHist] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [alloc, setAlloc] = useState<Record<string, string>>({});   // summary_id → จำนวนที่จะแบ่ง
  const [saving, setSaving] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const load = useCallback(() => {
    if (!code) { setD(null); return; }
    setLoading(true);
    void Promise.all([
      apiFetch(`/api/mo/material-demand?code=${encodeURIComponent(code)}`).then((r) => r.json()).catch(() => null),
      apiFetch(`/api/mo/material-allocations?code=${encodeURIComponent(code)}`).then((r) => r.json()).catch(() => null),
    ]).then(([dem, h]) => {
      setD((dem?.data?.[code] ?? null) as MaterialDemand | null);
      setHist((h?.data ?? []) as Allocation[]);
    }).finally(() => setLoading(false));
  }, [code]);

  useEffect(() => { setAlloc({}); load(); }, [load]);

  const pending = useMemo(() => (d?.mos ?? []).filter((m) => !m.is_ready), [d]);
  const allocSum = useMemo(() => r2(Object.values(alloc).reduce((n, v) => n + (Number(v) || 0), 0)), [alloc]);
  const leftToSplit = r2(Math.max(0, incomingQty - allocSum));

  if (!code) return null;
  if (loading && !d) return <div className="mt-3 text-[11px] text-slate-400">กำลังตรวจว่าใบงานไหนรอของนี้…</div>;
  if (!d) return null;

  const unit = uom || d.uom || "";
  const shortAfter = r2(Math.max(0, d.total_short - incomingQty));
  const enough = d.total_short > 0 && shortAfter === 0;
  const showAllocate = allocatable && canEdit && incomingQty > 0 && pending.length > 0;

  // แบ่งอัตโนมัติ: ไล่ตามลำดับที่ API เรียงมาแล้ว (ใกล้ครบกำหนดก่อน) ให้ใบละเท่าที่ขาด จนของหมด
  const autoSplit = () => {
    let left = incomingQty;
    const next: Record<string, string> = {};
    for (const m of pending) {
      if (left <= 0) break;
      if (!m.summary_id || m.short <= 0) continue;
      const give = r2(Math.min(m.short, left));
      if (give <= 0) continue;
      next[m.summary_id] = String(give);
      left = r2(left - give);
    }
    setAlloc(next);
    if (Object.keys(next).length === 0) toast.error("ไม่มีใบไหนขาดของตัวนี้แล้ว");
  };

  const saveAlloc = async () => {
    const items = Object.entries(alloc)
      .map(([summary_id, v]) => ({ summary_id, qty: Number(v) || 0 }))
      .filter((x) => x.qty > 0);
    if (items.length === 0) { toast.error("ยังไม่ได้ใส่จำนวนที่จะแบ่ง"); return; }
    if (allocSum > incomingQty + 0.0001) { toast.error(`แบ่งเกินของที่รับ (รับ ${fmt(incomingQty)} แต่แบ่ง ${fmt(allocSum)})`); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/mo/material-allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, source, ref_type: refType ?? null, ref_id: refId ?? null, ref_label: refLabel ?? null }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "แบ่งไม่สำเร็จ");
      toast.success(`แบ่งให้ ${j.allocated} ใบงานแล้ว${j.covered > 0 ? ` · ครบแล้ว ${j.covered} ใบ 🎉` : ""}`);
      setAlloc({});
      load();
      onAllocated?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "แบ่งไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const undo = async (a: Allocation) => {
    try {
      const res = await apiFetch("/api/mo/material-allocations", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "ยกเลิกไม่สำเร็จ");
      toast.success(`ยกเลิกการแบ่ง ${fmt(a.qty)} ${unit} ของ ${a.mo_no} แล้ว`);
      load();
      onAllocated?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };

  if (d.mo_count === 0 && hist.length === 0) {
    return (
      <div className="mt-3 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-500">
        ℹ️ ตอนนี้<b>ไม่มีใบสั่งผลิตที่รอวัตถุดิบตัวนี้</b> — รับเข้าเก็บสต๊อกได้เลย
      </div>
    );
  }

  const addShortToCart = () => {
    const qty = Math.max(1, Math.ceil(shortAfter || d.total_short));
    const n = addToPrCart([{
      label: `[${d.code}] ${d.component_name ?? ""}`.trim(),
      qty, uom: unit, seller: "", price: 0, currency: "THB",
      image: null, variationId: null, skuRef: d.code, skuId: null,
      note: `ขาดจาก ${d.mo_count} ใบสั่งผลิต (${pending.slice(0, 5).map((m) => m.mo_no).join(", ")})`,
      reason: "รับของแล้วยังไม่พอตามใบสั่งผลิต",
      sourceMoNo: pending[0]?.mo_no ?? null,
    }]);
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว ${fmt(qty)} ${unit} (ตะกร้ามี ${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };

  const rowInput = (m: DemandMo) => {
    if (!showAllocate || !m.summary_id) return null;
    const v = alloc[m.summary_id] ?? "";
    const over = (Number(v) || 0) > m.short + 0.0001;
    return (
      <input type="number" inputMode="decimal" step="any" min={0} value={v} placeholder="0"
        onChange={(e) => setAlloc((s) => ({ ...s, [m.summary_id!]: e.target.value }))}
        title={over ? "ใส่มากกว่าที่ใบนี้ขาด" : "จำนวนที่จะแบ่งให้ใบนี้"}
        className={`w-16 h-7 px-1.5 text-[11px] text-right border rounded shrink-0 ${over ? "border-amber-400 bg-amber-50" : "border-slate-200"}`} />
    );
  };

  return (
    <div className={`mt-3 rounded-lg border ${enough ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">🧵 ใบงานที่รอวัตถุดิบนี้ ({d.mo_count} ใบ)</span>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400">{open ? "▲ ย่อ" : "▼ กาง"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px]">
          <span className="text-slate-600">ต้องใช้รวม <b className="text-slate-900">{fmt(d.total_required)}</b> {unit}</span>
          <span className="text-slate-600">ยังขาด <b className="text-rose-600">{fmt(d.total_short)}</b></span>
          {incomingQty > 0 && <span className="text-slate-600">รับรอบนี้ <b className="text-blue-700">{fmt(incomingQty)}</b></span>}
          {incomingQty > 0 && (enough
            ? <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ รับแล้วครบพอดี</span>
            : <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">รับแล้วยังขาดอีก {fmt(shortAfter)} {unit}</span>)}
        </div>
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-1">
          {showAllocate && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white border border-indigo-200">
              <span className="text-[11px] text-slate-600">แบ่งของล็อตนี้ให้ใบงาน:</span>
              <button type="button" onClick={autoSplit}
                title="ไล่ให้ใบที่ใกล้ครบกำหนดก่อน ใบละเท่าที่ขาด จนของหมด · ใบที่ยังไม่ได้ตั้งวันครบกำหนดจะเรียงตามใบเก่าก่อน"
                className="h-7 px-2 text-[11px] border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-50 whitespace-nowrap">⚡ แบ่งอัตโนมัติ</button>
              {allocSum > 0 && <button type="button" onClick={() => setAlloc({})} className="h-7 px-1.5 text-[11px] text-slate-400 hover:text-rose-500">ล้าง</button>}
              <div className="flex-1" />
              <span className={`text-[11px] tabular-nums ${allocSum > incomingQty ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
                แบ่งแล้ว {fmt(allocSum)} · เหลือ {fmt(leftToSplit)} {unit}
              </span>
            </div>
          )}

          {d.mos.map((m) => (
            <div key={m.mo_id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border ${m.is_ready ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
              <HoverImage url={m.image} size={28} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-slate-800 truncate">{m.product_sku} <span className="text-slate-400 font-normal">· {m.product_name}</span></div>
                <div className="text-[10px] text-slate-400 font-mono">{m.mo_no} · ผลิต {fmt(m.mo_qty)} ชิ้น</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] tabular-nums text-slate-700">ใช้ <b>{fmt(m.required)}</b> {unit}</div>
                <div className={`text-[10px] ${dueCls(m.due_date)}`}>📅 {dueText(m.due_date)}</div>
              </div>
              <div className="shrink-0 w-[62px] text-right">
                {m.is_ready
                  ? <span className="text-[10px] text-emerald-600">เตรียมครบ ✓</span>
                  : <span className="text-[10px] text-rose-600">ขาด {fmt(m.short)}</span>}
              </div>
              {rowInput(m)}
            </div>
          ))}

          {showAllocate && (
            <button type="button" onClick={() => void saveAlloc()} disabled={saving || allocSum <= 0 || allocSum > incomingQty + 0.0001}
              className="w-full h-9 text-[12px] font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
              {saving ? "กำลังบันทึก…" : `✅ บันทึกการแบ่ง (${fmt(allocSum)} ${unit})`}
            </button>
          )}

          {(shortAfter > 0 || (incomingQty === 0 && d.total_short > 0)) && (
            <button type="button" onClick={addShortToCart}
              className="w-full h-8 text-[11px] font-medium rounded-md border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50">
              🛒 ใส่ตะกร้าขอซื้อส่วนที่ขาด ({fmt(shortAfter || d.total_short)} {unit})
            </button>
          )}

          {hist.length > 0 && (
            <div className="rounded-md bg-white border border-slate-200">
              <button type="button" onClick={() => setHistOpen((o) => !o)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left">
                <span className="text-[11px] text-slate-500">📜 ประวัติการแบ่งของตัวนี้ ({hist.length})</span>
                <div className="flex-1" />
                <span className="text-[10px] text-slate-400">{histOpen ? "▲" : "▼"}</span>
              </button>
              {histOpen && (
                <div className="px-2 pb-2 space-y-1">
                  {hist.slice(0, 20).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[10px] text-slate-500 border-t border-slate-50 pt-1">
                      <span className="font-mono text-slate-600">{a.mo_no}</span>
                      <span className="tabular-nums text-slate-800 font-medium">{fmt(a.qty)} {unit}</span>
                      {a.ref_label && <span className="text-slate-400">· {a.ref_label}</span>}
                      <span className="text-slate-300">· {new Date(a.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                      <div className="flex-1" />
                      {canEdit && <button type="button" onClick={() => void undo(a)} className="text-rose-400 hover:text-rose-600">ยกเลิก</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-400 px-1">
            เรียงใบที่ใกล้ครบกำหนดก่อน (ใบที่ยังไม่ตั้งวันครบกำหนด = เรียงใบเก่าก่อน) · “ขาด” = ต้องใช้ − จำนวนที่มีในใบนั้น ·
            {showAllocate ? " แบ่งแล้วยอดจะไปเพิ่มที่ “จำนวนที่มี” ของใบนั้นทันที (ยกเลิกย้อนได้)" : " รับของเสร็จอย่าลืมไปติ๊ก “เตรียมแล้ว” ให้ใบที่ได้ของ"}
          </p>
        </div>
      )}
    </div>
  );
}
