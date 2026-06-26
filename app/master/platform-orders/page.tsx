"use client";

// ออเดอร์จากแพลตฟอร์ม (เฟส 1a) — อัปไฟล์ออเดอร์ → ตารางออเดอร์ → ยืนยัน(ตัดสต๊อก)/แพ็ค/ส่ง
// ของกลาง: MiniTable, stock ledger เดิม (ผ่าน API), erp_platforms/brands · ยังไม่ต่อ API platform

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ERPInput } from "@/components/form";
import { MiniTable, type MiniColumn } from "@/components/mini-table";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };
const ST: Record<string, { label: string; cls: string }> = {
  new: { label: "ใหม่", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  packed: { label: "แพ็คแล้ว", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  shipped: { label: "ส่งแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
const STATUS_ORDER = ["new", "confirmed", "packed", "shipped", "cancelled"];

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Order = { id: string; order_no: string | null; external_order_id: string | null; customer_name: string | null; status: string; total: number | null; tracking_no: string | null; stock_deducted: boolean; created_at: string };

function StatusChip({ s }: { s: string }) {
  const m = ST[s] ?? ST.new;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>;
}

export default function PlatformOrdersPage() {
  const { can } = useAuth();
  const canManage = can("platform_orders.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [statusF, setStatusF] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { (async () => {
    try { const j = await apiFetch("/api/platform-accounts").then((r) => r.json()); const pfs = (j.platforms ?? []) as Platform[]; setPlatforms(pfs); setBrands((j.brands ?? []) as Brand[]); if (pfs[0]) setPlatformId(pfs[0].id); } catch { /* ignore */ }
  })(); }, []);

  const load = useCallback(async () => {
    if (!platformId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ platform_id: platformId }); if (brandId) q.set("brand_id", brandId); if (statusF) q.set("status", statusF);
      const j = await apiFetch(`/api/platform-orders?${q}`).then((r) => r.json());
      setOrders((j.orders ?? []) as Order[]); setSummary(j.summary ?? {});
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [platformId, brandId, statusF]);
  useEffect(() => { load(); }, [load]);

  const importFile = async (file: File) => {
    if (!platformId) { setNote("เลือกแพลตฟอร์มก่อน"); return; }
    setImporting(true); setNote("กำลังอ่านไฟล์...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const headers = ((aoa[0] ?? []) as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (!headers.length) { setNote("ไม่พบหัวคอลัมน์ในไฟล์"); return; }
      const rows = (aoa.slice(1) as unknown[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== "")).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      const r = await apiFetch("/api/platform-orders/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, headers, rows }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setNote(`นำเข้าแล้ว: ${j.created} ออเดอร์ (ข้ามซ้ำ ${j.skipped}) · ${j.items} รายการ · จับคู่ SKU ${j.matched}`);
      await load();
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const cols: MiniColumn<Order>[] = [
    { key: "no", header: "เลขออเดอร์", width: "1.4fr", sortValue: (o) => o.order_no ?? "", cell: (o) => <span className="font-mono text-xs">{o.order_no || o.external_order_id || "—"}</span> },
    { key: "cust", header: "ลูกค้า", width: "1.3fr", cell: (o) => <span className="truncate">{o.customer_name || "—"}</span> },
    { key: "total", header: "ยอด", width: "0.8fr", align: "right", sortValue: (o) => o.total ?? -1, cell: (o) => o.total != null ? <span>{o.total.toLocaleString()}฿</span> : "—" },
    { key: "stock", header: "สต๊อก", width: "4rem", align: "center", cell: (o) => o.stock_deducted ? <span className="text-emerald-600" title="ตัดสต๊อกแล้ว">✓</span> : <span className="text-slate-300">—</span> },
    { key: "st", header: "สถานะ", width: "6rem", sortValue: (o) => STATUS_ORDER.indexOf(o.status), cell: (o) => <StatusChip s={o.status} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">📥 ออเดอร์จากแพลตฟอร์ม</h1>
      <p className="text-sm text-slate-500 mb-4">อัปไฟล์ออเดอร์จาก Seller Center → ยืนยันเพื่อตัดสต๊อก → แพ็ค → ส่ง (กรอกเลขพัสดุ)</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          {platforms.map((p) => <option key={p.id} value={p.id}>{(p.icon_key || PLATFORM_ICON[p.code] || "🏬") + " " + p.name_th}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white"><option value="">ทุกแบรนด์/ร้าน</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white"><option value="">ทุกสถานะ</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{ST[s].label}{summary[s] != null ? ` (${summary[s]})` : ""}</option>)}</select>
        <div className="flex-1" />
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!canManage || importing || !platformId} title={!canManage ? "ไม่มีสิทธิ์นำเข้า" : "อัปไฟล์ออเดอร์ (Excel/CSV)"} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : "⬆️ อัปไฟล์ออเดอร์"}</button>
      </div>
      {note && <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{note}</p>}

      {loading ? <p className="text-slate-400 text-sm py-8 text-center">กำลังโหลด...</p>
        : orders.length === 0 ? <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">ยังไม่มีออเดอร์<br />กด “⬆️ อัปไฟล์ออเดอร์” เพื่อนำเข้าจาก Seller Center</div>
        : <MiniTable rows={orders} columns={cols} rowKey={(o) => o.id} searchText={(o) => `${o.order_no ?? ""} ${o.customer_name ?? ""}`} onRowClick={(o) => setOpenId(o.id)} dense countUnit="ออเดอร์" />}

      {openId && <OrderDrawer id={openId} canManage={canManage} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

// ---- Drawer รายละเอียดออเดอร์ ----
type Item = { id: string; sku_code: string | null; matched_sku_id: string | null; name: string | null; qty: number; price: number | null };
function OrderDrawer({ id, canManage, onClose, onChanged }: { id: string; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await apiFetch(`/api/platform-orders?id=${id}`).then((r) => r.json()); if (j.error) throw new Error(j.error); setOrder(j.order); setItems((j.items ?? []) as Item[]); setTracking(String(j.order?.tracking_no ?? "")); setCarrier(String(j.order?.carrier ?? "")); } catch (e) { setMsg((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const patch = async (p: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch("/api/platform-orders", { method: "PATCH", body: JSON.stringify({ id, ...p }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.warnings?.length) setMsg("⚠ " + j.warnings.join(" · ")); else setMsg("บันทึกแล้ว");
      await load(); onChanged();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const status = String(order?.status ?? "new");
  const unmatched = items.filter((i) => !i.matched_sku_id).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[460px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0"><h3 className="text-base font-semibold text-slate-900 truncate">ออเดอร์ {String(order?.order_no ?? order?.external_order_id ?? "")}</h3>{order && <StatusChip s={status} />}</div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        {!order ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด...</div> : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="text-sm space-y-1">
              <p><span className="text-slate-400">ลูกค้า:</span> {String(order.customer_name ?? "—")}</p>
              <p><span className="text-slate-400">ยอดรวม:</span> {order.total != null ? `${Number(order.total).toLocaleString()}฿` : "—"}</p>
              <p><span className="text-slate-400">ตัดสต๊อก:</span> {order.stock_deducted ? "✓ แล้ว" : "ยังไม่ตัด"}</p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">รายการ ({items.length}){unmatched > 0 && <span className="text-rose-500"> · จับคู่ SKU ไม่ได้ {unmatched}</span>}</p>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="font-mono text-slate-600 shrink-0">{it.sku_code || "—"}</span>
                    <span className="flex-1 truncate text-slate-700">{it.name || "—"}</span>
                    <span className="text-slate-500 shrink-0">x{it.qty}</span>
                    {it.matched_sku_id ? <span className="text-emerald-600 shrink-0" title="จับคู่ ERP ได้">✓</span> : <span className="text-rose-500 shrink-0" title="จับคู่ SKU ไม่ได้ → จะไม่ตัดสต๊อก">✗</span>}
                  </div>
                ))}
              </div>
            </div>

            {(status === "packed" || status === "shipped") && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">เลขพัสดุ / ขนส่ง</p>
                <div className="flex gap-1.5">
                  <ERPInput value={tracking} disabled={!canManage} placeholder="เลขพัสดุ" onChange={(e) => setTracking(e.target.value)} />
                  <ERPInput value={carrier} disabled={!canManage} placeholder="ขนส่ง" className="max-w-[120px]" onChange={(e) => setCarrier(e.target.value)} />
                </div>
              </div>
            )}
            {msg && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{msg}</p>}
          </div>
        )}
        {canManage && order && (
          <div className="border-t border-slate-200 px-5 py-3 flex flex-wrap items-center gap-2 shrink-0">
            {status === "new" && <button onClick={() => patch({ status: "confirmed" })} disabled={busy} className="h-9 px-3 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">✓ ยืนยัน (ตัดสต๊อก)</button>}
            {status === "confirmed" && <button onClick={() => patch({ status: "packed" })} disabled={busy} className="h-9 px-3 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50">📦 แพ็คแล้ว</button>}
            {status === "packed" && <button onClick={() => patch({ status: "shipped", tracking_no: tracking, carrier })} disabled={busy} className="h-9 px-3 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">🚚 ส่งแล้ว</button>}
            {status === "shipped" && <button onClick={() => patch({ tracking_no: tracking, carrier })} disabled={busy} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">บันทึกเลขพัสดุ</button>}
            <div className="flex-1" />
            {status !== "cancelled" && status !== "shipped" && <button onClick={() => { if (window.confirm("ยกเลิกออเดอร์นี้? (คืนสต๊อกถ้าเคยตัด)")) patch({ status: "cancelled" }); }} disabled={busy} className="h-9 px-3 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">ยกเลิก</button>}
          </div>
        )}
      </div>
    </>
  );
}
