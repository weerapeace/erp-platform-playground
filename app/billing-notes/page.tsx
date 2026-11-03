"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { DeleteDraftButton } from "@/components/delete-draft-doc";
import { CustomerPicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import { formatDate } from "@/lib/date";
import { computeDueDate, formatCreditTerm } from "@/lib/credit-term";
import { PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { useOpenParam, useNewParam } from "@/lib/open-param";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { Icon } from "@/components/icon";
import type { ColumnDef } from "@tanstack/react-table";
import type { BillingNoteListItem, BillingNoteDetail } from "@/app/api/billing-notes/route";

const baht = (n: number | null | undefined) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "ยังไม่วางบิล", issued: "วางบิลแล้ว", paid: "ชำระแล้ว", cancelled: "ยกเลิก",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600", issued: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-600",
};

type PickedSO = { id: string; so_number: string; grand_total: number; customer_id: string | null; customer_name: string; status?: string };
/** ผลจากสร้างทีเดียวหลายใบ (POST /api/billing-notes/batch) */
type CreatedBill = { id: string; bill_number: string | null; customer_name: string | null; grand_total: number; so_count: number };
// สถานะใบขายที่วางบิลได้ (ตรงกับ RPC erp_playground_billing_note_create)
// วางบิลได้ทุกสถานะ ยกเว้นยกเลิก — รวมใบร่าง (เจ้าของเลือก 2026-11-03 · ตรงกับ RPC erp_playground_billing_note_create)

export default function BillingNotesPage() {
  const canView   = usePermission("so.view");
  const canCreate = usePermission("so.create");
  const { user } = useAuth();

  const [rows,    setRows]    = useState<BillingNoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState<string | null>(null);
  const [customer,  setCustomer]  = useState<CustomerPickerValue | null>(null);
  const [billDate,  setBillDate]  = useState(new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [note,      setNote]      = useState("");
  const [picked,    setPicked]    = useState<PickedSO[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // สร้างใหม่ = เลือกได้หลายลูกค้า → ออกใบวางบิลแยกตามลูกค้า (เจ้าของสั่ง 2026-11-03) · แก้ไข = ลูกค้าเดียวเหมือนเดิม
  const [dueByCustomer, setDueByCustomer] = useState<Record<string, string>>({});   // วันครบกำหนดที่แก้เอง (ทับค่าจากเครดิต)
  // เครดิตลูกค้า (partners_v2.sales_credit_term) → คิดวันครบกำหนดให้ · undefined = ยังโหลด · null = ยังไม่ตั้ง
  const [terms, setTerms] = useState<Map<string, string | null>>(new Map());
  const [creditEdit, setCreditEdit] = useState<{ customerId: string; term: string | null; saving: boolean; err: string | null } | null>(null);
  // ใบกำกับที่อยู่ในใบวางบิลอื่นแล้ว → ล็อกในตัวเลือก (so_id → เลขใบวางบิล)
  const [billedSo, setBilledSo] = useState<Map<string, { billId: string; billNumber: string | null }>>(new Map());
  const canEditCredit = usePermission("so.edit");
  const [created, setCreated] = useState<CreatedBill[] | null>(null);
  const [history, setHistory] = useState<ActivityEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // detail
  const [detail,        setDetail]        = useState<BillingNoteDetail | null>(null);
  const [detailOpen,    setDetailOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wfLoading,     setWfLoading]     = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const fetchList = useCallback(async () => {
    // SWR-lite: กลับเข้าหน้าเดิม → โชว์ของแคชทันที แล้ว revalidate เงียบ
    const cached = peekSWR<BillingNoteListItem[]>("billing-notes:list");
    if (cached) { setRows(cached); setLoading(false); } else { setLoading(true); }
    setError(null);
    try {
      const res = await apiFetch("/api/billing-notes?limit=200");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data = (json.data ?? []) as BillingNoteListItem[];
      setRows(data); mutateSWR("billing-notes:list", data);
    } catch (err) { if (!cached) setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) fetchList(); }, [canView, fetchList]);

  // ใบกำกับที่วางบิลไปแล้ว (โหลดทุกครั้งที่เปิดป๊อป — สดเสมอ)
  const loadBilledSo = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing-notes/billed-sos");
      const json = await res.json();
      const m = new Map<string, { billId: string; billNumber: string | null }>();
      for (const r of (json.data ?? []) as { so_id: string; billing_note_id: string; bill_number: string | null }[]) {
        m.set(r.so_id, { billId: r.billing_note_id, billNumber: r.bill_number });
      }
      setBilledSo(m);
    } catch { /* ล็อกบนจอไม่ได้ก็ยังมี RPC กันซ้ำ */ }
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setCustomer(null); setBillDate(new Date().toISOString().slice(0, 10)); setDueDate("");
    setNote(""); setPicked([]); setDueByCustomer({}); setCreditEdit(null); setFormErr(null); setModalOpen(true);
    void loadBilledSo();
  };
  useNewParam(canCreate, openCreate);   // ลิงก์ `?new=1` (คำสั่งลัดจาก Global Search) → เปิดฟอร์มสร้างใหม่ให้เลย

  // แก้ไข (ร่างเท่านั้น) → เติมฟอร์มจากรายละเอียด
  const openEdit = (d: BillingNoteDetail) => {
    setEditingId(d.id);
    setCustomer(d.customer_id ? ({ id: d.customer_id, code: d.customer_code ?? null, name: d.customer_name ?? "" } as CustomerPickerValue) : null);
    setBillDate(d.bill_date ? String(d.bill_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setDueDate(d.due_date ? String(d.due_date).slice(0, 10) : "");
    setNote(d.note ?? "");
    setPicked(d.lines.map(l => ({
      id: l.so_id ?? "", so_number: l.so_number ?? "(ร่าง)", grand_total: Number(l.total_amount) || 0,
      customer_id: l.customer_id ?? d.customer_id ?? null, customer_name: l.customer_name ?? d.customer_name ?? "",
    })).filter(p => p.id));
    setDueByCustomer({}); setCreditEdit(null);
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
    void loadBilledSo();
  };

  // คัดลอก → ใบใหม่ ก๊อปวันที่/หมายเหตุ แต่ต้องเลือก SO ใหม่ (SO เดิมถูกวางบิลแล้ว วางซ้ำไม่ได้)
  const openDuplicate = (d: BillingNoteDetail) => {
    openEdit(d);
    setEditingId(null);
    setPicked([]);
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    // ประวัติ (audit log กลาง) — โหลดคู่กันแต่ไม่ขวางรายละเอียด
    setHistory([]); setHistoryLoading(true);
    apiFetch(`/api/audit-logs?entity_id=${id}&limit=30`).then(r => r.json())
      .then((j: { data?: ActivityEntry[] }) => setHistory(j.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
    try {
      const res = await apiFetch(`/api/billing-notes/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDetail(json.data as BillingNoteDetail);
    } catch (err) { flash(err instanceof Error ? err.message : "โหลดไม่ได้"); setDetailOpen(false); }
    finally { setDetailLoading(false); }
  };

  // ลิงก์ตรงถึงใบ: /billing-notes?open=<id> (เช่นกดจากกระดานเงินสด)
  useOpenParam(canView, openDetail);

  // เลือกใบกำกับภาษี (SO) เข้าใบวางบิล
  const handlePicked = (rowsPicked: SourceDocRow[]) => {
    if (editingId) {
      // แก้ไขใบเดิม = ลูกค้าเดียวเหมือนเดิม (1 ใบวางบิล = 1 ลูกค้า)
      // ล็อก "ลูกค้าเดียวกัน" เฉพาะตอนมีรายการดึงไว้แล้ว — ถ้ายังไม่มี ให้ลูกค้าของใบที่เลือกใหม่เป็นตัวกำหนด
      const lockedCust = picked.length > 0 ? customer?.id : undefined;
      const custSet = new Set([lockedCust, ...rowsPicked.map(r => r.customer_id as string)].filter(Boolean));
      if (custSet.size > 1) { flash("ใบที่เลือกเป็นคนละลูกค้า — ใบที่แก้อยู่วางบิลได้เฉพาะลูกค้าเดียวกัน"); return; }
      const first = rowsPicked[0];
      if (picked.length === 0 && first?.customer_id) {
        setCustomer({ id: first.customer_id as string, code: (first.customer_code as string) ?? null, name: (first.customer_name as string) ?? "" } as CustomerPickerValue);
      }
    }
    // สร้างใหม่ = ติ๊กได้หลายลูกค้า → ระบบแยกเป็นใบวางบิลตามลูกค้าตอนกดสร้าง
    setPicked(prev => {
      const seen = new Set(prev.map(p => p.id));
      const add = rowsPicked.filter(r => !seen.has(r.id)).map(r => ({
        id: r.id, so_number: (r.so_number as string) ?? "(ร่าง)", grand_total: Number(r.grand_total) || 0,
        customer_id: (r.customer_id as string | null) ?? null, customer_name: (r.customer_name as string) ?? "",
        status: r.status as string | undefined,
      }));
      // เรียงจากเลขน้อยไปมาก (001 ก่อน) — ทั้งการแสดงและลำดับที่ส่งไปสร้างบิล
      return [...prev, ...add].sort((a, b) => a.so_number.localeCompare(b.so_number, undefined, { numeric: true }));
    });
  };
  const removePicked = (id: string) => {
    const next = picked.filter(p => p.id !== id);
    setPicked(next);
    if (next.length === 0) setCustomer(null);   // ไม่เหลือรายการ → ปลดล็อกลูกค้า เลือกลูกค้าคนใหม่ได้
  };

  const pickedTotal = useMemo(() => picked.reduce((s, p) => s + p.grand_total, 0), [picked]);
  // พรีวิว "จะออกกี่ใบ" — แยกตามลูกค้า (server แยกบริษัทผู้ขายซ้ำอีกชั้น ตอนนี้ทุกใบเป็นบริษัทเดียว)
  const groups = useMemo(() => {
    const m = new Map<string, { customer_id: string; customer_name: string; items: PickedSO[]; total: number }>();
    for (const p of picked) {
      const k = p.customer_id ?? "";
      const g = m.get(k) ?? { customer_id: k, customer_name: p.customer_name || "(ไม่มีลูกค้า)", items: [], total: 0 };
      g.items.push(p); g.total += p.grand_total;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name, "th"));
  }, [picked]);
  // ใบที่ยกเลิกแล้ว/อยู่ในใบวางบิลอื่นแล้ว (ระบบจะไม่สร้างทั้งชุด) → เตือนก่อนกด · ใบร่างวางบิลได้
  const notBillable = picked.filter(p => p.status === "cancelled"
    || (billedSo.has(p.id) && billedSo.get(p.id)?.billId !== editingId));

  // ---- กำหนดชำระจากเครดิตลูกค้า ----
  const groupCustomerKey = groups.map(g => g.customer_id).filter(Boolean).join(",");
  useEffect(() => {
    const need = groupCustomerKey.split(",").filter(id => id && !terms.has(id));
    if (!need.length) return;
    apiFetch(`/api/billing-notes/customer-terms?ids=${need.join(",")}`).then(r => r.json())
      .then((j: { data?: { id: string; term: string | null }[] }) => setTerms(prev => {
        const next = new Map(prev);
        need.forEach(id => { if (!next.has(id)) next.set(id, null); });
        for (const t of j.data ?? []) next.set(t.id, t.term);
        return next;
      }))
      .catch(() => { /* ไม่มีเครดิต = ใช้กำหนดชำระที่กรอกเอง */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดเฉพาะลูกค้าที่ยังไม่มีในแคช
  }, [groupCustomerKey]);
  /** วันครบกำหนดของใบ: แก้เอง > คิดจากเครดิต (นับจากวันที่วางบิล) > ค่าเริ่มต้นที่กรอกด้านบน */
  const dueFor = (customerId: string) =>
    dueByCustomer[customerId] ?? (computeDueDate(billDate, terms.get(customerId) ?? null) ?? dueDate);
  const saveCredit = async () => {
    if (!creditEdit) return;
    setCreditEdit({ ...creditEdit, saving: true, err: null });
    try {
      const res = await apiFetch("/api/billing-notes/customer-terms", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: creditEdit.customerId, term: creditEdit.term }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTerms(prev => new Map(prev).set(creditEdit.customerId, creditEdit.term));
      // ตั้งเครดิตแล้ว → ใบนี้กลับไปใช้วันตามเครดิต (ล้างวันที่แก้เองของลูกค้านี้)
      setDueByCustomer(prev => { const n = { ...prev }; delete n[creditEdit.customerId]; return n; });
      setCreditEdit(null);
      flash("บันทึกเครดิตลูกค้าแล้ว");
    } catch (err) {
      setCreditEdit({ ...creditEdit, saving: false, err: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" });
    }
  };

  // ยอดใบลดหนี้ที่หักจากบิลที่เปิดดูอยู่ (แยกก่อน VAT / VAT / รวม) — ใช้ทั้งในตารางรายการและยอดสรุป
  const { creditSub, creditVat, creditTotal } = useMemo(() => {
    const list = detail?.credit_notes ?? [];
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      creditSub:   r2(list.reduce((sum, c) => sum + c.diff_amount, 0)),
      creditVat:   r2(list.reduce((sum, c) => sum + c.vat_amount, 0)),
      creditTotal: r2(list.reduce((sum, c) => sum + c.grand_total, 0)),
    };
  }, [detail]);

  const save = async () => {
    if (picked.length === 0) { setFormErr("เลือกใบกำกับภาษีอย่างน้อย 1 ใบ"); return; }
    if (notBillable.length) {
      setFormErr(`วางบิลไม่ได้: ${notBillable.map(p => {
        const b = billedSo.get(p.id);
        return p.status === "cancelled" ? `${p.so_number} (ยกเลิกแล้ว)` : `${p.so_number} (อยู่ในใบวางบิล ${b?.billNumber ?? "อื่น"} แล้ว)`;
      }).join(", ")} — เอาออกก่อน`);
      return;
    }
    if (editingId && !customer) { setFormErr("ไม่พบลูกค้า — เลือกใบกำกับภาษีก่อน"); return; }
    setSaving(true); setFormErr(null);
    try {
      if (editingId && customer) {
        const res = await apiFetch(`/api/billing-notes/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            header: {
              customer_id: customer.id, customer_name: customer.name, customer_code: customer.code,
              bill_date: billDate, due_date: dueDate || null, note: note || null,
            },
            so_ids: picked.map(p => p.id),
            actor: user?.name,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        flash("บันทึกแล้ว");
        setModalOpen(false);
      } else {
        // สร้างใหม่: ส่งทั้งกอง server แยกเป็นใบวางบิลตามลูกค้า × บริษัทผู้ขาย ใน transaction เดียว (ใบไหนไม่ผ่าน = ไม่สร้างเลย)
        const res = await apiFetch("/api/billing-notes/batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            so_ids: picked.map(p => p.id), bill_date: billDate, due_date: dueDate || null, note: note || null,
            // ส่งวันครบกำหนดที่เห็นบนจอของทุกใบ (แก้เอง / จากเครดิต / ค่าเริ่มต้น) — server ใช้ตามนี้
            due_by_customer: Object.fromEntries(groups.filter(g => g.customer_id).map(g => [g.customer_id, dueFor(g.customer_id) || null])),
            actor: user?.name,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        const bills = (json.data ?? []) as CreatedBill[];
        setModalOpen(false);
        if (bills.length > 1) setCreated(bills);   // หลายใบ → โชว์ผลพร้อมปุ่มพิมพ์ทั้งหมด
        else flash(`สร้างใบวางบิลแล้ว${bills[0]?.bill_number ? ` ${bills[0].bill_number}` : ""}`);
      }
      await fetchList();
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const transition = async (id: string, action: string, reason?: string) => {
    setWfLoading(true);
    try {
      const res = await apiFetch(`/api/billing-notes/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: user?.name, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // ย้อนสถานะใบที่ยกเลิก: ถ้าเลขเดิมถูกใบใหม่ใช้ไปแล้ว (ระบบนำเลขที่ยกเลิกกลับมาใช้) ใบนี้จะได้เลขใหม่ — ต้องบอกให้รู้
      const result = (json.data ?? {}) as { bill_number?: string; renumbered_from?: string | null };
      flash(result.renumbered_from
        ? `ย้อนสถานะแล้ว · เลข ${result.renumbered_from} ถูกใบอื่นใช้ไปแล้ว จึงได้เลขใหม่ ${result.bill_number}`
        : ({ issue: "วางบิลแล้ว", pay: "ชำระแล้ว", cancel: "ยกเลิกแล้ว", revert: "ย้อนสถานะแล้ว" }[action] ?? "อัปเดตแล้ว"));
      setDetailOpen(false);
      await fetchList();
    } catch (err) { flash(err instanceof Error ? err.message : "ผิดพลาด"); }
    finally { setWfLoading(false); }
  };

  const columns: ColumnDef<BillingNoteListItem>[] = useMemo(() => [
    {
      id: "bill_number", accessorKey: "bill_number", header: "เลขที่ใบวางบิล", size: 150,
      cell: ({ getValue }) => { const n = getValue() as string | null; return n ? <code className="font-mono text-xs">{n}</code> : <span className="text-xs text-slate-400">(ร่าง)</span>; },
    },
    { id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 240 },
    {
      id: "status", accessorKey: "status", header: "สถานะ", size: 120,
      cell: ({ getValue }) => { const s = getValue() as string; return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{STATUS_LABEL[s] ?? s}</span>; },
    },
    { id: "grand_total", accessorKey: "grand_total", header: "ยอดรวม", size: 130, cell: ({ getValue }) => <span className="tabular-nums font-mono block text-right">{baht(getValue() as number)}</span> },
    // ยอดที่ต้องเก็บจริง = ยอดรวม − ใบลดหนี้ที่ออกให้ใบกำกับในบิลนี้
    { id: "net_amount_due", accessorKey: "net_amount_due", header: "ยอดที่ต้องเก็บ", size: 150,
      cell: ({ row }) => {
        const credit = Number(row.original.credit_total ?? 0);
        const net = Number(row.original.net_amount_due ?? row.original.amount_due ?? 0);
        return (
          <span className="block text-right">
            <span className="tabular-nums font-mono font-semibold">{baht(net)}</span>
            {credit > 0 && <span className="block text-[10px] text-red-600">หักใบลดหนี้ −{baht(credit)}</span>}
          </span>
        );
      } },
    { id: "bill_date", accessorKey: "bill_date", header: "วันที่", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "due_date", accessorKey: "due_date", header: "กำหนดชำระ", size: 110, cell: ({ getValue }) => <span>{formatDate(getValue())}</span> },
    { id: "line_count", accessorKey: "line_count", header: "จำนวนบิล", size: 90, cell: ({ getValue }) => <span className="text-xs text-slate-500">{getValue() as number}</span> },
    {
      id: "actions", header: "", size: 90, enableSorting: false,
      cell: ({ row }) => (
        <a href={`/print/billing-note/${row.original.id}`} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()} title="พิมพ์ใบวางบิล"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
          🧾 พิมพ์
        </a>
      ),
    },
  ], []);

  const views = useMemo(() => [
    // ทั้งหมด = ซ่อนใบที่ยกเลิก (มาตรฐานเดียวกับใบขาย/ใบส่งสินค้า)
    { id: "all",       label: "ทั้งหมด",          filter: (r: Record<string, unknown>) => r.status !== "cancelled" },
    { id: "draft",     label: "📝 ยังไม่วางบิล",  filter: (r: Record<string, unknown>) => r.status === "draft" },
    { id: "issued",    label: "📤 วางบิลแล้ว",    filter: (r: Record<string, unknown>) => r.status === "issued" },
    { id: "paid",      label: "✅ ชำระแล้ว",      filter: (r: Record<string, unknown>) => r.status === "paid" },
    { id: "cancelled", label: "❌ ยกเลิก",       filter: (r: Record<string, unknown>) => r.status === "cancelled" },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">📄 ใบวางบิล</h1>
            <p className="text-sm text-slate-500">รวมใบกำกับภาษีของลูกค้ามาวางบิล — workflow: ร่าง → วางบิล → รับชำระ</p>
          </div>
          {canCreate && (
            <button onClick={openCreate} className="h-10 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ สร้างใบวางบิล</button>
          )}
        </div>

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable
          tableId="master-billing-notes"
          data={rows}
          columns={columns}
          views={views}
          loading={loading}
          searchableKeys={["bill_number", "customer_name", "customer_code"]}
          searchPlaceholder="ค้นหา เลขที่ / ลูกค้า..."
          exportFilename="billing-notes"
          pageSize={20}
          onRowClick={(r) => openDetail(r.id)}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Create / Edit */}
      <ERPModal open={modalOpen} onClose={() => !saving && setModalOpen(false)} size="xl"
        title={editingId ? "แก้ไขใบวางบิล" : "สร้างใบวางบิล"}
        description={editingId
          ? "เลือกใบกำกับภาษีของลูกค้ารายเดียวกัน ระบบจะรวมยอดให้อัตโนมัติ"
          : "เลือกใบกำกับได้หลายลูกค้าในครั้งเดียว — ระบบแยกออกเป็นใบวางบิลตามลูกค้าให้อัตโนมัติ"}
        footer={
          <>
            <div className="mr-auto flex flex-wrap items-baseline gap-2">
              <span className="text-xs text-slate-500">{editingId ? `รวม ${picked.length} ใบ` : `ใบกำกับ ${picked.length} ใบ`}</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-700">{baht(pickedTotal)}</span>
              {!editingId && groups.length > 0 && (
                <span className="text-xs font-medium text-slate-700">→ ใบวางบิล {groups.length} ใบ</span>
              )}
            </div>
            <button onClick={() => setModalOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : groups.length > 1 ? `สร้างใบวางบิล ${groups.length} ใบ` : "สร้างใบวางบิล"}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            {editingId ? (
              <div className="md:col-span-1">
                <span className="text-xs font-medium text-slate-600">ลูกค้า <span className="text-slate-400">(มาจากใบที่เลือก)</span></span>
                <div className="mt-1">
                  <CustomerPicker value={customer} onChange={setCustomer} />
                </div>
                {customer && <RecordPeekLink moduleKey="partners-v2" recordId={customer.id} label={customer.code ? `${customer.code} - ${customer.name}` : customer.name} />}
              </div>
            ) : (
              <label className="block">
                <span className="text-xs font-medium text-slate-600">หมายเหตุ <span className="text-slate-400">(ทุกใบ)</span></span>
                <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </label>
            )}
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่{!editingId && <span className="text-slate-400"> (ทุกใบ)</span>}</span>
              <div className="mt-1"><DateInput value={billDate} onChange={setBillDate} /></div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">กำหนดชำระ{!editingId && <span className="text-slate-400"> (ใบที่ยังไม่ตั้งเครดิต)</span>}</span>
              <div className="mt-1"><DateInput value={dueDate} onChange={setDueDate} /></div>
              {/* แก้ไขใบเดิม: เสนอวันตามเครดิตลูกค้า (กดใช้ได้ ไม่ทับเอง) */}
              {editingId && customer && (() => {
                const term = terms.get(customer.id);
                const auto = computeDueDate(billDate, term ?? null);
                return auto && auto !== dueDate ? (
                  <button type="button" onClick={() => setDueDate(auto)} className="mt-1 text-left text-[11px] text-blue-700 hover:underline">
                    ใช้ตามเครดิตลูกค้า ({formatCreditTerm(term)}) → {formatDate(auto)}
                  </button>
                ) : null;
              })()}
            </div>
          </div>

          {!editingId ? (
            /* สร้างใหม่: จัดกลุ่มตามลูกค้า = 1 กลุ่ม 1 ใบวางบิล */
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">ใบกำกับภาษีที่จะวางบิล <span className="text-xs font-normal text-slate-400">({picked.length})</span></h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">ติ๊กได้หลายลูกค้า · แต่ละลูกค้า (แต่ละสาขา) ได้ใบวางบิลของตัวเอง · วันครบกำหนดคิดจากเครดิตลูกค้า (แก้เองได้)</p>
                </div>
                <button type="button" onClick={() => setPickerOpen(true)} className="h-9 shrink-0 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">+ เลือกใบกำกับภาษี</button>
              </div>
              {groups.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">กด &quot;+ เลือกใบกำกับภาษี&quot; เพื่อเริ่ม</div>
              )}
              {groups.map((g, gi) => (
                <div key={g.customer_id || gi} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">ใบที่ {gi + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={g.customer_name}>{g.customer_name}</span>
                    <span className="text-[11px] text-slate-500">{g.items.length} บิล</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-800">{baht(g.total)}</span>
                    {g.customer_id && (() => {
                      const term = terms.get(g.customer_id);
                      const auto = computeDueDate(billDate, term ?? null);
                      const manual = dueByCustomer[g.customer_id] !== undefined && dueByCustomer[g.customer_id] !== auto;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          {term === undefined ? <span className="text-slate-400">กำลังดูเครดิต…</span>
                            : term ? (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700" title="เครดิตจากทะเบียนลูกค้า นับจากวันที่วางบิล">
                                เครดิต {formatCreditTerm(term)}
                              </span>
                            ) : (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">ยังไม่ตั้งเครดิต</span>
                            )}
                          {canEditCredit && term !== undefined && creditEdit?.customerId !== g.customer_id && (
                            <button type="button" onClick={() => setCreditEdit({ customerId: g.customer_id, term: term ?? null, saving: false, err: null })}
                              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">
                              {term ? "แก้เครดิต" : "+ ตั้งเครดิต"}
                            </button>
                          )}
                          <span>ครบกำหนด</span>
                          <span className="w-36"><DateInput value={dueFor(g.customer_id)}
                            onChange={(v) => setDueByCustomer(prev => ({ ...prev, [g.customer_id]: v }))} /></span>
                          {manual && auto && (
                            <button type="button" title="กลับไปใช้วันตามเครดิต"
                              onClick={() => setDueByCustomer(prev => { const n = { ...prev }; delete n[g.customer_id]; return n; })}
                              className="text-blue-700 hover:underline">ตามเครดิต</button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* ตั้ง/แก้เครดิตลูกค้า → บันทึกกลับทะเบียนลูกค้า (ใช้กับใบถัด ๆ ไปด้วย) */}
                  {creditEdit?.customerId === g.customer_id && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-sky-50/60 px-4 py-2.5">
                      <span className="text-xs text-slate-700">เครดิตของ <b className="font-medium">{g.customer_name}</b></span>
                      <PurchaseCreditTermInput value={creditEdit.term} onChange={(v) => setCreditEdit({ ...creditEdit, term: v, err: null })}
                        disabled={creditEdit.saving} />
                      <button type="button" onClick={() => void saveCredit()} disabled={creditEdit.saving || !creditEdit.term}
                        className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        {creditEdit.saving ? "กำลังบันทึก…" : "บันทึกเข้าทะเบียนลูกค้า"}
                      </button>
                      <button type="button" onClick={() => setCreditEdit(null)} disabled={creditEdit.saving}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                      {creditEdit.err && <span className="text-xs text-red-600">{creditEdit.err}</span>}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {g.items.map(p => {
                        const blocked = notBillable.some(n => n.id === p.id);
                        return (
                          <tr key={p.id} className={blocked ? "bg-red-50/60" : ""}>
                            <td className="px-4 py-2">
                              <code className="font-mono text-xs text-slate-700">{p.so_number}</code>
                              {blocked && (
                                <span className="ml-2 text-[11px] text-red-600">
                                  {p.status === "cancelled" ? "ยกเลิกแล้ว — เอาออก" : `อยู่ในใบวางบิล ${billedSo.get(p.id)?.billNumber ?? "อื่น"} แล้ว — เอาออก`}
                                </span>
                              )}
                              {!blocked && p.status === "draft" && (
                                <span className="ml-2 text-[11px] text-amber-700" title="ยอดคัดลอกตอนสร้างใบวางบิล — ถ้าแก้ยอดใบสั่งขายทีหลัง ให้กดแก้ไขใบวางบิล → บันทึก เพื่อดึงยอดใหม่">
                                  ใบร่าง
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{baht(p.grand_total)}</td>
                            <td className="w-10 px-1 py-2 text-center"><button type="button" onClick={() => removePicked(p.id)} aria-label="เอาออก" className="h-7 w-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500">x</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ) : (
          /* แก้ไขใบเดิม: ลูกค้าเดียว */
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">ใบกำกับภาษีที่วางบิล <span className="text-xs font-normal text-slate-400">({picked.length})</span></h3>
                <p className="mt-0.5 text-[11px] text-slate-400">เลือกได้เฉพาะใบของลูกค้าเดียวกัน (รวมใบร่าง)</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(true)} className="h-9 shrink-0 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">+ เลือกใบกำกับภาษี</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold">เลขที่บิล</th>
                    <th className="px-3 py-2 text-right font-semibold">ยอดรวม</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {picked.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{p.so_number}</code></td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{baht(p.grand_total)}</td>
                      <td className="px-1 py-2 text-center"><button type="button" onClick={() => removePicked(p.id)} className="h-7 w-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500">x</button></td>
                    </tr>
                  ))}
                  {picked.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">กด &quot;+ เลือกใบกำกับภาษี&quot; เพื่อเริ่ม</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {editingId && (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
              <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
            </label>
          )}
        </div>
      </ERPModal>

      {/* ผลจากสร้างทีเดียวหลายใบ — เลขที่แต่ละใบ + พิมพ์ทีละใบ / พิมพ์ทั้งหมด */}
      <ERPModal open={!!created} onClose={() => setCreated(null)} size="lg"
        title={`สร้างใบวางบิลแล้ว ${created?.length ?? 0} ใบ`}
        description="แยกตามลูกค้าเรียบร้อย — ทุกใบสถานะ “ยังไม่วางบิล”"
        footer={created ? (
          <>
            <button onClick={() => setCreated(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <a href={`/print/billing-note-bulk?ids=${created.map(c => c.id).join(",")}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">
              <Icon name="print" /> พิมพ์ทั้งหมด ({created.length} ใบ)
            </a>
          </>
        ) : null}>
        {created && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {created.map(c => (
                  <tr key={c.id}>
                    <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{c.bill_number ?? "(ร่าง)"}</code></td>
                    <td className="px-3 py-2">
                      <span className="block text-slate-800">{c.customer_name ?? "—"}</span>
                      <span className="text-[11px] text-slate-400">{c.so_count} บิล</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(c.grand_total)}</td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/print/billing-note/${c.id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                        <Icon name="print" /> พิมพ์
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ERPModal>

      {/* SO picker */}
      {pickerOpen && (
        <SourceDocPickerModal open={pickerOpen} mode="so" onClose={() => setPickerOpen(false)} onConfirm={handlePicked}
          hint={editingId ? undefined : "ติ๊กได้หลายลูกค้า — ตอนสร้างระบบแยกเป็นใบวางบิลตามลูกค้าให้"}
          rowDisabled={(r) => {
            const b = billedSo.get(r.id);
            return b && b.billId !== editingId ? `อยู่ในใบวางบิล ${b.billNumber ?? "อื่น"} แล้ว` : null;
          }} />
      )}

      {/* Detail */}
      <ERPModal open={detailOpen} onClose={() => setDetailOpen(false)} size="xl"
        title={detail ? `ใบวางบิล ${detail.bill_number ?? "(ร่าง)"}` : "ใบวางบิล"}
        footer={detail ? (
          <>
            <button onClick={() => setDetailOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
            <button onClick={() => openDuplicate(detail)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">📋 คัดลอก</button>
            {detail.bill_number && (
              <a href={`/print/billing-note/${detail.id}`} target="_blank" rel="noopener noreferrer"
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center">🧾 พิมพ์ใบวางบิล</a>
            )}
            {detail.status === "draft" && (
              <button onClick={() => openEdit(detail)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
            )}
            {detail.status === "draft" && (
              <button onClick={() => transition(detail.id, "issue")} disabled={wfLoading} className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">📤 วางบิล</button>
            )}
            {detail.status === "issued" && (
              <button onClick={() => transition(detail.id, "pay")} disabled={wfLoading} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ รับชำระ</button>
            )}
            {(detail.status === "draft" || detail.status === "issued") && (
              <button onClick={() => transition(detail.id, "cancel")} disabled={wfLoading} className="h-9 px-4 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">⊘ ยกเลิก</button>
            )}
            {/* ใบร่างลบได้เลย (ของกลาง) — ใบที่วางบิลแล้วใช้ ยกเลิก */}
            {detail.status === "draft" && (
              <DeleteDraftButton apiPath="/api/billing-notes" id={detail.id} docLabel="ใบวางบิล" number={detail.bill_number} disabled={wfLoading}
                onDeleted={(msg) => { flash(msg); setDetailOpen(false); void fetchList(); }} />
            )}
            {(detail.status === "issued" || detail.status === "paid" || detail.status === "cancelled") && (
              <button onClick={() => { if (confirm("ย้อนสถานะกลับหนึ่งขั้น?")) transition(detail.id, "revert"); }} disabled={wfLoading}
                className="h-9 px-4 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50">↩ ย้อนสถานะ</button>
            )}
          </>
        ) : null}>
        {detailLoading || !detail ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Info label="ลูกค้า" value={detail.customer_name} />
              <Info label="วันที่" value={formatDate(detail.bill_date)} />
              <Info label="กำหนดชำระ" value={formatDate(detail.due_date)} />
              <Info label="สถานะ" value={STATUS_LABEL[detail.status] ?? detail.status} />
              <div className="md:col-span-3"><Info label="ที่อยู่" value={detail.customer_address || "—"} /></div>
              <Info label="เลขประจำตัวผู้เสียภาษี" value={detail.customer_tax_id || "—"} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-center font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">เลขที่บิล</th>
                    <th className="px-3 py-2 text-left font-semibold">วันที่บิล</th>
                    <th className="px-3 py-2 text-right font-semibold">จำนวนเงิน</th>
                    <th className="px-3 py-2 text-right font-semibold">ภาษี</th>
                    <th className="px-3 py-2 text-right font-semibold">รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td className="px-3 py-2 text-center font-mono text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{l.so_number ?? "—"}</code></td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(l.bill_date)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(l.amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{baht(l.vat_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{baht(l.total_amount)}</td>
                    </tr>
                  ))}
                  {/* ใบลดหนี้ = บรรทัดติดลบต่อท้าย (ให้เหมือนใบที่พิมพ์ออกมา) */}
                  {(detail.credit_notes ?? []).map((c, i) => (
                    <tr key={c.id} className="bg-red-50/50 text-red-700">
                      <td className="px-3 py-2 text-center font-mono text-xs">{detail.lines.length + i + 1}</td>
                      <td className="px-3 py-2">
                        <code className="font-mono text-xs">{c.cn_number ?? "ใบลดหนี้"}</code>
                        <span className="block text-[10px] opacity-80">ลดหนี้ {c.ref_invoice_no ?? "—"}{c.reason ? ` · ${c.reason}` : ""}</span>
                      </td>
                      <td className="px-3 py-2">{formatDate(c.cn_date)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">-{baht(c.diff_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">-{baht(c.vat_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">-{baht(c.grand_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-w-md ml-auto">
              <Row label="จำนวนเงิน" value={baht(detail.subtotal - creditSub)} />
              <Row label="ภาษีมูลค่าเพิ่ม" value={baht(detail.total_vat - creditVat)} />
              <Row label="จำนวนเงินทั้งสิ้น" value={baht(detail.grand_total - creditTotal)} />
              <Row label="หัก ณ ที่จ่าย" value={baht(detail.total_wht)} />
              <Row label="จำนวนเงินที่ชำระ" value={baht(detail.net_amount_due ?? detail.amount_due)} bold />
            </div>

            {detail.note && <p className="text-sm text-slate-500">หมายเหตุ: {detail.note}</p>}

            {/* ประวัติ (audit log กลาง) */}
            <section>
              <h4 className="mb-2 text-xs font-semibold text-slate-500">ประวัติ</h4>
              <ActivityFeed entries={history} loading={historyLoading} compact emptyMessage="ยังไม่มีประวัติ" />
            </section>
          </div>
        )}
      </ERPModal>
    </PlaygroundShell>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="text-sm text-slate-800">{value || "—"}</p></div>;
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`col-span-2 flex justify-between ${bold ? "font-semibold border-t border-slate-200 pt-1 mt-1" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums font-mono ${bold ? "text-blue-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
