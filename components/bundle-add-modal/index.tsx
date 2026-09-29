"use client";

/**
 * BundleAddModal — ของกลาง: "ส่ง SKU ที่เลือกเข้า Bundle" จากหน้าไหนก็ได้
 *
 * 2 ทาง: ① สร้าง Bundle ใหม่ (ตั้งชื่อหรือไม่ตั้งก็ได้)  ② เพิ่มเข้า Bundle ที่มีอยู่ (ค้นหาแล้วเลือก)
 * SKU ที่อยู่ใน Bundle ปลายทางอยู่แล้ว ระบบข้ามให้เอง (ไม่ซ้ำ)
 *
 * API: /api/sku-bundles (POST สร้าง · PATCH add_sku_ids) — guard products.edit + audit ที่ฝั่ง server
 * ของกลางที่ใช้: ERPModal · HoverImage · usePermission · useToast · apiFetch
 * ใช้ที่: แท็บ 🎨 Swatch (โหมดเลือกหลายรายการ)
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import type { Bundle } from "@/app/api/sku-bundles/route";

export type BundleAddItem = { sku_id: string; code: string; name: string; image?: string | null };
const titleOf = (b: Bundle) => b.name?.trim() || `Bundle #${b.seq}`;

export function BundleAddModal({ items, onClose, onDone }: {
  items: BundleAddItem[];
  onClose: () => void;
  onDone?: (bundleId: string) => void;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // รายการ Bundle ที่มีอยู่ (ค้นหา debounce 250ms) — โหลดเมื่อสลับมาโหมด "ที่มีอยู่"
  useEffect(() => {
    if (mode !== "existing") return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: "40" });
      if (search.trim()) p.set("search", search.trim());
      apiFetch(`/api/sku-bundles?${p}`).then((r) => r.json())
        .then((j) => { if (alive) setList((j.bundles ?? []) as Bundle[]); })
        .catch(() => { if (alive) setList([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [mode, search]);

  const picked = list.find((b) => b.id === pickId) ?? null;
  const already = picked ? items.filter((i) => picked.items.some((x) => x.sku_id === i.sku_id)).length : 0;
  const valid = canEdit && items.length > 0 && (mode === "new" || !!pickId);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setErr(null);
    try {
      const skuIds = items.map((i) => i.sku_id);
      const res = mode === "new"
        ? await apiFetch("/api/sku-bundles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sku_ids: skuIds }) })
        : await apiFetch("/api/sku-bundles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: pickId, add_sku_ids: skuIds }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const added = items.length - already;
      toast.success(mode === "new"
        ? `สร้าง Bundle ใหม่ ${items.length} รายการแล้ว`
        : added > 0 ? `เพิ่ม ${added} รายการเข้า “${picked ? titleOf(picked) : "Bundle"}” แล้ว${already > 0 ? ` (ข้าม ${already} รายการที่มีอยู่แล้ว)` : ""}` : "ทุกรายการอยู่ใน Bundle นี้อยู่แล้ว");
      onDone?.(mode === "new" ? String(j.id) : String(pickId));
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" storageKey="bundle-add-modal" loading={saving}
      hasUnsavedChanges={!!name || !!pickId}
      title={`📦 ส่งเข้า Bundle (${items.length} รายการ)`}
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={!valid || saving}
            title={!canEdit ? "คุณไม่มีสิทธิ์แก้ไขสินค้า" : mode === "existing" && !pickId ? "เลือก Bundle ปลายทางก่อน" : undefined}
            className="h-9 px-5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : mode === "new" ? "สร้าง Bundle ใหม่" : "เพิ่มเข้า Bundle นี้"}
          </button>
        </>
      }>
      <div className="space-y-3">
        {!canEdit && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">คุณไม่มีสิทธิ์แก้ไขสินค้า จึงเพิ่มเข้า Bundle ไม่ได้</div>}
        {err && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">⚠ {err}</div>}

        {/* ของที่จะส่ง */}
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {items.map((i) => (
            <span key={i.sku_id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 max-w-full" title={i.name}>
              <HoverImage url={i.image ?? null} size={20} rounded="rounded-full" />
              <span className="font-mono text-[11px] text-slate-600 truncate">{i.code}</span>
            </span>
          ))}
        </div>

        {/* เลือกทาง */}
        <div className="grid grid-cols-2 gap-1 text-sm">
          <button type="button" onClick={() => setMode("new")}
            className={`py-2 rounded-lg border transition-colors ${mode === "new" ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>＋ สร้าง Bundle ใหม่</button>
          <button type="button" onClick={() => setMode("existing")}
            className={`py-2 rounded-lg border transition-colors ${mode === "existing" ? "bg-emerald-600 text-white border-emerald-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>📦 เพิ่มเข้า Bundle ที่มีอยู่</button>
        </div>

        {mode === "new" ? (
          <label className="block text-sm">
            <span className="text-slate-600">ชื่อ Bundle <span className="text-slate-400 text-xs">(ไม่ใส่ก็ได้ ระบบตั้งให้เป็น Bundle #ลำดับ)</span></span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="เช่น ชุดผ้า PU โทนน้ำตาล"
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
              className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </label>
        ) : (
          <div>
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา Bundle (ชื่อ / รหัสหรือชื่อ SKU ข้างใน)"
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            <div className="mt-2 border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
              {loading ? <div className="px-3 py-4 text-center text-xs text-slate-400">กำลังโหลด…</div>
                : list.length === 0 ? <div className="px-3 py-4 text-center text-xs text-slate-400">{search.trim() ? "ไม่พบ Bundle ที่ค้นหา" : "ยังไม่มี Bundle — เลือก “สร้าง Bundle ใหม่” แทน"}</div>
                : list.map((b) => (
                  <button key={b.id} type="button" onClick={() => setPickId(b.id)}
                    className={`w-full px-3 py-2 flex items-center gap-2 text-left ${b.id === pickId ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${b.id === pickId ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-800 truncate">{titleOf(b)}</span>
                      <span className="block text-[11px] text-slate-400">{b.items.length} SKU</span>
                    </span>
                  </button>
                ))}
            </div>
            {picked && already > 0 && <p className="mt-1 text-[11px] text-amber-700">⚠ มี {already} รายการอยู่ใน Bundle นี้อยู่แล้ว — ระบบจะข้ามให้ ไม่เพิ่มซ้ำ</p>}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
