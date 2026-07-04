"use client";

// ============================================================
// VariantMatrixModal (ของกลาง) — สร้าง SKU แบบเมทริกซ์ 2 ชั้น ใต้ Parent เดียว
// ชั้น 1 = สี/วัสดุ (→ คอลัมน์ color, ใช้จัดกลุ่ม) · ชั้น 2 = ตัวเลือกอิสระ เช่น แบบพิมพ์/ไซส์
//   (→ attribute_values.variant_option) · ปิดชั้น 2 ได้ = สร้างมิติเดียว
// รหัส = {ฐาน}{คั่น}{เลขสี}{ท้ายชั้น2}  เช่น WK42-01D · barcode = รหัส · ราคาเริ่มต้นใส่ทีเดียวทุกตัว (ปรับ inline ทีหลังได้)
// ของกลาง: ใช้ที่ไหนก็ได้ที่มี parentSkuId — ปุ่มในตัวจัดการแพลตฟอร์ม / drawer สินค้า ฯลฯ
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

type Dim1 = { value: string; part: string };
type Dim2 = { value: string; suffix: string };
type Combo = { code: string; color: string; part: string; dim2Value: string; dim2Suffix: string; colorIndex: number; exists: boolean; dup: boolean };

const pad2 = (n: number) => String(n).padStart(2, "0");

export function VariantMatrixModal({ parentSkuId, onClose, onCreated }: {
  parentSkuId: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState("");
  const [sep, setSep] = useState("-");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [useDim2, setUseDim2] = useState(true);
  const [dim2Name, setDim2Name] = useState("แบบพิมพ์");
  const [dim1, setDim1] = useState<Dim1[]>([{ value: "", part: "01" }]);
  const [dim2, setDim2] = useState<Dim2[]>([{ value: "", suffix: "" }, { value: "", suffix: "" }, { value: "", suffix: "" }]);
  const [existing, setExisting] = useState<Set<string>>(new Set());

  // โหลดข้อมูลเดิม: ฐานรหัส (จาก parent), สีที่มีอยู่, รหัสที่มีแล้ว
  useEffect(() => {
    let live = true;
    setLoading(true);
    apiFetch(`/api/skus/variant-matrix?parent_sku_id=${encodeURIComponent(parentSkuId)}`).then((r) => r.json()).then((j) => {
      if (!live) return;
      if (j.error) { toast.error(j.error); return; }
      setBase(String(j.parent_code ?? ""));
      setExisting(new Set(((j.existing_codes ?? []) as string[])));
      const colors = (j.colors ?? []) as { value: string; code_part: string }[];
      if (colors.length) setDim1(colors.map((c, i) => ({ value: c.value, part: c.code_part || pad2(i + 1) })));
    }).catch((e) => { if (live) toast.error((e as Error).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [parentSkuId, toast]);

  // เมทริกซ์ตัวอย่าง (สี × ชั้น2) — คำนวณรหัส + เช็คซ้ำ (มีในระบบ / ซ้ำกันเอง)
  const combos = useMemo<Combo[]>(() => {
    const d1 = dim1.filter((d) => d.value.trim() && d.part.trim());
    const d2 = useDim2 ? dim2.filter((d) => d.value.trim()) : [{ value: "", suffix: "" }];
    const out: Combo[] = [];
    const codeCount = new Map<string, number>();
    for (let i = 0; i < d1.length; i++) {
      const c = d1[i];
      for (const p of d2) {
        const code = `${base}${sep}${c.part}${useDim2 ? p.suffix : ""}`.trim();
        codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
      }
    }
    for (let i = 0; i < d1.length; i++) {
      const c = d1[i];
      const idx = /^\d+$/.test(c.part.trim()) ? Number(c.part.trim()) : i + 1;
      for (const p of d2) {
        const code = `${base}${sep}${c.part}${useDim2 ? p.suffix : ""}`.trim();
        out.push({ code, color: c.value.trim(), part: c.part.trim(), dim2Value: useDim2 ? p.value.trim() : "", dim2Suffix: useDim2 ? p.suffix.trim() : "", colorIndex: idx, exists: existing.has(code), dup: (codeCount.get(code) ?? 0) > 1 });
      }
    }
    return out;
  }, [dim1, dim2, useDim2, base, sep, existing]);

  const toCreate = combos.filter((c) => !c.exists && !c.dup);
  const nExists = combos.filter((c) => c.exists).length;
  const hasDup = combos.some((c) => c.dup);
  const canSave = base.trim() !== "" && toCreate.length > 0 && !hasDup;

  const setD1 = (i: number, patch: Partial<Dim1>) => setDim1((l) => l.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const setD2 = (i: number, patch: Partial<Dim2>) => setDim2((l) => l.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const addD1 = () => setDim1((l) => [...l, { value: "", part: pad2(l.length + 1) }]);
  const addD2 = () => setDim2((l) => [...l, { value: "", suffix: "" }]);

  const submit = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const rows = toCreate.map((c) => ({
        code: c.code, color: c.color, color_index: c.colorIndex,
        dim2_value: c.dim2Value, dim2_code: c.dim2Suffix,
        list_price: defaultPrice.trim() === "" ? undefined : Number(defaultPrice),
      }));
      const r = await apiFetch("/api/skus/variant-matrix", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, dimension2_name: useDim2 ? dim2Name : "", rows }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้าง ${j.created} SKU แล้ว${j.skipped?.length ? ` · ข้าม ${j.skipped.length} (มีอยู่แล้ว)` : ""}`);
      onCreated?.();
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }, [canSave, toCreate, defaultPrice, parentSkuId, useDim2, dim2Name, toast, onCreated, onClose]);

  return (
    <ERPModal open onClose={onClose} size="xl" storageKey="variant-matrix"
      title="🧬 สร้างตัวเลือกหลายชั้น (เมทริกซ์)"
      description="สร้าง SKU ทุกคู่ผสมของ สี × ตัวเลือกที่ 2 (เช่น แบบพิมพ์) พร้อมกันในครั้งเดียว"
      loading={loading}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500">
            {hasDup ? <span className="text-rose-600">⚠ มีรหัสซ้ำกัน — แก้เลขสี/ตัวท้ายให้ไม่ซ้ำ</span>
              : <>จะสร้าง <b className="text-violet-700">{toCreate.length}</b> ตัว{nExists ? ` · ข้าม ${nExists} (มีแล้ว)` : ""}</>}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={submit} disabled={!canSave || saving} className="h-9 px-4 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40">{saving ? "กำลังสร้าง..." : `สร้าง ${toCreate.length} SKU`}</button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {/* ตั้งค่ารหัส + ราคา */}
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <label className="text-[11px] text-slate-500">รหัสฐาน
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="เช่น WK42" className="mt-1 block w-28 h-8 border border-slate-200 rounded-md px-2 text-sm font-mono" />
          </label>
          <label className="text-[11px] text-slate-500">ตัวคั่น
            <input value={sep} onChange={(e) => setSep(e.target.value)} placeholder="-" className="mt-1 block w-14 h-8 border border-slate-200 rounded-md px-2 text-sm text-center font-mono" />
          </label>
          <label className="text-[11px] text-slate-500">ราคาเริ่มต้น (ทุกตัว)
            <input type="number" min={0} value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} placeholder="เช่น 690" className="mt-1 block w-28 h-8 border border-slate-200 rounded-md px-2 text-sm text-right" />
          </label>
          <span className="text-[11px] text-slate-400 ml-auto">รหัสจะเป็น: <b className="font-mono text-slate-600">{base || "?"}{sep}{dim1[0]?.part || "01"}{useDim2 ? (dim2.find((d) => d.suffix)?.suffix ?? "") : ""}</b></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ชั้น 1: สี */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-700">ชั้นที่ 1 — สี / วัสดุ <span className="text-slate-400 font-normal">(ตัวจัดกลุ่ม)</span></p>
              <button onClick={addD1} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">＋ เพิ่มสี</button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              <div className="grid grid-cols-[1fr_3.5rem_1.5rem] gap-1.5 text-[10px] text-slate-400 px-0.5"><span>ชื่อสี</span><span className="text-center">เลข</span><span /></div>
              {dim1.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_3.5rem_1.5rem] gap-1.5 items-center">
                  <input value={d.value} onChange={(e) => setD1(i, { value: e.target.value })} placeholder="เช่น น้ำตาล" className="h-8 border border-slate-200 rounded-md px-2 text-sm" />
                  <input value={d.part} onChange={(e) => setD1(i, { part: e.target.value })} placeholder="01" className="h-8 border border-slate-200 rounded-md px-1 text-sm text-center font-mono" />
                  <button onClick={() => setDim1((l) => l.length <= 1 ? l : l.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* ชั้น 2: ตัวเลือกอิสระ */}
          <div className={`rounded-lg border p-3 ${useDim2 ? "border-slate-200" : "border-slate-100 bg-slate-50/50"}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={useDim2} onChange={(e) => setUseDim2(e.target.checked)} className="w-4 h-4 accent-violet-600" />
                มีตัวเลือกชั้นที่ 2
              </label>
              {useDim2 && <button onClick={addD2} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">＋ เพิ่ม</button>}
            </div>
            {useDim2 ? (
              <>
                <label className="text-[11px] text-slate-500 block mb-2">ชื่อชั้นที่ 2
                  <input value={dim2Name} onChange={(e) => setDim2Name(e.target.value)} placeholder="เช่น แบบพิมพ์" className="mt-1 block w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
                </label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  <div className="grid grid-cols-[1fr_3.5rem_1.5rem] gap-1.5 text-[10px] text-slate-400 px-0.5"><span>ชื่อตัวเลือก</span><span className="text-center">ท้ายรหัส</span><span /></div>
                  {dim2.map((d, i) => (
                    <div key={i} className="grid grid-cols-[1fr_3.5rem_1.5rem] gap-1.5 items-center">
                      <input value={d.value} onChange={(e) => setD2(i, { value: e.target.value })} placeholder={i === 0 ? "พิมพ์จม" : i === 1 ? "ฟอยล์เงิน" : "ฟอยล์ทอง"} className="h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      <input value={d.suffix} onChange={(e) => setD2(i, { suffix: e.target.value })} placeholder={i === 0 ? "D" : i === 1 ? "N" : "G"} className="h-8 border border-slate-200 rounded-md px-1 text-sm text-center font-mono" />
                      <button onClick={() => setDim2((l) => l.length <= 1 ? l : l.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600 text-sm">✕</button>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-xs text-slate-400">สร้างเฉพาะมิติสี (ปิดตัวเลือกชั้นที่ 2)</p>}
          </div>
        </div>

        {/* ตัวอย่างที่จะสร้าง */}
        <div className="rounded-lg border border-slate-200">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-600">ตัวอย่างที่จะสร้าง ({combos.length} คู่ผสม)</div>
          <div className="max-h-60 overflow-y-auto">
            {combos.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">กรอกสีอย่างน้อย 1 รายการ</p> : (
              <table className="w-full text-sm">
                <thead className="text-[10px] text-slate-400 sticky top-0 bg-white">
                  <tr><th className="text-left px-3 py-1 font-medium">รหัส</th><th className="text-left px-3 py-1 font-medium">สี</th>{useDim2 && <th className="text-left px-3 py-1 font-medium">{dim2Name || "ตัวเลือก"}</th>}<th className="text-right px-3 py-1 font-medium">ราคา</th><th className="text-center px-3 py-1 font-medium">สถานะ</th></tr>
                </thead>
                <tbody>
                  {combos.map((c, i) => (
                    <tr key={i} className={`border-t border-slate-50 ${c.dup ? "bg-rose-50" : c.exists ? "bg-amber-50/50" : ""}`}>
                      <td className="px-3 py-1 font-mono text-xs text-slate-700">{c.code}</td>
                      <td className="px-3 py-1 text-slate-600">{c.color}</td>
                      {useDim2 && <td className="px-3 py-1 text-slate-600">{c.dim2Value || "—"}</td>}
                      <td className="px-3 py-1 text-right tabular-nums text-slate-500">{defaultPrice || "—"}</td>
                      <td className="px-3 py-1 text-center text-xs">{c.dup ? <span className="text-rose-600">ซ้ำ</span> : c.exists ? <span className="text-amber-600">มีแล้ว</span> : <span className="text-emerald-600">ใหม่</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-400">สร้างแล้วปรับราคา/ส่วนลด/สต๊อกรายตัวได้ในตาราง SKU · barcode = รหัส SKU อัตโนมัติ · ชั้นที่ 2 เก็บเป็นคุณสมบัติของ SKU</p>
      </div>
    </ERPModal>
  );
}
