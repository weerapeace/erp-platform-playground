"use client";

/**
 * 🧬 สร้าง BOM จากตารางสี (เจ้าของสั่ง 2026-11-24 · ข้อ 1-5) — 1 สีของรุ่น = 1 สูตร
 *  • บรรทัด = ส่วนประกอบ (แถวตารางสี) · วัตถุดิบ = SKU ที่เลือกไว้ในช่องของสีนั้น
 *  • จำนวน/ขนาด ดึงจากตีราคาที่ใช้ SKU เดียวกัน (ไม่เจอ = เว้นว่างไว้เติมในหน้าสูตร)
 *  • ช่องที่ยังไม่เลือกวัตถุดิบ → เตือน + เลือกได้ว่าข้ามหรือใส่บรรทัดว่าง · สร้างทีเดียวหลายสี (เลือกสินค้าที่ผลิตของแต่ละสี)
 *  • สร้างแล้วจำไว้ที่สีนั้น (PATCH /spec colorway bom) → ป้าย "มี BOM" ที่หัวคอลัมน์
 * ใช้ของกลาง: ERPModal · SkuPicker · createBomFromLines (./bom-from-cost-wizard · สร้างสูตรผ่าน /api/bom) · useToast
 * สูตรที่สร้างแก้/ลบได้ในหน้า BOM ตามปกติ (สถานะร่าง)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { cleanSpecColors, type SpecColorBom, type SpecColorTable } from "@/lib/design-sheet-spec-colors";
import { createBomFromLines, type CostSourceLine } from "./bom-from-cost-wizard";

type CostRowLite = { item_sku_code?: string | null; item_name?: string | null; group_name?: string | null; width_cm?: number | null; length_cm?: number | null; pieces?: number | null; face_width_cm?: number | null; waste_percent?: number | null; qty?: number | null; uom?: string | null };

export function BomFromColorsModal({ open, onClose, sheetId, sheetCode, colors: colorsProp, onCreated }: {
  open: boolean; onClose: () => void; sheetId: string; sheetCode?: string | null;
  /** ตารางสีปัจจุบัน (แท็บรายละเอียดงาน) — ไม่ส่ง = โหลดจากที่บันทึกไว้ */
  colors?: SpecColorTable | null;
  /** สร้างสูตรแล้ว → หน้าแม่อัปเดตป้าย "มี BOM" */
  onCreated?: (colorwayKey: string, bom: SpecColorBom) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [colors, setColors] = useState<SpecColorTable | null>(colorsProp ?? null);
  const [cost, setCost] = useState<CostRowLite[]>([]);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [prod, setProd] = useState<Record<string, SkuPickerValue | null>>({});
  const [fillEmpty, setFillEmpty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ cw: string; code: string; sku: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setDone([]); setBusy(false);
    if (colorsProp) setColors(colorsProp);
    else apiFetch(`/api/design-sheets/${sheetId}/spec`).then((r) => r.json()).then((j) => setColors(cleanSpecColors(j?.colors))).catch(() => setColors(null));
    apiFetch(`/api/design-sheets/${sheetId}/cost-lines`).then((r) => r.json()).then((j) => setCost((j?.data ?? []) as CostRowLite[])).catch(() => setCost([]));
  }, [open, sheetId, colorsProp]);

  // เปิดมา: ติ๊กสีที่มีวัตถุดิบอย่างน้อย 1 ช่อง และยังไม่มี BOM
  useEffect(() => {
    if (!open || !colors) return;
    setOn(Object.fromEntries(colors.colorways.map((c) => [c.key, !c.bom && colors.rows.some((r) => !!c.cells[r.key]?.sku_code)])));
  }, [open, colors]);

  const costBySku = useMemo(() => {
    const m = new Map<string, CostRowLite>();
    for (const r of cost) if (r.item_sku_code && !m.has(r.item_sku_code)) m.set(r.item_sku_code, r);
    return m;
  }, [cost]);

  const linesFor = (cwKey: string): { lines: CostSourceLine[]; missing: string[] } => {
    const cw = colors?.colorways.find((c) => c.key === cwKey);
    if (!cw || !colors) return { lines: [], missing: [] };
    const lines: CostSourceLine[] = []; const missing: string[] = [];
    for (const r of colors.rows) {
      const cell = cw.cells[r.key];
      if (!cell?.sku_code) {
        missing.push(r.name || "?");
        if (fillEmpty[cwKey]) lines.push({ item_name: r.name || null, group_name: null, width_cm: null, length_cm: null, pieces: null, face_width_cm: null, waste_percent: null, qty: null, uom: null, component_sku: null });
        continue;
      }
      const c = costBySku.get(cell.sku_code);
      lines.push({
        item_name: [r.name, cell.sku_name || cell.name].filter(Boolean).join(" · ") || cell.sku_code,
        group_name: c?.group_name ?? null, width_cm: c?.width_cm ?? null, length_cm: c?.length_cm ?? null, pieces: c?.pieces ?? null,
        face_width_cm: c?.face_width_cm ?? null, waste_percent: c?.waste_percent ?? null, qty: c?.qty ?? null, uom: c?.uom ?? null,
        component_sku: cell.sku_code,
      });
    }
    return { lines, missing };
  };

  const chosen = (colors?.colorways ?? []).filter((c) => on[c.key]);
  const ready = chosen.length > 0 && chosen.every((c) => !!prod[c.key]) && !busy;

  const create = async () => {
    if (!ready) { toast.error(t("เลือกสินค้าที่ผลิตของทุกสีที่ติ๊กก่อน", "Pick the product for every ticked colourway first")); return; }
    setBusy(true);
    const made: { cw: string; code: string; sku: string }[] = [];
    for (const cw of chosen) {
      const sku = prod[cw.key]!;
      const { lines } = linesFor(cw.key);
      if (!lines.length) { toast.error(t(`สี${cw.name}: ไม่มีบรรทัดให้สร้าง`, `${cw.name}: no lines to create`)); continue; }
      try {
        const res = await createBomFromLines({ sku: { code: sku.code, name: sku.name ?? null }, lines, note: `ดึงจากตารางสี (สี${cw.name || cw.key})${sheetCode ? ` · ${sheetCode}` : ""}` });
        made.push({ cw: cw.name || cw.key, code: res.code, sku: sku.code });
        const bom: SpecColorBom = { code: res.code, sku: sku.code, name: sku.name ?? null };
        void apiFetch(`/api/design-sheets/${sheetId}/spec`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colorway_key: cw.key, bom }) }).catch(() => {});
        onCreated?.(cw.key, bom);
      } catch (e) { toast.error(`${t("สี", "")}${cw.name}: ${e instanceof Error ? e.message : t("สร้างสูตรไม่สำเร็จ", "Failed to create BOM")}`); }
    }
    setBusy(false);
    setDone(made);
    if (made.length) toast.success(t(`สร้างสูตร BOM แล้ว ${made.length} สูตร`, `${made.length} BOM(s) created`));
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="dsd-bom-colors" title={t("🧬 สร้าง BOM จากตารางสี", "🧬 Create BOM from the colour table")}
      description={t("1 สีของรุ่น = 1 สูตร · วัตถุดิบมาจากช่องสี · จำนวน/ขนาดดึงจากตีราคาที่ใช้วัตถุดิบเดียวกัน", "One colourway = one BOM · materials from the colour cells · qty/size from costing rows using the same material")}
      footer={done.length ? (
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ปิด", "Close")}</button>
      ) : (<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void create()} disabled={!ready} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? t("กำลังสร้าง…", "Creating…") : t(`สร้าง ${chosen.length} สูตร`, `Create ${chosen.length} BOM(s)`)}
        </button>
      </>)}>
      {done.length ? (
        <div className="space-y-2 py-2">
          {done.map((d) => (
            <div key={d.code} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
              <span className="text-emerald-700">✓ {t("สี", "")}{d.cw} → <b className="font-semibold">{d.code}</b></span>
              <a href={`/master/bom?open=${encodeURIComponent(d.sku)}`} target="_blank" rel="noopener" className="ml-auto text-xs text-blue-600 hover:underline">{t("เปิดสูตร ↗", "Open BOM ↗")}</a>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">{t("สูตรเป็นสถานะร่าง — แก้/ลบได้ในหน้า BOM ตามปกติ", "BOMs are drafts — edit or delete them on the BOM page")}</p>
        </div>
      ) : !colors ? <div className="py-10 text-center text-sm text-slate-400">{t("กำลังโหลดตารางสี…", "Loading colour table…")}</div>
        : !colors.colorways.length || !colors.rows.length ? <div className="py-10 text-center text-sm text-slate-400">{t("ตารางสียังว่าง — เพิ่มส่วนประกอบ/สีของรุ่นในแท็บรายละเอียดงานก่อน (แล้วกดบันทึก)", "The colour table is empty — add parts/colourways in Job details first (and save)")}</div>
        : (
        <div className="space-y-2">
          {colors.colorways.map((cw) => {
            const { lines, missing } = linesFor(cw.key);
            const ticked = !!on[cw.key];
            return (
              <div key={cw.key} className={`rounded-lg border p-2.5 ${ticked ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={ticked} onChange={(e) => setOn((o) => ({ ...o, [cw.key]: e.target.checked }))} />
                    {t("สี", "")}{cw.name || cw.key}
                  </label>
                  {cw.bom && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">{t("มี BOM แล้ว", "Has BOM")} · {cw.bom.code}</span>}
                </div>
                {ticked && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="mb-1 text-[11px] text-slate-500">{t("สินค้าที่ผลิต (SKU ลูกของสีนี้)", "Product to produce (child SKU of this colourway)")}</div>
                      <SkuPicker value={prod[cw.key] ?? null} onChange={(v) => setProd((p) => ({ ...p, [cw.key]: v }))} placeholder={t("เลือก SKU ที่ผลิต…", "Select the SKU to produce…")} />
                    </div>
                    <div className="overflow-hidden rounded-md border border-slate-100 bg-white">
                      {lines.map((l, i) => (
                        <div key={i} className="flex items-center gap-2 border-b border-slate-50 px-2 py-1 text-xs last:border-0">
                          <span className="min-w-0 flex-1 truncate text-slate-700">{l.item_name}</span>
                          <span className="font-mono text-[11px] text-slate-500">{l.component_sku ?? "—"}</span>
                          <span className={`w-28 text-right text-[11px] ${l.qty != null ? "text-emerald-700" : "text-slate-400"}`}>
                            {l.qty != null ? `${l.qty} ${l.uom ?? ""}` : t("เติมในหน้าสูตร", "fill in BOM")}
                          </span>
                        </div>
                      ))}
                      {!lines.length && <div className="px-2 py-2 text-xs text-slate-400">{t("ยังไม่มีบรรทัด", "No lines")}</div>}
                    </div>
                    {missing.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        <span>⚠ {t(`ยังไม่เลือกวัตถุดิบ ${missing.length} ส่วน: ${missing.join(", ")}`, `${missing.length} part(s) without material: ${missing.join(", ")}`)}</span>
                        <label className="ml-auto inline-flex items-center gap-1">
                          <input type="checkbox" checked={!!fillEmpty[cw.key]} onChange={(e) => setFillEmpty((f) => ({ ...f, [cw.key]: e.target.checked }))} />
                          {t("ใส่เป็นบรรทัดว่าง (ไม่ติ๊ก = ข้าม)", "Add as empty lines (unticked = skip)")}
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ERPModal>
  );
}
