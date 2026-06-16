"use client";

/**
 * Design Sheets (ใบงานออกแบบ) — เฟส 1: ตาราง + ฟอร์ม + รูป · เฟส 2: Canvas แยกโซนตามแบรนด์ (สลับมุมมองได้)
 * ของกลาง: DataTable(server) / CanvasBoard / ERPModal / ConfirmDialog / ImageManager(แนบไฟล์กลาง→R2) / useToast / useAuth
 * เฟสถัดไป: comment ลูกค้า · รอบเสนอราคา · แท็บตีราคา · ตั้ง Parent SKU
 */
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ServerFetchParams } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { ImageManager, ImageThumbnail } from "@/components/image-manager";
import { CanvasBoard, type CanvasZone } from "@/components/canvas-board";
import { WorkflowStatusManager } from "@/components/workflow-status-manager";
import { SkuWizard } from "./sku-wizard";
import { ToQuotationModal } from "./to-quotation-modal";
import { QuotationCartDrawer } from "./quotation-cart-drawer";

const QUOTE_CART_KEY = "erp-design-quote-cart";   // ตัวชี้ใบเสนอราคาร่างที่เป็น "ตะกร้า" ปัจจุบัน (ต่อ browser)
import { RichTextEditor } from "@/components/rich-text";
import type { Attachment } from "@/app/api/attachments/route";
import { QUOTE_STATUS, QUOTE_STATUS_OPTS, calcCostQty, buildStatusMeta, UNKNOWN_STATUS_CLS, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { GroupRefSkusModal } from "./group-ref-modal";
import { PriceItemSkusModal } from "./price-item-skus-modal";
import { SearchableSelect } from "@/components/searchable-select";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import type { PriceItem, PriceGroup } from "@/app/api/design-sheets/price-items/route";
import type { MaterialGroup } from "@/app/api/bom/material-groups/route";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";

type Brand = { id: string; name: string; color: string | null };
type CostExtra = { label: string; amount: number };
// ค่าใช้จ่ายเพิ่มเริ่มต้น (แก้/ลบ/เพิ่มได้)
const DEFAULT_COST_EXTRA: CostExtra[] = [
  { label: "ค่าแรงผลิต", amount: 0 },
  { label: "ค่าแรง (ตัด/ปลอก/วาด)", amount: 0 },
  { label: "ค่าโสหุ้ย (ส่ง/QC/Packing)", amount: 0 },
  { label: "ต้นทุนอื่นๆ", amount: 0 },
];

type FormState = {
  id: string | null; code: string;
  name: string; brand_id: string; detail: string; note: string;
  status: string; order_date: string; deadline: string; drive_link: string;
  parent_sku_codes: string[];   // ตั้งได้หลาย Parent SKU
};
const todayStr = () => new Date().toISOString().slice(0, 10);
// วันที่สั่ง default = วันนี้ (แก้ได้)
const empty = (): FormState => ({ id: null, code: "", name: "", brand_id: "", detail: "", note: "", status: "design", order_date: todayStr(), deadline: "", drive_link: "", parent_sku_codes: [] });

// บรรทัดตีราคา (เฟส 4) — row ฝั่งหน้าจอ = CostLine + key ชั่วคราว (+ group_code สำหรับเช็คชนิดชิ้น)
type CostRow = CostLine & { key: string; group_code?: string | null };
const METHOD_LABEL: Record<string, string> = { area_face: "พื้นที่÷หน้ากว้าง", area_100: "พื้นที่÷100", length: "ความยาว", count: "นับชิ้น", manual: "พิมพ์เอง" };
const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const fmtBaht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ชนิด "ชิ้นสำเร็จขนาดตายตัว" — กว้าง×ยาว→พื้นที่ cm², ราคาต่อชิ้น (ไม่ใช้หน้ากว้าง/สูตรพื้นที่หาร)
// ตรวจจาก code (ตอนเลือกสด) หรือชื่อกลุ่ม (ตอนโหลดจาก DB) — ไม่แตะ material_groups ที่ BOM ใช้
const PIECE_CODES = new Set(["fabric_piece", "print", "reinforce"]);
const PIECE_NAMES = new Set(["ผ้า (ชิ้น)", "ลายพิมพ์", "ตัวเสริม"]);
const isPieceGroup = (code?: string | null, name?: string | null) =>
  (!!code && PIECE_CODES.has(code)) || (!!name && PIECE_NAMES.has(name));
const rowIsPiece = (r: CostRow) => isPieceGroup(r.group_code, r.group_name);
const pieceArea = (r: { width_cm: number | null; length_cm: number | null }) =>
  (r.width_cm && r.length_cm) ? Math.round(r.width_cm * r.length_cm * 100) / 100 : null;

/** ราคาต่อ cm² ของวัสดุชนิดชิ้น = ราคาแผ่น ÷ พื้นที่แผ่น (กว้าง×ยาว) */
function piecePricePerCm2(it: { price_per_unit: number | null; width_cm: number | null; length_cm: number | null }): number | null {
  const area = (it.width_cm && it.length_cm) ? it.width_cm * it.length_cm : null;
  if (!area || it.price_per_unit == null) return it.price_per_unit;   // ไม่มีขนาด → ใช้ราคาดิบ
  return Math.round((it.price_per_unit / area) * 1e6) / 1e6;
}
/** คิดปริมาณ+ยอดเงินใหม่ — ชิ้นสำเร็จ: ปริมาณ = พื้นที่ที่ใช้(กว้าง×ยาว) × จำนวนชิ้น, ราคา/หน่วย = ต่อ cm² */
function recomputeRow(r: CostRow): CostRow {
  let qty: number | null;
  if (rowIsPiece(r)) {
    const a = pieceArea(r);                                  // พื้นที่ที่ใช้ต่อชิ้น (cm²)
    const k = 1 + (r.waste_percent || 0) / 100;              // เผื่อเสีย
    qty = a != null ? Math.round(a * k * (r.pieces ?? 1) * 10000) / 10000 : null;
  } else {
    qty = calcCostQty(r) ?? r.qty;
  }
  const amount = qty != null && r.unit_price != null ? Math.round(qty * r.unit_price * 100) / 100 : null;
  return { ...r, qty, amount };
}

// ช่องที่แต่ละชนิด (วิธีคำนวณ) ต้องกรอก — ช่องอื่นโชว์ "—"
const usesWidth  = (m: string | null) => m === "area_face" || m === "area_100";
const usesLength = (m: string | null) => m === "area_face" || m === "area_100" || m === "length";
const usesPieces = (m: string | null) => m === "area_face" || m === "area_100" || m === "count";
const usesWaste  = (m: string | null) => m === "area_face" || m === "area_100" || m === "length";   // เผื่อเสีย (รวมชนิดชิ้น)
const isManualM  = (m: string | null) => !m || m === "manual";

/** สร้างบรรทัดตีราคาจากวัสดุ (ใช้ทั้งเลือกใน dropdown และกด "ลงตะกร้า" จากการ์ด) */
function rowFromItem(it: PriceItem, idx: number): CostRow {
  const piece = isPieceGroup(it.group_code, it.group_name);
  return recomputeRow({
    key: `c${Date.now()}_${idx}`,
    item_id: it.id, item_name: it.name, group_name: it.group_name, group_code: it.group_code, calc_method: it.calc_method,
    // ชนิดชิ้น: ไม่เติมขนาด default (เว้นว่าง ให้กรอกขนาดที่ตัดใช้จริง), ราคา/หน่วย = ต่อ cm² (หารจากขนาดแผ่นในตัววัสดุ)
    width_cm: null, length_cm: null, pieces: piece ? 1 : null,
    face_width_cm: it.face_width_cm,
    waste_percent: it.loss_percent, divisor: it.divisor, qty: null,
    uom: piece ? "cm²" : (it.uom ?? it.uom_default),
    unit_price: piece ? piecePricePerCm2(it) : it.price_per_unit,
    amount: null, note: null, sort_order: idx + 1,
  });
}

// ราคาฐานของกลุ่มตามที่เลือก (avg/set/latest) — ถ้าค่าที่เลือกไม่มี → ถอยใช้ค่าเฉลี่ย
function groupBasisPrice(g: PriceGroup, basis: string | null): number | null {
  if (basis === "set") return g.set_price ?? g.avg_price;
  if (basis === "latest") return g.latest_price ?? g.avg_price;
  return g.avg_price;
}
// ราคาฐานของ "วัสดุตีราคา" ตามที่เลือก (manual/latest/avg) — ดึงจาก SKU ที่ผูก, ถอยใช้ราคากรอกเองถ้าไม่มี
function itemBasisPrice(it: PriceItem, basis: string | null): number | null {
  if (basis === "latest") return it.sku_latest_price ?? it.price_per_unit;
  if (basis === "avg")    return it.sku_avg_price ?? it.price_per_unit;
  return it.price_per_unit;   // manual (ค่าเริ่มต้น)
}
// ฟิลด์บรรทัดเมื่อเลือกแบบ "กลุ่ม" (item_id = null = จับคู่วัสดุจริงทีหลัง)
function rowFieldsFromGroup(g: PriceGroup, basis: string): Partial<CostRow> {
  return {
    item_id: null, item_name: `[กลุ่ม] ${g.name}`, group_name: g.name, group_code: g.code,
    price_basis: basis, calc_method: g.calc_method,
    waste_percent: g.loss_percent, divisor: g.divisor, uom: g.uom_default,
    unit_price: groupBasisPrice(g, basis),
  };
}

/** ข้อความ tooltip อธิบายวิธีคำนวณปริมาณของบรรทัด */
function calcTooltip(r: CostRow): string {
  if (rowIsPiece(r)) {
    const a = pieceArea(r); const w = r.waste_percent || 0;
    return a != null
      ? `พื้นที่ใช้ ${r.width_cm}×${r.length_cm} = ${a} cm²${w ? ` × (1+เผื่อเสีย ${w}%)` : ""} × ${r.pieces ?? 1} ชิ้น × ${r.unit_price ?? 0} บ./cm² = ${fmtBaht(r.amount)}`
      : "ใส่ กว้าง×ยาว + จำนวนชิ้น";
  }
  const m = r.calc_method; const w = r.waste_percent || 0; const d = r.divisor || 90;
  const fx = (n: number | null) => (n == null ? 0 : n);
  if (m === "count")     return `จำนวนชิ้น = ${fx(r.pieces)} ${r.uom ?? ""}`;
  if (m === "length")    return `ความยาว ${fx(r.length_cm)} ซม. × (1+เผื่อเสีย ${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`;
  if (m === "area_100")  return `พื้นที่ (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) × (1+${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`;
  if (m === "area_face") return `พื้นที่ (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) ซม.² × (1+เผื่อเสีย ${w}%) ÷ หน้ากว้าง ${fx(r.face_width_cm)} ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`;
  return "กรอกปริมาณเอง (ชนิดนี้ไม่มีสูตรคำนวณ)";
}

// สถานะ (label/สี) ย้ายไปไว้ที่ lib/design-sheets-meta.ts — ใช้ร่วมกับหน้าพิมพ์
const OLD_STATUS_ZONE = "__old__";   // โซนรวมใบที่สถานะถูกลบออกจาก workflow แล้ว (กันงานตกหล่น)

/** สีจุดกำหนดเสร็จบนการ์ด Canvas: เลยกำหนด=แดง · ≤2วัน=ส้ม · ปกติ=เขียว · จบงานแล้ว=เทา */
function deadlineTone(deadline: string | null, status: string, finished: Set<string>): { dot: string; text: string } {
  if (!deadline || finished.has(status)) return { dot: "bg-slate-300", text: "text-slate-400" };
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) return { dot: "bg-rose-500", text: "text-rose-600 font-semibold" };
  const diff = (new Date(deadline).getTime() - new Date(today).getTime()) / 86400000;
  if (diff <= 2) return { dot: "bg-amber-500", text: "text-amber-600 font-medium" };
  return { dot: "bg-emerald-500", text: "text-slate-500" };
}

export default function DesignSheetsPage() {
  const canView = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit = usePermission("products.edit");
  const { can, user } = useAuth();
  const toast = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DesignSheetListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [hardDelTarget, setHardDelTarget] = useState<{ id: string; code: string; name: string } | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);

  // เตือนก่อนปิด เมื่อมีข้อมูลตีราคายังไม่บันทึก
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);

  // ---- เฟส 3: แท็บในป๊อปอัพ + comment ลูกค้า + รอบเสนอราคา ----
  const [modalTab, setModalTab] = useState<"info" | "comments" | "cost" | "quotes">("info");
  const [comments, setComments] = useState<DesignSheetComment[]>([]);
  const [quotes, setQuotes] = useState<DesignSheetQuote[]>([]);
  const [cqLoading, setCqLoading] = useState(false);
  // เพิ่ม/แก้ comment
  const [newCmDate, setNewCmDate] = useState("");
  const [newCmBody, setNewCmBody] = useState("");
  const [cmSaving, setCmSaving] = useState(false);
  const [editCid, setEditCid] = useState<string | null>(null);
  const [editCmDate, setEditCmDate] = useState("");
  const [editCmBody, setEditCmBody] = useState("");
  const [openImgCid, setOpenImgCid] = useState<string | null>(null);   // comment ที่กางช่องรูปอยู่
  const [delComment, setDelComment] = useState<DesignSheetComment | null>(null);
  // เพิ่ม/แก้รอบเสนอราคา
  const [newQDate, setNewQDate] = useState("");
  const [newQPrice, setNewQPrice] = useState("");      // ราคาจากตีราคา (อ้างอิง)
  const [newQOffered, setNewQOffered] = useState("");  // ราคาที่เสนอ (ใช้อันนี้)
  const [newQStatus, setNewQStatus] = useState("pending");
  const [newQNote, setNewQNote] = useState("");
  const [qSaving, setQSaving] = useState(false);
  const [editQid, setEditQid] = useState<string | null>(null);
  const [editQ, setEditQ] = useState({ quote_date: "", price: "", offered: "", note: "" });
  const [delQuote, setDelQuote] = useState<DesignSheetQuote | null>(null);

  // ---- เฟส 4: ตีราคา ----
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [groupRefOpen, setGroupRefOpen] = useState(false);   // โมดอลผูกสินค้าตัวแทนต่อกลุ่ม
  const [priceItemSkusOpen, setPriceItemSkusOpen] = useState(false);   // โมดอลผูก SKU เข้าวัสดุตีราคา
  const [costLines, setCostLines] = useState<CostRow[]>([]);
  const [costDirty, setCostDirty] = useState(false);
  const [costSaving, setCostSaving] = useState(false);
  const [costExtra, setCostExtra] = useState<CostExtra[]>([]);            // ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย/อื่นๆ)
  const costTotal  = costLines.reduce((s, r) => s + (r.amount || 0), 0);  // ต้นทุนวัสดุดิบรวม
  const extraTotal = costExtra.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const grandTotal = costTotal + extraTotal;                              // ต้นทุนสินค้า (รวมทั้งหมด)
  // ราคาที่เสนอ (ผ่านแล้ว) ล่าสุด — ใช้เป็นราคาตั้งต้นใน Wizard สร้าง SKU
  const offeredPrice = useMemo<number | null>(() => {
    const val = (q: DesignSheetQuote) => (q.offered_price ?? q.price);
    const passed = quotes.filter((q) => q.status === "passed" && val(q) != null);
    const pool = passed.length > 0 ? passed : quotes.filter((q) => val(q) != null);
    if (pool.length === 0) return null;
    return val(pool.reduce((a, b) => (b.round > a.round ? b : a))) ?? null;
  }, [quotes]);
  // ต้นทุนวัสดุแยกตามชนิด (สำหรับการ์ดสรุป)
  const costByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of costLines) { const k = r.group_name || "ไม่ระบุชนิด"; m.set(k, (m.get(k) ?? 0) + (r.amount || 0)); }
    return [...m.entries()].map(([label, amount]) => ({ label, amount }));
  }, [costLines]);

  // ---- เฟส 5: ตั้ง Parent SKU + ตัวเช็ครหัส ----
  const [skuCheck, setSkuCheck] = useState<ParentSkuCheck | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
  const [skuInput, setSkuInput] = useState("");   // ช่องพิมพ์รหัส Parent SKU ที่กำลังจะเพิ่ม

  // ---- ปุ่ม ＋ เพิ่มแบรนด์ใหม่จากในฟอร์ม ----
  const [brandModal, setBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("#3b82f6");
  const [brandSaving, setBrandSaving] = useState(false);

  const addBrand = async () => {
    if (!newBrandName.trim()) { toast.error("กรุณาใส่ชื่อแบรนด์"); return; }
    setBrandSaving(true);
    try {
      const res = await apiFetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBrandName.trim(), color: newBrandColor }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      const b = j.data as Brand;
      setBrands((list) => [...list, b].sort((x, y) => x.name.localeCompare(y.name, "th")));
      patch({ brand_id: b.id });   // เลือกแบรนด์ใหม่ให้เลย
      setBrandModal(false);
      toast.success(`เพิ่มแบรนด์ "${b.name}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มแบรนด์ไม่สำเร็จ"); }
    finally { setBrandSaving(false); }
  };

  // ---- popup จัดการวัสดุตีราคา (จากแท็บตีราคา — เพิ่ม/แก้/เก็บเข้ากรุ ได้เลยไม่ต้องออกไปหน้า master) ----
  type PmRow = { id: string; name: string; code: string | null; material_group_id: string | null; price_per_unit: number | null; uom: string | null; face_width_cm: number | null; width_cm: number | null; length_cm: number | null };
  const [pmOpen, setPmOpen] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmRows, setPmRows] = useState<PmRow[]>([]);
  const [mgList, setMgList] = useState<MaterialGroup[]>([]);
  const [pmName, setPmName] = useState("");
  const [pmGroup, setPmGroup] = useState("");
  const [pmPrice, setPmPrice] = useState("");
  const [pmUom, setPmUom] = useState("");
  const [pmFace, setPmFace] = useState("");
  const [pmWidth, setPmWidth] = useState("");
  const [pmLength, setPmLength] = useState("");
  const [pmSaving, setPmSaving] = useState(false);
  const [pmEditId, setPmEditId] = useState<string | null>(null);
  const [pmEdit, setPmEdit] = useState({ name: "", material_group_id: "", price: "", uom: "", face: "", width: "", length: "" });
  const [pmDel, setPmDel] = useState<PmRow | null>(null);
  const [pmSearch, setPmSearch] = useState("");                                  // ค้นหาในป๊อปจัดการวัสดุ
  const [pmSort, setPmSort] = useState<{ key: "name" | "group" | "price"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const mgName = (id: string | null) => mgList.find((g) => g.id === id)?.name ?? "—";
  const mgOf = (id: string | null) => mgList.find((g) => g.id === id) ?? null;
  const groupUsesPiece = (id: string | null) => isPieceGroup(mgOf(id)?.code, mgOf(id)?.name);  // ชนิดชิ้น (กว้าง×ยาว)
  const groupUsesFace = (id: string | null) => mgOf(id)?.calc_method === "area_face" && !groupUsesPiece(id);  // ผ้าม้วน
  const groupHint = (id: string | null): string => {
    if (groupUsesPiece(id)) return "ซื้อเป็นแผ่น — ใส่ขนาดแผ่น กว้าง×ยาว + ราคา/แผ่น → ระบบหารเป็นราคา/cm² · ตอนตีราคา = พื้นที่ที่ใช้ × ราคา/cm² × จำนวน";
    const m = mgOf(id)?.calc_method;
    if (m === "area_face") return "ผ้าม้วน — ใส่หน้ากว้าง · ตอนตีราคาใส่ กว้าง × ยาว × จำนวน (พื้นที่ ÷ หน้ากว้าง)";
    if (m === "area_100")  return "คิดตามพื้นที่ ÷ 100 — ตอนตีราคาใส่ กว้าง × ยาว × จำนวน";
    if (m === "length")    return "คิดตามความยาว — ตอนตีราคาใส่แค่ ยาว";
    if (m === "count")     return "คิดตามจำนวนชิ้น — ตอนตีราคาใส่ จำนวนชิ้น";
    return "";
  };
  // คัดลอกวัสดุที่มีอยู่ → เติมค่าลงช่องเพิ่มด้านบน (ชื่อ + " (copy)") ให้แก้นิดเดียวแล้วกดเพิ่ม
  const pmCopy = (r: PmRow) => {
    setPmEditId(null);
    setPmName(`${r.name} (copy)`); setPmGroup(r.material_group_id ?? "");
    setPmPrice(r.price_per_unit != null ? String(r.price_per_unit) : "");
    setPmUom(r.uom ?? ""); setPmFace(r.face_width_cm != null ? String(r.face_width_cm) : "");
    setPmWidth(r.width_cm != null ? String(r.width_cm) : ""); setPmLength(r.length_cm != null ? String(r.length_cm) : "");
    toast.info("คัดลอกค่ามาที่ช่องเพิ่มด้านบนแล้ว — แก้ชื่อ/ค่าแล้วกด ＋ เพิ่ม");
  };
  const pmToggleSort = (key: "name" | "group" | "price") =>
    setPmSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  // รายการที่แสดง = กรองด้วยค้นหา + เรียงตามหัวคอลัมน์
  const pmShown = useMemo(() => {
    const q = pmSearch.trim().toLowerCase();
    let rows = pmRows.filter((r) => !q || (r.name ?? "").toLowerCase().includes(q) || mgName(r.material_group_id).toLowerCase().includes(q));
    const dir = pmSort.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (pmSort.key === "price") return ((a.price_per_unit ?? 0) - (b.price_per_unit ?? 0)) * dir;
      const av = pmSort.key === "group" ? mgName(a.material_group_id) : (a.name ?? "");
      const bv = pmSort.key === "group" ? mgName(b.material_group_id) : (b.name ?? "");
      return av.localeCompare(bv, "th") * dir;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmRows, pmSearch, pmSort, mgList]);

  const loadPm = useCallback(async () => {
    setPmLoading(true);
    try {
      const [ir, gr] = await Promise.all([
        apiFetch("/api/master-v2/design-price-items?limit=500").then((r) => r.json()),
        apiFetch("/api/bom/material-groups").then((r) => r.json()),
      ]);
      setPmRows((ir.data ?? ir.rows ?? []) as PmRow[]);
      setMgList((gr.data ?? []) as MaterialGroup[]);
    } catch { /* ignore */ } finally { setPmLoading(false); }
  }, []);

  const openPm = () => { setPmOpen(true); setPmEditId(null); setPmName(""); setPmGroup(""); setPmPrice(""); setPmUom(""); setPmFace(""); setPmWidth(""); setPmLength(""); void loadPm(); };
  const closePm = () => { setPmOpen(false); setPriceItems([]); setPriceGroups([]); };   // ปิดแล้ว dropdown วัสดุ/กลุ่มในตารางตีราคารีโหลดเอง
  const numOrNull = (s: string) => (s === "" ? null : Number(s));

  const pmAdd = async () => {
    if (!pmName.trim()) { toast.error("กรุณาใส่ชื่อวัสดุ"); return; }
    setPmSaving(true);
    const piece = groupUsesPiece(pmGroup);
    try {
      const res = await apiFetch("/api/master-v2/design-price-items", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmName.trim(), material_group_id: pmGroup || null, price_per_unit: numOrNull(pmPrice), uom: pmUom.trim() || null,
          face_width_cm: piece ? null : numOrNull(pmFace), width_cm: piece ? numOrNull(pmWidth) : null, length_cm: piece ? numOrNull(pmLength) : null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPmName(""); setPmPrice(""); setPmUom(""); setPmFace(""); setPmWidth(""); setPmLength("");
      await loadPm(); toast.success("เพิ่มวัสดุแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มวัสดุไม่สำเร็จ"); }
    finally { setPmSaving(false); }
  };

  const pmStartEdit = (r: PmRow) => { setPmEditId(r.id); setPmEdit({ name: r.name ?? "", material_group_id: r.material_group_id ?? "", price: r.price_per_unit != null ? String(r.price_per_unit) : "", uom: r.uom ?? "", face: r.face_width_cm != null ? String(r.face_width_cm) : "", width: r.width_cm != null ? String(r.width_cm) : "", length: r.length_cm != null ? String(r.length_cm) : "" }); };
  const pmSaveEdit = async () => {
    if (!pmEditId) return;
    if (!pmEdit.name.trim()) { toast.error("กรุณาใส่ชื่อวัสดุ"); return; }
    const piece = groupUsesPiece(pmEdit.material_group_id);
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${pmEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmEdit.name.trim(), material_group_id: pmEdit.material_group_id || null, price_per_unit: numOrNull(pmEdit.price), uom: pmEdit.uom.trim() || null,
          face_width_cm: piece ? null : numOrNull(pmEdit.face), width_cm: piece ? numOrNull(pmEdit.width) : null, length_cm: piece ? numOrNull(pmEdit.length) : null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPmEditId(null); await loadPm(); toast.success("บันทึกวัสดุแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  const pmDelete = async () => {
    if (!pmDel) return;
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${pmDel.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      setPmDel(null); await loadPm(); toast.success("เก็บวัสดุเข้ากรุแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  // ---- รูปก่อนบันทึก (ตอนสร้างใหม่): พักไว้ในเครื่อง → อัปโหลดอัตโนมัติตอนกดบันทึก ----
  const [pendImgs, setPendImgs] = useState<Array<{ file: File; url: string }>>([]);
  const [pendDragging, setPendDragging] = useState(false);
  const pendFileRef = useRef<HTMLInputElement>(null);

  const addPendFiles = (files: FileList | File[]) => {
    const ok = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (ok.length === 0) return;
    setPendImgs((list) => [...list, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const removePend = (i: number) => setPendImgs((list) => {
    URL.revokeObjectURL(list[i]?.url ?? "");
    return list.filter((_, x) => x !== i);
  });
  const clearPend = useCallback(() => {
    setPendImgs((list) => { list.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
  }, []);

  // ---- เตือนก่อนปิด (มีข้อมูลตีราคายังไม่บันทึก) ----
  const doClose = useCallback(() => {
    setForm(null); clearPend(); setCloseConfirm(false);
  }, [clearPend]);
  const requestClose = () => {
    if (saving) return;
    if (costDirty) setCloseConfirm(true);
    else doClose();
  };
  // "บันทึกแล้วปิด" — บันทึกตีราคาที่ค้าง แล้วปิด
  const saveAndClose = async () => {
    setCloseSaving(true);
    try {
      if (costDirty) await saveCost();
      doClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setCloseSaving(false); }
  };
  const discardAndClose = () => doClose();

  // Ctrl+V วางรูป — ทำงานเฉพาะตอนเปิดฟอร์มสร้างใหม่ (ยังไม่มี id)
  useEffect(() => {
    if (!form || form.id || !canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) { e.preventDefault(); addPendFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [form, canEdit]);

  const loadCq = useCallback(async (sheetId: string) => {
    setCqLoading(true);
    try {
      const [cr, qr, lr] = await Promise.all([
        apiFetch(`/api/design-sheets/${sheetId}/comments`).then((r) => r.json()),
        apiFetch(`/api/design-sheets/${sheetId}/quotes`).then((r) => r.json()),
        apiFetch(`/api/design-sheets/${sheetId}/cost-lines`).then((r) => r.json()),
      ]);
      if (!cr.error) setComments((cr.data ?? []) as DesignSheetComment[]);
      if (!qr.error) setQuotes((qr.data ?? []) as DesignSheetQuote[]);
      if (!lr.error) { setCostLines(((lr.data ?? []) as CostLine[]).map((l, i) => ({ ...l, key: `db${i}_${l.id ?? ""}` }))); setCostDirty(false); }
    } catch { /* ignore */ }
    finally { setCqLoading(false); }
  }, []);

  // โหลด master วัสดุตีราคาครั้งเดียว (ตอนเปิดใบที่บันทึกแล้ว)
  useEffect(() => {
    if (!form?.id || priceItems.length > 0) return;
    apiFetch("/api/design-sheets/price-items").then((r) => r.json())
      .then((j) => { if (!j.error) { setPriceItems((j.data ?? []) as PriceItem[]); setPriceGroups((j.groups ?? []) as PriceGroup[]); } }).catch(() => {});
  }, [form?.id, priceItems.length]);

  // เช็ครหัส Parent SKU (ตัวที่กำลังพิมพ์ในช่องเพิ่ม) แบบหน่วง 400ms
  useEffect(() => {
    const code = skuInput.trim();
    if (!code) { setSkuCheck(null); setSkuChecking(false); return; }
    setSkuChecking(true);
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`).then((r) => r.json())
        .then((j) => { if (!j.error) setSkuCheck(j.data as ParentSkuCheck); })
        .catch(() => {})
        .finally(() => setSkuChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [skuInput]);

  // เพิ่มรหัสที่พิมพ์เข้า "รายการ Parent SKU" (กันซ้ำในลิสต์ + ห้ามตัวที่มีอยู่ในระบบ)
  const addParentCode = () => {
    const code = skuInput.trim().toUpperCase();
    if (!code) return;
    if (skuCheck?.exists) { setFormErr(`รหัส ${code} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ`); return; }
    setForm((f) => (f && !f.parent_sku_codes.includes(code) ? { ...f, parent_sku_codes: [...f.parent_sku_codes, code] } : f));
    setSkuInput(""); setSkuCheck(null);
  };
  const removeParentCode = (code: string) =>
    setForm((f) => (f ? { ...f, parent_sku_codes: f.parent_sku_codes.filter((c) => c !== code) } : f));

  const saveCost = useCallback(async (): Promise<boolean> => {
    if (!form?.id) return false;
    setCostSaving(true);
    try {
      // บันทึกพร้อมกัน: บรรทัดวัสดุ (PUT cost-lines) + ค่าใช้จ่ายเพิ่ม (PATCH design-sheets)
      const [lr, er] = await Promise.all([
        apiFetch(`/api/design-sheets/${form.id}/cost-lines`, { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: costLines.map((row, i) => { const { key: _key, ...l } = row; void _key; return { ...l, sort_order: i + 1 }; }) }) }),
        apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cost_extra: costExtra.map((c) => ({ label: c.label, amount: Number(c.amount) || 0 })) }) }),
      ]);
      const lj = await lr.json(); if (lj.error) throw new Error(lj.error);
      const ej = await er.json(); if (ej.error) throw new Error(ej.error);
      setCostDirty(false);
      toast.success(`บันทึกตีราคาแล้ว (${lj.saved} บรรทัด)`);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกตีราคาไม่สำเร็จ"); return false; }
    finally { setCostSaving(false); }
  }, [form?.id, costLines, costExtra, toast]);

  // ส่งยอดต้นทุนสินค้ารวม (วัสดุ + ค่าใช้จ่ายเพิ่ม) ไปเป็นรอบเสนอราคาใหม่
  const sendCostToQuote = async () => {
    if (!form?.id) return;
    const total = Math.round(grandTotal * 100) / 100;
    if (!(total > 0)) { toast.error("ยังไม่มียอดตีราคา — ใส่บรรทัดวัสดุ/ค่าใช้จ่ายก่อน"); return; }
    if (costDirty && !(await saveCost())) return;
    try {
      // price = ราคาจากตีราคา (อ้างอิง), offered_price = ตั้งต้นเท่ายอดตีราคา (แก้ทีหลังได้)
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: todayStr(), price: total, offered_price: total, status: "pending", note: "จากตีราคา" }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await loadCq(form.id);
      setModalTab("quotes");
      toast.success(`ส่งยอด ${fmtBaht(total)} บาท ไปเสนอราคา ครั้งที่ ${j.round} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งยอดไม่สำเร็จ"); }
  };


  useEffect(() => {
    if (form?.id) void loadCq(form.id);
    else { setComments([]); setQuotes([]); }
  }, [form?.id, loadCq]);

  const addComment = async () => {
    if (!form?.id || cmSaving) return;
    if (!newCmBody.trim()) { toast.error("กรุณาใส่รายการ comment"); return; }
    setCmSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_date: newCmDate || todayStr(), body: newCmBody.trim() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNewCmBody(""); setNewCmDate(todayStr());
      await loadCq(form.id);
      setOpenImgCid(j.id);   // กางช่องรูปของ comment ใหม่ให้เลย เผื่อแนบรูปต่อ
      toast.success("เพิ่ม comment แล้ว — แนบรูปประกอบได้เลย");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่ม comment ไม่สำเร็จ"); }
    finally { setCmSaving(false); }
  };

  const startEditComment = (c: DesignSheetComment) => { setEditCid(c.id); setEditCmDate(c.comment_date); setEditCmBody(c.body); };
  const saveEditComment = async () => {
    if (!form?.id || !editCid) return;
    if (!editCmBody.trim()) { toast.error("กรุณาใส่รายการ comment"); return; }
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments/${editCid}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_date: editCmDate, body: editCmBody.trim() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setEditCid(null); await loadCq(form.id); toast.success("แก้ comment แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ comment ไม่สำเร็จ"); }
  };

  const doDeleteComment = async () => {
    if (!form?.id || !delComment) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments/${delComment.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setDelComment(null); await loadCq(form.id); toast.success("ลบ comment แล้ว (รูปประกอบถูกลบออกจาก R2 ด้วย)");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบ comment ไม่สำเร็จ"); }
  };

  const addQuote = async () => {
    if (!form?.id || qSaving) return;
    setQSaving(true);
    try {
      // ถ้าไม่กรอกราคาที่เสนอ ใช้ราคาจากตีราคาแทน
      const offered = newQOffered !== "" ? Number(newQOffered) : (newQPrice !== "" ? Number(newQPrice) : null);
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: newQDate || todayStr(), price: newQPrice === "" ? null : Number(newQPrice), offered_price: offered, status: newQStatus, note: newQNote || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNewQPrice(""); setNewQOffered(""); setNewQNote(""); setNewQStatus("pending"); setNewQDate(todayStr());
      await loadCq(form.id); toast.success(`เพิ่มรอบเสนอราคา ครั้งที่ ${j.round} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มรอบเสนอราคาไม่สำเร็จ"); }
    finally { setQSaving(false); }
  };

  // เปลี่ยนสถานะรอบ (ผ่าน/ไม่ผ่าน) — บันทึกทันที + ดึงกลับถ้าพลาด
  const patchQuoteStatus = async (q: DesignSheetQuote, status: string) => {
    if (!form?.id) return;
    const prev = quotes;
    setQuotes((list) => list.map((x) => (x.id === q.id ? { ...x, status } : x)));
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes/${q.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) { setQuotes(prev); toast.error(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
  };

  const startEditQuote = (q: DesignSheetQuote) => { setEditQid(q.id); setEditQ({ quote_date: q.quote_date ?? "", price: q.price != null ? String(q.price) : "", offered: q.offered_price != null ? String(q.offered_price) : "", note: q.note ?? "" }); };
  const saveEditQuote = async () => {
    if (!form?.id || !editQid) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes/${editQid}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: editQ.quote_date || null, price: editQ.price === "" ? null : Number(editQ.price), offered_price: editQ.offered === "" ? null : Number(editQ.offered), note: editQ.note || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setEditQid(null); await loadCq(form.id); toast.success("แก้รอบเสนอราคาแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); }
  };

  const doDeleteQuote = async () => {
    if (!form?.id || !delQuote) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes/${delQuote.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setDelQuote(null); await loadCq(form.id); toast.success("ลบรอบเสนอราคาแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  // มุมมอง: ตาราง / Canvas (จำค่าล่าสุดไว้ในเครื่อง)
  const [view, setView] = useState<"table" | "canvas">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("design-sheets-view") === "canvas" ? "canvas" : "table");
  const switchView = (v: "table" | "canvas") => { setView(v); try { window.localStorage.setItem("design-sheets-view", v); } catch { /* ignore */ } };
  const [canvasItems, setCanvasItems] = useState<DesignSheetListItem[]>([]);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasErr, setCanvasErr] = useState<string | null>(null);

  // สถานะจากระบบ Workflow กลาง (แก้เองได้ที่ /admin/workflows หรือปุ่ม "จัดการสถานะงาน") — โหลดไม่ได้ = ใช้ชุดสำรองในโค้ด
  const [wfMeta, setWfMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const [statusMgr, setStatusMgr] = useState(false);   // ป๊อปอัปจัดการสถานะงาน
  const [skuWizard, setSkuWizard] = useState(false);   // Wizard สร้าง SKU
  const [toQuote, setToQuote] = useState(false);       // ส่งไปใบเสนอราคา (ระบบขาย)
  const [cartId, setCartId] = useState<string | null>(null);   // ตะกร้าใบเสนอราคาปัจจุบัน
  const [cartLabel, setCartLabel] = useState<string | null>(null);
  const [cartRefresh, setCartRefresh] = useState(0);
  useEffect(() => { try { setCartId(localStorage.getItem(QUOTE_CART_KEY)); } catch { /* ignore */ } }, []);
  const setCart = useCallback((qid: string) => { setCartId(qid); try { localStorage.setItem(QUOTE_CART_KEY, qid); } catch { /* ignore */ } }, []);
  const clearCart = useCallback(() => { setCartId(null); try { localStorage.removeItem(QUOTE_CART_KEY); } catch { /* ignore */ } }, []);
  const bumpCart = useCallback(() => setCartRefresh((n) => n + 1), []);
  const statusOf = (key: string) => wfMeta.map[key] ?? { label: key, cls: UNKNOWN_STATUS_CLS };

  const reloadStatuses = useCallback(() => {
    apiFetch("/api/design-sheets/statuses").then((r) => r.json())
      .then((j) => { if (!j.error) setWfMeta(buildStatusMeta(j.data as WfStatusRow[])); }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j.data)) setBrands(j.data as Brand[]); }).catch(() => {});
    apiFetch("/api/design-sheets/statuses").then((r) => r.json())
      .then((j) => { if (alive && !j.error) setWfMeta(buildStatusMeta(j.data as WfStatusRow[])); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // โหลดข้อมูลทั้งหมดสำหรับ Canvas (เฉพาะที่ใช้งานอยู่ เรียงตาม Deadline) — กรองแบรนด์ได้
  useEffect(() => {
    if (view !== "canvas") return;
    let alive = true;
    setCanvasLoading(true); setCanvasErr(null);
    const params = new URLSearchParams({ limit: "500", sort_by: "sort_order", sort_dir: "asc" });
    if (brandFilter) params.set("brand_id", brandFilter);
    apiFetch(`/api/design-sheets?${params}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) { setCanvasErr(String(j.error)); setCanvasItems([]); }
      else setCanvasItems((j.data ?? []) as DesignSheetListItem[]);
    }).catch((e) => { if (alive) setCanvasErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); })
      .finally(() => { if (alive) setCanvasLoading(false); });
    return () => { alive = false; };
  }, [view, brandFilter, refreshKey]);

  // โซน Canvas = สถานะจากระบบ Workflow กลาง (แก้ที่ /admin/workflows แล้วโซนเปลี่ยนตาม)
  // + โซน "สถานะเก่า" โผล่เฉพาะเมื่อมีใบที่ใช้สถานะที่ถูกลบไปแล้ว
  const knownStatus = useMemo(() => new Set(wfMeta.opts.map(([k]) => k)), [wfMeta]);
  const zones = useMemo<CanvasZone[]>(() => {
    const zs: CanvasZone[] = wfMeta.opts.map(([k, l]) => ({
      id: k, title: l, color: wfMeta.colorHex[k] ?? "#cbd5e1",
      hint: canEdit ? "ลากการ์ดมาวาง = เปลี่ยนสถานะ" : undefined,
    }));
    if (canvasItems.some((it) => !knownStatus.has(it.status))) {
      zs.push({ id: OLD_STATUS_ZONE, title: "สถานะเก่า (ถูกลบจากรายการแล้ว — ลากออกได้)", color: "#cbd5e1" });
    }
    return zs;
  }, [wfMeta, knownStatus, canEdit, canvasItems]);

  // ลากการ์ดข้ามโซน = เปลี่ยนสถานะ (optimistic + บันทึกผ่าน API กลาง + audit)
  const moveStatus = async (item: DesignSheetListItem, toZoneId: string) => {
    if (toZoneId === OLD_STATUS_ZONE) return;   // โซนสถานะเก่าเป็นแค่ที่พัก ลากเข้าไม่ได้
    const prev = canvasItems;
    setCanvasItems((list) => list.map((it) => (it.id === item.id ? { ...it, status: toZoneId } : it)));
    try {
      const res = await apiFetch(`/api/design-sheets/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: toZoneId }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`${item.code} → ${statusOf(toZoneId).label}`);
    } catch (e) {
      setCanvasItems(prev);   // เปลี่ยนไม่สำเร็จ → ดึงการ์ดกลับที่เดิม
      toast.error(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  };

  // ลากสลับ/เรียงลำดับการ์ด → จำลำดับถาวร (sort_order)
  const reorderCards = async (orderedIds: string[]) => {
    const byId = new Map(canvasItems.map((it) => [it.id, it]));
    const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as DesignSheetListItem[];
    for (const it of canvasItems) if (!orderedIds.includes(it.id)) next.push(it);
    setCanvasItems(next);
    try {
      const res = await apiFetch("/api/design-sheets/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((x) => x.id) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ"); }
  };

  const serverFetch = useCallback(async (p: ServerFetchParams) => {
    const params = new URLSearchParams({ limit: String(p.pageSize), offset: String((p.page - 1) * p.pageSize) });
    if (p.search) params.set("search", p.search);
    if (p.sortBy) { params.set("sort_by", p.sortBy); params.set("sort_dir", p.sortDir ?? "asc"); }
    if (statusFilter) params.set("status", statusFilter);
    if (brandFilter) params.set("brand_id", brandFilter);
    if (showArchived) params.set("archived", "1");
    const res = await apiFetch(`/api/design-sheets?${params}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: json.data as DesignSheetListItem[], total: json.total as number };
  }, [statusFilter, brandFilter, showArchived]);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  // อัปโหลดรูปในรายละเอียดงาน (Tiptap) → R2 ผ่านระบบแนบไฟล์กลาง (entity=design_sheet_detail)
  const uploadDetailImage = async (file: File): Promise<string> => {
    if (!form?.id) throw new Error("ต้องบันทึกใบงานก่อน");
    const fd = new FormData();
    fd.append("file", file); fd.append("entity_type", "design_sheet_detail"); fd.append("entity_id", form.id);
    const an = user?.name ?? user?.email; if (an) fd.append("actor", an);
    const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
    const j = await res.json(); if (j.error) throw new Error(j.error);
    const url = j.public_url ?? j.data?.public_url;
    if (!url) throw new Error("อัปโหลดรูปไม่สำเร็จ");
    return url as string;
  };
  // ลบรูปในรายละเอียดที่ถูกเอาออกจากเนื้อหา → ลบจาก R2 (ย้าย trash) กันไฟล์ขยะ
  const reconcileDetailImages = async (sheetId: string, html: string) => {
    try {
      const res = await apiFetch(`/api/attachments?entity_type=design_sheet_detail&entity_id=${encodeURIComponent(sheetId)}`);
      const j = await res.json();
      const atts = (j.data ?? []) as Attachment[];
      const actor = encodeURIComponent(user?.name ?? user?.email ?? "");
      for (const a of atts) {
        if (a.public_url && !html.includes(a.public_url)) {
          await apiFetch(`/api/attachments/${a.id}?actor=${actor}`, { method: "DELETE" });
        }
      }
    } catch { /* ไม่ critical */ }
  };

  const openCreate = () => { setForm(empty()); setFormErr(null); setModalTab("info"); setNewCmDate(todayStr()); setNewQDate(todayStr()); setEditCid(null); setEditQid(null); setOpenImgCid(null); clearPend(); setCostExtra(DEFAULT_COST_EXTRA); };

  const openEdit = async (row: DesignSheetListItem) => {
    setLoadingForm(true); setFormErr(null); setForm(empty());
    setModalTab("info"); setNewCmDate(todayStr()); setNewQDate(todayStr()); setEditCid(null); setEditQid(null); setOpenImgCid(null); clearPend();
    try {
      const res = await apiFetch(`/api/design-sheets/${row.id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const d = j.data;
      setForm({
        id: d.id, code: d.code ?? "", name: d.name ?? "", brand_id: d.brand_id ?? "",
        detail: d.detail ?? "", note: d.note ?? "", status: d.status ?? "design",
        order_date: d.order_date ?? "", deadline: d.deadline ?? "", drive_link: d.drive_link ?? "",
        parent_sku_codes: Array.isArray(d.parent_sku_codes) ? (d.parent_sku_codes as string[])
          : (d.parent_sku_code ? [String(d.parent_sku_code)] : []),
      });
      setSkuInput("");
      const ce = (Array.isArray(d.cost_extra) ? d.cost_extra : []) as CostExtra[];
      setCostExtra(ce.length ? ce.map((c) => ({ label: String(c.label ?? ""), amount: Number(c.amount) || 0 })) : DEFAULT_COST_EXTRA);
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { setFormErr("กรุณาใส่ชื่องาน"); return; }
    // รหัสที่ค้างพิมพ์ในช่องเพิ่ม (ยังไม่กด Enter) → ถ้าซ้ำห้ามบันทึก, ถ้าใช้ได้ให้รวมเข้าไปด้วย
    const pending = skuInput.trim().toUpperCase();
    if (pending && skuCheck?.exists) { setFormErr(`รหัส Parent SKU "${pending}" มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ`); return; }
    const parentCodes = [...form.parent_sku_codes];
    if (pending && !parentCodes.includes(pending)) parentCodes.push(pending);
    setSaving(true); setFormErr(null);
    const payload = {
      name: form.name.trim(), brand_id: form.brand_id || null, detail: form.detail || null, note: form.note || null,
      status: form.status, order_date: form.order_date || null, deadline: form.deadline || null, drive_link: form.drive_link || null,
      parent_sku_codes: parentCodes,
    };
    try {
      const res = form.id
        ? await apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/design-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (form.id) {
        await reconcileDetailImages(form.id, form.detail);   // ลบรูปในรายละเอียดที่ถูกเอาออก (→ R2 trash)
        toast.success("บันทึกแล้ว");
        setForm(null);
      } else {
        // อัปโหลดรูปที่พักไว้ (ลาก/วาง/Ctrl+V ตอนยังไม่บันทึก) เข้าใบงานที่เพิ่งสร้าง
        if (pendImgs.length > 0) {
          let ok = 0, fail = 0;
          for (const p of pendImgs) {
            try {
              const fd = new FormData();
              fd.append("file", p.file); fd.append("entity_type", "design_sheet"); fd.append("entity_id", j.id);
              const an = user?.name ?? user?.email; if (an) fd.append("actor", an);
              const ur = await apiFetch("/api/attachments", { method: "POST", body: fd });
              const uj = await ur.json(); if (uj.error) throw new Error(uj.error);
              ok++;
            } catch { fail++; }
          }
          clearPend();
          if (fail > 0) toast.error(`อัปโหลดรูปไม่สำเร็จ ${fail} ไฟล์ (สำเร็จ ${ok})`);
        }
        // สร้างเสร็จ → ค้างป๊อปอัพไว้ (กลายเป็นโหมดแก้) ให้แนบรูป/comment ต่อได้เลย
        toast.success(`สร้างใบงานแล้ว: ${j.code}`);
        patch({ id: j.id, code: j.code });
      }
      refresh();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const doArchive = async () => {
    if (!archiveTarget) return; setArchiving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${archiveTarget.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("เก็บเข้ากรุแล้ว — ดูได้จากติ๊ก “แสดงที่เก็บเข้ากรุ”"); setArchiveTarget(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เก็บเข้ากรุไม่สำเร็จ"); }
    finally { setArchiving(false); }
  };

  const doHardDelete = async () => {
    if (!hardDelTarget) return; setHardDeleting(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${hardDelTarget.id}?hard=1`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบใบงานถาวรแล้ว (รูปย้ายเข้าถังขยะ R2 สำรอง 30 วัน)");
      setHardDelTarget(null); setForm(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setHardDeleting(false); }
  };

  const doRestore = async (row: DesignSheetListItem) => {
    try {
      const res = await apiFetch(`/api/design-sheets/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: true }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`กู้คืน ${row.code} แล้ว`); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };

  const columns = useMemo<ColumnDef<DesignSheetListItem>[]>(() => [
    { id: "cover", header: "รูป", size: 56, enableSorting: false,
      cell: ({ row }) => <ImageThumbnail url={row.original.cover_url} size={40} alt={row.original.name} /> },
    { id: "code", accessorKey: "code", header: "เลขที่", size: 120,
      cell: ({ getValue }) => <code className="text-xs text-slate-500">{getValue() as string}</code> },
    { id: "name", accessorKey: "name", header: "ชื่องาน", size: 240,
      cell: ({ getValue }) => <span className="font-medium text-slate-700">{getValue() as string}</span> },
    { id: "brand", header: "แบรนด์", size: 140, enableSorting: false,
      cell: ({ row }) => row.original.brand_name ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <span className="w-2.5 h-2.5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: row.original.brand_color ?? "#e2e8f0" }} />
          {row.original.brand_name}
        </span>
      ) : <span className="text-slate-300">—</span> },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => { const s = statusOf(String(getValue() ?? "design")); return <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>; } },
    { id: "order_date", accessorKey: "order_date", header: "วันที่สั่ง", size: 105,
      cell: ({ getValue }) => <span className="text-sm text-slate-600">{formatDate(getValue())}</span> },
    { id: "deadline", accessorKey: "deadline", header: "Deadline", size: 105,
      cell: ({ row }) => {
        const d = row.original.deadline;
        if (!d) return <span className="text-slate-300">—</span>;
        const overdue = !wfMeta.finished.has(row.original.status) && d < new Date().toISOString().slice(0, 10);
        return <span className={`text-sm ${overdue ? "text-rose-600 font-semibold" : "text-slate-600"}`}>{formatDate(d)}{overdue ? " ⚠" : ""}</span>;
      } },
    { id: "drive", header: "ไฟล์งาน", size: 80, enableSorting: false,
      cell: ({ row }) => row.original.drive_link
        ? <a href={row.original.drive_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">📁 เปิด</a>
        : <span className="text-slate-300">—</span> },
    { id: "note", accessorKey: "note", header: "Note", size: 180, enableSorting: false,
      cell: ({ getValue }) => <span className="block max-w-[180px] truncate text-sm text-slate-500">{(getValue() as string) || ""}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [wfMeta]);

  // คอลัมน์ตารางตีราคา (ใช้ LineItemsGrid กลาง) — เลือกวัสดุ → เติมชนิด/สูตร/เผื่อเสีย/ราคาอัตโนมัติ แล้วคำนวณสด
  const numInputCls = "w-full h-8 px-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";
  const costCols = useMemo<LineColumn<CostRow>[]>(() => [
    { key: "item", header: "วัสดุ / กลุ่ม", minWidth: 220, sortable: true, getValue: (r) => r.item_name,
      render: (r, u) => {
        const inGroupMode = !r.item_id && !!r.group_code;   // รายการเดิมที่เคยเลือกแบบกลุ่ม
        const g = inGroupMode ? priceGroups.find((x) => x.code === r.group_code) : undefined;
        const item = r.item_id ? priceItems.find((x) => x.id === r.item_id) : undefined;
        return (
          <div className="space-y-1">
            <SearchableSelect value={r.item_id ?? (inGroupMode ? `grp:${r.group_code}` : "")} disabled={!canEdit} placeholder="— เลือกกลุ่ม / วัสดุ —"
              options={priceItems.map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }))}
              onChange={(val) => {
                const it = priceItems.find((p) => p.id === val);
                if (!it) { u({ item_id: null, group_code: null, price_basis: null }); return; }
                const piece = isPieceGroup(it.group_code, it.group_name);
                // เลือกวัสดุ: เก็บ group_code ไว้เป็นป้าย/ตรวจชนิดชิ้น · ราคาเริ่มต้น = กรอกเอง (manual)
                u({ item_id: it.id, item_name: it.name, group_name: it.group_name, group_code: it.group_code,
                    price_basis: piece ? null : "manual", calc_method: it.calc_method,
                    waste_percent: it.loss_percent, divisor: it.divisor, face_width_cm: it.face_width_cm ?? r.face_width_cm,
                    pieces: piece ? (r.pieces ?? 1) : r.pieces,
                    uom: piece ? "cm²" : (it.uom ?? it.uom_default ?? r.uom),
                    unit_price: piece ? piecePricePerCm2(it) : it.price_per_unit });
              }} />
            {/* ฐานราคาของวัสดุ (กรอกเอง/ล่าสุด/เฉลี่ย) จาก SKU ที่ผูก — ไม่โชว์กับชนิดชิ้น */}
            {item && !rowIsPiece(r) && canEdit && (
              <select value={r.price_basis ?? "manual"} title="ฐานราคาจาก SKU ที่ผูกกับวัสดุนี้"
                onChange={(e) => u({ price_basis: e.target.value, unit_price: itemBasisPrice(item, e.target.value) })}
                className="w-full h-7 px-1 text-xs border border-slate-200 rounded bg-white">
                <option value="manual">ฐาน: กรอกเอง{item.price_per_unit != null ? ` (${fmtBaht(item.price_per_unit)})` : ""}</option>
                <option value="latest">ฐาน: ซื้อจริงล่าสุด{item.sku_latest_price != null ? ` (${item.sku_latest_currency && item.sku_latest_currency !== "THB" ? `${item.sku_latest_currency} ` : ""}${item.sku_latest_price.toLocaleString("th-TH")})` : item.sku_count > 0 ? " — ยังไม่มีราคาซื้อ" : " — ยังไม่ผูก SKU"}</option>
                <option value="avg">ฐาน: เฉลี่ยจาก SKU{item.sku_avg_price != null ? ` (${fmtBaht(item.sku_avg_price)})` : " — ยังไม่มี"}</option>
              </select>
            )}
            {item && !rowIsPiece(r) && r.price_basis === "latest" && item.sku_latest_currency && item.sku_latest_currency !== "THB" && (
              <div className="text-[10px] text-amber-600">⚠ ราคาเป็น {item.sku_latest_currency} — ปรับเป็นบาทเองที่ช่อง “ราคา/หน่วย”</div>
            )}
            {inGroupMode && canEdit && (
              <select value={r.price_basis ?? "avg"} title="ฐานราคาของกลุ่ม (รายการเดิม)"
                onChange={(e) => u({ price_basis: e.target.value, unit_price: g ? groupBasisPrice(g, e.target.value) : r.unit_price })}
                className="w-full h-7 px-1 text-xs border border-slate-200 rounded bg-white">
                <option value="avg">ฐาน: เฉลี่ย{g?.avg_price != null ? ` (${fmtBaht(g.avg_price)})` : ""}</option>
                <option value="set">ฐาน: ตั้งไว้{g?.set_price != null ? ` (${fmtBaht(g.set_price)})` : " — ยังไม่ตั้ง"}</option>
                <option value="latest">ฐาน: ซื้อจริงล่าสุด{g?.latest_price != null ? ` (${g.latest_price.toLocaleString("th-TH")})` : " —"}</option>
              </select>
            )}
          </div>
        );
      } },
    { key: "group", header: "ชนิด / สูตร", width: 116, sortable: true, getValue: (r) => r.group_name,
      groupLabel: (r) => r.group_name || "ไม่ระบุชนิด",
      render: (r) => (
        <span className="block px-1 text-xs text-slate-500 leading-tight">{r.group_name ?? "—"}<br />
          <span className="text-[10px] text-slate-300">{METHOD_LABEL[r.calc_method ?? "manual"] ?? r.calc_method}</span></span>
      ) },
    { key: "width_cm", header: "กว้าง (ซม.)", width: 84, align: "right", getValue: (r) => r.width_cm,
      render: (r, u) => usesWidth(r.calc_method)
        ? <input type="number" min={0} step="any" value={r.width_cm ?? ""} disabled={!canEdit}
            onChange={(e) => u({ width_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs" title="ชนิดนี้ไม่ใช้ความกว้าง">—</span> },
    { key: "length_cm", header: "ยาว (ซม.)", width: 84, align: "right", getValue: (r) => r.length_cm,
      render: (r, u) => usesLength(r.calc_method)
        ? <input type="number" min={0} step="any" value={r.length_cm ?? ""} disabled={!canEdit}
            onChange={(e) => u({ length_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs" title="ชนิดนี้ไม่ใช้ความยาว">—</span> },
    { key: "pieces", header: "จำนวนชิ้น", width: 80, align: "right", getValue: (r) => r.pieces,
      render: (r, u) => usesPieces(r.calc_method)
        ? <input type="number" min={0} step="any" value={r.pieces ?? ""} disabled={!canEdit}
            onChange={(e) => u({ pieces: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs" title="ชนิดนี้ไม่ใช้จำนวนชิ้น">—</span> },
    { key: "waste_percent", header: "เผื่อเสีย %", width: 84, align: "right", getValue: (r) => r.waste_percent,
      render: (r, u) => usesWaste(r.calc_method)
        ? <input type="number" min={0} step="any" value={r.waste_percent ?? ""} disabled={!canEdit} placeholder="0"
            onChange={(e) => u({ waste_percent: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs" title="ชนิดนี้ไม่ใช้เผื่อเสีย">—</span> },
    { key: "face_width_cm", header: "หน้ากว้าง / พื้นที่", width: 96, align: "right", getValue: (r) => r.face_width_cm,
      render: (r, u) => rowIsPiece(r)
        // ชนิดชิ้น: ไม่ใช้หน้ากว้าง — โชว์พื้นที่ cm² (กว้าง×ยาว) แทนไว้อ้างอิง
        ? <span className="block px-1 text-right text-xs text-violet-600" title="พื้นที่ = กว้าง×ยาว (อ้างอิง ไม่ได้คูณราคา)">{pieceArea(r) != null ? `${fmtQty(pieceArea(r))} cm²` : "—"}</span>
        : r.calc_method === "area_face"
        ? <input type="number" min={0} step="any" value={r.face_width_cm ?? ""} disabled={!canEdit}
            onChange={(e) => u({ face_width_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs">—</span> },
    { key: "qty", header: "ปริมาณ", width: 96, align: "right", summable: true, sortable: true, getValue: (r) => r.qty,
      render: (r, u) => isManualM(r.calc_method) && canEdit
        ? <input type="number" min={0} step="any" value={r.qty ?? ""} placeholder="พิมพ์เอง"
            onChange={(e) => u({ qty: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right tabular-nums font-medium text-slate-700 cursor-help underline decoration-dotted decoration-slate-300" title={calcTooltip(r)}>{fmtQty(r.qty)}</span> },
    { key: "uom", header: "หน่วย", width: 70, getValue: (r) => r.uom,
      render: (r, u) => <input value={r.uom ?? ""} disabled={!canEdit} onChange={(e) => u({ uom: e.target.value || null })}
        className="w-full h-8 px-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" /> },
    { key: "unit_price", header: "ราคา/หน่วย", width: 96, align: "right", getValue: (r) => r.unit_price,
      render: (r, u) => <input type="number" min={0} step="any" value={r.unit_price ?? ""} disabled={!canEdit}
        onChange={(e) => u({ unit_price: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} /> },
    { key: "amount", header: "รวม (บาท)", width: 104, align: "right", summable: true, sortable: true, getValue: (r) => r.amount,
      render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmtBaht(r.amount)}</span> },
    { key: "note", header: "หมายเหตุ", minWidth: 120, getValue: (r) => r.note,
      render: (r, u) => <input value={r.note ?? ""} disabled={!canEdit} onChange={(e) => u({ note: e.target.value || null })} placeholder="—"
        className="w-full h-8 px-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" /> },
  ], [priceItems, priceGroups, canEdit]);

  if (!canView) return <AccessDenied />;

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🎨 Design Sheets (ใบงานออกแบบ)</h1>
            <p className="text-sm text-slate-500 mt-0.5">งานออกแบบสินค้าใหม่ ตั้งแต่รับโจทย์จนตั้งเป็นสินค้าจริง — คลิกแถวเพื่อเปิดดู/แก้</p>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ สร้างใบงานออกแบบ</button>}
          </div>
        </div>

        {/* สลับมุมมอง + ตัวกรอง */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => switchView("table")}
              className={`h-7 px-3 text-sm rounded-md ${view === "table" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>📋 ตาราง</button>
            <button onClick={() => switchView("canvas")}
              className={`h-7 px-3 text-sm rounded-md ${view === "canvas" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>🎨 Canvas</button>
          </div>
          {view === "table" && (
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); refresh(); }}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">สถานะ: ทั้งหมด</option>
              {wfMeta.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {/* Canvas: โซน=สถานะอยู่แล้ว เหลือตัวกรองแบรนด์ (แบรนด์ดูจากสีเงา+ชื่อบนการ์ด) */}
          <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); refresh(); }}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">แบรนด์: ทั้งหมด</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {view === "table" && (
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); refresh(); }} className="rounded border-slate-300" />
              แสดงที่เก็บเข้ากรุ
            </label>
          )}
          {view === "canvas" && canEdit && (
            <button onClick={() => setStatusMgr(true)} title="เพิ่ม/แก้ชื่อ/เปลี่ยนสี/เรียงลำดับสถานะงาน"
              className="h-8 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 ml-auto">
              ⚙️ จัดการสถานะงาน
            </button>
          )}
        </div>

        {view === "table" ? (
          <DataTable
            tableId="design-sheets" data={[]} columns={columns}
            serverFetch={serverFetch} serverRefreshKey={refreshKey}
            searchableKeys={["code", "name"]}
            searchPlaceholder="ค้นหา เลขที่ DS / ชื่องาน..."
            exportFilename="design-sheets" exportEntityType="design_sheet"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            onRowClick={openEdit}
            rowActions={canEdit ? (showArchived ? [
              { label: "กู้คืน", icon: "↩", onClick: doRestore },
            ] : [
              { label: "แก้", icon: "✏", onClick: openEdit },
              { label: "เก็บเข้ากรุ", icon: "🗑", variant: "danger", onClick: (r) => setArchiveTarget(r) },
            ]) : []}
            pageSize={20}
          />
        ) : canvasLoading ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลดกระดาน...</div>
        ) : canvasErr ? (
          <div className="py-10 text-center">
            <p className="text-sm text-rose-600 mb-2">⚠ {canvasErr}</p>
            <button onClick={refresh} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ลองใหม่</button>
          </div>
        ) : (
          <CanvasBoard<DesignSheetListItem>
            zones={zones} items={canvasItems}
            getItemId={(it) => it.id}
            getZoneId={(it) => (knownStatus.has(it.status) ? it.status : OLD_STATUS_ZONE)}
            canDrag={canEdit}
            onMove={canEdit ? moveStatus : undefined}
            onReorder={canEdit ? reorderCards : undefined}
            onCardClick={openEdit}
            cardWidth={184}
            emptyText="ยังไม่มีงานในสถานะนี้ — ลากการ์ดมาวางได้"
            renderCard={(it, dragging) => {
              const tone = deadlineTone(it.deadline, it.status, wfMeta.finished);
              const brandColor = it.brand_color ?? "#cbd5e1";
              return (
                /* เงาทึบเหลื่อมขวา-ล่างสีแบรนด์ (ตามสเก็ตช์เจ้าของ) — ไม่ระบุแบรนด์ = เทาอ่อน */
                <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden ${dragging ? "ring-2 ring-blue-300 rotate-1" : "hover:border-blue-300"}`}
                  style={{ boxShadow: `4px 4px 0 ${brandColor}` }}>
                  <div className="h-28 bg-slate-50 flex items-center justify-center">
                    {it.cover_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={it.cover_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
                      : <span className="text-slate-200 text-3xl">🎨</span>}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-[13px] font-medium text-slate-700 leading-snug line-clamp-2">{it.name}</p>
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: brandColor }} />
                        <span className="truncate">{it.brand_name ?? "ไม่ระบุแบรนด์"}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 shrink-0">{it.code.replace(/^DS-/, "")}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${tone.text}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                      {it.deadline ? `เสร็จ ${formatDate(it.deadline)}` : "ไม่กำหนดเสร็จ"}
                    </div>
                    {it.note && <p className="text-[11px] text-slate-400 line-clamp-1">{it.note}</p>}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      <ERPModal open={form !== null} onClose={requestClose} size="xl"
        title={form?.id ? `ใบงานออกแบบ: ${form.code}` : "สร้างใบงานออกแบบใหม่"}
        footer={<>
          {form?.id && (
            <div className="mr-auto flex items-center gap-1.5">
              <a href={`/print/design-sheet/${form.id}`} target="_blank" rel="noreferrer"
                className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨 ใบสั่งตัวอย่าง</a>
              <a href={`/print/design-sheet-quote/${form.id}`} target="_blank" rel="noreferrer"
                className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨 ใบเสนอราคา</a>
              <a href={`/print/design-sheet-cost/${form.id}`} target="_blank" rel="noreferrer"
                className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨 ใบตีราคา</a>
              {canCreate && (
                <button onClick={() => setSkuWizard(true)} title="สร้าง Parent SKU + SKU ลูก จากใบงานนี้"
                  className="h-9 px-3 inline-flex items-center text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50">🪄 สร้าง SKU</button>
              )}
              {canEdit && (
                <button onClick={() => { if (form?.id) setHardDelTarget({ id: form.id, code: form.code ?? "", name: form.name ?? "" }); }}
                  title="ลบใบงานถาวร + ย้ายรูปเข้าถังขยะ R2"
                  className="h-9 px-3 inline-flex items-center text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">🗑 ลบถาวร</button>
              )}
            </div>
          )}
          <button onClick={requestClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
          {canEdit && modalTab === "info" && <button onClick={save} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>}
        </>}>
        {loadingForm ? <div className="py-12 text-center text-slate-400">กำลังโหลด...</div> : form && (
          <div className="space-y-2">
            {formErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

            {/* แท็บ (โผล่เมื่อบันทึกแล้ว) */}
            {form.id && (
              <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                {([["info", "📋 ข้อมูลงาน"], ["comments", `💬 Comment ลูกค้า (${comments.length})`], ["cost", `🧮 ตีราคา (${costLines.length})`], ["quotes", `💰 เสนอราคา (${quotes.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setModalTab(k)}
                    className={`h-8 px-3 text-sm rounded-lg ${modalTab === k ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>
                ))}
                {cqLoading && <span className="text-[11px] text-slate-300 ml-1">กำลังโหลด...</span>}
              </div>
            )}

            {modalTab === "info" && <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-slate-500">เลขที่</span>
                <div className="h-8 mt-0.5 px-2 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500">
                  {form.id ? <code>{form.code}</code> : "ออกอัตโนมัติตอนบันทึก"}</div>
              </div>
              <label className="block">
                <span className="text-[11px] text-slate-500">สถานะ</span>
                <select value={form.status} onChange={(e) => patch({ status: e.target.value })} disabled={!canEdit}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                  {wfMeta.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  {/* สถานะเดิมของใบนี้ที่ถูกลบออกจาก workflow แล้ว — ยังโชว์ให้เลือกค้างไว้ได้ ไม่พัง */}
                  {form.status && !wfMeta.map[form.status] && <option value={form.status}>{form.status} (สถานะเก่า)</option>}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] text-slate-500">ชื่องาน *</span>
              <input value={form.name} onChange={(e) => patch({ name: e.target.value })} disabled={!canEdit} placeholder="เช่น กระเป๋าผ้าแคนวาสรุ่นใหม่"
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">แบรนด์</span>
                <div className="flex gap-1.5 mt-0.5">
                  <select value={form.brand_id} onChange={(e) => patch({ brand_id: e.target.value })} disabled={!canEdit}
                    className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
                    <option value="">— ไม่ระบุ —</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {canEdit && <button type="button" title="เพิ่มแบรนด์ใหม่"
                    onClick={() => { setNewBrandName(""); setNewBrandColor("#3b82f6"); setBrandModal(true); }}
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600">＋</button>}
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">วันที่สั่ง</span>
                <input type="date" value={form.order_date} onChange={(e) => patch({ order_date: e.target.value })} disabled={!canEdit}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">Deadline</span>
                <input type="date" value={form.deadline} onChange={(e) => patch({ deadline: e.target.value })} disabled={!canEdit}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">ลิงก์ไฟล์งาน (Google Drive)</span>
                <div className="flex gap-1.5 mt-0.5">
                  <input value={form.drive_link} onChange={(e) => patch({ drive_link: e.target.value })} disabled={!canEdit} placeholder="https://drive.google.com/..."
                    className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                  {form.drive_link && <a href={form.drive_link} target="_blank" rel="noreferrer"
                    className="h-8 px-2.5 inline-flex items-center text-sm border border-slate-200 rounded-lg text-blue-600 hover:bg-blue-50">↗ เปิด</a>}
                </div>
              </label>
              {/* เฟส 5: ตั้ง Parent SKU ได้หลายตัว (chips) + เช็ครหัสสด (ซ้ำ=แดง ห้ามเพิ่ม · ข้ามเลข=เตือนแต่เพิ่มได้) */}
              <div className="block">
                <span className="text-[11px] text-slate-500">Parent SKU ที่จะตั้ง (เพิ่มได้หลายตัว)</span>
                {form.parent_sku_codes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.parent_sku_codes.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-blue-50 border border-blue-200 text-blue-700 rounded">
                        {c}
                        {canEdit && <button type="button" onClick={() => removeParentCode(c)} title="เอาออก" className="text-blue-300 hover:text-rose-500 leading-none">✕</button>}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="flex gap-1 mt-1">
                    <input value={skuInput} onChange={(e) => setSkuInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParentCode(); } }}
                      placeholder="เช่น CTL085 แล้วกด Enter"
                      className={`flex-1 h-8 px-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 ${
                        skuCheck?.exists ? "border-rose-400 bg-rose-50 focus:ring-rose-400"
                        : skuCheck?.skipped ? "border-amber-300 focus:ring-amber-400"
                        : "border-slate-200 focus:ring-blue-500"}`} />
                    <button type="button" onClick={addParentCode} disabled={!skuInput.trim() || skuCheck?.exists}
                      className="h-8 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">＋ เพิ่ม</button>
                  </div>
                )}
                <div className="mt-0.5 text-[11px] min-h-[14px]">
                  {skuChecking ? <span className="text-slate-300">กำลังเช็ครหัส...</span>
                    : !skuInput.trim() ? null
                    : skuCheck?.exists ? <span className="text-rose-600 font-medium">✕ รหัสนี้มีอยู่แล้ว — เพิ่มไม่ได้</span>
                    : skuCheck?.skipped ? <span className="text-amber-600">⚠ ตั้งข้ามเลข — ล่าสุดที่ตั้งคือ {skuCheck.latest} (เพิ่มได้ แต่เช็คว่าตั้งใจ)</span>
                    : skuCheck?.latest ? <span className="text-slate-400">✓ ใช้ได้ · ล่าสุดที่ตั้ง: <b>{skuCheck.latest}</b>{skuCheck.suggested ? <> · ถัดไป: <b className="text-emerald-600">{skuCheck.suggested}</b></> : null}{skuCheck.max_code ? <> · เลขสูงสุด: {skuCheck.max_code}</> : null}</span>
                    : skuCheck ? <span className="text-emerald-600">✓ ยังไม่มีรหัสกลุ่มนี้ ใช้ได้</span> : null}
                </div>
              </div>
            </div>

            <div className="block">
              <span className="text-[11px] text-slate-500">รายละเอียดงาน</span>
              <div className="mt-0.5">
                <RichTextEditor value={form.detail} onChange={(html) => patch({ detail: html })} editable={canEdit}
                  onUploadImage={form.id ? uploadDetailImage : undefined} minHeight={150} />
                {!form.id && <p className="text-[10px] text-slate-400 mt-0.5">บันทึกใบงานก่อน แล้วจะวางรูปในรายละเอียดได้</p>}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] text-slate-500">Note</span>
              <textarea rows={2} value={form.note} onChange={(e) => patch({ note: e.target.value })} disabled={!canEdit}
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            </label>

            {/* รูปภาพ — ระบบแนบไฟล์กลาง (เก็บที่ R2, ลบแล้วตามไปลบไฟล์ให้) */}
            <div className="pt-1">
              <span className="text-[11px] text-slate-500">รูปภาพงานออกแบบ</span>
              {form.id ? (
                <div className="mt-1"><ImageManager entityType="design_sheet" entityId={form.id} actor={user?.name ?? user?.email ?? undefined} readonly={!canEdit} /></div>
              ) : (
                /* ยังไม่บันทึก — รับรูปไว้ก่อน (ลาก/วาง/Ctrl+V) แล้วอัปโหลดอัตโนมัติตอนกดบันทึก */
                <div className="mt-1">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setPendDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setPendDragging(false); }}
                    onDrop={(e) => { e.preventDefault(); setPendDragging(false); if (e.dataTransfer.files.length) addPendFiles(e.dataTransfer.files); }}
                    onClick={() => pendFileRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                      pendDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`}>
                    <input ref={pendFileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                      onChange={(e) => { if (e.target.files?.length) { addPendFiles(e.target.files); e.target.value = ""; } }} />
                    <p className="text-sm text-slate-600">{pendDragging ? "วางไฟล์ที่นี่" : "ลากรูปมาวาง · คลิกเลือก · หรือกด Ctrl+V วางรูปที่ copy มา"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">รูปจะอัปโหลดให้อัตโนมัติตอนกด &quot;บันทึก&quot; — ถ้าปิดฟอร์มทิ้ง จะไม่มีไฟล์ค้างในระบบ</p>
                  </div>
                  {pendImgs.length > 0 && (
                    <div className="grid grid-cols-6 gap-1.5 mt-1.5">
                      {pendImgs.map((p, i) => (
                        <div key={p.url} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                          {p.file.type.startsWith("image/")
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400"><span className="text-xl">📄</span><span className="text-[9px] px-0.5 truncate max-w-full">{p.file.name}</span></div>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); removePend(i); }} title="เอาออก"
                            className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-[10px] text-rose-600 opacity-0 group-hover:opacity-100 border border-slate-200">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>}

            {/* แท็บ Comment ลูกค้า (เฟส 3) */}
            {modalTab === "comments" && form.id && <div className="space-y-2">
              {canEdit && (
                <div className="flex gap-1.5 items-start p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input type="date" value={newCmDate} onChange={(e) => setNewCmDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36 shrink-0" />
                  <textarea rows={1} value={newCmBody} onChange={(e) => setNewCmBody(e.target.value)} placeholder="ลูกค้า comment ว่าอะไร..."
                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg resize-y" />
                  <button onClick={addComment} disabled={cmSaving} className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">{cmSaving ? "..." : "＋ เพิ่ม"}</button>
                </div>
              )}
              {comments.length === 0 && <div className="py-8 text-center text-sm text-slate-300">— ยังไม่มี comment จากลูกค้า —</div>}
              {comments.map((c, i) => (
                <div key={c.id} className="border border-slate-200 rounded-lg p-2.5">
                  {editCid === c.id ? (
                    <div className="flex gap-1.5 items-start">
                      <input type="date" value={editCmDate} onChange={(e) => setEditCmDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36 shrink-0" />
                      <textarea rows={2} value={editCmBody} onChange={(e) => setEditCmBody(e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <button onClick={saveEditComment} className="h-8 px-2.5 text-sm bg-emerald-600 text-white rounded-lg shrink-0">✓</button>
                      <button onClick={() => setEditCid(null)} className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg shrink-0">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-slate-400 w-8 shrink-0 pt-0.5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400">{formatDate(c.comment_date)}</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
                        {c.images.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {c.images.map((u, xi) => <ImageThumbnail key={xi} url={u} size={44} />)}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button title="รูปประกอบ"
                          onClick={() => { const closing = openImgCid === c.id; setOpenImgCid(closing ? null : c.id); if (closing && form.id) void loadCq(form.id); }}
                          className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">🖼 {c.images.length}</button>
                        {canEdit && <button onClick={() => startEditComment(c)} title="แก้" className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">✏</button>}
                        {canEdit && <button onClick={() => setDelComment(c)} title="ลบ" className="h-7 px-2 text-xs border border-rose-200 rounded-lg text-rose-500 hover:bg-rose-50">🗑</button>}
                      </div>
                    </div>
                  )}
                  {openImgCid === c.id && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <ImageManager entityType="design_sheet_comment" entityId={c.id} actor={user?.name ?? user?.email ?? undefined} readonly={!canEdit} />
                      <p className="text-[10px] text-slate-300 mt-1">ปิดช่องรูป (กด 🖼 อีกครั้ง) แล้วรูปย่อในแถวจะอัปเดตตาม</p>
                    </div>
                  )}
                </div>
              ))}
            </div>}

            {/* แท็บตีราคา (เฟส 4) — สูตรเดียวกับ BOM, วัสดุจาก master /master/design-price-items */}
            {modalTab === "cost" && form.id && <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canEdit && <button onClick={() => setGroupRefOpen(true)} className="h-8 px-3 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:border-blue-300 hover:text-blue-700">🔗 ผูกราคาซื้อ (กลุ่ม)</button>}
                {canEdit && <button onClick={() => setPriceItemSkusOpen(true)} className="h-8 px-3 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:border-blue-300 hover:text-blue-700">🔗 ผูก SKU (วัสดุ)</button>}
                {canEdit && <button onClick={openPm} className="h-8 px-3 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600">🧮 จัดการวัสดุตีราคา</button>}
              </div>
              {priceItems.length === 0 && (
                <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                  ยังไม่มีวัสดุตีราคาในระบบ — กดปุ่ม &quot;🧮 จัดการวัสดุตีราคา&quot; ด้านบน เพิ่มได้เลยไม่ต้องออกจากหน้านี้
                </div>
              )}

              <LineItemsGrid<CostRow>
                rows={costLines}
                columns={costCols}
                onChange={(rows) => { setCostLines(rows.map(recomputeRow)); setCostDirty(true); }}
                rowId={(r) => r.key}
                readonly={!canEdit}
                groupByOptions={[{ key: "group", label: "ชนิดวัสดุ" }]}
                onAdd={() => ({
                  key: `n${Date.now()}_${costLines.length}`,
                  item_id: null, item_name: null, group_name: null, calc_method: null,
                  width_cm: null, length_cm: null, pieces: null, face_width_cm: null,
                  waste_percent: null, divisor: null, qty: null, uom: null,
                  unit_price: null, amount: null, note: null, sort_order: costLines.length + 1,
                })}
                addLabel="＋ เพิ่มบรรทัดตีราคา"
                emptyText="ยังไม่มีบรรทัดตีราคา — กดเพิ่มบรรทัดแล้วเลือกวัสดุ"
              />


              {/* ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย/อื่นๆ) — เพิ่ม/ลบ/ตั้งชื่อเองได้ */}
              <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">💼 ค่าใช้จ่ายเพิ่ม (นอกจากวัสดุ)</span>
                  {canEdit && <button onClick={() => { setCostExtra((l) => [...l, { label: "", amount: 0 }]); setCostDirty(true); }}
                    className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">＋ เพิ่มรายการ</button>}
                </div>
                {costExtra.length === 0 && <p className="text-xs text-slate-300">— ยังไม่มีรายการ —</p>}
                {costExtra.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={c.label} disabled={!canEdit} placeholder="ชื่อรายการ เช่น ค่าแรงผลิต"
                      onChange={(e) => { setCostExtra((l) => l.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x))); setCostDirty(true); }}
                      className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    <input type="number" min={0} step="any" value={c.amount || ""} disabled={!canEdit} placeholder="0.00"
                      onChange={(e) => { setCostExtra((l) => l.map((x, xi) => (xi === i ? { ...x, amount: Number(e.target.value) || 0 } : x))); setCostDirty(true); }}
                      className="w-28 h-8 px-2 text-sm text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    <span className="text-xs text-slate-400">บาท</span>
                    {canEdit && <button onClick={() => { setCostExtra((l) => l.filter((_, xi) => xi !== i)); setCostDirty(true); }}
                      title="ลบ" className="h-7 w-7 shrink-0 inline-flex items-center justify-center text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50">🗑</button>}
                  </div>
                ))}
              </div>

              {/* การ์ดสรุปต้นทุน (แยกตามชนิด + รวมวัสดุ + ค่าใช้จ่าย + ต้นทุนสินค้า) */}
              <div className="rounded-xl bg-slate-800 text-slate-100 p-3 space-y-1 text-sm">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-600">
                  <span className="font-semibold">📊 สรุปต้นทุน</span>
                  <span className="font-bold text-emerald-300 tabular-nums">{fmtBaht(grandTotal)} ฿</span>
                </div>
                {costByGroup.length === 0 && <div className="text-xs text-slate-400">— ยังไม่มีต้นทุนวัสดุ —</div>}
                {costByGroup.map((g) => (
                  <div key={g.label} className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-300">ต้นทุน ({g.label})</span><span className="tabular-nums">{fmtBaht(g.amount)} ฿</span>
                  </div>
                ))}
                <div className="flex items-center justify-between font-medium pt-1 mt-1 border-t border-slate-600">
                  <span>ต้นทุนวัสดุดิบรวม</span><span className="tabular-nums">{fmtBaht(costTotal)} ฿</span>
                </div>
                {costExtra.filter((c) => (c.amount || 0) !== 0).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-[13px] text-slate-300">
                    <span>{c.label || "ค่าใช้จ่าย"}</span><span className="tabular-nums">{fmtBaht(c.amount)} ฿</span>
                  </div>
                ))}
                <div className="flex items-center justify-between font-bold text-emerald-300 pt-1 mt-1 border-t border-slate-600">
                  <span>ต้นทุนสินค้า (รวมทั้งหมด)</span><span className="tabular-nums">{fmtBaht(grandTotal)} ฿</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-sm text-slate-600">ต้นทุนสินค้า: <b className="text-base text-emerald-700">{fmtBaht(grandTotal)}</b> บาท
                  {costDirty && <span className="ml-2 text-[11px] text-amber-600">● มีแก้ไขที่ยังไม่บันทึก</span>}</div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <button onClick={() => void saveCost()} disabled={costSaving}
                      className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{costSaving ? "กำลังบันทึก..." : "💾 บันทึกตีราคา"}</button>
                    <button onClick={() => void sendCostToQuote()} disabled={costSaving || !(grandTotal > 0)}
                      className="h-8 px-3 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50">→ ส่งยอดไปเสนอราคา</button>
                  </div>
                )}
              </div>
            </div>}

            {/* แท็บรอบเสนอราคา (เฟส 3) */}
            {modalTab === "quotes" && form.id && <div className="space-y-2">
              {canEdit && (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">บันทึกรอบเสนอราคาภายใน — หรือส่งสินค้าไปออกใบเสนอราคาจริงในระบบขาย</div>
                  <button onClick={() => setToQuote(true)}
                    className="h-8 px-3 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 whitespace-nowrap">🧾 ส่งไปใบเสนอราคา</button>
                </div>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input type="date" value={newQDate} onChange={(e) => setNewQDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36" />
                  <input type="number" min={0} step="any" value={newQPrice} onChange={(e) => setNewQPrice(e.target.value)} placeholder="ราคาจากตีราคา" title="ราคาอ้างอิงจากการตีราคา"
                    className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg w-32" />
                  <input type="number" min={0} step="any" value={newQOffered} onChange={(e) => setNewQOffered(e.target.value)} placeholder="ราคาที่เสนอ" title="ราคาที่เสนอลูกค้าจริง (ใช้อันนี้) — เว้นว่าง = ใช้ราคาจากตีราคา"
                    className="h-8 px-2 text-sm text-right border border-blue-300 bg-blue-50/40 rounded-lg w-32 font-medium" />
                  <select value={newQStatus} onChange={(e) => setNewQStatus(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg">
                    {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input value={newQNote} onChange={(e) => setNewQNote(e.target.value)} placeholder="หมายเหตุ" className="flex-1 min-w-[120px] h-8 px-2 text-sm border border-slate-200 rounded-lg" />
                  <button onClick={addQuote} disabled={qSaving} className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {qSaving ? "..." : `＋ เพิ่มครั้งที่ ${quotes.length + 1}`}</button>
                </div>
              )}
              {quotes.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">— ยังไม่เคยเสนอราคา —</div> : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th className="border border-slate-200 px-2 py-1.5 w-14">ครั้งที่</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-32">วันที่เสนอ</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-28 text-right text-slate-400">ราคาจากตีราคา</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-28 text-right bg-blue-50 text-blue-600">ราคาที่เสนอ</th>
                      <th className="border border-slate-200 px-2 py-1.5 w-28">สถานะ</th>
                      <th className="border border-slate-200 px-2 py-1.5 text-left">หมายเหตุ</th>
                      {canEdit && <th className="border border-slate-200 px-2 py-1.5 w-20"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => {
                      const st = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.pending;
                      const editing = editQid === q.id;
                      return (
                        <tr key={q.id}>
                          <td className="border border-slate-200 px-2 py-1 text-center font-medium text-slate-600">{q.round}</td>
                          <td className="border border-slate-200 px-2 py-1 text-center">
                            {editing ? <input type="date" value={editQ.quote_date} onChange={(e) => setEditQ({ ...editQ, quote_date: e.target.value })} className="h-7 px-1 text-sm border border-slate-200 rounded" />
                              : <span className="text-slate-600">{formatDate(q.quote_date)}</span>}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right tabular-nums text-slate-400">
                            {editing ? <input type="number" min={0} step="any" value={editQ.price} onChange={(e) => setEditQ({ ...editQ, price: e.target.value })} className="h-7 px-1 w-24 text-sm text-right border border-slate-200 rounded" />
                              : (q.price != null ? Number(q.price).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—")}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right tabular-nums font-semibold text-blue-700 bg-blue-50/40">
                            {editing ? <input type="number" min={0} step="any" value={editQ.offered} onChange={(e) => setEditQ({ ...editQ, offered: e.target.value })} placeholder="ใช้ราคาตีราคา" className="h-7 px-1 w-24 text-sm text-right border border-blue-300 rounded" />
                              : (q.offered_price != null ? Number(q.offered_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                                : (q.price != null ? <span className="text-slate-400 font-normal">{Number(q.price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span> : "—"))}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-center">
                            {canEdit ? (
                              <select value={q.status} onChange={(e) => patchQuoteStatus(q, e.target.value)} className={`h-7 px-1 text-xs rounded cursor-pointer ${st.cls}`}>
                                {QUOTE_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            ) : <span className={`text-xs px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>}
                          </td>
                          <td className="border border-slate-200 px-2 py-1">
                            {editing ? <input value={editQ.note} onChange={(e) => setEditQ({ ...editQ, note: e.target.value })} className="h-7 px-1 w-full text-sm border border-slate-200 rounded" />
                              : <span className="text-slate-500">{q.note ?? ""}</span>}
                          </td>
                          {canEdit && (
                            <td className="border border-slate-200 px-1 py-1 text-center whitespace-nowrap">
                              {editing ? (<>
                                <button onClick={saveEditQuote} title="บันทึก" className="h-6 px-1.5 text-xs bg-emerald-600 text-white rounded mr-1">✓</button>
                                <button onClick={() => setEditQid(null)} title="ยกเลิก" className="h-6 px-1.5 text-xs border border-slate-200 rounded">✕</button>
                              </>) : (<>
                                <button onClick={() => startEditQuote(q)} title="แก้" className="h-6 px-1.5 text-xs border border-slate-200 rounded text-slate-500 mr-1">✏</button>
                                <button onClick={() => setDelQuote(q)} title="ลบ" className="h-6 px-1.5 text-xs border border-rose-200 rounded text-rose-500">🗑</button>
                              </>)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={delComment !== null} onClose={() => setDelComment(null)} onConfirm={doDeleteComment}
        title="ลบ comment" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message={`ลบ comment วันที่ ${delComment ? formatDate(delComment.comment_date) : ""} หรือไม่? รูปประกอบของ comment นี้จะถูกลบออกจาก R2 ด้วย`} />

      <ConfirmDialog open={delQuote !== null} onClose={() => setDelQuote(null)} onConfirm={doDeleteQuote}
        title="ลบรอบเสนอราคา" variant="danger" confirmText="ลบ" cancelText="ยกเลิก"
        message={`ลบรอบเสนอราคา ครั้งที่ ${delQuote?.round ?? ""} หรือไม่?`} />

      {/* จัดการสถานะงาน (โซนบนกระดาน) — เปิดจากปุ่มบนหน้า Canvas */}
      <WorkflowStatusManager open={statusMgr} onClose={() => setStatusMgr(false)}
        entityType="design_sheet" actor={user?.email ?? null} onChanged={reloadStatuses} />

      {/* Wizard สร้าง Parent SKU + SKU ลูก จากใบงาน */}
      {form?.id && (
        <SkuWizard open={skuWizard} onClose={() => setSkuWizard(false)}
          sheetId={form.id} sheetName={form.name} brandId={form.brand_id || null}
          parentCodeOptions={form.parent_sku_codes} parentCodeDefault={form.parent_sku_codes[0] || ""} defaultPrice={offeredPrice}
          onDone={() => { patch({ status: "sku_created" }); refresh(); }} />
      )}

      {/* ส่งสินค้าไปใบเสนอราคา (ระบบขาย) — หย่อนเข้าตะกร้า หรือเริ่มใบใหม่ */}
      {form?.id && (
        <ToQuotationModal open={toQuote} onClose={() => setToQuote(false)}
          sheetId={form.id} sheetName={form.name} defaultPrice={offeredPrice}
          cartId={cartId} cartLabel={cartLabel} onCartSet={setCart} onAdded={bumpCart} />
      )}

      {/* ตะกร้าใบเสนอราคา (drawer ขอบขวา) — โผล่เมื่อมีรายการในตะกร้า */}
      <QuotationCartDrawer cartId={cartId} refreshKey={cartRefresh} onClear={clearCart} onLabel={setCartLabel} />

      {/* เตือนก่อนปิด เมื่อมีข้อมูลยังไม่บันทึก (กระดาน/ตีราคา) — 3 ทางเลือก */}
      <ERPModal open={closeConfirm} onClose={() => !closeSaving && setCloseConfirm(false)} size="sm" title="ยังไม่ได้บันทึก"
        footer={<>
          <button onClick={() => setCloseConfirm(false)} disabled={closeSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">อยู่ต่อ</button>
          <button onClick={discardAndClose} disabled={closeSaving} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50">ออกโดยไม่บันทึก</button>
          <button onClick={() => void saveAndClose()} disabled={closeSaving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{closeSaving ? "กำลังบันทึก..." : "บันทึกแล้วปิด"}</button>
        </>}>
        <p className="text-sm text-slate-600">
          มีข้อมูลตีราคาที่ยังไม่ได้บันทึก —
          ต้องการบันทึกก่อนปิดหรือไม่?
        </p>
      </ERPModal>

      {/* ป๊อปเพิ่มแบรนด์ใหม่ (ปุ่ม ＋ ข้าง dropdown แบรนด์) */}
      <ERPModal open={brandModal} onClose={() => !brandSaving && setBrandModal(false)} size="sm" title="เพิ่มแบรนด์ใหม่"
        footer={<>
          <button onClick={() => setBrandModal(false)} disabled={brandSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void addBrand()} disabled={brandSaving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{brandSaving ? "กำลังบันทึก..." : "เพิ่มแบรนด์"}</button>
        </>}>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-slate-500">ชื่อแบรนด์ *</span>
            <input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void addBrand(); }} placeholder="เช่น Good Goods"
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500">สีประจำแบรนด์ (ใช้กับกรอบการ์ด + หัวโซน Canvas)</span>
            <input type="color" value={newBrandColor} onChange={(e) => setNewBrandColor(e.target.value)}
              className="block w-16 h-8 mt-0.5 border border-slate-200 rounded-lg cursor-pointer" />
          </label>
        </div>
      </ERPModal>

      {/* โมดอลผูกสินค้าตัวแทนต่อกลุ่ม (เฟส 2) — ปิดแล้วรีโหลดราคา (latest อาจเปลี่ยน) */}
      <GroupRefSkusModal open={groupRefOpen} onClose={() => { setGroupRefOpen(false); setPriceItems([]); setPriceGroups([]); }} />

      {/* ผูก SKU เข้าวัสดุตีราคา (เฟส 5) — ปิดแล้วรีโหลดราคา (latest อาจเปลี่ยน) */}
      <PriceItemSkusModal open={priceItemSkusOpen} onClose={() => { setPriceItemSkusOpen(false); setPriceItems([]); setPriceGroups([]); }} />

      {/* ป๊อปจัดการวัสดุตีราคา — CRUD ผ่าน API กลาง master-v2 (เหมือนหน้า /master/design-price-items) */}
      <ERPModal open={pmOpen} onClose={closePm} size="lg" title="🧮 จัดการวัสดุตีราคา"
        footer={<button onClick={closePm} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด (รายการวัสดุในตารางจะอัปเดตเอง)</button>}>
        <div className="space-y-2">
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="flex flex-wrap gap-1.5 items-center">
              <input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="ชื่อวัสดุ เช่น ผ้าแคนวาส *"
                onKeyDown={(e) => { if (e.key === "Enter") void pmAdd(); }}
                className="flex-1 min-w-[150px] h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={pmGroup} onChange={(e) => {
                  const gid = e.target.value; setPmGroup(gid);
                  const g = mgOf(gid); const piece = isPieceGroup(g?.code, g?.name);
                  if (piece) { setPmFace(""); }                                   // ชนิดชิ้น → ขนาดแผ่น ไม่ใช้หน้ากว้าง/หน่วย
                  else { setPmWidth(""); setPmLength("");
                    if (g?.uom_default && !pmUom.trim()) setPmUom(g.uom_default); // เติมหน่วยให้ถ้ายังว่าง
                    if (g && g.calc_method !== "area_face") setPmFace(""); }
                }}
                className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36">
                <option value="">— ชนิด —</option>
                {mgList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="number" min={0} step="any" value={pmPrice} onChange={(e) => setPmPrice(e.target.value)} placeholder={groupUsesPiece(pmGroup) ? "ราคา/แผ่น" : "ราคา/หน่วย"}
                className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
              {/* ชนิดชิ้นไม่ต้องกรอกหน่วย (เป็น cm² อัตโนมัติ) */}
              {!groupUsesPiece(pmGroup) && (
                <input value={pmUom} onChange={(e) => setPmUom(e.target.value)} placeholder="หน่วย"
                  className="h-8 px-2 w-20 text-sm border border-slate-200 rounded-lg" />
              )}
              {/* ผ้าม้วน → หน้ากว้าง · ชนิดชิ้น → ขนาดแผ่น กว้าง+ยาว (โชว์พื้นที่ + ราคา/cm²) */}
              {groupUsesFace(pmGroup) && (
                <input type="number" min={0} step="any" value={pmFace} onChange={(e) => setPmFace(e.target.value)} placeholder="หน้ากว้าง"
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
              )}
              {groupUsesPiece(pmGroup) && (<>
                <input type="number" min={0} step="any" value={pmWidth} onChange={(e) => setPmWidth(e.target.value)} placeholder="กว้างแผ่น(ซม.)"
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
                <span className="text-slate-400 text-xs">×</span>
                <input type="number" min={0} step="any" value={pmLength} onChange={(e) => setPmLength(e.target.value)} placeholder="ยาวแผ่น(ซม.)"
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
                {pmWidth && pmLength && (() => {
                  const area = Math.round(Number(pmWidth) * Number(pmLength) * 100) / 100;
                  const perCm2 = pmPrice && area ? Math.round((Number(pmPrice) / area) * 1e6) / 1e6 : null;
                  return <span className="text-[11px] text-violet-600 whitespace-nowrap">= {fmtQty(area)} cm²{perCm2 != null ? ` · ${perCm2} บ./cm²` : ""}</span>;
                })()}
              </>)}
              <button onClick={() => void pmAdd()} disabled={pmSaving}
                className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{pmSaving ? "..." : "＋ เพิ่ม"}</button>
            </div>
            {pmGroup && <p className="text-[11px] text-slate-500 px-0.5">💡 {groupHint(pmGroup)}</p>}
          </div>

          {pmRows.length > 0 && (
            <input value={pmSearch} onChange={(e) => setPmSearch(e.target.value)} placeholder="ค้นหาวัสดุ (ชื่อ/ชนิด)..."
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          {pmLoading ? <div className="py-8 text-center text-sm text-slate-300">กำลังโหลด...</div>
            : pmRows.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">— ยังไม่มีวัสดุ เพิ่มจากแถวด้านบน —</div>
            : pmShown.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">ไม่พบวัสดุที่ค้นหา</div>
            : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    {([["name", "ชื่อวัสดุ", "text-left"], ["group", "ชนิด", "text-center w-32"], ["price", "ราคา/หน่วย", "text-right w-28"]] as const).map(([k, label, cls]) => (
                      <th key={k} className={`border border-slate-200 px-2 py-1.5 cursor-pointer hover:bg-slate-100 select-none ${cls}`} onClick={() => pmToggleSort(k)}>
                        {label}{pmSort.key === k ? (pmSort.dir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                    <th className="border border-slate-200 px-2 py-1.5 w-20">หน่วย</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-32 text-right">หน้ากว้าง / ขนาดชิ้น</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {pmShown.map((r) => {
                    const editing = pmEditId === r.id;
                    return (
                      <tr key={r.id}>
                        <td className="border border-slate-200 px-2 py-1">
                          {editing ? <input value={pmEdit.name} onChange={(e) => setPmEdit({ ...pmEdit, name: e.target.value })} className="w-full h-7 px-1 text-sm border border-slate-200 rounded" />
                            : <span className="text-slate-700">{r.name}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {editing ? (
                            <select value={pmEdit.material_group_id} onChange={(e) => {
                                const gid = e.target.value; const g = mgOf(gid); const piece = isPieceGroup(g?.code, g?.name);
                                setPmEdit((p) => ({ ...p, material_group_id: gid,
                                  uom: p.uom.trim() ? p.uom : (g?.uom_default ?? ""),                          // เติมหน่วยถ้ายังว่าง
                                  face: piece || (g && g.calc_method !== "area_face") ? "" : p.face,           // ชนิดชิ้น/ไม่ใช้ → เคลียร์หน้ากว้าง
                                  width: piece ? p.width : "", length: piece ? p.length : "" }));               // ไม่ใช่ชนิดชิ้น → เคลียร์กว้างยาว
                              }} className="w-full h-7 px-1 text-xs border border-slate-200 rounded">
                              <option value="">— ชนิด —</option>
                              {mgList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          ) : <span className="text-xs text-slate-500">{mgName(r.material_group_id)}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right tabular-nums">
                          {editing ? <input type="number" min={0} step="any" value={pmEdit.price} onChange={(e) => setPmEdit({ ...pmEdit, price: e.target.value })} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                            : (r.price_per_unit != null ? Number(r.price_per_unit).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—")}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {editing ? <input value={pmEdit.uom} onChange={(e) => setPmEdit({ ...pmEdit, uom: e.target.value })} className="w-full h-7 px-1 text-sm border border-slate-200 rounded" />
                            : <span className="text-slate-500">{r.uom ?? "—"}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right tabular-nums">
                          {editing
                            ? (groupUsesPiece(pmEdit.material_group_id)
                                ? <span className="inline-flex items-center gap-0.5 justify-end">
                                    <input type="number" min={0} step="any" value={pmEdit.width} onChange={(e) => setPmEdit({ ...pmEdit, width: e.target.value })} placeholder="ก" className="w-12 h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                    <span className="text-slate-400 text-xs">×</span>
                                    <input type="number" min={0} step="any" value={pmEdit.length} onChange={(e) => setPmEdit({ ...pmEdit, length: e.target.value })} placeholder="ย" className="w-12 h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                  </span>
                                : groupUsesFace(pmEdit.material_group_id)
                                ? <input type="number" min={0} step="any" value={pmEdit.face} onChange={(e) => setPmEdit({ ...pmEdit, face: e.target.value })} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                : <span className="text-slate-300" title="ชนิดนี้ไม่ใช้">—</span>)
                            : (r.width_cm != null && r.length_cm != null
                                ? <span className="text-violet-600 text-xs">{Number(r.width_cm).toLocaleString("th-TH")}×{Number(r.length_cm).toLocaleString("th-TH")} = {Math.round(r.width_cm * r.length_cm * 100) / 100} cm²</span>
                                : r.face_width_cm != null ? Number(r.face_width_cm).toLocaleString("th-TH") : "—")}
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center whitespace-nowrap">
                          {editing ? (<>
                            <button onClick={() => void pmSaveEdit()} title="บันทึก" className="h-6 px-1.5 text-xs bg-emerald-600 text-white rounded mr-1">✓</button>
                            <button onClick={() => setPmEditId(null)} title="ยกเลิก" className="h-6 px-1.5 text-xs border border-slate-200 rounded">✕</button>
                          </>) : (<>
                            <button onClick={() => pmCopy(r)} title="คัดลอกเป็นตัวใหม่" className="h-6 px-1.5 text-xs border border-slate-200 rounded text-slate-500 mr-1">⧉</button>
                            <button onClick={() => pmStartEdit(r)} title="แก้" className="h-6 px-1.5 text-xs border border-slate-200 rounded text-slate-500 mr-1">✏</button>
                            <button onClick={() => setPmDel(r)} title="เก็บเข้ากรุ" className="h-6 px-1.5 text-xs border border-rose-200 rounded text-rose-500">🗑</button>
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          <p className="text-[11px] text-slate-400">จัดการแบบเต็ม (Studio/นำเข้า/ส่งออก) อยู่ที่เมนู <a href="/master/design-price-items" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">🧮 วัสดุตีราคา</a></p>
        </div>
      </ERPModal>

      <ConfirmDialog open={pmDel !== null} onClose={() => setPmDel(null)} onConfirm={pmDelete}
        title="เก็บวัสดุเข้ากรุ" variant="danger" confirmText="เก็บเข้ากรุ" cancelText="ยกเลิก"
        message={`เก็บวัสดุ "${pmDel?.name ?? ""}" เข้ากรุหรือไม่? บรรทัดตีราคาเดิมที่เคยใช้วัสดุนี้ยังอยู่ครบ`} />

      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)} onConfirm={doArchive}
        title="เก็บเข้ากรุ" variant="danger" loading={archiving}
        confirmText="เก็บเข้ากรุ" cancelText="ยกเลิก"
        message={`ต้องการเก็บใบงาน ${archiveTarget?.code ?? ""} (${archiveTarget?.name ?? ""}) เข้ากรุหรือไม่? ข้อมูลยังอยู่ กู้คืนได้ภายหลัง`} />

      <ConfirmDialog open={hardDelTarget !== null} onClose={() => setHardDelTarget(null)} onConfirm={doHardDelete}
        title="ลบใบงานถาวร" variant="danger" loading={hardDeleting}
        confirmText="ลบถาวร" cancelText="ยกเลิก"
        message={`ต้องการลบใบงาน ${hardDelTarget?.code ?? ""} (${hardDelTarget?.name ?? ""}) ถาวรหรือไม่?\n\nระบบจะลบใบงาน + comment + ตีราคา + เสนอราคา และย้ายรูปทั้งหมดเข้าถังขยะ R2 (สำรอง 30 วัน) — ต่างจาก "เก็บเข้ากรุ" ที่ยังกู้คืนได้`} />
    </>
  );
}
