"use client";

/**  (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { createContext, useContext } from "react";
import { type MenuItem, type FooterColumn } from "@/lib/website-theme";
import { helpColumnIssue, countLinkWarnings, type PageInfo, type LinkIssue } from "@/lib/website-link-health";

/* ─────────── เมนู: รายการ + รายการย่อย (ลึก 1 ชั้น) ─────────── */
/* ─────────── 🩺 เตือน "ไม่ขึ้นเว็บจริง" (lib/website-link-health) ─────────── */
/** รายการหน้า (รวมร่าง + status) — null = ยังโหลดไม่เสร็จ/โหลดพลาด → ไม่เตือน */
export const PageHealthCtx = createContext<PageInfo[] | null>(null);
export function IssueNote({ issue, className = "" }: { issue: LinkIssue; className?: string }) {
  return (
    <p className={`rounded-md border px-2 py-1 text-[11px] ${issue.level === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"} ${className}`}>
      {issue.level === "warn" ? "⚠️ " : "ℹ️ "}
      {issue.text}
    </p>
  );
}
/** ปัญหาของคอลัมน์ท้ายเว็บ 1 คอลัมน์ (ตรงกับเว็บร้าน: คอลัมน์ศูนย์ช่วยเหลือไม่มีหน้าที่เผยแพร่ = ซ่อน) */
export function footerColumnIssue(c: FooterColumn, pages: PageInfo[]): LinkIssue | null {
  if (c.kind === "help") return helpColumnIssue(c.text, pages);
  if (c.kind === "links") {
    const n = countLinkWarnings(c.links, pages);
    return n ? { level: "warn", text: `ลิงก์ ${n} อันพาไปหน้าที่ยังไม่มี/ยังเป็นร่าง — ลูกค้ากดแล้วจะเจอ "ไม่พบหน้า" (กด ✎ ดูทีละลิงก์)` } : null;
  }
  return null;
}
/** กล่องสรุปบนการ์ดคอลัมน์ท้ายเว็บ — บอกว่าเว็บจริงจะต่างจากพรีวิวตรงไหน */
export function FooterHealthSummary({ columns, bottomLinks, shopSlug }: { columns: FooterColumn[]; bottomLinks: MenuItem[]; shopSlug: string }) {
  const health = useContext(PageHealthCtx);
  if (!health) return null;
  const shown = columns.filter((c) => !c.hidden);
  const hiddenCols = shown.filter((c) => c.kind === "help" && helpColumnIssue(c.text, health)?.level === "warn");
  const badLinks = shown.filter((c) => c.kind === "links").reduce((n, c) => n + countLinkWarnings(c.links, health), 0) + countLinkWarnings(bottomLinks, health);
  if (!hiddenCols.length && !badLinks) return null;
  const name = (c: FooterColumn) => `“${c.title || c.text || "ศูนย์ช่วยเหลือ"}”`;
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
      <p className="font-medium">⚠️ บนเว็บจริงตอนนี้ ท้ายเว็บจะไม่เหมือนพรีวิว</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {hiddenCols.length > 0 && <li>คอลัมน์ {hiddenCols.map(name).join(", ")} จะไม่ขึ้น — หน้าในกลุ่มยังเป็นร่าง/ยังไม่มีหน้า</li>}
        {badLinks > 0 && <li>ลิงก์ {badLinks} อันพาไปหน้าที่ยังไม่มี/ยังเป็นร่าง — ลูกค้ากดแล้วจะเจอ “ไม่พบหน้า”</li>}
      </ul>
      <p className="text-amber-800">
        พรีวิวด้านขวาโชว์หน้าที่ยังเป็นร่างด้วย เลยดูเหมือนครบ · ดูป้าย ⚠️ ที่แต่ละแถว ·{" "}
        <a href={`/website/${encodeURIComponent(shopSlug)}?tab=pages`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
          📄 ไปเผยแพร่ที่แท็บหน้าเว็บ ↗
        </a>
      </p>
    </div>
  );
}