"use client";

/**
 * ใบสำคัญรับ (ใบซื้อ) — /purchasing/vouchers
 *   แท็บ 1: 📥 ใบรับ GR ที่ยังไม่ออกใบสำคัญ → ติ๊กหลายใบ (ร้านเดียว/ชิปเมนต์เดียว) → "ออกใบสำคัญรับ" → ไปหน้าฟอร์ม
 *   แท็บ 2: 🧾 ใบสำคัญรับทั้งหมด (ร่าง/ยืนยันแล้ว) → คลิกเปิด
 * คนรับของใส่แค่จำนวนที่หน้ารับของ · หน้านี้เป็นของจัดซื้อ (ใส่ราคา + ค่าส่ง)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { fmtMoney, curSymbol } from "@/lib/landed-cost";

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
  const [vStatus, setVStatus] = useState<"all" | "draft" | "confirmed">("all");

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

  const createVoucher = async () => {
    if (selRows.length === 0) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/purchasing/vouchers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gr_ids: selRows.map((g) => g.id) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`สร้างใบสำคัญรับ (ร่าง) จากใบรับ ${selRows.length} ใบแล้ว`);
      setSelected(new Set());
      router.push(`/purchasing/vouchers/${j.id}`);
    } catch (e) { toast.error("สร้างไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setCreating(false); }
  };

  const pendingCols = useMemo<MiniColumn<PendingGr>[]>(() => [
    { key: "gr_no", header: "เลขใบรับ", width: "9rem", sortValue: (g) => g.gr_no, cell: (g) => <span className="font-mono text-sm font-semibold text-slate-800">{g.gr_no}</span> },
    { key: "po_no", header: "ใบสั่งซื้อ", width: "9rem", sortValue: (g) => g.po_no, cell: (g) => <span className="font-mono text-xs text-slate-500">{g.po_no}</span> },
    { key: "seller", header: "ร้าน", width: "1.6fr", sortValue: (g) => g.seller_name, cell: (g) => <span className="block truncate" title={g.seller_name}>🏪 {g.seller_name}</span> },
    { key: "date", header: "วันที่รับ", width: "7rem", align: "center", sortValue: (g) => g.receive_date ?? "", cell: (g) => <span className="text-xs text-slate-500">{g.receive_date ? formatDate(g.receive_date) : "—"}</span> },
    { key: "receiver", header: "ผู้รับ", width: "8rem", cell: (g) => <span className="text-xs text-slate-500 truncate block">{g.receiver}</span> },
    { key: "cur", header: "สกุล", width: "4rem", align: "center", cell: (g) => <span className="text-xs">{curSymbol(g.currency)}</span> },
    { key: "n", header: "รายการ", width: "5rem", align: "right", sortValue: (g) => g.line_count, cell: (g) => <span className="tabular-nums">{g.line_count}</span> },
    { key: "print", header: "", width: "6rem", align: "center", cell: (g) => (
      <a href={`/print/goods-receipt/${g.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 h-7 inline-flex items-center hover:bg-slate-50">🖨 ใบรับ</a>
    ) },
  ], []);

  const voucherCols = useMemo<MiniColumn<VoucherRow>[]>(() => [
    { key: "pv", header: "เลขที่", width: "9rem", sortValue: (v) => v.pv_no ?? "", cell: (v) => v.pv_no ? <span className="font-mono text-sm font-semibold text-slate-800">{v.pv_no}</span> : <span className="text-xs text-slate-400">— ร่าง —</span> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (v) => v.status, cell: (v) => { const b = STATUS_BADGE[v.status] ?? { text: v.status, cls: "bg-slate-100 text-slate-500 border-slate-200" }; return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${b.cls}`}>{b.text}</span>; } },
    { key: "seller", header: "ร้าน", width: "1.5fr", sortValue: (v) => v.seller_name ?? "", cell: (v) => <span className="block truncate" title={v.seller_name ?? ""}>🏪 {v.seller_name ?? "—"}</span> },
    { key: "date", header: "วันที่", width: "7rem", align: "center", sortValue: (v) => v.voucher_date, cell: (v) => <span className="text-xs text-slate-500">{formatDate(v.voucher_date)}</span> },
    { key: "refs", header: "ใบรับ / PO", width: "1.2fr", cell: (v) => <span className="text-[11px] text-slate-500 truncate block" title={[...v.gr_nos, ...v.po_nos].join(", ")}>{v.gr_nos.join(", ")}{v.po_nos.length ? ` · ${v.po_nos.join(", ")}` : ""}</span> },
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
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => changeTab("pending")} className={`h-9 px-3 ${tab === "pending" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📥 รอออกใบสำคัญ ({pending.length})</button>
            <button onClick={() => changeTab("vouchers")} className={`h-9 px-3 border-l border-slate-200 ${tab === "vouchers" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🧾 ใบสำคัญรับ ({vouchers.length})</button>
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
                onRowClick={(g) => setSelected((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                title="ใบรับที่ยังไม่ออกใบสำคัญ" countUnit="ใบ" emptyText="— ไม่มีใบรับค้างออกใบสำคัญ —"
                footnote="ติ๊กใบรับของร้านเดียวกัน (ชิปเมนต์เดียวกัน) แล้วกด ออกใบสำคัญรับ — ค่าส่งที่มาเป็นก้อนจะเฉลี่ยลงทุกรายการในใบ"
                resizable storageKey="pv-pending" />
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 text-xs">
              {(["all", "draft", "confirmed"] as const).map((s) => (
                <button key={s} onClick={() => setVStatus(s)} className={`h-8 px-3 rounded-md border ${vStatus === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {s === "all" ? "ทั้งหมด" : s === "draft" ? "ร่าง" : "ยืนยันแล้ว"}
                </button>
              ))}
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
    </PlaygroundShell>
  );
}
