"use client";
/**
 * เลือกหมวดหมู่ของแพลตฟอร์ม (ของกลาง) — ค้นจาก platform_category_options ที่นำเข้ามา ("📂 นำเข้าหมวดหมู่")
 * คืนค่า "id · ชื่อ" (รูปเดียวกับ category_path ของร่าง) · ใช้ที่ ตัวจัดการรายสินค้า (ProductPlatformManager) + ลิ้นชักสินค้าบนร้าน
 * ย้ายมาจากใน components/product-platform-manager (เดิมชื่อ CategoryOptionPicker)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/** "61 · กระเป๋า>กระเป๋าสะพาย" → { id: 61, name } */
export function parseCategoryLabel(label: string): { id: number | null; name: string } {
  const m = label.match(/^\s*(\d+)\s*·\s*(.*)$/);
  return m ? { id: Number(m[1]), name: m[2].trim() } : { id: null, name: label.trim() };
}

// ค้นหา + เลือกหมวดหมู่ของแพลตฟอร์ม (จาก platform_category_options ที่นำเข้ามา) — คืนค่า "id · ชื่อ"
export function PlatformCategoryPicker({ platformId, onPick, placeholder = "เลือกหมวดจาก LINE (พิมพ์ค้น เช่น กระเป๋า / bag)" }: { platformId: string; onPick: (label: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ external_id: string; name_th: string; name_en: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiFetch(`/api/platform-category-options?${new URLSearchParams({ platform_id: platformId, search: q, limit: "30" })}`).then((r) => r.json()); if (live) { setResults(j.categories ?? []); setTotal(j.total ?? 0); } }
      catch { if (live) setResults([]); } finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, platformId]);
  return (
    <div className="relative">
      <input value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder={placeholder} className="h-9 w-full border border-violet-200 rounded-md px-2 text-sm" />
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {total === 0 ? <div className="p-3 text-xs text-amber-600">ยังไม่ได้นำเข้าหมวดหมู่ของแพลตฟอร์มนี้ — กด “📂 นำเข้าหมวดหมู่” ที่หน้าสินค้าบนแพลตฟอร์มก่อน</div>
            : loading ? <div className="p-3 text-xs text-slate-400">กำลังค้นหา...</div>
            : results.length === 0 ? <div className="p-3 text-xs text-slate-400">ไม่พบหมวดที่ตรง</div>
            : results.map((c) => (
              <button key={c.external_id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(`${c.external_id} · ${c.name_th || c.name_en}`); setOpen(false); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50">
                <span className="text-slate-400 font-mono">{c.external_id}</span> {c.name_th || c.name_en}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
