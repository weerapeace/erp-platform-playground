"use client";

/**
 * ใบสำคัญรับ (ใบซื้อ) — /purchasing/vouchers
 *   แท็บ 1: 📥 ใบรับ GR ที่ยังไม่ออกใบสำคัญ → ติ๊กหลายใบ (ร้านเดียว/ชิปเมนต์เดียว) → "ออกใบสำคัญรับ" → ไปหน้าฟอร์ม
 *   แท็บ 2: 🧾 ใบสำคัญรับทั้งหมด (ร่าง/ยืนยันแล้ว) → คลิกเปิด
 *   ปุ่ม ＋ ออกใบสำคัญรับ (มุมขวาบน): เลือกจากใบรับที่รอ หรือสร้างเปล่า (ซื้อที่ไม่มีใบรับ) แล้วเพิ่มรายการเองในฟอร์ม
 *   แก้ = เปิดใบ (ร่าง) · ลบ = ปุ่ม "ยกเลิกใบร่าง" ในฟอร์ม · ใบรับ: 👁 รายละเอียด (แก้/ลบ) + ✎ แก้วันที่รับจากแถว
 * คนรับของใส่แค่จำนวนที่หน้ารับของ · หน้านี้เป็นของจัดซื้อ (ใส่ราคา + ค่าส่ง)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
// ⚠️ ต้องใช้ตัวนี้ (อ่านร้านจริงจาก partners_v2) — SupplierPicker ใน components/pickers อ่านตารางระบบจัดซื้อชุดเก่า (แทบว่าง)
import { SupplierPicker } from "@/components/supplier-picker";
import { SupplierWizard } from "@/components/supplier-wizard";
import { fmtMoney, curSymbol } from "@/lib/landed-cost";
import { GrDetailModal } from "@/components/gr-detail-modal";

type PendingGr = { id: string; gr_no: string; po_id: string | null; po_no: string; seller_name: string; receive_date: string | null; receiver: string; line_count: number; currency: string };
type VoucherRow = { id: string; pv_no: string | null; status: string; voucher_date: string; seller_name: string | null; currency: string; subtotal_thb: number; ship_total_thb: number; grand_total_thb: number; line_count: number; gr_nos: string[]; po_nos: string[]; ship_method: string };

const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  draft: { text: "ร่าง", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  confirmed: { text: "✅ ยืนยันแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { text: "❌ ยกเลิก", cls: "bg-red-50 text-red-700 border-red-200" },
};
const TAB_KEY = "pv_tab";

export default function PurchaseVouchersPage() {
  const router = useRouter();
  const toast = useToast();
  const canView = usePermission("products.cost.view");
  const canEdit = usePermission("products.edit");
  const [tab, setTab] = useState<"pending" | "vouchers">("pending");
  const [pending, setPending] = useState<PendingGr[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [vStatus, setVStatus] = useState<"all" | "draft" | "confirmed" | "cancelled">("all");
  const [detailGr, setDetailGr] = useState<PendingGr | null>(null);   // ป๊อปรายละเอียดใบรับ (ของกลาง GrDetailModal)
  // ป๊อป "＋ ออกใบสำคัญรับ": จากใบรับที่รอ หรือสร้างเปล่า
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"gr" | "manual">("gr");
  const [mSeller, setMSeller] = useState<{ id: string; name: string } | null>(null);
  const [mSellerText, setMSellerText] = useState("");
  const [mCur, setMCur] = useState<"THB" | "RMB">("THB");
  // ร้านจริงจากทะเบียน (partners_v2) — โหลดตอนเปิดป๊อปครั้งแรก · ไม่กรอง is_supplier เพราะหลายร้านไม่ได้ติ๊กไว้
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; cn?: boolean }[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  useEffect(() => {
    if (!addOpen || suppliers.length > 0) return;
    void apiFetch("/api/master-v2/partners?limit=2000").then((r) => r.json()).then((j) => {
      const data = (j.data ?? []) as Record<string, unknown>[];
      const nm = (p: Record<string, unknown>) => String(p.name_th ?? p.display_name ?? p.code ?? "");
      const isCn = (p: Record<string, unknown>) => p.is_taobao === true || /จีน|china/i.test(String(p.shop_country ?? "")) || String(p.default_currency ?? "") === "RMB";
      setSuppliers(data.filter((p) => p.is_active !== false).map((p) => ({ id: String(p.id), name: nm(p), cn: isCn(p) })).filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, "th")));
    }).catch(() => {});
  }, [addOpen, suppliers.length]);
  // เลือกร้านจีน → ตั้งสกุลเป็นหยวนให้ (แก้เองได้)
  const pickSeller = (sid: string, name: string) => {
    setMSeller(sid ? { id: sid, name } : null); setMSellerText("");
    const s = suppliers.find((x) => x.id === sid); if (s) setMCur(s.cn ? "RMB" : "THB");
  };
  // แก้วันที่รับของใบรับจากแถว
  const [dateEdit, setDateEdit] = useState<{ gr: PendingGr; value: string } | null>(null);
  const [dateSaving, setDateSaving] = useState(false);

  useEffect(() => { const t = localStorage.getItem(TAB_KEY); if (t === "pending" || t === "vouchers") setTab(t); }, []);
  const changeTab = (t: "pending" | "vouchers") => { setTab(t); localStorage.setItem(TAB_KEY, t); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, v] = await Promise.all([
        apiFetch("/api/purchasing/vouchers?pending=1").then((r) => r.json()),
        apiFetch(`/api/purchasing/vouchers?status=${vStatus}`).then((r) => r.json()),
      ]);
      setPending((p.data ?? []) as PendingGr[]);
      setVouchers((v.data ?? []) as VoucherRow[]);
    } catch { toast.error("โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [vStatus, toast]);
  useEffect(() => { if (canView) void load(); }, [load, canView]);

  const selRows = useMemo(() => pending.filter((g) => selected.has(g.id)), [pending, selected]);
  const selCurrencies = useMemo(() => [...new Set(selRows.map((g) => g.currency))], [selRows]);
  const selSellers = useMemo(() => [...new Set(selRows.map((g) => g.seller_name))], [selRows]);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // สร้างใบสำคัญจากใบรับที่ติ๊ก (หรือส่ง ids มาเจาะจง เช่น จากป๊อปรายละเอียด = ใบเดียว)
  const createVoucher = async (ids?: string[]) => {
    const grIds = ids ?? selRows.map((g) => g.id);
    if (grIds.length === 0) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/purchasing/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gr_ids: grIds }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`สร้างใบสำคัญรับ (ร่าง) จากใบรับ ${grIds.length} ใบแล้ว`);
      setSelected(new Set()); setAddOpen(false);
      router.push(`/purchasing/vouchers/${j.id}`);
    } catch (e) { toast.error("สร้างไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setCreating(false); }
  };
  // สร้างใบเปล่า (ไม่มีใบรับ) → ไปเพิ่มรายการเองในฟอร์ม
  const createManual = async () => {
    const seller = (mSeller?.name ?? mSellerText).trim();
    if (!seller) { toast.error("เลือกร้าน หรือพิมพ์ชื่อร้านก่อน"); return; }
    setCreating(true);
    try {
      const res = await apiFetch("/api/purchasing/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manual: { seller_name: seller, seller_partner_id: mSeller?.id ?? null, currency: mCur } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success("สร้างใบสำคัญรับ (ร่าง) แล้ว — เพิ่มรายการสินค้าในหน้าถัดไป");
      setAddOpen(false);
      router.push(`/purchasing/vouchers/${j.id}`);
    } catch (e) { toast.error("สร้างไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setCreating(false); }
  };
  const saveDate = async () => {
    if (!dateEdit) return;
    if (!dateEdit.value) { toast.error("วันที่รับเว้นว่างไม่ได้"); return; }
    setDateSaving(true);
    try {
      const res = await apiFetch(`/api/purchasing/goods-receipt/${dateEdit.gr.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receive_date: dateEdit.value }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`แก้วันที่รับ ${dateEdit.gr.gr_no} แล้ว`);
      setDateEdit(null);
      await load();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setDateSaving(false); }
  };

  const pendingCols = useMemo<MiniColumn<PendingGr>[]>(() => [
    { key: "gr_no", header: "เลขใบรับ", width: "9rem", sortValue: (g) => g.gr_no, cell: (g) => <span className="font-mono text-sm font-semibold text-slate-800">{g.gr_no}</span> },
    { key: "po_no", header: "ใบสั่งซื้อ", width: "9rem", sortValue: (g) => g.po_no, cell: (g) => <span className="font-mono text-xs text-slate-500">{g.po_no}</span> },
    { key: "seller", header: "ร้าน", width: "1.6fr", sortValue: (g) => g.seller_name, cell: (g) => <span className="block truncate" title={g.seller_name}>🏪 {g.seller_name}</span> },
    { key: "date", header: "วันที่รับ", width: "8.5rem", align: "center", sortValue: (g) => g.receive_date ?? "", cell: (g) => (
      <span className="text-xs text-slate-500 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {g.receive_date ? formatDate(g.receive_date) : "—"}
        {canEdit && <button onClick={() => setDateEdit({ gr: g, value: g.receive_date ?? "" })} title="แก้วันที่รับ" className="text-slate-400 hover:text-blue-600">✎</button>}
      </span>
    ) },
    { key: "receiver", header: "ผู้รับ", width: "8rem", cell: (g) => <span className="text-xs text-slate-500 truncate block">{g.receiver}</span> },
    { key: "cur", header: "สกุล", width: "4rem", align: "center", cell: (g) => <span className="text-xs">{curSymbol(g.currency)}</span> },
    { key: "n", header: "รายการ", width: "5rem", align: "right", sortValue: (g) => g.line_count, cell: (g) => <span className="tabular-nums">{g.line_count}</span> },
    { key: "actions", header: "", width: "11rem", align: "center", cell: (g) => (
      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setDetailGr(g)} title="ดูรายการในใบรับ / ไฟล์แนบ / แก้ไข / ลบ"
          className="text-xs text-slate-600 hover:text-blue-600 border border-slate-200 rounded-md px-2 h-7 inline-flex items-center hover:bg-slate-50">👁 รายละเอียด</button>
        <a href={`/print/goods-receipt/${g.id}`} target="_blank" rel="noreferrer"
          className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 h-7 inline-flex items-center hover:bg-slate-50">🖨</a>
      </div>
    ) },
  ], [canEdit]);

  const voucherCols = useMemo<MiniColumn<VoucherRow>[]>(() => [
    { key: "pv", header: "เลขที่", width: "9rem", sortValue: (v) => v.pv_no ?? "", cell: (v) => v.pv_no ? <span className="font-mono text-sm font-semibold text-slate-800">{v.pv_no}</span> : <span className="text-xs text-slate-400">— ร่าง —</span> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (v) => v.status, cell: (v) => { const b = STATUS_BADGE[v.status] ?? { text: v.status, cls: "bg-slate-100 text-slate-500 border-slate-200" }; return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>; } },
    { key: "seller", header: "ร้าน", width: "1.5fr", sortValue: (v) => v.seller_name ?? "", cell: (v) => <span className="block truncate" title={v.seller_name ?? ""}>🏪 {v.seller_name ?? "—"}</span> },
    { key: "date", header: "วันที่", width: "7rem", align: "center", sortValue: (v) => v.voucher_date, cell: (v) => <span className="text-xs text-slate-500">{formatDate(v.voucher_date)}</span> },
    { key: "refs", header: "ใบรับ / PO", width: "1.2fr", cell: (v) => <span className="text-[11px] text-slate-500 truncate block" title={[...v.gr_nos, ...v.po_nos].join(", ")}>{v.gr_nos.length === 0 && v.po_nos.length === 0 ? <span className="text-slate-300">สร้างเอง (ไม่มีใบรับ)</span> : <>{v.gr_nos.join(", ")}{v.po_nos.length ? ` · ${v.po_nos.join(", ")}` : ""}</>}</span> },
    { key: "n", header: "รายการ", width: "5rem", align: "right", sortValue: (v) => v.line_count, cell: (v) => <span className="tabular-nums">{v.line_count}</span> },
    { key: "goods", header: "ค่าสินค้า ฿", width: "8rem", align: "right", sortValue: (v) => v.subtotal_thb, cell: (v) => <span className="tabular-nums">{fmtMoney(v.subtotal_thb)}</span> },
    { key: "ship", header: "ค่าส่ง ฿", width: "7rem", align: "right", sortValue: (v) => v.ship_total_thb, cell: (v) => <span className={`tabular-nums ${v.ship_total_thb > 0 ? "text-orange-700" : "text-slate-300"}`}>{v.ship_total_thb > 0 ? fmtMoney(v.ship_total_thb) : "-"}</span> },
    { key: "grand", header: "รวม ฿", width: "8rem", align: "right", sortValue: (v) => v.grand_total_thb, cell: (v) => <span className="tabular-nums font-medium text-slate-800">{fmtMoney(v.grand_total_thb)}</span> },
  ], []);

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูราคาต้นทุน (products.cost.view)" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">🧾 ใบสำคัญรับ (ใบซื้อ)</h1>
            <p className="text-sm text-slate-500 mt-0.5">คนรับของใส่จำนวนที่หน้ารับของ → จัดซื้อออกใบสำคัญรับ ใส่ราคา ¥/฿ + ค่าส่ง → ราคาเขียนกลับใบสั่งซื้อ / ราคาต่อร้าน / สินค้า</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              <button onClick={() => changeTab("pending")} className={`h-9 px-3 ${tab === "pending" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📥 รอออกใบสำคัญ ({pending.length})</button>
              <button onClick={() => changeTab("vouchers")} className={`h-9 px-3 border-l border-slate-200 ${tab === "vouchers" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🧾 ใบสำคัญรับ ({vouchers.length})</button>
            </div>
            {canEdit && (
              <button onClick={() => { setAddMode(pending.length > 0 ? "gr" : "manual"); setAddOpen(true); }}
                className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">＋ ออกใบสำคัญรับ</button>
            )}
          </div>
        </div>

        {tab === "pending" ? (
          <>
            {selRows.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-blue-800">☑ เลือก {selRows.length} ใบรับ</span>
                <span className="text-xs text-slate-500">{selSellers.length === 1 ? `🏪 ${selSellers[0]}` : `⚠ ${selSellers.length} ร้าน`} · {selCurrencies.map(curSymbol).join(" / ")}</span>
                {selCurrencies.length > 1 && <span className="text-xs text-red-600">สกุลเงินต่างกัน ต้องแยกใบ</span>}
                {canEdit && (
                  <button onClick={() => void createVoucher()} disabled={creating || selCurrencies.length > 1}
                    className="h-8 px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{creating ? "กำลังสร้าง…" : `🧾 ออกใบสำคัญรับ (${selRows.length})`}</button>
                )}
                <button onClick={() => setSelected(new Set())} className="ml-auto h-8 px-3 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">ล้างเลือก</button>
              </div>
            )}
            {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div> : (
              <MiniTable rows={pending} columns={pendingCols} rowKey={(g) => g.id}
                searchText={(g) => `${g.gr_no} ${g.po_no} ${g.seller_name} ${g.receiver}`} searchPlaceholder="🔎 เลขใบรับ / PO / ร้าน…"
                groupBy={(g) => `🏪 ${g.seller_name}`} groupLabel="จัดกลุ่มตามร้าน" defaultGrouped
                selectable selected={selected} onSelectedChange={setSelected}
                onRowClick={(g) => toggleSel(g.id)}
                title="ใบรับที่ยังไม่ออกใบสำคัญ" countUnit="ใบ" emptyText="— ไม่มีใบรับค้างออกใบสำคัญ —"
                footnote="ติ๊กใบรับของร้านเดียวกัน (ชิปเมนต์เดียวกัน) แล้วกด ออกใบสำคัญรับ — ค่าส่งที่มาเป็นก้อนจะเฉลี่ยลงทุกรายการในใบ"
                resizable storageKey="pv-pending" />
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 text-xs">
              {(["all", "draft", "confirmed", "cancelled"] as const).map((s) => (
                <button key={s} onClick={() => setVStatus(s)} className={`h-8 px-3 rounded-md border ${vStatus === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {s === "all" ? "ทั้งหมด" : s === "draft" ? "ร่าง" : s === "confirmed" ? "ยืนยันแล้ว" : "ยกเลิก"}
                </button>
              ))}
              <span className="text-slate-400">แก้ไข = กดเปิดใบ · ลบ = ปุ่ม &quot;ยกเลิกใบร่าง&quot; ในใบ (ใบที่ยืนยันแล้วลบไม่ได้ เพราะราคาถูกเขียนกลับระบบแล้ว)</span>
            </div>
            {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div> : (
              <MiniTable rows={vouchers} columns={voucherCols} rowKey={(v) => v.id}
                searchText={(v) => `${v.pv_no ?? ""} ${v.seller_name ?? ""} ${v.gr_nos.join(" ")} ${v.po_nos.join(" ")}`} searchPlaceholder="🔎 เลขที่ / ร้าน / ใบรับ / PO…"
                onRowClick={(v) => router.push(`/purchasing/vouchers/${v.id}`)}
                title="ใบสำคัญรับ" countUnit="ใบ" emptyText="— ยังไม่มีใบสำคัญรับ —"
                resizable storageKey="pv-list" />
            )}
          </>
        )}
      </div>

      {/* ป๊อปรายละเอียดใบรับ (ของกลาง) + ปุ่มออกใบสำคัญจากใบนี้ใบเดียว */}
      {detailGr && (
        <GrDetailModal grId={detailGr.id} onClose={() => setDetailGr(null)} onSaved={load}
          footer={canEdit ? (
            <button onClick={() => { const g = detailGr; setDetailGr(null); void createVoucher([g.id]); }} disabled={creating}
              className="h-9 px-4 text-sm font-medium rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40">🧾 ออกใบสำคัญจากใบนี้</button>
          ) : undefined} />
      )}

      {/* ＋ ออกใบสำคัญรับ — เลือกจากใบรับที่รอ หรือสร้างเปล่า */}
      {addOpen && (
        <ERPModal open onClose={() => !creating && setAddOpen(false)} size="md" storageKey="pv-add"
          title="＋ ออกใบสำคัญรับ" description="เลือกใบรับที่รับของแล้ว หรือสร้างใบเปล่าสำหรับของที่ซื้อโดยไม่มีใบรับ"
          footer={<>
            <button onClick={() => setAddOpen(false)} disabled={creating} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            {addMode === "gr"
              ? <button onClick={() => void createVoucher()} disabled={creating || selRows.length === 0 || selCurrencies.length > 1} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{creating ? "กำลังสร้าง…" : `ออกใบสำคัญรับ (${selRows.length} ใบรับ)`}</button>
              : <button onClick={() => void createManual()} disabled={creating || !(mSeller?.name ?? mSellerText).trim()} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{creating ? "กำลังสร้าง…" : "สร้างใบเปล่า →"}</button>}
          </>}>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs mb-3">
            <button onClick={() => setAddMode("gr")} className={`h-8 px-3 ${addMode === "gr" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📥 จากใบรับ ({pending.length})</button>
            <button onClick={() => setAddMode("manual")} className={`h-8 px-3 border-l border-slate-200 ${addMode === "manual" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>✍️ สร้างเปล่า (ไม่มีใบรับ)</button>
          </div>
          {addMode === "gr" ? (
            pending.length === 0 ? <div className="py-8 text-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg">— ไม่มีใบรับค้างออกใบสำคัญ — ไปรับของที่หน้า &quot;รับสินค้าเข้า&quot; ก่อน หรือเลือก &quot;สร้างเปล่า&quot;</div> : (
              <>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                  {pending.map((g) => (
                    <label key={g.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${selected.has(g.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSel(g.id)} className="rounded border-slate-300" />
                      <span className="font-mono text-xs font-semibold text-slate-800 w-28 shrink-0">{g.gr_no}</span>
                      <span className="flex-1 min-w-0 truncate text-slate-700">🏪 {g.seller_name}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{g.receive_date ? formatDate(g.receive_date) : "—"} · {g.line_count} รายการ · {curSymbol(g.currency)}</span>
                    </label>
                  ))}
                </div>
                {selCurrencies.length > 1 && <p className="text-xs text-red-600 mt-2">ใบรับที่เลือกมีสกุลเงินต่างกัน ต้องแยกออกคนละใบ</p>}
                {selSellers.length > 1 && selCurrencies.length <= 1 && <p className="text-xs text-amber-700 mt-2">เลือกไว้ {selSellers.length} ร้าน — รวมใบเดียวได้ถ้ามาชิปเมนต์เดียวกัน (ค่าส่งก้อนเดียว)</p>}
              </>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ร้าน / ผู้ขาย</label>
                <SupplierPicker value={mSeller?.id ?? ""} suppliers={suppliers} onChange={pickSeller} onAddNew={() => setWizardOpen(true)} placeholder="— เลือกร้านจากทะเบียน —" />
                <input value={mSellerText} onChange={(e) => { setMSellerText(e.target.value); if (e.target.value) setMSeller(null); }} placeholder="หรือพิมพ์ชื่อร้านเอง (ร้านที่ยังไม่อยู่ในทะเบียน)"
                  className="mt-1.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">สกุลราคาสินค้า</label>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                  <button onClick={() => setMCur("THB")} className={`h-9 px-4 ${mCur === "THB" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>฿ บาท</button>
                  <button onClick={() => setMCur("RMB")} className={`h-9 px-4 border-l border-slate-200 ${mCur === "RMB" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>¥ หยวน</button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">ใบเปล่าไม่ผูกกับใบสั่งซื้อและไม่บวกสต๊อก — ใช้บันทึกราคาซื้อ + ค่าส่ง แล้วเขียนราคากลับสินค้า/ราคาต่อร้าน · รายการสินค้าเพิ่มเองในหน้าถัดไป</p>
            </div>
          )}
        </ERPModal>
      )}

      {/* เพิ่มร้านใหม่จากป๊อปออกใบสำคัญ (ของกลาง SupplierWizard) */}
      {wizardOpen && (
        <SupplierWizard onClose={() => setWizardOpen(false)}
          onCreated={(s: { id: string; name: string }) => {
            setSuppliers((arr) => [...arr, { id: s.id, name: s.name }].sort((a, b) => a.name.localeCompare(b.name, "th")));
            setMSeller({ id: s.id, name: s.name }); setMSellerText(""); setWizardOpen(false);
          }} />
      )}

      {/* แก้วันที่รับ */}
      {dateEdit && (
        <ERPModal open onClose={() => !dateSaving && setDateEdit(null)} size="sm" storageKey="pv-gr-date"
          title="📅 แก้วันที่รับของ" description={`${dateEdit.gr.gr_no} · ${dateEdit.gr.seller_name}`}
          footer={<>
            <button onClick={() => setDateEdit(null)} disabled={dateSaving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={() => void saveDate()} disabled={dateSaving || !dateEdit.value || dateEdit.value === (dateEdit.gr.receive_date ?? "")} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{dateSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </>}>
          <label className="block text-xs font-medium text-slate-600 mb-1">วันที่รับของจริง</label>
          <input type="date" value={dateEdit.value} onChange={(e) => setDateEdit((p) => (p ? { ...p, value: e.target.value } : p))} className="w-full h-10 px-3 text-sm border border-slate-200 rounded-md" />
          <p className="text-[11px] text-slate-400 mt-2">เรทหยวนของใบสำคัญจะอ้างวันที่รับ — ถ้าแก้วันหลังออกใบสำคัญร่างแล้ว ให้เช็กเรทในใบอีกครั้ง</p>
        </ERPModal>
      )}
    </PlaygroundShell>
  );
}
