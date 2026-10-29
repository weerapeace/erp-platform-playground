"use client";
/**
 * 📱 แอปเดี่ยว "แจ้งเตือน ERP" (/notify) — รายการแจ้งเตือนของฉันบนมือถือ + เด้งแจ้งเตือนเข้าเครื่อง (Web Push)
 *
 * - รายการ = ข้อมูลเดียวกับกระดิ่ง (/api/notifications) · จุดฟ้า = ยังไม่อ่าน · อ่านหมด
 * - กดเรื่อง → เปิดหน้านั้นในแอป (iframe ?embed=1 ซ่อนเมนู ERP) มีปุ่มกลับ / เปิดเต็มจอ
 * - ⚙️ ตั้งค่า = เปิด/ปิดรับบนเครื่องนี้ · ส่งทดสอบ · เปิด/ปิดรายประเภท (lib/push-categories) · เครื่องที่เปิดรับ
 * - กดแจ้งเตือนบนมือถือ → service worker เปิด /notify?open=<id>
 * ของกลางที่ใช้: useAuth · useWebPush (components/web-push) · usePwaInstall · state-views · toast · askConfirm
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { IOS_INSTALL_HINT, UNSUPPORTED_INSTALL_HINT, SAMSUNG_INSTALL_HINT, openInChrome, usePwaInstall } from "@/components/pwa-install-button";
import { relTime } from "@/components/notification-bell";
import { isStandalone, useWebPush } from "@/components/web-push";
import { useViewportLayout } from "@/components/device-view";
import { QrCode } from "@/components/qr-code";
import { AppIconEditButton, useAppBranding } from "@/components/app-icon-editor";
import { appIconUrl } from "@/lib/app-branding";
import { PUSH_CATEGORIES, pushCategoryIcon } from "@/lib/push-categories";
import type { Notification, NotificationsResponse } from "@/app/api/notifications/route";

const POLL_MS = 30_000;
const PAGE = 50;
const FILTER_KEY = "notify_filter";

type Filter = "all" | "unread";

function withEmbed(url: string): string {
  const [base, hash] = url.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}embed=1${hash ? `#${hash}` : ""}`;
}

export function NotifyApp() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const brand = useAppBranding("notify");
  if (!ready) return <Screen><LoadingState /></Screen>;
  if (!user) {
    return (
      <Screen>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appIconUrl("notify", 192, brand.version)} alt="" className="w-20 h-20 rounded-[22%]" />
          <div>
            <h1 className="text-lg font-semibold text-slate-800">แจ้งเตือน ERP</h1>
            <p className="text-sm text-slate-500 mt-1">เข้าสู่ระบบเพื่อดูแจ้งเตือนของคุณ และรับแจ้งเตือนเด้งเข้ามือถือ</p>
          </div>
          <button onClick={() => router.push("/login?next=/notify")}
            className="h-11 px-6 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700">เข้าสู่ระบบ</button>
          <p className="text-xs text-slate-400 max-w-xs">iPhone: ในแอปนี้ให้ล็อกอินด้วย “รหัสผ่าน” หรือ “PIN” — ลิงก์ทางอีเมลจะไปเปิดใน Safari แทนแอป</p>
        </div>
      </Screen>
    );
  }
  return <NotifyHome />;
}

function Screen({ children }: { children: React.ReactNode }) {
  const viewport = useViewportLayout();
  const [installed, setInstalled] = useState(true);   // เริ่ม true = ไม่โชว์ QR ก่อนรู้ว่าเป็นโหมดแอปหรือไม่ (กันกระพริบ)
  useEffect(() => { setInstalled(isStandalone()); }, []);

  // เปิดบนคอม (ไม่ใช่แอปที่ติดตั้งแล้ว) → แอปอยู่ในกรอบขนาดมือถือ + QR ให้สแกนไปติดตั้งบนมือถือ
  if (viewport === "desktop" && !installed) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 text-slate-800 flex items-start justify-center gap-6 p-6">
        <div className="w-[400px] h-[calc(100dvh-3rem)] flex flex-col bg-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {children}
        </div>
        <InstallQrCard />
      </div>
    );
  }
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 text-slate-800"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {children}
    </div>
  );
}

/** QR สแกนด้วยกล้องมือถือ → เปิด /notify บนมือถือ → ติดตั้งลงหน้าจอ (ใช้ QrCode ของกลาง + ไอคอนแอปกลาง QR) */
function InstallQrCard() {
  const [url, setUrl] = useState("");
  const brand = useAppBranding("notify");
  useEffect(() => { setUrl(`${window.location.origin}/notify`); }, []);
  return (
    <aside className="w-72 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center sticky top-6">
      <h2 className="text-base font-semibold text-slate-800">📱 ติดตั้งบนมือถือ</h2>
      <p className="text-xs text-slate-500 mt-1">สแกนด้วย <b>กล้องมือถือ</b> แล้วเปิดลิงก์</p>
      <div className="flex justify-center my-4">
        <QrCode text={url || null} size={200} logo={appIconUrl("notify", 192, brand.version)} alt="QR เปิดแอปแจ้งเตือนบนมือถือ" className="border border-slate-100" />
      </div>
      <AppIconEditButton appKey="notify" branding={brand} className="mb-3" />
      <ol className="text-left text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
        <li><b>Android:</b> เปิดด้วย Chrome → ล็อกอิน → ⚙️ → “ติดตั้งแอป”</li>
        <li><b>iPhone:</b> เปิดด้วย Safari → แชร์ (▢↑) → “เพิ่มไปยังหน้าจอโฮม” → เปิดจากไอคอน → ล็อกอินด้วยรหัสผ่าน/PIN</li>
        <li>ในแอป: ⚙️ → “เปิดรับแจ้งเตือนบนเครื่องนี้” → อนุญาต → “ส่งแจ้งเตือนทดสอบ”</li>
      </ol>
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-3 text-left">อย่าสแกนผ่าน LINE — จะเปิดในหน้าต่าง LINE ซึ่งติดตั้งแอปไม่ได้</p>
      <p className="text-[11px] text-slate-400 mt-3 break-all">{url}</p>
    </aside>
  );
}

function NotifyHome() {
  const toast = useToast();
  const push = useWebPush();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilterState] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "settings">("list");
  const [viewer, setViewer] = useState<Notification | null>(null);
  const pendingOpen = useRef<string | null>(null);

  useEffect(() => {
    try { const f = localStorage.getItem(FILTER_KEY); if (f === "unread" || f === "all") setFilterState(f); } catch { /* */ }
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) { pendingOpen.current = id; window.history.replaceState(null, "", "/notify"); }
  }, []);
  const setFilter = (f: Filter) => { setFilterState(f); setLimit(PAGE); try { localStorage.setItem(FILTER_KEY, f); } catch { /* */ } };

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/notifications?limit=${limit}${filter === "unread" ? "&unread_only=true" : ""}`);
      const j: NotificationsResponse = await res.json();
      if (j.error) throw new Error(j.error);
      setItems(j.data); setUnread(j.unread_count); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [filter, limit]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  // ตัวเลขบนไอคอนแอป (เครื่องที่รองรับ)
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!isStandalone() || !nav.setAppBadge) return;
    (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => {});
  }, [unread]);

  const markRead = useCallback(async (n: Notification) => {
    if (n.read_at) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread((c) => Math.max(0, c - 1));
    try {
      await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
    } catch { /* ครั้งถัดไปที่โหลดจะแก้ให้ */ }
  }, []);

  const openItem = useCallback((n: Notification) => {
    void markRead(n);
    // ป๊อปเตือนงาน (?popup=) ไม่ขึ้นในกรอบ → เปิดหน้าเต็มให้ป๊อปเด้ง
    if (n.link_url && /[?&]popup=/.test(n.link_url)) { window.location.href = n.link_url; return; }
    setViewer(n);
  }, [markRead]);

  const openById = useCallback(async (id: string | null) => {
    if (!id) { setViewer(null); setView("list"); void load(); return; }
    let n = items.find((x) => x.id === id);
    if (!n) {
      try {
        const res = await apiFetch("/api/notifications?limit=200&include_snoozed=true");
        const j: NotificationsResponse = await res.json();
        n = j.data?.find((x) => x.id === id);
      } catch { /* */ }
    }
    if (n) { setView("list"); openItem(n); }
  }, [items, load, openItem]);

  // เปิดจากการกดแจ้งเตือนบนมือถือ (?open=<id>) หลังรายการโหลดเสร็จ
  useEffect(() => {
    if (loading || !pendingOpen.current) return;
    const id = pendingOpen.current; pendingOpen.current = null;
    void openById(id);
  }, [loading, openById]);

  // ข้อความจาก service worker: มี push ใหม่ / ผู้ใช้กดแจ้งเตือนตอนแอปเปิดอยู่
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: string | null } | null;
      if (d?.type === "notify:push") void load();
      if (d?.type === "notify:open") void openById(d.id ?? null);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [load, openById]);

  const markAllRead = async () => {
    setItems((p) => p.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
    setUnread(0);
    try {
      await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (filter === "unread") void load();
    } catch { toast.error("ทำเครื่องหมายอ่านแล้วไม่สำเร็จ"); void load(); }
  };

  if (viewer) return <Viewer n={viewer} onBack={() => { setViewer(null); void load(); }} />;
  if (view === "settings") return <Settings push={push} onBack={() => setView("list")} />;

  const showEnableBanner = !push.loading && !push.subscribed;

  return (
    <Screen>
      <header className="bg-white border-b border-slate-200 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold flex-1">แจ้งเตือน</h1>
          <button onClick={() => { setLoading(true); void load(); }} aria-label="โหลดใหม่"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">↻</button>
          <button onClick={() => setView("settings")} aria-label="ตั้งค่า"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">⚙️</button>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-8 px-3 rounded-full text-sm border ${filter === f ? "bg-blue-50 border-blue-200 text-blue-700 font-medium" : "border-slate-200 text-slate-600"}`}>
              {f === "all" ? "ทั้งหมด" : `ยังไม่อ่าน${unread ? ` ${unread > 99 ? "99+" : unread}` : ""}`}
            </button>
          ))}
          {unread > 0 && <button onClick={markAllRead} className="ml-auto text-sm text-blue-600 px-2 h-8">อ่านหมด</button>}
        </div>
      </header>

      {showEnableBanner && (
        <button onClick={() => setView("settings")}
          className="mx-3 mt-3 text-left rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center gap-2">
          <span className="text-xl">🔕</span>
          <span className="flex-1 text-sm text-amber-800">
            <b className="font-semibold">ยังไม่เปิดเด้งแจ้งเตือนบนเครื่องนี้</b>
            <span className="block text-xs text-amber-700">แตะเพื่อตั้งค่า</span>
          </span>
          <span className="text-amber-600">›</span>
        </button>
      )}

      <main className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? <LoadingState />
          : error && items.length === 0 ? <div className="p-3"><ErrorState hint={error} onRetry={() => { setLoading(true); void load(); }} /></div>
          : items.length === 0 ? (
            <div className="p-3">
              <EmptyState icon="🔔" title={filter === "unread" ? "อ่านครบแล้ว" : "ยังไม่มีแจ้งเตือน"}
                hint={filter === "unread" ? "ไม่มีเรื่องค้างอ่าน" : "เมื่อมีงานหรือเอกสารถึงคุณ จะขึ้นที่นี่"}
                action={filter === "unread" ? { label: "ดูทั้งหมด", onClick: () => setFilter("all") } : undefined} />
            </div>
          ) : (
            <ul className="bg-white">
              {items.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <li key={n.id} className="border-b border-slate-100">
                    <button onClick={() => openItem(n)}
                      className={`w-full text-left px-4 py-3 flex gap-3 active:bg-slate-100 ${isUnread ? "bg-blue-50/50" : ""}`}>
                      <span className="text-xl leading-none mt-0.5 w-6 text-center">{pushCategoryIcon(n.event_type)}</span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[15px] leading-snug ${isUnread ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                          {n.priority === "high" && <span className="text-red-600 mr-1">●</span>}{n.title}
                        </span>
                        {n.body && <span className="block text-sm text-slate-500 mt-0.5 whitespace-pre-line line-clamp-3">{n.body}</span>}
                        <span className="block text-xs text-slate-400 mt-1">{relTime(n.created_at)}</span>
                      </span>
                      {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-label="ยังไม่อ่าน" />}
                    </button>
                  </li>
                );
              })}
              {items.length >= limit && limit < 200 && (
                <li className="p-3 text-center">
                  <button onClick={() => setLimit((l) => Math.min(200, l + PAGE))}
                    className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600">โหลดเพิ่ม</button>
                </li>
              )}
            </ul>
          )}
      </main>
    </Screen>
  );
}

// ---- เปิดดูเรื่อง (หน้าจริงของ ERP ในกรอบ) ----
function Viewer({ n, onBack }: { n: Notification; onBack: () => void }) {
  const src = useMemo(() => (n.link_url ? withEmbed(n.link_url) : null), [n.link_url]);
  return (
    <Screen>
      <header className="bg-white border-b border-slate-200 px-2 h-12 flex items-center gap-1">
        <button onClick={onBack} className="h-10 px-2 rounded-lg hover:bg-slate-100 text-blue-600 text-sm font-medium flex items-center gap-1">‹ กลับ</button>
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{n.title}</span>
        {n.link_url && (
          <a href={n.link_url} className="h-10 px-2 rounded-lg hover:bg-slate-100 text-slate-500 text-sm flex items-center" title="เปิดเต็มจอ">↗</a>
        )}
      </header>
      {src ? (
        <iframe key={src} src={src} title={n.title} className="flex-1 w-full border-0 bg-white" />
      ) : (
        <div className="p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl mb-2">{pushCategoryIcon(n.event_type)}</div>
            <h2 className="font-semibold text-slate-900">{n.title}</h2>
            {n.body && <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{n.body}</p>}
            <p className="text-xs text-slate-400 mt-3">{relTime(n.created_at)}</p>
          </div>
        </div>
      )}
    </Screen>
  );
}

// ---- ตั้งค่า ----
type PushApi = ReturnType<typeof useWebPush>;

function Settings({ push, onBack }: { push: PushApi; onBack: () => void }) {
  const toast = useToast();
  const pwa = usePwaInstall();
  const brand = useAppBranding("notify");
  const [testing, setTesting] = useState(false);

  const enable = async () => {
    const ok = await push.enable();
    if (ok) toast.success("เปิดรับแจ้งเตือนบนเครื่องนี้แล้ว");
    else if (Notification.permission === "denied") toast.warning("เครื่องนี้ไม่อนุญาตแจ้งเตือน — เปิดได้ที่การตั้งค่าของเครื่อง");
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await apiFetch("/api/push/test", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "ส่งไม่สำเร็จ");
      if (j.sent > 0) toast.success(`ส่งแล้ว ${j.sent} เครื่อง — รอเด้งภายในไม่กี่วินาที`);
      else if (j.queued) toast.info("ระบบกำลังส่ง — รอเด้งภายในไม่กี่วินาที");
      else if (j.failed > 0) toast.warning("ส่งไม่ถึงบางเครื่อง — ดูสถานะในรายการเครื่องด้านล่าง");
      else toast.info("ไม่มีเครื่องที่ต้องส่ง");
      setTimeout(() => { void push.refreshDevices(); }, 2500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally { setTesting(false); }
  };

  const toggleCat = async (key: string, on: boolean) => {
    const off = on ? push.prefs.off.filter((k) => k !== key) : [...push.prefs.off, key];
    try { await push.savePrefs({ off }); } catch { toast.error("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  };

  const removeDevice = async (id: string, label: string | null) => {
    const ok = await askConfirm({ title: "เลิกส่งแจ้งเตือนเข้าเครื่องนี้?", message: `${label ?? "เครื่องนี้"} จะไม่ได้รับแจ้งเตือนเด้งอีก (เปิดใหม่ได้จากแอปบนเครื่องนั้น)`, confirmText: "เลิกส่ง", variant: "danger" });
    if (!ok) return;
    try {
      if (id === push.thisDeviceId) await push.disable(); else await push.removeDevice(id);
      toast.success("ลบเครื่องออกแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <Screen>
      <header className="bg-white border-b border-slate-200 px-2 h-12 flex items-center gap-1">
        <button onClick={onBack} className="h-10 px-2 rounded-lg hover:bg-slate-100 text-blue-600 text-sm font-medium">‹ กลับ</button>
        <h1 className="flex-1 text-center text-base font-semibold pr-12">ตั้งค่าแจ้งเตือน</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* เครื่องนี้ */}
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">เด้งแจ้งเตือนบนเครื่องนี้</h2>
          {push.loading ? <p className="text-sm text-slate-400">กำลังตรวจ...</p>
            : push.support === "ios_needs_install" ? (
              <div className="text-sm text-slate-600 space-y-2">
                <p className="text-amber-700 font-medium">iPhone/iPad ต้องเพิ่มแอปลงหน้าจอโฮมก่อน</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>เปิดหน้านี้ด้วย <b>Safari</b></li>
                  <li>กดปุ่ม แชร์ (▢↑) → <b>“เพิ่มไปยังหน้าจอโฮม”</b></li>
                  <li>เปิดแอป “แจ้งเตือน” จากไอคอนบนหน้าจอ แล้วกลับมาหน้านี้</li>
                </ol>
                <p className="text-xs text-slate-400">ต้องเป็น iOS 16.4 ขึ้นไป</p>
              </div>
            ) : push.support === "unsupported" ? (
              <p className="text-sm text-slate-600">เบราว์เซอร์นี้ส่งแจ้งเตือนเด้งไม่ได้ — ลองเปิดด้วย Chrome (Android/คอม) หรือ Safari (iPhone)</p>
            ) : push.subscribed ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 font-medium">✓ เครื่องนี้เปิดรับแล้ว</div>
                <div className="flex gap-2">
                  <button onClick={sendTest} disabled={testing}
                    className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60">{testing ? "กำลังส่ง..." : "ส่งแจ้งเตือนทดสอบ"}</button>
                  <button onClick={() => void push.disable()} disabled={push.busy}
                    className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-60">ปิดบนเครื่องนี้</button>
                </div>
              </div>
            ) : push.permission === "denied" ? (
              <div className="text-sm text-slate-600 space-y-1">
                <p className="text-red-700 font-medium">เครื่องนี้ปิดการแจ้งเตือนของแอปไว้</p>
                <p>iPhone: ตั้งค่า → การแจ้งเตือน → “แจ้งเตือน” → เปิดอนุญาต · Android: กดค้างไอคอนแอป → ข้อมูลแอป → การแจ้งเตือน → เปิด</p>
              </div>
            ) : (
              <button onClick={enable} disabled={push.busy}
                className="w-full h-11 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-60">{push.busy ? "กำลังเปิด..." : "🔔 เปิดรับแจ้งเตือนบนเครื่องนี้"}</button>
            )}
          {push.error && <p className="text-xs text-red-600 mt-2">{push.error}</p>}
        </section>

        {/* ติดตั้งแอป */}
        {!pwa.installed && (
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">ติดตั้งเป็นแอปบนหน้าจอ</h2>
            <p className="text-xs text-slate-500 mb-2">เปิดได้จากไอคอนเหมือนแอปทั่วไป ไม่ต้องพิมพ์ที่อยู่เว็บ</p>
            <button onClick={async () => {
              const r = await pwa.install();
              if (r === "samsung") { toast.info(SAMSUNG_INSTALL_HINT); openInChrome(); return; }
              if (r === "ios") toast.info(IOS_INSTALL_HINT);
              else if (r === "unsupported") toast.info(UNSUPPORTED_INSTALL_HINT);
            }} className="h-10 px-4 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium">📲 ติดตั้งแอป “แจ้งเตือน”</button>
          </section>
        )}

        {/* ไอคอนแอป (เฉพาะคนมีสิทธิ์จัดการแอป) */}
        {brand.canEdit && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appIconUrl("notify", 96, brand.version)} alt="" className="w-12 h-12 rounded-[22%] border border-slate-100" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-700">ไอคอนแอป</h2>
              <p className="text-xs text-slate-500">{brand.custom ? "ใช้ไอคอนที่ตั้งเอง" : "ใช้ไอคอนตั้งต้น"} · เปลี่ยนแล้วมีผลทุกคน</p>
            </div>
            <AppIconEditButton appKey="notify" branding={brand} label="✏️ เปลี่ยน" />
          </section>
        )}

        {/* รายประเภท */}
        <section className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-slate-700">เด้งเข้ามือถือเรื่องไหนบ้าง</h2>
            <p className="text-xs text-slate-500">ตั้งของตัวเอง ใช้กับทุกเครื่องของคุณ · ปิดแล้วยังเห็นในรายการ/กระดิ่งตามเดิม แค่ไม่เด้ง</p>
          </div>
          <ul>
            {PUSH_CATEGORIES.map((c) => {
              const on = !push.prefs.off.includes(c.key);
              return (
                <li key={c.key} className="border-t border-slate-100">
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                    <span className="text-lg w-6 text-center">{c.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-800">{c.label}</span>
                      <span className="block text-xs text-slate-400">{c.hint}</span>
                    </span>
                    <input type="checkbox" className="sr-only peer" checked={on} onChange={(e) => void toggleCat(c.key, e.target.checked)} />
                    <span aria-hidden className="relative w-11 h-6 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {/* เครื่องที่เปิดรับ */}
        <section className="bg-white rounded-xl border border-slate-200">
          <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-slate-700">เครื่องที่เปิดรับ ({push.devices.length})</h2>
          {push.devices.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-slate-400">ยังไม่มีเครื่องไหนเปิดรับ</p>
          ) : (
            <ul>
              {push.devices.map((d) => (
                <li key={d.id} className="border-t border-slate-100 px-4 py-3 flex items-start gap-3">
                  <span className="text-lg">📱</span>
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="block text-slate-800">{d.device_label ?? "เครื่องไม่ทราบชื่อ"}{d.id === push.thisDeviceId && <span className="ml-1.5 text-xs text-blue-600 font-medium">(เครื่องนี้)</span>}</span>
                    <span className="block text-xs text-slate-400">
                      เปิดรับเมื่อ {relTime(d.created_at)}
                      {d.last_success_at && ` · ส่งถึงล่าสุด ${relTime(d.last_success_at)}`}
                    </span>
                    {d.last_error && <span className="block text-xs text-red-600 mt-0.5">ส่งไม่ถึงครั้งล่าสุด: {d.last_error}</span>}
                  </span>
                  <button onClick={() => void removeDevice(d.id, d.device_label)} className="text-xs text-slate-400 hover:text-red-600 h-8 px-2">ลบ</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-400 px-1 pb-4">
          Android: เปิดด้วย Chrome → ติดตั้งแอป → เปิดรับแจ้งเตือน · iPhone (iOS 16.4+): Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิดจากไอคอน → เปิดรับแจ้งเตือน
        </p>
      </main>
    </Screen>
  );
}
