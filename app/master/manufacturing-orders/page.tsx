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

type Version = { id: string; version: string | null; bom_code: string; is_default: boolean };
type PreviewMat = {
  key: string; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty_per: number; uom: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null;
};
type MatRow = PreviewMat & { required: number };
type FormState = {
  id: string | null; mo_no: string;
  product_sku: string; product_name: string; product_image: string | null;
  qty: number; due_date: string;
  bom_code: string | null; bom_version: string | null; bom_id: string | null;
  status: string; note: string;
  materials: PreviewMat[];
};
const empty = (): FormState => ({ id: null, mo_no: "", product_sku: "", product_name: "", product_image: null, qty: 1, due_date: "", bom_code: null, bom_version: null, bom_id: null, status: "draft", note: "", materials: [] });

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:       { label: "ร่าง",        cls: "bg-slate-100 text-slate-600" },
  confirmed:   { label: "ยืนยันแล้ว",   cls: "bg-blue-50 text-blue-700" },
  in_progress: { label: "กำลังผลิต",    cls: "bg-amber-50 text-amber-700" },
  done:        { label: "เสร็จ",        cls: "bg-emerald-50 text-emerald-700" },
  cancelled:   { label: "ยกเลิก",       cls: "bg-rose-50 text-rose-700" },
};
const STATUS_OPTS = [["draft","ร่าง"],["confirmed","ยืนยันแล้ว"],["in_progress","กำลังผลิต"],["done","เสร็จ"],["cancelled","ยกเลิก"]] as const;
const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");

export default function MoWorkspacePage() {
  const canView = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit = usePermission("products.edit");
  const { can } = useAuth();
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

  // ดึงสูตร (lines) ของ bom id มาทำ preview
  const loadBomLines = async (bomId: string): Promise<PreviewMat[]> => {
    try {
      const res = await apiFetch(`/api/bom/${bomId}`); const j = await res.json();
      return ((j.data?.lines ?? []) as Array<Record<string, unknown>>).map((l, i) => ({
        key: `m${i}`, component_sku: (l.component_sku as string) ?? null, component_name: (l.component_name as string) ?? null,
        material_type: (l.material_type as string) ?? null, qty_per: Number(l.qty) || 0, uom: (l.uom as string) ?? null,
        cut_block_code: (l.cut_block_code as string) ?? null,
        cut_width: l.cut_width != null ? Number(l.cut_width) : null, cut_length: l.cut_length != null ? Number(l.cut_length) : null,
        pieces: l.pieces != null ? Number(l.pieces) : null,
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

  const openCreate = () => { setForm(empty()); setVersions([]); setFormErr(null); };

  const openEdit = async (row: MoListItem) => {
    setLoadingForm(true); setFormErr(null); setForm(empty()); setVersions([]);
    try {
      const res = await apiFetch(`/api/mo/${row.id}`); const j = await res.json();
      if (j.error) throw new Error(j.error);
      const d = j.data;
      const mats: PreviewMat[] = (d.materials ?? []).map((m: Record<string, unknown>, i: number) => ({
        key: `m${i}`, component_sku: (m.component_sku as string) ?? null, component_name: (m.component_name as string) ?? null,
        material_type: (m.material_type as string) ?? null, qty_per: Number(m.qty_per) || 0, uom: (m.uom as string) ?? null,
        cut_block_code: (m.cut_block_code as string) ?? null,
        cut_width: m.cut_width != null ? Number(m.cut_width) : null, cut_length: m.cut_length != null ? Number(m.cut_length) : null,
        pieces: m.pieces != null ? Number(m.pieces) : null,
      }));
      setForm({
        id: d.id, mo_no: d.mo_no ?? "", product_sku: d.product_sku ?? "", product_name: d.product_name ?? "", product_image: null,
        qty: Number(d.qty) || 1, due_date: d.due_date ?? "", bom_code: d.bom_code ?? null, bom_version: d.bom_version ?? null, bom_id: null,
        status: d.status ?? "draft", note: d.note ?? "", materials: mats,
      });
      if (d.product_sku) {
        const vr = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(d.product_sku)}`); const vj = await vr.json();
        const vers = (vj.data ?? []) as Version[]; setVersions(vers);
        const cur = vers.find((v) => v.bom_code === d.bom_code); if (cur) patch({ bom_id: cur.id });
      }
    } catch (e) { setFormErr(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoadingForm(false); }
  };

  const save = async () => {
    if (!form) return;
    if (!form.product_sku) { setFormErr("กรุณาเลือกสินค้า"); return; }
    if (!(form.qty > 0)) { setFormErr("จำนวนต้องมากกว่า 0"); return; }
    setSaving(true); setFormErr(null);
    const payload = { product_sku: form.product_sku, product_name: form.product_name || null, qty: form.qty,
      due_date: form.due_date || null, bom_code: form.bom_code, bom_version: form.bom_version, status: form.status, note: form.note || null };
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
          {canCreate && <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ สร้างใบสั่งผลิต</button>}
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

            {/* preview กางสูตร — 2 แท็บ */}
            {(() => {
              const matRows: MatRow[] = form.materials.map((m) => ({ ...m, required: Math.round(m.qty_per * (form.qty || 0) * 10000) / 10000 }));
              const codeCol: LineColumn<MatRow> = {
                key: "component", header: "วัตถุดิบ", minWidth: 220, sortable: true,
                getValue: (r) => r.component_name || r.component_sku, groupLabel: (r) => r.component_sku ? `${r.component_sku} ${r.component_name}` : "— ไม่ระบุ —",
                render: (r) => <span className="block truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> <span className="text-slate-700">{r.component_name}</span></span>,
              };
              const typeCol: LineColumn<MatRow> = { key: "material_type", header: "ประเภท", width: 110, sortable: true, getValue: (r) => r.material_type, groupLabel: (r) => r.material_type || "— ไม่ระบุ —" };
              const reqCol: LineColumn<MatRow> = { key: "required", header: "รวมต้องใช้", width: 100, align: "right", sortable: true, summable: true, getValue: (r) => r.required, render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmt(r.required)}</span> };
              const uomCol: LineColumn<MatRow> = { key: "uom", header: "หน่วย", width: 64, getValue: (r) => r.uom };
              const sumCols: LineColumn<MatRow>[] = [codeCol, typeCol, { key: "qty_per", header: "ต่อชิ้น", width: 76, align: "right", getValue: (r) => r.qty_per }, reqCol, uomCol];
              const blockCols: LineColumn<MatRow>[] = [codeCol, typeCol,
                { key: "cut_block_code", header: "บล็อกตัด", width: 130, getValue: (r) => r.cut_block_code },
                { key: "cut_width", header: "กว้าง", width: 64, align: "right", getValue: (r) => r.cut_width ?? "" },
                { key: "cut_length", header: "ยาว", width: 64, align: "right", getValue: (r) => r.cut_length ?? "" },
                { key: "pieces", header: "ชิ้น", width: 56, align: "right", getValue: (r) => r.pieces ?? "" },
                reqCol, uomCol];
              return (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm">
                      <button type="button" onClick={() => setMatTab("sum")} className={`h-7 px-3 ${matTab === "sum" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>วัตถุดิบที่ต้องใช้</button>
                      <button type="button" onClick={() => setMatTab("block")} className={`h-7 px-3 border-l border-slate-200 ${matTab === "block" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>รายละเอียด (บล็อก)</button>
                    </div>
                    <span className="text-xs text-slate-400">กางสูตร × {fmt(form.qty || 0)} · {matRows.length} รายการ</span>
                  </div>
                  {matRows.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      {form.product_sku ? "สินค้านี้ยังไม่มีสูตร BOM" : "เลือกสินค้าก่อน ระบบจะกางสูตรให้"}
                    </div>
                  ) : (
                    <LineItemsGrid<MatRow>
                      rows={matRows} columns={matTab === "sum" ? sumCols : blockCols} onChange={() => {}}
                      rowId={(r) => r.key} readonly stickyHeader maxHeight="38vh"
                      groupByOptions={[{ key: "material_type", label: "ประเภท" }, { key: "component", label: "วัตถุดิบ" }]}
                    />
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">เช็ครายการเตรียม/ขอซื้อ จะเพิ่มในเฟสถัดไป</p>
                </div>
              );
            })()}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={archiveTarget !== null} onClose={() => !archiving && setArchiveTarget(null)} onConfirm={doArchive}
        loading={archiving} variant="danger" title="ย้ายใบสั่งผลิตเข้าคลังเก็บ?"
        message={`ใบสั่งผลิต "${archiveTarget?.mo_no ?? ""}" จะถูกซ่อน (กู้คืนได้)`} confirmText="ย้ายเข้าคลังเก็บ" />
    </>
  );
}
