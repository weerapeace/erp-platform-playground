"use client";

/**
 * แผงข้อมูลแผ่น Swatch (หน้าดู · ข้างรูป / ใต้รูปบนมือถือ)
 *   รายละเอียด (Note) · ร้านที่สั่งได้ + ราคา/เงื่อนไขซื้อ · สเปกวัสดุ · ชิ้นที่ผูก SKU (สต็อก + ซื้อล่าสุด) · ใช้ในสินค้าไหน (BOM) · ไฟล์แนบ
 * แต่ละหัวข้อกด "แก้" แล้วบันทึกแยกกัน (PATCH เฉพาะช่องนั้น — ไม่แตะรูป/ชิ้น)
 * ราคา = ต้นทุน: ไม่มีสิทธิ์ products.cost.view → API ส่งราคาเป็นว่าง + แผงซ่อนช่องราคา (บันทึกแล้วราคาเดิมไม่หาย)
 * ของกลางที่ใช้: SupplierPicker/usePartnerSuppliers · MoneyInput · RecordFilesField · HoverPreview · Icon
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MoneyInput } from "@/components/money-input";
import { HoverPreview } from "@/components/hover-image";
import { RecordFilesField } from "@/components/record-files";
import { SupplierPicker, usePartnerSuppliers } from "@/components/supplier-picker";
import type { SwatchDetail, SwatchSpot, SwatchSupplier } from "@/app/api/sku-swatches/route";
import type { BomWhereUsedRow } from "@/app/api/bom/where-used/route";

const CUR_SIGN: Record<string, string> = { THB: "฿", CNY: "¥", USD: "$" };
const UNIT_CHOICES = ["หลา", "เมตร", "ม้วน", "กก.", "ชิ้น", "แผ่น", "โหล"];
const MATERIAL_CHOICES = ["Canvas", "RPET Canvas", "Oxford", "Nylon", "Polyester", "Denim", "Cotton", "PU", "หนังแท้", "ผ้าร่ม", "ตาข่าย"];
const fmtNum = (n: number | null | undefined, max = 2) => (n == null ? "" : n.toLocaleString("th-TH", { maximumFractionDigits: max }));
/** "฿12.50 / หลา" */
export const fmtPrice = (price: number | null | undefined, currency?: string | null, unit?: string | null) =>
  price == null ? "" : `${CUR_SIGN[currency ?? "THB"] ?? ""}${fmtNum(price)}${unit ? ` / ${unit}` : ""}`;
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  const t = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // วันที่ไทย
const chipNo = (code: string | null) => (code ? `-${code.split("-").pop()}` : "—");

async function patchBoard(body: Record<string, unknown>) {
  const j = await apiFetch("/api/sku-swatches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  if (j.error) throw new Error(j.error);
}

function Section({ icon, title, extra, action, children }: { icon: string; title: string; extra?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 px-3 h-9 border-b border-slate-100">
        <Icon value={icon} size={15} className="text-slate-500" />
        <span className="text-[12.5px] font-semibold text-slate-700">{title}</span>
        {extra && <span className="text-[11px] text-slate-400 truncate">{extra}</span>}
        <span className="ml-auto flex items-center gap-1">{action}</span>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
const EditBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="h-6 px-2 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">แก้</button>
);
const SaveBar = ({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) => (
  <div className="flex justify-end gap-1.5 pt-2">
    <button type="button" onClick={onCancel} disabled={saving} className="h-7 px-2.5 text-[12px] rounded-md border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
    <button type="button" onClick={onSave} disabled={saving} className="h-7 px-3 text-[12px] rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
  </div>
);
const inputCls = "h-8 px-2 text-[12.5px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-0 bg-white";

// ───────────────────────────── รายละเอียด (Note) ─────────────────────────────
function NoteSection({ data, canEdit, onSaved, onEditing }: { data: SwatchDetail; canEdit: boolean; onSaved: () => void; onEditing: (on: boolean) => void }) {
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const edit = (v: string | null) => { setText(v); onEditing(v !== null); };
  const save = async () => {
    setSaving(true);
    try { await patchBoard({ id: data.id, note: text ?? "" }); toast.success("บันทึกรายละเอียดแล้ว"); edit(null); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  return (
    <Section icon="📝" title="รายละเอียด" action={canEdit && text === null ? <EditBtn onClick={() => edit(data.note ?? "")} /> : null}>
      {text !== null ? (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus maxLength={4000}
            placeholder="จดอะไรก็ได้ เช่น เล่มตัวอย่างเล่มไหน · สีที่ลูกค้าชอบ · ข้อควรระวังตอนสั่ง"
            className="w-full px-2.5 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y" />
          <SaveBar saving={saving} onSave={() => void save()} onCancel={() => edit(null)} />
        </>
      ) : data.note ? <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{data.note}</p>
        : <p className="text-[12px] text-slate-400">ยังไม่มีรายละเอียด{canEdit ? " — กด แก้ เพื่อจด" : ""}</p>}
    </Section>
  );
}

// ───────────────────────────── ร้านที่สั่งได้ + ราคา ─────────────────────────────
type SupDraft = Omit<SwatchSupplier, "id" | "name" | "sort_order"> & { id: string | null; key: string; typed: boolean };
let draftSeq = 0;
const toDraft = (s: SwatchSupplier): SupDraft => ({ ...s, key: s.id, typed: !s.partner_id });
const blankSup = (main: boolean): SupDraft => ({
  id: null, key: `n${++draftSeq}`, typed: false, partner_id: null, partner_name: null, buy_url: null, price: null, currency: "THB", unit: "หลา",
  moq: null, lead_days: null, price_updated_at: null, is_main: main, note: null,
});

function SuppliersSection({ data, canEdit, onSaved, onEditing }: { data: SwatchDetail; canEdit: boolean; onSaved: () => void; onEditing: (on: boolean) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<SupDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [partners] = usePartnerSuppliers(rows !== null);
  const canCost = data.can_cost;
  const edit = (v: SupDraft[] | null) => { setRows(v); onEditing(v !== null); };
  const patch = (key: string, p: Partial<SupDraft>) => setRows((cur) => cur?.map((r) => (r.key === key ? { ...r, ...p } : p.is_main ? { ...r, is_main: false } : r)) ?? null);
  const save = async () => {
    if (!rows) return;
    const bad = rows.find((r) => !r.partner_id && !(r.partner_name ?? "").trim());
    if (bad) { toast.warning("มีแถวที่ยังไม่ได้เลือกร้าน — เลือกร้าน หรือลบแถวนั้นก่อน"); return; }
    setSaving(true);
    try {
      await patchBoard({ id: data.id, suppliers: rows.map((r) => ({ ...r, partner_name: r.partner_id ? (partners.find((p) => p.id === r.partner_id)?.name ?? r.partner_name) : r.partner_name })) });
      toast.success("บันทึกร้านแล้ว"); edit(null); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const list = data.suppliers;
  return (
    <Section icon="🏪" title="ร้านที่สั่งได้" extra={list.length ? `${list.length} ร้าน` : undefined}
      action={canEdit && rows === null ? <EditBtn onClick={() => edit(list.length ? list.map(toDraft) : [blankSup(true)])} /> : null}>
      {rows !== null ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className={`rounded-lg border p-2 space-y-1.5 ${r.is_main ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  {r.typed ? (
                    <input value={r.partner_name ?? ""} onChange={(e) => patch(r.key, { partner_name: e.target.value })} placeholder="พิมพ์ชื่อร้าน" className={`${inputCls} w-full`} />
                  ) : (
                    <SupplierPicker value={r.partner_id ?? ""} suppliers={partners} placeholder="— เลือกร้านจากทะเบียนคู่ค้า —"
                      onChange={(id, name) => patch(r.key, { partner_id: id || null, partner_name: name || null, ...(partners.find((p) => p.id === id)?.cn && r.price == null ? { currency: "CNY" as const } : {}) })} />
                  )}
                </div>
                <button type="button" onClick={() => patch(r.key, r.typed ? { typed: false } : { typed: true, partner_id: null })}
                  className="shrink-0 h-8 px-1.5 text-[10.5px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" title={r.typed ? "เลือกจากทะเบียนคู่ค้า" : "ร้านยังไม่อยู่ในทะเบียน — พิมพ์ชื่อเอง"}>
                  {r.typed ? "เลือกจากทะเบียน" : "พิมพ์เอง"}
                </button>
              </div>
              {canCost && (
                <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] gap-1.5">
                  <MoneyInput value={r.price} placeholder="ราคา" className={inputCls}
                    onChange={(v) => patch(r.key, { price: v === "" ? null : Number(v), price_updated_at: today() })} />
                  <select value={r.currency} onChange={(e) => patch(r.key, { currency: e.target.value as SupDraft["currency"] })} className={inputCls} aria-label="สกุลเงิน">
                    <option value="THB">฿ บาท</option><option value="CNY">¥ หยวน</option><option value="USD">$ ดอลลาร์</option>
                  </select>
                  <input value={r.unit ?? ""} onChange={(e) => patch(r.key, { unit: e.target.value || null })} placeholder="ต่อ (หน่วย)" list="swatch-units" className={inputCls} />
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                <label className="text-[10.5px] text-slate-500">ขั้นต่ำ
                  <input type="number" min={0} value={r.moq ?? ""} onChange={(e) => patch(r.key, { moq: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} w-full`} />
                </label>
                <label className="text-[10.5px] text-slate-500">ส่งกี่วัน
                  <input type="number" min={0} value={r.lead_days ?? ""} onChange={(e) => patch(r.key, { lead_days: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} w-full`} />
                </label>
                <label className="text-[10.5px] text-slate-500">ราคา ณ วันที่
                  <input type="date" value={r.price_updated_at ?? ""} onChange={(e) => patch(r.key, { price_updated_at: e.target.value || null })} className={`${inputCls} w-full`} />
                </label>
              </div>
              <input value={r.buy_url ?? ""} onChange={(e) => patch(r.key, { buy_url: e.target.value || null })} placeholder="ลิงก์สั่ง (1688 / Taobao / LINE / เว็บร้าน)" className={`${inputCls} w-full`} />
              <input value={r.note ?? ""} onChange={(e) => patch(r.key, { note: e.target.value || null })} placeholder="หมายเหตุ เช่น ต้องสั่งล่วงหน้า / มีสีพิเศษ" className={`${inputCls} w-full`} />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11.5px] text-slate-600 cursor-pointer">
                  <input type="radio" checked={r.is_main} onChange={() => patch(r.key, { is_main: true })} className="accent-indigo-600" /> ร้านหลัก
                </label>
                <button type="button" onClick={() => setRows((cur) => { const n = (cur ?? []).filter((x) => x.key !== r.key); if (r.is_main && n[0]) n[0] = { ...n[0], is_main: true }; return n; })}
                  className="ml-auto h-6 px-2 text-[11px] rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">ลบร้านนี้</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setRows((cur) => [...(cur ?? []), blankSup(!(cur ?? []).length)])}
            className="w-full h-8 text-[12px] rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600">+ เพิ่มร้าน (สำรอง)</button>
          <datalist id="swatch-units">{UNIT_CHOICES.map((u) => <option key={u} value={u} />)}</datalist>
          {!canCost && <p className="text-[11px] text-slate-400">คุณไม่มีสิทธิ์ดูราคาต้นทุน — แก้ได้เฉพาะร้าน/เงื่อนไข ราคาเดิมยังอยู่</p>}
          <SaveBar saving={saving} onSave={() => void save()} onCancel={() => edit(null)} />
        </div>
      ) : list.length === 0 ? (
        <p className="text-[12px] text-slate-400">ยังไม่ได้ใส่ร้าน{canEdit ? " — กด แก้ เพื่อเพิ่มร้านที่สั่งได้ (ร้านหลัก + สำรอง)" : ""}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.id} className={`rounded-lg border px-2.5 py-2 ${s.is_main ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200"}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-slate-800 truncate">{s.name}</span>
                {s.is_main && <span className="shrink-0 text-[10px] px-1.5 rounded bg-indigo-600 text-white">ร้านหลัก</span>}
                {s.buy_url && /^https?:\/\//i.test(s.buy_url) && (
                  <a href={s.buy_url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[11px] text-indigo-600 hover:underline">เปิดลิงก์สั่ง ↗</a>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                {canCost ? (s.price != null ? <span className="font-medium text-slate-800 tabular-nums">{fmtPrice(s.price, s.currency, s.unit)}</span> : <span className="text-slate-400">ยังไม่ใส่ราคา</span>)
                  : <span className="text-slate-400 inline-flex items-center gap-1"><Icon value="🔒" size={11} /> ราคา: ไม่มีสิทธิ์ดู</span>}
                {s.moq != null && <span>ขั้นต่ำ {fmtNum(s.moq)}{s.unit ? ` ${s.unit}` : ""}</span>}
                {s.lead_days != null && <span>ส่ง {s.lead_days} วัน</span>}
                {canCost && s.price_updated_at && <span className="text-slate-400">ราคา ณ {fmtDate(s.price_updated_at)}</span>}
              </div>
              {s.buy_url && !/^https?:\/\//i.test(s.buy_url) && <div className="text-[11.5px] text-slate-500 break-all">{s.buy_url}</div>}
              {s.note && <div className="mt-0.5 text-[11.5px] text-slate-500 whitespace-pre-wrap">{s.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ───────────────────────────── สเปกวัสดุ ─────────────────────────────
type SpecDraft = { material: string; weight: string; weight_unit: "oz" | "gsm"; width_cm: string; thickness_mm: string; supplier_model: string };
function SpecsSection({ data, canEdit, onSaved, onEditing }: { data: SwatchDetail; canEdit: boolean; onSaved: () => void; onEditing: (on: boolean) => void }) {
  const toast = useToast();
  const [d, setD] = useState<SpecDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const edit = (v: SpecDraft | null) => { setD(v); onEditing(v !== null); };
  const start = () => edit({
    material: data.material ?? "", weight: data.weight == null ? "" : String(data.weight), weight_unit: data.weight_unit ?? "oz",
    width_cm: data.width_cm == null ? "" : String(data.width_cm), thickness_mm: data.thickness_mm == null ? "" : String(data.thickness_mm), supplier_model: data.supplier_model ?? "",
  });
  const save = async () => {
    if (!d) return;
    setSaving(true);
    try {
      await patchBoard({ id: data.id, material: d.material, weight: d.weight, weight_unit: d.weight ? d.weight_unit : null, width_cm: d.width_cm, thickness_mm: d.thickness_mm, supplier_model: d.supplier_model });
      toast.success("บันทึกสเปกแล้ว"); edit(null); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const rows: [string, string][] = [
    ["ชนิด / ส่วนผสม", data.material ?? ""],
    ["น้ำหนัก", data.weight != null ? `${fmtNum(data.weight)} ${data.weight_unit ?? ""}`.trim() : ""],
    ["หน้ากว้าง", data.width_cm != null ? `${fmtNum(data.width_cm)} ซม.` : ""],
    ["ความหนา", data.thickness_mm != null ? `${fmtNum(data.thickness_mm)} มม.` : ""],
    ["รหัสรุ่นของร้าน", data.supplier_model ?? ""],
  ];
  const filled = rows.filter(([, v]) => v);
  return (
    <Section icon="📐" title="สเปกวัสดุ" action={canEdit && !d ? <EditBtn onClick={start} /> : null}>
      {d ? (
        <div className="space-y-1.5">
          <input value={d.material} onChange={(e) => setD({ ...d, material: e.target.value })} placeholder="ชนิด / ส่วนผสม เช่น RPET Canvas" list="swatch-materials" className={`${inputCls} w-full`} />
          <datalist id="swatch-materials">{MATERIAL_CHOICES.map((m) => <option key={m} value={m} />)}</datalist>
          <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-1.5">
            <input type="number" min={0} step="any" value={d.weight} onChange={(e) => setD({ ...d, weight: e.target.value })} placeholder="น้ำหนัก" className={inputCls} />
            <select value={d.weight_unit} onChange={(e) => setD({ ...d, weight_unit: e.target.value as "oz" | "gsm" })} className={inputCls} aria-label="หน่วยน้ำหนัก">
              <option value="oz">oz</option><option value="gsm">gsm</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10.5px] text-slate-500">หน้ากว้าง (ซม.)
              <input type="number" min={0} step="any" value={d.width_cm} onChange={(e) => setD({ ...d, width_cm: e.target.value })} className={`${inputCls} w-full`} />
            </label>
            <label className="text-[10.5px] text-slate-500">ความหนา (มม.)
              <input type="number" min={0} step="any" value={d.thickness_mm} onChange={(e) => setD({ ...d, thickness_mm: e.target.value })} className={`${inputCls} w-full`} />
            </label>
          </div>
          <input value={d.supplier_model} onChange={(e) => setD({ ...d, supplier_model: e.target.value })} placeholder="รหัสรุ่นของร้าน เช่น XY018" className={`${inputCls} w-full`} />
          <SaveBar saving={saving} onSave={() => void save()} onCancel={() => edit(null)} />
        </div>
      ) : filled.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่ได้ใส่สเปก{canEdit ? " — กด แก้ เพื่อใส่ชนิดผ้า น้ำหนัก หน้ากว้าง" : ""}</p> : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
          {filled.map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 break-words">{v}</dd></div>)}
        </dl>
      )}
    </Section>
  );
}

// ───────────────────────────── ชิ้นที่ผูก SKU: สต็อก + ซื้อล่าสุด ─────────────────────────────
function LinkedSection({ data, onOpenSku }: { data: SwatchDetail; onOpenSku: (skuId: string) => void }) {
  const linked = data.spots.filter((s) => s.sku);
  return (
    <Section icon="🔗" title="ชิ้นที่ผูก SKU" extra={`${linked.length}/${data.spots.length} ชิ้น`}>
      {linked.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่มีชิ้นที่ผูก SKU — กดที่ชิ้นบนรูป แล้วเลือก ผูก SKU / สร้าง SKU</p> : (
        <ul className="divide-y divide-slate-100 -my-1">
          {linked.map((s) => {
            const lp = s.sku!.last_po;
            return (
              <li key={s.id} className="py-1.5 flex items-center gap-2">
                <span className="w-6 h-6 rounded shrink-0 ring-1 ring-black/10" style={{ background: s.color_hex ?? "#e2e8f0" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-slate-800 truncate">
                    <span className="font-mono text-slate-400 mr-1">{chipNo(s.code)}</span>
                    <button type="button" onClick={() => onOpenSku(s.sku!.id)} className="text-indigo-600 hover:underline">{s.sku!.code}</button>
                    <span className="text-slate-500"> · {s.sku!.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    สต็อก <b className="tabular-nums text-slate-700">{s.sku!.qty_on_hand != null ? fmtNum(s.sku!.qty_on_hand) : "—"}</b>{s.sku!.uom ? ` ${s.sku!.uom}` : ""}
                    {" · "}{lp ? <>ซื้อล่าสุด {fmtDate(lp.date)}{lp.price != null ? ` ${fmtPrice(lp.price, lp.currency, lp.uom)}` : ""}{lp.seller ? ` · ${lp.seller}` : ""}</> : "ยังไม่เคยซื้อ"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ───────────────────────────── ใช้ในสินค้าไหน (BOM) ─────────────────────────────
function BomSection({ data, bom, onOpenBom, onOpenSku }: { data: SwatchDetail; bom: BomWhereUsedRow[] | null; onOpenBom: () => void; onOpenSku: (skuId: string) => void }) {
  const linkedCodes = useMemo(() => new Set(data.spots.map((s) => s.sku?.code).filter((x): x is string => !!x)), [data]);
  const chipOf = useMemo(() => {
    const m = new Map<string, SwatchSpot[]>();
    for (const s of data.spots) if (s.sku) m.set(s.sku.code, [...(m.get(s.sku.code) ?? []), s]);
    return m;
  }, [data]);
  const products = useMemo(() => {
    const m = new Map<string, { sku: string; name: string | null; id: string | null; image: string | null; chips: Set<string>; active: boolean }>();
    for (const r of bom ?? []) {
      if (!r.product_sku) continue;
      const cur = m.get(r.product_sku) ?? { sku: r.product_sku, name: r.product_name, id: r.product_sku_id, image: r.product_image, chips: new Set<string>(), active: false };
      for (const s of chipOf.get(r.component_sku ?? "") ?? []) cur.chips.add(chipNo(s.code));
      cur.active = cur.active || r.bom_active;
      m.set(r.product_sku, cur);
    }
    return [...m.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.chips.size - a.chips.size || a.sku.localeCompare(b.sku));
  }, [bom, chipOf]);
  return (
    <Section icon="🧩" title="ใช้ในสินค้าไหน (BOM)" extra={bom && products.length ? `${products.length} สินค้า` : undefined}
      action={products.length ? <button type="button" onClick={onOpenBom} className="h-6 px-2 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ดูตารางเต็ม</button> : null}>
      {linkedCodes.size === 0 ? <p className="text-[12px] text-slate-400">ผูก SKU ให้ชิ้นก่อน แล้วจะเห็นว่าสินค้าไหนใช้วัตถุดิบนี้</p>
        : bom === null ? <p className="text-[12px] text-slate-400">กำลังตรวจสูตรผลิต…</p>
        : products.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่มีสูตรผลิตไหนใช้ชิ้นบนแผ่นนี้ ({linkedCodes.size} SKU ที่ผูกไว้)</p> : (
          <ul className="space-y-1.5">
            {products.slice(0, 8).map((p) => (
              <li key={p.sku} className="flex items-center gap-2">
                <HoverPreview url={p.image ? r2ImageUrl(p.image, 640) : null} previewW={360}>
                  <span className="w-8 h-8 shrink-0 rounded border border-slate-100 bg-white flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image ? <img src={r2ImageUrl(p.image, 80) ?? ""} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <Icon value="📦" size={14} className="text-slate-300" />}
                  </span>
                </HoverPreview>
                <div className="min-w-0 flex-1">
                  {p.id ? <button type="button" onClick={() => onOpenSku(p.id!)} className="block max-w-full text-left text-[12px] font-medium text-indigo-600 hover:underline truncate">{p.sku}</button>
                    : <span className="block text-[12px] font-medium text-slate-700 truncate">{p.sku}</span>}
                  <span className="block text-[11px] text-slate-400 truncate">{p.name ?? "—"}{!p.active ? " · สูตรปิดใช้" : ""}</span>
                </div>
                <span className="shrink-0 font-mono text-[10.5px] text-slate-500 max-w-[6rem] truncate" title={`ชิ้นที่ใช้: ${[...p.chips].join(" ")}`}>{[...p.chips].join(" ")}</span>
              </li>
            ))}
            {products.length > 8 && <li><button type="button" onClick={onOpenBom} className="text-[11.5px] text-indigo-600 hover:underline">ดูอีก {products.length - 8} สินค้า</button></li>}
          </ul>
        )}
    </Section>
  );
}

// ───────────────────────────── แผงรวม ─────────────────────────────
export function SwatchInfoPanel({ data, canEdit, bom, onSaved, onOpenBom, onOpenSku, onHistory, onEditing }: {
  data: SwatchDetail; canEdit: boolean;
  /** บรรทัด BOM ของ SKU ที่ผูกบนแผ่น (null = กำลังโหลด) */
  bom: BomWhereUsedRow[] | null;
  onSaved: () => void; onOpenBom: () => void; onOpenSku: (skuId: string) => void; onHistory: () => void;
  /** มีหัวข้อไหนกำลังแก้อยู่ (ไว้เตือนก่อนปิดหน้า) */
  onEditing?: (on: boolean) => void;
}) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const mark = useCallback((k: string) => (on: boolean) => setEditing((cur) => {
    if (cur.has(k) === on) return cur;
    const n = new Set(cur); if (on) n.add(k); else n.delete(k);
    return n;
  }), []);
  const anyEditing = editing.size > 0;
  useEffect(() => { onEditing?.(anyEditing); }, [anyEditing, onEditing]);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500 truncate">แก้ล่าสุด {new Date(data.updated_at).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
        <button type="button" onClick={onHistory} className="ml-auto h-7 px-2.5 text-[11.5px] rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
          <Icon value="📜" size={12} /> ประวัติการแก้ไข
        </button>
      </div>
      <NoteSection data={data} canEdit={canEdit} onSaved={onSaved} onEditing={mark("note")} />
      <SuppliersSection data={data} canEdit={canEdit} onSaved={onSaved} onEditing={mark("sup")} />
      <SpecsSection data={data} canEdit={canEdit} onSaved={onSaved} onEditing={mark("spec")} />
      <LinkedSection data={data} onOpenSku={onOpenSku} />
      <BomSection data={data} bom={bom} onOpenBom={onOpenBom} onOpenSku={onOpenSku} />
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <RecordFilesField entityType="sku_swatches" entityId={data.id} readonly={!canEdit} title="ไฟล์แนบ" description="ใบเสนอราคา · สเปก PDF · รูปเพิ่มเติม" />
      </section>
    </div>
  );
}
