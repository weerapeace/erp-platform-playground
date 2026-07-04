"use client";

/**
 * /master/platform-categories — หน้าจับคู่หมวดหมู่แพลตฟอร์ม
 * ตั้งครั้งเดียว: หมวดสินค้าของเรา (product_categories) = หมวดอะไรในแต่ละร้าน (Shopee/Lazada/…)
 * → สินค้าทุกตัวในหมวดนั้นได้หมวดร้านอัตโนมัติ · เก็บใน platform_category_mappings
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type Cat = { id: string; name: string | null; display_name: string | null };
type Platform = { id: string; code: string; name_th: string; icon_key: string | null; sort_order: number | null };
type Mapping = { central_category_id: string; platform_id: string; platform_category_path: string | null };

const ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", tiktok_shop: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", line_shopping: "💚", youtube: "▶️", pinterest: "📌", x: "✖️" };
const catName = (c: Cat) => c.display_name || c.name || c.id;
const key = (catId: string, pfId: string) => `${catId}:${pfId}`;

export default function PlatformCategoryMapPage() {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});   // "catId:pfId" → path
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);          // category id ที่เลือก
  const [draft, setDraft] = useState<Record<string, string>>({}); // pfId → path (ของหมวดที่เลือก)
  const [saving, setSaving] = useState(false);

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

  // เลือกหมวด → เติม draft จาก map
  const pick = (catId: string) => {
    setSel(catId);
    const d: Record<string, string> = {};
    for (const p of platforms) d[p.id] = map[key(catId, p.id)] ?? "";
    setDraft(d);
  };

  const mappedCount = useCallback((catId: string) => platforms.reduce((n, p) => n + (map[key(catId, p.id)] ? 1 : 0), 0), [platforms, map]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cats.filter((c) => catName(c).toLowerCase().includes(s)) : cats;
  }, [cats, q]);

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const entries = platforms.map((p) => ({ platform_id: p.id, platform_category_path: (draft[p.id] ?? "").trim() }));
      const res = await apiFetch("/api/platform-category-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ central_category_id: sel, entries }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      // อัปเดต map ในเครื่อง (ไม่ต้องโหลดใหม่ทั้งหมด)
      setMap((prev) => { const n = { ...prev }; for (const p of platforms) { const v = (draft[p.id] ?? "").trim(); if (v) n[key(sel, p.id)] = v; else delete n[key(sel, p.id)]; } return n; });
      toast.success("บันทึกการจับคู่แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  const selCat = cats.find((c) => c.id === sel) ?? null;

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🗂️ จับคู่หมวดหมู่แพลตฟอร์ม</h1>
          <p className="text-sm text-slate-500 mt-1">ตั้งครั้งเดียวว่า “หมวดสินค้าของเรา” = หมวดอะไรในแต่ละร้าน → สินค้าทุกตัวในหมวดนั้นได้หมวดร้านอัตโนมัติ</p>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400 py-16 text-center">กำลังโหลด…</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4">
            {/* ซ้าย: รายการหมวดสินค้า */}
            <div className="md:w-80 flex-shrink-0 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[70vh]">
              <div className="p-2 border-b border-slate-100">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`ค้นหาหมวด… (${cats.length})`}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-6">— ไม่พบหมวด —</div>}
                {filtered.map((c) => {
                  const n = mappedCount(c.id);
                  const active = sel === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => pick(c.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-slate-50 ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                      <span className={`flex-1 text-sm truncate ${active ? "text-indigo-700 font-medium" : "text-slate-700"}`}>{catName(c)}</span>
                      {n > 0
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">{n}/{platforms.length}</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap">ยังไม่จับ</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ขวา: จับคู่ต่อร้าน */}
            <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              {!selCat ? (
                <div className="text-sm text-slate-400 py-20 text-center">← เลือกหมวดสินค้าทางซ้าย เพื่อจับคู่กับแต่ละร้าน</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div className="text-sm font-semibold text-slate-800">หมวด: {catName(selCat)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">กรอกรหัส/หมวดของแต่ละร้าน (เว้นว่าง = ไม่จับคู่ร้านนั้น)</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {platforms.map((p) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="w-32 flex-shrink-0 text-sm text-slate-700 truncate">{p.icon_key || ICON[p.code] || "🏬"} {p.name_th}</span>
                        <input value={draft[p.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                          placeholder="รหัสหมวด / พาธ ของร้านนี้"
                          className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400" />
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
    </PlaygroundShell>
  );
}
