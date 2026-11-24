"use client";
/**
 * 🖼 ผลรายร้านของชุดโปร + ปุ่มสั่งงาน (ยิงร้านจริง — ถามยืนยันก่อนทุกปุ่ม)
 *   ทำเดี๋ยวนี้ · เริ่มเดี๋ยวนี้ · ย้อนปกเดิมเดี๋ยวนี้ · ลองใหม่ (ทั้งหมด/รายการ) · ย้อนทับเลย (รายการที่มีคนเปลี่ยนปกเอง) · ยกเลิกการยืนยัน
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePushOpen } from "@/components/push-open";
import { CAMPAIGN_STATUS, ON_SHOP, PLATFORM_LABEL, PROMO_PLATFORMS, REVIEW_PLATFORMS, STILL_IN_REVIEW, TARGET_STATUS, applyDueAt, countTargets, thTime, type TargetStatus } from "@/lib/promo-cover";
import { confirmCampaign, getCampaign, imgUrl, runUntilDone, type Full, type RunResult, type Target } from "./api";
import { Pill, Thumb } from "./parts";

type Ask = { title: string; message: string; confirm: string; danger?: boolean; run: () => Promise<void> };
const btnSm = "inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function PromoResults({ full, canRun, onReload }: { full: Full; canRun: boolean; onReload: () => Promise<void> }) {
  const toast = useToast();
  const pushOpen = usePushOpen();
  const c = full.campaign;
  const [filter, setFilter] = useState<TargetStatus | "all">("all");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const counts = countTargets(full.targets);
  const codeOf = useMemo(() => new Map(full.items.map((i) => [i.id, i])), [full.items]);
  const rows = full.targets.filter((t) => filter === "all" || t.status === filter);
  const onShop = full.targets.filter((t) => ON_SHOP.has(t.status)).length;
  const startFuture = !!c.starts_at && Date.parse(c.starts_at) > Date.now();
  const nextDue = Math.min(...PROMO_PLATFORMS.filter((p) => c.platforms.includes(p)).map((p) => applyDueAt(c, p) ?? Infinity));

  const doRun = async (mode: Parameters<typeof runUntilDone>[1], label: string, ids?: string[]) => {
    // เปิดหน้าให้เช็กหลังส่ง (ของกลาง push-open · ค่าเริ่มปิด) — ต้องเตรียมแท็บ "ก่อน await" ตอนยังอยู่ในจังหวะกดยืนยัน
    const touch: ReadonlySet<TargetStatus> = new Set<TargetStatus>(
      mode === "run" || mode === "start_now" ? ["pending"] : mode === "retry" ? ["failed", "revert_failed"] : mode === "revert" ? ["applied", "review", "revert_failed"] : ["conflict", "revert_failed", "review"]);
    const before = new Map(full.targets.map((t) => [t.id, t.status]));
    const affected = full.targets.filter((t) => touch.has(t.status) && (!ids || ids.includes(t.id)));
    const session = affected.length ? pushOpen.prepare([...new Set(affected.map((t) => t.platform))].map((code) => ({ code }))) : null;
    setBusy(label); setProgress("กำลังทำ…");
    try {
      const r: RunResult = await runUntilDone(c.id, mode, (_x, total) => setProgress(`ส่งปกโปร ${total.applied} · ย้อน ${total.reverted} · ไม่ผ่าน ${total.failed}${total.remaining ? ` · เหลือ ${total.remaining}` : ""}`), ids);
      const msg = `ส่งปกโปร ${r.applied} · ย้อนปกเดิม ${r.reverted}${r.failed ? ` · ไม่ผ่าน ${r.failed}` : ""}${r.conflict ? ` · มีคนเปลี่ยนปกเอง ${r.conflict}` : ""}${r.remaining ? ` · ค้าง ${r.remaining} (ตัวตั้งเวลาทำต่อ)` : ""}`;
      if (r.failed || r.conflict) toast.warning(msg); else toast.success(r.applied + r.reverted ? msg : "ไม่มีงานที่ถึงเวลา");
      if (session) {
        const fresh = await getCampaign(c.id).catch(() => null);
        const done = (fresh?.targets ?? []).filter((t) => before.get(t.id) !== t.status && (t.status === "applied" || t.status === "review" || t.status === "reverted"));
        session.finish(done.map((t) => ({
          code: t.platform, shopName: t.label ?? PLATFORM_LABEL[t.platform], productId: t.platform === "website" ? t.parent_sku_id : t.external_product_id ?? null,
          label: codeOf.get(t.item_id)?.code, shopRef: t.shop_ref ?? null,
          state: t.status === "review" || (t.status === "reverted" && REVIEW_PLATFORMS.has(t.platform)) ? "review" as const : "live" as const,
          ...(t.platform === "website" ? { links: { sellerCenter: t.web_slug ? `${window.location.origin}/website/${t.web_slug}?tab=listings` : null, sellerExact: true, sellerLabel: "หน้าแก้ใน ERP" } } : {}),
        })));
      }
    } catch (e) { session?.finish([]); toast.error((e as Error).message); }
    finally { setBusy(null); setProgress(null); await onReload(); }
  };
  const confirmRun = (a: Ask) => setAsk(a);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">ผลรายร้าน <Pill tone={CAMPAIGN_STATUS[c.status].tone} className="ml-1">{CAMPAIGN_STATUS[c.status].label}</Pill></p>
          <p className="text-[12px] text-slate-500">
            {c.status === "scheduled" && (Number.isFinite(nextDue) ? `เริ่มส่ง ${thTime(new Date(nextDue).toISOString())}` : "รอส่ง")}
            {c.status === "live" && (c.revert_requested_at ? "กำลังย้อนปกเดิม" : c.ends_at ? `จบ ${thTime(c.ends_at)}${c.auto_revert ? " → ย้อนปกเดิมเอง" : " (ไม่ย้อนเอง)"}` : "ไม่มีวันจบ — กดย้อนเอง")}
            {c.status === "ended" && "ย้อนปกเดิมครบแล้ว"}
          </p>
        </div>
        {canRun && !c.deleted_at && (
          <div className="flex flex-wrap gap-1.5">
            {(c.status === "scheduled" || c.status === "live") && (
              <button type="button" className={btnSm} disabled={!!busy} onClick={() => confirmRun({ title: "ทำงานที่ถึงเวลาเดี๋ยวนี้", message: "ระบบจะส่ง/ย้อนปกบนร้านจริงเฉพาะรายการที่ถึงเวลาแล้ว (ไม่ต้องรอตัวตั้งเวลา 5 นาที)", confirm: "ทำเดี๋ยวนี้", run: () => doRun("run", "run") })}>
                <Icon name="refresh" /> ทำเดี๋ยวนี้
              </button>
            )}
            {c.status === "scheduled" && startFuture && (
              <button type="button" className={btnSm} disabled={!!busy} onClick={() => confirmRun({ title: "เริ่มโปรเดี๋ยวนี้", message: `เลื่อนเวลาเริ่มจาก ${thTime(c.starts_at)} เป็นตอนนี้ แล้วส่งปกโปรขึ้นร้านจริงทันที`, confirm: "เริ่มเดี๋ยวนี้", run: () => doRun("start_now", "start") })}>
                <Icon name="open" /> เริ่มเดี๋ยวนี้
              </button>
            )}
            {(c.status === "scheduled" || c.status === "live") && onShop > 0 && (
              <button type="button" className={`${btnSm} text-rose-700`} disabled={!!busy} onClick={() => confirmRun({ title: "ย้อนปกเดิมเดี๋ยวนี้", message: `เอาปกเดิมกลับทุกร้าน (${onShop} รายการ) และจบชุดโปรนี้ · รายการที่มีคนเปลี่ยนปกเองระหว่างโปร ระบบจะไม่ทับ`, confirm: "ย้อนปกเดิม", danger: true, run: () => doRun("revert", "revert") })}>
                <Icon name="back" /> ย้อนปกเดิมเดี๋ยวนี้
              </button>
            )}
            {(counts.failed + counts.revert_failed) > 0 && (
              <button type="button" className={btnSm} disabled={!!busy} onClick={() => confirmRun({ title: "ลองใหม่ทั้งหมด", message: `ลองส่ง/ย้อนรายการที่ไม่ผ่านอีกครั้ง (${counts.failed + counts.revert_failed} รายการ) บนร้านจริง`, confirm: "ลองใหม่", run: () => doRun("retry", "retry") })}>
                <Icon name="refresh" /> ลองใหม่ที่ไม่ผ่าน
              </button>
            )}
            {c.status === "scheduled" && onShop === 0 && (
              <button type="button" className={btnSm} disabled={!!busy} onClick={async () => { setBusy("undo"); try { await confirmCampaign(c.id, { undo: true }); toast.success("กลับเป็นร่างแล้ว — แก้ต่อได้"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); await onReload(); } }}>
                <Icon name="edit" /> ยกเลิกการยืนยัน (กลับไปแก้)
              </button>
            )}
          </div>
        )}
      </div>
      {progress && <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[12px] text-sky-800">{progress} — อย่าเพิ่งปิดหน้านี้</p>}

      {/* สรุปต่อร้าน */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PROMO_PLATFORMS.filter((p) => full.targets.some((t) => t.platform === p)).map((p) => {
          const n = countTargets(full.targets.filter((t) => t.platform === p));
          return (
            <div key={p} className="rounded-lg bg-slate-50 p-2">
              <p className="text-[12px] text-slate-500">{PLATFORM_LABEL[p]}</p>
              <p className="text-[13px] text-slate-800">{n.applied + n.review > 0 && <span className="text-emerald-700">ขึ้น {n.applied}{n.review ? ` · รอตรวจ ${n.review}` : ""} </span>}
                {n.reverted > 0 && <span className="text-slate-600">ย้อน {n.reverted} </span>}
                {n.pending > 0 && <span className="text-slate-600">รอ {n.pending} </span>}
                {n.failed + n.revert_failed > 0 && <span className="text-rose-700">ไม่ผ่าน {n.failed + n.revert_failed} </span>}
                {n.conflict > 0 && <span className="text-amber-700">เปลี่ยนเอง {n.conflict}</span>}</p>
            </div>
          );
        })}
      </div>

      {/* กรองสถานะ */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "pending", "applied", "review", "failed", "conflict", "revert_failed", "reverted", "skipped"] as const).filter((s) => s === "all" || counts[s] > 0).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={`h-7 rounded-full border px-2.5 text-[12px] ${filter === s ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"}`}>
            {s === "all" ? `ทั้งหมด ${counts.total}` : `${TARGET_STATUS[s].label} ${counts[s]}`}
          </button>
        ))}
      </div>

      {rows.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-500">ยังไม่มีรายการ</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.slice(0, 400).map((t: Target) => {
            const it = codeOf.get(t.item_id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 sm:flex-nowrap">
                <div className="flex shrink-0 items-center gap-1.5">
                  <Thumb src={t.before_cover_url ?? imgUrl(it?.cover_key, 120)} size={36} label="เดิม" />
                  <Thumb src={imgUrl(it?.promo_key, 120)} size={36} accent={t.status === "applied" || t.status === "review"} label="โปร" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-slate-800">{it?.code ?? "—"} <span className="text-slate-500">· {t.label ?? PLATFORM_LABEL[t.platform]}</span></p>
                  {t.error && <p className={`text-[11px] ${t.status === "failed" || t.status === "revert_failed" ? "text-rose-600" : "text-slate-500"}`}>{t.error}</p>}
                </div>
                <Pill tone={TARGET_STATUS[t.status].tone}>{TARGET_STATUS[t.status].label}</Pill>
                {canRun && (t.status === "failed" || t.status === "revert_failed") && (
                  <button type="button" className={btnSm} disabled={!!busy} onClick={() => confirmRun({ title: "ลองใหม่รายการนี้", message: `${it?.code ?? ""} · ${t.label ?? ""} — ลองอีกครั้งบนร้านจริง`, confirm: "ลองใหม่", run: () => doRun("retry", `retry:${t.id}`, [t.id]) })}>ลองใหม่</button>
                )}
                {canRun && (t.status === "conflict" || (t.status === "review" && t.error === STILL_IN_REVIEW)) && (
                  <button type="button" className={`${btnSm} text-rose-700`} disabled={!!busy} onClick={() => confirmRun({ title: "ย้อนทับเลย", message: t.status === "review"
                    ? `${it?.code ?? ""} · ${t.label ?? ""} — ร้านยังตรวจปกโปรไม่เสร็จ · ย้อนทับ = ส่งชุดรูปเดิมก่อนโปรให้ร้านอีกรอบ (ใช้เมื่อร้านไม่ผ่านปกโปร หรือไม่อยากรอ)`
                    : `${it?.code ?? ""} · ${t.label ?? ""} — รูปแรกบนร้านถูกเปลี่ยนไปแล้ว (ไม่ใช่ปกโปรของเรา) · ย้อนทับ = เอาปกเดิมก่อนโปรใส่เป็นรูปแรก แทนรูปที่คนเปลี่ยนไว้`, confirm: "ย้อนทับเลย", danger: true, run: () => doRun("force_revert", `force:${t.id}`, [t.id]) })}>ย้อนทับเลย</button>
                )}
              </li>
            );
          })}
          {rows.length > 400 && <li className="py-2 text-center text-[12px] text-slate-500">แสดง 400 จาก {rows.length} รายการ — กรองสถานะเพื่อดูส่วนที่เหลือ</li>}
        </ul>
      )}

      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} title={ask?.title ?? ""} message={ask?.message ?? ""} confirmText={ask?.confirm} variant={ask?.danger ? "danger" : "default"}
        onConfirm={() => { const a = ask; setAsk(null); if (a) void a.run(); }} />
    </div>
  );
}
