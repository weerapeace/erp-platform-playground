"use client";

/**
 * ป๊อป "ส่งชิ้นไปตีราคา" ของสตูดิโอแพทเทิร์น — เลือกใบงานออกแบบ + แท็บตีราคา → เห็นสรุปก่อน → กดส่ง
 *   ส่ง = เพิ่มบรรทัดใหม่ + อัปเดตบรรทัดของชิ้นที่เคยส่ง · ไม่ลบบรรทัดเดิมของใบงาน (กติกาอยู่ที่ lib/pattern-costing)
 *   เลือกใบงานด้วยตัวเลือกกลาง DesignSheetPicker · เขียนผ่าน POST /api/pattern-projects/<id>/costing (ลองก่อนด้วย dry)
 *   + ซิปและอะไหล่ของแพทเทิร์น (ปุ่ม "ซิป / อะไหล่") ไปด้วย: 1 วัสดุ = 1 บรรทัด — โชว์รายบรรทัดก่อนกดส่ง (lib/pattern-trims)
 *   ใช้ข้อมูลแพทเทิร์นที่บันทึกแล้ว → ปุ่มเปิดป๊อปนี้ถูกปิดไว้ถ้ายังมีการแก้ที่ไม่ได้บันทึก
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { DesignSheetPicker, fetchDesignSheetCards } from "@/components/pickers/design-sheet-picker";
import { apiFetch } from "@/lib/api";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";
import type { DesignSheetCard } from "@/lib/design-sheet-view";

export type CostingTarget = { sheet_id: string; code?: string; name?: string; parent_code: string | null; at?: string };
type TrimLine = { name: string; mode: "length" | "count"; total: number; parts: number; amount: number | null; action: "add" | "update" };
type TrimPreview = { added: number; updated: number; lines: TrimLine[]; stale: number; skipped: string[]; missing_items: string[]; no_qty: number; gone: number; open_slits: number };
type Preview = { added: number; updated: number; stale: number; no_material: number; missing_items: string[]; amount: number; trims?: TrimPreview };

export function SendCostingModal({ open, onClose, projectId, last, onSent }: {
  open: boolean; onClose: () => void; projectId: string;
  /** เป้าหมายที่ส่งครั้งล่าสุด — เลือกไว้ให้ก่อน */
  last?: CostingTarget | null;
  /** ส่งสำเร็จ → ช่อง template ล่าสุดของแพทเทิร์น (มีเป้าหมายที่เพิ่งส่ง) */
  onSent: (template: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [sheets, setSheets] = useState<DesignSheetCard[]>([]);
  const [tabs, setTabs] = useState<{ key: string; label: string }[]>([]);
  const [parent, setParent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<null | "check" | "send">(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Preview | null>(null);
  const sheet = sheets[0] ?? null;

  // เปิดป๊อป → เลือกใบงานที่เคยส่งไว้ให้
  useEffect(() => {
    if (!open) return;
    setDone(null); setErr(null); setPreview(null);
    if (last?.sheet_id) { setParent(last.parent_code ?? ""); void fetchDesignSheetCards([last.sheet_id]).then((c) => setSheets(c.slice(0, 1))).catch(() => setSheets([])); }
    else { setSheets([]); setParent(""); }
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps — ตั้งค่าตอนเปิดเท่านั้น (ส่งเสร็จ last เปลี่ยน ต้องไม่ล้างผลที่เพิ่งโชว์)

  // เลือกใบงาน → โหลดแท็บตีราคาของใบนั้น (ทั่วไป + ไซส์/เวอร์ชัน)
  useEffect(() => {
    if (!sheet) { setTabs([]); return; }
    let alive = true;
    apiFetch(`/api/design-sheets/${sheet.id}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const d = (j?.data ?? {}) as { parent_sku_codes?: string[]; parent_sku_drafts?: string[]; cost_general_label?: string | null };
      const general = generalLabelOf(d.cost_general_label);
      const keys = ["", ...(d.parent_sku_codes ?? []), ...(d.parent_sku_drafts ?? [])].filter((k, i, a) => a.indexOf(k) === i);
      setTabs(keys.map((k) => ({ key: k, label: costTabLabel(k, general) })));
      setParent((p) => (keys.includes(p) ? p : ""));
    }).catch(() => { if (alive) setTabs([{ key: "", label: generalLabelOf(null) }]); });
    return () => { alive = false; };
  }, [sheet?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (dry: boolean) => {
    const res = await apiFetch(`/api/pattern-projects/${projectId}/costing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheet_id: sheet?.id, parent_code: parent || null, dry }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
    return j.data as Preview & { template?: Record<string, unknown> };
  };
  // เลือกใบ + แท็บครบ → ลองก่อน (ไม่เขียน) เพื่อบอกว่าจะเกิดอะไร
  useEffect(() => {
    if (!open || !sheet || !tabs.length || done) { setPreview(null); return; }
    let alive = true;
    setBusy("check"); setErr(null);
    call(true).then((d) => { if (alive) setPreview(d); }).catch((e) => { if (alive) { setPreview(null); setErr((e as Error).message); } }).finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; };
  }, [open, sheet?.id, parent, tabs.length, done]);   // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy("send"); setErr(null);
    try { const d = await call(false); setDone(d); if (d.template) onSent(d.template); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };
  const baht = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const row = (icon: string, tone: string, text: string) => <li className={`flex items-start gap-2 ${tone}`}><Icon value={icon} className="mt-0.5 text-sm" /><span>{text}</span></li>;

  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t("ส่งไปตีราคา", "Send to costing")} loading={busy === "send"}
      description={t("ชิ้นของแพทเทิร์นนี้จะไปเป็นบรรทัดในแท็บตีราคาของใบงานออกแบบ (1 ชิ้น × 1 วัสดุ = 1 บรรทัด ขนาดตัดรวมเผื่อ) · ซิปและอะไหล่ไปด้วย 1 วัสดุ = 1 บรรทัด", "Each piece becomes a costing line on the design sheet (1 piece × 1 material = 1 line, cut size incl. allowance)")}
      footer={done ? (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => window.open(`/master/design-sheets?open=${sheet?.id}`, "_blank", "noopener")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50">{t("เปิดใบงานออกแบบ", "Open the design sheet")}</button>
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-slate-800 px-4 text-sm text-white hover:bg-slate-900">{t("ปิด", "Close")}</button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={!preview || !!busy} onClick={() => void send()} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
            {busy === "send" ? t("กำลังส่ง…", "Sending…") : t("ส่งไปตีราคา", "Send to costing")}
          </button>
        </div>
      )}>
      <div className="space-y-4 text-sm">
        {done ? (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <div className="flex items-center gap-2 font-medium"><Icon value="i:circle-check" className="text-base" />{t(`ส่งแล้ว ไปที่ ${sheet?.code ?? ""} · แท็บ ${tabs.find((x) => x.key === parent)?.label ?? ""}`, `Sent to ${sheet?.code ?? ""} · tab ${tabs.find((x) => x.key === parent)?.label ?? ""}`)}</div>
            {done.trims && done.trims.lines.length > 0 && <div>{t(`ซิป/อะไหล่: เพิ่ม ${done.trims.added} บรรทัด · อัปเดต ${done.trims.updated} บรรทัด`, `Zips/hardware: added ${done.trims.added} · updated ${done.trims.updated}`)}</div>}
            <div>{t(`ชิ้น: เพิ่ม ${done.added} บรรทัด · อัปเดต ${done.updated} บรรทัด · ยอดของบรรทัดที่ส่ง ${baht(done.amount)} บาท`, `Added ${done.added} · updated ${done.updated} · amount of sent lines ${baht(done.amount)} THB`)}</div>
            <div className="text-xs text-emerald-800">{t("ถ้าใบงานนี้เปิดค้างอยู่ที่เครื่องอื่น ให้โหลดหน้าใหม่ก่อนแก้ตีราคา ไม่งั้นการบันทึกจากหน้าที่ค้างจะทับบรรทัดที่เพิ่งส่ง", "If this sheet is open elsewhere, reload it before editing costing, or saving from the stale page will overwrite the lines just sent")}</div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-600">{t("1. ใบงานออกแบบ", "1. Design sheet")}</div>
              <DesignSheetPicker value={sheets} onChange={(v) => { setSheets(v.slice(-1)); setPreview(null); }} max={1} />
            </div>
            {sheet && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-600">{t("2. แท็บตีราคา", "2. Costing tab")}</div>
                <div className="flex flex-wrap gap-1">
                  {tabs.map((x) => (
                    <button key={x.key || "__gen__"} type="button" onClick={() => setParent(x.key)} aria-pressed={parent === x.key}
                      className={`h-8 rounded-md border px-3 text-xs ${parent === x.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{x.label}</button>
                  ))}
                </div>
              </div>
            )}
            {busy === "check" && <div className="text-xs text-slate-400">{t("กำลังตรวจ…", "Checking…")}</div>}
            {preview && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-600">{t("3. สิ่งที่จะเกิดขึ้น", "3. What will happen")}</div>
                <ul className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                  {row("i:plus", "text-slate-800", t(`ชิ้น: เพิ่มบรรทัดใหม่ ${preview.added} บรรทัด`, `Pieces: add ${preview.added} new lines`))}
                  {preview.updated > 0 && row("i:refresh", "text-slate-800", t(`อัปเดตขนาด/รูปทรงของ ${preview.updated} บรรทัดที่เคยส่ง (ราคาและหมายเหตุเดิมอยู่ครบ)`, `Update size/shape of ${preview.updated} lines sent before (price and notes kept)`))}
                  {row("i:coin", "text-slate-800", t(`ยอดของบรรทัดที่ส่ง ประมาณ ${baht(preview.amount)} บาท`, `Amount of the sent lines ≈ ${baht(preview.amount)} THB`))}
                  {preview.no_material > 0 && row("i:alert-triangle", "text-amber-700", t(`${preview.no_material} ชิ้นยังไม่ได้เลือกวัสดุ → ไปเป็นบรรทัดเปล่า ยังไม่มีราคา (เลือกวัสดุในตีราคาทีหลังได้)`, `${preview.no_material} pieces have no material → blank lines without a price`))}
                  {preview.missing_items.length > 0 && row("i:alert-triangle", "text-amber-700", t(`วัสดุที่ไม่อยู่ในรายการแล้ว (ส่งเป็นชื่ออย่างเดียว): ${preview.missing_items.join(", ")}`, `Materials no longer in the list (sent by name only): ${preview.missing_items.join(", ")}`))}
                  {preview.stale > 0 && row("i:alert-triangle", "text-amber-700", t(`มี ${preview.stale} บรรทัดเดิมของชิ้นเหล่านี้ที่วัสดุไม่ตรงแล้ว — ระบบไม่ลบให้ ไปลบเองในตีราคาถ้าไม่ใช้`, `${preview.stale} earlier lines of these pieces no longer match — not deleted; remove them in costing if unused`))}
                  {row("i:shield-check", "text-emerald-700", t("บรรทัดอื่นของใบงานไม่ถูกแตะ", "Other lines on the sheet are not touched"))}
                </ul>
                {preview.trims && (preview.trims.lines.length > 0 || preview.trims.open_slits > 0 || preview.trims.no_qty > 0 || preview.trims.skipped.length > 0 || preview.trims.stale > 0) && (
                  <ul className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]" data-trim-preview>
                    <li className="text-xs font-medium text-slate-600">{t("ซิปและอะไหล่ (1 วัสดุ = 1 บรรทัด)", "Zips and hardware (one line per material)")}</li>
                    {preview.trims.lines.map((l, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-slate-800">
                        <span className="min-w-0 truncate"><span className={`mr-1.5 rounded px-1 text-[11px] ${l.action === "add" ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"}`}>{l.action === "add" ? t("เพิ่ม", "Add") : t("อัปเดต", "Update")}</span>{l.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-600">{l.mode === "length" ? t(`${l.total} ซม. (${l.parts} เส้น)`, `${l.total} cm (${l.parts} pcs)`) : t(`${l.total} ตัว`, `${l.total} pcs`)}{l.amount != null ? ` · ${baht(l.amount)} ${t("บาท", "THB")}` : ` · ${t("ยังไม่มีราคา", "no price")}`}</span>
                      </li>
                    ))}
                    {preview.trims.open_slits > 0 && row("i:alert-triangle", "text-amber-700", t(`${preview.trims.open_slits} ช่องซิปยังไม่ได้เลือกซิป → ยังไม่ถูกคิดเงิน (เลือกที่ปุ่ม ซิป / อะไหล่)`, `${preview.trims.open_slits} zip slits have no zip chosen — not costed yet`))}
                    {preview.trims.no_qty > 0 && row("i:alert-triangle", "text-amber-700", t(`${preview.trims.no_qty} รายการยังไม่ใส่ความยาว → ไม่ถูกส่ง`, `${preview.trims.no_qty} items have no length — not sent`))}
                    {preview.trims.skipped.length > 0 && row("i:alert-triangle", "text-amber-700", t(`วัสดุที่กลุ่มเปลี่ยนวิธีคิดไปแล้ว ไม่ถูกส่ง (เลือกใหม่ในปุ่ม ซิป / อะไหล่): ${preview.trims.skipped.join(", ")}`, `Not sent — the material's group no longer prices by length/count: ${preview.trims.skipped.join(", ")}`))}
                    {preview.trims.missing_items.length > 0 && row("i:alert-triangle", "text-amber-700", t(`วัสดุที่ไม่อยู่ในรายการแล้ว (ส่งเป็นชื่ออย่างเดียว): ${preview.trims.missing_items.join(", ")}`, `No longer in the material list (sent as a name only): ${preview.trims.missing_items.join(", ")}`))}
                    {preview.trims.stale > 0 && row("i:alert-triangle", "text-amber-700", t(`มี ${preview.trims.stale} บรรทัดซิป/อะไหล่เดิมของแพทเทิร์นนี้ที่ไม่อยู่ในรายการแล้ว — ระบบไม่ลบให้ ไปลบเองในตีราคา`, `${preview.trims.stale} earlier zip/hardware lines are no longer in the list — delete them on the costing sheet yourself`))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
        {err && <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
      </div>
    </ERPModal>
  );
}
