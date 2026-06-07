"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { AttachmentPanel } from "@/components/attachment-panel";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, EmployeePicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue, EmployeePickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ColumnDef } from "@tanstack/react-table";
import type { QuoteListItem, QuoteDetail, QuoteLine } from "@/app/api/quotations/route";
import { SOLineEditor, SalesLineCompactTable, SalesTotalsPreview, calculateEditorTotals, emptyLine, type EditorLine } from "@/components/sales-line-items";

// ---- helpers ----

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", sent: "ส่งแล้ว", accepted: "ตอบรับแล้ว", converted: "แปลงเป็น SO แล้ว",
  rejected: "ปฏิเสธ", expired: "หมดอายุ", cancelled: "ยกเลิก",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", sent: "bg-amber-100 text-amber-700",
  accepted: "bg-blue-100 text-blue-700", converted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700", expired: "bg-slate-200 text-slate-500",
  cancelled: "bg-red-50 text-red-500",
};

const addDays = (iso: string, days: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ---- Form state ----

type FormState = {
  customer: CustomerPickerValue | null;
  sale_person_name: string;
  quote_date: string;
  valid_until: string;
  vat_rate: number;
  vat_included: boolean;
  wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  lines: EditorLine[];
};

type QuoteLineView = QuoteLine & {
  image_url?: string | null;
  image_key?: string | null;
};

type QuoteDetailView = Omit<QuoteDetail, "lines"> & {
  lines: QuoteLineView[];
};

type SkuPickerItem = {
  code?: string | null;
  image_url?: string | null;
  image_key?: string | null;
};

const makeEmpty = (salePersonName = ""): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customer: null, sale_person_name: salePersonName,
    quote_date: today, valid_until: addDays(today, 30),
    vat_rate: 7, vat_included: false, wht_rate: 0,
    header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
    note: "", lines: [emptyLine()],
  };
};

const quoteLinesToEditor = (lines: QuoteLineView[]): EditorLine[] => lines.map((l, index) => ({
  tempId: l.id ?? `${l.sku ?? "line"}-${index}`,
  product_id: l.product_id ?? null,
  sku: l.sku ?? null,
  product_name: l.product_name,
  image_url: l.image_url ?? null,
  image_key: l.image_key ?? null,
  qty: l.qty,
  unit: l.unit,
  unit_price: l.unit_price,
  discount_type: l.discount_type ?? "percent",
  discount_value: l.discount_value ?? 0,
  tax_code: l.tax_code ?? null,
  note: l.note ?? "",
}));

// ============================================================
// Page
// ============================================================

export default function QuotationsPage() {
  const canView   = usePermission("qt.view");
  const canCreate = usePermission("qt.create");
  const canSend   = usePermission("qt.send");
  const canAccept = usePermission("qt.accept");
  const canReject = usePermission("qt.reject");
  const canCancel = usePermission("qt.cancel");
  const { user, can } = useAuth();

  const [rows,    setRows]    = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<FormState>(makeEmpty);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  // detail drawer
  const [detail,        setDetail]        = useState<QuoteDetailView | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Record<string, QuoteDetailView>>({});
  const [expandedLoading, setExpandedLoading] = useState<Record<string, boolean>>({});
  const [visibleRows, setVisibleRows] = useState<QuoteListItem[]>([]);

  // workflow
  const [wfLoading, setWfLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<QuoteDetailView | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  // ---- Fetch ----
  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/quotations?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRows(json.data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  const enrichQuoteDetail = useCallback(async (q: QuoteDetail): Promise<QuoteDetailView> => {
    const skuCodes = Array.from(new Set(q.lines.map(l => l.sku).filter(Boolean))) as string[];
    const imageBySku = new Map<string, Pick<QuoteLineView, "image_url" | "image_key">>();

    await Promise.all(skuCodes.map(async (code) => {
      const params = new URLSearchParams({ search: code, limit: "8", sales_only: "false" });
      const res = await apiFetch(`/api/pickers/skus?${params.toString()}`);
      const json = await res.json().catch(() => ({ data: [] }));
      const items = (json.data ?? []) as SkuPickerItem[];
      const match = items.find(item => item.code === code) ?? items[0];
      if (match) {
        imageBySku.set(code, {
          image_url: match.image_url ?? null,
          image_key: match.image_key ?? null,
        });
      }
    }));

    return {
      ...q,
      lines: q.lines.map(line => ({
        ...line,
        ...(line.sku ? imageBySku.get(line.sku) : undefined),
      })),
    };
  }, []);

  const fetchDetail = useCallback(async (id: string): Promise<QuoteDetailView> => {
    const res = await apiFetch(`/api/quotations/${id}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return enrichQuoteDetail(json.data as QuoteDetail);
  }, [enrichQuoteDetail]);

  // ---- Open detail ----
  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    try {
      const loaded = expandedDetails[id] ?? await fetchDetail(id);
      setExpandedDetails(prev => ({ ...prev, [id]: loaded }));
      setDetail(loaded);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดไม่ได้");
      setDetailOpen(false);
    } finally { setDetailLoading(false); }
  };

  // ---- Open edit (draft only) ----
  const openEdit = (q: QuoteDetailView) => {
    setEditingId(q.id);
    setForm({
      customer: q.customer_id ? {
        id: q.customer_id, code: q.customer_code, name: q.customer_name ?? "",
      } as CustomerPickerValue : null,
      sale_person_name: q.sale_person_name ?? "",
      quote_date: q.quote_date,
      valid_until: q.valid_until ?? addDays(q.quote_date, 30),
      vat_rate: q.vat_rate, vat_included: q.vat_included, wht_rate: q.wht_rate,
      header_discount_type: q.header_discount_type, header_discount_value: q.header_discount_value,
      shipping_fee: q.shipping_fee,
      note: q.note ?? "",
      lines: quoteLinesToEditor(q.lines),
    });
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null); setForm(makeEmpty(user?.name ?? "")); setFormErr(null); setModalOpen(true);
  };

  const openPrint = useCallback((id: string) => {
    window.open(`/print/quotation/${id}`, "_blank", "noopener,noreferrer");
  }, []);

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
        sale_person_name: form.sale_person_name || null,
        quote_date: form.quote_date,
        valid_until: form.valid_until || null,
        vat_rate: form.vat_rate, vat_included: form.vat_included, wht_rate: form.wht_rate,
        header_discount_type: form.header_discount_type,
        header_discount_value: form.header_discount_value,
        shipping_fee: form.shipping_fee,
        note: form.note || null,
      };
      const lines = form.lines.map(l => ({
        product_id: l.product_id, sku: l.sku, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type, discount_value: l.discount_value,
        tax_code: l.tax_code, note: l.note,
      }));
      const url = editingId ? `/api/quotations/${editingId}` : "/api/quotations";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใบเสนอราคาใหม่");
      setModalOpen(false);
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- Transition ----
  const runTransitionRequest = useCallback(async (id: string, action: string, reason?: string) => {
    const res = await apiFetch(`/api/quotations/${id}/transition`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, actor: user?.name, reason }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
  }, [user?.name]);

  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      await runTransitionRequest(id, action, reason);
      flash({
        send: "ส่งใบเสนอราคาแล้ว", accept: "บันทึกว่าลูกค้าตอบรับ",
        reject: "ปฏิเสธแล้ว", expire: "ทำเครื่องหมายหมดอายุ", cancel: "ยกเลิกแล้ว",
      }[action] ?? "อัปเดตแล้ว");
      setDetailOpen(false); setRejectTarget(null); setRejectReason("");
      setExpandedDetails(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  // ---- Convert to SO ----
  const convertToSO = async (id: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/quotations/${id}/convert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("แปลงเป็นใบสั่งขายแล้ว — เปิดหน้า 'ใบขาย (SO)' เพื่อดูต่อ");
      setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "แปลงไม่สำเร็จ"); }
    finally { setWfLoading(false); }
  };

  const loadExpandedDetail = useCallback(async (id: string) => {
    if (expandedDetails[id] || expandedLoading[id]) return;
    setExpandedLoading(prev => ({ ...prev, [id]: true }));
    try {
      const loaded = await fetchDetail(id);
      setExpandedDetails(prev => ({ ...prev, [id]: loaded }));
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดรายการสินค้าไม่ได้");
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setExpandedLoading(prev => ({ ...prev, [id]: false }));
    }
  }, [expandedDetails, expandedLoading, fetchDetail]);

  const toggleExpanded = useCallback((row: QuoteListItem) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else {
        next.add(row.id);
        void loadExpandedDetail(row.id);
      }
      return next;
    });
  }, [loadExpandedDetail]);

  const showAllExpanded = useCallback(() => {
    const targetRows = visibleRows.length > 0 ? visibleRows : rows.slice(0, 20);
    setExpandedIds(new Set(targetRows.map(row => row.id)));
    targetRows.forEach(row => void loadExpandedDetail(row.id));
  }, [loadExpandedDetail, rows, visibleRows]);

  const collapseAllExpanded = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const openEditFromRow = useCallback(async (row: QuoteListItem) => {
    try {
      const loaded = expandedDetails[row.id] ?? await fetchDetail(row.id);
      setExpandedDetails(prev => ({ ...prev, [row.id]: loaded }));
      openEdit(loaded);
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดเพื่อแก้ไขไม่ได้");
    }
  }, [expandedDetails, fetchDetail]);

  const rejectFromRow = useCallback(async (row: QuoteListItem) => {
    try {
      const loaded = expandedDetails[row.id] ?? await fetchDetail(row.id);
      setExpandedDetails(prev => ({ ...prev, [row.id]: loaded }));
      setRejectTarget(loaded);
      setRejectReason("");
    } catch (err) {
      flash(err instanceof Error ? err.message : "โหลดเพื่อปฏิเสธไม่ได้");
    }
  }, [expandedDetails, fetchDetail]);

  const bulkTransition = useCallback(async (selectedRows: QuoteListItem[], action: "send" | "cancel") => {
    const allowed = selectedRows.filter(row => (
      action === "send" ? row.status === "draft" : ["draft", "sent"].includes(row.status)
    ));
    if (allowed.length === 0) {
      flash("ไม่มีรายการที่ทำรายการนี้ได้");
      return;
    }

    setWfLoading(true);
    let ok = 0;
    let fail = 0;
    for (const row of allowed) {
      try {
        await runTransitionRequest(row.id, action);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setWfLoading(false);
    flash(`อัปเดต ${ok} รายการ${fail ? `, ไม่สำเร็จ ${fail}` : ""}`);
    setExpandedDetails(prev => {
      const next = { ...prev };
      allowed.forEach(row => delete next[row.id]);
      return next;
    });
    await fetchList();
  }, [fetchList, runTransitionRequest]);

  const rowActions = useMemo(() => [
    { label: "ดูรายละเอียด", onClick: (row: QuoteListItem) => openDetail(row.id) },
    { label: "พิมพ์ใบเสนอราคา", onClick: (row: QuoteListItem) => openPrint(row.id) },
    { label: "เปิด/พับรายการสินค้า", onClick: (row: QuoteListItem) => toggleExpanded(row) },
    { label: "แก้ไข", show: (row: QuoteListItem) => row.status === "draft", onClick: (row: QuoteListItem) => openEditFromRow(row) },
    { label: "ส่งให้ลูกค้า", show: (row: QuoteListItem) => row.status === "draft" && canSend, onClick: (row: QuoteListItem) => transition(row.id, "send") },
    { label: "ลูกค้าตอบรับ", show: (row: QuoteListItem) => row.status === "sent" && canAccept, onClick: (row: QuoteListItem) => transition(row.id, "accept") },
    { label: "แปลงเป็น SO", show: (row: QuoteListItem) => ["sent", "accepted"].includes(row.status) && canAccept, onClick: (row: QuoteListItem) => convertToSO(row.id) },
    { label: "ปฏิเสธ", show: (row: QuoteListItem) => row.status === "sent" && canReject, onClick: (row: QuoteListItem) => rejectFromRow(row) },
    { label: "ยกเลิก", variant: "danger" as const, show: (row: QuoteListItem) => ["draft", "sent"].includes(row.status) && canCancel, onClick: (row: QuoteListItem) => transition(row.id, "cancel") },
  ], [canAccept, canCancel, canReject, canSend, openEditFromRow, openPrint, rejectFromRow, toggleExpanded]);

  const bulkActions = useMemo(() => [
    { label: "ส่งที่เลือก", onClick: (selectedRows: QuoteListItem[]) => bulkTransition(selectedRows, "send") },
    { label: "ยกเลิกที่เลือก", variant: "danger" as const, onClick: (selectedRows: QuoteListItem[]) => bulkTransition(selectedRows, "cancel") },
  ], [bulkTransition]);

  // ---- Columns ----
  const columns: ColumnDef<QuoteListItem>[] = useMemo(() => [
    {
      id: "expand",
      header: "",
      size: 44,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const expanded = expandedIds.has(row.original.id);
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(row.original);
            }}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            aria-label={expanded ? "พับรายการสินค้า" : "เปิดรายการสินค้า"}
          >
            {expanded ? "⌄" : "›"}
          </button>
        );
      },
    },
    {
      id: "quote_number", accessorKey: "quote_number", header: "เลขที่ใบเสนอราคา", size: 150,
      cell: ({ getValue }) => {
        const n = getValue() as string | null;
        return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>;
      },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 220 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 130,
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>;
      },
    },
    {
      id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-right block">{baht(getValue() as number)}</span>,
    },
    { id: "sale_person_name", accessorKey: "sale_person_name", header: "เซลส์", size: 130 },
    {
      id: "quote_date", accessorKey: "quote_date", header: "วันที่เสนอ", size: 110,
      cell: ({ getValue }) => <span>{formatDate(getValue())}</span>,
    },
    {
      id: "valid_until", accessorKey: "valid_until", header: "ยืนราคาถึง", size: 110,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-slate-300">—</span>;
        const expired = v < new Date().toISOString().slice(0, 10);
        return <span className={expired ? "text-red-500" : "text-slate-600"}>{formatDate(v)}{expired ? " ⚠" : ""}</span>;
      },
    },
    {
      id: "line_count", accessorKey: "line_count", header: "รายการ", size: 70,
      cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span>,
    },
  ], [expandedIds, toggleExpanded]);

  // ---- Saved Views (ของกลาง §14) ----
  const views = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const myName = user?.name ?? "";
    return [
      { id: "all",       label: "ทั้งหมด" },
      { id: "mine",      label: "👤 ของฉัน",     filter: (r: Record<string, unknown>) => String(r.sale_person_name ?? "") === myName },
      { id: "draft",     label: "📝 ร่าง",        filter: (r: Record<string, unknown>) => r.status === "draft" },
      { id: "sent",      label: "📤 ส่งแล้ว",     filter: (r: Record<string, unknown>) => r.status === "sent" },
      { id: "accepted",  label: "👍 ตอบรับแล้ว",  filter: (r: Record<string, unknown>) => r.status === "accepted" },
      { id: "converted", label: "✅ แปลงเป็น SO",  filter: (r: Record<string, unknown>) => r.status === "converted" },
      { id: "rejected",  label: "❌ ปฏิเสธ",      filter: (r: Record<string, unknown>) => r.status === "rejected" },
      { id: "expired",   label: "⏰ หมดอายุ",     filter: (r: Record<string, unknown>) => r.status === "expired" },
      { id: "month",     label: "🗓 เดือนนี้",    filter: (r: Record<string, unknown>) => String(r.quote_date ?? "").startsWith(monthPrefix) },
    ];
  }, [user?.name]);

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

  // early return หลัง hooks ทั้งหมด
  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📄 ใบเสนอราคา (Quotation)</h1>
            <p className="text-sm text-slate-500 mt-0.5">ร่าง → ส่ง → ตอบรับ → แปลงเป็นใบสั่งขาย / ปฏิเสธ / หมดอายุ</p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ สร้างใบเสนอราคา
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <div className="mb-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={showAllExpanded}
            className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50"
          >
            โชว์รายการทั้งหมดในหน้านี้
          </button>
          <button
            type="button"
            onClick={collapseAllExpanded}
            className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50"
          >
            พับทั้งหมด
          </button>
        </div>

        <DataTable
          tableId="quotations"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["quote_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า..."
          exportFilename="quotations"
          exportEntityType="erp_playground_quote"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
          pageSize={20}
          selectable
          rowActions={rowActions}
          bulkActions={bulkActions}
          onVisibleRowsChange={setVisibleRows}
          onRowClick={toggleExpanded}
          isRowExpanded={(row) => expandedIds.has(row.id)}
          renderExpandedRow={(row) => (
            <QuoteExpandedPanel
              quote={row}
              detail={expandedDetails[row.id]}
              loading={!!expandedLoading[row.id]}
              wfLoading={wfLoading}
              canSend={canSend}
              canAccept={canAccept}
              canReject={canReject}
              canCancel={canCancel}
              onOpenDetail={() => openDetail(row.id)}
              onPrint={() => openPrint(row.id)}
              onEdit={() => openEditFromRow(row)}
              onSend={() => transition(row.id, "send")}
              onAccept={() => transition(row.id, "accept")}
              onConvert={() => convertToSO(row.id)}
              onReject={() => rejectFromRow(row)}
              onCancel={() => transition(row.id, "cancel")}
            />
          )}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm z-50">✓ {toast}</div>}
      </div>

      {/* Detail Drawer */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบเสนอราคา ${detail.quote_number ?? "(ร่าง)"} · ${detail.customer_name}` : "Quotation Detail"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            <button onClick={() => openPrint(detail.id)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">พิมพ์</button>

            {detail.status === "draft" && (
              <>
                <button onClick={() => openEdit(detail)}
                  className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
                {canSend && (
                  <button onClick={() => transition(detail.id, "send")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">📤 ส่งใบเสนอราคา</button>
                )}
                {canCancel && (
                  <button onClick={() => transition(detail.id, "cancel")} disabled={wfLoading}
                    className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
                )}
              </>
            )}

            {detail.status === "sent" && (
              <>
                {canAccept && (
                  <button onClick={() => transition(detail.id, "accept")} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">👍 ลูกค้าตอบรับ</button>
                )}
                {canAccept && (
                  <button onClick={() => convertToSO(detail.id)} disabled={wfLoading}
                    className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🧾 แปลงเป็นใบสั่งขาย</button>
                )}
                {canReject && (
                  <button onClick={() => { setRejectTarget(detail); setRejectReason(""); }} disabled={wfLoading}
                    className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">✗ ปฏิเสธ</button>
                )}
              </>
            )}

            {detail.status === "accepted" && canAccept && (
              <button onClick={() => convertToSO(detail.id)} disabled={wfLoading}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">🧾 แปลงเป็นใบสั่งขาย</button>
            )}

            {detail.status === "converted" && (
              <a href="/sales-orders"
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center">→ ไปหน้าใบสั่งขาย</a>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="h-64 bg-slate-100 animate-pulse rounded" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="เซลส์" value={detail.sale_person_name} />
              <Info label="วันที่เสนอ" value={formatDate(detail.quote_date)} />
              <Info label="ยืนราคาถึง" value={formatDate(detail.valid_until)} />
            </div>

            {detail.status === "converted" && detail.converted_so_id && (
              <div className="px-3 py-2 bg-emerald-50 border-l-4 border-emerald-300 text-sm text-emerald-900">
                ✅ ใบเสนอราคานี้แปลงเป็นใบสั่งขายแล้ว — ดูต่อที่หน้า <strong>ใบขาย (SO)</strong>
              </div>
            )}

            <SOLineEditor lines={quoteLinesToEditor(detail.lines)} onChange={() => {}} readonly />

            {/* Totals */}
            <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-x-6">
              <Row label="Subtotal"   value={baht(detail.subtotal)} />
              <Row label="ลด line"    value={baht(detail.total_line_discount)} />
              <Row label="ลดท้ายบิล"  value={baht(detail.total_header_discount)} />
              <Row label="ค่าจัดส่ง"  value={baht(detail.total_shipping)} />
              <Row label="ฐานภาษี"    value={baht(detail.taxable)} bold />
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
                <strong>เหตุผลปฏิเสธ:</strong> {detail.reject_reason}
              </div>
            )}

            {/* Attachments (ของกลาง) */}
            <div className="border-t border-slate-100 pt-4">
              <AttachmentPanel entityType="erp_playground_quote" entityId={detail.id} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* Create / Edit modal */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ใบเสนอราคา" : "สร้างใบเสนอราคาใหม่"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "..." : "บันทึก"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-medium text-slate-600">ลูกค้า *</span>
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
              <span className="text-xs font-medium text-slate-600">เซลส์ <span className="text-slate-400">(พนักงาน — ไม่บังคับ)</span></span>
              <div className="mt-0.5">
                <EmployeePicker
                  value={form.sale_person_name ? { id: "", code: null, name: form.sale_person_name } as EmployeePickerValue : null}
                  onChange={(v: EmployeePickerValue | null) => setForm({ ...form, sale_person_name: v?.name ?? "" })}
                />
              </div>
              {user?.name && (
                <p className="mt-1 text-[11px] text-slate-400">
                  ค่าเริ่มต้นคือ user ที่ login: {user.name}
                </p>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่เสนอราคา</span>
              <div className="mt-0.5">
                <DateInput value={form.quote_date} onChange={(iso) => setForm({ ...form, quote_date: iso })} />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">ยืนราคาถึงวันที่ <span className="text-slate-400">(default 30 วัน)</span></span>
              <div className="mt-0.5">
                <DateInput value={form.valid_until} onChange={(iso) => setForm({ ...form, valid_until: iso })} />
              </div>
            </div>
          </div>

          <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />

          <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">VAT %</span>
              <input type="number" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">รวม VAT</span>
              <div className="h-8 mt-0.5 flex items-center">
                <input type="checkbox" checked={form.vat_included} onChange={e => setForm({ ...form, vat_included: e.target.checked })}
                  className="rounded border-slate-300" />
                <span className="ml-2 text-xs">{form.vat_included ? "Included" : "Excluded"}</span>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">WHT %</span>
              <input type="number" value={form.wht_rate} onChange={e => setForm({ ...form, wht_rate: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ค่าจัดส่ง</span>
              <input type="number" value={form.shipping_fee} onChange={e => setForm({ ...form, shipping_fee: parseFloat(e.target.value) || 0 })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
            <div className="block col-span-2">
              <span className="text-xs font-medium text-slate-600">ส่วนลดท้ายบิล</span>
              <div className="flex gap-1 mt-0.5">
                <input type="number" value={form.header_discount_value}
                  onChange={e => setForm({ ...form, header_discount_value: parseFloat(e.target.value) || 0 })}
                  className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded" />
                <select value={form.header_discount_type}
                  onChange={e => setForm({ ...form, header_discount_type: e.target.value as "percent" | "amount" })}
                  className="w-16 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                  <option value="percent">%</option><option value="amount">฿</option>
                </select>
              </div>
            </div>
            <label className="block col-span-2">
              <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
            </label>
          </div>

          <SalesTotalsPreview result={previewTotals} />
        </div>
      </ERPModal>

      {/* Reject confirm */}
      <ERPModal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} size="md"
        title="ปฏิเสธใบเสนอราคา"
        footer={
          <>
            <button onClick={() => setRejectTarget(null)} disabled={wfLoading}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับ</button>
            <button onClick={() => rejectTarget && transition(rejectTarget.id, "reject", rejectReason)}
              disabled={wfLoading || !rejectReason.trim()}
              className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              ยืนยันปฏิเสธ
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">ปฏิเสธใบเสนอราคา &quot;{rejectTarget?.quote_number ?? "ร่าง"}&quot; ใช่ไหม?</p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">เหตุผล <span className="text-red-500">*</span></span>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
              placeholder="ระบุเหตุผลที่ปฏิเสธ"
              className="w-full mt-0.5 px-3 py-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>
      </ERPModal>
    </PlaygroundShell>
  );
}

// ---- helpers ----
function QuoteExpandedPanel({
  quote,
  detail,
  loading,
  wfLoading,
  canSend,
  canAccept,
  canReject,
  canCancel,
  onOpenDetail,
  onPrint,
  onEdit,
  onSend,
  onAccept,
  onConvert,
  onReject,
  onCancel,
}: {
  quote: QuoteListItem;
  detail?: QuoteDetailView;
  loading: boolean;
  wfLoading: boolean;
  canSend: boolean;
  canAccept: boolean;
  canReject: boolean;
  canCancel: boolean;
  onOpenDetail: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onSend: () => void;
  onAccept: () => void;
  onConvert: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  if (loading || !detail) {
    return (
      <div className="px-6 py-4 border-t border-slate-100">
        <div className="h-20 rounded-lg bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-t border-slate-100">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              รายการสินค้าใน {quote.quote_number ?? "ใบเสนอราคาฉบับร่าง"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {detail.customer_name ?? "-"} · {detail.lines.length} รายการ · รวม {baht(detail.grand_total)}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onOpenDetail}
              className="h-8 px-3 text-xs border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
              ดู
            </button>
            <button type="button" onClick={onPrint}
              className="h-8 px-3 text-xs border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
              พิมพ์
            </button>
            {detail.status === "draft" && (
              <button type="button" onClick={onEdit}
                className="h-8 px-3 text-xs border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
                แก้ไข
              </button>
            )}
            {detail.status === "draft" && canSend && (
              <button type="button" onClick={onSend} disabled={wfLoading}
                className="h-8 px-3 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                ส่งให้ลูกค้า
              </button>
            )}
            {detail.status === "sent" && canAccept && (
              <button type="button" onClick={onAccept} disabled={wfLoading}
                className="h-8 px-3 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                ตอบรับ
              </button>
            )}
            {["sent", "accepted"].includes(detail.status) && canAccept && (
              <button type="button" onClick={onConvert} disabled={wfLoading}
                className="h-8 px-3 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                แปลงเป็น SO
              </button>
            )}
            {detail.status === "sent" && canReject && (
              <button type="button" onClick={onReject} disabled={wfLoading}
                className="h-8 px-3 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                ปฏิเสธ
              </button>
            )}
            {["draft", "sent"].includes(detail.status) && canCancel && (
              <button type="button" onClick={onCancel} disabled={wfLoading}
                className="h-8 px-3 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                ยกเลิก
              </button>
            )}
          </div>
        </div>

        <SalesLineCompactTable lines={quoteLinesToEditor(detail.lines)} maxHeight={320} />

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
          <Info label="วันที่เสนอ" value={formatDate(detail.quote_date)} />
          <Info label="ยืนราคาถึง" value={formatDate(detail.valid_until)} />
          <Info label="เซลส์" value={detail.sale_person_name} />
          <Info label="VAT" value={`${detail.vat_rate}%${detail.vat_included ? " included" : ""}`} />
          <Info label="ยอดสุทธิ" value={baht(detail.grand_total)} />
        </div>
      </div>
    </div>
  );
}

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
