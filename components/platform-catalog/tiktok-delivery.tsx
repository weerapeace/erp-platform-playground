"use client";
/**
 * ตัวเลือกการจัดส่งของสินค้าบน TikTok — "ใช้ค่าเริ่มต้นของร้าน" หรือ "กำหนดเองสำหรับสินค้านี้" (ติ๊กแบบจัดส่ง)
 * เจ้าของสั่ง 2026-11-13 "ทำทั้ง 2 อย่าง" · ใช้ในลิ้นชักสินค้าบนร้าน (แท็บข้อมูล) + หน้าลงฉบับร่าง
 *
 *   <TiktokDeliveryBox by={{ listingId }} value={ids|null} base={ids|null} baseNames can onChange weightKg />
 *   value null = ใช้ค่าเริ่มต้นของร้าน · แก้แล้ว = ฟอร์มเปลี่ยนเฉย ๆ (ส่งตอนกดบันทึกของหน้านั้น)
 * ข้อมูล: GET /api/tiktok-shop/delivery-options (แคช 10 นาที) · กฎ: lib/tiktok-delivery
 * ของกลางที่ใช้: Icon · LoadingState
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { sameDelivery, type TtsDeliveryOption, type TtsDeliveryValue } from "@/lib/tiktok-delivery";

type By = { listingId?: string | null; brandId?: string | null };
type Resp = { options: TtsDeliveryOption[] | null; limits?: TtsDeliveryOption[] | null; error: string | null };
const qs = (by: By) => (by.listingId ? `listing_id=${encodeURIComponent(by.listingId)}` : by.brandId ? `brand_id=${encodeURIComponent(by.brandId)}` : "");

/** แบบจัดส่งของร้าน (โหลดครั้งเดียวต่อร้าน/รายการ) */
export function useTiktokDeliveryOptions(by: By) {
  const key = qs(by);
  const [st, setSt] = useState<{ key: string; data: Resp | null; loading: boolean }>({ key: "", data: null, loading: false });
  const load = useCallback(async (fresh = false) => {
    if (!key) return;
    setSt((s) => ({ ...s, key, loading: true }));
    try {
      const r = await apiFetch(`/api/tiktok-shop/delivery-options?${key}${fresh ? "&fresh=1" : ""}`);
      setSt({ key, data: await r.json().catch(() => ({ options: null, error: `HTTP ${r.status}` })) as Resp, loading: false });
    } catch { setSt({ key, data: { options: null, error: "โหลดตัวเลือกการจัดส่งไม่สำเร็จ" }, loading: false }); }
  }, [key]);
  useEffect(() => { if (key && st.key !== key) void load(); }, [key, st.key, load]);
  const mine = st.key === key;
  return { options: mine ? st.data?.options ?? null : null, limits: mine ? st.data?.limits ?? null : null, error: mine ? st.data?.error ?? null : null, loading: !mine || st.loading, reload: () => load(true) };
}

export function TiktokDeliveryBox({ by, value, base, baseNames, can, onChange, weightKg }: {
  by: By; value: TtsDeliveryValue; base: TtsDeliveryValue; baseNames?: Record<string, string>;
  can: boolean; onChange: (v: TtsDeliveryValue) => void; weightKg?: number | null;
}) {
  const d = useTiktokDeliveryOptions(by);
  const changed = !sameDelivery(base, value);
  const custom = value != null;
  const limitOf = (id: string) => d.limits?.find((o) => o.id === id)?.maxWeightKg ?? null;
  const shopDefault = (d.limits ?? []).map((o) => o.name);
  const toggle = (id: string) => { const cur = value ?? []; onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); };
  // เปลี่ยนเป็นกำหนดเอง: เริ่มจากแบบที่ร้านใช้อยู่ (ถ้ารู้) ไม่งั้นแบบแรก
  const goCustom = () => onChange(base ?? (d.limits?.length ? d.limits.map((o) => o.id).filter((id) => d.options?.some((o) => o.id === id)) : d.options?.slice(0, 1).map((o) => o.id) ?? []));
  return (
    <div className={`rounded-xl border p-3 ${changed ? "border-violet-300" : "border-slate-200"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        <Icon name="truck" />ตัวเลือกการจัดส่ง
        {changed && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-normal text-violet-700">แก้แล้ว — ยังไม่ส่ง</span>}
        <button type="button" disabled={d.loading} onClick={() => void d.reload()} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-normal text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" />โหลดใหม่</button>
      </div>
      {!can ? (
        <p className="text-sm text-slate-700">{value == null ? "ใช้ค่าเริ่มต้นของร้าน" : value.map((id) => d.options?.find((o) => o.id === id)?.name ?? baseNames?.[id] ?? `#${id}`).join(", ")}</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="radio" checked={!custom} onChange={() => onChange(null)} className="mt-1 accent-violet-600" />
            <span>ใช้ค่าเริ่มต้นของร้าน<span className="block text-[11px] text-slate-400">ตามที่ตั้งในคลังสินค้าบน TikTok{shopDefault.length ? ` — ตอนนี้: ${shopDefault.join(", ")}` : ""}</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="radio" checked={custom} onChange={goCustom} disabled={!d.options?.length && !base} className="mt-1 accent-violet-600" />
            <span>กำหนดเองสำหรับสินค้านี้</span>
          </label>
          {custom && (
            <div className="ml-6 space-y-1">
              {d.loading && !d.options ? <LoadingState label="กำลังโหลดแบบจัดส่งจาก TikTok…" className="py-2" />
                : d.error && !d.options ? <p className="text-xs text-rose-600">{d.error}</p>
                : (d.options ?? []).length === 0 ? <p className="text-xs text-slate-500">ร้านนี้ไม่มีแบบจัดส่งที่กำหนดต่อสินค้าได้</p>
                : (d.options ?? []).map((o) => {
                  const max = limitOf(o.id);
                  const over = max != null && weightKg != null && weightKg > max;
                  return (
                    <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50">
                      <input type="checkbox" checked={value!.includes(o.id)} onChange={() => toggle(o.id)} className="mt-1 h-4 w-4 accent-violet-600" />
                      <span className="min-w-0">
                        <span className="text-slate-800">{o.name}</span>
                        {o.typeLabel && o.typeLabel !== o.name && <span className="ml-1 text-[11px] text-slate-400">{o.typeLabel}</span>}
                        {max != null && <span className={`ml-1 text-[11px] ${over ? "text-amber-700" : "text-slate-400"}`}>· ≤ {max} กก.{over ? " (กล่องหนักเกิน)" : ""}</span>}
                        {o.description && <span className="block text-[11px] text-slate-400">{o.description}</span>}
                      </span>
                    </label>
                  );
                })}
              {value!.length === 0 && <p className="text-xs text-rose-600">เลือกอย่างน้อย 1 แบบ</p>}
            </div>
          )}
          {changed && <button type="button" onClick={() => onChange(base)} className="text-xs text-slate-500 hover:underline">คืนค่าเดิม</button>}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">ลูกค้าเห็นเฉพาะแบบที่เปิดไว้ · มีผลกับออเดอร์ใหม่ · ไม่แตะสต๊อก/ราคา{can ? " · ส่งพร้อมปุ่มบันทึก" : ""}</p>
    </div>
  );
}
