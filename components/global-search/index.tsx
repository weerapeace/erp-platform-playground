"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { SearchHit, GlobalSearchResponse } from "@/app/api/global-search/route";

// ---- Entity icon/label config ----

const ENTITY: Record<SearchHit["entity_type"], { icon: string; label: string; color: string }> = {
  product:  { icon: "📦", label: "สินค้า",      color: "text-blue-700"    },
  supplier: { icon: "🏢", label: "ผู้จำหน่าย", color: "text-emerald-700" },
  pr:       { icon: "🛒", label: "ใบขอซื้อ",   color: "text-amber-700"   },
  user:     { icon: "👤", label: "ผู้ใช้",      color: "text-purple-700"  },
  asset:    { icon: "🖼️", label: "ไฟล์/คลัง",  color: "text-indigo-700"  },
};

// ---- Highlight helper ----

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-slate-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ============================================================
// GlobalSearch — Cmd+K modal
// ============================================================

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  // reset เมื่อเปิดใหม่
  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // debounce search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/global-search?q=${encodeURIComponent(q)}&limit=8`);
        const json: GlobalSearchResponse = await res.json();
        if (!cancelled) {
          setResults(json.data);
          setActiveIdx(0);
        }
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  // group by entity (preserve order from API)
  const grouped = useMemo(() => {
    const order: SearchHit["entity_type"][] = [];
    const map: Record<string, SearchHit[]> = {};
    for (const r of results) {
      if (!(r.entity_type in map)) { map[r.entity_type] = []; order.push(r.entity_type); }
      map[r.entity_type].push(r);
    }
    return { order, map };
  }, [results]);

  // flat list สำหรับ keyboard nav
  const flat = useMemo(() => {
    const arr: SearchHit[] = [];
    for (const t of grouped.order) arr.push(...grouped.map[t]);
    return arr;
  }, [grouped]);

  const goTo = useCallback((hit: SearchHit) => {
    onClose();
    router.push(hit.link_url);
  }, [onClose, router]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[activeIdx]) goTo(flat[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (typeof window === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/40"
      onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()} onKeyDown={onKey}>
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหา SKU, ผู้จำหน่าย, เลข PR, ไฟล์/artwork, ชื่อ user..."
            className="flex-1 text-sm bg-transparent border-0 focus:outline-none text-slate-800 placeholder-slate-400" />
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">กำลังค้นหา...</div>
          ) : !query.trim() ? (
            <div className="px-4 py-10 text-center">
              <div className="text-3xl mb-2 opacity-30">🔍</div>
              <p className="text-sm text-slate-400">พิมพ์เพื่อค้นหา · ใช้ <kbd className="bg-slate-100 px-1 rounded">↑↓</kbd> เลือก · <kbd className="bg-slate-100 px-1 rounded">↵</kbd> เปิด</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบผลลัพธ์ที่ตรงกับ &quot;{query}&quot;</div>
          ) : (
            <>
              {grouped.order.map((entity) => {
                const cfg = ENTITY[entity];
                const groupHits = grouped.map[entity];
                return (
                  <div key={entity}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                      {cfg.icon} {cfg.label} <span className="text-slate-300">· {groupHits.length}</span>
                    </div>
                    {groupHits.map(hit => {
                      const idx = flat.indexOf(hit);
                      const isActive = idx === activeIdx;
                      return (
                        <button
                          key={`${entity}-${hit.id}`}
                          data-idx={idx}
                          onClick={() => goTo(hit)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full text-left px-4 py-2.5 flex items-start gap-3 border-b border-slate-50 transition-colors ${
                            isActive ? "bg-blue-50" : "hover:bg-slate-50"
                          }`}>
                          <span className="text-lg leading-none mt-0.5 flex-shrink-0">{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${cfg.color}`}>{highlight(hit.label, query)}</div>
                            {hit.sublabel && (
                              <div className="text-xs text-slate-500 truncate">{highlight(hit.sublabel, query)}</div>
                            )}
                          </div>
                          {isActive && <span className="text-[10px] text-slate-400 mt-1">↵</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>
            <kbd className="bg-white border border-slate-200 px-1 rounded">↑↓</kbd>{" "}
            <kbd className="bg-white border border-slate-200 px-1 rounded">↵</kbd>{" "}
            <kbd className="bg-white border border-slate-200 px-1 rounded">ESC</kbd>
          </span>
          <span>Global Search · ค้นข้ามโมดูล</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
