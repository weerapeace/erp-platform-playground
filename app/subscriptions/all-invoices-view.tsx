"use client";

/**
 * มุมมอง "ใบเสร็จ" — รวมใบเสร็จ PDF ของทุก subscription + กรองตามเดือน
 * ใช้ DataTable กลาง (ค้นหา/เรียง/ส่งออก) · เปิด/ลบไฟล์ได้
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { toTHB, fmtBaht, fmtCost, invoiceFileIcon, INVOICE_ACCEPT_ATTR, invoiceFileKind, type SubSettings, type SubInvoice, type Currency, type Subscription } from "@/lib/subscriptions";
import { MissingInvoicesPanel } from "./missing-invoices-panel";

type InvoiceRow = SubInvoice & { sub_name: string | null; sub_email: string | null; sub_profile: string | null; sub_card_name: string | null };

function fmtMonth(ym: string): string {
  const [y, m] = (ym ?? "").split("-");
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const idx = parseInt(m, 10) - 1;
  return names[idx] ? `${names[idx]} ${Number(y) + 543}` : ym;
}
// signed url + บังคับดาวน์โหลด (Supabase รองรับ ?download=ชื่อไฟล์)
const dlUrl = (u: string, n: string) => `${u}${u.includes("?") ? "&" : "?"}download=${encodeURIComponent(n)}`;

type EditForm = { subscription_id: string; month: string; amount: string; currency: string; invoice_date: string };
const EMPTY_EDIT: EditForm = { subscription_id: "", month: "", amount: "", currency: "THB", invoice_date: "" };

export function AllInvoicesView({ canEdit, settings, subs }: { canEdit: boolean; settings: SubSettings; subs: Subscription[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  // แก้ไขใบเสร็จที่แนบไว้ (เดือน/รายการ/ยอด/วันที่/เปลี่ยนไฟล์)
  const [editInv, setEditInv] = useState<InvoiceRow | null>(null);
  const [ef, setEf] = useState<EditForm>(EMPTY_EDIT);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0); // บอกพาเนล "บิลที่ยังขาด" ให้โหลดใหม่เมื่อข้อมูลใบเสร็จเปลี่ยน

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/subscriptions/invoices");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as InvoiceRow[]);
      setMonths((j.months ?? []) as string[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดใบเสร็จไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (month === "all" ? rows : rows.filter((r) => r.month === month)),
    [rows, month],
  );
  const totalTHB = useMemo(
    () => filtered.reduce((s, r) => s + (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0), 0),
    [filtered, settings],
  );

  const handleDelete = useCallback(async (inv: InvoiceRow) => {
    if (!confirm(`ลบใบเสร็จ "${inv.file_name}"?`)) return;
    try {
      const res = await apiFetch(`/api/subscriptions/${inv.subscription_id}/invoices/${inv.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ลบใบเสร็จแล้ว");
      setRows((prev) => prev.filter((r) => r.id !== inv.id));
      setTick((t) => t + 1); // ลบแล้วเดือนนั้นอาจกลับไปเป็น "บิลที่ยังขาด"
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast]);

  const openEditInv = useCallback((inv: InvoiceRow) => {
    setEditInv(inv);
    setNewFile(null);
    if (editFileRef.current) editFileRef.current.value = "";
    setEf({
      subscription_id: inv.subscription_id,
      month: inv.month ?? "",
      amount: inv.amount != null ? String(inv.amount) : "",
      currency: inv.currency || "THB",
      invoice_date: inv.invoice_date ?? "",
    });
  }, []);

  /** เลือกไฟล์ใหม่ → ถ้าเป็น PDF อ่านยอด/วันที่มาเติมให้ (แก้ต่อได้ก่อนบันทึก) */
  const pickNewFile = useCallback(async (f: File) => {
    setNewFile(f);
    if (invoiceFileKind(f.name, f.type) !== "pdf") return;
    setDetecting(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await apiFetch("/api/subscriptions/parse-invoice", { method: "POST", body: fd });
      const j = await res.json();
      setEf((p) => ({
        ...p,
        month: j.month || p.month,
        amount: j.amount != null ? String(j.amount) : p.amount,
        currency: j.currency || p.currency,
        invoice_date: j.dateISO || p.invoice_date,
      }));
    } catch { /* อ่านไม่ได้ก็กรอกเอง */ }
    finally { setDetecting(false); }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editInv) return;
    if (!/^\d{4}-\d{2}$/.test(ef.month)) { toast.warning("กรุณาเลือกเดือนของใบเสร็จ"); return; }
    setSavingEdit(true);
    try {
      const fields = {
        subscription_id: ef.subscription_id,
        month: ef.month,
        amount: ef.amount.trim() === "" ? null : Number(ef.amount),
        currency: ef.currency,
        invoice_date: ef.invoice_date || null,
      };
      // มีไฟล์ใหม่ → ส่งเป็น multipart (API เดียวกัน) · ไม่มี → ส่ง JSON เหมือนเดิม
      const init: RequestInit = newFile
        ? (() => {
            const fd = new FormData();
            fd.append("file", newFile);
            Object.entries(fields).forEach(([k, v]) => fd.append(k, v == null ? "" : String(v)));
            return { method: "PATCH", body: fd };
          })()
        : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) };

      const res = await apiFetch(`/api/subscriptions/${editInv.subscription_id}/invoices/${editInv.id}`, init);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("แก้ไขใบเสร็จแล้ว");
      setEditInv(null);
      setNewFile(null);
      setTick((t) => t + 1);
      await load(); // ย้ายรายการ/เดือนแล้ว ชื่อรายการ+ลิงก์ไฟล์เปลี่ยน → โหลดใหม่ให้ตรง
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ"); }
    finally { setSavingEdit(false); }
  }, [editInv, ef, newFile, toast, load]);

  const unparsed = useMemo(() => rows.filter((r) => !r.parsed_at).length, [rows]);

  /**
   * ตัวเลือก "รายการ" ในป๊อปอัปแก้ไข — เรียงตามชื่อ
   * ⚠️ ตารางนี้รวมใบเสร็จของรายการส่วนตัวด้วย แต่ subs ที่ส่งมาเป็นรายการงานเท่านั้น
   *    ถ้าไม่มีรายการปัจจุบันอยู่ใน list ต้องใส่เพิ่ม ไม่งั้น dropdown จะเด้งไปตัวแรก = ย้ายใบเสร็จโดยไม่ตั้งใจ
   */
  const subOptions = useMemo(() => {
    const list = [...subs].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: s.name }));
    if (editInv && !list.some((s) => s.id === editInv.subscription_id)) {
      list.unshift({ id: editInv.subscription_id, name: editInv.sub_name ?? "(รายการปัจจุบัน)" });
    }
    return list;
  }, [subs, editInv]);

  // อ่าน PDF ที่แนบไว้แล้ว (ย้อนหลัง) — วนจนหมด
  const runBackfill = useCallback(async () => {
    setBackfilling(true);
    try {
      let total = 0, withData = 0, guard = 0;
      while (guard++ < 20) {
        const res = await apiFetch("/api/subscriptions/invoices/parse-existing", { method: "POST" });
        const j = await res.json();
        if (j.error) throw new Error(j.error);
        total += j.processed ?? 0; withData += j.withData ?? 0;
        if ((j.remaining ?? 0) <= 0 || (j.processed ?? 0) === 0) break;
      }
      toast.success(`อ่านบิลแล้ว ${total} ใบ · พบข้อมูล ${withData} ใบ`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "อ่านไม่สำเร็จ"); }
    finally { setBackfilling(false); }
  }, [toast, load]);

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
    { id: "month", accessorKey: "month", header: "เดือน", size: 120,
      cell: ({ getValue }) => <span className="text-sm text-slate-700">{fmtMonth(getValue() as string)}</span> },
    { id: "sub_name", accessorKey: "sub_name", header: "รายการ", size: 220,
      cell: ({ getValue }) => <span className="text-sm font-medium text-slate-800">{(getValue() as string) || "—"}</span> },
    { id: "sub_card_name", accessorKey: "sub_card_name", header: "ชื่อในบิลบัตร", size: 170,
      cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className="text-xs text-slate-600">{v}</span> : <span className="text-xs text-slate-300">—</span>; } },
    { id: "profile", accessorKey: "sub_profile", header: "โปรไฟล์/บัญชี", size: 200,
      meta: { filterable: true, filterType: "select", filterLabel: "โปรไฟล์/บัญชี" },
      cell: ({ row }) => {
        const inv = row.original;
        return <span className="text-xs text-slate-500 truncate block" title={inv.sub_email ?? ""}>{inv.sub_profile || inv.sub_email || "—"}</span>;
      } },
    { id: "invoice_date", accessorKey: "invoice_date", header: "วันที่ตัด (ในบิล)", size: 120,
      cell: ({ getValue }) => { const d = getValue() as string | null; return <span className="text-xs text-slate-600">{d || <span className="text-slate-300">—</span>}</span>; } },
    { id: "amount", accessorKey: "amount", header: "จำนวนเงิน", size: 120,
      cell: ({ row }) => { const inv = row.original; if (inv.amount == null) return <span className="text-xs text-slate-300">—</span>;
        const neg = Number(inv.amount) < 0;
        return <span className={`text-sm font-mono tabular-nums ${neg ? "text-red-600" : "text-slate-700"}`}>{fmtCost(Number(inv.amount), (inv.currency || "THB") as Currency)}</span>; } },
    { id: "amount_thb", header: "≈ ฿ (บาท)", size: 130,
      accessorFn: (r) => (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0),
      meta: {
        // รวมยอดท้ายตาราง (บาท) — รวมทุกแถวที่กรอง (function form เพราะเป็นคอลัมน์คำนวณ)
        summary: (rs) => {
          const t = (rs as InvoiceRow[]).reduce((a, r) => a + (r.amount != null ? toTHB(Number(r.amount), (r.currency || "THB") as Currency, settings) : 0), 0);
          return <span className={t < 0 ? "text-red-700" : "text-indigo-700"}>{fmtBaht(t)}</span>;
        },
      },
      cell: ({ row }) => { const inv = row.original; if (inv.amount == null) return <span className="text-xs text-slate-300">—</span>;
        const thb = toTHB(Number(inv.amount), (inv.currency || "THB") as Currency, settings);
        return <span className={`text-sm font-mono tabular-nums ${thb < 0 ? "text-red-600" : "text-indigo-600"}`}>{fmtBaht(thb, 2)}</span>; } },
    { id: "file_name", accessorKey: "file_name", header: "ไฟล์", size: 260,
      cell: ({ getValue }) => { const n = getValue() as string;
        return <span className="text-sm text-slate-600 inline-flex items-center gap-1.5"><span>{invoiceFileIcon(n)}</span><span className="truncate">{n}</span></span>; } },
    {
      id: "actions", header: "", size: 190, enableSorting: false,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {inv.url ? (
              <>
                <a href={inv.url} target="_blank" rel="noopener noreferrer" title="เปิดดู"
                  className="h-7 px-2.5 inline-flex items-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">🔗 เปิด</a>
                <a href={dlUrl(inv.url, inv.file_name)} title="ดาวน์โหลดไฟล์"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">⬇</a>
              </>
            ) : <span className="text-xs text-slate-300">—</span>}
            {canEdit && (
              <>
                <button onClick={() => openEditInv(inv)} title="แก้ไขจำนวนเงิน/วันที่"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs hover:bg-slate-50">✎</button>
                <button onClick={() => handleDelete(inv)} title="ลบ"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">🗑</button>
              </>
            )}
          </div>
        );
      },
    },
  ], [canEdit, handleDelete, openEditInv, settings]);

  return (
    <div className="space-y-3">
      {/* บิลที่ยังขาด */}
      <MissingInvoicesPanel canEdit={canEdit} refreshKey={tick} monthFilter={month}
        onAttached={() => { setTick((t) => t + 1); load(); }} />

      {/* ตัวกรองเดือน */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-xs font-medium text-slate-500">เดือน:</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="h-9 px-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-indigo-400">
            <option value="all">ทุกเดือน ({rows.length})</option>
            {months.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)} ({rows.filter((r) => r.month === m).length})</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">แสดง {filtered.length} ใบเสร็จ · รวม ≈ <b className={totalTHB < 0 ? "text-red-600" : "text-indigo-600"}>{fmtBaht(totalTHB)}</b></span>
        {canEdit && unparsed > 0 && (
          <button onClick={runBackfill} disabled={backfilling}
            className="ml-auto h-9 px-3 text-xs font-medium border border-indigo-200 text-indigo-600 bg-white rounded-lg hover:bg-indigo-50 disabled:opacity-50"
            title="อ่านไฟล์ PDF ที่แนบไว้แล้ว เพื่อดึงวันที่/ยอดเงิน">
            {backfilling ? "กำลังอ่าน…" : `🔄 อ่านบิลที่แนบ (${unparsed})`}
          </button>
        )}
      </div>

      <DataTable
        tableId="subscription-invoices"
        data={filtered}
        columns={columns}
        loading={loading}
        searchableKeys={["sub_name", "sub_card_name", "sub_profile", "sub_email", "file_name", "month"]}
        searchPlaceholder="ค้นหา รายการ / ชื่อไฟล์…"
        exportFilename="subscription-invoices"
        exportEntityType="subscription_invoices"
        pageSize={25}
        emptyMessage="ยังไม่มีใบเสร็จ — อัปโหลดได้ที่ปุ่ม 🧾 ของแต่ละรายการ"
      />

      {/* แก้ไขใบเสร็จที่แนบไว้ */}
      <ERPModal open={!!editInv} onClose={() => !savingEdit && setEditInv(null)} size="md"
        title="✎ แก้ไขใบเสร็จที่แนบไว้" description={editInv ? `${editInv.sub_name ?? ""} · ${editInv.file_name}` : undefined}
        footer={
          <>
            <button onClick={() => setEditInv(null)} disabled={savingEdit} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={saveEdit} disabled={savingEdit} className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{savingEdit ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>
        }>
        {editInv && (
          <div className="space-y-3">
            {/* รายการ + เดือน — แก้ตอนแนบผิดรายการ/ผิดเดือน */}
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="text-xs font-medium text-slate-600">รายการ (ใบเสร็จนี้เป็นของอะไร)</span>
                <select value={ef.subscription_id} onChange={(e) => setEf({ ...ef, subscription_id: e.target.value })}
                  className="mt-1 h-10 w-full px-2 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-indigo-400">
                  {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">เดือนของใบเสร็จ</span>
                <input type="month" value={ef.month} onChange={(e) => setEf({ ...ef, month: e.target.value })}
                  className="mt-1 h-10 w-full px-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
              </label>
            </div>
            {ef.subscription_id !== editInv.subscription_id && (
              <p className="text-[11px] text-amber-600">⚠️ ย้ายใบเสร็จนี้ไปอยู่ใต้รายการใหม่ (ไฟล์จะถูกย้ายตามไปด้วย)</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="text-xs font-medium text-slate-600">จำนวนเงิน</span>
                <input type="number" step="0.01" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })}
                  placeholder="เว้นว่าง = ไม่ระบุ"
                  className="mt-1 h-10 w-full px-3 rounded-lg border border-slate-200 text-sm tabular-nums outline-none focus:border-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">สกุลเงิน</span>
                <select value={ef.currency} onChange={(e) => setEf({ ...ef, currency: e.target.value })}
                  className="mt-1 h-10 w-full px-2 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:border-indigo-400">
                  {["THB", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">วันที่ตัด (ในบิล)</span>
              <input type="date" value={ef.invoice_date} onChange={(e) => setEf({ ...ef, invoice_date: e.target.value })}
                className="mt-1 h-10 w-full px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
            </label>

            {/* เปลี่ยนไฟล์ (แนบผิดไฟล์/ได้ไฟล์ที่ชัดกว่า) */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="text-xs font-medium text-slate-600">ไฟล์บิล</div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>{invoiceFileIcon(editInv.file_name)}</span>
                <span className="flex-1 min-w-0 truncate" title={editInv.file_name}>{editInv.file_name}</span>
                {editInv.url && (
                  <a href={editInv.url} target="_blank" rel="noopener noreferrer"
                    className="h-7 px-2.5 inline-flex items-center rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 flex-shrink-0">🔗 เปิด</a>
                )}
              </div>
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-1">เปลี่ยนเป็นไฟล์อื่น (ไม่เลือก = ใช้ไฟล์เดิม)</span>
                <input ref={editFileRef} type="file" accept={INVOICE_ACCEPT_ATTR}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) pickNewFile(f); else setNewFile(null); }}
                  className="h-9 w-full text-sm file:mr-2 file:h-7 file:rounded-md file:border-0 file:bg-indigo-100 file:px-2 file:text-indigo-700 file:text-xs" />
              </label>
              {detecting && <p className="text-[11px] text-slate-400">🔍 กำลังอ่านไฟล์ใหม่…</p>}
              {newFile && !detecting && (
                <p className="text-[11px] text-emerald-600">
                  จะแทนที่ด้วย <b>{newFile.name}</b>
                  {invoiceFileKind(newFile.name, newFile.type) === "pdf" ? " (อ่านค่าจากบิลมาเติมให้แล้ว — แก้ได้)" : " (เป็นรูป อ่านยอดอัตโนมัติไม่ได้)"}
                  <br /><span className="text-slate-400">ไฟล์เดิมจะถูกลบเมื่อกดบันทึก</span>
                </p>
              )}
            </div>

            <p className="text-[11px] text-slate-400">แก้เองแล้วปุ่ม &ldquo;🔄 อ่านบิลที่แนบ&rdquo; จะไม่ทับค่านี้</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
