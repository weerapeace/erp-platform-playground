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
 * ชุด (= กลุ่มใบสั่งงาน mo_groups): แต่ละรายการเลือกชุดได้ → เปิดใบสั่งผลิตแล้วใบเข้าชุดให้เอง
 *   ลงทีละหลายรายการ = OrderBatchEntryModal (components/order-batch-entry)
 *
 * ของกลาง: MiniTable · DocCalendar · SOLineEditor + SalesTotalsPreview (ตัวเดียวกับใบขาย) ·
 *          CustomerPicker · DateInput · MoGroupPicker · SourceDocPickerModal · MoMultiPickerModal ·
 *          OrderBatchEntryModal · ERPModal/ConfirmDialog · useViewPref · openLink
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
import { SOLineEditor, SalesTotalsPreview, VatModeToggle, calculateEditorTotals, emptyLine, vatRateForCompany, type EditorLine, type LineExtraColumn } from "@/components/sales-line-items";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
import { MoMultiPickerModal, type MoPickRow } from "@/components/mo-picker";
import { MoGroupPicker, useMoGroups, rememberMoGroup, type MoGroupPick } from "@/components/mo-group-picker";
import { OrderBatchEntryModal } from "@/components/order-batch-entry";
import { SoBatchView } from "./batch-view";
import { SoOrderReadView } from "./order-read-view";
import { useViewPref } from "@/lib/use-view-pref";
import { openLink, useOpenParam } from "@/lib/open-param";
import { pickQuoteDocs } from "@/lib/quote-pull";
import type { SourceDoc, SourceLine } from "@/app/api/so-orders/sources/route";

type Row = {
  id: string; order_no: string | null; status: string;
  company_code: string | null; customer_name: string | null; customer_code: string | null;
  customer_po_no: string | null; sale_person_name: string | null;
  order_date: string; due_date: string | null; grand_total: number; line_count: number;
  mo_opened_at: string | null; invoice_so_id: string | null; shipped_at: string | null;
  groups: { id: string; name: string }[];
};
/** ข้อมูลประจำบรรทัดที่ SOLineEditor ไม่มีช่อง (ผูกใบสั่งผลิต · ใบเสนอราคาต้นทาง · ชุด) — key = tempId */
type LineMeta = { mo_id: string | null; mo_no: string | null; quote_id?: string | null; quote_no?: string | null; group: MoGroupPick | null };
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
  const { view, setView } = useViewPref("so_order_view", ["table", "batch", "calendar"] as const, "table");
  const [reloadKey, setReloadKey] = useState(0);              // บอกมุมมองตามชุดให้โหลดใหม่

  const [form, setForm] = useState<Form | null>(null);
  // ใบที่บันทึกแล้วเปิดมาเป็น "หน้าอ่าน" (สรุป + จัดกลุ่มตามรุ่น) · กด "แก้ไขรายการ" ถึงเป็นช่องกรอก (เจ้าของเลือกแบบ D+C)
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState<Record<string, LineMeta>>({});
  const [saving, setSaving] = useState(false);
  const [srcOpen, setSrcOpen] = useState<null | "quote" | "mo">(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const { groups: moGroups } = useMoGroups(canView);
  const [askShip, setAskShip] = useState<Row | Form | null>(null);
  const [askCancel, setAskCancel] = useState<Row | Form | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/so-orders?limit=400");
      const j = await r.json();
      setRows((j.data ?? []) as Row[]);
    } catch { /* toast ด้านล่างพอ */ }
    finally { setLoading(false); setReloadKey((k) => k + 1); }
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
      .filter((r) => !groupFilter || (r.groups ?? []).some((g) => g.id === groupFilter))
      .filter((r) => !q || `${r.order_no ?? ""} ${r.customer_name ?? ""} ${r.customer_po_no ?? ""}`.toLowerCase().includes(q));
  }, [rows, status, search, groupFilter]);
  // ชุดที่มีใบสั่งขายอยู่ (ไว้ทำปุ่มกรอง)
  const groupChips = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const r of rows) for (const g of r.groups ?? []) { const x = m.get(g.id) ?? { ...g, n: 0 }; x.n++; m.set(g.id, x); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rows]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  // ผู้ออกบิลที่ไม่ได้จด VAT → บังคับ VAT = 0 (ของกลาง VatModeToggle ล็อกปุ่ม "มี VAT" ด้วย)
  const companyNoVat = !!form && companies.find((c) => c.id === form.company_id)?.vat_registered === false;
  useEffect(() => {
    if (companyNoVat) setForm((f) => (f && f.vat_rate !== 0 ? { ...f, vat_rate: 0, vat_included: false } : f));
  }, [companyNoVat]);

  const totals = useMemo(() => calculateEditorTotals(form?.lines ?? [], {
    vatRate: form?.vat_rate ?? 7, vatIncluded: !!form?.vat_included, whtRate: form?.wht_rate ?? 0,
    headerDiscountType: form?.header_discount_type ?? "amount", headerDiscountValue: form?.header_discount_value ?? 0,
    shippingFee: form?.shipping_fee ?? 0,
  }), [form]);

  // ---- เปิดใบ ----
  const openNew = () => {
    const def = companies.find((c) => c.is_default) ?? companies[0];
    setMeta({});
    setEditing(true);
    setForm({ ...emptyForm(), company_code: def?.company_code ?? "", company_id: def?.id ?? null, vat_rate: vatRateForCompany(def) });
  };
  const openRow = async (r: { id: string; groups?: Row["groups"] }) => {
    try {
      const j = await apiFetch(`/api/so-orders/${r.id}`).then((x) => x.json());
      const d = j.data as Record<string, unknown> & { lines: Record<string, unknown>[] };
      // ข้อมูลประจำบรรทัด (ผูกใบสั่งผลิต · ใบเสนอราคาต้นทาง · ชุด) — ต้องส่งกลับตอนบันทึก ไม่งั้นการผูกหาย
      const nameOfGroup = new Map((moGroups ?? []).map((g) => [g.id, g.name]));
      const m: Record<string, LineMeta> = {};
      for (const l of d.lines ?? []) {
        const gid = (l.mo_group_id as string) ?? null;
        m[String(l.id)] = { mo_id: (l.mo_id as string) ?? null, mo_no: (l.mo_no as string) ?? null,
          quote_id: (l.quote_id as string) ?? null, quote_no: (l.quote_no as string) ?? null,
          group: gid ? { id: gid, name: nameOfGroup.get(gid) ?? (r.groups ?? []).find((g) => g.id === gid)?.name ?? "ชุด" } : null };
      }
      setMeta(m);
      setEditing(false);
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
          tempId: String(l.id), sku: (l.sku as string) ?? null,
          product_name: (l.product_name as string) ?? "", qty: Number(l.qty) || 0, unit: (l.unit as string) || "ชิ้น",
          unit_price: Number(l.unit_price) || 0,
          discount_type: ((l.discount_type as string) === "percent" ? "percent" : "amount") as "percent" | "amount",
          discount_value: Number(l.discount_value) || 0, note: (l.note as string) || undefined,
        })),
      });
    } catch { toast.error("เปิดใบไม่สำเร็จ"); }
  };
  // ลิงก์ตรงถึงใบ `?open=<id>` (เช่น จากหน้าใบเสนอราคา "ไปที่ใบสั่งขาย")
  useOpenParam(canView, (id) => void openRow({ id }));

  // ---- ดึงรายการจากใบเสนอราคา / ใบสั่งผลิต (ตัวเลือกกลาง) ----
  const addSourceLines = (src: SourceLine[], customer: CustomerPickerValue | null, label: string) => {
    if (!form) return;
    const add: EditorLine[] = src.map((l) => ({
      ...emptyLine(), sku: l.sku, product_name: l.product_name,
      qty: l.qty, unit: l.unit, unit_price: l.unit_price,
      discount_type: l.discount_type ?? "amount", discount_value: l.discount_value ?? 0,
      note: l.mo_no ? `จากใบสั่งผลิต ${l.mo_no}` : undefined,
    }));
    const keep = form.lines.filter((l) => l.product_name.trim() || l.sku);
    setForm({
      ...form,
      customer: form.customer ?? customer ?? form.customer,
      due_date: form.due_date || (src.find((l) => l.due_date)?.due_date ?? ""),
      lines: [...keep, ...add],
    });
    setMeta((m) => { const n = { ...m }; add.forEach((l, i) => { n[l.tempId] = { mo_id: src[i].mo_id, mo_no: src[i].mo_no, quote_id: src[i].quote_id, quote_no: src[i].quote_no, group: null }; }); return n; });
    toast.success(`ดึง ${add.length} รายการจาก ${label} แล้ว`);
  };
  // ใบเสนอราคาหลายใบเข้าใบเดียวได้ — ต้องเป็นลูกค้าเดียวกัน · ใบที่ดึงมาแล้วไม่ดึงซ้ำ (กติกา lib/quote-pull)
  const onQuotesPicked = (rows: SourceDocRow[]) => {
    if (!form) return;
    const have = Object.entries(meta).filter(([tid, m]) => m.quote_id && form.lines.some((l) => l.tempId === tid)).map(([, m]) => m.quote_id as string);
    const { keep, skipped } = pickQuoteDocs(rows as unknown as SourceDoc[], { customerId: form.customer?.id || null, customerName: form.customer?.name ?? null, have });
    if (skipped.length) toast.error(`ข้าม ${skipped.join(" · ")}`);
    if (!keep.length) return;
    const d0 = keep[0];
    const cust = d0.customer_name ? ({ id: d0.customer_id ?? "", code: d0.customer_code ?? null, name: d0.customer_name } as CustomerPickerValue) : null;
    addSourceLines(keep.flatMap((d) => d.lines), cust, keep.length === 1 ? (d0.no ?? "ใบเสนอราคา") : `ใบเสนอราคา ${keep.length} ใบ`);
  };
  const onMosPicked = async (picked: MoPickRow[]) => {
    setSrcOpen(null);
    if (picked.length === 0) return;
    try {
      const j = await apiFetch(`/api/so-orders/sources?type=mo&mo_nos=${encodeURIComponent(picked.map((p) => p.mo_no).join(","))}`).then((x) => x.json());
      const docs = (j.data ?? []) as SourceDoc[];
      if (docs.length) addSourceLines(docs.flatMap((d) => d.lines), null, `ใบสั่งผลิต ${docs.length} ใบ`);
      if (picked.length > docs.length) toast.error(`${picked.length - docs.length} ใบผูกใบสั่งขายอื่นแล้ว หรือปิด/ยกเลิกไปแล้ว — ข้าม`);
    } catch { toast.error("ดึงใบสั่งผลิตไม่สำเร็จ"); }
  };

  // ---- ชุดของบรรทัด ----
  const setLineGroup = (tempIds: string[], g: MoGroupPick | null) =>
    setMeta((m) => { const n = { ...m }; for (const id of tempIds) n[id] = { ...(n[id] ?? { mo_id: null, mo_no: null }), group: g }; return n; });
  const groupColumn: LineExtraColumn[] = [{
    key: "group", position: "end", className: "w-48", header: "ชุด",
    cell: (l) => (
      <div className="space-y-1">
        <MoGroupPicker size="sm" value={meta[l.tempId]?.group ?? null} onChange={(g) => setLineGroup([l.tempId], g)}
          placeholder="ไม่จัดชุด" disabled={form?.status === "cancelled"} />
        {meta[l.tempId]?.mo_no && <div className="text-[10px] text-emerald-700">ผูก {meta[l.tempId]?.mo_no}</div>}
        {meta[l.tempId]?.quote_no && <div className="text-[10px] text-sky-700">จากใบเสนอราคา {meta[l.tempId]?.quote_no}</div>}
      </div>
    ),
  }];

  const payload = (f: Form) => {
    const newGroups: Record<string, string> = {};
    return {
      new_groups: newGroups,
      header: {
        company_id: f.company_id, company_code: f.company_code,
        customer_id: f.customer?.id || null, customer_name: f.customer?.name ?? null, customer_code: f.customer?.code ?? null,
        customer_po_no: f.customer_po_no || null, sale_person_name: f.sale_person_name || null,
        order_date: f.order_date, due_date: f.due_date || null,
        header_discount_type: f.header_discount_type, header_discount_value: f.header_discount_value,
        shipping_fee: f.shipping_fee, vat_rate: f.vat_rate, vat_included: f.vat_included, wht_rate: f.wht_rate,
        note: f.note || null,
      },
      lines: f.lines.filter((l) => l.product_name.trim() || l.sku).map((l) => {
        const m = meta[l.tempId];
        const g = m?.group ?? null;
        if (g && !g.id) newGroups[`new:${g.name}`] = g.name;
        return {
          sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
          discount_type: l.discount_type, discount_value: l.discount_value, note: l.note ?? null,
          mo_id: m?.mo_id ?? null, mo_no: m?.mo_no ?? null,
          quote_id: m?.quote_id ?? null, quote_no: m?.quote_no ?? null,
          source: m?.mo_id ? "mo" : m?.quote_id ? "quote" : "manual",
          mo_group_id: g?.id ?? null, mo_group_key: g && !g.id ? `new:${g.name}` : null,
        };
      }),
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
      for (const m of Object.values(meta)) if (m.group?.id) rememberMoGroup({ id: m.group.id, name: m.group.name });
      for (const g of (j.new_groups ?? []) as { id: string; name: string }[]) rememberMoGroup(g);
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
    { key: "group", header: "ชุด", width: "minmax(9rem,1fr)", sortValue: (r) => r.groups?.[0]?.name ?? "", sortLabel: "ชุด",
      cell: (r) => (r.groups?.length
        ? <div className="flex flex-col gap-0.5 min-w-0">{r.groups.map((g) => (
            <button key={g.id} onClick={(e) => { e.stopPropagation(); setGroupFilter(groupFilter === g.id ? "" : g.id); }} title="กรองตามชุดนี้"
              className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-teal-50 px-2 py-0.5 text-[10px] text-teal-800 hover:bg-teal-100">
              <Icon name="folders" /><span className="truncate">{g.name}</span></button>))}</div>
        : <span className="text-[10px] text-slate-300">ยังไม่จัดชุด</span>) },
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
            <button onClick={() => setView("batch")} title="ความคืบหน้าเป็นชุด (กลุ่มใบสั่งงาน)"
              className={`px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1 ${view === "batch" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}><Icon name="folders" /> ตามชุด</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>📅 ปฏิทิน</button>
          </div>
          <button onClick={() => void load()} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⟳</button>
          {canEdit && <button onClick={() => setBatchOpen(true)} title="ลงออเดอร์ทีละหลายรายการ + จับชุด (วางจาก Excel / เลือกหลายตัว / ทั้งรุ่น / ใบเสนอราคา / ใบสั่งผลิต)"
            className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Icon name="list" /> เพิ่มหลายรายการ</button>}
          {canEdit && <button onClick={openNew} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">＋ สร้างทีละใบ</button>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setStatus("")} className={`h-8 px-3 text-sm rounded-lg border ${status === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>ทั้งหมด ({rows.length})</button>
        {Object.entries(ST).map(([k, v]) => (counts.get(k) ?? 0) > 0 && (
          <button key={k} onClick={() => setStatus(status === k ? "" : k)}
            className={`h-8 px-3 text-sm rounded-lg border ${status === k ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200"}`}
            style={status === k ? { backgroundColor: v.color } : undefined}>{v.label} ({counts.get(k)})</button>
        ))}
        {groupChips.length > 0 && <span className="ml-2 text-[11px] text-slate-400">ชุด:</span>}
        {groupChips.map((g) => (
          <button key={g.id} onClick={() => setGroupFilter(groupFilter === g.id ? "" : g.id)}
            className={`h-8 px-3 inline-flex items-center gap-1 text-sm rounded-lg border ${groupFilter === g.id ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-600 border-slate-200"}`}>
            <Icon name="folders" /> {g.name} ({g.n})</button>
        ))}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400 text-sm">กำลังโหลด…</div>
        : view === "table" ? (
        <MiniTable rows={shown} rowKey={(r) => r.id} columns={cols}
          title="🧾 ใบสั่งขาย" countUnit="ใบ" onRowClick={(r) => void openRow(r)}
          searchText={(r) => `${r.order_no ?? ""} ${r.customer_name ?? ""} ${r.customer_po_no ?? ""}`}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า / PO ลูกค้า"
          searchValue={search} onSearchChange={setSearch}
          emptyText={groupFilter ? "ไม่มีใบสั่งขายในชุดนี้" : "ยังไม่มีใบสั่งขาย — กด “เพิ่มหลายรายการ” หรือ “สร้างทีละใบ”"}
          footnote="กดแถวเพื่อเปิดใบ · ใบที่เปิดใบสั่งผลิตแล้วจะมีป้าย 🏭 · กดป้ายชุดเพื่อกรอง" />
      ) : view === "batch" ? (
        <SoBatchView groupFilter={groupFilter} canEdit={canEdit} canShip={canShip} reloadKey={reloadKey} onChanged={() => void load()}
          onOpenOrder={(id) => void openRow(rows.find((x) => x.id === id) ?? { id })} />
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
          {form.id && editing && (
            /* ทิ้งที่แก้ไว้ → โหลดใบเดิมกลับมาเป็นหน้าอ่าน */
            <button onClick={() => void openRow({ id: form.id! })} disabled={saving} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิกการแก้</button>
          )}
          <button onClick={() => setForm(null)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          {canEdit && form.status !== "cancelled" && (form.id && !editing ? (
            <button onClick={() => setEditing(true)} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Icon name="edit" /> แก้ไขรายการ
            </button>
          ) : (
            <button onClick={() => void save(!form.id)} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : form.id ? "บันทึก" : "บันทึก + เปิดใบสั่งผลิต"}
            </button>
          ))}
        </> : null}>
        {form && form.id && !editing && (
          <SoOrderReadView
            header={{
              companyName: companies.find((c) => c.company_code === form.company_code)?.name ?? form.company_code,
              customerName: form.customer?.name ?? "", orderDate: form.order_date, dueDate: form.due_date,
              poNo: form.customer_po_no, salePerson: form.sale_person_name, note: form.note, status: form.status,
            }}
            lines={form.lines} meta={meta} totals={totals}
            canOpenMo={canEdit && form.status !== "cancelled"}
            onOpenMo={() => void act(form.id!, { action: "open_mo" }, "เปิด/ผูกใบสั่งผลิตให้แล้ว")} />
        )}
        {form && (!form.id || editing) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">บริษัท (ชุดเลขเอกสาร)</span>
                <select value={form.company_code} onChange={(e) => { const c = companies.find((x) => x.company_code === e.target.value); setForm({ ...form, company_code: e.target.value, company_id: c?.id ?? null, vat_rate: vatRateForCompany(c), vat_included: c?.vat_registered === false ? false : form.vat_included }); }}
                  disabled={!!form.id} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                  <option value="">— เลือกบริษัท —</option>
                  {companies.map((c) => <option key={c.id} value={c.company_code}>{c.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="text-[11px] text-slate-500">วันที่สั่ง</span>
                <div className="mt-0.5"><DateInput value={form.order_date} onChange={(v) => setForm({ ...form, order_date: v })} /></div></label>
              <label className="block" title="ใส่แล้วใบสั่งผลิตที่เปิดให้จะใช้กำหนดส่งนี้"><span className="text-[11px] text-slate-500">กำหนดส่ง</span>
                <div className="mt-0.5"><DateInput value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} /></div></label>
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
              {form.status !== "cancelled" && form.lines.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">ทุกรายการเข้าชุด</span>
                  <div className="w-56"><MoGroupPicker size="sm" value={null} placeholder="เลือกชุด…" onChange={(g) => setLineGroup(form.lines.map((l) => l.tempId), g)} /></div>
                </div>
              )}
            </div>

            {/* ตารางแน่น 1 แถว/รายการ — กดแถวเพื่อเปลี่ยนสินค้า/สี (ของกลาง layout="compact") */}
            <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} layout="compact" readonly={form.status === "cancelled"} extraColumns={groupColumn} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <VatModeToggle rate={form.vat_rate} included={form.vat_included} companyNoVat={companyNoVat} disabled={form.status === "cancelled"}
                  onChange={(v) => setForm({ ...form, vat_rate: v.rate, vat_included: v.included })} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block"><span className="text-[11px] text-slate-500">ค่าส่ง</span>
                    <input type="number" value={form.shipping_fee} onChange={(e) => setForm({ ...form, shipping_fee: Number(e.target.value) || 0 })}
                      className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
                  <label className="block"><span className="text-[11px] text-slate-500">ส่วนลดท้ายบิล</span>
                    <input type="number" value={form.header_discount_value} onChange={(e) => setForm({ ...form, header_discount_value: Number(e.target.value) || 0 })}
                      className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
                </div>
                <label className="block"><span className="text-[11px] text-slate-500">หมายเหตุ</span>
                  <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" /></label>
              </div>
              <SalesTotalsPreview result={totals} />
            </div>
          </div>
        )}
      </ERPModal>

      {/* ── เลือกเอกสารต้นทาง (ตัวเลือกกลาง) ───────────────── */}
      {srcOpen === "quote" && <SourceDocPickerModal open mode="so_quote" onClose={() => setSrcOpen(null)} onConfirm={onQuotesPicked} />}
      {srcOpen === "mo" && <MoMultiPickerModal open scope="open" title="ดึงจากใบสั่งผลิต" onClose={() => setSrcOpen(null)} onConfirm={(p) => void onMosPicked(p)}
        exclude={Object.values(meta).map((m) => m.mo_no).filter((x): x is string => !!x)} />}

      {/* ── ลงออเดอร์ทีละหลายรายการ + จับชุด (ของกลาง) ───── */}
      {batchOpen && <OrderBatchEntryModal open onClose={() => setBatchOpen(false)} onSaved={() => void load()} />}

      {/* ── ส่งแล้ว: ออกใบขายให้เลยไหม ─────────────────── */}
      <ERPModal open={!!askShip} onClose={() => setAskShip(null)} size="sm" title="🚚 ยืนยันว่าส่งของแล้ว"
        footer={<>
          <button onClick={() => setAskShip(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => askShip && void act((askShip as { id: string }).id, { action: "ship", create_invoice: false }, "บันทึกว่าส่งแล้ว")}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">แค่ติ๊กว่าส่งแล้ว</button>
          <button onClick={() => askShip && void act((askShip as { id: string }).id, { action: "ship", create_invoice: true }, "ส่งแล้ว + ออกใบขาย (จัดส่ง · ตัดสต็อก) ให้แล้ว").then((j) => { if (j?.warning) toast.error(String(j.warning)); })}
            className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">ส่งแล้ว + ออกใบขายให้เลย</button>
        </>}>
        <p className="text-sm text-slate-600">เลือกว่าจะให้ระบบ <b>ออกใบขาย/บิลให้เลย</b> (คัดลอกรายการจากใบสั่งขายไปตั้งใบขายใหม่) หรือ <b>แค่ติ๊กว่าส่งแล้ว</b> แล้วไปออกใบขายเองที่หน้าใบขาย</p>
        <p className="text-[11px] text-slate-400 mt-2">ออกใบขายให้เลย = ใบขายถูกยืนยันและ “จัดส่งแล้ว” ทันที → ตัดของออกจากคลังสินค้าสำเร็จ · จะมีลิงก์ 🧾 ใบขาย ให้กดข้ามไปดูได้จากรายการ</p>
      </ERPModal>

      <ConfirmDialog open={!!askCancel} onClose={() => setAskCancel(null)}
        onConfirm={() => askCancel && void act((askCancel as { id: string }).id, { action: "cancel" }, "ยกเลิกใบแล้ว")}
        title="ยกเลิกใบสั่งขาย?" variant="danger" confirmText="ยกเลิกใบ"
        message="ใบจะถูกทำเครื่องหมายว่ายกเลิก (ไม่ลบทิ้ง) · ใบสั่งผลิตที่เปิดไปแล้วจะไม่ถูกยกเลิกให้อัตโนมัติ — ต้องไปจัดการที่ใบสั่งผลิตเอง" />
    </div>
    </PlaygroundShell>
  );
}
