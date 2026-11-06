"use client";
/**
 * ⚙️ ตั้งค่า "การแจ้งเตือน" ต่อคน (ของกลาง · แท็บในหน้าต่างตัว Pet)
 * แถว = ทะเบียนกลาง lib/notify-sources (เพิ่มเรื่องใหม่ที่นั่น → ขึ้นที่นี่เอง) · เห็นเฉพาะเรื่องที่มีสิทธิ์
 * 3 ช่อง: โชว์ในศูนย์ · ตัว Pet เด้งบอก (notify_prefs) · เด้งที่เครื่อง (push_prefs เดิม — ผ่าน useWebPush)
 * + ห้ามรบกวน (ตัว Pet ไม่เด้ง + ไม่เด้งที่เครื่อง ในช่วงเวลาที่ตั้ง · เรื่องที่ล็อกไว้ยังเด้ง)
 */
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { useWebPush } from "@/components/web-push";
import { useUserPref } from "@/lib/use-user-pref";
import {
  NOTIFY_PREFS_DEFAULT, NOTIFY_PREFS_KEY, NOTIFY_SOURCES, isNewSource, notifyOn, parseNotifyPrefs, withNotifySetting,
  type NotifyPrefs, type NotifySource,
} from "@/lib/notify-sources";

export function useNotifyPrefs() {
  return useUserPref<NotifyPrefs>(NOTIFY_PREFS_KEY, NOTIFY_PREFS_DEFAULT, (raw) => parseNotifyPrefs(raw));
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 justify-self-center rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-slate-300"}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}
const Dash = () => <span className="justify-self-center text-xs text-slate-300" title="เรื่องนี้เลือกแบบนี้ไม่ได้">—</span>;
const Lock = () => <span className="justify-self-center text-slate-400" title="ปิดไม่ได้ (เรื่องความปลอดภัย)"><Icon name="lock" /></span>;
const GRID = "grid grid-cols-[minmax(0,1fr)_64px_64px_64px] items-center gap-1.5";

export function NotifySettings() {
  const { can, permsReady } = useAuth();
  const [prefs, setPrefs] = useNotifyPrefs();
  const push = useWebPush();
  const hasDevice = push.devices.length > 0;
  // รอสิทธิ์โหลดเสร็จก่อนกรอง (กันแถวโผล่แล้วหาย)
  const visible = NOTIFY_SOURCES.filter((s) => !s.permission || (permsReady && can(s.permission as Parameters<typeof can>[0])));
  const groups: { title: string; items: NotifySource[] }[] = [
    { title: "ในศูนย์แจ้งเตือน", items: visible.filter((s) => s.group === "center") },
    { title: "กระดิ่ง (เรื่องที่ระบบแจ้งเข้าชื่อคุณ)", items: visible.filter((s) => s.group === "bell") },
  ];
  const set = (s: NotifySource, ch: "center" | "bounce", v: boolean) => setPrefs(withNotifySetting(prefs, s.key, ch, v));
  const pushOn = (s: NotifySource) => !!s.push && !push.prefs.off.includes(s.push);
  const setPush = (s: NotifySource, v: boolean) => {
    if (!s.push) return;
    const off = v ? push.prefs.off.filter((k) => k !== s.push) : [...new Set([...push.prefs.off, s.push])];
    void push.savePrefs({ off }).catch(() => {});
  };
  const reset = () => {
    setPrefs(NOTIFY_PREFS_DEFAULT);
    if (push.prefs.off.length) void push.savePrefs({ off: [] }).catch(() => {});
  };
  const q = prefs.quiet;

  return (
    <div className="space-y-3">
      <div className={`${GRID} sticky top-0 z-10 bg-white pb-1 text-center text-[11px] text-slate-400`}>
        <span />
        <span>โชว์ในศูนย์</span>
        <span>Pet เด้งบอก</span>
        <span>เด้งที่เครื่อง</span>
      </div>
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.title}>
          <h3 className="mb-0.5 text-xs font-semibold text-slate-600">{g.title}</h3>
          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {g.items.map((s) => (
              <div key={s.key} className={`${GRID} py-2`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-slate-800">
                    <Icon {...(/^[a-z-]+$/.test(s.icon) ? { name: s.icon } : { value: s.icon })} />
                    <span className="truncate">{s.label}</span>
                    {isNewSource(s) && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">ใหม่</span>}
                  </div>
                  {s.hint && <div className="truncate text-[11px] text-slate-500">{s.locked ? "ปิดไม่ได้ · " : ""}{s.hint}</div>}
                </div>
                {s.locked ? <Lock /> : <Switch on={notifyOn(prefs, s.key, "center")} onChange={(v) => set(s, "center", v)} label={`${s.label}: โชว์ในศูนย์`} />}
                {s.locked ? <Lock /> : <Switch on={notifyOn(prefs, s.key, "bounce")} onChange={(v) => set(s, "bounce", v)} label={`${s.label}: ตัว Pet เด้งบอก`} />}
                {!s.push ? <Dash /> : s.locked ? <Lock /> : <Switch on={pushOn(s)} onChange={(v) => setPush(s, v)} label={`${s.label}: เด้งที่เครื่อง`} />}
              </div>
            ))}
          </div>
        </section>
      ))}
      {!push.loading && !hasDevice && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <Icon name="warning" /> ยังไม่ได้เปิด "เด้งที่เครื่อง" บนเครื่องไหนเลย — ช่องเด้งที่เครื่องจะมีผลเมื่อเปิดรับแล้ว: จอคอม = เมนูโปรไฟล์ → เด้งที่เบราว์เซอร์ · มือถือ = แอป 🔔 แจ้งเตือน (/notify)
        </p>
      )}

      <section>
        <h3 className="mb-1 text-xs font-semibold text-slate-600">ห้ามรบกวน</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Switch on={q.on} onChange={(v) => setPrefs({ ...prefs, quiet: { ...q, on: v } })} label="ห้ามรบกวน" />
          <span>ตัว Pet ไม่เด้ง และไม่เด้งที่เครื่อง ช่วง</span>
          <input type="time" value={q.from} onChange={(e) => e.target.value && setPrefs({ ...prefs, quiet: { ...q, from: e.target.value } })}
            className="h-8 rounded-md border border-slate-200 px-2 text-sm" aria-label="เริ่มห้ามรบกวน" />
          <span>ถึง</span>
          <input type="time" value={q.to} onChange={(e) => e.target.value && setPrefs({ ...prefs, quiet: { ...q, to: e.target.value } })}
            className="h-8 rounded-md border border-slate-200 px-2 text-sm" aria-label="เลิกห้ามรบกวน" />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">ยังเปิดดูในศูนย์แจ้งเตือนได้ตามปกติ · เรื่องความปลอดภัยยังเด้งเสมอ</p>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={reset} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50">คืนค่าเริ่มต้น</button>
      </div>
    </div>
  );
}
