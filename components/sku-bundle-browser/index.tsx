"use client";

/**
 * BundleBrowser — แท็บ 📦 Bundle ในหน้า /master/skus (ข้าง 🛒 จาก Taobao)
 *
 * Bundle = กลุ่ม SKU ที่จับรวมกัน ตั้งชื่อก็ได้ไม่ตั้งก็ได้ (ไม่ตั้ง = "Bundle #n")
 * แต่ละ SKU ใน bundle มีลิงก์ Taobao ของตัวเอง — ลิงก์เก็บที่ SKU กลาง (skus_v2.purchase_link)
 * ใส่/แก้จากในนี้ได้เลย → ทุกหน้าที่ใช้ SKU นั้นเห็นลิงก์เดียวกัน
 *
 * ของกลางที่ใช้: SkuMultiPickerModal · HoverImage · ERPModal · ConfirmDialog · MasterRecordDrawer · useToast · apiFetch · formatAmount
 * API: /api/sku-bundles (GET/POST/PATCH/DELETE) · ลิงก์ → PATCH /api/master-v2/skus/<id> {purchase_link}
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/money";
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

export function BundleBrowser() {
  const toast = useToast();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");                      // คำค้นที่ debounce แล้ว
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(append ? bundles.length : 0) });
      if (q) p.set("search", q);
      const j = await apiFetch(`/api/sku-bundles?${p}`).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      setBundles((prev) => append ? [...prev, ...(j.bundles as Bundle[])] : (j.bundles as Bundle[]));
      setTotal(Number(j.total ?? 0));
    } catch { toast.error("โหลด bundle ไม่สำเร็จ"); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { void load(false); }, [load]);

  const open = useMemo(() => bundles.find((b) => b.id === openId) ?? null, [bundles, openId]);

  return (
    <div>
      {/* แถบบน: ค้นหา + สร้าง */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา bundle (ชื่อ bundle / รหัสหรือชื่อ SKU ข้างใน)"
            className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <button onClick={() => setCreateOpen(true)} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0">+ สร้าง Bundle</button>
        <span className="text-xs text-slate-400">{total.toLocaleString("th-TH")} bundle</span>
      </div>

      {/* กริดการ์ด */}
      {loading && bundles.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {q ? "ไม่พบ bundle ที่ตรงกับคำค้น" : <>ยังไม่มี bundle — กด <b>+ สร้าง Bundle</b> แล้วเลือก SKU ที่ต้องการจับกลุ่ม</>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {bundles.map((b) => <BundleCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />)}
          </div>
          {bundles.length < total && (
            <div className="text-center mt-4">
              <button onClick={() => void load(true)} disabled={loading} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">{loading ? "กำลังโหลด..." : `โหลดเพิ่ม (${(total - bundles.length).toLocaleString("th-TH")} ที่เหลือ)`}</button>
            </div>
          )}
        </>
      )}

      {createOpen && <CreateBundleModal onClose={() => setCreateOpen(false)} onCreated={async (id) => { setCreateOpen(false); await load(false); setOpenId(id); }} />}
      {open && <BundleDrawer b={open} onClose={() => setOpenId(null)} onChanged={() => void load(false)} onDeleted={() => { setOpenId(null); void load(false); }} />}
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
function BundleDrawer({ b, onClose, onChanged, onDeleted }: { b: Bundle; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(b.name ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skuDrawer, setSkuDrawer] = useState<string | null>(null);
  useEffect(() => { setName(b.name ?? ""); }, [b.name]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !skuDrawer && !pickerOpen && !confirmDel) onClose(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose, skuDrawer, pickerOpen, confirmDel]);

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/sku-bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, ...body }) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return false; }
      if (okMsg) toast.success(okMsg);
      onChanged(); return true;
    } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try {
      const j = await apiFetch(`/api/sku-bundles?id=${b.id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success("ลบ bundle แล้ว (SKU ข้างในไม่ถูกลบ)"); onDeleted();
    } finally { setBusy(false); setConfirmDel(false); }
  };
  const behind = !!skuDrawer;   // เปิดหน้า SKU ซ้อน → ถอย drawer นี้ไปข้างหลัง

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
            <button onClick={() => setPickerOpen(true)} disabled={busy} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">+ เพิ่ม SKU</button>
            <span className="flex-1" />
            <button onClick={() => setConfirmDel(true)} disabled={busy} className="h-9 px-3 text-sm rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50">🗑 ลบ Bundle</button>
          </div>
        </div>
      </div>

      <SkuMultiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} excludeIds={b.items.map((i) => i.sku_id)}
        onConfirm={async (skus) => { setPickerOpen(false); if (skus.length) await patch({ add_sku_ids: skus.map((s) => s.id) }, `เพิ่ม ${skus.length} SKU แล้ว`); }} />
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={() => void del()} loading={busy} variant="danger"
        title="ลบ bundle นี้?" message={`"${bundleTitle(b)}" จะถูกลบออกจากรายการ bundle — SKU ${b.items.length} ตัวข้างในยังอยู่ตามเดิม ไม่ถูกลบ`} confirmText="ลบ bundle" />
      {skuDrawer && <MasterRecordDrawer moduleKey="skus" recordId={skuDrawer} onClose={() => setSkuDrawer(null)} onChanged={onChanged} />}
    </>,
    document.body,
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
