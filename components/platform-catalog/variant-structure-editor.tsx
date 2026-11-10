"use client";
/**
 * เพิ่ม/ลบค่าตัวเลือกของสินค้าบน LINE (แท็บ "ตัวเลือก & ราคา" → โหมด "เพิ่ม/ลบตัวเลือก" ของลิ้นชักสินค้าบนร้าน)
 *
 * กันพลาด: ทำได้เฉพาะสินค้าที่ปิดขายอยู่ · ลบ = ลบทุกตัวเลือกที่มีค่านั้น (โชว์รายการที่จะหายก่อนยืนยัน) · ห้ามลบจนไม่เหลือ
 * เพิ่มค่าใหม่ → กรอกราคา/น้ำหนัก/SKU ต่อแถว (สินค้า 2 ชั้น = 1 แถวต่อค่าของอีกชั้น) · สต๊อกตัวใหม่ = 0 · ส่วนลดตั้งทีหลังในโหมดราคา
 * ส่งทันทีทีละเรื่อง (ไม่รวมกับปุ่ม "บันทึกขึ้น LINE") — POST /api/line-shopping/listing-variants · กฎ lib/line-variant-structure
 * ของกลางที่ใช้: ConfirmDialog · MoneyInput · Icon · toast
 */
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { Icon } from "@/components/icon";
import { planAddOptionValue, planDeleteOptionValue, variantsWithValue, type LineOptionStructure, type NewVariantRow } from "@/lib/line-variant-structure";

const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };

export function VariantStructureEditor({ listingId, structure, display, canEdit, blockedReason, defaults, onDone }: {
  listingId: string;
  structure: LineOptionStructure | null;
  /** เปิดขายอยู่ไหม — ต้องปิดขายก่อนถึงแก้ได้ */
  display: boolean | null;
  canEdit: boolean;
  /** เหตุที่ยังทำไม่ได้ (เช่น มีที่แก้ค้างยังไม่บันทึก) */
  blockedReason?: string | null;
  /** ค่าตั้งต้นของแถวใหม่ (จากตัวเลือกแรกของสินค้า) */
  defaults: { price: number | null; weight: number | null };
  /** ส่งสำเร็จ → ลิ้นชักโหลดใหม่ */
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<{ idx: number; value: string } | null>(null);
  const [addIdx, setAddIdx] = useState<number | null>(null);
  const [newValue, setNewValue] = useState("");
  const [rows, setRows] = useState<NewVariantRow[]>([]);
  const [askAdd, setAskAdd] = useState(false);

  const locked = !canEdit || display !== false || !!blockedReason;
  const delPlan = useMemo(() => (structure && del ? planDeleteOptionValue(structure, del.idx, del.value) : null), [structure, del]);
  const addPlan = useMemo(() => (structure && addIdx != null ? planAddOptionValue(structure, addIdx, newValue, rows) : null), [structure, addIdx, newValue, rows]);

  if (!structure) return <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">ยังไม่มีข้อมูลตัวเลือกของสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ก่อน</p>;

  const startAdd = (idx: number) => {
    const other = structure.options.length === 2 ? structure.options[1 - idx] : null;
    setAddIdx(idx); setNewValue("");
    setRows((other ? other.values : [null]).map((ov) => ({ otherValue: ov, price: defaults.price, weight: defaults.weight, sku: "", barcode: null })));
  };
  const setRow = (i: number, patch: Partial<NewVariantRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const send = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-variants", { method: "POST", body: JSON.stringify({ listing_id: listingId, ...body }) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!j.ok) { toast.error(`LINE ไม่รับ: ${j.error ?? `HTTP ${r.status}`}`); return false; }
      toast.success(okText); onDone(); return true;
    } catch (e) { toast.error(`ส่งไป LINE ไม่สำเร็จ: ${(e as Error).message}`); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {display !== false && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Icon name="warning" className="mt-0.5 shrink-0" />
          เพิ่ม/ลบตัวเลือกได้เฉพาะสินค้าที่ปิดขายอยู่ (กันลูกค้าเห็นระหว่างแก้) — ปิดขายที่สวิตช์มุมบน แก้เสร็จแล้วค่อยเปิดขายใหม่
        </p>
      )}
      {blockedReason && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{blockedReason}</p>}

      {structure.options.map((opt, idx) => (
        <div key={opt.name} className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">{opt.name} <span className="font-normal text-slate-400">({opt.values.length} ค่า)</span></span>
            {!locked && addIdx !== idx && <button type="button" onClick={() => startAdd(idx)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="add" />เพิ่ม{opt.name}</button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {opt.values.map((v) => {
              const n = variantsWithValue(structure, idx, v).length;
              return (
                <span key={v} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
                  {v} <span className="text-slate-400">· {n}</span>
                  {!locked && opt.values.length > 1 && (
                    <button type="button" onClick={() => setDel({ idx, value: v })} aria-label={`ลบ ${v}`} title={`ลบ${opt.name} “${v}” (ลบ ${n} ตัวเลือก)`}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="cancel" /></button>
                  )}
                </span>
              );
            })}
          </div>

          {addIdx === idx && !locked && (
            <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5">
              <label className="block text-xs text-slate-600">ค่า{opt.name}ใหม่
                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={`เช่น ${opt.values[0] ?? ""}`} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-sm" />
              </label>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500">
                    {structure.options.length === 2 && <th className="py-1 pr-2 font-medium">{structure.options[1 - idx].name}</th>}
                    <th className="py-1 pr-2 font-medium">ราคาเต็ม</th><th className="py-1 pr-2 font-medium">น้ำหนัก (กก.)</th><th className="py-1 pr-2 font-medium">SKU</th><th className="py-1 font-medium">บาร์โค้ด</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {structure.options.length === 2 && <td className="py-1 pr-2 text-slate-700">{r.otherValue}</td>}
                        <td className="py-1 pr-2"><MoneyInput value={r.price} onChange={(raw) => setRow(i, { price: numOrNull(raw) })} className="h-8 w-24 rounded-md border border-slate-200 px-2 text-right" /></td>
                        <td className="py-1 pr-2"><input type="number" step="0.01" value={r.weight ?? ""} onChange={(e) => setRow(i, { weight: numOrNull(e.target.value) })} className="h-8 w-20 rounded-md border border-slate-200 px-2 text-right" /></td>
                        <td className="py-1 pr-2"><input value={r.sku} onChange={(e) => setRow(i, { sku: e.target.value })} className="h-8 w-32 rounded-md border border-slate-200 px-2 font-mono" /></td>
                        <td className="py-1"><input value={r.barcode ?? ""} onChange={(e) => setRow(i, { barcode: e.target.value })} className="h-8 w-32 rounded-md border border-slate-200 px-2 font-mono" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {addPlan && addPlan.errors.length > 0 && newValue.trim() && <p className="text-[11px] text-rose-600">{addPlan.errors[0]}</p>}
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[11px] text-slate-500">สต๊อกตัวใหม่ = 0 · ตั้งราคาที่ลูกค้าจ่าย (ส่วนลด) ทีหลังในโหมดราคา · SKU ควรตรงกับในระบบ (ส่งราคา/สต๊อกจับด้วยรหัสนี้)</span>
                <button type="button" onClick={() => setAddIdx(null)} className="h-8 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-white">ยกเลิก</button>
                <button type="button" disabled={!addPlan?.payload || busy} onClick={() => setAskAdd(true)} className="h-8 rounded-md bg-violet-600 px-2.5 text-xs text-white hover:bg-violet-700 disabled:opacity-40">เพิ่มขึ้น LINE ({rows.length})</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <ConfirmDialog open={!!del && !!delPlan} onClose={() => { if (!busy) setDel(null); }} loading={busy} variant="danger"
        title={delPlan ? `ลบ${delPlan.name} “${delPlan.value}” บน LINE?` : ""} confirmText={delPlan ? `ลบ ${delPlan.affected.length} ตัวเลือก` : "ลบ"}
        onConfirm={() => { if (delPlan && !delPlan.error && del) void send({ action: "delete", option_index: del.idx, value: delPlan.value }, `ลบ${delPlan.name} “${delPlan.value}” แล้ว`).then((ok) => { if (ok) setDel(null); }); }}
        message={delPlan ? (delPlan.error ? <p className="text-sm text-rose-600">{delPlan.error}</p> : (
          <div className="space-y-2 text-sm">
            <p>LINE จะลบ <b>ทุกตัวเลือกที่มี{delPlan.name} “{delPlan.value}”</b> ออกจากสินค้า — กู้คืนไม่ได้ (ต้องเพิ่มใหม่เอง)</p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
              {delPlan.affected.map((v) => <li key={v.id}>{v.sku ?? v.id} · {v.values.join(" / ")}</li>)}
            </ul>
          </div>
        )) : ""} />

      <ConfirmDialog open={askAdd && !!addPlan?.payload} onClose={() => { if (!busy) setAskAdd(false); }} loading={busy}
        title={addIdx != null ? `เพิ่ม${structure.options[addIdx].name} “${newValue.trim()}” บน LINE?` : ""} confirmText={`เพิ่ม ${rows.length} ตัวเลือก`}
        onConfirm={() => { if (addIdx != null) void send({ action: "add", option_index: addIdx, value: newValue.trim(), rows }, `เพิ่มตัวเลือกบน LINE แล้ว ${rows.length} ตัว`).then((ok) => { if (ok) { setAskAdd(false); setAddIdx(null); } }); }}
        message={addPlan?.payload ? (
          <div className="space-y-2 text-sm">
            <p>ตัวเลือกใหม่ {rows.length} ตัว (สต๊อก 0) — ส่งขึ้นร้าน LINE จริง · มีประวัติว่าใครเพิ่ม</p>
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs">
              {addPlan.payload.variants.map((v, i) => <li key={i}>{v.sku} · {v.price.toLocaleString()}฿ · {v.weight} กก.</li>)}
            </ul>
          </div>
        ) : ""} />
    </div>
  );
}
