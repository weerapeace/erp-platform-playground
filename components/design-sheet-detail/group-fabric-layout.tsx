"use client";

/**
 * 🧵 "วางบนผ้า" ที่หัวกลุ่มตารางตีราคา (เจ้าของขอ 2026-11-17 "โชว์อันที่ลองวางบนผ้า แบบคำนวณผ้า" + "ถ้ามีจำนวน xx ใบ")
 *   หัวกลุ่ม: วางบนผ้า ≈ X หลา/ใบ · สั่ง N ใบ = Y หลา (หรือ ผืน · 1 ผืนได้ ~N ใบ) · ปุ่ม "ดูผัง"
 *   ดูผัง → ป๊อป: ลองจำนวนใบเอง (ตั้งต้น = จำนวนสั่งของแท็บ) · ผังการวาง (FabricLayoutPreview ของกลาง)
 *            · ปุ่ม "ใช้เป็นวางจริง" (ใส่ช่องวางจริง lib/nest-usage) · เปิดเครื่องคิดเลขผ้าเต็ม (พิมพ์วิธีตัด)
 *   ตัวคิด: lib/group-fabric-layout (packFabric ตัวเดียวกับเครื่องคิดเลขผ้า) · ไม่เขียนฐานข้อมูลเอง
 * ใช้ที่: components/design-sheet-detail/index.tsx (groupNote ของตารางตีราคา)
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { groupFabricLayout, DEFAULT_LAYOUT_QTY, type LayoutLine } from "@/lib/group-fabric-layout";
import { nestDiffLabel, nestDiffPct } from "@/lib/nest-usage";
import { FabricLayoutPreview } from "./fabric-layout-preview";

const QUICK = [100, 300, 500, 1000, 3000];
const f = (n: number, d = 3) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH");

export function GroupFabricLayout({ name, lines, sheet, unit, orderQty, estimate, onApply, onOpenFull }: {
  name: string;
  lines: LayoutLine[];
  /** ผ้าผืน/แผ่น: ขนาดผืนจากทะเบียนวัสดุ (ไม่มี = ผ้าม้วน ใช้หน้ากว้างในบรรทัด) */
  sheet: { width_cm: number | null; length_cm: number | null } | null;
  /** หน่วยของ "ใช้ต่อใบ ≈" (หลา / ผืน / แผ่น) */
  unit: string;
  /** จำนวนสั่งของแท็บ (ไม่มี = คิด 100 ใบ) */
  orderQty: number | null;
  /** ใช้ต่อใบจากพื้นที่ (ไว้เทียบ) */
  estimate: number | null;
  /** ใส่ตัวเลขต่อใบเป็น "วางจริง" (ไม่ส่ง = ไม่มีปุ่ม) */
  onApply?: (perUnit: number) => void;
  onOpenFull?: (qty: number) => void;
}) {
  const t = useT();
  const key = JSON.stringify([lines.map((l) => [l.width_cm, l.length_cm, l.pieces, l.face_width_cm, l.waste_percent, l.divisor]), sheet, orderQty]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const head = useMemo(() => groupFabricLayout(lines, { qty: orderQty, sheet }), [key]);
  const [open, setOpen] = useState(false);
  if (!head) return null;
  const u = head.mode === "sheet" ? unit : t("หลา", "yd");
  const qtyLabel = orderQty ? t(`สั่ง ${orderQty.toLocaleString("th-TH")} ใบ`, `${orderQty.toLocaleString("th-TH")} units`) : null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <span className="inline-flex flex-wrap items-center gap-1" onClick={stop}>
      <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-800"
        title={t(`จำลองวางชิ้นจริงบนหน้าผ้า ${f(head.faceWidthCm, 1)} ซม. (หมุนชิ้นได้ · เผื่อเสีย ${head.wastePercent}%) คิดจาก ${head.qty} ใบ แล้วหารต่อใบ`, `Simulated layout on ${f(head.faceWidthCm, 1)} cm fabric for ${head.qty} units, divided per unit`)}>
        <Icon value="i:grid-view" className="text-[12px]" />{t("วางบนผ้า ≈", "On fabric ≈")} <b className="font-semibold tabular-nums">{f(head.perUnit)} {u}/{t("ใบ", "unit")}</b>
      </span>
      {qtyLabel && <span className="text-[11px] text-slate-600">· {qtyLabel} = <b className="tabular-nums">{f(head.total, 2)} {u}</b></span>}
      {head.unitsPerSheet ? <span className="text-[11px] text-slate-500">· {t(`1 ${unit} ได้ ~${head.unitsPerSheet} ใบ`, `1 ${unit} ≈ ${head.unitsPerSheet} units`)}</span> : null}
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-medium text-indigo-600 underline-offset-2 hover:underline">{t("ดูผัง", "View layout")}</button>
      {open && <LayoutModal name={name} lines={lines} sheet={sheet} unit={unit} startQty={orderQty || DEFAULT_LAYOUT_QTY} estimate={estimate} onApply={onApply} onOpenFull={onOpenFull} onClose={() => setOpen(false)} />}
    </span>
  );
}

function LayoutModal({ name, lines, sheet, unit, startQty, estimate, onApply, onOpenFull, onClose }: {
  name: string; lines: LayoutLine[]; sheet: { width_cm: number | null; length_cm: number | null } | null; unit: string;
  startQty: number; estimate: number | null; onApply?: (perUnit: number) => void; onOpenFull?: (qty: number) => void; onClose: () => void;
}) {
  const t = useT();
  const [qtyText, setQtyText] = useState(String(startQty));
  const qty = Math.max(1, Math.round(Number(qtyText) || startQty));
  const g = useMemo(() => groupFabricLayout(lines, { qty, sheet }), [lines, sheet, qty]);
  const u = g?.mode === "sheet" ? unit : t("หลา", "yd");
  const pct = g ? nestDiffPct(g.perUnit, estimate) : null;

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="group-fabric-layout"
      title={t(`ผังวางบนผ้า — ${name}`, `Fabric layout — ${name}`)}
      description={t("จำลองวางชิ้นจริงบนหน้าผ้า (ตัวเดียวกับเครื่องคิดเลขผ้า) · ลองเปลี่ยนจำนวนใบได้ ไม่แก้ข้อมูลในใบงาน", "Simulates laying the real pieces on the fabric (same engine as the fabric calculator) · try other quantities; nothing is saved")}
      footer={<div className="flex w-full flex-wrap items-center gap-2">
        {onOpenFull && <button type="button" onClick={() => { onOpenFull(qty); onClose(); }} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">{t("เครื่องคิดเลขผ้าเต็ม / พิมพ์วิธีตัด", "Full fabric calculator / cutting plan")}</button>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {onApply && g && <button type="button" onClick={() => { onApply(g.perUnit); onClose(); }} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">{t(`ใช้ ${f(g.perUnit)} ${u}/ใบ เป็นวางจริง`, `Use ${f(g.perUnit)} ${u}/unit as actual`)}</button>}
        </div>
      </div>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">{t("ลองจำนวน", "Quantity")}</span>
          <input inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value.replace(/[^\d]/g, ""))}
            className="h-9 w-24 rounded-lg border border-slate-300 px-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-slate-600">{t("ใบ", "units")}</span>
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => <button key={q} type="button" onClick={() => setQtyText(String(q))}
              className={`h-7 rounded-md border px-2 text-xs ${q === qty ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{q.toLocaleString("th-TH")}</button>)}
          </div>
        </div>
        {!g ? <p className="rounded-lg bg-amber-50 px-3 py-4 text-center text-sm text-amber-800">{t("วางไม่ได้ — ชิ้นใหญ่กว่าหน้าผ้า หรือยังไม่มีขนาด", "Can't lay out — a piece is wider than the fabric or sizes are missing")}</p> : <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t("ต่อใบ", "Per unit")} value={`${f(g.perUnit)} ${u}`} />
            <Stat label={t(`รวม ${qty.toLocaleString("th-TH")} ใบ`, `Total for ${qty.toLocaleString("th-TH")}`)} value={`${f(g.total, 2)} ${u}`} strong />
            {g.unitsPerSheet ? <Stat label={t(`1 ${unit} ได้`, `Per ${unit}`)} value={t(`~${g.unitsPerSheet} ใบ`, `~${g.unitsPerSheet} units`)} /> : <Stat label={t("หน้ากว้างผ้า", "Fabric width")} value={`${f(g.faceWidthCm, 1)} ${t("ซม.", "cm")}`} />}
            <Stat label={t("วางได้คุ้ม", "Layout efficiency")} value={`${g.efficiency}%`} />
          </div>
          <p className="text-xs text-slate-500">
            {t(`เผื่อเสีย ${g.wastePercent}% · หมุนชิ้นได้ · เว้นรอยตัด 0.5 ซม.`, `Waste ${g.wastePercent}% · rotation allowed · 0.5 cm cutting gap`)}
            {estimate != null && <> · {t(`ประมาณจากพื้นที่ ${f(estimate)} ${unit}/ใบ`, `area estimate ${f(estimate)} ${unit}/unit`)}{pct != null && <> → <b className={pct > 0 ? "text-amber-700" : "text-emerald-700"}>{nestDiffLabel(pct, t)}</b></>}</>}
            {g.result.sampledFrom && <> · {t(`ล็อตใหญ่: จำลอง ${g.result.sampledFrom.simulated.toLocaleString("th-TH")} ชิ้นแล้วคิดสัดส่วน`, `large lot: simulated ${g.result.sampledFrom.simulated.toLocaleString("th-TH")} pieces and scaled`)}</>}
          </p>
          <FabricLayoutPreview result={g.result} faceWidthCm={g.faceWidthCm} sheetLengthCm={g.sheetLengthCm} mode={g.mode} maxHeight={420} />
        </>}
      </div>
    </ERPModal>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? "text-base font-semibold text-indigo-800" : "text-sm font-medium text-slate-800"}`}>{value}</div>
    </div>
  );
}
