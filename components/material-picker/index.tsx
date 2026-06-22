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
import { apiFetch, safeSearch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import type { BomComponent } from "@/app/api/bom/components/route";

export type { BomComponent };

// dropdown ลอยผ่าน portal — ไม่โดนตาราง scroll บัง + เด้งขึ้นบนเมื่อพื้นที่ล่างไม่พอ
function FloatingPanel({ anchorRef, open, children, minWidth = 340 }: { anchorRef: RefObject<HTMLDivElement | null>; open: boolean; children: ReactNode; minWidth?: number }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setStyle(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 300 && r.top > spaceBelow;
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
    setStyle({
      position: "fixed",
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      zIndex: 60,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, anchorRef, minWidth]);
  if (!open || !style) return null;
  return createPortal(<div style={style} onMouseDown={(e) => e.stopPropagation()}>{children}</div>, document.body);
}
const thumbUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
function Thumb({ k, size = 22 }: { k: string | null; size?: number }) {
  if (!k) return <span className="inline-block rounded bg-slate-100 shrink-0" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(k)} alt="" loading="lazy" className="rounded object-cover bg-slate-50 shrink-0" style={{ width: size, height: size }} />;
}

const RECENT_MAT_KEY = "erp-recent-materials";
function loadRecentMat(): BomComponent[] { try { return JSON.parse(localStorage.getItem(RECENT_MAT_KEY) ?? "[]") as BomComponent[]; } catch { return []; } }
function pushRecentMat(c: BomComponent) {
  try { const list = loadRecentMat().filter((x) => x.id !== c.id); localStorage.setItem(RECENT_MAT_KEY, JSON.stringify([c, ...list].slice(0, 8))); } catch { /* ignore */ }
}

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
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("search", safeSearch(q));
      if (grps && grps.length) params.set("groups", grps.join(","));
      if (tagList && tagList.length) params.set("tags", tagList.join(","));
      const res = await apiFetch(`/api/bom/components?${params}`, { cache: "no-store" });
      const json = await res.json(); setOptions((json.data ?? []) as BomComponent[]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search, filtered ? allowedGroupCodes : undefined, allowedTags), 250); return () => clearTimeout(t); }, [open, search, load, filtered, allowedGroupCodes, allowedTags]);
  useEffect(() => { const f = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 overflow-hidden">
        {sku ? <><Thumb k={imageKey ?? null} /><span className="truncate"><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span></> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      <FloatingPanel anchorRef={boxRef} open={open} minWidth={520}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
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
      <MaterialSearchModal open={fullOpen} onClose={() => setFullOpen(false)} onPick={pick} allowedGroupCodes={filtered ? allowedGroupCodes : undefined} allowedTags={allowedTags} />
    </div>
  );
}

// MaterialSearchModal — ค้นหาวัตถุดิบแบบเต็ม (popup ใหญ่ + โหลดเพิ่ม)
function MaterialSearchModal({ open, onClose, onPick, allowedGroupCodes, allowedTags }: { open: boolean; onClose: () => void; onPick: (c: BomComponent) => void; allowedGroupCodes?: string[]; allowedTags?: string[] }) {
  const PAGE = 40;
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BomComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async (q: string, off: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
      if (q) params.set("search", safeSearch(q));
      if (allowedGroupCodes && allowedGroupCodes.length) params.set("groups", allowedGroupCodes.join(","));
      if (allowedTags && allowedTags.length) params.set("tags", allowedTags.join(","));
      const res = await apiFetch(`/api/bom/components?${params}`, { cache: "no-store" }); const j = await res.json();
      const data = (j.data ?? []) as BomComponent[];
      setItems((prev) => append ? [...prev, ...data] : data);
      setHasMore(data.length === PAGE);
      setOffset(off + data.length);
    } finally { setLoading(false); }
  }, [allowedGroupCodes, allowedTags]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => { void load(search, 0, false); }, search ? 300 : 0); return () => clearTimeout(t); }, [open, search, load]);

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="🔍 ค้นหาวัตถุดิบ"
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
      <div className="space-y-2">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ…"
          className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
          {items.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 text-left">
              <Thumb k={c.image_key} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1"><code className="text-[10px] text-slate-400">{c.code}</code>{c.out_of_group && <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700">นอกกลุ่ม</span>}{c.material_type && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">{c.material_type}</span>}</div>
                <div className="text-sm text-slate-700 line-clamp-2 leading-tight">{c.name}</div>
              </div>
            </button>
          ))}
          {!loading && items.length === 0 && <div className="col-span-2 text-center py-10 text-slate-300 text-sm">ไม่พบวัตถุดิบ</div>}
        </div>
        {loading && <div className="text-center text-xs text-slate-400 py-1">กำลังค้นหา…</div>}
        {hasMore && !loading && <button type="button" onClick={() => load(search, offset, true)} className="w-full h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">โหลดเพิ่ม</button>}
      </div>
    </ERPModal>
  );
}
