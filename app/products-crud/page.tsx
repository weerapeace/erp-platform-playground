"use client";

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, StatusBadge } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { ImportDialog, type ImportField } from "@/components/import-export";
import { FormRenderer, loadFormLayout, validateForm, type FormLayoutConfig } from "@/components/form-builder";
import { ImageManager } from "@/components/image-manager";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/components/activity-feed";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { RowAction, BulkEditField } from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { SandboxProduct, SandboxProductsResponse } from "@/app/api/playground-products/route";
import type { AuditLogsResponse } from "@/app/api/audit-logs/route";

// ============================================================
// Types
// ============================================================

type ProductForm = {
  sku:           string;
  name:          string;
  category_name: string;
  brand_name:    string;
  seller_name:   string;
  uom_name:      string;
  color:         string;
  list_price:    string;
  cost_price:    string;
  stock_on_hand: string;
  active:        boolean;
  note:          string;
};

const EMPTY_FORM: ProductForm = {
  sku: "", name: "", category_name: "", brand_name: "", seller_name: "",
  uom_name: "ชิ้น", color: "", list_price: "0", cost_price: "0",
  stock_on_hand: "0", active: true, note: "",
};

const UOM_OPTIONS = [
  { value: "ชิ้น",  label: "ชิ้น" },
  { value: "กล่อง", label: "กล่อง" },
  { value: "แพ็ค",  label: "แพ็ค" },
  { value: "รีม",   label: "รีม" },
  { value: "ขวด",   label: "ขวด" },
  { value: "ลัง",   label: "ลัง" },
  { value: "ม้วน",  label: "ม้วน" },
  { value: "เส้น",  label: "เส้น" },
];

// ============================================================
// Toast (inline — simple)
// ============================================================

type Toast = { id: number; type: "success" | "error"; message: string };

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2 ${
            t.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}>
          <span>{t.type === "success" ? "✓" : "⚠️"}</span>
          {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Columns
// ============================================================

const COLUMNS: ColumnDef<SandboxProduct>[] = [
  {
    accessorKey: "primary_image_url", header: "รูป", size: 64,
    enableSorting: false,
    meta: { group: "ข้อมูลหลัก", type: "image" },
  },
  {
    accessorKey: "sku", header: "SKU", size: 120,
    meta: { group: "ข้อมูลหลัก" },
    cell: ({ getValue }) => (
      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{(getValue() as string) || "—"}</span>
    ),
  },
  {
    accessorKey: "name", header: "ชื่อสินค้า",
    meta: { group: "ข้อมูลหลัก" },
    cell: ({ getValue }) => <span className="text-sm font-medium text-slate-800 line-clamp-1">{getValue() as string}</span>,
  },
  { accessorKey: "category_name", header: "หมวดหมู่", size: 150, meta: { group: "ข้อมูลหลัก", filterable: true } },
  { accessorKey: "seller_name", header: "ผู้จำหน่าย", size: 150, meta: { group: "ข้อมูลหลัก", filterable: true } },
  { accessorKey: "uom_name", header: "หน่วย", size: 80, meta: { group: "ข้อมูลหลัก" } },
  {
    accessorKey: "cost_price", header: "ราคาต้นทุน", size: 100,
    // เห็นเฉพาะ Admin (มีสิทธิ์ products.cost.view) — พนักงาน/ผู้ชมไม่เห็น
    meta: { group: "ราคา", filterable: true, filterType: "number", permission: "products.cost.view", summary: "sum" },
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return v > 0 ? <span className="text-sm tabular-nums text-slate-600">฿{v.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    accessorKey: "list_price", header: "ราคาขาย", size: 100,
    meta: { group: "ราคา", filterable: true, filterType: "number", summary: "sum" },
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return v > 0 ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{v.toLocaleString("th-TH")}</span> : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    accessorKey: "stock_on_hand", header: "STOCK", size: 90,
    meta: { group: "ราคา", filterable: true, filterType: "number", summary: "sum" },
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return <span className={`text-sm tabular-nums font-medium ${v === 0 ? "text-red-500" : v < 10 ? "text-amber-600" : "text-slate-700"}`}>{v.toLocaleString("th-TH")}</span>;
    },
  },
  {
    accessorKey: "active", header: "สถานะ", size: 100,
    meta: {
      group: "สถานะ", filterable: true,
      filterOptions: [{ value: "true", label: "ใช้งาน" }, { value: "false", label: "ปิด" }],
    },
    cell: ({ getValue }) => <StatusBadge status={getValue() ? "active" : "inactive"} />,
  },
];

// ---- Bulk-edit field list (ครบทุก field ที่ API รองรับ — แก้ที่เดียว) ----

const BULK_EDIT_FIELDS: BulkEditField[] = [
  { key: "name",          label: "ชื่อสินค้า",   type: "text" },
  { key: "sku",           label: "SKU",          type: "text" },
  { key: "category_name", label: "หมวดหมู่",     type: "text" },
  { key: "brand_name",    label: "แบรนด์",       type: "text" },
  { key: "seller_name",   label: "ผู้จำหน่าย",   type: "text" },
  { key: "uom_name",      label: "หน่วย",        type: "text" },
  { key: "product_type",  label: "ประเภทสินค้า", type: "select",
    options: [
      { value: "consu",   label: "สินค้าทั่วไป (consu)" },
      { value: "service", label: "บริการ (service)" },
      { value: "product", label: "สินค้านับสต็อก (product)" },
    ] },
  { key: "color",         label: "สี",           type: "text" },
  { key: "list_price",    label: "ราคาขาย",      type: "number" },
  { key: "cost_price",    label: "ราคาต้นทุน",   type: "number" },
  { key: "stock_on_hand", label: "STOCK",        type: "number" },
  { key: "active",        label: "สถานะใช้งาน",  type: "boolean" },
  { key: "note",          label: "หมายเหตุ",     type: "text" },
];

// ---- Import field config ----

const IMPORT_FIELDS: ImportField[] = [
  { key: "name",          label: "ชื่อสินค้า", required: true },
  { key: "sku",           label: "SKU" },
  { key: "category_name", label: "หมวดหมู่" },
  { key: "seller_name",   label: "ผู้จำหน่าย" },
  { key: "uom_name",      label: "หน่วย" },
  { key: "list_price",    label: "ราคาขาย",  transform: (v) => Number(v) || 0 },
  { key: "cost_price",    label: "ราคาต้นทุน", transform: (v) => Number(v) || 0 },
  { key: "stock_on_hand", label: "STOCK",     transform: (v) => Number(v) || 0 },
];

// ============================================================
// Product Form (reuse create + edit)
// ============================================================

function ProductFormFields({
  form, errors, onChange,
}: {
  form: ProductForm;
  errors: Partial<Record<keyof ProductForm, string>>;
  onChange: (patch: Partial<ProductForm>) => void;
}) {
  return (
    <>
      <ERPFormSection title="ข้อมูลหลัก" columns={2}>
        <ERPFormField label="SKU" hint="รหัสสินค้า (ไม่บังคับ)">
          <ERPInput value={form.sku} onChange={e => onChange({ sku: e.target.value })} placeholder="เช่น SKU-001" />
        </ERPFormField>
        <ERPFormField label="ชื่อสินค้า" required error={errors.name} span={1}>
          <ERPInput value={form.name} error={!!errors.name} onChange={e => onChange({ name: e.target.value })} placeholder="ชื่อสินค้า" />
        </ERPFormField>
        <ERPFormField label="หมวดหมู่">
          <ERPInput value={form.category_name} onChange={e => onChange({ category_name: e.target.value })} placeholder="เช่น เครื่องเขียน" />
        </ERPFormField>
        <ERPFormField label="ผู้จำหน่าย">
          <ERPInput value={form.seller_name} onChange={e => onChange({ seller_name: e.target.value })} placeholder="ชื่อผู้จำหน่าย" />
        </ERPFormField>
        <ERPFormField label="แบรนด์">
          <ERPInput value={form.brand_name} onChange={e => onChange({ brand_name: e.target.value })} placeholder="แบรนด์" />
        </ERPFormField>
        <ERPFormField label="หน่วยนับ">
          <ERPSelect value={form.uom_name} options={UOM_OPTIONS} onChange={e => onChange({ uom_name: e.target.value })} />
        </ERPFormField>
      </ERPFormSection>

      <ERPFormSection title="ราคา & สต็อก" columns={3}>
        <ERPFormField label="ราคาขาย (฿)" error={errors.list_price}>
          <ERPInput type="number" value={form.list_price} error={!!errors.list_price} onChange={e => onChange({ list_price: e.target.value })} />
        </ERPFormField>
        <ERPFormField label="ราคาต้นทุน (฿)" error={errors.cost_price}>
          <ERPInput type="number" value={form.cost_price} error={!!errors.cost_price} onChange={e => onChange({ cost_price: e.target.value })} />
        </ERPFormField>
        <ERPFormField label="STOCK คงเหลือ" error={errors.stock_on_hand}>
          <ERPInput type="number" value={form.stock_on_hand} error={!!errors.stock_on_hand} onChange={e => onChange({ stock_on_hand: e.target.value })} />
        </ERPFormField>
      </ERPFormSection>

      <ERPFormSection title="อื่นๆ" columns={1}>
        <ERPFormField label="สี">
          <ERPInput value={form.color} onChange={e => onChange({ color: e.target.value })} placeholder="สี (ถ้ามี)" />
        </ERPFormField>
        <ERPFormField label="หมายเหตุ">
          <ERPTextarea value={form.note} rows={2} onChange={e => onChange({ note: e.target.value })} placeholder="หมายเหตุภายใน" />
        </ERPFormField>
        <ERPFormField label="สถานะ">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => onChange({ active: e.target.checked })} className="rounded border-slate-300 text-blue-600" />
            <span className="text-sm text-slate-700">เปิดใช้งานสินค้านี้</span>
          </label>
        </ERPFormField>
      </ERPFormSection>
    </>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function ProductsCrudPage() {
  const { user, can } = useAuth();
  const [rows,    setRows]    = useState<SandboxProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [total,   setTotal]   = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = create
  const [form,      setForm]      = useState<ProductForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProductForm, string>>>({});
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<SandboxProduct | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // Import
  const [importOpen, setImportOpen] = useState(false);

  // Custom form layout (จาก Form Builder) — โหลดทุกครั้งที่เปิด modal
  const [customLayout, setCustomLayout] = useState<FormLayoutConfig | null>(null);
  useEffect(() => {
    if (modalOpen) setCustomLayout(loadFormLayout("products"));
  }, [modalOpen]);
  const useCustom = !!customLayout && customLayout.sections.some(s => s.fields.length > 0);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ---- Fetch list ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/playground-products?limit=200");
      const json: SandboxProductsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data);
      setTotal(json.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ---- Save draft (เฉพาะตอนสร้างใหม่) ----
  const DRAFT_KEY = "erp-draft-products-create";
  const [hasDraft, setHasDraft] = useState(false);

  // ---- Open create / edit ----
  const openCreate = () => {
    setEditingId(null);
    let initial = EMPTY_FORM;
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) { initial = JSON.parse(draft); setHasDraft(true); pushToast("success", "โหลดร่างที่บันทึกไว้"); }
      else setHasDraft(false);
    } catch { /* ignore */ }
    setForm(initial);
    setFormErrors({});
    setCustomErrors({});
    setDirty(false);
    setModalOpen(true);
  };

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setHasDraft(false);
    setForm(EMPTY_FORM);
  };

  const openEdit = (p: SandboxProduct) => {
    setEditingId(p.id);
    setForm({
      sku: p.sku ?? "", name: p.name, category_name: p.category_name ?? "",
      brand_name: p.brand_name ?? "", seller_name: p.seller_name ?? "",
      uom_name: p.uom_name ?? "ชิ้น", color: p.color ?? "",
      list_price: String(p.list_price ?? 0), cost_price: String(p.cost_price ?? 0),
      stock_on_hand: String(p.stock_on_hand ?? 0), active: p.active ?? true,
      note: p.note ?? "",
    });
    setFormErrors({});
    setDirty(false);
    setModalOpen(true);
  };

  const updateForm = (patch: Partial<ProductForm>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      // auto-save ร่าง เฉพาะตอนสร้างใหม่
      if (!editingId) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); setHasDraft(true); } catch { /* ignore */ } }
      return next;
    });
    setDirty(true);
  };

  // ---- Validate ----
  const validate = (): boolean => {
    // ถ้าใช้ layout จาก Form Builder → ใช้กฎจาก config (required/min/max/pattern/conditional)
    if (useCustom && customLayout) {
      const errs = validateForm(customLayout, form as unknown as Record<string, unknown>, (p) => can(p as Parameters<typeof can>[0]));
      setCustomErrors(errs);
      return Object.keys(errs).length === 0;
    }
    const errs: Partial<Record<keyof ProductForm, string>> = {};
    if (!form.name.trim()) errs.name = "กรุณากรอกชื่อสินค้า";
    if (Number(form.list_price) < 0) errs.list_price = "ราคาห้ามติดลบ";
    if (Number(form.cost_price) < 0) errs.cost_price = "ราคาห้ามติดลบ";
    if (Number(form.stock_on_hand) < 0) errs.stock_on_hand = "จำนวนห้ามติดลบ";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---- Save (create or update) ----
  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        sku: form.sku || undefined, name: form.name,
        category_name: form.category_name || undefined,
        brand_name: form.brand_name || undefined,
        seller_name: form.seller_name || undefined,
        uom_name: form.uom_name, color: form.color || undefined,
        list_price: Number(form.list_price), cost_price: Number(form.cost_price),
        stock_on_hand: Number(form.stock_on_hand), active: form.active,
        note: form.note || undefined, actor: user?.name,
      };

      const res = editingId
        ? await apiFetch(`/api/playground-products/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          })
        : await apiFetch("/api/playground-products", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      pushToast("success", editingId ? "บันทึกการแก้ไขแล้ว" : "เพิ่มสินค้าใหม่แล้ว");
      if (!editingId) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setHasDraft(false); }
      setModalOpen(false);
      setDirty(false);
      await fetchList();
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete ----
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/playground-products/${deleteTarget.id}?actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      pushToast("success", `ลบ "${deleteTarget.name}" แล้ว`);
      setDeleteTarget(null);
      await fetchList();
    } catch (err: unknown) {
      pushToast("error", err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✏️ Products CRUD — เขียนข้อมูลจริง (Sandbox)
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">สินค้า (CRUD จริง)</h1>
            <p className="text-slate-500 mt-1">
              เพิ่ม / แก้ไข / ลบสินค้าได้จริง — บันทึกลง Supabase + audit log ทุก action
            </p>
          </div>
          {can("products.create") && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setImportOpen(true)}
                className="h-10 px-4 bg-white text-slate-700 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
                📥 นำเข้า CSV
              </button>
              <button onClick={openCreate}
                className="h-10 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                ＋ เพิ่มสินค้า
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-lg mt-0.5">🧪</span>
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-0.5">นี่คือ Sandbox — ตารางทดลองแยก (erp_playground_products)</p>
            <p className="text-amber-700 text-xs">
              ข้อมูลเริ่มต้น 50 รายการ snapshot จากสินค้าจริง — แก้/ลบได้อิสระ ไม่กระทบข้อมูล Odoo จริง ทุกการเปลี่ยนแปลงถูกบันทึกใน audit log
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable<SandboxProduct>
            data={rows}
            columns={COLUMNS}
            title={`รายการสินค้า (${total} รายการ)`}
            description="ข้อมูลจาก sandbox — เรียงตามวันที่แก้ไขล่าสุด"
            loading={loading}
            error={error ?? undefined}
            emptyMessage="ยังไม่มีสินค้า — กดปุ่ม เพิ่มสินค้า เพื่อเริ่ม"
            searchPlaceholder="ค้นหา SKU / ชื่อ / หมวดหมู่..."
            searchableKeys={["sku", "name", "category_name", "seller_name"]}
            tableId="products-crud"
            exportFilename="สินค้า"
            enableCards
            cardConfig={{
              primary:  "name",
              subtitle: "sku",
              image:    "primary_image_url",
              badges:   ["category_name", "active"],
              metrics:  ["list_price", "stock_on_hand"],
              lines:    ["seller_name", "uom_name"],
            }}
            onRetry={fetchList}
            rowActions={[
              ...(can("products.edit")   ? [{ label: "แก้ไข", icon: "✏️", onClick: openEdit } as RowAction<SandboxProduct>] : []),
              ...(can("products.delete") ? [{ label: "ลบสินค้า", icon: "🗑️", onClick: (row: SandboxProduct) => setDeleteTarget(row), variant: "danger" } as RowAction<SandboxProduct>] : []),
            ]}
            bulkEditFields={can("products.edit") ? BULK_EDIT_FIELDS : undefined}
            onBulkEdit={async (edits) => {
              let success = 0, failed = 0;
              for (const { row, changes } of edits) {
                try {
                  const res = await apiFetch(`/api/playground-products/${row.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...changes, actor: user?.name }),
                  });
                  const json = await res.json();
                  if (json.error) failed++; else success++;
                } catch { failed++; }
              }
              await fetchList();
              if (success) pushToast("success", `บันทึก ${success} รายการสำเร็จ`);
              if (failed)  pushToast("error", `ล้มเหลว ${failed} รายการ`);
              return { success, failed };
            }}
            bulkRowLabel={(row) => row.name}
            inlineEditFields={can("products.edit") ? ["name", "category_name", "seller_name", "list_price", "stock_on_hand"] : undefined}
            onInlineEdit={async (row, field, value) => {
              const res = await apiFetch(`/api/playground-products/${row.id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [field]: (field === "list_price" || field === "stock_on_hand") ? Number(value) : value, actor: user?.name }),
              });
              const json = await res.json();
              if (json.error) { pushToast("error", json.error); return json.error; }
              pushToast("success", "บันทึกแล้ว");
              await fetchList();
              return null;
            }}
            drawerTitle={(row) => row.name}
            drawerContent={(row) => (
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm bg-slate-100 px-2.5 py-1 rounded-md text-slate-600 font-medium">{row.sku || "ไม่มี SKU"}</span>
                  <StatusBadge status={row.active ? "active" : "inactive"} />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{row.name}</h2>
                <div className="border-t border-slate-100" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <DF label="หมวดหมู่" value={row.category_name} />
                  <DF label="ผู้จำหน่าย" value={row.seller_name} />
                  <DF label="แบรนด์" value={row.brand_name} />
                  <DF label="หน่วยนับ" value={row.uom_name} />
                  <DF label="สี" value={row.color} />
                  <DF label="วันที่อัปเดต" value={formatDate(row.updated_at)} />
                </div>
                <div className="border-t border-slate-100" />
                <div className="grid grid-cols-3 gap-3">
                  <PriceCard label="ราคาต้นทุน" value={row.cost_price} tone="slate" />
                  <PriceCard label="ราคาขาย" value={row.list_price} tone="blue" />
                  <PriceCard label="STOCK" value={row.stock_on_hand} tone={row.stock_on_hand === 0 ? "red" : "emerald"} unit />
                </div>
                {row.note && (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                    <p className="text-xs text-slate-400 mb-1">หมายเหตุ</p>{row.note}
                  </div>
                )}
                {(can("products.edit") || can("products.delete")) && (
                  <>
                    <div className="border-t border-slate-100" />
                    <div className="flex gap-3">
                      {can("products.edit") && <button onClick={() => openEdit(row)} className="flex-1 h-9 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">✏️ แก้ไขสินค้า</button>}
                      {can("products.delete") && <button onClick={() => setDeleteTarget(row)} className="h-9 px-4 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">🗑️ ลบ</button>}
                    </div>
                  </>
                )}
                <div className="border-t border-slate-100" />
                <ImageManager
                  entityType="erp_playground_product"
                  entityId={row.id}
                  actor={user?.name}
                  readonly={!can("products.edit")}
                />
                <div className="border-t border-slate-100" />
                <ProductHistory entityId={row.id} />
              </div>
            )}
          />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <ERPModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}
        description={editingId ? `กำลังแก้ไข: ${form.name}` : "กรอกข้อมูลสินค้าใหม่"}
        size="lg"
        hasUnsavedChanges={dirty}
        footer={
          <>
            {!editingId && hasDraft && (
              <button onClick={clearDraft} disabled={saving}
                className="mr-auto h-9 px-3 text-sm text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50">
                🗑 ล้างร่าง
              </button>
            )}
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              ยกเลิก
            </button>
            <button onClick={save} disabled={saving}
              className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
            </button>
          </>
        }
      >
        {useCustom ? (
          <>
            <div className="mb-4 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700 flex items-center gap-1.5">
              🧩 ฟอร์มนี้ใช้ layout ที่ออกแบบจาก <b>Form Builder</b> — แก้ผังได้ที่เมนู &quot;ออกแบบฟอร์ม&quot;
            </div>
            <FormRenderer
              config={customLayout!}
              values={form as unknown as Record<string, unknown>}
              errors={customErrors}
              onChange={(k, v) => { updateForm({ [k]: v } as Partial<ProductForm>); setCustomErrors(e => { const n = { ...e }; delete n[k]; return n; }); }}
            />
          </>
        ) : (
          <ProductFormFields form={form} errors={formErrors} onChange={updateForm} />
        )}
      </ERPModal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ยืนยันการลบสินค้า"
        message={
          <span>
            ต้องการลบ <span className="font-semibold text-slate-800">{deleteTarget?.name}</span> ใช่ไหม?
            <br /><span className="text-xs text-slate-400">การลบนี้บันทึกใน audit log แต่ไม่สามารถกู้คืนได้</span>
          </span>
        }
        confirmText="ลบสินค้า"
        variant="danger"
        loading={deleting}
      />

      {/* Import CSV */}
      <ImportDialog<Record<string, unknown>>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="นำเข้าสินค้าจาก CSV"
        fields={IMPORT_FIELDS}
        onImport={async (record) => {
          const res = await apiFetch("/api/playground-products", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...record, actor: user?.name }),
          });
          const json = await res.json();
          return json.error ?? null;
        }}
        onDone={() => { fetchList(); pushToast("success", "นำเข้าข้อมูลเสร็จสิ้น"); }}
      />

      <ToastStack toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </PlaygroundShell>
  );
}

// ---- Product history (audit log เฉพาะสินค้านี้) ----

function ProductHistory({ entityId }: { entityId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/audit-logs?entity_id=${entityId}&limit=50`)
      .then(r => r.json())
      .then((json: AuditLogsResponse) => { if (active) setEntries(json.data ?? []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityId]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ประวัติการเปลี่ยนแปลง</p>
      <ActivityFeed entries={entries} loading={loading} compact emptyMessage="ยังไม่มีการเปลี่ยนแปลง" />
    </div>
  );
}

// ---- small components ----

function DF({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

function PriceCard({ label, value, tone, unit }: { label: string; value: number | null; tone: "slate" | "blue" | "red" | "emerald"; unit?: boolean }) {
  const tones = {
    slate:   "bg-slate-50 text-slate-700 [&_p]:text-slate-500",
    blue:    "bg-blue-50 text-blue-700 [&_p]:text-blue-500",
    red:     "bg-red-50 text-red-600 [&_p]:text-red-500",
    emerald: "bg-emerald-50 text-emerald-700 [&_p]:text-emerald-500",
  };
  return (
    <div className={`rounded-xl p-3 text-center ${tones[tone]}`}>
      <p className="text-xs mb-1">{label}</p>
      <p className="text-lg font-bold">
        {value != null && value > 0 ? (unit ? value.toLocaleString("th-TH") : `฿${value.toLocaleString("th-TH")}`) : <span className="text-sm font-normal text-slate-400">—</span>}
      </p>
    </div>
  );
}
