"use client";

/**
 * 🧾 ใบสั่งขาย (Sales Order) — /sales/orders
 *
 * เอกสาร "ลูกค้าสั่งของ" ที่ลงเอง — ต้นทางของงานทั้งสาย:
 *   ใบเสนอราคา / ใบสั่งผลิต  →  **ใบสั่งขาย**  →  เปิดใบสั่งผลิต  →  ส่งของ  →  ออกใบขาย/บิล
 * (คนละใบกับ "ใบขาย (SO)" ที่ระบบใช้เป็นบิล/ใบกำกับปลายทาง)
 *
 * สถานะ: ยืนยันแล้ว → ส่งแล้ว · ยกเลิกได้ทุกเมื่อ
 *   • ยืนยันแล้ว = เปิด/ผูกใบสั่งผลิตให้ (บรรทัดที่ดึงมาจาก MO = ผูก · บรรทัดใหม่ = เปิดใบสั่งผลิตให้เลย)
 *   • ส่งแล้ว    = เลือกได้ว่าจะ "ออกใบขายให้เลย" หรือ "แค่ติ๊กว่าออกใบขายแล้ว"
 *
 * ของกลาง: MiniTable · DocCalendar · SOLineEditor + SalesTotalsPreview (ตัวเดียวกับใบขาย) ·
 *          CustomerPicker · ERPModal/ConfirmDialog · useViewPref · openLink
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { DocCalendar, type CalDoc } from "@/components/doc-calendar";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { SOLineEditor, SalesTotalsPreview, calculateEditorTotals, emptyLine, type EditorLine } from "@/components/sales-line-items";
import { useViewPref } from "@/lib/use-view-pref";
import { openLink } from "@/lib/open-param";
import type { SourceDoc } from "@/app/api/so-orders/sources/route";

type Row = {
  id: string; order_no: string | null; status: string;
  company_code: string | null; customer_name: string | null; customer_code: string | null;
  customer_po_no: string | null; sale_person_name: string | null;
  order_date: string; due_date: string | null; grand_total: number; line_count: number;
  mo_opened_at: string | null; invoice_so_id: string | null; shipped_at: string | null;
};
type Company = { id: string; company_code: string; name: string; is_default: boolean; vat_registered: boolean };

const ST: Record<string, { label: string; color: string }> = {
  confirmed: { label: "ยืนยันแล้ว", color: "#378ADD" },
  shipped:   { label: "ส่งแล้ว",    color: "#1D9E75" },
  cancelled: { label: "ยกเลิก",     color: "#DC2626" },
};
const money = (n: number) => "฿" + (Math.round(n) || 0).toLocaleString("th-TH");
const dayText = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

type Form = {
  id: string | null;
  company_code: string; company_id: string | null;
  customer: CustomerPickerValue | null;
  customer_po_no: string; sale_person_name: string;
  order_date: string; due_date: string;
  vat_rate: number; vat_included: boolean; wht_rate: number;
  header_discount_type: "percent" | "amount"; header_discount_value: number; shipping_fee: number;
  note: string; lines: EditorLine[];
  status: string; mo_opened_at: string | null; invoice_so_id: string | null; order_no: string | null;
};
const emptyForm = (): Form => ({
  id: null, company_code: "", company_id: null, customer: null, customer_po_no: "", sale_person_name: "",
  order_date: today(), due_date: "", vat_rate: 7, vat_included: false, wht_rate: 0,
  header_discount_type: "amount", header_discount_value: 0, shipping_fee: 0,
  note: "", lines: [emptyLine()], status: "confirmed", mo_opened_at: null, invoice_so_id: null, order_no: null,
});

export default function SoOrdersPage() {
  const canView = usePermission("so.view");
  const canEdit = usePermission("so.create");
  const canShip = usePermission("so.ship");
  const canCancel = usePermission("so.cancel");
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const { view, setView } = useViewPref("so_order_view", ["table", "calendar"] as const, "table");

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [srcOpen, setSrcOpen] = useState<null | "quote" | "mo">(null);
  const [askShip, setAskShip] = useState<Row | Form | null>(null);
  const [askCancel, setAskCancel] = useState<Row | Form | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/so-orders?limit=400");
      const j = await r.json();
      setRows((j.data ?? []) as Row[]);
    } catch { /* toast ด้านล่างพอ */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) void load(); }, [canView, load]);
  useEffect(() => {
    if (!canView) return;
    void (async () => {
      try { const j = await apiFetch("/api/admin/companies").then((r) => r.json()); setCompanies((j.data ?? []) as Company[]); } catch { /* ไม่มีก็ไม่เป็นไร */ }
    })();
  }, [canView]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !status || r.status === status)
      .filter((r) => !q || `${r.order_no ?? ""} ${r.customer_name ?? ""} ${r.customer_po_no ?? ""}`.toLowerCase().includes(q));
  }, [rows, status, search]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  const totals = useMemo(() => calculateEditorTotals(form?.lines ?? [], {
    vatRate: form?.vat_rate ?? 7, vatIncluded: !!form?.vat_included, whtRate: form?.wht_rate ?? 0,
    headerDiscountType: form?.header_discount_type ?? "amount", headerDiscountValue: form?.header_discount_value ?? 0,
    shippingFee: form?.shipping_fee ?? 0,
  }), [form]);

  // ---- เปิดใบ ----
  const openNew = () => {
    const def = companies.find((c) => c.is_default) ?? companies[0];
    setForm({ ...emptyForm(), company_code: def?.company_code ?? "", company_id: def?.id ?? null });
  };
  const openRow = async (r: Row) => {
    try {
      const j = await apiFetch(`/api/so-orders/${r.id}`).then((x) => x.json());
      const d = j.data as Record<string, unknown> & { lines: Record<string, unknown>[] };
      setForm({
        id: String(d.id), company_code: (d.company_code as string) ?? "", company_id: (d.company_id as string) ?? null,
        customer: d.customer_id ? ({ id: String(d.customer_id), code: (d.customer_code as string) ?? null, name: (d.customer_name as string) ?? "" } as CustomerPickerValue) : null,
        customer_po_no: (d.customer_po_no as string) ?? "", sale_person_name: (d.sale_person_name as string) ?? "",
        order_date: String(d.order_date ?? today()).slice(0, 10), due_date: d.due_date ? String(d.due_date).slice(0, 10) : "",
        vat_rate: Number(d.vat_rate ?? 7), vat_included: !!d.vat_included, wht_rate: Number(d.wht_rate ?? 0),
        header_discount_type: (d.header_discount_type as "percent" | "amount") ?? "amount",
        header_discount_value: Number(d.header_discount_value ?? 0), shipping_fee: Number(d.shipping_fee ?? 0),
        note: (d.note as string) ?? "", status: (d.status as string) ?? "confirmed",
        mo_opened_at: (d.mo_opened_at as string) ?? null, invoice_so_id: (d.invoice_so_id as string) ?? null,
        order_no: (d.order_no as string) ?? null,
        lines: (d.lines ?? []).map((l) => ({
          tempId: String(l.id ?? Math.random()).slice(0, 12), sku: (l.sku as string) ?? null,
          product_name: (l.product_name as string) ?? "", qty: Number(l.qty) || 0, unit: (l.unit as string) || "ชิ้น",
          unit_price: Number(l.unit_price) || 0,
          discount_type: ((l.discount_type as string) === "percent" ? "percent" : "amount") as "percent" | "amount",
          discount_value: Number(l.discount_value) || 0, note: (l.note as string) || undefined,
        })),
      });
    } catch { toast.error("เปิดใบไม่สำเร็จ"); }
  };

  // ---- ดึงรายการจากใบเสนอราคา / ใบสั่งผลิต ----
  const applySource = (doc: SourceDoc) => {
    if (!form) return;
    const add: EditorLine[] = doc.lines.map((l) => ({
      tempId: String(Math.random()).slice(2), sku: l.sku, product_name: l.product_name,
      qty: l.qty, unit: l.unit, unit_price: l.unit_price, discount_type: "amount", discount_value: 0,
      note: l.mo_no ? `จากใบสั่งผลิต ${l.mo_no}` : undefined,
    }));
    const keep = form.lines.filter((l) => l.product_name.trim() || l.sku);
    setForm({
      ...form,
      customer: form.customer ?? (doc.kind === "quote" && doc.customer_name ? ({ id: "", name: doc.customer_name } as CustomerPickerValue) : form.customer),
      due_date: form.due_date || (doc.lines.find((l) => l.due_date)?.due_date ?? ""),
      lines: [...keep, ...add],
      // จำ mo_id ไว้ที่บรรทัด (EditorLine ไม่มีช่องนี้ → เก็บใน map ตอนบันทึก)
    });
    (window as unknown as { __soMoLink?: Record<string, { mo_id: string | null; mo_no: string | null }> }).__soMoLink ??= {};
    const map = (window as unknown as { __soMoLink: Record<string, { mo_id: string | null; mo_no: string | null }> }).__soMoLink;
    add.forEach((l, i) => { const s = doc.lines[i]; if (s.mo_id) map[l.tempId] = { mo_id: s.mo_id, mo_no: s.mo_no }; });
    setSrcOpen(null);
    toast.success(`ดึง ${add.length} รายการจาก ${doc.no ?? (doc.kind === "quote" ? "ใบเสนอราคา" : "ใบสั่งผลิต")} แล้ว`);
  };

  const payload = (f: Form) => {
    const map = (window as unknown as { __soMoLink?: Record<string, { mo_id: string | null; mo_no: string | null }> }).__soMoLink ?? {};
    return {
      header: {
        company_id: f.company_id, company_code: f.company_code,
        customer_id: f.customer?.id || null, customer_name: f.customer?.name ?? null, customer_code: f.customer?.code ?? null,
        customer_po_no: f.customer_po_no || null, sale_person_name: f.sale_person_name || null,
        order_date: f.order_date, due_date: f.due_date || null,
        header_discount_type: f.header_discount_type, header_discount_value: f.header_discount_value,
        shipping_fee: f.shipping_fee, vat_rate: f.vat_rate, vat_included: f.vat_included, wht_rate: f.wht_rate,
        note: f.note || null,
      },
      lines: f.lines.filter((l) => l.product_name.trim() || l.sku).map((l) => ({
        sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type, discount_value: l.discount_value, note: l.note ?? null,
        mo_id: map[l.tempId]?.mo_id ?? null, mo_no: map[l.tempId]?.mo_no ?? null,
        source: map[l.tempId]?.mo_id ? "mo" : "manual",
      })),
    };
  };

  const save = async (openMo: boolean) => {
    if (!form) return;
    if (!form.customer?.name) { toast.error("เลือกลูกค้าก่อน"); return; }
    setSaving(true);
    try {
      const body = { ...payload(form), open_mo: openMo };
      const res = form.id
        ? await apiFetch(`/api/so-orders/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...body }) })
        : await apiFetch("/api/so-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      const op = j.opened as { created: number; linked: number } | undefined;
      toast.success(form.id ? "บันทึกแล้ว" : `สร้างใบสั่งขาย ${j.order_no ?? ""} แล้ว${op ? ` · เปิดใบสั่งผลิต ${op.created} ใบ · ผูกเดิม ${op.linked} ใบ` : ""}`);
      setForm(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const act = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await apiFetch(`/api/so-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "ทำรายการไม่สำเร็จ");
      toast.success(okMsg);
      setForm(null); setAskShip(null); setAskCancel(null); await load();
      return j as Record<string, unknown>;
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); return null; }
  };

  const cols: MiniColumn<Row>[] = [
    { key: "no", header: "เลขที่", width: "10rem", sortValue: (r) => r.order_no ?? "", sortLabel: "เลขที่",
      cell: (r) => <div><div className="font-mono text-[12px] font-semibold text-slate-700">{r.order_no ?? "—"}</div>
        {r.customer_po_no && <div className="text-[10px] text-slate-400">PO {r.customer_po_no}</div>}</div> },
    { key: "cust", header: "ลูกค้า", width: "minmax(12rem,1.6fr)", sortValue: (r) => r.customer_name ?? "", sortLabel: "ลูกค้า",
      cell: (r) => <div className="min-w-0"><div className="text-sm text-slate-700 truncate">{r.customer_name ?? "—"}</div>
        {r.sale_person_name && <div className="text-[10px] text-slate-400 truncate">ผู้ขาย {r.sale_person_name}</div>}</div> },
    { key: "order", header: "วันที่สั่ง", width: "7rem", align: "center", sortValue: (r) => r.order_date, sortLabel: "วันที่สั่ง",
      cell: (r) => <span className="text-[12px] text-slate-500">{dayText(r.order_date)}</span> },
    { key: "due", header: "กำหนดส่ง", width: "7rem", align: "center", sortValue: (r) => r.due_date ?? "9999", sortLabel: "กำหนดส่ง",
      cell: (r) => r.due_date ? <span className="text-[12px] font-medium text-indigo-700">{dayText(r.due_date)}</span> : <span className="text-[10px] text-amber-600">ยังไม่ระบุ</span> },
    { key: "lines", header: "รายการ", width: "5rem", align: "right", sortValue: (r) => r.line_count, sortLabel: "จำนวนรายการ",
      cell: (r) => <span className="tabular-nums text-slate-600">{r.line_count}</span> },
    { key: "total", header: "ยอดรวม", width: "8rem", align: "right", sortValue: (r) => r.grand_total, sortLabel: "ยอดรวม",
      cell: (r) => <span className="tabular-nums text-slate-700">{money(r.grand_total)}</span> },
    { key: "flow", header: "ผลิต / ใบขาย", width: "9rem", align: "center",
      cell: (r) => <div className="flex items-center justify-center gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.mo_opened_at ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{r.mo_opened_at ? "🏭 เปิดผลิตแล้ว" : "ยังไม่เปิดผลิต"}</span>
        {r.invoice_so_id && <a href={openLink("/sales-orders", r.invoice_so_id)} onClick={(e) => e.stopPropagation()} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:underline">🧾 ใบขาย</a>}
      </div> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (r) => ST[r.status]?.label ?? r.status, sortLabel: "สถานะ",
      cell: (r) => <span className="text-[10px] px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: ST[r.status]?.color ?? "#94a3b8" }}>{ST[r.status]?.label ?? r.status}</span> },
  ];

  const calDocs: CalDoc[] = shown.map((r) => ({
    id: r.id, no: r.order_no, sub: r.customer_name, date: (r.due_date || r.order_date).slice(0, 10),
    amount: r.grand_total, color: ST[r.status]?.color ?? "#94a3b8", approx: !r.due_date,
  }));

  if (!canView) return <PlaygroundShell><AccessDenied message="คุณยังไม่มีสิทธิ์ดูใบสั่งขาย (so.view)" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
    <div className="max-w-[1500px] mx-auto px-5 py-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧾 ใบสั่งขาย</h1>
          <p className="text-sm text-slate-500 mt-0.5">ลูกค้าสั่งของ → เปิดใบสั่งผลิต → ส่งของ → ออกใบขาย · ดึงรายการจากใบเสนอราคา/ใบสั่งผลิตได้</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView("table")} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>▦ ตาราง</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>📅 ปฏิทิน</button>
          </div>
          <button onClick={() => void load()} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳</button>
          {canEdit && <button onClick={openNew} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">＋ สร้างใบสั่งขาย</button>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setStatus("")} className={`h-8 px-3 text-sm rounded-lg border ${status === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>ทั้งหมด ({rows.length})</button>
        {Object.entries(ST).map(([k, v]) => (counts.get(k) ?? 0) > 0 && (
          <button key={k} onClick={() => setStatus(status === k ? "" : k)}
            className={`h-8 px-3 text-sm rounded-lg border ${status === k ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200"}`}
            style={status === k ? { backgroundColor: v.color } : undefined}>{v.label} ({counts.get(k)})</button>
        ))}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400 text-sm">กำลังโหลด…</div>
        : view === "table" ? (
        <MiniTable rows={shown} rowKey={(r) => r.id} columns={cols}
          title="🧾 ใบสั่งขาย" countUnit="ใบ" onRowClick={(r) => void openRow(r)}
          searchText={(r) => `${r.order_no ?? ""} ${r.customer_name ?? ""} ${r.customer_po_no ?? ""}`}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า / PO ลูกค้า"
          searchValue={search} onSearchChange={setSearch}
          emptyText="ยังไม่มีใบสั่งขาย — กด ＋ สร้างใบสั่งขาย"
          footnote="กดแถวเพื่อเปิดใบ · ใบที่เปิดใบสั่งผลิตแล้วจะมีป้าย 🏭" />
      ) : (
        <DocCalendar docs={calDocs} cursor={cursor} onCursor={setCursor} onPick={(id) => { const r = rows.find((x) => x.id === id); if (r) void openRow(r); }}
          hint="วางใบตามกำหนดส่ง · ใบที่ยังไม่ใส่กำหนดส่ง (~) วางตามวันที่สั่ง" />
      )}

      {/* ── ฟอร์มใบสั่งขาย ─────────────────────────────── */}
      <ERPModal open={!!form} onClose={() => !saving && setForm(null)} size="xl"
        title={form?.id ? `🧾 ใบสั่งขาย ${form.order_no ?? ""}` : "🧾 สร้างใบสั่งขาย"}
        footer={form ? <>
          <span className="mr-auto text-[11px] text-slate-400">
            {form.status === "cancelled" ? "ใบนี้ถูกยกเลิกแล้ว" : form.mo_opened_at ? "เปิดใบสั่งผลิตให้แล้ว" : "ยังไม่เปิดใบสั่งผลิต"}
          </span>
          {form.id && canCancel && form.status !== "cancelled" && (
            <button onClick={() => setAskCancel(form)} className="h-9 px-3 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">⊘ ยกเลิกใบ</button>
          )}
          {form.id && canShip && form.status === "confirmed" && (
            <button onClick={() => setAskShip(form)} className="h-9 px-3 text-sm border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50">🚚 ส่งแล้ว</button>
          )}
          {form.id && canEdit && form.status !== "cancelled" && (
            <button onClick={() => void act(form.id!, { action: "open_mo" }, "เปิด/ผูกใบสั่งผลิตให้แล้ว")} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🏭 เปิดใบสั่งผลิต</button>
          )}
          <button onClick={() => setForm(null)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          {canEdit && form.status !== "cancelled" && (
            <button onClick={() => void save(!form.id)} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : form.id ? "บันทึก" : "บันทึก + เปิดใบสั่งผลิต"}
            </button>
          )}
        </> : null}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">บริษัท (ชุดเลขเอกสาร)</span>
                <select value={form.company_code} onChange={(e) => { const c = companies.find((x) => x.company_code === e.target.value); setForm({ ...form, company_code: e.target.value, company_id: c?.id ?? null }); }}
                  disabled={!!form.id} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                  <option value="">— เลือกบริษัท —</option>
                  {companies.map((c) => <option key={c.id} value={c.company_code}>{c.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="text-[11px] text-slate-500">วันที่สั่ง</span>
                <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">กำหนดส่ง</span>
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  title="ใส่แล้วใบสั่งผลิตที่เปิดให้จะใช้กำหนดส่งนี้" className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">เลข PO ลูกค้า</span>
                <input value={form.customer_po_no} onChange={(e) => setForm({ ...form, customer_po_no: e.target.value })} placeholder="ถ้ามี"
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div><span className="text-[11px] text-slate-500">ลูกค้า *</span>
                <div className="mt-0.5"><CustomerPicker value={form.customer} onChange={(v) => setForm({ ...form, customer: v })} /></div>
              </div>
              <label className="block"><span className="text-[11px] text-slate-500">ผู้ขาย</span>
                <input value={form.sale_person_name} onChange={(e) => setForm({ ...form, sale_person_name: e.target.value })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500">ดึงรายการเข้าใบนี้:</span>
              <button onClick={() => setSrcOpen("quote")} className="h-8 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">📄 จากใบเสนอราคา</button>
              <button onClick={() => setSrcOpen("mo")} className="h-8 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">🏭 จากใบสั่งผลิต</button>
              <span className="text-[10px] text-slate-400">ดึงจากใบสั่งผลิต = ผูกใบนั้นเข้าใบสั่งขายให้เลย (ไม่เปิดใบใหม่ซ้ำ)</span>
            </div>

            <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} layout="table" readonly={form.status === "cancelled"} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <label className="block"><span className="text-[11px] text-slate-500">VAT %</span>
                    <input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) || 0 })}
                      className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
                  <label className="block"><span className="text-[11px] text-slate-500">ค่าส่ง</span>
                    <input type="number" value={form.shipping_fee} onChange={(e) => setForm({ ...form, shipping_fee: Number(e.target.value) || 0 })}
                      className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
                  <label className="block"><span className="text-[11px] text-slate-500">ส่วนลดท้ายบิล</span>
                    <input type="number" value={form.header_discount_value} onChange={(e) => setForm({ ...form, header_discount_value: Number(e.target.value) || 0 })}
                      className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.vat_included} onChange={(e) => setForm({ ...form, vat_included: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                  ราคารวม VAT แล้ว
                </label>
                <label className="block"><span className="text-[11px] text-slate-500">หมายเหตุ</span>
                  <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" /></label>
              </div>
              <SalesTotalsPreview result={totals} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* ── ป๊อปเลือกเอกสารต้นทาง ───────────────────────── */}
      <SourcePicker open={srcOpen} onClose={() => setSrcOpen(null)} onPick={applySource} />

      {/* ── ส่งแล้ว: ออกใบขายให้เลยไหม ─────────────────── */}
      <ERPModal open={!!askShip} onClose={() => setAskShip(null)} size="sm" title="🚚 ยืนยันว่าส่งของแล้ว"
        footer={<>
          <button onClick={() => setAskShip(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => askShip && void act((askShip as { id: string }).id, { action: "ship", create_invoice: false }, "บันทึกว่าส่งแล้ว")}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">แค่ติ๊กว่าส่งแล้ว</button>
          <button onClick={() => askShip && void act((askShip as { id: string }).id, { action: "ship", create_invoice: true }, "ส่งแล้ว + ออกใบขายให้แล้ว")}
            className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">ส่งแล้ว + ออกใบขายให้เลย</button>
        </>}>
        <p className="text-sm text-slate-600">เลือกว่าจะให้ระบบ <b>ออกใบขาย/บิลให้เลย</b> (คัดลอกรายการจากใบสั่งขายไปตั้งใบขายใหม่) หรือ <b>แค่ติ๊กว่าส่งแล้ว</b> แล้วไปออกใบขายเองที่หน้าใบขาย</p>
        <p className="text-[11px] text-slate-400 mt-2">ออกใบขายแล้วจะมีลิงก์ 🧾 ใบขาย ให้กดข้ามไปดูได้จากรายการ</p>
      </ERPModal>

      <ConfirmDialog open={!!askCancel} onClose={() => setAskCancel(null)}
        onConfirm={() => askCancel && void act((askCancel as { id: string }).id, { action: "cancel" }, "ยกเลิกใบแล้ว")}
        title="ยกเลิกใบสั่งขาย?" variant="danger" confirmText="ยกเลิกใบ"
        message="ใบจะถูกทำเครื่องหมายว่ายกเลิก (ไม่ลบทิ้ง) · ใบสั่งผลิตที่เปิดไปแล้วจะไม่ถูกยกเลิกให้อัตโนมัติ — ต้องไปจัดการที่ใบสั่งผลิตเอง" />
    </div>
    </PlaygroundShell>
  );
}

/** ป๊อปเลือกใบเสนอราคา / ใบสั่งผลิต เพื่อดึงรายการเข้าใบสั่งขาย */
function SourcePicker({ open, onClose, onPick }: { open: null | "quote" | "mo"; onClose: () => void; onPick: (d: SourceDoc) => void }) {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true); setQ("");
    void (async () => {
      try {
        const j = await apiFetch(`/api/so-orders/sources?type=${open}`).then((r) => r.json());
        setDocs((j.data ?? []) as SourceDoc[]);
      } catch { setDocs([]); }
      finally { setBusy(false); }
    })();
  }, [open]);

  const list = docs.filter((d) => !q.trim() || `${d.no ?? ""} ${d.title} ${d.customer_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <ERPModal open={!!open} onClose={onClose} size="lg"
      title={open === "quote" ? "📄 ดึงรายการจากใบเสนอราคา" : "🏭 ดึงรายการจากใบสั่งผลิต"}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เลขที่ / ลูกค้า / สินค้า…"
        className="w-full h-9 px-2 mb-2 text-sm border border-slate-200 rounded-lg" />
      {busy ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        : list.length === 0 ? <div className="py-10 text-center text-slate-300 text-sm">{open === "mo" ? "ไม่มีใบสั่งผลิตที่ยังไม่ผูกใบสั่งขาย" : "ไม่พบใบเสนอราคา"}</div>
        : (
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
          {list.map((d) => (
            <button key={d.id} onClick={() => onPick(d)} className="w-full text-left px-2 py-2 hover:bg-slate-50 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-700 truncate">{d.title}</div>
                <div className="text-[11px] text-slate-400">{d.date ?? "—"} · {d.lines.length} รายการ{d.customer_name ? ` · ${d.customer_name}` : ""}</div>
              </div>
              <span className="text-sm tabular-nums text-slate-600 shrink-0">{money(d.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
