"use client";

/**
 * SkuImagePicker (ของกลาง) — เลือกสินค้า (SKU) แบบกริดมีรูป + ค้นหา
 * ใช้ที่ไหนก็ได้: <SkuImagePicker open onClose onPick={(sku)=>...} />
 * ดึงจาก /api/master-v2/skus (ค้นหาฝั่ง server) — เลือกได้ครั้งละ 1 ตัว
 */
import { useState, useEffect, useCallback } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

export type PickedSku = { id: string; code: string | null; name: string; image_key: string | null };

const img = (k: string | null | undefined) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);

export function SkuImagePicker({ open, onClose, onPick, title = "เลือกสินค้า" }: {
  open: boolean;
  onClose: () => void;
  onPick: (sku: PickedSku) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickedSku[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const sp = search ? `&search=${encodeURIComponent(search)}` : "";
      const j = await apiFetch(`/api/master-v2/skus?limit=48${sp}`).then(r => r.json());
      setRows(((j.data ?? []) as Record<string, unknown>[]).map(s => ({
        id: String(s.id),
        code: (s.code as string) ?? null,
        name: String(s.name_th || s.code || ""),
        image_key: (s.cover_image_r2_key as string) ?? null,
      })));
    } catch { setRows([]); } finally { setLoading(false); }
  }, []);

  // โหลด/ค้นหา (debounce) ตอนเปิด
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void fetchRows(q); }, 300);
    return () => clearTimeout(t);
  }, [open, q, fetchRows]);

  // เคลียร์คำค้นทุกครั้งที่เปิดใหม่
  useEffect(() => { if (open) setQ(""); }, [open]);

  return (
    <ERPModal open={open} onClose={onClose} size="xl" title={title}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า (ชื่อ/รหัส)..."
        className="w-full h-10 px-3 mb-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-slate-300 text-sm">ไม่พบสินค้า</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[55vh] overflow-auto">
          {rows.map(s => (
            <button key={s.id} type="button" onClick={() => onPick(s)}
              className="text-left bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
              <div className="aspect-square bg-slate-50 flex items-center justify-center">
                {img(s.image_key)
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(s.image_key)!} alt="" className="w-full h-full object-cover" />
                  : <span className="text-slate-300 text-2xl">📦</span>}
              </div>
              <div className="p-2">
                <div className="text-xs font-medium text-slate-800 line-clamp-2">{s.name}</div>
                {s.code && <div className="text-[10px] font-mono text-slate-400 truncate">{s.code}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
