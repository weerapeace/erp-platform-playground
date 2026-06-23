"use client";

/**
 * จัดการแบรนด์ & ช่างเหมา (สำหรับโกดัง QC / บอร์ดจ่ายงาน)
 * - แบรนด์: ตั้งสีประจำแบรนด์ (สีการ์ด) + ธง "งานลูกค้า" (→ badge งานลูกค้า)
 * - ช่างเหมา: ติดธงพนักงานที่เป็นช่างเหมา (→ badge งานเหมา บนงานรอ QC)
 */
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Brand } from "@/app/api/brands/route";
import type { Subcontractor } from "@/app/api/qc-warehouse/subcontractors/route";

export default function BrandsPage() {
  const canView = usePermission("products.view");
  const toast = useToast();
  const [tab, setTab] = useState<"brands" | "subs">("brands");

  const [brands, setBrands] = useState<Brand[]>([]);
  const [newBrand, setNewBrand] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);   // กำลังแก้ชื่อแบรนด์ไหน
  const [editName, setEditName] = useState("");
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [subSearch, setSubSearch] = useState("");

  const loadBrands = useCallback(async () => {
    try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ }
  }, []);
  const loadSubs = useCallback(async () => {
    try { const r = await apiFetch("/api/qc-warehouse/subcontractors"); const j = await r.json(); setSubs(j.data ?? []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadBrands(); void loadSubs(); }, [loadBrands, loadSubs]);

  const patchBrand = async (id: string, p: Partial<Brand>) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, ...p } : b));
    try { const r = await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) }); const j = await r.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void loadBrands(); }
  };
  const addBrand = async () => {
    const name = newBrand.trim(); if (!name) return;
    try { const r = await apiFetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await r.json(); if (j.error) throw new Error(j.error); setNewBrand(""); toast.success("เพิ่มแบรนด์แล้ว"); await loadBrands(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  };
  const saveRename = async (id: string) => {
    const name = editName.trim();
    setEditingId(null);
    const cur = brands.find((b) => b.id === id);
    if (!name || !cur || name === cur.name) return;   // ไม่เปลี่ยน → ไม่ต้องบันทึก
    await patchBrand(id, { name });
  };
  const deleteBrand = async (id: string, name: string) => {
    if (!confirm(`ลบแบรนด์ "${name}"?\n(ซ่อนจากรายการ — ข้อมูลเดิมที่อ้างถึงแบรนด์นี้ยังอยู่)`)) return;
    setBrands((bs) => bs.filter((b) => b.id !== id));
    try { const r = await apiFetch(`/api/brands?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success("ลบแบรนด์แล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); void loadBrands(); }
  };
  const toggleSub = async (id: string, v: boolean) => {
    setSubs((ss) => ss.map((s) => s.id === id ? { ...s, is_subcontract: v } : s));
    try { const r = await apiFetch("/api/qc-warehouse/subcontractors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, is_subcontract: v }) }); const j = await r.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void loadSubs(); }
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="max-w-[900px] mx-auto px-5 py-5">
      <div className="mb-3">
        <h1 className="text-2xl font-semibold text-slate-800">🎨 แบรนด์ & ช่างเหมา</h1>
        <p className="text-sm text-slate-500 mt-0.5">ตั้งสีประจำแบรนด์ + ธง “งานลูกค้า” · ติดธง “ช่างเหมา” — ใช้แสดงสี/badge บนโกดัง QC และบอร์ดจ่ายงาน</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-4">
        <button onClick={() => setTab("brands")} className={`h-8 px-4 text-sm rounded-md ${tab === "brands" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>🎨 แบรนด์</button>
        <button onClick={() => setTab("subs")} className={`h-8 px-4 text-sm rounded-md ${tab === "subs" ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-500"}`}>🧵 ช่างเหมา</button>
      </div>

      {tab === "brands" ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 p-3 border-b border-slate-100">
            <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} placeholder="เพิ่มแบรนด์ใหม่…" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={addBrand} className="h-9 px-3 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">+ เพิ่ม</button>
          </div>
          <div className="divide-y divide-slate-50">
            {brands.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2 group">
                <span className="w-6 h-6 rounded border border-slate-200 shrink-0" style={{ background: b.color ?? "transparent" }} />
                <input type="color" value={b.color ?? "#94a3b8"} onChange={(e) => patchBrand(b.id, { color: e.target.value })} className="h-7 w-9 cursor-pointer rounded shrink-0" title="ตั้งสีแบรนด์" />
                {editingId === b.id ? (
                  <input
                    autoFocus value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveRename(b.id); if (e.key === "Escape") setEditingId(null); }}
                    onBlur={() => void saveRename(b.id)}
                    className="flex-1 h-7 px-2 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                ) : (
                  <span className="flex-1 text-sm text-slate-700 truncate cursor-text" title="คลิกดินสอเพื่อแก้ชื่อ" onDoubleClick={() => { setEditingId(b.id); setEditName(b.name); }}>{b.name}</span>
                )}
                <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer shrink-0">
                  <input type="checkbox" checked={!!b.is_customer_job} onChange={(e) => patchBrand(b.id, { is_customer_job: e.target.checked })} />
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">👤 งานลูกค้า</span>
                </label>
                <button onClick={() => { setEditingId(b.id); setEditName(b.name); }} title="แก้ชื่อ"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">✎</button>
                <button onClick={() => void deleteBrand(b.id, b.name)} title="ลบแบรนด์"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50">🗑</button>
              </div>
            ))}
            {brands.length === 0 && <div className="text-center text-sm text-slate-400 py-12">ยังไม่มีแบรนด์</div>}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-3 border-b border-slate-100">
            <input value={subSearch} onChange={(e) => setSubSearch(e.target.value)} placeholder="ค้นหาพนักงาน…" className="w-full max-w-sm h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-[11px] text-slate-400 mt-1.5">ติ๊ก = เป็นช่างเหมา → งานที่ช่างคนนี้ส่งคืนจะขึ้น badge “งานเหมา” ในโกดัง QC</p>
          </div>
          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-auto">
            {subs.filter((s) => { const q = subSearch.trim().toLowerCase(); return !q || `${s.name} ${s.code}`.toLowerCase().includes(q); }).map((s) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={s.is_subcontract} onChange={(e) => toggleSub(s.id, e.target.checked)} />
                <span className="flex-1 text-sm text-slate-700">{s.name}</span>
                {s.is_subcontract && <span className="text-[10px] rounded px-1.5 py-0.5 bg-orange-100 text-orange-700 shrink-0">🧵 ช่างเหมา</span>}
                <span className="text-[11px] text-slate-400 font-mono shrink-0">{s.code ?? ""}</span>
              </label>
            ))}
            {subs.length === 0 && <div className="text-center text-sm text-slate-400 py-12">ไม่มีพนักงาน</div>}
          </div>
        </div>
      )}
    </div>
  );
}
