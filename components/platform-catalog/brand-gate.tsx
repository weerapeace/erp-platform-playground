"use client";

/**
 * หน้าเลือกแบรนด์ — ด่านแรกของมุมมองหน้าร้าน (/master/platform-catalog?view=shop)
 * เจ้าของขอ (2026-11-08): "ต้องเลือกแบรนด์ก่อนเข้า จะได้แยกประเภทได้ชัดเจน" → มุมมองหน้าร้านไม่มี "ทุกแบรนด์"
 * การ์ดแบรนด์ = โลโก้ + สินค้าในระบบ + รายการบนร้านต่อแพลตฟอร์ม + ร้านที่ตั้งไว้ + หมวดกลางตั้งแล้วกี่ตัว
 * ข้อมูล: GET /api/platform-catalog?view=brands (นับจากแถวจริง) · หน้าแม่จำแบรนด์ล่าสุดไว้ (เปิดครั้งหน้าข้ามหน้านี้)
 * ต่างจาก BrandSelect (ช่องเลือกแบรนด์ในฟอร์ม) — อันนี้เป็นหน้าภาพรวมให้เลือก พร้อมตัวเลขของแต่ละแบรนด์
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { PlatformIcon } from "@/components/platform-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import type { ShopBrandSummary, ShopBrandsResponse } from "@/lib/platform-listing-health";

export function BrandAvatar({ name, logoKey, color, size = 36 }: { name: string; logoKey: string | null; color: string | null; size?: number }) {
  const src = r2ImageUrl(logoKey, size * 2);
  const initials = name.replace(/[^A-Za-z0-9ก-๙ ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "–";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover border border-slate-200 bg-white shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full inline-flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ width: size, height: size, background: color || "#94a3b8" }}>{initials}</span>
  );
}

export function BrandGate({ onPick }: { onPick: (b: ShopBrandSummary) => void }) {
  const [data, setData] = useState<ShopBrandsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    apiFetch("/api/platform-catalog?view=brands").then((r) => r.json()).then((j: ShopBrandsResponse) => {
      if (!alive) return;
      if (j.error) setError(j.error); else setData(j);
    }).catch(() => { if (alive) setError("โหลดรายชื่อแบรนด์ไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [tick]);

  if (error) return <ErrorState title="โหลดรายชื่อแบรนด์ไม่สำเร็จ" hint={error} onRetry={() => setTick((n) => n + 1)} />;
  if (!data) return <LoadingState label="กำลังโหลดแบรนด์..." />;
  if (!data.brands.length) return <EmptyState title="ยังไม่มีแบรนด์" hint="เพิ่มแบรนด์ที่หน้าแบรนด์ก่อน" />;
  const pfName = new Map(data.platforms.map((p) => [p.code, p.name_th]));

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-800">เลือกแบรนด์ที่จะดู</h2>
        <p className="text-xs text-slate-500">ระบบจำแบรนด์ล่าสุดไว้ให้ ครั้งหน้าเข้ามาแบรนด์เดิมเลย · เปลี่ยนได้ที่หัวหน้า</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {data.brands.map((b) => {
          const ls = Object.entries(b.listings).filter(([, n]) => n > 0);
          return (
            <button key={b.id} type="button" onClick={() => onPick(b)}
              className="text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-violet-300 hover:bg-violet-50/30 transition flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandAvatar name={b.name} logoKey={b.logo_key} color={b.color} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{b.name}</div>
                  <div className="text-xs text-slate-500">{b.parents.toLocaleString()} สินค้าในระบบ</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[1.25rem]">
                {ls.length ? ls.map(([code, n]) => (
                  <span key={code} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">
                    <PlatformIcon code={code} size={12} />{pfName.get(code) ?? code} {n.toLocaleString()}
                  </span>
                )) : <span className="text-[11px] text-slate-400">ยังไม่มีสินค้าบนร้าน</span>}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={b.parents && b.central_set < b.parents ? "text-amber-700" : "text-slate-400"}>
                  หมวดกลางตั้งแล้ว {b.central_set.toLocaleString()}/{b.parents.toLocaleString()}
                </span>
                {b.shops.length > 0 && <span className="text-slate-400 truncate">ร้าน: {b.shops.map((c) => pfName.get(c) ?? c).join(", ")}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
