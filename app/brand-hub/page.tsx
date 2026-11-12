"use client";
/**
 * หน้าแบรนด์ — ด่านเลือกแบรนด์แบบ carousel (/brand-hub)
 * เจ้าของขอ (2026-11-12): "เลือกแบรนด์ กดแล้วรวมทุกหมวดที่จำเป็นไว้ที่เดียว" · ดีไซน์แบบ animate-ui carousel (การ์ดกลางขยาย)
 * - จำแบรนด์ล่าสุด → เปิดหน้านี้ครั้งหน้าเข้าแบรนด์นั้นเลย (?pick=1 = บังคับให้เลือกใหม่)
 * - การ์ด = โลโก้ · สินค้าในระบบ · รายการบนร้าน · ช่องทางที่เชื่อมแล้ว (ตัวเลขจริง — /api/brand-hub)
 * ของกลาง: Carousel · BrandAvatar · PlatformIcon · state-views · Icon
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Carousel } from "@/components/carousel";
import { BrandAvatar } from "@/components/platform-catalog/brand-gate";
import { PlatformIcon } from "@/components/platform-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { HUB_CHANNELS, HUB_LAST_BRAND_KEY, type HubBrandCard, type HubBrandsResponse } from "@/lib/brand-hub";

const hubHref = (id: string) => `/brand-hub/${encodeURIComponent(id)}`;

function readLastBrand(): string | null {
  try { return localStorage.getItem(HUB_LAST_BRAND_KEY); } catch { return null; }
}

function BrandCard({ b, active }: { b: HubBrandCard; active: boolean }) {
  return (
    <div className="h-[250px] flex flex-col rounded-2xl border border-slate-200 bg-white p-5 overflow-hidden"
      style={{ borderTop: `4px solid ${b.color || "#94a3b8"}` }}>
      <div className="flex items-center gap-3">
        <BrandAvatar name={b.name} logoKey={b.logo_key} color={b.color} size={52} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-900">{b.name}</div>
          <div className="text-xs text-slate-500">สินค้า {b.parents.toLocaleString()} รุ่น</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">บนร้าน</div><div className="text-lg font-semibold tabular-nums text-slate-800">{b.listings.toLocaleString()}</div></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">ช่องทางที่เชื่อม</div><div className="text-lg font-semibold tabular-nums text-slate-800">{b.connected.length} / {HUB_CHANNELS.length}</div></div>
      </div>
      <div className="mt-3 flex min-h-[22px] flex-wrap items-center gap-1.5">
        {b.connected.length
          ? b.connected.map((c) => <PlatformIcon key={c} code={c} size={20} />)
          : <span className="text-xs text-slate-400">ยังไม่มีร้านที่เชื่อม</span>}
      </div>
      <div className={`mt-auto inline-flex items-center gap-1 text-sm font-medium ${active ? "text-violet-700" : "text-slate-400"}`}>
        เข้าจัดการแบรนด์ <Icon value="i:arrow-left" className="rotate-180" />
      </div>
    </div>
  );
}

export default function BrandHubPickerPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<HubBrandCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [reload, setReload] = useState(0);

  // จำแบรนด์ล่าสุด → เข้าเลย (ยกเว้นกด "ดูทุกแบรนด์" มา = ?pick=1)
  useEffect(() => {
    const pick = new URLSearchParams(window.location.search).get("pick");
    const last = readLastBrand();
    if (!pick && last) router.replace(hubHref(last));
  }, [router]);

  useEffect(() => {
    let alive = true;
    setError(null);
    apiFetch("/api/brand-hub").then((r) => r.json() as Promise<HubBrandsResponse>)
      .then((j) => {
        if (!alive) return;
        if (j.error) { setError(j.error); return; }
        const list = j.brands ?? [];
        setBrands(list);
        const last = readLastBrand();
        const i = last ? list.findIndex((b) => b.id === last) : -1;
        setIdx(i >= 0 ? i : 0);
      })
      .catch(() => { if (alive) setError("โหลดรายชื่อแบรนด์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { alive = false; };
  }, [reload]);

  const open = (b: HubBrandCard) => {
    try { localStorage.setItem(HUB_LAST_BRAND_KEY, b.id); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
    router.push(hubHref(b.id));
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900"><Icon name="store" className="mr-1.5" />หน้าแบรนด์</h1>
        <p className="mt-0.5 text-sm text-slate-500">เลือกแบรนด์ แล้วจัดการทุกอย่างของแบรนด์นั้นในที่เดียว — ร้านค้า สินค้า ออเดอร์ คอนเทนต์ และงานที่ต้องทำ</p>
      </div>
      {error ? <ErrorState title="โหลดรายชื่อแบรนด์ไม่สำเร็จ" hint={error} onRetry={() => setReload((n) => n + 1)} />
        : brands == null ? <LoadingState label="กำลังโหลดแบรนด์…" />
        : brands.length === 0 ? <EmptyState icon={<Icon name="tag" />} title="ยังไม่มีแบรนด์" hint="เพิ่มแบรนด์ที่หน้าแบรนด์ (Master Data) ก่อน" />
        : (
          <>
            <Carousel items={brands} index={idx} onIndexChange={setIdx} itemKey={(b) => b.id} onSelect={open}
              renderItem={(b, active) => <BrandCard b={b} active={active} />} itemWidth={260} height={310} ariaLabel="เลือกแบรนด์" />
            <div className="mt-5 flex justify-center">
              <button type="button" onClick={() => brands[idx] && open(brands[idx])}
                className="h-10 px-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700">
                เข้าจัดการ {brands[idx]?.name} <Icon value="i:arrow-left" className="rotate-180" />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">ปัดซ้าย-ขวา หรือใช้ปุ่มลูกศรบนคีย์บอร์ด · กดการ์ดกลางเพื่อเข้า</p>
          </>
        )}
    </div>
  );
}
