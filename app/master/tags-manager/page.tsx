"use client";

/**
 * Tags Manager — /master/tags-manager
 *
 * ใส่แท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — ใช้ได้ทั้ง Parent SKU และ SKU
 * เลย์เอาต์ (v2 ตาม feedback):
 *   บนสุด = คลังแท็กทั้งหมด + ชุดแท็กที่จะใส่ + ปุ่ม Save (ใส่แท็กให้ทั้งหมด)
 *   ซ้าย  = คลังสินค้า (Card view) ค้นหา/กรอง/เรียง — การ์ดโชว์แท็กปัจจุบัน — กด/ลากไปตะกร้า
 *   ขวา   = ตะกร้า (Card view) ค้นหาในตะกร้าได้
 * ใช้ของกลาง: API master-v2 (list) + m2m-links (ผูก/ดึงแท็ก bulk)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { FamilyNavTabs } from "@/components/family-nav-tabs";
import { IconPicker } from "@/components/icon-picker";
import { SearchableSelect } from "@/components/searchable-select";

type Rec = { id: string; code: string; name: string; image: string | null };
type Tag = { id: string; label: string; group_id: string | null };
type Grp = { id: string; name: string; parent_group_id: string | null; sort_order: number; icon: string | null; single_select: boolean };

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

  const PAGE_SIZE = 60;
  const [pool, setPool] = useState<Rec[]>([]);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterSel, setFilterSel] = useState<TagFilterValue>({ tagIds: [], none: false });
  const [groups, setGroups] = useState<Grp[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [cart, setCart] = useState<Rec[]>([]);
  const [cartSearch, setCartSearch] = useState("");
  const [cartSel, setCartSel] = useState<Set<string>>(new Set());
  const [tagSet, setTagSet] = useState<string[]>([]);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});   // recId -> tagId[] (แท็กปัจจุบัน)

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [includeChildren, setIncludeChildren] = useState(false);   // ใส่แท็กให้ SKU ลูกด้วย (โหมด Parent)
  const dragRef = useRef<{ type: "rec" | "tag"; id: string } | null>(null);

  const tagLabel = useCallback((id: string) => allTags.find((t) => t.id === id)?.label ?? id.slice(0, 6), [allTags]);

  const loadTags = useCallback(() => {
    apiFetch(`/api/master-v2/${TAG_MODULE}?limit=500`).then((r) => r.json())
      .then((j) => setAllTags(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: String(r.name ?? r.id), group_id: r.group_id ? String(r.group_id) : null }))))
      .catch(() => {});
  }, []);
  useEffect(() => { loadTags(); }, [loadTags]);
  // โหลดกลุ่มแท็ก (จัด palette + filter ตามกลุ่ม)
  const [groupMgr, setGroupMgr] = useState(false);
  const loadGroups = useCallback(() => {
    apiFetch(`/api/master-v2/product_family_groups?limit=500`).then((r) => r.json())
      .then((j) => setGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
        id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
        sort_order: Number(g.sort_order ?? 100), icon: g.icon ? String(g.icon) : null,
        single_select: !!g.single_select,
      } as Grp)))).catch(() => {});
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ดึงแท็กปัจจุบันของหลายรายการทีเดียว (bulk) → โชว์บนการ์ด
  const loadTagMap = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    apiFetch(`/api/admin/schema/m2m-links?junction=${cfg.junction}&src_ids=${ids.join(",")}`).then((r) => r.json())
      .then((j) => { if (j.map) setTagMap((m) => ({ ...m, ...(j.map as Record<string, string[]>) })); })
      .catch(() => {});
  }, [cfg.junction]);

  const loadPool = useCallback(() => {
    setLoadingPool(true);
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort_by: "code", sort_dir: sortDir });
    if (search.trim()) qs.set("search", search.trim());
    apiFetch(`/api/master-v2/${cfg.api}?${qs}`).then((r) => r.json())
      .then((j) => {
        const recs = ((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id), code: String(r.code ?? r.id), name: String(r.name_th ?? r.name ?? ""), image: (r.cover_image_r2_key as string) ?? null,
        }));
        setPool(recs); setTotal((j.total as number) ?? recs.length);
        loadTagMap(recs.map((r) => r.id));
      })
      .catch(() => setPool([]))
      .finally(() => setLoadingPool(false));
  }, [cfg.api, search, sortDir, page, loadTagMap]);
  useEffect(() => { const t = setTimeout(loadPool, 300); return () => clearTimeout(t); }, [loadPool]);
  useEffect(() => { setPage(0); }, [entity, search, sortDir]);   // เปลี่ยนเงื่อนไข → กลับหน้าแรก
  useEffect(() => { setCart([]); setTagMap({}); setCartSel(new Set()); }, [entity]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cartIds = useMemo(() => new Set(cart.map((c) => c.id)), [cart]);

  const addToCart = (r: Rec) => setCart((c) => (c.some((x) => x.id === r.id) ? c : [...c, r]));
  const addManyToCart = (recs: Rec[]) => setCart((c) => { const have = new Set(c.map((x) => x.id)); const add = recs.filter((r) => !have.has(r.id)); return add.length ? [...c, ...add] : c; });
  const [selectingAll, setSelectingAll] = useState(false);
  // เลือกทั้งหมดที่ตรง "คำค้นหา" (ทุกหน้า) → ใส่ตะกร้า
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const qs = new URLSearchParams({ limit: "5000", sort_by: "code", sort_dir: sortDir });
      if (search.trim()) qs.set("search", search.trim());
      const j = await apiFetch(`/api/master-v2/${cfg.api}?${qs}`).then((r) => r.json());
      const recs: Rec[] = ((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id), code: String(r.code ?? r.id), name: String(r.name_th ?? r.name ?? ""), image: (r.cover_image_r2_key as string) ?? null,
      }));
      addManyToCart(recs);
      loadTagMap(recs.map((r) => r.id));
    } catch { alert("เลือกทั้งหมดไม่สำเร็จ"); } finally { setSelectingAll(false); }
  };
  const removeFromCart = (id: string) => { setCart((c) => c.filter((x) => x.id !== id)); setCartSel((p) => { const n = new Set(p); n.delete(id); return n; }); };
  const toggleCartSel = (id: string) => setCartSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const removeSelectedFromCart = () => { setCart((c) => c.filter((x) => !cartSel.has(x.id))); setCartSel(new Set()); };
  const addTag = (id: string) => setTagSet((s) => {
    if (s.includes(id)) return s;
    const tag = allTags.find((t) => t.id === id);
    const grp = tag?.group_id ? groups.find((g) => g.id === tag.group_id) : null;
    // กลุ่มแบบ "เลือก 1 รายการ" → เอาแท็กอื่นในกลุ่มเดียวกันออกจากชุดก่อน
    if (grp?.single_select) {
      const sameGroup = new Set(allTags.filter((t) => t.group_id === grp.id).map((t) => t.id));
      return [...s.filter((tid) => !sameGroup.has(tid)), id];
    }
    return [...s, id];
  });
  const removeTag = (id: string) => setTagSet((s) => s.filter((x) => x !== id));

  const createTag = async () => {
    const name = newTag.trim(); if (!name) return;
    const res = await apiFetch(`/api/master-v2/${TAG_MODULE}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error || !j.data?.id) { alert("สร้างแท็กไม่สำเร็จ: " + (j.error ?? res.status)); return; }
    const id = String(j.data.id);
    setAllTags((t) => [...t, { id, label: name, group_id: null }]); setNewTag(""); addTag(id);
  };

  // ดึง SKU ลูกของ Parent ที่เลือก (skus_v2.parent_sku_id IN parentIds)
  const fetchChildSkuIds = async (parentIds: string[]): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < parentIds.length; i += 50) {
      const chunk = parentIds.slice(i, i + 50);
      const qs = new URLSearchParams({ limit: "2000" });
      qs.set("filters", JSON.stringify({ parent_sku_id: { type: "select", selected: chunk } }));
      try {
        const j = await apiFetch(`/api/master-v2/skus?${qs}`).then((r) => r.json());
        for (const r of (j.data ?? j.rows ?? []) as Record<string, unknown>[]) ids.push(String(r.id));
      } catch { /* ignore chunk */ }
    }
    return ids;
  };

  const apply = async () => {
    if (cart.length === 0 || tagSet.length === 0) return;
    setApplying(true); setResult(null);
    // โหมด Parent + ติ๊ก "ใส่ให้ลูกด้วย" → หา SKU ลูกก่อน
    let childIds: string[] = [];
    if (includeChildren && entity === "parent-skus") {
      setResult("กำลังหา SKU ลูก…");
      childIds = await fetchChildSkuIds(cart.map((c) => c.id));
      setResult(null);
    }
    const totalLinks = (cart.length + childIds.length) * tagSet.length;
    if (!confirm(`ใส่ ${tagSet.length} แท็ก ให้ Parent ${cart.length} ตัว${childIds.length ? ` + SKU ลูก ${childIds.length} ตัว` : ""}\n(รวม ${totalLinks.toLocaleString()} รายการเชื่อมโยง)?`)) { setApplying(false); return; }

    const childJunction = ENTITIES["skus"].junction;
    // สร้างคู่ลิงก์ทั้งหมด แล้วยิงเป็น batch (chunk 500/ครั้ง) + แสดง progress
    const tasks: { junction: string; links: { src_id: string; tgt_id: string }[] }[] = [
      { junction: cfg.junction, links: cart.flatMap((r) => tagSet.map((t) => ({ src_id: r.id, tgt_id: t }))) },
      ...(childIds.length ? [{ junction: childJunction, links: childIds.flatMap((c) => tagSet.map((t) => ({ src_id: c, tgt_id: t }))) }] : []),
    ];
    const total = tasks.reduce((s, t) => s + t.links.length, 0);
    let done = 0, fail = 0;
    const BATCH = 500;
    for (const task of tasks) {
      for (let i = 0; i < task.links.length; i += BATCH) {
        const chunk = task.links.slice(i, i + BATCH);
        try {
          const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction: task.junction, links: chunk }) });
          if (!res.ok) fail += chunk.length;
        } catch { fail += chunk.length; }
        done += chunk.length;
        setResult(`กำลังใส่แท็ก… ${done.toLocaleString()}/${total.toLocaleString()}`);
        await new Promise((r) => setTimeout(r, 0));   // ให้ UI อัปเดต progress
      }
    }
    setApplying(false);
    setResult(`✅ เสร็จแล้ว — ใส่แท็ก ${(total - fail).toLocaleString()}/${total.toLocaleString()} รายการ${fail ? ` (พลาด ${fail})` : ""}${childIds.length ? ` • รวม SKU ลูก ${childIds.length} ตัว` : ""}`);
    loadTagMap(cart.map((c) => c.id));   // refresh แท็กบนการ์ด
  };

  // drag
  const onDrop = (zone: "cart" | "tagset") => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragRef.current; dragRef.current = null; if (!d) return;
    if (zone === "cart" && d.type === "rec") { const r = pool.find((x) => x.id === d.id); if (r) addToCart(r); }
    if (zone === "tagset" && d.type === "tag") addTag(d.id);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  // ลากแท็กไปวางที่กลุ่ม → ย้ายแท็กเข้ากลุ่มนั้น (groupId=null = เอาออกจากกลุ่ม)
  const moveTagToGroup = async (groupId: string | null) => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || d.type !== "tag") return;
    setResult(null);
    try {
      const res = await apiFetch(`/api/master-v2/${TAG_MODULE}/${d.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setResult("❌ ย้ายกลุ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      loadTags();
    } catch (e) { setResult("❌ " + (e instanceof Error ? e.message : "network")); }
  };
  const onGroupDrop = (groupId: string | null) => (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); moveTagToGroup(groupId); };
  const onGroupOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  // pool หลังกรอง (client-side) — OR: มีอย่างน้อย 1 แท็กที่ติ๊ก / หรือ "ยังไม่มีแท็ก"
  const shownPool = useMemo(() => pool.filter((r) => {
    const { tagIds, none } = filterSel;
    if (tagIds.length === 0 && !none) return true;
    const tags = tagMap[r.id] ?? [];
    return (none && tags.length === 0) || (tagIds.length > 0 && tags.some((t) => tagIds.includes(t)));
  }), [pool, filterSel, tagMap]);

  // โหลดแท็กของสินค้าในตะกร้าที่ยังไม่มีใน tagMap (ไว้รวม + ลบแท็ก)
  useEffect(() => {
    const missing = cart.map((c) => c.id).filter((id) => !(id in tagMap));
    if (missing.length) loadTagMap(missing);
  }, [cart, tagMap, loadTagMap]);

  // รวมแท็กทั้งหมดที่อยู่ในตะกร้า (+ จำนวนสินค้าที่มีแท็กนั้น)
  const cartTagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) for (const t of (tagMap[c.id] ?? [])) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cart, tagMap]);

  // ลบแท็ก 1 อัน ออกจากสินค้าทุกตัวในตะกร้าที่มีแท็กนั้น (bulk)
  const [removingTag, setRemovingTag] = useState(false);
  const removeTagFromCart = async (tagId: string) => {
    const targets = cart.filter((c) => (tagMap[c.id] ?? []).includes(tagId));
    if (targets.length === 0) return;
    if (!confirm(`ลบแท็ก "${tagLabel(tagId)}" ออกจากสินค้า ${targets.length} ตัวในตะกร้า?`)) return;
    setRemovingTag(true); setResult(null);
    try {
      const links = targets.map((c) => ({ src_id: c.id, tgt_id: tagId }));
      const res = await apiFetch("/api/admin/schema/m2m-links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction: cfg.junction, links }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setResult("❌ ลบแท็กไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setTagMap((m) => { const n = { ...m }; for (const c of targets) n[c.id] = (n[c.id] ?? []).filter((t) => t !== tagId); return n; });
      setResult(`✅ ลบแท็ก "${tagLabel(tagId)}" ออกจาก ${targets.length} ตัวแล้ว`);
    } catch (e) { setResult("❌ " + (e instanceof Error ? e.message : "network")); }
    finally { setRemovingTag(false); }
  };

  // จัด palette แท็กตามกลุ่ม (กลุ่ม → กลุ่มย่อย → แท็ก + ไม่มีกลุ่ม)
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byOrder = (a: Grp, b: Grp) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th");
  const topGroups = useMemo(() => groups.filter((g) => !g.parent_group_id).sort(byOrder), [groups]);
  const subOfGrp = (id: string) => groups.filter((g) => g.parent_group_id === id).sort(byOrder);
  const tagsOfGrp = (gid: string) => allTags.filter((t) => t.group_id === gid);
  const ungroupedTags = useMemo(() => allTags.filter((t) => !t.group_id || !groupById.has(t.group_id)), [allTags, groupById]);
  const tagChip = (t: Tag) => {
    const inSet = tagSet.includes(t.id);
    return (
      <button key={t.id} draggable onDragStart={() => { dragRef.current = { type: "tag", id: t.id }; }}
        onClick={() => addTag(t.id)} disabled={inSet}
        className={`px-2.5 py-1 rounded-full text-xs border cursor-grab active:cursor-grabbing ${inSet ? "bg-amber-100 text-amber-700 border-amber-200 opacity-50" : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50"}`}>
        {t.label}{inSet ? " ✓" : ""}
      </button>
    );
  };

  const shownCart = useMemo(() => {
    const q = cartSearch.trim().toLowerCase();
    return q ? cart.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : cart;
  }, [cart, cartSearch]);

  // ---- การ์ดสินค้า (ใช้ทั้ง 2 ฝั่ง) ----
  const Card = ({ r, action, sel }: { r: Rec; action: React.ReactNode; sel?: { checked: boolean; onToggle: () => void } }) => {
    const tags = tagMap[r.id] ?? [];
    return (
      <div draggable onDragStart={() => { dragRef.current = { type: "rec", id: r.id }; }}
        className={`bg-white border rounded-lg p-2 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing hover:border-blue-300 ${sel?.checked ? "border-blue-400 ring-1 ring-blue-300" : "border-slate-200"}`}>
        <div className="flex gap-2">
          {sel && (
            <input type="checkbox" checked={sel.checked} onChange={sel.onToggle}
              onClick={(e) => e.stopPropagation()} className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" />
          )}
          {recImg(r.image)
            ? <img src={recImg(r.image)!} alt="" className="w-12 h-12 rounded object-cover bg-slate-100 shrink-0" />
            : <div className="w-12 h-12 rounded bg-slate-100 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-800 truncate">{r.code}</div>
            <div className="text-[11px] text-slate-400 line-clamp-2">{r.name}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 min-h-[18px]">
          {tags.length === 0 && <span className="text-[10px] text-slate-300">— ยังไม่มีแท็ก —</span>}
          {tags.map((tid) => (
            <span key={tid} className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100">{tagLabel(tid)}</span>
          ))}
        </div>
        {action}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <FamilyNavTabs active="tags" />
      {groupMgr && <GroupManager groups={groups} onClose={() => setGroupMgr(false)} onChanged={loadGroups} />}
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🏷️ Tags Manager</h1>
          <p className="text-sm text-slate-500 mt-0.5">ใส่แท็ก (Product Family) ให้สินค้าหลายตัวพร้อมกัน — กดหรือลากเพื่อเลือก</p>
        </div>
        <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">จัดแท็กให้:</span>
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

      {/* บนสุด: คลังแท็ก + ชุดแท็กที่จะใส่ + ปุ่ม Save */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2" onDrop={onDrop("tagset")} onDragOver={allowDrop}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">คลังแท็ก — กดหรือลากเพื่อเพิ่มเข้าชุดแท็ก</span>
              <button onClick={() => setGroupMgr(true)} className="text-xs px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">⚙️ จัดการกลุ่ม</button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {/* โชว์ทุกกลุ่ม (รวมกลุ่มว่าง) · ลากแท็กมาวางที่กลุ่ม = ย้ายเข้ากลุ่ม */}
              {topGroups.map((g) => {
                const direct = tagsOfGrp(g.id);
                const subs = subOfGrp(g.id).map((s) => ({ s, t: tagsOfGrp(s.id) }));
                const empty = direct.length === 0 && subs.every((x) => x.t.length === 0);
                return (
                  <div key={g.id} onDrop={onGroupDrop(g.id)} onDragOver={onGroupOver}
                    className="rounded-md border border-transparent hover:border-blue-300 hover:bg-blue-50/30 p-1 transition-colors">
                    <div className="text-[11px] font-medium text-slate-500">{g.icon ? g.icon + " " : ""}{g.name}{g.single_select ? " · เลือก1" : ""}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {empty && <span className="text-[10px] text-slate-300">— ลากแท็กมาวางที่นี่ —</span>}
                      {direct.map(tagChip)}
                      {subs.map(({ s, t }) => (
                        <span key={s.id} onDrop={onGroupDrop(s.id)} onDragOver={onGroupOver}
                          className="inline-flex items-center gap-1 flex-wrap rounded border border-transparent hover:border-blue-300 px-1">
                          <span className="text-[10px] text-slate-400">↳{s.name}:</span>
                          {t.length === 0 ? <span className="text-[10px] text-slate-300">วางที่นี่</span> : t.map(tagChip)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* ไม่มีกลุ่ม — ลากมาที่นี่เพื่อเอาออกจากกลุ่ม */}
              <div onDrop={onGroupDrop(null)} onDragOver={onGroupOver}
                className="rounded-md border border-transparent hover:border-blue-300 hover:bg-blue-50/30 p-1 transition-colors">
                <div className="text-[11px] font-medium text-slate-400">ไม่มีกลุ่ม</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {ungroupedTags.length === 0 && <span className="text-[10px] text-slate-300">— ลากแท็กมาที่นี่เพื่อเอาออกจากกลุ่ม —</span>}
                  {ungroupedTags.map(tagChip)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createTag(); }}
                  placeholder="แท็กใหม่…" className="h-7 w-28 px-2 text-xs border border-slate-200 rounded-md" />
                <button onClick={createTag} disabled={!newTag.trim()} className="h-7 px-2 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">+ สร้าง</button>
              </div>
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
            {entity === "parent-skus" && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 mb-2 cursor-pointer">
                <input type="checkbox" checked={includeChildren} onChange={(e) => setIncludeChildren(e.target.checked)} className="rounded border-slate-300" />
                ใส่แท็กให้ <b>SKU ลูก</b> ของ Parent เหล่านี้ด้วย
              </label>
            )}
            <button onClick={apply} disabled={applying || cart.length === 0 || tagSet.length === 0}
              className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {applying ? "กำลังใส่แท็ก…" : `💾 ใส่แท็กให้ทั้งหมด (${cart.length} ตัว × ${tagSet.length} แท็ก)${includeChildren && entity === "parent-skus" ? " + ลูก" : ""}`}
            </button>
            {result && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1 mt-2">{result}</div>}
          </div>
        </div>
      </div>

      {/* 2 กล่อง: คลังสินค้า (ซ้าย) + ตะกร้า (ขวา) */}
      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ซ้าย */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl flex flex-col min-h-[55vh]">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap bg-white rounded-t-xl">
            <span className="text-sm font-semibold text-slate-700">คลัง{cfg.label}</span>
            <span className="text-xs text-slate-400">({total.toLocaleString()})</span>
            <div className="flex-1" />
            <TagGroupFilter value={filterSel} onChange={setFilterSel} />
            <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="text-xs px-2 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white">
              รหัส {sortDir === "asc" ? "↑" : "↓"}
            </button>
            <div className="inline-flex items-center gap-1">
              <button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-7 px-2 text-xs border border-slate-200 rounded bg-white disabled:opacity-40">‹</button>
              <span className="text-xs text-slate-500">{page + 1}/{pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="h-7 px-2 text-xs border border-slate-200 rounded bg-white disabled:opacity-40">›</button>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-slate-100 bg-white space-y-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ…"
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">เลือก:</span>
              <button onClick={() => addManyToCart(shownPool)} className="h-7 px-2.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50">+ ทั้งหน้านี้ ({shownPool.length})</button>
              <button onClick={selectAllMatching} disabled={selectingAll} className="h-7 px-2.5 text-xs rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50">
                {selectingAll ? "กำลังเลือก…" : `✓ เลือกทั้งหมดที่ตรง (${total.toLocaleString()})`}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {loadingPool && <div className="text-xs text-slate-400 py-4 text-center col-span-full">กำลังโหลด…</div>}
            {!loadingPool && shownPool.length === 0 && <div className="text-xs text-slate-400 py-4 text-center col-span-full">ไม่พบรายการ</div>}
            {shownPool.map((r) => {
              const inCart = cartIds.has(r.id);
              return <Card key={r.id} r={r} action={
                <button onClick={() => addToCart(r)} disabled={inCart}
                  className="h-7 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40">
                  {inCart ? "✓ อยู่ในตะกร้า" : "+ ใส่ตะกร้า"}
                </button>} />;
            })}
          </div>
        </div>

        {/* ขวา: ตะกร้า */}
        <div className="bg-blue-50/30 border border-slate-200 rounded-xl flex flex-col min-h-[55vh]" onDrop={onDrop("cart")} onDragOver={allowDrop}>
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
          {cart.length > 0 && (
            <div className="px-3 py-1.5 border-b border-slate-100 bg-white flex items-center gap-2 text-xs flex-wrap">
              {(() => {
                const allSel = shownCart.length > 0 && shownCart.every((r) => cartSel.has(r.id));
                return (
                  <button onClick={() => setCartSel((p) => {
                    const n = new Set(p);
                    if (allSel) shownCart.forEach((r) => n.delete(r.id)); else shownCart.forEach((r) => n.add(r.id));
                    return n;
                  })} className="px-2 h-7 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                    {allSel ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${shownCart.length})`}
                  </button>
                );
              })()}
              {cartSel.size > 0 && (
                <>
                  <span className="text-slate-500">เลือก {cartSel.size}</span>
                  <button onClick={removeSelectedFromCart}
                    className="px-2.5 h-7 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-medium">✕ เอาออกที่เลือก ({cartSel.size})</button>
                  <button onClick={() => setCartSel(new Set())} className="text-slate-400 hover:text-slate-600 underline">ล้างเลือก</button>
                </>
              )}
            </div>
          )}
          {cartTagCounts.length > 0 && (
            <div className="px-3 py-2 border-b border-slate-100 bg-white">
              <div className="text-[11px] text-slate-500 mb-1">🏷️ แท็กในตะกร้า — กด ✕ เพื่อลบออกจากทุกตัวในตะกร้า</div>
              <div className="flex flex-wrap gap-1.5">
                {cartTagCounts.map(([tid, c]) => (
                  <span key={tid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {tagLabel(tid)} <span className="text-emerald-500">×{c}</span>
                    <button onClick={() => removeTagFromCart(tid)} disabled={removingTag} title="ลบแท็กนี้ออกจากทุกตัวในตะกร้า" className="text-emerald-400 hover:text-red-500 disabled:opacity-40">✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
            {cart.length === 0 && <div className="text-xs text-slate-400 py-6 text-center col-span-full">ลาก หรือกด “+ ใส่ตะกร้า” จากคลังด้านซ้าย</div>}
            {shownCart.map((r) => (
              <Card key={r.id} r={r} sel={{ checked: cartSel.has(r.id), onToggle: () => toggleCartSel(r.id) }} action={
                <button onClick={() => removeFromCart(r.id)} className="h-7 text-xs rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600">✕ เอาออก</button>} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GroupManager — จัดการกลุ่มแท็ก (เพิ่ม/ลบ/แก้ไข + โหมดเลือก หลาย/1)
// ============================================================
type GForm = { id?: string; name: string; icon: string; parent_group_id: string; single_select: boolean };
function GroupManager({ groups, onClose, onChanged }: { groups: Grp[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState<GForm | null>(null);   // null = ดูรายการ; มีค่า = กำลังเพิ่ม/แก้
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tops = groups.filter((g) => !g.parent_group_id).sort((a, b) => a.sort_order - b.sort_order);
  const subsOf = (id: string) => groups.filter((g) => g.parent_group_id === id).sort((a, b) => a.sort_order - b.sort_order);

  const openNew = () => { setErr(null); setForm({ name: "", icon: "🏷️", parent_group_id: "", single_select: false }); };
  const openEdit = (g: Grp) => { setErr(null); setForm({ id: g.id, name: g.name, icon: g.icon ?? "🏷️", parent_group_id: g.parent_group_id ?? "", single_select: g.single_select }); };

  const save = async () => {
    if (!form || !form.name.trim()) return;
    setBusy(true); setErr(null);
    const body = JSON.stringify({
      name: form.name.trim(), icon: form.icon || null,
      parent_group_id: form.parent_group_id || null, single_select: form.single_select,
    });
    try {
      const res = form.id
        ? await apiFetch(`/api/master-v2/product_family_groups/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await apiFetch(`/api/master-v2/product_family_groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      setForm(null); onChanged();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const del = async (g: Grp) => {
    if (!confirm(`ลบกลุ่ม "${g.name}"?\n(แท็กในกลุ่มจะไม่ถูกลบ แต่จะไม่มีกลุ่ม)`)) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/product_family_groups/${g.id}?hard=1`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? "ลบไม่สำเร็จ (อาจมีกลุ่มย่อย/แท็กอ้างอยู่)"); return; }
      onChanged();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const inp = "w-full h-9 px-2 text-sm border border-slate-200 rounded-md";
  const Row = ({ g, sub }: { g: Grp; sub?: boolean }) => (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm ${sub ? "pl-8" : ""}`}>
      <span className="text-lg">{g.icon ?? "🏷️"}</span>
      <span className="flex-1 min-w-0 truncate">{sub ? "↳ " : ""}{g.name}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.single_select ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
        {g.single_select ? "เลือก 1" : "หลายรายการ"}
      </span>
      <button onClick={() => openEdit(g)} className="text-xs text-blue-600 hover:underline">แก้ไข</button>
      <button onClick={() => del(g)} className="text-slate-300 hover:text-red-500">✕</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">⚙️ จัดการกลุ่มแท็ก</h3>
          {!form && <button onClick={openNew} className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">➕ เพิ่มกลุ่ม</button>}
        </div>

        {form ? (
          <div className="p-5 space-y-3">
            <div className="flex items-end gap-3">
              <div><div className="text-[11px] text-slate-500 mb-1">ไอคอน</div><IconPicker value={form.icon} onChange={(v) => setForm((f) => f ? { ...f, icon: v } : f)} /></div>
              <div className="flex-1"><div className="text-[11px] text-slate-500 mb-1">ชื่อกลุ่ม *</div>
                <input autoFocus value={form.name} onChange={(e) => setForm((f) => f ? { ...f, name: e.target.value } : f)} className={inp} placeholder="เช่น สี" /></div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-1">กลุ่มแม่ (ถ้าเป็นกลุ่มย่อย)</div>
              <SearchableSelect value={form.parent_group_id} onChange={(v) => setForm((f) => f ? { ...f, parent_group_id: v } : f)} placeholder="— ไม่มี (กลุ่มหลัก) —"
                options={tops.filter((g) => g.id !== form.id).map((g) => ({ value: g.id, label: `${g.icon ?? ""} ${g.name}`.trim() }))} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-1">โหมดเลือกแท็กในกลุ่มนี้</div>
              <select value={form.single_select ? "single" : "multi"} onChange={(e) => setForm((f) => f ? { ...f, single_select: e.target.value === "single" } : f)} className={`${inp} bg-white`}>
                <option value="multi">เลือกได้หลายรายการ</option>
                <option value="single">เลือกได้ 1 รายการ</option>
              </select>
            </div>
            {err && <div className="text-xs text-red-600">⚠ {err}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setForm(null)} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={save} disabled={busy || !form.name.trim()} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {tops.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">— ยังไม่มีกลุ่ม —</div>}
              {tops.map((g) => (
                <div key={g.id}>
                  <Row g={g} />
                  {subsOf(g.id).map((s) => <Row key={s.id} g={s} sub />)}
                </div>
              ))}
            </div>
            {err && <div className="px-5 py-2 text-xs text-red-600">⚠ {err}</div>}
            <div className="px-5 py-3 border-t border-slate-200 text-right">
              <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
