"use client";

/**
 * ✅ ตรวจก่อนเผยแพร่ (ของกลางของตัวจัดหน้าเว็บ — หน้าแรก / หน้าเว็บ)
 *
 * useShopPublishIssues(shopSlug) = ปัญหาข้อมูลสินค้าของร้าน (ไม่มีราคา / รูป / หมวด) จากกฎกลาง lib/website-listing-health
 * PublishCheckDialog            = ป๊อปก่อนกดเผยแพร่: รายการที่ควรแก้ (แดง) + แนะนำ (เหลือง) + ปุ่ม "ไปที่ / ไปแก้" → กลับไปแก้ หรือ เผยแพร่เลย
 * ใช้แทน confirm() ของเบราว์เซอร์ (เดิมบอกแค่ "พบ N จุด" ไม่บอกว่าอะไร)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { loadWebListings } from "@/lib/website-data";
import { listingIssues, shopPublishIssues } from "@/lib/website-listing-health";
import type { ValidationIssue } from "@/lib/website-schema";
import { messageEn } from "@/lib/website-schema-en";

type ListingRow = {
  code: string;
  published: boolean;
  categories?: string[];
  display?: { price: number; imageCount: number; colors: { label: string; swatch: string | null; hasImage: boolean }[]; compartmentsMissing?: boolean } | null;
};

/** ปัญหาข้อมูลสินค้าที่ขึ้นเว็บ (โหลดตอนเปิด + ตอนกลับมาที่แท็บนี้) */
export function useShopPublishIssues(shopSlug: string): ValidationIssue[] {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadWebListings<ListingRow>(shopSlug, true)
        .then((j) => {
          if (!alive) return;
          const rows = (j.listings ?? []).map((l) => ({
            code: l.code,
            published: l.published,
            issues: l.display ? listingIssues({ price: l.display.price, imageCount: l.display.imageCount, categories: l.categories ?? [], colors: l.display.colors ?? [], compartmentsMissing: l.display.compartmentsMissing }) : [],
          }));
          setIssues(shopPublishIssues(rows, `/website/${encodeURIComponent(shopSlug)}?tab=listings&filter=fix`));
        })
        .catch(() => alive && setIssues([]));
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [shopSlug]);
  return issues;
}

export function PublishCheckDialog({
  open,
  onClose,
  onConfirm,
  issues,
  what: whatProp,
  onGoBlock,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  issues: ValidationIssue[];
  /** ข้อความว่าเผยแพร่อะไร เช่น "หน้าแรก" */
  what?: string;
  /** กด "ไปที่" ของปัญหาที่อยู่ใน Section */
  onGoBlock?: (blockId: string) => void;
  busy?: boolean;
}) {
  const t = useT();
  const what = whatProp ?? t("หน้านี้", "this page");
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const row = (it: ValidationIssue, i: number) => (
    <li key={i} className="flex items-start gap-2 text-sm py-1">
      <span className={it.level === "error" ? "text-red-600" : "text-amber-600"}>{it.level === "error" ? "✕" : "!"}</span>
      <span className="flex-1 text-slate-700">{messageEn(it.message)}</span>
      {it.blockId && onGoBlock && (
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          onClick={() => {
            onGoBlock(it.blockId!);
            onClose();
          }}
        >
          {t("ไปที่", "Go to")}
        </button>
      )}
      {it.fix && (
        <a href={it.fix} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
          {t("ไปแก้ ↗", "Fix ↗")}
        </a>
      )}
    </li>
  );
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={t(`เผยแพร่${what}ขึ้นเว็บจริง?`, `Publish ${what} to the live site?`)}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {issues.length ? t("กลับไปแก้", "Back to edit") : t("ยกเลิก", "Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${errors.length ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
          >
            {busy ? t("กำลังเผยแพร่…", "Publishing…") : errors.length ? t("เผยแพร่ทั้งที่ยังมีปัญหา", "Publish anyway") : t("เผยแพร่เลย", "Publish now")}
          </button>
        </div>
      }
    >
      {issues.length === 0 ? (
        <p className="text-sm text-emerald-700">{t("✓ ตรวจแล้ว ไม่พบปัญหา — พร้อมขึ้นเว็บจริง", "✓ Checked, no problems found — ready to go live")}</p>
      ) : (
        <div className="space-y-3">
          {errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">{t("ควรแก้ก่อน", "Fix first")} ({errors.length})</p>
              <ul className="rounded-lg bg-red-50 border border-red-100 px-3 py-1.5">{errors.map(row)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">{t("แนะนำ", "Suggestions")} ({warnings.length})</p>
              <ul className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5">{warnings.map(row)}</ul>
            </div>
          )}
          <p className="text-[11px] text-slate-500">{t("เผยแพร่ได้เลยถ้าตั้งใจ — ปัญหาข้อมูลสินค้าแก้ได้ภายหลังที่แท็บ \"สินค้าบนเว็บ\" (ไม่ต้องเผยแพร่หน้าใหม่)", "You can publish anyway — product data issues can be fixed later in the \"Web products\" tab (no need to republish the page)")}</p>
        </div>
      )}
    </ERPModal>
  );
}
