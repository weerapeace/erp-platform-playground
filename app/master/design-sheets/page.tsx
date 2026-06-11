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
import { CanvasSketch, type CanvasSketchControls } from "@/components/canvas-sketch";
import { QUOTE_STATUS, QUOTE_STATUS_OPTS, calcCostQty, buildStatusMeta, UNKNOWN_STATUS_CLS, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";
import type { PriceItem } from "@/app/api/design-sheets/price-items/route";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";

type Brand = { id: string; name: string; color: string | null };

type FormState = {
  id: string | null; code: string;
  name: string; brand_id: string; detail: string; note: string;
  status: string; order_date: string; deadline: string; drive_link: string;
  parent_sku_code: string;
};
const todayStr = () => new Date().toISOString().slice(0, 10);
// วันที่สั่ง default = วันนี้ (แก้ได้)
const empty = (): FormState => ({ id: null, code: "", name: "", brand_id: "", detail: "", note: "", status: "design", order_date: todayStr(), deadline: "", drive_link: "", parent_sku_code: "" });

// บรรทัดตีราคา (เฟส 4) — row ฝั่งหน้าจอ = CostLine + key ชั่วคราว
type CostRow = CostLine & { key: string };
const METHOD_LABEL: Record<string, string> = { area_face: "พื้นที่÷หน้ากว้าง", area_100: "พื้นที่÷100", length: "ความยาว", count: "นับชิ้น", manual: "พิมพ์เอง" };
const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const fmtBaht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** คิดปริมาณ+ยอดเงินใหม่หลังแก้ค่าในบรรทัด — สูตร manual ให้พิมพ์ปริมาณเอง */
function recomputeRow(r: CostRow): CostRow {
  const auto = calcCostQty(r);
  const qty = auto != null ? auto : r.qty;
  const amount = qty != null && r.unit_price != null ? Math.round(qty * r.unit_price * 100) / 100 : null;
  return { ...r, qty, amount };
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

  // เตือนก่อนปิด เมื่อมีข้อมูลยังไม่บันทึก (กระดาน + ตีราคา)
  const canvasControlsRef = useRef<CanvasSketchControls | null>(null);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);

  // ---- เฟส 3: แท็บในป๊อปอัพ + comment ลูกค้า + รอบเสนอราคา ----
  const [modalTab, setModalTab] = useState<"info" | "board" | "comments" | "cost" | "quotes">("info");
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
  const [newQPrice, setNewQPrice] = useState("");
  const [newQStatus, setNewQStatus] = useState("pending");
  const [newQNote, setNewQNote] = useState("");
  const [qSaving, setQSaving] = useState(false);
  const [editQid, setEditQid] = useState<string | null>(null);
  const [editQ, setEditQ] = useState({ quote_date: "", price: "", note: "" });
  const [delQuote, setDelQuote] = useState<DesignSheetQuote | null>(null);

  // ---- เฟส 4: ตีราคา ----
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [costLines, setCostLines] = useState<CostRow[]>([]);
  const [costDirty, setCostDirty] = useState(false);
  const [costSaving, setCostSaving] = useState(false);
  const costTotal = costLines.reduce((s, r) => s + (r.amount || 0), 0);

  // ---- เฟส 5: ตั้ง Parent SKU + ตัวเช็ครหัส ----
  const [skuCheck, setSkuCheck] = useState<ParentSkuCheck | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);

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
  type PmRow = { id: string; name: string; code: string | null; material_group_id: string | null; price_per_unit: number | null; uom: string | null; face_width_cm: number | null };
  const [pmOpen, setPmOpen] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmRows, setPmRows] = useState<PmRow[]>([]);
  const [mgList, setMgList] = useState<Array<{ id: string; name: string }>>([]);
  const [pmName, setPmName] = useState("");
  const [pmGroup, setPmGroup] = useState("");
  const [pmPrice, setPmPrice] = useState("");
  const [pmUom, setPmUom] = useState("");
  const [pmFace, setPmFace] = useState("");
  const [pmSaving, setPmSaving] = useState(false);
  const [pmEditId, setPmEditId] = useState<string | null>(null);
  const [pmEdit, setPmEdit] = useState({ name: "", material_group_id: "", price: "", uom: "", face: "" });
  const [pmDel, setPmDel] = useState<PmRow | null>(null);
  const mgName = (id: string | null) => mgList.find((g) => g.id === id)?.name ?? "—";

  const loadPm = useCallback(async () => {
    setPmLoading(true);
    try {
      const [ir, gr] = await Promise.all([
        apiFetch("/api/master-v2/design-price-items?limit=500").then((r) => r.json()),
        apiFetch("/api/bom/material-groups").then((r) => r.json()),
      ]);
      setPmRows((ir.data ?? ir.rows ?? []) as PmRow[]);
      setMgList((gr.data ?? []) as Array<{ id: string; name: string }>);
    } catch { /* ignore */ } finally { setPmLoading(false); }
  }, []);

  const openPm = () => { setPmOpen(true); setPmEditId(null); setPmName(""); setPmGroup(""); setPmPrice(""); setPmUom(""); setPmFace(""); void loadPm(); };
  const closePm = () => { setPmOpen(false); setPriceItems([]); };   // ปิดแล้ว dropdown วัสดุในตารางตีราคารีโหลดเอง

  const pmAdd = async () => {
    if (!pmName.trim()) { toast.error("กรุณาใส่ชื่อวัสดุ"); return; }
    setPmSaving(true);
    try {
      const res = await apiFetch("/api/master-v2/design-price-items", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmName.trim(), material_group_id: pmGroup || null, price_per_unit: pmPrice === "" ? null : Number(pmPrice), uom: pmUom.trim() || null, face_width_cm: pmFace === "" ? null : Number(pmFace) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPmName(""); setPmPrice(""); setPmUom(""); setPmFace("");
      await loadPm(); toast.success("เพิ่มวัสดุแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มวัสดุไม่สำเร็จ"); }
    finally { setPmSaving(false); }
  };

  const pmStartEdit = (r: PmRow) => { setPmEditId(r.id); setPmEdit({ name: r.name ?? "", material_group_id: r.material_group_id ?? "", price: r.price_per_unit != null ? String(r.price_per_unit) : "", uom: r.uom ?? "", face: r.face_width_cm != null ? String(r.face_width_cm) : "" }); };
  const pmSaveEdit = async () => {
    if (!pmEditId) return;
    if (!pmEdit.name.trim()) { toast.error("กรุณาใส่ชื่อวัสดุ"); return; }
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${pmEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmEdit.name.trim(), material_group_id: pmEdit.material_group_id || null, price_per_unit: pmEdit.price === "" ? null : Number(pmEdit.price), uom: pmEdit.uom.trim() || null, face_width_cm: pmEdit.face === "" ? null : Number(pmEdit.face) }) });
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

  // ---- เตือนก่อนปิด (มีข้อมูลยังไม่บันทึก: กระดาน หรือ ตีราคา) ----
  const hasUnsavedClose = () => (canvasControlsRef.current?.isDirty() ?? false) || costDirty;
  const doClose = useCallback(() => {
    setForm(null); clearPend(); setCloseConfirm(false); setCanvasDirty(false);
  }, [clearPend]);
  const requestClose = () => {
    if (saving) return;
    if (hasUnsavedClose()) setCloseConfirm(true);
    else doClose();
  };
  // "บันทึกแล้วปิด" — บันทึกกระดาน + ตีราคา ที่ค้าง แล้วปิด
  const saveAndClose = async () => {
    setCloseSaving(true);
    try {
      if (canvasControlsRef.current?.isDirty()) await canvasControlsRef.current.save();
      if (costDirty) await saveCost();
      doClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setCloseSaving(false); }
  };
  // "ออกโดยไม่บันทึก" — ทิ้งกระดานที่ค้าง (กัน auto-save ตอน unmount) แล้วปิด
  const discardAndClose = () => { canvasControlsRef.current?.discard(); doClose(); };

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
      .then((j) => { if (!j.error) setPriceItems((j.data ?? []) as PriceItem[]); }).catch(() => {});
  }, [form?.id, priceItems.length]);

  // เช็ครหัส Parent SKU แบบหน่วง 400ms ระหว่างพิมพ์
  useEffect(() => {
    const code = form?.parent_sku_code?.trim() ?? "";
    if (!code) { setSkuCheck(null); setSkuChecking(false); return; }
    setSkuChecking(true);
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`).then((r) => r.json())
        .then((j) => { if (!j.error) setSkuCheck(j.data as ParentSkuCheck); })
        .catch(() => {})
        .finally(() => setSkuChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [form?.parent_sku_code]);

  const saveCost = useCallback(async (): Promise<boolean> => {
    if (!form?.id) return false;
    setCostSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/cost-lines`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: costLines.map((row, i) => { const { key: _key, ...l } = row; void _key; return { ...l, sort_order: i + 1 }; }) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setCostDirty(false);
      toast.success(`บันทึกตีราคาแล้ว (${j.saved} บรรทัด)`);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกตีราคาไม่สำเร็จ"); return false; }
    finally { setCostSaving(false); }
  }, [form?.id, costLines, toast]);

  // ส่งยอดรวมตีราคาไปเป็นรอบเสนอราคาใหม่
  const sendCostToQuote = async () => {
    if (!form?.id) return;
    const total = Math.round(costTotal * 100) / 100;
    if (!(total > 0)) { toast.error("ยังไม่มียอดตีราคา — ใส่บรรทัดวัสดุก่อน"); return; }
    if (costDirty && !(await saveCost())) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: todayStr(), price: total, status: "pending", note: "จากตีราคา" }) });
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
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: newQDate || todayStr(), price: newQPrice === "" ? null : Number(newQPrice), status: newQStatus, note: newQNote || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNewQPrice(""); setNewQNote(""); setNewQStatus("pending"); setNewQDate(todayStr());
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

  const startEditQuote = (q: DesignSheetQuote) => { setEditQid(q.id); setEditQ({ quote_date: q.quote_date ?? "", price: q.price != null ? String(q.price) : "", note: q.note ?? "" }); };
  const saveEditQuote = async () => {
    if (!form?.id || !editQid) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes/${editQid}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: editQ.quote_date || null, price: editQ.price === "" ? null : Number(editQ.price), note: editQ.note || null }) });
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

  // สถานะจากระบบ Workflow กลาง (แก้เองได้ที่ /admin/workflows) — โหลดไม่ได้ = ใช้ชุดสำรองในโค้ด
  const [wfMeta, setWfMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const statusOf = (key: string) => wfMeta.map[key] ?? { label: key, cls: UNKNOWN_STATUS_CLS };

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
    const params = new URLSearchParams({ limit: "500", sort_by: "deadline", sort_dir: "asc" });
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

  const openCreate = () => { setForm(empty()); setFormErr(null); setModalTab("info"); setNewCmDate(todayStr()); setNewQDate(todayStr()); setEditCid(null); setEditQid(null); setOpenImgCid(null); clearPend(); };

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
        parent_sku_code: d.parent_sku_code ?? "",
      });
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { setFormErr("กรุณาใส่ชื่องาน"); return; }
    if (form.parent_sku_code.trim() && skuCheck?.exists) { setFormErr(`รหัส Parent SKU "${form.parent_sku_code.trim().toUpperCase()}" มีอยู่แล้ว — ห้ามตั้งซ้ำ`); return; }
    setSaving(true); setFormErr(null);
    const payload = {
      name: form.name.trim(), brand_id: form.brand_id || null, detail: form.detail || null, note: form.note || null,
      status: form.status, order_date: form.order_date || null, deadline: form.deadline || null, drive_link: form.drive_link || null,
      parent_sku_code: form.parent_sku_code.trim() ? form.parent_sku_code.trim().toUpperCase() : null,
    };
    try {
      const res = form.id
        ? await apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/design-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (form.id) {
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
    { key: "item", header: "วัสดุ", minWidth: 190, getValue: (r) => r.item_name,
      render: (r, u) => (
        <select value={r.item_id ?? ""} disabled={!canEdit}
          onChange={(e) => {
            const it = priceItems.find((p) => p.id === e.target.value);
            u(it ? { item_id: it.id, item_name: it.name, group_name: it.group_name, calc_method: it.calc_method,
                     waste_percent: it.loss_percent, divisor: it.divisor, face_width_cm: it.face_width_cm ?? r.face_width_cm,
                     uom: it.uom ?? it.uom_default ?? r.uom, unit_price: it.price_per_unit }
                 : { item_id: null });
          }}
          className="w-full h-8 px-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
          <option value="">— เลือกวัสดุ —</option>
          {priceItems.map((p) => <option key={p.id} value={p.id}>{p.name}{p.group_name ? ` (${p.group_name})` : ""}</option>)}
        </select>
      ) },
    { key: "group", header: "ชนิด / สูตร", width: 116, getValue: (r) => r.group_name,
      render: (r) => (
        <span className="block px-1 text-xs text-slate-500 leading-tight">{r.group_name ?? "—"}<br />
          <span className="text-[10px] text-slate-300">{METHOD_LABEL[r.calc_method ?? "manual"] ?? r.calc_method}</span></span>
      ) },
    { key: "width_cm", header: "กว้าง (ซม.)", width: 84, align: "right", getValue: (r) => r.width_cm,
      render: (r, u) => <input type="number" min={0} step="any" value={r.width_cm ?? ""} disabled={!canEdit}
        onChange={(e) => u({ width_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} /> },
    { key: "length_cm", header: "ยาว (ซม.)", width: 84, align: "right", getValue: (r) => r.length_cm,
      render: (r, u) => <input type="number" min={0} step="any" value={r.length_cm ?? ""} disabled={!canEdit}
        onChange={(e) => u({ length_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} /> },
    { key: "pieces", header: "จำนวนชิ้น", width: 80, align: "right", getValue: (r) => r.pieces,
      render: (r, u) => <input type="number" min={0} step="any" value={r.pieces ?? ""} disabled={!canEdit}
        onChange={(e) => u({ pieces: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} /> },
    { key: "face_width_cm", header: "หน้ากว้าง", width: 80, align: "right", getValue: (r) => r.face_width_cm,
      render: (r, u) => r.calc_method === "area_face"
        ? <input type="number" min={0} step="any" value={r.face_width_cm ?? ""} disabled={!canEdit}
            onChange={(e) => u({ face_width_cm: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right text-slate-300 text-xs">—</span> },
    { key: "qty", header: "ปริมาณ", width: 90, align: "right", summable: true, getValue: (r) => r.qty,
      render: (r, u) => (!r.calc_method || r.calc_method === "manual") && canEdit
        ? <input type="number" min={0} step="any" value={r.qty ?? ""} placeholder="พิมพ์เอง"
            onChange={(e) => u({ qty: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right tabular-nums font-medium text-slate-700">{fmtQty(r.qty)}</span> },
    { key: "uom", header: "หน่วย", width: 70, getValue: (r) => r.uom,
      render: (r, u) => <input value={r.uom ?? ""} disabled={!canEdit} onChange={(e) => u({ uom: e.target.value || null })}
        className="w-full h-8 px-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" /> },
    { key: "unit_price", header: "ราคา/หน่วย", width: 96, align: "right", getValue: (r) => r.unit_price,
      render: (r, u) => <input type="number" min={0} step="any" value={r.unit_price ?? ""} disabled={!canEdit}
        onChange={(e) => u({ unit_price: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} /> },
    { key: "amount", header: "รวม (บาท)", width: 104, align: "right", summable: true, getValue: (r) => r.amount,
      render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmtBaht(r.amount)}</span> },
  ], [priceItems, canEdit]);

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
            <a href="/master/design-sheets/canvas-demo" title="เดโม่กระดานรายละเอียดงาน — ลองเล่นก่อนตัดสินใจ"
              className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🧪 ทดลอง Canvas</a>
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
                {([["info", "📋 ข้อมูลงาน"], ["board", "🖌 กระดาน"], ["comments", `💬 Comment ลูกค้า (${comments.length})`], ["cost", `🧮 ตีราคา (${costLines.length})`], ["quotes", `💰 เสนอราคา (${quotes.length})`]] as const).map(([k, l]) => (
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
              {/* เฟส 5: ตั้ง Parent SKU + เช็ครหัสสด (ซ้ำ=แดง ห้ามบันทึก · ข้ามเลข=เตือนแต่ตั้งได้) */}
              <label className="block">
                <span className="text-[11px] text-slate-500">Parent SKU ที่จะตั้ง</span>
                <input value={form.parent_sku_code} onChange={(e) => patch({ parent_sku_code: e.target.value.toUpperCase() })} disabled={!canEdit} placeholder="เช่น CTL085"
                  className={`w-full h-8 mt-0.5 px-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 disabled:bg-slate-50 ${
                    skuCheck?.exists ? "border-rose-400 bg-rose-50 focus:ring-rose-400"
                    : skuCheck?.skipped ? "border-amber-300 focus:ring-amber-400"
                    : "border-slate-200 focus:ring-blue-500"}`} />
                <div className="mt-0.5 text-[11px] min-h-[14px]">
                  {skuChecking ? <span className="text-slate-300">กำลังเช็ครหัส...</span>
                    : !form.parent_sku_code.trim() ? null
                    : skuCheck?.exists ? <span className="text-rose-600 font-medium">✕ รหัสนี้มีอยู่แล้ว — ห้ามตั้งซ้ำ (บันทึกไม่ได้)</span>
                    : skuCheck?.skipped ? <span className="text-amber-600">⚠ ตั้งข้ามเลข — ล่าสุดที่ตั้งคือ {skuCheck.latest} (ตั้งได้ แต่เช็คว่าตั้งใจ)</span>
                    : skuCheck?.latest ? <span className="text-slate-400">✓ ใช้ได้ · ล่าสุดที่ตั้ง: <b>{skuCheck.latest}</b>{skuCheck.suggested ? <> · ถัดไป: <b className="text-emerald-600">{skuCheck.suggested}</b></> : null}{skuCheck.max_code ? <> · เลขสูงสุด: {skuCheck.max_code}</> : null}</span>
                    : skuCheck ? <span className="text-emerald-600">✓ ยังไม่มีรหัสกลุ่มนี้ ใช้ได้</span> : null}
                </div>
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] text-slate-500">รายละเอียดงาน</span>
              <textarea rows={3} value={form.detail} onChange={(e) => patch({ detail: e.target.value })} disabled={!canEdit}
                className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            </label>

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

            {/* แท็บกระดานวาด (ของกลาง CanvasSketch — Excalidraw) */}
            {modalTab === "board" && form.id && (
              <CanvasSketch entityType="design_sheet" entityId={form.id} editable={canEdit} height="56vh"
                onDirtyChange={setCanvasDirty} controlsRef={canvasControlsRef} />
            )}

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">เลือกวัสดุในบรรทัด → ระบบเติมชนิด/สูตร/ราคาให้อัตโนมัติ</span>
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
                onAdd={() => ({
                  key: `n${Date.now()}_${costLines.length}`,
                  item_id: null, item_name: null, group_name: null, calc_method: null,
                  width_cm: null, length_cm: null, pieces: null, face_width_cm: null,
                  waste_percent: null, divisor: null, qty: null, uom: null,
                  unit_price: null, amount: null, note: null, sort_order: costLines.length + 1,
                })}
                addLabel="＋ เพิ่มบรรทัดตีราคา"
                emptyText="ยังไม่มีบรรทัดตีราคา — กดเพิ่มบรรทัด เลือกวัสดุ แล้วใส่ กว้าง × ยาว × จำนวน"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-sm text-slate-600">รวมตีราคา: <b className="text-base text-emerald-700">{fmtBaht(costTotal)}</b> บาท
                  {costDirty && <span className="ml-2 text-[11px] text-amber-600">● มีแก้ไขที่ยังไม่บันทึก</span>}</div>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <button onClick={() => void saveCost()} disabled={costSaving}
                      className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{costSaving ? "กำลังบันทึก..." : "💾 บันทึกตีราคา"}</button>
                    <button onClick={() => void sendCostToQuote()} disabled={costSaving || !(costTotal > 0)}
                      className="h-8 px-3 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50">→ ส่งยอดไปเสนอราคา</button>
                  </div>
                )}
              </div>
            </div>}

            {/* แท็บรอบเสนอราคา (เฟส 3) */}
            {modalTab === "quotes" && form.id && <div className="space-y-2">
              {canEdit && (
                <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input type="date" value={newQDate} onChange={(e) => setNewQDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36" />
                  <input type="number" min={0} step="any" value={newQPrice} onChange={(e) => setNewQPrice(e.target.value)} placeholder="ราคา (บาท)"
                    className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg w-32" />
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
                      <th className="border border-slate-200 px-2 py-1.5 w-32 text-right">ราคา (บาท)</th>
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
                          <td className="border border-slate-200 px-2 py-1 text-right tabular-nums">
                            {editing ? <input type="number" min={0} step="any" value={editQ.price} onChange={(e) => setEditQ({ ...editQ, price: e.target.value })} className="h-7 px-1 w-24 text-sm text-right border border-slate-200 rounded" />
                              : (q.price != null ? Number(q.price).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—")}
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

      {/* เตือนก่อนปิด เมื่อมีข้อมูลยังไม่บันทึก (กระดาน/ตีราคา) — 3 ทางเลือก */}
      <ERPModal open={closeConfirm} onClose={() => !closeSaving && setCloseConfirm(false)} size="sm" title="ยังไม่ได้บันทึก"
        footer={<>
          <button onClick={() => setCloseConfirm(false)} disabled={closeSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">อยู่ต่อ</button>
          <button onClick={discardAndClose} disabled={closeSaving} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50">ออกโดยไม่บันทึก</button>
          <button onClick={() => void saveAndClose()} disabled={closeSaving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{closeSaving ? "กำลังบันทึก..." : "บันทึกแล้วปิด"}</button>
        </>}>
        <p className="text-sm text-slate-600">
          มีข้อมูลที่ยังไม่ได้บันทึก{canvasControlsRef.current?.isDirty() ? " (กระดาน)" : ""}{costDirty ? " (ตีราคา)" : ""} —
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

      {/* ป๊อปจัดการวัสดุตีราคา — CRUD ผ่าน API กลาง master-v2 (เหมือนหน้า /master/design-price-items) */}
      <ERPModal open={pmOpen} onClose={closePm} size="lg" title="🧮 จัดการวัสดุตีราคา"
        footer={<button onClick={closePm} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด (รายการวัสดุในตารางจะอัปเดตเอง)</button>}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="ชื่อวัสดุ เช่น ผ้าแคนวาส *"
              onKeyDown={(e) => { if (e.key === "Enter") void pmAdd(); }}
              className="flex-1 min-w-[150px] h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={pmGroup} onChange={(e) => setPmGroup(e.target.value)}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36">
              <option value="">— ชนิด —</option>
              {mgList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input type="number" min={0} step="any" value={pmPrice} onChange={(e) => setPmPrice(e.target.value)} placeholder="ราคา/หน่วย"
              className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
            <input value={pmUom} onChange={(e) => setPmUom(e.target.value)} placeholder="หน่วย"
              className="h-8 px-2 w-20 text-sm border border-slate-200 rounded-lg" />
            <input type="number" min={0} step="any" value={pmFace} onChange={(e) => setPmFace(e.target.value)} placeholder="หน้ากว้าง"
              className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
            <button onClick={() => void pmAdd()} disabled={pmSaving}
              className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{pmSaving ? "..." : "＋ เพิ่ม"}</button>
          </div>

          {pmLoading ? <div className="py-8 text-center text-sm text-slate-300">กำลังโหลด...</div>
            : pmRows.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">— ยังไม่มีวัสดุ เพิ่มจากแถวด้านบน —</div>
            : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    <th className="border border-slate-200 px-2 py-1.5 text-left">ชื่อวัสดุ</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-32">ชนิด</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-28 text-right">ราคา/หน่วย</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-20">หน่วย</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-24 text-right">หน้ากว้าง</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {pmRows.map((r) => {
                    const editing = pmEditId === r.id;
                    return (
                      <tr key={r.id}>
                        <td className="border border-slate-200 px-2 py-1">
                          {editing ? <input value={pmEdit.name} onChange={(e) => setPmEdit({ ...pmEdit, name: e.target.value })} className="w-full h-7 px-1 text-sm border border-slate-200 rounded" />
                            : <span className="text-slate-700">{r.name}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {editing ? (
                            <select value={pmEdit.material_group_id} onChange={(e) => setPmEdit({ ...pmEdit, material_group_id: e.target.value })} className="w-full h-7 px-1 text-xs border border-slate-200 rounded">
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
                          {editing ? <input type="number" min={0} step="any" value={pmEdit.face} onChange={(e) => setPmEdit({ ...pmEdit, face: e.target.value })} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                            : (r.face_width_cm != null ? Number(r.face_width_cm).toLocaleString("th-TH") : "—")}
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center whitespace-nowrap">
                          {editing ? (<>
                            <button onClick={() => void pmSaveEdit()} title="บันทึก" className="h-6 px-1.5 text-xs bg-emerald-600 text-white rounded mr-1">✓</button>
                            <button onClick={() => setPmEditId(null)} title="ยกเลิก" className="h-6 px-1.5 text-xs border border-slate-200 rounded">✕</button>
                          </>) : (<>
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
    </>
  );
}
