"use client";

/**
 * BundleBrowser — แท็บ 📦 Bundle ในหน้า /master/skus (ข้าง 🛒 จาก Taobao)
 *
 * Bundle = กลุ่ม SKU ที่จับรวมกัน ตั้งชื่อก็ได้ไม่ตั้งก็ได้ (ไม่ตั้ง = "Bundle #n")
 * แต่ละ SKU ใน bundle มีลิงก์ Taobao ของตัวเอง — ลิงก์เก็บที่ SKU กลาง (skus_v2.purchase_link)
 * ใส่/แก้จากในนี้ได้เลย → ทุกหน้าที่ใช้ SKU นั้นเห็นลิงก์เดียวกัน
 *
 * ขอซื้อทั้งชุด: ปุ่มในเดรเวอร์ → ป๊อปตรวจ (ซื้อกี่ชุด · ติ๊กเอาออก · แก้จำนวน · เตือนไม่มีราคา/ลิงก์) → ใส่ตะกร้าขอซื้อกลาง (lib/pr-cart) แล้วไปยืนยันที่หน้า "ขอซื้อ"
 * ลบ = ย้ายไปถังขยะ (กู้คืนได้ + ปุ่มย้อนกลับในแจ้งผล) · ลบถาวรได้เฉพาะในถังขยะ (พิมพ์ยืนยัน)
 *
 * ของกลางที่ใช้: SkuMultiPickerModal · HoverImage · ERPModal · ConfirmDialog · MasterRecordDrawer · useToast · apiFetch · formatAmount · addToPrCart · usePermission
 * API: /api/sku-bundles (GET/POST/PATCH/DELETE) · ลิงก์ → PATCH /api/master-v2/skus/<id> {purchase_link}
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { addToPrCart } from "@/lib/pr-cart";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { HoverImage } from "@/components/hover-image";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import type { SkuPickerValue } from "@/components/pickers";
import type { Bundle, BundleItem } from "@/app/api/sku-bundles/route";

const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

const PAGE = 60;
const bundleTitle = (b: Bundle) => b.name?.trim() || `Bundle #${b.seq}`;
const isTaobaoLink = (u: string | null) => !!u && /taobao|tmall|1688/i.test(u);
/** ราคาซื้อของ SKU (จากฟิลด์ต้นทุนใน SKU: หยวนก่อน ไม่มีค่อยบาท) */
const buyText = (it: BundleItem) => it.rmb_cost && it.rmb_cost > 0 ? formatAmount(it.rmb_cost, "RMB") : it.standard_price && it.standard_price > 0 ? formatAmount(it.standard_price, "THB") : "—";
/** ราคา + สกุลเงินสำหรับตะกร้าขอซื้อ (กติกาเดียวกับ buyText) */
const buyPrice = (it: BundleItem): { price: number; currency: string } =>
  it.rmb_cost && it.rmb_cost > 0 ? { price: it.rmb_cost, currency: "YUAN" } : { price: it.standard_price && it.standard_price > 0 ? it.standard_price : 0, currency: "THB" };
/** r2 key จาก URL รูป (/api/r2-image?key=...) — ตะกร้าขอซื้อเก็บเป็น key */
const imageKeyOf = (url: string | null) => { if (!url) return null; try { return new URL(url, "http://x").searchParams.get("key"); } catch { return null; } };
const fmtDate = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function BundleBrowser() {
  const toast = useToast();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");                      // คำค้นที่ debounce แล้ว
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);            // ดูถังขยะ
  const [trashCount, setTrashCount] = useState(0);
  const [purgeTarget, setPurgeTarget] = useState<Bundle | null>(null);   // ลบถาวร (ยืนยันก่อน)
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(append ? bundles.length : 0) });
      if (q) p.set("search", q);
      if (trash) p.set("trash", "1");
      const j = await apiFetch(`/api/sku-bundles?${p}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      setBundles((prev) => append ? [...prev, ...(j.bundles as Bundle[])] : (j.bundles as Bundle[]));
      setTotal(Number(j.total ?? 0));
      setTrashCount(Number(j.trash_count ?? 0));
    } catch { toast.error("โหลด bundle ไม่สำเร็จ"); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, trash]);
  useEffect(() => { void load(false); }, [load]);

  const open = useMemo(() => bundles.find((b) => b.id === openId) ?? null, [bundles, openId]);

  // กู้คืนจากถังขยะ (ใช้ทั้งปุ่มในถังขยะ และปุ่ม "ย้อนกลับ" ในแจ้งผลหลังลบ)
  const restore = useCallback(async (b: Bundle, quiet = false) => {
    setBusyId(b.id);
    try {
      const j = await apiFetch("/api/sku-bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, restore: true }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      if (!quiet) toast.success(`กู้คืน “${bundleTitle(b)}” แล้ว`);
      void load(false);
    } finally { setBusyId(null); }
  }, [load, toast]);
  // ย้ายไปถังขยะ → แจ้งผลพร้อมปุ่มย้อนกลับ
  const moveToTrash = useCallback(async (b: Bundle) => {
    const j = await apiFetch(`/api/sku-bundles?id=${b.id}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { toast.error(j.error); return false; }
    toast.undo(`ย้าย “${bundleTitle(b)}” ไปถังขยะแล้ว (SKU ข้างในไม่ถูกลบ)`, () => restore(b, true), { ms: 8000 });
    setOpenId(null); void load(false);
    return true;
  }, [load, restore, toast]);
  const purge = async () => {
    if (!purgeTarget) return;
    setBusyId(purgeTarget.id);
    try {
      const j = await apiFetch(`/api/sku-bundles?id=${purgeTarget.id}&permanent=1`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success(`ลบ “${bundleTitle(purgeTarget)}” ถาวรแล้ว`);
      setPurgeTarget(null); void load(false);
    } finally { setBusyId(null); }
  };

  return (
    <div>
      {/* แถบบน: ค้นหา + สร้าง */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา bundle (ชื่อ bundle / รหัสหรือชื่อ SKU ข้างใน)"
            className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 text-sm">
          <button onClick={() => setTrash(false)} className={`h-9 px-3 ${!trash ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>ใช้อยู่</button>
          <button onClick={() => setTrash(true)} className={`h-9 px-3 border-l border-slate-200 ${trash ? "bg-rose-50 text-rose-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>🗑 ถังขยะ{trashCount > 0 ? ` ${trashCount.toLocaleString("th-TH")}` : ""}</button>
        </div>
        {!trash && <button onClick={() => setCreateOpen(true)} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0">+ สร้าง Bundle</button>}
        <span className="text-xs text-slate-400">{total.toLocaleString("th-TH")} bundle</span>
      </div>
      {trash && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700">Bundle ที่ลบแล้วอยู่ที่นี่ — กด “กู้คืน” เพื่อเอากลับมาใช้ · “ลบถาวร” แล้วเอากลับไม่ได้ (SKU ข้างในไม่ถูกลบทั้งสองแบบ)</div>}

      {/* กริดการ์ด */}
      {loading && bundles.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {q ? "ไม่พบ bundle ที่ตรงกับคำค้น" : trash ? "ถังขยะว่าง" : <>ยังไม่มี bundle — กด <b>+ สร้าง Bundle</b> แล้วเลือก SKU ที่ต้องการจับกลุ่ม · หรือติ๊กการ์ดในแท็บ SKU / จาก Taobao แล้วกด “📦 ส่งเข้า Bundle”</>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {bundles.map((b) => trash
              ? <TrashCard key={b.id} b={b} busy={busyId === b.id} onRestore={() => void restore(b)} onPurge={() => setPurgeTarget(b)} />
              : <BundleCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />)}
          </div>
          {bundles.length < total && (
            <div className="text-center mt-4">
              <button onClick={() => void load(true)} disabled={loading} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">{loading ? "กำลังโหลด..." : `โหลดเพิ่ม (${(total - bundles.length).toLocaleString("th-TH")} ที่เหลือ)`}</button>
            </div>
          )}
        </>
      )}

      {createOpen && <CreateBundleModal onClose={() => setCreateOpen(false)} onCreated={async (id) => { setCreateOpen(false); await load(false); setOpenId(id); }} />}
      {open && <BundleDrawer b={open} onClose={() => setOpenId(null)} onChanged={() => void load(false)} onTrash={() => moveToTrash(open)} />}
      <ConfirmDialog open={!!purgeTarget} onClose={() => setPurgeTarget(null)} onConfirm={() => void purge()} loading={!!busyId} variant="danger"
        title="ลบ bundle นี้ถาวร?" requireTyped="ลบ" confirmText="ลบถาวร"
        message={purgeTarget ? `“${bundleTitle(purgeTarget)}” จะหายไปถาวร เอากลับไม่ได้ — SKU ${purgeTarget.items.length} ตัวข้างในยังอยู่ตามเดิม · พิมพ์คำว่า ลบ เพื่อยืนยัน` : ""} />
    </div>
  );
}

// ───────────────────────────── การ์ดในถังขยะ ─────────────────────────────
function TrashCard({ b, busy, onRestore, onPurge }: { b: Bundle; busy: boolean; onRestore: () => void; onPurge: () => void }) {
  const imgs = b.items.filter((i) => i.image).slice(0, 4);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 aspect-square rounded-lg overflow-hidden bg-slate-50 opacity-60 grayscale">
        {imgs.length === 0
          ? <div className="col-span-2 flex items-center justify-center text-3xl text-slate-300">📦</div>
          : imgs.map((i) => <img key={i.id} src={`${i.image}&w=200`} alt="" className={`w-full h-full object-cover ${imgs.length === 1 ? "col-span-2" : ""}`} loading="lazy" />)}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-700 truncate" title={bundleTitle(b)}>{bundleTitle(b)}</div>
        <div className="text-[11px] text-slate-400">{b.items.length} SKU · ลบเมื่อ {fmtDate(b.updated_at)}</div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onRestore} disabled={busy} className="flex-1 h-8 text-xs rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">↩ กู้คืน</button>
        <button onClick={onPurge} disabled={busy} className="h-8 px-2 text-xs rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50">ลบถาวร</button>
      </div>
    </div>
  );
}

// ───────────────────────────── การ์ด ─────────────────────────────
function BundleCard({ b, onOpen }: { b: Bundle; onOpen: () => void }) {
  const imgs = b.items.filter((i) => i.image).slice(0, 4);
  const linked = b.items.filter((i) => i.purchase_link).length;
  return (
    <button onClick={onOpen} className="text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm transition p-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 aspect-square rounded-lg overflow-hidden bg-slate-50">
        {imgs.length === 0
          ? <div className="col-span-2 flex items-center justify-center text-3xl text-slate-300">📦</div>
          : imgs.map((i) => <img key={i.id} src={`${i.image}&w=200`} alt="" className={`w-full h-full object-cover ${imgs.length === 1 ? "col-span-2" : ""}`} loading="lazy" />)}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-800 truncate" title={bundleTitle(b)}>{bundleTitle(b)}</div>
        <div className="text-[11px] text-slate-500 flex items-center gap-2">
          <span>{b.items.length} SKU</span>
          <span className={linked === b.items.length && b.items.length > 0 ? "text-emerald-600" : "text-amber-600"}>🔗 {linked}/{b.items.length} มีลิงก์</span>
        </div>
      </div>
    </button>
  );
}

// ───────────────────────────── สร้างใหม่ ─────────────────────────────
function CreateBundleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<SkuPickerValue[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (picked.length === 0) { toast.error("เลือก SKU อย่างน้อย 1 ตัว"); return; }
    setSaving(true);
    try {
      const j = await apiFetch("/api/sku-bundles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sku_ids: picked.map((s) => s.id) }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success("สร้าง bundle แล้ว");
      onCreated(j.id as string);
    } finally { setSaving(false); }
  };
  return (
    <>
      <ERPModal open onClose={onClose} title="สร้าง Bundle" size="md" hasUnsavedChanges={picked.length > 0 || !!name}
        footer={<div className="flex justify-end gap-2"><button onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button><button onClick={() => void save()} disabled={saving || picked.length === 0} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : `บันทึก (${picked.length} SKU)`}</button></div>}>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">ชื่อ bundle <span className="text-slate-400 text-xs">(ไม่ใส่ก็ได้ ระบบตั้งให้เป็น Bundle #ลำดับ)</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ชุดกระเป๋า+สายคล้อง" className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </label>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">SKU ใน bundle ({picked.length})</span>
              <button onClick={() => setPickerOpen(true)} className="h-8 px-3 text-xs rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">+ เลือก SKU</button>
            </div>
            {picked.length === 0
              ? <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-4 text-center">ยังไม่ได้เลือก — กด "+ เลือก SKU" (เลือกได้หลายตัว)</div>
              : <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                  {picked.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                      <HoverImage url={s.image_url ?? (s.image_key ? `/api/r2-image?key=${encodeURIComponent(s.image_key)}` : null)} size={28} />
                      <span className="font-mono text-xs text-slate-500 shrink-0">{s.code}</span>
                      <span className="truncate flex-1">{s.name}</span>
                      <button onClick={() => setPicked((p) => p.filter((x) => x.id !== s.id))} className="text-slate-400 hover:text-rose-500 px-1" title="เอาออก">✕</button>
                    </li>
                  ))}
                </ul>}
          </div>
        </div>
      </ERPModal>
      <SkuMultiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} excludeIds={picked.map((s) => s.id)}
        onConfirm={(skus) => { setPicked((p) => [...p, ...skus.filter((s) => !p.some((x) => x.id === s.id))]); setPickerOpen(false); }} />
    </>
  );
}

// ───────────────────────────── Drawer รายละเอียด ─────────────────────────────
function BundleDrawer({ b, onClose, onChanged, onTrash }: { b: Bundle; onClose: () => void; onChanged: () => void; onTrash: () => Promise<boolean> }) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(b.name ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skuDrawer, setSkuDrawer] = useState<string | null>(null);
  useEffect(() => { setName(b.name ?? ""); }, [b.name]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !skuDrawer && !pickerOpen && !buyOpen) onClose(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose, skuDrawer, pickerOpen, buyOpen]);

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/sku-bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, ...body }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return false; }
      if (okMsg) toast.success(okMsg);
      onChanged(); return true;
    } finally { setBusy(false); }
  };
  // ลบ = ย้ายไปถังขยะ (กู้คืนได้ + ปุ่มย้อนกลับในแจ้งผล) — ไม่ต้องถามยืนยันซ้ำ
  const del = async () => { setBusy(true); try { await onTrash(); } finally { setBusy(false); } };
  const behind = !!skuDrawer || pickerOpen || buyOpen;   // เปิดหน้า SKU ซ้อน → ถอย drawer นี้ไปข้างหลัง

  return createPortal(
    <>
      <div className={`fixed inset-0 flex justify-end ${behind ? "z-[40] pointer-events-none" : "z-[140] bg-black/30"}`} onClick={behind ? undefined : onClose}>
        <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* หัว */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
            <span className="text-xl">📦</span>
            {editName ? (
              <form className="flex items-center gap-1 flex-1" onSubmit={async (e) => { e.preventDefault(); if (await patch({ name }, "เปลี่ยนชื่อแล้ว")) setEditName(false); }}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`Bundle #${b.seq} (ว่าง = ใช้ชื่ออัตโนมัติ)`} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <button type="submit" disabled={busy} className="h-8 px-2 text-xs rounded-lg bg-indigo-600 text-white">บันทึก</button>
                <button type="button" onClick={() => { setEditName(false); setName(b.name ?? ""); }} className="h-8 px-2 text-xs rounded-lg border border-slate-200">ยกเลิก</button>
              </form>
            ) : (
              <button onClick={() => setEditName(true)} className="flex-1 text-left min-w-0 group" title="คลิกเพื่อเปลี่ยนชื่อ">
                <span className="text-base font-semibold text-slate-800 truncate">{bundleTitle(b)}</span>
                <span className="ml-2 text-xs text-slate-400 group-hover:text-indigo-600">✏️ เปลี่ยนชื่อ</span>
              </button>
            )}
            <span className="text-xs text-slate-400 shrink-0">{b.items.length} SKU</span>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500" title="ปิด (Esc)">✕</button>
          </div>

          {/* รายการ SKU */}
          <div className="flex-1 overflow-y-auto">
            {b.items.length === 0 && <div className="text-center py-12 text-sm text-slate-400">ยังไม่มี SKU ใน bundle นี้</div>}
            <ul className="divide-y divide-slate-100">
              {b.items.map((it) => (
                <BundleItemRow key={it.id} it={it} busy={busy}
                  onOpenSku={() => setSkuDrawer(it.sku_id)}
                  onQty={(n) => void patch({ qty: { [it.sku_id]: n } })}
                  onRemove={() => void patch({ remove_sku_ids: [it.sku_id] }, `เอา ${it.code} ออกจาก bundle แล้ว`)}
                  onLinkSaved={onChanged} />
              ))}
            </ul>
          </div>

          {/* ท้าย */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
            {canEdit && b.items.length > 0 && (
              <button onClick={() => setBuyOpen(true)} disabled={busy} className="h-9 px-3 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">🛒 ขอซื้อทั้งชุด</button>
            )}
            <button onClick={() => setPickerOpen(true)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50">+ เพิ่ม SKU</button>
            <span className="flex-1" />
            <button onClick={() => void del()} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50" title="ย้ายไปถังขยะ (กู้คืนได้)">🗑 ลบ</button>
          </div>
        </div>
      </div>

      <SkuMultiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} excludeIds={b.items.map((i) => i.sku_id)}
        onConfirm={async (skus) => { setPickerOpen(false); if (skus.length) await patch({ add_sku_ids: skus.map((s) => s.id) }, `เพิ่ม ${skus.length} SKU แล้ว`); }} />
      {buyOpen && <BuyBundleModal b={b} onClose={() => setBuyOpen(false)} />}
      {skuDrawer && <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" title="SKU" recordId={skuDrawer} onClose={() => setSkuDrawer(null)} onChanged={onChanged} />}
    </>,
    document.body,
  );
}

// ───────────────────────────── ขอซื้อทั้งชุด → ตะกร้าขอซื้อ ─────────────────────────────
function BuyBundleModal({ b, onClose }: { b: Bundle; onClose: () => void }) {
  const toast = useToast();
  const [sets, setSets] = useState(1);
  const [skip, setSkip] = useState<Set<string>>(new Set());              // sku_id ที่ติ๊กออก
  const [qtyEdit, setQtyEdit] = useState<Record<string, string>>({});    // จำนวนที่แก้เอง (ทับค่า qty × ชุด)
  const qtyOf = (it: BundleItem) => {
    const raw = qtyEdit[it.sku_id];
    if (raw !== undefined) { const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : 0; }
    return Math.round(it.qty * sets * 100) / 100;
  };
  const chosen = b.items.filter((it) => !skip.has(it.sku_id) && qtyOf(it) > 0);
  const noPrice = chosen.filter((it) => buyPrice(it).price <= 0).length;
  const noLink = chosen.filter((it) => !it.purchase_link).length;
  const dirty = sets !== 1 || skip.size > 0 || Object.keys(qtyEdit).length > 0;

  const submit = () => {
    if (chosen.length === 0) { toast.error("ยังไม่ได้เลือกรายการ"); return; }
    const title = bundleTitle(b);
    const n = addToPrCart(chosen.map((it) => {
      const { price, currency } = buyPrice(it);
      return {
        label: it.name || it.code, qty: qtyOf(it), uom: it.uom || "ชิ้น", seller: it.seller || "—",
        price, currency, image: imageKeyOf(it.image), variationId: null, skuRef: it.code, skuId: it.sku_id,
        note: `จาก Bundle: ${title}${sets > 1 ? ` (${sets} ชุด)` : ""}`,
      };
    }));
    toast.action(`ใส่ตะกร้าขอซื้อแล้ว ${chosen.length} รายการ (ตะกร้ามี ${n} รายการ) — ไปกดยืนยันที่หน้า “ขอซื้อ”`, "ไปหน้าขอซื้อ", () => { window.location.href = "/purchasing"; });
    onClose();
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={`🛒 ขอซื้อทั้งชุด — ${bundleTitle(b)}`} hasUnsavedChanges={dirty} storageKey="bundle-buy-modal"
      footer={<div className="flex justify-end gap-2 w-full">
        <button onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button onClick={submit} disabled={chosen.length === 0} className="h-9 px-4 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">ใส่ตะกร้า {chosen.length} รายการ</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">ซื้อกี่ชุด</span>
          <button onClick={() => { setSets((s) => Math.max(1, s - 1)); setQtyEdit({}); }} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="ลดจำนวนชุด">−</button>
          <input type="number" min={1} step={1} value={sets} onChange={(e) => { const n = Math.floor(Number(e.target.value)); setSets(Number.isFinite(n) && n > 0 ? n : 1); setQtyEdit({}); }}
            className="w-16 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg" />
          <button onClick={() => { setSets((s) => s + 1); setQtyEdit({}); }} className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label="เพิ่มจำนวนชุด">+</button>
          <span className="text-xs text-slate-400">จำนวนแต่ละชิ้น = จำนวนใน bundle × ชุด (แก้รายชิ้นได้)</span>
        </div>
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-[50vh] overflow-y-auto">
          {b.items.map((it) => {
            const off = skip.has(it.sku_id);
            const { price } = buyPrice(it);
            return (
              <li key={it.id} className={`flex items-center gap-2 px-2 py-2 ${off ? "opacity-50" : ""}`}>
                <input type="checkbox" checked={!off} onChange={() => setSkip((s) => { const n = new Set(s); n.has(it.sku_id) ? n.delete(it.sku_id) : n.add(it.sku_id); return n; })} className="w-4 h-4 shrink-0" aria-label={`เลือก ${it.code}`} />
                <HoverImage url={it.image} size={36} rounded="rounded-md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{it.name || it.code}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <span className="font-mono">{it.code}</span>
                    <span>{buyText(it)}</span>
                    {it.seller && <span className="truncate max-w-[10rem]">· {it.seller}</span>}
                    {price <= 0 && <span className="px-1.5 rounded bg-amber-50 text-amber-700">ยังไม่มีราคา</span>}
                    {!it.purchase_link && <span className="px-1.5 rounded bg-amber-50 text-amber-700">ยังไม่มีลิงก์</span>}
                  </div>
                </div>
                <input type="number" min={0} step="any" disabled={off} value={qtyEdit[it.sku_id] ?? String(qtyOf(it))}
                  onChange={(e) => setQtyEdit((m) => ({ ...m, [it.sku_id]: e.target.value }))}
                  className="w-16 h-8 px-1.5 text-sm text-right border border-slate-200 rounded-lg shrink-0" aria-label={`จำนวน ${it.code}`} />
                <span className="text-[11px] text-slate-500 w-10 shrink-0 truncate">{it.uom || "ชิ้น"}</span>
              </li>
            );
          })}
        </ul>
        {(noPrice > 0 || noLink > 0) && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            {noPrice > 0 && <div>{noPrice} รายการยังไม่มีราคา — ส่งได้ ไปใส่ราคาที่ตะกร้าก่อนยืนยัน</div>}
            {noLink > 0 && <div>{noLink} รายการยังไม่มีลิงก์ Taobao — ใส่ได้ในหน้า Bundle นี้</div>}
          </div>
        )}
      </div>
    </ERPModal>
  );
}

// ───────────────────────────── แถว SKU ในเดรเวอร์ ─────────────────────────────
function BundleItemRow({ it, busy, onOpenSku, onQty, onRemove, onLinkSaved }: {
  it: BundleItem; busy: boolean; onOpenSku: () => void; onQty: (n: number) => void; onRemove: () => void; onLinkSaved: () => void;
}) {
  const toast = useToast();
  const [editLink, setEditLink] = useState(false);
  const [link, setLink] = useState(it.purchase_link ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLink(it.purchase_link ?? ""); }, [it.purchase_link]);

  // ลิงก์เก็บที่ SKU กลาง (purchase_link) — ผ่าน API master กลาง (สิทธิ์ products.edit + audit ให้เอง)
  const saveLink = async () => {
    setSaving(true);
    try {
      const j = await apiFetch(`/api/master-v2/skus/${it.sku_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchase_link: link.trim() || null }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success(link.trim() ? "บันทึกลิงก์ลง SKU แล้ว" : "ล้างลิงก์แล้ว"); setEditLink(false); onLinkSaved();
    } finally { setSaving(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(it.purchase_link ?? ""); toast.success("คัดลอกลิงก์แล้ว"); } catch { toast.error("คัดลอกไม่สำเร็จ"); } };

  return (
    <li className={`px-4 py-2.5 flex gap-3 ${it.is_active ? "" : "opacity-60"}`}>
      <HoverImage url={it.image} size={56} previewSize={360} rounded="rounded-lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button onClick={onOpenSku} className="font-mono text-xs text-indigo-600 hover:underline shrink-0" title="เปิดหน้า SKU">{it.code}</button>
          <span className="text-sm text-slate-800 truncate flex-1">{it.name}</span>
          {!it.is_active && <span className="text-[10px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">ปิดใช้งาน</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span>ราคาซื้อ <b className="text-slate-700">{buyText(it)}</b></span>
          {it.list_price != null && it.list_price > 0 && <span>ขาย <b className="text-slate-700">{formatAmount(it.list_price, "THB")}</b></span>}
          <label className="flex items-center gap-1">จำนวน
            <input type="number" min={1} step={1} defaultValue={it.qty} key={it.qty} disabled={busy}
              onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n !== it.qty) onQty(n); }}
              className="w-14 h-6 px-1 text-[11px] border border-slate-200 rounded text-right" />
          </label>
        </div>
        {/* ลิงก์ Taobao — รายตัว */}
        <div className="mt-1">
          {editLink ? (
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); void saveLink(); }}>
              <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="วางลิงก์ Taobao / Tmall / 1688" className="flex-1 h-7 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200" />
              <button type="submit" disabled={saving} className="h-7 px-2 text-xs rounded-lg bg-orange-500 text-white disabled:opacity-50">{saving ? "..." : "บันทึก"}</button>
              <button type="button" onClick={() => { setEditLink(false); setLink(it.purchase_link ?? ""); }} className="h-7 px-2 text-xs rounded-lg border border-slate-200">ยกเลิก</button>
            </form>
          ) : it.purchase_link ? (
            <div className="flex items-center gap-1 min-w-0">
              <a href={it.purchase_link} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 h-7 px-2 text-xs rounded-lg border truncate max-w-[60%] ${isTaobaoLink(it.purchase_link) ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`} title={it.purchase_link}>
                {isTaobaoLink(it.purchase_link) ? "淘 เปิด Taobao" : "🔗 เปิดลิงก์"}
              </a>
              <button onClick={() => void copy()} className="h-7 px-2 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50" title="คัดลอกลิงก์">📋</button>
              <button onClick={() => setEditLink(true)} className="h-7 px-2 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50" title="แก้ลิงก์">✏️</button>
            </div>
          ) : (
            <button onClick={() => setEditLink(true)} className="h-7 px-2 text-xs rounded-lg border border-dashed border-orange-300 text-orange-600 bg-white hover:bg-orange-50">＋ ใส่ลิงก์ Taobao</button>
          )}
        </div>
      </div>
      <button onClick={onRemove} disabled={busy} className="self-start w-7 h-7 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-50" title="เอาออกจาก bundle">✕</button>
    </li>
  );
}
