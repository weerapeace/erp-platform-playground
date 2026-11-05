"use client";

/**
 * ป๊อป "อัปเดตสถานะ" ของใบสั่งขาย — ผูกใบขาย (บิล) เข้ารายการทีเดียว อัปเดตทั้งใบสั่งขายและใบสั่งผลิต
 * เจ้าของสั่ง 2026-11-05: "ขอปุ่ม update สถานะที่ใบสั่งขาย จะ update ทั้งใบสั่งผลิตและใบสั่งขายได้เลย พร้อมเชื่อมใบขาย"
 *   แผน = GET /api/so-orders/[id]/bill-match (กติกา lib/so-bill-match: หมายเหตุชีตก่อน · บิลว่าง/ย้ายจากใบอื่น/ร่าง)
 *   ยืนยัน = POST เดียวกัน → รายการเป็น "ส่งลูกค้าแล้ว" · ใบผลิตขายครบออกจากบอร์ด · ปิดงานอัตโนมัติ
 *   ใบที่ขายครบแต่ยังไม่บันทึกผลิต → ปุ่มไปบอร์ด "อัปเดตเป็นชุด" (ระบุโต๊ะ/ช่าง ให้ค่าแรงถูก — เจ้าของเลือก 2026-11-05)
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch/apiSave
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { apiSave } from "@/lib/save-toast";
import type { BillMatchLine, BillMatchPlan } from "@/app/api/so-orders/[id]/bill-match/route";
import type { PlanItem } from "@/lib/so-bill-match";

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const day = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const keyOf = (i: PlanItem) => `${i.kind}|${i.sale_line_id}|${i.to_mo_id}|${i.from?.mo_id ?? ""}`;
type Result = { linked: number; moved: number; auto_closed: string[]; needs_production: { mo_no: string; sku: string | null }[] };

const KIND_UI: Record<PlanItem["kind"], { label: (i: PlanItem) => string; cls: string }> = {
  free:   { label: () => "ผูก", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  move:   { label: (i) => `ย้ายจาก ${i.from?.mo_no ?? ""}`, cls: "border-amber-300 bg-amber-50 text-amber-800" },
  draft:  { label: () => "ร่าง — ยืนยันใบขายก่อน", cls: "border-slate-200 bg-slate-50 text-slate-500" },
  refill: { label: (i) => `ให้ ${i.to_mo_no}`, cls: "border-sky-200 bg-sky-50 text-sky-800" },
};

export function SoBillMatchModal({ orderId, orderNo, canApply, onClose, onApplied }: {
  orderId: string | null; orderNo?: string | null;
  /** ผูกใบขายได้ (products.edit) — ไม่มี = ดูแผนได้อย่างเดียว */
  canApply: boolean;
  onClose: () => void;
  /** บันทึกแล้ว → หน้าแม่โหลดใบสั่งขายใหม่ */
  onApplied?: () => void;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<BillMatchPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let off = false;
    setPlan(null); setErr(null); setResult(null);
    apiFetch(`/api/so-orders/${orderId}/bill-match`).then((r) => r.json()).then((j: { data?: BillMatchPlan; error?: string }) => {
      if (off) return;
      if (!j.data) { setErr(j.error ?? "โหลดไม่สำเร็จ"); return; }
      setPlan(j.data);
      setOn(new Set([...j.data.lines.flatMap((l) => l.items), ...j.data.refills].filter((i) => i.kind !== "draft").map(keyOf)));
    }).catch(() => { if (!off) setErr("โหลดไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { off = true; };
  }, [orderId]);

  const lines = plan?.lines ?? [];
  const todo = lines.filter((l) => l.items.length > 0 || l.state === "short" || (l.state === "no_mo" && l.sheet.length > 0));
  const done = lines.filter((l) => l.state === "done").length;
  const allItems = useMemo(() => [...lines.flatMap((l) => l.items), ...(plan?.refills ?? [])].filter((i) => i.kind !== "draft"), [lines, plan]);
  const chosen = allItems.filter((i) => on.has(keyOf(i)));
  const flip = (i: PlanItem) => setOn((s) => { const n = new Set(s); const k = keyOf(i); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const addOf = (l: BillMatchLine) => l.items.filter((i) => i.kind !== "draft" && on.has(keyOf(i))).reduce((a, i) => a + i.qty, 0);

  const apply = async () => {
    if (!orderId || !chosen.length || saving) return;
    setSaving(true);
    try {
      const r = await apiSave<Result>(toast, `/api/so-orders/${orderId}/bill-match`, { method: "POST",
        body: { items: chosen.map((i) => ({ sale_line_id: i.sale_line_id, to_mo_id: i.to_mo_id, qty: i.qty, from_mo_id: i.from?.mo_id ?? null })) } }, { quiet: true });
      if (!r.ok || !r.data) { toast.error(r.error ?? "อัปเดตไม่สำเร็จ"); return; }
      setResult(r.data);
      toast.success(`ผูกใบขายแล้ว ${r.data.linked} รายการ`);
      onApplied?.();
    } finally { setSaving(false); }
  };
  const openBoard = (mos: string[]) => window.open(`/master/work-board?cu=batch&mos=${mos.map(encodeURIComponent).join(",")}`, "_blank");

  const chip = (i: PlanItem) => {
    const ui = KIND_UI[i.kind], can = i.kind !== "draft" && canApply && !result;
    return (
      <label key={keyOf(i)} className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] ${ui.cls} ${can ? "cursor-pointer" : ""}`}
        title={i.bySheet ? "ตรงกับวันที่ในหมายเหตุชีต" : "ระบบเลือกจากวันที่ (ไม่มีหมายเหตุชีต)"}>
        {i.kind !== "draft" && <input type="checkbox" checked={on.has(keyOf(i))} disabled={!can} onChange={() => flip(i)} className="h-3.5 w-3.5 accent-violet-600" />}
        <span className="font-mono">{i.so_number}</span>
        <span>{day(i.date)} · {num(i.qty)}</span>
        <span className="font-medium">{ui.label(i)}</span>
      </label>
    );
  };

  return (
    <ERPModal open={!!orderId} onClose={() => !saving && onClose()} size="xl"
      title={`อัปเดตสถานะจากใบขาย${orderNo ? ` · ${orderNo}` : ""}`}
      description="ผูกใบขาย (บิล) เข้ารายการ — ใบสั่งขายกับใบสั่งผลิตอัปเดตพร้อมกัน"
      footer={
        <div className="flex w-full items-center gap-2">
          {!result && plan && <span className="mr-auto text-[12px] text-slate-500">เลือก <b className="text-slate-800">{chosen.length}</b> บิล{!canApply ? " · ต้องมีสิทธิ์แก้ข้อมูลสินค้าจึงจะบันทึกได้" : ""}</span>}
          {result && <span className="mr-auto" />}
          <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">{result ? "ปิด" : "ยกเลิก"}</button>
          {!result && (
            <button type="button" onClick={() => void apply()} disabled={!canApply || !chosen.length || saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
              <Icon name="refresh" /> {saving ? "กำลังอัปเดต…" : `ยืนยันอัปเดต ${chosen.length} บิล`}
            </button>
          )}
        </div>
      }>
      {err ? <p className="py-8 text-center text-sm text-rose-600">{err}</p>
        : !plan ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-50" />)}</div>
        : result ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <div className="font-medium">อัปเดตแล้ว — ผูกใบขาย {result.linked} รายการ{result.moved ? ` (ย้ายจากใบผลิตอื่น ${result.moved})` : ""}</div>
              <div className="mt-0.5 text-[12px]">รายการในใบสั่งขายเปลี่ยนสถานะตามบิลที่ผูกแล้ว{result.auto_closed.length ? ` · ปิดใบผลิตให้อัตโนมัติ ${result.auto_closed.length} ใบ` : ""}</div>
            </div>
            {result.needs_production.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800"><Icon name="warning" /> ขายครบแล้ว แต่ยังไม่บันทึกผลิต {result.needs_production.length} ใบ</div>
                <p className="mt-0.5 text-[12px] text-amber-800">บันทึกว่าโต๊ะ/ช่างไหนทำ → ช่างได้ค่าแรงถูกต้อง แล้วระบบปิดงานให้เอง</p>
                <div className="mt-1.5 flex flex-wrap gap-1">{result.needs_production.map((m) => <span key={m.mo_no} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-amber-900">{m.sku ?? ""} · {m.mo_no}</span>)}</div>
                <button type="button" onClick={() => openBoard(result.needs_production.map((m) => m.mo_no))}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-[13px] font-medium text-white hover:bg-amber-700">
                  <Icon name="factory" /> บันทึกผลิตที่บอร์ด (ระบุโต๊ะ/ช่าง) <Icon name="open" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 text-[12px]">
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-violet-800">ต้องอัปเดต {todo.length} รายการ</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700">ส่งครบแล้ว {done} รายการ</span>
              {plan.refills.length > 0 && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-sky-800">บิลว่างให้ใบที่ถูกย้ายออก {plan.refills.length}</span>}
            </div>
            {!todo.length ? (
              <p className="py-8 text-center text-sm text-slate-500">ทุกรายการผูกใบขายครบตามที่หาเจอแล้ว ไม่มีอะไรต้องอัปเดต</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] text-slate-500">
                    <tr><th className="px-3 py-2 text-left font-medium">รายการ</th><th className="px-2 py-2 text-right font-medium">สั่ง / ส่งแล้ว</th>
                      <th className="px-2 py-2 text-left font-medium">ชีตบอก</th><th className="px-2 py-2 text-left font-medium">บิลที่จะผูก</th><th className="px-3 py-2 text-left font-medium">หลังอัปเดต</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todo.map((l) => {
                      const after = l.shipped + addOf(l);
                      return (
                        <tr key={l.line_id} className="align-top">
                          <td className="px-3 py-2">
                            <div className="font-mono text-[12px] font-medium text-orange-700">{l.sku ?? "—"}</div>
                            <div className="max-w-[220px] truncate text-[12px] text-slate-600" title={l.name}>{l.name}</div>
                            <div className="text-[11px] text-slate-400">{l.mo ? `${l.mo.mo_no}${l.mo.status === "done" ? " · ปิดแล้ว" : ""}` : "ยังไม่มีใบสั่งผลิต"}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-700">{num(l.ordered)}<div className="text-[11px] text-slate-400">ส่งแล้ว {num(l.shipped)}</div></td>
                          <td className="px-2 py-2 text-[11px] text-slate-600">
                            {l.sheet.length ? l.sheet.map((s, i) => <div key={i} className="whitespace-nowrap">{day(s.date)}{s.qty != null ? ` · ${num(s.qty)}` : ""}</div>) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col items-start gap-1">{l.items.map(chip)}</div>
                            {l.short > 0 && <div className="mt-1 text-[11px] text-rose-600">{l.mo ? `หาบิลไม่เจออีก ${num(l.short)} ชิ้น` : "ต้องเปิด/ผูกใบสั่งผลิตก่อน"}</div>}
                          </td>
                          <td className="px-3 py-2 text-[12px]">
                            <div className={after >= l.ordered - 0.0001 ? "font-medium text-emerald-700" : "text-slate-600"}>ส่งแล้ว {num(after)}/{num(l.ordered)}</div>
                            {l.needs_production && <div className="mt-0.5 text-[11px] text-amber-700">ยังไม่บันทึกผลิต → บันทึกที่บอร์ดต่อ</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {plan.refills.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-3 py-2.5">
                <div className="text-[12px] font-medium text-sky-900">ใบผลิตที่ถูกย้ายบิลออก → ผูกบิลว่างให้แทน (จะได้ไม่กลับเป็น "ขายไม่ครบ")</div>
                <div className="mt-1.5 flex flex-wrap gap-1">{plan.refills.map(chip)}</div>
              </div>
            )}
          </div>
        )}
    </ERPModal>
  );
}
