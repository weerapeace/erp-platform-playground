"use client";

/**
 * BOM Workspace — สูตรการผลิต (หัวสูตร + รายการวัตถุดิบในจอเดียว)
 *
 * ของกลางตาม CLAUDE.md:
 *   DataTable / ERPModal / ConfirmDialog / SkuPicker(/api/admin/picker) / useToast / useAuth
 *   ไม่ query Supabase ตรง — ผ่าน /api/bom (อ่าน auth, เขียน admin, audit)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { BomLineEditor, SkuPicker, emptyLine, type EditorLine } from "./line-editor";
import { CopyBomModal } from "./copy-bom-modal";

// ---- types (ตรงกับ /api/bom) ----
type BomListItem = {
  id: string; bom_code: string; product_sku: string | null; product_name: string | null;
  version: string | null; bom_type: string | null; status: string | null;
  source: string | null; is_active: boolean; line_count: number;
};
type BomLineRow = {
  id: string; slot_code: string | null; component_sku: string | null; component_name: string | null;
  qty: number; uom: string | null; waste_percent: number | null; is_optional: boolean;
  sequence: number | null; source: string | null; odoo_bom_line_id: number | null;
  calc_mode: string | null; cut_block_id: number | null; cut_block_code: string | null;
  pieces: number | null; cut_width: number | null; cut_length: number | null;
  face_width_cm: number | null; material_type: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "ร่าง",       cls: "bg-slate-100 text-slate-600" },
  active:   { label: "ใช้งาน",     cls: "bg-emerald-50 text-emerald-700" },
  obsolete: { label: "เลิกใช้",    cls: "bg-amber-50 text-amber-700" },
};
const STATUS_OPTIONS = [["draft", "ร่าง"], ["active", "ใช้งาน"], ["obsolete", "เลิกใช้"]] as const;
const BOMTYPE_OPTIONS = [["normal", "ผลิตปกติ"], ["phantom", "Phantom (สูตรย่อย)"], ["kit", "ชุด (Kit)"]] as const;

// ---- editing form state ----
type FormState = {
  id: string | null;          // null = สร้างใหม่
  bom_code: string;
  product_sku: string;
  product_name: string;
  version: string;
  bom_type: string;
  status: string;
  note: string;
  lines: EditorLine[];
};

function emptyForm(): FormState {
  return { id: null, bom_code: "", product_sku: "", product_name: "", version: "v1", bom_type: "normal", status: "draft", note: "", lines: [] };
}

export default function BomWorkspacePage() {
  const canView   = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit   = usePermission("products.edit");
  const { can } = useAuth();
  const toast = useToast();

  const [rows, setRows]       = useState<BomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [form, setForm]       = useState<FormState | null>(null);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<BomListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/bom");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data as BomListItem[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // ---- open create ----
  const openCreate = () => { setForm(emptyForm()); setDirty(false); setFormErr(null); };

  // ---- open edit (โหลด header + lines) ----
  const openEdit = async (row: BomListItem) => {
    setLoadingForm(true); setFormErr(null);
    setForm(emptyForm()); // เปิด modal ทันที (โชว์ loading)
    try {
      const res = await apiFetch(`/api/bom/${row.id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json.data as BomListItem & { lines: BomLineRow[] };
      setForm({
        id: d.id, bom_code: d.bom_code ?? "", product_sku: d.product_sku ?? "", product_name: d.product_name ?? "",
        version: d.version ?? "v1", bom_type: d.bom_type ?? "normal", status: d.status ?? "draft", note: (d as { note?: string }).note ?? "",
        lines: (d.lines ?? []).map((l) => ({
          key: l.id, component_id: null, slot_code: l.slot_code, image_key: null,
          component_sku: l.component_sku ?? "", component_name: l.component_name ?? "",
          material_family_id: null, material_type: l.material_type ?? "",
          qty: Number(l.qty) || 0, uom: l.uom ?? "", waste_percent: Number(l.waste_percent) || 0, is_optional: !!l.is_optional,
          cut_block_id: l.cut_block_id ?? null, cut_block_code: l.cut_block_code ?? "",
          pieces: Number(l.pieces) || 1, cut_width: Number(l.cut_width) || 0, cut_length: Number(l.cut_length) || 0,
          face_width_cm: Number(l.face_width_cm) || 0,
          source: l.source, odoo_bom_line_id: l.odoo_bom_line_id,
        })),
      });
      setDirty(false);
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดสูตรไม่ได้"); }
    finally { setLoadingForm(false); }
  };

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
      })),
    };
    try {
      const res = form.id
        ? await apiFetch(`/api/bom/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/bom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success(form.id ? "บันทึกสูตรแล้ว" : "สร้างสูตรใหม่แล้ว");
      setForm(null); setDirty(false);
      await fetchList();
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
      await fetchList();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setArchiving(false); }
  };

  const columns: ColumnDef<BomListItem>[] = useMemo(() => [
    { id: "bom_code", accessorKey: "bom_code", header: "รหัสสูตร", size: 150,
      cell: ({ getValue }) => <code className="font-mono text-xs text-slate-700">{getValue() as string}</code> },
    { id: "product_sku", accessorKey: "product_sku", header: "สินค้า", size: 280,
      cell: ({ row }) => (
        <div>
          <code className="text-[10px] text-slate-400 font-mono">{row.original.product_sku}</code>
          <div className="text-sm text-slate-700">{row.original.product_name}</div>
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

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="bom-headers"
          data={rows}
          columns={columns}
          loading={loading}
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
          <div className="space-y-4">
            {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

            {/* header fields */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">รหัสสูตร (bom_code) *</span>
                <input value={form.bom_code} onChange={(e) => patchForm({ bom_code: e.target.value })}
                  placeholder="เช่น BOM-PIX10-01"
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">เวอร์ชัน</span>
                <input value={form.version} onChange={(e) => patchForm({ version: e.target.value })}
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>

            <div>
              <span className="text-xs font-medium text-slate-600">สินค้าที่ผลิต (product)</span>
              <div className="mt-0.5">
                <SkuPicker sku={form.product_sku} name={form.product_name} placeholder="— เลือกสินค้าที่ผลิต —"
                  onPick={(sku, name) => patchForm({ product_sku: sku, product_name: name })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">ประเภทสูตร</span>
                <select value={form.bom_type} onChange={(e) => patchForm({ bom_type: e.target.value })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {BOMTYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">สถานะ</span>
                <select value={form.status} onChange={(e) => patchForm({ status: e.target.value })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={form.note} onChange={(e) => patchForm({ note: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>

            {/* lines */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">รายการวัตถุดิบ</h3>
                {canEdit && (
                  <button type="button" onClick={() => setCopyOpen(true)}
                    className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">📋 คัดลอก BOM</button>
                )}
              </div>
              <BomLineEditor lines={form.lines} onChange={(lines) => patchForm({ lines })} readonly={!canEdit} />
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
    </>
  );
}
