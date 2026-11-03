"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { DeleteDraftButton } from "@/components/delete-draft-doc";
import { CustomerPicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { Icon } from "@/components/icon";
import {
  MIX_LEVEL_LABEL, MIX_REASON_CHIPS, mixLevelOf, normTaxId, partyLabel, relationTo, validateMix,
  type BillingParty, type MixLevel, type MixRelation,
} from "@/lib/billing-mix";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { peekSWR, mutateSWR } from "@/lib/swr-lite";
import { formatDate } from "@/lib/date";
import { useOpenParam, useNewParam } from "@/lib/open-param";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
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

type PickedSO = { id: string; so_number: string; grand_total: number; customer_id: string | null; customer_name: string };

// ป้ายความสัมพันธ์กับลูกค้าหลัก (ใช้ทั้งตารางในป๊อปและตัวเลือกใบกำกับ)
const REL_PILL: Record<MixRelation, { label: string; cls: string } | null> = {
  0: null,
  1: { label: "คนละสาขา · บริษัทเดียวกัน", cls: "bg-amber-100 text-amber-800" },
  2: { label: "คนละบริษัท", cls: "bg-red-100 text-red-700" },
};
const MIX_PILL: Record<MixLevel, string> = {
  branch: "bg-amber-100 text-amber-800", company: "bg-red-100 text-red-700",
};

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
  // รวมใบกำกับคนละลูกค้า/คนละสาขา → ต้องมีเหตุผล (+ ติ๊กยืนยันถ้าคนละบริษัท) — DB ตรวจซ้ำอีกชั้น
  const [mixReason, setMixReason] = useState("");
  const [mixAck,    setMixAck]    = useState(false);
  const [wasCompanyMix, setWasCompanyMix] = useState(false);   // แก้ใบที่ยืนยันรวมคนละบริษัทไว้แล้ว → ไม่ต้องติ๊กซ้ำ
  // เลขผู้เสียภาษี/สาขาของลูกค้า (ใช้แยก "คนละสาขา" กับ "คนละบริษัท")
  const [parties, setParties] = useState<Map<string, BillingParty>>(new Map());
  const partiesRef = useRef(parties);
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

  // ดึงเลขผู้เสียภาษีของลูกค้าที่ยังไม่มีในแคช (ทีละ 100)
  const ensureParties = useCallback(async (ids: (string | null | undefined)[]) => {
    const need = [...new Set(ids.filter((x): x is string => !!x))].filter(id => !partiesRef.current.has(id));
    for (let i = 0; i < need.length; i += 100) {
      try {
        const res = await apiFetch(`/api/billing-notes/parties?ids=${need.slice(i, i + 100).join(",")}`);
        const json = await res.json();
        if (json.error) continue;
        const next = new Map(partiesRef.current);
        for (const p of (json.data ?? []) as BillingParty[]) next.set(p.id, p);
        partiesRef.current = next;
        setParties(next);
      } catch { /* เตือนบนจอไม่ได้ก็ยังมีด่าน DB ตรวจตอนบันทึก */ }
    }
  }, []);
  useEffect(() => { if (customer?.id) void ensureParties([customer.id]); }, [customer?.id, ensureParties]);

  const resetMix = () => { setMixReason(""); setMixAck(false); setWasCompanyMix(false); };

  const openCreate = () => {
    setEditingId(null);
    setCustomer(null); setBillDate(new Date().toISOString().slice(0, 10)); setDueDate("");
    setNote(""); setPicked([]); resetMix(); setFormErr(null); setModalOpen(true);
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
      customer_id: l.customer_id ?? null, customer_name: l.customer_name ?? "",
    })).filter(p => p.id));
    setMixReason(d.mix_reason ?? ""); setMixAck(false); setWasCompanyMix(d.mix_level === "company");
    void ensureParties([d.customer_id, ...d.lines.map(l => l.customer_id)]);
    setFormErr(null); setDetailOpen(false); setModalOpen(true);
  };

  // คัดลอก → ใบใหม่ ก๊อปลูกค้า/วันที่/หมายเหตุ แต่ต้องเลือก SO ใหม่ (SO เดิมถูกวางบิลแล้ว วางซ้ำไม่ได้)
  const openDuplicate = (d: BillingNoteDetail) => {
    openEdit(d);
    setEditingId(null);
    setPicked([]);
    resetMix();
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetailLoading(true); setDetail(null);
    setHistory([]); setHistoryLoading(true);
    // ประวัติ (audit log กลาง) — โหลดคู่กันแต่ไม่ขวางรายละเอียด
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
    // เลือกใบของลูกค้าอื่น/สาขาอื่นได้แล้ว (เจ้าของสั่ง 2026-11-03) — หน้าจอเตือน + ขอเหตุผลก่อนบันทึก
    // ยังไม่มีรายการ → ลูกค้าของใบแรกที่เลือกเป็น "ลูกค้าหลัก" (ชื่อบนใบ) · เปลี่ยนได้ทีหลัง
    const first = rowsPicked[0];
    if (picked.length === 0 && first?.customer_id) {
      setCustomer({ id: first.customer_id as string, code: (first.customer_code as string) ?? null, name: (first.customer_name as string) ?? "" } as CustomerPickerValue);
    }
    void ensureParties(rowsPicked.map(r => r.customer_id as string | null));
    setPicked(prev => {
      const seen = new Set(prev.map(p => p.id));
      const add = rowsPicked.filter(r => !seen.has(r.id)).map(r => ({
        id: r.id, so_number: (r.so_number as string) ?? "(ร่าง)", grand_total: Number(r.grand_total) || 0,
        customer_id: (r.customer_id as string | null) ?? null, customer_name: (r.customer_name as string) ?? "",
      }));
      // เรียงจากเลขน้อยไปมาก (001 ก่อน) — ทั้งการแสดงและลำดับที่ส่งไปสร้างบิล
      return [...prev, ...add].sort((a, b) => a.so_number.localeCompare(b.so_number, undefined, { numeric: true }));
    });
  };
  const removePicked = (id: string) => {
    const next = picked.filter(p => p.id !== id);
    setPicked(next);
    if (next.length === 0) { setCustomer(null); return; }   // ไม่เหลือรายการ → ปลดล็อกลูกค้า เลือกลูกค้าคนใหม่ได้
    // ลบใบสุดท้ายของลูกค้าหลักออก → ย้ายชื่อบนใบไปเป็นลูกค้าของใบที่เหลือใบแรก
    if (customer && !next.some(p => p.customer_id === customer.id) && next[0].customer_id) {
      setCustomer({ id: next[0].customer_id, code: partiesRef.current.get(next[0].customer_id)?.code ?? null, name: next[0].customer_name } as CustomerPickerValue);
    }
  };

  const pickedTotal = useMemo(() => picked.reduce((s, p) => s + p.grand_total, 0), [picked]);

  // ---- ลูกค้าปน: ความสัมพันธ์ของแต่ละใบกับลูกค้าหลัก → ระดับของทั้งใบ ----
  const relOf = useCallback((custId: string | null | undefined): MixRelation =>
    relationTo(customer?.id, custId, parties), [customer?.id, parties]);
  // ยังโหลดเลขผู้เสียภาษีไม่ครบ → ยังไม่ตัดสินว่าเป็นคนละบริษัท (กันป้ายแดงกะพริบ)
  const mixPending = !!customer && picked.some(p => p.customer_id && p.customer_id !== customer.id
    && (!parties.has(p.customer_id) || !parties.has(customer.id)));
  const mixLevel = useMemo(() => mixPending ? null : mixLevelOf(picked.map(p => relOf(p.customer_id))), [picked, relOf, mixPending]);
  // ลูกค้าทั้งหมดในใบ (ตัวเลือก "ออกใบในชื่อ")
  const billCustomers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of picked) if (p.customer_id && !m.has(p.customer_id)) m.set(p.customer_id, p.customer_name);
    return m;
  }, [picked]);
  // แนะนำ "สำนักงานใหญ่" เมื่อในใบมีบิลของ สนญ. บริษัทเดียวกัน แต่ชื่อบนใบยังเป็นสาขา
  const hqSuggestion = useMemo(() => {
    if (!customer || billCustomers.size < 2) return null;
    const mainTax = normTaxId(parties.get(customer.id)?.tax_id);
    const isHq = (p?: BillingParty) => !!p && /^0*$/.test(String(p.tax_branch ?? "").trim());
    if (isHq(parties.get(customer.id))) return null;
    for (const id of billCustomers.keys()) {
      const p = parties.get(id);
      if (id !== customer.id && isHq(p) && mainTax.length === 13 && normTaxId(p?.tax_id) === mainTax) return p ?? null;
    }
    return null;
  }, [customer, billCustomers, parties]);
  const chooseMainCustomer = (id: string) => {
    const p = parties.get(id);
    setCustomer({ id, code: p?.code ?? null, name: p?.name || billCustomers.get(id) || "" } as CustomerPickerValue);
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
    if (!customer) { setFormErr("ไม่พบลูกค้า — เลือกใบกำกับภาษีก่อน"); return; }
    if (mixPending) { setFormErr("กำลังตรวจเลขผู้เสียภาษีของลูกค้า รอสักครู่แล้วกดอีกครั้ง"); return; }
    const mixErr = validateMix(mixLevel, mixReason, mixAck, wasCompanyMix);
    if (mixErr) { setFormErr(mixErr); return; }
    setSaving(true); setFormErr(null);
    try {
      const res = await apiFetch(editingId ? `/api/billing-notes/${editingId}` : "/api/billing-notes", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: {
            customer_id: customer.id, customer_name: customer.name, customer_code: customer.code,
            bill_date: billDate, due_date: dueDate || null, note: note || null,
            // DB ตรวจซ้ำ: รวมคนละลูกค้าต้องมีเหตุผล · คนละบริษัทต้องติ๊กยืนยัน (ลูกค้าเดียว → ไม่ส่ง)
            ...(mixLevel ? { mix_reason: mixReason.trim(), mix_ack: mixAck } : {}),
          },
          so_ids: picked.map(p => p.id),
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(editingId ? "บันทึกแล้ว" : "สร้างใบวางบิลแล้ว");
      setModalOpen(false);
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
    {
      id: "customer_name", accessorKey: "customer_name", header: "ลูกค้า", size: 260,
      cell: ({ row }) => {
        const mix = row.original.mix_level;
        return (
          <span className="block min-w-0">
            <span className="block truncate">{row.original.customer_name ?? "—"}</span>
            {mix && (
              <span title={row.original.mix_reason ? `เหตุผล: ${row.original.mix_reason}` : undefined}
                className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${MIX_PILL[mix]}`}>
                {MIX_LEVEL_LABEL[mix]}
              </span>
            )}
          </span>
        );
      },
    },
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
    // ใบที่รวมใบกำกับของสาขาอื่น/ลูกค้าอื่น (มีเหตุผลกำกับ)
    { id: "mixed",     label: "รวมหลายลูกค้า",    filter: (r: Record<string, unknown>) => !!r.mix_level && r.status !== "cancelled" },
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
        description="เลือกใบกำกับภาษีที่จะวางบิลรวมกัน ระบบรวมยอดให้อัตโนมัติ · ถ้าเป็นคนละสาขา/คนละลูกค้า ระบบจะเตือนและขอเหตุผล"
        footer={
          <>
            <div className="mr-auto flex items-baseline gap-2">
              <span className="text-xs text-slate-500">รวม {picked.length} ใบ</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-700">{baht(pickedTotal)}</span>
              {mixLevel && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] ${MIX_PILL[mixLevel]}`}>
                  {mixLevel === "branch" ? `${billCustomers.size} สาขา` : `${billCustomers.size} ลูกค้า`}
                </span>
              )}
            </div>
            <button onClick={() => setModalOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : `${editingId ? "บันทึกการแก้ไข" : "สร้างใบวางบิล"}${mixLevel ? ` (${MIX_LEVEL_LABEL[mixLevel]})` : ""}`}
            </button>
          </>
        }>
        <div className="space-y-4">
          {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
            <div className="md:col-span-1">
              {billCustomers.size > 1 ? (
                <>
                  {/* ในใบมีหลายลูกค้า → เลือกได้เฉพาะลูกค้าที่อยู่ในใบ ว่าจะออกใบวางบิล "ในชื่อ" ใคร */}
                  <span className="text-xs font-medium text-slate-600">ออกใบวางบิลในชื่อ <span className="text-slate-400">(ลูกค้าหลัก)</span></span>
                  <div className="mt-1">
                    <SearchableSelect value={customer?.id ?? ""} onChange={chooseMainCustomer}
                      options={[...billCustomers].map(([id, name]) => {
                        const p = parties.get(id);
                        return { value: id, label: p?.name || name, sub: p ? partyLabel(p, true) : undefined };
                      })} />
                  </div>
                  {hqSuggestion ? (
                    <button type="button" onClick={() => chooseMainCustomer(hqSuggestion.id)}
                      className="mt-1 text-left text-[11px] text-blue-700 hover:underline">
                      ใช้สำนักงานใหญ่เป็นชื่อบนใบ <span className="text-slate-400">(บริษัทใหญ่มักรับวางบิลที่ สนญ.)</span>
                    </button>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">ค่าเริ่มต้น = ลูกค้าของใบแรก · เปลี่ยนได้</p>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-slate-600">ลูกค้า <span className="text-slate-400">(มาจากใบที่เลือก)</span></span>
                  <div className="mt-1">
                    <CustomerPicker value={customer} onChange={setCustomer} />
                  </div>
                  {customer && <RecordPeekLink moduleKey="partners-v2" recordId={customer.id} label={customer.code ? `${customer.code} - ${customer.name}` : customer.name} />}
                </>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">วันที่</span>
              <div className="mt-1"><DateInput value={billDate} onChange={setBillDate} /></div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-600">กำหนดชำระ</span>
              <div className="mt-1"><DateInput value={dueDate} onChange={setDueDate} /></div>
            </div>
          </div>

          {/* เตือน: ใบนี้รวมใบกำกับของสาขาอื่น / ลูกค้าอื่น */}
          {mixLevel === "branch" && customer && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="warning" /> ใบวางบิลนี้รวม {billCustomers.size} สาขาของบริษัทเดียวกัน</p>
              <p className="mt-0.5 text-xs">
                เลขผู้เสียภาษี {normTaxId(parties.get(customer.id)?.tax_id)} ตรงกัน · ใบพิมพ์ออกชื่อ &quot;{customer.name}&quot;
                และบอกสาขาของแต่ละบิลในช่องหมายเหตุ · ต้องใส่เหตุผล
              </p>
            </div>
          )}
          {mixLevel === "company" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="forbidden" /> ใบวางบิลนี้รวมลูกค้าคนละบริษัท</p>
              <p className="mt-0.5 text-xs">
                เลขผู้เสียภาษีไม่ตรงกัน (หรือลูกค้าบางรายยังไม่มีเลขในทะเบียน) — ฝ่ายบัญชีลูกค้าอาจไม่รับใบนี้ · ต้องใส่เหตุผล + ติ๊กยืนยัน
              </p>
            </div>
          )}

          {/* รายการบิล */}
          <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">ใบกำกับภาษีที่วางบิล <span className="text-xs font-normal text-slate-400">({picked.length})</span></h3>
                <p className="mt-0.5 text-[11px] text-slate-400">เลือกได้เฉพาะ SO ที่ยืนยันแล้ว · ใบของสาขาอื่น/ลูกค้าอื่นเลือกได้ แต่ต้องใส่เหตุผล</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(true)} className="h-9 shrink-0 rounded-lg border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">+ เลือกใบกำกับภาษี</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold">เลขที่บิล</th>
                    {billCustomers.size > 1 && <th className="px-3 py-2 text-left font-semibold">ลูกค้า / สาขา</th>}
                    <th className="px-3 py-2 text-right font-semibold">ยอดรวม</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {picked.map(p => {
                    const rel = mixPending ? 0 : relOf(p.customer_id);
                    const pill = REL_PILL[rel];
                    const party = p.customer_id ? parties.get(p.customer_id) : undefined;
                    return (
                      <tr key={p.id} className={rel === 2 ? "bg-red-50/60" : rel === 1 ? "bg-amber-50/60" : ""}>
                        <td className="px-3 py-2"><code className="font-mono text-xs text-slate-700">{p.so_number}</code></td>
                        {billCustomers.size > 1 && (
                          <td className="px-3 py-2">
                            <span className="block text-xs text-slate-700">{party ? partyLabel(party, rel < 2) : p.customer_name || "—"}</span>
                            {pill
                              ? <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${pill.cls}`}>{pill.label}</span>
                              : <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{mixPending ? "กำลังตรวจสาขา..." : "ลูกค้าหลัก"}</span>}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{baht(p.grand_total)}</td>
                        <td className="px-1 py-2 text-center"><button type="button" onClick={() => removePicked(p.id)} className="h-7 w-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500">x</button></td>
                      </tr>
                    );
                  })}
                  {picked.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">กด &quot;+ เลือกใบกำกับภาษี&quot; เพื่อเริ่ม</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* เหตุผลที่รวม — บังคับเมื่อปนลูกค้า · เก็บในระบบ (ประวัติ + หน้ารายการ) ไม่พิมพ์ให้ลูกค้า */}
          {mixLevel && (
            <div className={`rounded-lg border px-3 py-3 ${mixLevel === "company" ? "border-red-200" : "border-amber-200"}`}>
              <span className="text-xs font-medium text-slate-600">
                เหตุผลที่รวมบิล <span className="text-red-500">*</span> <span className="font-normal text-slate-400">— เก็บในระบบ ไม่พิมพ์ให้ลูกค้าเห็น</span>
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MIX_REASON_CHIPS[mixLevel].map(t => (
                  <button key={t} type="button"
                    onClick={() => { setMixReason(r => r.trim() ? `${r.trim()} · ${t}` : t); setFormErr(null); }}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                    {t}
                  </button>
                ))}
              </div>
              <textarea value={mixReason} rows={2}
                onChange={e => { setMixReason(e.target.value); setFormErr(null); }}
                placeholder="เช่น ลูกค้าขอรวมวางบิลที่สำนักงานใหญ่ เดือน พ.ย."
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              {mixLevel === "company" && !wasCompanyMix && (
                <label className="mt-1.5 flex items-center gap-2 text-xs text-red-700">
                  <input type="checkbox" checked={mixAck} onChange={e => { setMixAck(e.target.checked); setFormErr(null); }} className="rounded border-red-300" />
                  ตรวจแล้ว ลูกค้าตกลงให้รวมบิลคนละบริษัทในใบเดียว
                </label>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={note} onChange={e => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </label>
        </div>
      </ERPModal>

      {/* SO picker */}
      {pickerOpen && (
        <SourceDocPickerModal open={pickerOpen} mode="so" onClose={() => setPickerOpen(false)} onConfirm={handlePicked}
          hint={customer ? `ใบของ "${customer.name}" อยู่บนสุด · เลือกใบของสาขาอื่น/ลูกค้าอื่นได้ แต่ต้องใส่เหตุผลก่อนบันทึก` : undefined}
          onRowsLoaded={rows => { void ensureParties(rows.map(r => r.customer_id as string | null)); }}
          rowRank={customer ? r => relOf(r.customer_id as string | null) : undefined}
          rowTag={customer ? r => {
            const cid = r.customer_id as string | null;
            if (!cid || cid === customer.id || !parties.has(cid) || !parties.has(customer.id)) return null;
            const pill = REL_PILL[relOf(cid)];
            return pill ? <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] ${pill.cls}`}>{pill.label}</span> : null;
          } : undefined} />
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

            {/* ใบรวมหลายสาขา/หลายลูกค้า — เหตุผลที่บันทึกไว้ (ไม่พิมพ์) */}
            {detail.mix_level && (
              <div className={`rounded-lg border px-3 py-2 ${detail.mix_level === "company" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon name={detail.mix_level === "company" ? "forbidden" : "warning"} />
                  {detail.mix_level === "company" ? "รวมลูกค้าคนละบริษัท" : "รวมหลายสาขา บริษัทเดียวกัน"}
                </p>
                <p className="mt-0.5 text-xs">เหตุผล: {detail.mix_reason || "—"}</p>
                <p className="mt-0.5 text-xs">
                  ใบของลูกค้าอื่น: {detail.lines.filter(l => l.customer_id && l.customer_id !== detail.customer_id)
                    .map(l => `${l.so_number ?? "—"}${l.note ? ` (${l.note})` : ""}`).join(", ") || "—"}
                </p>
              </div>
            )}

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
                      <td className="px-3 py-2">
                        <code className="font-mono text-xs text-slate-700">{l.so_number ?? "—"}</code>
                        {/* ใบรวมหลายลูกค้า: ระบบใส่สาขา/ลูกค้าของบิลนี้ไว้ (ช่องหมายเหตุในใบพิมพ์) */}
                        {l.note && <span className="block text-[10px] text-slate-500">{l.note}</span>}
                      </td>
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

            {/* ประวัติ (audit log กลาง) — การรวมลูกค้า + เหตุผล ขึ้นเป็น "เดิม → ใหม่" */}
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
