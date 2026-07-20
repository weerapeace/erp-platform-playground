"use client";
/**
 * ParentSkuMultiPickerModal — ของกลาง: เลือก Parent SKU ได้หลายตัวพร้อมกัน
 *   - ค้นผ่าน /api/pickers/parent-skus (ของกลาง, เป๊ะ-first) · ไม่พิมพ์ก็ไล่ดูได้ทั้งหมด
 *   - แบ่งหน้าด้วย Pager ของกลาง → "ดูเพิ่ม" ได้ (เดิม picker เขียนเองตัดที่ 40 แล้วจบ)
 *   - ติ๊กข้ามหน้าได้ (จำที่เลือกไว้) · excludeCodes = ตัวที่มีอยู่แล้ว (ติ๊กไม่ได้)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Pager } from "@/components/pager";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";

export type ParentSkuPick = { id: string; code: string; name: string; image_key?: string | null };

const PAGE = 24;
const imgUrl = (key?: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null);

export function ParentSkuMultiPickerModal({ open, onClose, onConfirm, excludeCodes = [], title = "เลือก Parent SKU" }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: ParentSkuPick[]) => void;
  excludeCodes?: string[];
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ParentSkuPick[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Map<string, ParentSkuPick>>(new Map());   // จำข้ามหน้า (key = code)
  const already = new Set(excludeCodes);

  const load = useCallback(async (term: string, p: number) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ search: term, limit: String(PAGE), offset: String(p * PAGE) });
      const j = await apiFetch(`/api/pickers/parent-skus?${sp.toString()}`).then((r) => r.json());
      setRows((j.data ?? []) as ParentSkuPick[]);
      setTotal(Number(j.total ?? 0));
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, []);

  // พิมพ์ค้น → debounce แล้วตั้งคำค้นจริง + กลับหน้าแรกพร้อมกัน (batch เดียว ไม่ยิงซ้ำ)
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  // โหลดตามคำค้น + หน้าปัจจุบัน
  useEffect(() => { if (open) void load(term, page); }, [open, term, page, load]);
  // ปิดแล้วล้างสถานะ (เปิดใหม่เริ่มสะอาด)
  useEffect(() => { if (!open) { setQ(""); setTerm(""); setRows([]); setPicked(new Map()); setPage(0); setTotal(0); } }, [open]);

  const toggle = (r: ParentSkuPick) => setPicked((m) => {
    const n = new Map(m); if (n.has(r.code)) n.delete(r.code); else n.set(r.code, r); return n;
  });

  if (!open) return null;
  return (
    <ERPModal open onClose={onClose} title={title} size="md"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-[12px] text-slate-400">{picked.size > 0 ? `เลือกไว้ ${picked.size} รายการ` : ""}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => onConfirm([...picked.values()])} disabled={picked.size === 0}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">เพิ่ม {picked.size || ""}</button>
          </div>
        </div>
      }>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="พิมพ์รหัส/ชื่อ Parent SKU… (เว้นว่าง = ไล่ดูทั้งหมด)"
        className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      <div className="min-h-[40vh] max-h-[46vh] overflow-auto flex flex-col gap-1">
        {loading ? <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          : rows.length === 0 ? <div className="py-8 text-center text-slate-400 text-sm">ไม่พบ Parent SKU</div>
          : rows.map((r) => {
              const isAlready = already.has(r.code);
              const on = isAlready || picked.has(r.code);
              const url = imgUrl(r.image_key);
              return (
                <button key={r.id} type="button" disabled={isAlready} onClick={() => toggle(r)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left disabled:opacity-60 ${on ? "bg-indigo-50 border-indigo-300" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${on ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                  {url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={withImageWidth(url, 80) ?? url} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" />
                    : <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-300 text-xs">📦</div>}
                  <span className="font-mono text-[12px] text-slate-700">{r.code}</span>
                  <span className="text-[12px] text-slate-500 truncate flex-1">{r.name}</span>
                  {isAlready && <span className="text-[10px] text-slate-400 shrink-0">เลือกแล้ว</span>}
                </button>
              );
            })}
      </div>

      {total > PAGE && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} unitLabel="Parent SKU" />
        </div>
      )}
    </ERPModal>
  );
}
