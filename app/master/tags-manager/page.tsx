"use client";

/**
 * Tags Manager — /master/tags-manager
 *
 * จัดการแท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — ใช้ได้ทั้ง Parent SKU และ SKU
 * เลย์เอาต์ (ตามที่เจ้าของออกแบบ):
 *   ซ้าย  = คลังสินค้า (ค้นหา/เรียง) → กด [+] หรือ "ลาก" ไปกล่องขวา
 *   ขวา   = ตะกร้าสินค้าที่เลือก + ด้านบนมีชุดแท็กที่จะใส่ (ลบได้)
 *   ล่าง  = คลังแท็กทั้งหมด → กด/ลาก ขึ้นไปใส่ในชุดแท็ก (+ สร้างแท็กใหม่)
 *   ปุ่ม "ใส่แท็กให้ทั้งหมด" = ผูกชุดแท็กให้สินค้าทุกตัวในตะกร้าทีเดียว (ยืนยันก่อน, มี audit log)
 *
 * ใช้ของกลาง: API master-v2 (list/distinct) + m2m-links (ผูกแท็ก)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Rec = { id: string; code: string; name: string; image: string | null };
type Tag = { id: string; label: string };

const ENTITIES = {
  "parent-skus": { label: "Parent SKU", api: "parent-skus", junction: "parent_skus_v2_product_family_m2m" },
  "skus":        { label: "SKU",        api: "skus",        junction: "skus_v2_product_family_m2m" },
} as const;
type EntityKey = keyof typeof ENTITIES;

const TAG_MODULE = "product_families";

function recImg(k: string | null) { return k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null; }

export default function TagsManagerPage() {
  const [entity, setEntity] = useState<EntityKey>("parent-skus");
  const cfg = ENTITIES[entity];

  // ---- คลังสินค้า (ซ้าย) ----
  const [pool, setPool] = useState<Rec[]>([]);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loadingPool, setLoadingPool] = useState(false);

  // ---- ตะกร้า (ขวา) ----
  const [cart, setCart] = useState<Rec[]>([]);
  const [tagSet, setTagSet] = useState<string[]>([]);

  // ---- คลังแท็ก (ล่าง) ----
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const dragRef = useRef<{ type: "rec" | "tag"; id: string } | null>(null);

  const loadTags = useCallback(() => {
    apiFetch(`/api/master-v2/${TAG_MODULE}?limit=500`).then((r) => r.json())
      .then((j) => setAllTags(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: String(r.name ?? r.id) }))))
      .catch(() => {});
  }, []);
  useEffect(() => { loadTags(); }, [loadTags]);

  const loadPool = useCallback(() => {
    setLoadingPool(true);
    const qs = new URLSearchParams({ limit: "100", sort_by: "code", sort_dir: sortDir });
    if (search.trim()) qs.set("search", search.trim());
    apiFetch(`/api/master-v2/${cfg.api}?${qs}`).then((r) => r.json())
      .then((j) => setPool(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id), code: String(r.code ?? r.id), name: String(r.name_th ?? r.name ?? ""), image: (r.cover_image_r2_key as string) ?? null,
      }))))
      .catch(() => setPool([]))
      .finally(() => setLoadingPool(false));
  }, [cfg.api, search, sortDir]);
  // โหลดใหม่เมื่อเปลี่ยน entity/sort + ค้นหา (debounce)
  useEffect(() => { const t = setTimeout(loadPool, 300); return () => clearTimeout(t); }, [loadPool]);
  // เปลี่ยน entity → ล้างตะกร้า (junction คนละตาราง)
  useEffect(() => { setCart([]); }, [entity]);

  const cartIds = useMemo(() => new Set(cart.map((c) => c.id)), [cart]);
  const tagLabel = (id: string) => allTags.find((t) => t.id === id)?.label ?? id.slice(0, 6);

  const addToCart = (r: Rec) => setCart((c) => (c.some((x) => x.id === r.id) ? c : [...c, r]));
  const removeFromCart = (id: string) => setCart((c) => c.filter((x) => x.id !== id));
  const addTag = (id: string) => setTagSet((s) => (s.includes(id) ? s : [...s, id]));
  const removeTag = (id: string) => setTagSet((s) => s.filter((x) => x !== id));

  const createTag = async () => {
    const name = newTag.trim(); if (!name) return;
    const res = await apiFetch(`/api/master-v2/${TAG_MODULE}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error || !j.data?.id) { alert("สร้างแท็กไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    const id = String(j.data.id);
    setAllTags((t) => [...t, { id, label: name }]); setNewTag(""); addTag(id);
  };

  const apply = async () => {
    if (cart.length === 0 || tagSet.length === 0) return;
    const total = cart.length * tagSet.length;
    if (!confirm(`ใส่ ${tagSet.length} แท็ก ให้สินค้า ${cart.length} ตัว (รวม ${total} รายการเชื่อมโยง)?`)) return;
    setApplying(true); setResult(null);
    let ok = 0, fail = 0;
    for (const rec of cart) {
      for (const tag of tagSet) {
        try {
          const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction: cfg.junction, src_id: rec.id, tgt_id: tag }) });
          if (res.ok) ok++; else fail++;
        } catch { fail++; }
      }
    }
    setApplying(false);
    setResult(`เสร็จแล้ว — ใส่แท็กสำเร็จ ${ok} รายการ${fail ? `, ไม่สำเร็จ ${fail}` : ""}`);
  };

  // ---- drag helpers ----
  const onDrop = (zone: "cart" | "tagset") => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (zone === "cart" && d.type === "rec") { const r = pool.find((x) => x.id === d.id); if (r) addToCart(r); }
    if (zone === "tagset" && d.type === "tag") addTag(d.id);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">🏷️ Tags Manager</h1>
            <p className="text-sm text-slate-500 mt-0.5">ใส่แท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — ลากหรือกดเพื่อเลือก</p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {(Object.keys(ENTITIES) as EntityKey[]).map((k) => (
              <button key={k} onClick={() => setEntity(k)}
                className={`px-4 h-9 text-sm font-medium ${entity === k ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {ENTITIES[k].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ซ้าย: คลังสินค้า */}
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[50vh]">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">คลัง{cfg.label}</span>
            <span className="text-xs text-slate-400">({pool.length})</span>
            <div className="flex-1" />
            <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="text-xs px-2 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
              เรียงรหัส {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="px-3 py-2 border-b border-slate-100">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ…"
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingPool && <div className="text-xs text-slate-400 py-4 text-center">กำลังโหลด…</div>}
            {!loadingPool && pool.length === 0 && <div className="text-xs text-slate-400 py-4 text-center">ไม่พบรายการ</div>}
            {pool.map((r) => {
              const inCart = cartIds.has(r.id);
              return (
                <div key={r.id} draggable onDragStart={() => { dragRef.current = { type: "rec", id: r.id }; }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-sm cursor-grab active:cursor-grabbing ${inCart ? "border-blue-200 bg-blue-50/40 opacity-60" : "border-slate-100 hover:bg-slate-50"}`}>
                  {recImg(r.image)
                    ? <img src={recImg(r.image)!} alt="" className="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" />
                    : <div className="w-8 h-8 rounded bg-slate-100 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{r.code}</div>
                    <div className="text-xs text-slate-400 truncate">{r.name}</div>
                  </div>
                  <button onClick={() => addToCart(r)} disabled={inCart}
                    className="h-7 px-2 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40 shrink-0">
                    {inCart ? "✓" : "+ ใส่ตะกร้า"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ขวา: ตะกร้า + ชุดแท็ก */}
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[50vh]"
          onDrop={onDrop("cart")} onDragOver={allowDrop}>
          {/* ชุดแท็กที่จะใส่ (drop zone สำหรับแท็ก) */}
          <div className="px-3 py-2 border-b border-slate-100" onDrop={onDrop("tagset")} onDragOver={allowDrop}>
            <div className="text-xs text-slate-500 mb-1">ชุดแท็กที่จะใส่ (ลากแท็กจากด้านล่างมาวาง หรือกดเลือก)</div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px] rounded-lg border border-dashed border-slate-200 p-1.5">
              {tagSet.length === 0 && <span className="text-xs text-slate-300">— ยังไม่เลือกแท็ก —</span>}
              {tagSet.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                  {tagLabel(id)}
                  <button onClick={() => removeTag(id)} className="text-amber-400 hover:text-red-500">✕</button>
                </span>
              ))}
            </div>
          </div>
          {/* รายการในตะกร้า */}
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">ตะกร้าสินค้า</span>
            <span className="text-xs text-slate-400">({cart.length})</span>
            <div className="flex-1" />
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-slate-400 hover:text-red-500">ล้างตะกร้า</button>}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cart.length === 0 && <div className="text-xs text-slate-400 py-6 text-center">ลาก หรือกด “+ ใส่ตะกร้า” จากคลังด้านซ้าย</div>}
            {cart.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-100 text-sm">
                {recImg(r.image)
                  ? <img src={recImg(r.image)!} alt="" className="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" />
                  : <div className="w-8 h-8 rounded bg-slate-100 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 truncate">{r.code}</div>
                  <div className="text-xs text-slate-400 truncate">{r.name}</div>
                </div>
                <button onClick={() => removeFromCart(r.id)} className="text-slate-300 hover:text-red-500 shrink-0">✕</button>
              </div>
            ))}
          </div>
          {/* ปุ่มใส่แท็ก */}
          <div className="px-3 py-3 border-t border-slate-100">
            {result && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 mb-2">{result}</div>}
            <button onClick={apply} disabled={applying || cart.length === 0 || tagSet.length === 0}
              className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {applying ? "กำลังใส่แท็ก…" : `ใส่แท็กให้ทั้งหมด (${cart.length} ตัว × ${tagSet.length} แท็ก)`}
            </button>
          </div>
        </div>
      </div>

      {/* ล่าง: คลังแท็ก */}
      <div className="bg-white border-t border-slate-200 px-4 py-3">
        <div className="text-xs text-slate-500 mb-1.5">คลังแท็กทั้งหมด — กด หรือ ลากขึ้นไปใส่ในชุดแท็ก</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {allTags.map((t) => {
            const inSet = tagSet.includes(t.id);
            return (
              <button key={t.id} draggable onDragStart={() => { dragRef.current = { type: "tag", id: t.id }; }}
                onClick={() => addTag(t.id)} disabled={inSet}
                className={`px-2.5 py-1 rounded-full text-xs border cursor-grab active:cursor-grabbing ${inSet ? "bg-amber-100 text-amber-700 border-amber-200 opacity-50" : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50"}`}>
                {t.label}{inSet ? " ✓" : ""}
              </button>
            );
          })}
          <span className="mx-1 text-slate-200">|</span>
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createTag(); }}
            placeholder="แท็กใหม่…" className="h-7 w-32 px-2 text-xs border border-slate-200 rounded-md" />
          <button onClick={createTag} disabled={!newTag.trim()} className="h-7 px-2.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">+ สร้าง</button>
        </div>
      </div>
    </div>
  );
}
