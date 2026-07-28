"use client";

/**
 * /website — หน้ารวม "เว็บไซต์ทั้งหมด"
 * แต่ละเว็บมีหน้าจัดการของตัวเองที่ /website/<slug> (ไม่รวมกันในหน้าเดียวแล้ว)
 * ข้อมูล: /api/website/shops (guardApi products.view)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type ShopCard = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  status: string;
  total: number;
  published: number;
  domain: string | null;
};

/** สีหัวการ์ดต่อร้าน (ไล่ตามลำดับ) */
const ACCENTS = [
  "linear-gradient(135deg,#f97316,#c2410c)",
  "linear-gradient(135deg,#ec4899,#9d174d)",
  "linear-gradient(135deg,#0f172a,#334155)",
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
];

export default function WebsiteIndexPage() {
  const [shops, setShops] = useState<ShopCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🌐 เว็บไซต์</h1>
          <p className="text-sm text-slate-500 mt-1">
            เลือกเว็บที่ต้องการจัดการ — แต่ละเว็บมีสินค้า การจับคู่ฟิลด์ และดีไซน์เป็นของตัวเอง
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : err ? (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {err}</div>
        ) : !shops.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-400 text-sm">
            ยังไม่มีเว็บร้าน
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s, i) => (
              <Link
                key={s.id}
                href={`/website/${encodeURIComponent(s.slug)}`}
                className="group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-400 hover:shadow-md transition"
              >
                {/* แถบสีหัวการ์ด */}
                <div className="h-20 relative" style={{ background: ACCENTS[i % ACCENTS.length] }}>
                  <span className="absolute left-4 bottom-3 text-white font-semibold text-lg drop-shadow">{s.name}</span>
                  {s.isDefault && (
                    <span className="absolute right-3 top-3 text-[10px] px-2 py-0.5 rounded-full bg-white/25 text-white">
                      ร้านหลัก
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <p className="text-lg font-semibold text-slate-900 leading-none">{s.total}</p>
                      <p className="text-[11px] text-slate-500 mt-1">สินค้าบนเว็บ</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-emerald-600 leading-none">{s.published}</p>
                      <p className="text-[11px] text-slate-500 mt-1">เผยแพร่แล้ว</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400 truncate">{s.slug}</span>
                    <span className="text-xs text-blue-600 group-hover:underline">จัดการ →</span>
                  </div>
                </div>
              </Link>
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
