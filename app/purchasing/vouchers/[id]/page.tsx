"use client";

/**
 * ฟอร์มใบสำคัญรับ (ใบซื้อ) — /purchasing/vouchers/<id>
 *   หัวใบ: วันที่ · ร้าน · สกุล/เรท · วิธีคิดค่าส่ง (ไม่คิด / คิว / น้ำหนัก) · เรทค่าส่ง หรือยอดจริงจากบิลขนส่ง
 *   รายการ: จำนวนรับ · ราคา/หน่วย (¥ หรือ ฿) · ราคาบาท · คิวหรือกก./ชิ้น (ค่าเริ่มต้นจาก Parent SKU) · ค่าส่งเฉลี่ย · ต้นทุนถึงมือ
 *   ตัวเลขคิดสดด้วยสูตรกลาง lib/landed-cost (ตัวเดียวกับ server) · บันทึกร่าง → ยืนยัน = ออกเลข + เขียนราคากลับ
 */
import { LoadingState } from "@/components/state-views";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { RowMenu, type RowMenuItem } from "@/components/seller-bill-panel/row-menu";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { MoneyInput } from "@/components/money-input";
import { HoverPreview } from "@/components/hover-image";
import { CopyButton } from "@/components/copy-button";
import { DeliveryBillPanel, type DeliveryBillApi, type DeliveryBillStatus } from "@/components/delivery-bill-panel";
import { FxRateQuickModal } from "@/components/fx-rate-quick";
import { SellerBillPanel, type SellerBillPanelApi, type BillLineMoney, type BillLinkMap } from "@/components/seller-bill-panel";
import { SaveBar } from "@/components/save-bar";
import { SendToChinaPayButton } from "@/components/china-pay-send-button";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { computeVoucher, fxForTargetThb, fmtMoney, curSymbol, isForeignCurrency, type ShipMethod } from "@/lib/landed-cost";
import type { VoucherHeader, VoucherLine } from "@/lib/purchase-voucher-server";
import { voucherChecklist, paidDiff, PAID_TOLERANCE_THB } from "@/lib/purchase-voucher-checklist";
import { CollapseCard, ShipZeroFix, VoucherChecklistCard, VoucherConfirmModal, VoucherNextSteps, type ConfirmResult } from "./voucher-side";
import { isQuickFix, shipZeroCauses, type ShipFix } from "@/lib/voucher-ship-zero";
import { spreadStale } from "@/lib/delivery-bill-check";
import { RevisionHistory } from "./revision-history";
import { pvNoNeedsRenumber, reviseReasonFor, ADMIN_NO_REASON } from "@/lib/voucher-revision";

type Detail = { header: VoucherHeader; lines: VoucherLine[]; ref_fx_rate?: number | null; ref_fx_date?: string | null };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const SHIP_LABEL: Record<ShipMethod, string> = { none: "ไม่คิดค่าส่ง", cube: "📦 ตามคิว (CBM)", weight: "⚖️ ตามน้ำหนัก (กก.)" };
const SOURCE_BADGE: Record<string, { text: string; cls: string }> = {
  po: { text: "จากใบ PO", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  price_list: { text: "ราคาต่อร้าน", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  taobao: { text: "ราคาจาก Taobao", cls: "bg-orange-50 text-orange-800 border-orange-300" },   // ★ 11-27 ราคา ¥ จากการ์ด Taobao ที่จับคู่สินค้า
  manual: { text: "กรอกเอง", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  bill: { text: "จากบิลร้าน", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  none: { text: "ยังไม่มีราคา", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};
/** ค่าที่กำลังแก้ของรายการ · ★ 2026-11-14 ส่วนลด: ยอดเงิน (amt) หรือ % (pct) — เจ้าของเลือก "ได้ทั้งคู่" */
type LineEdit = { unit_price: string; cbm_per_unit: string; kg_per_unit: string; ship_method: "" | "cube" | "weight"; qty: string; discount: string; disc_mode: "amt" | "pct" };
/** ส่วนลดของแถว → ค่าที่ส่งให้สูตรกลาง/บันทึก (โหมด % = discount_pct · ยอดเงิน = discount) */
const discOf = (e: LineEdit | undefined): { discount: number | null; discount_pct: number | null } => {
  const v = e?.discount ? Number(e.discount) : 0;
  if (!(v > 0)) return { discount: null, discount_pct: null };
  return e?.disc_mode === "pct" ? { discount: null, discount_pct: v } : { discount: v, discount_pct: null };
};
const SYS_SRC: Record<string, string> = { shop: "ราคาต่อร้านนี้", default_shop: "ราคาร้านหลัก", sku: "ราคาบนสินค้า" };

export default function PurchaseVoucherFormPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const router = useRouter();
  const toast = useToast();
  const canView = usePermission("products.cost.view");
  const canEdit = usePermission("products.edit");
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // ค่าที่กำลังแก้ (ยังไม่บันทึก)
  // หัวใบ: 2 เรท (฿/คิว, ฿/กก.) · ship_method = วิธีคิดเริ่มต้นของบรรทัดที่ไม่ระบุเอง
  const [h, setH] = useState<{ voucher_date: string; fx_rate: string; ship_method: ShipMethod; ship_rate_cube: string; ship_rate_kg: string; ship_manual_total: string; note: string; carrier_id: string; carrier_name: string;
    /** ★ 2026-11-15 ค่าส่งในจีน (สกุลใบ) · ค่าธรรมเนียมจ่ายเงิน (฿) · ยอดจ่ายจริงตามบิล (฿) */
    seller_ship_foreign: string; pay_fee_thb: string; paid_total_thb: string }>({ voucher_date: "", fx_rate: "", ship_method: "none", ship_rate_cube: "", ship_rate_kg: "", ship_manual_total: "", note: "", carrier_id: "", carrier_name: "", seller_ship_foreign: "", pay_fee_thb: "", paid_total_thb: "" });
  // ร้านขนส่ง/เรทค่าส่ง จากตั้งค่ากลาง (/m/freight-carriers) — เลือกแล้วได้วิธีคิดเริ่มต้น + 2 เรททันที
  const [carriers, setCarriers] = useState<{ id: string; name: string; method: ShipMethod; rate_cube: number | null; rate_kg: number | null }[]>([]);
  useEffect(() => {
    apiFetch("/api/master-v2/freight-carriers?limit=100").then((r) => r.json()).then((j) => {
      const rows = ((j.data ?? []) as Record<string, unknown>[]).filter((c) => c.is_active !== false)
        .map((c) => {
          const method = (c.method === "weight" ? "weight" : "cube") as ShipMethod;
          const legacy = Number(c.rate_thb) || 0;
          return { id: String(c.id), name: String(c.name ?? ""), method,
            rate_cube: c.rate_cube_thb != null ? Number(c.rate_cube_thb) : method === "cube" ? legacy : null,
            rate_kg: c.rate_kg_thb != null ? Number(c.rate_kg_thb) : method === "weight" ? legacy : null };
        });
      setCarriers(rows);
    }).catch(() => setCarriers([]));
  }, []);
  // บิลค่าส่งจากแอปโอนเงินจีน (china_bills.is_shipping) — ไว้ผูกกับใบสำคัญตอนจ่ายค่าส่ง
  const [shipBills, setShipBills] = useState<{ id: string; label: string }[]>([]);
  const [payBusy, setPayBusy] = useState(false);
  const [ln, setLn] = useState<Record<string, LineEdit>>({});
  // เพิ่ม/ลบรายการที่ "เพิ่มเอง" (ไม่ได้มาจากใบรับ)
  const [addSku, setAddSku] = useState<SkuPickerValue | null>(null);
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [delLine, setDelLine] = useState<VoucherLine | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // ยกเลิกใบที่ยืนยันแล้ว (ใส่ราคา/ค่าส่งผิด) — ต้องมีเหตุผล
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastConfirm, setLastConfirm] = useState<ConfirmResult | null>(null);   // ผลยืนยันล่าสุด (อัปเดตราคาไปกี่ที่) → โชว์ในการ์ดงานถัดไป
  const [sellerKey, setSellerKey] = useState(0);   // ลบรายการแล้ว → โหลดแผงบิลร้านใหม่
  // ★ 2026-11-15 แก้ใบที่ยืนยันแล้ว (แบบ ก.: เลขเดิม · บังคับเหตุผล · เก็บทุกเวอร์ชัน) — สิทธิ์ pv.edit_confirmed (แอดมิน/หัวหน้า)
  const canRevise = usePermission("pv.edit_confirmed");
  const isAdmin = useAuth().user?.role === "admin";   // ★ 2026-11-16 แอดมินเปิดแก้ได้ไม่ต้องใส่เหตุผล (API ตรวจซ้ำ)
  const [leaveTo, setLeaveTo] = useState<string | null>(null);   // ★ 2026-11-16 ปุ่มใบใหม่: มีที่ยังไม่บันทึก → ถามก่อนออก
  // ★ 2026-11-21 ข้อเสนอ 1: ก่อนยืนยัน ถามว่า "ส่งมาพร้อมใบอื่นไหม?" (ร้านเดียวกัน ยังไม่มีค่าส่ง ≤ 14 วัน) · ข้อเสนอ 2: แยกใบกลับ
  const [shipAsk, setShipAsk] = useState<{ id: string; pv_no: string | null; status: string; voucher_date: string; grand_total_thb: number }[] | null>(null);
  const [splitInfo, setSplitInfo] = useState<{ has_merge: boolean; can: boolean; reason: string | null; merged: string[] } | null>(null);
  const [splitAsk, setSplitAsk] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseReason, setReviseReason] = useState("");
  const [reviseCancelOpen, setReviseCancelOpen] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);   // แถบ ＋ เพิ่มรายการเอง (พับไว้)
  // ★ 2026-11-15 แผงบิลร้านให้หน้าใบคุม (เจ้าของ: "ขอปุ่มบันทึกร่างด้วย" — แถบเดียวบันทึกทั้งหน้า) + งานแก้ PO ทำตอนยืนยันใบ
  const panelRef = useRef<SellerBillPanelApi | null>(null);
  const [panelStatus, setPanelStatus] = useState<{ pending: boolean; undecided: number; bills: number }>({ pending: false, undecided: 0, bills: 0 });
  // ★ 2026-11-22 ใบส่งของจากขนส่ง: ที่แก้ค้าง (ลบแถว/แก้ตัวเลข/จับคู่/เลือกของใบไหน) ต้องไม่หายเงียบ · ก่อนยืนยันเตือนค่าส่ง ฿0
  const deliveryRef = useRef<DeliveryBillApi | null>(null);
  const [dbStatus, setDbStatus] = useState<DeliveryBillStatus>({ pending: false, mineRows: 0, unappliedRows: 0, unmappedRows: 0 });
  const dbStatusRef = useRef(dbStatus);   // ค่าล่าสุด (หลังบันทึกแล้วตรวจต่อทันที)
  const onDbStatus = useCallback((s: DeliveryBillStatus) => { dbStatusRef.current = s; setDbStatus(s); }, []);
  const [dbAsk, setDbAsk] = useState<{ kind: "unsaved" | "ship0"; next: "confirm" | "revise" } | null>(null);
  const [dbBusy, setDbBusy] = useState(false);
  // ★ 2026-11-27 เจ้าของเลือกข้อ 1-4: กดยืนยัน = ใส่น้ำหนัก/คิวจากใบส่งของให้เอง (ย้อนได้) · ค่าส่ง ฿0 บอกสาเหตุ + ปุ่มแก้ (lib/voucher-ship-zero)
  const [autoApplied, setAutoApplied] = useState(0);   // ใส่ให้กี่รายการก่อนเปิดป๊อปยืนยัน
  const [shipUndo, setShipUndo] = useState<{ h: Partial<Record<"ship_manual_total" | "ship_method", string>>; ln: Record<string, LineEdit["ship_method"]> } | null>(null);
  const [shipCardOpen, setShipCardOpen] = useState(0);   // เปิดกล่องค่าส่งเอง (ปุ่ม ไปจับคู่ / ใส่เรท)
  const preCheckRef = useRef<(next: "confirm" | "revise", skip: ("unsaved" | "apply" | "ship0")[], applied?: number) => void>(() => {});   // ขั้นหลังใส่น้ำหนัก/คิว (ค่าล่าสุดทุก render)
  useEffect(() => { if (!dirty) setShipUndo(null); }, [dirty]);   // บันทึกแล้ว/โหลดใหม่ = ย้อนในหน้าไม่ได้แล้ว
  const [fxOpen, setFxOpen] = useState(false);
  const [fxDailyDate, setFxDailyDate] = useState<string | null>(null);   // ตั้งเรทกลางวันนี้จากหน้านี้แล้ว → ป้ายเรทเก่าหายทันที   // ★ 2026-11-22 แบบ B: แตะเรทในกล่องยอดเงิน → เปลี่ยนเรท (ใบนี้ / เรทกลางวันนี้)
  const onPanelStatus = useCallback((s: { pending: boolean; undecided: number; bills: number }) => setPanelStatus((p) => (p.pending === s.pending && p.undecided === s.undecided && p.bills === s.bills ? p : s)), []);
  // ★ 2026-11-15 รอบ 4 (เจ้าของ: "ตารางล่างไม่ค่อยจำเป็น เอาไปรวมกับอันบน · อยากได้ view รวมทุกอันเป็นตาราง และดูแบบแยกบิล")
  //   แยกตามบิล = แผงบิลร้าน (แถวบาง + ฿/ชิ้น · ยอด ฿) + กล่อง "ไม่มีบิล" · รวมเป็นตาราง = ตารางเดียวทุกรายการ + คอลัมน์ "บิล" · จำในเครื่อง
  const [linesView, setLinesView] = useState<"bill" | "all">("bill");
  useEffect(() => { try { const v = localStorage.getItem("pv-lines-view"); if (v === "bill" || v === "all") setLinesView(v); } catch { /* ไม่มีที่เก็บ = ค่าเริ่ม */ } }, []);
  const changeLinesView = (v: "bill" | "all") => { setLinesView(v); try { localStorage.setItem("pv-lines-view", v); } catch { /* ไม่เป็นไร */ } };
  const [billLinks, setBillLinks] = useState<BillLinkMap>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // ★ 2026-11-23 ช่องที่พิมพ์แก้ค้าง (ยังไม่บันทึก) — แผงบิลร้าน/ใบส่งของสั่งโหลดใบใหม่แล้วต้องไม่ทับที่พิมพ์ไว้ (บั๊ก: ใส่ 60 กดใช้น้ำหนัก/คิว กลายเป็น 1)
  const editedRef = useRef<{ h: Set<string>; ln: Record<string, Set<string>> }>({ h: new Set(), ln: {} });
  const applyData = useCallback((d: Detail, keep = false) => {
    setData(d);
    const keepH = keep ? new Set(editedRef.current.h) : new Set<string>();
    const keepLn: Record<string, Set<string>> = keep ? Object.fromEntries(Object.entries(editedRef.current.ln).map(([k, v]) => [k, new Set(v)])) : {};
    if (!keep) editedRef.current = { h: new Set(), ln: {} };
    const hd0 = d.header;
    // ข้อมูลเก่ามีเรทตัวเดียว (ship_rate) → ใส่ให้ช่องของวิธีคิดเดิม
    const rateCube = hd0.ship_rate_cube ?? (hd0.ship_method === "cube" ? hd0.ship_rate : null);
    const rateKg = hd0.ship_rate_kg ?? (hd0.ship_method === "weight" ? hd0.ship_rate : null);
    const freshH = { voucher_date: hd0.voucher_date, fx_rate: hd0.fx_rate == null ? "" : String(hd0.fx_rate), ship_method: hd0.ship_method, ship_rate_cube: rateCube == null ? "" : String(rateCube), ship_rate_kg: rateKg == null ? "" : String(rateKg), ship_manual_total: hd0.ship_manual_total == null ? "" : String(hd0.ship_manual_total), note: hd0.note ?? "", carrier_id: hd0.carrier_id ?? "", carrier_name: hd0.carrier_name ?? "",
      seller_ship_foreign: hd0.seller_ship_foreign == null ? "" : String(hd0.seller_ship_foreign), pay_fee_thb: hd0.pay_fee_thb == null ? "" : String(hd0.pay_fee_thb), paid_total_thb: hd0.paid_total_thb == null ? "" : String(hd0.paid_total_thb) };
    setH((prev) => { if (!keepH.size) return freshH; const out = { ...freshH } as Record<string, unknown>; for (const k of keepH) out[k] = (prev as Record<string, unknown>)[k]; return out as typeof freshH; });
    const m: typeof ln = {};
    for (const l of d.lines) m[l.id] = { unit_price: l.unit_price == null ? "" : String(l.unit_price), cbm_per_unit: l.cbm_per_unit == null ? "" : String(l.cbm_per_unit), kg_per_unit: l.kg_per_unit == null ? "" : String(l.kg_per_unit), ship_method: l.ship_method === "cube" || l.ship_method === "weight" ? l.ship_method : "", qty: String(l.qty),
      discount: l.discount_pct ? String(l.discount_pct) : l.discount ? String(l.discount) : "", disc_mode: l.discount_pct ? "pct" : "amt" };
    setLn((prev) => { for (const [lid, ks] of Object.entries(keepLn)) if (m[lid] && prev[lid]) for (const k of ks) (m[lid] as Record<string, unknown>)[k] = (prev[lid] as Record<string, unknown>)[k]; return m; });
    if (keep) for (const lid of Object.keys(editedRef.current.ln)) if (!m[lid]) delete editedRef.current.ln[lid];   // แถวที่ถูกลบไปแล้ว ไม่ต้องจำ
    setDirty(keepH.size > 0 || Object.entries(keepLn).some(([lid, s]) => s.size > 0 && !!m[lid]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }, [id, applyData]);
  /** ★ 2026-11-23 แผงบิลร้าน/ใบส่งของเปลี่ยนข้อมูลแล้ว → โหลดใบใหม่แบบเงียบ: ไม่ขึ้นหน้าโหลด (แผงไม่หลุด) + เก็บช่องที่พิมพ์แก้ค้าง */
  const reloadKeep = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && !j.error) applyData(j.data as Detail, true);
    } catch { /* โหลดไม่ได้ = ข้อมูลเดิมบนจอ */ }
  }, [id, applyData]);
  useEffect(() => { if (canView && id) void load(); }, [load, canView, id]);

  // ใบร่าง หรือใบยืนยันแล้วที่ "เปิดแก้" อยู่ = แก้ได้ (lib/voucher-revision)
  const editing = data?.header.status === "confirmed" && !!data?.header.editing_at;
  const readonly = !canEdit || !((data?.header.status ?? "draft") === "draft" || editing);
  const reviseCall = async (action: "start" | "save" | "cancel", reason?: string, renumber = false) => {
    setReviseBusy(true);
    try {
      if (action === "save") await panelRef.current?.flush();   // บิลร้านที่แก้ค้าง
      if (action === "save" && deliveryRef.current?.pending() && !(await deliveryRef.current.flush())) return;   // ใบส่งของที่แก้ค้าง
      if (action === "save" && dirty && !(await save())) return;
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason, renumber }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      setSellerKey((k) => k + 1); setHistKey((k) => k + 1);
      if (action === "start") { setReviseOpen(false); toast.success("เปิดแก้แล้ว — แก้ได้เหมือนตอนร่าง เสร็จแล้วกด บันทึกการแก้ไข"); }
      if (action === "cancel") { setReviseCancelOpen(false); toast.success("ยกเลิกการแก้แล้ว — ใบกลับเป็นเวอร์ชันล่าสุด"); }
      if (action === "save") {
        if (j.unchanged) toast.success("ไม่มีอะไรเปลี่ยน — ปิดการแก้แล้ว");
        else toast.success(`บันทึกการแก้ไขแล้ว (เวอร์ชัน ${j.rev_no}) · เปลี่ยน ${(j.diff ?? []).length} จุด${j.renumbered ? ` · เลขใบใหม่ ${j.renumbered.to}` : ""}${j.failed ? ` · เขียนราคากลับไม่สำเร็จ ${j.failed} รายการ` : ""}`);
        for (const w of (j.pay_warnings ?? []) as { po_no: string; paid_thb: number; now_thb: number }[])
          toast.error(`${w.po_no} จ่ายไปแล้ว ฿${fmtMoney(w.paid_thb)} แต่ยอดใหม่ ฿${fmtMoney(w.now_thb)} (ต่าง ฿${fmtMoney(Math.abs(w.now_thb - w.paid_thb))}) — ตรวจการจ่ายเงิน`);
      }
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setReviseBusy(false); }
  };
  // ★ 2026-11-15 เจ้าของเลือกแบบ ก.: บันทึกการแก้ไขแล้ววันที่ในเลขไม่ตรงวันที่ใบ → ถามเปลี่ยนเลขตามวันที่ (เลขถัดไปที่ว่างของวันนั้น)
  const [renumberAsk, setRenumberAsk] = useState(false);
  const startReviseSave = () => {
    if (pvNoNeedsRenumber(data?.header.pv_no, h.voucher_date)) { setRenumberAsk(true); return; }
    void reviseCall("save");
  };
  const currency = data?.header.currency ?? "THB";
  const foreign = isForeignCurrency(currency);
  const sym = curSymbol(currency);

  // คิดสดฝั่งหน้าเว็บ (สูตรเดียวกับ server)
  const calcIn = useMemo(() => {
    if (!data) return null;
    return {
      header: { currency, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method, ship_rate_cube: h.ship_rate_cube === "" ? null : num(h.ship_rate_cube), ship_rate_kg: h.ship_rate_kg === "" ? null : num(h.ship_rate_kg), ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total),
        seller_ship_foreign: h.seller_ship_foreign === "" ? null : num(h.seller_ship_foreign), pay_fee_thb: h.pay_fee_thb === "" ? null : num(h.pay_fee_thb) },
      lines: data.lines.map((l) => { const e = ln[l.id]; return { qty: !l.gr_line_id && e?.qty ? num(e.qty) : l.qty, unit_price: e?.unit_price ? num(e.unit_price) : null, cbm_per_unit: e?.cbm_per_unit ? num(e.cbm_per_unit) : null, kg_per_unit: e?.kg_per_unit ? num(e.kg_per_unit) : null, ship_method: e?.ship_method || null, ...discOf(e) }; }),
    };
  }, [data, h, ln, currency]);
  const calc = useMemo(() => (calcIn ? computeVoucher(calcIn.header, calcIn.lines) : null), [calcIn]);
  const hStatus = data?.header.status; const hEditing = data?.header.editing_at;
  useEffect(() => {
    if (!id || !hStatus || hStatus === "cancelled") { setSplitInfo(null); return; }
    let alive = true;
    apiFetch(`/api/purchasing/vouchers/${id}/split`).then((r) => r.json()).then((j) => { if (alive) setSplitInfo(j.data ?? null); }).catch(() => { if (alive) setSplitInfo(null); });
    return () => { alive = false; };
  }, [id, hStatus, hEditing]);
  /** ★ 2026-11-15 ยอดบาทต่อบรรทัด (สูตรกลางเดียวกับตาราง) → แถวบิลร้านโชว์ ฿/ชิ้น · ยอด ฿ */
  const lineMoney = useMemo(() => {
    if (!data || !calc) return undefined;
    const m: Record<string, BillLineMoney> = {};
    data.lines.forEach((l, i) => { const c = calc.lines[i]; if (c) m[l.id] = { unit_thb: c.has_price ? c.unit_price_thb : null, total_thb: c.has_price ? c.line_total_thb : null }; });
    return m;
  }, [data, calc]);

  const setHeader = (patch: Partial<typeof h>) => { for (const k of Object.keys(patch)) editedRef.current.h.add(k); setH((p) => ({ ...p, ...patch })); setDirty(true); };
  /** ★ 2026-11-14 รู้ยอดบาท ไม่รู้เรท → แก้ "ค่าสินค้า ฿" ในกล่องสรุป แล้วคิดเรทให้ใหม่ (ให้ยอดบาทตรงทุกสตางค์ · lib/landed-cost fxForTargetThb) */
  const setGoodsThb = (thb: number) => {
    if (!calcIn) return;
    const fx = fxForTargetThb(calcIn.header, calcIn.lines, thb);
    if (fx == null) { toast.error("คิดเรทไม่ได้ — ใส่ราคา (สกุลใบ) ในรายการก่อน"); return; }
    setHeader({ fx_rate: String(fx) });
    const got = computeVoucher({ ...calcIn.header, fx_rate: fx }, calcIn.lines).totals.subtotal_thb;
    toast.success(`คิดเรทให้ใหม่ = ${fx} บาท/${sym.trim() || currency} (฿${fmtMoney(got)} ÷ ${sym}${fmtMoney(calc?.totals.subtotal_foreign ?? 0)})${Math.abs(got - thb) >= 0.01 ? ` · ใกล้สุดที่ได้ ฿${fmtMoney(got)}` : ""} — กดบันทึกร่างเพื่อเก็บ`);
  };
  /** ★ 2026-11-15 ปรับเรทให้ "ยอดจ่ายร้าน" (ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม) = ยอดจ่ายจริงตามบิลพอดี */
  const fitPaidTotal = () => {
    if (!calcIn || !(num(h.paid_total_thb) > 0)) return;
    const fx = fxForTargetThb(calcIn.header, calcIn.lines, num(h.paid_total_thb), "shop");
    if (fx == null) { toast.error("คิดเรทไม่ได้ — ใส่ราคา (สกุลใบ) ในรายการก่อน"); return; }
    setHeader({ fx_rate: String(fx) });
    const got = computeVoucher({ ...calcIn.header, fx_rate: fx }, calcIn.lines).totals.shop_total_thb;
    toast.success(`ปรับเรทเป็น ${fx} — ยอดจ่ายร้าน ฿${fmtMoney(got)} ตรงยอดจ่ายจริง · กดบันทึกร่างเพื่อเก็บ`);
  };
  const setLine = (lid: string, patch: Partial<LineEdit>) => { const s = editedRef.current.ln[lid] ?? (editedRef.current.ln[lid] = new Set()); for (const k of Object.keys(patch)) s.add(k); setLn((p) => ({ ...p, [lid]: { ...p[lid], ...patch } })); setDirty(true); };
  /** ★ 2026-11-15 บันทึกร่างทั้งหน้า — บิลร้านที่ค้าง (บันทึกอัตโนมัติยังไม่ทันส่ง) + หัวใบ/รายการ · ไม่ได้แก้อะไรก็กดได้ */
  const saveAll = async () => {
    await panelRef.current?.flush();
    if (deliveryRef.current?.pending() && !(await deliveryRef.current.flush())) return;   // ★ 2026-11-22 ใบส่งของที่แก้ค้าง
    if (dirty) { if (!(await save())) return; }
    setSavedAt(new Date());
    toast.success("บันทึกร่างแล้ว");
  };

  const save = async (): Promise<boolean> => {
    if (!data) return false;
    setSaving(true);
    try {
      const body = {
        header: {
          voucher_date: h.voucher_date, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method,
          ship_rate_cube: h.ship_rate_cube === "" ? null : num(h.ship_rate_cube), ship_rate_kg: h.ship_rate_kg === "" ? null : num(h.ship_rate_kg),
          // เรทเดิมตัวเดียว = เรทของวิธีคิดเริ่มต้น (ให้ของเก่าที่ยังอ่านช่องนี้ใช้ได้)
          ship_rate: h.ship_method === "cube" ? (h.ship_rate_cube === "" ? null : num(h.ship_rate_cube)) : h.ship_method === "weight" ? (h.ship_rate_kg === "" ? null : num(h.ship_rate_kg)) : null,
          ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total), note: h.note || null, carrier_id: h.carrier_id || null, carrier_name: h.carrier_name || null,
          seller_ship_foreign: h.seller_ship_foreign === "" ? null : num(h.seller_ship_foreign), pay_fee_thb: h.pay_fee_thb === "" ? null : num(h.pay_fee_thb), paid_total_thb: h.paid_total_thb === "" ? null : num(h.paid_total_thb),
        },
        lines: data.lines.map((l) => { const e = ln[l.id]; return { id: l.id, ...(!l.gr_line_id && num(e?.qty) > 0 ? { qty: num(e?.qty) } : {}), unit_price: e?.unit_price === "" ? null : num(e?.unit_price), cbm_per_unit: e?.cbm_per_unit === "" ? null : num(e?.cbm_per_unit), kg_per_unit: e?.kg_per_unit === "" ? null : num(e?.kg_per_unit), ship_method: e?.ship_method || null, ...discOf(e) }; }),
      };
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      return true;
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); return false; }
    finally { setSaving(false); }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      await panelRef.current?.flush();   // บิลร้านที่แก้ค้าง (บันทึกอัตโนมัติยังไม่ทันส่ง)
      if (deliveryRef.current?.pending() && !(await deliveryRef.current.flush())) return;   // ใบส่งของที่แก้ค้าง (กันหายเงียบ)
      if (dirty && !(await save())) return;
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/confirm`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      // ★ 2026-11-15 งานแก้ใบสั่งซื้อที่เลือกไว้ในบิลร้าน (ลด PO ตามบิล / ปิดยอดของที่ไม่มา) — ทำหลังยืนยันใบสำเร็จ
      if (panelRef.current && panelRef.current.poPlanLabels().length) {
        const r = await panelRef.current.runPoPlans();
        if (r.ok.length) toast.success(`แก้ใบสั่งซื้อแล้ว — ${r.ok.join(" · ")}`);
        if (r.fail.length) toast.error(`แก้ใบสั่งซื้อไม่สำเร็จบางส่วน — ${r.fail.join(" · ")}`);
      }
      toast.success(`ยืนยันแล้ว — เลขที่ ${j.pv_no}${j.failed ? ` (เขียนราคากลับไม่สำเร็จ ${j.failed} รายการ ดูในประวัติ)` : ""}`);
      setLastConfirm({ pv_no: String(j.pv_no ?? ""), write_back: Array.isArray(j.write_back) ? j.write_back : [], failed: Number(j.failed) || 0 });
      setConfirmOpen(false);
      await load();
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });   // ให้เห็นการ์ด "งานถัดไป"
    } catch (e) { toast.error("ยืนยันไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setConfirming(false); }
  };

  // ── เพิ่ม/ลบรายการที่เพิ่มเอง (ใบร่างเท่านั้น) — มีงานค้างให้บันทึกก่อน กันค่าที่พิมพ์ไว้หาย ──
  // ★ 2026-11-14 เจ้าของ: "ตอนเพิ่มรายการใส่เสร็จก็เพิ่มเลย ไม่ต้องมีปุ่มเพิ่ม" → เลือกสินค้า = เพิ่มทันที · พิมพ์ชื่อ + Enter = เพิ่ม
  //   ได้จำนวน 1 + ราคาในระบบ (ถ้ามี) แล้วแก้จำนวน/ราคา/ส่วนลดต่อในตาราง
  const addLine = async (sku: SkuPickerValue | null = addSku, typed: string = addName) => {
    if (!sku && !typed.trim()) { toast.error("เลือกสินค้าจากคลัง หรือพิมพ์ชื่อรายการก่อน"); return; }
    if (addBusy) return;
    setAddBusy(true);
    try {
      if (dirty && !(await save())) return;
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/lines`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_sku_id: sku?.id ?? null, item_name: sku ? `[${sku.code}] ${sku.name}` : typed.trim(), qty: 1, uom: sku?.uom_name ?? null }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      setAddSku(null); setAddName("");
      toast.success("เพิ่มรายการแล้ว — แก้จำนวน/ราคาในตารางได้เลย");
    } catch (e) { toast.error("เพิ่มไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setAddBusy(false); }
  };
  // ★ 2026-11-14 ปุ่มไอคอน "แทนราคาในระบบ" — บันทึกราคาในตารางเป็นราคาต่อร้านของร้านนี้ทันที (API sys-price)
  const [sysBusy, setSysBusy] = useState<string | null>(null);
  const replaceSysPrice = async (lineId: string, price: number) => {
    setSysBusy(lineId);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/sys-price`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: lineId, price }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setData((d) => (d ? { ...d, lines: d.lines.map((x) => (x.id === lineId ? { ...x, sys_price: price, sys_price_source: "shop" } : x)) } : d));
      toast.success(`บันทึกเป็นราคาในระบบแล้ว (ราคาต่อร้าน ${fmtMoney(price, 4)})`);
    } catch (e) { toast.error("แทนราคาในระบบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSysBusy(null); }
  };
  const removeLine = async () => {
    if (!delLine) return;
    setAddBusy(true);
    try {
      if (dirty && !(await save())) return;
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/lines?line_id=${delLine.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      setDelLine(null);
      setSellerKey((k) => k + 1);   // แถวในบิลร้านกลับเป็น "ยังไม่ใส่ลงใบ" → โหลดแผงบิลใหม่
      toast.success("ลบรายการแล้ว");
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setAddBusy(false); }
  };

  // ── การจ่ายเงิน (หลังยืนยัน) ──
  // ค่าสินค้า: มาร์คที่ใบ PO ผ่าน API กลาง mark-paid · ยอดที่จ่าย = ค่าสินค้าของใบนั้นตามราคาในใบสำคัญ (ไม่รวมค่าส่ง)
  const markPoPaid = async (po: { po_id: string; po_no: string; goods_thb: number }, paid: boolean) => {
    setPayBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paid ? { id: po.po_id, paid: true, paid_date: new Date().toISOString().slice(0, 10), paid_amount_thb: po.goods_thb } : { id: po.po_id, paid: false }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(paid ? `มาร์คจ่ายค่าสินค้าแล้ว — ${po.po_no}` : `ยกเลิกจ่าย — ${po.po_no}`);
      await load();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setPayBusy(false); }
  };
  // ค่าส่ง: เก็บที่ใบสำคัญ (+ ผูกบิลค่าส่งในแอปโอนเงินจีนได้)
  const setShippingPaid = async (paid: boolean, billId?: string | null) => {
    setPayBusy(true);
    try {
      const body = { header: { shipping_payment_status: paid ? "paid" : "unpaid", shipping_paid_date: paid ? new Date().toISOString().slice(0, 10) : null, ...(billId !== undefined ? { shipping_bill_id: billId } : {}) } };
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      toast.success(paid ? "มาร์คจ่ายค่าส่งแล้ว" : "ยกเลิกจ่ายค่าส่ง");
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setPayBusy(false); }
  };
  const loadShipBills = async () => {
    try {
      const res = await apiFetch("/api/master-v2/china-bills?limit=100");
      const j = await res.json();
      const rows = ((j.data ?? []) as Record<string, unknown>[]).filter((b) => b.is_shipping && b.is_active !== false)
        .map((b) => ({ id: String(b.id), label: `${b.bill_date ? formatDate(String(b.bill_date)) : "—"} · ฿${fmtMoney(Number(b.amount_thb) || 0)}${b.note ? ` · ${String(b.note).slice(0, 30)}` : ""}` }));
      setShipBills(rows);
    } catch { setShipBills([]); }
  };

  const voidConfirmed = async () => {
    if (!voidReason.trim()) { toast.error("ต้องระบุเหตุผลที่ยกเลิก"); return; }
    setVoiding(true);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const kept = (j.price_kept ?? []) as string[];
      toast.success(`ยกเลิกใบแล้ว — ใบรับ ${j.released_gr ?? 0} ใบกลับไปรอออกใบสำคัญใหม่`
        + (j.no_snapshot ? " · ใบนี้ไม่มีข้อมูลราคาเดิม ราคาในระบบคงไว้ตามเดิม" : kept.length ? ` · ราคา ${kept.length} รายการถูกแก้ทีหลัง จึงคงไว้ (${kept.slice(0, 2).join(", ")}${kept.length > 2 ? " …" : ""})` : " · คืนราคาเดิมครบ"));
      setVoidOpen(false); setVoidReason("");
      await load();
    } catch (e) { toast.error("ยกเลิกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setVoiding(false); }
  };

  const cancelDraft = async () => {
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success("ยกเลิกใบร่างแล้ว ใบรับกลับไปรอออกใบสำคัญ");
      router.push("/purchasing/vouchers");
    } catch (e) { toast.error("ยกเลิกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูราคาต้นทุน (products.cost.view)" /></PlaygroundShell>;

  const hd = data?.header;
  const grIds = [...new Set((data?.lines ?? []).map((l) => l.gr_id ?? "").filter(Boolean))];
  const t = calc?.totals;
  // มีค่าส่งให้คิดไหม = ค่าเริ่มต้นของใบไม่ใช่ "ไม่คิด" หรือมีบรรทัดที่ระบุวิธีคิดเอง
  const shipManual = h.ship_manual_total !== "" && num(h.ship_manual_total) >= 0 && h.ship_manual_total != null;   // ★ 2026-11-15 พิมพ์ยอดค่าส่งเอง = นับเสมอ
  const anyShip = h.ship_method !== "none" || (data?.lines ?? []).some((l) => !!ln[l.id]?.ship_method) || (shipManual && num(h.ship_manual_total) > 0);
  // ค่าส่งมีปัญหา (ขาดคิว/กก. หรือเรท) → กล่องค่าส่งเปิดเอง + ขอบเหลือง
  const shipIssue = anyShip && ((t?.missing_basis_count ?? 0) > 0 || (t?.missing_rate_count ?? 0) > 0);
  // เช็กลิสต์ก่อนยืนยัน (กติกากลาง lib/purchase-voucher-checklist — ตรงกับที่ API ยืนยันจะปฏิเสธ)
  const checklist = voucherChecklist({
    line_count: data?.lines.length ?? 0, foreign, currency_label: sym.trim() || currency, fx_rate: num(h.fx_rate),
    missing_price_count: t?.missing_price_count ?? 0, any_ship: anyShip, ship_total_thb: t?.ship_total_thb ?? 0,
    missing_basis_count: t?.missing_basis_count ?? 0, missing_rate_count: t?.missing_rate_count ?? 0, dirty: dirty && !readonly,
    ref_fx_rate: data?.ref_fx_rate ?? null,   // เรทหยวนวันที่ใบ → เตือนเมื่อเรทต่างเกิน 10%
    ship_manual: shipManual, bill_undecided: panelStatus.undecided,   // ★ 2026-11-15
    paid_total_thb: h.paid_total_thb === "" ? null : num(h.paid_total_thb), shop_total_thb: t?.shop_total_thb ?? 0,   // ★ 2026-11-15 เทียบยอดจ่ายจริงตามบิล
  });
  const totals = { subtotal_foreign: t?.subtotal_foreign ?? 0, subtotal_thb: t?.subtotal_thb ?? 0, ship_total_thb: t?.ship_total_thb ?? 0, grand_total_thb: t?.grand_total_thb ?? 0, discount_foreign: t?.discount_foreign ?? 0, discount_thb: t?.discount_thb ?? 0,
    seller_ship_foreign: t?.seller_ship_foreign ?? 0, seller_ship_thb: t?.seller_ship_thb ?? 0, pay_fee_thb: t?.pay_fee_thb ?? 0, shop_total_thb: t?.shop_total_thb ?? 0, paid_total_thb: h.paid_total_thb === "" ? null : num(h.paid_total_thb), ship_manual: shipManual };
  const skuCount = new Set((data?.lines ?? []).map((l) => l.item_sku_id).filter(Boolean)).size;
  const inputCls = "h-9 px-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500";
  /** ★ 2026-11-21 ข้อเสนอ 1 — ใบนี้ยังไม่มีค่าส่ง + ร้านเดียวกันมีใบอื่นที่ยังไม่มีค่าส่ง (≤ 14 วัน) → ถามก่อน "ส่งมาพร้อมใบอื่นไหม?" · ถามไม่ได้ = ยืนยันตามปกติ */
  /** ★ 2026-11-22 ก่อนยืนยัน / บันทึกการแก้ไข: ใบส่งของยังไม่บันทึก → ถาม · มีกล่องของใบนี้แต่ยังไม่ได้ใช้น้ำหนัก/คิว หรือค่าส่ง ฿0 → เตือน */
  //   ★ 2026-11-27 ข้อ 1+3 (11-28 ไม่ต้องจับคู่แล้ว): กล่องที่ยังไม่ได้ใช้ → ใส่น้ำหนัก/คิวให้เอง (ย้อนได้) แล้วไปต่อ · ไม่มีปุ่ม "ใช้เลย" + กดยืนยันซ้ำแล้ว
  //   ค่าส่ง ฿0 → ป๊อปยืนยันบอกสาเหตุ + ปุ่มแก้ (ShipZeroFix) · บันทึกการแก้ไข (ไม่มีป๊อปยืนยัน) → ถามด้วยกล่องเดียวกัน
  type PreSkip = "unsaved" | "apply" | "ship0";
  const preCheck = async (next: "confirm" | "revise", skip: PreSkip[] = []) => {
    // ★ 11-28 ข้อ 1: แผงใบส่งของยังไม่บันทึก → บันทึกให้เอง ไม่ถาม (บันทึกไม่ผ่าน = ถามแบบเดิม)
    if (!skip.includes("unsaved") && deliveryRef.current?.pending()) {
      setDbBusy(true);
      let ok = false;
      try { ok = !!(await deliveryRef.current.flush()); } finally { setDbBusy(false); }
      if (!ok) { setDbAsk({ kind: "unsaved", next }); return; }
      await new Promise((res) => setTimeout(res, 80));   // รอแผงโหลดใหม่ → สถานะล่าสุด
    }
    // ★ 11-28 กล่องยังไม่ได้ใช้ (ไม่ต้องจับคู่แล้ว) หรือ ข้อ 2: แก้จำนวน/เพิ่มสินค้าหลังใช้แล้ว → ใส่/คิดใหม่ให้เอง (ย้อนได้)
    const unapplied = dbStatusRef.current.unappliedRows > 0;
    if (!skip.includes("apply") && (unapplied || boxesStale())) {
      setDbAsk(null);
      const r = await applyBoxes(!unapplied);
      await new Promise((res) => setTimeout(res, 80));   // รอหน้าโหลดค่าใหม่ → ใช้ฟังก์ชัน/ยอดล่าสุด
      void preCheckRef.current(next, [...skip, "unsaved", "apply"], r?.applied ?? 0);
      return;
    }
    void preCheckRef.current(next, [...skip, "unsaved", "apply"]);
  };
  /** ขั้นหลังใส่น้ำหนัก/คิวแล้ว — เรียกผ่าน ref = ได้ยอดค่าส่งล่าสุดเสมอ */
  const preCheckRest = (next: "confirm" | "revise", skip: PreSkip[], applied = 0) => {
    const ds = dbStatusRef.current;
    const ship = Number(t?.ship_total_thb ?? 0);
    if (next === "revise" && !skip.includes("ship0") && ds.mineRows > 0 && !(ship > 0)) { setDbAsk({ kind: "ship0", next }); return; }
    setDbAsk(null);
    setAutoApplied(applied);
    if (next === "revise") startReviseSave(); else void askConfirmShip();
  };
  preCheckRef.current = preCheckRest;
  const askConfirm = async () => preCheck("confirm");
  const dbSaveThen = async () => {
    if (!dbAsk) return;
    setDbBusy(true);
    try { if (!(await deliveryRef.current?.flush())) return; await new Promise((r) => setTimeout(r, 80)); void preCheck(dbAsk.next, ["unsaved"]); }   // รอแผงโหลดใหม่ → สถานะล่าสุด
    finally { setDbBusy(false); }
  };
  /** ★ 11-28 น้ำหนัก/คิวรวมของสินค้า (จำนวนล่าสุดในหน้า ยังไม่บันทึกก็นับ) ไม่เท่ากล่องที่ใช้แล้ว = ต้องคิดใหม่ */
  const boxesStale = () => {
    const boxes = deliveryRef.current?.appliedBoxes() ?? [];
    if (!boxes.length || !data || !calcIn) return false;
    return spreadStale(boxes, data.lines.map((l, k) => { const c = calcIn.lines[k]; return { id: l.id, qty: c.qty, unit_price: c.unit_price, discount: c.discount ?? null, discount_pct: c.discount_pct ?? null, kg_per_unit: c.kg_per_unit ?? null, cbm_per_unit: c.cbm_per_unit ?? null, is_product: !!l.item_sku_id }; }));
  };
  /** ใส่น้ำหนัก/คิวจากใบส่งของ (เกลี่ยให้ทุกสินค้าตามมูลค่า) — refresh = คิดใหม่ตามจำนวนล่าสุด · แจ้งผลมุมจอพร้อมปุ่มย้อนกลับ */
  const applyBoxes = async (refresh = false) => {
    setDbBusy(true);
    try {
      const r = await deliveryRef.current?.applyAll({ refresh });
      if (!r) return null;
      if (r.failed > 0) toast.error("ใส่น้ำหนัก/คิวจากใบส่งของไม่สำเร็จบางใบ — ดูที่แผงใบส่งของ");
      if (r.applied > 0 && r.undo.length) {
        const undo = r.undo;
        toast.undo(refresh ? `คิดน้ำหนัก/คิวใหม่ตามจำนวนล่าสุดแล้ว ${r.applied} รายการ` : `ใส่น้ำหนัก/คิวจากใบส่งของให้แล้ว ${r.applied} รายการ (เกลี่ยตามมูลค่า)`, async () => {
          const ok = await deliveryRef.current?.undoApply(undo);
          if (ok) { setAutoApplied(0); toast.success("ย้อนแล้ว — น้ำหนัก/คิวกลับเป็นค่าเดิม"); }
          else toast.error("ย้อนไม่สำเร็จบางรายการ — ดูที่แผงใบส่งของ");
        }, { ms: 15000 });
      }
      return r;
    } finally { setDbBusy(false); }
  };
  // ── ค่าส่ง ฿0: สาเหตุ + ปุ่มแก้ (ที่แก้ = แก้ในหน้า ยังไม่บันทึก · กดยืนยัน/บันทึกแล้วค่อยลง) ──
  const shipZero = calcIn && !readonly ? shipZeroCauses({ header: calcIn.header, lines: calcIn.lines, delivery: dbStatus }) : null;   // (หลัง return สิทธิ์ → ห้ามใช้ hook)
  const gotoShip = (elId: "pv-ship" | "pv-delivery" | "pv-lines") => {
    setConfirmOpen(false); setDbAsk(null);
    if (elId !== "pv-lines") setShipCardOpen((k) => k + 1);
    setTimeout(() => document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };
  const fixShip = (fixes: ShipFix[]) => {
    const snapH: Partial<Record<"ship_manual_total" | "ship_method", string>> = {}, snapLn: Record<string, LineEdit["ship_method"]> = {};
    const hp: Partial<typeof h> = {};
    for (const f of fixes) {
      if (f.kind === "clear_manual") { snapH.ship_manual_total = h.ship_manual_total; hp.ship_manual_total = ""; }
      else if (f.kind === "set_header_method") { snapH.ship_method = h.ship_method; hp.ship_method = f.to; }
      else if (f.kind === "switch_method") for (const k of f.line_idx) { const lid = data?.lines[k]?.id; if (!lid) continue; snapLn[lid] = ln[lid]?.ship_method ?? ""; setLine(lid, { ship_method: f.to }); }
      else if (f.kind === "apply") void applyBoxes();
      else if (f.kind === "goto_delivery") gotoShip("pv-delivery");
      else if (f.kind === "goto_ship") gotoShip("pv-ship");
      else if (f.kind === "goto_lines") gotoShip("pv-lines");
    }
    if (Object.keys(hp).length) setHeader(hp);
    if (Object.keys(snapH).length || Object.keys(snapLn).length)   // เก็บค่าก่อนแก้ครั้งแรกไว้ (แก้หลายครั้ง → ย้อนกลับไปจุดเริ่ม)
      setShipUndo((p) => ({ h: { ...snapH, ...(p?.h ?? {}) }, ln: { ...snapLn, ...(p?.ln ?? {}) } }));
  };
  const undoShipFix = () => {
    if (!shipUndo) return;
    if (Object.keys(shipUndo.h).length) setHeader(shipUndo.h as Partial<typeof h>);
    for (const [lid, m] of Object.entries(shipUndo.ln)) setLine(lid, { ship_method: m });
    setShipUndo(null);
  };
  const shipFixBox = (compact = false) => <ShipZeroFix info={shipZero} onFix={fixShip} undo={shipUndo ? undoShipFix : null} busy={dbBusy} compact={compact} />;
  const askConfirmShip = async () => {
    // ค่าส่ง ฿0 ที่มีทางแก้ในใบนี้ (ล้างยอดจริง · เปลี่ยนวิธีคิด · ใช้กล่อง) = ไม่ใช่ "ส่งมาพร้อมใบอื่น" → ไม่ถามรวม ไปป๊อปยืนยัน (บอกสาเหตุ) เลย
    const fixable = (shipZero?.causes ?? []).some((c) => isQuickFix(c.fix) || c.fix.kind === "apply");
    if (!(Number(t?.ship_total_thb ?? 0) > 0) && !fixable) {
      try {
        const j = await apiFetch(`/api/purchasing/vouchers/merge?for=${id}`).then((r) => r.json());
        const list = (j.data ?? []) as NonNullable<typeof shipAsk>;
        if (list.length) { setShipAsk(list); return; }
      } catch { /* ไม่เป็นไร */ }
    }
    setConfirmOpen(true);
  };
  /** ★ 2026-11-21 ข้อเสนอ 2 — แยกใบกลับ (ย้อนการรวม) */
  const doSplit = async () => {
    setSplitBusy(true);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/split`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { toast.error(j.error ?? "แยกใบกลับไม่สำเร็จ"); return; }
      const names = ((j.restored ?? []) as { pv_no: string | null }[]).map((r) => r.pv_no ?? "ใบร่าง").join(", ");
      toast.success(`แยกใบกลับแล้ว — คืน ${names}${j.still_editing ? " · ใบนี้ยังอยู่ในโหมดแก้ไข (กด ยกเลิกการแก้ เพื่อกลับเป็นแบบก่อนรวม)" : ""}`);
      setSplitAsk(false); setSellerKey((k) => k + 1);
      await load();
    } catch { toast.error("แยกใบกลับไม่สำเร็จ — ลองใหม่อีกครั้ง"); }
    finally { setSplitBusy(false); }
  };
  const openSplit = () => { if (splitInfo?.can) setSplitAsk(true); else toast.info(splitInfo?.reason ?? "แยกกลับไม่ได้"); };
  /** ช่องกรอกในตารางรายการ (แถวบาง) */
  const cellCls = "h-7 px-1.5 text-xs border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500";
  const hasBills = foreign && panelStatus.bills > 0;
  const billView = hasBills && linesView === "bill";

  return (
    <PlaygroundShell>
      <div className="p-5 max-w-[1400px]">
        {loading ? <LoadingState />
        : err || !data || !hd || !calc ? <div className="py-16 text-center text-red-500 text-sm">⚠️ {err ?? "ไม่พบใบสำคัญรับ"}</div>
        : (
          <>
            {/* หัวหน้า */}
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <button onClick={() => router.push("/purchasing/vouchers")} className="text-xs text-slate-400 hover:text-blue-600">← กลับรายการใบสำคัญรับ</button>
                <h1 className="text-xl font-semibold text-slate-800 mt-1">🧾 ใบสำคัญรับ {hd.pv_no ? <span className="font-mono">{hd.pv_no}</span> : <span className="text-slate-400 text-base">(ร่าง — ยังไม่ออกเลข)</span>}
                  {/* ★ 2026-11-14 ใบร่างได้เลขตั้งแต่สร้าง (ตามวันที่ใบ · แก้วันที่ = เลขเปลี่ยน) */}
                  {hd.status === "draft" && hd.pv_no && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200 align-middle" title="เลขเดินตามวันที่ใบ — แก้วันที่ใบร่าง เลขจะเปลี่ยนตาม · กดยืนยันแล้วเลขล็อก">ร่าง · เลขเปลี่ยนตามวันที่ได้</span>}
                  {hd.status === "cancelled" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200 align-middle">❌ ยกเลิกแล้ว</span>}
                  {hd.status === "confirmed" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 align-middle">✅ ยืนยันแล้ว {hd.confirmed_at ? formatDate(hd.confirmed_at) : ""} {hd.confirmed_by ? `· ${hd.confirmed_by}` : ""}</span>}
                  {hd.status === "confirmed" && hd.revision > 1 && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 align-middle" title="ใบนี้ถูกแก้หลังยืนยันแล้ว — ดูประวัติการแก้ไขด้านขวา">v{hd.revision}</span>}
                  {editing && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 align-middle">กำลังแก้ไข → v{hd.revision + 1}</span>}
                </h1>
                <div className="text-sm text-slate-500 mt-0.5">🏪 {hd.seller_name ?? "—"} · ใบรับ {hd.gr_nos.join(", ") || "—"} · PO {hd.po_nos.join(", ") || "—"}{hd.tracking_no && <span className="ml-2 font-mono text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title="รหัสขนส่ง (จากใบส่งของ)">🚚 {hd.tracking_no}</span>}</div>
              </div>
              {(() => {
                /* ★ 2026-11-16 ปุ่ม "＋ ใบใหม่ ▾" (เจ้าของเลือกแบบ B) — ไปหน้ารายการแล้วเปิดป๊อป "ออกใบสำคัญรับ" ตามวิธีที่เลือก · มีที่ยังไม่บันทึก = ถามก่อน */
                const goNew = (mode: "gr" | "bill" | "china" | "manual") => { const to = `/purchasing/vouchers?new=${mode}`; if ((dirty || panelStatus.pending || dbStatus.pending || dbStatus.pending || dbStatus.pending) && !readonly) setLeaveTo(to); else router.push(to); };
                const newItems: RowMenuItem[] = [
                  { label: "จากใบรับ (GR)", onClick: () => goNew("gr") },
                  { label: "จากบิลร้าน (ให้ AI อ่าน)", onClick: () => goNew("bill") },
                  { label: "จากบิลโอนเงินจีน", onClick: () => goNew("china") },
                  { label: "สร้างเปล่า (ไม่มีใบรับ)", onClick: () => goNew("manual") },
                ];
                /* มือถือ (ข้อ 3): ปุ่มหัวใบรวมในเมนู ⋯ — ทำงานเหมือนปุ่มบน PC ทุกตัว */
                const mobileItems: RowMenuItem[] = [
                  ...grIds.map((gid) => ({ label: `พิมพ์ใบรับ ${data.lines.find((l) => l.gr_id === gid)?.gr_no ?? ""}`, onClick: () => { window.open(`/print/goods-receipt/${gid}`, "_blank"); } })),
                  { label: "พิมพ์ใบซื้อ (ใบสำคัญรับ)", onClick: () => { window.open(`/print/purchase-voucher/${id}`, "_blank"); } },
                  ...(canRevise && hd.status === "confirmed" && !editing ? [{ label: "แก้ไขใบ", onClick: () => { setReviseReason(""); setReviseOpen(true); } }] : []),
                  ...(!readonly && hd.status === "draft" ? [{ label: "ยกเลิกใบร่าง", onClick: () => setCancelOpen(true), danger: true }] : []),
                  ...(canEdit && hd.status === "confirmed" && !editing ? [{ label: "ยกเลิกใบนี้", onClick: () => setVoidOpen(true), danger: true }] : []),
                  ...(canEdit && splitInfo?.has_merge ? [{ label: `แยกใบกลับ (${splitInfo.merged.join(", ")})`, onClick: openSplit, title: splitInfo.can ? undefined : splitInfo.reason ?? undefined }] : []),
                  ...(canEdit ? newItems.map((it) => ({ ...it, label: `＋ ใบใหม่ · ${it.label}` })) : []),
                ];
                return (<>
              <div className="flex md:hidden items-center gap-2">
                {!readonly && hd.status === "draft" && <button onClick={() => void askConfirm()} disabled={saving} className="h-9 px-3 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40">✓ ยืนยัน</button>}
                <RowMenu items={mobileItems} label="⋯" title="เมนูใบนี้" buttonClassName="h-9 min-w-9 px-2 text-lg leading-none rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" />
              </div>
              <div className="hidden md:flex items-center gap-2 flex-wrap">
                {grIds.map((gid) => {
                  const no = data.lines.find((l) => l.gr_id === gid)?.gr_no ?? gid;
                  return <a key={gid} href={`/print/goods-receipt/${gid}`} target="_blank" rel="noreferrer" className="h-9 px-3 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 ใบรับ {no}</a>;
                })}
                <a href={`/print/purchase-voucher/${id}`} target="_blank" rel="noreferrer" className={`h-9 px-3 text-xs rounded-md border inline-flex items-center ${hd.status === "confirmed" ? "border-slate-800 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>🖨 ใบซื้อ (ใบสำคัญรับ)</a>
                {!readonly && hd.status === "draft" && <button onClick={() => setCancelOpen(true)} className="h-9 px-3 text-xs rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50">❌ ยกเลิกใบร่าง</button>}
                {canRevise && hd.status === "confirmed" && !editing && (
                  <button onClick={() => { setReviseReason(""); setReviseOpen(true); }} title={isAdmin ? "แก้ใบนี้โดยใช้เลขเดิม · ใบเดิมเก็บเป็นประวัติ" : "แก้ใบนี้โดยใช้เลขเดิม — ต้องใส่เหตุผล · ใบเดิมเก็บเป็นประวัติ"}
                    className="h-9 px-3 text-xs rounded-md border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"><Icon name="edit" mode="line" size={13} /> แก้ไขใบ</button>
                )}
                {canEdit && hd.status === "confirmed" && !editing && <button onClick={() => setVoidOpen(true)} title="ใส่ราคา/ค่าส่งผิด → ยกเลิกใบนี้ แล้วออกใบใหม่" className="h-9 px-3 text-xs rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50">❌ ยกเลิกใบนี้</button>}
                {/* ★ 2026-11-21 แยกใบกลับ — ใบนี้รวมใบอื่นเข้ามา (ยังไม่จ่าย) */}
                {canEdit && splitInfo?.has_merge && (
                  <button onClick={openSplit} title={splitInfo.can ? `ย้อนการรวม: คืน ${splitInfo.merged.join(", ")} พร้อมเลขเดิมและสถานะเดิม` : splitInfo.reason ?? ""}
                    className={`h-9 px-3 text-xs rounded-md border bg-white inline-flex items-center gap-1 ${splitInfo.can ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-slate-200 text-slate-400"}`}>↩ แยกใบกลับ</button>
                )}
                {/* บันทึกร่าง / ยืนยัน ย้ายไปการ์ด "ก่อนยืนยัน" ด้านขวา (แบบ B) — จอแคบการ์ดอยู่ล่างสุด จึงมีปุ่มสำรองบนหัว */}
                {!readonly && hd.status === "draft" && <button onClick={() => void askConfirm()} disabled={saving} className="xl:hidden h-9 px-4 text-sm font-medium rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40">✓ ยืนยัน + ออกเลข</button>}
                {canEdit && <RowMenu items={newItems} label="＋ ใบใหม่ ▾" title="ออกใบสำคัญรับใบใหม่"
                  buttonClassName="h-9 px-3 text-xs font-medium rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" />}
              </div>
                </>);
              })()}
            </div>

            {/* ★ 2026-11-15 กำลังแก้ใบที่ยืนยันแล้ว — บอกชัดว่ายังไม่จบ + ปุ่มจบ/ยกเลิก */}
            {editing && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 flex-wrap">
                <Icon name="edit" mode="line" size={18} className="text-amber-700 mt-0.5" />
                <div className="flex-1 min-w-[16rem] text-sm text-amber-900">
                  <div className="font-medium">กำลังแก้ใบที่ยืนยันแล้ว → จะเป็นเวอร์ชัน {hd.revision + 1}</div>
                  <div className="text-xs text-amber-800 mt-0.5">เหตุผล: &ldquo;{hd.edit_reason ?? "—"}&rdquo; · เปิดแก้โดย {hd.editing_by ?? "—"} {hd.editing_at ? formatDate(hd.editing_at) : ""} · ราคาใหม่จะเขียนกลับใบสั่งซื้อ/ราคาร้านตอนกด &ldquo;บันทึกการแก้ไข&rdquo;</div>
                </div>
                {canRevise && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setReviseCancelOpen(true)} disabled={reviseBusy} className="h-9 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิกการแก้</button>
                    <button onClick={() => preCheck("revise")} disabled={reviseBusy || saving} className="h-9 px-4 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{reviseBusy ? "กำลังบันทึก…" : "✓ บันทึกการแก้ไข"}</button>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              {/* ซ้าย: หัวใบ + รายการ */}
              <div className="space-y-4 min-w-0">
                <div className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs text-slate-500">วันที่ใบสำคัญ
                    <input type="date" value={h.voucher_date} disabled={readonly} onChange={(e) => setHeader({ voucher_date: e.target.value })} className={`${inputCls} w-full mt-1`} />
                  </label>
                  <div className="text-xs text-slate-500">สกุลราคาสินค้า
                    <div className="h-9 mt-1 flex items-center text-sm text-slate-800 font-medium">{sym} {currency === "YUAN" ? "RMB" : currency}<span className="text-[11px] text-slate-400 font-normal ml-1">(ตามใบสั่งซื้อ)</span></div>
                  </div>
                  {foreign && (
                    <label className="text-xs text-slate-500">เรท ฿ ต่อ 1 {sym.trim()} <span className="text-slate-400">(ค่าเริ่มต้น = เรทวันรับของ)</span>
                      <input type="number" inputMode="decimal" step="any" min={0} value={h.fx_rate} disabled={readonly} onChange={(e) => setHeader({ fx_rate: e.target.value })} className={`${inputCls} w-full mt-1 tabular-nums`} placeholder="เช่น 5.18" />
                    </label>
                  )}
                  <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-1">หมายเหตุ
                    <input value={h.note} disabled={readonly} onChange={(e) => setHeader({ note: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="เลขบิลขนส่ง / ชิปเมนต์…" />
                  </label>
                  {/* ★ 2026-11-15 ยอดในบิลร้านที่ไม่ใช่ค่าสินค้า (เจ้าของ: "รวมทั้งสิ้นต้องได้ 347.53 ตามบิล") — บิลร้านใส่ลงใบแล้วเติมให้เอง · แก้เองได้ */}
                  <label className="text-xs text-slate-500" title="运费 — ร้านส่งไปโกดัง · รวมในยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้นตามมูลค่า">{foreign ? "ค่าส่งในจีน (ร้าน→โกดัง)" : "ค่าส่งจากร้าน"} {sym.trim()}
                    <MoneyInput value={h.seller_ship_foreign} disabled={readonly} onChange={(v) => setHeader({ seller_ship_foreign: v })} className={`${inputCls} w-full mt-1 text-right`} placeholder="0.00" />
                  </label>
                  <label className="text-xs text-slate-500" title="支付手续费 — ค่าธรรมเนียมจ่ายเงิน (บัตร) เป็นบาท · รวมในยอดจ่ายร้าน + เฉลี่ยเข้าต้นทุนต่อชิ้น">ค่าธรรมเนียมจ่ายเงิน ฿
                    <MoneyInput value={h.pay_fee_thb} disabled={readonly} onChange={(v) => setHeader({ pay_fee_thb: v })} className={`${inputCls} w-full mt-1 text-right`} placeholder="0.00" />
                  </label>
                  <label className="text-xs text-slate-500 sm:col-span-2" title="实付款 — ยอดที่จ่ายจริงตามบิล ไว้เทียบว่าใบตรงบิลไหม (ไม่ได้บวกเข้ายอด)">ยอดจ่ายจริงตามบิล ฿ <span className="text-slate-400">(ไว้เทียบ ไม่บวกเข้ายอด)</span>
                    <div className="mt-1 flex items-center gap-2">
                      <MoneyInput value={h.paid_total_thb} disabled={readonly} onChange={(v) => setHeader({ paid_total_thb: v })} className={`${inputCls} w-40 text-right`} placeholder="0.00" />
                      {(() => {
                        const pd = paidDiff(t?.shop_total_thb, num(h.paid_total_thb));
                        if (pd == null) return null;
                        return Math.abs(pd) <= PAID_TOLERANCE_THB
                          ? <span className="text-[11px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">ตรงยอดใบ ฿{fmtMoney(t?.shop_total_thb ?? 0)}</span>
                          : <>
                              <span className="text-[11px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">ยอดใบ ฿{fmtMoney(t?.shop_total_thb ?? 0)} ต่าง ฿{fmtMoney(Math.abs(pd))}</span>
                              {foreign && !readonly && <button type="button" onClick={fitPaidTotal} className="text-[11px] text-blue-600 hover:underline whitespace-nowrap" title="หาเรทที่ทำให้ ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม = ยอดจ่ายจริงพอดี">ปรับเรทให้ตรงยอดจ่าย</button>}
                            </>;
                      })()}
                    </div>
                  </label>
                </div>

                {/* บิลจากร้าน (ภาษาจีน) — ใบหยวน = ทางหลักเติมราคา จึงเปิดไว้บนสุด · ใบบาทพับไว้ล่างสุด (แบบ B) */}
                {hasBills && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">รายการในใบ</span>
                    <span className="text-xs text-slate-400">{data.lines.length} รายการ · บิลร้าน {panelStatus.bills} ใบ</span>
                    <div className="ml-auto inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs" role="tablist" aria-label="มุมมองรายการ">
                      {([["bill", "แยกตามบิล"], ["all", "รวมเป็นตาราง"]] as const).map(([v, label], n) => (
                        <button key={v} type="button" role="tab" aria-selected={linesView === v} onClick={() => changeLinesView(v)}
                          className={`h-8 px-3 ${n > 0 ? "border-l border-slate-200" : ""} ${linesView === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* แผงต้องอยู่ตลอด (ซ่อนเฉย ๆ ในมุมรวม) — หน้าใบใช้บันทึกร่าง/งานแก้ PO ตอนยืนยันผ่าน controlRef */}
                {foreign && (
                  <div className={hasBills && !billView ? "hidden" : ""}>
                    <SellerBillPanel key={sellerKey} voucherId={id} readonly={readonly} onApplied={reloadKeep} controlRef={panelRef} hideSaveBar onStatus={onPanelStatus} lineMoney={lineMoney} onLinks={setBillLinks} />
                  </div>
                )}
                {hasBills && !billView && (
                  <div className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500">
                    <span>บิลร้าน {panelStatus.bills} ใบ</span>
                    {panelStatus.undecided > 0 && <span className="text-amber-700">· ยังมี {panelStatus.undecided} แถวในบิลรอยืนยัน</span>}
                    <button type="button" onClick={() => changeLinesView("bill")} className="ml-auto text-blue-600 hover:underline">{panelStatus.undecided > 0 ? "ไปยืนยันที่มุมแยกตามบิล" : "ดูแบบแยกตามบิล / เพิ่มบิล"}</button>
                  </div>
                )}

                {/* รายการ */}
                <div className="space-y-2">
                  {/* ★ 2026-11-14 ตารางกลาง MiniTable (เจ้าของ: "แบบ A แต่อยากให้ปรับขนาด column ได้เองด้วย")
                       — ลากขอบหัวคอลัมน์ปรับกว้าง (จำในเครื่อง) · ⋮ ที่หัวคอลัมน์ = พอดีเนื้อหา / คืนความกว้างเดิม
                       — คอลัมน์สินค้ากว้างขั้นต่ำ + ชื่อ 2 บรรทัด (ชี้ดูชื่อเต็ม) · ล็อกรูป+สินค้าไว้ซ้ายตอนเลื่อนขวา · จอแคบเลื่อนแทนการบีบ */}
                  {(() => {
                    const H = (t: string, tip?: string) => <span className="whitespace-nowrap" title={tip}>{t}</span>;
                    const allRows = data.lines.map((l, i) => {
                      const e = ln[l.id] ?? { unit_price: "", cbm_per_unit: "", kg_per_unit: "", ship_method: "" as const, qty: String(l.qty), discount: "", disc_mode: "amt" as const };
                      const c = calc.lines[i];
                      const lineMethod = c.method;   // วิธีคิดที่ใช้จริงกับบรรทัดนี้ (ระบุเอง หรือตามใบ)
                      return {
                        l, e, c, lineMethod,
                        manual: !l.gr_line_id,   // รายการที่เพิ่มเอง → แก้จำนวน/ลบได้ที่นี่
                        src: SOURCE_BADGE[e.unit_price ? (l.price_source ?? "manual") : "none"],
                        basisKey: (lineMethod === "weight" ? "kg_per_unit" : "cbm_per_unit") as "kg_per_unit" | "cbm_per_unit",
                        parentVal: lineMethod === "weight" ? l.parent_kg : l.parent_cbm,
                        bill: billLinks[l.id] ?? null,
                      };
                    });
                    // มุมแยกตามบิล: ตารางนี้เหลือเฉพาะรายการที่ไม่ได้มาจากบิล (จากใบรับ / เพิ่มเอง) · มุมรวม = ทุกรายการ
                    const rows = billView ? allRows.filter((r) => !r.bill) : allRows;
                    type R = (typeof allRows)[number];
                    const cols: MiniColumn<R>[] = [
                      /* ★ 2026-11-15 แถวบาง: รูปเล็กชี้ดูรูปใหญ่ · ชื่อบรรทัดเดียว · บรรทัดล่าง = รหัส · ใบรับ/PO · ที่มาราคา (โชว์เฉพาะที่ไม่ได้มาจากบิล) */
                      { key: "item", header: H("สินค้า"), width: "minmax(14rem,2fr)", sortValue: ({ l }) => l.item_name, cell: ({ l, src, manual }) => {
                        const name = l.item_name.replace(/^\s*\[[^\]]*\]\s*/, "");
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            <HoverPreview url={l.image_url} previewW={320}>
                              <div className="w-7 h-7 shrink-0 rounded bg-slate-50 overflow-hidden border border-slate-100">
                                {l.image_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.image_url} alt="" className="w-full h-full object-cover" />}
                              </div>
                            </HoverPreview>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 text-[13px] font-medium text-slate-800 min-w-0"><span className="truncate" title={name}>{name}</span><CopyButton value={name} title="คัดลอกชื่อ" /></div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap min-w-0">
                                <span className="font-mono truncate">{l.code || "—"}</span>{l.code && <CopyButton value={l.code} title="คัดลอกรหัส" />}
                                {manual
                                  ? (l.po_no
                                    ? <><span className="shrink-0 text-[10px] px-1 rounded border bg-violet-50 text-violet-700 border-violet-200" title="ผูกบรรทัดใบสั่งซื้อแล้ว (จากบิลร้าน) แต่ยังไม่ได้มาจากใบรับของ — ยังไม่เข้าสต๊อก">ยังไม่รับของ</span><span className="shrink-0">{l.po_no}</span></>
                                    : <span className="shrink-0 text-[10px] px-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-200" title="รายการที่เพิ่มเอง ไม่ได้มาจากใบรับ (ไม่ผูกสต๊อก/ใบสั่งซื้อ)">เพิ่มเอง</span>)
                                  : <span className="shrink-0" title="ใบรับ · ใบสั่งซื้อ">· {[l.gr_no, l.po_no].filter(Boolean).join(" · ")}</span>}
                                {src.text !== SOURCE_BADGE.bill.text && <span className={`shrink-0 text-[10px] px-1 rounded border whitespace-nowrap ${src.cls}`}>{src.text}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      } },
                      /* มุมรวมเป็นตาราง: มาจากบิลไหน (กดหัวคอลัมน์เรียงตามบิล) */
                      ...(hasBills && !billView ? [{ key: "bill", header: H("บิล", "รายการนี้มาจากบิลร้านใบไหน"), width: "5.5rem", sortValue: ({ bill }: R) => bill?.bill_no ?? "~", cell: ({ bill }: R) => bill
                        ? <span className="text-[11px] px-1.5 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200 font-mono whitespace-nowrap" title={`บิลร้าน No. ${bill.bill_no ?? "—"}`}>{bill.bill_no ? bill.bill_no.slice(-6) : "บิล"}</span>
                        : <span className="text-[11px] text-slate-400 whitespace-nowrap">ไม่มีบิล</span> }] : []),
                      { key: "qty", header: H("รับจริง"), align: "right", width: "6.5rem", cell: ({ l, e, manual }) => (
                        <div className="text-right tabular-nums whitespace-nowrap font-medium text-slate-800">
                          {manual && !readonly
                            ? <input type="number" inputMode="decimal" step="any" min={0} value={e.qty} onChange={(ev) => setLine(l.id, { qty: ev.target.value })} onFocus={(ev) => ev.target.select()} className={`${cellCls} w-16 text-right tabular-nums`} />
                            : l.qty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{l.uom}</span>
                        </div>
                      ) },
                      { key: "price", header: H(`ราคา/หน่วย (${sym.trim()})`), align: "right", width: "8.5rem", cell: ({ l, e, c }) => (
                        <div className="text-right">
                          <span title={l.sys_price != null ? `ราคาในระบบ ${sym}${fmtMoney(l.sys_price, 4)}` : undefined}><MoneyInput value={e.unit_price} disabled={readonly} onChange={(v) => setLine(l.id, { unit_price: v })} className={`${cellCls} w-24 text-right ${!c.has_price ? "border-amber-300" : ""}`} placeholder="0.00" /></span>
                          {/* ราคาในระบบโชว์เล็ก ๆ + ปุ่มไอคอนเส้น (ชี้ดูว่าคืออะไร): ใช้ราคาระบบ = ดึงมาใส่ · แทนราคาในระบบ = เอาราคานี้ไปเป็นราคาต่อร้าน */}
                          {l.item_sku_id && ((l.sys_price != null && Math.abs(num(e.unit_price) - l.sys_price) > 1e-9) || (l.sys_price == null && !readonly && num(e.unit_price) > 0)) && (
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400 whitespace-nowrap">
                              <span title={l.sys_price != null ? `ราคาในระบบ: ${SYS_SRC[l.sys_price_source ?? ""] ?? ""}` : "ยังไม่มีราคาในระบบ"}>ในระบบ {l.sys_price != null ? `${sym}${fmtMoney(l.sys_price, 4)}` : "—"}</span>
                              {!readonly && l.sys_price != null && Math.abs(num(e.unit_price) - l.sys_price) > 1e-9 && (
                                <button type="button" onClick={() => setLine(l.id, { unit_price: String(l.sys_price) })} title={`ใช้ราคาในระบบ — ใส่ ${sym}${fmtMoney(l.sys_price, 4)} (${SYS_SRC[l.sys_price_source ?? ""] ?? ""}) ลงช่องนี้`} aria-label="ใช้ราคาในระบบ"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Icon name="download" mode="line" size={13} /></button>
                              )}
                              {!readonly && num(e.unit_price) > 0 && (l.sys_price == null || Math.abs(num(e.unit_price) - l.sys_price) > 1e-9) && (
                                <button type="button" disabled={sysBusy === l.id} onClick={() => void replaceSysPrice(l.id, num(e.unit_price))} title={`แทนราคาในระบบ — บันทึก ${sym}${fmtMoney(num(e.unit_price), 4)} เป็นราคาต่อร้านของร้านนี้ทันที (ราคาเดิมเก็บในประวัติ)`} aria-label="แทนราคาในระบบ"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"><Icon name="upload" mode="line" size={13} /></button>
                              )}
                            </div>
                          )}
                        </div>
                      ) },
                      ...(foreign ? [{ key: "price_thb", header: H("฿/หน่วย", "ราคาต่อหน่วยเป็นบาท (ราคา × เรท)"), align: "right" as const, width: "5.5rem", cell: ({ c }: R) => <span className="tabular-nums text-slate-600">{c.has_price ? fmtMoney(c.unit_price_thb) : "—"}</span> }] : []),
                      { key: "disc", header: H("ส่วนลด", "ส่วนลดของรายการนี้ — ใส่เป็นยอดเงิน หรือ % (กดปุ่มข้างช่องสลับ) · ค่าสินค้า = จำนวน × ราคา − ส่วนลด"), align: "right", width: "6.5rem", cell: ({ l, e, c }) => (
                        <div className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <input type="number" inputMode="decimal" step="any" min={0} value={e.discount ?? ""} disabled={readonly} onChange={(ev) => setLine(l.id, { discount: ev.target.value })} onFocus={(ev) => ev.target.select()}
                              className={`${cellCls} w-14 text-right tabular-nums ${num(e.discount) > 0 ? "border-red-200 text-red-600" : ""}`} placeholder="0" title="ส่วนลดของรายการนี้" />
                            <button type="button" disabled={readonly} onClick={() => setLine(l.id, { disc_mode: e.disc_mode === "pct" ? "amt" : "pct" })} title={e.disc_mode === "pct" ? "ตอนนี้: เป็น % — กดเพื่อใส่เป็นยอดเงิน" : "ตอนนี้: เป็นยอดเงิน — กดเพื่อใส่เป็น %"}
                              className="h-7 min-w-7 px-1 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">{e.disc_mode === "pct" ? "%" : sym.trim() || "฿"}</button>
                          </div>
                          {e.disc_mode === "pct" && c.discount_foreign > 0 && <div className="text-[10px] text-red-400 mt-0.5">= −{sym}{fmtMoney(c.discount_foreign)}</div>}
                        </div>
                      ) },
                      { key: "total", header: H("ค่าสินค้า ฿"), align: "right", width: "6.5rem", cell: ({ c }) => <span className="tabular-nums text-slate-800">{c.has_price ? fmtMoney(c.line_total_thb) : "—"}</span> },
                      ...(anyShip ? [
                        { key: "method", header: H("คิดจาก"), width: "5.5rem", cell: ({ l, e }: R) => (
                          /* วิธีคิดเฉพาะบรรทัด — ว่าง = ตามค่าเริ่มต้นของใบ · มาจากใบส่งของ (BOX=คิว, CLOTH BLOCK=กก.) หรือเลือกเอง */
                          <select value={e.ship_method} disabled={readonly} onChange={(ev) => setLine(l.id, { ship_method: ev.target.value as "" | "cube" | "weight" })}
                            className={`${cellCls} w-full ${e.ship_method ? "border-indigo-300 bg-indigo-50" : ""}`}
                            title={`คิดค่าส่งบรรทัดนี้จากอะไร — ตามใบ = ${h.ship_method === "cube" ? "คิว" : h.ship_method === "weight" ? "น้ำหนัก" : "ไม่คิด"}`}>
                            <option value="">ตามใบ</option>
                            <option value="cube">คิว</option>
                            <option value="weight">กก.</option>
                          </select>
                        ) },
                        { key: "basis", header: H("คิว/กก. ต่อชิ้น"), align: "right" as const, width: "7.5rem", cell: ({ l, e, lineMethod, basisKey, parentVal }: R) => (
                          <div className="text-right whitespace-nowrap">
                            {lineMethod === "none" ? <span className="text-slate-300 text-xs">—</span> : (
                              <>
                                <div className="flex items-center justify-end gap-1">
                                  <input type="number" inputMode="decimal" step="any" min={0} value={e[basisKey]} disabled={readonly} onChange={(ev) => setLine(l.id, { [basisKey]: ev.target.value })}
                                    className={`${cellCls} w-20 text-right tabular-nums ${!e[basisKey] ? "border-amber-300" : ""}`} placeholder={lineMethod === "cube" ? "0.0000" : "0.000"} />
                                  <span className="text-[10px] text-slate-400 w-5">{lineMethod === "cube" ? "คิว" : "กก."}</span>
                                </div>
                                {parentVal != null && String(parentVal) !== e[basisKey] && !readonly && (
                                  <button onClick={() => setLine(l.id, { [basisKey]: String(parentVal) })} title="ใช้ค่าจากขนาด/น้ำหนักที่ตั้งไว้ที่ Parent SKU" className="block ml-auto text-[10px] text-indigo-600 hover:underline">ใช้ค่าตัวแม่ {parentVal}</button>
                                )}
                              </>
                            )}
                          </div>
                        ) },
                        { key: "ship", header: H("ค่าส่ง ฿"), align: "right" as const, width: "5rem", cell: ({ c }: R) => <span className="tabular-nums text-orange-700">{c.ship_alloc_thb > 0 ? fmtMoney(c.ship_alloc_thb) : <span className="text-slate-300">-</span>}</span> },
                        { key: "landed", header: H("ถึงมือ/ชิ้น ฿"), align: "right" as const, width: "5.5rem", cell: ({ c }: R) => <span className="tabular-nums font-medium text-slate-800">{c.has_price ? fmtMoney(c.landed_unit_thb) : "—"}</span> },
                      ] : []),
                      /* ★ 2026-11-15 เจ้าของ: "เพิ่มรายการเอง ต้องลบได้ด้วย เอาปุ่มลบไปไว้หลังสุด" — เดิมเป็นไอคอนจางข้างช่องจำนวน หาไม่เจอ
                           รายการเพิ่มเอง/จากบิลร้าน = ลบได้ (ถามก่อน) · รายการจากใบรับ = แม่กุญแจ (จำนวนต้องตรงของที่รับจริง → ลบที่ใบรับ) */
                      ...(readonly ? [] : [{ key: "del", header: "", align: "center" as const, width: "2.75rem", cell: ({ l, manual }: R) => manual ? (
                        <button type="button" onClick={() => setDelLine(l)} title="ลบรายการนี้" aria-label="ลบรายการนี้"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Icon name="delete" mode="line" size={15} /></button>
                      ) : (
                        <span title={`มาจากใบรับ ${l.gr_no ?? ""} — ลบที่นี่ไม่ได้ (จำนวนต้องตรงกับของที่รับจริง) ให้แก้/ลบที่ใบรับ`} className="inline-flex h-7 w-7 items-center justify-center text-slate-300"><Icon name="lock" mode="line" size={14} /></span>
                      ) }]),
                    ];
                    if (billView && rows.length === 0) return null;   // ทุกรายการมาจากบิล → ไม่ต้องมีกล่อง "ไม่มีบิล"
                    const table = (
                      <div id="pv-lines" className="scroll-mt-4">
                      <MiniTable rows={rows} rowKey={(r) => r.l.id} columns={cols} hideToolbar zebra={false} dense resizable storageKey="pv-lines-c" columnMenu={{}} stickyCols={1}
                        emptyText={<span className="text-xs">— ยังไม่มีรายการ — เพิ่มจากแถบด้านล่าง</span>} />
                      </div>
                    );
                    return billView ? (
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-sm">
                          <span className="font-medium text-slate-800">ไม่มีบิล</span>
                          <span className="text-[11px] text-slate-500">{rows.length} รายการ · จากใบรับ / เพิ่มเอง — แก้ในแถวได้เลย</span>
                        </div>
                        {table}
                      </div>
                    ) : table;
                  })()}
                  {/* ＋ เพิ่มรายการเอง (ของที่ไม่ได้อยู่ในใบรับ / ใบที่สร้างเปล่า) · รายการจากใบรับ แก้จำนวน/ลบที่ใบรับ — พับไว้ (แบบ B) · ใบว่างเปิดให้เลย */}
                  {!readonly && !addOpen && data.lines.length > 0 && (
                    <button type="button" onClick={() => setAddOpen(true)} className="w-full rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50 hover:text-blue-600">＋ เพิ่มรายการเอง (ค่ากล่อง · ของแถม · สินค้าที่ไม่อยู่ในใบรับ)</button>
                  )}
                  {!readonly && (addOpen || data.lines.length === 0) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 flex items-end gap-2 flex-wrap">
                      {/* ★ 2026-11-14 เลือกสินค้า = เพิ่มทันที (ไม่มีปุ่ม + เพิ่ม) · พิมพ์ชื่อเอง + Enter = เพิ่ม · จำนวน/ราคา/ส่วนลด แก้ต่อในตาราง */}
                      <div className="w-72"><label className="block text-[11px] text-slate-500 mb-0.5">＋ เพิ่มรายการ — เลือกจากคลังสินค้า (เลือกแล้วเพิ่มเลย)</label><SkuPicker value={addSku} onChange={(p) => { setAddSku(null); if (p) void addLine(p, ""); }} placeholder="ค้นหารหัส / ชื่อสินค้า…" showSourcing /></div>
                      <div className="flex-1 min-w-[10rem]"><label className="block text-[11px] text-slate-500 mb-0.5">หรือพิมพ์ชื่อเอง (เช่น ค่ากล่อง, ของแถม) แล้วกด Enter</label><input value={addName} disabled={addBusy} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && addName.trim()) void addLine(null, addName); }} className={`${inputCls} w-full`} placeholder="ชื่อรายการ แล้วกด Enter" /></div>
                      {addBusy && <span className="h-9 inline-flex items-center text-xs text-slate-500">กำลังเพิ่ม…</span>}
                      <span className="text-[11px] text-slate-400 basis-full">ได้จำนวน 1 + ราคาในระบบ (ถ้ามี) → แก้จำนวน / ราคา / ส่วนลด ในตารางได้เลย · รายการจากใบรับ แก้จำนวนหรือลบต้องทำที่ใบรับ · รายการที่เพิ่มเองกด 🗑 ลบได้</span>
                    </div>
                  )}
                </div>

                {/* ค่าส่ง + ใบส่งของจากขนส่ง — พับไว้ (เปิดเองเมื่อมีปัญหา) · แบบ B */}
                <CollapseCard title="🚚 ค่าส่ง" defaultOpen={shipIssue} tone={shipIssue ? "warn" : undefined} id="pv-ship" openSignal={shipCardOpen}
                  summary={!anyShip ? "ไม่คิดค่าส่ง · กดเพื่อเลือกร้านขนส่ง" : `${h.carrier_name || SHIP_LABEL[h.ship_method]} · ฿${fmtMoney(t?.ship_total_thb)}${shipIssue ? ` · ขาดข้อมูล ${(t?.missing_basis_count ?? 0) + (t?.missing_rate_count ?? 0)} รายการ` : ""}`}>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* ร้านขนส่งจากตั้งค่ากลาง — เลือกแล้วตั้งวิธีคิด + เรทให้ · เพิ่ม/แก้เรทที่เมนู ร้านขนส่ง */}
                        <select value={h.carrier_id} disabled={readonly}
                          onChange={(e) => { const c = carriers.find((x) => x.id === e.target.value); if (!c) { setHeader({ carrier_id: "", carrier_name: "" }); return; } setHeader({ carrier_id: c.id, carrier_name: c.name, ship_method: c.method, ship_rate_cube: c.rate_cube == null ? "" : String(c.rate_cube), ship_rate_kg: c.rate_kg == null ? "" : String(c.rate_kg) }); }}
                          className={`${inputCls} max-w-[18rem]`} title="ร้านขนส่ง / เรทค่าส่ง">
                          <option value="">— ร้านขนส่ง (ไม่ระบุ) —</option>
                          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {[c.rate_cube != null ? `฿${fmtMoney(c.rate_cube, 0)}/คิว` : null, c.rate_kg != null ? `฿${fmtMoney(c.rate_kg, 0)}/กก.` : null].filter(Boolean).join(" · ") || "ยังไม่ตั้งเรท"}</option>)}
                          {h.carrier_id && !carriers.some((c) => c.id === h.carrier_id) && <option value={h.carrier_id}>{h.carrier_name || "ร้านขนส่ง (ปิดใช้แล้ว)"}</option>}
                        </select>
                        {!readonly && <a href="/m/freight-carriers" target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-blue-600">⚙ ตั้งค่าร้านขนส่ง</a>}
                        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                          {(["none", "cube", "weight"] as ShipMethod[]).map((m, i) => (
                            <button key={m} type="button" disabled={readonly} onClick={() => setHeader({ ship_method: m })} title="วิธีคิดเริ่มต้น — บรรทัดที่ไม่ได้ระบุเอง (จากใบส่งของ) จะใช้แบบนี้"
                              className={`h-8 px-3 ${i > 0 ? "border-l border-slate-200" : ""} ${h.ship_method === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-70`}>{SHIP_LABEL[m]}</button>
                          ))}
                        </div>
                        {anyShip && (
                          <>
                            <label className="text-xs text-slate-500 flex items-center gap-1.5">฿/คิว
                              <MoneyInput value={h.ship_rate_cube} disabled={readonly} onChange={(v) => setHeader({ ship_rate_cube: v })} className={`${inputCls} w-20 text-right ${(t?.charged_cbm ?? 0) > 0 && !num(h.ship_rate_cube) ? "border-amber-300" : ""}`} />
                            </label>
                            <label className="text-xs text-slate-500 flex items-center gap-1.5">฿/กก.
                              <MoneyInput value={h.ship_rate_kg} disabled={readonly} onChange={(v) => setHeader({ ship_rate_kg: v })} className={`${inputCls} w-20 text-right ${(t?.charged_kg ?? 0) > 0 && !num(h.ship_rate_kg) ? "border-amber-300" : ""}`} />
                            </label>
                            <span className="text-xs text-slate-500">
                              {(t?.charged_cbm ?? 0) > 0 && <>{(t?.charged_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว × {fmtMoney(num(h.ship_rate_cube), 0)}</>}
                              {(t?.charged_cbm ?? 0) > 0 && (t?.charged_kg ?? 0) > 0 && " + "}
                              {(t?.charged_kg ?? 0) > 0 && <>{(t?.charged_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก. × {fmtMoney(num(h.ship_rate_kg), 0)}</>}
                              {" = "}<b className="text-slate-700">฿{fmtMoney(t?.ship_from_rate_thb)}</b>
                            </span>
                            <label className="text-xs text-slate-500 flex items-center gap-1.5 ml-2">ยอดจริงจากบิลขนส่ง (ทับ)
                              <MoneyInput value={h.ship_manual_total} disabled={readonly} onChange={(v) => setHeader({ ship_manual_total: v })} className={`${inputCls} w-28 text-right`} placeholder="ว่าง = ใช้เรท" />
                            </label>
                          </>
                        )}
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-400">แต่ละบรรทัดเลือกคิดจาก คิว หรือ น้ำหนัก ได้เอง (คอลัมน์ "คิดจาก") · อ่านใบส่งของแล้วระบบเลือกให้ตามกฎ Description (BOX = คิว, CLOTH BLOCK = น้ำหนัก) <a href="/m/freight-description-rules" target="_blank" rel="noreferrer" className="hover:text-blue-600 underline decoration-dotted">⚙ แก้กฎ</a></div>
                      {anyShip && (t?.missing_basis_count ?? 0) > 0 && (
                        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ {t?.missing_basis_count} รายการยังไม่มีคิว/กก. ตามวิธีที่เลือก (ไม่ได้ตั้งขนาด/น้ำหนักที่ Parent SKU และยังไม่ได้อ่านจากใบส่งของ) → รายการนั้นจะไม่ได้รับค่าส่ง ใส่เองในตารางได้{billView && <> (<button type="button" onClick={() => changeLinesView("all")} className="underline">กด รวมเป็นตาราง</button>)</>}</div>
                      )}
                      {anyShip && (t?.missing_rate_count ?? 0) > 0 && (
                        <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ {t?.missing_rate_count} รายการมีปริมาณแต่ยังไม่มีเรทของวิธีนั้น (ใส่ ฿/คิว หรือ ฿/กก. ให้ครบ)</div>
                      )}
                    </div>
    
                    {/* ใบส่งของจากขนส่ง — AI อ่านรหัสขนส่ง + น้ำหนัก/คิวรายกล่อง → เกลี่ยให้ทุกสินค้าตามมูลค่า → ใช้ค่าจริง */}
                    <div id="pv-delivery" className="scroll-mt-4">
                    <DeliveryBillPanel voucherId={id} readonly={readonly}
                      lines={data.lines.map((l) => ({ id: l.id, code: l.code, item_name: l.item_name, qty: l.qty, uom: l.uom, gr_no: l.gr_no, is_product: !!l.item_sku_id, kg_per_unit: l.kg_per_unit, cbm_per_unit: l.cbm_per_unit, unit_price: l.unit_price, discount: l.discount, discount_pct: l.discount_pct }))}
                      onApplied={reloadKeep} controlRef={deliveryRef} onStatus={onDbStatus}
                      beforeApply={async () => (dirty ? await save() : true)} />
                    </div>
                  </div>
                </CollapseCard>

                {!foreign && (
                  <CollapseCard title="✨ มีบิลจีน? ให้ AI อ่าน + เติมราคา" summary="ใช้กับบิลร้านภาษาจีน">
                    <SellerBillPanel key={sellerKey} voucherId={id} readonly={readonly} onApplied={reloadKeep} bare controlRef={panelRef} hideSaveBar onStatus={onPanelStatus} />
                  </CollapseCard>
                )}
              </div>

              {/* ขวา: สรุปยอด (ค่าส่งแยกบรรทัด ไม่รวมในราคาสินค้า) + การจ่ายเงิน (หลังยืนยัน) */}
              <aside className={`space-y-3 ${hd.status === "draft" || editing ? "xl:sticky xl:top-4 xl:self-start" : ""}`}>
                {/* ร่าง: เช็กลิสต์ก่อนยืนยัน + สรุปยอด + ปุ่มยืนยัน (แบบ B) */}
                {((hd.status === "draft" && canEdit) || (editing && canRevise)) && (
                  <VoucherChecklistCard items={checklist} totals={totals} foreign={foreign} sym={sym} fxRate={h.fx_rate} refFx={data?.ref_fx_rate ?? null} refFxDate={fxDailyDate ?? data?.ref_fx_date ?? null} docDate={h.voucher_date} onEditFx={readonly ? undefined : () => setFxOpen(true)} dirty={dirty} saving={saving || reviseBusy}
                    onSave={() => void save()} onConfirm={editing ? () => preCheck("revise") : () => void askConfirm()} onSetGoodsThb={readonly ? undefined : setGoodsThb}
                    revise={editing ? { nextRev: hd.revision + 1 } : null} hideSave onSetShip={readonly ? undefined : (v) => setHeader({ ship_manual_total: v == null ? "" : String(v) })}
                    shipFix={(shipZero?.causes.length ?? 0) > 0 || shipUndo ? shipFixBox(true) : null} hideShipItem={(shipZero?.causes.length ?? 0) > 0} />
                )}
                {hd.status === "draft" && <SendToChinaPayButton voucherId={id} currency={currency} status={hd.status} chinaBillId={hd.china_bill_id} />}
                {/* ยืนยันแล้ว: งานถัดไป (พิมพ์ · จ่ายค่าสินค้า · ค่าส่ง) */}
                {hd.status === "confirmed" && (
                  <VoucherNextSteps voucherId={id} header={hd} foreign={foreign} sym={sym} canEdit={canEdit} payBusy={payBusy} lastConfirm={lastConfirm}
                    onMarkPoPaid={(po, paid) => void markPoPaid(po, paid)}
                    shippingSlot={(
                          <div className="border border-orange-200 bg-orange-50/40 rounded-lg px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-600">🚚 ค่าส่ง {hd.carrier_name ? `· ${hd.carrier_name}` : ""}</span>
                              <span className="tabular-nums font-medium text-orange-700">฿{fmtMoney(hd.ship_total_thb)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              {hd.shipping_payment_status === "paid"
                                ? <span className="text-xs text-emerald-700">🟢 จ่ายแล้ว {hd.shipping_paid_date ? formatDate(hd.shipping_paid_date) : ""}</span>
                                : <span className="text-xs text-amber-700">🟡 ค่าส่ง รอจ่าย</span>}
                              {canEdit && (hd.shipping_payment_status === "paid"
                                ? <button onClick={() => void setShippingPaid(false)} disabled={payBusy} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">↩ ยกเลิกจ่าย</button>
                                : <button onClick={() => void setShippingPaid(true)} disabled={payBusy} className="h-7 px-2.5 text-[11px] font-medium rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50">💰 จ่ายค่าส่งแล้ว</button>)}
                            </div>
                            {canEdit && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <select value={hd.shipping_bill_id ?? ""} onFocus={() => { if (shipBills.length === 0) void loadShipBills(); }} disabled={payBusy}
                                  onChange={(e) => void setShippingPaid(hd.shipping_payment_status === "paid", e.target.value || null)}
                                  className={`${inputCls} h-7 text-[11px] flex-1 min-w-0`} title="ผูกบิลค่าส่งจากแอปโอนเงินจีน (บิลที่ติ๊ก ค่าส่ง)">
                                  <option value="">— ผูกบิลค่าส่ง (แอปโอนเงินจีน) —</option>
                                  {hd.shipping_bill_id && !shipBills.some((b) => b.id === hd.shipping_bill_id) && <option value={hd.shipping_bill_id}>บิลที่ผูกไว้</option>}
                                  {shipBills.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                    )} />
                )}
                {/* สรุปยอด — ใบที่ยืนยัน/ยกเลิกแล้ว หรือคนที่ไม่มีสิทธิ์แก้ (การ์ดเช็กลิสต์มีสรุปยอดในตัวแล้ว) */}
                {(hd.status !== "draft" || !canEdit) && !(editing && canRevise) && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">สรุปยอด</div>
                    <dl className="text-sm space-y-1.5">
                      {foreign && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า ({sym.trim()})</dt><dd className="tabular-nums">{sym}{fmtMoney(t?.subtotal_foreign)}</dd></div>}
                      {foreign && <div className="flex justify-between text-xs"><dt className="text-slate-400">เรท</dt><dd className="tabular-nums text-slate-500">× {h.fx_rate || "—"}</dd></div>}
                      <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า (฿)</dt><dd className="tabular-nums font-medium">฿{fmtMoney(t?.subtotal_thb)}</dd></div>
                      {(t?.seller_ship_foreign ?? 0) > 0 && <div className="flex justify-between"><dt className="text-slate-500">ค่าส่งในจีน{foreign ? <span className="text-[11px] text-slate-400"> {sym}{fmtMoney(t?.seller_ship_foreign)}</span> : null}</dt><dd className="tabular-nums">฿{fmtMoney(t?.seller_ship_thb)}</dd></div>}
                      {(t?.pay_fee_thb ?? 0) > 0 && <div className="flex justify-between"><dt className="text-slate-500">ค่าธรรมเนียมจ่ายเงิน</dt><dd className="tabular-nums">฿{fmtMoney(t?.pay_fee_thb)}</dd></div>}
                      <div className="flex justify-between"><dt className="text-slate-500">ค่าส่ง (฿) <span className="text-[10px] text-slate-400">แยก ไม่รวมในราคาสินค้า</span></dt><dd className="tabular-nums text-orange-700">฿{fmtMoney(t?.ship_total_thb)}</dd></div>
                      {anyShip && (t?.charged_cbm ?? 0) > 0 && <div className="flex justify-between text-xs"><dt className="text-slate-400">คิดตามคิว</dt><dd className="tabular-nums text-slate-500">{(t?.charged_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว × ฿{fmtMoney(num(h.ship_rate_cube), 0)}</dd></div>}
                      {anyShip && (t?.charged_kg ?? 0) > 0 && <div className="flex justify-between text-xs"><dt className="text-slate-400">คิดตามน้ำหนัก</dt><dd className="tabular-nums text-slate-500">{(t?.charged_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก. × ฿{fmtMoney(num(h.ship_rate_kg), 0)}</dd></div>}
                      <div className="flex justify-between border-t border-slate-200 pt-2 mt-2"><dt className="text-slate-700 font-semibold">รวมทั้งสิ้น (฿)</dt><dd className="tabular-nums font-bold text-slate-900 text-base">฿{fmtMoney(t?.grand_total_thb)}</dd></div>
                    </dl>
                    {num(h.paid_total_thb) > 0 && (() => { const pd = paidDiff(t?.shop_total_thb, num(h.paid_total_thb)) ?? 0; return (
                      <div className={`mt-2 text-xs ${Math.abs(pd) <= PAID_TOLERANCE_THB ? "text-emerald-700" : "text-amber-700"}`}>จ่ายจริงตามบิล ฿{fmtMoney(num(h.paid_total_thb))} · {Math.abs(pd) <= PAID_TOLERANCE_THB ? "ตรง ✓" : `ยอดใบต่าง ฿${fmtMoney(Math.abs(pd))}`}</div>
                    ); })()}
                  </div>
                )}
                {/* ★ 2026-11-15 ประวัติการแก้ไข (ทุกเวอร์ชัน · อะไรเปลี่ยน · ดูใบเก่า) */}
                {hd.status !== "draft" && <RevisionHistory key={histKey} voucherId={id} sym={sym} />}
              </aside>
            </div>

            {/* ★ 2026-11-15 เจ้าของ: "ขอปุ่มบันทึกร่างด้วย" — แถบเดียวติดล่างจอ บันทึกทั้งหน้า (บิลร้าน + หัวใบ + รายการ) กดได้ตลอด (ของกลาง SaveBar) */}
            {!readonly && (
              <SaveBar dirty={dirty || panelStatus.pending} saving={saving || reviseBusy} savedAt={savedAt} alwaysEnabled
                saveLabel={editing ? "💾 เก็บที่แก้ไว้ก่อน" : "💾 บันทึกร่าง"} onSave={saveAll}
                note={editing ? `กำลังแก้ → เวอร์ชัน ${hd.revision + 1} · กด "บันทึกการแก้ไข" เมื่อเสร็จ` : "บิลร้าน + หัวใบ + รายการ"}
                extra={editing
                  ? (canRevise ? <button type="button" onClick={() => preCheck("revise")} disabled={reviseBusy || saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">✓ บันทึกการแก้ไข</button> : null)
                  : (hd.status === "draft" && canEdit ? <button type="button" onClick={() => void askConfirm()} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">✓ ยืนยัน + ออกเลข</button> : null)} />
            )}
          </>
        )}
      </div>

      {/* ยืนยัน — ป๊อปบอก 4 อย่างที่จะเกิด (ออกเลข · อัปเดตราคา 3 ที่ · ใบล็อก · ต่อไปจ่ายเงิน) · แบบ B */}
      {confirmOpen && data && hd && calc && (
        <VoucherConfirmModal header={hd} items={checklist} totals={totals} foreign={foreign} sym={sym} fxRate={h.fx_rate} skuCount={skuCount}
          confirming={confirming} onClose={() => setConfirmOpen(false)} onConfirm={() => void confirm()} poPlanLabels={panelRef.current?.poPlanLabels() ?? []}
          shipFix={shipFixBox()} shipZero={(shipZero?.causes.length ?? 0) > 0} autoApplied={autoApplied} />
      )}
      {/* ยืนยันลบรายการที่เพิ่มเอง */}
      {delLine && (
        <ERPModal open onClose={() => !addBusy && setDelLine(null)} size="sm" storageKey="pv-line-del"
          title="🗑 ลบรายการ" description={delLine.item_name.replace(/^\s*\[[^\]]*\]\s*/, "")}
          footer={<>
            <button onClick={() => setDelLine(null)} disabled={addBusy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ไม่ลบ</button>
            <button onClick={() => void removeLine()} disabled={addBusy} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{addBusy ? "กำลังลบ…" : "ยืนยันลบ"}</button>
          </>}>
          <p className="text-sm text-slate-600">ลบรายการนี้ออกจากใบสำคัญ ({delLine.qty.toLocaleString()} {delLine.uom ?? ""}) — ยอดรวมและค่าส่งเฉลี่ยจะคิดใหม่</p>
          {delLine.price_source === "bill" && <p className="mt-2 text-xs text-slate-500">รายการนี้มาจากบิลร้าน — แถวในบิลจะกลับเป็น &quot;ยังไม่ใส่ลงใบ&quot; (กดยืนยันหรือข้ามใหม่)</p>}
        </ERPModal>
      )}
      {/* ★ 2026-11-21 ข้อเสนอ 1 — ส่งมาพร้อมใบอื่นไหม? (ก่อนยืนยัน + ออกเลข) */}
      {shipAsk && hd && (
        <ERPModal open onClose={() => setShipAsk(null)} size="md" storageKey="pv-ship-together"
          title="ส่งมาพร้อมใบอื่นไหม?" description={`${hd.seller_name ?? "ร้านนี้"} มีใบที่ยังไม่มีค่าส่ง (ห่างไม่เกิน 14 วัน)`}
          footer={<>
            <button onClick={() => { setShipAsk(null); setConfirmOpen(true); }} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ไม่ใช่ · ยืนยันเลย</button>
            <button onClick={() => { const to = `/purchasing/vouchers?merge=${[id, ...shipAsk.map((x) => x.id)].join(",")}`; setShipAsk(null); if (dirty || panelStatus.pending) setLeaveTo(to); else router.push(to); }}
              className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">รวมก่อน</button>
          </>}>
          <p className="text-sm text-slate-600 mb-2">ถ้าของมารถคันเดียวกัน รวมใบก่อนแล้วใส่ค่าส่งครั้งเดียว — ค่าส่งจะเฉลี่ยลงทุกรายการถูกต้อง</p>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {shipAsk.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">{o.pv_no ?? "ใบร่าง"}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${o.status === "confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{o.status === "confirmed" ? "ยืนยันแล้ว · ยังไม่จ่าย" : "ร่าง"}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(o.voucher_date)}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums whitespace-nowrap">฿{fmtMoney(o.grand_total_thb)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">กด รวมก่อน = ไปหน้ารายการแล้วเปิดขั้นรวมโดยติ๊กใบเหล่านี้ไว้ให้ (ตรวจได้ก่อนกดรวม)</p>
        </ERPModal>
      )}
      <FxRateQuickModal open={fxOpen} onClose={() => setFxOpen(false)} currency={currency} value={h.fx_rate} refDate={h.voucher_date} onApply={(r) => setHeader({ fx_rate: String(r) })} onDailyChanged={setFxDailyDate} />
      {/* ★ 2026-11-22 ใบส่งของ: ยังไม่บันทึก / ค่าส่ง ฿0 — ถามก่อนยืนยันหรือบันทึกการแก้ไข */}
      {dbAsk && (
        <ERPModal open onClose={() => !dbBusy && setDbAsk(null)} size="sm" storageKey="pv-delivery-precheck"
          title={dbAsk.kind === "unsaved" ? "บันทึกใบส่งของไม่สำเร็จ" : (t?.ship_total_thb ?? 0) > 0 ? "ค่าส่งพร้อมแล้ว" : "ค่าส่งยังเป็น ฿0"}
          footer={dbAsk.kind === "unsaved" ? <>
            <button onClick={() => setDbAsk(null)} disabled={dbBusy} className="mr-auto px-3 h-9 text-sm text-slate-500 hover:text-slate-700">กลับไปแก้</button>
            <button onClick={() => { deliveryRef.current?.discard(); void preCheck(dbAsk.next, ["unsaved"]); }} disabled={dbBusy} className="px-4 h-9 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50">ทิ้งที่แก้</button>
            <button onClick={() => void dbSaveThen()} disabled={dbBusy} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{dbBusy ? "กำลังบันทึก…" : "ลองบันทึกอีกครั้ง"}</button>
          </> : <>
            {/* ★ 11-27 ก่อนบันทึกการแก้ไข: ค่าส่ง ฿0 → สาเหตุ + ปุ่มแก้ (กล่องเดียวกับป๊อปยืนยัน) · แก้แล้ว = ปุ่มบันทึกปกติ */}
            <button onClick={() => setDbAsk(null)} disabled={dbBusy} className="mr-auto px-3 h-9 text-sm text-slate-500 hover:text-slate-700">ยกเลิก</button>
            <button onClick={() => void preCheck(dbAsk.next, ["unsaved", "apply", "ship0"])} disabled={dbBusy}
              className={(t?.ship_total_thb ?? 0) > 0 ? "px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40" : "px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"}>
              {(t?.ship_total_thb ?? 0) > 0 ? "บันทึกการแก้ไข" : "บันทึกโดยไม่มีค่าส่ง"}</button>
          </>}>
          {dbAsk.kind === "unsaved"
            ? <p className="text-sm text-slate-600">ระบบบันทึกที่แก้ในใบส่งของ (ลบแถว · แก้ตัวเลข · เลือกว่ากล่องเป็นของใบไหน) ให้ไม่สำเร็จ — ลองบันทึกอีกครั้ง หรือทิ้งที่แก้แล้วไปต่อ</p>
            : <div className="text-sm text-slate-600 space-y-2">
                <p>ใบนี้มีกล่องในใบส่งของ {dbStatus.mineRows} กล่อง · ค่าส่งตอนนี้ <b className="text-orange-700">฿{fmtMoney(t?.ship_total_thb ?? 0)}</b></p>
                {shipFixBox()}
              </div>}
        </ERPModal>
      )}
      {/* ★ 2026-11-21 ข้อเสนอ 2 — แยกใบกลับ */}
      <ConfirmDialog open={splitAsk} onClose={() => !splitBusy && setSplitAsk(false)} onConfirm={() => void doSplit()} loading={splitBusy}
        title="แยกใบกลับ?" confirmText="แยกใบกลับ" cancelText="ยกเลิก"
        message={`ใบ ${(splitInfo?.merged ?? []).join(", ")} จะกลับมาพร้อมเลขเดิมและสถานะเดิม · รายการ / บิลร้าน / ใบส่งของ / ใบรับ ย้ายกลับใบเดิม · ใบนี้กลับเป็นค่าก่อนรวม: ค่าส่งในจีน / ค่าธรรมเนียม / ยอดจ่าย / หมายเหตุ (ถ้าใส่ค่าส่งรวมไว้หลังรวม ต้องไปใส่ใหม่ในใบที่ถูก) · ค่าส่งขนส่งไทยและเรทคงเดิม`} />
      {/* ★ 2026-11-16 ปุ่มใบใหม่ — มีที่ยังไม่บันทึก ถามก่อนออก */}
      <ConfirmDialog open={!!leaveTo} onClose={() => setLeaveTo(null)} onConfirm={() => { const to = leaveTo; setLeaveTo(null); if (to) router.push(to); }}
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก" message="ต้องการออกไปออกใบใหม่โดยไม่บันทึกหรือไม่? (กด อยู่ต่อ แล้วกดบันทึกร่างก่อนก็ได้)"
        confirmText="ออกโดยไม่บันทึก" cancelText="อยู่ต่อ" variant="danger" />
      {/* ★ 2026-11-15 เปิดแก้ใบที่ยืนยันแล้ว — บังคับเหตุผล · ★ 2026-11-16 แอดมินไม่บังคับ (lib/voucher-revision reviseReasonFor) */}
      {reviseOpen && hd && (
        <ERPModal open onClose={() => !reviseBusy && setReviseOpen(false)} size="sm" storageKey="pv-revise-start" closeOnBackdrop={false}
          title={`แก้ไขใบ ${hd.pv_no ?? ""}`} description="ใช้เลขเดิม · ใบตอนนี้เก็บเป็นประวัติ · แก้เสร็จกด บันทึกการแก้ไข"
          footer={<>
            <button onClick={() => setReviseOpen(false)} disabled={reviseBusy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void reviseCall("start", reviseReason)} disabled={reviseBusy || !reviseReasonFor(reviseReason, isAdmin).ok} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{reviseBusy ? "กำลังเปิด…" : "เปิดแก้"}</button>
          </>}>
          <label className="text-xs text-slate-600">เหตุผลที่แก้ {isAdmin ? <span className="text-slate-400">(ไม่บังคับ — แอดมิน)</span> : <span className="text-red-500">*</span>}
            <textarea value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} rows={3} autoFocus placeholder="เช่น ร้านลดราคากล่อง 13×10 / ใส่เรทผิด / ลืมค่าส่งในจีน"
              className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md" />
          </label>
          {!isAdmin && reviseReason.length > 0 && reviseReason.trim().length < 3 && <div className="text-[11px] text-red-600 mt-1">ใส่เหตุผลอย่างน้อย 3 ตัวอักษร</div>}
          {isAdmin && reviseReason.trim().length === 0 && <div className="text-[11px] text-slate-400 mt-1">ว่างไว้ = ประวัติเขียน &ldquo;{ADMIN_NO_REASON}&rdquo;</div>}
          <ul className="mt-2 text-[11px] text-slate-500 list-disc pl-4 space-y-0.5">
            <li>ระหว่างแก้ ใบยังเป็น &ldquo;ยืนยันแล้ว&rdquo; — ราคาใหม่เขียนกลับใบสั่งซื้อ/ราคาร้านตอนกดบันทึกการแก้ไข</li>
            <li>ไม่อยากแก้แล้ว กด &ldquo;ยกเลิกการแก้&rdquo; ใบกลับเป็นแบบเดิม</li>
            <li>จ่ายเงินไปแล้วและยอดเปลี่ยน ระบบจะเตือน (ไม่แก้การจ่ายเงินให้เอง)</li>
          </ul>
        </ERPModal>
      )}
      {reviseCancelOpen && hd && (
        <ERPModal open onClose={() => !reviseBusy && setReviseCancelOpen(false)} size="sm" storageKey="pv-revise-cancel"
          title="ยกเลิกการแก้?" description={`ใบจะกลับเป็นเวอร์ชัน v${hd.revision} — สิ่งที่แก้ไว้รอบนี้จะหาย`}
          footer={<>
            <button onClick={() => setReviseCancelOpen(false)} disabled={reviseBusy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">แก้ต่อ</button>
            <button onClick={() => void reviseCall("cancel")} disabled={reviseBusy} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{reviseBusy ? "กำลังคืน…" : "ยกเลิกการแก้"}</button>
          </>}>
          <p className="text-sm text-slate-600">หัวใบ รายการ และบิลที่แนบ จะกลับเป็นแบบก่อนเปิดแก้</p>
        </ERPModal>
      )}
      {/* ★ 2026-11-15 บันทึกการแก้ไข + วันที่ในเลขไม่ตรงวันที่ใบ → ถามเปลี่ยนเลข (แบบ ก.) */}
      {renumberAsk && hd && (
        <ERPModal open onClose={() => !reviseBusy && setRenumberAsk(false)} size="sm" storageKey="pv-revise-renumber"
          title="เปลี่ยนเลขใบตามวันที่ใบ?" description={`เลข ${hd.pv_no ?? "—"} ไม่ตรงวันที่ใบ ${h.voucher_date ? formatDate(h.voucher_date) : "—"}`}
          footer={<>
            <button onClick={() => { setRenumberAsk(false); void reviseCall("save", undefined, false); }} disabled={reviseBusy} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">คงเลขเดิม</button>
            <button onClick={() => { setRenumberAsk(false); void reviseCall("save", undefined, true); }} disabled={reviseBusy} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">เปลี่ยนเลขตามวันที่</button>
          </>}>
          <p className="text-sm text-slate-600">ระบบจะใช้เลขถัดไปที่ยังว่างของวันที่ {h.voucher_date ? formatDate(h.voucher_date) : "—"} (ไม่ชนใบอื่น) · เลขเดิมเก็บไว้ในประวัติการแก้ไข</p>
        </ERPModal>
      )}
      {/* ยกเลิกใบที่ยืนยันแล้ว */}
      {voidOpen && hd && (
        <ERPModal open onClose={() => !voiding && setVoidOpen(false)} size="sm" storageKey="pv-void" closeOnBackdrop={false}
          title={`❌ ยกเลิกใบสำคัญรับ ${hd.pv_no ?? ""}`} description="ใช้เมื่อใส่ราคา/ค่าส่งผิด แล้วต้องออกใบใหม่"
          footer={<>
            <button onClick={() => setVoidOpen(false)} disabled={voiding} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ไม่ยกเลิก</button>
            <button onClick={() => void voidConfirmed()} disabled={voiding || !voidReason.trim()} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{voiding ? "กำลังยกเลิก…" : "ยืนยันยกเลิกใบ"}</button>
          </>}>
          <div className="space-y-3 text-sm text-slate-600">
            <ul className="list-disc pl-5 space-y-1 text-[13px]">
              <li>ราคาที่ใบนี้เขียนลงระบบ (ใบสั่งซื้อ · ราคาต่อร้าน · ราคาบนสินค้า) จะ<b>กลับเป็นราคาเดิม</b> — ยกเว้นจุดที่มีคนแก้ราคาทีหลังแล้ว ระบบจะไม่ไปทับ</li>
              <li>ใบรับ {hd.gr_nos.join(", ") || "—"} จะกลับไปรอออกใบสำคัญใหม่</li>
              <li>ใบนี้ยังเก็บไว้ดูย้อนหลังในสถานะ “ยกเลิก” (เลขที่ไม่ถูกใช้ซ้ำ)</li>
              <li>สถานะ “จ่ายค่าสินค้า” ของใบสั่งซื้อไม่ถูกแตะ — ถ้ายอดที่จ่ายเปลี่ยน ให้แก้ที่ใบสั่งซื้อเอง</li>
            </ul>
            <label className="block text-xs font-medium text-slate-600">เหตุผลที่ยกเลิก <span className="text-red-500">*</span>
              <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} autoFocus placeholder="เช่น ใส่ราคาผิดบรรทัด / ค่าส่งผิดร้าน"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400" /></label>
          </div>
        </ERPModal>
      )}
      {/* ยกเลิกใบร่าง */}
      {cancelOpen && (
        <ERPModal open onClose={() => setCancelOpen(false)} size="sm" storageKey="pv-cancel"
          title="❌ ยกเลิกใบร่าง" description="ใบรับที่ผูกไว้จะกลับไปรอออกใบสำคัญใหม่"
          footer={<>
            <button onClick={() => setCancelOpen(false)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ไม่ยกเลิก</button>
            <button onClick={() => void cancelDraft()} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">ยืนยันยกเลิก</button>
          </>}>
          <p className="text-sm text-slate-600">ราคาที่กรอกในใบร่างนี้จะหายไป (ยังไม่ได้เขียนกลับระบบ)</p>
        </ERPModal>
      )}
    </PlaygroundShell>
  );
}
