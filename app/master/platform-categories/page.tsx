"use client";

/**
 * /master/platform-categories — จับคู่หมวดหมู่แพลตฟอร์ม (เฟส 1 ออกแบบใหม่)
 * ซ้าย = "หมวดกลาง" ชุดใหม่ (owner สร้างเอง — platform_central_categories)
 * ขวา = แต่ละร้านเลือกหมวดจาก dropdown (platform_category_options · นำเข้าไฟล์ต่อร้าน)
 * layout /master ครอบ PlaygroundShell ให้แล้ว — หน้านี้ไม่ต้องครอบเอง
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type Cat = { id: string; name: string };
type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Mapping = { central_category_id: string; platform_id: string; platform_category_path: string | null };
type Opt = { external_id: string; name_en: string; name_th: string };

const ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", tiktok_shop: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", line_shopping: "💚", youtube: "▶️", pinterest: "📌", x: "✖️" };
const key = (c: string, p: string) => `${c}:${p}`;

// dropdown ค้นหาหมวดของร้าน (โหลด options ตอนเปิด/พิมพ์)
function OptionPicker({ platformId, value, onPick }: { platformId: string; value: string; onPick: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/api/platform-category-options?platform_id=${platformId}&search=${encodeURIComponent(q)}&limit=40`).then((r) => r.json())
        .then((j) => setOpts((j.categories ?? []) as Opt[])).catch(() => setOpts([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, platformId]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 text-sm text-left border border-slate-200 rounded-lg bg-white hover:border-indigo-300 flex items-center justify-between gap-2">
        <span className={`truncate ${value ? "text-slate-700" : "text-slate-400"}`}>{value || "— เลือกหมวดของร้านนี้ —"}</span>
        <span className="text-slate-400 text-xs shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-1.5 border-b border-slate-100"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาหมวด…" className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400" /></div>
          <div className="max-h-56 overflow-y-auto py-1">
            {value && <button type="button" onClick={() => { onPick(""); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50">✕ ล้างการเลือก</button>}
            {loading ? <div className="px-3 py-3 text-xs text-slate-400 text-center">กำลังโหลด…</div>
              : opts.length === 0 ? <div className="px-3 py-3 text-xs text-slate-400 text-center">— ไม่พบหมวด —<br />นำเข้าไฟล์หมวดของร้านนี้ก่อน</div>
                : opts.map((o) => {
                  const label = `${o.external_id} · ${o.name_th || o.name_en}`;
                  return (
                    <button key={o.external_id} type="button" onClick={() => { onPick(label); setOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 truncate">
                      {o.name_th || o.name_en} <span className="text-[10px] text-slate-400">#{o.external_id}</span>
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlatformCategoryMapPage() {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});   // catId:pfId → path
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});   // pfId → path
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch("/api/platform-category-map").then((r) => r.json());
      setCats((j.categories ?? []) as Cat[]);
      setPlatforms((j.platforms ?? []) as Platform[]);
      const m: Record<string, string> = {};
      for (const row of (j.mappings ?? []) as Mapping[]) if (row.platform_category_path) m[key(row.central_category_id, row.platform_id)] = row.platform_category_path;
      setMap(m);
    } catch { toast.error("โหลดข้อมูลไม่สำเร็จ"); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const pick = (catId: string) => { setSel(catId); const d: Record<string, string> = {}; for (const p of platforms) d[p.id] = map[key(catId, p.id)] ?? ""; setDraft(d); };
  const mappedCount = useCallback((catId: string) => platforms.reduce((n, p) => n + (map[key(catId, p.id)] ? 1 : 0), 0), [platforms, map]);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? cats.filter((c) => c.name.toLowerCase().includes(s)) : cats; }, [cats, q]);

  const addCat = async () => {
    const name = newCat.trim(); if (!name) return;
    setAddingCat(true);
    try {
      const res = await apiFetch("/api/platform-central-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      setNewCat(""); setCats((c) => [...c, j.data as Cat]); toast.success("เพิ่มหมวดกลางแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); } finally { setAddingCat(false); }
  };
  const delCat = async (id: string, name: string) => {
    if (!window.confirm(`ลบหมวดกลาง “${name}”? (การจับคู่ของหมวดนี้จะถูกลบด้วย)`)) return;
    try {
      const res = await apiFetch(`/api/platform-central-categories?id=${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error);
      setCats((c) => c.filter((x) => x.id !== id)); if (sel === id) setSel(null); toast.success("ลบแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const save = async () => {
    if (!sel) return; setSaving(true);
    try {
      const entries = platforms.map((p) => ({ platform_id: p.id, path: (draft[p.id] ?? "").trim() }));
      const res = await apiFetch("/api/platform-category-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ central_category_id: sel, entries }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setMap((prev) => { const n = { ...prev }; for (const p of platforms) { const v = (draft[p.id] ?? "").trim(); if (v) n[key(sel, p.id)] = v; else delete n[key(sel, p.id)]; } return n; });
      toast.success("บันทึกการจับคู่แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  const selCat = cats.find((c) => c.id === sel) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-5 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🗂️ จับคู่หมวดหมู่แพลตฟอร์ม</h1>
        <p className="text-sm text-slate-500 mt-1">สร้าง “หมวดกลาง” ของเราเอง → จับคู่กับหมวดของแต่ละร้าน (เลือกจากรายการที่นำเข้าไว้)</p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-16 text-center">กำลังโหลด…</div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          {/* ซ้าย: หมวดกลาง (สร้างเอง) */}
          <div className="md:w-80 flex-shrink-0 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[72vh]">
            <div className="p-2 border-b border-slate-100 space-y-1.5">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ค้นหาหมวดกลาง… (${cats.length})`}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              <div className="flex gap-1.5">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addCat(); }} placeholder="+ ชื่อหมวดกลางใหม่…"
                  className="flex-1 h-9 px-3 text-sm border border-emerald-200 rounded-lg bg-emerald-50/40 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                <button type="button" onClick={addCat} disabled={addingCat || !newCat.trim()}
                  className="h-9 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">เพิ่ม</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-6">— ยังไม่มีหมวดกลาง — พิมพ์ด้านบนเพื่อเพิ่ม</div>}
              {filtered.map((c) => {
                const n = mappedCount(c.id);
                const active = sel === c.id;
                return (
                  <div key={c.id} className={`group flex items-center gap-2 px-3 py-2 border-b border-slate-50 cursor-pointer ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`} onClick={() => pick(c.id)}>
                    <span className={`flex-1 text-sm truncate ${active ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{c.name}</span>
                    {n > 0
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">{n}/{platforms.length}</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap">ยังไม่จับ</span>}
                    <button type="button" onClick={(e) => { e.stopPropagation(); void delCat(c.id, c.name); }} title="ลบหมวดกลาง"
                      className="w-5 h-5 rounded text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ขวา: จับคู่ต่อร้าน (dropdown) */}
          <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            {!selCat ? (
              <div className="text-sm text-slate-400 py-20 text-center">← เลือกหมวดกลางทางซ้าย (หรือเพิ่มใหม่) เพื่อจับคู่กับแต่ละร้าน</div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="text-sm font-semibold text-slate-800">หมวดกลาง: {selCat.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">เลือกหมวดของแต่ละร้านจาก dropdown (เว้นว่าง = ไม่จับคู่ร้านนั้น)</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {platforms.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-32 flex-shrink-0 text-sm text-slate-700 truncate">{p.icon_key || ICON[p.code] || "🏬"} {p.name_th}</span>
                      <OptionPicker platformId={p.id} value={draft[p.id] ?? ""} onPick={(path) => setDraft((d) => ({ ...d, [p.id]: path }))} />
                    </div>
                  ))}
                  {platforms.length === 0 && <div className="text-xs text-slate-400 text-center py-6">ยังไม่มีแพลตฟอร์มที่เปิดใช้</div>}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
                  <button type="button" onClick={save} disabled={saving}
                    className="h-9 px-5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกการจับคู่"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
