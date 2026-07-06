"use client";

/**
 * Parent360Overview — แท็บ "📊 ภาพรวม 360°" ใน Parent SKU
 * เห็นทุกด้านของสินค้าในหน้าเดียว: SKU ลูก · สต๊อก · ลงขายแพลตฟอร์ม · เว็บร้าน · คอนเทนต์/งาน
 * ดึงจาก /api/parent-skus/[id]/overview (guardApi products.view)
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";

type Overview = {
  skus: { total: number; active: number };
  stockOnHand: number;
  sales: { hasData: boolean; total: number; units: number; days: { date: string; sales: number; units: number }[] };
  parentCode: string;
  platforms: { drafts: number; published: number; matched: number; chips: { id: string; name_th: string; code: string; icon_key: string | null; live: boolean }[] };
  store: { listings: number };
  creative: { tasks: number; content: number; projects: number; boards: number };
};

function Stat({ label, value, sub, tone = "slate", href }: { label: string; value: number | string; sub?: string; tone?: string; href?: string }) {
  const tones: Record<string, string> = {
    slate: "text-slate-800", indigo: "text-indigo-700", emerald: "text-emerald-700", violet: "text-violet-700", amber: "text-amber-700",
  };
  const inner = (
    <>
      <div className="text-[11px] text-slate-400 flex items-center gap-1">{label}{href && <span className="text-slate-300 group-hover:text-indigo-400">↗</span>}</div>
      <div className={`text-2xl font-semibold tabular-nums ${tones[tone] ?? tones.slate}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </>
  );
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className="group block rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">{inner}</a>;
  return <div className="rounded-xl border border-slate-200 bg-white p-3">{inner}</div>;
}

// กราฟแท่งยอดขายรายวัน (SVG เล็ก ๆ ไม่ใช้ lib)
function SalesBars({ days }: { days: { date: string; sales: number; units: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.sales));
  const W = 320, H = 64, bw = days.length ? W / days.length : W;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      {days.map((d, i) => {
        const h = Math.max(2, (d.sales / max) * (H - 6));
        return <rect key={d.date} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={1} className="fill-emerald-400">
          <title>{d.date}: {d.sales.toLocaleString()}฿ · {d.units} ชิ้น</title>
        </rect>;
      })}
    </svg>
  );
}

export function Parent360Overview({ parentId }: { parentId: string | null }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!parentId) return;
    setLoading(true);
    apiFetch(`/api/parent-skus/${parentId}/overview`).then((r) => r.json())
      .then((j) => setData(j.error ? null : (j as Overview)))
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [parentId]);
  useEffect(() => { load(); }, [load]);

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกสินค้าก่อน แล้วค่อยดูภาพรวม</div>;
  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div>;
  if (!data) return <div className="text-sm text-slate-400 py-8 text-center">โหลดภาพรวมไม่สำเร็จ <button onClick={load} className="text-indigo-600 underline">ลองใหม่</button></div>;

  const c = data.creative;
  const creativeTotal = c.tasks + c.content + c.projects + c.boards;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">ภาพรวมทุกด้านของสินค้านี้ในหน้าเดียว</p>
        <button onClick={load} className="text-xs text-slate-500 hover:text-violet-700 border border-slate-200 rounded-lg px-2 py-1 hover:bg-violet-50">🔄 รีเฟรช</button>
      </div>

      {/* แถวสถิติหลัก (กดเจาะไปหน้าที่เกี่ยวได้) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="SKU ลูก (ตัวขาย)" value={data.skus.total} sub={`เปิดขาย ${data.skus.active}`} tone="indigo" />
        <Stat label="สต๊อกรวม (ทุกสี)" value={data.stockOnHand.toLocaleString()} sub="ชิ้น" tone="emerald" />
        <Stat label="ลงขายแพลตฟอร์ม" value={data.platforms.drafts} sub={`ลงจริง ${data.platforms.published} · จับคู่ร้าน ${data.platforms.matched}`} tone="violet"
          href={data.parentCode ? `/master/platform-sku?q=${encodeURIComponent(data.parentCode)}` : undefined} />
        <Stat label="คอนเทนต์/งาน" value={creativeTotal} sub={`งาน ${c.tasks} · คอนเทนต์ ${c.content}`} tone="amber"
          href={data.parentCode ? `/tasks?q=${encodeURIComponent(data.parentCode)}` : undefined} />
      </div>

      {/* กราฟยอดขาย */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-slate-600">📈 ยอดขาย (30 วันล่าสุด)</div>
          {data.sales.hasData && <div className="text-xs text-slate-500">รวม <b className="text-emerald-700">{data.sales.total.toLocaleString()}฿</b> · {data.sales.units.toLocaleString()} ชิ้น</div>}
        </div>
        {data.sales.hasData ? <SalesBars days={data.sales.days} /> : (
          <div className="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูลยอดขายของสินค้านี้ — อัปไฟล์ออเดอร์ที่ <a href="/master/platform-orders" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">ออเดอร์แพลตฟอร์ม</a> (จับคู่ SKU แล้วยอดจะขึ้นเอง) หรือนำเข้ายอดที่ <a href="/marketing/dashboard" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Marketing Dashboard</a></div>
        )}
      </div>

      {/* ลงขายแพลตฟอร์ม */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-xs font-medium text-slate-600 mb-2">🏬 ขายอยู่บนแพลตฟอร์ม</div>
        {data.platforms.chips.length === 0 ? (
          <div className="text-xs text-slate-400">ยังไม่ได้ตั้งค่าลงขายที่ร้านไหน — ไปที่แท็บ “แพลตฟอร์ม”</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.platforms.chips.map((p) => (
              <span key={p.id} className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${p.live ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                <PlatformIcon code={p.code} iconKey={p.icon_key} size={14} /> {p.name_th}
                {p.live && <span className="text-[10px]">● ลงแล้ว</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* การใช้งานด้านอื่น */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">🛍 เว็บร้าน (Store)</div>
          <div className="text-sm text-slate-700">{data.store.listings > 0 ? `ลงขายบนเว็บ ${data.store.listings} รายการ` : <span className="text-slate-400">ยังไม่ได้ลงเว็บร้าน</span>}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">🎬 งานครีเอทีฟ</div>
          <div className="text-xs text-slate-600 space-y-0.5">
            <div>งาน/ถ่าย/โพสต์: <b className="tabular-nums">{c.tasks}</b></div>
            <div>คอนเทนต์: <b className="tabular-nums">{c.content}</b> · โปรเจกต์: <b className="tabular-nums">{c.projects}</b> · บอร์ด: <b className="tabular-nums">{c.boards}</b></div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">💡 ตัวเลขรวมจากทั้งระบบ — เจาะดูรายละเอียดได้ที่แต่ละแท็บ/โมดูล</p>
    </div>
  );
}
