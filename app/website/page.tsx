"use client";

/**
 * /website — หน้ารวม "เว็บไซต์ทั้งหมด"
 * แต่ละเว็บมีหน้าจัดการของตัวเองที่ /website/<slug> (ไม่รวมกันในหน้าเดียวแล้ว)
 * ข้อมูล: /api/website/shops (guardWebsite · เห็นเฉพาะร้านที่มีสิทธิ์ website.shop.<slug>)
 * 🔐 ปุ่ม "ใครทำอะไรได้" (admin.users) → /website/access
 * การ์ดร้าน = components/website-shop-card (หัวการ์ด = ภาพย่อเว็บจริงแบบสด + โลโก้)
 */
import { useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { WebsiteShopCard, type WebsiteShopCardData } from "@/components/website-shop-card";
import Link from "next/link";
import { useAuth } from "@/components/auth";

export default function WebsiteIndexPage() {
  const [shops, setShops] = useState<WebsiteShopCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { can } = useAuth();

  useEffect(() => {
    apiFetch("/api/website/shops")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setErr(j.error);
        else setShops(j.shops ?? []);
      })
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🌐 เว็บไซต์</h1>
            {can("admin.users") && (
              <Link href="/website/access" className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600">
                🔐 ใครทำอะไรได้
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            เลือกเว็บที่ต้องการจัดการ — แต่ละเว็บมีสินค้า การจับคู่ฟิลด์ และดีไซน์เป็นของตัวเอง
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : err ? (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {err}</div>
        ) : !shops.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-400 text-sm">
            ยังไม่มีเว็บร้านที่คุณเข้าได้ — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s, i) => (
              <WebsiteShopCard key={s.id} s={s} index={i} />
            ))}
          </div>
        )}

        {/* ลิงก์เว็บจริง (ถ้าตั้งโดเมนไว้) */}
        {shops.some((s) => s.domain) && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">เปิดเว็บจริง</p>
            <div className="flex flex-wrap gap-2">
              {shops
                .filter((s) => s.domain)
                .map((s) => (
                  <a
                    key={s.id}
                    href={s.domain!.startsWith("http") ? s.domain! : `https://${s.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600"
                  >
                    {s.name} ↗
                  </a>
                ))}
            </div>
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
