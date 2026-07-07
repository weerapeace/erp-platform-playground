"use client";

/**
 * BomFromCostWizard — "ดึงตีราคา → สร้างสูตร BOM" (ของกลางเฉพาะใบงานออกแบบ)
 *
 * ทำไม: แท็บตีราคามีบรรทัดวัสดุ (กว้าง/ยาว/จำนวน/ชนิด) โครงเดียวกับ BOM อยู่แล้ว
 *   → กดปุ่มเดียวดึงค่ามาสร้างสูตรการผลิต ไม่ต้องพิมพ์ซ้ำ. "วัตถุดิบตัวจริง" (ผูก SKU/รหัสวัสดุ)
 *   เว้นว่างไว้เติมทีหลังในหน้าสูตร — bom_lines.component_sku รับ null ได้
 *
 * ใช้ของกลาง: ERPModal · SkuPicker(/api/pickers/skus) · useToast · POST /api/bom
 * ดึงเฉพาะ "แท็บที่กำลังดู" (curLines) ตามที่เจ้าของเลือก
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

// บรรทัดตีราคาที่ Wizard ต้องใช้ (subset ของ CostLine — ดึงค่าเรขาคณิต/จำนวน/ชนิด)
export type CostSourceLine = {
  item_name: string | null;
  group_name: string | null;
  width_cm: number | null;
  length_cm: number | null;
  pieces: number | null;
  face_width_cm: number | null;
  waste_percent: number | null;
  qty: number | null;
  uom: string | null;
};

const verCode = (sku: string, n: number) => (n <= 1 ? `BOM-${sku}` : `BOM-${sku}_v.${n}`);
const verNum = (v: string | null) => { const m = (v ?? "").match(/(\d+)/); return m ? parseInt(m[1], 10) : 1; };
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));

export function BomFromCostWizard({
  open, onClose, lines, tabLabel,
}: {
  open: boolean;
  onClose: () => void;
  lines: CostSourceLine[];     // บรรทัดของแท็บที่กำลังดู
  tabLabel: string;            // ชื่อแท็บ (เช่น "ทั่วไป" หรือ "CTL110")
}) {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [include, setInclude] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdSku, setCreatedSku] = useState<string | null>(null);

  // รีเซ็ตทุกครั้งที่เปิด
  useEffect(() => {
    if (open) { setStep(1); setSku(null); setInclude(lines.map(() => true)); setSaving(false); setCreatedSku(null); }
  }, [open, lines]);

  const chosen = useMemo(() => lines.filter((_, i) => include[i] ?? true), [lines, include]);

  const create = async () => {
    if (!sku) { toast.error("เลือกสินค้าที่ผลิตก่อน"); setStep(1); return; }
    setSaving(true);
    try {
      // เวอร์ชันถัดไปของ SKU นี้ (กันรหัสสูตรซ้ำ)
      let n = 1;
      try {
        const vj = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(sku.code)}`).then((r) => r.json());
        const vs = (vj.data ?? []) as { version: string | null }[];
        if (vs.length) n = Math.max(...vs.map((v) => verNum(v.version))) + 1;
      } catch { /* โหลดเวอร์ชันไม่ได้ → เริ่ม v1 */ }

      const bomLines = chosen.map((r, i) => ({
        slot_code: null,
        component_sku: null,                       // วัตถุดิบตัวจริงเติมทีหลัง
        component_name: r.item_name ?? null,       // ชื่อวัสดุจากตีราคา = ตัวช่วยจำ
        qty: r.qty ?? r.pieces ?? 1,
        uom: r.uom ?? null,
        waste_percent: r.waste_percent ?? 0,
        is_optional: false,
        sequence: i + 1,
        source: "design_cost",
        calc_mode: "manual",
        pieces: r.pieces ?? 1,
        cut_width: r.width_cm ?? 0,
        cut_length: r.length_cm ?? 0,
        face_width_cm: r.face_width_cm ?? 0,
        material_type: r.group_name ?? null,
      }));

      // ยิงสร้าง — เจอรหัสซ้ำ (แข่งกัน) ลองเพิ่มเวอร์ชันอีกครั้ง
      const post = (ver: number) => apiFetch("/api/bom", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_sku: sku.code, product_name: sku.name,
          bom_code: verCode(sku.code, ver), version: `v${ver}`,
          bom_type: "normal", status: "draft",
          note: `ดึงจากตีราคา (${tabLabel})`, lines: bomLines,
        }),
      }).then((r) => r.json());

      let j = await post(n);
      if (j.error && /มีอยู่แล้ว/.test(String(j.error))) { n += 1; j = await post(n); }
      if (j.error) throw new Error(j.error);

      setCreatedSku(sku.code);
      setStep(3);
      toast.success(`สร้างสูตร BOM ให้ ${sku.code} แล้ว (${bomLines.length} บรรทัด)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างสูตรไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="🧬 สร้างสูตร BOM จากตีราคา">
      {/* ==== สำเร็จ ==== */}
      {step === 3 && createdSku ? (
        <div className="p-2 flex flex-col items-center text-center gap-3 py-6">
          <div className="text-5xl">✅</div>
          <div className="text-slate-700 font-medium">สร้างสูตรการผลิต (BOM) ให้ <b>{createdSku}</b> แล้ว</div>
          <div className="text-sm text-slate-400 max-w-sm">ดึงขนาด/จำนวน/ชนิดมาให้แล้ว — เปิดสูตรไป <b>เลือกวัตถุดิบตัวจริง</b> ต่อได้เลย</div>
          <div className="flex items-center gap-2 mt-1">
            <a href={`/master/bom?open=${encodeURIComponent(createdSku)}`} target="_blank" rel="noopener"
              className="h-9 px-4 inline-flex items-center text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เปิดสูตรไปเติมวัตถุดิบ ↗</a>
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
          </div>
        </div>
      ) : (
        <div className="p-1 space-y-3">
          {/* ==== สเต็ป 1: เลือกสินค้าที่ผลิต ==== */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">1) สินค้าที่ผลิต (SKU)</div>
            <SkuPicker value={sku} onChange={(v) => { setSku(v); if (v) setStep(2); }} placeholder="เลือก SKU ลูกที่จะผลิต เช่น CTL110-01…" />
            <p className="text-[11px] text-slate-400 mt-1">พิมพ์รหัส/ชื่อค้นหา — สร้างสูตรได้ทีละ SKU</p>
          </div>

          {/* ==== สเต็ป 2: บรรทัดที่ดึงมา ==== */}
          {step >= 2 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-slate-700">2) บรรทัดวัสดุที่จะดึง <span className="text-slate-400 font-normal">(จากแท็บ “{tabLabel}”)</span></div>
                <span className="text-[11px] text-slate-400">{chosen.length}/{lines.length} บรรทัด</span>
              </div>

              <div className="px-3 py-2 mb-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                ดึงมาแค่ <b>ขนาด (กว้าง/ยาว)</b>, <b>จำนวน</b>, <b>ชนิด</b> — ส่วน <b>วัตถุดิบตัวจริง</b> ค่อยไปเลือกในหน้าสูตรทีหลัง
              </div>

              {lines.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  แท็บนี้ยังไม่มีบรรทัดตีราคาให้ดึง
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                        <th className="w-8 px-2 py-1.5"></th>
                        <th className="px-2 py-1.5 text-left font-medium">ชนิด / วัสดุ</th>
                        <th className="px-2 py-1.5 text-right font-medium">กว้าง</th>
                        <th className="px-2 py-1.5 text-right font-medium">ยาว</th>
                        <th className="px-2 py-1.5 text-right font-medium">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((r, i) => {
                        const on = include[i] ?? true;
                        return (
                          <tr key={i} className={on ? "" : "opacity-40"}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={on}
                                onChange={(e) => setInclude((a) => a.map((x, xi) => (xi === i ? e.target.checked : x)))} />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="text-slate-700 truncate">{r.item_name || "—"}</div>
                              <div className="text-[11px] text-slate-400 truncate">{r.group_name || "ไม่ระบุชนิด"}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.width_cm)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.length_cm)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.qty)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ==== ปุ่ม ==== */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 mt-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void create()} disabled={saving || !sku || chosen.length === 0}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังสร้าง…" : `สร้างสูตร (${chosen.length} บรรทัด)`}
            </button>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
