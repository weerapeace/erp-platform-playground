"use client";

/**
 * AccountMenu (ของกลาง) — คลิกชื่อผู้ใช้ → popup จัดการบัญชี
 *  - แก้ไขโปรไฟล์ (เปิด popup ในที่เดียว ไม่เปลี่ยนหน้า) · เปลี่ยนสีธีม (accent) · ออกจากระบบ
 *  - ฝัง <ThemeSync/> ให้สีธีมโหลด/บันทึกอัตโนมัติ
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleLabel } from "@/components/auth";
import { ThemeSync } from "@/components/theme-sync";
import { ProfileEditor } from "@/components/profile-editor";
import { SecurityDevices } from "@/components/security-devices";
import { ERPModal } from "@/components/modal";
import { getTheme, setTheme } from "@/lib/theme";
import { DeviceModeToggle, DeviceQrPanel, DEVICE_ICON, DEVICE_LABEL, type DeviceMode, type DeviceLayout, type DeviceQrOpts } from "@/components/device-view";

/** มุมมองอุปกรณ์ (ส่งมาจากเชลล์แอปเดี่ยว) — เลือกดูแบบแท็บเล็ต/มือถือบนจอนี้ + QR เปิด/ติดตั้งบนเครื่องจริง */
export type AccountMenuDevice = { mode: DeviceMode; viewport: DeviceLayout; onChange: (m: DeviceMode) => void; qr?: DeviceQrOpts };

const SWATCHES = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ea580c", "#e11d48", "#475569"];

export function AccountMenu({ onDark = false, device }: { onDark?: boolean; device?: AccountMenuDevice } = {}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);   // ความปลอดภัยเป็น popup (ไม่ออกจากแอป)
  const [cur, setCur] = useState<string | null>(getTheme());
  const [qrOpen, setQrOpen] = useState(false);                       // ป๊อป QR เปิดบนแท็บเล็ต/มือถือ
  const [qrLayout, setQrLayout] = useState<DeviceLayout>("tablet");  // QR สำหรับเครื่องแบบไหน
  if (!user) return null;

  const pick = (c: string | null) => { setTheme(c); setCur(getTheme()); };
  const avatar = user.avatar ? (user.avatar.startsWith("http") ? user.avatar : `/api/r2-image?key=${encodeURIComponent(user.avatar)}`) : null;

  return (
    <div className="relative">
      <ThemeSync />
      <button onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-lg transition-colors ${onDark ? "hover:bg-white/15" : "hover:bg-slate-50"}`}>
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" className={`w-7 h-7 rounded-full object-cover border ${onDark ? "border-white/40" : "border-slate-200"}`} />
          : <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${onDark ? "bg-white/20 text-white" : "bg-violet-100 text-violet-700"}`}>{(user.name || user.email).charAt(0).toUpperCase()}</span>}
        <span className="leading-tight text-right hidden sm:block">
          <span className={`block text-xs font-medium truncate max-w-[120px] ${onDark ? "text-white" : "text-slate-700"}`}>{user.name}</span>
          <span className={`block text-[10px] ${onDark ? "text-white/70" : "text-slate-400"}`}>{roleLabel(user.role)}</span>
        </span>
        <span className={`text-xs ${onDark ? "text-white/70" : "text-slate-400"}`}>⋯</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-slate-100 text-xs text-slate-500 truncate">{user.email}</div>
            {/* Dashboard ของฉัน — ซ่อนเมื่ออยู่ในแอป (onDark) เพราะจะพาออกจากแอป */}
            {!onDark && (
              <button type="button" onClick={() => { setOpen(false); router.push("/dashboard"); }}
                className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">🏠 Dashboard ของฉัน</button>
            )}
            <button type="button" onClick={() => { setOpen(false); setProfileOpen(true); }}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100">👤 โปรไฟล์ของฉัน (แก้ชื่อ/รูป)</button>

            {/* สีธีม (accent) */}
            <div className="px-3 py-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 mb-1.5">🎨 สีธีม (ส่วนตัว)</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => pick(c)} title={c}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 ${cur === c ? "border-slate-700" : "border-white shadow-sm"}`} />
                ))}
                <label title="เลือกสีอื่น"
                  className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[11px] cursor-pointer hover:border-slate-400">
                  ＋<input type="color" className="sr-only" onChange={(e) => pick(e.target.value)} />
                </label>
                <button type="button" onClick={() => pick(null)} className="ml-1 text-[10px] text-slate-400 hover:text-slate-600">รีเซ็ต</button>
              </div>
            </div>

            {/* มุมมองอุปกรณ์ — ดูแอปนี้แบบแท็บเล็ต/มือถือบนจอคอม (กรอบจำลอง) + QR สแกนเปิดบนเครื่องจริง */}
            {device && (
              <div className="px-3 py-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-500 mb-1.5">📟 มุมมองอุปกรณ์ <span className="text-slate-400">(ดูแบบแท็บเล็ต/มือถือบนจอนี้)</span></div>
                <DeviceModeToggle mode={device.mode} viewport={device.viewport} onChange={(m) => { device.onChange(m); setOpen(false); }} className="w-full [&>button]:flex-1" />
                <button type="button" onClick={() => { setOpen(false); setQrOpen(true); }}
                  className="mt-1.5 w-full h-8 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50">📷 QR เปิด/ติดตั้งบนแท็บเล็ต-มือถือ</button>
              </div>
            )}

            <button type="button" onClick={() => { setOpen(false); setProfileOpen(true); }}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100">🔑 เปลี่ยนรหัสผ่าน/PIN</button>
            <button type="button" onClick={() => { setOpen(false); setSecurityOpen(true); }}
              className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 border-t border-slate-100">🔐 ความปลอดภัย (อุปกรณ์ที่เข้าใช้)</button>
            <button onClick={async () => { setOpen(false); await logout(); router.push("/login"); }}
              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-slate-100">ออกจากระบบ</button>
          </div>
        </>
      )}

      {/* ป๊อปอัปแก้โปรไฟล์ — ในที่เดียว ไม่ต้องเปลี่ยนหน้า */}
      <ERPModal open={profileOpen} onClose={() => setProfileOpen(false)} title="👤 โปรไฟล์ของฉัน" size="md" storageKey="profile-editor">
        <ProfileEditor />
      </ERPModal>

      {/* QR เปิด/ติดตั้งบนเครื่องจริง — เลือกว่าเครื่องปลายทางเป็นแท็บเล็ตหรือมือถือ */}
      {device && (
        <ERPModal open={qrOpen} onClose={() => setQrOpen(false)} title="📷 เปิดแอปนี้บนแท็บเล็ต / มือถือ" size="sm">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(["tablet", "phone"] as DeviceLayout[]).map((d) => (
                <button key={d} type="button" onClick={() => setQrLayout(d)}
                  className={`h-8 rounded px-3 text-xs font-medium transition ${qrLayout === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{DEVICE_ICON[d]} {DEVICE_LABEL[d]}</button>
              ))}
            </div>
            <DeviceQrPanel layout={qrLayout} {...device.qr} className="w-full" />
            <p className="text-[11px] text-slate-400 text-center leading-snug">สแกนด้วยกล้องของเครื่องปลายทาง (ต้องล็อกอินบนเครื่องนั้นครั้งแรก)</p>
          </div>
        </ERPModal>
      )}

      {/* ความปลอดภัย — popup (ไม่ออกจากแอป) */}
      <ERPModal open={securityOpen} onClose={() => setSecurityOpen(false)} title="🔐 ความปลอดภัย — อุปกรณ์ที่เข้าสู่ระบบ" size="lg" storageKey="security-devices">
        <SecurityDevices />
      </ERPModal>
    </div>
  );
}
