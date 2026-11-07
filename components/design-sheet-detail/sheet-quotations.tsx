"use client";
/**
 * แผง "ใบเสนอราคาของงานนี้" (ระบบขาย) — อยู่บนสุดของแท็บเสนอราคาในใบงานออกแบบ
 *
 * โชว์ทุกเวอร์ชันที่ผูกกับงานนี้ (ยังเปิดก่อน) · เลขที่ · สถานะ · ลูกค้า · ยอด · วันที่ · "แทนใบ…" · ใบงานอื่นในใบเดียวกัน
 * ปุ่ม: เปิดดู (/quotations?open=) · พิมพ์ · ทำต่อในตะกร้า (ใบร่าง) · ไม่ผ่าน · เปิดใบใหม่แทน · ไม่ผ่าน
 * มีใบเปิดอยู่มากกว่า 1 ใบ = เตือนให้เหลือใบเดียว (เจ้าของขอ 2026-11-07: จะได้ไม่เปิดใบซ้ำ / ใบเก่าไม่ผ่านให้ยกเลิกใบเก่า)
 *
 * ข้อมูล: GET/POST /api/design-sheets/[id]/quotations · กติกา lib/design-sheet-quotations.ts
 * ของกลาง: MiniTable · askText (ถามเหตุผล) · useToast · state-views · apiFetch · openLink
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import { openLink } from "@/lib/open-link";
import { isQuoteOpen, quoteFailAction, QUOTE_STATUS_CLS, QUOTE_STATUS_TH, type SheetQuotation } from "@/lib/design-sheet-quotations";

const fmtBaht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => { if (!d) return "—"; const x = new Date(d); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short", year: "2-digit" }); };

export function SheetQuotations({ sheetId, canEdit, refreshKey, cartId, onUseAsCart, onSend, onChanged, compact = false }: {
  sheetId: string;
  canEdit: boolean;
  /** เปลี่ยนค่า = โหลดใหม่ (หลังหย่อนสินค้าเข้าใบเสนอราคา) */
  refreshKey?: number;
  /** ตะกร้าปัจจุบัน (ใบร่างที่แถบขวากำลังโชว์) */
  cartId: string | null;
  /** ตั้งใบนี้เป็นตะกร้า (ทำต่อ / ใบใหม่ที่เพิ่งเปิดแทน) */
  onUseAsCart: (quotationId: string) => void;
  /** เปิดป๊อป "ส่งไปใบเสนอราคา" */
  onSend?: () => void;
  /** สถานะใบเปลี่ยน → ให้หน้าแม่โหลดตะกร้าใหม่ */
  onChanged?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<SheetQuotation[] | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // quotation_id ที่กำลังทำ

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/quotations`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRestricted(!!j.restricted);
      setRows((j.data ?? []) as SheetQuotation[]);
    } catch (e) { setErr(e instanceof Error ? e.message : tr("โหลดใบเสนอราคาไม่สำเร็จ", "Failed to load quotations")); setRows([]); }
  }, [sheetId]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const fail = async (q: SheetQuotation, revise: boolean) => {
    const fa = quoteFailAction(q.status); if (!fa) return;
    const no = q.quote_number ?? tr("ใบร่าง", "Draft");
    const others = q.other_sheets.map((s) => s.code ?? s.name ?? "").filter(Boolean);
    const what = fa.action === "cancel"
      ? tr(`ใบ ${no} (ร่าง) จะถูก "ยกเลิก"`, `${no} (draft) will be cancelled`)
      : tr(`ใบ ${no} (${QUOTE_STATUS_TH[q.status] ?? q.status}) จะถูกบันทึกว่า "ปฏิเสธ"`, `${no} will be marked as rejected`);
    const reason = await askText({
      title: revise ? tr(`${no} ไม่ผ่าน → เปิดใบใหม่แทน`, `${no} not passed → open a new one`) : tr(`${no} ไม่ผ่าน`, `${no} not passed`),
      message: (
        <div className="space-y-1 text-sm">
          <div>{what}</div>
          {revise && <div>{tr("แล้วคัดลอกทุกบรรทัดเป็นใบร่างใหม่ ผูกกับงานนี้ (จดว่าแทนใบเก่า) แล้วเปิดในตะกร้าให้แก้ราคาต่อ", "Then every line is copied into a new draft linked to this job (marked as replacing the old one) and opened in the cart")}</div>}
          {others.length > 0 && <div className="text-amber-700">⚠️ {tr(`ใบนี้มีสินค้าจากใบงานอื่นด้วย: ${others.join(", ")} — ใบงานพวกนั้นจะเปลี่ยนตามด้วย`, `This quotation also has items from: ${others.join(", ")} — those jobs change too`)}</div>}
        </div>
      ),
      placeholder: fa.needReason ? tr("เหตุผลที่ไม่ผ่าน (จำเป็น) เช่น ลูกค้าขอราคาใหม่", "Reason (required), e.g. customer asked for a new price") : tr("เหตุผล (ไม่บังคับ)", "Reason (optional)"),
      required: fa.needReason,
      confirmText: revise ? tr("ไม่ผ่าน + เปิดใบใหม่", "Not passed + new") : tr("ยืนยัน ไม่ผ่าน", "Confirm"),
      variant: "danger",
    });
    if (reason === null) return;
    setBusy(q.quotation_id);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/quotations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: revise ? "revise" : "fail", quotation_id: q.quotation_id, reason }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      if (revise && j.new_quotation_id) {
        onUseAsCart(j.new_quotation_id as string);
        toast.success(tr(`${no} ไม่ผ่านแล้ว · เปิดใบใหม่ ${j.new_quote_number ?? ""} ในตะกร้า`, `${no} closed · new ${j.new_quote_number ?? ""} opened in the cart`));
      } else {
        toast.success(fa.action === "cancel" ? tr(`ยกเลิก ${no} แล้ว`, `${no} cancelled`) : tr(`บันทึก ${no} ว่าปฏิเสธแล้ว`, `${no} marked as rejected`));
      }
      onChanged?.();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("ทำรายการไม่สำเร็จ", "Action failed")); }
    finally { setBusy(null); }
  };

  if (rows === null) return <LoadingState label={t("กำลังโหลดใบเสนอราคา...", "Loading quotations...")} className="py-4" />;
  if (restricted) return null;   // ไม่มีสิทธิ์ดูใบเสนอราคา — ไม่ต้องโชว์แผง
  if (err) return <ErrorState title={t("โหลดใบเสนอราคาไม่สำเร็จ", "Failed to load quotations")} hint={err} onRetry={() => void load()} />;

  const openCount = rows.filter((q) => isQuoteOpen(q.status)).length;
  const btn = "h-7 px-2 rounded-md border text-[12px] whitespace-nowrap disabled:opacity-50";

  const columns: MiniColumn<SheetQuotation>[] = [
    { key: "no", header: t("เลขที่", "No."), width: "1.3fr", sortValue: (q) => q.quote_number ?? "",
      cell: (q) => (
        <div className="min-w-0">
          <a href={openLink("/quotations", q.quotation_id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline">{q.quote_number ?? t("ร่าง", "Draft")}</a>
          {q.quotation_id === cartId && <span className="ml-1 rounded bg-indigo-50 px-1 text-[11px] text-indigo-600">🧺 {t("ในตะกร้า", "In cart")}</span>}
          {q.replaces_quote_number && <div className="text-[11px] text-slate-400">{t(`แทนใบ ${q.replaces_quote_number}`, `Replaces ${q.replaces_quote_number}`)}</div>}
          {q.replaced_by_quote_number && <div className="text-[11px] text-slate-400">{t(`→ เปิดใบใหม่แล้ว ${q.replaced_by_quote_number}`, `→ Replaced by ${q.replaced_by_quote_number}`)}</div>}
          {q.other_sheets.length > 0 && <div className="truncate text-[11px] text-slate-400" title={q.other_sheets.map((s) => `${s.code ?? ""} ${s.name ?? ""}`).join("\n")}>{t("รวมกับ", "With")} {q.other_sheets.map((s) => s.code).filter(Boolean).join(", ")}</div>}
        </div>
      ) },
    { key: "status", header: t("สถานะ", "Status"), width: "6.5rem", sortValue: (q) => (isQuoteOpen(q.status) ? 0 : 1),
      cell: (q) => (
        <span title={q.reject_reason ?? undefined} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${QUOTE_STATUS_CLS[q.status] ?? "bg-slate-100 text-slate-600"}`}>{QUOTE_STATUS_TH[q.status] ?? q.status}</span>
      ) },
    { key: "customer", header: t("ลูกค้า", "Customer"), width: "1.6fr", sortValue: (q) => q.customer_name ?? "",
      cell: (q) => <span className="block truncate text-slate-600" title={q.customer_name ?? ""}>{q.customer_name ?? "—"}</span> },
    { key: "total", header: t("ยอดรวม", "Total"), width: "7rem", align: "right", sortValue: (q) => q.grand_total,
      cell: (q) => <span className="tabular-nums">{fmtBaht(q.grand_total)}</span> },
    { key: "date", header: t("วันที่", "Date"), width: "5.5rem", sortValue: (q) => q.quote_date ?? "",
      cell: (q) => <span className="text-slate-500">{fmtDate(q.quote_date)}</span> },
    { key: "act", header: "", width: compact ? "auto" : "minmax(15rem,auto)", align: "right",
      cell: (q) => {
        const fa = quoteFailAction(q.status);
        const working = busy === q.quotation_id;
        return (
          <div className="flex flex-wrap justify-end gap-1">
            <button type="button" className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`} onClick={() => window.open(`/print/quotation/${q.quotation_id}`, "_blank", "noopener,noreferrer")}>{t("พิมพ์", "Print")}</button>
            {canEdit && q.status === "draft" && q.quotation_id !== cartId && (
              <button type="button" className={`${btn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`} onClick={() => onUseAsCart(q.quotation_id)}>🧺 {t("ทำต่อ", "Continue")}</button>
            )}
            {canEdit && fa && (
              <>
                <button type="button" disabled={!!busy} className={`${btn} border-amber-300 text-amber-800 hover:bg-amber-50`} onClick={() => void fail(q, true)}>
                  {working ? t("กำลังทำ...", "Working...") : t("ไม่ผ่าน · เปิดใบใหม่แทน", "Not passed · new one")}</button>
                <button type="button" disabled={!!busy} className={`${btn} border-red-200 text-red-600 hover:bg-red-50`} onClick={() => void fail(q, false)}>{t("ไม่ผ่าน", "Not passed")}</button>
              </>
            )}
          </div>
        );
      } },
  ];

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      {openCount > 1 && (
        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          ⚠️ {t(`งานนี้มีใบเสนอราคาที่ยังเปิดอยู่ ${openCount} ใบ — ควรเหลือใบเดียว: กด "ไม่ผ่าน" ใบที่ไม่ใช้แล้ว (ใบร่าง = ยกเลิก · ใบที่ส่งแล้ว = ปฏิเสธ)`,
                `This job has ${openCount} open quotations — keep only one: mark the unused ones "Not passed"`)}
        </div>
      )}
      <MiniTable
        rows={rows}
        rowKey={(q) => q.quotation_id}
        columns={columns}
        title={<span className="text-sm font-semibold text-slate-700">🧾 {t("ใบเสนอราคาของงานนี้", "Quotations for this job")}</span>}
        countUnit={t("ใบ", "docs")}
        actions={canEdit && onSend ? (
          <button type="button" onClick={onSend} className="h-8 px-3 rounded-lg bg-blue-600 text-[13px] text-white hover:bg-blue-700">{t("＋ ส่งไปใบเสนอราคา", "+ Send to quotation")}</button>
        ) : undefined}
        emptyText={t("ยังไม่มีใบเสนอราคาของงานนี้ — กด \"ส่งไปใบเสนอราคา\" เพื่อเริ่มใบแรก", "No quotation for this job yet — press \"Send to quotation\" to start one")}
        dense
        hideToolbar
        layout={compact ? "cards" : "table"}
        renderCard={(q) => (
          <div className="space-y-1 p-2 text-[13px]">
            <div className="flex items-center gap-2">{columns[0].cell(q)}<span className="ml-auto">{columns[1].cell(q)}</span></div>
            <div className="flex items-center justify-between text-slate-500"><span className="truncate">{q.customer_name ?? "—"}</span><span className="tabular-nums text-slate-700">{fmtBaht(q.grand_total)}</span></div>
            {columns[5].cell(q)}
          </div>
        )}
      />
    </div>
  );
}
