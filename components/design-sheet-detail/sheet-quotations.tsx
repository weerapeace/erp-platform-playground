"use client";
/**
 * แผง "ใบเสนอราคาของงานนี้" (ระบบขาย) — อยู่บนสุดของแท็บเสนอราคาในใบงานออกแบบ
 *
 * โชว์ทุกเวอร์ชันที่ผูกกับงานนี้ (ยังเปิดก่อน) · เลขที่ · สถานะ · ลูกค้า · ยอด · วันที่ · "แทนใบ…" · ใบงานอื่นในใบเดียวกัน
 * ปุ่ม: เปิดดู (/quotations?open=) · พิมพ์ · ทำต่อในตะกร้า (ใบร่าง) · ยืนยัน · ผ่าน · ไม่ผ่าน · เปิดใบใหม่แทน · ไม่ผ่าน
 *   ยืนยัน · ผ่าน (เจ้าของขอ 2026-11-07) = หน้าต่างตรวจก่อนทำ → ใบนี้ผ่าน → เปิดใบสั่งขาย (ถ้างานนี้ยังไม่มี · POST /api/so-orders)
 *     → ใบอื่นที่ติ๊ก ปิด (ร่าง = ยกเลิก · ส่งแล้ว = ปฏิเสธ "ลูกค้าเลือก …") · ใบที่มีงานอื่นร่วม ไม่ติ๊กให้
 * มีใบเปิดอยู่มากกว่า 1 ใบ = เตือนให้เหลือใบเดียว (เจ้าของขอ 2026-11-07: จะได้ไม่เปิดใบซ้ำ / ใบเก่าไม่ผ่านให้ยกเลิกใบเก่า)
 *
 * ข้อมูล: GET/POST /api/design-sheets/[id]/quotations · กติกา lib/design-sheet-quotations.ts
 * ของกลาง: MiniTable · askText (ถามเหตุผล) · useToast · state-views · apiFetch · openLink
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import { openLink } from "@/lib/open-link";
import { isQuoteOpen, quoteConfirmPlan, quoteFailAction, QUOTE_STATUS_CLS, QUOTE_STATUS_TH, type QuoteConfirmPlan, type SheetQuotation } from "@/lib/design-sheet-quotations";

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
  const [confirmPlan, setConfirmPlan] = useState<QuoteConfirmPlan | null>(null);   // หน้าต่าง "ยืนยัน · ผ่าน"

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

  // ยืนยันใบนี้ผ่าน → (เซิร์ฟเวอร์) เปลี่ยนสถานะ + ปิดใบอื่น → (หน้าจอ) เปิดใบสั่งขายถ้างานนี้ยังไม่มี
  const confirm = async (plan: QuoteConfirmPlan, closeIds: string[], makeOrder: boolean) => {
    const no = plan.pick.quote_number ?? tr("ใบนี้", "This one");
    setBusy(plan.pick.quotation_id);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/quotations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", quotation_id: plan.pick.quotation_id, close_ids: closeIds }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setConfirmPlan(null);
      const closedTxt = (j.closed ?? []).length ? tr(` · ปิดใบอื่น ${j.closed.length} ใบ`, ` · closed ${j.closed.length} other`) : "";
      const skipped = (j.skipped ?? []) as { quote_number: string | null; why: string }[];
      if (skipped.length) toast.error(tr(`ปิดไม่ได้: ${skipped.map((s) => `${s.quote_number ?? ""} (${s.why})`).join(", ")}`, `Not closed: ${skipped.map((s) => s.quote_number).join(", ")}`));
      if (j.existing_order) {
        toast.success(tr(`${no} ผ่านแล้ว${closedTxt} · งานนี้มีใบสั่งขาย ${j.existing_order.order_no ?? ""} แล้ว ไม่เปิดใหม่`, `${no} passed${closedTxt} · sales order ${j.existing_order.order_no ?? ""} already exists`));
      } else if (makeOrder && j.order_payload) {
        const o = await apiFetch("/api/so-orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...j.order_payload, open_mo: false }) }).then((r) => r.json());
        if (o.error) toast.error(tr(`${no} ผ่านแล้ว แต่เปิดใบสั่งขายไม่สำเร็จ: ${o.error} — กด “เปิดใบสั่งขาย” ที่แถวนี้เพื่อลองใหม่`, `${no} passed but the sales order failed: ${o.error}`));
        else toast.success(tr(`${no} ผ่านแล้ว${closedTxt} · เปิดใบสั่งขาย ${o.order_no ?? ""} แล้ว`, `${no} passed${closedTxt} · sales order ${o.order_no ?? ""} created`));
      } else {
        toast.success(tr(`${no} ผ่านแล้ว${closedTxt}`, `${no} passed${closedTxt}`));
      }
      onChanged?.();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("ยืนยันไม่สำเร็จ", "Confirm failed")); }
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
            {q.order_id && (
              <a href={openLink("/sales/orders", q.order_id)} target="_blank" rel="noopener noreferrer"
                className={`${btn} inline-flex items-center gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                <Icon value="i:receipt" className="text-[12px]" /> {t("ใบสั่งขาย", "Sales order")} {q.order_no ?? ""}
              </a>
            )}
            {canEdit && q.status === "draft" && q.quotation_id !== cartId && (
              <button type="button" className={`${btn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`} onClick={() => onUseAsCart(q.quotation_id)}>🧺 {t("ทำต่อ", "Continue")}</button>
            )}
            {/* ยืนยัน · ผ่าน (ร่าง/ส่งแล้ว) · ตอบรับแล้วแต่ยังไม่มีใบสั่งขาย = ปุ่ม "เปิดใบสั่งขาย" (ลองใหม่) */}
            {canEdit && !q.order_id && (q.status === "draft" || q.status === "sent" || q.status === "accepted") && (
              <button type="button" disabled={!!busy} onClick={() => { const p = quoteConfirmPlan(rows, q.quotation_id); if (p) setConfirmPlan(p); }}
                className={`${btn} inline-flex items-center gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
                <Icon value="i:circle-check" className="text-[12px]" /> {q.status === "accepted" ? t("เปิดใบสั่งขาย", "Create sales order") : t("ยืนยัน · ผ่าน", "Confirm · passed")}
              </button>
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
      {confirmPlan && (
        <ConfirmQuoteDialog plan={confirmPlan} busy={busy === confirmPlan.pick.quotation_id}
          onClose={() => setConfirmPlan(null)} onConfirm={(closeIds, makeOrder) => void confirm(confirmPlan, closeIds, makeOrder)} />
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

/** หน้าต่าง "ยืนยัน · ผ่าน" — บอกว่าระบบจะทำอะไรบ้าง ติ๊กเอาออกได้ (ของกลาง ERPModal) */
function ConfirmQuoteDialog({ plan, busy, onClose, onConfirm }: {
  plan: QuoteConfirmPlan; busy: boolean; onClose: () => void; onConfirm: (closeIds: string[], makeOrder: boolean) => void;
}) {
  const t = useT();
  const no = plan.pick.quote_number ?? t("ใบร่าง", "Draft");
  const [makeOrder, setMakeOrder] = useState(true);
  const [close, setClose] = useState<Set<string>>(() => new Set(plan.close.filter((c) => c.defaultOn).map((c) => c.quotation_id)));
  const row = "flex items-start gap-2 border-b border-slate-100 py-2 text-[13px] last:border-b-0";
  return (
    <ERPModal open onClose={onClose} size="md" title={t(`ยืนยันใบ ${no} ผ่าน?`, `Confirm ${no} as passed?`)}
      description={t("ระบบจะทำตามนี้ให้ (ติ๊กเอาออกได้)", "The system will do the following (untick to skip)")}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => onConfirm([...close], makeOrder)} disabled={busy}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? t("กำลังทำ...", "Working...") : t("ยืนยัน · ผ่าน", "Confirm · passed")}</button>
      </>}>
      <div>
        <div className={row}>
          <Icon value="i:circle-check" className="mt-0.5 text-[15px] text-emerald-600" />
          <div>
            <b>{no}</b> → <span className="rounded bg-emerald-100 px-1.5 text-[12px] font-medium text-emerald-700">{t("ผ่าน", "Passed")}</span>
            {plan.steps.includes("send") && <div className="text-[11px] text-slate-500">{t("ยังเป็นร่าง — ระบบกด “ส่งแล้ว” ให้ก่อนในขั้นเดียวกัน", "Still a draft — it is marked “sent” first")}</div>}
          </div>
        </div>
        {plan.existingOrder ? (
          <div className={row}>
            <Icon value="i:receipt" className="mt-0.5 text-[15px] text-emerald-600" />
            <div>{t(`งานนี้มีใบสั่งขายแล้ว (${plan.existingOrder.no}${plan.existingOrder.fromQuote ? ` จาก ${plan.existingOrder.fromQuote}` : ""}) — `, `This job already has sales order ${plan.existingOrder.no} — `)}<b>{t("ไม่เปิดใบใหม่", "no new order")}</b></div>
          </div>
        ) : (
          <label className={`${row} cursor-pointer`}>
            <input type="checkbox" checked={makeOrder} onChange={(e) => setMakeOrder(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <div>
              {t("เปิด", "Create a ")}<b>{t("ใบสั่งขาย", "sales order")}</b>{t(" ใหม่จากใบเสนอราคานี้ (ลูกค้า + รายการ + ราคา ตามใบนี้)", " from this quotation (customer + items + prices)")}
              <div className="text-[11px] text-slate-500">{t("เป็นใบที่หน้า “ใบสั่งขาย” — ยังไม่ใช่ใบขาย/บิล · ยังไม่เปิดใบสั่งผลิตให้ (กดเปิดเองที่ใบสั่งขาย)", "It's a sales order, not an invoice · production orders are not opened automatically")}</div>
            </div>
          </label>
        )}
        {plan.close.map((c) => (
          <label key={c.quotation_id} className={`${row} cursor-pointer`}>
            <input type="checkbox" checked={close.has(c.quotation_id)} className="mt-0.5 h-4 w-4"
              onChange={(e) => setClose((s) => { const n = new Set(s); if (e.target.checked) n.add(c.quotation_id); else n.delete(c.quotation_id); return n; })} />
            <div>
              {c.quote_number ?? t("ใบร่าง", "Draft")} ({QUOTE_STATUS_TH[c.status] ?? c.status}) → <span className="rounded bg-red-50 px-1.5 text-[12px] font-medium text-red-600">{c.action === "cancel" ? t("ยกเลิก", "Cancel") : t("ปฏิเสธ", "Reject")}</span>
              {c.action === "reject" && <div className="text-[11px] text-slate-500">{t(`ใบที่ส่งลูกค้าแล้วยกเลิกไม่ได้ตามกติกา — ใช้ “ปฏิเสธ” เหตุผล: ลูกค้าเลือก ${no}`, `Sent quotations can't be cancelled — rejected with reason: customer chose ${no}`)}</div>}
              {c.shared.length > 0 && <div className="text-[11px] text-amber-700">{t(`ใบนี้มีงาน ${c.shared.join(", ")} อยู่ด้วย — ไม่ได้ติ๊กไว้ให้ กันปิดใบของงานอื่นโดยไม่ตั้งใจ`, `Also contains ${c.shared.join(", ")} — not ticked by default`)}</div>}
            </div>
          </label>
        ))}
        {plan.close.length === 0 && <p className="pt-2 text-[11px] text-slate-400">{t("ไม่มีใบเสนอราคาอื่นของงานนี้ที่ต้องปิด", "No other open quotation for this job")}</p>}
      </div>
    </ERPModal>
  );
}
