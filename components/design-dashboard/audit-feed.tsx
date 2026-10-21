"use client";
// Design Dashboard: ฟีดประวัติล่าสุด (จาก Audit Log กลาง) — แยกจาก index.tsx (Y1)
import type { AuditLogEntry } from "@/app/api/audit-logs/route";
import type { BrandTheme } from "@/lib/brand-theme";
import { BrandSlot } from "@/components/brand-theme/slots";
import { auditText, formatDateTime } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

export function AuditFeed({ isPhone, isDesktop, brandTheme, auditRows }: {
  isPhone: boolean;
  isDesktop: boolean;
  brandTheme: BrandTheme;
  auditRows: AuditLogEntry[];
}) {
  const t = useT();
  return (
    <section data-gg-audit className={`rounded-lg border border-white/70 bg-slate-900 text-white shadow-sm ${isPhone ? "p-3" : "p-4"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <BrandSlot theme={brandTheme} id="audit_badge" />
                      <div>
                        <h2 className="text-sm font-semibold">{isPhone ? t("📜 ประวัติล่าสุด", "📜 Recent history") : t("ประวัติจาก Audit Log กลาง", "History from the central Audit Log")}</h2>
                        {!isPhone && <p className="mt-1 text-xs text-slate-300">{t("อ่านจากประวัติจริงของใบงานออกแบบ", "Read from the real history of design sheets")}</p>}
                      </div>
                    </div>
                    <span data-gg-audit-count className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-200">{auditRows.length} {t("รายการล่าสุด", "latest entries")}</span>
                  </div>
                  {auditRows.length === 0 ? (
                    <div data-gg-audit-row className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      {t("ยังไม่มีประวัติที่โหลดได้ หรือระบบยังไม่เปิดสิทธิ์อ่านประวัติในหน้านี้", "No history to show yet, or you don't have permission to read history here")}
                    </div>
                  ) : (
                    <div className={`mt-3 grid gap-3 ${isDesktop ? "grid-cols-3" : isPhone ? "grid-cols-1" : "grid-cols-2"}`}>
                      {auditRows.map((row) => (
                        <div key={row.id} data-gg-audit-row className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span data-gg-audit-dot className="block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]" />
                            <span className="text-[11px] text-slate-400">{formatDateTime(row.created_at)} • {row.actor_name || t("ระบบ", "System")}</span>
                          </div>
                          <div className="text-xs font-medium text-white">{auditText(row)}</div>
                          <div className="mt-1 text-[11px] text-slate-400">{row.entity_type}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
  );
}
