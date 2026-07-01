"use client";

/**
 * เชลล์เดี่ยวกลาง (standalone) /app/<appKey>
 * เปิด "โมดูลใหญ่ (App)" ใด ๆ เป็นแอปเดี่ยวบนมือถือ — เห็นแค่เมนูของ App นั้น
 * reuse หน้า master กลาง (MasterPage) ผ่าน ShellPresentContext (ไม่ซ้อน sidebar)
 * หมายเหตุ: /app/china-pay มีหน้า custom เฉพาะ (route นั้นชนะ dynamic นี้)
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { ShellPresentContext } from "@/components/playground-shell";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MasterPage = dynamic(() => import("@/components/master-page").then((m) => m.MasterPage), {
  ssr: false, loading: () => <div className="p-8 text-center text-slate-400 text-sm">กำลังโหลด…</div>,
});

type MenuItem = { id: string; label: string; href: string; icon: string | null; icon_url?: string | null; app_keys: string[]; is_active: boolean; show_in_sidebar: boolean; sort_order: number; permission_key: string | null };
// ไอคอนเมนู: รูปอัปโหลด (icon_url) > อิโมจิ
function MItemIcon({ it, cls }: { it: MenuItem; cls: string }) {
  if (it.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(it.icon_url)}&w=64`} alt="" className={`${cls} object-contain shrink-0`} />;
  }
  return <span className={`text-xl flex-shrink-0`}>{it.icon ?? "•"}</span>;
}
type AppGroup = { key: string; label: string; icon: string | null; permission_key: string | null; default_href: string | null };

export default function StandaloneApp() {
  const appKey = String(useParams().appKey ?? "");
  const { user, ready, can } = useAuth();
  const [app, setApp] = useState<AppGroup | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);   // มือถือ: sheet "เพิ่มเติม" (เมนูเกิน 5)
  const [drawerView, setDrawerView] = useState<"menu" | "settings" | "arrange">("menu");   // มุมมองใน drawer
  const [savingOrder, setSavingOrder] = useState(false);   // กำลังบันทึกลำดับเมนู
  const initedRef = useRef(false);   // ตั้งหน้าเริ่มต้น (default landing) แค่ครั้งแรก
  const [deepSrc, setDeepSrc] = useState<string | null>(null);   // หน้าลึกที่จำไว้ (กัน refresh เด้งหน้าแรก)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSavedRef = useRef<string>("");
  // ลากจัดลำดับเมนู: PointerSensor + ระยะกันลากพลาด (แตะธรรมดายังกดได้)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const stripEmbed = (p: string) => p.replace(/([?&])embed=1(&?)/, (_m, p1, p2) => (p2 ? p1 : "")).replace(/[?&]$/, "");

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch("/api/menu/apps").then((r) => r.json()),
      apiFetch("/api/menu").then((r) => r.json()),
    ]).then(([aj, mj]) => {
      if (!alive) return;
      const ag = (aj.data ?? []).find((x: AppGroup) => x.key === appKey) ?? null;
      setApp(ag);
      const its = ((mj.data ?? []) as MenuItem[])
        .filter((m) => m.is_active && m.show_in_sidebar && (m.app_keys ?? []).includes(appKey)
          && (!m.permission_key || can(m.permission_key as Parameters<typeof can>[0])))
        .sort((a, b) => a.sort_order - b.sort_order);
      setItems(its);
      // ครั้งแรกครั้งเดียว: คืนหน้าลึกที่จำไว้ (กัน refresh เด้งหน้าแรก) ไม่งั้นใช้ default landing
      if (!initedRef.current) {
        const saved = (() => { try { return sessionStorage.getItem(`appdeep:${appKey}`); } catch { return null; } })();
        const base = (h: string) => h.split("?")[0];
        const deepIdx = saved ? its.findIndex((m) => base(saved).startsWith(base(m.href))) : -1;
        if (saved && deepIdx >= 0) { setActive(deepIdx); setDeepSrc(saved); lastSavedRef.current = saved; }
        else if (ag?.default_href) { const i = its.findIndex((m) => m.href === ag.default_href); if (i >= 0) setActive(i); }
      }
      initedRef.current = true;
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // ใช้ ready (boolean ที่ flip ครั้งเดียว) ไม่ใช่ can (อาจเปลี่ยน reference) เพื่อกัน fetch วนไม่จบ
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [appKey, ready]);

  // จำหน้าลึกในกรอบ (iframe) ทุก 1.5วิ → refresh แล้วกลับมาหน้าเดิม (ฝั่ง browser ล้วน ไม่กิน CPU worker)
  useEffect(() => {
    const c = items[active];
    if (!c || c.href.startsWith("/m/")) return; // เฉพาะหน้า custom (ใช้ iframe)
    const id = setInterval(() => {
      try {
        const w = iframeRef.current?.contentWindow;
        if (!w) return;
        const path = stripEmbed(w.location.pathname + w.location.search);
        if (path && path !== lastSavedRef.current) { lastSavedRef.current = path; sessionStorage.setItem(`appdeep:${appKey}`, path); }
      } catch { /* ยังไม่พร้อม/อ่านไม่ได้ */ }
    }, 1500);
    return () => clearInterval(id);
  }, [appKey, active, items]);

  if (!ready) return <AppLoading />;
  if (!user) return (
    <Center>
      <div className="text-slate-500 mb-3">กรุณาเข้าสู่ระบบก่อนใช้งาน</div>
      <Link href={`/login?next=/app/${appKey}`} className="h-10 px-5 leading-10 bg-blue-600 text-white rounded-lg font-medium">เข้าสู่ระบบ</Link>
    </Center>
  );

  // ยังโหลดเมนู/สิทธิ์ไม่เสร็จ → โชว์หน้าโหลด (กัน empty state "ยังไม่มีรายการ" เด้งแว้บตอนยังโหลดไม่จบ)
  if (!loaded) return <AppLoading label={app?.label} icon={app?.icon} />;

  // กั้นเข้าแอปตามสิทธิ์ — แอปตั้ง permission_key แล้ว user ไม่มีสิทธิ์ → เข้าไม่ได้ (กันพิมพ์ URL ตรง)
  if (app?.permission_key && !can(app.permission_key as Parameters<typeof can>[0])) return (
    <Center>
      <div className="text-4xl mb-2">🔒</div>
      <div className="text-slate-700 font-medium mb-1">คุณไม่มีสิทธิ์เข้าแอปนี้</div>
      <div className="text-slate-400 text-sm mb-3">{app.label} · ต้องมีสิทธิ์ <code className="bg-slate-100 px-1 rounded">{app.permission_key}</code></div>
      <Link href="/apps" className="h-10 px-5 leading-10 bg-slate-100 text-slate-700 rounded-lg font-medium">← กลับหน้ารวมแอป</Link>
    </Center>
  );

  const cur = items[active];
  // เมนูที่เป็นตารางข้อมูล (/m/<entity>) → MasterPage · เมนูหน้า custom อื่น → โหลดหน้าจริงผ่าน iframe
  const isMasterItem = !!cur && cur.href.startsWith("/m/");
  const moduleKey = isMasterItem ? cur!.href.replace(/^\/m\//, "").split("?")[0] : null;

  // แถบล่าง (มือถือ): เกิน 5 เมนู → โชว์ 4 ตัวแรก + ปุ่ม "เพิ่มเติม" เปิด drawer เลือกที่เหลือ
  const hasMore = items.length > 5;
  const barItems = hasMore ? items.slice(0, 4) : items.slice(0, 5);
  const barCols = barItems.length + (hasMore ? 1 : 0);
  const onBar = active < barItems.length;   // เมนูที่กำลังเปิดอยู่ในแถบล่างไหม (ไม่งั้น highlight ปุ่มเพิ่มเติม)

  // กดเมนู → ไปหน้าหลักของเมนูนั้น (ล้างหน้าลึกที่จำไว้)
  const goto = (i: number) => { setActive(i); setDeepSrc(null); lastSavedRef.current = ""; try { sessionStorage.removeItem(`appdeep:${appKey}`); } catch { /* noop */ } setMoreOpen(false); };
  // หน้า custom โหลดผ่าน iframe → ส่ง embed=1 ให้ shell ในหน้านั้นซ่อน sidebar/แถบ App ของตัวเอง (กันเมนูซ้อน)
  // ถ้ามีหน้าลึกที่จำไว้และเป็นของเมนูนี้ → เปิดหน้าลึกนั้น (กัน refresh เด้งหน้าแรก)
  const baseHref = cur ? cur.href.split("?")[0] : "";
  const startHref = (deepSrc && cur && deepSrc.split("?")[0].startsWith(baseHref)) ? deepSrc : (cur?.href ?? "");
  const embedSrc = cur ? `${startHref}${startHref.includes("?") ? "&" : "?"}embed=1` : "";

  const isAdmin = can("admin.users" as Parameters<typeof can>[0]);
  const closeDrawer = () => { setMoreOpen(false); setDrawerView("menu"); };

  // บันทึกลำดับ: PATCH เฉพาะเมนูที่ค่า sort_order เปลี่ยน (เทียบด้วย id) — ต้องสิทธิ์ admin.users
  const persistOrder = async (prev: MenuItem[], next: MenuItem[]) => {
    setSavingOrder(true);
    try {
      const changed = next.filter((it) => { const b = prev.find((p) => p.id === it.id); return b && b.sort_order !== it.sort_order; });
      await Promise.all(changed.map((it) =>
        apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, patch: { sort_order: it.sort_order } }) })));
    } catch { /* เงียบไว้ — ลำดับยังอัปเดตบนจอแล้ว */ } finally { setSavingOrder(false); }
  };

  // ลากเสร็จ: สลับตำแหน่ง แล้วแจกค่า sort_order เดิม (ของแอปนี้) ตามลำดับใหม่ → ไม่กระทบเมนูแอปอื่น
  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIdx = items.findIndex((it) => it.id === a.id);
    const newIdx = items.findIndex((it) => it.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const slots = items.map((it) => it.sort_order);            // ค่า sort_order เดิม (เรียงจากน้อยไปมากอยู่แล้ว)
    const reassigned = arrayMove(items, oldIdx, newIdx).map((it, k) => ({ ...it, sort_order: slots[k] }));
    const curHref = items[active]?.href;
    setItems(reassigned);
    if (curHref) { const ni = reassigned.findIndex((it) => it.href === curHref); if (ni >= 0) setActive(ni); }
    void persistOrder(items, reassigned);
  };

  return (
    // h-dvh + flex column: header บน · เนื้อหาเต็มกว้าง · เมนูแบบพับ-ขยาย (iPad: ☰ drawer ซ้าย · มือถือ: แถบล่าง)
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden">
      <header className="flex-shrink-0 z-20 bg-gradient-to-r from-blue-700 to-indigo-600 text-white px-4 flex items-center justify-between"
        style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="py-3 flex items-center gap-2 w-full min-w-0">
          {/* ปุ่มพับ-ขยายเมนู (iPad/จอกว้าง) — มือถือใช้แถบล่างแทน */}
          {items.length > 0 && (
            <button onClick={() => setMoreOpen(true)} aria-label="เปิดเมนู"
              className="hidden md:flex items-center justify-center h-9 w-9 -ml-1 rounded-lg hover:bg-white/15 text-xl flex-shrink-0">☰</button>
          )}
          <div className="font-semibold text-lg truncate flex-1 min-w-0">{app?.icon ?? "🧩"} {app?.label ?? appKey}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PwaInstallButton />
            <div className="text-xs opacity-90 hidden sm:block truncate max-w-[120px]">{user.name}</div>
          </div>
        </div>
      </header>

      {/* เนื้อหาเต็มกว้าง */}
      <main className="flex-1 min-w-0 flex flex-col min-h-0">
        {moduleKey ? (
          <div className="flex-1 overflow-y-auto">
            <ShellPresentContext.Provider value={true}>
              <MasterPage key={moduleKey} apiPath={moduleKey} moduleKey={moduleKey} title={cur!.label} icon={cur!.icon ?? "🧩"} />
            </ShellPresentContext.Provider>
          </div>
        ) : cur ? (
          // หน้า custom → แสดงหน้าจริงแบบ embed (ไม่มี sidebar ของ shell) เต็มพื้นที่ที่เหลือ
          <iframe ref={iframeRef} key={cur.href} src={embedSrc} title={cur.label} className="flex-1 w-full border-0" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center gap-2">
            <div className="text-4xl mb-1">🗂️</div>
            <div className="text-slate-600 font-medium">ยังไม่มีรายการใน {app?.label ?? "App"} นี้</div>
            <div className="text-slate-400 text-sm max-w-xs">เพิ่มเมนู/หน้าเข้ามาได้ที่ <span className="font-medium text-slate-500">ตั้งค่า → จัดการเมนู</span> แล้วเลือก App นี้</div>
            {can("admin.users") && (
              <Link href="/admin/menu" className="mt-2 h-9 px-4 leading-9 bg-blue-600 text-white rounded-lg text-sm font-medium">ไปจัดการเมนู</Link>
            )}
          </div>
        )}
      </main>

      {/* มือถือ: แถบเมนูล่าง (iPad ซ่อน เพราะใช้ ☰ drawer แทน) */}
      {items.length > 0 && (
        <nav className="md:hidden flex-shrink-0 bg-white border-t border-slate-200 grid z-20"
          style={{ gridTemplateColumns: `repeat(${barCols}, minmax(0,1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {barItems.map((it, i) => (
            <button key={it.href} onClick={() => goto(i)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${active === i ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
              <MItemIcon it={it} cls="w-6 h-6" />
              <span className="truncate max-w-[72px]">{it.label}</span>
            </button>
          ))}
          {hasMore && (
            <button onClick={() => setMoreOpen(true)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs ${!onBar ? "text-blue-700 font-semibold" : "text-slate-400"}`}>
              <span className="text-xl">☰</span>
              <span className="truncate max-w-[72px]">เพิ่มเติม</span>
            </button>
          )}
        </nav>
      )}

      {/* เมนูพับ-ขยาย (drawer) — มือถือ: sheet ขึ้นจากล่าง · iPad/จอกว้าง: แผงเลื่อนจากซ้าย */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end md:flex-row md:justify-start" onClick={closeDrawer}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(e) => e.stopPropagation()}
            className="relative bg-white flex flex-col rounded-t-2xl max-h-[80vh] md:rounded-none md:max-h-none md:h-full md:w-72 md:shadow-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {/* หัว — เปลี่ยนตามมุมมอง (เมนู / ตั้งค่า / จัดลำดับ) */}
            <div className="flex-shrink-0 bg-white px-3 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              {drawerView === "menu" ? (
                <div className="font-semibold text-slate-800 truncate px-1">{app?.icon ?? "🧩"} {app?.label ?? "เมนูทั้งหมด"}</div>
              ) : (
                <button onClick={() => setDrawerView(drawerView === "arrange" ? "settings" : "menu")}
                  className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 px-1">‹ กลับ</button>
              )}
              <div className="flex items-center gap-1">
                {drawerView !== "menu" && <span className="font-semibold text-slate-800 text-sm">{drawerView === "arrange" ? "↕ จัดลำดับเมนู" : "⚙️ ตั้งค่า"}</span>}
                <button onClick={closeDrawer} aria-label="ปิด" className="text-slate-400 text-xl leading-none px-2">✕</button>
              </div>
            </div>

            {/* เนื้อหา */}
            <div className="flex-1 overflow-y-auto p-2">
              {/* --- มุมมอง: รายการเมนู --- */}
              {drawerView === "menu" && items.map((it, i) => (
                <button key={it.href} onClick={() => goto(i)}
                  className={`w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 ${active === i ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <MItemIcon it={it} cls="w-6 h-6" />
                  <span className="truncate">{it.label}</span>
                </button>
              ))}

              {/* --- มุมมอง: ตั้งค่า --- */}
              {drawerView === "settings" && (
                <div className="space-y-1">
                  {isAdmin ? (
                    <>
                      <button onClick={() => setDrawerView("arrange")}
                        className="w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50">
                        <span className="text-xl flex-shrink-0">↕</span><span className="flex-1">จัดลำดับเมนู</span><span className="text-slate-300">›</span>
                      </button>
                      <a href="/admin/menu" className="w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50">
                        <span className="text-xl flex-shrink-0">🗂️</span><span className="flex-1">จัดการเมนู (เพิ่ม/ซ่อน/เลือกแอป)</span><span className="text-slate-300">↗</span>
                      </a>
                    </>
                  ) : (
                    <p className="px-3 py-3 text-xs text-slate-400">การจัดลำดับ/จัดการเมนูเปิดให้เฉพาะผู้ดูแลระบบ</p>
                  )}
                  <a href="/apps" className="w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50">
                    <span className="text-xl flex-shrink-0">🏠</span><span className="flex-1">หน้ารวมแอปทั้งหมด</span><span className="text-slate-300">↗</span>
                  </a>
                </div>
              )}

              {/* --- มุมมอง: จัดลำดับเมนู (ลากวาง) --- */}
              {drawerView === "arrange" && (
                <>
                  <p className="px-2 pb-2 text-xs text-slate-400">ลากจุด ⠿ เพื่อสลับลำดับ — บันทึกอัตโนมัติ{savingOrder ? " · กำลังบันทึก…" : ""}</p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {items.map((it) => <SortableMenuRow key={it.id} it={it} isActive={items[active]?.href === it.href} />)}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <button onClick={() => setDrawerView("settings")}
                    className="mt-3 w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>
                </>
              )}
            </div>

            {/* ท้าย — ปุ่มตั้งค่า (เฉพาะมุมมองเมนู) ปักอยู่ล่างสุดเสมอ */}
            {drawerView === "menu" && (
              <div className="flex-shrink-0 border-t border-slate-100 p-2">
                <button onClick={() => setDrawerView("settings")}
                  className="w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 text-slate-600 hover:bg-slate-50">
                  <span className="text-xl flex-shrink-0">⚙️</span><span>ตั้งค่า</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">{children}</div>;
}

// แถวเมนูแบบลากได้ (โหมดจัดลำดับ) — touch-none ให้ลากด้วยนิ้วบน iPad/มือถือได้
function SortableMenuRow({ it, isActive }: { it: MenuItem; isActive: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`w-full px-3 py-3 rounded-lg text-left text-sm flex items-center gap-3 border touch-none select-none cursor-grab active:cursor-grabbing ${isDragging ? "border-blue-300 bg-blue-50 shadow" : "border-transparent bg-slate-50"} ${isActive ? "text-blue-700 font-semibold" : "text-slate-700"}`}>
      <span className="text-slate-300 text-lg flex-shrink-0 leading-none">⠿</span>
      <span className="text-xl flex-shrink-0">{it.icon ?? "•"}</span>
      <span className="truncate flex-1">{it.label}</span>
    </div>
  );
}

// หน้าโหลดของแอปเดี่ยว — ใช้ธีมเดียวกับ shell (header gradient) + ไอคอนแอปเด้งเบา ๆ + วงแหวนหมุน
// โชว์ระหว่างโหลด auth/เมนู/สิทธิ์ เพื่อไม่ให้ empty state เด้งแว้บ
function AppLoading({ label, icon }: { label?: string | null; icon?: string | null }) {
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 overflow-hidden">
      {/* แถบหัวธีมเดียวกับแอปจริง → พอโหลดเสร็จเปลี่ยนแค่เนื้อหา (ลื่น ไม่กระพริบ) */}
      <header className="flex-shrink-0 bg-gradient-to-r from-blue-700 to-indigo-600 px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="py-3 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center text-lg">{icon ?? "🧩"}</div>
          {label
            ? <div className="font-semibold text-lg text-white truncate">{label}</div>
            : <div className="h-5 w-36 rounded-md bg-white/20 animate-pulse" />}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 animate-ping opacity-60" />
          <div className="absolute inset-0 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-3xl">{icon ?? "🧩"}</div>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
          กำลังเปิด{label ? ` ${label}` : "แอป"}…
        </div>
      </div>
    </div>
  );
}
