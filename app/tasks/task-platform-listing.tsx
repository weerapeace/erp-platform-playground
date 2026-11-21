"use client";

// ============================================================
// ชิปแพลตฟอร์มในลิ้นชักงาน + สถานะ "ลงแล้ว / ยังไม่ลง" + ปุ่มลงสินค้าขึ้นร้าน
//  • สถานะอ่านจาก /api/product-platforms?parent_sku_id= (ตัวเดียวกับแท็บแพลตฟอร์มใน Parent SKU) ทีละ Parent ของงาน
//  • ปุ่มเปิดตัวช่วยลงสินค้าตัวกลาง (AddToPlatformWizard) — ติ๊กร้านที่งานระบุ + ยังไม่ลงไว้ให้ · ร้านที่มีแล้วตัวช่วยข้ามให้เอง
//  • ไม่มีสิทธิ์ดูแพลตฟอร์มสินค้า / งานไม่มี Parent → ชิปธรรมดาเหมือนเดิม
// เจ้าของขอ 2026-11-21
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { PlatformChip } from "./platform-chip";

const AddToPlatformWizard = dynamic(() => import("@/components/platform-listing/add-to-platform-wizard").then((m) => m.AddToPlatformWizard), { ssr: false });

type Pf = { id: string; code: string };
type Draft = { status?: string | null; platform_product_id?: string | null; last_sync_status?: string | null };
type ParentRef = { id: string; code: string | null; name?: string | null };
const MAX_PARENTS = 5; // งานส่วนใหญ่มี 1-2 รุ่น — กันยิงเยอะเกิน

/** เหมือนแท็บแพลตฟอร์มใน Parent SKU: ลงแล้ว = ร่างเผยแพร่/ซิงก์สำเร็จ/มีรหัสบนร้าน หรือจับคู่รายการบนร้านได้ */
const onSale = (d: Draft | undefined, matched: unknown) =>
  (!!d && (d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id)) || !!matched;

export type PlatformListedStatus = {
  /** code → จำนวน Parent ที่ลงแล้ว · null = ยังไม่รู้ (กำลังโหลด / ไม่มีสิทธิ์ / ไม่มี Parent) */
  listed: Record<string, number> | null;
  /** ร้านที่ระบบลงสินค้าได้ (ไม่ซ่อน) */
  known: Set<string>;
  list: ParentRef[];
  total: number;
  reload: () => Promise<void>;
};

/** สถานะลงร้านของ Parent ในงาน — ใช้ร่วม: แถบ Platform (TaskPlatformListing) + รายการ "ยังขาดอะไร" (lib/task-readiness) · โหลดครั้งเดียวที่ลิ้นชัก */
export function usePlatformListedStatus(parents: ParentRef[]): PlatformListedStatus {
  const { can } = useAuth();
  const canView = can("products.platforms.view" as Parameters<typeof can>[0]);
  const list = useMemo(() => parents.slice(0, MAX_PARENTS), [parents]);
  const parentKey = list.map((p) => p.id).join(",");
  const [listed, setListed] = useState<Record<string, number> | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!canView || list.length === 0) { setListed(null); return; }
    try {
      const results = await Promise.all(list.map((p) =>
        apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(p.id)}`).then((r) => r.ok ? r.json() : null).catch(() => null)));
      const cnt: Record<string, number> = {};
      const codes = new Set<string>();
      for (const j of results) {
        if (!j || j.error) continue;
        const pfs = (j.platforms ?? []) as Pf[];
        const ds = (j.drafts ?? {}) as Record<string, Draft>;
        const ms = (j.matchedListings ?? {}) as Record<string, unknown>;
        const hidden = new Set((j.hiddenPlatformCodes ?? []) as string[]);
        for (const pf of pfs) {
          if (hidden.has(pf.code)) continue;
          codes.add(pf.code);
          if (onSale(ds[pf.id], ms[pf.id])) cnt[pf.code] = (cnt[pf.code] ?? 0) + 1;
        }
      }
      setKnown(codes); setListed(cnt);
    } catch { setListed(null); }
  }, [canView, list]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [parentKey, canView]);
  // คืนก้อนเดิมถ้าค่าไม่เปลี่ยน — กันหน้าแม่ (แถบความพร้อม) วนอัปเดตไม่รู้จบ (React #185 · 2026-11-21)
  return useMemo(() => ({ listed, known, list, total: list.length, reload: load }), [listed, known, list, load]);
}

export function TaskPlatformListing({ platforms, parents, brandId, compact = false, status }: {
  platforms: string[]; parents: ParentRef[]; brandId?: string | null;
  /** แบบกะทัดรัด (ลิ้นชักงาน 2026-11-21): ป้ายร้านมีขอบเขียว=ลงแล้ว/แดง=ยังไม่ลง · ปุ่ม "＋ ลงร้าน" เล็กต่อท้ายแถว */
  compact?: boolean;
  /** สถานะที่หน้าแม่โหลดไว้แล้ว (usePlatformListedStatus) — ไม่ส่ง = โหลดเอง */
  status?: PlatformListedStatus;
}) {
  const t = useT();
  const own = usePlatformListedStatus(status ? [] : parents);
  const { listed, known, list, reload: load } = status ?? own;
  const [open, setOpen] = useState(false);

  const total = list.length;
  const ready = listed !== null && total > 0;
  // ร้านในงานที่ระบบลงสินค้าได้ และยังลงไม่ครบทุกรุ่น
  const missing = ready ? platforms.filter((c) => known.has(c) && (listed![c] ?? 0) < total) : [];

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {platforms.map((code) => {
          if (!ready || !known.has(code)) return <PlatformChip key={code} code={code} />;
          const n = listed![code] ?? 0;
          const done = n >= total;
          return (
            <span key={code} title={done ? t("ลงร้านนี้แล้ว", "Listed on this shop") : t("ยังไม่ได้ลงร้านนี้", "Not listed yet")}
              className={`inline-flex items-center gap-0.5 rounded-full ring-1 ${done ? "ring-emerald-300" : "ring-rose-300"}`}>
              <PlatformChip code={code} />
              <span className={`pr-1.5 text-[10px] font-medium ${done ? "text-emerald-600" : "text-rose-500"}`}>{done ? "✓" : total > 1 && n > 0 ? `${n}/${total}` : "✕"}</span>
            </span>
          );
        })}
        {ready && (
          <button type="button" onClick={() => setOpen(true)} title={t("ลงสินค้าขึ้นร้าน", "List on shops")}
            className={`h-6 px-2 rounded-full border text-[11px] font-medium ${missing.length ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
            ＋ {t("ลงร้าน", "List")}{missing.length ? ` (${missing.length})` : ""}
          </button>
        )}
        {open && (
          <AddToPlatformWizard open brandId={brandId ?? null}
            parents={list.map((p) => ({ id: p.id, code: p.code ?? "", name: p.name ?? null }))}
            initialPlatformCodes={missing}
            onClose={() => setOpen(false)} onDone={() => void load()} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {platforms.map((code) => {
          if (!ready || !known.has(code)) return <PlatformChip key={code} code={code} />;
          const n = listed![code] ?? 0;
          const done = n >= total;
          return (
            <span key={code} className="inline-flex items-center gap-1" title={done ? t("ลงร้านนี้แล้ว", "Listed on this shop") : t("ยังไม่ได้ลงร้านนี้", "Not listed yet")}>
              <PlatformChip code={code} />
              <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {done ? `✓ ${t("ลงแล้ว", "Listed")}` : total > 1 && n > 0 ? `${n}/${total}` : t("ยังไม่ลง", "Not yet")}
              </span>
            </span>
          );
        })}
      </div>
      {ready && (
        <button type="button" onClick={() => setOpen(true)}
          className={`mt-2 w-full h-8 rounded-lg border text-xs font-medium ${missing.length ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          🛒 {missing.length
            ? t(`ลงสินค้าขึ้นร้าน (${missing.length} ร้านที่ยังไม่ลง)`, `List on shops (${missing.length} not listed)`)
            : t("ลงสินค้าขึ้นร้าน", "List on shops")}
        </button>
      )}
      {open && (
        <AddToPlatformWizard open brandId={brandId ?? null}
          parents={list.map((p) => ({ id: p.id, code: p.code ?? "", name: p.name ?? null }))}
          initialPlatformCodes={missing}
          onClose={() => setOpen(false)} onDone={() => void load()} />
      )}
    </div>
  );
}
