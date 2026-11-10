"use client";

/**
 * 📊 การ์ดสรุปต้นทุน (แท็บตีราคา ใบงานออกแบบ) — เจ้าของขอ 2026-11-07 "ออกแบบให้ดูง่าย เป็นสัดส่วน สรุปอยู่ขวา"
 *   ต้นทุนต่อใบตัวใหญ่ · แถบสีสัดส่วน (วัสดุแต่ละชนิด + ค่าใช้จ่ายเพิ่ม) · ยอดย่อย · ผ้าที่ใช้ต่อใบ · ถ้าสั่ง N ชิ้น · คำเตือน · ปุ่ม
 *   จอกว้าง = ติดขวาของตาราง (sticky) · จอแคบ = อยู่ใต้ตาราง (ปุ่มยังอยู่แถบล่างติดจอ)
 * ใช้ที่: components/design-sheet-detail/index.tsx (แท็บตีราคา)
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";

export const SEG_COLORS = ["#4f46e5", "#0d9488", "#d97706", "#db2777", "#0284c7", "#65a30d", "#7c3aed"];
const EXTRA_COLOR = "#94a3b8";
const baht = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CostSummaryCard({ grandTotal, materialTotal, groups, extras, usage, tiers, zeroCount, dirty, onVersions, actions }: {
  grandTotal: number;
  materialTotal: number;
  /** ต้นทุนวัสดุแยกตามชนิด */
  groups: { label: string; amount: number }[];
  /** ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย) ที่มียอด — note = คำอธิบายเล็ก (เช่น ค่าบล็อก ÷ จำนวนสั่ง) */
  extras: { label: string; amount: number; note?: string | null }[];
  /** ผ้า/วัสดุที่ใช้ต่อใบ (ข้อความสั้น) */
  usage?: string | null;
  /** ค่าบล็อกหารจำนวนสั่ง → ต้นทุนต่อชิ้นตามขั้นจำนวน */
  tiers?: { qty: number; total: number }[];
  zeroCount: number;
  dirty: boolean;
  onVersions?: () => void;
  actions?: ReactNode;
}) {
  const t = useT();
  const extraTotal = extras.reduce((s, e) => s + e.amount, 0);
  const segs = [
    ...groups.filter((g) => g.amount > 0).map((g, i) => ({ label: g.label, amount: g.amount, color: SEG_COLORS[i % SEG_COLORS.length] })),
    ...(extraTotal > 0 ? [{ label: t("ค่าใช้จ่ายเพิ่ม", "Additional costs"), amount: extraTotal, color: EXTRA_COLOR }] : []),
  ];
  const sum = segs.reduce((s, x) => s + x.amount, 0);
  const pct = (v: number) => (sum > 0 ? Math.round((v / sum) * 100) : 0);
  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <div className="text-[11px] text-slate-500">{t("ต้นทุนสินค้า / ใบ", "Product cost / unit")}</div>
        <div className="text-2xl font-semibold tabular-nums text-emerald-700">{baht(grandTotal)} <span className="text-sm font-normal text-slate-400">฿</span></div>
        {dirty && <div className="text-[11px] text-amber-600">{t("● มีแก้ไขที่ยังไม่บันทึก", "● Unsaved changes")}</div>}
      </div>

      {segs.length > 0 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t("สัดส่วนต้นทุน", "Cost breakdown")}>
            {segs.map((s) => <span key={s.label} title={`${s.label} ${pct(s.amount)}%`} style={{ width: `${(s.amount / sum) * 100}%`, background: s.color }} />)}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {segs.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-slate-600" title={s.label}>{s.label}</span>
                <span className="text-[11px] tabular-nums text-slate-400">{pct(s.amount)}%</span>
                <span className="w-16 text-right tabular-nums text-slate-800">{baht(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-0.5 border-t border-slate-100 pt-2 text-[12px]">
        <div className="flex justify-between text-slate-600"><span>{t("วัสดุรวม", "Materials")}</span><span className="tabular-nums text-slate-800">{baht(materialTotal)}</span></div>
        {extras.map((e, i) => (
          <div key={i} className="flex justify-between gap-2 text-slate-500">
            <span className="min-w-0 truncate" title={e.note ?? e.label}>{e.label}{e.note ? <span className="text-slate-400"> {e.note}</span> : null}</span>
            <span className="shrink-0 tabular-nums">{baht(e.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-emerald-700"><span>{t("รวมทั้งหมด", "Grand total")}</span><span className="tabular-nums">{baht(grandTotal)}</span></div>
      </div>

      {usage && <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-slate-600"><Icon value="i:ruler-measure" className="mr-1 text-[12px] text-slate-400" />{usage}</div>}

      {tiers && tiers.length > 0 && (
        <div className="text-[11px] leading-relaxed text-slate-500">
          {t("ถ้าสั่ง:", "If ordering:")}{" "}
          {tiers.map((x) => <span key={x.qty} className="mr-2 whitespace-nowrap">{x.qty.toLocaleString("th-TH")} = <b className="font-semibold tabular-nums text-slate-700">{baht(x.total)}</b></span>)}
        </div>
      )}

      {zeroCount > 0 && (
        <div className="flex items-center gap-1 text-[11px] font-medium text-rose-600"><Icon value="i:alert-triangle" className="text-[12px]" />{t(`${zeroCount} บรรทัดยังไม่มียอด (รวม = 0)`, `${zeroCount} lines have no amount (total = 0)`)}</div>
      )}

      {actions && <div className="space-y-1.5">{actions}</div>}
      {onVersions && (
        <button type="button" onClick={onVersions} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-700">
          <Icon value="i:history" className="text-[12px]" /> {t("เทียบเวอร์ชันก่อน ๆ", "Compare versions")}
        </button>
      )}
    </div>
  );
}
