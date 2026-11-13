"use client";
/**
 * โปรโมชันบน TikTok ของสินค้านี้ + โปรทั้งร้าน (อ่านอย่างเดียว · ไม่แก้อะไรบนร้าน) — เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 4)
 *   <TiktokPromotionsBox listingId productId skus />   (แท็บตัวเลือก & ราคา ในลิ้นชักสินค้าบนร้าน)
 * ข้อมูล: GET /api/tiktok-shop/promotions (แคช 10 นาทีต่อร้าน · ปุ่มดึงใหม่ = ข้ามแคช)
 * ⚠️ ต้องเปิดสิทธิ์ "Promotion Information" ในแอปที่ Partner Center + เชื่อมต่อใหม่ — ยังไม่เปิด = กล่องบอกวิธีเปิด
 * กฎ: lib/tiktok-promotions · ของกลางที่ใช้: Icon · LoadingState
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { tiktokPromoPeriod, tiktokPromoPrice, tiktokPromosForProduct, TTS_PRICE_PROMO_TYPES, type TtsPromo } from "@/lib/tiktok-promotions";
import type { TiktokSkuView } from "@/lib/tiktok-listing-edit";

type Resp = { promos: TtsPromo[] | null; for_product?: string[]; truncated?: boolean; fetched_at?: string; need_scope?: boolean; error: string | null };
const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const STATUS_CLS: Record<string, string> = { ONGOING: "bg-emerald-50 text-emerald-700", NOT_START: "bg-sky-50 text-sky-700" };

export function TiktokPromotionsBox({ listingId, productId, skus }: { listingId: string | null; productId: string; skus: TiktokSkuView[] }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const load = useCallback(async (fresh = false) => {
    if (!listingId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/tiktok-shop/promotions?listing_id=${encodeURIComponent(listingId)}&product_id=${encodeURIComponent(productId)}${fresh ? "&fresh=1" : ""}`);
      setData(await r.json().catch(() => ({ promos: null, error: `HTTP ${r.status}` })) as Resp);
    } catch { setData({ promos: null, error: "ดึงโปรโมชันไม่สำเร็จ — ลองใหม่" }); }
    finally { setLoading(false); }
  }, [listingId, productId]);
  useEffect(() => { void load(); }, [load]);

  const mine = data?.promos ? tiktokPromosForProduct(data.promos, productId) : [];
  const shopWide = (data?.promos ?? []).filter((p) => p.productLevel === "SHOP");
  const ongoing = mine.filter((p) => p.status === "ONGOING");
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        <Icon name="tag" />โปรโมชันบน TikTok
        {data?.promos && <span className="font-normal text-slate-400">สินค้านี้อยู่ใน {mine.length} โปร · ทั้งร้าน {data.promos.length} โปร (กำลังใช้ + ยังไม่เริ่ม)</span>}
        <button type="button" disabled={loading} onClick={() => void load(true)} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-normal text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="refresh" />{loading ? "กำลังดึง..." : "ดึงใหม่"}
        </button>
      </div>
      {loading && !data ? <LoadingState label="กำลังดึงโปรโมชันจาก TikTok…" className="py-3" />
        : data?.need_scope ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="mb-1 font-medium">ยังดึงโปรโมชันไม่ได้ — แอป TikTok ของเรายังไม่ได้เปิดสิทธิ์อ่านโปรโมชัน</div>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>เข้า TikTok Partner Center › App &amp; Service › แอป Louis Montini ERP › จัดการ API</li>
              <li>ติ๊กเปิด <b>Promotion Information</b> แล้วกด “เผยแพร่การเปลี่ยนแปลง”</li>
              <li>ในระบบ: จัดการร้าน/บัญชีแพลตฟอร์ม › TikTok › กด ตัดการเชื่อมต่อ แล้วเชื่อมต่อใหม่</li>
            </ol>
            <div className="mt-1 text-amber-800/80">อ่านอย่างเดียว — ระบบไม่สร้าง/แก้โปรโมชันบนร้าน</div>
          </div>
        )
        : data?.error ? <p className="text-xs text-rose-600">{data.error}</p>
        : data?.promos ? (
          <div className="space-y-2">
            {ongoing.length > 0 && <p className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />สินค้านี้อยู่ในโปรที่กำลังใช้ — TikTok ไม่ให้แก้ราคาระหว่างโปร (แก้ได้หลังโปรจบ หรือเอาออกจากโปรใน Seller Center)</p>}
            {!mine.length && <p className="text-xs text-slate-500">สินค้านี้ไม่ได้อยู่ในโปรลดราคาที่กำลังใช้/ยังไม่เริ่ม{data.truncated ? " (ร้านมีโปรเยอะ — ดูได้แค่ 40 รายการแรก)" : ""}</p>}
            {mine.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-100 p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-slate-800">{p.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{p.typeLabel}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLS[p.status] ?? "bg-slate-100 text-slate-500"}`}>{p.statusLabel}</span>
                  <span className="text-[11px] text-slate-400">{tiktokPromoPeriod(p)}</span>
                </div>
                {TTS_PRICE_PROMO_TYPES.has(p.type) && skus.length > 0 && (
                  <div className="mt-1.5 grid gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-2">
                    {skus.map((s) => {
                      const price = tiktokPromoPrice(p, productId, s.skuId, s.price);
                      return (
                        <div key={s.skuId} className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-slate-500" title={s.label}>{s.label}</span>
                          <span className="text-slate-400 line-through">{baht(s.price)}</span>
                          <span className={price != null ? "font-medium text-emerald-700" : "text-slate-300"}>{price != null ? baht(price) : "ไม่อยู่ในโปร"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {p.detail && <p className="mt-1 text-[11px] text-slate-500">{p.detail}</p>}
              </div>
            ))}
            {shopWide.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowShop((x) => !x)} className="text-xs text-violet-700 hover:underline">{showShop ? "ซ่อนโปรทั้งร้าน" : `โปรทั้งร้าน (${shopWide.length}) เช่น ส่วนลดค่าส่ง`}</button>
                {showShop && (
                  <ul className="mt-1 space-y-1 text-[11px]">
                    {shopWide.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-1.5 rounded border border-slate-100 px-2 py-1">
                        <span className="font-medium text-slate-700">{p.title}</span>
                        <span className="text-slate-500">{p.typeLabel}</span>
                        <span className={`rounded-full px-1.5 ${STATUS_CLS[p.status] ?? "bg-slate-100 text-slate-500"}`}>{p.statusLabel}</span>
                        {p.detail && <span className="text-slate-500">· {p.detail}</span>}
                        <span className="text-slate-400">· {tiktokPromoPeriod(p)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-400">อ่านอย่างเดียว — สร้าง/แก้โปรใน TikTok Seller Center · ราคาหลังโปรคิดจากราคาบนร้านตอนนี้{data.fetched_at ? ` · ข้อมูล ${new Date(data.fetched_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
          </div>
        ) : null}
    </div>
  );
}
