"use client";

/**
 * ParentWebListings — แท็บ "🛍 เว็บไซต์" ใน Parent SKU (drawer + หน้าเต็ม)
 * แก้ข้อมูลบนเว็บร้านออนไลน์ได้เลยในแท็บ: ทุกร้านในที่เดียว
 *   - เปิด/ปิดขึ้นร้าน · แนะนำ · ราคาเว็บ · ชื่อเว็บ · คำอธิบายเว็บ · รูปเว็บ (รุ่น + รายสี)
 *   - เว้นว่าง = ใช้ของ ERP ตามเดิม
 * ของกลาง: AssetPicker (เลือกรูปจากคลัง) · /api/parent-web-listings (guardApi products.edit + audit)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow } from "@/app/api/assets/shared";

type Variant = { id: string; code: string; label: string; price: number; qty: number; erpImageKey: string | null };
type ShopState = {
  shopId: string;
  shopName: string;
  slug: string;
  isDefault: boolean;
  listed: boolean;
  published: boolean;
  featured: boolean;
  webPrice: number | null;
  webName: string;
  webDescription: string;
  webImages: string[];
  webSkuImages: Record<string, string>;
  soldQty: number;
  productUrl: string;
};
type Resp = { code: string; parentName: string; erpDescription: string | null; adminUrl: string; variants: Variant[]; shops: ShopState[] };

const keyUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export function ParentWebListings({ parentId }: { parentId: string | null }) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState<string | null>(null);
  // ตัวเลือกรูป: กำลังเลือกให้ร้านไหน + เป้าหมาย (gallery = รูปรุ่น, หรือ sku id)
  const [picker, setPicker] = useState<{ shopId: string; target: "gallery" | string } | null>(null);

  const load = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`);
      const j = await r.json();
      setData(j?.shops ? (j as Resp) : null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const patchShop = (shopId: string, p: Partial<ShopState>) =>
    setData((d) => (d ? { ...d, shops: d.shops.map((s) => (s.shopId === shopId ? { ...s, ...p } : s)) } : d));

  const addToShop = async (shopId: string) => {
    if (!parentId) return;
    setSavingShop(shopId);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, shopId, action: "add" }),
      });
      if ((await r.json()).ok) { patchShop(shopId, { listed: true }); toast.success("เพิ่มเข้าร้านแล้ว (ยังปิดอยู่)"); }
      else toast.error("เพิ่มไม่สำเร็จ");
    } catch { toast.error("เชื่อมต่อไม่ได้"); }
    setSavingShop(null);
  };

  const saveShop = async (s: ShopState) => {
    if (!parentId) return;
    setSavingShop(s.shopId);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId, shopId: s.shopId,
          patch: {
            isPublished: s.published, featured: s.featured, webPrice: s.webPrice,
            webName: s.webName, webDescription: s.webDescription,
            webImages: s.webImages, webSkuImages: s.webSkuImages,
          },
        }),
      });
      if ((await r.json()).ok) toast.success(`บันทึก ${s.shopName} แล้ว`);
      else toast.error("บันทึกไม่สำเร็จ");
    } catch { toast.error("เชื่อมต่อไม่ได้"); }
    setSavingShop(null);
  };

  const onPickImages = (assets: AssetRow[]) => {
    if (!picker || !data) return;
    const keys = assets.map((a) => a.r2_key).filter(Boolean);
    const s = data.shops.find((x) => x.shopId === picker.shopId);
    if (!s || !keys.length) { setPicker(null); return; }
    if (picker.target === "gallery") {
      patchShop(s.shopId, { webImages: [...s.webImages, ...keys].slice(0, 12) });
    } else {
      patchShop(s.shopId, { webSkuImages: { ...s.webSkuImages, [picker.target]: keys[0] } });
    }
    setPicker(null);
  };

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกรุ่นก่อน แล้วค่อยตั้งค่าการขายบนเว็บ</div>;
  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div>;
  if (!data) return <div className="text-sm text-slate-400 py-8 text-center">โหลดข้อมูลไม่สำเร็จ</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          ตั้งค่าการขายบนเว็บร้านออนไลน์ — เว้นว่าง = ใช้ชื่อ/รูป/คำอธิบายจาก ERP อัตโนมัติ
        </p>
        <a href={data.adminUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
          หลังบ้านร้าน (จัดการรวม) ↗
        </a>
      </div>

      {data.shops.map((s) => (
        <div key={s.shopId} className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{s.shopName}</span>
            {s.isDefault && <span className="text-[11px] text-slate-400">(ร้านหลัก)</span>}
            {s.listed && s.published && s.productUrl && (
              <a href={s.productUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-blue-600 hover:underline">ดูหน้าเว็บ ↗</a>
            )}
          </div>

          {!s.listed ? (
            <div className="px-3 py-4 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-slate-400">ยังไม่ได้ขายรุ่นนี้ในร้านนี้</span>
              <button onClick={() => addToShop(s.shopId)} disabled={savingShop === s.shopId}
                className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-full px-3 py-1.5">
                {savingShop === s.shopId ? "กำลังเพิ่ม…" : "+ เพิ่มเข้าร้านนี้"}
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <Toggle label="ขึ้นร้าน" on={s.published} onClick={() => patchShop(s.shopId, { published: !s.published })} />
                <button onClick={() => patchShop(s.shopId, { featured: !s.featured })}
                  className={`text-sm flex items-center gap-1 ${s.featured ? "text-amber-500" : "text-slate-400"}`}>
                  <span className="text-lg leading-none">★</span> แนะนำ
                </button>
                <span className="text-xs text-slate-400 ml-auto">ขายผ่านเว็บ {s.soldQty} ชิ้น</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <Field label={`ชื่อบนเว็บ (ว่าง = ${data.parentName})`} value={s.webName} onChange={(v) => patchShop(s.shopId, { webName: v })} placeholder={data.parentName} />
                <NumField label="ราคาเว็บ (ว่าง = ราคาปกติ)" value={s.webPrice} onChange={(v) => patchShop(s.shopId, { webPrice: v })} />
              </div>
              <Field textarea label="คำอธิบายบนเว็บ (ว่าง = ใช้จาก ERP)" value={s.webDescription} onChange={(v) => patchShop(s.shopId, { webDescription: v })} placeholder={data.erpDescription ?? "—"} />

              {/* รูปเว็บ (รุ่น) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600">รูปบนเว็บ ({s.webImages.length}) — ว่าง = ใช้รูป ERP</span>
                  <button onClick={() => setPicker({ shopId: s.shopId, target: "gallery" })}
                    className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2.5 py-1">🖼 เลือกรูปจากคลัง</button>
                </div>
                {s.webImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.webImages.map((k, i) => (
                      <div key={`${k}-${i}`} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={keyUrl(k)} alt="" className={`w-14 h-14 object-cover rounded-lg border ${i === 0 ? "border-orange-400 ring-1 ring-orange-300" : "border-slate-200"}`} />
                        {i === 0 && <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-orange-500 text-white rounded px-1">ปก</span>}
                        <button onClick={() => patchShop(s.shopId, { webImages: s.webImages.filter((_, j) => j !== i) })}
                          className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-4 h-4 text-[10px] leading-none opacity-0 group-hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* รูปเว็บรายสี */}
              {data.variants.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1.5">ตัวเลือก (สี) — {data.variants.length} แบบ · ตั้งรูปเว็บรายสีได้</div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {data.variants.map((v) => {
                      const webKey = s.webSkuImages[v.id] ?? null;
                      const thumb = webKey ? keyUrl(webKey) : v.erpImageKey ? keyUrl(v.erpImageKey) : null;
                      return (
                        <div key={v.id} className="flex items-center gap-2.5 p-2 bg-white">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className={`w-10 h-10 rounded object-cover bg-slate-100 shrink-0 ${webKey ? "ring-1 ring-orange-300 border border-orange-400" : ""}`} />
                          ) : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-slate-800 truncate">{v.label}</div>
                            <div className="text-xs text-slate-400">{v.code} · {baht(v.price)} · สต๊อก {v.qty}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setPicker({ shopId: s.shopId, target: v.id })}
                              className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2 py-1">รูปเว็บ</button>
                            {webKey && (
                              <button onClick={() => { const n = { ...s.webSkuImages }; delete n[v.id]; patchShop(s.shopId, { webSkuImages: n }); }}
                                className="text-xs text-rose-500 hover:underline">ล้าง</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => saveShop(s)} disabled={savingShop === s.shopId}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm rounded-lg px-5 py-2">
                  {savingShop === s.shopId ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <AssetPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={onPickImages}
        multiple={picker?.target === "gallery"}
        typeFilter="image"
        title={picker?.target === "gallery" ? "เลือกรูปสินค้าบนเว็บ" : "เลือกรูปของสีนี้"}
      />
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <button type="button" role="switch" aria-checked={on} onClick={onClick}
        className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
      </button>
      {label}
    </label>
  );
}

function Field({ label, value, onChange, placeholder, textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400" />
      )}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <input type="number" inputMode="numeric" value={value ?? ""} placeholder="—"
        onChange={(e) => { const t = e.target.value.trim(); const n = t === "" ? null : Number(t); if (n !== null && (isNaN(n) || n < 0)) return; onChange(n); }}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-right outline-none focus:ring-1 focus:ring-orange-400" />
    </label>
  );
}
