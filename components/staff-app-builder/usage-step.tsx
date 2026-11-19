"use client";

/**
 * 📊 สถิติการใช้ของแอปพนักงาน (รอบ 3) — เมนูไหนใช้บ่อย / ไม่มีใครใช้
 * ข้อมูล: GET /api/staff-apps?usage=<id>&days= (page_view_daily · นับเฉพาะคนที่เห็นแอป ไม่นับแอดมิน)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import type { StaffAppDraft } from "@/lib/staff-apps";
import type { MenuUsage } from "@/lib/staff-app-extras";
import type { BuilderMenu } from "./index";

export function UsageStep({ appId, draft, menus }: { appId: string; draft: StaffAppDraft; menus: BuilderMenu[] }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ usage: MenuUsage[]; people: number; since: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    apiFetch(`/api/staff-apps?usage=${encodeURIComponent(appId)}&days=${days}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) throw new Error(j.error);
      setData({ usage: j.usage ?? [], people: j.people ?? 0, since: j.since });
    }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [appId, days]);
  const byId = new Map(menus.map((m) => [m.id, m]));
  const nameOf = (id: string) => draft.menus.find((m) => m.menu_id === id)?.label || byId.get(id)?.label || "?";
  const max = Math.max(1, ...(data?.usage ?? []).map((u) => u.views));
  const unused = (data?.usage ?? []).filter((u) => u.views === 0);

  return (
    <div className="max-w-3xl space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600">ช่วง</span>
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`h-8 rounded-full border px-3 text-xs ${days === d ? "border-violet-300 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>{d} วัน</button>
        ))}
      </div>
      {err && <p className="text-rose-600">{err}</p>}
      {!data && !err && <div className="h-32 animate-pulse rounded-lg bg-slate-100" />}
      {data && (
        <>
          <p className="text-xs text-slate-500">ตั้งแต่ {data.since} · นับเฉพาะ {data.people} คนที่เห็นแอปนี้ (ไม่นับแอดมิน) · หน้าเดียวกันที่เปิดผ่านแอปอื่นก็นับด้วย · ระบบเริ่มเก็บการเปิดหน้า 7 พ.ย. 2026</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {data.usage.map((u) => (
              <div key={u.menu_id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-center"><Icon value={byId.get(u.menu_id)?.icon ?? "📄"} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-800">{nameOf(u.menu_id)}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${(u.views / max) * 100}%` }} /></div>
                </div>
                <div className="w-28 shrink-0 text-right text-xs text-slate-600">
                  {u.views ? <>{u.views.toLocaleString("th-TH")} ครั้ง · {u.users} คน</> : <span className="text-amber-700">ยังไม่มีใครเปิด</span>}
                  {u.last_at && <div className="text-[10px] text-slate-400">ล่าสุด {new Date(u.last_at).toLocaleDateString("th-TH")}</div>}
                </div>
              </div>
            ))}
            {data.usage.length === 0 && <p className="p-6 text-center text-slate-500">แอปนี้ยังไม่มีเมนู</p>}
          </div>
          {unused.length > 0 && data.usage.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="bulb" /> {unused.length} เมนูยังไม่มีใครเปิดในช่วงนี้ — ลองเอาออกจากแอป หรือย้ายลงล่าง ให้หน้าแรกโล่งขึ้น</p>
          )}
        </>
      )}
    </div>
  );
}
