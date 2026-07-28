"use client";

/**
 * /website — "เว็บไซต์" : จัดการสินค้าที่ขึ้นเว็บร้านออนไลน์ (ทุกร้านในที่เดียว)
 * เลือกร้าน (IG International / Pixiedustie / Louis Montini) → เพิ่มสินค้าจาก ERP เข้าเว็บ
 * แล้วตั้งค่าเวอร์ชันเว็บ: เผยแพร่ · แนะนำ · ชื่อ/ราคา/คำอธิบายเฉพาะเว็บ · หน่วยขาย · หมวด · ป้าย · สถานะสต๊อก · ตัวเลือก(สี/ความหนา)
 * เว้นว่าง = ใช้ค่าจาก ERP ตามเดิม
 * ข้อมูล: /api/website/listings (guardApi products.view/edit + audit)
 */
import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type Shop = { id: string; name: string; slug: string; isDefault: boolean };
type OptionItem = { id: string; label: string; swatch?: string | null };
type WebOptions = { label: string; items: OptionItem[] } | null;

type Listing = {
  id: string;
  parentId: string;
  code: string;
  erpName: string;
  erpPrice: number;
  erpDescription: string;
  erpImageKey: string | null;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  webName: string;
  webPrice: number | null;
  webDescription: string;
  webImages: string[];
  webUnit: string;
  webCategory: string;
  webBadge: string;
  webStockStatus: string;
  webSwatch: string;
  webOptions: WebOptions;
};

type SearchHit = { id: string; code: string; name: string; price: number; imageKey: string | null };

const CATEGORIES = [
  { value: "", label: "— ไม่ระบุ —" },
  { value: "leather", label: "หนัง" },
  { value: "fabric", label: "ผ้า" },
  { value: "hardware", label: "อะไหล่" },
  { value: "edge-paint", label: "สีทาขอบ" },
];

const STOCKS = [
  { value: "in", label: "พร้อมส่ง" },
  { value: "low", label: "เหลือน้อย" },
  { value: "preorder", label: "สั่งจอง" },
];

const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH")}`;
const keyUrl = (key: string, w = 120) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** "1.5 มม., 2.0 มม." → [{id,label}] (id สร้างอัตโนมัติ) */
const parseItems = (raw: string): OptionItem[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24)
    .map((label, i) => ({ id: `opt-${i + 1}`, label }));

const itemsToText = (o: WebOptions) => (o?.items ?? []).map((i) => i.label).join(", ");

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

export default function WebsitePage() {
  const toast = useToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // แผงเพิ่มสินค้า
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(
    async (slug?: string) => {
      setLoading(true);
      try {
        const r = await apiFetch(`/api/website/listings?shop=${encodeURIComponent(slug ?? "")}`);
        const j = await r.json();
        setShops(j.shops ?? []);
        setShop(j.shop ?? null);
        setListings(j.listings ?? []);
      } catch {
        toast.error("โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void load("ig-international");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (parentId: string, p: Partial<Listing>) =>
    setListings((ls) => ls.map((l) => (l.parentId === parentId ? { ...l, ...p } : l)));

  const doSearch = async () => {
    if (!shop || !search.trim()) return;
    setSearching(true);
    try {
      const r = await apiFetch(
        `/api/website/listings?shop=${encodeURIComponent(shop.slug)}&search=${encodeURIComponent(search.trim())}`
      );
      const j = await r.json();
      setResults(j.results ?? []);
      if (!(j.results ?? []).length) toast.info("ไม่พบสินค้าที่ยังไม่อยู่ในร้านนี้");
    } catch {
      toast.error("ค้นหาไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/website/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const addProduct = async (hit: SearchHit) => {
    if (!shop) return;
    setSaving(hit.id);
    try {
      const j = await post({ shopId: shop.id, parentId: hit.id, action: "add" });
      if (j.ok) {
        toast.success(`เพิ่ม "${hit.name}" แล้ว (ยังไม่เผยแพร่)`);
        setResults((rs) => rs.filter((r) => r.id !== hit.id));
        await load(shop.slug);
      } else toast.error(j.error ?? "เพิ่มไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
    }
  };

  const removeProduct = async (l: Listing) => {
    if (!shop) return;
    if (!confirm(`เอา "${l.webName || l.erpName}" ออกจากเว็บร้าน ${shop.name}?`)) return;
    setSaving(l.parentId);
    try {
      const j = await post({ shopId: shop.id, parentId: l.parentId, action: "remove" });
      if (j.ok) {
        toast.success("เอาออกแล้ว");
        setListings((ls) => ls.filter((x) => x.parentId !== l.parentId));
      } else toast.error(j.error ?? "เอาออกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
    }
  };

  const save = async (l: Listing) => {
    if (!shop) return;
    setSaving(l.parentId);
    try {
      const j = await post({
        shopId: shop.id,
        parentId: l.parentId,
        patch: {
          isPublished: l.published,
          featured: l.featured,
          sortOrder: l.sortOrder,
          webName: l.webName,
          webPrice: l.webPrice,
          webDescription: l.webDescription,
          webUnit: l.webUnit,
          webCategory: l.webCategory,
          webBadge: l.webBadge,
          webStockStatus: l.webStockStatus || "in",
          webSwatch: l.webSwatch,
          webOptions: l.webOptions,
        },
      });
      if (j.ok) toast.success("บันทึกแล้ว");
      else toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(null);
    }
  };

  const togglePublish = async (l: Listing) => {
    const next = !l.published;
    patch(l.parentId, { published: next });
    if (!shop) return;
    const j = await post({ shopId: shop.id, parentId: l.parentId, patch: { isPublished: next } });
    if (j.ok) toast.success(next ? "เผยแพร่แล้ว" : "ปิดการแสดงแล้ว");
    else {
      patch(l.parentId, { published: !next });
      toast.error("เปลี่ยนสถานะไม่สำเร็จ");
    }
  };

  const publishedCount = listings.filter((l) => l.published).length;

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-5 py-6">
        {/* หัวเรื่อง */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🌐 เว็บไซต์ — สินค้าบนเว็บ</h1>
          <p className="text-sm text-slate-500 mt-1">
            เลือกร้าน แล้วกำหนดว่าสินค้าไหนขึ้นเว็บบ้าง พร้อมตั้งชื่อ/ราคา/หน่วย/หมวดเฉพาะเว็บ — เว้นว่าง = ใช้ข้อมูลจาก ERP
          </p>
        </div>

        {/* เลือกร้าน */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {shops.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpen(null);
                setResults([]);
                setShowAdd(false);
                void load(s.slug);
              }}
              className={`px-3.5 py-1.5 rounded-full text-sm border transition ${
                shop?.id === s.id
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {s.name}
              {s.isDefault && <span className="ml-1.5 text-[10px] opacity-70">ร้านหลัก</span>}
            </button>
          ))}
        </div>

        {/* แถบสรุป + ปุ่มเพิ่ม */}
        {shop && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-sm text-slate-500">
              ร้าน <span className="font-medium text-slate-800">{shop.name}</span> · สินค้าบนเว็บ {listings.length} รายการ ·
              เผยแพร่ {publishedCount}
            </p>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              {showAdd ? "ปิดการเพิ่ม" : "+ เพิ่มสินค้าเข้าเว็บ"}
            </button>
          </div>
        )}

        {/* แผงเพิ่มสินค้า */}
        {showAdd && shop && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <p className="text-xs text-slate-500 mb-2">ค้นหาสินค้าจาก ERP (รหัส หรือ ชื่อ) แล้วกดเพิ่มเข้าเว็บร้านนี้</p>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                placeholder="เช่น หนัง, ซิป, IG001"
                className={inputCls}
              />
              <button
                onClick={() => void doSearch()}
                disabled={searching}
                className="shrink-0 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-black disabled:opacity-50"
              >
                {searching ? "ค้นหา…" : "ค้นหา"}
              </button>
            </div>

            {results.length > 0 && (
              <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
                    {r.imageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={keyUrl(r.imageKey, 80)} alt="" className="w-9 h-9 rounded object-cover bg-slate-100" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-slate-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {r.code} · {baht(r.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => void addProduct(r)}
                      disabled={saving === r.id}
                      className="shrink-0 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving === r.id ? "…" : "+ เพิ่ม"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* รายการสินค้าบนเว็บ */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !listings.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
            <p className="text-slate-400 text-sm">ยังไม่มีสินค้าบนเว็บร้านนี้</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 hover:underline">
              + เพิ่มสินค้าเข้าเว็บ
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => {
              const isOpen = open === l.parentId;
              return (
                <li key={l.parentId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {/* แถวหลัก */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => void togglePublish(l)}
                      title={l.published ? "กำลังแสดงบนเว็บ — กดเพื่อปิด" : "ยังไม่แสดง — กดเพื่อเผยแพร่"}
                      className={`shrink-0 w-11 h-6 rounded-full transition relative ${l.published ? "bg-emerald-500" : "bg-slate-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${l.published ? "left-[22px]" : "left-0.5"}`}
                      />
                    </button>

                    {l.erpImageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={keyUrl(l.erpImageKey, 80)} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg bg-slate-100"
                        style={l.webSwatch ? { background: l.webSwatch } : undefined}
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{l.webName || l.erpName}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {l.code}
                        {l.webCategory && ` · ${CATEGORIES.find((c) => c.value === l.webCategory)?.label ?? l.webCategory}`}
                        {" · "}
                        {baht(l.webPrice ?? l.erpPrice)}
                        {l.webUnit && `/${l.webUnit}`}
                        {l.featured && " · ⭐ แนะนำ"}
                      </p>
                    </div>

                    <button
                      onClick={() => setOpen(isOpen ? null : l.parentId)}
                      className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400"
                    >
                      {isOpen ? "ปิด" : "แก้ไข"}
                    </button>
                  </div>

                  {/* แผงแก้ไข */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className={labelCls}>ชื่อบนเว็บ (เว้นว่าง = ใช้ชื่อ ERP: {l.erpName})</label>
                          <input
                            value={l.webName}
                            onChange={(e) => patch(l.parentId, { webName: e.target.value })}
                            placeholder={l.erpName}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>ราคาบนเว็บ (บาท) — ERP: {baht(l.erpPrice)}</label>
                          <input
                            type="number"
                            value={l.webPrice ?? ""}
                            onChange={(e) =>
                              patch(l.parentId, { webPrice: e.target.value === "" ? null : Number(e.target.value) })
                            }
                            placeholder={String(l.erpPrice)}
                            className={inputCls}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>หน่วยขาย</label>
                          <input
                            value={l.webUnit}
                            onChange={(e) => patch(l.parentId, { webUnit: e.target.value })}
                            placeholder="ตร.ฟุต / หลา / ชิ้น / ขวด"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>หมวดบนเว็บ</label>
                          <select
                            value={l.webCategory}
                            onChange={(e) => patch(l.parentId, { webCategory: e.target.value })}
                            className={inputCls}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>สถานะสต๊อกบนเว็บ</label>
                          <select
                            value={l.webStockStatus || "in"}
                            onChange={(e) => patch(l.parentId, { webStockStatus: e.target.value })}
                            className={inputCls}
                          >
                            {STOCKS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelCls}>ป้ายบนการ์ด</label>
                          <input
                            value={l.webBadge}
                            onChange={(e) => patch(l.parentId, { webBadge: e.target.value })}
                            placeholder="ขายดี / แนะนำ"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>ชื่อชุดตัวเลือก</label>
                          <input
                            value={l.webOptions?.label ?? ""}
                            onChange={(e) =>
                              patch(l.parentId, {
                                webOptions: { label: e.target.value, items: l.webOptions?.items ?? [] },
                              })
                            }
                            placeholder="ความหนา / สี"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>ตัวเลือก (คั่นด้วยจุลภาค)</label>
                          <input
                            defaultValue={itemsToText(l.webOptions)}
                            onBlur={(e) =>
                              patch(l.parentId, {
                                webOptions: {
                                  label: l.webOptions?.label || "ตัวเลือก",
                                  items: parseItems(e.target.value),
                                },
                              })
                            }
                            placeholder="1.5 มม., 2.0 มม., 3.0 มม."
                            className={inputCls}
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className={labelCls}>คำอธิบายบนเว็บ (เว้นว่าง = ใช้ของ ERP)</label>
                          <textarea
                            rows={2}
                            value={l.webDescription}
                            onChange={(e) => patch(l.parentId, { webDescription: e.target.value })}
                            placeholder={l.erpDescription || "อธิบายสินค้าสำหรับลูกค้า"}
                            className={inputCls}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelCls}>สีตัวอย่าง (ใช้แทนรูปจนกว่าจะมีรูปจริง)</label>
                          <div className="flex items-center gap-2">
                            <input
                              value={l.webSwatch}
                              onChange={(e) => patch(l.parentId, { webSwatch: e.target.value })}
                              placeholder="#C89A5B หรือ linear-gradient(...)"
                              className={inputCls}
                            />
                            <span
                              className="shrink-0 w-9 h-9 rounded-lg border border-slate-200"
                              style={l.webSwatch ? { background: l.webSwatch } : { background: "#f1f5f9" }}
                            />
                          </div>
                        </div>

                        <div className="flex items-end gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={l.featured}
                              onChange={(e) => patch(l.parentId, { featured: e.target.checked })}
                              className="w-4 h-4 accent-blue-600"
                            />
                            ⭐ สินค้าแนะนำ
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => void removeProduct(l)}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          เอาออกจากเว็บร้านนี้
                        </button>
                        <button
                          onClick={() => void save(l)}
                          disabled={saving === l.parentId}
                          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving === l.parentId ? "กำลังบันทึก…" : "บันทึก"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PlaygroundShell>
  );
}
