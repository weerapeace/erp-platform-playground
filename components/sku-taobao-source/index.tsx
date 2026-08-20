"use client";

/**
 * SkuTaobaoSource — ของกลาง: แถบ "🛒 มาจาก Taobao" ในหน้า SKU
 *
 * เปิดหน้า SKU (จอรายละเอียด/ฟอร์มแก้ไข) แล้วเห็นว่าสินค้าตัวนี้มาจากรายการไหนในกล่องพัก Taobao
 * — รูป + ชื่อจีน + ราคา ¥ + ปุ่มเปิดหน้าร้านจริง เป็นลิงก์ย้อนกลับของคู่ "กล่องพัก ↔ SKU"
 *
 * ไม่มีรายการที่ผูกไว้ = ไม่โชว์อะไรเลย (ไม่รกหน้า SKU ทั่วไป)
 *
 * ใช้ที่: MasterRecordDrawer (moduleKey=skus-v2), หน้า /master/skus, ฟอร์มแก้ไขสินค้า
 * ของกลางที่ใช้: apiFetch · HoverPreview · useToast · r2ImageUrl
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HoverPreview } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";

type Row = {
  id: string;
  original_name: string | null;
  translated_name: string | null;
  price_text: string | null;
  price_rmb: number | null;
  taobao_url: string | null;
  image_url: string | null;
  status: "new" | "matched" | "rejected";
};

const imgSrc = (v: string | null, w: number) => (!v ? null : v.startsWith("http") ? v : r2ImageUrl(v, w));
const fmtRmb = (n: number | null) => (n == null ? null : `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);

export function SkuTaobaoSource({ skuId, onCoverChanged }: {
  skuId: string;
  onCoverChanged?: () => void;   // ตั้งรูปปกจากรูป Taobao แล้ว → ให้ parent รีโหลดรูปสินค้า
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!skuId) return;
    try {
      const res = await apiFetch(`/api/taobao-products?matched_sku_id=${encodeURIComponent(skuId)}&limit=10`);
      const j = await res.json();
      setRows(Array.isArray(j.data) ? (j.data as Row[]) : []);
    } catch { /* เงียบ — เป็นข้อมูลเสริม ไม่ควรทำให้หน้า SKU พัง */ }
  }, [skuId]);

  useEffect(() => { void load(); }, [load]);

  // ใช้รูปจาก Taobao เป็นรูปปกสินค้า (ทับของเดิมได้ — ผู้ใช้สั่งเอง)
  const useAsCover = async (row: Row) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/taobao-products", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, use_image_for_sku: true }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success("ตั้งเป็นรูปปกสินค้าแล้ว");
      onCoverChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ตั้งรูปปกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
      <p className="text-[12px] font-medium text-amber-800 mb-2">🛒 มาจาก Taobao ({rows.length})</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex gap-3 items-start bg-white rounded-lg border border-amber-100 p-2">
            <HoverPreview url={imgSrc(r.image_url, 720)} previewW={480}>
              <div className="w-14 h-14 shrink-0 rounded border border-slate-100 bg-white flex items-center justify-center overflow-hidden">
                {r.image_url
                  ? <img src={imgSrc(r.image_url, 160) ?? ""} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                  : <span className="text-slate-200 text-lg">🛒</span>}
              </div>
            </HoverPreview>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-slate-700 line-clamp-1">{r.translated_name || "(ยังไม่มีชื่อไทย)"}</p>
              {r.original_name && <p className="text-[11px] text-slate-400 line-clamp-1">{r.original_name}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-[12px] text-rose-600">{fmtRmb(r.price_rmb) ?? r.price_text ?? "—"}</span>
                {r.taobao_url && (
                  <a href={r.taobao_url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] px-2 py-0.5 rounded border border-orange-200 text-orange-700 hover:bg-orange-50">
                    เปิดหน้า Taobao ↗
                  </a>
                )}
                {r.image_url && (
                  <button onClick={() => void useAsCover(r)} disabled={busy}
                    className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    title="ใช้รูปนี้เป็นรูปปกของสินค้า (ทับรูปเดิม)">
                    🖼 ใช้รูปนี้เป็นรูปปก
                  </button>
                )}
                <a href={`/master/skus?taobao=1&tb_status=${r.status}&focus=${r.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline">ดูในกล่องพัก</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkuTaobaoSource;
