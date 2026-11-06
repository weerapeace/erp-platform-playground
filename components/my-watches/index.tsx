"use client";
/**
 * ⭐ การเตือนของฉัน (ของกลาง) — ตั้งเอง: เลือกหน้า → เงื่อนไข → เตือนแบบไหน (lib/my-watches · GET /api/my-watches)
 *   MyWatchesSettings = แท็บในหน้าต่างตัว Pet (เพิ่ม/เปิดปิด/ลบ + นับ "ตอนนี้ตรงกี่ใบ" ทันทีในเครื่อง)
 *   WatchesTab        = แท็บ "ของฉัน" ในศูนย์แจ้งเตือน (WorkPopupHost)
 * ค่าที่ตั้งเก็บ user_ui_prefs my_watches (ตามไปทุกเครื่อง) · การเตือนของทีม (ป๊อปเตือนงาน) โชว์ไว้ให้รู้ แก้ได้เฉพาะแอดมิน
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import {
  MY_WATCHES_DEFAULT, MY_WATCHES_KEY, MY_WATCHES_MAX, WATCH_SOURCES, newWatchId, parseMyWatches, watchLabel, watchMatches, watchSource,
  type MyWatch, type MyWatchesPref, type WatchWhen,
} from "@/lib/my-watches";
import type { MyWatchesPayload, WatchResult } from "@/lib/my-watches-server";

export function useMyWatches() {
  return useUserPref<MyWatchesPref>(MY_WATCHES_KEY, MY_WATCHES_DEFAULT, (raw) => parseMyWatches(raw));
}

/** ข้อมูลการเตือน (โหลดใหม่เมื่อการตั้งค่าเปลี่ยน / reload() ) */
export function useMyWatchesData(active: boolean) {
  const [pref] = useMyWatches();
  const sig = JSON.stringify(pref.list);
  const [data, setData] = useState<MyWatchesPayload | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await apiFetch("/api/my-watches");
      if (!r.ok) return;
      const j = (await r.json()) as { data?: MyWatchesPayload };
      if (j.data) setData(j.data);
    } catch { /* เงียบ */ }
  }, []);
  useEffect(() => {
    if (!active) return;
    // ตั้งค่าเพิ่งเปลี่ยน → รอให้ค่าถูกบันทึกขึ้นเซิร์ฟเวอร์ก่อนแล้วค่อยถาม
    const t = setTimeout(() => void reload(), 1200);
    return () => clearTimeout(t);
  }, [active, sig, reload]);
  return { data, reload };
}

const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"}`;
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-slate-300"}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

type TeamPopup = { report_id: string; heading: string; stats?: { total: number } };

export function MyWatchesSettings() {
  const { can, permsReady } = useAuth();
  const [pref, setPref] = useMyWatches();
  const { data } = useMyWatchesData(true);
  const [team, setTeam] = useState<TeamPopup[] | null>(null);
  useEffect(() => {
    apiFetch("/api/popups/active?all=1").then((r) => (r.ok ? r.json() : null)).then((j: { data?: TeamPopup[] } | null) => setTeam(j?.data ?? [])).catch(() => setTeam([]));
  }, []);

  const sources = WATCH_SOURCES.filter((s) => permsReady && can(s.permission as Parameters<typeof can>[0]));
  const [srcKey, setSrcKey] = useState<string>("design_pending");
  const src = watchSource(srcKey) ?? sources[0];
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [when, setWhen] = useState<WatchWhen>("all");
  const [bounce, setBounce] = useState(true);
  const [name, setName] = useState("");

  const srcData = src ? data?.sources[src.key] : undefined;
  const brandName = (id: string) => srcData?.brands.find((b) => b.id === id)?.name;
  const countOf = useCallback((w: Pick<MyWatch, "brand_ids" | "when">) => srcData ? srcData.facts.filter((f) => watchMatches(w, f)).length : null,
    [srcData]);
  const preview = useMemo(() => countOf({ brand_ids: brandIds, when }), [countOf, brandIds, when]);
  const full = pref.list.length >= MY_WATCHES_MAX;

  const update = (id: string, patch: Partial<MyWatch>) => setPref({ list: pref.list.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const remove = (id: string) => setPref({ list: pref.list.filter((w) => w.id !== id) });
  const add = () => {
    if (!src || full) return;
    const w: MyWatch = { id: newWatchId(), source: src.key, brand_ids: brandIds, when, on: true, bounce, ...(name.trim() ? { name: name.trim().slice(0, 60) } : {}) };
    setPref({ list: [...pref.list, w] });
    setBrandIds([]); setWhen("all"); setName("");
  };

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-xs font-semibold text-slate-600">ที่ตั้งไว้แล้ว</h3>
        <div className="divide-y divide-slate-100 border-y border-slate-100">
          {(team ?? []).map((t) => (
            <div key={t.report_id} className="flex items-center gap-2 py-2">
              <Icon name="list" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-800">{t.heading}</div>
                <div className="text-[11px] text-slate-500">ทีมตั้งให้ (ป๊อปเตือนงาน){t.stats ? ` · ตอนนี้ ${t.stats.total} ใบ` : ""}</div>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400" title="แก้ได้เฉพาะแอดมิน ที่หน้าส่งอีเมลรายงาน"><Icon name="lock" /> ของทีม</span>
            </div>
          ))}
          {pref.list.map((w) => {
            const n = countOf(w);
            return (
              <div key={w.id} className="flex items-center gap-2 py-2">
                <Icon name={watchSource(w.source)?.icon ?? "star"} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${w.on ? "text-slate-800" : "text-slate-400"}`}>{watchLabel(w, brandName)}</div>
                  <div className="text-[11px] text-slate-500">ของฉัน{n !== null ? ` · ตอนนี้ ${n} ใบ` : ""}{w.bounce ? " · Pet เด้งเมื่อมีใบใหม่" : ""}</div>
                </div>
                <button type="button" onClick={() => update(w.id, { bounce: !w.bounce })} title="ตัว Pet เด้งเมื่อมีใบใหม่"
                  className={`shrink-0 rounded-md px-1.5 py-1 text-xs ${w.bounce ? "text-indigo-600" : "text-slate-300"} hover:bg-slate-50`}><Icon name="notify" /></button>
                <Switch on={w.on} onChange={(v) => update(w.id, { on: v })} label={`${watchLabel(w, brandName)}: เปิดใช้`} />
                <button type="button" onClick={() => remove(w.id)} aria-label="ลบการเตือนนี้" title="ลบการเตือนนี้"
                  className="shrink-0 rounded-md px-1.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="delete" /></button>
              </div>
            );
          })}
          {team && !team.length && !pref.list.length && <p className="py-3 text-center text-xs text-slate-400">ยังไม่มีการเตือน — เพิ่มด้านล่างได้เลย</p>}
        </div>
      </section>

      {!src ? (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">ยังไม่มีหน้าที่คุณมีสิทธิ์ตั้งการเตือน</p>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="add" /> เพิ่มการเตือน</h3>
          <div className="mb-1 text-xs text-slate-500">1. เตือนจากหน้าไหน</div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <button key={s.key} type="button" onClick={() => { setSrcKey(s.key); setBrandIds([]); setWhen("all"); }} className={chip(s.key === src.key)} title={s.hint}>
                <Icon name={s.icon} /> {s.label}
              </button>
            ))}
          </div>
          {src.brands && (<>
            <div className="mb-1 mt-3 text-xs text-slate-500">2. แบรนด์ <span className="text-slate-400">(ไม่เลือก = ทุกแบรนด์)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {!srcData ? <span className="text-xs text-slate-400">กำลังโหลด…</span> : srcData.brands.map((b) => {
                const on = brandIds.includes(b.id);
                return (
                  <button key={b.id} type="button" onClick={() => setBrandIds(on ? brandIds.filter((x) => x !== b.id) : [...brandIds, b.id])} className={chip(on)}>
                    {b.name} <span className="text-slate-400">{b.count}</span>
                  </button>
                );
              })}
            </div>
          </>)}
          <div className="mb-1 mt-3 text-xs text-slate-500">{src.brands ? "3" : "2"}. เตือนเมื่อ</div>
          <div className="flex flex-wrap gap-1.5">
            {src.when.map((w) => <button key={w.key} type="button" onClick={() => setWhen(w.key)} className={chip(when === w.key)}>{w.label}</button>)}
          </div>
          <div className="mb-1 mt-3 text-xs text-slate-500">{src.brands ? "4" : "3"}. เตือนแบบไหน</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={chip(true)} title="ขึ้นเป็นแท็บ ของฉัน ในศูนย์แจ้งเตือนเสมอ">แท็บในศูนย์</span>
            <button type="button" onClick={() => setBounce(!bounce)} className={chip(bounce)}>Pet เด้งเมื่อมีใบใหม่</button>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="ตั้งชื่อเอง (ไม่ใส่ก็ได้)"
              className="h-7 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs" />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
            <div className="flex-1 text-sm text-slate-700">ตอนนี้ตรงเงื่อนไข <b className="text-indigo-700">{preview === null ? "…" : `${preview} ใบ`}</b></div>
            {full && <span className="text-[11px] text-amber-700">ครบ {MY_WATCHES_MAX} การเตือนแล้ว</span>}
            <button type="button" onClick={add} disabled={full}
              className="h-8 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">เพิ่มการเตือน</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** แท็บ "ของฉัน" ในศูนย์แจ้งเตือน */
export function WatchesTab({ watches, onGo }: { watches: WatchResult[]; onGo: (href: string) => void }) {
  if (!watches.some((w) => w.count > 0)) return (
    <div className="rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-700">ไม่มีอะไรตรงเงื่อนไขที่คุณตั้งไว้ตอนนี้</div>
  );
  return (
    <div className="space-y-4">
      {watches.filter((w) => w.count > 0).map((w) => (
        <section key={w.id}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="star" /> {w.label} <span className="font-normal text-slate-400">{w.count} ใบ</span></h3>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {w.items.map((it) => (
              <button key={it.id} type="button" onClick={() => onGo(it.path)} className="flex w-full gap-2.5 p-2 text-left hover:bg-slate-50">
                {it.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover" />
                  : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300"><Icon name="design" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{it.code && <span className="mr-1 text-slate-400">{it.code}</span>}{it.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{[it.brand, it.status].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={`shrink-0 text-[11px] ${it.flag.tone === "danger" ? "text-rose-600" : it.flag.tone === "warn" ? "text-amber-600" : "text-slate-400"}`}>{it.flag.text}</span>
              </button>
            ))}
          </div>
          {w.count > w.items.length && (
            <button type="button" onClick={() => onGo(watchSource(w.source)?.viewAll ?? "/")} className="mt-1.5 text-xs text-blue-700 hover:underline">และอีก {w.count - w.items.length} ใบ — ดูทั้งหมด →</button>
          )}
        </section>
      ))}
    </div>
  );
}
