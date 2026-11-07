"use client";

/**
 * หน้า "ประวัติการใช้งาน (Audit Log)" — ด่านสิทธิ์ (admin.audit_log) + เปลือกหน้า + หัวหน้า + แท็บ
 *   แท็บ "การเปลี่ยนข้อมูล" = ใคร ทำอะไร รายการไหน เปลี่ยนจากอะไรเป็นอะไร (audit-log-view.tsx)
 *   แท็บ "การเข้าใช้หน้า"  = ใครเปิดหน้าไหน กี่ครั้ง ล่าสุดเมื่อไหร่ (page-views-view.tsx · ขั้น 3)
 * ลิงก์ตรงแท็บ: ?tab=views · เอกสาร: docs/audit-log.md
 */
import { useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, AccessDenied } from "@/components/auth";
import { LoadingState } from "@/components/state-views";
import { ScrollTabs } from "@/components/scroll-tabs";
import { Icon } from "@/components/icon";
import { AuditLogView } from "./audit-log-view";
import { PageViewsView } from "./page-views-view";

type TabKey = "changes" | "views";
const TABS: { key: TabKey; label: string; icon: string; desc: string }[] = [
  { key: "changes", label: "การเปลี่ยนข้อมูล", icon: "history", desc: "ใคร ทำอะไร ที่หน้าไหน รายการไหน และเปลี่ยนจากอะไรเป็นอะไร — กดชื่อรายการเพื่อดูประวัติทั้งหมดของรายการนั้น" },
  { key: "views", label: "การเข้าใช้หน้า", icon: "view", desc: "ใครเปิดหน้าไหน กี่ครั้ง ล่าสุดเมื่อไหร่ — ดูว่าหน้าไหนมีคนใช้จริง และแต่ละคนใช้หน้าอะไรบ้าง" },
];

export default function AuditLogPage() {
  const { can, permsReady } = useAuth();
  const [tab, setTab] = useState<TabKey>("changes");
  const [viewsOpened, setViewsOpened] = useState(false);   // เปิดแท็บการเข้าใช้หน้าครั้งแรกค่อยโหลด

  // ลิงก์ตรง ?tab=views
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "views") { setTab("views"); setViewsOpened(true); }
  }, []);

  const pick = (k: TabKey) => {
    setTab(k);
    if (k === "views") setViewsOpened(true);
    const url = new URL(window.location.href);
    if (k === "views") url.searchParams.set("tab", "views"); else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  };

  // รอสิทธิ์โหลดเสร็จก่อน — ไม่งั้นแวบหน้า "ไม่มีสิทธิ์" ให้คนที่มีสิทธิ์เห็น
  if (!permsReady) return <PlaygroundShell><LoadingState /></PlaygroundShell>;
  if (!can("admin.audit_log")) {
    return <PlaygroundShell><AccessDenied message="หน้าประวัติการใช้งานต้องเป็นผู้จัดการขึ้นไป" /></PlaygroundShell>;
  }
  const active = TABS.find((t) => t.key === tab)!;
  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 pt-5">
        <div className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-medium mb-2">
          <Icon name="history" size={14} /> Audit Log — ประวัติการใช้งาน
        </div>
        <h1 className="text-2xl font-bold text-slate-900">ประวัติการใช้งาน</h1>
        <p className="text-slate-500 mt-1 text-sm">{active.desc}</p>
        <ScrollTabs activeKey={tab} className="mt-3 -mb-px">
          {TABS.map((t) => (
            <button key={t.key} type="button" data-tab-key={t.key} onClick={() => pick(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 ${tab === t.key ? "border-purple-600 text-purple-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </ScrollTabs>
      </div>
      {/* แท็บที่ไม่ได้เปิดซ่อนไว้ (ไม่ถอดทิ้ง) — สลับกลับมาตัวกรอง/ที่โหลดไว้ยังอยู่ */}
      <div className={tab === "changes" ? "" : "hidden"}><AuditLogView /></div>
      {viewsOpened && <div className={tab === "views" ? "" : "hidden"}><PageViewsView /></div>}
    </PlaygroundShell>
  );
}
