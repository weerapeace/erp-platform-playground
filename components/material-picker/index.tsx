"use client";

/**
 * MaterialPicker (ComponentPicker) — ของกลาง "เลือกวัตถุดิบ"
 *
 * ใช้ทุกที่ที่ต้องเลือกวัตถุดิบ (BOM, ใบงาน ฯลฯ) — ค้นผ่าน /api/bom/components
 *   • พิมพ์รหัสตรงๆ เจอเสมอ (แม้นอกกลุ่มที่กรอง → ติดป้าย "นอกกลุ่ม")
 *   • ตรงเป๊ะ/ขึ้นต้นตรง ขึ้นบนสุด · ใช้ล่าสุด · ค้นแบบเต็ม (รูปใหญ่ + โหลดเพิ่ม)
 *   • คืน BomComponent (กลุ่ม + หน้ากว้าง + %เผื่อเสีย + uom + รูป) ให้ autofill
 *
 * แก้ที่นี่ที่เดียว ใช้เหมือนกันหมด
 */
import { useState, useEffect, useRef, useLayoutEffect, useCallback, type RefObject, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { apiFetch, safeSearch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Pager } from "@/components/pager";
import type { BomComponent } from "@/app/api/bom/components/route";
import { RECENT_KEYS, loadRecent, pushRecent } from "@/lib/recent-picks";   // "ใช้ล่าสุด" ของกลาง

// โหลดเมื่อกดปุ่มเท่านั้น (dynamic กัน bundle บวม/import วน — material-picker เป็นของกลางใช้ทุกหน้า)
const SkuWizard = dynamic(() => import("@/app/master/skus/sku-wizard").then((m) => m.SkuWizard), { ssr: false });
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
const MaterialRequestForm = dynamic(() => import("@/components/material-request").then((m) => m.MaterialRequestForm), { ssr: false });

export type { BomComponent };

// cache ผลค้นวัตถุดิบใน session (per URL) ~45วิ → เปิด dropdown/ค้นคำเดิมซ้ำ = ทันที (ไม่โดน worker ~2วิ)
const MAT_CACHE = new Map<string, { at: number; opts: BomComponent[] }>();
const MAT_TTL = 45000;

// dropdown ลอยผ่าน portal — ไม่โดนตาราง scroll บัง + เด้งขึ้นบนเมื่อพื้นที่ล่างไม่พอ
function FloatingPanel({ anchorRef, open, children, minWidth = 340 }: { anchorRef: RefObject<HTMLDivElement | null>; open: boolean; children: ReactNode; minWidth?: number }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  /**
   * วางตำแหน่งใหม่ทุกครั้งที่จอ/กล่องแม่เลื่อน — เดิมคำนวณครั้งเดียวตอนเปิด
   * พอฟอร์มในโมดัลเลื่อนตามช่องที่โฟกัส กล่องลอยค้างที่เดิม ล้นจอ แล้ว "เลื่อนดูรายการที่เหลือไม่ได้"
   * และจำกัดความสูงตามที่ว่างจริง เพื่อให้รายการข้างในเลื่อนได้เสมอ ไม่โดนตัดหาย
   */
  const place = useCallback(() => {
    if (!open || !anchorRef.current) { setStyle(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const GAP = 4, EDGE = 8;
    const spaceBelow = window.innerHeight - r.bottom - GAP - EDGE;
    const spaceAbove = r.top - GAP - EDGE;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
    setStyle({
      position: "fixed",
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE)),
      width,
      zIndex: 60,
      maxHeight: Math.max(160, openUp ? spaceAbove : spaceBelow),   // ไม่ล้นจอ → ข้างในเลื่อนได้
      display: "flex", flexDirection: "column",
      ...(openUp ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  }, [open, anchorRef, minWidth]);
  useLayoutEffect(() => { place(); }, [place]);
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);   // capture = จับการเลื่อนของกล่องแม่ทุกชั้น
    window.addEventListener("resize", onMove);
    return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open, place]);
  if (!open || !style) return null;
  return createPortal(<div style={style} onMouseDown={(e) => e.stopPropagation()}>{children}</div>, document.body);
}
// รับได้ทั้ง "ชื่อไฟล์ใน R2" และ "ลิงก์รูปเต็ม" (เช่น /api/r2-image?key=... ที่ API ใบสั่งผลิตส่งมา)
//   เดิมรับแค่ชื่อไฟล์ → ลิงก์เต็มถูกห่อซ้ำ รูปขึ้นเป็นรูปแตก
const thumbUrl = (key: string) => (/^(\/|https?:|data:|blob:)/.test(key) ? key : `/api/r2-image?key=${encodeURIComponent(key)}`);
function Thumb({ k, size = 22 }: { k: string | null; size?: number }) {
  if (!k) return <span className="inline-block rounded bg-slate-100 shrink-0" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(k)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="rounded object-cover bg-slate-50 shrink-0" style={{ width: size, height: size }} />;
}

const loadRecentMat = () => loadRecent<BomComponent>(RECENT_KEYS.materials);
const pushRecentMat = (c: BomComponent) => pushRecent(RECENT_KEYS.materials, c, 8);

export function ComponentPicker({ sku, name, imageKey, placeholder = "— เลือกวัตถุดิบ —", onPick, allowedGroupCodes, allowedTags }: { sku: string; name: string; imageKey?: string | null; placeholder?: string; onPick: (c: BomComponent) => void; allowedGroupCodes?: string[]; allowedTags?: string[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<BomComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);   // ข้ามตัวกรองกลุ่ม
  const [recent, setRecent] = useState<BomComponent[]>([]);
  const [fullOpen, setFullOpen] = useState(false);   // popup ค้นหาแบบเต็ม
  const boxRef = useRef<HTMLDivElement>(null);
  const filtered = !!(allowedGroupCodes && allowedGroupCodes.length > 0 && !showAll);
  useEffect(() => { if (open) setRecent(loadRecentMat()); }, [open]);
  const pick = (c: BomComponent) => { pushRecentMat(c); onPick(c); setOpen(false); setFullOpen(false); };
  const load = useCallback(async (q: string, grps: string[] | undefined, tagList: string[] | undefined) => {
    const params = new URLSearchParams({ limit: "50" });
    if (q) params.set("search", safeSearch(q));
    if (grps && grps.length) params.set("groups", grps.join(","));
    if (tagList && tagList.length) params.set("tags", tagList.join(","));
    const url = `/api/bom/components?${params}`;
    const hit = MAT_CACHE.get(url);
    if (hit && Date.now() - hit.at < MAT_TTL) { setOptions(hit.opts); return; }   // เปิดซ้ำ/ค้นเดิม = ทันที
    setLoading(true);
    try {
      const res = await apiFetch(url, { cache: "no-store" });
      const json = await res.json(); const opts = (json.data ?? []) as BomComponent[];
      MAT_CACHE.set(url, { at: Date.now(), opts });
      if (MAT_CACHE.size > 200) { const now = Date.now(); for (const [k, v] of MAT_CACHE) if (now - v.at > MAT_TTL) MAT_CACHE.delete(k); }
      setOptions(opts);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search, filtered ? allowedGroupCodes : undefined, allowedTags), 250); return () => clearTimeout(t); }, [open, search, load, filtered, allowedGroupCodes, allowedTags]);
  useEffect(() => { const f = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }} data-field-trigger
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 overflow-hidden">
        {sku ? <><Thumb k={imageKey ?? null} /><span className="truncate"><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span></> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {/* flex/min-h-0 = ให้ส่วนรายการยืดตามที่ว่างจริงแล้วเลื่อนข้างใน (ไม่ล้นจอจนกดไม่ถึง) */}
      <FloatingPanel anchorRef={boxRef} open={open} minWidth={520}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col min-h-0 max-h-full">
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {allowedGroupCodes && allowedGroupCodes.length > 0 && (
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded border-slate-300" />
                ดูทั้งหมด (ข้ามการกรองตามช่อง)
                {!showAll && <span className="text-slate-400">· แสดงเฉพาะกลุ่มที่ตรงช่อง</span>}
              </label>
            )}
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {!search.trim() && recent.length > 0 && <>
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-medium text-slate-400">⭐ ใช้ล่าสุด</div>
              {recent.map((c) => (
                <button key={`r-${c.id}`} type="button" onClick={() => pick(c)} className="w-full px-3 py-1.5 text-left hover:bg-amber-50 flex items-center gap-2">
                  <Thumb k={c.image_key} size={26} />
                  <code className="text-xs text-slate-500 shrink-0">{c.code}</code>
                  <span className="text-sm text-slate-700 line-clamp-2 leading-tight flex-1">{c.name}</span>
                  {c.material_type && <span className="text-[10px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">{c.material_type}</span>}
                </button>
              ))}
              <div className="border-t border-slate-100 my-1" />
            </>}
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบวัตถุดิบ</div>}
            {options.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c)}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2">
                <Thumb k={c.image_key} size={26} />
                <code className="text-xs text-slate-500 shrink-0">{c.code}</code>
                <span className="text-sm text-slate-700 line-clamp-2 leading-tight flex-1">{c.name}</span>
                {c.out_of_group && <span className="text-[10px] px-1.5 rounded bg-amber-100 text-amber-700 shrink-0" title="รหัสตรง แต่อยู่นอกกลุ่มที่กรอง">นอกกลุ่ม</span>}
                {c.material_type && <span className="text-[10px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">{c.material_type}</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button type="button" onClick={() => { setFullOpen(true); setOpen(false); }}
              className="w-full h-8 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">🔍 ค้นหาแบบเต็ม (ดูทั้งหมด + รูปใหญ่)</button>
          </div>
        </div>
      </FloatingPanel>
      {/* ส่งคำที่พิมพ์ไว้ใน dropdown ต่อไปด้วย — เดิมกดค้นหาแบบเต็มแล้วต้องพิมพ์ใหม่ */}
      <MaterialSearchModal open={fullOpen} initialSearch={search} onClose={() => setFullOpen(false)} onPick={pick} allowedGroupCodes={filtered ? allowedGroupCodes : undefined} allowedTags={allowedTags} />
    </div>
  );
}

/** ปุ่มกรองย่อยในหน้าค้นวัตถุดิบ — แท็ก (ชื่อ) และ/หรือ คำค้นนำหน้า (เช่น เบอร์ด้าย THREAD-30) */
export type MaterialChip = { key: string; label: string; tags?: string[]; search?: string };

/**
 * MaterialSearchPanel — เนื้อในของ "ค้นหาวัตถุดิบแบบเต็ม" (ช่องค้น + การ์ดมีรูป + แบ่งหน้า) · ฝังในป๊อปอื่นได้
 *   ใช้ที่: MaterialSearchModal (ข้างล่าง) · Design Library ป๊อปเลือกวัสดุ แท็บ "รายการ" / "ค้นทั้งหมด"
 *   chips = ปุ่มกรองย่อยด้านบน ("ทั้งหมด" = allowedTags) · คำค้นนำหน้าของปุ่ม + คำที่พิมพ์ = ค้นด้วยกัน (ทุกคำต้องตรง)
 */
export function MaterialSearchPanel({ active = true, onItem, allowedGroupCodes, allowedTags, chips, defaultChip = "", initialSearch = "", thumbSize = 44, wide = false, copyMode = false, busy = false, refreshKey = 0, onSearchChange, emptyText = "ไม่พบวัตถุดิบ", placeholder = "ค้นหา รหัส / ชื่อวัตถุดิบ…" }: {
  active?: boolean; onItem: (c: BomComponent) => void; allowedGroupCodes?: string[]; allowedTags?: string[]; chips?: MaterialChip[]; defaultChip?: string;
  initialSearch?: string; thumbSize?: number; wide?: boolean; copyMode?: boolean; busy?: boolean; refreshKey?: number;
  onSearchChange?: (s: string) => void; emptyText?: string; placeholder?: string;
}) {
  const PAGE = 40;
  const [search, setSearch] = useState(initialSearch);
  const [chip, setChip] = useState(defaultChip);   // "" = ทั้งหมด
  const [items, setItems] = useState<BomComponent[]>([]);
  const [loading, setLoading] = useState(false);
  // เลื่อนดูเป็น "หน้า" (ของกลาง Pager — รู้ total ตอนค้นหา · ไม่รู้ตอนเลื่อนดูทั้งหมด ใช้ hasMore) — เดิมมีแค่ปุ่มโหลดเพิ่มที่ต้องกดรัวและย้อนกลับไม่ได้
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cur = chips?.find((c) => c.key === chip);
  const tagKey = (cur?.tags?.length ? cur.tags : allowedTags ?? []).join(",");
  const groupKey = (allowedGroupCodes ?? []).join(",");
  const q = [cur?.search ?? "", search].map((s) => s.trim()).filter(Boolean).join(" ");
  const load = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(pg * PAGE) });
      if (q) params.set("search", safeSearch(q));
      if (groupKey) params.set("groups", groupKey);
      if (tagKey) params.set("tags", tagKey);
      const res = await apiFetch(`/api/bom/components?${params}`, { cache: "no-store" }); const j = await res.json();
      const data = (j.data ?? []) as BomComponent[];
      setItems(data);
      setTotal(typeof j.total === "number" ? j.total : null);
      setHasMore(data.length === PAGE);
      listRef.current?.scrollTo({ top: 0 });   // เปลี่ยนหน้าแล้วเลื่อนกลับบนสุด
    } catch { setItems([]); setHasMore(false); }
    finally { setLoading(false); }
  }, [q, groupKey, tagKey]);
  // เพิ่งเปิด → เริ่มด้วยคำที่พิมพ์ค้างไว้ (ไม่ทับสิ่งที่ผู้ใช้พิมพ์ต่อ)
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) { setSearch(initialSearch); setPage(0); }
    wasActive.current = active;
  }, [active, initialSearch]);
  // เปลี่ยนคำค้น/ปุ่มกรอง → กลับหน้าแรกเสมอ (ไม่งั้นค้างอยู่หน้า 5 ของคำค้นเก่า แล้วเห็นว่าง)
  useEffect(() => { setPage(0); }, [q, tagKey]);
  useEffect(() => { if (!active) return; const t = setTimeout(() => { void load(page); }, search ? 300 : 0); return () => clearTimeout(t); }, [active, search, page, load, refreshKey]);
  const reportRef = useRef(onSearchChange);
  reportRef.current = onSearchChange;
  useEffect(() => { reportRef.current?.(search); }, [search]);

  return (
    <div className="space-y-2">
      <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder}
        className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {[{ key: "", label: "ทั้งหมด" } as MaterialChip, ...chips].map((c) => (
            <button key={c.key || "_all"} type="button" onClick={() => setChip(c.key)}
              className={`h-7 px-2.5 text-[12px] rounded-full border ${chip === c.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c.label}</button>
          ))}
        </div>
      )}
      <div ref={listRef} className={`grid gap-2 max-h-[55vh] overflow-y-auto pr-1 ${wide ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2"}`}>
        {items.map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => onItem(c)}
            className={`flex items-center gap-2 p-2 border rounded-lg text-left disabled:opacity-50 ${copyMode ? "border-amber-200 hover:bg-amber-50 hover:border-amber-400" : "border-slate-200 hover:bg-blue-50 hover:border-blue-300"}`}>
            <Thumb k={c.image_key} size={thumbSize} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1"><code className="text-[10px] text-slate-400">{c.code}</code>{c.out_of_group && <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700">นอกกลุ่ม</span>}{c.material_type && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">{c.material_type}</span>}</div>
              <div className="text-sm text-slate-700 line-clamp-2 leading-tight">{c.name}</div>
            </div>
            {copyMode && <span className="text-[10px] text-amber-600 shrink-0">⧉ ก๊อป</span>}
          </button>
        ))}
        {!loading && items.length === 0 && <div className="col-span-full text-center py-10 text-slate-400 text-sm">{emptyText}</div>}
      </div>
      {loading && <div className="text-center text-xs text-slate-400 py-1">กำลังค้นหา…</div>}
      <Pager page={page} pageSize={PAGE} count={items.length} total={total} hasMore={hasMore} loading={loading} onPage={setPage} hideWhenSingle />
    </div>
  );
}

// MaterialSearchModal — ค้นหาวัตถุดิบแบบเต็ม (popup ใหญ่ + โหลดเพิ่ม) · เนื้อในใช้ MaterialSearchPanel
function MaterialSearchModal({ open, onClose, onPick, allowedGroupCodes, allowedTags, initialSearch = "" }: { open: boolean; onClose: () => void; onPick: (c: BomComponent) => void; allowedGroupCodes?: string[]; allowedTags?: string[]; initialSearch?: string }) {
  const [search, setSearch] = useState(initialSearch);   // คำที่พิมพ์อยู่ (เติมให้ฟอร์ม "ขอเพิ่ม")
  const [refreshKey, setRefreshKey] = useState(0);

  // เพิ่ม/ก๊อป SKU วัตถุดิบตรงจากหน้าค้นหา (ไม่ต้องออกไปหน้าอื่น)
  const toast = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);   // ➕ เพิ่ม SKU (Wizard เดี่ยว/ชุด)
  const [reqOpen, setReqOpen] = useState(false);         // 🙋 ขอเพิ่ม (ส่งคำขอ ไม่สร้างเอง)
  const [copyMode, setCopyMode] = useState(false);       // ⧉ โหมดก๊อป: กดวัตถุดิบสักตัว = ก๊อป (ไม่ใช่เลือก)
  const [copying, setCopying] = useState(false);
  const [copyEditId, setCopyEditId] = useState<string | null>(null);   // เปิดตัวที่ก๊อปมาแก้สี/รหัส
  const refreshSearch = useCallback(() => { setRefreshKey((k) => k + 1); }, []);
  const doCopy = async (c: BomComponent) => {
    setCopying(true);
    try {
      const r = await apiFetch("/api/skus/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setCopyMode(false);
      setCopyEditId(r.id as string);
      toast.success(`ก๊อปแล้ว: ${r.code} — เปลี่ยนสี/รหัสแล้วบันทึกได้เลย`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ก๊อปไม่สำเร็จ"); }
    finally { setCopying(false); }
  };

  return (
    <>
    <ERPModal open={open} onClose={onClose} size="lg" title="🔍 ค้นหาวัตถุดิบ"
      footer={<div className="flex items-center gap-2 w-full">
        <button onClick={() => setWizardOpen(true)} className="h-9 px-3 text-sm font-medium border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">➕ เพิ่ม SKU</button>
        <button onClick={() => setCopyMode((v) => !v)} className={`h-9 px-3 text-sm font-medium rounded-lg border ${copyMode ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>⧉ {copyMode ? "ยกเลิกก๊อป" : "copy SKU"}</button>
        {/* ไม่มีสิทธิ์สร้างเอง/ข้อมูลยังไม่ครบ → ส่งคำขอให้คนดูแลข้อมูลสร้างให้ (ของกลาง material-request) */}
        <button onClick={() => setReqOpen(true)} title="กรอกเท่าที่รู้ ส่งให้คนดูแลข้อมูลสร้าง SKU ให้"
          className="h-9 px-3 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">🙋 ขอเพิ่ม</button>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg ml-auto">ปิด</button>
      </div>}>
      <div className="space-y-2">
        {copyMode && <div className="px-3 py-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">โหมดก๊อป — กดวัตถุดิบที่จะใช้เป็นต้นแบบ แล้วเปลี่ยนแค่ “สี”/รหัส (ระบบก๊อปฟิลด์อื่นให้)</div>}
        <MaterialSearchPanel active={open} initialSearch={initialSearch} allowedGroupCodes={allowedGroupCodes} allowedTags={allowedTags}
          copyMode={copyMode} busy={copying} refreshKey={refreshKey} onSearchChange={setSearch}
          onItem={(c) => (copyMode ? void doCopy(c) : onPick(c))} />
      </div>
    </ERPModal>

    {/* ➕ เพิ่ม SKU — Wizard เดี่ยว/ชุด (ของกลางเดียวกับหน้า /master/skus) */}
    {wizardOpen && <SkuWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={() => { setWizardOpen(false); refreshSearch(); toast.success("เพิ่ม SKU แล้ว — ค้นหาเจอในรายการ"); }} />}

    {/* 🙋 ขอเพิ่มวัตถุดิบ — กรอกเท่าที่รู้ เข้าคิวรออนุมัติ (ของกลางเดียวกับหน้า SKU) · เติมคำค้นที่พิมพ์ไว้ให้ */}
    {reqOpen && <MaterialRequestForm open onClose={() => setReqOpen(false)}
      prefill={{ name_th: search.trim() }} onSaved={() => toast.success("ส่งคำขอแล้ว — รอคนดูแลข้อมูลอนุมัติ")} />}

    {/* ⧉ ก๊อปแล้ว → เปิดแก้สี/รหัสทันที (บันทึกแล้วรีเฟรชรายการ) */}
    {copyEditId && <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" recordId={copyEditId} startInEdit onClose={() => setCopyEditId(null)} onChanged={() => refreshSearch()} />}
    </>
  );
}
