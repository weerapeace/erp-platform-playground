"use client";

/**
 * CentralCategoryPicker (ของกลาง) — เลือก "หมวดกลางสำหรับลงขาย" (platform_central_categories)
 *   • dropdown ค้นหาได้ + ปุ่ม "➕ เพิ่มหมวดใหม่" ในตัว (สร้างแล้วเลือกให้เลย ไม่ต้องออกไปหน้าอื่น)
 *   • โหลดรายการหมวดเอง (แคชในตัว) · onChange คืน id (หรือ null เมื่อล้าง)
 * ใช้: แท็บแพลตฟอร์มของสินค้า + หน้าข้อมูลหลัก (คู่กับ Category Id)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";

// หน้าจับคู่หมวด (ของกลาง) — โหลดเฉพาะตอนเปิด popup กัน bundle หนัก
const PlatformCategoryMapper = dynamic(() => import("@/components/platform-category-mapper").then((m) => m.PlatformCategoryMapper), { ssr: false });

type Cat = { id: string; name: string };

/**
 * InlineCentralCategoryPicker — ใช้ในหน้า "ดู" (view) ของ MasterCRUD
 *   เลือกแล้วบันทึกทันที (PATCH /api/master-v2/<apiPath>/<id> field platform_category_id)
 */
export function InlineCentralCategoryPicker({
  recordId, value, apiPath = "parent-skus", field = "platform_category_id",
}: { recordId: string | null; value: string | null; apiPath?: string; field?: string }) {
  const [val, setVal] = useState<string | null>(value);
  useEffect(() => { setVal(value); }, [value]);
  const save = async (id: string | null) => {
    setVal(id);
    if (!recordId) return;
    try {
      await apiFetch(`/api/master-v2/${apiPath}/${recordId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: id }),
      });
    } catch { /* เงียบ — ผู้ใช้ลองใหม่ได้ */ }
  };
  return <CentralCategoryPicker value={val} onChange={save} className="max-w-md" />;
}

export function CentralCategoryPicker({
  value, onChange, disabled, placeholder = "— เลือกหมวดกลาง —", className = "", showMap = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  showMap?: boolean;   // แสดงปุ่ม "จับคู่หมวด" (เปิด popup หน้าจับคู่)
}) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiFetch("/api/platform-central-categories").then((r) => r.json())
      .then((j) => setCats((j.data ?? []) as Cat[])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const selected = cats.find((c) => c.id === value) ?? null;
  const qq = q.trim().toLowerCase();
  const filtered = qq ? cats.filter((c) => c.name.toLowerCase().includes(qq)) : cats;
  const exactExists = cats.some((c) => c.name.trim().toLowerCase() === qq);

  const addNew = async () => {
    const name = q.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const res = await apiFetch("/api/platform-central-categories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || "เพิ่มไม่สำเร็จ");
      const cat = j.data as Cat;
      setCats((c) => [...c, cat]);
      onChange(cat.id);
      setQ(""); setOpen(false);
    } catch { /* เงียบ — ปล่อยให้ผู้ใช้ลองใหม่ */ } finally { setAdding(false); }
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 text-sm text-left border border-slate-200 rounded-lg bg-white hover:border-indigo-300 flex items-center justify-between gap-2 disabled:opacity-50">
        <span className={`truncate ${selected ? "text-slate-700" : "text-slate-400"}`}>{selected?.name || placeholder}</span>
        <span className="text-slate-400 text-xs shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-1.5 border-b border-slate-100">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !exactExists) void addNew(); }}
              placeholder="ค้นหา / พิมพ์ชื่อหมวดใหม่…" className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {value && <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50">✕ ล้างการเลือก</button>}
            {filtered.map((c) => (
              <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 truncate ${c.id === value ? "text-indigo-600 font-medium" : "text-slate-700"}`}>
                {c.name}
              </button>
            ))}
            {filtered.length === 0 && !q.trim() && <div className="px-3 py-3 text-xs text-slate-400 text-center">ยังไม่มีหมวดกลาง — พิมพ์ชื่อเพื่อเพิ่ม</div>}
            {q.trim() && !exactExists && (
              <button type="button" onClick={() => void addNew()} disabled={adding}
                className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-slate-100 font-medium disabled:opacity-50">
                {adding ? "กำลังเพิ่ม…" : `➕ เพิ่มหมวดใหม่ “${q.trim()}”`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    {showMap && (
      <button type="button" onClick={() => setMapOpen(true)} title="จับคู่หมวด / นำเข้าหมวดของร้าน"
        className="shrink-0 h-9 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 whitespace-nowrap">🔗 จับคู่</button>
    )}
    {mapOpen && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-[200] bg-black/40 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={() => { setMapOpen(false); load(); }}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl my-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl z-10">
            <h3 className="text-base font-semibold text-slate-800">🗂️ จับคู่หมวดหมู่แพลตฟอร์ม</h3>
            <button type="button" onClick={() => { setMapOpen(false); load(); }} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>
          <div className="max-h-[82vh] overflow-y-auto">
            <PlatformCategoryMapper />
          </div>
        </div>
      </div>,
      document.body,
    )}
    </div>
  );
}
