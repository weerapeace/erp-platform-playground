"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useRecentPicks, RECENT_KEYS } from "@/lib/recent-picks";
import { announceParams } from "@/lib/open-param";
import { matchCommands } from "@/lib/search-commands";
import { getSearchScope } from "@/lib/search-scopes";
import type { SearchHit, GlobalSearchResponse } from "@/app/api/global-search/route";

// ---- Entity icon/label config ----

const ENTITY: Record<SearchHit["entity_type"], { icon: string; label: string; color: string }> = {
  command:   { icon: "⚡", label: "คำสั่งลัด",          color: "text-amber-800"   },
  page:      { icon: "📄", label: "หน้า / เมนู",        color: "text-slate-800"   },
  guide:     { icon: "📖", label: "วิธีใช้งาน",         color: "text-teal-700"    },
  sku:       { icon: "📦", label: "สินค้า (SKU)",       color: "text-blue-700"    },
  partner:   { icon: "🏢", label: "คู่ค้า (ลูกค้า/ร้าน)", color: "text-emerald-700" },
  po:        { icon: "🧾", label: "ใบสั่งซื้อ (PO)",    color: "text-amber-700"   },
  pv:        { icon: "🧾", label: "ใบสำคัญรับ (ใบซื้อ)", color: "text-orange-700"  },
  mo:        { icon: "🏭", label: "ใบสั่งผลิต (MO)",    color: "text-rose-700"    },
  invoice:   { icon: "🧾", label: "ใบขาย / ใบกำกับ",    color: "text-violet-700"  },
  quotation: { icon: "📝", label: "ใบเสนอราคา",        color: "text-violet-700"  },
  billing:   { icon: "📑", label: "ใบวางบิล",          color: "text-violet-700"  },
  delivery:  { icon: "🚚", label: "ใบส่งสินค้า",        color: "text-violet-700"  },
  cn:        { icon: "➖", label: "ใบลดหนี้",           color: "text-violet-700"  },
  task:      { icon: "🎨", label: "งาน Creative",       color: "text-pink-700"    },
  employee:  { icon: "🧑‍💼", label: "พนักงาน",           color: "text-cyan-700"    },
  contract:  { icon: "📄", label: "สัญญาจ้าง",          color: "text-cyan-800"    },
  period:    { icon: "📅", label: "งวดเงินเดือน",        color: "text-emerald-800" },
  user:      { icon: "👤", label: "ผู้ใช้ระบบ",         color: "text-purple-700"  },
  asset:     { icon: "🖼️", label: "ไฟล์/คลัง",          color: "text-indigo-700"  },
};
const entityCfg = (t: string) => ENTITY[t as SearchHit["entity_type"]] ?? { icon: "•", label: t, color: "text-slate-700" };

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

/** กลุ่มที่โชว์ในรายการผล (1 หัวข้อ + รายการ) */
type Section = { key: string; title: string; hits: SearchHit[]; removable?: boolean };

// ============================================================
// GlobalSearch — Cmd+K modal
// ============================================================

/**
 * @param scope ขอบเขตค้นหา (key ใน lib/search-scopes เช่น "payroll") — ไม่ส่ง = ค้นรวมทุกโมดูล
 *              แอปเดี่ยวส่งมาเพื่อให้ค้นเฉพาะของแอปนั้น + มีกล่อง "วิธีค้นหา" เฉพาะทาง
 */
export function GlobalSearch({ open, onClose, scope: scopeKey }: { open: boolean; onClose: () => void; scope?: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const scope = getSearchScope(scopeKey);
  const [showHelp, setShowHelp] = useState(false);   // ❓ วิธีค้นหา (เฉพาะ scope ที่มี tips)
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  // ⏱ เพิ่งเปิดล่าสุด — ของกลาง Recent Picks (จำในเครื่องผู้ใช้ 6 รายการ)
  const { recent, remember, forget } = useRecentPicks<SearchHit>(RECENT_KEYS.globalSearch, open);

  // reset เมื่อเปิดใหม่
  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setActiveIdx(0); setShowHelp(false);
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
        const res = await apiFetch(`/api/global-search?q=${encodeURIComponent(q)}&limit=8${scope ? `&scope=${encodeURIComponent(scope.key)}` : ""}`);
        const json: GlobalSearchResponse = await res.json();
        if (!cancelled) {
          setResults(json.data);
          setActiveIdx(0);
        }
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, scope]);

  // ⚡ คำสั่งลัด — จับคู่ฝั่งเครื่องทันที (ไม่ต้องรอ API) เฉพาะที่มีสิทธิ์
  const commandHits = useMemo<SearchHit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    return matchCommands(q, (p) => !p || can(p as Parameters<typeof can>[0]), scope?.key).map(({ cmd, score }) => ({
      entity_type: "command", id: cmd.id, label: `${cmd.icon} ${cmd.label}`,
      sublabel: cmd.href.includes("new=1") ? "เปิดฟอร์มสร้างใหม่ให้ทันที" : "ไปที่หน้านั้น",
      link_url: cmd.href, score,
    }));
  }, [query, can, scope]);

  // จัดกลุ่มผล: ไม่มีคำค้น → "เพิ่งเปิดล่าสุด" · มีคำค้น → คำสั่งลัด แล้วตามด้วยกลุ่มจาก API (คงลำดับ)
  const sections = useMemo<Section[]>(() => {
    if (!query.trim()) {
      return recent.length ? [{ key: "recent", title: "⏱ เพิ่งเปิดล่าสุด", hits: recent, removable: true }] : [];
    }
    const out: Section[] = [];
    if (commandHits.length) out.push({ key: "command", title: `${ENTITY.command.icon} ${ENTITY.command.label}`, hits: commandHits });
    const order: string[] = []; const map: Record<string, SearchHit[]> = {};
    for (const r of results) {
      if (!(r.entity_type in map)) { map[r.entity_type] = []; order.push(r.entity_type); }
      map[r.entity_type].push(r);
    }
    for (const t of order) { const cfg = entityCfg(t); out.push({ key: t, title: `${cfg.icon} ${cfg.label}`, hits: map[t] }); }
    return out;
  }, [query, recent, commandHits, results]);

  // flat list สำหรับ keyboard nav
  const flat = useMemo(() => sections.flatMap((s) => s.hits), [sections]);

  const goTo = useCallback((hit: SearchHit) => {
    remember(hit);            // จำไว้โชว์ตอนเปิดครั้งหน้า
    onClose();
    router.push(hit.link_url);
    announceParams(hit.link_url);   // อยู่หน้านั้นอยู่แล้ว → บอกให้เปิดใบ/ฟอร์มทันที (URL เปลี่ยนแค่ query หน้าไม่ mount ใหม่)
  }, [onClose, router, remember]);

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

  const hasQuery = !!query.trim();

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
            placeholder={scope?.placeholder ?? "ค้นหน้า/เมนู, SKU, ชื่อร้าน/ลูกค้า, เลข PO / ใบขาย / MO, งาน, พนักงาน, วิธีใช้ · หรือสั่ง “สร้าง PO”"}
            className="flex-1 text-sm bg-transparent border-0 focus:outline-none text-slate-800 placeholder-slate-400" />
          {scope && (
            <button type="button" onClick={() => setShowHelp((v) => !v)} title="วิธีค้นหา"
              className={`text-[11px] px-2 py-0.5 rounded-full border ${showHelp ? "bg-teal-50 border-teal-200 text-teal-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              ❓ วิธีค้นหา
            </button>
          )}
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* ❓ วิธีค้นหา — เฉพาะ scope ที่ประกาศ tips ไว้ (lib/search-scopes) */}
        {scope && showHelp && (
          <div className="px-4 py-3 bg-teal-50/60 border-b border-teal-100 text-xs text-slate-700">
            <div className="font-semibold text-teal-800 mb-1.5">พิมพ์อะไรได้บ้าง</div>
            <ul className="space-y-1">
              {scope.tips.map((t) => (
                <li key={t.what} className="flex gap-2">
                  <span className="flex-shrink-0">{t.icon}</span>
                  <span className="min-w-0">{t.what} <span className="text-slate-400">— เช่น</span> <button type="button" onClick={() => { setQuery(t.example.split(" หรือ ")[0].split(" · ")[0]); setShowHelp(false); }} className="font-mono text-teal-700 hover:underline">{t.example}</button></span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-slate-400">ใช้ <kbd className="bg-white border border-slate-200 px-1 rounded">↑↓</kbd> เลือก · <kbd className="bg-white border border-slate-200 px-1 rounded">↵</kbd> เปิด · <kbd className="bg-white border border-slate-200 px-1 rounded">ESC</kbd> ปิด · เปิดเร็วด้วย <kbd className="bg-white border border-slate-200 px-1 rounded">Ctrl+K</kbd></div>
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {loading && results.length === 0 && commandHits.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">กำลังค้นหา...</div>
          ) : sections.length === 0 && !hasQuery && scope ? (
            <div className="px-4 py-8 text-center">
              <div className="text-3xl mb-2 opacity-30">🔍</div>
              <p className="text-sm text-slate-500">ค้นเฉพาะข้อมูลของ {scope.label.replace("ค้นเฉพาะ ", "")}</p>
              <p className="text-xs text-slate-400 mt-1">ค้นได้: {scope.tips.slice(0, 4).map((t) => `${t.icon} ${t.what.split(" — ")[0]}`).join(" · ")}</p>
              <p className="text-xs text-slate-400 mt-1">ไม่แน่ใจว่าพิมพ์อะไร กด <button type="button" onClick={() => setShowHelp(true)} className="text-teal-700 underline">❓ วิธีค้นหา</button> ด้านบน</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {scope.examples.map((s) => (
                  <button key={s} type="button" onClick={() => setQuery(s)}
                    className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">{s}</button>
                ))}
              </div>
            </div>
          ) : sections.length === 0 && !hasQuery ? (
            <div className="px-4 py-10 text-center">
              <div className="text-3xl mb-2 opacity-30">🔍</div>
              <p className="text-sm text-slate-400">พิมพ์เพื่อค้นหา · ใช้ <kbd className="bg-slate-100 px-1 rounded">↑↓</kbd> เลือก · <kbd className="bg-slate-100 px-1 rounded">↵</kbd> เปิด</p>
              <p className="text-xs text-slate-400 mt-2">ค้นได้: 📄 หน้า/เมนู · 📖 วิธีใช้ · 📦 SKU · 🏢 คู่ค้า · 🧾 PO / ใบสำคัญรับ / ใบขาย / วางบิล · 🚚 ใบส่งของ · 🏭 ใบสั่งผลิต · 🎨 งาน · 🧑‍💼 พนักงาน · 🖼️ ไฟล์</p>
              <p className="text-xs text-slate-400 mt-1">⚡ สั่งงานได้: พิมพ์ “สร้าง PO” “เพิ่ม SKU” “เปิดใบขายใหม่” แล้วกด ↵</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {["ค่าส่ง", "เครดิต", "สร้าง PO", "เพิ่ม SKU", "วิธีใช้"].map((s) => (
                  <button key={s} type="button" onClick={() => setQuery(s)}
                    className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">{s}</button>
                ))}
              </div>
            </div>
          ) : sections.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              <p>ไม่พบผลลัพธ์ที่ตรงกับ &quot;{query}&quot;{scope ? ` ใน ${scope.label.replace("ค้นเฉพาะ ", "")}` : ""}</p>
              {scope ? (
                <p className="text-xs mt-2 text-slate-400">ลองพิมพ์สั้นลง (เช่น แค่รหัสหรือชื่อเล่น) หรือกด <button type="button" onClick={() => setShowHelp(true)} className="text-teal-700 underline">❓ วิธีค้นหา</button> · ถ้าเป็นของโมดูลอื่น ให้ค้นจากหน้า ERP เต็ม</p>
              ) : (
                <p className="text-xs mt-2 text-slate-400">ถ้าเป็นชื่อหน้า: ลองคำอื่น หรือให้แอดมินเพิ่ม “คำค้นเพิ่ม” ให้เมนูนั้นที่ จัดการเมนู</p>
              )}
            </div>
          ) : (
            <>
              {sections.map((sec) => (
                <div key={sec.key}>
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                    {sec.title} <span className="text-slate-300">· {sec.hits.length}</span>
                  </div>
                  {sec.hits.map(hit => {
                    const idx = flat.indexOf(hit);
                    const isActive = idx === activeIdx;
                    const cfg = entityCfg(hit.entity_type);
                    return (
                      <div key={`${sec.key}-${hit.entity_type}-${hit.id}`} data-idx={idx}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`flex items-start gap-3 border-b border-slate-50 transition-colors ${isActive ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <button type="button" onClick={() => goTo(hit)}
                          className="flex-1 min-w-0 text-left px-4 py-2.5 flex items-start gap-3">
                          <span className="text-lg leading-none mt-0.5 flex-shrink-0">{cfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${cfg.color}`}>{highlight(hit.label, query)}</div>
                            {hit.sublabel && (
                              <div className="text-xs text-slate-500 truncate">
                                {sec.removable && <span className="text-slate-400">{cfg.label} · </span>}
                                {highlight(hit.sublabel, query)}
                              </div>
                            )}
                          </div>
                          {isActive && <span className="text-[10px] text-slate-400 mt-1">↵</span>}
                        </button>
                        {sec.removable && (
                          <button type="button" title="เอาออกจากรายการล่าสุด"
                            onClick={(e) => { e.stopPropagation(); forget(hit.id); }}
                            className="self-center mr-3 w-6 h-6 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 text-xs">✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
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
          <span>{scope ? `${scope.label} · Ctrl+K` : "Global Search · ค้นข้ามโมดูล"}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
