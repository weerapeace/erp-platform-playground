"use client";

/**
 * SkuTagBrowser — ของกลาง "เลือกดู SKU ตามกลุ่มแท็ก"
 *
 * - drill-down: กลุ่มหลัก → กลุ่มย่อย/แท็ก (ตามรูปที่ออกแบบ)
 * - TagGroupFilter (ของกลางเดียวกับจัดซื้อ): กรองหลายแท็กพร้อมกัน
 * - การ์ด SKU: เรียงลำดับ · โหลดเพิ่ม · กดการ์ด → ดู/แก้ SKU (SkuFormModal) · ปรับฟิลด์การ์ด
 * - ค้นหา SKU ทั้งหมด · ดึงผ่าน /api/sku-browser (RPC กลาง erp_skus_tag_page)
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import type { BrowseTree, BrowseGroup, BrowseTag, SkuCard } from "@/app/api/sku-browser/route";
// drawer เก่าตัวจริงของ MasterCRUD — โหลดเฉพาะตอนเปิด (master-crud หนัก) กันบวม bundle
// loading: โชว์ "กำลังเปิด…" ทันทีระหว่างโหลดก้อนโค้ดครั้งแรก (ไม่ให้รู้สึกค้าง)
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[140] bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-xl px-5 py-3 text-sm text-slate-500 shadow-2xl inline-flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" /> กำลังเปิด…
      </div>
    </div>
  ),
});

type Crumb = { id: string; name: string };

const CARD_FIELDS: { key: string; label: string }[] = [
  { key: "image",  label: "รูป" }, { key: "code", label: "รหัส" }, { key: "name", label: "ชื่อ" },
  { key: "price",  label: "ราคาขาย" }, { key: "stock", label: "สต๊อกคงเหลือ" }, { key: "tags", label: "แท็ก" }, { key: "status", label: "สถานะ" },
];
const DEFAULT_CARD_FIELDS = CARD_FIELDS.map((f) => f.key);
const CORE_KEYS = new Set(DEFAULT_CARD_FIELDS);   // 7 ฟิลด์หลัก (เรนเดอร์พิเศษ) — ที่เหลือ = ฟิลด์เพิ่มจาก Field Registry
const CORE_COLUMNS = new Set(["id", "code", "name_th", "list_price", "is_active", "cover_image_r2_key"]);
function fmtCell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  if (typeof v === "number") return v.toLocaleString("th-TH");
  return String(v);
}
type FieldDef = { key: string; label: string };
const CARD_SCOPE = "sku-browser";
const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };
const LIMIT = 60;   // โหลดหน้าละ 60 (เดิม 120) — เห็นเร็วขึ้น แล้วค่อย "โหลดเพิ่ม"

const SORTS = [
  { key: "code",       label: "รหัส (A→Z)",     by: "code",       dir: "asc"  },
  { key: "name",       label: "ชื่อ (A→Z)",      by: "name_th",    dir: "asc"  },
  { key: "price_desc", label: "ราคา (สูง→ต่ำ)",  by: "list_price", dir: "desc" },
  { key: "price_asc",  label: "ราคา (ต่ำ→สูง)",  by: "list_price", dir: "asc"  },
  { key: "newest",     label: "ใหม่ล่าสุด",      by: "created_at", dir: "desc" },
] as const;

/** เช็คว่าการ์ดนี้ข้อมูลไม่ครบตรงไหน (ไว้โชว์ป้ายเตือน + กรอง) */
function cardWarnings(c: SkuCard): string[] {
  const w: string[] = [];
  if (!c.image) w.push("ไม่มีรูป");
  if (c.variant_count == null && (c.list_price == null || c.list_price <= 0)) w.push("ไม่มีราคา");   // Parent ไม่มีราคา = ไม่เตือน
  if (c.tags.length === 0) w.push("ไม่มีแท็ก");
  return w;
}

export function SkuTagBrowser() {
  const toast = useToast();
  const [entity, setEntity] = useState<"skus" | "parent-skus">("skus");   // ดูตาม SKU หรือ Parent SKU (ของกลางตัวเดียว)
  const [tree, setTree] = useState<BrowseTree | null>(null);
  const [groupPath, setGroupPath] = useState<Crumb[]>([]);
  const [tagFilter, setTagFilter] = useState<TagFilterValue>(EMPTY_FILTER);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("code");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);   // กรองเฉพาะ SKU ที่ข้อมูลไม่ครบ
  const [selected, setSelected] = useState<Set<string>>(new Set());   // เลือกหลายตัว (bulk)
  const [view, setView] = useState<"card" | "table">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sku-browser-view") === "table") return "table";
    return "card";
  });
  const setViewPersist = (v: "card" | "table") => { setView(v); try { localStorage.setItem("sku-browser-view", v); } catch { /* ignore */ } };

  const [cards, setCards] = useState<SkuCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [cardFields, setCardFields] = useState<string[]>(DEFAULT_CARD_FIELDS);
  const [availFields, setAvailFields] = useState<FieldDef[]>([]);   // ฟิลด์ SKU ทั้งหมด (จาก Field Registry — ไม่ hardcode)
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);   // คลิกการ์ด/แถว → RelationPeek (ของกลาง: ดู/แก้ทุกฟิลด์)

  // ชุดฟิลด์การ์ด (ครั้งเดียว)
  useEffect(() => {
    apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json())
      .then((j) => { const f = (j.mine ?? j.default) as string[] | null; if (f && f.length) setCardFields(f); }).catch(() => {});
  }, []);
  // อุ่นโค้ด drawer เก่า (ก้อนใหญ่) ล่วงหน้าหลังหน้าโหลดเสร็จ → คลิกการ์ดแล้วเปิดทันที ไม่ต้องรอโหลดก้อนโค้ด
  useEffect(() => {
    const t = setTimeout(() => { void import("@/components/master-crud"); }, 1200);
    return () => clearTimeout(t);
  }, []);
  // ต้นไม้แท็ก + ฟิลด์ทะเบียน + รีเซ็ตการเดิน — เปลี่ยนเมื่อสลับ entity (SKU/Parent)
  useEffect(() => {
    setGroupPath([]); setTagFilter(EMPTY_FILTER); setSearch("");
    apiFetch(`/api/sku-browser?entity=${entity}`).then((r) => r.json()).then((j) => setTree(j.tree ?? { groups: [], tags: [] })).catch(() => {});
    apiFetch(`/api/admin/field-registry-v2?module=${entity === "parent-skus" ? "parent-skus-v2" : "skus-v2"}`).then((r) => r.json())
      .then((j) => {
        const fs = ((j.fields ?? []) as { column_name: string | null; field_label: string; is_visible: boolean; is_sensitive: boolean }[])
          .filter((f) => f.column_name && f.is_visible && !f.is_sensitive && !CORE_COLUMNS.has(f.column_name))
          .map((f) => ({ key: f.column_name as string, label: f.field_label }));
        setAvailFields(fs);
      }).catch(() => {});
  }, [entity]);

  const tagNameById = useMemo(() => new Map((tree?.tags ?? []).map((t) => [t.id, t.name])), [tree]);
  const fieldLabels = useMemo(() => new Map(availFields.map((f) => [f.key, f.label])), [availFields]);
  const extraDefs = useMemo<FieldDef[]>(() => cardFields.filter((k) => !CORE_KEYS.has(k)).map((k) => ({ key: k, label: fieldLabels.get(k) ?? k })), [cardFields, fieldLabels]);
  const cardsMode = !!search.trim() || tagFilter.tagIds.length > 0;
  const currentGroupId = groupPath.length ? groupPath[groupPath.length - 1].id : null;
  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const shown = onlyIncomplete ? cards.filter((c) => cardWarnings(c).length > 0) : cards;

  // ดึงการ์ดหนึ่งหน้า (off = ตำแหน่งเริ่ม)
  const fetchPage = useCallback(async (off: number) => {
    const p = new URLSearchParams();
    if (tagFilter.tagIds.length) p.set("family_ids", tagFilter.tagIds.join(","));
    if (search.trim()) p.set("search", search.trim());
    p.set("sort", sort.by); p.set("dir", sort.dir);
    p.set("limit", String(LIMIT)); p.set("offset", String(off));
    p.set("entity", entity);
    const extra = cardFields.filter((k) => !CORE_KEYS.has(k));
    if (extra.length) p.set("fields", extra.join(","));
    const j = await apiFetch(`/api/sku-browser?${p.toString()}`).then((r) => r.json());
    return { cards: (j.cards ?? []) as SkuCard[], total: Number(j.total ?? 0) };
  }, [tagFilter, search, sort, cardFields, entity]);

  // โหลดหน้าแรกใหม่เมื่อเปลี่ยน filter/search/sort
  useEffect(() => {
    if (!cardsMode) { setCards([]); setTotal(0); return; }
    let alive = true;
    setLoadingCards(true); setSelected(new Set());
    fetchPage(0).then((r) => { if (!alive) return; setCards(r.cards); setTotal(r.total); })
      .catch(() => {}).finally(() => { if (alive) setLoadingCards(false); });
    return () => { alive = false; };
  }, [cardsMode, fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try { const r = await fetchPage(cards.length); setCards((prev) => [...prev, ...r.cards]); setTotal(r.total); }
    catch { /* ignore */ } finally { setLoadingMore(false); }
  };
  const reloadFirst = async () => { try { const r = await fetchPage(0); setCards(r.cards); setTotal(r.total); } catch { /* ignore */ } };

  const childGroups = (tree?.groups ?? []).filter((g) => g.parent_group_id === currentGroupId);
  const childTags   = (tree?.tags   ?? []).filter((t) => t.group_id === currentGroupId);

  // ผูกการเดินเข้ากลุ่ม/แท็กกับประวัติเบราว์เซอร์ → ปุ่ม Back ย้อนทีละชั้น (ไม่เด้งออกหน้าเลย)
  const pushNav = useCallback((gp: Crumb[], tf: TagFilterValue) => {
    setGroupPath(gp); setTagFilter(tf);
    try { window.history.pushState({ __skuNav: { gp, tf } }, ""); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { __skuNav?: { gp: Crumb[]; tf: TagFilterValue } } | null)?.__skuNav;
      setGroupPath(s?.gp ?? []); setTagFilter(s?.tf ?? EMPTY_FILTER);   // ไม่มี state ของเรา = กลับถึงราก
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openGroup = (g: BrowseGroup) => pushNav([...groupPath, { id: g.id, name: g.name }], EMPTY_FILTER);
  const openTag   = (t: BrowseTag)   => pushNav(groupPath, { tagIds: [t.id], none: false });
  const goRoot    = () => { setSearch(""); pushNav([], EMPTY_FILTER); };
  const goCrumb   = (i: number) => pushNav(groupPath.slice(0, i + 1), EMPTY_FILTER);
  const clearTags = () => pushNav(groupPath, EMPTY_FILTER);

  // ── เลือกหลายตัว + bulk ──
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  const selectAllShown = () => setSelected(new Set(shown.map((c) => c.id)));
  const bulkAddTag = async (tagId: string) => {
    const ids = [...selected]; if (!tagId || ids.length === 0) return;
    try {
      const res = await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction: "skus_v2_product_family_m2m", links: ids.map((src_id) => ({ src_id, tgt_id: tagId })) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`ติดแท็กให้ ${ids.length} SKU แล้ว`); clearSel(); void reloadFirst();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ติดแท็กไม่สำเร็จ"); }
  };
  const bulkStatus = async (active: boolean) => {
    const ids = [...selected]; if (ids.length === 0) return;
    let ok = 0;
    for (const id of ids) {
      try { const res = await apiFetch(`/api/master-v2/skus/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: active }) }); if (res.ok) ok++; } catch { /* ignore */ }
    }
    toast.success(`${active ? "เปิด" : "ปิด"}ใช้งาน ${ok}/${ids.length} SKU แล้ว`); clearSel(); void reloadFirst();
  };
  const exportCsv = () => {
    const rows = shown.filter((c) => selected.has(c.id)); if (rows.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["รหัส", "ชื่อ", "ราคาขาย", "สต๊อก", "แท็ก", "สถานะ"].join(",")]
      .concat(rows.map((c) => [c.code, c.name, c.list_price ?? "", c.qty_on_hand ?? "", c.tags.join("|"), c.is_active ? "ใช้งาน" : "ปิด"].map(esc).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "skus-export.csv"; a.click(); URL.revokeObjectURL(a.href);
    toast.success(`Export ${rows.length} รายการแล้ว`);
  };

  const saveCard = async (fields: string[], target: "me" | "all") => {
    try {
      const res = await apiFetch("/api/card-layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: CARD_SCOPE, fields, target }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setCardFields(fields); setCustomizeOpen(false);
      toast.success(target === "all" ? "บันทึกเป็นค่าเริ่มต้นของทุกคนแล้ว" : "บันทึกการ์ดของคุณแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const resetCard = async () => {
    try {
      await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}&target=me`, { method: "DELETE" });
      const j = await apiFetch(`/api/card-layouts?scope=${CARD_SCOPE}`).then((r) => r.json());
      setCardFields(((j.default as string[] | null) && (j.default as string[]).length ? (j.default as string[]) : DEFAULT_CARD_FIELDS));
      setCustomizeOpen(false); toast.success("รีเซ็ตการ์ดแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "รีเซ็ตไม่สำเร็จ"); }
  };

  return (
    <div>
      {/* สลับ SKU / Parent SKU (ของกลางตัวเดียว — แท็ก/กลุ่มชุดเดียวกัน) */}
      <div className="flex items-center gap-1 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => setEntity("skus")} className={`h-9 px-4 text-sm ${entity === "skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>🏷️ SKU</button>
          <button onClick={() => setEntity("parent-skus")} className={`h-9 px-4 text-sm border-l border-slate-200 ${entity === "parent-skus" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>📦 Parent SKU</button>
        </div>
      </div>
      {/* search + กรองแท็ก (ของกลาง) + ปรับการ์ด */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <span className="text-slate-400">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา SKU ทั้งหมด (รหัส / ชื่อ) — หาได้จากทุกกลุ่ม"
            className="flex-1 h-full text-sm outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>
        <TagGroupFilter value={tagFilter} onChange={setTagFilter} label="กรองแท็ก" showNone={false} />
        <button onClick={() => setCustomizeOpen(true)}
          className="h-10 px-3 text-[13px] border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ ปรับการ์ด</button>
      </div>

      {/* breadcrumb */}
      <div className="flex items-center gap-1 text-[13px] mb-3 flex-wrap">
        <button onClick={goRoot} className={`hover:underline ${groupPath.length === 0 && !cardsMode ? "text-slate-700 font-medium" : "text-indigo-600"}`}>🏠 ทั้งหมด</button>
        {search.trim() && <><span className="text-slate-300">›</span><span className="text-slate-500">ค้นหา “{search.trim()}”</span></>}
        {!search.trim() && tagFilter.tagIds.length > 0 && (
          <>
            <span className="text-slate-300">›</span>
            <span className="text-slate-700 font-medium">🔖 {tagFilter.tagIds.map((id) => tagNameById.get(id) ?? "แท็ก").join(", ")}</span>
            <button onClick={clearTags} className="text-slate-400 hover:text-rose-500 text-xs ml-1">✕</button>
          </>
        )}
        {!cardsMode && groupPath.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-slate-300">›</span>
            <button onClick={() => goCrumb(i)} className={`hover:underline ${i === groupPath.length - 1 ? "text-slate-700 font-medium" : "text-indigo-600"}`}>{c.name}</button>
          </span>
        ))}
      </div>

      {/* body */}
      {cardsMode ? (
        loadingCards ? <div className="text-center py-16 text-slate-400 text-sm">กำลังโหลด…</div>
        : cards.length === 0 ? <div className="text-center py-16 text-slate-400 text-sm">ไม่พบ SKU</div>
        : <>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-[12px] text-slate-400">{total.toLocaleString("th-TH")} รายการ (แสดง {(onlyIncomplete ? shown.length : cards.length).toLocaleString("th-TH")})</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                  <button onClick={() => setViewPersist("card")} className={`h-8 px-2.5 text-[12px] ${view === "card" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>▦ การ์ด</button>
                  <button onClick={() => setViewPersist("table")} className={`h-8 px-2.5 text-[12px] border-l border-slate-200 ${view === "table" ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50"}`}>☰ ตาราง</button>
                </div>
                <button onClick={() => setOnlyIncomplete((v) => !v)}
                  className={`h-8 px-2.5 text-[12px] rounded-lg border ${onlyIncomplete ? "bg-amber-50 border-amber-300 text-amber-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>⚠️ เฉพาะข้อมูลไม่ครบ</button>
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span>เรียง</span>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white">
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {onlyIncomplete && <p className="text-[11px] text-amber-600 mb-2">กรองจากที่โหลดมา {cards.length.toLocaleString("th-TH")} ตัว — กด “โหลดเพิ่ม” ด้านล่างเพื่อตรวจตัวที่เหลือ</p>}
            {shown.length === 0
              ? <div className="text-center py-12 text-slate-400 text-sm">ไม่มีรายการที่ข้อมูลไม่ครบในที่โหลดมา 🎉</div>
              : view === "table"
                ? <SkuTable rows={shown} selected={selected} onToggle={toggleSel} onOpen={(id) => setPeekId(id)} />
                : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                    {shown.map((c) => <SkuCardView key={c.id} c={c} fields={cardFields} extraDefs={extraDefs} onOpen={() => setPeekId(c.id)} selected={selected.has(c.id)} onToggleSelect={() => toggleSel(c.id)} />)}
                  </div>}
            {cards.length < total && (
              <div className="text-center mt-4">
                <button onClick={loadMore} disabled={loadingMore}
                  className="h-9 px-5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (เหลือ ${(total - cards.length).toLocaleString("th-TH")})`}
                </button>
              </div>
            )}
          </>
      ) : (
        (childGroups.length === 0 && childTags.length === 0)
          ? <div className="text-center py-16 text-slate-400 text-sm">ยังไม่มีกลุ่มย่อย/แท็กในนี้</div>
          : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {childGroups.map((g) => (
                <button key={g.id} onClick={() => openGroup(g)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl">{g.icon || "📁"}</span><span className="text-slate-300">›</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{g.name}</p>
                  <p className="text-[11px] text-slate-400">กลุ่ม</p>
                </button>
              ))}
              {childTags.map((t) => (
                <button key={t.id} onClick={() => openTag(t)}
                  className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition">
                  <div className="flex items-center justify-between"><span className="text-2xl">🏷️</span><span className="text-[11px] text-slate-400">{t.sku_count.toLocaleString("th-TH")} SKU</span></div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{t.name}</p>
                  <p className="text-[11px] text-indigo-500">ดูการ์ด SKU →</p>
                </button>
              ))}
            </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg w-fit mx-auto flex-wrap">
          <span className="text-sm font-medium">เลือก {selected.size}</span>
          <button onClick={selectAllShown} className="text-[12px] px-2 py-1 rounded-lg hover:bg-white/15">เลือกทั้งหมดที่แสดง</button>
          <select onChange={(e) => { const v = e.target.value; e.currentTarget.value = ""; if (v) void bulkAddTag(v); }} defaultValue=""
            className="h-8 px-2 text-[12px] rounded-lg text-slate-700 bg-white">
            <option value="">🏷️ ติดแท็ก…</option>
            {(tree?.tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => bulkStatus(true)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">เปิดใช้งาน</button>
          <button onClick={() => bulkStatus(false)} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">ปิดใช้งาน</button>
          <button onClick={exportCsv} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25">⬇ Export CSV</button>
          <button onClick={clearSel} className="text-[12px] px-2 py-1 rounded-lg hover:bg-white/15">ยกเลิก</button>
        </div>
      )}
      {customizeOpen && (
        <CardCustomizeModal value={cardFields} avail={availFields} onClose={() => setCustomizeOpen(false)} onSave={saveCard} onReset={resetCard} />
      )}
      {peekId && (() => {
        const isParent = entity === "parent-skus";
        // ใช้ "drawer เก่าตัวจริง" ของ MasterCRUD (เหมือนหน้า master เป๊ะ) — ไม่ใช่ RelationPeek
        return (
          <MasterRecordDrawer
            key={peekId}
            moduleKey={isParent ? "parent-skus-v2" : "skus-v2"}
            apiPath={isParent ? "parent-skus" : "skus"}
            title={isParent ? "Parent SKUs" : "SKU"}
            mediaGallery={isParent
              ? { entityType: "parent_skus_v2", title: "รูปภาพเพิ่มเติม", maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }
              : { entityType: "skus_v2", title: "รูปภาพเพิ่มเติม", maxItems: 9, maxSizeBytes: 2 * 1024 * 1024, imageOnly: true }}
            extraRowActions={isParent ? undefined : [{
              label: "คัดลอก", icon: "⧉",
              onClick: async (row) => {
                try {
                  const res = await apiFetch("/api/skus/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id }) });
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok || j.error) throw new Error(j.error ?? "คัดลอกไม่สำเร็จ");
                  toast.success(`คัดลอกเป็น ${j.code} แล้ว — แก้ไขรายละเอียดได้`); void reloadFirst();
                } catch (e) { toast.error(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ"); }
              },
            }]}
            recordId={peekId}
            navIds={cards.map((c) => c.id)}
            onClose={() => setPeekId(null)}
            onChanged={() => void reloadFirst()}
          />
        );
      })()}
    </div>
  );
}

function SkuCardView({ c, fields, extraDefs, onOpen, selected, onToggleSelect }: { c: SkuCard; fields: string[]; extraDefs: FieldDef[]; onOpen: () => void; selected: boolean; onToggleSelect: () => void }) {
  const has = (k: string) => fields.includes(k);
  const showTopRow = has("code") || has("status");
  const showPriceRow = has("price") || has("stock");
  const warns = cardWarnings(c);
  return (
    <button onClick={onOpen} className={`relative text-left rounded-xl border bg-white overflow-hidden hover:shadow-sm transition ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
      <span onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] cursor-pointer ${selected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/90 border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
      {has("image") && (
        <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
          {c.image
            ? <img src={withImageWidth(c.image, 320) ?? c.image} alt={c.code} loading="lazy" className="w-full h-full object-contain" />
            : <span className="text-3xl text-slate-300">🏷️</span>}
        </div>
      )}
      <div className="p-2.5">
        {warns.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {warns.map((x) => <span key={x} className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⚠ {x}</span>)}
          </div>
        )}
        {showTopRow && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {has("code") && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c.code}</span>}
            {has("status") && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? "ใช้งาน" : "ปิด"}</span>}
          </div>
        )}
        {has("name") && <p className="text-[12px] text-slate-700 mt-1" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}>{c.name || "—"}</p>}
        {c.variant_count != null ? (
          <div className="mt-1.5 text-[12px] text-indigo-600">📦 {c.variant_count.toLocaleString("th-TH")} ตัวลูก (SKU)</div>
        ) : showPriceRow ? (
          <div className="flex items-center justify-between mt-1.5">
            {has("price") ? <span className="text-[13px] font-medium text-slate-800">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</span> : <span />}
            {has("stock") && <span className="text-[11px] text-slate-400">สต๊อก {c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</span>}
          </div>
        ) : null}
        {has("tags") && c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {c.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
            {c.tags.length > 3 && <span className="text-[10px] text-slate-400">+{c.tags.length - 3}</span>}
          </div>
        )}
        {extraDefs.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5">
            {extraDefs.map((d) => <p key={d.key} className="text-[10px] text-slate-500 truncate"><span className="text-slate-400">{d.label}:</span> {fmtCell(c.extra?.[d.key])}</p>)}
          </div>
        )}
      </div>
    </button>
  );
}

// มุมมองตาราง — ใช้ข้อมูลชุดเดียวกับการ์ด (filter/sort/เลือก เหมือนกัน)
function SkuTable({ rows, selected, onToggle, onOpen }: {
  rows: SkuCard[]; selected: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-[12px]">
          <tr className="text-left">
            <th className="px-2 py-2 w-8"></th>
            <th className="px-2 py-2 w-12">รูป</th>
            <th className="px-3 py-2 font-medium">รหัส</th>
            <th className="px-3 py-2 font-medium">ชื่อ</th>
            <th className="px-3 py-2 font-medium text-right">ราคาขาย</th>
            <th className="px-3 py-2 font-medium text-right">สต๊อก</th>
            <th className="px-3 py-2 font-medium">แท็ก</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
            <th className="px-3 py-2 font-medium">เตือน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const w = cardWarnings(c);
            const sel = selected.has(c.id);
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)}
                className={`border-t border-slate-100 cursor-pointer ${sel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <td className="px-2 py-1.5" onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}>
                  <span className={`inline-flex w-4 h-4 rounded border items-center justify-center text-[10px] cursor-pointer ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent hover:text-slate-300"}`}>✓</span>
                </td>
                <td className="px-2 py-1.5">
                  {c.image
                    ? <img src={withImageWidth(c.image, 80) ?? c.image} alt="" loading="lazy" className="w-9 h-9 rounded object-cover border border-slate-200" />
                    : <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs">—</div>}
                </td>
                <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap">{c.code}</td>
                <td className="px-3 py-1.5"><span className="block max-w-[260px] truncate">{c.name || "—"}</span></td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{c.list_price != null && c.list_price > 0 ? `฿${Number(c.list_price).toLocaleString("th-TH")}` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{c.qty_on_hand != null ? Number(c.qty_on_hand).toLocaleString("th-TH") : "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 2).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{t}</span>)}
                    {c.tags.length > 2 && <span className="text-[10px] text-slate-400">+{c.tags.length - 2}</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{c.is_active ? "ใช้งาน" : "ปิด"}</span></td>
                <td className="px-3 py-1.5 whitespace-nowrap">{w.length > 0 ? <span className="text-[11px] text-amber-700" title={w.join(", ")}>⚠ {w.length}</span> : <span className="text-emerald-500 text-[11px]">✓</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardCustomizeModal({ value, avail, onClose, onSave, onReset }: {
  value: string[]; avail: FieldDef[]; onClose: () => void; onSave: (f: string[], t: "me" | "all") => void; onReset: () => void;
}) {
  const [sel, setSel] = useState<string[]>(value);
  const [target, setTarget] = useState<"me" | "all">("me");
  const toggle = (k: string) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  return (
    <ERPModal open onClose={onClose} title="ปรับแต่งการ์ด SKU" size="sm"
      footer={
        <div className="flex items-center justify-between w-full">
          <button onClick={onReset} className="h-9 px-3 text-[13px] text-slate-500 hover:underline">รีเซ็ตเป็นค่าเริ่มต้น</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => onSave(sel, target)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
          </div>
        </div>
      }>
      <p className="text-[12px] text-slate-500 mb-2">เลือกฟิลด์ที่จะโชว์บนการ์ด</p>
      <div className="flex flex-col gap-1.5 mb-3">
        {CARD_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4" /> {f.label}
          </label>
        ))}
      </div>
      {avail.length > 0 && (
        <div className="mb-4 pt-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-500 mb-2">＋ เพิ่มฟิลด์อื่นของ SKU <span className="text-[10px] text-slate-400">(จากทะเบียน field — ไม่ตายตัว)</span></p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-44 overflow-auto pr-1">
            {avail.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="w-4 h-4 shrink-0" /> <span className="truncate">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-[12px] text-slate-500 mb-1.5">บันทึกให้</p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "me"} onChange={() => setTarget("me")} /> เฉพาะฉัน</label>
          <label className="flex items-center gap-1.5 text-[13px] cursor-pointer"><input type="radio" checked={target === "all"} onChange={() => setTarget("all")} /> ทุกคน (ต้องมีสิทธิ์)</label>
        </div>
      </div>
    </ERPModal>
  );
}

// (คลิกการ์ด/แถว → ใช้ RelationPeekModal ของกลางแทน drawer ที่เคยทำเอง)
