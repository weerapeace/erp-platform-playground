"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { AttachmentPanel } from "@/components/attachment-panel";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, WarehousePicker, EmployeePicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue, WarehousePickerValue, EmployeePickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { SOListItem, SODetail } from "@/app/api/sales-orders/route";
import { SOLineEditor, SalesTotalsPreview, calculateEditorTotals, emptyLine, type EditorLine } from "@/components/sales-line-items";
import { format as formatMoney } from "@/lib/money";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";

const randId = () => String(Math.random()).slice(2);

/** รวมรายการสินค้า: SKU เดียวกัน → บวกจำนวน, ใช้ราคาแรกที่ไม่ใช่ 0, รวมหมายเหตุที่มา */
function mergeLines(base: EditorLine[], incoming: EditorLine[]): EditorLine[] {
  const out: EditorLine[] = base.filter(l => l.product_name.trim()).map(l => ({ ...l }));
  const idxBySku = new Map<string, number>();
  out.forEach((l, i) => { const k = l.sku?.trim(); if (k) idxBySku.set(k, i); });
  for (const inc of incoming) {
    const k = inc.sku?.trim();
    if (k && idxBySku.has(k)) {
      const t = out[idxBySku.get(k)!];
      t.qty = Number(t.qty) + Number(inc.qty);
      if (!t.unit_price && inc.unit_price) t.unit_price = inc.unit_price;
      const refs = new Set(
        [...(t.note ? t.note.split(" · ") : []), ...(inc.note ? inc.note.split(" · ") : [])].filter(Boolean),
      );
      t.note = [...refs].join(" · ");
    } else {
      out.push({ ...inc });
      if (k) idxBySku.set(k, out.length - 1);
    }
  }
  return out.length ? out : [emptyLine()];
}

// ---- helpers ----

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต",
  ready: "พร้อมส่ง", shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

// ---- Form state ----

type FormState = {
  customer: CustomerPickerValue | null;
  warehouse: WarehousePickerValue | null;
  sale_person_name: string;
  order_date: string;
  expected_ship_date: string;
  vat_rate: number;
  vat_included: boolean;
  wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  payment_terms: string;
  customer_po_no: string;
  tax_invoice_no: string;
  lines: EditorLine[];
};

const EMPTY: FormState = {
  customer: null, warehouse: null, sale_person_name: "",
  order_date: new Date().toISOString().slice(0, 10), expected_ship_date: "",
  vat_rate: 7, vat_included: false, wht_rate: 0,
  header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
  note: "", payment_terms: "", customer_po_no: "", tax_invoice_no: "", lines: [emptyLine()],
};

const formSnapshot = (form: FormState) => JSON.stringify({
  ...form,
  lines: form.lines.map(({ tempId: _tempId, ...line }) => line),
});

// ============================================================
// Page
// ============================================================

export default function SalesOrdersPage() {
  const canView    = usePermission("so.view");
  const canCreate  = usePermission("so.create");
  const canConfirm = usePermission("so.confirm");
  const canShip    = usePermission("so.ship");
  const canComplete= usePermission("so.complete");
  const canCancel  = usePermission("so.cancel");
  const { user, can } = useAuth();

  const [rows,    setRows]    = useState<SOListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<FormState>(EMPTY);
  const [formBaseline, setFormBaseline] = useState(formSnapshot(EMPTY));
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  // ดึงจากเอกสารต้นทาง
  const [pickerMode,   setPickerMode]   = useState<"quotation" | "mo" | null>(null);
  const [pulledQuotes, setPulledQuotes] = useState<{ id: string; label: string }[]>([]);
  const [pulling,      setPulling]      = useState(false);

  // คลังหลัก (default ตอนสร้าง)
  const [defaultWarehouse, setDefaultWarehouse] = useState<WarehousePickerValue | null>(null);

  // detail drawer
  const [detail,        setDetail]        = useState<SODetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // workflow
  const [wfLoading, setWfLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<SODetail | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    // SWR-lite: กลับเข้าหน้าเดิม → โชว์ของแคชทันที (ไม่ขึ้น spinner) แล้ว revalidate เงียบ
    const cached = peekSWR<SOListItem[]>("so:list");
    if (cached) { setRows(cached); setLoading(false); } else { setLoading(true); }
    setError(null);
    try {
      const res = await apiFetch("/api/sales-orders?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data = (json.data ?? []) as SOListItem[];
      setRows(data); mutateSWR("so:list", data);
    } catch (err) { if (!cached) setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // โหลดคลังหลัก (WH-MAIN) ไว้เป็นค่าเริ่มต้นตอนสร้าง SO — แคชไว้ ไม่ยิงซ้ำทุกครั้งที่เข้าหน้า
  useEffect(() => {
    if (!canView) return;
    const apply = (list: WarehousePickerValue[]) => { const main = list.find(w => w.code === "WH-MAIN") ?? null; if (main) setDefaultWarehouse(main); };
    const cached = peekSWR<WarehousePickerValue[]>("warehouses:list");
    if (cached) { apply(cached); return; }
    apiFetch("/api/master/warehouses?limit=50")
      .then(r => r.json())
      .then(j => { const list = (j.data ?? []) as WarehousePickerValue[]; mutateSWR("warehouses:list", list); apply(list); })
      .catch(() => {});
  }, [canView]);

  // ---- Open detail ----
  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const res = await apiFetch(`/api/sales-orders/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as SODetail);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  // ---- Open edit (draft only) ----
  const openEdit = (so: SODetail) => {
    setEditingId(so.id);
    const nextForm: FormState = {
      customer: so.customer_id ? {
        id: so.customer_id, code: so.customer_code, name: so.customer_name ?? "",
      } as CustomerPickerValue : null,
      warehouse: (so as unknown as { from_warehouse_id?: string; from_warehouse_code?: string; from_warehouse_name?: string }).from_warehouse_id ? {
        id: (so as unknown as { from_warehouse_id: string }).from_warehouse_id,
        code: (so as unknown as { from_warehouse_code: string | null }).from_warehouse_code,
        name: (so as unknown as { from_warehouse_name: string }).from_warehouse_name ?? "",
      } as WarehousePickerValue : null,
      sale_person_name: so.sale_person_name ?? "",
      order_date: so.order_date,
      expected_ship_date: so.expected_ship_date ?? "",
      vat_rate: so.vat_rate, vat_included: so.vat_included, wht_rate: so.wht_rate,
      header_discount_type: so.header_discount_type, header_discount_value: so.header_discount_value,
      shipping_fee: so.shipping_fee,
      note: so.note ?? "",
      payment_terms: (so as unknown as { payment_terms?: string }).payment_terms ?? "",
      customer_po_no: (so as unknown as { customer_po_no?: string }).customer_po_no ?? "",
      tax_invoice_no: so.tax_invoice_no ?? "",
      lines: so.lines.map(l => ({
        tempId: l.id ?? String(Math.random()),
        product_id: l.product_id ?? null, sku: l.sku ?? null, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type ?? "percent",
        discount_value: l.discount_value ?? 0,
        tax_code: l.tax_code ?? null, note: l.note ?? "",
      })),
    };
    setForm(nextForm);
    setFormBaseline(formSnapshot(nextForm));
    setPulledQuotes([]);
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  const openCreate = () => {
    const nextForm = { ...EMPTY, sale_person_name: user?.name ?? "", warehouse: defaultWarehouse, lines: [emptyLine()] };
    setEditingId(null); setForm(nextForm); setFormBaseline(formSnapshot(nextForm)); setPulledQuotes([]); setFormErr(null); setModalOpen(true);
  };

  // ---- ดึงจากเอกสารต้นทาง ----
  const handlePicked = async (rows: SourceDocRow[]) => {
    if (pickerMode === "mo") {
      const incoming: EditorLine[] = rows.map(r => ({
        tempId: randId(), product_id: null,
        sku: (r.product_sku as string) ?? null,
        product_name: (r.product_name as string) || (r.product_sku as string) || "สินค้า",
        image_url: null, image_key: null,
        qty: Number(r.qty) || 1, unit: "ชิ้น", unit_price: 0,
        discount_type: "percent", discount_value: 0, tax_code: null,
        note: `จาก ${r.mo_no ?? "ใบสั่งผลิต"}`,
      }));
      setForm(f => ({ ...f, lines: mergeLines(f.lines, incoming) }));
      flash(`ดึง ${rows.length} ใบสั่งผลิตแล้ว (ราคา = 0 กรุณากรอกราคาขาย)`);
      return;
    }

    // quotation — บังคับลูกค้าเดียวกัน
    const custSet = new Set([form.customer?.id, ...rows.map(r => r.customer_id as string)].filter(Boolean));
    if (custSet.size > 1) {
      flash("ใบเสนอราคาที่เลือกเป็นคนละลูกค้า — เลือกได้เฉพาะลูกค้าเดียวกัน");
      return;
    }
    setPulling(true);
    try {
      const details = await Promise.all(rows.map(r =>
        apiFetch(`/api/quotations/${r.id}`).then(res => res.json()).then(j => {
          if (j.error) throw new Error(j.error);
          return j.data as Record<string, unknown>;
        }),
      ));
      const first = details[0];
      const incoming: EditorLine[] = details.flatMap(d => {
        const qn = (d.quote_number as string) ?? "ใบเสนอราคา";
        return ((d.lines as Record<string, unknown>[]) ?? []).map(l => ({
          tempId: randId(),
          product_id: (l.product_id as string) ?? null,
          sku: (l.sku as string) ?? null,
          product_name: (l.product_name as string) || "",
          image_url: null, image_key: null,
          qty: Number(l.qty) || 0,
          unit: (l.unit as string) || "ชิ้น",
          unit_price: Number(l.unit_price) || 0,
          discount_type: ((l.discount_type as string) === "amount" ? "amount" : "percent") as "percent" | "amount",
          discount_value: Number(l.discount_value) || 0,
          tax_code: (l.tax_code as string) ?? null,
          note: `จาก ${qn}`,
        }));
      });
      setForm(f => ({
        ...f,
        customer: f.customer ?? (first.customer_id ? {
          id: first.customer_id as string, code: (first.customer_code as string) ?? null, name: (first.customer_name as string) ?? "",
        } as CustomerPickerValue : null),
        sale_person_name: f.sale_person_name || ((first.sale_person_name as string) ?? ""),
        vat_rate: first.vat_rate != null ? Number(first.vat_rate) : f.vat_rate,
        vat_included: first.vat_included != null ? Boolean(first.vat_included) : f.vat_included,
        wht_rate: first.wht_rate != null ? Number(first.wht_rate) : f.wht_rate,
        header_discount_type: ((first.header_discount_type as string) === "amount" ? "amount" : "percent"),
        header_discount_value: first.header_discount_value != null ? Number(first.header_discount_value) : f.header_discount_value,
        shipping_fee: first.shipping_fee != null ? Number(first.shipping_fee) : f.shipping_fee,
        lines: mergeLines(f.lines, incoming),
      }));
      setPulledQuotes(prev => {
        const seen = new Set(prev.map(p => p.id));
        const add = rows.filter(r => !seen.has(r.id)).map(r => ({ id: r.id, label: (r.quote_number as string) ?? "ใบเสนอราคา" }));
        return [...prev, ...add];
      });
      flash(`ดึง ${rows.length} ใบเสนอราคาแล้ว`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "ดึงข้อมูลไม่สำเร็จ");
    } finally { setPulling(false); }
  };

  // ---- Save ----
  const save = async () => {
    if (!form.customer) { setFormErr("กรุณาเลือกลูกค้า"); return; }
    if (form.lines.length === 0 || form.lines.some(l => !l.product_name.trim())) {
      setFormErr("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"); return;
    }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        customer_id: form.customer.id, customer_name: form.customer.name, customer_code: form.customer.code,
        from_warehouse_id: form.warehouse?.id ?? null,
        sale_person_name: form.sale_person_name || null,
        order_date: form.order_date,
        expected_ship_date: form.expected_ship_date || null,
        vat_rate: form.vat_rate, vat_included: form.vat_included, wht_rate: form.wht_rate,
        header_discount_type: form.header_discount_type,
        header_discount_value: form.header_discount_value,
        shipping_fee: form.shipping_fee,
        note: form.note || null,
        payment_terms: form.payment_terms || null,
        customer_po_no: form.customer_po_no || null,
        tax_invoice_no: form.tax_invoice_no.trim() || null,
      };
      const lines = form.lines.map(l => ({
        product_id: l.product_id, sku: l.sku, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type, discount_value: l.discount_value,
        tax_code: l.tax_code, note: l.note,
      }));
      const usingSources = !editingId && pulledQuotes.length > 0;
      const url = editingId
        ? `/api/sales-orders/${editingId}`
        : usingSources ? "/api/sales-orders/from-sources" : "/api/sales-orders";
      const method = editingId ? "PATCH" : "POST";
      const payload = usingSources
        ? { header, lines, quote_ids: pulledQuotes.map(q => q.id), actor: user?.name }
        : { header, lines, actor: user?.name };
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : usingSources ? `สร้าง SO + ปิดใบเสนอราคา ${pulledQuotes.length} ใบแล้ว` : "สร้าง SO ใหม่");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // เปลี่ยนชื่อสินค้า "ตัวจริง" (skus_v2) จากปุ่มแก้ชื่อในรายการ — แล้ว sync ทุกแถวที่ใช้สินค้านี้
  const saveMasterName = async (productId: string, name: string) => {
    const res = await apiFetch("/api/skus/rename", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku_id: productId, name_th: name, actor: user?.name }),
    });
    const json = await res.json();
    if (json.error) { flash(json.error); throw new Error(json.error); }
    setForm(f => ({ ...f, lines: f.lines.map(l => l.product_id === productId ? { ...l, product_name: name } : l) }));
    flash("เปลี่ยนชื่อสินค้าตัวจริงแล้ว");
  };

  // ---- Transition ----
  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/sales-orders/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash({
        confirm: "ยืนยันแล้ว · ออกเลข SO", start_production: "เริ่มผลิต",
        mark_ready: "พร้อมจัดส่ง", ship: "จัดส่งแล้ว",
        complete: "ปิด SO", cancel: "ยกเลิกแล้ว",
      }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false); setCancelTarget(null); setCancelReason("");
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  // ---- Columns ----
  const columns: ColumnDef<SOListItem>[] = useMemo(() => [
    {
      id: "so_number", accessorKey: "so_number", header: "เลขที่ SO", size: 130,
      cell: ({ getValue, row }) => {
        const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>;
      },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 220 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{STATUS_LABEL[s] ?? s}</span>;
      },
    },
    {
      id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-right block">{baht(getValue() as number)}</span>,
    },
    { id: "sale_person_name", accessorKey: "sale_person_name", header: "เซลส์", size: 140 },
    {
      id: "order_date", accessorKey: "order_date", header: "วันที่สั่ง", size: 110,
      cell: ({ getValue }) => <span>{formatDate(getValue())}</span>,
    },
    {
      id: "expected_ship_date", accessorKey: "expected_ship_date", header: "วันที่ส่ง", size: 110,
      cell: ({ getValue }) => <span>{formatDate(getValue())}</span>,
    },
    {
      id: "line_count", accessorKey: "line_count", header: "รายการ", size: 80,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span>,
    },
    {
      id: "actions", header: "", size: 120, enableSorting: false,
      cell: ({ row }) => (
        <a
          href={`/print/sales-order/${row.original.id}`}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="พิมพ์ใบเสร็จรับเงิน/ใบกำกับภาษี"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          🧾 ใบกำกับภาษี
        </a>
      ),
    },
  ], []);

  const formDirty = useMemo(() => formSnapshot(form) !== formBaseline, [form, formBaseline]);

  const previewTotals = useMemo(() => calculateEditorTotals(form.lines, {
    vatRate: form.vat_rate,
    vatIncluded: form.vat_included,
    whtRate: form.wht_rate,
    headerDiscountType: form.header_discount_type,
    headerDiscountValue: form.header_discount_value,
    shippingFee: form.shipping_fee,
  }), [
    form.lines,
    form.vat_rate,
    form.vat_included,
    form.wht_rate,
    form.header_discount_type,
    form.header_discount_value,
    form.shipping_fee,
  ]);

  // ---- Saved Views (มุมมองบันทึกไว้ — ของกลาง §14) ----
  // "ของฉัน" + "เดือนนี้" ต้องอิงค่า dynamic (ชื่อผู้ใช้ / เดือนปัจจุบัน) จึงสร้างใน useMemo
  const views = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const myName = user?.name ?? "";
    return [
      { id: "all",       label: "ทั้งหมด" },
      { id: "mine",      label: "👤 ของฉัน",     filter: (r: Record<string, unknown>) => String(r.sale_person_name ?? "") === myName },
      { id: "draft",     label: "📝 ร่าง",        filter: (r: Record<string, unknown>) => r.status === "draft" },
      { id: "confirmed", label: "✅ ยืนยันแล้ว",  filter: (r: Record<string, unknown>) => r.status === "confirmed" },
      { id: "shipped",   label: "📦 ส่งของแล้ว",  filter: (r: Record<string, unknown>) => r.status === "shipped" },
      { id: "month",     label: "🗓 เดือนนี้",    filter: (r: Record<string, unknown>) => String(r.order_date ?? "").startsWith(monthPrefix) },
      { id: "cancelled", label: "⊘ ยกเลิก",       filter: (r: Record<string, unknown>) => r.status === "cancelled" },
    ];
  }, [user?.name]);

  // F14 fix: early return หลัง hooks ทั้งหมด (กัน React #310)
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🧾 Sales Orders</h1>
            <p className="text-sm text-slate-500 mt-0.5">ใบสั่งขาย — workflow: draft → confirmed → ready → shipped → completed</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ สร้าง SO
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="sales-orders"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["so_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลข SO / ลูกค้า..."
          exportFilename="sales-orders"
          exportEntityType="erp_playground_so"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Detail Drawer */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `SO ${detail.so_number ?? "(ร่าง)"} · ${detail.customer_name}` : "SO Detail"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            {detail.so_number && (
              <a href={`/print/sales-order/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">
                🧾 ใบเสร็จ/ใบกำกับภาษี
              </a>
            )}
            {detail.status === "draft" && (
              <>
                <button onClick={() => openEdit(detail)}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
                {canConfirm && (
                  <button onClick={() => transition(detail.id, "confirm")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">✓ ยืนยัน</button>
                )}
              </>
            )}
            {detail.status === "confirmed" && canShip && (
              <>
                <button onClick={() => transition(detail.id, "start_production")} disabled={wfLoading}
                  className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">🏭 เริ่มผลิต</button>
                <button onClick={() => transition(detail.id, "ship")} disabled={wfLoading}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">📦 จัดส่งเลย</button>
              </>
            )}
            {detail.status === "in_production" && (
              <button onClick={() => transition(detail.id, "mark_ready")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">✓ พร้อมส่ง</button>
            )}
            {detail.status === "ready" && canShip && (
              <button onClick={() => transition(detail.id, "ship")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">📦 จัดส่ง</button>
            )}
            {detail.status === "shipped" && canComplete && (
              <button onClick={() => transition(detail.id, "complete")} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ ปิด SO</button>
            )}
            {(detail.status === "draft" || detail.status === "confirmed") && canCancel && (
              <button onClick={() => setCancelTarget(detail)} disabled={wfLoading}
                className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="h-64 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="เลขที่ใบกำกับภาษี" value={detail.tax_invoice_no} />
              <Info label="คลังต้นทาง" value={(detail as unknown as { from_warehouse_code?: string; from_warehouse_name?: string }).from_warehouse_name ?? "—"} />
              <Info label="เซลส์" value={detail.sale_person_name} />
              <Info label="วันที่สั่ง" value={formatDate(detail.order_date)} />
            </div>
            {((detail as unknown as { stock_reserved?: boolean }).stock_reserved
              || (detail as unknown as { stock_shipped?: boolean }).stock_shipped) && (
              <div className="flex gap-2 text-xs">
                {(detail as unknown as { stock_reserved?: boolean }).stock_reserved && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">📌 จอง stock แล้ว</span>
                )}
                {(detail as unknown as { stock_shipped?: boolean }).stock_shipped && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">📦 ตัด stock แล้ว</span>
                )}
              </div>
            )}

            <SOLineEditor lines={detail.lines.map(l => ({
              tempId: l.id ?? "",
              product_id: l.product_id ?? null, sku: l.sku ?? null,
              product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
              discount_type: l.discount_type ?? "percent",
              discount_value: l.discount_value ?? 0,
              tax_code: l.tax_code ?? null,
            }))} onChange={() => {}} readonly layout="table" />

            {/* Totals */}
            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-x-6">
              <Row label="จำนวนรวมสินค้า"
                value={`${detail.lines.reduce((s, l) => s + Number(l.qty || 0), 0).toLocaleString("th-TH")}${
                  new Set(detail.lines.map(l => l.unit)).size === 1 && detail.lines[0]?.unit ? ` ${detail.lines[0].unit}` : ""
                } · ${detail.lines.length} รายการ`} bold />
              <Row label="Subtotal"               value={baht(detail.subtotal)} />
              <Row label="ลด line"                value={baht(detail.total_line_discount)} />
              <Row label="ลดท้ายบิล"             value={baht(detail.total_header_discount)} />
              <Row label="ค่าจัดส่ง"             value={baht(detail.total_shipping)} />
              <Row label="ฐานภาษี"               value={baht(detail.taxable)} bold />
              <Row label={`VAT (${detail.vat_rate}%${detail.vat_included ? " inc" : ""})`} value={baht(detail.total_vat)} />
              <Row label="WHT" value={baht(detail.total_wht)} />
              <Row label="รวมทั้งสิ้น" value={baht(detail.grand_total)} bold primary />
              <Row label="ลูกค้าจ่ายจริง" value={baht(detail.amount_due)} bold emerald />
            </div>

            {detail.note && (
              <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-300 text-sm text-amber-900">
                <strong>หมายเหตุ:</strong> {detail.note}
              </div>
            )}
            {detail.reject_reason && (
              <div className="px-3 py-2 bg-red-50 border-l-4 border-red-300 text-sm text-red-900">
                <strong>เหตุผลยกเลิก:</strong> {detail.reject_reason}
              </div>
            )}

            {/* Attachments (ของกลาง N) */}
            <div className="border-t border-slate-100 pt-4">
              <AttachmentPanel entityType="erp_playground_so" entityId={detail.id} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* Create / Edit modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        hasUnsavedChanges={formDirty && !saving}
        title={editingId ? "แก้ไข SO" : "สร้าง SO ใหม่"}
        description="กรอกข้อมูลลูกค้า เลือกสินค้า แล้วระบบจะคำนวณภาษีและยอดรวมให้อัตโนมัติ"
        footer={
          <>
            <div className="mr-auto flex items-baseline gap-2">
              <span className="text-xs text-slate-500">ยอดรวมทั้งสิ้น</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-700">
                {formatMoney(previewTotals.grand_total)}
              </span>
            </div>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้าง SO"}
            </button>
          </>
        }>
        <div className="space-y-3">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          {/* ลัด: ดึงจากเอกสารต้นทาง (เฉพาะตอนสร้างใหม่) */}
          {!editingId && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">เริ่มจากเอกสารเดิม:</span>
              <button type="button" disabled={pulling} onClick={() => setPickerMode("quotation")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                📋 ดึงจากใบเสนอราคา
              </button>
              <button type="button" disabled={pulling} onClick={() => setPickerMode("mo")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                🏭 ดึงจากใบสั่งผลิต
              </button>
              {pulling && <span className="text-xs text-slate-400">กำลังดึง...</span>}
              {pulledQuotes.length > 0 && (
                <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-blue-100 pt-2">
                  <span className="text-[11px] text-slate-500">จะปิดเป็น &quot;ผ่าน&quot; เมื่อบันทึก:</span>
                  {pulledQuotes.map(q => (
                    <span key={q.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      ✓ {q.label}
                    </span>
                  ))}
                  <button type="button" onClick={() => setPulledQuotes([])}
                    className="ml-1 text-[11px] text-slate-400 underline hover:text-slate-600">ยกเลิกการผูก</button>
                </div>
              )}
            </div>
          )}

          {/* 1) ข้อมูลเอกสาร */}
          <SectionCard step={1} title="ข้อมูลเอกสาร" subtitle="ลูกค้าและรายละเอียดการสั่งซื้อ">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2">
              <div className="md:col-span-2">
                <FieldLabel required>ลูกค้า</FieldLabel>
                <div className="mt-0.5">
                  <CustomerPicker value={form.customer} onChange={(v) => setForm({ ...form, customer: v })} />
                </div>
                {form.customer && (
                  <RecordPeekLink
                    moduleKey="partners-v2"
                    recordId={form.customer.id}
                    label={form.customer.code ? `${form.customer.code} - ${form.customer.name}` : form.customer.name}
                  />
                )}
              </div>
              <div>
                <FieldLabel hint="ไม่บังคับ">เซลส์ผู้ดูแล</FieldLabel>
                <div className="mt-0.5">
                  <EmployeePicker
                    value={form.sale_person_name ? { id: "", code: null, name: form.sale_person_name } as EmployeePickerValue : null}
                    onChange={(v: EmployeePickerValue | null) => setForm({ ...form, sale_person_name: v?.name ?? "" })}
                  />
                </div>
              </div>
              <div>
                <FieldLabel hint="ใช้ตัดสต๊อก">คลังต้นทาง</FieldLabel>
                <div className="mt-0.5">
                  <WarehousePicker value={form.warehouse} onChange={(v) => setForm({ ...form, warehouse: v })} />
                </div>
              </div>
              <div>
                <FieldLabel>วันที่สั่ง</FieldLabel>
                <div className="mt-0.5">
                  <DateInput value={form.order_date} onChange={(iso) => setForm({ ...form, order_date: iso })} />
                </div>
              </div>
              <div>
                <FieldLabel hint="ไม่บังคับ">วันที่ส่งคาด</FieldLabel>
                <div className="mt-0.5">
                  <DateInput value={form.expected_ship_date} onChange={(iso) => setForm({ ...form, expected_ship_date: iso })} />
                </div>
              </div>
              <div>
                <FieldLabel hint="ไม่บังคับ">เลขที่ใบสั่งซื้อลูกค้า (PO No)</FieldLabel>
                <input value={form.customer_po_no} onChange={e => setForm({ ...form, customer_po_no: e.target.value })}
                  placeholder="เลข PO ของลูกค้า (ถ้ามี)"
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              <div>
                <FieldLabel hint="ไม่บังคับ">กำหนดชำระเงิน</FieldLabel>
                <input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })}
                  placeholder="เช่น เงินสด, เครดิต 30 วัน"
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              <div>
                <FieldLabel hint="เว้นว่าง = ออกอัตโนมัติ">เลขที่ใบกำกับภาษี</FieldLabel>
                <input value={form.tax_invoice_no} onChange={e => setForm({ ...form, tax_invoice_no: e.target.value })}
                  placeholder="เว้นว่างให้ระบบออกให้ (ISG{พ.ศ.}-{เดือน}-NNN)"
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
            </div>
          </SectionCard>

          {/* 2) รายการสินค้า (ของกลาง — โหมดตาราง) */}
          <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} layout="table" onSaveMasterName={saveMasterName} />

          {/* 3) ภาษีและส่วนลด */}
          <SectionCard step={3} title="ภาษีและส่วนลด" subtitle="ตั้งค่า VAT, หัก ณ ที่จ่าย, ค่าจัดส่ง และส่วนลดท้ายบิล">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3">
              <div>
                <FieldLabel>ฐานราคา VAT</FieldLabel>
                <div className="mt-0.5 inline-flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                  {[
                    { v: false, label: "ราคายังไม่รวม" },
                    { v: true, label: "ราคารวม VAT" },
                  ].map((opt) => (
                    <button key={String(opt.v)} type="button"
                      onClick={() => setForm({ ...form, vat_included: opt.v })}
                      className={`flex-1 rounded-md font-medium transition ${
                        form.vat_included === opt.v ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <NumField label="VAT" suffix="%" value={form.vat_rate}
                onChange={(n) => setForm({ ...form, vat_rate: n })} />
              <NumField label="หัก ณ ที่จ่าย (WHT)" suffix="%" value={form.wht_rate}
                onChange={(n) => setForm({ ...form, wht_rate: n })} />
              <NumField label="ค่าจัดส่ง" prefix="฿" value={form.shipping_fee}
                onChange={(n) => setForm({ ...form, shipping_fee: n })} />
              <div className="col-span-2 md:col-span-1">
                <FieldLabel>ส่วนลดท้ายบิล</FieldLabel>
                <div className="mt-0.5 flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                  <input type="number" value={form.header_discount_value}
                    onChange={e => setForm({ ...form, header_discount_value: parseFloat(e.target.value) || 0 })}
                    className="h-9 w-full bg-transparent px-3 text-right text-sm tabular-nums outline-none" />
                  <select value={form.header_discount_type}
                    onChange={e => setForm({ ...form, header_discount_type: e.target.value as "percent" | "amount" })}
                    className="h-9 shrink-0 border-l border-slate-200 bg-slate-50 px-2 text-sm outline-none rounded-r-lg">
                    <option value="percent">%</option><option value="amount">฿</option>
                  </select>
                </div>
              </div>
              <label className="col-span-2 block md:col-span-3">
                <FieldLabel hint="ไม่บังคับ">หมายเหตุ</FieldLabel>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="เงื่อนไขการชำระเงิน, ที่อยู่จัดส่ง ฯลฯ"
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </label>
            </div>
          </SectionCard>

          {/* 4) สรุปยอด (ของกลาง) — ล็อกค้างล่างสุดของ popup */}
          <div className="sticky bottom-0 z-10 -mx-1 bg-white/95 pt-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <SalesTotalsPreview result={previewTotals} />
          </div>
        </div>
      </ERPModal>

      {/* ตัวเลือกเอกสารต้นทาง (ของกลาง) */}
      {pickerMode && (
        <SourceDocPickerModal
          open={pickerMode !== null}
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onConfirm={handlePicked}
        />
      )}

      {/* Cancel confirm */}
      <ERPModal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} size="md"
        title="ยกเลิก SO"
        footer={
          <>
            <button onClick={() => setCancelTarget(null)} disabled={wfLoading}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับ</button>
            <button onClick={() => cancelTarget && transition(cancelTarget.id, "cancel", cancelReason)}
              disabled={wfLoading || (cancelTarget?.status === "confirmed" && !cancelReason.trim())}
              className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              ยืนยันยกเลิก
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ต้องการยกเลิก SO &quot;{cancelTarget?.so_number ?? "ร่าง"}&quot; ใช่ไหม?</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">
              เหตุผล {cancelTarget?.status === "confirmed" && <span className="text-red-500">*</span>}
            </span>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
              placeholder="(จำเป็นเมื่อยกเลิก SO ที่ confirm แล้ว)"
              className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>
      </ERPModal>
    </PlaygroundShell>
  );
}

// ---- helpers ----
function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}
function Row({ label, value, bold, primary, emerald }: { label: string; value: string; bold?: boolean; primary?: boolean; emerald?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className={`text-xs ${primary ? "text-blue-700" : emerald ? "text-emerald-700" : "text-slate-600"}`}>{label}</span>
      <span className={`tabular-nums font-mono text-xs ${primary ? "text-lg text-blue-700" : emerald ? "text-emerald-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

// ---- form section helpers (สไตล์การ์ดมาตรฐานเดียวกันทุกหมวด) ----
function SectionCard({ step, title, subtitle, children }: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
          {step}
        </span>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <span className="text-[11px] text-slate-400">· {subtitle}</span>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <span className="text-xs font-medium text-slate-600">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
      {hint && <span className="ml-1 font-normal text-slate-400">({hint})</span>}
    </span>
  );
}

function NumField({ label, value, onChange, prefix, suffix }: {
  label: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-0.5 flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
        {prefix && <span className="pl-3 text-sm text-slate-400">{prefix}</span>}
        <input type="number" value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="h-9 w-full bg-transparent px-3 text-right text-sm tabular-nums outline-none" />
        {suffix && <span className="pr-3 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}
