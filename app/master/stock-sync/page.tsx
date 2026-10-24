"use client";

/**
 * 🔄 ซิงค์สต๊อก (เฟส 1 · เทียบยอด) — /master/stock-sync · แอป "ช่องทางขาย"
 * ปลายทางแรก: IG International × BigSeller (stock_sync_channels)
 *
 * - ⬆️ นำเข้าไฟล์จาก BigSeller → จับคู่รหัส ↔ SKU ใน ERP + เก็บยอดของ BigSeller
 * - 📦 ใช้เป็นยอดตั้งต้น → เปิดรอบนับสต๊อกของคลังออนไลน์ + เติมยอดให้ → ผู้ใช้ตรวจแล้วกดยืนยันที่หน้านับเอง
 * - ตารางกลาง (อ่านอย่างเดียว) เทียบ "พร้อมขาย ERP" กับ "พร้อมขาย BigSeller" · ปุ่ม 🔗 จับคู่รายแถว
 * ยังไม่ส่งอะไรออกไปที่ BigSeller/ร้าน (เฟส 2) — docs/channel-stock-sync.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { COMPARE_STATUS } from "@/lib/stock-sync/bigseller";
import { BigSellerImportModal } from "@/components/stock-sync/bigseller-import-modal";
import { MatchSkuModal, type MatchTarget } from "@/components/stock-sync/match-sku-modal";
import { ChannelSettingsModal } from "@/components/stock-sync/channel-settings-modal";
import type { SyncChannelRow } from "@/app/api/stock-sync/channels/route";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

const TONE: Record<string, string> = {
  green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber:  "bg-amber-50 text-amber-700 border-amber-200",
  red:    "bg-red-50 text-red-700 border-red-200",
  slate:  "bg-slate-100 text-slate-500 border-slate-200",
  blue:   "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
};
const LABEL_TONE = new Map(Object.values(COMPARE_STATUS).map((s) => [s.label, TONE[s.tone]]));

const qty = (v: unknown) => v == null
  ? <span className="text-xs text-slate-300">—</span>
  : <span className="text-sm tabular-nums text-slate-700">{Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>;
const diffCell = (v: unknown) => {
  if (v == null) return <span className="text-xs text-slate-300">—</span>;
  const n = Number(v);
  if (n === 0) return <span className="text-sm tabular-nums text-emerald-600">0</span>;
  return <span className={`text-sm tabular-nums font-medium ${n > 0 ? "text-amber-600" : "text-red-600"}`}>{n > 0 ? "+" : ""}{n.toLocaleString("th-TH")}</span>;
};
const when = (v: unknown) => v
  ? <span className="text-xs text-slate-500">{new Date(String(v)).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", hour12: false })}</span>
  : <span className="text-xs text-slate-300">—</span>;
const fmtWhen = (v: string | null) => v ? new Date(v).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", hour12: false }) : null;

type CompareRow = { sku_id: string | null; is_combo: boolean; status: string; external_on_hand: number | null; external_qty: number | null };
type OpeningPlan = { lines: { product_id: string; counted_qty: number }[]; duplicates: number; unmatched: number; combos: number; noQty: number };

export default function StockSyncPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const canView = usePermission("products.platforms.view");
  const canEdit = usePermission("products.platforms.edit");
  const canStock = usePermission("stock.view");

  const [channels, setChannels] = useState<SyncChannelRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);              // เปลี่ยนแล้วตารางโหลดใหม่ (remount)

  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState<MatchTarget | null>(null);
  const [opening, setOpening] = useState<OpeningPlan | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [planning, setPlanning] = useState(false);

  const loadChannels = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch("/api/stock-sync/channels");
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const list = (j.channels ?? []) as SyncChannelRow[];
      setChannels(list);
      setChannelId((cur) => (cur && list.some((c) => c.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) { setLoadError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) void loadChannels(); }, [canView, loadChannels]);

  const channel = channels.find((c) => c.id === channelId) ?? null;
  const refreshAll = useCallback(() => { setTick((n) => n + 1); void loadChannels(); }, [loadChannels]);

  // 📦 ยอดตั้งต้น: คิดรายการจากตารางเทียบ (ยอด "ในคลัง" ของ BigSeller ก่อน · ไม่มีใช้ "พร้อมขาย")
  const planOpening = async () => {
    if (!channel) return;
    setPlanning(true);
    try {
      const res = await apiFetch(`/api/stock-sync/compare?channel_id=${encodeURIComponent(channel.id)}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const rows = (j.data ?? []) as CompareRow[];
      const plan: OpeningPlan = { lines: [], duplicates: 0, unmatched: 0, combos: 0, noQty: 0 };
      for (const r of rows) {
        if (r.status === "not_in_channel") continue;
        if (r.is_combo) { plan.combos++; continue; }
        if (!r.sku_id) { plan.unmatched++; continue; }
        if (r.status === "duplicate") { plan.duplicates++; continue; }
        const q = r.external_on_hand ?? r.external_qty;
        if (q == null) { plan.noQty++; continue; }
        plan.lines.push({ product_id: r.sku_id, counted_qty: Number(q) });
      }
      if (plan.lines.length === 0) { toast.warning("ยังไม่มีรายการที่จับคู่แล้วและมียอด — นำเข้าไฟล์จาก BigSeller ก่อน"); return; }
      setOpening(plan);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เตรียมยอดตั้งต้นไม่สำเร็จ"); }
    finally { setPlanning(false); }
  };

  const runOpening = async () => {
    if (!channel || !opening) return;
    setOpeningBusy(true);
    try {
      const post = (body: Record<string, unknown>) => apiFetch("/api/inventory/count", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => r.json());
      const o = await post({ action: "open", warehouse_id: channel.warehouse_id });
      if (o.error) throw new Error(o.error);
      const imp = await post({ action: "import_lines", count_id: o.id, lines: opening.lines, source: `stock_sync:${channel.provider}` });
      if (imp.error) throw new Error(imp.error);
      toast.success(`เปิดรอบนับคลัง ${channel.warehouse_code ?? ""} แล้ว — เติมยอด ${(imp.added + imp.updated).toLocaleString()} รายการ · ตรวจแล้วกด "ยืนยันปรับสต๊อก"`);
      setOpening(null);
      router.push(`/inventory/count?id=${encodeURIComponent(String(o.id))}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดรอบนับไม่สำเร็จ"); }
    finally { setOpeningBusy(false); }
  };

  const description = useMemo(() => {
    if (!channel) return "";
    const c = channel.counts ?? {};
    const off = (c.erp_more ?? 0) + (c.erp_less ?? 0);
    const parts = [
      `${channel.brand_name ?? ""} · ดึงยอดจากคลัง ${channel.warehouse_code ?? "—"} · กันไว้ ${channel.buffer_qty} ชิ้น`,
      channel.mode === "off" ? "ปิดอยู่" : "เทียบอย่างเดียว (ยังไม่ส่งอะไรออกไป BigSeller)",
      channel.total ? `ตรงกัน ${c.match ?? 0} · ไม่ตรง ${off} · ยังไม่จับคู่ ${c.unmatched ?? 0}` : "ยังไม่ได้นำเข้าไฟล์",
      channel.last_import_at ? `นำเข้าล่าสุด ${fmtWhen(channel.last_import_at)}${channel.last_import_by ? ` โดย ${channel.last_import_by}` : ""}` : null,
    ];
    return parts.filter(Boolean).join(" · ");
  }, [channel]);

  const config = useMemo<MasterCRUDConfig | null>(() => {
    if (!channel) return null;
    return {
      apiBase: "/api/stock-sync/", apiPath: "compare", tableId: "stock-sync-compare",
      title: `ซิงค์สต๊อก — ${channel.label}`, icon: "🔄", description,
      readOnly: true, hideActiveStatus: true, pageLimit: 20000, uniqueKey: "id",
      extraQuery: { channel_id: channel.id },
      permissions: { view: "products.platforms.view", create: "products.platforms.edit", edit: "products.platforms.edit" },
      defaultShowAllColumns: true,
      searchKeys: ["external_sku", "external_name", "sku_code", "sku_name"],
      headerActions: () => (
        <div className="flex flex-wrap items-center gap-2">
          {channels.length > 1 && (
            <select value={channel.id} onChange={(e) => setChannelId(e.target.value)}
              className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
          {canEdit && channel.provider === "bigseller" && (
            <button onClick={() => setImportOpen(true)} className="h-9 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ⬆️ นำเข้าไฟล์จาก BigSeller
            </button>
          )}
          {canEdit && canStock && (
            <button onClick={planOpening} disabled={planning || !channel.total}
              title={channel.total ? "เปิดรอบนับคลังออนไลน์ + เติมยอดจาก BigSeller ให้ตรวจก่อนยืนยัน" : "นำเข้าไฟล์ก่อน"}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
              {planning ? "กำลังเตรียม..." : "📦 ใช้เป็นยอดตั้งต้น"}
            </button>
          )}
          {canEdit && (
            <button onClick={() => setSettingsOpen(true)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">⚙️ ตั้งค่า</button>
          )}
        </div>
      ),
      extraRowActions: canEdit ? [{
        label: "จับคู่", icon: "🔗",
        show: (row) => !!row.external_sku && !row.is_combo,
        onClick: (row) => setMatchTarget({
          id: String(row.id), external_sku: String(row.external_sku ?? ""), external_name: (row.external_name as string | null) ?? null,
          sku_id: (row.sku_id as string | null) ?? null, sku_code: (row.sku_code as string | null) ?? null, sku_name: (row.sku_name as string | null) ?? null,
        }),
      }] : undefined,
      fields: [
        {
          key: "status_label", label: "สถานะ", type: "select", colSize: 170, filterType: "select",
          options: Object.values(COMPARE_STATUS).map((s) => s.label),
          cellRender: (v) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${LABEL_TONE.get(String(v)) ?? TONE.slate}`}>{String(v ?? "—")}</span>,
        },
        { key: "external_sku", label: "รหัสใน BigSeller", type: "text", colSize: 170 },
        { key: "sku_code", label: "SKU ใน ERP", type: "text", colSize: 160, cellRender: (v) => v ? <span className="text-sm font-medium text-slate-800">{String(v)}</span> : <span className="text-xs text-slate-300">— ยังไม่จับคู่</span> },
        // ตัวเลขที่ต้องเทียบอยู่ติดกันใกล้ ๆ ซ้าย — ไม่ต้องเลื่อนตารางไปขวา
        { key: "available", label: "พร้อมขาย (ERP)", type: "number", colSize: 110, cellRender: qty },
        { key: "external_qty", label: "พร้อมขาย (BigSeller)", type: "number", colSize: 120, cellRender: qty },
        { key: "diff", label: "ส่วนต่าง", type: "number", colSize: 90, cellRender: diffCell },
        { key: "external_name", label: "ชื่อใน BigSeller", type: "text", colSize: 220 },
        { key: "sku_name", label: "ชื่อใน ERP", type: "text", colSize: 220 },
        { key: "match_label", label: "จับคู่โดย", type: "text", colSize: 100 },
        { key: "on_hand", label: "ในคลังออนไลน์ (ERP)", type: "number", colSize: 120, cellRender: qty },
        { key: "reserved", label: "จองแล้ว (ERP)", type: "number", colSize: 100, cellRender: qty },
        { key: "external_on_hand", label: "ในคลัง (BigSeller)", type: "number", colSize: 120, cellRender: qty },
        { key: "external_warehouse", label: "คลังใน BigSeller", type: "text", colSize: 140 },
        { key: "external_qty_at", label: "ยอด BigSeller ณ", type: "text", colSize: 140, cellRender: when },
      ],
    };
  // planOpening ใช้ค่า channel ล่าสุดผ่าน closure ของ render นี้ — config สร้างใหม่ตาม channel อยู่แล้ว
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, channels, description, canEdit, canStock, planning]);

  if (!canView) return <AccessDenied />;
  if (loading) return <div className="p-10 text-center text-slate-400">กำลังโหลด...</div>;
  if (loadError) return (
    <div className="p-10 text-center">
      <div className="text-sm text-red-600 mb-3">เกิดข้อผิดพลาดในการโหลดข้อมูล: {loadError}</div>
      <button onClick={() => { setLoading(true); void loadChannels(); }} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ลองใหม่</button>
    </div>
  );
  if (!channel || !config) return (
    <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีปลายทางซิงค์สต๊อก — ให้ผู้ดูแลระบบตั้งค่าก่อน</div>
  );

  return (
    <>
      <MasterCRUDPage key={`${channel.id}:${tick}`} config={config} />

      <BigSellerImportModal channelId={channel.id} open={importOpen} actor={user?.email}
        onClose={() => setImportOpen(false)} onDone={refreshAll} />

      <ChannelSettingsModal channel={channel} open={settingsOpen} onClose={() => setSettingsOpen(false)}
        onSaved={(msg) => { setSettingsOpen(false); toast.success(msg); refreshAll(); }} />

      <MatchSkuModal target={matchTarget} onClose={() => setMatchTarget(null)}
        onSaved={(msg) => { setMatchTarget(null); toast.success(msg); refreshAll(); }} />

      <ConfirmDialog open={!!opening} onClose={() => !openingBusy && setOpening(null)} onConfirm={runOpening}
        loading={openingBusy} confirmText="เปิดรอบนับ + เติมยอด"
        title={`📦 ใช้ยอด BigSeller เป็นยอดตั้งต้นของคลัง ${channel.warehouse_code ?? ""}`}
        message={opening ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>ระบบจะ <b>เปิดรอบนับสต๊อกใหม่</b> ของคลัง {channel.warehouse_code} แล้วเติมยอดจาก BigSeller ให้ <b>{opening.lines.length.toLocaleString()} รายการ</b></p>
            <p>สต๊อกใน ERP <b>ยังไม่เปลี่ยน</b> จนกว่าคุณจะตรวจในหน้านับ แล้วกด &quot;ยืนยันปรับสต๊อก&quot; เอง</p>
            {(opening.unmatched + opening.duplicates + opening.combos + opening.noQty) > 0 && (
              <p className="text-amber-700">ข้าม: ยังไม่จับคู่ {opening.unmatched} · SKU ซ้ำหลายรหัส {opening.duplicates} · สินค้าชุด {opening.combos} · ไม่มียอด {opening.noQty}</p>
            )}
          </div>
        ) : ""} />
    </>
  );
}
