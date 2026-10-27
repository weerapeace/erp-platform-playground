"use client";

// ============================================================
// 📧 ดึงออเดอร์จากเมลแพลตฟอร์ม (ตั้งค่า + สถานะ + กล่องเมล + ยืนยันสินค้า + คู่มือ) — /admin/platform-email
// การทำงาน: สคริปต์ใน Gmail (Google Apps Script) ส่งเมล Shopee/Lazada เข้า /api/platform-email/inbound ทุก 15 นาที
//          → ERP อ่านด้วยกฎตายตัว (lib/platform-email) → ออเดอร์ใน platform_orders → รายงาน /master/platform-sales
// แท็บ: ภาพรวม (ไฟล์นี้) · เมลที่อ่านแล้ว ./inbox-tab · รอยืนยันสินค้า ./pending-tab · ตั้งค่า+ติดตั้ง ./settings-tab · คู่มือ ./about-tab
// สิทธิ์: platform_orders.manage (ดูกุญแจ/คัดลอกสคริปต์ = admin.users) · เอกสาร docs/platform-email-orders.md
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { ScrollTabs } from "@/components/scroll-tabs";
import { UnsavedGuardProvider, useUnsavedGuardHost } from "@/components/save-bar";
import { apiFetch } from "@/lib/api";
import { InboxTab } from "./inbox-tab";
import { PendingTab } from "./pending-tab";
import { SettingsTab } from "./settings-tab";
import { AboutTab } from "./about-tab";
import { ago, fmtDateTime, STATUS_META, type InboxRow, type SettingsResponse } from "./types";

type TabKey = "overview" | "inbox" | "pending" | "settings" | "about";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "📊 ภาพรวม" },
  { key: "inbox", label: "📬 เมลที่อ่านแล้ว" },
  { key: "pending", label: "🔗 รอยืนยันสินค้า" },
  { key: "settings", label: "⚙️ ตั้งค่า + ติดตั้ง" },
  { key: "about", label: "📖 คู่มือ / บันทึก" },
];

export default function PlatformEmailPage() {
  const canManage = usePermission("platform_orders.manage");
  const guard = useUnsavedGuardHost();
  const [tab, setTab] = useState<TabKey>("overview");
  const [inboxStatus, setInboxStatus] = useState<string>("");
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // เปิดตรงแท็บจากลิงก์ ?tab=pending (อ่านจาก URL เอง — เลี่ยง useSearchParams ที่ทำ prerender พัง)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/platform-email/settings");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setData(j as SettingsResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canManage) void load(); }, [canManage, load]);

  const go = (t: TabKey) => {
    if (t === tab) return;
    if (guard.anyDirty() && !window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก\nต้องการออกโดยไม่บันทึกหรือไม่?")) return;
    setTab(t);
  };
  const openInbox = (status: string) => { setInboxStatus(status); go("inbox"); };

  if (!canManage) return <PlaygroundShell><AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์จัดการออเดอร์จากแพลตฟอร์ม (platform_orders.manage)" /></PlaygroundShell>;

  const s = data?.settings, c = data?.counts;
  return (
    <PlaygroundShell>
      <UnsavedGuardProvider value={guard.register}>
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">📧 ดึงออเดอร์จากเมลแพลตฟอร์ม</h1>
              <p className="mt-0.5 text-sm text-slate-500">Shopee / Lazada ส่งเมลแจ้งออเดอร์เข้า Gmail → ระบบอ่านให้เองทุก {s?.interval_min ?? 15} นาที → สรุปเป็นรายงานสินค้าที่ขายได้</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void load()} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50">↻ รีเฟรช</button>
              <Link href="/master/platform-sales" className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">📈 ดูรายงาน</Link>
            </div>
          </div>

          <ScrollTabs activeKey={tab} className="border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} data-tab-key={t.key} onClick={() => go(t.key)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t.label}
                {t.key === "pending" && !!c?.pending_items && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-700">{c.pending_items}</span>}
                {t.key === "inbox" && !!(c?.attention || c?.unreadable) && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-xs text-rose-700">{(c?.attention ?? 0) + (c?.unreadable ?? 0)}</span>}
              </button>
            ))}
          </ScrollTabs>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

          {tab === "overview" && (loading || !s || !c ? (
            <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : (
            <div className="space-y-4">
              <ConnectionCard data={data!} onSetup={() => go("settings")} />
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800">เมลที่ระบบอ่านแล้ว <span className="font-normal text-slate-500">— กดการ์ดเพื่อดูรายการ</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["done", "attention", "unreadable", "ignored"] as InboxRow["status"][]).map((k) => (
                    <button key={k} onClick={() => openInbox(k)} className="rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50">
                      <div className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_META[k].cls}`}>{STATUS_META[k].label}</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{c[k].toLocaleString("th-TH")}</div>
                      <div className="text-[11px] text-slate-400">{STATUS_META[k].hint}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-600">ออเดอร์ที่สร้างจากเมล <b className="text-slate-800">{c.email_orders.toLocaleString("th-TH")}</b></span>
                  <button onClick={() => go("pending")} className={`rounded-lg px-3 py-1.5 ${c.pending_items ? "bg-amber-50 text-amber-800 hover:bg-amber-100" : "bg-slate-50 text-slate-600"}`}>
                    สินค้ารอยืนยัน <b>{c.pending_items.toLocaleString("th-TH")}</b> รายการ {c.pending_items ? "→ ไปยืนยัน" : ""}
                  </button>
                </div>
              </section>
            </div>
          ))}

          {tab === "inbox" && <InboxTab initialStatus={inboxStatus} onChanged={load} />}
          {tab === "pending" && <PendingTab onChanged={load} />}
          {tab === "settings" && data && <SettingsTab data={data} onSaved={load} />}
          {tab === "about" && <AboutTab />}
        </div>
      </UnsavedGuardProvider>
    </PlaygroundShell>
  );
}

/** การ์ดสถานะการเชื่อมต่อ: ติดตั้งสคริปต์แล้วหรือยัง · ติดต่อล่าสุดเมื่อไหร่ · เมลเข้าล่าสุด */
function ConnectionCard({ data, onSetup }: { data: SettingsResponse; onSetup: () => void }) {
  const s = data.settings;
  const lastPing = s.last_ping_at ? new Date(s.last_ping_at).getTime() : 0;
  // ไม่มีเมลใหม่ สคริปต์จะไม่ติดต่อ ERP → ใช้ "เคยติดต่อ" เป็นตัวบอกว่าติดตั้งแล้ว ไม่ใช่ความถี่
  const state = !s.enabled ? { tone: "slate", icon: "⏸", text: "ปิดการรับเมลอยู่ — เมลจะรอใน Gmail จนกว่าจะเปิด" }
    : !s.has_key || !lastPing ? { tone: "amber", icon: "⚠️", text: "ยังไม่ได้ติดตั้งสคริปต์ใน Gmail — ทำตามขั้นตอนในแท็บ ตั้งค่า + ติดตั้ง" }
    : { tone: "emerald", icon: "✅", text: "เชื่อมต่อแล้ว — ระบบรับเมลอยู่" };
  const cls = { slate: "border-slate-200 bg-slate-50", amber: "border-amber-200 bg-amber-50", emerald: "border-emerald-200 bg-emerald-50" }[state.tone];
  return (
    <section className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-800">{state.icon} {state.text}</div>
          <div className="mt-1 space-y-0.5 text-sm text-slate-600">
            <div>สคริปต์ Gmail ติดต่อล่าสุด: <b>{ago(s.last_ping_at)}</b> <span className="text-slate-400">({fmtDateTime(s.last_ping_at)})</span></div>
            <div>เมลแพลตฟอร์มเข้ามาล่าสุด: <b>{ago(s.last_received_at)}</b> <span className="text-slate-400">({fmtDateTime(s.last_received_at)})</span></div>
            <div className="text-xs text-slate-500">สคริปต์ติดต่อ ERP เฉพาะตอนมีเมลใหม่ — ช่วงไม่มีออเดอร์ ตัวเลขนี้จะเก่าได้ ไม่ได้แปลว่าพัง</div>
          </div>
        </div>
        {state.tone === "amber" && <button onClick={onSetup} className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700">ไปติดตั้ง →</button>}
      </div>
    </section>
  );
}
