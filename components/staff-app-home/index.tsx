"use client";

/**
 * 📱 หน้าแรกของแอปพนักงาน (ของกลาง) — ปุ่มเมนูใหญ่ จัดเป็นหัวข้อ · ค้นหาเมนู · ปักโปรด · ใช้ล่าสุด · TH/EN
 * ใช้ที่: แอปเดี่ยว /app/<key> เมื่อแอปเป็น kind='staff' (app/app/[appKey]/page.tsx)
 *        + ตัวอย่างหน้าจอในตัวช่วยสร้าง (components/staff-app-builder · preview = กดแล้วไม่ไปไหน)
 * ปักโปรด / ใช้ล่าสุด = ต่อคน ตามไปทุกเครื่อง (useUserPref · user_ui_prefs) — ไม่ต้องมีตารางใหม่
 * ข้อความบนหน้าใช้ i18n กลาง (useT) · ชื่อเมนู/หัวข้อ EN มาจากที่แอดมินตั้งในแอปนี้ (lib/staff-apps)
 */
import { useCallback, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { useUserPref } from "@/lib/use-user-pref";

export type StaffHomeItem = { id: string; label: string; section: string; icon: string | null; icon_url?: string | null; badge?: number | null };

const RECENT_MAX = 6;
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 60) : null);

/** ปักโปรด / ใช้ล่าสุด ของแอปนี้ (ต่อคน) */
export function useStaffAppPrefs(appKey: string) {
  const [favs, setFavs] = useUserPref<string[]>(`staffapp:${appKey}:fav`, [], ids);
  const [recent, setRecent] = useUserPref<string[]>(`staffapp:${appKey}:recent`, [], ids);
  const toggleFav = useCallback((id: string) => setFavs(favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]), [favs, setFavs]);
  const pushRecent = useCallback((id: string) => {
    if (recent[0] === id) return;
    setRecent([id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX));
  }, [recent, setRecent]);
  return { favs, recent, toggleFav, pushRecent };
}

function ItemIcon({ it, size }: { it: StaffHomeItem; size: number }) {
  if (it.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(it.icon_url)}&w=96`} alt="" className="object-contain" style={{ width: size, height: size }} />;
  }
  return <span className="leading-none" style={{ fontSize: size * 0.85 }}><Icon value={it.icon ?? "📄"} /></span>;
}

export function StaffAppHome({ items, onOpen, favs = [], recent = [], onToggleFav, preview = false, notice }: {
  items: StaffHomeItem[];
  onOpen: (id: string) => void;
  favs?: string[];
  recent?: string[];
  onToggleFav?: (id: string) => void;
  /** ตัวอย่างในตัวช่วยสร้าง — ซ่อนช่องค้นหา/ปักโปรดที่ไม่มีความหมาย */
  preview?: boolean;
  /** กล่องบนสุด (เช่น ประกาศจากหัวหน้า — รอบ 3) */
  notice?: React.ReactNode;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const query = q.trim().toLowerCase();
  const shown = query ? items.filter((it) => it.label.toLowerCase().includes(query) || it.section.toLowerCase().includes(query)) : items;
  const groups = useMemo(() => {
    const m = new Map<string, StaffHomeItem[]>();
    for (const it of shown) { const k = it.section || ""; const a = m.get(k) ?? []; a.push(it); m.set(k, a); }
    return [...m.entries()];
  }, [shown]);
  const favItems = favs.map((id) => byId.get(id)).filter(Boolean) as StaffHomeItem[];
  const recentItems = recent.map((id) => byId.get(id)).filter((x): x is StaffHomeItem => !!x && !favs.includes(x.id)).slice(0, 4);

  const card = (it: StaffHomeItem) => {
    const fav = favs.includes(it.id);
    return (
      <div key={it.id} className="relative">
        <button type="button" onClick={() => onOpen(it.id)}
          className="flex min-h-[96px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:border-blue-300 hover:shadow active:scale-[0.98]">
          <ItemIcon it={it} size={34} />
          <span className="line-clamp-2 text-sm font-medium leading-tight text-slate-700">{it.label}</span>
        </button>
        {!!it.badge && it.badge > 0 && (
          <span className="pointer-events-none absolute right-2 top-2 min-w-[22px] rounded-full bg-rose-500 px-1.5 text-center text-xs font-semibold leading-[22px] text-white">{it.badge > 99 ? "99+" : it.badge}</span>
        )}
        {!preview && onToggleFav && (
          <button type="button" onClick={() => onToggleFav(it.id)} aria-pressed={fav}
            title={fav ? t("เลิกปักโปรด", "Unpin") : t("ปักโปรด", "Pin to favorites")}
            className={`absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-sm ${fav ? "text-amber-500" : "text-slate-300 hover:text-slate-500"}`}>
            {fav ? "★" : "☆"}
          </button>
        )}
      </div>
    );
  };
  const grid = (list: StaffHomeItem[]) => <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{list.map(card)}</div>;
  const head = (txt: string) => <h2 className="mb-2 mt-1 px-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{txt}</h2>;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-4 sm:py-6">
        {notice}
        {!preview && items.length > 6 && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search"
              placeholder={t("ค้นหาเมนูในแอปนี้…", "Search menus in this app…")}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </div>
        )}
        {!query && favItems.length > 0 && <section>{head(`★ ${t("โปรด", "Favorites")}`)}{grid(favItems)}</section>}
        {!query && recentItems.length > 0 && <section>{head(t("ใช้ล่าสุด", "Recent"))}{grid(recentItems)}</section>}
        {groups.map(([sec, list]) => (
          <section key={sec || "_"}>{(sec || groups.length > 1) && head(sec || t("ทั่วไป", "General"))}{grid(list)}</section>
        ))}
        {shown.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            {query ? t("ไม่พบเมนูที่ค้นหา — ลองคำอื่น", "No menu matches — try another word") : t("แอปนี้ยังไม่มีเมนูที่คุณเปิดได้", "No menus available to you in this app yet")}
          </div>
        )}
      </div>
    </div>
  );
}
