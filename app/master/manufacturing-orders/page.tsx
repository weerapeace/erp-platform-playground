"use client";

/**
 * Manufacturing Orders (ใบสั่งผลิต) — เฟส A
 * สร้าง MO: เลขรันอัตโนมัติ + เลือกสินค้า(รูป) + ดึง BOM เวอร์ชั่น default + กางสูตรตามจำนวน
 * ของกลาง: DataTable(server) / ERPModal / ConfirmDialog / ComponentPicker / useToast / useAuth
 */
import { useState, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ServerFetchParams } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ComponentPicker } from "../bom/line-editor";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import type { MoListItem } from "@/app/api/mo/route";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import type { Assignee } from "@/app/api/mo/assignees/route";
import { WorkInstructionPanel } from "@/components/work-instruction";

type Version = { id: string; version: string | null; bom_code: string; is_default: boolean };
type PreviewMat = {
  key: string; id: string | null; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty_per: number; uom: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null;
  on_hand_qty: number; is_ready: boolean; purchase_override: number | null; cut_done: boolean;
};
type MatRow = PreviewMat & { required: number; to_purchase: number };
type SummaryMat = { key: string; id: string | null; component_sku: string | null; component_name: string | null; material_type: string | null; uom: string | null; qty_per: number; on_hand_qty: number; is_ready: boolean; purchase_override: number | null };
type FormState = {
  id: string | null; mo_no: string;
  product_sku: string; product_name: string; product_image: string | null;
  qty: number; due_date: string;
  bom_code: string | null; bom_version: string | null; bom_id: string | null;
  status: string; note: string;
  materials: PreviewMat[];   // ต่อบล็อก (แท็บรายละเอียด)
  summary: SummaryMat[];     // รวมต่อวัตถุดิบ (แท็บวัตถุดิบที่ต้องใช้ + checklist)
  requested: Record<string, number>;  // วัตถุดิบ(รหัส) → จำนวนที่ขอซื้อไปแล้ว (จากใบขอซื้อที่ผูก MO นี้)
};
const empty = (): FormState => ({ id: null, mo_no: "", product_sku: "", product_name: "", product_image: null, qty: 1, due_date: "", bom_code: null, bom_version: null, bom_id: null, status: "draft", note: "", materials: [], summary: [], requested: {} });

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:       { label: "ร่าง",        cls: "bg-slate-100 text-slate-600" },
  confirmed:   { label: "ยืนยันแล้ว",   cls: "bg-blue-50 text-blue-700" },
  in_progress: { label: "กำลังผลิต",    cls: "bg-amber-50 text-amber-700" },
  done:        { label: "เสร็จ",        cls: "bg-emerald-50 text-emerald-700" },
  cancelled:   { label: "ยกเลิก",       cls: "bg-rose-50 text-rose-700" },
};
const STATUS_OPTS = [["draft","ร่าง"],["confirmed","ยืนยันแล้ว"],["in_progress","กำลังผลิต"],["done","เสร็จ"],["cancelled","ยกเลิก"]] as const;
const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");

// ขั้นตอนงาน (จ่ายงาน) — ตัด/เตรียม → ประกอบ(รวมเย็บ) แล้วส่ง QC (โมดูลแยก)
const STAGES = [["cut", "ตัด / เตรียม"], ["assemble", "ประกอบ (เย็บ)"]] as const;
const stageLabel = (s: string) => STAGES.find((x) => x[0] === s)?.[1] ?? s;
const WO_STATUS: Record<string, { label: string; cls: string }> = {
  dispatched:     { label: "จ่ายแล้ว",       cls: "bg-blue-50 text-blue-700" },
  in_progress:    { label: "กำลังทำ",        cls: "bg-amber-50 text-amber-700" },
  partial_return: { label: "รับคืนบางส่วน",  cls: "bg-orange-50 text-orange-700" },
  done:           { label: "รับครบ",         cls: "bg-emerald-50 text-emerald-700" },
  cancelled:      { label: "ยกเลิก",         cls: "bg-rose-50 text-rose-700" },
};

export default function MoWorkspacePage() {
  const canView = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit = usePermission("products.edit");
  const { can, user } = useAuth();
  const toast = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const [form, setForm] = useState<FormState | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<MoListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [matTab, setMatTab] = useState<"sum" | "block">("sum");
  const [editBuy, setEditBuy] = useState<Set<string>>(new Set());
  // popup สร้างใบขอซื้อ
  type PrItem = { key: string; sku: string | null; name: string | null; uom: string | null; qty: number; include: boolean };
  const [prOpen, setPrOpen] = useState(false);
  const [prDate, setPrDate] = useState("");
  const [prRequester, setPrRequester] = useState("");
  const [prItems, setPrItems] = useState<PrItem[]>([]);
  const [prSaving, setPrSaving] = useState(false);
  // ใบจ่ายงาน (เฟส C)
  const [woList, setWoList] = useState<WorkOrder[]>([]);
  const [woLoading, setWoLoading] = useState(false);
  const [assignees, setAssignees] = useState<{ craftsmen: Assignee[]; departments: Assignee[] }>({ craftsmen: [], departments: [] });
  const [dispOpen, setDispOpen] = useState(false);
  const [dispStage, setDispStage] = useState<string>("cut");
  const [dispType, setDispType] = useState<"craftsman" | "department">("craftsman");
  const [dispAssignee, setDispAssignee] = useState("");   // id ผู้รับ
  const [dispQty, setDispQty] = useState(0);
  const [dispDue, setDispDue] = useState("");
  const [dispNote, setDispNote] = useState("");
  const [dispSaving, setDispSaving] = useState(false);
  const [recvWO, setRecvWO] = useState<WorkOrder | null>(null);  // ใบที่กำลังรับงานคืน
  const [recvQty, setRecvQty] = useState(0);
  const [recvSaving, setRecvSaving] = useState(false);

  const serverFetch = useCallback(async (p: ServerFetchParams) => {
    const params = new URLSearchParams({ limit: String(p.pageSize), offset: String((p.page - 1) * p.pageSize) });
    if (p.search) params.set("search", p.search);
    if (p.sortBy) { params.set("sort_by", p.sortBy); params.set("sort_dir", p.sortDir ?? "asc"); }
    const res = await apiFetch(`/api/mo?${params}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: json.data as MoListItem[], total: json.total as number };
  }, []);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  // ติ๊ก "ตัดครบ" รายบล็อก → อัปเดตบรรทัด + คำนวณ "เตรียมครบ" ของวัตถุดิบนั้น (ลิงก์สองทาง)
  const needsCutLine = (m: PreviewMat) => m.cut_block_code != null || m.cut_length != null || m.pieces != null;
  const applyCut = (lineId: string, sku: string | null, val: boolean) => setForm((f) => {
    if (!f) return f;
    const materials = f.materials.map((m) => (m.id === lineId ? { ...m, cut_done: val } : m));
    const cutLines = materials.filter((m) => m.component_sku === sku && needsCutLine(m));
    const allCut = cutLines.length > 0 && cutLines.every((m) => m.cut_done);
    const summary = f.summary.map((s) => (s.component_sku === sku ? { ...s, is_ready: allCut } : s));
    return { ...f, materials, summary };
  });
  const toggleCutLine = async (row: MatRow) => {
    if (!canEdit || !row.id) return;
    const next = !row.cut_done;
    applyCut(row.id, row.component_sku, next);
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) {
      applyCut(row.id, row.component_sku, !next);
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  };

  // ดึงสูตร (lines) ของ bom id มาทำ preview
  const loadBomLines = async (bomId: string): Promise<PreviewMat[]> => {
    try {
      const res = await apiFetch(`/api/bom/${bomId}`); const j = await res.json();
      return ((j.data?.lines ?? []) as Array<Record<string, unknown>>).map((l, i) => ({
        key: `m${i}`, id: null, component_sku: (l.component_sku as string) ?? null, component_name: (l.component_name as string) ?? null,
        material_type: (l.material_type as string) ?? null, qty_per: Number(l.qty) || 0, uom: (l.uom as string) ?? null,
        cut_block_code: (l.cut_block_code as string) ?? null,
        cut_width: l.cut_width != null ? Number(l.cut_width) : null, cut_length: l.cut_length != null ? Number(l.cut_length) : null,
        pieces: l.pieces != null ? Number(l.pieces) : null, on_hand_qty: 0, is_ready: false, purchase_override: null, cut_done: false,
      }));
    } catch { return []; }
  };

  const onPickProduct = async (sku: string, name: string, image: string | null) => {
    patch({ product_sku: sku, product_name: name, product_image: image, bom_code: null, bom_version: null, bom_id: null, materials: [] });
    try {
      const res = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(sku)}`); const j = await res.json();
      const vers = (j.data ?? []) as Version[]; setVersions(vers);
      const def = vers.find((v) => v.is_default) ?? vers[0];
      if (def) { const mats = await loadBomLines(def.id); patch({ bom_id: def.id, bom_code: def.bom_code, bom_version: def.version, materials: mats }); }
    } catch { setVersions([]); }
  };

  const selectVersion = async (vid: string) => {
    const v = versions.find((x) => x.id === vid); if (!v) return;
    const mats = await loadBomLines(v.id);
    patch({ bom_id: v.id, bom_code: v.bom_code, bom_version: v.version, materials: mats });
  };

  const openCreate = () => { setForm(empty()); setVersions([]); setFormErr(null); setWoList([]); };

  const openEdit = async (row: MoListItem) => {
    setLoadingForm(true); setFormErr(null); setForm(empty()); setVersions([]); setWoList([]);
    try {
      const res = await apiFetch(`/api/mo/${row.id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const d = j.data;
      const moQty = Number(d.qty) || 0;
      const mats: PreviewMat[] = (d.materials ?? []).map((m: Record<string, unknown>, i: number) => {
        const qtyPer = Number(m.qty_per) || 0; const onHand = Number(m.on_hand_qty) || 0;
        const base = Math.max(0, Math.round((qtyPer * moQty - onHand) * 10000) / 10000);
        const stored = m.to_purchase_qty != null ? Number(m.to_purchase_qty) : null;
        const override = stored != null && Math.round(stored * 10000) !== Math.round(base * 10000) ? stored : null; // เคยแก้จำนวนขอซื้อเอง
        return {
          key: `m${i}`, id: (m.id as string) ?? null, component_sku: (m.component_sku as string) ?? null, component_name: (m.component_name as string) ?? null,
          material_type: (m.material_type as string) ?? null, qty_per: qtyPer, uom: (m.uom as string) ?? null,
          cut_block_code: (m.cut_block_code as string) ?? null,
          cut_width: m.cut_width != null ? Number(m.cut_width) : null, cut_length: m.cut_length != null ? Number(m.cut_length) : null,
          pieces: m.pieces != null ? Number(m.pieces) : null,
          on_hand_qty: onHand, is_ready: !!m.is_ready, purchase_override: override, cut_done: !!m.cut_done,
        };
      });
      const summ: SummaryMat[] = (d.summary ?? []).map((s: Record<string, unknown>, i: number) => {
        const qtyPer = Number(s.qty_per) || 0; const onHand = Number(s.on_hand_qty) || 0;
        const base = Math.max(0, Math.round((qtyPer * moQty - onHand) * 10000) / 10000);
        const stored = s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null;
        const override = stored != null && Math.round(stored * 10000) !== Math.round(base * 10000) ? stored : null;
        return { key: `s${i}`, id: (s.id as string) ?? null, component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
          material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null, qty_per: qtyPer, on_hand_qty: onHand, is_ready: !!s.is_ready, purchase_override: override };
      });
      setForm({
        id: d.id, mo_no: d.mo_no ?? "", product_sku: d.product_sku ?? "", product_name: d.product_name ?? "", product_image: null,
        qty: Number(d.qty) || 1, due_date: d.due_date ?? "", bom_code: d.bom_code ?? null, bom_version: d.bom_version ?? null, bom_id: null,
        status: d.status ?? "draft", note: d.note ?? "", materials: mats, summary: summ,
        requested: (d.requested ?? {}) as Record<string, number>,
      });
      if (d.product_sku) {
        const vr = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(d.product_sku)}`); const vj = await vr.json();
        const vers = (vj.data ?? []) as Version[]; setVersions(vers);
        const cur = vers.find((v) => v.bom_code === d.bom_code); if (cur) patch({ bom_id: cur.id });
      }
      if (d.mo_no) void loadWorkOrders(d.mo_no);
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  const save = async () => {
    if (!form) return;
    if (!form.product_sku) { setFormErr("กรุณาเลือกสินค้า"); return; }
    if (!(form.qty > 0)) { setFormErr("จำนวนต้องมากกว่า 0"); return; }
    setSaving(true); setFormErr(null);
    const payload: Record<string, unknown> = { product_sku: form.product_sku, product_name: form.product_name || null, qty: form.qty,
      due_date: form.due_date || null, bom_code: form.bom_code, bom_version: form.bom_version, status: form.status, note: form.note || null };
    if (form.id) payload.materials = form.summary.filter((m) => m.id).map((m) => {
      const req = m.qty_per * (form.qty || 0);
      const base = Math.max(0, Math.round((req - (m.on_hand_qty || 0)) * 10000) / 10000);
      return { id: m.id, on_hand_qty: m.on_hand_qty || 0, is_ready: !!m.is_ready, to_purchase_qty: m.purchase_override != null ? m.purchase_override : base };
    });
    try {
      const res = form.id
        ? await apiFetch(`/api/mo/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/mo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(form.id ? "บันทึกแล้ว" : `สร้างใบสั่งผลิตแล้ว: ${j.mo_no ?? ""}`);
      setForm(null); refresh();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const doArchive = async () => {
    if (!archiveTarget) return; setArchiving(true);
    try { const res = await apiFetch(`/api/mo/${archiveTarget.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ย้ายเข้าคลังเก็บแล้ว"); setArchiveTarget(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setArchiving(false); }
  };

  // รวมวัตถุดิบเดียวกัน (ตอนสร้างใหม่ยังไม่มี summary ในฐานข้อมูล → รวมจาก lines)
  const aggregate = (mats: PreviewMat[]): SummaryMat[] => {
    const map = new Map<string, SummaryMat>();
    mats.forEach((m, i) => {
      const k = m.component_sku ?? `∅${i}`;
      const e = map.get(k);
      if (e) e.qty_per += m.qty_per || 0;
      else map.set(k, { key: `a${map.size}`, id: null, component_sku: m.component_sku, component_name: m.component_name, material_type: m.material_type, uom: m.uom, qty_per: m.qty_per || 0, on_hand_qty: 0, is_ready: false, purchase_override: null });
    });
    return [...map.values()];
  };
  const sumSource = (): SummaryMat[] => (form?.id ? form.summary : aggregate(form?.materials ?? []));

  // เปิด popup ขอซื้อ — เตรียมรายการที่ขาด + วันที่/ชื่อที่สั่ง
  const openPR = () => {
    if (!form) return;
    const reqMap = form.requested ?? {};
    const need: PrItem[] = sumSource()
      .map((m) => {
        const base = Math.max(0, Math.round((m.qty_per * (form.qty || 0) - (m.on_hand_qty || 0)) * 10000) / 10000);
        const want = m.purchase_override != null ? m.purchase_override : base;
        const got = m.component_sku ? (reqMap[m.component_sku] ?? 0) : 0;   // ขอซื้อไปแล้วเท่าไร
        const remaining = Math.max(0, Math.round((want - got) * 10000) / 10000);  // เหลือที่ยังต้องขอ
        return { key: m.key, sku: m.component_sku, name: m.component_name, uom: m.uom, qty: remaining, include: true };
      })
      .filter((x) => x.qty > 0);   // ตัดตัวที่ขอครบแล้วออก
    if (need.length === 0) { toast.info("ไม่มีรายการที่ต้องขอซื้อเพิ่ม (ขอครบ/มีของครบแล้ว)"); return; }
    setPrItems(need);
    setPrDate(new Date().toISOString().slice(0, 10));
    setPrRequester(user?.name ?? user?.email ?? "");
    setPrOpen(true);
  };

  // ส่งเข้าระบบขอซื้อ v2 (โผล่หน้า "ขอซื้อ (ช้อปปิ้ง)")
  const submitPR = async () => {
    if (!form) return;
    const items = prItems.filter((i) => i.include && i.qty > 0).map((i) => ({
      item_name: i.sku ? `[${i.sku}] ${i.name ?? ""}` : (i.name ?? ""),
      qty: i.qty, uom: i.uom,
      used_for_label: form.product_sku ? `[${form.product_sku}] ${form.product_name ?? ""}` : (form.product_name ?? ""),
      needed_date: form.due_date || null, source_mo_no: form.mo_no, note: `จากใบสั่งผลิต ${form.mo_no}`,
    }));
    if (items.length === 0) { toast.error("ยังไม่ได้เลือกรายการ"); return; }
    setPrSaving(true);
    try {
      const res = await apiFetch("/api/purchasing/create-pr", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, order_date: prDate, actor: prRequester || undefined }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้างใบขอซื้อ ${j.created} รายการ — ดูที่หน้า "ขอซื้อ (ช้อปปิ้ง)"`);
      // อัปเดตสถานะ "ขอซื้อแล้ว" ทันที (ไม่ต้องโหลดใหม่)
      setForm((f) => {
        if (!f) return f;
        const next = { ...(f.requested ?? {}) };
        for (const it of prItems) if (it.include && it.qty > 0 && it.sku) next[it.sku] = (next[it.sku] ?? 0) + it.qty;
        return { ...f, requested: next };
      });
      setPrOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างใบขอซื้อไม่สำเร็จ"); }
    finally { setPrSaving(false); }
  };

  // ---- ใบจ่ายงาน (เฟส C) ----
  const loadWorkOrders = useCallback(async (moNo: string) => {
    setWoLoading(true);
    try { const res = await apiFetch(`/api/mo/work-orders?mo_no=${encodeURIComponent(moNo)}`); const j = await res.json();
      if (!j.error) setWoList((j.data ?? []) as WorkOrder[]);
    } catch { /* ignore */ } finally { setWoLoading(false); }
  }, []);
  const loadAssignees = useCallback(async () => {
    if (assignees.craftsmen.length || assignees.departments.length) return;
    try { const res = await apiFetch("/api/mo/assignees"); const j = await res.json();
      setAssignees({ craftsmen: j.craftsmen ?? [], departments: j.departments ?? [] });
    } catch { /* ignore */ }
  }, [assignees]);

  // ค้างจ่ายต่อขั้นตอน = จำนวนผลิต − จ่ายไปแล้ว(ไม่นับยกเลิก)
  const dispatchedOf = (stage: string) => woList.filter((w) => w.stage === stage && w.status !== "cancelled").reduce((s, w) => s + (w.qty || 0), 0);
  const remainingOf = (stage: string) => Math.max(0, Math.round(((form?.qty || 0) - dispatchedOf(stage)) * 10000) / 10000);

  const openDispatch = () => {
    if (!form?.id) return;
    void loadAssignees();
    setDispStage("cut"); setDispType("craftsman"); setDispAssignee("");
    setDispQty(remainingOf("cut")); setDispDue(form.due_date || ""); setDispNote("");
    setDispOpen(true);
  };
  const submitDispatch = async () => {
    if (!form?.id) return;
    if (!(dispQty > 0)) { toast.error("จำนวนที่จ่ายต้องมากกว่า 0"); return; }
    const pool = dispType === "craftsman" ? assignees.craftsmen : assignees.departments;
    const picked = pool.find((a) => a.id === dispAssignee);
    if (!picked) { toast.error("เลือกผู้รับงานก่อน"); return; }
    setDispSaving(true);
    try {
      const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: form.mo_no, product_sku: form.product_sku, product_name: form.product_name,
          stage: dispStage, assignee_type: dispType, assignee_id: picked.id, assignee_name: picked.name,
          qty: dispQty, uom: "ชิ้น", dispatch_date: new Date().toISOString().slice(0, 10), due_date: dispDue || null, note: dispNote || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายงานแล้ว: ${j.wo_no ?? ""}`);
      setDispOpen(false); await loadWorkOrders(form.mo_no);
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setDispSaving(false); }
  };

  const openReceive = (w: WorkOrder) => { setRecvWO(w); setRecvQty(w.qty - (w.received_qty || 0)); };
  const submitReceive = async () => {
    if (!recvWO || !form) return;
    const totalRecv = (recvWO.received_qty || 0) + recvQty;
    setRecvSaving(true);
    try {
      const res = await apiFetch(`/api/mo/work-orders/${recvWO.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received_qty: totalRecv }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกรับงานคืนแล้ว");
      setRecvWO(null); await loadWorkOrders(form.mo_no);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };

  const cancelWO = async (w: WorkOrder) => {
    if (!form) return;
    try {
      const res = await apiFetch(`/api/mo/work-orders/${w.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); await loadWorkOrders(form.mo_no);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };

  const columns: ColumnDef<MoListItem>[] = useMemo(() => [
    { id: "mo_no", accessorKey: "mo_no", header: "เลขที่ MO", size: 150, cell: ({ getValue }) => <code className="font-mono text-xs text-slate-700">{getValue() as string}</code> },
    { id: "product_sku", accessorKey: "product_sku", header: "สินค้า", size: 280, cell: ({ row }) => (
      <div><code className="text-[10px] text-slate-400 font-mono">{row.original.product_sku}</code><div className="text-sm text-slate-700">{row.original.product_name}</div></div>) },
    { id: "qty", accessorKey: "qty", header: "จำนวน", size: 90, cell: ({ getValue }) => <span className="tabular-nums">{fmt(getValue() as number)}</span> },
    { id: "bom_version", accessorKey: "bom_version", header: "สูตร", size: 90 },
    { id: "due_date", accessorKey: "due_date", header: "กำหนดส่ง", size: 110 },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 110, cell: ({ getValue }) => { const s = STATUS[(getValue() as string) ?? "draft"] ?? STATUS.draft; return <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>; } },
  ], []);

  if (!canView) return <AccessDenied />;

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🏭 ใบสั่งผลิต (MO)</h1>
            <p className="text-sm text-slate-500 mt-0.5">สั่งผลิต + กางสูตรวัตถุดิบตามจำนวน — คลิกแถวเพื่อแก้</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/master/work-board" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📋 บอร์ดจ่ายงาน</a>
            {canCreate && <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ สร้างใบสั่งผลิต</button>}
          </div>
        </div>

        <DataTable
          tableId="manufacturing-orders" data={[]} columns={columns}
          serverFetch={serverFetch} serverRefreshKey={refreshKey}
          searchableKeys={["mo_no", "product_sku", "product_name"]}
          searchPlaceholder="ค้นหา เลขที่ MO / SKU / สินค้า..."
          exportFilename="manufacturing-orders" exportEntityType="mo"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          onRowClick={canEdit ? openEdit : undefined}
          rowActions={canEdit ? [
            { label: "แก้", icon: "✏", onClick: openEdit },
            { label: "ย้ายเข้าคลังเก็บ", icon: "🗑", variant: "danger", onClick: (r) => setArchiveTarget(r) },
          ] : []}
          pageSize={20}
        />
      </div>

      <ERPModal open={form !== null} onClose={() => !saving && setForm(null)} size="xl"
        title={form?.id ? `แก้ใบสั่งผลิต: ${form.mo_no}` : "สร้างใบสั่งผลิตใหม่"}
        footer={<>
          <button onClick={() => setForm(null)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
          <button onClick={save} disabled={saving || !canEdit} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </>}>
        {loadingForm ? <div className="py-12 text-center text-slate-400">กำลังโหลด...</div> : form && (
          <div className="space-y-2">
            {formErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-slate-500">เลขที่ MO</span>
                <div className="h-8 mt-0.5 px-2 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500">
                  {form.id ? <code>{form.mo_no}</code> : "ออกอัตโนมัติตอนบันทึก"}</div>
              </div>
              <label className="block">
                <span className="text-[11px] text-slate-500">กำหนดส่ง</span>
                <input type="date" value={form.due_date} onChange={(e) => patch({ due_date: e.target.value })}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>

            <div>
              <span className="text-[11px] text-slate-500">สินค้าที่ผลิต</span>
              <div className="mt-0.5"><ComponentPicker sku={form.product_sku} name={form.product_name} imageKey={form.product_image}
                placeholder="— เลือกสินค้าที่ผลิต —" onPick={(c) => onPickProduct(c.code, c.name, c.image_key)} /></div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">จำนวนผลิต</span>
                <input type="number" min={0} step="any" value={form.qty} onChange={(e) => patch({ qty: Number(e.target.value) })}
                  className="w-full h-8 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <div>
                <span className="text-[11px] text-slate-500">สูตร (BOM)</span>
                <select value={form.bom_id ?? ""} onChange={(e) => e.target.value && selectVersion(e.target.value)}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {versions.length === 0 && <option value="">— ไม่มีสูตร —</option>}
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.is_default ? " ★" : ""}</option>)}
                </select>
              </div>
              <label className="block">
                <span className="text-[11px] text-slate-500">สถานะ</span>
                <select value={form.status} onChange={(e) => patch({ status: e.target.value })}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] text-slate-500">หมายเหตุ</span>
              <input value={form.note} onChange={(e) => patch({ note: e.target.value })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>

            {/* รายละเอียดสั่งงาน (อ่านอย่างเดียว — ดึงจาก Parent ของสินค้า) */}
            {form.product_sku && <WorkInstructionPanel sku={form.product_sku} editable={canEdit} />}

            {/* preview/checklist กางสูตร — 2 แท็บ */}
            {(() => {
              const editable = !!form.id;  // เช็ค/ขอซื้อ ได้เฉพาะตอนเปิดใบที่บันทึกแล้ว
              const numCls = "w-full h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
              // แท็บสรุป: รวมต่อวัตถุดิบ · แท็บบล็อก: แยกรายบล็อก
              const sumRows: MatRow[] = sumSource().map((s) => {
                const required = Math.round(s.qty_per * (form.qty || 0) * 10000) / 10000;
                const base = Math.max(0, Math.round((required - (s.on_hand_qty || 0)) * 10000) / 10000);
                return { key: s.key, id: s.id, component_sku: s.component_sku, component_name: s.component_name, material_type: s.material_type, uom: s.uom,
                  qty_per: s.qty_per, cut_block_code: null, cut_width: null, cut_length: null, pieces: null,
                  on_hand_qty: s.on_hand_qty, is_ready: s.is_ready, purchase_override: s.purchase_override, cut_done: false,
                  required, to_purchase: s.purchase_override != null ? s.purchase_override : base };
              });
              const blockRows: MatRow[] = form.materials.map((m) => ({ ...m, required: Math.round(m.qty_per * (form.qty || 0) * 10000) / 10000, to_purchase: 0 }));
              const codeCol: LineColumn<MatRow> = {
                key: "component", header: "วัตถุดิบ", minWidth: 220, sortable: true,
                getValue: (r) => r.component_name || r.component_sku, groupLabel: (r) => r.component_sku ? `${r.component_sku} ${r.component_name}` : "— ไม่ระบุ —",
                render: (r) => <span className="block truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> <span className="text-slate-700">{r.component_name}</span></span>,
              };
              const typeCol: LineColumn<MatRow> = { key: "material_type", header: "ประเภท", width: 110, sortable: true, getValue: (r) => r.material_type, groupLabel: (r) => r.material_type || "— ไม่ระบุ —" };
              const reqCol: LineColumn<MatRow> = { key: "required", header: "รวมต้องใช้", width: 96, align: "right", sortable: true, summable: true, getValue: (r) => r.required, render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmt(r.required)}</span> };
              const uomCol: LineColumn<MatRow> = { key: "uom", header: "หน่วย", width: 60, getValue: (r) => r.uom };
              const onhandCol: LineColumn<MatRow> = { key: "on_hand_qty", header: "จำนวนที่มี", width: 92, align: "right", getValue: (r) => r.on_hand_qty,
                render: (r, u) => <input type="number" min={0} step="any" value={r.on_hand_qty} onChange={(e) => u({ on_hand_qty: Number(e.target.value) })} className={numCls} /> };
              const buyCol: LineColumn<MatRow> = { key: "to_purchase", header: "ต้องขอซื้อ", width: 112, align: "right", summable: true, getValue: (r) => r.to_purchase,
                render: (r, u) => editBuy.has(r.key)
                  ? <input type="number" min={0} step="any" value={r.to_purchase} autoFocus onChange={(e) => u({ purchase_override: Number(e.target.value) })} className={numCls} />
                  : (
                    <div className="flex items-center justify-end gap-1">
                      <span className={`tabular-nums ${r.to_purchase > 0 ? "text-rose-600 font-semibold" : "text-slate-300"}`}>{r.to_purchase > 0 ? fmt(r.to_purchase) : "—"}</span>
                      <button type="button" title="แก้จำนวนที่ขอซื้อ" onClick={() => setEditBuy((s) => { const n = new Set(s); n.add(r.key); return n; })}
                        className="shrink-0 h-6 w-5 flex items-center justify-center text-slate-300 hover:text-blue-600 rounded">✏</button>
                    </div>
                  ) };
              const readyCol: LineColumn<MatRow> = { key: "is_ready", header: "เตรียมครบ", width: 80, align: "center", getValue: (r) => (r.is_ready ? 1 : 0),
                render: (r, u) => <input type="checkbox" checked={r.is_ready}
                  onChange={(e) => e.target.checked ? u({ is_ready: true, on_hand_qty: r.required, purchase_override: null }) : u({ is_ready: false })}
                  className="rounded border-slate-300" /> };
              const reqMap = form.requested ?? {};
              const orderedCol: LineColumn<MatRow> = { key: "ordered", header: "สถานะสั่งซื้อ", width: 124, align: "center", sortable: true,
                getValue: (r) => (r.component_sku ? (reqMap[r.component_sku] ?? 0) : 0),
                render: (r) => {
                  const got = r.component_sku ? (reqMap[r.component_sku] ?? 0) : 0;
                  if (got <= 0) return <span className="text-slate-300 text-xs">— ยังไม่ขอ</span>;
                  const full = got >= r.to_purchase - 0.0001;
                  return <span className={`text-[11px] px-2 py-0.5 rounded whitespace-nowrap ${full ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>🛒 ขอแล้ว {fmt(got)}{full ? "" : " (บางส่วน)"}</span>;
                } };
              const sumCols: LineColumn<MatRow>[] = editable
                ? [codeCol, typeCol, reqCol, uomCol, onhandCol, buyCol, readyCol, orderedCol]
                : [codeCol, typeCol, { key: "qty_per", header: "ต่อชิ้น", width: 76, align: "right", getValue: (r) => r.qty_per }, reqCol, uomCol];
              // ยอดรวมชิ้น = ชิ้นต่อชุด × จำนวนที่สั่ง
              const totalPcsCol: LineColumn<MatRow> = { key: "total_pieces", header: "ยอดรวมชิ้น", width: 92, align: "right", summable: true,
                getValue: (r) => (r.pieces ?? 0) * (form.qty || 0),
                render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-slate-700">{r.pieces ? fmt((r.pieces ?? 0) * (form.qty || 0)) : "—"}</span> };
              const cutDoneCol: LineColumn<MatRow> = { key: "cut_done", header: "ตัดครบแล้ว", width: 84, align: "center",
                getValue: (r) => (r.cut_done ? 1 : 0),
                render: (r) => needsCutLine(r)
                  ? <input type="checkbox" checked={r.cut_done} disabled={!editable || !canEdit} onChange={() => toggleCutLine(r)} className="rounded border-slate-300 cursor-pointer disabled:cursor-not-allowed" />
                  : <span className="text-slate-300 text-xs">—</span> };
              const blockCols: LineColumn<MatRow>[] = [codeCol, typeCol,
                { key: "cut_block_code", header: "บล็อกตัด", width: 130, getValue: (r) => r.cut_block_code },
                { key: "cut_width", header: "กว้าง", width: 60, align: "right", getValue: (r) => r.cut_width ?? "" },
                { key: "cut_length", header: "ยาว", width: 60, align: "right", getValue: (r) => r.cut_length ?? "" },
                { key: "pieces", header: "ชิ้น", width: 54, align: "right", getValue: (r) => r.pieces ?? "" },
                totalPcsCol, reqCol, uomCol, cutDoneCol];
              const needCount = sumRows.filter((r) => { const got = r.component_sku ? (reqMap[r.component_sku] ?? 0) : 0; return r.to_purchase - got > 0.0001; }).length;
              return (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm">
                      <button type="button" onClick={() => setMatTab("sum")} className={`h-7 px-3 ${matTab === "sum" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>วัตถุดิบที่ต้องใช้</button>
                      <button type="button" onClick={() => setMatTab("block")} className={`h-7 px-3 border-l border-slate-200 ${matTab === "block" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>รายละเอียด (บล็อก)</button>
                    </div>
                    {editable && matTab === "sum" && needCount > 0 && canEdit && (
                      <button type="button" onClick={openPR} className="h-7 px-3 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700">🛒 สร้างใบขอซื้อ ({needCount})</button>
                    )}
                  </div>
                  {form.materials.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      {form.product_sku ? "สินค้านี้ยังไม่มีสูตร BOM" : "เลือกสินค้าก่อน ระบบจะกางสูตรให้"}
                    </div>
                  ) : (
                    <LineItemsGrid<MatRow>
                      key={matTab}
                      rows={matTab === "sum" ? sumRows : blockRows} columns={matTab === "sum" ? sumCols : blockCols}
                      onChange={(rows) => { if (matTab === "sum" && editable) patch({ summary: rows.map((r) => ({ key: r.key, id: r.id, component_sku: r.component_sku, component_name: r.component_name, material_type: r.material_type, uom: r.uom, qty_per: r.qty_per, on_hand_qty: r.on_hand_qty, is_ready: r.is_ready, purchase_override: r.purchase_override })) }); }}
                      rowId={(r) => r.key} readonly={!editable || matTab === "block"} stickyHeader maxHeight="38vh"
                      dense={matTab === "block"} defaultSort={matTab === "block" ? { key: "component", dir: "asc" } : null}
                      groupByOptions={[{ key: "material_type", label: "ประเภท" }, { key: "component", label: "วัตถุดิบ" }]}
                    />
                  )}
                  {!editable && <p className="text-[11px] text-slate-400 mt-1">บันทึกใบสั่งผลิตก่อน แล้วเปิดใหม่เพื่อเช็ค &ldquo;เตรียมครบ&rdquo; / ขอซื้อ</p>}
                </div>
              );
            })()}

            {/* ===== ใบจ่ายงาน (เฟส C) — แสดงเมื่อบันทึกใบแล้ว ===== */}
            {form.id && (
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">🧰 ใบจ่ายงาน</h3>
                  {canEdit && <button type="button" onClick={openDispatch} className="h-7 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">＋ จ่ายงาน</button>}
                </div>

                {/* สรุปค้างจ่ายต่อขั้นตอน */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {STAGES.map(([key, label]) => {
                    const done = dispatchedOf(key); const remain = remainingOf(key);
                    return (
                      <div key={key} className="border border-slate-200 rounded-lg px-3 py-2 text-xs">
                        <div className="font-medium text-slate-700">{label}</div>
                        <div className="text-slate-500 mt-0.5">จ่ายแล้ว <b className="text-slate-700">{fmt(done)}</b> / {fmt(form.qty || 0)} ชิ้น
                          {remain > 0 ? <span className="text-rose-600"> · ค้างจ่าย {fmt(remain)}</span> : <span className="text-emerald-600"> · ครบ ✓</span>}</div>
                      </div>
                    );
                  })}
                </div>

                {woLoading ? <div className="text-center py-4 text-xs text-slate-400">กำลังโหลด…</div>
                : woList.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">ยังไม่มีใบจ่ายงาน — กด “จ่ายงาน” เพื่อเริ่ม</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-auto" style={{ maxHeight: "30vh" }}>
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5">เลขที่ / ขั้นตอน</th>
                          <th className="text-left px-2 py-1.5">ผู้รับงาน</th>
                          <th className="text-right px-2 py-1.5">จ่าย</th>
                          <th className="text-right px-2 py-1.5">รับคืน</th>
                          <th className="text-center px-2 py-1.5">สถานะ</th>
                          <th className="text-left px-2 py-1.5">กำหนดเสร็จ</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {woList.map((w) => {
                          const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
                          const closed = w.status === "done" || w.status === "cancelled";
                          return (
                            <tr key={w.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                              <td className="px-2 py-1.5"><code className="text-[10px] text-slate-400">{w.wo_no}</code><div className="text-slate-600">{stageLabel(w.stage)}</div></td>
                              <td className="px-2 py-1.5 text-slate-700">{w.assignee_type === "department" ? "🏢 " : "👤 "}{w.assignee_name}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{fmt(w.qty)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{w.received_qty > 0 ? fmt(w.received_qty) : "—"}</td>
                              <td className="px-2 py-1.5 text-center"><span className={`px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span></td>
                              <td className="px-2 py-1.5 text-slate-500">{w.due_date || "—"}</td>
                              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                {canEdit && !closed && <button type="button" onClick={() => openReceive(w)} className="h-6 px-2 text-[11px] border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50">รับงานคืน</button>}
                                {canEdit && w.status !== "cancelled" && <button type="button" onClick={() => cancelWO(w)} title="ยกเลิกใบจ่ายงาน" className="ml-1 h-6 w-6 text-slate-300 hover:text-rose-500 rounded">✕</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={archiveTarget !== null} onClose={() => !archiving && setArchiveTarget(null)} onConfirm={doArchive}
        loading={archiving} variant="danger" title="ย้ายใบสั่งผลิตเข้าคลังเก็บ?"
        message={`ใบสั่งผลิต "${archiveTarget?.mo_no ?? ""}" จะถูกซ่อน (กู้คืนได้)`} confirmText="ย้ายเข้าคลังเก็บ" />

      {/* popup สร้างใบขอซื้อ (ลงระบบจัดซื้อ v2) */}
      <ERPModal open={prOpen} onClose={() => !prSaving && setPrOpen(false)} size="lg" title={`🛒 สร้างใบขอซื้อ — ${form?.mo_no ?? ""}`}
        footer={<>
          <button onClick={() => setPrOpen(false)} disabled={prSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submitPR} disabled={prSaving} className="h-9 px-4 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{prSaving ? "กำลังสร้าง..." : `สร้างใบขอซื้อ (${prItems.filter((i) => i.include && i.qty > 0).length})`}</button>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-slate-500">วันที่สั่ง</span>
              <input type="date" value={prDate} onChange={(e) => setPrDate(e.target.value)} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
            <label className="block"><span className="text-[11px] text-slate-500">ชื่อที่สั่ง</span>
              <input value={prRequester} onChange={(e) => setPrRequester(e.target.value)} placeholder="ชื่อผู้สั่งซื้อ" className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
          </div>
          <p className="text-[11px] text-slate-400">ใช้กับสินค้า: <b>{form?.product_sku}</b> {form?.product_name} · กำหนดส่ง {form?.due_date || "—"}</p>
          <div className="max-h-72 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 sticky top-0">
                <tr><th className="w-8 px-2 py-1.5"></th><th className="text-left px-2 py-1.5">วัตถุดิบ</th><th className="text-right px-2 py-1.5 w-24">จำนวนที่ขอ</th><th className="text-left px-2 py-1.5 w-16">หน่วย</th></tr>
              </thead>
              <tbody>
                {prItems.map((it, idx) => (
                  <tr key={it.key} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={it.include} onChange={(e) => setPrItems((p) => p.map((x, i) => i === idx ? { ...x, include: e.target.checked } : x))} className="rounded border-slate-300" /></td>
                    <td className="px-2 py-1"><code className="text-[10px] text-slate-400">{it.sku}</code> <span className="text-slate-700">{it.name}</span></td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" min={0} step="any" value={it.qty} onChange={(e) => setPrItems((p) => p.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) } : x))}
                        className="w-20 h-7 px-2 text-sm text-right border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" /></td>
                    <td className="px-2 py-1 text-slate-500">{it.uom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">รายการจะไปโผล่ที่หน้า &ldquo;ขอซื้อ (ช้อปปิ้ง)&rdquo; (กลุ่มยังไม่ตั้งร้าน) + แท็บ &ldquo;จากใบสั่งงาน&rdquo;</p>
        </div>
      </ERPModal>

      {/* popup จ่ายงาน (ใบจ่ายงาน) */}
      <ERPModal open={dispOpen} onClose={() => !dispSaving && setDispOpen(false)} size="md" title={`🧰 จ่ายงาน — ${form?.mo_no ?? ""}`}
        footer={<>
          <button onClick={() => setDispOpen(false)} disabled={dispSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submitDispatch} disabled={dispSaving} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{dispSaving ? "กำลังจ่าย..." : "จ่ายงาน"}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">สินค้า: <b>{form?.product_sku}</b> {form?.product_name} · ผลิต {fmt(form?.qty || 0)} ชิ้น</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-slate-500">ขั้นตอน</span>
              <select value={dispStage} onChange={(e) => { setDispStage(e.target.value); setDispQty(remainingOf(e.target.value)); }}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-[11px] text-slate-500">จำนวนที่จ่าย (ค้างจ่าย {fmt(remainingOf(dispStage))})</span>
              <input type="number" min={0} step="any" value={dispQty} onChange={(e) => setDispQty(Number(e.target.value))}
                className="w-full h-8 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">ผู้รับงาน</span>
            <div className="flex gap-2 mt-0.5">
              <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm shrink-0">
                <button type="button" onClick={() => { setDispType("craftsman"); setDispAssignee(""); }} className={`h-8 px-3 ${dispType === "craftsman" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>👤 ช่าง</button>
                <button type="button" onClick={() => { setDispType("department"); setDispAssignee(""); }} className={`h-8 px-3 border-l border-slate-200 ${dispType === "department" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>🏢 แผนก</button>
              </div>
              <select value={dispAssignee} onChange={(e) => setDispAssignee(e.target.value)}
                className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— เลือก{dispType === "craftsman" ? "ช่าง" : "แผนก"} —</option>
                {(dispType === "craftsman" ? assignees.craftsmen : assignees.departments).map((a) => (
                  <option key={a.id} value={a.id}>{a.code ? `[${a.code}] ` : ""}{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-slate-500">กำหนดเสร็จ</span>
              <input type="date" value={dispDue} onChange={(e) => setDispDue(e.target.value)} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="block"><span className="text-[11px] text-slate-500">หมายเหตุ</span>
              <input value={dispNote} onChange={(e) => setDispNote(e.target.value)} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
          </div>
        </div>
      </ERPModal>

      {/* popup รับงานคืน (รองรับรับคืนบางส่วน) */}
      <ERPModal open={recvWO !== null} onClose={() => !recvSaving && setRecvWO(null)} size="sm" title={`📥 รับงานคืน — ${recvWO?.wo_no ?? ""}`}
        footer={<>
          <button onClick={() => setRecvWO(null)} disabled={recvSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submitReceive} disabled={recvSaving} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </>}>
        {recvWO && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">{stageLabel(recvWO.stage)} · {recvWO.assignee_name}</p>
            <p className="text-[11px] text-slate-400">จ่ายไป {fmt(recvWO.qty)} · รับคืนแล้ว {fmt(recvWO.received_qty)} · ค้างรับ {fmt(recvWO.qty - recvWO.received_qty)} ชิ้น</p>
            <label className="block"><span className="text-[11px] text-slate-500">รับคืนรอบนี้ (ชิ้น)</span>
              <input type="number" min={0} step="any" max={recvWO.qty - recvWO.received_qty} value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))}
                className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
            <p className="text-[11px] text-slate-400">รับครบ = สถานะเป็น “รับครบ” อัตโนมัติ · รับไม่ครบ = “รับคืนบางส่วน”</p>
          </div>
        )}
      </ERPModal>
    </>
  );
}
