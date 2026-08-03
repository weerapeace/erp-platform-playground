"use client";

/**
 * ของกลาง — เช็กลิสต์วัตถุดิบของใบสั่งผลิต (โหลด + แสดง + บันทึกในตัว)
 * เดิมโค้ดชุดนี้อยู่ในหน้าบอร์ดจ่ายงานอย่างเดียว → ยกออกมาเป็นของกลางเพื่อฝังในหน้าอื่นได้
 * (ตอนนี้ใช้ในหน้า "ความพร้อมวัตถุดิบ" — ติ๊กเตรียม/ใส่จำนวนที่มีได้เลยไม่ต้องสลับหน้า)
 *
 * ใช้: <MoMaterialChecklist moId={id} moNo="MO-xxxx" productLabel="..." onSaved={reload} />
 * บันทึก: PATCH /api/mo/material (เตรียม/จำนวนที่มี/ต้องซื้อ) · PATCH /api/mo/material-line (ตัดครบ)
 * ของกลางที่ใช้ต่อ: MoMaterialsTable · addToPrCart · usePermission · useToast · apiFetch
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { addToPrCart } from "@/lib/pr-cart";
import { MoMaterialsTable, type MoMatSummary, type MoMatPreview } from "@/components/mo-materials";

const n2 = (v: unknown) => Number(v ?? 0) || 0;
const num = (v: unknown) => (v == null ? null : Number(v) || 0);
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

type Loaded = {
  summary: MoMatSummary[]; materials: MoMatPreview[];
  qty: number; sizeQty: Record<string, number>; requested: Record<string, number>;
};

export function MoMaterialChecklist({
  moId, moNo, productLabel, onSaved,
}: {
  moId: string;
  moNo: string;
  productLabel?: string | null;
  /** เรียกหลังบันทึกสำเร็จ (ให้หน้าแม่รีเฟรชตัวเลข) */
  onSaved?: () => void;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [d, setD] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(new Map<string, { on: number; rd: boolean; po: number | null }>());

  useEffect(() => {
    let on = true;
    setD(null); setErr(null); savedRef.current.clear();
    apiFetch(`/api/mo/${encodeURIComponent(moId)}`).then((r) => r.json()).then((j) => {
      if (!on) return;
      if (j?.error) throw new Error(j.error);
      const rows = (j?.data?.summary ?? []) as Record<string, unknown>[];
      const mats = (j?.data?.materials ?? []) as Record<string, unknown>[];
      const summary: MoMatSummary[] = rows.map((s) => ({
        key: String(s.id), id: String(s.id),
        component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
        material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null,
        qty_per: n2(s.qty_per), on_hand_qty: n2(s.on_hand_qty), is_ready: !!s.is_ready,
        purchase_override: s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null,
        image_url: (s.image_url as string) ?? null,
      }));
      const materials: MoMatPreview[] = mats.map((m) => ({
        key: String(m.id), id: String(m.id),
        component_sku: (m.component_sku as string) ?? null, component_name: (m.component_name as string) ?? null,
        material_type: (m.material_type as string) ?? null, qty_per: n2(m.qty_per), uom: (m.uom as string) ?? null,
        cut_block_code: (m.cut_block_code as string) ?? null, cut_width: num(m.cut_width), cut_length: num(m.cut_length), pieces: num(m.pieces),
        on_hand_qty: n2(m.on_hand_qty), is_ready: !!m.is_ready, purchase_override: null, cut_done: !!m.cut_done,
        size_label: (m.size_label as string) ?? null,
        image_url: (m.image_url as string) ?? null,
      }));
      const sb = (j?.data?.size_breakdown ?? []) as { label?: unknown; qty?: unknown }[];
      const sizeQty: Record<string, number> = {};
      for (const s of sb) { const lb = s?.label != null ? String(s.label) : ""; if (lb) sizeQty[lb] = Number(s.qty) || 0; }
      setD({ summary, materials, qty: n2(j?.data?.qty), sizeQty, requested: (j?.data?.requested ?? {}) as Record<string, number> });
    }).catch((e) => { if (on) setErr(e instanceof Error ? e.message : "โหลดวัตถุดิบไม่สำเร็จ"); });
    return () => { on = false; };
  }, [moId]);

  // บันทึกแบบหน่วง 600ms (พิมพ์ตัวเลขรัว ๆ ไม่ยิงทุกตัวอักษร) — ส่งเฉพาะฟิลด์ที่เปลี่ยนจริง
  const onChangeSummary = useCallback((rows: MoMatSummary[]) => {
    setD((p) => (p ? { ...p, summary: rows } : p));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      let touched = 0;
      for (const r of rows) {
        if (!r.id) continue;
        const prev = savedRef.current.get(r.id);
        const body: Record<string, unknown> = {};
        if (!prev || prev.rd !== r.is_ready) body.is_ready = r.is_ready;
        if (!prev || prev.on !== r.on_hand_qty) body.on_hand_qty = r.on_hand_qty;
        if (!prev || prev.po !== r.purchase_override) body.purchase_override = r.purchase_override;
        if (Object.keys(body).length === 0) continue;
        savedRef.current.set(r.id, { on: r.on_hand_qty, rd: r.is_ready, po: r.purchase_override });
        touched++;
        void apiFetch("/api/mo/material", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }) })
          .then((res) => res.json()).then((j) => { if (j.error) toast.error(j.error); }).catch(() => toast.error("บันทึกไม่สำเร็จ"));
      }
      if (touched > 0) onSaved?.();
    }, 600);
  }, [toast, onSaved]);

  const onToggleCut = useCallback(async (line: MoMatPreview, next: boolean) => {
    if (!canEdit || !line.id) return;
    setD((p) => (p ? { ...p, materials: p.materials.map((m) => (m.id === line.id ? { ...m, cut_done: next } : m)) } : p));
    try {
      const res = await apiFetch("/api/mo/material-line", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: line.id, cut_done: next }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onSaved?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }, [canEdit, toast, onSaved]);

  if (err) return <div className="py-8 text-center text-rose-500 text-sm">⚠ {err}</div>;
  if (!d) return <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลดวัตถุดิบ…</div>;

  return (
    <MoMaterialsTable
      summary={d.summary} materials={d.materials} qty={d.qty} sizeQty={d.sizeQty} requested={d.requested}
      editable canEdit={canEdit}
      onChangeSummary={onChangeSummary}
      onToggleCut={onToggleCut}
      onAddToCart={canEdit ? (row) => {
        const label = row.component_sku ? `[${row.component_sku}] ${row.component_name ?? ""}`.trim() : (row.component_name ?? "วัตถุดิบ");
        addToPrCart([{
          label, qty: row.to_purchase, uom: row.uom ?? "", seller: "—", price: 0, currency: "THB",
          image: null, variationId: null, skuRef: row.component_sku, skuId: null,
          note: `จากใบสั่งผลิต ${moNo}`, sourceMoNo: moNo, usedForLabel: productLabel ?? null,
        }]);
        toast.success(`ใส่ตะกร้าขอซื้อแล้ว: ${row.component_name ?? row.component_sku ?? ""} · ${fmt(row.to_purchase)} ${row.uom ?? ""} — ไปหน้า “ขอซื้อ” เพื่อยืนยัน`);
      } : undefined}
      emptyText="ใบนี้ยังไม่มีสูตรวัตถุดิบ (BOM)"
    />
  );
}
