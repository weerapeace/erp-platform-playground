"use client";

/**
 * สถานะ "คาดการณ์ / วัดจริงแล้ว" ของแบบตัดผ้า (หน้าคิดผ้าก่อนซื้อ · เจ้าของขอ 2026-11-13)
 *   useCutChecks(pairs)  โหลดผลวัดล่าสุดต่อคู่ (สินค้า|ผ้า) จาก /api/fabric-cut-checks
 *   CutStatusBadge       ป้ายใหญ่ ส้ม = คาดการณ์ · เขียว = วัดจริงแล้ว (ตัวหนังสือรายละเอียดใต้ป้าย)
 *   MeasureModal         กรอกผลวัดจริง (ใบสั่งผลิต · ตัดจริงกี่ใบ · ใช้ผ้าจริงเท่าไร) → ใช้จริงต่อใบ + ต่างจากคาดกี่ % · ยกเลิกผลล่าสุดได้ (ยืนยันก่อน)
 * ของกลาง: ERPModal · ConfirmDialog · useToast · lib/fabric-buy (piecesFingerprint · cutCheckState)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import type { CutCheck, CutCheckState } from "@/lib/fabric-buy";
import { Field, Num, fmt, textCls } from "./buy-ui";

/** โหลดผลวัดล่าสุดของหลายคู่ (สินค้า|ผ้า) — reload() หลังบันทึก/ยกเลิก */
export function useCutChecks(pairs: string[]): { checks: Record<string, CutCheck>; reload: () => void; loading: boolean } {
  const [checks, setChecks] = useState<Record<string, CutCheck>>({});
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const key = [...new Set(pairs.filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!key) { setChecks({}); return; }
    let alive = true;
    setLoading(true);
    apiFetch(`/api/fabric-cut-checks?pairs=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive && !j.error) setChecks(Object.fromEntries(((j.data ?? []) as CutCheck[]).map((c) => [`${c.product_sku}|${c.component_sku}`, c]))); })
      .catch(() => { /* ไม่ได้ = โชว์คาดการณ์ */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { checks, reload, loading };
}

export function CutStatusBadge({ st, size = "lg", hint }: { st: CutCheckState; size?: "lg" | "sm"; hint?: string }) {
  const ok = st.state === "measured";
  const cls = ok ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-orange-400 bg-orange-50 text-orange-800";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border-2 font-bold ${cls} ${size === "lg" ? "px-3 py-1 text-[15px]" : "px-2 py-0.5 text-[12px]"}`} title={`${st.detail}${hint ? ` · ${hint}` : ""}`}>
      <Icon name={ok ? "done" : "warning"} /> {ok ? "วัดจริงแล้ว" : "คาดการณ์"}
    </span>
  );
}

export type MeasureTarget = { product_sku: string; component_sku: string; label: string; fp: string; unit: string; est_per_unit: number; mo_no?: string | null; qty?: number };

export function MeasureModal({ target, current, onClose, onSaved }: { target: MeasureTarget | null; current: CutCheck | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mo, setMo] = useState("");
  const [qty, setQty] = useState(0);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [askDel, setAskDel] = useState(false);
  useEffect(() => { if (target) { setMo(target.mo_no ?? ""); setQty(target.qty ?? 0); setTotal(0); setNote(""); setErr(""); } }, [target]);
  if (!target) return null;
  const per = qty > 0 ? total / qty : 0;
  const diff = per > 0 && target.est_per_unit > 0 ? ((per - target.est_per_unit) / target.est_per_unit) * 100 : null;

  const save = async () => {
    if (!(qty > 0)) { setErr("ใส่จำนวนใบที่ตัดจริงก่อน"); return; }
    if (!(total > 0)) { setErr("ใส่ผ้าที่ใช้จริงก่อน"); return; }
    setSaving(true); setErr("");
    try {
      const res = await apiFetch("/api/fabric-cut-checks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_sku: target.product_sku, component_sku: target.component_sku, pieces_fp: target.fp, unit: target.unit, est_per_unit: target.est_per_unit, actual_total: total, actual_qty: qty, mo_no: mo, note }) });
      const j = await res.json();
      if (!res.ok || j.error) { setErr(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      toast.success("บันทึกผลวัดจริงแล้ว — ป้ายเปลี่ยนเป็น “วัดจริงแล้ว”");
      onSaved(); onClose();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!current) return;
    try {
      const j = await apiFetch(`/api/fabric-cut-checks?id=${encodeURIComponent(current.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success("ยกเลิกผลวัดแล้ว"); onSaved(); onClose();
    } catch { toast.error("ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setAskDel(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="บันทึกผลวัดจริง (วางผ้าจริงแล้ว)" size="md"
      footer={<div className="flex w-full items-center gap-2">
        {current && <button type="button" onClick={() => setAskDel(true)} className="h-9 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50">ยกเลิกผลวัดล่าสุด</button>}
        <button type="button" onClick={onClose} className="ml-auto h-9 rounded-lg bg-slate-100 px-4 text-sm text-slate-700 hover:bg-slate-200">ปิด</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก = วัดจริงแล้ว"}</button>
      </div>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">{target.label}<br />คาดไว้ <b>{fmt(target.est_per_unit, 3)} {target.unit}/ใบ</b> (ไม่รวมเผื่อเสีย)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="ใบสั่งผลิตที่วางจริง (ถ้ามี)"><input value={mo} onChange={(e) => setMo(e.target.value)} placeholder="MO-…" className={textCls} /></Field>
          <Field label="ตัดจริงกี่ใบ"><Num value={qty} onChange={(v) => setQty(Math.floor(v))} /></Field>
          <Field label={`ใช้ผ้าจริง (${target.unit})`}><Num value={total} onChange={setTotal} /></Field>
        </div>
        <Field label="หมายเหตุ"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น หัวม้วนเสีย 30 ซม. / วางตรงตามแบบ" className={textCls} /></Field>
        {per > 0 && (
          <div className={`rounded-lg px-3 py-2 text-[13px] ${diff != null && Math.abs(diff) > 5 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
            ใช้จริง <b>{fmt(per, 3)} {target.unit}/ใบ</b>{diff != null && <> · ต่างจากคาด <b>{diff > 0 ? "+" : ""}{fmt(diff, 1)}%</b>{Math.abs(diff) > 5 ? " (ต่างเกิน 5% — ลองดูว่าวางตามแบบไหม หรือเผื่อเสียควรปรับ)" : ""}</>}
          </div>
        )}
        {err && <p className="text-[13px] text-rose-600">{err}</p>}
        <p className="text-[11.5px] text-slate-400">ผลนี้ผูกกับ สินค้า + ผ้า + ขนาดชิ้นตอนนี้ · ถ้าแก้ขนาดชิ้นในสูตรทีหลัง ป้ายจะกลับเป็น “คาดการณ์” เอง</p>
      </div>
      <ConfirmDialog open={askDel} onClose={() => setAskDel(false)} onConfirm={() => void del()} variant="danger" confirmText="ยกเลิกผลวัด" title="ยกเลิกผลวัดล่าสุด?" message="ป้ายจะกลับเป็น “คาดการณ์” (ผลวัดก่อนหน้านั้นถ้ามี จะกลับมาแสดงแทน)" />
    </ERPModal>
  );
}
