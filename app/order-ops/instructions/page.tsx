"use client";

// ============================================================
// 🎁 คำสั่งพิเศษ & การ์ด — /order-ops/instructions (แอป ช่องทางขาย/ออเดอร์ออนไลน์)
// รวมกับหน้าเขียนการ์ดของขวัญแล้ว (2026-11-25) — ส่วนงานเข้า/การ์ด/แม่แบบ มาจาก ../gift-panels
// ห่อของขวัญ · การ์ด · สลักชื่อ (พิมพ์ใบสลัก) · แก้ไซส์ · แท็บ "รอของ"
// ย้ายจากแอปเก่า order-instruction-manager (2026-11-24 · ช่วงทดลอง ยังไม่ย้ายข้อมูลจริง)
// API /api/order-ops · กติกา lib/order-ops · ชิ้นส่วนร่วม ./shared
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { LoadingState, ErrorState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { useMediaQuery } from "@/lib/use-media-query";
import { INSTRUCTION_STATUS, commandSummary, invalidEngraveChars } from "@/lib/order-ops";
import {
  Field, HistoryList, OptionsManager, OrderNoField, Pill, SkuField, TrashToggle, TrialBanner, TrialPill,
  fmtDate, inputCls, opsJson, useOpsOptions, type OrderHit,
} from "../shared";
import { EngraveSettings, InstructionForm, type Ins, type InsPrefill } from "../instruction-form";
import { PlatformOrderPicker } from "@/components/platform-order-picker";
import Link from "next/link";
import { ScrollTabs } from "@/components/scroll-tabs";
import { SpecialWrapSettings } from "../command-boxes";
import { GIFT_INBOX_TABS, GiftCardsList, GiftInbox, GiftTemplates, InstructionTrash, type GiftCounts, type GiftInboxKind, type GiftInboxTab } from "../gift-panels";

type Summary = { todo?: number; engrave?: number; waiting?: number; done_today?: number; trial?: number };

const PLATFORMS = ["Shopee", "Lazada", "TikTok", "LINE", "Facebook", "IG", "เว็บไซต์", "อื่นๆ"];

export default function InstructionsPage() {
  const { permsReady } = useAuth();
  const canView = usePermission("order_ops.view");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4">
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canView ? <AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ดูงานหลังขาย (order_ops.view)" />
          : <Suspense fallback={<LoadingState />}><Body /></Suspense>}
      </div>
    </PlaygroundShell>
  );
}

// หน้ารวม "คำสั่งพิเศษ & การ์ด" — 4 ส่วน ?s= (เจ้าของเลือก 2026-11-25: รวมงานเข้า + คำสั่งพิเศษเป็นรายการเดียว)
//   inbox งานพิเศษ (1 แถว = 1 ออเดอร์ · การ์ดไม่ผูกออเดอร์ = แถวของตัวเอง · ?tab= สถานะงาน · ?kind= ชนิด) · settings คำสั่ง/เครื่องสลัก/แม่แบบ/ฟอนต์/ถังขยะ
//   2026-11-25 เจ้าของสั่ง: "รอของ" ย้ายไปหน้า รอของ & ซ่อม/เปลี่ยนคืน (?s=wait → ไปที่นั่น) · เอาแท็บการ์ดทั้งหมดออก (?s=cards → งานพิเศษ ชนิดการ์ด)
//   ลิงก์เก่า ?s=orders(&open=<คำสั่ง>) ?view=wait /order-ops/gift-cards พามาส่วนที่ถูกต้อง · ตัวเลขบนปุ่มส่วน = งานค้าง
type Section = "inbox" | "settings";
const SECTIONS: Section[] = ["inbox", "settings"];
const KINDS: GiftInboxKind[] = ["", "card", "engrave", "chat", "other"];

function Body() {
  const router = useRouter();
  const sp = useSearchParams();
  const canManage = usePermission("order_ops.manage");
  const raw = sp.get("s") ?? (sp.get("view") === "wait" ? "wait" : null);
  const legacyOrders = raw === "orders";
  // ลิงก์เก่า: รอของ → หน้าใหม่ · การ์ดทั้งหมด → งานพิเศษ ชนิดการ์ด
  useEffect(() => {
    if (raw === "wait") router.replace("/order-ops/after-sales?kind=wait");
    else if (raw === "cards") router.replace("/order-ops/instructions?tab=all&kind=card");
  }, [raw, router]);
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : "inbox";
  const legacyTab = sp.get("tab");
  const inboxTab: GiftInboxTab = GIFT_INBOX_TABS.includes(legacyTab as GiftInboxTab) ? (legacyTab as GiftInboxTab)
    : legacyTab === "engrave_missing" ? "engrave_missing" : legacyOrders ? (sp.get("open") ? "all" : "ins_todo") : legacyTab ? "all" : "no_ins";
  const inboxKind: GiftInboxKind = KINDS.includes((sp.get("kind") ?? "") as GiftInboxKind) ? ((sp.get("kind") ?? "") as GiftInboxKind)
    : ["card", "engrave", "other"].includes(legacyTab ?? "") ? (legacyTab as GiftInboxKind) : "";
  const go = (s: Section, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(s === "inbox" ? {} : { s }), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
    router.replace(`/order-ops/instructions${p.toString() ? `?${p}` : ""}`);
  };
  const [summary, setSummary] = useState<Summary>({});
  const [gift, setGift] = useState<GiftCounts>({});
  const [bump, setBump] = useState(0);
  // "+ คำสั่งพิเศษ" = ลูกค้าแจ้งทางแชท (ไม่ได้ลงหมายเหตุ) → เลือกออเดอร์ในป๊อป
  const [chatNew, setChatNew] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [engraveOpen, setEngraveOpen] = useState(false);
  const canEditIns = usePermission("order_ops.edit");
  const canDeleteIns = usePermission("order_ops.delete");
  const { options: hubOptions, reload: reloadOptions } = useOpsOptions();
  const refresh = () => setBump((b) => b + 1);

  // ตัวเลขบนปุ่มส่วน — โหลดครั้งแรก (ส่วนที่เปิดอยู่อัปเดตต่อเองตอนโหลดรายการ)
  useEffect(() => {
    void opsJson<{ summary: Summary }>("/api/order-ops?t=instructions&page=1&page_size=10&status=todo").then((r) => setSummary(r.summary)).catch(() => {});
    void opsJson<{ counts: GiftCounts }>("/api/order-gift-cards?view=notes&counts=1").then((r) => setGift(r.counts)).catch(() => {});
  }, [bump]);

  const tabs: { key: Section; label: string; badge?: number; danger?: boolean; icon: string }[] = [
    { key: "inbox", label: "งานพิเศษ", badge: (gift.no_ins ?? 0) + (gift.ins_todo ?? 0), danger: (gift.engrave_missing ?? 0) > 0, icon: "i:inbox" },
    ...(canManage ? [{ key: "settings" as Section, label: "ตั้งค่า", icon: "i:settings" }] : []),
  ];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">คำสั่งพิเศษ &amp; การ์ด</h1>
          <p className="text-sm text-slate-500">ออเดอร์ที่ลูกค้าฝากข้อความ/ซื้อสินค้าสลัก/แจ้งทางแชท → กดแถวสร้างคำสั่งพิเศษ → พิมพ์การ์ด/ใบสลัก → รอของ · เด้งเตือนที่หน้าแพ็กของตอนสแกนออเดอร์</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditIns && <button type="button" onClick={() => setChatNew(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700" title="ลูกค้าแจ้งทางแชท ไม่ได้ลงหมายเหตุในออเดอร์"><Icon value="i:plus" /> คำสั่งพิเศษ</button>}
          {section === "inbox" && (
            <Link href="/order-ops/gift-cards/edit?new=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon value="i:plus" /> การ์ดใหม่ (ไม่ผูกออเดอร์)</Link>
          )}
          {section === "inbox" && canDeleteIns && <button type="button" onClick={() => setTrashOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon value="i:trash" /> ถังขยะคำสั่ง</button>}
        </div>
      </div>
      {chatNew && (
        <InstructionForm row={null} prefill={{ via_chat: true }} options={hubOptions} readOnly={!canEditIns} canDelete={canDeleteIns}
          onClose={() => setChatNew(false)} onSaved={() => { setChatNew(false); refresh(); go("inbox", { tab: "ins_todo", kind: "chat" }); }} />
      )}
      <ScrollTabs activeKey={section} className="mb-3 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} type="button" data-tab-key={t.key} onClick={() => go(t.key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${section === t.key ? "border-sky-600 font-medium text-sky-700" : "border-transparent text-slate-600 hover:text-slate-800"}`}>
            <Icon value={t.icon} /> {t.label}
            {!!t.badge && <span className={`rounded-full px-1.5 text-[11px] ${t.danger ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{t.badge}</span>}
          </button>
        ))}
      </ScrollTabs>
      {section === "inbox" && <TrialBanner trialCount={summary.trial ?? 0} onChanged={refresh} />}
      {section === "inbox" ? (
        <GiftInbox key={bump} tab={inboxTab} kind={inboxKind} openIns={legacyOrders ? sp.get("open") : null}
          onTab={(t) => go("inbox", { tab: t === "no_ins" ? "" : t, kind: inboxKind })}
          onKind={(k) => go("inbox", { tab: inboxTab === "no_ins" ? "" : inboxTab, kind: k })}
          onCounts={(c) => setGift((x) => ({ ...x, ...c }))} />
      ) : canManage ? (
          <div className="space-y-6">
            <section>
              <h2 className="text-base font-semibold text-slate-800">คำสั่งพิเศษ</h2>
              <p className="mb-2 text-[12px] text-slate-500">ชิปคำสั่ง (ห่อ · การ์ด · เปลี่ยนสินค้า …) + ชนิดกล่องตั้งค่า + ตัวเลือก · ตัวพิเศษ/ฟอนต์/รหัสท้าย SKU ของเครื่องสลัก</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setOptOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:settings" /> จัดการคำสั่ง</button>
                <button type="button" onClick={() => setEngraveOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:settings" /> ตั้งค่าเครื่องสลัก</button>
                <button type="button" onClick={() => setTrashOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon value="i:trash" /> ถังขยะคำสั่ง</button>
              </div>
            </section>
            <SpecialWrapSettings options={hubOptions} onChanged={reloadOptions} />
            <GiftTemplates />
            <section>
              <h2 className="text-base font-semibold text-slate-800">ถังขยะการ์ด</h2>
              <p className="mb-2 text-[12px] text-slate-500">การ์ดที่ลบไว้ กดกู้คืนได้ · ถังขยะคำสั่งอยู่ที่ปุ่มด้านบน</p>
              <GiftCardsList onCount={() => {}} trashOnly />
            </section>
          </div>
        ) : <AccessDenied message="ตั้งค่าต้องมีสิทธิ์ order_ops.manage" />}
      <InstructionTrash open={trashOpen} onClose={() => setTrashOpen(false)} onRestored={refresh} />
      <OptionsManager open={optOpen} onClose={() => setOptOpen(false)} kind="instruction_command" options={hubOptions} onChanged={reloadOptions} />
      <EngraveSettings open={engraveOpen} onClose={() => setEngraveOpen(false)} options={hubOptions} onChanged={reloadOptions} />
    </>
  );
}
