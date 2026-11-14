"use client";

/**
 * AccountMenu (ของกลาง) — เมนูโปรไฟล์ตัวเดียวทั้งระบบ · กดรูป/ชื่อผู้ใช้ → เมนูจัดการบัญชี
 *  - ใช้ทั้ง "แถบบน" (placement="topbar" ค่าเริ่ม: เชลล์แอปเดี่ยว · แอปแยก · แถบบนมือถือ)
 *    และ "การ์ดชื่อล่างแถบข้าง" (placement="sidebar": เมนูลอยออกนอกแถบข้าง กว้างเท่าแถบบน ไม่ถูกบีบ)
 *  - รายการชุดเดียวกันทุกที่ (เจ้าของสั่งรวม 2026-11-14): บัญชีของฉัน · หน้าตา · การแจ้งเตือน · อุปกรณ์และแอป · ผู้ดูแลระบบ
 *  - ต่างกันตามที่/สิทธิ์เท่านั้น: Dashboard ของฉัน ซ่อนในโหมดแอป (onDark) · มุมมองอุปกรณ์ + QR เฉพาะโหมดแอป (device)
 *    · นับถอยหลังขึ้นเว็บ เฉพาะ admin.users · มุมมองหน้านี้ เฉพาะหน้าที่ลงทะเบียน (usePageChrome)
 *  - ฝัง <ThemeSync/> ให้สีธีมโหลด/บันทึกอัตโนมัติ (sync={false} เมื่อหน้าเดียวกันมีตัวอื่นฝังแล้ว)
 *  - คู่มือ docs/account-menu.md
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth, usePermission, roleLabel, roleColor } from "@/components/auth";
import { Icon } from "@/components/icon";
import { LangToggle, useT } from "@/components/i18n";
import { openPipWindow, pipSupported } from "@/components/pip-window";
import { DEPLOY_PIP_SIZE } from "@/lib/deploy-queue";
import { ThemeSync } from "@/components/theme-sync";
import { ProfileEditor } from "@/components/profile-editor";
import { SecurityDevices } from "@/components/security-devices";
import { ERPModal } from "@/components/modal";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts";
import { getTheme, setTheme } from "@/lib/theme";
import { DeviceModeToggle, DeviceQrPanel, DEVICE_ICON, DEVICE_LABEL, type DeviceMode, type DeviceLayout, type DeviceQrOpts } from "@/components/device-view";
import { usePwaInstall, IOS_INSTALL_HINT, UNSUPPORTED_INSTALL_HINT, SAMSUNG_INSTALL_HINT, openInChrome } from "@/components/pwa-install-button";
import { WorkPopupFloatToggle } from "@/components/work-popup/float";
import { BrowserPushToggle } from "@/components/web-push";
import { PageViewOptionsSection } from "@/components/page-chrome";
import { InstallAppMenuItem, InstallAppModal, SoloInstallSection } from "@/components/install-app";

/** มุมมองอุปกรณ์ (ส่งมาจากเชลล์แอปเดี่ยว) — เลือกดูแบบแท็บเล็ต/มือถือบนจอนี้ + QR เปิด/ติดตั้งบนเครื่องจริง */
export type AccountMenuDevice = { mode: DeviceMode; viewport: DeviceLayout; onChange: (m: DeviceMode) => void; qr?: DeviceQrOpts };

const SWATCHES = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ea580c", "#e11d48", "#475569"];
const MENU_W = 288;   // กว้างเท่ากันทุกที่ (w-72)

const ROW = "flex w-full items-center gap-1.5 text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100";

/** หัวหมวดในเมนู (แถบเทาบาง ๆ) */
function MenuSection({ label }: { label: string }) {
  return <div className="px-3 pt-2 pb-1 text-[10px] font-medium text-slate-400 bg-slate-50/70 border-t border-slate-100">{label}</div>;
}

export function AccountMenu({ onDark = false, device, compact = false, placement = "topbar", collapsed = false, sync = true }: {
  onDark?: boolean;
  device?: AccountMenuDevice;
  /** แถบบนจอเล็ก: โชว์แค่รูปโปรไฟล์ */
  compact?: boolean;
  /** "topbar" = ปุ่มรูป+ชื่อ เมนูเลื่อนลงชิดขวา · "sidebar" = การ์ดชื่อล่างแถบข้าง เมนูเด้งขึ้นลอยนอกแถบข้าง */
  placement?: "topbar" | "sidebar";
  /** แถบข้างพับ (เหลือไอคอน) — การ์ดเหลือแค่รูป */
  collapsed?: boolean;
  /** ฝังตัวซิงก์สีธีมกับบัญชี — ปิดเมื่อหน้าเดียวกันมี AccountMenu อีกตัวฝังไว้แล้ว (กันโหลด/บันทึกซ้ำ) */
  sync?: boolean;
} = {}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useT();
  const sidebar = placement === "sidebar";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number; maxH: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);   // ความปลอดภัยเป็น popup (ไม่ออกจากหน้า)
  const [keysOpen, setKeysOpen] = useState(false);           // คีย์ลัด (Keyboard Shortcuts)
  const [cur, setCur] = useState<string | null>(getTheme());
  const [qrOpen, setQrOpen] = useState(false);                       // ป๊อป QR เปิดบนแท็บเล็ต/มือถือ
  const [qrLayout, setQrLayout] = useState<DeviceLayout>("tablet");  // QR สำหรับเครื่องแบบไหน
  const pwa = usePwaInstall();                                        // ติดตั้งแอปนี้บนเครื่องที่กำลังใช้อยู่ (แท็บเล็ต/มือถือไม่มีปุ่มที่หัว)
  const [installHint, setInstallHint] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);              // ป๊อปติดตั้งแอป (ของกลาง) — หน้าปกติที่ไม่มีส่วน 📟
  const canDeploy = usePermission("admin.users");                     // นับถอยหลังขึ้นเว็บ (ผู้ดูแลระบบ)

  /** แถบข้าง: วางเมนูเหนือการ์ดชื่อ ชิดซ้าย ลอยทับเนื้อหา (ไม่ถูกตัดตามความกว้างแถบข้าง) · สูงไม่เกินจอ เลื่อนในเมนูได้ */
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(MENU_W, vw - 16);
    setPos({ left: Math.max(8, Math.min(r.left, vw - width - 8)), bottom: window.innerHeight - r.top + 6, maxH: Math.max(200, r.top - 12), width });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    if (sidebar) window.addEventListener("resize", place);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", place); };
  }, [open, sidebar, place]);

  if (!user) return null;

  const toggle = () => { if (!open && sidebar) place(); setOpen((o) => !o); };
  const close = () => setOpen(false);

  /** หน้าต่างลอยนับถอยหลังขึ้นเว็บ — เปิดหน้าต่างก่อน (ต้องอยู่ในจังหวะกด) แล้วค่อยโหลดเนื้อหา · ไม่รองรับ = ไปหน้าเต็ม */
  const openDeployCountdown = async () => {
    close();
    if (!pipSupported()) { router.push("/admin/deploy"); return; }
    try {
      const w = await openPipWindow(DEPLOY_PIP_SIZE);
      if (!w) { router.push("/admin/deploy"); return; }
      const { mountDeployCountdownPip } = await import("@/components/deploy-countdown/pip-app");
      mountDeployCountdownPip(w);
    } catch { router.push("/admin/deploy"); }
  };

  const pick = (c: string | null) => { setTheme(c); setCur(getTheme()); };
  const avatar = user.avatar ? (user.avatar.startsWith("http") ? user.avatar : `/api/r2-image?key=${encodeURIComponent(user.avatar)}`) : null;
  const initial = (user.name || user.email).charAt(0).toUpperCase();

  const trigger = sidebar ? (
    // การ์ดชื่อล่างแถบข้าง — หน้าตาเดิม (รูป · ชื่อ · ป้ายตำแหน่ง)
    <button ref={btnRef} type="button" onClick={toggle} title={collapsed ? user.name : undefined} aria-haspopup="menu" aria-expanded={open}
      className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left ${collapsed ? "justify-center" : ""}`}>
      {avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200" />
        : <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">{initial}</span>}
      {!collapsed && <>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-800 truncate">{user.name}</div>
          <span className={`inline-block text-[10px] px-1.5 rounded-full border ${roleColor(user.role)}`}>{roleLabel(user.role)}</span>
        </div>
        <span className="text-slate-400 text-xs">⋯</span>
      </>}
    </button>
  ) : (
    <button ref={btnRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open}
      className={`flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg transition-colors ${onDark ? "hover:bg-white/15" : "hover:bg-slate-50"}`}>
      {avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={avatar} alt="" className={`w-7 h-7 rounded-full object-cover border ${onDark ? "border-white/40" : "border-slate-200"}`} />
        : <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${onDark ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"}`}>{initial}</span>}
      <span className={`leading-tight text-right ${compact ? "hidden" : "hidden sm:block"}`}>
        <span className={`block text-xs font-medium truncate max-w-[120px] ${onDark ? "text-white" : "text-slate-700"}`}>{user.name}</span>
        <span className={`block text-[10px] ${onDark ? "text-white/70" : "text-slate-400"}`}>{roleLabel(user.role)}</span>
      </span>
      {!compact && <span className={`text-xs ${onDark ? "text-white/70" : "text-slate-400"}`}>⋯</span>}
    </button>
  );

  // ── รายการเมนู (ชุดเดียวกันทุกที่) ──
  const body = (
    <>
      <div className="px-3 py-2 text-xs text-slate-500 truncate">{user.email}</div>
      {/* มุมมองหน้านี้ (หน้าลงทะเบียนผ่าน usePageChrome เช่น บอร์ดจ่ายงาน: คอม/iPad · หน้าตา · เต็มจอ) */}
      <PageViewOptionsSection />
      {/* Dashboard ของฉัน — ซ่อนเมื่ออยู่ในแอป (onDark) เพราะจะพาออกจากแอป */}
      {!onDark && (
        <button type="button" onClick={() => { close(); router.push("/dashboard"); }} className={ROW}>
          <Icon value="🏠" /> {t("Dashboard ของฉัน", "My dashboard")}
        </button>
      )}

      <MenuSection label={t("บัญชีของฉัน", "My account")} />
      <button type="button" onClick={() => { close(); setProfileOpen(true); }} className={ROW}>
        <Icon value="👤" /> {t("โปรไฟล์ของฉัน (แก้ชื่อ/รูป)", "My profile (name/photo)")}
      </button>
      <button type="button" onClick={() => { close(); setProfileOpen(true); }} className={ROW}>
        <Icon value="🔑" /> {t("เปลี่ยนรหัสผ่าน/PIN", "Change password/PIN")}
      </button>
      <button type="button" onClick={() => { close(); setSecurityOpen(true); }} className={ROW}>
        <Icon value="🔐" /> {t("ความปลอดภัย (อุปกรณ์ที่เข้าใช้)", "Security (devices)")}
      </button>
      <button type="button" onClick={() => { close(); router.push("/account/discord"); }} className={ROW}>
        <Icon value="💬" /> {t("ผูกบัญชี Discord (ติ๊กงานในแชท)", "Link Discord (tick tasks in chat)")}
      </button>

      <MenuSection label={t("หน้าตา", "Appearance")} />
      {/* สีธีม (accent) */}
      <div className="px-3 py-2 border-t border-slate-100">
        <div className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1"><Icon value="🎨" /> {t("สีธีม (ส่วนตัว)", "Theme colour (personal)")}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => pick(c)} title={c}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full border-2 ${cur === c ? "border-slate-700" : "border-white shadow-sm"}`} />
          ))}
          <label title={t("เลือกสีอื่น", "Pick another colour")}
            className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[11px] cursor-pointer hover:border-slate-400">
            ＋<input type="color" className="sr-only" onChange={(e) => pick(e.target.value)} />
          </label>
          <button type="button" onClick={() => pick(null)} className="ml-1 text-[10px] text-slate-400 hover:text-slate-600">{t("รีเซ็ต", "Reset")}</button>
        </div>
      </div>
      {/* ภาษา — ปุ่มกลางตัวเดียวกับแถบบน (สลับแล้วโหลดหน้าใหม่) */}
      <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-t border-slate-100">
        <span className="text-xs text-slate-700 flex items-center gap-1.5"><Icon value="🌐" /> ภาษา / Language</span>
        <LangToggle />
      </div>
      {/* คีย์ลัด — มีประโยชน์เฉพาะจอที่มีคีย์บอร์ด (ซ่อนบนมือถือ) */}
      <button type="button" onClick={() => { close(); setKeysOpen(true); }} className={`${ROW} max-md:hidden`}>
        <Icon value="⌨️" /> <span className="flex-1">{t("คีย์ลัด (Keyboard Shortcuts)", "Keyboard shortcuts")}</span>
        <kbd className="text-[9px] font-mono bg-slate-100 border border-slate-200 px-1 rounded text-slate-400">?</kbd>
      </button>

      <MenuSection label={t("การแจ้งเตือน", "Notifications")} />
      {/* ป๊อปเตือนงาน (ลอยมุมจอ) — เปิด/ซ่อน + มุมจอ · จำต่อคน */}
      <WorkPopupFloatToggle />
      {/* ป๊อปเตือนงานเด้งเป็นแจ้งเตือนของเบราว์เซอร์ (มุมจอ) — ตั้งรายเครื่อง */}
      <BrowserPushToggle />

      <MenuSection label={t("อุปกรณ์และแอป", "Devices and app")} />
      {/* ติดตั้งแอปบนเครื่อง — โหมดแอปมีชุดมุมมองอุปกรณ์ด้านล่างแทน */}
      {!device && <InstallAppMenuItem onClick={() => { close(); setInstallOpen(true); }} />}
      {/* มุมมองอุปกรณ์ (โหมดแอปเท่านั้น) — ดูแอปนี้แบบแท็บเล็ต/มือถือบนจอคอม (กรอบจำลอง) + QR สแกนเปิดบนเครื่องจริง */}
      {device && (
        <div className="px-3 py-2 border-t border-slate-100">
          <div className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1"><Icon value="📟" /> {t("มุมมองอุปกรณ์", "Device view")} <span className="text-slate-400">{t("(ดูแบบแท็บเล็ต/มือถือบนจอนี้)", "(preview tablet/phone here)")}</span></div>
          <DeviceModeToggle mode={device.mode} viewport={device.viewport} onChange={(m) => { device.onChange(m); close(); }} className="w-full [&>button]:flex-1" />
          {/* ติดตั้งแอปบนเครื่องนี้ — Android/Chrome เด้งกล่องติดตั้ง · iPad/iPhone บอกวิธี แชร์ → เพิ่มไปหน้าจอโฮม */}
          <button type="button"
            onClick={async () => { const r = await pwa.install(); if (r === "samsung") { setInstallHint(SAMSUNG_INSTALL_HINT); openInChrome(); return; } setInstallHint(r === "ios" ? IOS_INSTALL_HINT : r === "unsupported" ? UNSUPPORTED_INSTALL_HINT : r === "installed" ? "✓ เปิดในโหมดแอปอยู่แล้ว" : null); }}
            className={`mt-1.5 w-full h-8 rounded-md border text-xs font-medium ${pwa.installed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"}`}>
            {pwa.installed ? t("✓ ติดตั้งแอปนี้แล้ว (โหมดแอป)", "✓ App installed (app mode)") : t("📲 ติดตั้งแอปนี้บนเครื่องนี้", "📲 Install this app on this device")}
          </button>
          {installHint && <p className="mt-1 text-[11px] leading-snug text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5">{installHint}</p>}
          <button type="button" onClick={() => { close(); setQrOpen(true); }}
            className="mt-1.5 w-full h-8 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50">{t("📷 เปิด/ติดตั้งบนเครื่องอื่น (แท็บเล็ต · มือถือ · คอม)", "📷 Open/install on another device")}</button>
        </div>
      )}

      {/* ผู้ดูแลระบบ: ตัวนับถอยหลังขึ้นเว็บ ลอยทับทุกโปรแกรม (เจ้าของขอ 2026-11-11) · "หน้าเต็ม" = /admin/deploy */}
      {canDeploy && (<>
        <MenuSection label={t("ผู้ดูแลระบบ", "Admin")} />
        <div className="flex items-stretch border-t border-slate-100">
          <button type="button" onClick={() => void openDeployCountdown()}
            className="flex-1 inline-flex items-center gap-1.5 text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            title={t("หน้าต่างจิ๋วลอยทับทุกโปรแกรม บอกว่าเว็บจริงจะอัปเดตอีกกี่นาที (Chrome / Edge บนคอม)", "A tiny always-on-top window counting down to the next site update (Chrome / Edge on desktop)")}>
            <Icon value="🚀" /> {t("นับถอยหลังขึ้นเว็บ (ลอยมุมจอ)", "Deploy countdown (floating)")}
          </button>
          <button type="button" onClick={() => { close(); router.push("/admin/deploy"); }}
            className="px-3 text-[11px] text-slate-400 hover:text-slate-700 hover:bg-slate-50">{t("หน้าเต็ม", "Full page")}</button>
        </div>
      </>)}

      <button type="button" onClick={async () => { close(); await logout(); router.push("/login"); }}
        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-slate-100">{t("ออกจากระบบ", "Log out")}</button>
    </>
  );

  const panelCls = "overflow-y-auto overscroll-contain bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-left";

  return (
    <div className={sidebar ? "relative flex-1 min-w-0" : "relative"}>
      {sync && <ThemeSync />}
      {trigger}

      {open && (sidebar
        // แถบข้าง: เรนเดอร์ที่ body (แถบข้างตัดของที่ล้นออก) · z-50 เท่าป๊อปกลาง — ป๊อปที่เปิดจากในเมนู (เช่น เปลี่ยนตัว Pet) มาทีหลังจึงอยู่บนเมนู
        ? (pos && typeof document !== "undefined" ? createPortal(
            <>
              <div className="fixed inset-0 z-50" onClick={close} />
              <div role="menu" className={`fixed z-50 ${panelCls}`} style={{ left: pos.left, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}>{body}</div>
            </>, document.body) : null)
        : <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div role="menu" className={`absolute right-0 top-full mt-1 w-72 max-h-[calc(100dvh-4.5rem)] z-50 ${panelCls}`}>{body}</div>
          </>
      )}

      {/* ป๊อปอัปแก้โปรไฟล์ — ในที่เดียว ไม่ต้องเปลี่ยนหน้า */}
      <ERPModal open={profileOpen} onClose={() => setProfileOpen(false)} title={t("👤 โปรไฟล์ของฉัน", "👤 My profile")} size="md" storageKey="profile-editor">
        <ProfileEditor />
      </ERPModal>

      {/* QR เปิด/ติดตั้งบนเครื่องจริง — เลือกว่าเครื่องปลายทางเป็นแท็บเล็ตหรือมือถือ */}
      {device && (
        <ERPModal open={qrOpen} onClose={() => setQrOpen(false)} title={t("📷 เปิด / ติดตั้งแอปนี้บนแท็บเล็ต · มือถือ · คอม", "📷 Open / install this app on tablet · phone · desktop")} size="sm">
          <div className="flex flex-col items-center gap-3">
            {/* ติดตั้งเฉพาะหน้าที่เปิดอยู่ในแอป (เช่น บอร์ดจ่ายงาน) เป็นแอปหน้าเดียว — กล่องกลางตัวเดียวกับป๊อป "ติดตั้งแอป" (เจ้าของ 2026-11-06) */}
            <SoloInstallSection open={qrOpen} path={device.qr?.installGo ?? null} />
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(["tablet", "phone", "desktop"] as DeviceLayout[]).map((d) => (
                <button key={d} type="button" onClick={() => setQrLayout(d)}
                  className={`h-8 rounded px-3 text-xs font-medium transition ${qrLayout === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{DEVICE_ICON[d]} {d === "desktop" ? "คอม" : DEVICE_LABEL[d]}</button>
              ))}
            </div>
            <DeviceQrPanel layout={qrLayout} {...device.qr} className="w-full" />
            <p className="text-[11px] text-slate-400 text-center leading-snug">{qrLayout === "desktop" ? "เปิดลิงก์ใน Chrome / Edge ของคอมที่จะติดตั้ง (ต้องล็อกอินบนเครื่องนั้นครั้งแรก)" : "สแกนด้วยกล้องของเครื่องปลายทาง (ต้องล็อกอินบนเครื่องนั้นครั้งแรก)"}</p>
          </div>
        </ERPModal>
      )}

      {!device && <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />}

      {/* ความปลอดภัย — popup (ไม่ออกจากหน้า) */}
      <ERPModal open={securityOpen} onClose={() => setSecurityOpen(false)} title={t("🔐 ความปลอดภัย — อุปกรณ์ที่เข้าสู่ระบบ", "🔐 Security — signed-in devices")} size="lg" storageKey="security-devices">
        <SecurityDevices />
      </ERPModal>

      {/* คีย์ลัด — ตัวเดียวกับปุ่มในแถบข้าง */}
      <KeyboardShortcutsModal open={keysOpen} onClose={() => setKeysOpen(false)} />
    </div>
  );
}
