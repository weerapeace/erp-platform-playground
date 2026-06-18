"use client";

/**
 * BOM Workspace — สูตรการผลิต (หัวสูตร + รายการวัตถุดิบในจอเดียว)
 *
 * ของกลางตาม CLAUDE.md:
 *   DataTable / ERPModal / ConfirmDialog / SkuPicker(/api/admin/picker) / useToast / useAuth
 *   ไม่ query Supabase ตรง — ผ่าน /api/bom (อ่าน auth, เขียน admin, audit)
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import type { SizeTemplate } from "@/app/api/admin/size-templates/route";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ServerFetchParams } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { BomLineEditor, ComponentPicker, emptyLine, type EditorLine } from "./line-editor";
import { PieceworkLines, type PieceLine } from "./piecework-lines";
import { LaborRates, type LaborLine } from "./labor-rates";
import type { BomComponent } from "@/app/api/bom/components/route";
import { CopyBomModal } from "./copy-bom-modal";
import { WorkInstructionPanel } from "@/components/work-instruction";

// ---- types (ตรงกับ /api/bom) ----
type BomListItem = {
  id: string; bom_code: string; product_sku: string | null; product_name: string | null;
  version: string | null; bom_type: string | null; status: string | null;
  source: string | null; is_active: boolean; line_count: number; product_image?: string | null;
};
type BomLineRow = {
  id: string; slot_code: string | null; component_sku: string | null; component_name: string | null;
  qty: number; uom: string | null; waste_percent: number | null; is_optional: boolean;
  sequence: number | null; source: string | null; odoo_bom_line_id: number | null;
  calc_mode: string | null; cut_block_id: number | null; cut_block_code: string | null;
  pieces: number | null; cut_width: number | null; cut_length: number | null;
  face_width_cm: number | null; material_type: string | null;
  sku_id: string | null; image_key: string | null; uom_id: string | null;
  size_variant?: boolean; size_dim?: string | null; size_values?: Record<string, number> | null;
};
type BomSizeRow = { label: string; sort?: number };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "ร่าง",       cls: "bg-slate-100 text-slate-600" },
  active:   { label: "ใช้งาน",     cls: "bg-emerald-50 text-emerald-700" },
  obsolete: { label: "เลิกใช้",    cls: "bg-amber-50 text-amber-700" },
};
const STATUS_OPTIONS = [["draft", "ร่าง"], ["active", "ใช้งาน"], ["obsolete", "เลิกใช้"]] as const;

// ---- editing form state ----
type FormState = {
  id: string | null;          // null = สร้างใหม่
  bom_code: string;
  product_sku: string;
  product_name: string;
  product_image: string | null;
  version: string;
  bom_type: string;
  status: string;
  note: string;
  lines: EditorLine[];
  sizes: BomSizeRow[];
  piecework: PieceLine[];
  labor: LaborLine[];
};

function emptyForm(): FormState {
  return { id: null, bom_code: "", product_sku: "", product_name: "", product_image: null, version: "v1", bom_type: "normal", status: "active", note: "", lines: [], sizes: [], piecework: [], labor: [] };
}

// ---- versioning helpers ----
const verNum  = (v: string | null) => { const m = (v ?? "").match(/(\d+)/); return m ? parseInt(m[1], 10) : 1; };
const verCode = (sku: string, n: number) => (n <= 1 ? `BOM-${sku}` : `BOM-${sku}_v.${n}`);
type BomVersionRow = { id: string; bom_code: string; version: string | null; status: string | null; is_default: boolean };

export default function BomWorkspacePage() {
  const canView   = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit   = usePermission("products.edit");
  const { can } = useAuth();
  const toast = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const [form, setForm]       = useState<FormState | null>(null);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<BomListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [versions, setVersions]   = useState<BomVersionRow[]>([]);
  const [newVerOpen, setNewVerOpen] = useState(false);
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [sizeTemplates, setSizeTemplates] = useState<SizeTemplate[]>([]);
  useEffect(() => { apiFetch("/api/admin/size-templates").then((r) => r.json()).then((j) => setSizeTemplates((j.data ?? []) as SizeTemplate[])).catch(() => {}); }, []);

  // server mode — โหลดทีละหน้า + ค้นที่ server (กันค้างตอนพิมพ์ search)
  const serverFetch = useCallback(async (p: ServerFetchParams) => {
    const params = new URLSearchParams({ limit: String(p.pageSize), offset: String((p.page - 1) * p.pageSize) });
    if (p.search)  params.set("search", p.search);
    if (p.sortBy)  { params.set("sort_by", p.sortBy); params.set("sort_dir", p.sortDir ?? "asc"); }
    const res = await apiFetch(`/api/bom?${params}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: json.data as BomListItem[], total: json.total as number };
  }, []);

  // map lines จาก API → EditorLine
  const mapLines = (lines: BomLineRow[]): EditorLine[] => (lines ?? []).map((l) => ({
    key: l.id, component_id: l.sku_id ?? null, slot_code: l.slot_code, image_key: l.image_key ?? null,
    component_sku: l.component_sku ?? "", component_name: l.component_name ?? "",
    material_group_id: null, material_type: l.material_type ?? "",
    qty: Number(l.qty) || 0, uom: l.uom ?? "", uom_id: l.uom_id ?? null, waste_percent: Number(l.waste_percent) || 0, is_optional: !!l.is_optional,
    cut_block_id: l.cut_block_id ?? null, cut_block_code: l.cut_block_code ?? "",
    pieces: Number(l.pieces) || 1, cut_width: Number(l.cut_width) || 0, cut_length: Number(l.cut_length) || 0,
    face_width_cm: Number(l.face_width_cm) || 0,
    source: l.source, odoo_bom_line_id: l.odoo_bom_line_id,
    size_variant: !!l.size_variant, size_dim: l.size_dim ?? "cut_length", size_values: (l.size_values ?? {}) as Record<string, number>,
  }));

  const loadFormById = async (id: string): Promise<FormState> => {
    const res = await apiFetch(`/api/bom/${id}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const d = json.data as BomListItem & { lines: BomLineRow[]; note?: string; sizes?: BomSizeRow[] };
    // งานเหมารายชิ้นของสูตรนี้ (ตารางที่ 2)
    let piecework: PieceLine[] = [];
    if (d.bom_code) {
      try {
        const pr = await apiFetch(`/api/bom/piecework?bom_code=${encodeURIComponent(d.bom_code)}`);
        const pj = await pr.json();
        piecework = ((pj.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id), job_id: (r.job_id as string) ?? null, job_name: String(r.job_name ?? ""),
          rate: Number(r.rate) || 0, note: (r.note as string) ?? "", is_detail: !!r.is_detail, qty_per: Number(r.qty_per) || 1,
        }));
      } catch { /* ignore */ }
    }
    // ค่าแรงผลิต (ราคาปัจจุบันต่อช่าง)
    let labor: LaborLine[] = [];
    if (d.bom_code) {
      try {
        const lr = await apiFetch(`/api/bom/labor-rates?bom_code=${encodeURIComponent(d.bom_code)}`);
        const lj = await lr.json();
        labor = ((lj.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id), craftsman_id: (r.craftsman_id as string) ?? null, craftsman_name: (r.craftsman_name as string) ?? "",
          rate: Number(r.rate) || 0, note: (r.note as string) ?? "",
        }));
      } catch { /* ignore */ }
    }
    return {
      id: d.id, bom_code: d.bom_code ?? "", product_sku: d.product_sku ?? "", product_name: d.product_name ?? "", product_image: null,
      version: d.version ?? "v1", bom_type: d.bom_type ?? "normal", status: d.status ?? "draft", note: d.note ?? "",
      lines: mapLines(d.lines), sizes: d.sizes ?? [], piecework, labor,
    };
  };

  const fetchVersions = useCallback(async (sku: string): Promise<BomVersionRow[]> => {
    if (!sku) { setVersions([]); return []; }
    try {
      const res = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(sku)}`);
      const j = await res.json();
      const v = (j.data ?? []) as BomVersionRow[];
      setVersions(v); return v;
    } catch { setVersions([]); return []; }
  }, []);

  // ---- open create ----
  const openCreate = () => { setForm(emptyForm()); setVersions([]); setDirty(false); setFormErr(null); };

  // ---- open edit (โหลด header + lines) ----
  const openEdit = async (row: BomListItem) => {
    setLoadingForm(true); setFormErr(null);
    setForm(emptyForm()); setVersions([]);
    try {
      const f = await loadFormById(row.id);
      setForm(f); setDirty(false);
      fetchVersions(f.product_sku);
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดสูตรไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  // เปิดสูตรของ SKU อัตโนมัติ (ใช้ตอนเปิดหน้านี้ใน popup จากแผงรายละเอียดสั่งงาน: ?open=<sku>)
  const openBySku = async (sku: string) => {
    setLoadingForm(true); setFormErr(null); setForm(emptyForm()); setVersions([]);
    try {
      const vers = await fetchVersions(sku);
      const target = vers.find((v) => v.is_default) ?? vers[0];
      if (!target) { setFormErr(`ไม่พบสูตร (BOM) ของ ${sku}`); return; }
      const f = await loadFormById(target.id);
      setForm(f); setDirty(false);
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดสูตรไม่ได้"); }
    finally { setLoadingForm(false); }
  };
  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get("open");
    if (sku) void openBySku(sku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // สลับไปดู/แก้เวอร์ชั่นอื่นของสินค้าเดียวกัน
  const switchVersion = async (id: string) => {
    if (id === form?.id) return;
    if (dirty && !confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการสลับเวอร์ชั่นโดยไม่บันทึกหรือไม่?")) return;
    setLoadingForm(true); setFormErr(null);
    try { const f = await loadFormById(id); setForm(f); setDirty(false); }
    catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดเวอร์ชั่นไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  // เลือกสินค้า → auto-fill รหัส/เวอร์ชั่น (เฉพาะตอนสร้างใหม่)
  const onPickProduct = async (sku: string, name: string, image?: string | null) => {
    patchForm({ product_sku: sku, product_name: name, product_image: image ?? null });
    const vers = await fetchVersions(sku);
    if (form && form.id == null) {
      const n = vers.length ? Math.max(...vers.map((v) => verNum(v.version))) + 1 : 1;
      patchForm({ version: `v${n}`, bom_code: verCode(sku, n) });
    }
  };

  // สร้างเวอร์ชั่นใหม่ (คัดลอกจากเวอร์ชั่นเดิม หรือ เริ่มว่าง)
  const makeNewVersion = async (copyId: string | null) => {
    if (!form) return;
    const sku = form.product_sku;
    if (!sku) { setFormErr("ต้องเลือกสินค้าก่อนจึงสร้างเวอร์ชั่นได้"); setNewVerOpen(false); return; }
    const n = versions.length ? Math.max(...versions.map((v) => verNum(v.version))) + 1 : verNum(form.version) + 1;
    let lines: EditorLine[] = []; let sizes: BomSizeRow[] = []; let piecework: PieceLine[] = []; let labor: LaborLine[] = [];
    if (copyId) { try { const f = await loadFormById(copyId); lines = f.lines; sizes = f.sizes; piecework = f.piecework.map((p) => ({ ...p, id: undefined })); labor = f.labor.map((x) => ({ ...x, id: undefined })); } catch { /* ignore */ } }
    setForm({
      id: null, product_sku: sku, product_name: form.product_name, product_image: form.product_image, version: `v${n}`, bom_code: verCode(sku, n),
      bom_type: form.bom_type, status: "active", note: "", lines, sizes, piecework, labor,
    });
    setDirty(true); setNewVerOpen(false); setCopyFromId("");
  };

  // ลบเวอร์ชั่นปัจจุบัน (เก็บเข้าคลัง)
  const deleteVersion = async () => {
    if (!form?.id) return;
    if (!confirm(`ลบเวอร์ชั่น "${form.version}" (${form.bom_code})? — ย้ายเข้าคลังเก็บ กู้คืนได้ภายหลัง`)) return;
    try {
      const res = await apiFetch(`/api/bom/${form.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบเวอร์ชั่นแล้ว");
      const remain = await fetchVersions(form.product_sku);
      const other = remain.find((v) => v.id !== form.id);
      if (other) { await switchVersion(other.id); } else { setForm(null); }
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  // ตั้งเวอร์ชั่นนี้เป็น default (MO ดึงไปใช้)
  const setDefault = async () => {
    if (!form?.id) return;
    try {
      const res = await apiFetch(`/api/bom/${form.id}/set-default`, { method: "POST" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ตั้งเป็นเวอร์ชั่นหลัก (default) แล้ว");
      await fetchVersions(form.product_sku);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้ง default ไม่สำเร็จ"); }
  };
  const curIsDefault = !!versions.find((v) => v.id === form?.id)?.is_default;

  const patchForm = (p: Partial<FormState>) => { setForm((f) => (f ? { ...f, ...p } : f)); setDirty(true); };

  const closeForm = () => {
    if (dirty && !confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?")) return;
    setForm(null); setDirty(false); setFormErr(null);
  };

  // ---- save ----
  const save = async () => {
    if (!form) return;
    if (!form.bom_code.trim()) { setFormErr("กรุณาระบุรหัสสูตร"); return; }
    setSaving(true); setFormErr(null);
    const payload = {
      bom_code: form.bom_code.trim(), product_sku: form.product_sku || null, product_name: form.product_name || null,
      version: form.version, bom_type: form.bom_type, status: form.status, note: form.note || null,
      lines: form.lines.map((l, i) => ({
        slot_code: l.slot_code, component_sku: l.component_sku || null, component_name: l.component_name || null,
        qty: l.qty, uom: l.uom || null, waste_percent: l.waste_percent, is_optional: l.is_optional,
        sequence: i + 1, source: l.source ?? "manual", odoo_bom_line_id: l.odoo_bom_line_id ?? null,
        calc_mode: l.cut_block_id ? "block" : "manual", cut_block_id: l.cut_block_id, cut_block_code: l.cut_block_code || null,
        pieces: l.pieces, cut_width: l.cut_width, cut_length: l.cut_length,
        face_width_cm: l.face_width_cm, material_type: l.material_type || null,
        size_variant: l.size_variant, size_dim: l.size_dim, size_values: l.size_values,
      })),
      sizes: form.sizes,
    };
    try {
      const res = form.id
        ? await apiFetch(`/api/bom/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/bom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // บันทึกงานเหมารายชิ้น (ตารางที่ 2) แทนที่ทั้งชุดของสูตรนี้
      try {
        await apiFetch("/api/bom/piecework", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bom_code: form.bom_code.trim(), lines: form.piecework }) });
        await apiFetch("/api/bom/labor-rates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bom_code: form.bom_code.trim(), rates: form.labor }) });
      } catch { /* ไม่ให้พังทั้งการบันทึก BOM */ }
      toast.success(form.id ? "บันทึกสูตรแล้ว" : "สร้างสูตรใหม่แล้ว");
      setDirty(false);
      refresh();
      // ไม่ปิดหน้าต่าง — โหลดข้อมูลล่าสุดมาแสดงต่อ (รองรับสร้างใหม่ → เข้าสู่โหมดแก้)
      const savedId = form.id ?? (json.id as string | undefined);
      if (savedId) { try { const f = await loadFormById(savedId); setForm(f); } catch { /* คงฟอร์มเดิมไว้ */ } }
    } catch (e) { setFormErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- archive ----
  const doArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const res = await apiFetch(`/api/bom/${archiveTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success("ย้ายสูตรเข้าคลังเก็บแล้ว");
      setArchiveTarget(null);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setArchiving(false); }
  };

  const columns: ColumnDef<BomListItem>[] = useMemo(() => [
    { id: "bom_code", accessorKey: "bom_code", header: "รหัสสูตร", size: 150,
      cell: ({ getValue }) => <code className="font-mono text-xs text-slate-700">{getValue() as string}</code> },
    { id: "product_sku", accessorKey: "product_sku", header: "สินค้า", size: 300,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="relative group/bimg shrink-0">
            {row.original.product_image
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={row.original.product_image} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-100 bg-slate-50 cursor-zoom-in" />
              : <span className="w-9 h-9 rounded-md border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300 text-sm">📦</span>}
            {row.original.product_image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={row.original.product_image} alt="" className="hidden group-hover/bimg:block absolute z-50 left-0 top-10 w-48 h-48 object-contain rounded-lg border border-slate-200 bg-white shadow-xl p-1.5" />}
          </span>
          <div className="min-w-0">
            <code className="text-[10px] text-slate-400 font-mono">{row.original.product_sku}</code>
            <div className="text-sm text-slate-700 truncate">{row.original.product_name}</div>
          </div>
        </div>
      ) },
    { id: "version", accessorKey: "version", header: "เวอร์ชัน", size: 80 },
    { id: "line_count", accessorKey: "line_count", header: "วัตถุดิบ", size: 90,
      cell: ({ getValue }) => <span className="tabular-nums text-sm">{getValue() as number} รายการ</span> },
    { id: "status", accessorKey: "status", header: "สถานะ", size: 110,
      cell: ({ getValue }) => {
        const s = STATUS[(getValue() as string) ?? "draft"] ?? STATUS.draft;
        return <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>;
      } },
    { id: "source", accessorKey: "source", header: "ที่มา", size: 90,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v === "odoo"
          ? <span className="text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-700">Odoo</span>
          : <span className="text-xs px-2 py-0.5 rounded bg-slate-50 text-slate-500">มือ</span>;
      } },
  ], []);

  if (!canView) return <AccessDenied />;

  const isCreate = form?.id == null;

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📐 BOM — สูตรการผลิต</h1>
            <p className="text-sm text-slate-500 mt-0.5">หัวสูตร + รายการวัตถุดิบในชุดเดียว — คลิกแถวเพื่อแก้</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ สร้างสูตรใหม่</button>
          )}
        </div>

        <DataTable
          tableId="bom-headers"
          data={[]}
          columns={columns}
          serverFetch={serverFetch}
          serverRefreshKey={refreshKey}
          searchableKeys={["bom_code", "product_sku", "product_name"]}
          searchPlaceholder="ค้นหา รหัสสูตร / SKU / ชื่อสินค้า..."
          exportFilename="bom-list"
          exportEntityType="bom"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          onRowClick={canEdit ? openEdit : undefined}
          rowActions={canEdit ? [
            { label: "แก้สูตร", icon: "✏", onClick: openEdit },
            { label: "ย้ายเข้าคลังเก็บ", icon: "🗑", variant: "danger", onClick: (r) => setArchiveTarget(r) },
          ] : []}
          pageSize={20}
        />
      </div>

      {/* ---- BOM editor modal (header + lines) ---- */}
      <ERPModal
        open={form !== null}
        onClose={() => !saving && closeForm()}
        size="xl"
        hasUnsavedChanges={dirty}
        title={isCreate ? "สร้างสูตรการผลิตใหม่" : `แก้สูตร: ${form?.bom_code ?? ""}`}
        footer={
          <>
            <button onClick={closeForm} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving || !canEdit}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </>
        }
      >
        {loadingForm ? (
          <div className="py-12 text-center text-slate-400">กำลังโหลดสูตร...</div>
        ) : form && (
          <div className="space-y-2">
            {formErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

            {/* header fields (compact) */}
            <div>
              <span className="text-[11px] text-slate-500">สินค้าที่ผลิต</span>
              <div className="mt-0.5">
                <ComponentPicker sku={form.product_sku} name={form.product_name} imageKey={form.product_image} placeholder="— เลือกสินค้าที่ผลิต —"
                  onPick={(c) => onPickProduct(c.code, c.name, c.image_key)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">รหัสสูตร — ตั้งอัตโนมัติ</span>
                <input value={form.bom_code} onChange={(e) => patchForm({ bom_code: e.target.value })}
                  placeholder="เลือกสินค้าก่อน ระบบตั้งให้"
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <div className="block">
                <span className="text-[11px] text-slate-500">เวอร์ชั่น {curIsDefault && <span className="text-amber-500">★ หลัก</span>}</span>
                <div className="flex gap-1 mt-0.5">
                  <select
                    value={form.id ?? "__cur__"}
                    onChange={(e) => { const v = e.target.value; if (v === "__add__") setNewVerOpen(true); else if (v !== "__cur__" && v !== form.id) switchVersion(v); }}
                    className="h-8 flex-1 min-w-0 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {form.id && !versions.some((v) => v.id === form.id) && <option value={form.id}>{form.version} (กำลังแก้)</option>}
                    {versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.is_default ? " ★" : ""}{v.id === form.id ? " (กำลังแก้)" : ""}</option>)}
                    {!form.id && <option value="__cur__">{form.version} (ใหม่)</option>}
                    {form.product_sku && <option value="__add__">＋ เวอร์ชั่นใหม่...</option>}
                  </select>
                  {form.id && canEdit && (
                    <button type="button" onClick={setDefault} title="ตั้งเป็นเวอร์ชั่นหลัก (default) — MO จะดึงไปใช้"
                      className={`h-8 w-8 shrink-0 flex items-center justify-center border border-slate-200 rounded-lg ${curIsDefault ? "text-amber-500" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"}`}>{curIsDefault ? "★" : "☆"}</button>
                  )}
                  {form.id && canEdit && (
                    <button type="button" onClick={deleteVersion} title="ลบเวอร์ชั่นนี้ (เก็บเข้าคลัง)"
                      className="h-8 w-8 shrink-0 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded-lg">🗑</button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">สถานะ</span>
                <select value={form.status} onChange={(e) => patchForm({ status: e.target.value })}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500">หมายเหตุ</span>
                <input value={form.note} onChange={(e) => patchForm({ note: e.target.value })}
                  className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>

            {/* รายละเอียดสั่งงาน (อ่านอย่างเดียว — ดึงจาก Parent ของสินค้า) */}
            {form.product_sku && <WorkInstructionPanel sku={form.product_sku} editable={canEdit} refreshKey={refreshKey} bomSkus={form.lines.map((l) => l.component_sku).filter(Boolean) as string[]}
              onAddMaterials={canEdit ? (mats) => {
                const newLines = mats.map((m) => ({ ...emptyLine(), component_sku: m.code, component_name: m.name, qty: 1 }));
                patchForm({ lines: [...form.lines, ...newLines] });
                toast.success(`เพิ่มวัตถุดิบจากสเปก ${newLines.length} รายการลง BOM แล้ว — กรอกจำนวน/บล็อกตัดต่อ`);
              } : undefined} />}

            {/* ไซส์ (เฟส 4) */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-700">📐 ไซส์</span>
                {form.sizes.length === 0 && <span className="text-[11px] text-slate-400">ไม่มีไซส์ (สูตรนี้ใช้ขนาดเดียว)</span>}
                {form.sizes.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {s.label}
                    {canEdit && <button type="button" onClick={() => patchForm({ sizes: form.sizes.filter((_, j) => j !== i) })} className="text-indigo-400 hover:text-rose-500">✕</button>}
                  </span>
                ))}
                {canEdit && (
                  <input placeholder="+ พิมพ์ไซส์เอง (เช่น 40&quot; / M) แล้ว Enter" className="h-7 px-2 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v && !form.sizes.some((s) => s.label === v)) { patchForm({ sizes: [...form.sizes, { label: v, sort: form.sizes.length }] }); (e.target as HTMLInputElement).value = ""; } } }} />
                )}
                {canEdit && (
                  <select value="" title="เลือกชุดไซส์มาตรฐาน — ระบบจะเพิ่มให้ทั้งชุด"
                    onChange={(e) => {
                      const t = sizeTemplates.find((x) => x.id === e.target.value); if (!t) return;
                      const add = t.labels.filter((l) => !form.sizes.some((s) => s.label === l)).map((l, i) => ({ label: l, sort: form.sizes.length + i }));
                      if (add.length) patchForm({ sizes: [...form.sizes, ...add] });
                    }}
                    className="h-7 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600 bg-white">
                    <option value="">＋ ใช้ชุดไซส์มาตรฐาน…</option>
                    {sizeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {canEdit && <a href="/admin/size-templates" target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline whitespace-nowrap">⚙️ จัดการชุดไซส์</a>}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {form.sizes.length > 0
                  ? "ขั้นต่อไป: ที่บรรทัดวัตถุดิบ ติ๊กช่อง “ผันไซส์” เฉพาะตัวที่ค่าต่างกันตามไซส์ (เช่น ความยาว) แล้วกรอกค่าต่อไซส์ในตารางด้านล่าง"
                  : "ไซส์ = ใช้เมื่อสินค้านี้มีหลายขนาด · เพิ่มไซส์ที่นี่ก่อน แล้วค่อยตั้งค่าต่อไซส์ที่บรรทัดวัตถุดิบ (ถ้าใช้ขนาดเดียว ข้ามได้)"}
              </p>
            </div>

            {/* lines */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">รายการวัตถุดิบ</h3>
                {canEdit && (
                  <button type="button" onClick={() => setCopyOpen(true)}
                    className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">📋 คัดลอก BOM</button>
                )}
              </div>
              <BomLineEditor lines={form.lines} onChange={(lines) => patchForm({ lines })} readonly={!canEdit} sizes={form.sizes.map((s) => s.label)} />
            </div>

            {/* ตารางที่ 2: งานเหมารายชิ้น */}
            <div className="pt-3 border-t border-slate-100">
              <PieceworkLines value={form.piecework} onChange={(piecework) => patchForm({ piecework })} readonly={!canEdit} />
            </div>

            {/* ค่าแรงผลิต */}
            <div className="pt-3 border-t border-slate-100">
              <LaborRates value={form.labor} onChange={(labor) => patchForm({ labor })} readonly={!canEdit} bomCode={form.bom_code} />
            </div>

            <CopyBomModal open={copyOpen} onClose={() => setCopyOpen(false)}
              onCopy={(copied) => patchForm({ lines: [...form.lines, ...copied] })} />
          </div>
        )}
      </ERPModal>

      {/* ---- archive confirm ---- */}
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => !archiving && setArchiveTarget(null)}
        onConfirm={doArchive}
        loading={archiving}
        variant="danger"
        title="ย้ายสูตรเข้าคลังเก็บ?"
        message={`สูตร "${archiveTarget?.bom_code ?? ""}" และรายการวัตถุดิบทั้งหมดจะถูกซ่อน (กู้คืนได้ภายหลัง)`}
        confirmText="ย้ายเข้าคลังเก็บ"
      />

      {/* ---- new version popup ---- */}
      <ERPModal open={newVerOpen} onClose={() => { setNewVerOpen(false); setCopyFromId(""); }} size="sm"
        title="สร้างเวอร์ชั่นใหม่"
        footer={
          <>
            <button onClick={() => { setNewVerOpen(false); setCopyFromId(""); }}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
            <button onClick={() => makeNewVersion(copyFromId || null)}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">สร้าง</button>
          </>
        }>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">เวอร์ชั่นใหม่ของสินค้า <code className="text-xs">{form?.product_sku}</code></p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">เริ่มจาก</span>
            <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">เริ่มใหม่ (ว่าง)</option>
              {versions.map((v) => <option key={v.id} value={v.id}>คัดลอกจาก {v.version}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-slate-400">ระบบจะตั้งรหัส/เวอร์ชั่นถัดไปให้อัตโนมัติ แล้วกด &ldquo;บันทึก&rdquo; เพื่อสร้างจริง</p>
        </div>
      </ERPModal>
    </>
  );
}
