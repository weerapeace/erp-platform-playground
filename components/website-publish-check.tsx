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
import { apiFetch } from "@/lib/api";
import { listingIssues, shopPublishIssues } from "@/lib/website-listing-health";
import type { ValidationIssue } from "@/lib/website-schema";

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
      apiFetch(`/api/website/listings?shop=${encodeURIComponent(shopSlug)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const rows = ((j.listings ?? []) as ListingRow[]).map((l) => ({
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
  what = "หน้านี้",
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
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const row = (it: ValidationIssue, i: number) => (
    <li key={i} className="flex items-start gap-2 text-sm py-1">
      <span className={it.level === "error" ? "text-red-600" : "text-amber-600"}>{it.level === "error" ? "✕" : "!"}</span>
      <span className="flex-1 text-slate-700">{it.message}</span>
      {it.blockId && onGoBlock && (
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
          onClick={() => {
            onGoBlock(it.blockId!);
            onClose();
          }}
        >
          ไปที่
        </button>
      )}
      {it.fix && (
        <a href={it.fix} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
          ไปแก้ ↗
        </a>
      )}
    </li>
  );
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={`เผยแพร่${what}ขึ้นเว็บจริง?`}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {issues.length ? "กลับไปแก้" : "ยกเลิก"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${errors.length ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
          >
            {busy ? "กำลังเผยแพร่…" : errors.length ? "เผยแพร่ทั้งที่ยังมีปัญหา" : "เผยแพร่เลย"}
          </button>
        </div>
      }
    >
      {issues.length === 0 ? (
        <p className="text-sm text-emerald-700">✓ ตรวจแล้ว ไม่พบปัญหา — พร้อมขึ้นเว็บจริง</p>
      ) : (
        <div className="space-y-3">
          {errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">ควรแก้ก่อน ({errors.length})</p>
              <ul className="rounded-lg bg-red-50 border border-red-100 px-3 py-1.5">{errors.map(row)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">แนะนำ ({warnings.length})</p>
              <ul className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5">{warnings.map(row)}</ul>
            </div>
          )}
          <p className="text-[11px] text-slate-500">เผยแพร่ได้เลยถ้าตั้งใจ — ปัญหาข้อมูลสินค้าแก้ได้ภายหลังที่แท็บ &quot;สินค้าบนเว็บ&quot; (ไม่ต้องเผยแพร่หน้าใหม่)</p>
        </div>
      )}
    </ERPModal>
  );
}
