"use client";

/**
 * Tags Manager — /master/tags-manager
 *
 * ใส่แท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — ใช้ได้ทั้ง Parent SKU และ SKU
 *   บนสุด = คลังแท็ก + ชุดแท็กที่จะใส่ + ปุ่ม Save
 *   ซ้าย  = คลังสินค้า → ใช้ "ตารางกลาง (DataTable)" โหมด Card view (ปรับการ์ดได้) + filter กลาง
 *           คลิกการ์ด = ใส่ตะกร้า, การ์ดโชว์แท็กปัจจุบัน
 *   ขวา   = ตะกร้า (card) ค้นหาได้
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DataTable, type BulkAction, type ServerFetchParams } from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";

type Rec = { id: string; code: string; name: string; image: string | null };
type PoolRow = Rec & { tagsText: string; inCart: string };

const ENTITIES = {
  "parent-skus": { label: "Parent SKU", api: "parent-skus", junction: "parent_skus_v2_product_family_m2m" },
  "skus":        { label: "SKU",        api: "skus",        junction: "skus_v2_product_family_m2m" },
} as const;
type EntityKey = keyof typeof ENTITIES;
const TAG_MODULE = "product_families";

export default function TagsManagerPage() {
  const [entity, setEntity] = useState<EntityKey>("parent-skus");
  const cfg = ENTITIES[entity];

  const [srvRefresh, setSrvRefresh] = useState(0);   // bump → DataTable ดึง server ใหม่

  const [cart, setCart] = useState<Rec[]>([]);
  const [cartSearch, setCartSearch] = useState("");
  const [tagSet, setTagSet] = useState<string[]>([]);

  const [allTags, setAllTags] = useState<{ id: string; label: string }[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);          // ลากแท็ก
  const selDragRef = useRef<Rec[]>([]);                  // ลากกลุ่มที่เลือก (โหมดเลือกเร็ว) → ตะกร้า
  const [poolMode, setPoolMode] = useState<"table" | "quick">("table");

  const tagLabel = useCallback((id: string) => allTags.find((t) => t.id === id)?.label ?? id.slice(0, 6), [allTags]);

  const loadTags = useCallback(() => {
    apiFetch(`/api/master-v2/${TAG_MODULE}?limit=500`).then((r) => r.json())
      .then((j) => setAllTags(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: String(r.name ?? r.id) }))))
      .catch(() => {});
  }, []);
  useEffect(() => { loadTags(); }, [loadTags]);

  const loadTagMap = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    apiFetch(`/api/admin/schema/m2m-links?junction=${cfg.junction}&src_ids=${ids.join(",")}`).then((r) => r.json())
      .then((j) => { if (j.map) setTagMap((m) => ({ ...m, ...(j.map as Record<string, string[]>) })); })
      .catch(() => {});
  }, [cfg.junction]);

  useEffect(() => { setCart([]); setTagMap({}); }, [entity]);
  // โหลดแท็กของรายการในตะกร้า (เผื่อมาจากคนละหน้า)
  useEffect(() => { loadTagMap(cart.map((c) => c.id)); }, [cart, loadTagMap]);

  // server-side fetch (โหลดทีละหน้า) + แนบแท็กปัจจุบันของแต่ละแถว
  const serverFetch = useCallback(async (params: ServerFetchParams): Promise<{ rows: PoolRow[]; total: number }> => {
    const offset = (params.page - 1) * params.pageSize;
    const qs = new URLSearchParams({ limit: String(params.pageSize), offset: String(offset) });
    if (params.search) qs.set("search", params.search);
    qs.set("sort_by", params.sortBy ?? "code"); qs.set("sort_dir", params.sortDir ?? "asc");
    if (params.filters && Object.keys(params.filters).length) qs.set("filters", JSON.stringify(params.filters));
    const j = await apiFetch(`/api/master-v2/${cfg.api}?${qs}`).then((r) => r.json());
    const recs: Rec[] = ((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), code: String(r.code ?? r.id), name: String(r.name_th ?? r.name ?? ""), image: (r.cover_image_r2_key as string) ?? null,
    }));
    let map: Record<string, string[]> = {};
    if (recs.length) {
      try { const gr = await apiFetch(`/api/admin/schema/m2m-links?junction=${cfg.junction}&src_ids=${recs.map((r) => r.id).join(",")}`).then((r) => r.json()); map = gr.map ?? {}; } catch { /* ignore */ }
      setTagMap((m) => ({ ...m, ...map }));
    }
    const rows: PoolRow[] = recs.map((r) => ({ ...r, tagsText: (map[r.id] ?? []).map(tagLabel).join(", "), inCart: "" }));
    return { rows, total: (j.total as number) ?? recs.length };
  }, [cfg.api, cfg.junction, tagLabel]);

  const addToCart = useCallback((r: Rec) => setCart((c) => (c.some((x) => x.id === r.id) ? c : [...c, r])), []);
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
    for (const rec of cart) for (const tag of tagSet) {
      try { const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction: cfg.junction, src_id: rec.id, tgt_id: tag }) }); if (res.ok) ok++; else fail++; } catch { fail++; }
    }
    setApplying(false);
    setResult(`เสร็จแล้ว — ใส่แท็กสำเร็จ ${ok} รายการ${fail ? `, ไม่สำเร็จ ${fail}` : ""}`);
    loadTagMap(cart.map((c) => c.id));
    setSrvRefresh((n) => n + 1);   // refresh แท็กบนการ์ดในคลัง
  };

  // เลือกหลายแถว (โหมดตาราง) → ใส่ตะกร้าทีเดียว
  const bulkActions: BulkAction<PoolRow>[] = useMemo(() => [
    { label: "➕ ใส่ตะกร้าที่เลือก", onClick: (rows) => rows.forEach((r) => addToCart(r)) },
  ], [addToCart]);

  const columns: ColumnDef<PoolRow>[] = useMemo(() => [
    { accessorKey: "image", header: "รูป", enableSorting: false, meta: { type: "image" } },
    { accessorKey: "code",  header: "รหัส", meta: { filterable: true, filterType: "text", group: "ข้อมูลหลัก" } },
    { accessorKey: "name",  header: "ชื่อ",  meta: { filterable: true, filterType: "text", group: "ข้อมูลหลัก" } },
    { accessorKey: "tagsText", header: "แท็กปัจจุบัน", meta: { filterable: true, filterType: "text", filterLabel: "แท็ก", group: "แท็ก" } },
    { accessorKey: "inCart", header: "สถานะ", meta: { filterable: true, filterType: "select", group: "แท็ก" } },
  ], []);

  const defaultCardCfg = useMemo(() => ({
    primary: "code", subtitle: "name", image: "image", badges: ["tagsText", "inCart"], metrics: [], lines: [], columns: "2" as const,
  }), []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🏷️ Tags Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">ใส่แท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — คลิกการ์ดเพื่อใส่ตะกร้า</p>
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

      {/* บนสุด: คลังแท็ก + ชุดแท็ก + Save */}
      <div className="bg-white border-b border-slate-200 px-4 py-3"
        onDrop={(e) => { e.preventDefault(); if (dragRef.current) { addTag(dragRef.current); dragRef.current = null; } }}
        onDragOver={(e) => e.preventDefault()}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="text-xs text-slate-500 mb-1">คลังแท็ก — กดหรือลากเพื่อเพิ่มเข้าชุดแท็ก</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {allTags.map((t) => {
                const inSet = tagSet.includes(t.id);
                return (
                  <button key={t.id} draggable onDragStart={() => { dragRef.current = t.id; }} onClick={() => addTag(t.id)} disabled={inSet}
                    className={`px-2.5 py-1 rounded-full text-xs border cursor-grab active:cursor-grabbing ${inSet ? "bg-amber-100 text-amber-700 border-amber-200 opacity-50" : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50"}`}>
                    {t.label}{inSet ? " ✓" : ""}
                  </button>
                );
              })}
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createTag(); }}
                placeholder="แท็กใหม่…" className="h-7 w-28 px-2 text-xs border border-slate-200 rounded-md" />
              <button onClick={createTag} disabled={!newTag.trim()} className="h-7 px-2 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">+ สร้าง</button>
            </div>
          </div>
          <div className="w-px self-stretch bg-slate-100 hidden md:block" />
          <div className="min-w-[260px]">
            <div className="text-xs text-slate-500 mb-1">ชุดแท็กที่จะใส่ (ลากมาวางตรงนี้ได้)</div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px] rounded-lg border border-dashed border-amber-200 p-1.5 mb-2">
              {tagSet.length === 0 && <span className="text-xs text-slate-300">— ยังไม่เลือกแท็ก —</span>}
              {tagSet.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                  {tagLabel(id)}<button onClick={() => removeTag(id)} className="text-amber-400 hover:text-red-500">✕</button>
                </span>
              ))}
            </div>
            <button onClick={apply} disabled={applying || cart.length === 0 || tagSet.length === 0}
              className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {applying ? "กำลังใส่แท็ก…" : `💾 ใส่แท็กให้ทั้งหมด (${cart.length} ตัว × ${tagSet.length} แท็ก)`}
            </button>
            {result && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 mt-2">{result}</div>}
          </div>
        </div>
      </div>

      {/* 2 กล่อง */}
      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ซ้าย: เลือกโหมด — ตารางกลาง หรือ เลือกเร็ว (ลากคลุม) */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-700 mr-1">คลัง {cfg.label}</span>
            <div className="flex-1" />
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button onClick={() => setPoolMode("table")} className={`px-2.5 h-7 ${poolMode === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>การ์ดกลาง</button>
              <button onClick={() => setPoolMode("quick")} className={`px-2.5 h-7 ${poolMode === "quick" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>⚡ เลือกเร็ว (ลากคลุม)</button>
            </div>
          </div>
          {poolMode === "table" ? (
            <DataTable<PoolRow>
              data={[]}
              columns={columns}
              serverFetch={serverFetch}
              serverRefreshKey={srvRefresh}
              enableCards
              defaultViewMode="cards"
              cardConfig={defaultCardCfg}
              tableId={`tags-mgr-pool-${entity}`}
              searchPlaceholder="ค้นหา รหัส / ชื่อ…"
              pageSize={24}
              selectable
              bulkActions={bulkActions}
              onRowClick={(row) => addToCart(row)}
              emptyMessage="ไม่พบรายการ"
            />
          ) : (
            <QuickSelectGrid
              api={cfg.api} junction={cfg.junction} tagLabel={tagLabel}
              onAddMany={(recs) => recs.forEach((r) => addToCart(r))}
              selDragRef={selDragRef}
            />
          )}
        </div>

        {/* ขวา: ตะกร้า */}
        <div className="bg-blue-50/30 border border-slate-200 rounded-xl flex flex-col min-h-[55vh]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const recs = selDragRef.current; selDragRef.current = []; recs.forEach((r) => addToCart(r)); }}>
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2 bg-white rounded-t-xl">
            <span className="text-sm font-semibold text-slate-700">ตะกร้าสินค้า</span>
            <span className="text-xs text-slate-400">({cart.length})</span>
            <div className="flex-1" />
            {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-slate-400 hover:text-red-500">ล้างตะกร้า</button>}
          </div>
          <div className="px-3 py-2 border-b border-slate-100 bg-white">
            <input value={cartSearch} onChange={(e) => setCartSearch(e.target.value)} placeholder="ค้นหาในตะกร้า…"
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {cart.length === 0 && <div className="text-xs text-slate-400 py-6 text-center col-span-full">คลิกการ์ดจากคลังด้านซ้าย เพื่อใส่ตะกร้า</div>}
            {cart.filter((r) => { const q = cartSearch.trim().toLowerCase(); return !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q); }).map((r) => {
              const tags = tagMap[r.id] ?? [];
              return (
                <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    {r.image
                      ? <img src={`/api/r2-image?key=${encodeURIComponent(r.image)}`} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                      : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">{r.code}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{r.name}</div>
                    </div>
                    <button onClick={() => removeFromCart(r.id)} className="text-slate-300 hover:text-red-500 shrink-0">✕</button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tid) => <span key={tid} className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100">{tagLabel(tid)}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- โหมดเลือกเร็ว: ลากคลุมเลือกหลายอัน (เลือก = สีเทา) + ลาก/กดใส่ตะกร้า ----
function QuickSelectGrid({ api, junction, tagLabel, onAddMany, selDragRef }: {
  api: string; junction: string; tagLabel: (id: string) => string;
  onAddMany: (recs: Rec[]) => void; selDragRef: React.MutableRefObject<Rec[]>;
}) {
  const PAGE = 60;
  const [rows, setRows] = useState<Rec[]>([]);
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const baseSelRef = useRef<Set<string>>(new Set());
  const movedRef = useRef(false);   // ลากเกิน threshold แล้ว (= marquee ไม่ใช่ click)

  // โหลดข้อมูล (server, ทีละหน้า)
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), sort_by: "code", sort_dir: "asc" });
      if (search.trim()) qs.set("search", search.trim());
      apiFetch(`/api/master-v2/${api}?${qs}`).then((r) => r.json())
        .then(async (j) => {
          const recs: Rec[] = ((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id), code: String(r.code ?? r.id), name: String(r.name_th ?? r.name ?? ""), image: (r.cover_image_r2_key as string) ?? null,
          }));
          setRows(recs); setTotal((j.total as number) ?? recs.length);
          if (recs.length) {
            try { const gr = await apiFetch(`/api/admin/schema/m2m-links?junction=${junction}&src_ids=${recs.map((r) => r.id).join(",")}`).then((r) => r.json()); setTagMap(gr.map ?? {}); } catch { /* ignore */ }
          }
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [api, junction, page, search]);
  useEffect(() => { setPage(0); }, [api, search]);

  const recById = useMemo(() => { const m: Record<string, Rec> = {}; rows.forEach((r) => { m[r.id] = r; }); return m; }, [rows]);
  const selectedRecs = useCallback(() => Array.from(selected).map((id) => recById[id]).filter(Boolean), [selected, recById]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // เริ่มลากบนการ์ดที่ "เลือกแล้ว" → ปล่อยให้ลากไปตะกร้า (native drag) ไม่เริ่ม marquee
    const card = (e.target as HTMLElement).closest("[data-rec-id]");
    if (card && selected.has(card.getAttribute("data-rec-id")!)) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    baseSelRef.current = e.shiftKey ? new Set(selected) : new Set();
    movedRef.current = false;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const s = startRef.current; if (!s) return;
    if (!movedRef.current && Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) < 5) return;  // ยังไม่ถือว่าลาก
    movedRef.current = true;
    const left = Math.min(s.x, e.clientX), top = Math.min(s.y, e.clientY), right = Math.max(s.x, e.clientX), bottom = Math.max(s.y, e.clientY);
    setMarquee({ x: left, y: top, w: right - left, h: bottom - top });
    const sel = new Set(baseSelRef.current);
    gridRef.current?.querySelectorAll("[data-rec-id]").forEach((el) => {
      const c = el.getBoundingClientRect();
      if (!(c.right < left || c.left > right || c.bottom < top || c.top > bottom)) sel.add(el.getAttribute("data-rec-id")!);
    });
    setSelected(sel);
  };
  const endMarquee = () => { startRef.current = null; setMarquee(null); setTimeout(() => { movedRef.current = false; }, 0); };

  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="flex flex-col" style={{ minHeight: "55vh" }}>
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ…"
          className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-8 px-2 text-xs border border-slate-200 rounded disabled:opacity-40">‹</button>
        <span className="text-xs text-slate-500">{page + 1}/{pages}</span>
        <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="h-8 px-2 text-xs border border-slate-200 rounded disabled:opacity-40">›</button>
      </div>
      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
        <span className="text-xs text-slate-500">ลากคลุมเพื่อเลือก (เลือก = สีเทา) • เลือกแล้ว <b>{selected.size}</b></span>
        <div className="flex-1" />
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:text-red-500">ล้างที่เลือก</button>}
        <button disabled={selected.size === 0} onClick={() => { onAddMany(selectedRecs()); setSelected(new Set()); }}
          className="h-7 px-3 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">➕ ใส่ตะกร้าที่เลือก ({selected.size})</button>
      </div>
      <div ref={gridRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endMarquee} onMouseLeave={endMarquee}
        className="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start select-none relative">
        {loading && <div className="col-span-full text-xs text-slate-400 py-4 text-center">กำลังโหลด…</div>}
        {!loading && rows.length === 0 && <div className="col-span-full text-xs text-slate-400 py-4 text-center">ไม่พบรายการ</div>}
        {rows.map((r) => {
          const on = selected.has(r.id);
          const tags = tagMap[r.id] ?? [];
          return (
            <div key={r.id} data-rec-id={r.id}
              draggable={on}
              onDragStart={() => { selDragRef.current = selectedRecs(); }}
              onClick={() => { if (movedRef.current) return; toggleOne(r.id); }}
              className={`rounded-lg border p-2 flex flex-col gap-1.5 cursor-pointer transition-colors ${on ? "bg-slate-300 border-slate-400" : "bg-white border-slate-200 hover:border-blue-300"}`}>
              <div className="flex gap-2">
                {r.image
                  ? <img src={`/api/r2-image?key=${encodeURIComponent(r.image)}`} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0 pointer-events-none" />
                  : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                <div className="flex-1 min-w-0 pointer-events-none">
                  <div className="font-semibold text-sm text-slate-800 truncate">{r.code}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-1">{r.name}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 pointer-events-none">
                {tags.map((tid) => <span key={tid} className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100">{tagLabel(tid)}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      {marquee && <div className="fixed z-50 bg-blue-400/20 border border-blue-400 pointer-events-none" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
    </div>
  );
}
