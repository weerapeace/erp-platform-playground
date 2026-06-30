"use client";

/**
 * /account/security — "ความปลอดภัย: อุปกรณ์ที่เข้าสู่ระบบ"
 * ให้ผู้ใช้แต่ละคนดูประวัติว่าเคยเข้าจากเครื่องไหน/ที่ไหน/เมื่อไหร่ + ป้าย "อุปกรณ์นี้" / "ใหม่"
 * ข้อมูลจาก /api/auth/login-event (RLS เห็นเฉพาะของตัวเอง)
 */
import { useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

type Ev = {
  id: string; created_at: string; device_id: string | null;
  browser: string | null; os: string | null; device_type: string | null;
  ip: string | null; city: string | null; region: string | null; country: string | null;
  is_new_device: boolean;
};

const deviceIcon = (t: string | null) => (t === "mobile" ? "📱" : t === "tablet" ? "📲" : "💻");

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

const fullTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const loc = (e: Ev) => [e.city, e.country].filter(Boolean).join(", ") || "ตำแหน่งไม่ทราบ";

export default function SecurityPage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [myDevice, setMyDevice] = useState<string | null>(null);

  useEffect(() => {
    try { setMyDevice(localStorage.getItem("erp_device_id")); } catch { /* ignore */ }
    apiFetch("/api/auth/login-event")
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setEvents((j.data ?? []) as Ev[]); })
      .catch(() => setErr("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  // จัดกลุ่มตามอุปกรณ์ (device_id) เพื่อแสดง "อุปกรณ์ที่เคยใช้" + ครั้งล่าสุด
  const devices = useMemo(() => {
    const map = new Map<string, { latest: Ev; count: number }>();
    for (const e of events) {
      const key = e.device_id || e.id;
      const cur = map.get(key);
      if (!cur) map.set(key, { latest: e, count: 1 });
      else cur.count += 1;   // events เรียงใหม่→เก่า latest = ตัวแรก
    }
    return [...map.values()];
  }, [events]);

  return (
    <PlaygroundShell>
      <div className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">🔐 ความปลอดภัย — อุปกรณ์ที่เข้าสู่ระบบ</h1>
          <p className="text-sm text-slate-500 mt-1">ดูว่าบัญชีคุณเคยเข้าใช้จากอุปกรณ์/ที่ไหนบ้าง — ถ้าเจอรายการที่ไม่ใช่คุณ ให้รีบเปลี่ยนรหัสผ่านทันที</p>
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : err ? (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {err}</div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-2 opacity-50">🖥️</div>
            <p className="text-sm">ยังไม่มีประวัติการเข้าสู่ระบบ</p>
          </div>
        ) : (
          <>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">อุปกรณ์ที่เคยใช้ ({devices.length})</div>
            <div className="space-y-2.5">
              {devices.map(({ latest: e, count }) => {
                const isThis = myDevice && e.device_id === myDevice;
                return (
                  <div key={e.device_id || e.id}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 ${isThis ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                    <span className="text-2xl leading-none mt-0.5">{deviceIcon(e.device_type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{e.browser || "เบราว์เซอร์ไม่ทราบ"} · {e.os || "ระบบไม่ทราบ"}</span>
                        {isThis && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">อุปกรณ์นี้</span>}
                        {e.is_new_device && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">เคยเป็นเครื่องใหม่</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">📍 {loc(e)}{e.ip ? ` · IP ${e.ip}` : ""}</div>
                      <div className="text-xs text-slate-400 mt-0.5" title={fullTime(e.created_at)}>
                        เข้าล่าสุด {timeAgo(e.created_at)} · เห็น {count} ครั้ง
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed">
              <b className="text-slate-600">เคล็ดลับความปลอดภัย:</b> ถ้าเห็นอุปกรณ์/ตำแหน่งที่ไม่ใช่คุณ — เปลี่ยนรหัสผ่านทันที (เมนูบัญชี → เปลี่ยนรหัสผ่าน)
              และระบบจะส่งแจ้งเตือนให้อัตโนมัติทุกครั้งที่มีการเข้าจากอุปกรณ์ใหม่
            </div>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
