"use client";
/**
 * แผง "ใบเสนอราคาของงานนี้" (ระบบขาย) — อยู่บนสุดของแท็บเสนอราคาในใบงานออกแบบ
 *
 * โชว์ทุกเวอร์ชันที่ผูกกับงานนี้ (ยังเปิดก่อน) · เลขที่ · สถานะ · ลูกค้า · ยอด · วันที่ · "แทนใบ…" · ใบงานอื่นในใบเดียวกัน
 * ปุ่ม: เปิดดู (/quotations?open=) · พิมพ์ · ทำต่อในตะกร้า (ใบร่าง) · ยืนยัน · ผ่าน · ไม่ผ่าน · เปิดใบใหม่แทน · ไม่ผ่าน
 *   ยืนยัน · ผ่าน (เจ้าของขอ 2026-11-07) = หน้าต่างตรวจก่อนทำ → ใบนี้ผ่าน → เปิดใบสั่งขาย (ถ้างานนี้ยังไม่มี · POST /api/so-orders)
 *     → ใบอื่นที่ติ๊ก ปิด (ร่าง = ยกเลิก · ส่งแล้ว = ปฏิเสธ "ลูกค้าเลือก …") · ใบที่มีงานอื่นร่วม ไม่ติ๊กให้
 * มีใบเปิดอยู่มากกว่า 1 ใบ = เตือนให้เหลือใบเดียว (เจ้าของขอ 2026-11-07: จะได้ไม่เปิดใบซ้ำ / ใบเก่าไม่ผ่านให้ยกเลิกใบเก่า)
 * แบบกะทัดรัด (เจ้าของเลือกแบบ A 2026-11-10): แถวละปุ่มหลักปุ่มเดียว (ยืนยัน · ผ่าน / เปิดใบสั่งขาย / ลิงก์ใบสั่งขาย)
 *   ที่เหลือ (พิมพ์ · ทำต่อในตะกร้า · ไม่ผ่าน · ไม่ผ่าน+เปิดใบใหม่) อยู่ในปุ่ม ⋮ (ของกลาง Popover) · คำเตือนเป็นป้ายเล็กที่หัวแผง
 *
 * เอาออกจากงานนี้ (เจ้าของขอ 2026-11-19 · ระบบเก่าเดาผูกผิด): ⋮ → "เอาออกจากงานนี้" / "เอาออกทั้งสาย" (ใบที่เปิดแทนกัน)
 *   ตัดแค่การผูก ตัวใบไม่ถูกลบ · ถามยืนยันก่อน · แจ้งผลมีปุ่ม "ย้อนกลับ" · ป้าย "ชื่อไม่ตรงงาน" = ชื่อสินค้าในใบไม่ตรงชื่อใบงาน
 * ข้อมูล: GET/POST /api/design-sheets/[id]/quotations · กติกา lib/design-sheet-quotations.ts
 * ของกลาง: MiniTable · Popover (เมนู ⋮) · askText (ถามเหตุผล) · useToast · state-views · apiFetch · openLink
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Popover } from "@/components/popover";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { LoadingState, ErrorState } from "@/components/state-views";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { apiFetch } from "@/lib/api";
import { openLink } from "@/lib/open-link";
import { EmbedModal } from "@/components/embed-modal";
import { guessSkuForLine, isQuoteOpen, quoteChainIds, quoteConfirmPlan, quoteFailAction, QUOTE_STATUS_CLS, QUOTE_STATUS_TH, type QuoteConfirmPlan, type QuoteLineSkuMap, type SheetQuotation } from "@/lib/design-sheet-quotations";
import { SearchableSelect } from "@/components/searchable-select";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import type { DesignSheetLinkedSku } from "@/app/api/design-sheets/[id]/route";
import type { QuoteLine } from "@/app/api/quotations/route";

const fmtBaht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => { if (!d) return "—"; const x = new Date(d); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short", year: "2-digit" }); };

export function SheetQuotations({ sheetId, canEdit, refreshKey, cartId, onUseAsCart, onSend, onChanged, compact = false, linkedSkus = [], onCreateSku }: {
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
  /** SKU ของงานนี้ — ผูกกับรายการใบเสนอราคาก่อนเปิดใบสั่งขาย (เจ้าของขอ 2026-11-19) */
  linkedSkus?: DesignSheetLinkedSku[];
  /** งานนี้ยังไม่มี SKU → ปุ่ม "สร้าง SKU" ในหน้าต่างยืนยัน (ไม่ส่ง = ไม่มีสิทธิ์สร้าง) */
  onCreateSku?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<SheetQuotation[] | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // quotation_id ที่กำลังทำ
  const [confirmPlan, setConfirmPlan] = useState<QuoteConfirmPlan | null>(null);   // หน้าต่าง "ยืนยัน · ผ่าน"
  // กดเลขที่ใบ = เปิดใบเสนอราคาเป็นป๊อป (ของกลาง EmbedModal · เจ้าของขอ 2026-11-22) · Ctrl/คลิกกลาง = แท็บใหม่เหมือนเดิม · ปิดป๊อป = โหลดรายการใหม่ (เผื่อแก้ในป๊อป)
  const [peek, setPeek] = useState<{ id: string; no: string } | null>(null);

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

  // เอาออกจากงานนี้ (+ ทั้งสาย) — ย้อนกลับได้จากแจ้งผลมุมจอ
  const unlink = async (q: SheetQuotation, chain: boolean) => {
    const ids = chain ? quoteChainIds(rows ?? [], q.quotation_id) : [q.quotation_id];
    const nos = (rows ?? []).filter((r) => ids.includes(r.quotation_id)).map((r) => r.quote_number ?? tr("ร่าง", "Draft"));
    const others = q.other_sheets.map((x) => x.code).filter(Boolean).join(", ");
    const ok = await askConfirm({
      title: chain ? tr(`เอาออกทั้งสาย ${ids.length} ใบ?`, `Remove the whole chain (${ids.length})?`) : tr(`เอา ${nos[0]} ออกจากงานนี้?`, `Remove ${nos[0]} from this job?`),
      message: (
        <div className="space-y-1.5 text-sm">
          {chain && <div className="font-medium text-slate-700">{nos.join(" · ")}</div>}
          <div>{tr("ตัดแค่การผูกกับใบงานนี้ — ตัวใบเสนอราคาไม่ถูกลบ ยังอยู่ในระบบขายตามเดิม", "Only the link to this job is removed — the quotation itself stays in sales")}</div>
          {others && <div className="text-slate-500">{tr(`ยังผูกกับ ${others} ตามเดิม`, `Still linked to ${others}`)}</div>}
          <div className="text-slate-500">{tr("พลาดกด \"ย้อนกลับ\" ที่แจ้งผลมุมจอได้", "Press \"Undo\" on the notice if this was a mistake")}</div>
        </div>
      ),
      variant: "danger", confirmText: tr("เอาออก", "Remove"), cancelText: tr("ไม่เอาออก", "Keep"),
    });
    if (!ok) return;
    setBusy(q.quotation_id);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/quotations`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", quotation_id: q.quotation_id, chain }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const removed = j.removed ?? [];
      toast.undo(tr(`เอาออกจากงานนี้แล้ว ${removed.length} ใบ`, `Removed ${removed.length} from this job`), async () => {
        const u = await apiFetch(`/api/design-sheets/${sheetId}/quotations`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "relink", rows: removed }) }).then((r) => r.json()).catch(() => ({ error: tr("ย้อนกลับไม่สำเร็จ", "Undo failed") }));
        if (u.error) toast.error(u.error); else { toast.success(tr("ผูกคืนแล้ว", "Restored")); onChanged?.(); await load(); }
      }, { ms: 10000 });
      onChanged?.();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("เอาออกไม่สำเร็จ", "Remove failed")); }
    finally { setBusy(null); }
  };

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
  const confirm = async (plan: QuoteConfirmPlan, closeIds: string[], makeOrder: boolean, lineMap: QuoteLineSkuMap[] = []) => {
    const no = plan.pick.quote_number ?? tr("ใบนี้", "This one");
    setBusy(plan.pick.quotation_id);
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}/quotations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", quotation_id: plan.pick.quotation_id, close_ids: closeIds, line_map: lineMap }),
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
  const menuItem = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 disabled:opacity-50";

  const columns: MiniColumn<SheetQuotation>[] = [
    { key: "no", header: t("เลขที่", "No."), width: "1.3fr", sortValue: (q) => q.quote_number ?? "",
      cell: (q) => (
        <div className="min-w-0">
          <a href={openLink("/quotations", q.quotation_id)} target="_blank" rel="noopener noreferrer" title={t("เปิดใบเสนอราคา (Ctrl+คลิก = แท็บใหม่)", "Open quotation (Ctrl+click = new tab)")}
            onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setPeek({ id: q.quotation_id, no: q.quote_number ?? t("ร่าง", "Draft") }); }}
            className="font-semibold text-blue-700 hover:underline">{q.quote_number ?? t("ร่าง", "Draft")}</a>
          {q.quotation_id === cartId && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1 text-[11px] text-indigo-600"><Icon value="i:basket" className="text-[11px]" />{t("ในตะกร้า", "In cart")}</span>}
          {(() => {
            const sub = [
              q.replaces_quote_number ? t(`แทนใบ ${q.replaces_quote_number}`, `Replaces ${q.replaces_quote_number}`) : null,
              q.replaced_by_quote_number ? t(`→ เปิดใบใหม่แล้ว ${q.replaced_by_quote_number}`, `→ Replaced by ${q.replaced_by_quote_number}`) : null,
              q.other_sheets.length ? `${t("รวมกับ", "With")} ${q.other_sheets.map((s) => s.code).filter(Boolean).join(", ")}` : null,
            ].filter(Boolean).join(" · ");
            const warn = q.name_mismatch ? (
              <span className="mr-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[11px] font-medium text-amber-800"
                title={[t(`ชื่อสินค้าในใบนี้ไม่ตรงกับชื่องาน — อาจผูกผิด (ระบบเก่าเดาให้) · กด ⋮ → "เอาออกจากงานนี้"`, `Item names don't match this job — may be linked by mistake · ⋮ → "Remove from this job"`), ...(q.line_names ?? [])].join("\n")}>
                <Icon value="i:alert-triangle" className="text-[11px]" />{t("ชื่อไม่ตรงงาน", "Name mismatch")}{q.line_names?.[0] ? `: ${q.line_names[0]}` : ""}
              </span>
            ) : null;
            if (warn) return <div className="truncate text-[11px] text-slate-400">{warn}{sub}</div>;
            return sub ? <div className="truncate text-[11px] text-slate-400" title={[sub, ...q.other_sheets.map((s) => `${s.code ?? ""} ${s.name ?? ""}`)].join("\n")}>{sub}</div> : null;
          })()}
        </div>
      ) },
    { key: "status", header: t("สถานะ", "Status"), width: "5.5rem", sortValue: (q) => (isQuoteOpen(q.status) ? 0 : 1),
      cell: (q) => (
        <span title={q.reject_reason ?? undefined} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${QUOTE_STATUS_CLS[q.status] ?? "bg-slate-100 text-slate-600"}`}>{QUOTE_STATUS_TH[q.status] ?? q.status}</span>
      ) },
    { key: "customer", header: t("ลูกค้า", "Customer"), width: "1.6fr", sortValue: (q) => q.customer_name ?? "",
      cell: (q) => <span className="block truncate text-slate-600" title={q.customer_name ?? ""}>{q.customer_name ?? "—"}</span> },
    { key: "total", header: t("ยอดรวม", "Total"), width: "7rem", align: "right", sortValue: (q) => q.grand_total,
      cell: (q) => <span className="tabular-nums">{fmtBaht(q.grand_total)}</span> },
    { key: "date", header: t("วันที่", "Date"), width: "5.5rem", sortValue: (q) => q.quote_date ?? "",
      cell: (q) => <span className="text-slate-500">{fmtDate(q.quote_date)}</span> },
    { key: "act", header: "", width: "auto", align: "right",
      cell: (q) => {
        const fa = quoteFailAction(q.status);
        const working = busy === q.quotation_id;
        // ยืนยัน · ผ่าน (ร่าง/ส่งแล้ว) · ตอบรับแล้วแต่ยังไม่มีใบสั่งขาย = "เปิดใบสั่งขาย" (ลองใหม่)
        const canConfirm = canEdit && !q.order_id && (q.status === "draft" || q.status === "sent" || q.status === "accepted");
        const canCart = canEdit && q.status === "draft" && q.quotation_id !== cartId;
        const chainLen = quoteChainIds(rows, q.quotation_id).length;
        return (
          <div className="flex items-center justify-end gap-1">
            {working && <span className="text-[11px] text-slate-400">{t("กำลังทำ...", "Working...")}</span>}
            {canConfirm ? (
              <button type="button" disabled={!!busy} onClick={() => { const p = quoteConfirmPlan(rows, q.quotation_id); if (p) setConfirmPlan(p); }}
                className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md bg-emerald-600 px-2.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                <Icon value="i:circle-check" className="text-[13px]" /> {q.status === "accepted" ? t("เปิดใบสั่งขาย", "Create sales order") : t("ยืนยัน · ผ่าน", "Confirm · passed")}
              </button>
            ) : q.order_id ? (
              <a href={openLink("/sales/orders", q.order_id)} target="_blank" rel="noopener noreferrer" title={t("เปิดใบสั่งขาย", "Open the sales order")}
                className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[12px] text-emerald-700 hover:bg-emerald-100">
                <Icon value="i:receipt" className="text-[12px]" /> {q.order_no ?? t("ใบสั่งขาย", "Sales order")}
              </a>
            ) : null}
            <Popover align="right" panelClassName="w-60 py-1"
              trigger={(toggle, open) => (
                <button type="button" onClick={toggle} aria-label={t("คำสั่งอื่น", "More actions")} title={t("พิมพ์ · ทำต่อ · ไม่ผ่าน · เอาออก", "Print · continue · not passed · remove")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-slate-500 hover:bg-slate-50 ${open ? "border-slate-400 bg-slate-50" : "border-slate-200"}`}>
                  <Icon value="i:dots-vertical" className="text-[15px]" />
                </button>
              )}>
              {(close) => (
                <>
                  <button type="button" className={`${menuItem} text-slate-700`} onClick={() => { close(); window.open(`/print/quotation/${q.quotation_id}`, "_blank", "noopener,noreferrer"); }}>
                    <Icon value="i:printer" className="text-[15px] text-slate-400" />{t("พิมพ์", "Print")}</button>
                  {canCart && (
                    <button type="button" className={`${menuItem} text-indigo-700`} onClick={() => { close(); onUseAsCart(q.quotation_id); }}>
                      <Icon value="i:basket" className="text-[15px]" />{t("ทำต่อในตะกร้า", "Continue in the cart")}</button>
                  )}
                  {canEdit && fa && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button type="button" disabled={!!busy} className={`${menuItem} text-amber-800`} onClick={() => { close(); void fail(q, true); }}>
                        <Icon value="i:refresh" className="text-[15px]" />{t("ไม่ผ่าน · เปิดใบใหม่แทน", "Not passed · open a new one")}</button>
                      <button type="button" disabled={!!busy} className={`${menuItem} text-red-600`} onClick={() => { close(); void fail(q, false); }}>
                        <Icon value="i:circle-x" className="text-[15px]" />{t("ไม่ผ่าน", "Not passed")}</button>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button type="button" disabled={!!busy} className={`${menuItem} text-red-600`} onClick={() => { close(); void unlink(q, false); }}>
                        <Icon value="i:x" className="text-[15px]" />{t("เอาออกจากงานนี้", "Remove from this job")}</button>
                      {chainLen > 1 && (
                        <button type="button" disabled={!!busy} className={`${menuItem} text-red-600`} onClick={() => { close(); void unlink(q, true); }}>
                          <Icon value="i:x" className="text-[15px]" />{t(`เอาออกทั้งสาย (${chainLen} ใบ)`, `Remove whole chain (${chainLen})`)}</button>
                      )}
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>
        );
      } },
  ];

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2.5">
      {peek && <EmbedModal url={openLink("/quotations", peek.id)} title={t(`ใบเสนอราคา ${peek.no}`, `Quotation ${peek.no}`)} storageKey="dsd_quote_peek" onClose={() => { setPeek(null); void load(); }} />}
      {confirmPlan && (
        <ConfirmQuoteDialog plan={confirmPlan} busy={busy === confirmPlan.pick.quotation_id} linkedSkus={linkedSkus}
          onCreateSku={onCreateSku ? () => { setConfirmPlan(null); onCreateSku(); } : undefined}
          onClose={() => setConfirmPlan(null)} onConfirm={(closeIds, makeOrder, lineMap) => void confirm(confirmPlan, closeIds, makeOrder, lineMap)} />
      )}
      <MiniTable
        rows={rows}
        rowKey={(q) => q.quotation_id}
        columns={columns}
        title={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700"><Icon value="i:file-invoice" className="text-[15px] text-slate-400" />{t("ใบเสนอราคาของงานนี้", "Quotations for this job")}</span>
            {openCount > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                title={t(`งานนี้มีใบเสนอราคาที่ยังเปิดอยู่ ${openCount} ใบ — ควรเหลือใบเดียว: กด ⋮ → "ไม่ผ่าน" ใบที่ไม่ใช้แล้ว (ใบร่าง = ยกเลิก · ใบที่ส่งแล้ว = ปฏิเสธ)`, `${openCount} open quotations — keep only one: ⋮ → "Not passed" on the unused ones`)}>
                <Icon value="i:alert-triangle" className="text-[12px]" />{t(`เปิดอยู่ ${openCount} ใบ · ควรเหลือ 1`, `${openCount} open · keep 1`)}
              </span>
            )}
          </span>
        )}
        countUnit={t("ใบ", "docs")}
        actions={canEdit && onSend ? (
          <button type="button" onClick={onSend} className="h-7 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[12px] text-white hover:bg-blue-700">{t("＋ ส่งไปใบเสนอราคา", "+ Send to quotation")}</button>
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
function ConfirmQuoteDialog({ plan, busy, onClose, onConfirm, linkedSkus, onCreateSku }: {
  plan: QuoteConfirmPlan; busy: boolean; onClose: () => void; onConfirm: (closeIds: string[], makeOrder: boolean, lineMap: QuoteLineSkuMap[]) => void;
  linkedSkus: DesignSheetLinkedSku[]; onCreateSku?: () => void;
}) {
  const t = useT();
  const no = plan.pick.quote_number ?? t("ใบร่าง", "Draft");
  const [makeOrder, setMakeOrder] = useState(true);
  const [close, setClose] = useState<Set<string>>(() => new Set(plan.close.filter((c) => c.defaultOn).map((c) => c.quotation_id)));
  const row = "flex items-start gap-2 border-b border-slate-100 py-2 text-[13px] last:border-b-0";
  // ── ผูกรายการกับ SKU (เจ้าของขอ 2026-11-19) — ต้องครบก่อนเปิดใบสั่งขาย ──
  type MapRow = { sku_id: string | null; guessed: boolean; useSkuPrice: boolean; setSkuPrice: boolean; other: boolean };
  type SkuInfo = { id: string; code: string; label: string; list_price: number | null; image_key: string | null };
  const [lines, setLines] = useState<QuoteLine[] | null>(null);
  const [map, setMap] = useState<Record<string, MapRow>>({});
  const [extra, setExtra] = useState<Record<string, SkuInfo>>({});   // SKU นอกงานนี้ที่เลือกจากตัวค้นหา
  const sheetSkus: SkuInfo[] = linkedSkus.filter((s) => s.is_active).map((s) => ({ id: s.id, code: s.code, label: [s.color, s.name_th].filter(Boolean).join(" · "), list_price: s.list_price ?? null, image_key: s.image_key }));
  const skuInfo = (id: string | null) => (id ? sheetSkus.find((s) => s.id === id) ?? extra[id] ?? null : null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/quotations/${plan.pick.quotation_id}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const ls = ((j?.data?.lines ?? []) as QuoteLine[]).filter((l) => l.id && ((l.product_name ?? "").trim() || l.sku));
      const init: Record<string, MapRow> = {};
      for (const l of ls) {
        const byId = l.product_id ? linkedSkus.find((s) => s.id === l.product_id) : null;
        const byCode = !byId && l.sku ? linkedSkus.find((s) => s.code === l.sku) : null;
        const g = byId || byCode ? null : guessSkuForLine(l.product_name ?? "", linkedSkus.filter((s) => s.is_active));
        const pick = byId ?? byCode ?? g;
        init[l.id!] = { sku_id: pick?.id ?? null, guessed: !!g && !byId && !byCode, useSkuPrice: false, setSkuPrice: true, other: false };
      }
      setLines(ls); setMap(init);
    }).catch(() => { if (alive) setLines([]); });
    return () => { alive = false; };
  }, [plan.pick.quotation_id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setRow = (id: string, p: Partial<MapRow>) => setMap((m) => ({ ...m, [id]: { ...m[id], ...p } }));
  const needMap = makeOrder && !plan.existingOrder;
  const unmapped = (lines ?? []).filter((l) => !map[l.id!]?.sku_id).length;
  const blocked = needMap && (lines === null || unmapped > 0);
  const lineMap: QuoteLineSkuMap[] = (lines ?? []).flatMap((l) => { const m = map[l.id!]; return m?.sku_id ? [{ line_id: l.id!, sku_id: m.sku_id, use_sku_price: m.useSkuPrice, set_sku_price: m.setSkuPrice }] : []; });
  const baht = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <ERPModal open onClose={onClose} size="lg" title={t(`ยืนยันใบ ${no} ผ่าน?`, `Confirm ${no} as passed?`)}
      description={t("ระบบจะทำตามนี้ให้ (ติ๊กเอาออกได้)", "The system will do the following (untick to skip)")}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => onConfirm([...close], makeOrder, lineMap)} disabled={busy || blocked}
          title={blocked ? t("ผูก SKU ให้ครบทุกรายการก่อน (หรือเอาติ๊ก “เปิดใบสั่งขาย” ออก)", "Link every line to an SKU first (or untick “create sales order”)") : undefined}
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

        {/* 🔗 ผูกรายการกับ SKU — ต้องครบก่อนเปิดใบสั่งขาย · เขียน SKU (+รูป) กลับลงใบเสนอราคาด้วย */}
        {needMap && (
          <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
              <b>{t("ผูกรายการกับ SKU", "Link lines to SKUs")}</b>
              <span className="text-[11px] text-slate-500">{t("ต้องครบก่อนเปิดใบสั่งขาย · รูปและรหัสในใบสั่งขายมาจาก SKU", "Required before the sales order · its image and code come from the SKU")}</span>
            </div>
            {sheetSkus.length === 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
                {t("งานนี้ยังไม่มี SKU — สร้าง SKU ก่อน หรือค้นหา SKU ที่มีอยู่แล้ว", "This job has no SKUs yet — create them first, or search existing SKUs")}
                {onCreateSku && <button type="button" onClick={onCreateSku} className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">{t("สร้าง SKU", "Create SKU")}</button>}
              </div>
            )}
            {lines === null ? <p className="py-3 text-center text-xs text-slate-400">{t("กำลังโหลดรายการ…", "Loading lines…")}</p> : lines.length === 0 ? <p className="py-2 text-xs text-slate-400">{t("ใบนี้ไม่มีรายการ", "No lines")}</p> : (
              <div className="divide-y divide-slate-100">
                {lines.map((l) => {
                  const m = map[l.id!] ?? { sku_id: null, guessed: false, useSkuPrice: false, setSkuPrice: true, other: false };
                  const info = skuInfo(m.sku_id);
                  const noSkuPrice = !!info && (info.list_price == null || info.list_price <= 0);
                  return (
                    <div key={l.id} className="grid gap-2 py-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:items-start">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800" title={l.product_name}>{l.product_name || l.sku}</div>
                        <div className="text-[11px] text-slate-500">{t(`${Number(l.qty).toLocaleString("th-TH")} ${l.unit || ""} × ${baht(l.unit_price)}`, `${l.qty} × ${baht(l.unit_price)}`)}</div>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          {info?.image_key ? <img src={`/api/r2-image?key=${encodeURIComponent(info.image_key)}`} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="h-8 w-8 shrink-0 rounded bg-slate-100" />}
                          <div className={`min-w-0 flex-1 ${!m.sku_id ? "rounded-md ring-1 ring-rose-300" : ""}`}>
                            {m.other ? (
                              <SkuPicker value={null} placeholder={t("ค้นหา SKU (รหัส / ชื่อ)", "Search SKU (code / name)")}
                                onChange={(v: SkuPickerValue | null) => { if (!v) return; setExtra((x) => ({ ...x, [v.id]: { id: v.id, code: v.code, label: [v.color, v.name].filter(Boolean).join(" · "), list_price: v.list_price ?? null, image_key: v.image_key ?? null } })); setRow(l.id!, { sku_id: v.id, guessed: false, other: false }); }} />
                            ) : (
                              <SearchableSelect value={m.sku_id ?? ""} placeholder={t("— เลือก SKU —", "— Pick SKU —")}
                                options={[...sheetSkus, ...Object.values(extra).filter((x) => !sheetSkus.some((s) => s.id === x.id))].map((s) => ({ value: s.id, label: s.code, sub: s.label || undefined }))}
                                onChange={(v) => setRow(l.id!, { sku_id: v || null, guessed: false })} />
                            )}
                          </div>
                          {m.guessed && <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700" title={t("ระบบเดาจากชื่อ/สี — ตรวจให้ถูก", "Guessed from name/colour — please check")}>{t("เดา", "Guess")}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                          <button type="button" onClick={() => setRow(l.id!, { other: !m.other })} className="text-blue-600 hover:underline">{m.other ? t("เลือกจาก SKU ของงานนี้", "Pick from this job's SKUs") : t("SKU อื่น (ค้นหา)", "Other SKU (search)")}</button>
                          {info && (
                            <>
                              <label className="inline-flex items-center gap-1"><input type="radio" checked={!m.useSkuPrice} onChange={() => setRow(l.id!, { useSkuPrice: false })} />{t(`ราคาเสนอ ${baht(l.unit_price)}`, `Quote price ${baht(l.unit_price)}`)}</label>
                              {!noSkuPrice && <label className="inline-flex items-center gap-1"><input type="radio" checked={m.useSkuPrice} onChange={() => setRow(l.id!, { useSkuPrice: true })} />{t(`ราคา SKU ${baht(info.list_price)}`, `SKU price ${baht(info.list_price)}`)}</label>}
                              {noSkuPrice && <label className="inline-flex items-center gap-1 text-amber-700"><input type="checkbox" checked={m.setSkuPrice} onChange={(e) => setRow(l.id!, { setSkuPrice: e.target.checked })} />{t(`SKU ยังไม่มีราคาขาย — ตั้ง = ${baht(l.unit_price)}`, `SKU has no sale price — set to ${baht(l.unit_price)}`)}</label>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {lines && unmapped > 0 && <p className="mt-1 text-[12px] text-rose-600">{t(`เหลือ ${unmapped} รายการยังไม่ผูก SKU — ผูกให้ครบ หรือเอาติ๊ก “เปิดใบสั่งขาย” ออกเพื่อยืนยันผ่านอย่างเดียว`, `${unmapped} line(s) not linked — link them, or untick “create sales order”`)}</p>}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
