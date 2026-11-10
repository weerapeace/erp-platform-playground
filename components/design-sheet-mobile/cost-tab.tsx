"use client";

/**
 * MobileCostTab — แท็บ "ตีราคา" ของหน้าใบงานบนมือถือ (แก้ได้เลย ไม่ต้องเปิดป๊อปอัปจอคอม · เจ้าของขอ 2026-11-10)
 *
 * - สรุป = CostSummaryCard ตัวเดียวกับหน้าคอม · วัสดุจัดกลุ่มตามชนิด → แตะบรรทัด = แผ่นแก้จากล่าง (BottomSheet กลาง)
 * - สูตรต่อบรรทัด: lib/design-sheet-cost-row (recomputeCostLine · costLineFromItem · costItemPatch · withPrevItem) — ตัวเดียวกับหน้าคอม
 * - ค่าแรงตัดแบบ "ตามจำนวนชิ้น": lib/design-cost-presets (cutLaborRows) คิดให้เองเมื่อแก้บรรทัด เหมือนหน้าคอม
 * - บันทึก = PUT cost-lines (ทั้งชุด) + PATCH ใบงาน { cost_extra } เหมือนหน้าคอม (เก็บเวอร์ชัน + ประวัติที่ API)
 *   ก่อนบันทึกเช็กว่ามีคนบันทึกตีราคาใบนี้หลังเราเปิดไหม → ถามก่อนทับ
 * - ยังทำที่หน้าคอม: วาดรูปทรงชิ้น · ตั้งค่าโสหุ้ยแยกรายการ / ค่าตัดรายวัสดุ · เพิ่มแท็บไซส์ใหม่ · ดึงจาก BOM · จำนวนสั่ง
 * doc: docs/design-sheet-mobile.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import type { PriceItem } from "@/app/api/design-sheets/price-items/route";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { BottomSheet } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { CostSummaryCard, SEG_COLORS } from "@/components/design-sheet-detail/cost-summary-card";
import {
  COST_QTY_TIERS, costItemPatch, costLineFromItem, isPieceGroup, isZeroCostLine, recomputeCostLine, restorePrevItem, withPrevItem,
} from "@/lib/design-sheet-cost-row";
import { cleanExtra, extraAmountAt, extraKindOf, type SnapExtra, type SnapExtraMap } from "@/lib/design-sheet-cost-snapshot";
import { cutLaborRows, cutLaborSummary, overheadRows, overheadTotal, presetsOf, type CostPreset } from "@/lib/design-cost-presets";
import { costUsagePerUnit } from "@/lib/cost-usage";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";

type Row = CostLine & { key: string };
const pk = (s: string | null | undefined) => s ?? "";
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number | null | undefined, d = 2) => (n == null ? "—" : Number(n).toLocaleString("th-TH", { maximumFractionDigits: d }));
const baht = (n: number | null | undefined) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
let keySeq = 0;
const newKey = () => `m${Date.now()}_${keySeq++}`;
const toRows = (lines: CostLine[]): Row[] => lines.map((l) => ({ ...l, key: newKey() }));
const stripKeys = (rows: Row[]) => rows.map(({ key: _k, ...l }, i) => { void _k; return { ...l, sort_order: i + 1 }; });

/** cost_extra ในใบงาน: array (ใบเก่า = ทั่วไป) หรือ map แยกตามแท็บ → map ที่ผ่าน cleanExtra (คงชนิด/หารจำนวนสั่ง/ตั้งค่าโสหุ้ย) */
function parseExtraMap(raw: unknown): SnapExtraMap {
  if (Array.isArray(raw)) return { "": raw.map(cleanExtra) };
  if (raw && typeof raw === "object") {
    const out: SnapExtraMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = (Array.isArray(v) ? v : []).map(cleanExtra);
    return out;
  }
  return {};
}
/** ลายนิ้วมือชุดบรรทัดจากเซิร์ฟเวอร์ (id เปลี่ยนทุกครั้งที่ใครบันทึก) — ใช้เช็กว่ามีคนบันทึกทับระหว่างเราแก้ไหม */
const serverFp = (lines: CostLine[]) => JSON.stringify(lines.map((l) => [l.id ?? null, pk(l.parent_code), l.item_id ?? null, l.qty ?? null, l.unit_price ?? null, l.amount ?? null]));

function lineDetail(r: Row): string {
  const piece = isPieceGroup(r.group_code, r.group_name); const m = r.calc_method;
  const parts: string[] = [];
  if (piece || m === "area_face" || m === "area_100") {
    if (r.width_cm && r.length_cm) parts.push(`${fmtN(r.width_cm)}×${fmtN(r.length_cm)} ${tr("ซม.", "cm")}`);
    if (r.pieces) parts.push(tr(`${fmtN(r.pieces)} ชิ้น`, `${fmtN(r.pieces)} pcs`));
  } else if (m === "length") {
    if (r.length_cm) parts.push(tr(`ยาว ${fmtN(r.length_cm)} ซม.`, `${fmtN(r.length_cm)} cm long`));
  } else if (m === "count") parts.push(tr(`${fmtN(r.pieces)} ชิ้น`, `${fmtN(r.pieces)} pcs`));
  if (r.qty != null) parts.push(`${tr("ใช้", "uses")} ${fmtN(r.qty, 4)} ${r.uom ?? ""}`.trim());
  return parts.join(" · ");
}

const METHOD_LABEL: Record<string, () => string> = {
  area_face: () => tr("พื้นที่ ÷ หน้ากว้าง", "Area ÷ width"), area_100: () => tr("พื้นที่ ÷ 100", "Area ÷ 100"),
  length: () => tr("ความยาว", "Length"), count: () => tr("นับชิ้น", "Count"), manual: () => tr("ใส่ปริมาณเอง", "Enter qty"),
};

// ── ช่องตัวเลข (พิมพ์ทศนิยมได้ลื่น · ตัวอักษร 16px กันมือถือซูม) ──
function NumField({ label, value, onChange, suffix, step }: {
  label: string; value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string;
  /** มีค่า = โชว์ปุ่ม − / + ทีละ step */
  step?: number;
}) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(value == null ? "" : String(value)); }, [value]);
  const bump = (d: number) => onChange(Math.max(0, r2((Number(value) || 0) + d)));
  return (
    <label className="block min-w-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <div className="mt-0.5 flex h-10 items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        {step != null && <button type="button" onClick={() => bump(-step)} aria-label={tr("ลด", "Decrease")} className="h-full w-9 shrink-0 text-lg text-slate-500 active:bg-slate-50">−</button>}
        <input inputMode="decimal" value={txt}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; setTxt(value == null ? "" : String(value)); }}
          onChange={(e) => {
            setTxt(e.target.value);
            const s = e.target.value.replace(/,/g, "").trim();
            if (s === "") onChange(null);
            else if (/^\d*\.?\d*$/.test(s) && s !== ".") onChange(Number(s));
          }}
          className="min-w-0 flex-1 bg-transparent px-1 text-center text-base tabular-nums text-slate-900 focus:outline-none" />
        {suffix && <span className="shrink-0 pr-2 text-[11px] text-slate-400">{suffix}</span>}
        {step != null && <button type="button" onClick={() => bump(step)} aria-label={tr("เพิ่ม", "Increase")} className="h-full w-9 shrink-0 text-lg text-slate-500 active:bg-slate-50">+</button>}
      </div>
    </label>
  );
}

export function MobileCostTab({ sheetId, lines, costExtraRaw, generalLabel, tabCodes, canEdit, onSaved, onDirtyChange, onReload, onOpenFull }: {
  sheetId: string;
  /** บรรทัดตีราคาที่โหลดมาแล้ว (หน้าแม่โหลดครั้งเดียว) */
  lines: CostLine[];
  /** design_sheets.cost_extra ดิบ */
  costExtraRaw: unknown;
  generalLabel?: string | null;
  /** แท็บไซส์ที่ใบงานรู้จัก (Parent จริง + ร่าง) — เพิ่มจากบรรทัด/ค่าใช้จ่ายที่มีอยู่ให้เอง */
  tabCodes: string[];
  /** แก้ได้ไหม (สิทธิ์แก้ใบงาน + เห็นต้นทุน) */
  canEdit: boolean;
  onSaved: (lines: CostLine[], costExtra: SnapExtraMap) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** โหลดใบงานใหม่ทั้งหน้า (ตอนมีคนบันทึกทับ) */
  onReload: () => void;
  /** เปิดป๊อปอัปเต็ม (งานที่ทำได้เฉพาะหน้าคอม) */
  onOpenFull: () => void;
}) {
  const t = useT();
  const toast = useToast();

  // ── ชุดที่แก้อยู่ (draft) + ชุดตั้งต้น (เทียบว่าแก้ค้างไหม) ──
  const [rows, setRows] = useState<Row[]>(() => toRows(lines));
  const [extras, setExtras] = useState<SnapExtraMap>(() => parseExtraMap(costExtraRaw));
  const [base, setBase] = useState(() => ({ fp: serverFp(lines), lines, extras: parseExtraMap(costExtraRaw) }));
  useEffect(() => {   // หน้าแม่โหลดใหม่ / บันทึกเสร็จ → ตั้งต้นใหม่
    const ex = parseExtraMap(costExtraRaw);
    setRows(toRows(lines)); setExtras(ex); setBase({ fp: serverFp(lines), lines, extras: ex });
  }, [lines, costExtraRaw]);
  const dirty = useMemo(
    () => JSON.stringify(stripKeys(rows)) !== JSON.stringify(stripKeys(toRowsStable(base.lines))) || JSON.stringify(extras) !== JSON.stringify(base.extras),
    [rows, extras, base],
  );
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {   // ปิดแท็บ/รีเฟรชทั้งที่แก้ค้าง = เบราว์เซอร์ถามก่อน
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ── แท็บไซส์ ──
  const tabs = useMemo(() => {
    const s = new Set<string>([""]);
    for (const c of tabCodes) if (c) s.add(c);
    for (const r of rows) s.add(pk(r.parent_code));
    for (const k of Object.keys(extras)) s.add(k);
    return [...s];
  }, [tabCodes, rows, extras]);
  const [parent, setParent] = useState("");
  const tabLabel = (k: string) => costTabLabel(k, generalLabelOf(generalLabel));

  // ── วัสดุตีราคา + ราคากลาง (โหลดเฉพาะคนที่แก้ได้ — ใช้เลือกวัสดุ + คิดค่าตัดอัตโนมัติ) ──
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [presets, setPresets] = useState<CostPreset[] | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    apiFetch("/api/design-sheets/price-items").then((r) => r.json()).then((j) => { if (alive) setItems(Array.isArray(j?.data) ? j.data as PriceItem[] : []); }).catch(() => { if (alive) setItems([]); });
    apiFetch("/api/design-sheets/cost-presets").then((r) => r.json()).then((j) => { if (alive) setPresets(Array.isArray(j?.data) ? j.data as CostPreset[] : []); }).catch(() => { if (alive) setPresets([]); });
    return () => { alive = false; };
  }, [canEdit]);
  const itemById = useMemo(() => new Map((items ?? []).map((it) => [it.id, it])), [items]);

  /** ค่าแรงตัด "ตามจำนวนชิ้น" ของแท็บ p = คิดใหม่จากบรรทัด (เหมือนหน้าคอม) — ข้อมูลราคายังไม่มา = ไม่แตะ */
  const withAutoCut = useCallback((nextRows: Row[], nextExtras: SnapExtraMap, p: string): SnapExtraMap => {
    if (!items || !presets) return nextExtras;
    const list = nextExtras[p] ?? [];
    const idx = list.findIndex((c) => extraKindOf(c) === "labor_cut" && c.cut_by === "pieces");
    if (idx < 0) return nextExtras;
    const central = presetsOf(presets, "cut_rate")[0]?.amount ?? null;
    const total = cutLaborSummary(cutLaborRows(nextRows.filter((r) => pk(r.parent_code) === p), central, (id) => itemById.get(id)?.cut_rate ?? null)).total;
    if (Math.abs((list[idx].amount || 0) - total) <= 0.005) return nextExtras;
    return { ...nextExtras, [p]: list.map((c, i) => (i === idx ? cleanExtra({ ...c, amount: total }) : c)) };
  }, [items, presets, itemById]);
  const commitRows = (next: Row[]) => { setRows(next); setExtras((ex) => withAutoCut(next, ex, parent)); };
  const updRow = (key: string, patch: Partial<CostLine>) => commitRows(rows.map((r) => (r.key === key ? recomputeCostLine({ ...r, ...patch }) : r)));

  // ── ตัวเลขของแท็บที่ดู ──
  const curRows = rows.filter((r) => pk(r.parent_code) === parent);
  const curExtra = extras[parent] ?? [];
  const material = r2(curRows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const grand = r2(material + curExtra.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; amount: number; rows: Row[] }>();
    for (const r of curRows) {
      const k = r.group_name || tr("ไม่ระบุชนิด", "Unspecified type");
      const g = m.get(k) ?? { label: k, amount: 0, rows: [] };
      g.amount = r2(g.amount + (Number(r.amount) || 0)); g.rows.push(r); m.set(k, g);
    }
    return [...m.values()];
  }, [curRows]);
  // สีกลุ่มตรงกับแถบสัดส่วนในการ์ดสรุป (การ์ดให้สีตามลำดับกลุ่มที่มียอด)
  const groupColor = useMemo(() => {
    const out = new Map<string, string>(); let i = 0;
    for (const g of groups) if (g.amount > 0) out.set(g.label, SEG_COLORS[i++ % SEG_COLORS.length]);
    return out;
  }, [groups]);
  const totalAt = (q: number) => r2(material + curExtra.reduce((s, c) => s + (presets && extraKindOf(c) === "overhead" && c.oh
    ? overheadTotal(overheadRows(c.oh, presets, q)) : extraAmountAt(c, q)), 0));
  const hasSplit = curExtra.some((c) => c.mode === "split");
  const usage = (() => {
    const u = costUsagePerUnit(curRows.map((r) => ({ item_id: r.item_id, group_name: r.group_name, qty: r.qty, uom: r.uom, piece: isPieceGroup(r.group_code, r.group_name) })), (id) => itemById.get(id));
    const parts: string[] = [];
    if (u.sheets) parts.push(`${u.sheets.qty.toFixed(2)} ${u.sheets.unit}`);
    for (const x of u.byUom) parts.push(`${fmtN(Math.round(x.qty * 1000) / 1000, 3)} ${x.uom}`);
    return parts.length ? t(`ใช้ต่อใบ ≈ ${parts.join(" + ")}`, `Per unit ≈ ${parts.join(" + ")}`) : null;
  })();
  const zeroRows = curRows.filter(isZeroCostLine);

  // ── แผ่นแก้ ──
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [editKey, setEditKey] = useState<string | null>(null);
  const [pick, setPick] = useState<{ mode: "add" } | { mode: "change"; key: string } | null>(null);
  const [extraIdx, setExtraIdx] = useState<number | null>(null);
  const editing = rows.find((r) => r.key === editKey) ?? null;
  const toggleGroup = (k: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const onPicked = (it: PriceItem) => {
    if (!pick) return;
    if (pick.mode === "add") {
      const row: Row = { ...(costLineFromItem(it, rows.length) as unknown as CostLine), parent_code: parent || null, key: newKey() };
      commitRows([...rows, row]);
      setOpenGroups((s) => new Set(s).add(row.group_name || tr("ไม่ระบุชนิด", "Unspecified type")));
      setPick(null); setEditKey(row.key);
    } else {
      const r = rows.find((x) => x.key === pick.key);
      if (r) updRow(r.key, withPrevItem(r, costItemPatch(it, r)));
      setPick(null);
    }
  };
  const removeRow = async (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    if (!(await askConfirm({ title: t("ลบบรรทัดนี้?", "Delete this line?"), message: `${r.item_name ?? r.group_name ?? ""} · ${baht(r.amount)}`, variant: "danger", confirmText: t("ลบ", "Delete") }))) return;
    setEditKey(null);
    commitRows(rows.filter((x) => x.key !== key));
  };

  const setCurExtra = (fn: (l: SnapExtra[]) => SnapExtra[]) => setExtras((ex) => ({ ...ex, [parent]: fn(ex[parent] ?? []) }));
  const updExtra = (i: number, patch: Partial<SnapExtra>) => setCurExtra((l) => l.map((c, xi) => (xi === i ? cleanExtra({ ...c, ...patch }) : c)));
  const addExtra = () => { setCurExtra((l) => [...l, cleanExtra({ label: "", amount: 0, kind: "other" })]); setExtraIdx(curExtra.length); };
  const removeExtra = async (i: number) => {
    if (!(await askConfirm({ title: t("ลบรายการนี้?", "Delete this item?"), message: curExtra[i]?.label || "", variant: "danger", confirmText: t("ลบ", "Delete") }))) return;
    setExtraIdx(null); setCurExtra((l) => l.filter((_, xi) => xi !== i));
  };
  const extraAuto = (c: SnapExtra) => (extraKindOf(c) === "labor_cut" && c.cut_by === "pieces") || (extraKindOf(c) === "overhead" && !!c.oh);

  // ── บันทึก (เหมือนหน้าคอม) ──
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 1) กันทับ: มีใครบันทึกตีราคาใบนี้หลังเราเปิดไหม
      const cur = await apiFetch(`/api/design-sheets/${sheetId}/cost-lines`).then((r) => r.json()).catch(() => null) as { data?: CostLine[]; error?: string | null } | null;
      if (cur && !cur.error && Array.isArray(cur.data) && serverFp(cur.data) !== base.fp) {
        const over = await askConfirm({
          title: t("มีคนบันทึกตีราคาใบนี้หลังคุณเปิด", "Someone saved this costing after you opened it"),
          message: t("บันทึกต่อ = ของที่เขาแก้จะถูกแทนด้วยของคุณ", "Saving now replaces their changes with yours"),
          variant: "danger", confirmText: t("บันทึกทับ", "Save anyway"), cancelText: t("ยังไม่บันทึก", "Not now"),
        });
        if (!over) {
          if (await askConfirm({ title: t("โหลดตีราคาล่าสุด?", "Load the latest costing?"), message: t("ที่คุณแก้ค้างไว้จะหาย", "Your unsaved changes will be lost"), confirmText: t("โหลดใหม่", "Reload") })) onReload();
          return;
        }
      }
      // 2) บรรทัด (PUT ทั้งชุด) + ค่าใช้จ่ายเพิ่ม (PATCH ใบงาน) — ชุดเดียวกับหน้าคอม
      const [lr, er] = await Promise.all([
        apiFetch(`/api/design-sheets/${sheetId}/cost-lines`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: stripKeys(rows), cost_extra: extras }) }),
        apiFetch(`/api/design-sheets/${sheetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cost_extra: extras }) }),
      ]);
      const lj = await lr.json().catch(() => ({})); if (!lr.ok || lj.error) throw new Error(lj.error || t("บันทึกบรรทัดตีราคาไม่สำเร็จ", "Failed to save cost lines"));
      const ej = await er.json().catch(() => ({})); if (!er.ok || ej.error) throw new Error(ej.error || t("บันทึกค่าใช้จ่ายเพิ่มไม่สำเร็จ", "Failed to save additional costs"));
      // 3) โหลดชุดใหม่ (id ใหม่) ให้รอบหน้าเช็กกันทับได้ถูก
      const fresh = await apiFetch(`/api/design-sheets/${sheetId}/cost-lines`).then((r) => r.json()).catch(() => null) as { data?: CostLine[] } | null;
      onSaved(Array.isArray(fresh?.data) ? fresh.data : stripKeys(rows), extras);
      toast.success(t("บันทึกตีราคาแล้ว", "Costing saved"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกตีราคาไม่สำเร็จ", "Failed to save costing")); }
    finally { setSaving(false); }
  };
  const discard = async () => {
    if (!(await askConfirm({ title: t("ทิ้งที่แก้ค้าง?", "Discard unsaved changes?"), message: t("กลับไปเป็นตีราคาที่บันทึกไว้", "Go back to the saved costing"), variant: "danger", confirmText: t("ทิ้ง", "Discard") }))) return;
    setRows(toRows(base.lines)); setExtras(base.extras);
  };

  const empty = curRows.length === 0 && curExtra.every((c) => !c.amount);
  return (
    <div className="space-y-3">
      {tabs.length > 1 && (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
          {tabs.map((k) => (
            <button key={k || "__general"} type="button" onClick={() => setParent(k)}
              className={`h-8 shrink-0 rounded-full border px-3 text-xs font-medium ${parent === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{tabLabel(k)}</button>
          ))}
        </div>
      )}

      {empty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <div className="text-sm text-slate-600">{t("ยังไม่ตีราคา", "Not costed yet")}{parent ? ` · ${tabLabel(parent)}` : ""}</div>
          {canEdit && <div className="mt-1 text-xs text-slate-400">{t("กด \"เพิ่มวัสดุ\" ด้านล่างเพื่อเริ่ม", "Tap \"Add material\" below to start")}</div>}
        </div>
      ) : (
        <CostSummaryCard grandTotal={grand} materialTotal={material} groups={groups.map((g) => ({ label: g.label, amount: g.amount }))}
          extras={curExtra.filter((c) => (c.amount || 0) !== 0).map((c) => ({ label: c.label || t("ค่าใช้จ่าย", "Expense"), amount: c.amount || 0,
            note: c.mode === "split" && c.split_qty ? `(${fmtN(c.total ?? 0)} ÷ ${c.split_qty.toLocaleString("th-TH")})` : null }))}
          usage={usage} tiers={hasSplit ? COST_QTY_TIERS.map((q) => ({ qty: q, total: totalAt(q) })) : undefined}
          zeroCount={zeroRows.length} dirty={dirty} />
      )}

      {zeroRows.length > 0 && canEdit && (
        <button type="button" onClick={() => setEditKey(zeroRows[0].key)}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
          <Icon name="warning" /> <span className="min-w-0 flex-1">{t(`${zeroRows[0].item_name ?? "บรรทัด"} ยังไม่มียอด · แตะเพื่อใส่`, `${zeroRows[0].item_name ?? "A line"} has no amount · tap to fill`)}</span>
        </button>
      )}

      {/* วัสดุ: จัดกลุ่มตามชนิด · แตะหัวกลุ่ม = กาง · แตะบรรทัด = แก้ */}
      {curRows.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-slate-500">
            <span>{t(`วัสดุ ${curRows.length} บรรทัด`, `Materials: ${curRows.length} lines`)}</span><span className="tabular-nums">{baht(material)}</span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {groups.map((g) => {
              const open = openGroups.has(g.label) || groups.length === 1;
              return (
                <div key={g.label}>
                  <button type="button" onClick={() => toggleGroup(g.label)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50">
                    <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: groupColor.get(g.label) ?? "#cbd5e1" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{g.label}</span>
                      <span className="block truncate text-[11px] text-slate-400">{t(`${g.rows.length} บรรทัด`, `${g.rows.length} lines`)} · {[...new Set(g.rows.map((r) => r.item_name).filter(Boolean))].slice(0, 3).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-slate-800">{baht(g.amount)}</span>
                    <span className={`shrink-0 text-slate-300 transition ${open ? "rotate-90" : ""}`}>›</span>
                  </button>
                  {open && (
                    <div className="bg-slate-50/70 pb-1">
                      {g.rows.map((r) => {
                        const zero = isZeroCostLine(r);
                        return (
                          <button key={r.key} type="button" onClick={() => canEdit && setEditKey(r.key)} disabled={!canEdit}
                            className="flex w-full items-start gap-2 py-2 pl-6 pr-3 text-left active:bg-white disabled:active:bg-transparent">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-slate-800">{r.item_name || r.item_sku_code || "—"}{r.note ? <span className="text-slate-400"> · {r.note}</span> : null}</span>
                              <span className="block truncate text-[11px] text-slate-400">{lineDetail(r) || "—"}</span>
                              {r.prev_item && <span className="mt-0.5 inline-block rounded bg-sky-50 px-1.5 text-[10px] text-sky-800">{t("เปลี่ยนวัสดุแล้ว · แตะดู", "Material changed · tap to review")}</span>}
                            </span>
                            <span className={`shrink-0 text-[13px] tabular-nums ${zero ? "font-medium text-rose-600" : "text-slate-700"}`}>{zero ? t("ยังไม่มียอด", "No amount") : baht(r.amount)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ค่าใช้จ่ายเพิ่ม (ค่าแรง / โสหุ้ย / อื่น ๆ) */}
      {(curExtra.length > 0 || canEdit) && (
        <div>
          <div className="mb-1 px-1 text-[11px] text-slate-500">{t("ค่าแรง / โสหุ้ย / อื่น ๆ (ต่อใบ)", "Labor / overhead / other (per unit)")}</div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {curExtra.map((c, i) => (
              <button key={i} type="button" onClick={() => canEdit && setExtraIdx(i)} disabled={!canEdit}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50 disabled:active:bg-transparent">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-slate-800">{c.label || t("ค่าใช้จ่าย", "Expense")}</span>
                  {(extraAuto(c) || c.mode === "split" || c.note) && (
                    <span className="block truncate text-[11px] text-slate-400">
                      {extraAuto(c) ? t("คิดให้อัตโนมัติ", "Calculated automatically") : c.mode === "split" ? t(`${baht(c.total ?? 0)} ÷ ${c.split_qty ? c.split_qty.toLocaleString("th-TH") : "?"} ใบ`, `${baht(c.total ?? 0)} ÷ ${c.split_qty ? c.split_qty.toLocaleString("en-US") : "?"} units`) : c.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-slate-700">{baht(c.amount || 0)}</span>
              </button>
            ))}
            {canEdit && (
              <button type="button" onClick={addExtra} className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[13px] text-blue-700 active:bg-slate-50">
                <Icon name="add" /> {t("ค่าใช้จ่ายเพิ่ม", "Add expense")}
              </button>
            )}
          </div>
        </div>
      )}

      {canEdit && (
        <button type="button" onClick={onOpenFull} className="flex w-full items-center justify-center gap-1.5 py-1 text-[11px] text-slate-400">
          <Icon name="computer" /> {t("วาดรูปทรง / ดึง BOM / ตั้งโสหุ้ย / เพิ่มไซส์ → หน้าจอคอม", "Draw shapes / pull BOM / overhead / add size → desktop view")}
        </button>
      )}

      {/* แถบล่างของแท็บตีราคา (แทนแถบปุ่มของหน้า) */}
      {canEdit && (
        <div className="sticky bottom-0 z-20 -mx-3 flex gap-2 border-t border-slate-200 bg-white/95 px-3 pt-2 backdrop-blur" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          {dirty && <button type="button" onClick={() => void discard()} className="h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600">{t("ทิ้ง", "Discard")}</button>}
          <button type="button" onClick={() => setPick({ mode: "add" })} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800">
            <Icon name="add" /> {t("เพิ่มวัสดุ", "Add material")}
          </button>
          {dirty && (
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-60">
              <Icon name="save" /> {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
            </button>
          )}
        </div>
      )}

      {/* ── แผ่นแก้บรรทัด ── */}
      {editing && (
        <LineSheet row={editing} index={curRows.findIndex((r) => r.key === editing.key)} total={curRows.length}
          item={editing.item_id ? itemById.get(editing.item_id) ?? null : null}
          onChange={(patch) => updRow(editing.key, patch)}
          onChangeMaterial={() => setPick({ mode: "change", key: editing.key })}
          onDelete={() => void removeRow(editing.key)}
          onNext={() => { const i = curRows.findIndex((r) => r.key === editing.key); setEditKey(curRows[(i + 1) % curRows.length]?.key ?? null); }}
          onClose={() => setEditKey(null)} />
      )}

      {/* ── เลือกวัสดุ (เพิ่ม / เปลี่ยน) ── */}
      <ItemPickSheet open={!!pick} items={items} title={pick?.mode === "change" ? t("เปลี่ยนวัสดุ", "Change material") : t("เพิ่มวัสดุ", "Add material")}
        onPick={onPicked} onClose={() => setPick(null)} />

      {/* ── แผ่นแก้ค่าใช้จ่ายเพิ่ม ── */}
      {extraIdx != null && curExtra[extraIdx] && (
        <ExtraSheet extra={curExtra[extraIdx]} auto={extraAuto(curExtra[extraIdx])}
          onChange={(patch) => updExtra(extraIdx, patch)} onDelete={() => void removeExtra(extraIdx)} onClose={() => setExtraIdx(null)} />
      )}
    </div>
  );
}

/** เทียบแก้ค้าง: แปลงชุดตั้งต้นเป็นแถวแบบเดียวกับ draft (key ไม่ถูกเทียบ) */
function toRowsStable(lines: CostLine[]): Row[] { return lines.map((l) => ({ ...l, key: "" })); }

// ───────────────────────── แผ่นแก้ 1 บรรทัด ─────────────────────────
function LineSheet({ row: r, index, total, item, onChange, onChangeMaterial, onDelete, onNext, onClose }: {
  row: Row; index: number; total: number; item: PriceItem | null;
  onChange: (patch: Partial<CostLine>) => void; onChangeMaterial: () => void; onDelete: () => void; onNext: () => void; onClose: () => void;
}) {
  const t = useT();
  const piece = isPieceGroup(r.group_code, r.group_name);
  const m = r.calc_method;
  const area = m === "area_face" || m === "area_100";
  const showW = piece || area;
  const showL = piece || area || m === "length";
  const showPcs = piece || area || m === "count";
  const showWaste = piece || area || m === "length";
  const manual = !piece && (!m || m === "manual");
  const methodText = piece ? t("ชิ้นสำเร็จ · คิดตามพื้นที่", "Fixed piece · by area") : (METHOD_LABEL[m ?? "manual"]?.() ?? m ?? "");
  const prev = r.prev_item;
  return (
    <BottomSheet open onClose={onClose} backKey="cost-line"
      title={r.item_name || r.item_sku_code || t("บรรทัดตีราคา", "Cost line")}
      subtitle={`${r.group_name ?? ""}${index >= 0 ? ` · ${index + 1} / ${total}` : ""}`}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onDelete} aria-label={t("ลบบรรทัด", "Delete line")} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600"><Icon name="delete" /></button>
          {total > 1 && <button type="button" onClick={onNext} className="h-11 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700">{t("บรรทัดถัดไป", "Next line")} ›</button>}
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">{t("เสร็จ", "Done")}</button>
        </div>
      }>
      <div className="space-y-3">
        <button type="button" onClick={onChangeMaterial} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left active:bg-slate-50">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{r.item_name || r.item_sku_code || t("ยังไม่เลือกวัสดุ", "No material yet")}</span>
            <span className="block truncate text-[11px] text-slate-400">{methodText}{item?.price_per_unit != null ? ` · ${t("ราคาวัสดุ", "material price")} ฿${fmtN(item.price_per_unit, 4)} / ${item.uom ?? item.uom_default ?? ""}` : ""}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-blue-700">{t("เปลี่ยน", "Change")}</span>
        </button>

        {prev && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <div>{t("วัสดุเดิม:", "Previous material:")} {prev.item_name ?? "—"} {baht(prev.unit_price)} → {baht(r.unit_price)}</div>
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={() => onChange({ prev_item: null })} className="h-8 flex-1 rounded-lg border border-sky-300 bg-white font-medium">{t("รับทราบ", "Got it")}</button>
              <button type="button" onClick={() => onChange(restorePrevItem(prev))} className="h-8 flex-1 rounded-lg border border-sky-300 bg-white font-medium">{t("กลับของเดิม", "Restore")}</button>
            </div>
          </div>
        )}

        {r.shape && (
          <div className="flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <Icon name="info" className="mt-0.5 shrink-0" /> {t("ชิ้นนี้วาดรูปทรงไว้ — ขนาดคิดจากรูปทรง (แก้รูปทรงที่หน้าจอคอม)", "This piece has a drawn shape — size comes from the shape (edit it on desktop)")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {showW && <NumField label={t("กว้าง", "Width")} suffix={t("ซม.", "cm")} value={r.width_cm} onChange={(v) => onChange({ width_cm: v })} />}
          {showL && <NumField label={t("ยาว", "Length")} suffix={t("ซม.", "cm")} value={r.length_cm} onChange={(v) => onChange({ length_cm: v })} />}
          {showPcs && <NumField label={t("จำนวนชิ้น", "Pieces")} value={r.pieces} step={1} onChange={(v) => onChange({ pieces: v })} />}
          {showWaste && <NumField label={t("เผื่อเสีย", "Waste")} suffix="%" value={r.waste_percent} onChange={(v) => onChange({ waste_percent: v })} />}
          {!piece && m === "area_face" && <NumField label={t("หน้ากว้างผ้า", "Fabric width")} suffix={t("ซม.", "cm")} value={r.face_width_cm} onChange={(v) => onChange({ face_width_cm: v })} />}
          {manual && <NumField label={t("ปริมาณที่ใช้", "Quantity")} suffix={r.uom ?? ""} value={r.qty} onChange={(v) => onChange({ qty: v })} />}
          <NumField label={t("ราคา / หน่วย", "Price / unit")} suffix={`฿/${r.uom ?? ""}`} value={r.unit_price} onChange={(v) => onChange({ unit_price: v })} />
        </div>

        <label className="block">
          <span className="text-[11px] text-slate-500">{t("หมายเหตุ (เช่น ชิ้นไหน)", "Note (e.g. which piece)")}</span>
          <input value={r.note ?? ""} onChange={(e) => onChange({ note: e.target.value || null })} placeholder={t("ตัวกระเป๋า / สายสะพาย", "Body / strap")}
            className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <div><div className="text-[11px] text-slate-500">{t("ใช้", "Uses")}</div><div className="text-sm font-medium tabular-nums text-slate-800">{r.qty != null ? `${fmtN(r.qty, 4)} ${r.uom ?? ""}` : "—"}</div></div>
          <div className="text-right"><div className="text-[11px] text-slate-500">{t("เป็นเงิน", "Amount")}</div><div className={`text-lg font-semibold tabular-nums ${isZeroCostLine(r) ? "text-rose-600" : "text-slate-900"}`}>{baht(r.amount)}</div></div>
        </div>
      </div>
    </BottomSheet>
  );
}

// ───────────────────────── เลือกวัสดุตีราคา ─────────────────────────
function ItemPickSheet({ open, items, title, onPick, onClose }: {
  open: boolean; items: PriceItem[] | null; title: string; onPick: (it: PriceItem) => void; onClose: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState<string | null>(null);
  useEffect(() => { if (open) { setQ(""); setGrp(null); } }, [open]);
  const groupNames = useMemo(() => [...new Set((items ?? []).map((it) => it.group_name).filter((g): g is string => !!g))], [items]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((it) => (!grp || it.group_name === grp) && (!s || `${it.name} ${it.code ?? ""} ${it.group_name ?? ""}`.toLowerCase().includes(s)))
      .sort((a, b) => (b.used_lines ?? 0) - (a.used_lines ?? 0))
      .slice(0, 80);
  }, [items, q, grp]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title} backKey="cost-pick" maxHeight="92dvh">
      <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-white px-3 pb-2">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นชื่อวัสดุ / รหัส", "Search material / code")}
            className="h-10 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {groupNames.length > 1 && (
          <div className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none]">
            <button type="button" onClick={() => setGrp(null)} className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] ${grp == null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>{t("ทุกชนิด", "All types")}</button>
            {groupNames.map((g) => (
              <button key={g} type="button" onClick={() => setGrp(g)} className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] ${grp === g ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>{g}</button>
            ))}
          </div>
        )}
      </div>
      {items == null ? (
        <div className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลดวัสดุ…", "Loading materials…")}</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">{t("ไม่พบวัสดุ ลองเปลี่ยนคำค้น — เพิ่มวัสดุใหม่ได้ที่หน้าจอคอม", "No materials found. Try another search — add new materials on desktop")}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((it) => (
            <button key={it.id} type="button" onClick={() => onPick(it)} className="flex w-full items-center gap-2 py-2.5 text-left active:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800">{it.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{it.group_name ?? "—"}{it.code ? ` · ${it.code}` : ""}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-slate-600">{it.price_per_unit != null ? `฿${fmtN(it.price_per_unit, 4)}` : "—"}<span className="block text-slate-400">/{it.uom ?? it.uom_default ?? ""}</span></span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// ───────────────────────── แผ่นแก้ค่าใช้จ่ายเพิ่ม ─────────────────────────
function ExtraSheet({ extra: c, auto, onChange, onDelete, onClose }: {
  extra: SnapExtra; auto: boolean; onChange: (patch: Partial<SnapExtra>) => void; onDelete: () => void; onClose: () => void;
}) {
  const t = useT();
  const kind = extraKindOf(c);
  const kinds: { key: "labor" | "other"; label: string }[] = [
    { key: "labor", label: t("ค่าแรงผลิต", "Production labor") },
    { key: "other", label: t("ต้นทุนอื่น ๆ", "Other cost") },
  ];
  return (
    <BottomSheet open onClose={onClose} backKey="cost-extra" title={c.label || t("ค่าใช้จ่ายเพิ่ม", "Additional cost")}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onDelete} aria-label={t("ลบรายการ", "Delete item")} className="flex h-11 w-12 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600"><Icon name="delete" /></button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white">{t("เสร็จ", "Done")}</button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] text-slate-500">{t("ชื่อรายการ", "Item name")}</span>
          <input value={c.label} onChange={(e) => onChange({ label: e.target.value })} placeholder={t("ค่าเย็บ / ค่าสกรีน", "Sewing / screen print")}
            className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        {!auto && (kind === "labor" || kind === "other" || kind == null) && (
          <div className="flex gap-1.5">
            {kinds.map((k) => (
              <button key={k.key} type="button" onClick={() => onChange({ kind: k.key })}
                className={`h-8 rounded-full border px-3 text-xs ${kind === k.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>{k.label}</button>
            ))}
          </div>
        )}
        {auto ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <div className="text-lg font-semibold tabular-nums text-slate-900">{baht(c.amount || 0)}</div>
            {t("ระบบคิดให้อัตโนมัติจากบรรทัดวัสดุ / ราคากลาง — ปรับวิธีคิดที่หน้าจอคอม", "Calculated automatically from material lines / central prices — change the method on desktop")}
          </div>
        ) : c.mode === "split" ? (
          <>
            <NumField label={t("ยอดจ่ายครั้งเดียว (หารจำนวนสั่ง)", "One-time total (split by order qty)")} suffix="฿" value={c.total ?? 0} onChange={(v) => onChange({ total: v ?? 0 })} />
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {c.split_qty
                ? t(`หาร ${c.split_qty.toLocaleString("th-TH")} ใบ = ${baht(c.amount || 0)} / ใบ`, `÷ ${c.split_qty.toLocaleString("en-US")} units = ${baht(c.amount || 0)} / unit`)
                : t("ยังไม่ใส่จำนวนสั่ง (ใส่ที่หน้าจอคอม) — ตอนนี้ต่อใบ = 0", "No order qty yet (set it on desktop) — per unit = 0 for now")}
            </div>
          </>
        ) : (
          <NumField label={t("ต่อใบ", "Per unit")} suffix="฿" value={c.amount} onChange={(v) => onChange({ amount: v ?? 0 })} />
        )}
      </div>
    </BottomSheet>
  );
}
