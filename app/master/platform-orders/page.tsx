"use client";

// 📦 ศูนย์ออเดอร์ออนไลน์ (เดิม "ออเดอร์จากแพลตฟอร์ม" เฟส 1a) — เจ้าของเลือกหน้าตาจาก widget 2026-11-10 + "Approve, start" เฟส A
//   การ์ดตัวเลขกดกรอง · ตารางเลือกหลายใบ → พิมพ์ใบหยิบรวม/ใบแพ็ก/ใบปะหน้า · แพ็กแล้วทีละหลายใบ · แผงรายละเอียด · ใบกำกับภาษี (ผ่านใบขาย)
//   แท็บ "ต้องจัดการ" ไม่รวมออเดอร์จากเมล (ยอดขายที่ส่งแล้วนอกระบบ → แท็บ "ยอดขายจากเมล" ดูอย่างเดียว)
//   โหมดทดลอง (?demo=1) = ออเดอร์ตัวอย่างหน้าตาแบบ Shopee ไม่บันทึกอะไร — ลองทุกปุ่มได้ระหว่างรอ Shopee อนุมัติ
// ของกลาง: StatFilterCards · MiniTable · Pager · BulkActionBar · Drawer/ERPModal/ConfirmDialog · PlatformBadge · กติกา lib/platform-order-status

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ERPInput, ERPSelect } from "@/components/form";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { StatFilterCards, type StatFilterCard } from "@/components/stat-filter-cards";
import { PlatformBadge } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { ErrorState } from "@/components/state-views";
import { formatDateTime } from "@/lib/date";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { SHOPEE_STATUS_LABEL, SHIP_DUE_LABEL, platformStatusWarning, shipDue, type PlatformOrderRow } from "@/lib/platform-order-status";
import { StatusChip } from "./status-chip";
import { OrderDrawer } from "./order-drawer";
import { InvoiceModal } from "./invoice-modal";

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Summary = { by_status: Record<string, number>; todo: number; late: number; today: number; invoice_requested: number; view_total: { todo: number; history: number } };
type CardKey = "all" | "todo" | "late" | "today" | "invoice" | "shipped" | "cancelled";
const PAGE_SIZE = 50;

/** การ์ด → ตัวกรองที่ส่งให้ API */
function cardParams(k: CardKey): Record<string, string> {
  switch (k) {
    case "todo": return { active: "1" };
    case "late": return { due: "late" };
    case "today": return { due: "today" };
    case "invoice": return { invoice: "requested" };
    case "shipped": return { status: "shipped" };
    case "cancelled": return { status: "cancelled" };
    default: return {};
  }
}

function PlatformOrdersInner() {
  const sp = useSearchParams();
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can("platform_orders.manage");
  const fileRef = useRef<HTMLInputElement>(null);

  const [demo, setDemo] = useState(sp.get("demo") === "1");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [view, setView] = useState<"todo" | "history">("todo");
  const [card, setCard] = useState<CardKey>("todo");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlatformOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [askPacked, setAskPacked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const reqSeq = useRef(0);   // กันคำตอบเก่ามาทับ (สลับร้าน/การ์ดเร็ว ๆ)

  useEffect(() => { (async () => {
    try {
      const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
      setPlatforms(((j.platforms ?? []) as Platform[]).filter((p) => isSellingPlatform(p.code)));
      setBrands((j.brands ?? []) as Brand[]);
    } catch { /* ไม่มีรายการร้านก็ยังดูออเดอร์ทั้งหมดได้ */ }
  })(); }, []);

  // คำค้นพิมพ์แล้วรอ 350ms ค่อยค้น
  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qInput]);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ view, page: String(page), page_size: String(PAGE_SIZE), ...cardParams(card) });
      if (demo) params.set("demo", "1");
      if (platformId) params.set("platform_id", platformId);
      if (brandId) params.set("brand_id", brandId);
      if (q) params.set("q", q);
      const j = await apiFetch(`/api/platform-orders?${params}`).then((r) => r.json());
      if (seq !== reqSeq.current) return;
      if (j.error) { setError(j.error); return; }
      setRows((j.orders ?? []) as PlatformOrderRow[]); setTotal(Number(j.total) || 0); setSummary(j.summary ?? null);
    } catch { if (seq === reqSeq.current) setError("โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { if (seq === reqSeq.current) setLoading(false); }
  }, [view, page, card, demo, platformId, brandId, q]);
  useEffect(() => { void load(); }, [load]);
  // เปลี่ยนตัวกรอง = กลับหน้าแรก + ล้างที่ติ๊กไว้
  useEffect(() => { setPage(1); setSel(new Set()); }, [view, card, demo, platformId, brandId]);

  const toggleDemo = () => {
    setDemo((d) => {
      const next = !d;
      try { const u = new URL(window.location.href); if (next) u.searchParams.set("demo", "1"); else u.searchParams.delete("demo"); window.history.replaceState(null, "", u.toString()); } catch { /* ignore */ }
      return next;
    });
    setView("todo"); setCard("todo");
  };

  const cards: StatFilterCard[] = useMemo(() => view === "history"
    ? [{ key: "all", label: "ยอดขายจากเมล", value: summary?.view_total.history, tone: "neutral", icon: <Icon value="i:mail" />, keep: true },
       { key: "cancelled", label: "ยกเลิก", value: summary?.by_status.cancelled, tone: "neutral" }]
    : [
      { key: "todo", label: "ต้องจัดส่ง", value: summary?.todo, tone: "info", icon: <Icon value="i:truck-delivery" />, keep: true },
      { key: "late", label: "เลยกำหนดส่ง", value: summary?.late, tone: "danger", icon: <Icon value="i:alarm" /> },
      { key: "today", label: "ต้องส่งวันนี้", value: summary?.today, tone: "warning", icon: <Icon value="i:clock" /> },
      { key: "invoice", label: "ขอใบกำกับภาษี", value: summary?.invoice_requested, tone: "neutral", icon: <Icon value="i:file-invoice" /> },
      { key: "shipped", label: "ส่งแล้ว", value: summary?.by_status.shipped, tone: "success" },
      { key: "all", label: "ทั้งหมด", value: summary?.view_total.todo, tone: "neutral", keep: true },
    ], [summary, view]);

  const pf = useMemo(() => new Map(platforms.map((p) => [p.id, p])), [platforms]);
  const cols: MiniColumn<PlatformOrderRow>[] = [
    { key: "no", header: "ออเดอร์", width: "1.5fr", locked: true, sortValue: (o) => o.order_no ?? "", cell: (o) => {
      const p = o.platform_id ? pf.get(o.platform_id) : null;
      return (
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-slate-800">{o.order_no || o.external_order_id || "—"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            {p ? <PlatformBadge code={p.code} name={p.name_th} iconKey={p.icon_key} size="xs" /> : o.source === "demo" ? <PlatformBadge code="shopee" name="Shopee (ตัวอย่าง)" size="xs" /> : null}
            <span>{formatDateTime(o.ordered_at ?? o.created_at)}</span>
          </div>
        </div>
      );
    } },
    { key: "cust", header: "ลูกค้า", width: "1fr", cell: (o) => <span className="truncate">{o.customer_name || "—"}</span> },
    { key: "total", header: "ยอด", width: "0.7fr", align: "right", sortValue: (o) => o.total ?? -1, cell: (o) => o.total != null ? <span>{o.total.toLocaleString("th-TH")} ฿</span> : "—" },
    { key: "due", header: "ส่งภายใน", width: "1fr", sortValue: (o) => o.ship_by_at ?? "", cell: (o) => {
      const d = shipDue(o);
      if (!o.ship_by_at) return <span className="text-slate-300">—</span>;
      return (
        <div className="text-xs">
          <div className="text-slate-700">{formatDateTime(o.ship_by_at)}</div>
          {(d === "late" || d === "today") && <span className={`mt-0.5 inline-block rounded px-1.5 text-[11px] ${d === "late" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{SHIP_DUE_LABEL[d]}</span>}
        </div>
      );
    } },
    { key: "st", header: "สถานะ", width: "1.1fr", sortValue: (o) => o.status, cell: (o) => {
      const w = platformStatusWarning(o.platform_status);
      return (
        <div className="flex flex-col items-start gap-0.5">
          <StatusChip s={o.status} />
          {o.platform_status && <span className={`text-[11px] ${w ? "text-amber-700" : "text-slate-400"}`} title={w ?? undefined}>{w ? <Icon name="warning" className="mr-0.5" /> : null}บนร้าน: {SHOPEE_STATUS_LABEL[o.platform_status] ?? o.platform_status}</span>}
        </div>
      );
    } },
    { key: "inv", header: "ใบกำกับ", width: "6.5rem", cell: (o) => o.invoice_so_id
      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">ออกแล้ว</span>
      : o.tax_invoice_requested ? <button type="button" onClick={(e) => { e.stopPropagation(); setInvoiceId(o.id); }} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100">ขอใบกำกับ</button>
      : <span className="text-slate-300">—</span> },
    { key: "stock", header: "สต๊อก", width: "4.5rem", align: "center", defaultHidden: true, cell: (o) => o.stock_deducted ? <span className="text-emerald-600" title="ตัดสต๊อกแล้ว"><Icon value="i:check" /></span> : <span className="text-slate-300">—</span> },
  ];

  const selIds = [...sel];
  const openPrint = (kind: "pick" | "pack" | "label") => {
    if (!selIds.length) return toast.warning("เลือกออเดอร์ก่อน");
    const u = new URLSearchParams({ kind, ids: selIds.join(",") });
    window.open(`/print/platform-orders?${u}`, "_blank", "noopener");
  };
  const markPacked = async () => {
    setAskPacked(false); setBusy(true);
    try {
      const j = await apiFetch("/api/platform-orders", { method: "PATCH", body: JSON.stringify({ ids: selIds, status: "packed" }) }).then((r) => r.json());
      if (j.error) toast.error(j.error);
      else if (j.demo) toast.info(`โหมดทดลอง — ${j.done} ออเดอร์ (ไม่ได้บันทึกจริง)`);
      else if (j.failed?.length) toast.warning(`แพ็กแล้ว ${j.done} ออเดอร์ · ไม่สำเร็จ ${j.failed.length}: ${j.failed[0].error}`);
      else toast.success(`แพ็กแล้ว ${j.done} ออเดอร์`);
      setSel(new Set()); await load();
    } catch { toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
  };

  const importFile = async (file: File) => {
    if (!platformId) { toast.warning("เลือกร้าน/แพลตฟอร์มก่อนอัปไฟล์"); return; }
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const headers = ((aoa[0] ?? []) as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (!headers.length) { toast.error("ไม่พบหัวคอลัมน์ในไฟล์"); return; }
      const data = (aoa.slice(1) as unknown[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== "")).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      const j = await apiFetch("/api/platform-orders/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, headers, rows: data }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(`นำเข้าแล้ว ${j.created} ออเดอร์ (ข้ามซ้ำ ${j.skipped}) · จับคู่สินค้า ${j.matched}/${j.items}`);
      await load();
    } catch (e) { toast.error(`นำเข้าไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const viewTab = (k: "todo" | "history", label: string, n: number | undefined) => (
    <button type="button" onClick={() => { setView(k); setCard(k === "todo" ? "todo" : "all"); }}
      className={`h-9 rounded-lg border px-3 text-sm ${view === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {label}{n != null ? <span className="ml-1.5 opacity-70">{n.toLocaleString("th-TH")}</span> : null}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900"><Icon value="i:truck-delivery" className="mr-1.5" />ศูนย์ออเดอร์ออนไลน์</h1>
          <p className="mt-0.5 text-sm text-slate-500">ออเดอร์จากทุกร้านในที่เดียว · เลือกหลายใบแล้วพิมพ์ใบหยิบ/ใบแพ็ก/ใบปะหน้า · ออกใบกำกับภาษีได้จากออเดอร์</p>
        </div>
        <button type="button" onClick={toggleDemo} aria-pressed={demo}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${demo ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Icon value="i:flask" />{demo ? "ออกจากโหมดทดลอง" : "โหมดทดลอง"}
        </button>
      </div>

      {demo && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">โหมดทดลอง — ออเดอร์ตัวอย่างหน้าตาแบบ Shopee กดได้ทุกปุ่ม แต่ไม่บันทึกอะไรและไม่ส่งอะไรขึ้นร้าน</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!demo && viewTab("todo", "ต้องจัดการ", summary?.view_total.todo)}
        {!demo && viewTab("history", "ยอดขายจากเมล", summary?.view_total.history)}
        {!demo && (
          <>
            <ERPSelect value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 w-auto" options={[{ value: "", label: "ทุกร้าน" }, ...platforms.map((p) => ({ value: p.id, label: p.name_th }))]} />
            <ERPSelect value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 w-auto" options={[{ value: "", label: "ทุกแบรนด์" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
          </>
        )}
        <div className="min-w-[180px] flex-1"><ERPInput value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="ค้นเลขออเดอร์ หรือชื่อลูกค้า" leftIcon={<Icon value="i:search" />} /></div>
        {!demo && view === "todo" && canManage && (
          <>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} title="อัปไฟล์ออเดอร์จาก Seller Center (Excel/CSV) — เลือกร้านก่อน"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <Icon value="i:upload" />{importing ? "กำลังนำเข้า…" : "อัปไฟล์ออเดอร์"}
            </button>
          </>
        )}
      </div>

      <StatFilterCards cards={cards} value={card} onChange={(k) => setCard(k as CardKey)} className="mb-3" showZero />

      {view === "history" && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><Icon value="i:mail" className="mr-1" />ยอดขายที่อ่านจากอีเมลแจ้งของ Shopee/Lazada — ร้านส่งของไปแล้วผ่าน Seller Centre จึงดูได้อย่างเดียว (ไม่นับเป็นงานที่ต้องจัดส่ง ไม่ตัดสต๊อกจากหน้านี้)</p>}

      {error ? <ErrorState title={error} onRetry={() => void load()} /> : (
        <MiniTable rows={rows} columns={cols} rowKey={(o) => o.id} hideSearch dense countUnit="ออเดอร์"
          selectable={view === "todo"} selected={sel} onSelectedChange={setSel} onRowClick={(o) => setOpenId(o.id)}
          emptyText={loading ? "กำลังโหลด…" : card === "todo" && view === "todo" && !demo ? "ไม่มีออเดอร์ที่ต้องจัดส่ง — ออเดอร์จะเข้ามาเองเมื่อเชื่อม Shopee แล้ว (ลองกด โหมดทดลอง เพื่อดูตัวอย่าง)" : "ไม่มีออเดอร์ในกลุ่มนี้"} />
      )}
      {/* Pager นับหน้าเริ่ม 0 · state ในหน้านี้ (และ API) เริ่ม 1 */}
      <div className="mt-3"><Pager page={page - 1} pageSize={PAGE_SIZE} total={total} onPage={(p) => setPage(p + 1)} unitLabel="ออเดอร์" loading={loading} hideWhenSingle /></div>

      {sel.size > 0 && view === "todo" && (
        <BulkActionBar count={sel.size} unit="ออเดอร์" onClear={() => setSel(new Set())}>
          <button type="button" onClick={() => openPrint("pick")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:list-check" />ใบหยิบรวม</button>
          <button type="button" onClick={() => openPrint("pack")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:package" />ใบแพ็ก</button>
          <button type="button" onClick={() => openPrint("label")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:printer" />ใบปะหน้า</button>
          {canManage && <button type="button" onClick={() => setAskPacked(true)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-800 disabled:opacity-50"><Icon value="i:box" />แพ็กแล้ว</button>}
          <button type="button" onClick={() => toast.info("นัดขนส่งมารับผ่านระบบได้หลังเชื่อม Shopee แล้ว (เฟส B) — ตอนนี้นัดใน Seller Centre ไปก่อน")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 hover:bg-slate-50"><Icon value="i:calendar-event" />นัดขนส่ง</button>
        </BulkActionBar>
      )}

      {openId && <OrderDrawer id={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={() => void load()} onInvoice={(id) => setInvoiceId(id)} />}
      {invoiceId && <InvoiceModal orderId={invoiceId} canManage={canManage} onClose={() => setInvoiceId(null)} onIssued={() => void load()} />}
      <ConfirmDialog open={askPacked} onClose={() => setAskPacked(false)} onConfirm={() => void markPacked()} loading={busy}
        title={`ทำเครื่องหมาย "แพ็กแล้ว" ${sel.size} ออเดอร์?`} message="ออเดอร์ที่ส่งแล้ว/ยกเลิกแล้ว หรือมาจากอีเมล จะถูกข้าม (ระบบแจ้งจำนวนที่ไม่สำเร็จ)" confirmText="แพ็กแล้ว" />
    </div>
  );
}

export default function PlatformOrdersPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><PlatformOrdersInner /></Suspense>;
}
