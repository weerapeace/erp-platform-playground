"use client";

/**
 * PrCreateModal — ของกลาง: "สร้างใบขอซื้อ" จากรายการ SKU ที่เลือกมาแล้ว (1 ตัว หรือหลายตัว) จากหน้าไหนก็ได้
 *
 * ผู้เรียกส่ง SKU มา → ผู้ใช้ใส่จำนวนต่อรายการ + เหตุผล (บังคับ เหมือนหน้าขอซื้อ) → บันทึก
 * บันทึกผ่าน API กลางตัวเดียวกับหน้า 🛒 ขอซื้อ: POST /api/purchasing/create-pr
 *   (ตรวจสิทธิ์ pr.create · ออกเลขกลาง · เติมร้าน+ราคาจากร้านหลัก ★ ของ SKU ให้เอง · audit · แจ้งเตือนผู้อนุมัติ)
 * 1 รายการ = 1 ใบขอซื้อ (สถานะ "รออนุมัติ")
 *
 * เตือน "สั่งซ้ำ" ด้วยของเดิม: /api/purchasing/sku-open-orders + DupOrderBadge (ไม่บล็อก แค่เตือน)
 * ของกลางที่ใช้: ERPModal · RelationPicker (lookup pr_reason) · HoverImage · useAuth · useToast · apiFetch
 * ใช้ที่: แท็บ 🎨 Swatch (กดชิ้นบนรูป → ขอซื้อ / เลือกหลายรายการ)
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { RelationPicker } from "@/components/relation-picker";
import { DupOrderBadge, type OpenOrder } from "@/app/purchasing/dup-order";

export type PrCreateItem = {
  sku_id: string; code: string; name: string;
  image?: string | null;       // URL รูปย่อ (ไว้โชว์)
  image_key?: string | null;   // R2 key (เก็บลงใบขอซื้อ)
  uom?: string | null;
};
type Row = PrCreateItem & { qty: number };

export function PrCreateModal({ items, sourceNote, onClose, onCreated }: {
  items: PrCreateItem[];
  /** ข้อความบอกที่มา เก็บลงหมายเหตุของทุกใบ เช่น "จาก Swatch: หนัง PU ชุด A" */
  sourceNote?: string | null;
  onClose: () => void;
  onCreated?: (count: number) => void;
}) {
  const toast = useToast();
  const { user, can } = useAuth();
  const canCreate = can("pr.create");
  const [rows, setRows] = useState<Row[]>(() => items.map((i) => ({ ...i, qty: 1 })));
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [useDate, setUseDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dups, setDups] = useState<Record<string, OpenOrder[]>>({});

  // เตือนสั่งซ้ำ — สินค้าที่มีใบขอซื้อค้างอยู่
  useEffect(() => {
    const ids = items.map((i) => i.sku_id);
    if (!ids.length) return;
    apiFetch("/api/purchasing/sku-open-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_ids: ids }) })
      .then((r) => r.json()).then((j) => setDups((j.data ?? {}) as Record<string, OpenOrder[]>)).catch(() => {});
  }, [items]);

  const setQty = (id: string, q: number) => setRows((p) => p.map((r) => (r.sku_id === id ? { ...r, qty: Math.max(0, Math.round(q * 100) / 100) } : r)));
  /** ปุ่ม −/+ : คิดจากค่าล่าสุดใน state (กดรัว ๆ แล้วไม่นับตก) */
  const bump = (id: string, d: number) => setRows((p) => p.map((r) => (r.sku_id === id ? { ...r, qty: Math.max(0, Math.round(((Number(r.qty) || 0) + d) * 100) / 100) } : r)));
  const badQty = rows.some((r) => !(r.qty > 0));
  const valid = canCreate && rows.length > 0 && !badQty && !!reasonText;
  const dirty = !!reasonText || !!note || urgent || rows.some((r) => r.qty !== 1) || rows.length !== items.length;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setErr(null);
    try {
      const fullNote = [note.trim(), sourceNote?.trim()].filter(Boolean).join(" · ") || null;
      const res = await apiFetch("/api/purchasing/create-pr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor: user?.name,
          items: rows.map((r) => ({
            sku_id: r.sku_id, item_name: r.name || r.code, qty: r.qty, uom: r.uom ?? null,
            image_key: r.image_key ?? null, note: fullNote, reason: reasonText,
            is_urgent: urgent, needed_date: urgent && useDate ? useDate : null,
          })),
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const n = Number(j.created ?? rows.length);
      toast.success(`สร้างใบขอซื้อ ${n} ใบแล้ว — รออนุมัติ`);
      onCreated?.(n);
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "สร้างใบขอซื้อไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" storageKey="pr-create-modal" hasUnsavedChanges={dirty} loading={saving}
      title={`🛒 สร้างใบขอซื้อ (${rows.length} รายการ)`}
      footer={
        <>
          <a href="/purchasing" target="_blank" rel="noopener noreferrer" className="mr-auto text-xs text-blue-600 hover:underline">เปิดหน้าขอซื้อ ↗</a>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={!valid || saving}
            title={!canCreate ? "คุณไม่มีสิทธิ์สร้างใบขอซื้อ" : !reasonText ? "กรุณาเลือกเหตุผลที่ขอซื้อก่อน" : badQty ? "จำนวนต้องมากกว่า 0" : undefined}
            className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : `สร้างใบขอซื้อ ${rows.length} ใบ`}
          </button>
        </>
      }>
      <div className="space-y-3">
        {!canCreate && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">คุณไม่มีสิทธิ์สร้างใบขอซื้อ — ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ “สร้างใบขอซื้อ”</div>}
        {err && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">⚠ {err}</div>}

        {/* รายการ + จำนวน */}
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-[42vh] overflow-y-auto">
          {rows.map((r) => (
            <li key={r.sku_id} className="flex items-center gap-2 px-2.5 py-2">
              <HoverImage url={r.image ?? null} size={40} rounded="rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-[11px] text-slate-500 truncate">{r.code}</span>
                  <DupOrderBadge orders={dups[r.sku_id]} />
                </div>
                <div className="text-sm text-slate-800 truncate" title={r.name}>{r.name || "—"}</div>
              </div>
              <div className="flex items-stretch gap-1 shrink-0">
                <button type="button" aria-label="ลดจำนวน" onClick={() => bump(r.sku_id, -1)} disabled={saving}
                  className="w-9 h-9 flex items-center justify-center text-xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 select-none">−</button>
                <input type="number" inputMode="decimal" min={0} step="any" value={r.qty} disabled={saving}
                  onFocus={(e) => e.target.select()} onChange={(e) => setQty(r.sku_id, Number(e.target.value))}
                  className={`w-16 h-9 px-1 text-center text-sm font-medium border rounded-md tabular-nums ${r.qty > 0 ? "border-slate-200" : "border-rose-300 bg-rose-50"}`} />
                <button type="button" aria-label="เพิ่มจำนวน" onClick={() => bump(r.sku_id, 1)} disabled={saving}
                  className="w-9 h-9 flex items-center justify-center text-xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 select-none">+</button>
              </div>
              <span className="w-10 text-[11px] text-slate-400 truncate shrink-0" title={r.uom ?? ""}>{r.uom ?? ""}</span>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((p) => p.filter((x) => x.sku_id !== r.sku_id))} disabled={saving}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 shrink-0" title="เอารายการนี้ออก">✕</button>
              )}
            </li>
          ))}
        </ul>
        {Object.keys(dups).some((k) => rows.some((r) => r.sku_id === k) && (dups[k]?.length ?? 0) > 0) && (
          <p className="text-[11.5px] text-amber-700">⚠️ รายการที่มีป้าย “เคยสั่ง” มีใบขอซื้อที่ยังค้างอยู่ — ตรวจก่อนว่าไม่ได้สั่งซ้ำ (ยังกดสร้างได้)</p>
        )}

        {/* เหตุผล (บังคับ) */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">เหตุผลที่ขอซื้อ <span className="text-rose-500">*</span> <span className="font-normal text-slate-400">(ใช้กับทุกรายการในใบนี้)</span></label>
          <RelationPicker value={reasonId}
            onChange={(id, opt) => { setReasonId(id); setReasonText(opt?.label ?? ""); }}
            config={{ target_table: "erp_lookups", target_label_field: "name", lookup_type: "pr_reason" }}
            placeholder="เลือกเหตุผล (พิมพ์เพื่อเพิ่มใหม่)" required hasError={!reasonText} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ (ถ้ามี)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สีพิเศษ / ขอตัวอย่างก่อน" disabled={saving}
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200" />
          {sourceNote && <p className="mt-1 text-[11px] text-slate-400">ระบบจะต่อท้ายให้อัตโนมัติ: “{sourceNote}”</p>}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} disabled={saving} className="rounded border-slate-300" />
            <span className="font-medium">⚡ ส่งด่วน</span>
          </label>
          {urgent && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ใช้งาน (ถ้ามี)</label>
              <input type="date" value={useDate} onChange={(e) => setUseDate(e.target.value)} disabled={saving}
                className="w-full h-9 px-3 text-sm border border-amber-200 bg-amber-50/40 rounded-md" />
            </div>
          )}
        </div>
      </div>
    </ERPModal>
  );
}
