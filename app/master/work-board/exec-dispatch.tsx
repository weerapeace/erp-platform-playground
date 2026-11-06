"use client";

/**
 * บอร์ดจ่ายงาน — มุมมอง "จ่ายงาน (โหมดผู้บริหาร)" (เจ้าของขอ 2026-11-04 · แทนมุมมองแคนวาสที่เอาออก)
 *   ข้างบน = งานรอจ่ายเต็มหน้า (การ์ดใหญ่ · ปรับขนาดการ์ด) · เรียงได้ · กรองแบรนด์ · เลือกเองว่าการ์ดโชว์อะไร · ป้ายเดดไลน์มุมการ์ด
 *     ราคาขาย/มูลค่า เฉพาะผู้บริหาร (ดึงจาก /api/mo/exec-plan?prices=1 ที่ล็อกสิทธิ์ไว้ · โหลดพลาด = ป้ายเตือน + ปุ่มโหลดใหม่ ไม่เงียบ) · ค่าแรง/ชิ้น = ราคากลางในสูตร (ไม่มี = ค่าแรงแผนของใบ ÷ จำนวน)
 *   ข้างล่าง = แถบโต๊ะติดขอบจอ (การ์ดแนวตั้ง: ชื่อโต๊ะ · รูปงาน · ใบ/ค้าง · คน · ค่าแรง) · ชี้เมาส์ค้าง (ไม่ต้องคลิก) = รายการงานที่ทำอยู่เลื่อนขึ้น
 *     กด = แผงเต็มเลื่อนขึ้น (ค่าแรงรวมทั้งโต๊ะ ทุกคนรวมกัน · แถบ "งานในมือเทียบเงินเดือนทั้งโต๊ะ" · การ์ดงานแนวตั้ง · จัดการโต๊ะ)
 *   เงิน (มูลค่า/ยอดเป้า) นับเฉพาะ "แบรนด์ลูกค้า" (brands.pricing_mode = oem) เป็นค่าเริ่มต้น · ติ๊ก "รวมเงินแบรนด์ตัวเอง" (จำต่อคน) = นับทุกแบรนด์
 *   ขวา = แผง "สรุปเป้า" (ผู้บริหาร) เลื่อนเข้า · ล็อกได้ = ติดจอตอนเลื่อน (ใต้แถบเมนูของแอป · measureShellTop) + ดันการ์ดให้แคบลง · เป้าเก็บกลาง ui_config admin_wb_exec_target
 *     ติ๊กการ์ด = "ถ้าจ่ายที่ติ๊กเพิ่ม" + "ขาดอีกหลังจ่ายที่ติ๊ก" + แถบสีอ่อนต่อท้ายแถบเป้า (เจ้าของ 2026-11-05)
 *   "โชว์แค่ที่เลือก" (เจ้าของ 2026-11-05 · แบบร่าง) = บอร์ดเหลือเฉพาะการ์ดที่ติ๊กไว้ตอนกด (ไม่สนตัวกรอง) ให้ใส่ช่างทีละใบ
 *     ใส่ช่างแล้ว = จำนวนที่ต้องจ่ายลดลง/หายจากรอจ่าย (นับได้ทุกทาง: ลาก · ป๊อปจ่ายด่วน · ป๊อปเต็ม) → การ์ดจาง + ติ๊กถูก · ครบทุกใบ = กลับหน้าปกติเอง
 *     ปุ่ม "กลับหน้าปกติ" ได้ทุกเมื่อ (ใบที่ยังไม่จ่ายกลับมาเป็นที่ติ๊ก) · ร่างจำในหน้าแม่ (draft/onDraft · useRef) สลับมุมมองแล้วกลับมายังอยู่ · รีเฟรช/ออกจากหน้า = หาย
 *   จ่าย = ลากการ์ดลงโต๊ะ (ติ๊กหลายใบ ลากใบไหนก็ไปทั้งชุด) หรือกดโต๊ะ → "จ่ายให้โต๊ะนี้" → ป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบ)
 *     เมาส์ = ลาก HTML5 · iPad/มือถือ = กดค้างแล้วลาก (ของกลาง components/touch-drag)
 *   ลากลงโต๊ะ = ป๊อปจ่ายด่วนตามชนิดโต๊ะ (exec-quick-dispatch): ปกติ = จำนวน · ช่างเหมา = เลือกช่าง 1 คน + จำนวน · จับกลุ่ม = เลือกหลายคน + จำนวน + ค่าแรงรวมกลุ่ม
 *   แผงโต๊ะช่างเหมา = สรุปรายช่าง "ใครมีงานอะไร" (ไม่มีแถบ) · แผงโต๊ะจับกลุ่ม = แยกตามกลุ่ม + ค่าแรงรวมแต่ละกลุ่ม · โต๊ะปกติ = แถบงานในมือเทียบเงินเดือน
 * ค่าที่จำต่อคน (useUserPref): ขนาดการ์ด · การเรียง · ช่องที่โชว์ · ล็อกแผงสรุป
 * โหมด iPad (เจ้าของ 2026-11-06 · จำต่อเครื่อง `wb_exec_device` ผ่านของกลาง useIpadMode): iPad จริงเปิดเอง · คอมกด "ดูแบบ iPad" = หน้าจริงในกรอบขนาดเครื่อง + QR
 *   แถบบนบรรทัดเดียว (ค้นหา + ปุ่มตัวกรอง → ป๊อปกลาง: เรียง/โชว์อะไร/พร้อมจ่าย/ขนาด/รวมเงินแบรนด์ตัวเอง/หน้าตา) · ชิปแบรนด์+ชุดแถวเดียวปัดได้
 *   แถบเป้าบรรทัดเดียว แตะ = แผงสรุปเต็มลอยทับ (แนวนอนขวา · แนวตั้งจากล่าง · ไม่ดันการ์ด) · ช่องติ๊ก/ปุ่มใหญ่ · ปุ่มเปิดรายละเอียดเห็นตลอด (ไม่ต้องชี้เมาส์)
 *   แถบโต๊ะเตี้ย แถวเดียวปัดได้ · ติ๊กแล้วมีปุ่ม "จ่าย N ใบ" ใต้ทุกโต๊ะ · แตะชื่อโต๊ะ = แผงโต๊ะเต็ม (ตัวเดิม)
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { bkkDate } from "@/lib/mo-sales-match";
import { useUserPref } from "@/lib/use-user-pref";
import { useTouchDrag } from "@/components/touch-drag";
import { MoneyInput } from "@/components/money-input";
import { deskKindOf } from "@/lib/work-entry-rules";
import { ExecQuickDispatch, type QuickRow } from "./exec-quick-dispatch";
import { useMoGroups } from "@/components/mo-group-picker";
import { MoStatusModal } from "@/components/mo-status-modal";
import type { SoldQty } from "@/app/api/mo/sold-qty/route";
import { MoLaborRateModal, type LaborRateMo } from "@/components/mo-labor-rate-modal";
import { measureShellTop } from "@/components/sticky-header";
import { IpadPreview, IpadPreviewSwitch, useIpadMode } from "@/components/device-view";
import { useCanHover } from "@/lib/use-can-hover";

export type ExecMo = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; remaining: number; due_date: string | null; internal_due_date?: string | null;
  image_url: string | null; ready: boolean; priority?: number; priority_note?: string | null;
  brand?: string | null; central_rate?: number; labor?: { prod_plan: number } | null;
  /** ขายไปแล้ว (ผูกใบขาย) — remaining หักส่วนนี้แล้ว (lib/mo-status remainingToDispatch) */
  sold?: number; bom_code?: string | null;
};
/** ใบที่ขายครบแล้วแต่ยังจ่ายช่างไม่ครบในระบบ (/api/mo/work-board sold_unmade) — ไม่ขึ้นการ์ด · ป้ายเตือนด้านบน */
export type SoldUnmade = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number; dispatched: number; sold: number };
export type ExecWo = {
  id: string; wo_no: string; mo_no: string; product_sku: string | null; department_id: string | null;
  assignee_name: string | null; qty: number; received_qty: number; status: string; image_url?: string | null;
  labor_cost?: number | null; central_rate?: number; created_at?: string | null;
  /** department = จ่ายให้ทั้งโต๊ะ · craftsman = ระบุคน (assignees[] = หลายคน) */
  assignee_type?: string | null; assignee_id?: string | null; assignees?: { id: string | null; name: string }[] | null;
};
type Desk = { id: string; name: string };
type Person = { id: string; name: string; nickname?: string | null; department_id?: string | null };
type SortKey = "urgent" | "value" | "labor" | "qty" | "sku";
type FieldKey = "price" | "value" | "labor" | "laborTotal" | "brand" | "name" | "due" | "ready";
type Period = "today" | "week" | "month";
type Target = Partial<Record<Period, number>>;
type Done = { count: number; qty: number; value: number; value_customer?: number; labor: number; labor_missing: number; no_price: number; no_date?: number };
/** โหมด "โชว์แค่ที่เลือก" — snap = การ์ดตอนกด (จำนวนที่ต้องจ่ายตอนนั้น ไว้เทียบว่าใส่ช่างแล้วหรือยัง) */
type ExecFocus = { snap: ExecMo[] };
/** ร่างที่เลือก (ที่ติ๊ก + โหมดโชว์แค่ที่เลือก) — หน้าแม่เก็บไว้ (useRef) ให้สลับมุมมองแล้วกลับมายังอยู่ · รีเฟรช/ออกจากหน้า = หาย */
export type ExecDraft = { sel: string[]; focus: ExecFocus | null };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const SIZE_MIN = 120, SIZE_MAX = 240;
const parseSize = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= SIZE_MIN && n <= SIZE_MAX ? n : null; };
const SORTS: { k: SortKey; label: string }[] = [
  { k: "urgent", label: "งานเร่ง → เดดไลน์" }, { k: "value", label: "มูลค่ามากสุด" }, { k: "labor", label: "ค่าแรงรวมมากสุด" },
  { k: "qty", label: "จำนวนมากสุด" }, { k: "sku", label: "รหัสสินค้า" },
];
const parseSort = (v: unknown): SortKey | null => (SORTS.some((s) => s.k === v) ? (v as SortKey) : null);
const FIELDS: { k: FieldKey; label: string; money?: boolean }[] = [
  { k: "price", label: "ราคาขาย/ชิ้น", money: true }, { k: "value", label: "มูลค่า", money: true }, { k: "labor", label: "ค่าแรง/ชิ้น" },
  { k: "laborTotal", label: "ค่าแรงรวม" }, { k: "brand", label: "แบรนด์" }, { k: "name", label: "ชื่อสินค้า" }, { k: "due", label: "เดดไลน์" }, { k: "ready", label: "ความพร้อม" },
];
const FIELDS_DEFAULT: FieldKey[] = ["price", "value", "labor", "laborTotal", "name", "due", "ready"];
const parseFields = (v: unknown): FieldKey[] | null => (Array.isArray(v) ? (v.filter((x) => FIELDS.some((f) => f.k === x)) as FieldKey[]) : null);
const parseBool = (v: unknown) => (typeof v === "boolean" ? v : null);
const PERIODS: { k: Period; label: string }[] = [{ k: "today", label: "วันนี้" }, { k: "week", label: "สัปดาห์นี้" }, { k: "month", label: "เดือนนี้" }];
const TARGET_KEY = "admin_wb_exec_target";

/** ช่วงวันที่ของช่วงที่เลือก (วันไทย) — สัปดาห์เริ่มวันจันทร์ */
function periodRange(p: Period): { from: string; to: string } {
  const to = bkkDate(new Date().toISOString());
  if (p === "today") return { from: to, to };
  if (p === "month") return { from: `${to.slice(0, 8)}01`, to };
  const d = new Date(`${to}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7;   // จันทร์ = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return { from: d.toISOString().slice(0, 10), to };
}
/** วันที่เหลือถึงเดดไลน์ (ติดลบ = เลยแล้ว) */
function daysLeft(due: string | null | undefined): number | null {
  if (!due) return null;
  const today = bkkDate(new Date().toISOString());
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
/** ค่าแรง/ชิ้นของใบรอจ่าย — ราคากลางในสูตรก่อน ไม่มี = ค่าแรงแผนของใบ ÷ จำนวน (สูตรเดียวกับบอร์ด) */
const rateOfMo = (m: ExecMo) => (m.central_rate && m.central_rate > 0 ? m.central_rate : m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0);
/** ค่าแรง/ชิ้นของใบจ่ายงาน — ค่าแรงที่ใส่ไว้ ÷ จำนวน ไม่มี = ราคากลาง */
const rateOfWo = (w: ExecWo) => (w.labor_cost != null && w.qty > 0 ? Number(w.labor_cost) / w.qty : w.central_rate && w.central_rate > 0 ? w.central_rate : 0);

export function ExecDispatchView({ pending, workOrders, desks, craftsmen, canDispatch, showPrice, onDispatch, onQuickDispatch, onOpenMO, onOpenWO, renderDeskManager, deskWages, soldUnmade = [], onSalesCatchUp, canSetLabor = false, onLaborSaved, draft, onDraft }: {
  pending: ExecMo[];
  workOrders: ExecWo[];
  desks: Desk[];
  craftsmen: Person[];
  canDispatch: boolean;
  /** ผู้บริหาร = เห็นราคาขาย/มูลค่า + แผงสรุปเป้า (แก้เป้าได้) */
  showPrice: boolean;
  /** เปิดป๊อปจ่ายงานเดิมของบอร์ด (ทีละใบตามลำดับ) */
  onDispatch: (mos: ExecMo[], desk: Desk) => void;
  /** ป๊อปจ่ายด่วน → บันทึกจริง (หน้าแม่ POST ใบจ่ายงานทีละใบ) · คืน id ใบสั่งผลิตที่จ่ายสำเร็จ (ใบที่พลาดค้างในป๊อปให้แก้แล้วกดใหม่ — ไม่จ่ายซ้ำใบที่สำเร็จแล้ว) */
  onQuickDispatch: (rows: QuickRow<ExecMo>[], desk: Desk, crewIds: string[]) => Promise<string[]>;
  onOpenMO: (mo: ExecMo) => void;
  onOpenWO: (woId: string) => void;
  /** แผงจัดการโต๊ะของกลาง (DeskStaffPanel) — หน้าแม่ส่งมา (สิทธิ์ + โหลดใหม่อยู่ที่หน้าแม่) */
  renderDeskManager?: (desk: Desk) => ReactNode;
  /** เงินเดือนรวมพนักงานต่อโต๊ะ/เดือน (payroll · /api/mo/assignees dept_wages) — แถบ "งานในมือเทียบเงินเดือนทั้งโต๊ะ" (โชว์เฉพาะผู้บริหาร) */
  deskWages?: Record<string, number>;
  /** ขายครบแล้วแต่ยังไม่บันทึกผลิต → ป้ายเตือน · กดแล้ว onSalesCatchUp เปิด "อัปเดตงานจากใบขาย" (ไม่มี = ไม่มีสิทธิ์ อ่านอย่างเดียว) */
  soldUnmade?: SoldUnmade[];
  onSalesCatchUp?: () => void;
  /** กด "ยังไม่ตั้งค่าแรง" ตั้งได้ (products.edit) · บันทึกแล้วให้หน้าแม่โหลดใหม่ */
  canSetLabor?: boolean;
  onLaborSaved?: () => void;
  /** ร่างที่เลือกจากครั้งก่อน (หน้าแม่จำไว้) · onDraft = แจ้งหน้าแม่ทุกครั้งที่เปลี่ยน */
  draft?: ExecDraft | null;
  onDraft?: (d: ExecDraft) => void;
}) {
  const toast = useToast();
  // โหมด iPad (จำต่อเครื่อง) — touch = หน้าตาแบบ iPad · framePreview = คอมเลือกดูแบบ iPad → โชว์หน้าจริงในกรอบแทน
  const ipad = useIpadMode("wb_exec_device");
  const touch = ipad.touch, portrait = ipad.portrait;
  const canHover = useCanHover();
  const [filterOpen, setFilterOpen] = useState(false);   // iPad: ป๊อปตัวกรอง (เรียง/โชว์อะไร/ขนาด …)
  const [laborMo, setLaborMo] = useState<LaborRateMo | null>(null);   // ป๊อปตั้งค่าแรง (ของกลาง MoLaborRateModal)
  const [size, setSize] = useUserPref<number>("wb_exec_card_size", 160, parseSize);
  const [sort, setSort] = useUserPref<SortKey>("wb_exec_sort", "urgent", parseSort);
  const [fields, setFields] = useUserPref<FieldKey[]>("wb_exec_fields", FIELDS_DEFAULT, parseFields);
  const [locked, setLocked] = useUserPref<boolean>("wb_exec_target_lock", false, parseBool);
  // เจ้าของ 2026-11-04: "แบรนด์ที่ไม่ใช่แบรนด์ลูกค้า อยากให้มีติ๊กว่าจะรวมจำนวนเงินด้วยไหม default เป็นไม่รวม"
  const [includeOwn, setIncludeOwn] = useUserPref<boolean>("wb_exec_include_own", false, parseBool);
  const [q, setQ] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [brand, setBrand] = useState<string>("");
  // ชุด (กลุ่มใบสั่งงาน mo_groups) — ป้ายบนการ์ด + กรอง · "" = ทุกชุด · "_none" = ไม่มีชุด (เจ้าของสั่ง 2026-11-05)
  const [grp, setGrp] = useState<string>("");
  const { groups: moGroups } = useMoGroups(true);
  const groupOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const g of moGroups ?? []) for (const no of g.mo_nos ?? []) if (!m.has(no)) m.set(no, { id: g.id, name: g.name });
    return m;
  }, [moGroups]);
  // ใบขายที่ผูก (เลขบิล) ไว้โชว์ตอนชี้ป้าย "ขายไปแล้ว" — ตัวเลขขายแล้ว/เหลือทำ มากับ pending (m.sold · m.remaining)
  const [sold, setSold] = useState<SoldQty>({});
  const pendingIds = useMemo(() => pending.map((m) => m.id).sort().join(","), [pending]);
  useEffect(() => {
    const ids = pendingIds ? pendingIds.split(",") : [];
    if (!ids.length) { setSold({}); return; }
    let off = false;
    void (async () => {
      const out: SoldQty = {};
      for (let i = 0; i < ids.length; i += 150) {
        try {
          const j = await apiFetch(`/api/mo/sold-qty?ids=${ids.slice(i, i + 150).join(",")}`).then((r) => r.json());
          Object.assign(out, (j.data ?? {}) as SoldQty);
        } catch { /* ไม่มีป้ายขายแล้วก็ยังจ่ายงานได้ปกติ */ }
      }
      if (!off) setSold(out);
    })();
    return () => { off = true; };
  }, [pendingIds]);
  const [statusMo, setStatusMo] = useState<string | null>(null);   // ป๊อปสถานะวัตถุดิบ (ของกลาง MoStatusModal view="materials")
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set(draft?.sel ?? []));
  const [focus, setFocus] = useState<ExecFocus | null>(() => draft?.focus ?? null);
  useEffect(() => { onDraft?.({ sel: [...sel], focus }); }, [sel, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openDesk, setOpenDesk] = useState<string | null>(null);
  const [overDesk, setOverDesk] = useState<string | null>(null);
  const [manageDesk, setManageDesk] = useState<Desk | null>(null);
  const [price, setPrice] = useState<Map<string, number>>(new Map());
  const [customer, setCustomer] = useState<Set<string>>(new Set());   // mo_no ของแบรนด์ลูกค้า (OEM)
  // แผงสรุปเป้า
  const [sideOpen, setSideOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [target, setTarget] = useState<Target>({});
  const [targetDraft, setTargetDraft] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const show = (k: FieldKey) => fields.includes(k) && (showPrice || !FIELDS.find((f) => f.k === k)?.money);
  // iPad: ล็อกแผงไม่มีผล (แผงลอยทับเสมอ · เปิดจากแถบเป้า) — ค่าล็อกของจอคอมยังจำไว้เหมือนเดิม
  const sideShown = showPrice && (sideOpen || (locked && !touch));

  // ราคาขาย/ชิ้น (skus_v2.list_price) — API ผู้บริหารล็อกสิทธิ์ admin.users · ใช้โหมดเบา ?prices=1
  //   เคยเงียบเป็น "ไม่มีราคา" ตอน DB หนาแน่น (2026-11-04) → ตอนนี้: เซิร์ฟเวอร์ยิงซ้ำเอง + ที่นี่ลองอีกรอบ + ยังพลาด = ป้ายเตือน/ปุ่มโหลดใหม่
  const [priceErr, setPriceErr] = useState<"" | "partial" | "error">("");
  const [priceTick, setPriceTick] = useState(0);
  const pendingSig = pending.length;
  useEffect(() => {
    if (!showPrice) return;
    let cancel = false, timer: number | null = null;
    const run = async (attempt: number) => {
      try {
        const r = await apiFetch("/api/mo/exec-plan?prices=1");
        const j = await r.json();
        if (cancel) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดราคาไม่สำเร็จ");
        setPrice(new Map(Object.entries((j.prices ?? {}) as Record<string, number>).map(([k, v]) => [k, Number(v) || 0])));
        setCustomer(new Set((j.customer ?? []) as string[]));
        if (j.partial && attempt < 1) { timer = window.setTimeout(() => void run(attempt + 1), 1500); return; }
        setPriceErr(j.partial ? "partial" : "");
      } catch {
        if (cancel) return;
        if (attempt < 1) timer = window.setTimeout(() => void run(attempt + 1), 1500);
        else setPriceErr("error");
      }
    };
    void run(0);
    return () => { cancel = true; if (timer != null) window.clearTimeout(timer); };
  }, [showPrice, priceTick, pendingSig]);
  // เป้ากลาง (ใช้ร่วมทั้งทีม)
  useEffect(() => {
    if (!showPrice) return;
    let cancel = false;
    apiFetch(`/api/ui-config?key=${TARGET_KEY}`).then((r) => r.json()).then((j) => { if (!cancel) setTarget(((j.value ?? {}) as Target)); }).catch(() => {});
    return () => { cancel = true; };
  }, [showPrice]);
  // ยอดที่จ่ายไปแล้วในช่วงที่เลือก (โหลดเมื่อแผงเปิด / เปลี่ยนช่วง / จ่ายงานเพิ่ม)
  const woSig = workOrders.length;
  const needDone = sideShown || (touch && showPrice);   // iPad มีแถบเป้าบรรทัดเดียวโชว์ตลอด
  useEffect(() => {
    if (!needDone) return;
    let cancel = false;
    const { from, to } = periodRange(period);
    apiFetch(`/api/mo/exec-plan?dispatched=1&from=${from}&to=${to}`).then((r) => r.json()).then((j) => { if (!cancel && j.data) setDone(j.data as Done); }).catch(() => {});
    return () => { cancel = true; };
  }, [needDone, period, woSig]);
  useEffect(() => { setTargetDraft(target[period] ? String(target[period]) : ""); }, [target, period]);
  const saveTarget = async () => {
    const v = Math.max(0, Number(targetDraft) || 0);
    if (v === (target[period] ?? 0)) return;
    const next = { ...target, [period]: v };
    setSavingTarget(true);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: TARGET_KEY, value: next }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ตั้งเป้าได้เฉพาะแอดมิน" : (j.error || "บันทึกเป้าไม่สำเร็จ"));
      setTarget(next);
      toast.success(`ตั้งเป้า${PERIODS.find((p) => p.k === period)?.label} ฿${fmt(v)} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกเป้าไม่สำเร็จ"); }
    finally { setSavingTarget(false); }
  };

  const brands = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of pending) if (x.remaining > 0) { const b = x.brand?.trim() || "ไม่มีแบรนด์"; m.set(b, (m.get(b) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pending]);
  /** ใบนี้นับเข้ายอดเงินไหม — แบรนด์ลูกค้าเสมอ · แบรนด์ตัวเอง/ไม่มีแบรนด์ เฉพาะตอนติ๊ก "รวมเงินแบรนด์ตัวเอง" */
  const counted = (moNo: string) => includeOwn || customer.has(moNo);
  const valueOf = (m: ExecMo) => (counted(m.mo_no) ? (price.get(m.mo_no) ?? 0) * m.remaining : 0);
  const laborOf = (m: ExecMo) => rateOfMo(m) * m.remaining;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dueOf = (m: ExecMo) => m.internal_due_date ?? m.due_date ?? "9999-12-31";
    return pending.filter((m) => m.remaining > 0 && (!readyOnly || m.ready) && (!brand || (m.brand?.trim() || "ไม่มีแบรนด์") === brand)
      && (!grp || (grp === "_none" ? !groupOf.has(m.mo_no) : groupOf.get(m.mo_no)?.id === grp))
      && (!s || `${m.mo_no} ${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.brand ?? ""} ${groupOf.get(m.mo_no)?.name ?? ""}`.toLowerCase().includes(s)))
      .sort((a, b) => sort === "value" ? valueOf(b) - valueOf(a)
        : sort === "labor" ? laborOf(b) - laborOf(a)
        : sort === "qty" ? b.remaining - a.remaining
        : sort === "sku" ? (a.product_sku ?? a.mo_no).localeCompare(b.product_sku ?? b.mo_no)
        : (b.priority ?? 0) - (a.priority ?? 0) || dueOf(a).localeCompare(dueOf(b)));
  }, [pending, q, readyOnly, brand, grp, groupOf, sort, price, customer, includeOwn]); // eslint-disable-line react-hooks/exhaustive-deps
  // ปุ่มกรองชุด — นับจากการ์ดที่ยังต้องจ่าย
  const groupChips = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    let none = 0;
    for (const mo of pending) {
      if (!(mo.remaining > 0)) continue;
      const g = groupOf.get(mo.mo_no);
      if (!g) { none++; continue; }
      const x = m.get(g.id) ?? { ...g, n: 0 }; x.n++; m.set(g.id, x);
    }
    return { list: [...m.values()].sort((a, b) => b.n - a.n), none };
  }, [pending, groupOf]);
  const total = list.reduce((a, m) => a + valueOf(m), 0);
  // โหมด "โชว์แค่ที่เลือก" — การ์ดจาก snap (ไม่สนตัวกรอง) · ใส่ช่างแล้ว = หายจากรอจ่าย หรือจำนวนที่ต้องจ่ายลดลงจากตอนกด
  const focusCards = useMemo(() => {
    if (!focus) return null;
    const byId = new Map(pending.map((p) => [p.id, p]));
    return focus.snap.map((s) => {
      const cur = byId.get(s.id), left = cur ? Math.max(0, cur.remaining) : 0;
      const done = left <= 0 || left < s.remaining;
      return { m: done || !cur ? s : cur, done, left };
    });
  }, [focus, pending]);
  const live = focusCards ? focusCards.filter((x) => !x.done).map((x) => x.m) : list;   // การ์ดที่ยังจ่ายได้ (ติ๊ก/ลาก/จ่ายโต๊ะนี้)
  const cards = focusCards ?? list.map((m) => ({ m, done: false, left: m.remaining }));
  const chosen = live.filter((m) => sel.has(m.id));
  const chosenValue = chosen.reduce((a, m) => a + valueOf(m), 0);
  // แผงสรุปเป้า: โหมดโชว์แค่ที่เลือก = ที่เหลือในชุด · ปกติ = ที่ติ๊ก
  const planned = focusCards ? live : chosen;
  const plannedValue = planned.reduce((a, m) => a + valueOf(m), 0);
  const focusDone = focusCards ? focusCards.filter((x) => x.done).length : 0;
  const enterFocus = () => { if (!chosen.length) return; setFocus({ snap: chosen.map((m) => ({ ...m })) }); setSel(new Set()); };
  const exitFocus = () => { setSel(new Set(live.map((m) => m.id))); setFocus(null); };
  // ใส่ช่างครบทุกใบ → กลับหน้าปกติเอง
  useEffect(() => {
    if (!focusCards?.length || focusCards.some((x) => !x.done)) return;
    setFocus(null);
    toast.success(`ใส่ช่างครบ ${focusCards.length} ใบแล้ว — กลับหน้าปกติ`);
  }, [focusCards]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const openWos = useMemo(() => workOrders.filter((w) => w.status !== "done" && w.status !== "cancelled"), [workOrders]);
  // สรุปต่อโต๊ะ (ใช้ทั้งการ์ดโต๊ะ · รายการตอนชี้ · แผงเต็ม)
  const deskStats = useMemo(() => {
    const m = new Map<string, { ws: ExecWo[]; left: number; labor: number; ppl: Person[] }>();
    for (const d of desks) {
      const ws = openWos.filter((w) => w.department_id === d.id);
      m.set(d.id, {
        ws, left: ws.reduce((a, w) => a + Math.max(0, w.qty - (w.received_qty || 0)), 0),
        labor: ws.reduce((a, w) => a + rateOfWo(w) * w.qty, 0),
        ppl: craftsmen.filter((c) => c.department_id === d.id),
      });
    }
    return m;
  }, [desks, openWos, craftsmen]);
  const statOf = (id: string) => deskStats.get(id) ?? { ws: [] as ExecWo[], left: 0, labor: 0, ppl: [] as Person[] };
  const nick = (p: Person) => p.nickname?.trim() || p.name;

  // ชี้เมาส์ค้างที่โต๊ะ (ไม่ต้องคลิก) → รายการงานที่ทำอยู่เลื่อนขึ้น · ขยับเข้าแผงได้ (หน่วงตอนออก) · นิ้ว/iPad ไม่ใช้ (กดเปิดแผงเต็มแทน)
  const dockRef = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<number | null>(null);
  const [peek, setPeek] = useState<{ id: string; left: number; maxH: number } | null>(null);
  const [peekOn, setPeekOn] = useState(false);
  const clearPeekTimer = () => { if (peekTimer.current != null) { window.clearTimeout(peekTimer.current); peekTimer.current = null; } };
  const peekIn = (id: string, el: HTMLElement) => {
    clearPeekTimer();
    peekTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect(), b = dockRef.current?.getBoundingClientRect();
      if (!b) return;
      const W = 300;
      setPeek({ id, left: Math.max(8, Math.min(b.width - W - 8, r.left + r.width / 2 - b.left - W / 2)), maxH: Math.max(200, Math.round(b.top - 16)) });
      requestAnimationFrame(() => setPeekOn(true));
    }, 220);
  };
  const peekOut = () => { clearPeekTimer(); peekTimer.current = window.setTimeout(() => setPeekOn(false), 180); };
  useEffect(() => () => clearPeekTimer(), []);
  // แผงเต็มสูงได้เท่าที่เหลือเหนือแถบโต๊ะ (แถบอาจไม่ได้ติดขอบล่างตอนงานน้อย) → เกินก็เลื่อนในแผง ไม่ล้นหัวจอ
  const [sheetMax, setSheetMax] = useState<number | null>(null);
  useEffect(() => {
    if (!openDesk) return;
    const fit = () => { const t = dockRef.current?.getBoundingClientRect().top; if (t != null) setSheetMax(Math.max(240, Math.round(t - 12))); };
    fit();
    window.addEventListener("resize", fit); window.addEventListener("scroll", fit, true);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit, true); };
  }, [openDesk]);
  // ลากลงโต๊ะ / "จ่ายให้โต๊ะนี้" → ป๊อปจ่ายด่วนตามชนิดโต๊ะ · จ่ายสำเร็จ → ใบที่จ่ายหลุดจากที่ติ๊ก (ลากใบที่ไม่ได้ติ๊ก = ที่ติ๊กไว้ยังอยู่)
  const [quick, setQuick] = useState<{ desk: Desk; mos: ExecMo[] } | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const give = (desk: Desk, ids: string[]) => {
    const mos = live.filter((m) => ids.includes(m.id));
    if (!mos.length || !canDispatch) return;
    setQuick({ desk, mos });
  };
  const submitQuick = async (rows: QuickRow<ExecMo>[], crewIds: string[]) => {
    if (!quick) return;
    setQuickSaving(true);
    try {
      const okIds = new Set(await onQuickDispatch(rows, quick.desk, crewIds));
      if (okIds.size) setSel((p) => { const n = new Set(p); for (const id of okIds) n.delete(id); return n; });
      const rest = quick.mos.filter((m) => !okIds.has(m.id));
      setQuick(rest.length ? { desk: quick.desk, mos: rest } : null);
    } finally { setQuickSaving(false); }
  };
  // ลากด้วยนิ้ว (iPad) — กดค้างการ์ดแล้วลากไปวางที่โต๊ะ (โต๊ะมี data-drop-id)
  const td = useTouchDrag<string>({ onDrop: (deskId, id) => { const d = desks.find((x) => x.id === deskId); if (d) give(d, sel.has(id) ? chosen.map((m) => m.id) : [id]); } });
  const deskOpen = desks.find((d) => d.id === openDesk) ?? null;
  // การ์ดใบจ่ายงานแนวตั้ง (แผงโต๊ะ)
  const woCard = (w: ExecWo) => {
    const r = rateOfWo(w), pp = price.get(w.mo_no) ?? 0, pr = w.qty > 0 ? Math.min(100, ((w.received_qty || 0) / w.qty) * 100) : 0;
    return (
      <button key={w.id} type="button" onClick={() => onOpenWO(w.id)} className="flex flex-col rounded-xl border border-slate-200 bg-white p-2 text-left hover:border-violet-300 hover:shadow-sm">
        <div className="mb-1.5 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-xl text-slate-300">
          {w.image_url ? <img src={w.image_url} alt="" draggable={false} className="h-full w-full object-contain" /> : <Icon name="image" />}
        </div>
        <div className="truncate font-mono text-[12px] font-semibold text-slate-800">{w.product_sku ?? w.mo_no}</div>
        <div className="truncate text-[11px] text-slate-400">{w.assignee_type === "department" || !w.assignee_name ? "ทั้งโต๊ะ" : w.assignee_name}</div>
        <div className="my-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pr >= 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pr}%` }} /></div>
        <div className="text-[11px] text-slate-600">รับคืน {fmt(w.received_qty || 0)}/{fmt(w.qty)}</div>
        <div className="text-[11px]">{r > 0 ? <span className="text-slate-500">฿{fmt(r)}/ชิ้น</span> : <span className="text-amber-600">ยังไม่ใส่ค่าแรง</span>}</div>
        {r > 0 && <div className="text-[12px] font-bold tabular-nums text-slate-800">ค่าแรง ฿{fmt(r * w.qty)}</div>}
        {showPrice && pp > 0 && <div className={`text-[11px] tabular-nums ${counted(w.mo_no) ? "text-violet-700" : "text-slate-400"}`}>฿{fmt(pp * w.qty)}{counted(w.mo_no) ? "" : " · ไม่นับ"}</div>}
        <div className="mt-auto truncate pt-0.5 text-[10px] text-slate-300">{w.wo_no}</div>
      </button>
    );
  };
  // จัดกลุ่มใบจ่ายงานตามชุดคนรับ (ช่างเหมา = รายช่าง · จับกลุ่ม = รายกลุ่ม) · ชื่อ = ชื่อเล่นจากรายชื่อพนักงาน
  const nickById = useMemo(() => new Map(craftsmen.map((c) => [c.id, c.nickname?.trim() || c.name])), [craftsmen]);
  const shortName = (id: string | null | undefined, name: string) => (id && nickById.get(id)) || name.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() || name.trim();
  const crewGroups = (ws: ExecWo[]) => {
    const m = new Map<string, { key: string; names: string[]; desk: boolean; ws: ExecWo[]; qty: number; left: number; labor: number; noRate: number }>();
    for (const w of ws) {
      const list = (w.assignees ?? []).filter((a) => a && (a.id || a.name?.trim()));
      const ppl = list.length ? list.map((a) => ({ id: a.id, name: a.name }))
        : w.assignee_type !== "department" && (w.assignee_id || w.assignee_name?.trim()) ? [{ id: w.assignee_id ?? null, name: w.assignee_name ?? "" }] : [];
      const key = ppl.length ? ppl.map((p) => p.id ?? p.name.trim()).sort().join("|") : "__desk__";
      let g = m.get(key);
      if (!g) { g = { key, names: ppl.map((p) => shortName(p.id, p.name)), desk: !ppl.length, ws: [], qty: 0, left: 0, labor: 0, noRate: 0 }; m.set(key, g); }
      const r = rateOfWo(w);
      g.ws.push(w); g.qty += w.qty; g.left += Math.max(0, w.qty - (w.received_qty || 0)); g.labor += r * w.qty; if (r <= 0) g.noRate++;
    }
    return [...m.values()].sort((a, b) => Number(a.desk) - Number(b.desk) || b.labor - a.labor || b.ws.length - a.ws.length);
  };
  const goal = target[period] ?? 0, got = (includeOwn ? done?.value : done?.value_customer ?? done?.value) ?? 0, pct = goal > 0 ? Math.min(100, (got / goal) * 100) : 0;
  const after = got + plannedValue, pctAfter = goal > 0 ? Math.min(100, (after / goal) * 100) : 0;

  // ล็อกแผง = ติดจอตอนเลื่อน ใต้แถบเมนูของแอป (ของกลาง measureShellTop) · อยู่ในกรอบที่เลื่อนเอง (ขยายเต็มจอ) = ติดขอบกรอบ
  const rootRef = useRef<HTMLDivElement>(null);
  const pinned = locked && sideShown && !touch;
  const [stickTop, setStickTop] = useState(8);
  // iPad แนวนอน: แผงสรุปลอยทับชิดขวา ใต้แถบเมนูของแอป
  const [touchTop, setTouchTop] = useState(0);
  useEffect(() => { if (touch && sideShown) setTouchTop(measureShellTop()); }, [touch, sideShown]);
  useEffect(() => {
    if (!pinned) return;
    const measure = () => {
      let inBox = false;
      for (let p = rootRef.current?.parentElement; p && p !== document.body; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll") { inBox = true; break; }
      }
      const t = (inBox ? 0 : measureShellTop()) + 8;
      setStickTop((x) => (x === t ? x : t));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pinned]);

  const dueBadge = (m: ExecMo) => {
    const d = daysLeft(m.internal_due_date ?? m.due_date);
    if (d == null) return null;
    const cls = d < 0 ? "bg-rose-600 text-white" : d <= 3 ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-600";
    return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow-sm ${cls}`}>{d < 0 ? `เลย ${-d} วัน` : d === 0 ? "วันนี้" : `อีก ${d} วัน`}</span>;
  };

  // คอมเลือก "ดูแบบ iPad" → หน้าจริงในกรอบขนาดเครื่อง (หน้าในกรอบอ่าน wb_exec_device เดียวกัน → เรนเดอร์แบบ iPad) + QR เปิดบน iPad
  if (ipad.framePreview) {
    const openUrl = `${window.location.origin}/master/work-board?view=deskdock`;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">ดูแบบ iPad ของจริง — หน้าจริงขนาดเท่าเครื่อง กดใช้งานในกรอบได้เลย · สแกน QR เพื่อเปิดบน iPad (จำไว้ที่เครื่องนี้)</p>
          <IpadPreviewSwitch view={ipad.view} onChange={ipad.setView} />
        </div>
        <IpadPreview view={ipad.view === "ipadP" ? "ipadP" : "ipadL"} src="/master/work-board?view=deskdock" qr={{ openUrl }} />
      </div>
    );
  }

  const priceErrEl = showPrice && priceErr ? (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-800">
      <Icon name="warning" /> ราคาขาย{priceErr === "partial" ? "บางใบ" : ""}โหลดไม่สำเร็จ{touch ? "" : " (ระบบหนาแน่นชั่วคราว)"}
      <button type="button" onClick={() => { setPriceErr(""); setPriceTick((t) => t + 1); }} className={`inline-flex items-center gap-1 font-semibold text-amber-900 underline ${touch ? "min-h-9" : ""}`}><Icon name="refresh" /> โหลดใหม่</button>
    </span>
  ) : null;
  const sortList = SORTS.filter((s) => showPrice || s.k !== "value");
  // ชิปแบรนด์ / ชุด — จอคอม = แถวละชุด ขึ้นบรรทัดใหม่ได้ · iPad = รวมแถวเดียว ปัดซ้าย-ขวา (ปุ่มสูง 36px)
  const chipCls = (on: boolean, tone: "violet" | "teal") =>
    `${touch ? "h-9 shrink-0 whitespace-nowrap px-3 text-[13px]" : "h-7 px-2.5 text-[12px]"} inline-flex items-center gap-1 rounded-full border ${on
      ? (tone === "violet" ? "border-violet-600 bg-violet-600 text-white" : "border-teal-700 bg-teal-700 text-white")
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const brandChips = brands.length > 1 ? [
    <button key="b:" type="button" onClick={() => setBrand("")} className={chipCls(!brand, "violet")}>ทุกแบรนด์ {brands.reduce((a, b) => a + b[1], 0)}</button>,
    ...brands.map(([b, n]) => <button key={`b:${b}`} type="button" onClick={() => setBrand(brand === b ? "" : b)} className={chipCls(brand === b, "violet")}>{b} {n}</button>),
  ] : [];
  const groupChipEls = groupChips.list.length > 0 ? [
    <button key="g:" type="button" onClick={() => setGrp("")} className={chipCls(!grp, "teal")}>ทุกชุด</button>,
    ...groupChips.list.map((g) => <button key={`g:${g.id}`} type="button" onClick={() => setGrp(grp === g.id ? "" : g.id)} className={chipCls(grp === g.id, "teal")}><Icon name="folders" /> {g.name} {g.n}</button>),
    ...(groupChips.none > 0 ? [<button key="g:_none" type="button" onClick={() => setGrp(grp === "_none" ? "" : "_none")} className={chipCls(grp === "_none", "teal")}>ไม่มีชุด {groupChips.none}</button>] : []),
  ] : [];
  const filterCount = (readyOnly ? 1 : 0) + (sort !== "urgent" ? 1 : 0);
  const cardMin = touch ? Math.max(size, 160) : size;   // iPad: การ์ดไม่เล็กกว่า 160px (ปุ่มใหญ่ขึ้น ต้องมีที่)

  return (
    <div ref={rootRef} className="relative flex min-h-[calc(100vh-180px)] flex-col overflow-x-clip">
      <div className="flex flex-1 flex-col transition-[margin] duration-300 ease-out" style={{ marginRight: pinned ? 296 : 0 }}>
        {touch ? (
          // iPad: แถบบนบรรทัดเดียว — ค้นหา + ตัวกรอง (ที่เหลืออยู่ในป๊อป)
          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 text-base font-semibold text-slate-800">งานรอจ่าย <span className="font-normal text-slate-500">{list.length}</span></span>
            {priceErrEl}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสสินค้า / ชื่อ / เลขใบ" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-[15px]" />
            <button type="button" onClick={() => setFilterOpen(true)} className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm ${filterCount ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-700"}`}>
              <Icon name="sliders" /> ตัวกรอง{filterCount ? ` (${filterCount})` : ""}
            </button>
          </div>
        ) : (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-slate-800">งานรอจ่าย</span>
          <span className="text-sm text-slate-500">{list.length} ใบ{showPrice && total > 0 ? ` · มูลค่า ฿${fmt(total)}${includeOwn ? "" : " (เฉพาะแบรนด์ลูกค้า)"}` : ""}</span>
          {showPrice && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">เห็นราคาขาย (ผู้บริหาร)</span>}
          {showPrice && (
            <label title="ค่าเริ่มต้น = นับเงินเฉพาะแบรนด์ลูกค้า (OEM) · ติ๊ก = นับแบรนด์ตัวเอง/ไม่มีแบรนด์ด้วย (มูลค่า · ที่เลือก · งานที่โต๊ะถือ · สรุปเป้า) · ตั้งแบรนด์ลูกค้าที่ ⚙️ ตั้งค่าแบรนด์ ในมุมมองแผนผู้บริหาร"
              className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] ${includeOwn ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              <input type="checkbox" checked={includeOwn} onChange={(e) => setIncludeOwn(e.target.checked)} className="accent-violet-600" /> รวมเงินแบรนด์ตัวเอง
            </label>
          )}
          {priceErrEl}
          <div className="flex-1" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัสสินค้า / ชื่อ / เลขใบ" className="h-8 w-52 rounded-lg border border-slate-200 px-2 text-sm" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px]" title="เรียงการ์ด">
            {sortList.map((s) => <option key={s.k} value={s.k}>เรียง: {s.label}</option>)}
          </select>
          <button type="button" onClick={() => setFieldsOpen((v) => !v)} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] ${fieldsOpen ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="sliders" /> โชว์อะไรบ้าง</button>
          <button type="button" onClick={() => setReadyOnly((v) => !v)} className={`h-8 rounded-full border px-3 text-[12px] ${readyOnly ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>พร้อมจ่ายเท่านั้น</button>
          <label className="inline-flex items-center gap-2 text-[12px] text-slate-500">ขนาด
            <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" />
          </label>
          {showPrice && <button type="button" onClick={() => (locked ? undefined : setSideOpen((v) => !v))} className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium ${sideShown ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 bg-white text-violet-700 hover:bg-violet-50"}`}><Icon name="target" /> สรุปเป้า</button>}
          {ipad.canPreview && <button type="button" onClick={() => ipad.setView("ipadL")} title="ดูหน้านี้แบบ iPad ของจริง (ปุ่มใหญ่ · แถบเตี้ย) + QR เปิดบน iPad"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon value="i:device-mobile" size={14} className="rotate-90" /> ดูแบบ iPad</button>}
        </div>
        )}

        {fieldsOpen && !touch && (
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]">
            <span className="text-[12px] text-slate-400">การ์ดโชว์:</span>
            {FIELDS.filter((f) => showPrice || !f.money).map((f) => (
              <label key={f.k} className="inline-flex items-center gap-1.5 text-slate-700">
                <input type="checkbox" checked={fields.includes(f.k)} onChange={(e) => setFields(e.target.checked ? [...fields, f.k] : fields.filter((x) => x !== f.k))} /> {f.label}
              </label>
            ))}
            <button type="button" onClick={() => setFields(FIELDS_DEFAULT)} className="ml-auto text-[12px] text-slate-500 underline">ค่าเริ่มต้น</button>
          </div>
        )}

        {!focusCards && (touch ? (
          (brandChips.length > 0 || groupChipEls.length > 0) && (
            <div className="-mx-1 mb-2 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {brandChips}
              {brandChips.length > 0 && groupChipEls.length > 0 && <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden />}
              {groupChipEls}
            </div>
          )
        ) : <>
          {brandChips.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{brandChips}</div>}
          {groupChipEls.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">ชุด:</span>
              {groupChipEls}
            </div>
          )}
        </>)}

        {/* iPad: แถบเป้าบรรทัดเดียว — แตะ = แผงสรุปเต็มลอยทับ (แทนปุ่ม "สรุปเป้า" + การล็อกแผงของจอคอม) */}
        {touch && showPrice && (
          <button type="button" onClick={() => setSideOpen(true)} className="mb-2 w-full rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-left">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-700">
              <Icon name="target" />
              <span>เป้า{PERIODS.find((p) => p.k === period)?.label} <b className="tabular-nums text-violet-800">฿{fmt(got)}</b>{goal > 0 ? <> / ฿{fmt(goal)} · <b className="tabular-nums">{pct.toFixed(0)}%</b></> : <span className="text-slate-400"> · ยังไม่ได้ตั้งเป้า</span>}</span>
              {goal > 0 && plannedValue > 0 && <span className="text-violet-700">→ {pctAfter.toFixed(0)}% ถ้าจ่าย{focusCards ? "ที่เหลือในชุด" : "ที่ติ๊ก"}</span>}
              <span className="ml-auto text-[12px] text-slate-400">แตะดูเต็ม ›</span>
            </div>
            {goal > 0 && (
              <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white">
                {plannedValue > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-violet-200 transition-[width] duration-500" style={{ width: `${pctAfter}%` }} />}
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            )}
          </button>
        )}

        {/* ขายครบแล้วแต่ยังไม่บันทึกผลิต — ไม่ขึ้นการ์ด (ไม่ต้องจ่ายแล้ว) · กด → "อัปเดตงานจากใบขาย" บันทึกว่าใครทำ → ระบบปิดงานเอง (lib/mo-auto-close) */}
        {soldUnmade.length > 0 && (
          <div className="mb-2">
            <button type="button" disabled={!onSalesCatchUp} onClick={() => onSalesCatchUp?.()}
              title={soldUnmade.map((s) => `${s.product_sku ?? ""} · ${s.mo_no} — ขาย ${fmt(s.sold)}/${fmt(s.qty)} · จ่ายช่างในระบบ ${fmt(s.dispatched)}`).join("\n")}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[12px] text-amber-800 enabled:hover:bg-amber-100 disabled:cursor-default">
              <Icon name="warning" /> ขายครบแล้ว แต่ยังไม่บันทึกผลิต <b>{soldUnmade.length}</b> ใบ{onSalesCatchUp ? " ›" : ""}
            </button>
          </div>
        )}

        {/* โหมดโชว์แค่ที่เลือก — แถบบอกความคืบหน้า + กลับหน้าปกติได้ทุกเมื่อ */}
        {focusCards && (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-900">
            <Icon name="view" /> <b>โชว์แค่ที่เลือก</b>
            <span>· ใส่ช่างแล้ว <b className="tabular-nums">{focusDone}/{focusCards.length}</b> ใบ</span>
            <span className="text-[12px] text-violet-600">— ลากการ์ดลงโต๊ะทีละใบ หรือติ๊กแล้วกด &ldquo;จ่ายโต๊ะนี้&rdquo; · ครบแล้วกลับหน้าปกติเอง</span>
            <div className="flex-1" />
            <button type="button" onClick={exitFocus} className="inline-flex h-8 items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 text-[12px] font-medium text-violet-700 hover:bg-violet-100"><Icon name="back" /> กลับหน้าปกติ</button>
          </div>
        )}

        {chosen.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-1.5 text-sm text-violet-800">
            <span>เลือก <b>{chosen.length}</b> ใบ{showPrice ? ` · ฿${fmt(chosenValue)}` : ""} — {touch ? <>แตะ &ldquo;จ่าย&rdquo; ที่โต๊ะด้านล่าง หรือกดค้างการ์ดแล้วลากลงโต๊ะ</> : <>กดปุ่ม &ldquo;จ่ายโต๊ะนี้&rdquo; ที่ลอยบนโต๊ะด้านล่าง หรือลากการ์ดใบไหนก็ได้ลงโต๊ะ</>}</span>
            {!focusCards && <button type="button" onClick={enterFocus} title="บอร์ดเหลือเฉพาะการ์ดที่เลือกไว้ ใส่ช่างทีละใบได้ง่าย (ใส่ครบแล้วกลับหน้าปกติเอง)"
              className={`inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white font-medium text-violet-700 hover:bg-violet-100 ${touch ? "h-9 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]"}`}><Icon name="view" /> โชว์แค่ที่เลือก</button>}
            <button type="button" onClick={() => setSel(new Set())} className={`text-violet-600 underline ${touch ? "min-h-9 px-1 text-[13px]" : "text-[12px]"}`}>ล้างที่เลือก</button>
          </div>
        )}

        {!cards.length ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-sm text-slate-400">{q || readyOnly || brand || grp ? "ไม่พบงานตามที่ค้น / กรอง" : "ไม่มีงานรอจ่าย"}</div>
        ) : (
          <div className="grid flex-1 content-start gap-2.5 pb-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMin}px, 1fr))` }}>
            {cards.map(({ m, done: paid, left }) => {
              const on = !paid && sel.has(m.id), p = price.get(m.mo_no) ?? 0, rate = rateOfMo(m);
              const g = groupOf.get(m.mo_no), sq = sold[m.id], soldN = m.sold ?? 0, drag = canDispatch && !paid;
              return (
                <div key={m.id} draggable={drag}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "move"; }}
                  {...(drag ? td.bind(m.id, <span className="flex items-center gap-2 text-sm"><Icon name="truck" /><b className="font-mono">{m.product_sku ?? m.mo_no}</b>{sel.has(m.id) && chosen.length > 1 ? <span className="text-violet-700">+{chosen.length - 1} ใบ</span> : null}</span>) : {})}
                  onClick={() => { if (paid || td.justDragged()) return; toggle(m.id); }}
                  className={`group relative select-none rounded-xl border bg-white p-2 transition-shadow ${paid ? "cursor-default border-emerald-200 opacity-60" : "cursor-pointer hover:shadow-md"} ${on ? "border-violet-500 ring-2 ring-violet-300" : paid ? "" : "border-slate-200"}`}>
                  {paid
                    ? <span className={`absolute left-2 top-2 z-10 inline-flex items-center justify-center rounded-full bg-emerald-500 text-white ${touch ? "h-6 w-6 text-[14px]" : "h-5 w-5 text-[12px]"}`} aria-label="ใส่ช่างแล้ว"><Icon name="done" /></span>
                    : <input type="checkbox" checked={on} readOnly className={`absolute left-2 top-2 z-10 accent-violet-600 ${touch ? "h-6 w-6" : "h-4 w-4"}`} aria-label={`เลือก ${m.product_sku ?? m.mo_no}`} />}
                  <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
                    {show("due") && dueBadge(m)}
                    {(m.priority ?? 0) > 0 && <span title={m.priority_note ?? undefined} className={`rounded px-1.5 text-[11px] font-semibold ${m.priority === 2 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{m.priority === 2 ? "เร่งด่วน" : "สำคัญ"}</span>}
                  </div>
                  <div className="mb-1.5 flex items-center justify-center overflow-hidden rounded-lg bg-slate-50" style={{ height: Math.round(cardMin * 0.55) }}>
                    {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-contain" draggable={false} /> : <Icon name="image" />}
                  </div>
                  <div className="truncate font-mono text-[13px] font-semibold text-slate-800">{m.product_sku ?? m.mo_no}</div>
                  {/* ชุด — แยกการ์ดรหัสเดียวกันคนละรอบ (เช่น ก.ย. / ต.ค.) */}
                  {g && (
                    <div className="mt-0.5 min-w-0">
                      <span title={`ชุด ${g.name} · ${m.mo_no}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-800">
                        <Icon name="folders" /><span className="truncate">{g.name}</span>
                      </span>
                    </div>
                  )}
                  {show("brand") && m.brand && <div className="truncate text-[11px] font-medium text-violet-600">{m.brand}</div>}
                  {show("name") && <div className="truncate text-[11px] text-slate-400">{m.product_name ?? ""}</div>}
                  <div className="mt-0.5 text-[12px] text-slate-600">จ่าย <b className="text-slate-800">{fmt(m.remaining)}</b>{m.remaining !== m.qty ? ` / ${fmt(m.qty)}` : ""} ชิ้น{show("price") && p > 0 ? ` · ฿${fmt(p)}` : ""}</div>
                  {paid && <div className="mt-0.5 text-[12px] font-semibold text-emerald-700">ใส่ช่างแล้ว{left > 0 ? ` · เหลืออีก ${fmt(left)} ชิ้น` : ""}</div>}
                  {show("value") && p > 0 && (counted(m.mo_no)
                    ? <div className="text-sm font-bold tabular-nums text-violet-700">฿{fmt(p * m.remaining)}</div>
                    : <div className="text-[12px] tabular-nums text-slate-400" title="แบรนด์ตัวเอง — ไม่นับเข้ายอดเงิน (ติ๊ก &quot;รวมเงินแบรนด์ตัวเอง&quot; เพื่อนับ)">฿{fmt(p * m.remaining)} · ไม่นับ</div>)}
                  {(show("labor") || show("laborTotal")) && (
                    <div className="text-[11px] text-slate-500">{rate > 0 ? <>
                      {show("labor") && <>ค่าแรง ฿{fmt(rate)}/ชิ้น</>}{show("labor") && show("laborTotal") ? " · " : ""}{show("laborTotal") && <b className="text-slate-700">รวม ฿{fmt(rate * m.remaining)}</b>}
                    </> : canSetLabor
                      ? <button type="button" title="กดเพื่อตั้งค่าแรงผลิต/ชิ้น"
                          onClick={(e) => { e.stopPropagation(); setLaborMo({ id: m.id, mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name, qty: m.qty, bom_code: m.bom_code ?? null }); }}
                          className={`text-amber-600 underline decoration-dotted underline-offset-2 hover:text-amber-700 ${touch ? "inline-flex min-h-9 items-center text-[12px]" : ""}`}>ยังไม่ตั้งค่าแรง ›</button>
                      : <span className="text-amber-600">ยังไม่ตั้งค่าแรง</span>}</div>
                  )}
                  {/* ขายไปแล้ว (ผูกใบขาย) = ทำเสร็จแล้ว → "จ่าย" ด้านบนหักส่วนนี้แล้ว · ขายครบ = ไม่ขึ้นการ์ด (ป้ายเตือนด้านบน) */}
                  {soldN > 0 && (
                    <div className="mt-0.5" title={sq?.bills.length ? `ผูกใบขาย ${sq.bills.join(", ")}` : undefined}>
                      {/* iPad ชี้ดูไม่ได้ → แตะป้าย = บอกเลขบิลที่ผูก */}
                      {touch && sq?.bills.length
                        ? <button type="button" onClick={(e) => { e.stopPropagation(); toast.info(`${m.product_sku ?? m.mo_no} ผูกใบขาย ${sq.bills.join(", ")}`); }}
                            className="inline-block max-w-full truncate rounded bg-emerald-50 px-1.5 py-1 text-left text-[12px] text-emerald-700">ขายไปแล้ว {fmt(soldN)} · เหลือทำ {fmt(m.remaining)} ›</button>
                        : <span className="inline-block max-w-full truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                            ขายไปแล้ว {fmt(soldN)} · เหลือทำ {fmt(m.remaining)}
                          </span>}
                    </div>
                  )}
                  {/* ปุ่มวัตถุดิบ (ป๊อปกลาง MoStatusModal view="materials" = สถานะวัตถุดิบทุกตัว ที่ยังไม่พร้อมอยู่บน) · ความพร้อมกดดูได้ */}
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setStatusMo(m.id); }} title="ดูสถานะวัตถุดิบทุกตัว (ที่ยังไม่พร้อมอยู่บนสุด)"
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 ${touch ? "h-9 px-2.5 text-[13px]" : "h-6 px-1.5 text-[11px]"}`}>
                      <Icon name="package" /> วัตถุดิบ
                    </button>
                    {show("ready") && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setStatusMo(m.id); }} title="ดูสถานะวัตถุดิบทุกตัว (ที่ยังไม่พร้อมอยู่บนสุด)"
                        className={`text-right hover:underline ${touch ? "min-h-9 px-1 text-[12px]" : "text-[11px]"} ${m.ready ? "font-medium text-emerald-600" : "text-amber-600"}`}>{m.ready ? "พร้อม" : "ยังไม่พร้อม ›"}</button>
                    )}
                  </div>
                  {/* เปิดรายละเอียด/เช็กลิสต์ — จอคอมโผล่ตอนชี้ · iPad/จอสัมผัส = เห็นตลอด (เดิมแตะไม่เจอ) */}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpenMO(m); }} title="ดูรายละเอียด / เช็กลิสต์" aria-label="ดูรายละเอียด / เช็กลิสต์"
                    className={`absolute z-10 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm hover:text-violet-700 ${touch ? "left-1.5 top-10 flex h-9 w-9 border border-slate-200" : `left-1.5 top-8 h-6 w-6 ${canHover ? "hidden group-hover:flex" : "flex"}`}`}><Icon name="open" /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* แถบโต๊ะ (ติดขอบล่าง · การ์ดแนวตั้ง) + รายการตอนชี้ค้าง + แผงเต็มเลื่อนขึ้น */}
        <div ref={dockRef} className="sticky bottom-0 z-20 -mx-1 mt-auto">
          {/* ชี้เมาส์ค้างที่โต๊ะ (ไม่ต้องคลิก) = รายการงานที่ทำอยู่เลื่อนขึ้น */}
          {peek && (() => {
            const d = desks.find((x) => x.id === peek.id);
            if (!d) return null;
            const st = statOf(d.id), vis = peekOn && openDesk == null;
            return (
              <div onPointerEnter={(e) => { if (e.pointerType === "mouse") clearPeekTimer(); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") peekOut(); }}
                style={{ left: peek.left, width: 300, maxHeight: peek.maxH }}
                className={`absolute bottom-full z-30 mb-2 flex flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.14)] backdrop-blur transition-all duration-200 ease-out ${vis ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold text-slate-800">{d.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-500">{st.ws.length} ใบ · ค้าง {fmt(st.left)} ชิ้น</span>
                </div>
                {st.labor > 0 && <div className="mb-1.5 text-[11px] text-slate-500">ค่าแรงรวมทั้งโต๊ะ <b className="tabular-nums text-slate-800">฿{fmt(st.labor)}</b>{st.ppl.length ? ` · ${st.ppl.length} คน` : ""}</div>}
                <div className="max-h-[46vh] min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                  {st.ws.map((w) => {
                    const pr = w.qty > 0 ? Math.min(100, ((w.received_qty || 0) / w.qty) * 100) : 0;
                    return (
                      <button key={w.id} type="button" onClick={() => onOpenWO(w.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-violet-50">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-slate-300">{w.image_url ? <img src={w.image_url} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon name="image" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] font-semibold text-slate-800">{w.product_sku ?? w.mo_no}</span>
                          <span className="block truncate text-[10px] text-slate-400">{w.assignee_type === "department" || !w.assignee_name ? "ทั้งโต๊ะ" : w.assignee_name}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[11px] tabular-nums text-slate-600">{fmt(w.received_qty || 0)}/{fmt(w.qty)}</span>
                          <span className="mt-0.5 block h-1 w-12 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${pr >= 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pr}%` }} /></span>
                        </span>
                      </button>
                    );
                  })}
                  {!st.ws.length && <div className="py-3 text-center text-[12px] text-slate-400">ยังไม่มีงานในโต๊ะนี้</div>}
                </div>
                <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-center text-[10px] text-slate-400">กดที่โต๊ะ = เปิดแผงเต็ม (ค่าแรงรายคน · จ่ายงาน · จัดการโต๊ะ)</div>
              </div>
            );
          })()}
          <div style={{ maxHeight: sheetMax ?? undefined }} className={`absolute inset-x-2 bottom-full origin-bottom overflow-y-auto rounded-t-2xl border border-b-0 border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur transition-all duration-300 ease-out ${deskOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}>
            {deskOpen && (() => {
              const { ws, ppl, left, labor: laborPlan } = statOf(deskOpen.id);
              const laborGot = ws.reduce((a, w) => a + rateOfWo(w) * (w.received_qty || 0), 0);
              const held = ws.reduce((a, w) => a + (counted(w.mo_no) ? (price.get(w.mo_no) ?? 0) : 0) * Math.max(0, w.qty - (w.received_qty || 0)), 0);
              const noRate = ws.filter((w) => rateOfWo(w) <= 0).length;
              // แถบค่าแรง (เจ้าของ: "มี bar progress ค่าแรงด้วยว่างานที่มีใกล้ค่าแรงรวมทั้งโต๊ะรึยัง")
              //   งานในมือ (ค่าแรงตามแผนของทุกใบในโต๊ะ) เทียบเงินเดือนรวมคนทั้งโต๊ะ/เดือน — แนวเดียวกับ "คน ฿ / งาน ฿ / ต่าง" ในแผนจ่ายงาน
              //   เงินเดือน = ข้อมูลอ่อนไหว → โชว์เฉพาะผู้บริหาร · โต๊ะไม่มีเงินเดือน (ช่างเหมา) = แถบรับคืนเทียบงานในมือ
              const wages = showPrice ? (deskWages?.[deskOpen.id] ?? 0) : 0;
              const scale = Math.max(wages, laborPlan, 1);
              const gotPct = Math.min(100, (laborGot / scale) * 100), planPct = Math.min(100, (laborPlan / scale) * 100), wagePct = wages > 0 ? Math.min(100, (wages / scale) * 100) : 0;
              const cover = wages > 0 ? (laborPlan / wages) * 100 : 0;
              // ช่างเหมา = สรุปรายช่าง · จับกลุ่ม = แยกตามกลุ่ม (ชุดคนเดียวกัน = กลุ่มเดียวกัน) · ปกติ = การ์ดรวม
              const kind = deskKindOf(deskOpen.name);
              const crews = kind === "normal" ? [] : crewGroups(ws);
              const chipNames = kind === "normal" ? ppl.map(nick) : [...new Set(crews.flatMap((g) => g.names))];
              return (
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-slate-800">{deskOpen.name}</span>
                    <span className="text-sm text-slate-500">{kind === "normal" ? `${ppl.length} คน` : `${chipNames.length} คนมีงาน`} · {ws.length} ใบ · ค้าง {fmt(left)} ชิ้น</span>
                    <div className="flex-1" />
                    {renderDeskManager && <button type="button" onClick={() => setManageDesk(deskOpen)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="settings" /> จัดการโต๊ะ</button>}
                    {canDispatch && <button type="button" disabled={!chosen.length} onClick={() => give(deskOpen, chosen.map((m) => m.id))}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
                      <Icon name="truck" /> จ่ายให้โต๊ะนี้{chosen.length ? ` (${chosen.length} ใบ)` : ""}</button>}
                    <button type="button" onClick={() => setOpenDesk(null)} aria-label="ปิดแผง" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="back" /></button>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {showPrice && (
                      <div className="rounded-lg bg-violet-50 px-3 py-2">
                        <div className="text-[11px] text-violet-600">มูลค่างานที่ถือ</div>
                        <div className="text-lg font-bold tabular-nums text-violet-800">฿{fmt(held)}</div>
                        <div className="text-[11px] text-violet-500">{includeOwn ? "ทุกแบรนด์" : "เฉพาะแบรนด์ลูกค้า"}</div>
                      </div>
                    )}
                    <div className="rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                      <div className="text-[11px] text-slate-500">ค่าแรงรวมทั้งโต๊ะ ({kind === "hire" ? "ทุกช่าง" : kind === "group" ? "ทุกกลุ่ม" : "ทุกคน"})</div>
                      <div className="text-lg font-bold tabular-nums text-slate-800">฿{fmt(laborPlan)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {chipNames.length ? chipNames.map((n) => <span key={n} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">{n}</span>)
                          : <span className="text-[11px] text-slate-400">{kind === "normal" ? "— ไม่มีคนประจำ (เลือกคนอื่นได้ในป๊อปจ่ายงาน) —" : "— ยังไม่มีใครมีงาน —"}</span>}
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <div className="text-[11px] text-emerald-600">ค่าแรงที่ได้แล้ว (รับคืน)</div>
                      <div className="text-lg font-bold tabular-nums text-emerald-800">฿{fmt(laborGot)}</div>
                      {noRate > 0 && <div className="text-[11px] text-amber-600">ยังไม่ใส่ค่าแรง {noRate} ใบ</div>}
                    </div>
                  </div>
                  {kind === "normal" && <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                      <span className="font-semibold text-slate-700">{wages > 0 ? "งานในมือเทียบเงินเดือนทั้งโต๊ะ" : "ค่าแรงที่ได้แล้วเทียบงานในมือ"}</span>
                      {wages > 0 ? <>
                        <span className="text-slate-500">งานในมือ <b className="tabular-nums text-violet-700">฿{fmt(laborPlan)}</b> / เงินเดือนรวม {ppl.length} คน <b className="tabular-nums text-slate-800">฿{fmt(wages)}</b>/เดือน</span>
                        <b className={`ml-auto tabular-nums ${cover >= 100 ? "text-emerald-600" : cover >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                          {cover.toFixed(0)}% · {cover >= 100 ? `งานพอแล้ว (เกิน ฿${fmt(laborPlan - wages)})` : `ขาดอีก ฿${fmt(wages - laborPlan)}`}
                        </b>
                      </> : <span className="text-slate-500">รับคืนแล้ว ฿{fmt(laborGot)} จาก ฿{fmt(laborPlan)}{showPrice ? " · โต๊ะนี้ยังไม่มีเงินเดือนในระบบ" : ""}</span>}
                    </div>
                    <div className="relative h-3.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-violet-300 transition-[width] duration-500" style={{ width: `${planPct}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${gotPct}%` }} />
                      {wages > 0 && <div className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `calc(${wagePct}% - 2px)` }} title={`เงินเดือนรวม ฿${fmt(wages)}/เดือน`} />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />รับคืนแล้ว ฿{fmt(laborGot)}</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300 align-middle" />งานในมือ ฿{fmt(laborPlan)}</span>
                      {wages > 0 && <span><span className="mr-1 inline-block h-2.5 w-0.5 bg-slate-800 align-middle" />เงินเดือนรวม/เดือน</span>}
                      {noRate > 0 && <span className="text-amber-600">มี {noRate} ใบยังไม่ใส่ค่าแรง — งานในมือจริงสูงกว่านี้</span>}
                    </div>
                  </div>}
                  {kind !== "normal" && crews.map((g) => (
                    <div key={g.key} className="mb-3">
                      <div className={`mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5 text-[13px] ${kind === "group" ? "bg-violet-50 text-violet-900" : "bg-slate-50 text-slate-800"}`}>
                        <b>{g.desk ? "ทั้งโต๊ะ (ไม่ระบุคน)" : kind === "group" ? `กลุ่ม ${g.names.join(" + ")}` : g.names.join(", ")}</b>
                        {kind === "group" && !g.desk && <span className="text-[11px] opacity-70">{g.names.length} คน</span>}
                        <span className="text-[12px] opacity-75">{g.ws.length} ใบ · {fmt(g.qty)} ชิ้น · ค้าง {fmt(g.left)}</span>
                        <span className="ml-auto tabular-nums">
                          {g.labor > 0 ? <>{kind === "group" ? "ค่าแรงรวมกลุ่ม " : "ค่าแรง "}<b>฿{fmt(g.labor)}</b>{kind === "group" && !g.desk && g.names.length > 1 ? <span className="text-[11px] opacity-75"> · ตกคนละ ≈ ฿{fmt(g.labor / g.names.length)}</span> : null}</> : null}
                          {g.noRate > 0 && <span className="ml-1.5 text-[11px] text-amber-600">ยังไม่ใส่ค่าแรง {g.noRate} ใบ</span>}
                        </span>
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>{g.ws.map(woCard)}</div>
                    </div>
                  ))}
                  {kind === "normal" && <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
                    {ws.map(woCard)}
                    {!ws.length && <div className="text-sm text-slate-400">ยังไม่มีงานในโต๊ะนี้</div>}
                  </div>}
                  {kind !== "normal" && !ws.length && <div className="text-sm text-slate-400">ยังไม่มีงานในโต๊ะนี้</div>}
                </div>
              );
            })()}

          </div>
          <div className={touch
            ? "flex items-stretch gap-2 overflow-x-auto rounded-t-xl border border-slate-200 bg-white/95 px-2 py-2 backdrop-blur [scrollbar-width:none]"
            : "flex items-end justify-center gap-2.5 overflow-x-auto rounded-t-xl border border-slate-200 bg-white/95 px-3 pb-2.5 pt-4 backdrop-blur"}>
            {desks.map((d) => {
              const st = statOf(d.id), lifted = overDesk === d.id || td.overId === d.id, on = openDesk === d.id;
              const imgs = st.ws.filter((w) => w.image_url).slice(0, 3);
              const pick = canDispatch && chosen.length > 0;   // ติ๊กการ์ดไว้ → ปุ่มลอย "จ่ายโต๊ะนี้" บนทุกโต๊ะ (เจ้าของ 2026-11-05)
              // ที่วางการ์ด (ลากเมาส์ HTML5 · iPad กดค้างแล้วลากผ่าน data-drop-id ของ touch-drag)
              const drop = {
                "data-drop-id": d.id,
                onDragOver: (e: DragEvent) => { if (!canDispatch) return; e.preventDefault(); setOverDesk(d.id); },
                onDragLeave: () => setOverDesk((x) => (x === d.id ? null : x)),
                onDrop: (e: DragEvent) => { e.preventDefault(); setOverDesk(null); const id = e.dataTransfer.getData("text/plain"); give(d, sel.has(id) ? chosen.map((m) => m.id) : [id]); },
              };
              // iPad: โต๊ะเตี้ย แถวเดียวปัดได้ (ชื่อ + ใบ/ค้าง) · ติ๊กแล้วมีปุ่ม "จ่าย N ใบ" ใต้ชื่อ · แตะชื่อ = แผงโต๊ะเต็ม
              if (touch) return (
                <div key={d.id} className={`flex w-[132px] shrink-0 flex-col gap-1.5 rounded-xl border p-1.5 transition-colors ${lifted ? "border-violet-500 bg-violet-50" : on ? "border-violet-500 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
                  <button type="button" {...drop} onClick={() => setOpenDesk(on ? null : d.id)} className="min-h-11 rounded-lg px-1.5 py-1 text-left">
                    <div className="truncate text-[14px] font-bold leading-tight text-slate-800">{d.name}</div>
                    <div className="truncate text-[12px] text-slate-500">{st.ws.length ? `${fmt(st.ws.length)} ใบ · ค้าง ${fmt(st.left)}` : "ว่าง"}</div>
                  </button>
                  {pick && (
                    <button type="button" onClick={() => give(d, chosen.map((m) => m.id))} className="h-10 rounded-lg bg-violet-600 text-[14px] font-medium text-white active:bg-violet-700">
                      จ่าย {chosen.length} ใบ
                    </button>
                  )}
                </div>
              );
              return (
                <div key={d.id} className="flex shrink-0 flex-col items-center gap-1.5">
                {pick && (
                  <button type="button" onClick={() => give(d, chosen.map((m) => m.id))} title={`จ่าย ${chosen.length} ใบที่เลือกให้ ${d.name}`}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-violet-700">
                    จ่ายโต๊ะนี้ {chosen.length} ใบ <span aria-hidden className="inline-block animate-bounce">↓</span>
                  </button>
                )}
                <button type="button" {...drop} onClick={() => { clearPeekTimer(); setPeekOn(false); setOpenDesk(on ? null : d.id); }}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") peekIn(d.id, e.currentTarget); }}
                  onPointerLeave={(e) => { if (e.pointerType === "mouse") peekOut(); }}
                  className={`flex h-[150px] w-[112px] shrink-0 flex-col rounded-2xl border p-2 text-left transition-all duration-200 ease-out hover:-translate-y-2 hover:scale-[1.04] hover:border-violet-300 hover:shadow-md ${lifted ? "-translate-y-2 scale-[1.06] border-violet-500 bg-violet-50 shadow-md" : on ? "border-violet-500 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
                  <div className="line-clamp-2 text-[13px] font-bold leading-tight text-slate-800">{d.name}</div>
                  <div className="mt-1.5 flex h-9 items-center">
                    {imgs.length ? (
                      <div className="flex -space-x-3">{imgs.map((w) => <img key={w.id} src={w.image_url ?? ""} alt="" draggable={false} className="h-8 w-8 rounded-lg bg-white object-cover ring-2 ring-white" />)}</div>
                    ) : <span className="text-lg text-slate-300"><Icon name="image" /></span>}
                    {imgs.length > 0 && st.ws.length > imgs.length && <span className="ml-1 text-[10px] text-slate-400">+{st.ws.length - imgs.length}</span>}
                  </div>
                  <div className="mt-auto space-y-0.5 text-[11px] leading-tight">
                    {st.ws.length ? <div className="text-slate-600"><b className="text-slate-800">{st.ws.length}</b> ใบ · ค้าง {fmt(st.left)}</div> : <div className="text-slate-400">ว่าง</div>}
                    <div className="flex items-center gap-1 text-slate-500"><Icon name="users" /> {st.ppl.length} คน</div>
                    {st.labor > 0 && <div className="truncate font-bold tabular-nums text-violet-700">฿{fmt(st.labor)}</div>}
                  </div>
                </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* แผงสรุปเป้า (ผู้บริหาร) — เลื่อนเข้าจากขวา · ล็อก = ติดขวาแล้วดันการ์ด */}
      {/* iPad: แตะนอกแผงสรุป = ปิด */}
      {showPrice && touch && sideShown && <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={() => setSideOpen(false)} aria-hidden />}
      {showPrice && (
        <aside style={touch && !portrait ? { top: touchTop } : undefined}
          className={touch
            // iPad: ลอยทับ ไม่ดันการ์ด — แนวนอนชิดขวา (ใต้แถบเมนูแอป) · แนวตั้งเลื่อนขึ้นจากล่าง
            ? (portrait
              ? `fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${sideShown ? "translate-y-0" : "pointer-events-none translate-y-[105%]"}`
              : `fixed bottom-0 right-0 z-40 w-[340px] overflow-y-auto overscroll-contain border-l border-slate-200 bg-white p-4 shadow-[-8px_0_24px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${sideShown ? "translate-x-0" : "pointer-events-none translate-x-[105%]"}`)
            : `absolute bottom-0 right-0 top-0 z-30 w-[288px] border-l border-slate-200 bg-white p-4 shadow-[-8px_0_24px_rgba(15,23,42,0.06)] transition-transform duration-300 ease-out ${sideShown ? "translate-x-0" : "pointer-events-none translate-x-[105%]"}`}>
          {/* ล็อก = ติดจอตอนเลื่อน (ใต้แถบเมนู) · เนื้อหายาวกว่าจอ = เลื่อนในแผง · ไม่ล็อก = ลอยทับการ์ด เลื่อนไปกับหน้า */}
          <div className={pinned ? "sticky overflow-y-auto overscroll-contain" : ""} style={pinned ? { top: stickTop, maxHeight: `calc(100vh - ${stickTop + 8}px)` } : undefined}>
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-800">สรุปเป้ายอด</span>
              {!touch && <button type="button" onClick={() => { setLocked(!locked); if (locked) setSideOpen(true); }} title={locked ? "ปลดล็อก (แผงลอยทับการ์ด · เลื่อนไปกับหน้า)" : "ล็อกแผงไว้ (ติดจอตอนเลื่อน · ดันการ์ดให้แคบลง ไม่บัง)"}
                className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border ${locked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Icon name={locked ? "lock" : "unlock"} /></button>}
              {/* iPad ปิดแผงไม่แตะค่าล็อกของจอคอม */}
              <button type="button" onClick={() => { setSideOpen(false); if (!touch) setLocked(false); }} aria-label="ปิดแผงสรุปเป้า"
                className={`inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 ${touch ? "ml-auto h-10 w-10" : "h-8 w-8"}`}><Icon name="cancel" /></button>
            </div>
            <div className="mb-3 flex gap-1">
              {PERIODS.map((p) => <button key={p.k} type="button" onClick={() => setPeriod(p.k)} className={`flex-1 rounded-full border ${touch ? "h-10 text-[14px]" : "h-7 text-[12px]"} ${period === p.k ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{p.label}</button>)}
            </div>
            <div className="text-[12px] text-slate-500">ยอดที่ต้องการ (มูลค่าขาย · ใช้ร่วมกันทั้งทีม)</div>
            <div className="mt-1 flex gap-1.5">
              <MoneyInput value={targetDraft} onChange={setTargetDraft} onKeyDown={(e) => { if (e.key === "Enter") void saveTarget(); }}
                placeholder="เช่น 3,000,000" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums" />
              {(() => {
                const dirty = (Number(targetDraft) || 0) !== (target[period] ?? 0);
                return <button type="button" onClick={() => void saveTarget()} disabled={!dirty || savingTarget}
                  className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium ${dirty ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                  <Icon name={dirty ? "save" : "done"} /> {savingTarget ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>;
              })()}
            </div>
            <div className="mt-4 text-[12px] text-slate-500">จ่ายงานแล้ว{PERIODS.find((p) => p.k === period)?.label} <span className="text-slate-400">· {includeOwn ? "ทุกแบรนด์" : "เฉพาะแบรนด์ลูกค้า"}</span></div>
            <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-3xl font-extrabold tabular-nums text-transparent">฿{fmt(got)}</div>
            {/* แถบเป้า: เข้ม = จ่ายแล้ว · สีอ่อนต่อท้าย = ถ้าจ่ายที่ติ๊ก */}
            <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
              {plannedValue > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-violet-200 transition-[width] duration-500" style={{ width: `${pctAfter}%` }} />}
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[12px] text-slate-500">{goal > 0 ? <>{pct.toFixed(0)}% ของเป้า ฿{fmt(goal)}{plannedValue > 0 && <span className="text-violet-600"> → {pctAfter.toFixed(0)}% ถ้าจ่าย{focusCards ? "ที่เหลือในชุด" : "ที่ติ๊ก"}</span>}</> : "ยังไม่ได้ตั้งเป้า"}</div>
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-500">ขาดอีก</span><b className={`tabular-nums ${goal > got ? "text-rose-600" : "text-emerald-600"}`}>{goal > 0 ? (goal > got ? `฿${fmt(goal - got)}` : "ถึงเป้าแล้ว") : "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">ค่าแรงของงานที่จ่าย</span><b className="tabular-nums text-slate-800">฿{fmt(done?.labor ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">จ่ายไป</span><span className="tabular-nums text-slate-700">{fmt(done?.count ?? 0)} ใบ · {fmt(done?.qty ?? 0)} ชิ้น</span></div>
              {planned.length > 0 && <div className="flex justify-between gap-2"><span className="text-slate-500">{focusCards ? `ถ้าจ่ายที่เหลือในชุด (${planned.length} ใบ)` : "ถ้าจ่ายที่ติ๊กเพิ่ม"}</span><b className="shrink-0 tabular-nums text-emerald-600">+฿{fmt(plannedValue)}{goal > 0 ? ` → ${pctAfter.toFixed(0)}%` : ""}</b></div>}
              {planned.length > 0 && goal > 0 && (
                <div className="-mx-1.5 flex justify-between gap-2 rounded-md bg-rose-50 px-1.5 py-1">
                  <span className="text-rose-700">{focusCards ? "ขาดอีกหลังจ่ายครบชุด" : "ขาดอีกหลังจ่ายที่ติ๊ก"}</span>
                  <b className={`shrink-0 tabular-nums ${goal > after ? "text-rose-600" : "text-emerald-600"}`}>{goal > after ? `฿${fmt(goal - after)}` : `ถึงเป้าแล้ว${after > goal ? ` (เกิน ฿${fmt(after - goal)})` : ""}`}</b>
                </div>
              )}
              {(done?.labor_missing ?? 0) > 0 && <div className="text-[11px] text-amber-600">มี {done?.labor_missing} ใบที่ยังไม่ใส่ค่าแรง — ยอดค่าแรงยังต่ำกว่าจริง</div>}
              {(done?.no_price ?? 0) > 0 && <div className="text-[11px] text-amber-600">มี {done?.no_price} ใบที่สินค้ายังไม่ตั้งราคาขาย — ไม่ถูกนับในยอด</div>}
              {(done?.no_date ?? 0) > 0 && <div className="text-[11px] text-slate-400">{done?.no_date} ใบไม่ได้ระบุวันจ่าย — นับตามวันที่บันทึกใบ</div>}
            </div>
          </div>
        </aside>
      )}

      {td.ghost}

      {/* ป๊อปจ่ายด่วนตามชนิดโต๊ะ (ปกติ / ช่างเหมา / จับกลุ่ม) */}
      <ExecQuickDispatch desk={quick?.desk ?? null} mos={quick?.mos ?? []} people={craftsmen} desks={desks} workOrders={workOrders} rateOf={rateOfMo}
        saving={quickSaving} onClose={() => setQuick(null)} onSubmit={(rows, crewIds) => void submitQuick(rows, crewIds)}
        onFull={(mos) => { const d = quick?.desk; setQuick(null); if (d) onDispatch(mos, d); }} />

      {/* จัดการโต๊ะ (แผงกลางเดิม) */}
      <ERPModal open={manageDesk !== null} onClose={() => setManageDesk(null)} size="md" title={`จัดการโต๊ะ: ${manageDesk?.name ?? ""}`} description="ย้ายคนเข้า/ออก · สร้างโต๊ะใหม่ · เปลี่ยนชื่อ · ปิดโต๊ะ (ต้องมีสิทธิ์บุคคล)">
        {manageDesk && renderDeskManager?.(manageDesk)}
      </ERPModal>

      {/* สถานะงาน + ขอซื้อวัตถุดิบถึงไหน (ป๊อปกลาง — ตัวเดียวกับใบค้างผลิต/Dashboard ผลิต) */}
      {statusMo && <MoStatusModal moId={statusMo} view="materials" onClose={() => setStatusMo(null)} />}
      <MoLaborRateModal mo={laborMo} onClose={() => setLaborMo(null)} onSaved={() => onLaborSaved?.()} />

      {/* iPad: ตัวกรอง/การ์ดโชว์อะไร (ป๊อปกลาง) — ของที่จอคอมวางเรียงบนแถบบน · ค่าที่จำต่อคนเป็นตัวเดียวกับจอคอม */}
      <ERPModal open={touch && filterOpen} onClose={() => setFilterOpen(false)} size="sm" title="ตัวกรอง · การ์ดโชว์อะไร">
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 text-[12px] text-slate-500">เรียงการ์ด</div>
            <div className="flex flex-wrap gap-1.5">
              {sortList.map((s) => (
                <button key={s.k} type="button" onClick={() => setSort(s.k)} aria-pressed={sort === s.k}
                  className={`h-10 rounded-full border px-3 text-[14px] ${sort === s.k ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setReadyOnly((v) => !v)} aria-pressed={readyOnly}
              className={`h-10 rounded-full border px-3 text-[14px] ${readyOnly ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>พร้อมจ่ายเท่านั้น</button>
            {showPrice && (
              <button type="button" onClick={() => setIncludeOwn(!includeOwn)} aria-pressed={includeOwn}
                title="ค่าเริ่มต้น = นับเงินเฉพาะแบรนด์ลูกค้า (OEM) · เปิด = นับแบรนด์ตัวเอง/ไม่มีแบรนด์ด้วย"
                className={`h-10 rounded-full border px-3 text-[14px] ${includeOwn ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>รวมเงินแบรนด์ตัวเอง</button>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[12px] text-slate-500">ขนาดการ์ด</div>
            <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 w-full accent-violet-600" aria-label="ขนาดการ์ด" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center text-[12px] text-slate-500">การ์ดโชว์
              <button type="button" onClick={() => setFields(FIELDS_DEFAULT)} className="ml-auto min-h-9 px-1 text-slate-500 underline">ค่าเริ่มต้น</button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {FIELDS.filter((f) => showPrice || !f.money).map((f) => (
                <label key={f.k} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={fields.includes(f.k)} onChange={(e) => setFields(e.target.checked ? [...fields, f.k] : fields.filter((x) => x !== f.k))} className="h-5 w-5 accent-violet-600" /> {f.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12px] text-slate-500">หน้าตา (จำไว้ที่เครื่องนี้)</div>
            <div className="flex gap-1.5">
              <button type="button" aria-pressed={touch} onClick={() => ipad.setView(window.matchMedia("(orientation: portrait)").matches ? "ipadP" : "ipadL")}
                className={`h-10 flex-1 rounded-lg border text-[14px] ${touch ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700"}`}>แบบ iPad</button>
              <button type="button" onClick={() => { setFilterOpen(false); ipad.setView("pc"); }}
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white text-[14px] text-slate-700">แบบจอคอม</button>
            </div>
          </div>
        </div>
      </ERPModal>

    </div>
  );
}
