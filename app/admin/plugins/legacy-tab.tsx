"use client";

/**
 * แท็บ "ทะเบียนเดิม" ของหน้า /admin/plugins — อ่านอย่างเดียว
 * - ข้อมูล = ตาราง erp_plugins (กรอกมือ 19 ตัว เมื่อ 2026-05-30) ผ่าน GET /api/admin/plugins
 * - 2026-11-07 เจ้าของสั่ง "เอาสวิตช์ออก": สวิตช์เปิด/ปิด + ช่อง settings ไม่มีผลกับระบบจริง (ไม่มีโค้ดไหนอ่าน enabled/settings)
 *   → เอาออก เหลือดูอย่างเดียว · ไม่แตะฐานข้อมูล (ตารางยังอยู่ครบ)
 * - แต่ละตัวบอกว่าย้ายไปเป็นชิ้นไหนในทะเบียนใหม่ (lib/shared-parts-registry.ts ช่อง legacyKey) กดแล้วเปิดรายละเอียดตัวใหม่
 * ของกลางที่ใช้: ERPModal · Icon · LoadingState / ErrorState / EmptyState · usePermission
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { ERPModal } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { SHARED_PARTS } from "@/lib/shared-parts-registry";
import type { Plugin, PluginsResponse } from "@/app/api/admin/plugins/route";

// ---- Category config ----

const CATEGORIES: { v: Plugin["category"]; label: string; color: string }[] = [
  { v: "UI",          label: "UI",          color: "bg-blue-50 text-blue-700 border-blue-200" },
  { v: "Data",        label: "Data",        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { v: "Workflow",    label: "Workflow",    color: "bg-purple-50 text-purple-700 border-purple-200" },
  { v: "Integration", label: "Integration", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { v: "Admin",       label: "Admin",       color: "bg-slate-100 text-slate-700 border-slate-300" },
];

const CAT_COLOR: Record<string, string> = CATEGORIES.reduce((a, c) => ({ ...a, [c.v]: c.color }), {});

/** รหัสทะเบียนเดิม → ชิ้นในทะเบียนใหม่ */
const NEW_BY_LEGACY = new Map(SHARED_PARTS.filter((p) => p.legacyKey).map((p) => [p.legacyKey as string, p]));

function thDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** ป้าย "ย้ายไปทะเบียนใหม่" — กดแล้วเปิดรายละเอียดตัวใหม่ */
function NewPartLink({ legacyKey, onOpenPart }: { legacyKey: string; onOpenPart?: (key: string) => void }) {
  const part = NEW_BY_LEGACY.get(legacyKey);
  if (!part) return <span className="text-[11px] text-slate-400">ยังไม่อยู่ในทะเบียนใหม่</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpenPart?.(part.key); }}
      title="เปิดรายละเอียดในทะเบียนใหม่"
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100">
      <Icon value="i:arrow-right" size={12} />
      <span className="truncate">ทะเบียนใหม่: {part.label}</span>
      {part.replacedBy && <span className="shrink-0 rounded bg-amber-100 px-1 text-amber-700">ตัวเก่า</span>}
    </button>
  );
}

// ============================================================
// Tab
// ============================================================

export function LegacyPluginsTab({ onOpenPart }: { onOpenPart?: (newPartKey: string) => void }) {
  const canView = usePermission("plugins.view");

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [filterCat, setFilterCat] = useState<Plugin["category"] | "">("");
  const [search,    setSearch]    = useState("");
  const [detail,    setDetail]    = useState<Plugin | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/plugins");
      const json: PluginsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setPlugins(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plugins.filter(p =>
      (filterCat === "" || p.category === filterCat)
      && (!q || p.label.toLowerCase().includes(q) || p.key.includes(q) || (p.description ?? "").toLowerCase().includes(q))
    );
  }, [plugins, filterCat, search]);

  const grouped = useMemo(() => {
    const g: Record<string, Plugin[]> = {};
    for (const p of filtered) (g[p.category] ??= []).push(p);
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of plugins) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [plugins]);

  const movedCount = useMemo(() => plugins.filter((p) => NEW_BY_LEGACY.has(p.key)).length, [plugins]);

  if (!canView) return <AccessDenied />;

  return (
    <>
      <div>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Icon value="i:info-circle" size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            ทะเบียนเดิม (กรอกมือไว้ในตาราง erp_plugins) — <b>ดูอย่างเดียว</b> เก็บไว้เทียบกับของเก่า
            · สวิตช์เปิด/ปิดเอาออกแล้ว เพราะไม่มีผลกับระบบจริง
            · ย้ายไปอยู่ในทะเบียนใหม่แล้ว {movedCount} จาก {plugins.length} ตัว (กดป้ายสีฟ้าเพื่อดูตัวใหม่)
            · ตัวเลขการใช้งานจริงดูที่แท็บ &quot;ของกลางในระบบ&quot;
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setFilterCat("")}
            className={`h-8 px-3 text-xs font-medium rounded-lg border ${
              filterCat === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}>
            ทั้งหมด <span className={filterCat === "" ? "opacity-80" : "text-slate-400"}>({plugins.length})</span>
          </button>
          {CATEGORIES.map(c => (
            <button key={c.v} onClick={() => setFilterCat(c.v)}
              className={`h-8 px-3 text-xs font-medium rounded-lg border ${
                filterCat === c.v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}>
              {c.label} <span className={filterCat === c.v ? "opacity-80" : "text-slate-400"}>({counts[c.v] ?? 0})</span>
            </button>
          ))}
          <div className="flex-1" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
            className="h-8 px-3 text-sm border border-slate-200 rounded-lg w-full sm:w-56" />
        </div>

        {/* Grid */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState hint={error} onRetry={load} />
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState title="ไม่พบรายการที่ตรงเงื่อนไข" hint="ลองเปลี่ยนหมวดหรือคำค้นหา" />
        ) : (
          CATEGORIES.filter(c => grouped[c.v]?.length).map(c => (
            <div key={c.v} className="mb-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${c.color}`}>{c.label}</span>
                <span className="text-xs text-slate-400">— {grouped[c.v].length} รายการ</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[c.v].map(p => (
                  <div key={p.key} onClick={() => setDetail(p)}
                    className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-start gap-2 mb-1">
                      <div className="text-2xl flex-shrink-0 leading-none">{p.icon}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 leading-tight">{p.label}</div>
                        <code className="text-[10px] text-slate-400 font-mono">{p.key}</code>
                      </div>
                    </div>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                    )}
                    <div className="mt-2"><NewPartLink legacyKey={p.key} onOpenPart={onOpenPart} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* รายละเอียด (ดูอย่างเดียว) */}
      {detail && (
        <ERPModal open onClose={() => setDetail(null)} size="lg"
          title={`${detail.icon} ${detail.label}`}
          footer={
            <button onClick={() => setDetail(null)}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ปิด</button>
          }>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <code className="font-mono bg-slate-100 px-2 py-1 rounded">{detail.key}</code>
              <span className={`px-2 py-1 rounded border ${CAT_COLOR[detail.category]}`}>{detail.category}</span>
              <span className="text-slate-400">v{detail.version}</span>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">ในทะเบียนใหม่</p>
              <NewPartLink legacyKey={detail.key} onOpenPart={(k) => { setDetail(null); onOpenPart?.(k); }} />
            </div>

            {detail.description && (
              <div className="text-sm text-slate-700">{detail.description}</div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">ใช้ที่ (กรอกมือไว้ อาจไม่ครบ — ตัวเลขจริงดูในทะเบียนใหม่)</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.used_in.map(u => (
                  <code key={u} className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">{u}</code>
                ))}
                {detail.used_in.length === 0 && <span className="text-xs text-slate-300">—</span>}
              </div>
            </div>

            {detail.permission_key && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">สิทธิ์ที่เกี่ยวข้อง</p>
                <code className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-200">{detail.permission_key}</code>
              </div>
            )}

            {detail.notes && (
              <div className="text-xs text-slate-500 bg-amber-50 border-l-4 border-amber-300 p-2.5 rounded">{detail.notes}</div>
            )}

            <div className="text-[11px] text-slate-400">กรอกไว้เมื่อ {thDate(detail.created_at)}</div>
          </div>
        </ERPModal>
      )}
    </>
  );
}
