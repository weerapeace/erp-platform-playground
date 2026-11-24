"use client";
/**
 * ศูนย์ร้านออนไลน์ (ส่วนแสดงผล) — เมนูของฉัน (หมุด) · ตัวเลขหลัก · การ์ดร้าน · งานที่ต้องทำ · ทางลัดทุกหน้า
 * เจ้าของเลือก 2026-11-24 widget รอบ 2: ข้อ 3 ปุ่มดึงออเดอร์ · ข้อ 4 หมุด = การ์ดแถวบน · ข้อ 6 แบบ B ซ่อนตามสิทธิ์ + "ใครเห็นเมนูไหน"
 * ข้อมูล: PortalResponse (lib/channel-portal) จาก /api/channel-portal · ทางลัด/กติกาการเห็น: lib/channel-portal
 * ของกลาง: useUserPref (หมุดต่อคน ตามไปทุกเครื่อง) · toast.undo (ย้อนกลับ) · PlatformIcon · Icon · state-views
 * ปุ่มดึงออเดอร์ = POST /api/platform-orders/pull ตัวเดิม (ดึงเข้ามาอย่างเดียว ไม่ส่งอะไรขึ้นร้าน · สิทธิ์ platform_orders.manage)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, type Permission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { agoText } from "@/lib/order-pull-health";
import {
  PORTAL_CONN_LABEL, PORTAL_GROUPS, PORTAL_PINS_KEY, PORTAL_PLATFORM_LABEL, RECONNECT_DANGER_DAYS,
  buildPortalTodos, movePin, parsePins, portalLinkByKey, portalLinkVisible, shopHref, togglePin,
  type PortalConn, type PortalLink, type PortalResponse, type PortalShop, type PortalTodo, type PortalTotals,
} from "@/lib/channel-portal";

const TODO_CLS: Record<PortalTodo["tone"], string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

function connCls(c: PortalConn, days: number | null): string {
  if (c === "connected" || c === "direct") return "bg-emerald-50 text-emerald-700";
  if (c === "expired" || (c === "expiring" && days != null && days <= RECONNECT_DANGER_DAYS)) return "bg-rose-50 text-rose-700";
  if (c === "expiring") return "bg-amber-50 text-amber-800";
  if (c === "file" || c === "email") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-500";
}

const thDate = (ms: number | string) => new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : null);

function connText(s: PortalShop): string {
  if (s.conn === "expiring" && s.token_days_left != null) return `เหลือ ${s.token_days_left} วัน`;
  return PORTAL_CONN_LABEL[s.conn];
}

export function ChannelPortalView({ data, onReload }: { data: PortalResponse; onReload: () => void }) {
  const { user, can, permsReady } = useAuth();
  const toast = useToast();
  const canPerm = (p: string) => !permsReady || can(p as Permission);
  const viewer = user ? { id: user.id, role: user.role } : null;
  const visible = (l: PortalLink) => portalLinkVisible(l, data.menus, permsReady ? viewer : null, canPerm);

  const [brand, setBrand] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pinsRaw, setPins] = useUserPref<string[]>(PORTAL_PINS_KEY, [], parsePins);
  const pins = pinsRaw.filter((k) => { const l = portalLinkByKey(k); return !!l && visible(l); });
  const now = Date.parse(data.now) || Date.now();

  const changePins = (next: string[], msg: string) => {
    const prev = pinsRaw;
    setPins(next);
    toast.undo(msg, () => setPins(prev));
  };

  const shops = brand ? data.shops.filter((s) => s.brand_id === brand || s.platform === "website") : data.shops;
  const totals: PortalTotals = useMemo(() => {
    if (!brand) return data.totals;
    const own = data.shops.filter((s) => s.brand_id === brand);
    const sum = (f: (s: PortalShop) => number | null) => (own.some((s) => f(s) != null) ? own.reduce((n, s) => n + (f(s) ?? 0), 0) : null);
    return {
      today_orders: sum((s) => s.today_orders), today_sales: sum((s) => s.today_sales), today_paid: null,
      to_ship: sum((s) => s.to_ship), unmatched: sum((s) => s.unmatched), dupes: sum((s) => s.dupes),
      price_low: data.totals.price_low == null ? null : data.price_low.filter((p) => p.brand_id === brand).length,
    };
  }, [brand, data]);
  const priceLow = brand ? data.price_low.filter((p) => p.brand_id === brand) : data.price_low;
  const todos = buildPortalTodos(totals, shops.filter((s) => s.platform !== "website")).filter((t) => !t.perm || canPerm(t.perm))
    // คนแพ็กที่ไม่มีสิทธิ์ดูศูนย์ออเดอร์ → การ์ดรอจัดส่งพาไปหน้าแพ็กแทน
    .map((t) => (t.key === "to_ship" && !canPerm("platform_orders.view") ? { ...t, href: "/packing", label: "ออเดอร์รอแพ็ก" } : t));
  const shipHref = canPerm("platform_orders.view") ? "/master/platform-orders" : "/packing";
  const sellingShops = shops.filter((s) => s.platform !== "website");
  const connectedN = sellingShops.filter((s) => s.conn === "connected" || s.conn === "expiring").length;
  const reconnectN = sellingShops.filter((s) => s.conn === "expiring" || s.conn === "expired").length;
  const soonest = sellingShops.map((s) => s.token_days_left).filter((d): d is number => d != null && d <= 30).sort((a, b) => a - b)[0];
  const canPull = canPerm("platform_orders.manage");

  const pull = async (s: PortalShop) => {
    setPulling(s.key);
    try {
      const r = await apiFetch("/api/platform-orders/pull", { method: "POST", body: JSON.stringify({ platform: s.platform, brand_id: s.brand_id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; created?: number; updated?: number };
      if (!r.ok || j.ok === false) toast.error(j.error || "ดึงออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      else { toast.success(`ดึงแล้ว — ใหม่ ${j.created ?? 0} · อัปเดต ${j.updated ?? 0}`); onReload(); }
    } catch { toast.error("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); }
    finally { setPulling(null); }
  };

  // จัดกลุ่มการ์ดร้านตามแบรนด์ (เว็บร้านอยู่ท้ายสุด — ใช้ทุกแบรนด์)
  const byBrand = useMemo(() => {
    const out: { id: string; name: string; shops: PortalShop[] }[] = [];
    for (const b of data.brands) { const list = shops.filter((s) => s.brand_id === b.id); if (list.length) out.push({ id: b.id, name: b.name, shops: list }); }
    const web = shops.filter((s) => s.platform === "website");
    if (web.length) out.push({ id: "web", name: "เว็บร้านของเรา (ทุกแบรนด์)", shops: web });
    return out;
  }, [data.brands, shops]);

  return (
    <div className="space-y-4">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <h1 className="text-xl font-semibold text-slate-900">ศูนย์ร้านออนไลน์</h1>
          <p className="text-sm text-slate-500">ทุกร้าน ทุกแบรนด์ ในหน้าเดียว</p>
        </div>
        <div className="flex items-center gap-2">
          {data.brands.length > 1 && (
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700" aria-label="เลือกแบรนด์">
              <option value="">ทุกแบรนด์</option>
              {data.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button type="button" onClick={onReload} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"><Icon name="refresh" />โหลดใหม่</button>
        </div>
      </div>

      {/* เมนูของฉัน (หมุด) */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="pin" />เมนูของฉัน</h2>
          {pins.length > 0 && (
            <button type="button" onClick={() => setEditing((v) => !v)} className="h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{editing ? "เสร็จ" : "จัดเรียง"}</button>
          )}
        </div>
        {pins.length === 0 ? (
          <p className="text-sm text-slate-400">ยังไม่ได้ปักหมุด — กดรูปหมุดที่ทางลัดด้านล่าง หน้านั้นจะขึ้นมาอยู่ตรงนี้ (จำแยกแต่ละคน)</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible">
            {pins.map((k, i) => {
              const l = portalLinkByKey(k)!;
              const body = (
                <>
                  <Icon name={l.icon} size={20} />
                  <div className="mt-1 text-sm font-medium leading-tight">{l.label}</div>
                  <div className="text-[11px] opacity-75 leading-tight">{l.hint}</div>
                </>
              );
              return editing ? (
                <div key={k} className="min-w-[140px] rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-violet-800">
                  {body}
                  <div className="mt-2 flex gap-1">
                    <button type="button" aria-label="เลื่อนซ้าย" disabled={i === 0} onClick={() => changePins(movePin(pinsRaw, pinsRaw.indexOf(k), -1), "จัดเรียงใหม่แล้ว")} className="h-7 w-7 rounded border border-violet-200 bg-white text-xs disabled:opacity-40">←</button>
                    <button type="button" aria-label="เลื่อนขวา" disabled={i === pins.length - 1} onClick={() => changePins(movePin(pinsRaw, pinsRaw.indexOf(k), 1), "จัดเรียงใหม่แล้ว")} className="h-7 w-7 rounded border border-violet-200 bg-white text-xs disabled:opacity-40">→</button>
                    <button type="button" aria-label="เอาออกจากเมนูของฉัน" onClick={() => changePins(togglePin(pinsRaw, k), `เอา "${l.label}" ออกแล้ว`)} className="ml-auto h-7 px-2 rounded border border-violet-200 bg-white text-xs">เอาออก</button>
                  </div>
                </div>
              ) : (
                <Link key={k} href={l.href} className="min-w-[140px] rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-violet-800 hover:bg-violet-100">{body}</Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ตัวเลขหลัก */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {totals.today_sales != null && (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs text-slate-500">ยอดขายวันนี้</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{baht(totals.today_sales)}</div>
            <div className="text-[11px] text-slate-400">{(totals.today_orders ?? 0).toLocaleString()} ออเดอร์{totals.today_paid != null ? ` · ลูกค้าจ่ายจริง ${baht(totals.today_paid)}` : ""}</div>
          </div>
        )}
        {totals.to_ship != null && (
          <Link href={shipHref} className="rounded-xl bg-slate-50 px-3 py-2.5 hover:bg-slate-100">
            <div className="text-xs text-slate-500">รอจัดส่ง</div>
            <div className={`text-2xl font-semibold tabular-nums ${totals.to_ship > 0 ? "text-rose-600" : "text-slate-900"}`}>{totals.to_ship.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400">ลูกค้าจ่ายแล้ว รอแพ็ก/ส่ง</div>
          </Link>
        )}
        {sellingShops.length > 0 && (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs text-slate-500">ร้านที่เชื่อมแล้ว</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{connectedN}/{sellingShops.length}</div>
            <div className="text-[11px] text-slate-400">ไม่นับเว็บร้านของเรา</div>
          </div>
        )}
        {sellingShops.length > 0 && (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs text-slate-500">ต้องเชื่อมใหม่</div>
            <div className={`text-2xl font-semibold tabular-nums ${reconnectN > 0 ? "text-amber-600" : "text-slate-900"}`}>{reconnectN}</div>
            <div className="text-[11px] text-slate-400">{soonest != null ? (soonest <= 0 ? "มีร้านหมดอายุแล้ว" : `เร็วสุดอีก ${soonest} วัน`) : "ยังไม่มีร้านใกล้หมดอายุ"}</div>
          </div>
        )}
      </div>

      {/* การ์ดร้าน + งานที่ต้องทำ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {byBrand.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="store" />ร้านทั้งหมด</h2>
            <div className="space-y-3">
              {byBrand.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 text-xs text-slate-400">{g.name}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3">
                    {g.shops.map((s) => {
                      const ago = agoText(minutesSince(s.pull?.at ?? null, now));
                      const pullable = canPull && (s.conn === "connected" || s.conn === "expiring" || s.conn === "direct");
                      return (
                        <div key={s.key} className="min-w-[200px] rounded-lg border border-slate-200 p-2.5">
                          <Link href={shopHref(s)} className="block hover:opacity-80">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-800"><PlatformIcon code={s.platform} size={18} /><span className="truncate">{PORTAL_PLATFORM_LABEL[s.platform]}</span></span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${connCls(s.conn, s.token_days_left)}`}>{connText(s)}</span>
                            </div>
                            <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                              {s.today_orders != null && <div>วันนี้ {s.today_orders.toLocaleString()} ใบ{s.today_sales ? ` · ${baht(s.today_sales)}` : ""}</div>}
                              {s.to_ship != null && s.to_ship > 0 && <div className="text-rose-600">รอส่ง {s.to_ship.toLocaleString()}</div>}
                              {(s.conn === "expiring" || s.conn === "expired") && s.token_expires_at && <div className="text-amber-700">ต้องเชื่อมใหม่ก่อน {thDate(s.token_expires_at)}</div>}
                              {s.conn === "file" && <div>ข้อมูลล่าสุด {s.listings_updated_at ? thDate(s.listings_updated_at) : "—"}</div>}
                              {s.listings != null && <div>สินค้าบนร้าน {s.listings.toLocaleString()}{s.unmatched ? ` · ยังไม่จับคู่ ${s.unmatched.toLocaleString()}` : ""}</div>}
                              {s.pull && s.conn !== "none" && s.conn !== "file" && <div className="text-slate-400">ดึงออเดอร์ล่าสุด {ago}</div>}
                              {s.conn === "none" && <div className="text-violet-700">กดเพื่อเชื่อมร้าน</div>}
                            </div>
                          </Link>
                          {pullable && (
                            <button type="button" disabled={pulling !== null} onClick={() => pull(s)}
                              className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              <Icon name="refresh" className={pulling === s.key ? "animate-spin" : ""} />{pulling === s.key ? "กำลังดึง…" : "ดึงออเดอร์ตอนนี้"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="flag" />งานที่ต้องทำ</h2>
          {todos.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"><Icon name="done" className="mr-1.5" />ไม่มีงานค้าง</div>
          ) : (
            <div className="space-y-1.5">
              {todos.map((t) => {
                const cls = `flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:brightness-95 ${TODO_CLS[t.tone]}`;
                const inner = (
                  <>
                    <span className="min-w-0"><span className="block text-sm font-medium">{t.label}</span><span className="block text-[11px] opacity-80">{t.hint}</span></span>
                    <span className="shrink-0 text-lg font-semibold tabular-nums">{t.count.toLocaleString()}</span>
                  </>
                );
                return t.href.startsWith("#")
                  ? <a key={t.key} href={t.href} className={cls}>{inner}</a>
                  : <Link key={t.key} href={t.href} className={cls}>{inner}</Link>;
              })}
            </div>
          )}
          {priceLow.length > 0 && (
            <div id="price-low" className="mt-3 scroll-mt-20">
              <div className="mb-1 text-xs font-medium text-slate-600">ราคาบนร้าน ฿1 หรือต่ำกว่า (เปิดขายอยู่)</div>
              <ul className="space-y-0.5">
                {priceLow.map((p) => (
                  <li key={p.listing_id}>
                    <Link href={p.platform === "website" ? "/website" : `/master/platform-catalog?${p.brand_id ? `brand=${encodeURIComponent(p.brand_id)}&` : ""}platform=${encodeURIComponent(p.platform)}&view=shop`}
                      className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                      <PlatformIcon code={p.platform} size={14} />
                      <span className="min-w-0 flex-1 truncate">{p.title || "(ไม่มีชื่อ)"}</span>
                      <span className="shrink-0 tabular-nums text-rose-600">{baht(p.price)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* ทางลัดทุกหน้า */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="grid-view" />ทางลัดทุกหน้า</h2>
          <span className="text-[11px] text-slate-400">กดรูปหมุดเพื่อเอาขึ้น "เมนูของฉัน"</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PORTAL_GROUPS.map((g) => {
            const links = g.links.filter(visible);
            if (links.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Icon name={g.icon} />{g.label}</div>
                <ul className="space-y-0.5">
                  {links.map((l) => {
                    const on = pinsRaw.includes(l.key);
                    return (
                      <li key={l.key} className="flex items-center gap-1">
                        <Link href={l.href} className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900" title={l.hint}>{l.label}</Link>
                        <button type="button" onClick={() => changePins(togglePin(pinsRaw, l.key), on ? `เอา "${l.label}" ออกจากเมนูของฉันแล้ว` : `ปักหมุด "${l.label}" แล้ว`)}
                          aria-label={on ? "เอาออกจากเมนูของฉัน" : "ปักหมุดไว้ที่เมนูของฉัน"} aria-pressed={on} title={on ? "เอาออกจากเมนูของฉัน" : "ปักหมุด"}
                          className={`h-8 w-8 shrink-0 rounded-md inline-flex items-center justify-center hover:bg-slate-100 ${on ? "text-violet-600" : "text-slate-300"}`}>
                          <Icon name="pin" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
