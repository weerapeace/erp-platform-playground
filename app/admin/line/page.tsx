"use client";
/**
 * /admin/line — จัดการ LINE (หน้าเต็ม · เจ้าของเลือกแบบ A + ข้อ 1-5 · 2026-11-22)
 *   แถบตัวเลข: ผูกไลน์แล้ว (พนักงาน/ลูกค้า/แอดมิน) · รอ HR ยืนยัน · รอยืนยันร้าน · โควตาข้อความเดือนนี้ (กดไปแท็บนั้น)
 *   แท็บ: ภาพรวม (เช็กลิสต์ตั้งค่าครั้งแรก + ทางลัด) · ไลน์บริษัท (บอท/QR) · แต่งเมนูไลน์ (ปุ่ม + อัปรูปเอง · 2026-11-23)
 *         · ร้านค้าในไลน์ (ทุกร้าน + QR รายร้าน + ดูแบบลูกค้า · 2026-11-23) · บอทและกลุ่มแจ้งเตือน · คนที่ผูกไลน์ · ประวัติ
 *   ใช้ชิ้นเดิมทั้งหมด (ไม่ทำซ้ำ): LineCompanySection part=setup|people · LineConsoleBody showCompany=false — ป๊อปศูนย์ LINE เดิมยังใช้ได้
 *   ข้อมูล: /api/admin/line-company · /api/admin/line-console · /api/admin/line-overview (ทางลัด/เช็กลิสต์/ประวัติ · กติกา lib/line-history)
 *   ลิงก์แท็บ ?tab=overview|company|menu|shops|bots|people|history · สิทธิ์ admin.users (เมนูอยู่แอปตั้งค่า เห็นเฉพาะแอดมิน)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { LineCompanySection } from "@/components/line-console/company-section";
import { LineConsoleBody } from "@/components/line-console";
import { LineCompanyShops } from "@/components/line-console/company-shops";
import { lineSetupSteps, type LineHistoryItem } from "@/lib/line-history";

type Tab = "overview" | "company" | "menu" | "shops" | "bots" | "people" | "history";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "ภาพรวม", icon: "chart" },
  { key: "company", label: "ไลน์บริษัท", icon: "company" },
  { key: "menu", label: "แต่งเมนูไลน์", icon: "design" },
  { key: "shops", label: "ร้านค้าในไลน์", icon: "store" },
  { key: "bots", label: "บอทและกลุ่มแจ้งเตือน", icon: "ai" },
  { key: "people", label: "คนที่ผูกไลน์", icon: "users" },
  { key: "history", label: "ประวัติ", icon: "history" },
];
const isTab = (v: string | null): v is Tab => !!v && TABS.some((t) => t.key === v);

type Summary = {
  company: { company_bot: string | null; company_ready: boolean; menus: { published: boolean }; employees: { status: string; left_company: boolean; hr_confirmed: boolean }[]; customers: { status: string; partner_id: string }[]; employees_active: number | null } | null;
  console: { has_token: boolean; bots?: { key: string; quota: { ok: boolean; limit: number | null; used: number | null } }[] } | null;
  overview: { so_missing_due: number; company_qr_used: boolean; admins_linked: number; history: LineHistoryItem[] } | null;
};

const when = (d: string) => new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function LineAdminPage() {
  const allowed = usePermission("admin.users");
  const [tab, setTabState] = useState<Tab>("overview");
  const [sum, setSum] = useState<Summary>({ company: null, console: null, overview: null });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (isTab(q)) setTabState(q);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u.toString());
  };

  const load = useCallback(async () => {
    setErr(null);
    const get = async (url: string) => { const r = await apiFetch(url); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ"); return j; };
    const [c, k, o] = await Promise.allSettled([get("/api/admin/line-company"), get("/api/admin/line-console"), get("/api/admin/line-overview")]);
    setSum({ company: c.status === "fulfilled" ? c.value : null, console: k.status === "fulfilled" ? k.value : null, overview: o.status === "fulfilled" ? o.value : null });
    if ([c, k, o].some((x) => x.status === "rejected")) setErr("โหลดข้อมูลบางส่วนไม่สำเร็จ — กดรีเฟรชอีกครั้ง");
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (!allowed) return <PlaygroundShell><AccessDenied message="หน้าจัดการ LINE สำหรับแอดมินเท่านั้น (admin.users)" /></PlaygroundShell>;

  const co = sum.company;
  const empLinked = co ? co.employees.filter((e) => e.status === "linked" && !e.left_company).length : null;
  const waitHr = co ? co.employees.filter((e) => e.status === "linked" && !e.left_company && !e.hr_confirmed).length : null;
  const cusLinked = co ? co.customers.filter((c) => c.status === "linked").length : null;
  const pendingCus = co ? co.customers.filter((c) => c.status === "pending").length : null;
  const quotaBot = sum.console?.bots?.find((b) => b.key === (co?.company_bot || "main")) ?? sum.console?.bots?.[0];
  const q = quotaBot?.quota;
  const quotaText = !q ? "—" : !q.ok ? "อ่านไม่ได้" : q.limit === null ? "ไม่จำกัด" : `${q.limit > 0 ? Math.min(100, Math.round(((q.used ?? 0) / q.limit) * 100)) : 100}%`;
  const steps = lineSetupSteps({
    hasToken: !!sum.console?.has_token, companyBot: !!co?.company_bot, companyReady: !!co?.company_ready,
    companyQrUsed: !!sum.overview?.company_qr_used, menusPublished: !!co?.menus.published,
  });
  const stepsDone = steps.filter((s) => s.done).length;

  const metric = (label: string, value: string | number | null, sub: string, go: Tab, warn = false) => (
    <button type="button" onClick={() => setTab(go)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-slate-300">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : "text-slate-800"}`}>{value ?? "…"}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </button>
  );
  const shortcuts = (
    <div className="flex flex-wrap gap-2 text-xs">
      <Link href="/payroll/line-members" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"><Icon name="employee" /> LINE พนักงาน (HR)</Link>
      <Link href="/chat" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"><Icon name="chat" /> แชทลูกค้า</Link>
      <Link href="/sales/orders?nodue=1" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
        <Icon name="calendar" /> ใบสั่งขายยังไม่ใส่วันนัดส่ง{sum.overview ? <b className={sum.overview.so_missing_due ? "text-amber-600" : "text-emerald-600"}> ({sum.overview.so_missing_due})</b> : null}</Link>
      <Link href="/purchasing/line-orders" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"><Icon name="cart" /> คำสั่งซื้อจากไลน์</Link>
    </div>
  );

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-800"><Icon name="chat" /> จัดการ LINE</h1>
            <p className="mt-0.5 text-sm text-slate-500">ไลน์บริษัท (พนักงาน + ลูกค้า) · บอทและกลุ่มแจ้งเตือน · คนที่ผูกไลน์ — รวมไว้ที่เดียว</p>
          </div>
          <button type="button" onClick={() => void load()} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon name="refresh" /> รีเฟรช</button>
        </div>
        {err && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {metric("ผูกไลน์แล้ว", co ? `${empLinked} / ${cusLinked}` : null, `พนักงาน / ลูกค้า · แอดมิน ${sum.overview?.admins_linked ?? "…"}`, "people")}
          {metric("รอ HR ยืนยัน", waitHr, "พนักงานที่ผูกด้วยรหัส+เบอร์", "people", !!waitHr)}
          {metric("รอยืนยันร้าน", pendingCus, "ลูกค้าที่สแกน QR รวม", "shops", !!pendingCus)}
          {metric("โควตาเดือนนี้", quotaText, q?.ok && q.limit ? `${(q.used ?? 0).toLocaleString()} / ${q.limit.toLocaleString()} ข้อความ` : "ข้อความที่ส่งออก (push)", "bots", q?.ok && !!q.limit && (q.used ?? 0) / q.limit >= 0.8)}
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm ${tab === t.key ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <Icon name={t.icon} /> {t.label}
              {t.key === "overview" && stepsDone < steps.length && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{stepsDone}/{steps.length}</span>}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          {tab === "overview" && (
            <div className="space-y-4">
              {stepsDone < steps.length ? (
                <div>
                  <div className="mb-1.5 text-sm font-medium text-slate-800">ตั้งค่าไลน์บริษัทครั้งแรก <span className="font-normal text-slate-500">· ทำแล้ว {stepsDone}/{steps.length}</span></div>
                  <ol className="space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={s.key} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${s.done ? "bg-emerald-100 text-emerald-700" : "border border-slate-300 text-slate-500"}`}>{s.done ? <Icon name="done" /> : i + 1}</span>
                        <span className={s.done ? "text-slate-400 line-through" : "text-slate-700"}>{s.label}<span className="block text-[11px] text-slate-400 no-underline">{s.hint}</span></span>
                        {!s.done && (s.key === "token" || s.key === "bot" || s.key === "menus") && (
                          <button type="button" onClick={() => setTab(s.key === "token" ? "bots" : s.key === "menus" ? "menu" : "company")} className="ml-auto h-7 shrink-0 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50">ไปตั้ง</button>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">ตั้งค่าไลน์บริษัทครบแล้ว</div>}
              <div>
                <div className="mb-1.5 text-sm font-medium text-slate-800">ทางลัด</div>
                {shortcuts}
              </div>
              {sum.overview && sum.overview.history.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-800">ล่าสุด <button type="button" onClick={() => setTab("history")} className="text-xs font-normal text-indigo-600 hover:underline">ดูทั้งหมด</button></div>
                  <HistoryList items={sum.overview.history.slice(0, 5)} />
                </div>
              )}
            </div>
          )}
          {tab === "company" && <LineCompanySection part="setup" />}
          {tab === "menu" && <LineCompanySection part="menu" />}
          {tab === "shops" && <LineCompanyShops />}
          {tab === "bots" && <LineConsoleBody showCompany={false} />}
          {tab === "people" && (
            <div className="space-y-3">
              <LineCompanySection part="people" />
              <div className="text-[11px] text-slate-400">แอดมินที่ผูกไลน์ {sum.overview?.admins_linked ?? "…"} คน — แอดมินผูก/ถอนไลน์เองที่หน้าบัญชีของตัวเอง หรือสแกน QR แอดมิน</div>
            </div>
          )}
          {tab === "history" && (
            !sum.overview ? <div className="py-6 text-center text-sm text-slate-400">กำลังโหลด…</div>
              : sum.overview.history.length === 0 ? <div className="py-6 text-center text-sm text-slate-500">ยังไม่มีประวัติเรื่อง LINE</div>
              : <HistoryList items={sum.overview.history} />
          )}
        </div>
        {tab !== "overview" && <div className="pt-1">{shortcuts}</div>}
      </div>
    </PlaygroundShell>
  );
}

function HistoryList({ items }: { items: LineHistoryItem[] }) {
  const tone = { normal: "bg-slate-300", warn: "bg-amber-400", danger: "bg-rose-500" } as const;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((h) => (
        <li key={h.id} className="flex items-start gap-2 py-2 text-sm">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone[h.tone]}`} />
          <div className="min-w-0 flex-1"><div className="text-slate-700">{h.text}</div><div className="text-[11px] text-slate-400">{h.who}</div></div>
          <span className="shrink-0 text-[11px] text-slate-400">{when(h.at)}</span>
        </li>
      ))}
    </ul>
  );
}
