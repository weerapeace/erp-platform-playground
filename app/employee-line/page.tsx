"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LiffProfile = {
  displayName?: string;
  pictureUrl?: string;
};

type LiffSdk = {
  init: (options: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: () => void;
  getIDToken: () => string | null;
  getProfile: () => Promise<LiffProfile>;
};

declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

type SessionState =
  | { status: "idle" | "loading" }
  | { status: "missing_config" }
  | { status: "not_registered"; line_profile?: LiffProfile | null }
  | { status: "registered"; line_profile?: LiffProfile | null; employee: EmployeeInfo; membership: MembershipInfo }
  | { status: "blocked"; line_profile?: LiffProfile | null; employee: EmployeeInfo; membership: MembershipInfo }
  | { status: "error"; message: string };

type EmployeeInfo = {
  id: string;
  employee_code?: string | null;
  code?: string | null;
  name?: string | null;
  display_name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  mobile?: string | null;
  status?: string | null;
};

type MembershipInfo = {
  id: string;
  status: string;
  linked_at?: string | null;
};

type RegisterForm = {
  employee_code: string;
  phone: string;
};

const LIFF_SCRIPT_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

function liffId() {
  return process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "";
}

function employeeCode(employee?: EmployeeInfo | null) {
  return employee?.employee_code || employee?.code || "-";
}

function employeeName(employee?: EmployeeInfo | null) {
  return employee?.display_name || employee?.name || "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function loadLiffScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.liff) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIFF_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("โหลด LINE LIFF ไม่สำเร็จ")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = LIFF_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด LINE LIFF ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "ทำรายการไม่สำเร็จ");
  return json as T;
}

export default function EmployeeLinePage() {
  const [session, setSession] = useState<SessionState>({ status: "idle" });
  const [idToken, setIdToken] = useState("");
  const [form, setForm] = useState<RegisterForm>({ employee_code: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("preview") === "1";
  }, []);

  const boot = useCallback(async () => {
    setSession({ status: "loading" });
    setNotice(null);
    try {
      if (preview) {
        setSession({
          status: "not_registered",
          line_profile: { displayName: "LINE Preview", pictureUrl: "" },
        });
        setIdToken("preview-token");
        return;
      }

      const id = liffId();
      if (!id) {
        setSession({ status: "missing_config" });
        return;
      }

      await loadLiffScript();
      if (!window.liff) throw new Error("ไม่พบ LINE LIFF SDK");
      await window.liff.init({ liffId: id });
      if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return;
      }

      const token = window.liff.getIDToken();
      if (!token) throw new Error("ไม่สามารถอ่าน LINE ID Token ได้");
      const profile = await window.liff.getProfile().catch(() => null);
      setIdToken(token);
      const json = await postJson<{ data: SessionState }>("/api/line/session", { id_token: token });
      if (json.data.status === "not_registered") {
        setSession({ status: "not_registered", line_profile: profile });
      } else {
        setSession({ ...json.data, line_profile: profile } as SessionState);
      }
    } catch (e) {
      setSession({ status: "error", message: e instanceof Error ? e.message : "เปิด LINE Portal ไม่สำเร็จ" });
    }
  }, [preview]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const register = async () => {
    setSaving(true);
    setNotice(null);
    try {
      if (preview) {
        setSession({
          status: "registered",
          line_profile: { displayName: "LINE Preview", pictureUrl: "" },
          employee: {
            id: "preview",
            employee_code: form.employee_code || "ISG-001",
            display_name: "ตัวอย่าง พนักงาน",
            nickname: "ตัวอย่าง",
            phone: form.phone || "0800000000",
          },
          membership: { id: "preview", status: "linked", linked_at: new Date().toISOString() },
        });
        setSaving(false);
        return;
      }
      const json = await postJson<{ data: { employee: EmployeeInfo; membership: MembershipInfo; line_profile?: LiffProfile } }>(
        "/api/line/register",
        { id_token: idToken, employee_code: form.employee_code, phone: form.phone },
      );
      setSession({
        status: "registered",
        employee: json.data.employee,
        membership: json.data.membership,
        line_profile: json.data.line_profile ?? (session.status === "not_registered" ? session.line_profile : null),
      });
      setNotice("ผูกบัญชี LINE สำเร็จ");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "สมัครใช้งานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white px-4 py-6">
      <main className="mx-auto max-w-md">
        <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-lg font-bold text-white">LINE</div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Employee Portal</h1>
              <p className="text-sm text-slate-500">เชื่อมบัญชี LINE กับข้อมูลพนักงาน</p>
            </div>
          </div>

          {session.status === "loading" || session.status === "idle" ? (
            <div className="py-12 text-center text-sm text-slate-500">กำลังตรวจสอบบัญชี LINE...</div>
          ) : session.status === "missing_config" ? (
            <StateBox
              title="ยังไม่ได้ตั้งค่า LIFF"
              text="ต้องใส่ NEXT_PUBLIC_LINE_LIFF_ID ใน environment ก่อนใช้งานจริง"
              tone="amber"
            />
          ) : session.status === "error" ? (
            <StateBox title="เปิดใช้งานไม่ได้" text={session.message} tone="red" onRetry={() => void boot()} />
          ) : session.status === "not_registered" ? (
            <div className="mt-6 space-y-4">
              <ProfileHeader profile={session.line_profile} />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold text-slate-900">สมัครเชื่อมบัญชีพนักงาน</h2>
                <p className="mt-1 text-sm text-slate-500">กรอกรหัสพนักงานและเบอร์โทร เพื่อยืนยันว่า LINE นี้เป็นของพนักงานคนนั้นจริง</p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">รหัสพนักงาน</span>
                    <input
                      value={form.employee_code}
                      onChange={(e) => setForm((old) => ({ ...old, employee_code: e.target.value }))}
                      placeholder="เช่น ISG-001"
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">เบอร์โทร</span>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((old) => ({ ...old, phone: e.target.value }))}
                      placeholder="เบอร์ที่อยู่ในข้อมูลพนักงาน"
                      inputMode="tel"
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                </div>
                <button
                  onClick={() => void register()}
                  disabled={saving || !form.employee_code.trim() || !form.phone.trim()}
                  className="mt-4 h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "กำลังสมัคร..." : "ผูกบัญชี LINE"}
                </button>
              </div>
              {notice && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</div>}
            </div>
          ) : session.status === "blocked" ? (
            <div className="mt-6 space-y-4">
              <ProfileHeader profile={session.line_profile} />
              <StateBox title="บัญชีนี้ถูกระงับ" text="กรุณาติดต่อฝ่าย HR เพื่อปลดระงับก่อนใช้งาน Employee Portal" tone="red" />
            </div>
          ) : session.status === "registered" ? (
            <div className="mt-6 space-y-4">
              <ProfileHeader profile={session.line_profile} />
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ผูกบัญชีแล้ว</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{employeeCode(session.employee)} · {employeeName(session.employee)}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {session.employee.nickname ? `ชื่อเล่น ${session.employee.nickname} · ` : ""}ผูกเมื่อ {formatDate(session.membership.linked_at)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PortalTile title="ข้อมูลฉัน" text="โปรไฟล์พนักงาน" disabled />
                <PortalTile title="คำขอ" text="ลางาน/ลาออก" disabled />
                <PortalTile title="สลิป" text="ดูสลิปเงินเดือน" disabled />
                <PortalTile title="แจ้งเตือน" text="ข่าวสารจาก HR" disabled />
              </div>
              <p className="text-center text-xs text-slate-400">เฟสนี้เริ่มจากการผูกบัญชี LINE ก่อน เมนูใช้งานจะต่อเพิ่มในเฟสถัดไป</p>
            </div>
          ) : (
            <StateBox title="สถานะไม่พร้อมใช้งาน" text="กรุณาลองเปิดหน้าใหม่อีกครั้ง" tone="amber" onRetry={() => void boot()} />
          )}
        </div>

        {preview && (
          <Link href="/payroll/line-members" className="mt-4 block text-center text-sm font-semibold text-emerald-700">
            กลับหน้า admin LINE พนักงาน
          </Link>
        )}
      </main>
    </div>
  );
}

function ProfileHeader({ profile }: { profile?: LiffProfile | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      {profile?.pictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.pictureUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">LINE</span>
      )}
      <div>
        <div className="text-sm font-semibold text-slate-900">{profile?.displayName || "LINE User"}</div>
        <div className="text-xs text-slate-400">บัญชี LINE ที่กำลังใช้งาน</div>
      </div>
    </div>
  );
}

function StateBox({ title, text, tone, onRetry }: { title: string; text: string; tone: "amber" | "red"; onRetry?: () => void }) {
  const className = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className={`mt-6 rounded-2xl border p-4 ${className}`}>
      <div className="font-bold">{title}</div>
      <div className="mt-1 text-sm opacity-80">{text}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold">
          ลองใหม่
        </button>
      )}
    </div>
  );
}

function PortalTile({ title, text, disabled }: { title: string; text: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm disabled:opacity-60"
    >
      <div className="font-bold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-400">{text}</div>
    </button>
  );
}
