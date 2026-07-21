"use client";

/**
 * BomToCostWizard — "ดึงโครงจาก BOM → มาตีราคา" (ของกลางเฉพาะใบงานออกแบบ)
 *
 * ทำไม: BOM กับตีราคาใช้โครงเดียวกัน (ชนิด/กว้าง/ยาว/จำนวน) — คู่กลับของ BomFromCostWizard
 *   ดึง "โครง" มาตีราคาไม่ต้องพิมพ์ซ้ำ. "วัตถุดิบตัวจริง" (item) + ราคา เว้นว่างไว้เลือกเองตอนตีราคา
 *   ตามที่เจ้าของสั่ง: ดึงมาแต่ ประเภท/กว้าง/ยาว/จำนวน (+ เผื่อเสีย/หน้ากว้าง ช่วยคำนวณ) — ไม่ดึงวัสดุ
 *
 * ใช้ของกลาง: ERPModal · SkuPicker(/api/pickers/skus) · useToast
 * แหล่งข้อมูล: /api/bom/versions?product_sku= → /api/bom/[id] (lines)
 * ผล: onApply(lines) — ให้หน้าหลักแปลงเป็นบรรทัดตีราคาแล้ว "ต่อท้าย" แท็บที่กำลังดู
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { BomVersion } from "@/app/api/bom/versions/route";
import type { SheetSku } from "@/app/api/design-sheets/[id]/skus/route";

// บรรทัดโครงที่ดึงจาก BOM → ส่งให้หน้าหลักแปลงเป็นบรรทัดตีราคา
export type BomPulledLine = {
  material_type: string | null;   // ชนิด → group_name
  width_cm: number | null;        // cut_width → กว้าง
  length_cm: number | null;       // cut_length → ยาว
  pieces: number | null;          // จำนวนชิ้น
  face_width_cm: number | null;   // หน้ากว้าง (ช่วยคำนวณพื้นที่)
  waste_percent: number | null;   // เผื่อเสีย %
  uom: string | null;
  ref_name: string | null;        // ชื่อวัสดุเดิมใน BOM (ตัวช่วยจำ → ใส่ note ไม่ผูก item)
};

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function BomToCostWizard({
  open, onClose, sheetId, tabLabel, onApply,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  tabLabel: string;                              // ชื่อแท็บที่จะดึงเข้า (เช่น "ทั่วไป" / "CTL110")
  onApply: (lines: BomPulledLine[], sourceLabel: string) => void;
}) {
  const toast = useToast();
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [sheetSkus, setSheetSkus] = useState<SheetSku[]>([]);    // SKU ของใบนี้ (ปุ่มลัด)
  const [versions, setVersions] = useState<BomVersion[]>([]);
  const [verId, setVerId] = useState<string>("");
  const [lines, setLines] = useState<BomPulledLine[]>([]);
  const [include, setInclude] = useState<boolean[]>([]);
  const [loadingVers, setLoadingVers] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  // รีเซ็ตทุกครั้งที่เปิด + โหลด SKU ของใบนี้ (ปุ่มลัด)
  useEffect(() => {
    if (!open) return;
    setSku(null); setVersions([]); setVerId(""); setLines([]); setInclude([]);
    apiFetch(`/api/design-sheets/${sheetId}/skus`).then((r) => r.json())
      .then((j) => setSheetSkus(j.error ? [] : ((j.data ?? []) as SheetSku[])))
      .catch(() => setSheetSkus([]));
  }, [open, sheetId]);

  // เลือก SKU → โหลดเวอร์ชันสูตร
  useEffect(() => {
    if (!sku) { setVersions([]); setVerId(""); setLines([]); return; }
    setLoadingVers(true);
    apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(sku.code)}`).then((r) => r.json())
      .then((j) => {
        const vs = (j.error ? [] : ((j.data ?? []) as BomVersion[]));
        setVersions(vs);
        const pick = vs.find((v) => v.is_default) ?? vs[vs.length - 1] ?? null;   // default หรือเวอร์ชันล่าสุด
        setVerId(pick?.id ?? "");
      })
      .catch(() => setVersions([]))
      .finally(() => setLoadingVers(false));
  }, [sku]);

  // เลือกเวอร์ชัน → โหลดบรรทัด BOM
  useEffect(() => {
    if (!verId) { setLines([]); setInclude([]); return; }
    setLoadingLines(true);
    apiFetch(`/api/bom/${verId}`).then((r) => r.json())
      .then((j) => {
        const raw = (j.error ? [] : ((j.data?.lines ?? []) as Array<Record<string, unknown>>));
        const pulled: BomPulledLine[] = raw.map((l) => ({
          material_type: (l.material_type as string) ?? null,
          width_cm:      numOrNull(l.cut_width),
          length_cm:     numOrNull(l.cut_length),
          pieces:        numOrNull(l.pieces),
          face_width_cm: numOrNull(l.face_width_cm),
          waste_percent: numOrNull(l.waste_percent),
          uom:           (l.uom as string) ?? null,
          ref_name:      (l.component_name as string) ?? (l.component_sku as string) ?? null,
        }));
        setLines(pulled);
        setInclude(pulled.map(() => true));
      })
      .catch(() => { setLines([]); setInclude([]); })
      .finally(() => setLoadingLines(false));
  }, [verId]);

  const chosen = useMemo(() => lines.filter((_, i) => include[i] ?? true), [lines, include]);
  const curVer = versions.find((v) => v.id === verId) ?? null;

  const apply = () => {
    if (chosen.length === 0) { toast.error("ยังไม่มีบรรทัดให้ดึง"); return; }
    const srcLabel = sku ? `${sku.code}${curVer?.version ? ` (${curVer.version})` : ""}` : "BOM";
    onApply(chosen, srcLabel);
    onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="🧬⬇ ดึงโครงจาก BOM มาตีราคา">
      <div className="p-1 space-y-3">
        {/* ==== 1) เลือกสินค้า (SKU) ==== */}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-1">1) เลือกสินค้าที่มีสูตร BOM</div>
          {sheetSkus.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[11px] text-slate-400 self-center">SKU ของใบนี้:</span>
              {sheetSkus.map((s) => (
                <button key={s.id} type="button"
                  onClick={() => setSku({ id: s.id, code: s.code, name: s.name_th ?? s.code })}
                  className={`h-7 px-2.5 text-xs rounded-lg border ${sku?.code === s.code ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {s.code}
                </button>
              ))}
            </div>
          )}
          <SkuPicker value={sku} onChange={setSku} placeholder="พิมพ์รหัส/ชื่อ SKU ที่มีสูตร BOM…" />
        </div>

        {/* ==== 2) เลือกเวอร์ชันสูตร ==== */}
        {sku && (
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">2) เวอร์ชันสูตร</div>
            {loadingVers ? (
              <div className="text-xs text-slate-400 py-1">กำลังโหลดเวอร์ชัน…</div>
            ) : versions.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                สินค้านี้ยังไม่มีสูตร BOM — สร้างสูตรก่อนที่ <a href={`/master/bom?open=${encodeURIComponent(sku.code)}`} target="_blank" rel="noopener" className="underline">หน้าสูตรการผลิต ↗</a>
              </div>
            ) : (
              <select value={verId} onChange={(e) => setVerId(e.target.value)}
                className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm text-slate-700 outline-none focus:border-indigo-400">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version ?? v.bom_code}{v.is_default ? " · ค่าเริ่มต้น" : ""}{v.status ? ` · ${v.status}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ==== 3) บรรทัดที่จะดึง ==== */}
        {verId && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium text-slate-700">3) บรรทัดที่จะดึงเข้าตีราคา</div>
              <span className="text-[11px] text-slate-400">{chosen.length}/{lines.length} บรรทัด</span>
            </div>

            <div className="px-3 py-2 mb-2 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              ดึงมาแค่ <b>ชนิด · กว้าง · ยาว · จำนวน</b> (+ เผื่อเสีย/หน้ากว้าง ช่วยคำนวณ) — <b>วัตถุดิบตัวจริง + ราคา</b> เว้นว่างไว้เลือกเองตอนตีราคา · บรรทัดใหม่จะ <b>ต่อท้าย</b> ของเดิมในแท็บ “{tabLabel}”
            </div>

            {loadingLines ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">กำลังโหลดบรรทัด…</div>
            ) : lines.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">สูตรนี้ยังไม่มีบรรทัดให้ดึง</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                      <th className="w-8 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left font-medium">ชนิด</th>
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
                            <div className="text-slate-700 truncate">{r.material_type || "ไม่ระบุชนิด"}</div>
                            {r.ref_name && <div className="text-[11px] text-slate-400 truncate">อ้างอิง: {r.ref_name}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.width_cm)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.length_cm)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(r.pieces)}</td>
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
          <button onClick={apply} disabled={chosen.length === 0}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            ดึงเข้าตีราคา ({chosen.length} บรรทัด)
          </button>
        </div>
      </div>
    </ERPModal>
  );
}
