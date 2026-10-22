"use client";

/**
 * 🖼 แผง "รูป PNG ของสินค้า" — Section การ์ดบนฉาก (ตัวจัดหน้าเว็บ · แท็บเนื้อหา บนสุด)
 *
 * โชว์สินค้าของแต่ละแท็บตามที่ตั้ง (กฎเดียวกับเว็บร้าน: lib/website-scene) เป็นช่องใหญ่ PngSlot ของกลาง
 *   มี PNG = ✓ โชว์บนเว็บ · ไม่มี = ไม่โชว์ (เจ้าของขอ 2026-10-22: ไม่ตัดพื้นเอง)
 * ใส่รูปตรงนี้ = บันทึกลง "รูปตัดพื้น (PNG)" ของ Parent SKU (ที่เดียวกับหน้าสินค้า) ผ่าน /api/website/product-png
 *   → ล้างแคชเว็บ + โหลดพรีวิวใหม่ (onSaved)
 * รายการสินค้า = API สาธารณะของเว็บร้าน (ชุดเดียวกับที่เว็บใช้จริง: ลำดับใหม่/ขายดี + รูป PNG ปัจจุบัน)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PngSlot } from "@/components/png-slot";
import { SCENE_TAB_DEFAULTS, sceneTabCandidates, sceneTabCount, scenePngOf, sceneTabSource, type SceneProductLike, type SceneTabN, type SceneTabsLike } from "@/lib/website-scene";

type Item = SceneProductLike & { id: string; code: string; name: string; images?: string[] };

const cache = new Map<string, Promise<Item[]>>();
function loadProducts(shopSlug: string, fresh = false): Promise<Item[]> {
  if (fresh || !cache.has(shopSlug)) {
    cache.set(
      shopSlug,
      fetch(`/api/public/storefront/products?shop=${encodeURIComponent(shopSlug)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (Array.isArray(j?.products) ? (j.products as Item[]) : []))
        .catch(() => [])
    );
  }
  return cache.get(shopSlug)!;
}
/** URL รูป PNG จาก API (/api/r2-image?key=…) → r2 key */
function keyOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://x").searchParams.get("key") ?? url;
  } catch {
    return url;
  }
}

export function ScenePngBoard({ block, shopSlug, onSaved }: { block: SceneTabsLike & Record<string, unknown>; shopSlug: string; onSaved?: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  /** รูปที่เพิ่งใส่/เอาออกในแผงนี้ (id รุ่น → key | null) — ทับค่าจาก API */
  const [over, setOver] = useState<Record<string, string | null>>({});
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let alive = true;
    loadProducts(shopSlug, rev > 0).then((l) => alive && setItems(l));
    return () => {
      alive = false;
    };
  }, [shopSlug, rev]);

  const pngOnly = block.imgMode !== "original";
  const tabs = useMemo(() => {
    const n = sceneTabCount(block);
    return ([1, 2, 3] as SceneTabN[])
      .filter((t) => t <= n)
      .map((t) => ({
        n: t,
        label: String(block[`tab${t}Label`] ?? "").trim() || SCENE_TAB_DEFAULTS[t].th,
        pick: sceneTabSource(block, t) === "pick",
        list: items ? sceneTabCandidates(items, block, t) : [],
      }));
  }, [block, items]);
  const pngKey = (p: Item) => (p.id in over ? over[p.id] : keyOf(scenePngOf(p)));
  const missing = tabs.reduce((s, t) => s + t.list.filter((p) => !pngKey(p)).length, 0);

  const save = async (p: Item, key: string | null): Promise<string | null> => {
    const res = await apiFetch("/api/website/product-png", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: p.id, key }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return j.error || `บันทึกไม่สำเร็จ (${res.status})`;
    setOver((o) => ({ ...o, [p.id]: key }));
    onSaved?.();
    return null;
  };

  return (
    <details open={missing > 0 || undefined} className="rounded-xl border border-indigo-200 bg-indigo-50/40">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-900">
        <span>🖼 รูป PNG ของสินค้า</span>
        {items && <span className={`rounded px-1.5 text-[10px] font-medium ${missing ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{missing ? `ขาด ${missing} รูป` : "ครบ"}</span>}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setOver({});
            setRev((r) => r + 1);
          }}
          className="ml-auto rounded px-1.5 text-[11px] font-normal text-indigo-700 hover:bg-indigo-100"
          title="โหลดรายการสินค้าใหม่"
        >
          ↻
        </button>
      </summary>
      <div className="space-y-4 px-3 pb-3">
        <p className="text-[11px] leading-snug text-slate-600">
          {pngOnly ? "สินค้าที่ไม่มีรูป PNG จะไม่โชว์ในแท็บ" : "ตั้ง \"รูปเดิมทุกตัว\" อยู่ — ตอนนี้ยังไม่ได้ใช้รูป PNG"} · ใส่ตรงนี้ = บันทึกลง &ldquo;รูปตัดพื้น (PNG)&rdquo; ของ Parent SKU (ใช้ได้ทุก Section/ทุกร้าน)
        </p>
        {!items && <p className="text-xs text-slate-400">กำลังโหลดสินค้า…</p>}
        {items &&
          tabs.map((t) => {
            const have = t.list.filter((p) => pngKey(p)).length;
            return (
              <div key={t.n}>
                <div className="mb-1.5 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    {tabs.length > 1 ? `แท็บ ${t.n} · ` : ""}
                    {t.label}
                  </span>
                  <span className="text-slate-500">
                    มี PNG {have}/{t.list.length}
                  </span>
                </div>
                {t.list.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {t.list.map((p) => {
                      const k = pngKey(p);
                      return (
                        <PngSlot
                          key={`${t.n}-${p.id}`}
                          size="md"
                          value={k}
                          ghost={p.images?.[0] ?? null}
                          onSave={(key) => save(p, key)}
                          caption={
                            <div className={`text-[10px] leading-tight ${k ? "text-slate-700" : "text-slate-400"}`} title={p.name}>
                              <div className="font-mono">{p.code}</div>
                              <div className="truncate">{k ? p.name : "ไม่โชว์ · ยังไม่มี PNG"}</div>
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{t.pick ? "ยังไม่ได้เลือกสินค้าของแท็บนี้" : "ไม่มีสินค้า"}</p>
                )}
              </div>
            );
          })}
      </div>
    </details>
  );
}
