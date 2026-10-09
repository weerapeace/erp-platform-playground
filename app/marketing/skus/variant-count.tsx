"use client";

/**
 * "SKU ที่เหลือ" ของรุ่น = สี/แบบที่ยังเหลือ / ทั้งหมด (ตัวเลขมากับรายการ — DB นับให้)
 *   ยังเหลือ = เปิดในระบบ (หน้า SKU) และทีมการตลาดไม่ได้ปิด
 *   กดแล้วเด้งรายการสี → สวิตช์ เปิด/ปิด ทีละสี "เฉพาะการตลาด" (สียังขาย/สั่งซื้อ/ผลิตได้ปกติ)
 *   สีที่ปิดในระบบอยู่แล้ว = ล็อก (เปิดได้ที่หน้า SKU เท่านั้น)
 *   สีปุ่ม: ครบ = เทา · เหลือบางแบบ = เหลือง · ไม่เหลือเลย = แดง
 */
import { useEffect, useState } from "react";
import { Popover } from "@/components/popover";
import { HoverImage } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { MarketingSkuVariant } from "@/lib/marketing/sku-list";

export function VariantCount({ parentId, active, total, compact = false, canManage = false, onActiveChange }: {
  parentId: string; active: number; total: number; compact?: boolean;
  canManage?: boolean;
  /** หลังกดเปิด/ปิดสี → แจ้งจำนวนที่เหลือใหม่ให้หน้ารายการอัปเดตตัวเลข */
  onActiveChange?: (parentId: string, active: number) => void;
}) {
  if (total === 0) return <span className="text-xs text-slate-400" title="รุ่นนี้ยังไม่มี SKU ย่อย">ไม่มี SKU ย่อย</span>;

  const tone = active === 0 ? "border-red-200 bg-red-50 text-red-700"
    : active < total ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-slate-200 bg-white text-slate-700";
  const text = active === 0 ? "ไม่เหลือแล้ว" : `${active}/${total} แบบ`;

  return (
    <Popover align="left" panelClassName="w-80 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
      trigger={(toggle, open) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-expanded={open}
          title={canManage ? "กดดู/เปิด-ปิด สี/แบบ" : "กดดูรายการสี/แบบ"}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium ${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${tone} hover:brightness-95`}>
          🎨 {text}<span className="opacity-50">▾</span>
        </button>
      )}>
      {() => <VariantList parentId={parentId} canManage={canManage} onActiveChange={onActiveChange} />}
    </Popover>
  );
}

function VariantList({ parentId, canManage, onActiveChange }: {
  parentId: string; canManage: boolean; onActiveChange?: (parentId: string, active: number) => void;
}) {
  const toast = useToast();
  const [variants, setVariants] = useState<MarketingSkuVariant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);   // sku id ที่กำลังบันทึก

  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/marketing/skus/variants?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json())
      .then((j) => { if (cancel) return; if (j.error) setErr(j.error); else setVariants(j.data as MarketingSkuVariant[]); })
      .catch(() => { if (!cancel) setErr("โหลดไม่สำเร็จ กรุณาลองใหม่"); });
    return () => { cancel = true; };
  }, [parentId]);

  const flip = async (v: MarketingSkuVariant) => {
    if (!v.id || saving) return;
    const open = !!v.mk_off;   // ตอนนี้ปิดอยู่ → กด = เปิด
    setSaving(v.id);
    setVariants((list) => list && list.map((x) => (x.id === v.id ? { ...x, mk_off: !open } : x)));   // ขยับสวิตช์ทันที
    try {
      const r = await apiFetch("/api/marketing/skus/variants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: v.id, open }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setVariants(j.data.variants as MarketingSkuVariant[]);
      onActiveChange?.(parentId, Number(j.data.summary?.active) || 0);
    } catch (e) {
      setVariants((list) => list && list.map((x) => (x.id === v.id ? { ...x, mk_off: open } : x)));   // ย้อนสวิตช์กลับค่าเดิม
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(null);
    }
  };

  const left = variants ? variants.filter((v) => v.is_active && !v.mk_off).length : 0;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="mb-1.5 flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-slate-700">สี/แบบของรุ่นนี้</span>
        {variants && <span className="text-slate-400">เหลือ {left} จาก {variants.length}</span>}
      </div>
      {err ? <div className="px-1 py-3 text-center text-xs text-red-600">{err}</div>
        : !variants ? <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
        : (
          <div className="space-y-0.5">
            {variants.map((v) => {
              const on = v.is_active && !v.mk_off;
              const locked = !v.is_active;   // ปิดในระบบ → เปิดจากหน้านี้ไม่ได้
              return (
                <div key={v.code} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${on ? "" : "bg-slate-50"}`}>
                  <span className={on ? "" : "opacity-40 grayscale"}><HoverImage url={r2ImageUrl(v.image_key, 80)} size={30} rounded="rounded-md" /></span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-medium ${on ? "text-slate-700" : "text-slate-400 line-through"}`}>{v.color || "-"}</div>
                    <div className="truncate text-[11px] text-slate-400">{v.code}</div>
                  </div>
                  {locked ? (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500" title="ปิดที่หน้า SKU — เปิดได้ที่หน้า SKU เท่านั้น">🔒 ปิดในระบบ</span>
                  ) : canManage ? (
                    <button type="button" role="switch" aria-checked={on} disabled={saving === v.id} onClick={() => void flip(v)}
                      title={on ? "กดเพื่อปิดสีนี้ (เฉพาะการตลาด)" : "กดเพื่อเปิดสีนี้"}
                      className="flex items-center gap-1.5 disabled:opacity-60">
                      <span className={`text-[11px] font-medium ${on ? "text-emerald-700" : "text-slate-400"}`}>{on ? "เปิด" : "ปิด"}</span>
                      <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                      </span>
                    </button>
                  ) : (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{on ? "เปิด" : "ปิด (การตลาด)"}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      <p className="mt-1.5 border-t border-slate-100 px-1 pt-1.5 text-[10px] leading-4 text-slate-400">
        เปิด/ปิดตรงนี้มีผล<b className="font-semibold">เฉพาะหน้าการตลาด</b> — สียังเปิดใบขาย/สั่งซื้อ/ผลิตได้ปกติ · 🔒 = ปิดที่หน้า SKU (ทั้งระบบ)
      </p>
    </div>
  );
}
