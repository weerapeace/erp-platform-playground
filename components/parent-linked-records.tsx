"use client";
/**
 * ParentLinkedRecords — "🔗 รายการที่เชื่อมกับสินค้านี้" (อยู่ในแท็บภาพรวมของ Parent SKU)
 *
 * เจ้าของขอ 2026-11-11: โชว์ทุกรายการที่ผูกกับรุ่นนี้ · กดไปที่รายการนั้นได้ · งานครีเอทีฟ/คอนเทนต์โชว์รูป · มีของใหม่ต้องไม่ลืม
 *   → แหล่งข้อมูลทั้งหมดมาจากทะเบียนกลาง lib/parent-links-registry (เพิ่มแหล่ง = แก้ทะเบียนที่เดียว)
 * กด: หน้าอื่น = เปิดแท็บใหม่ (ลิ้นชักนี้ยังอยู่) · สินค้าบนร้าน = ListingDrawer · ใบสั่งผลิต = MoStatusModal (ของกลาง)
 * ข้อมูล: GET /api/parent-skus/[id]/links (products.view)
 * ของกลางที่ใช้: HoverImage · state-views · ListingDrawer · MoStatusModal · r2ImageUrl
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { r2ImageUrl } from "@/lib/r2-image";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import type { LinkItem } from "@/lib/parent-links-registry";
import type { ParentLinkResult } from "@/lib/parent-links-server";

const ListingDrawer = dynamic(() => import("@/components/platform-catalog/listing-drawer").then((m) => m.ListingDrawer), { ssr: false });
const MoStatusModal = dynamic(() => import("@/components/mo-status-modal").then((m) => m.MoStatusModal), { ssr: false });

type Group = { key: string; label: string; icon: string };
const SHOW = 8;   // โชว์ก่อนกี่รายการต่อหมวด (ที่เหลือกด "ดูทั้งหมด")

const imgOf = (it: LinkItem) => (it.image?.url ? it.image.url : r2ImageUrl(it.image?.key ?? null, 320));
const thDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");

/** กดแถว/การ์ด: ป๊อปของกลาง (open) > ลิงก์ (แท็บใหม่) > ไม่มีที่ไป (div) — อยู่นอก component กันรูปโหลดใหม่ทุกครั้งที่วาดใหม่ */
function LinkWrap({ it, className, onOpen, children }: { it: LinkItem; className: string; onOpen: (it: LinkItem) => void; children: React.ReactNode }) {
  if (it.open) return <button type="button" onClick={() => onOpen(it)} className={`${className} text-left`}>{children}</button>;
  if (it.href) return <a href={it.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
  return <div className={className}>{children}</div>;
}

export function ParentLinkedRecords({ parentId }: { parentId: string }) {
  const { can } = useAuth();
  const [data, setData] = useState<{ groups: Group[]; sources: ParentLinkResult[] } | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openListing, setOpenListing] = useState<string | null>(null);
  const [openMo, setOpenMo] = useState<string | null>(null);
  const [lazyBusy, setLazyBusy] = useState<string | null>(null);   // แหล่งช้าที่กำลังกดค้น

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await apiFetch(`/api/parent-skus/${encodeURIComponent(parentId)}/links`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `โหลดไม่สำเร็จ (${r.status})`);
      setData({ groups: j.groups ?? [], sources: j.sources ?? [] });
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดรายการที่เชื่อมไม่สำเร็จ"); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  // แหล่งค้นช้า (lazy) — กดแล้วค่อยโหลดแหล่งนั้น แล้วแทนที่ในรายการ
  const loadLazy = async (key: string) => {
    setLazyBusy(key);
    try {
      const r = await apiFetch(`/api/parent-skus/${encodeURIComponent(parentId)}/links?only=${encodeURIComponent(key)}`);
      const j = await r.json();
      const got = ((j.sources ?? []) as ParentLinkResult[]).find((x) => x.key === key);
      if (got) setData((d) => d ? { ...d, sources: d.sources.map((x) => (x.key === key ? got : x)) } : d);
    } catch { /* ปุ่มยังอยู่ กดใหม่ได้ */ } finally { setLazyBusy(null); }
  };
  const lazySources = (data?.sources ?? []).filter((s) => s.lazy);

  const withItems = useMemo(() => (data?.sources ?? []).filter((s) => s.total > 0 || s.error), [data]);
  const groupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of withItems) m.set(s.group, (m.get(s.group) ?? 0) + s.total);
    return m;
  }, [withItems]);
  const total = [...groupCount.values()].reduce((a, b) => a + b, 0);

  if (err) return <ErrorState title="โหลดรายการที่เชื่อมไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="กำลังรวบรวมรายการที่เชื่อมกับสินค้านี้…" />;

  const onOpen = (it: LinkItem) => { if (it.open?.kind === "listing") setOpenListing(it.open.id); else if (it.open?.kind === "mo") setOpenMo(it.open.id); };
  const clickable = (it: LinkItem) => !!(it.href || it.open);

  const groups = data.groups.filter((g) => (groupCount.get(g.key) ?? 0) > 0 || withItems.some((s) => s.group === g.key));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 flex-wrap px-3 pt-3 pb-2 border-b border-slate-100">
        <span className="text-sm font-medium text-slate-800"><Icon value="🔗" size={16} className="inline-block align-[-3px] mr-1" />รายการที่เชื่อมกับสินค้านี้</span>
        <span className="text-xs text-slate-400 tabular-nums">{total} รายการ</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {[{ key: "all", label: "ทั้งหมด", icon: "" }, ...groups].map((g) => {
            const n = g.key === "all" ? total : (groupCount.get(g.key) ?? 0);
            const on = filter === g.key;
            return (
              <button key={g.key} type="button" onClick={() => setFilter(g.key)}
                className={`h-6 px-2 rounded-full text-[11.5px] border ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {g.icon ? `${g.icon} ` : ""}{g.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </span>
      </div>

      {total === 0 && withItems.length === 0 ? (
        <EmptyState className="m-3" title="ยังไม่มีรายการที่ผูกกับสินค้านี้" hint="งาน คอนเทนต์ ใบสั่งผลิต สินค้าบนร้าน ฯลฯ ที่ผูกกับรุ่นนี้จะขึ้นที่นี่เอง" />
      ) : (
        <div className="p-3 space-y-4">
          {groups.filter((g) => filter === "all" || filter === g.key).map((g) => (
            <section key={g.key} className="space-y-2.5">
              {filter === "all" && <div className="text-[11.5px] font-semibold text-slate-500"><Icon value={g.icon} size={14} className="inline-block align-[-2px] mr-1" />{g.label}</div>}
              {withItems.filter((s) => s.group === g.key).map((src) => {
                const open = expanded.has(src.key);
                const items = open ? src.items : src.items.slice(0, SHOW);
                return (
                  <div key={src.key}>
                    <div className="flex items-center gap-2 mb-1.5 text-xs">
                      <span className="text-slate-700 font-medium"><Icon value={src.icon} size={14} className="inline-block align-[-2px] mr-1" />{src.label}</span>
                      <span className="text-slate-400 tabular-nums">{src.total}{src.more ? "+" : ""}</span>
                      {src.hint && <span className="text-[11px] text-slate-400">· {src.hint}</span>}
                      {src.listHref && <a href={src.listHref} target="_blank" rel="noopener noreferrer" className="ml-auto text-[11px] text-violet-700 hover:underline">ไปหน้ารายการ ↗</a>}
                    </div>
                    {src.error ? (
                      <div className="text-[11.5px] text-amber-600">โหลดหมวดนี้ไม่สำเร็จ — {src.error}</div>
                    ) : src.thumbnails ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        {items.map((it) => {
                          const url = imgOf(it);
                          return (
                            <LinkWrap key={it.id} it={it} onOpen={onOpen} className={`group block rounded-lg border border-slate-200 overflow-hidden bg-white ${clickable(it) ? "hover:border-violet-300 hover:shadow-sm" : ""}`}>
                              <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                                {url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="text-2xl text-slate-300">{src.icon}</span>}
                              </div>
                              <div className="px-1.5 py-1">
                                <div className="text-[11.5px] text-slate-700 truncate" title={it.title}>{it.title}</div>
                                <div className="text-[10.5px] text-slate-400 truncate">{[it.status, thDate(it.date)].filter(Boolean).join(" · ") || " "}</div>
                              </div>
                            </LinkWrap>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                        {items.map((it) => (
                          <LinkWrap key={it.id} it={it} onOpen={onOpen} className={`flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] w-full ${clickable(it) ? "hover:bg-violet-50/50" : ""}`}>
                            {(it.image?.key || it.image?.url) && <HoverImage url={imgOf(it)} size={24} alt="" />}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-slate-700">{it.title}</span>
                              {it.sub && <span className="block truncate text-[11px] text-slate-400">{it.sub}</span>}
                            </span>
                            {it.status && <span className="shrink-0 text-[10.5px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{it.status === "cancelled" ? "ยกเลิก" : it.status}</span>}
                            {it.date && <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">{thDate(it.date)}</span>}
                            {clickable(it) && <span className="shrink-0 text-slate-300">{it.external ? "↗" : "›"}</span>}
                          </LinkWrap>
                        ))}
                      </div>
                    )}
                    {src.items.length > SHOW && (
                      <button type="button" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(src.key)) n.delete(src.key); else n.add(src.key); return n; })}
                        className="mt-1 text-[11.5px] text-violet-700 hover:underline">
                        {open ? "ย่อ" : `ดูทั้งหมด (${src.items.length}${src.more ? "+" : ""})`}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      {lazySources.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {lazySources.map((s) => (
            <button key={s.key} type="button" disabled={lazyBusy === s.key} onClick={() => void loadLazy(s.key)}
              title="ค้นช้า จึงไม่โหลดเองตอนเปิดแท็บ — กดเพื่อค้น"
              className="h-7 px-2.5 text-xs rounded-md border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              {lazyBusy === s.key ? "⏳ กำลังค้น…" : `🔍 ค้น${s.label}`}
            </button>
          ))}
        </div>
      )}
      <p className="px-3 pb-2 text-[10.5px] text-slate-400">รวมจากทะเบียนกลาง — มีเอกสารชนิดใหม่ที่ผูกกับสินค้า ระบบจะเตือนให้เพิ่มเข้ามาเอง</p>

      {openListing && <ListingDrawer listingId={openListing} canPublish={can("products.platforms.publish")} onClose={() => setOpenListing(null)} />}
      {openMo && <MoStatusModal moId={openMo} onClose={() => setOpenMo(null)} />}
    </div>
  );
}
