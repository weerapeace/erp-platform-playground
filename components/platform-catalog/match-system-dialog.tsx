"use client";

/**
 * MatchSystemDialog — "อัปเดตร้านให้ตรงกับระบบ" (ของกลาง) · หน้าเทียบ "บนร้านตอนนี้ → หลังส่ง (ตามระบบ)" แล้วค่อยยืนยันส่ง
 * ใช้: แท็บแพลตฟอร์มของ Parent SKU (ปุ่ม "อัปเดตให้ตรง") · เช็กข้ามร้าน (ไล่แก้ทีละรุ่นตามคิว)
 *
 * ขั้นตอน:
 *   1) เปิด = GET /api/platform-catalog/drift?listing_id (ดึงสดทั้งร้าน + ระบบ) → 4 เรื่อง รูป/รายละเอียด/ชื่อตัวเลือก/ราคา
 *   2) ติ๊กเรื่องที่จะส่ง (ไม่ตรง + ร้านรองรับ ติ๊กไว้ให้ก่อน · เรื่องที่ส่งไม่ได้บอกเหตุผล)
 *   3) ยืนยัน = POST build (ประกอบคำสั่งใหม่จากข้อมูลสด) → ยิงไป API แก้สินค้าบนร้านเดิมทีละคำสั่ง (ตรวจชนกัน/สิทธิ์/ลงประวัติที่ปลายทาง)
 *   รูป = รูปย่อ 2 แถวตามลำดับ (บนร้าน / หลังส่ง) + กดดูรูปใหญ่ (ImageLightbox) · รายละเอียด = เต็ม 2 ฝั่ง วางเทียบ + ไฮไลต์บรรทัดที่ต่าง + ดูแบบที่ขึ้นบนร้าน (เจ้าของเลือก 2026-11-21 ข้อ 1-3)
 *   4) สำเร็จ = POST mark (จำชุดรูปที่ส่ง) → ตรวจใหม่ให้เห็นผล
 * การส่งขึ้นร้านย้อนอัตโนมัติไม่ได้ → หน้านี้คือหน้ายืนยันก่อนส่ง (ต้องกดยืนยันเอง) · ไม่แตะสต๊อก
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { PushOpenGearButton, usePushOpen } from "@/components/push-open";
import { apiFetch } from "@/lib/api";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { DRIFT_LABEL, descImages, descLines, lineDiff, looksHtml, type DriftItem, type DriftKey } from "@/lib/platform-listing-drift";

type Check = { listing_id: string; platform_code: string; items: DriftItem[]; issues: DriftKey[]; checked_at: string; external_product_id?: string | null; shop_ref?: string | null; listing_status?: string | null };
/** ชื่อร้านสั้น (แจ้งผลของตัวเปิดหน้าให้เช็ก) */
const SHOP_LABEL: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE" };
type Call = { url: string; body: Record<string, unknown>; label: string };
type Step = { label: string; state: "wait" | "run" | "ok" | "fail"; error?: string };

const REVIEW_NOTE: Record<string, string> = {
  tiktok: "TikTok: รูป/รายละเอียด/ชื่อตัวเลือก ต้องรอ TikTok ตรวจใหม่ (ระหว่างตรวจร้านยังขายของเดิม) · ราคามีผลทันที",
  lazada: "Lazada: แก้รูป/รายละเอียดแล้วอาจต้องรอ Lazada ตรวจ (Pending QC)",
};
const canTick = (it: DriftItem) => it.sendable && (it.state === "diff" || (it.key === "images" && it.state === "unknown"));

export function MatchSystemDialog({ open, listingId, shopName, canPublish, onClose, onChanged, onSent, footerExtra }: {
  open: boolean;
  listingId: string | null;
  shopName: string;
  canPublish: boolean;
  onClose: () => void;
  /** ตรวจใหม่/ส่งแล้ว → ผลล่าสุด (ให้หน้าที่เรียกอัปเดตป้าย) */
  onChanged?: (check: Check) => void;
  /** ส่งขึ้นร้านไปแล้ว (สำเร็จทั้งหมดหรือบางส่วน) */
  onSent?: () => void;
  /** ปุ่มเพิ่มท้ายหน้าต่าง (เช่น "ถัดไป" ในคิวของเช็กข้ามร้าน) */
  footerExtra?: React.ReactNode;
}) {
  const toast = useToast();
  const pushOpen = usePushOpen();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [picked, setPicked] = useState<Set<DriftKey>>(new Set());
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [sending, setSending] = useState(false);
  const [openRows, setOpenRows] = useState<Set<DriftKey>>(new Set());

  // 🐛 2026-11-21: เดิม apply/load ขึ้นกับ onChanged (หน้าที่เรียกส่งฟังก์ชันใหม่ทุกครั้งที่วาด) → ผลออก → หน้าที่เรียกอัปเดตป้าย → วาดใหม่
  //    → load ตัวใหม่ → useEffect โหลดซ้ำวนไม่จบ (ปุ่มยืนยันจางเพราะ "กำลังโหลด" ตลอด · ติ๊กแล้วถูกรีเซ็ต · ถามร้านซ้ำ ๆ)
  //    → เก็บ onChanged ไว้ใน ref · โหลดใหม่เฉพาะตอนเปิด/เปลี่ยนรายการ
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const apply = useCallback((c: Check) => {
    setCheck(c);
    // ราคาไม่ติ๊กไว้ให้ก่อน — ร้านมักตั้งราคาเต็มสูงไว้ทำโปร ต้องให้คนดูแล้วติ๊กเอง
    // เรื่องที่มีคำเตือน "ตรวจก่อนส่ง" (เช่น รายละเอียดมาจากร่างที่แก้ไว้) ก็ไม่ติ๊กไว้ให้
    setPicked(new Set(c.items.filter((i) => canTick(i) && i.state === "diff" && i.key !== "price" && !i.note?.startsWith("ตรวจก่อนส่ง")).map((i) => i.key)));
    onChangedRef.current?.(c);
  }, []);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    if (!listingId) return;
    const my = ++loadSeq.current;
    setLoading(true); setError(null); setSteps(null);
    try {
      const j = await apiFetch(`/api/platform-catalog/drift?listing_id=${encodeURIComponent(listingId)}`).then((r) => r.json());
      if (my !== loadSeq.current) return;
      if (j.error || !j.check) throw new Error(j.error || "ตรวจไม่สำเร็จ");
      apply(j.check as Check);
    } catch (e) { if (my === loadSeq.current) { setError((e as Error).message); setCheck(null); } }
    finally { if (my === loadSeq.current) setLoading(false); }
  }, [listingId, apply]);
  useEffect(() => { if (open) void load(); else { setCheck(null); setSteps(null); setError(null); } }, [open, load]);

  const items = check?.items ?? [];
  const diffN = items.filter((i) => i.state === "diff").length;
  const tickN = picked.size;

  const send = async () => {
    if (!listingId || !tickN || !check) return;
    // เปิดหน้าให้เช็กหลังส่ง (ของกลาง push-open · ตั้งค่าต่อคน ค่าเริ่มต้นปิด) — ต้องเรียกก่อน await (ยังอยู่ในจังหวะกด)
    const session = pushOpen.prepare([{ code: check.platform_code }]);
    let opened = false;
    setSending(true); setSteps(null);
    const keys = [...picked];
    try {
      const b = await apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ action: "build", listing_id: listingId, keys }) }).then((r) => r.json());
      if (b.error) throw new Error(b.error);
      const calls = (b.calls ?? []) as Call[];
      const skipped = (b.skipped ?? []) as { key: DriftKey; reason: string }[];
      if (!calls.length) { toast.info(skipped.length ? `ไม่มีอะไรต้องส่ง — ${skipped.map((s) => `${DRIFT_LABEL[s.key]}: ${s.reason}`).join(" · ")}` : "ไม่มีอะไรต้องส่ง"); await load(); return; }
      const st: Step[] = calls.map((c) => ({ label: c.label, state: "wait" }));
      setSteps([...st]);
      let failed = false;
      for (let i = 0; i < calls.length; i++) {
        st[i] = { ...st[i], state: "run" }; setSteps([...st]);
        const r = await apiFetch(calls[i].url, { method: "POST", body: JSON.stringify(calls[i].body) });
        const j = await r.json().catch(() => ({ error: `ระบบตอบผิดพลาด (HTTP ${r.status})` }));
        const err = !r.ok || j.ok === false || j.error ? (j.error || (r.status === 409 ? "มีคนแก้บนร้านระหว่างนี้ — ปิดแล้วเปิดใหม่เพื่อดูข้อมูลล่าสุด" : `HTTP ${r.status}`)) : null;
        st[i] = { ...st[i], state: err ? "fail" : "ok", error: err ?? undefined }; setSteps([...st]);
        if (err) { failed = true; break; }
      }
      const doneKeys = failed ? [] : keys;
      const m = await apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ action: "mark", listing_id: listingId, keys: doneKeys }) }).then((r) => r.json()).catch(() => null);
      if (m?.check) apply(m.check as Check);
      if (st.some((s) => s.state === "ok")) {
        onSent?.();
        // TikTok แก้รูป/รายละเอียด/ชื่อตัวเลือก = ส่งตรวจใหม่ · ปิดขายอยู่ = ลูกค้ายังไม่เห็น
        const status = String(check.listing_status ?? "").toLowerCase();
        const review = check.platform_code === "tiktok" && keys.some((k) => k !== "price");
        session.finish([{
          code: check.platform_code, shopName: SHOP_LABEL[check.platform_code] ?? shopName, productId: check.external_product_id ?? null, label: shopName,
          state: review ? "review" : /unlist|inactive|deactivat/.test(status) ? "hidden" : "live", shopRef: check.shop_ref ?? null,
        }]);
        opened = true;
      }
      if (failed) toast.error("ส่งไม่ครบ — ดูรายการที่ไม่สำเร็จในหน้าต่าง");
      else toast.success(`ส่งขึ้น ${shopName} แล้ว${skipped.length ? ` (ข้าม ${skipped.length} เรื่อง)` : ""}`);
    } catch (e) { toast.error(`ส่งไม่สำเร็จ: ${(e as Error).message}`); }
    finally {
      if (!opened) session.finish([]);   // ไม่ได้ส่งอะไรสำเร็จ → ปิดแท็บที่เปิดรอไว้
      setSending(false);
    }
  };

  const toggle = (k: DriftKey) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const reviewNote = check ? REVIEW_NOTE[check.platform_code] : null;
  const sorted = useMemo(() => [...items].sort((a, b) => (a.state === "diff" ? 0 : 1) - (b.state === "diff" ? 0 : 1)), [items]);

  return (
    <ERPModal open={open} onClose={() => { if (!sending) onClose(); }} size="xl" closeOnBackdrop={!sending}
      title={`อัปเดต ${shopName} ให้ตรงกับระบบ`}
      description={check ? (diffN ? `ไม่ตรงกับระบบ ${diffN} เรื่อง — ติ๊กเรื่องที่จะส่ง แล้วกดยืนยัน (ยังไม่ส่งจนกว่าจะกด)` : "ทุกเรื่องตรงกับระบบแล้ว") : "กำลังเทียบข้อมูลบนร้านกับระบบ…"}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || sending} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="refresh" />ตรวจใหม่</button>
          {footerExtra}
          <span className="ml-auto" />
          <button type="button" onClick={onClose} disabled={sending} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ปิด</button>
          {canPublish && <PushOpenGearButton />}
          {/* ปุ่มกดไม่ได้ = บอกเหตุผลเสมอ (ไม่ปล่อยปุ่มจางเฉย ๆ) */}
          {canPublish && !sending && (loading || !tickN) && (
            <span className="text-xs text-slate-500">{loading ? "กำลังดึงข้อมูลล่าสุดจากร้าน…" : diffN ? "ติ๊กเรื่องที่จะส่งก่อน" : "ตรงกับระบบแล้ว ไม่มีอะไรต้องส่ง"}</span>
          )}
          {canPublish ? (
            <button type="button" onClick={() => void send()} disabled={!tickN || sending || loading}
              className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{sending ? "กำลังส่ง…" : `ยืนยันส่งที่ติ๊ก (${tickN})`}</button>
          ) : <span className="text-xs text-slate-500">ไม่มีสิทธิ์ส่งขึ้นร้านจริง — ดูได้อย่างเดียว</span>}
        </div>
      }>
      {loading && !check ? (
        <div className="py-10 text-center text-sm text-slate-500">กำลังดึงข้อมูลจาก {shopName} และสินค้าในระบบ…</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">ตรวจไม่สำเร็จ: {error}</div>
      ) : check ? (
        <div className="space-y-2 text-sm">
          {items.filter((i) => i.cannot?.startsWith("ห้ามส่ง")).map((i) => (
            <div key={`block-${i.key}`} className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <Icon name="warning" /><span>{DRIFT_LABEL[i.key]}: {i.cannot}</span>
            </div>
          ))}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[34rem] text-left">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="w-8 px-2 py-2" /><th className="px-2 py-2">เรื่อง</th><th className="px-2 py-2">บนร้านตอนนี้</th><th className="px-2 py-2">หลังส่ง (ตามระบบ)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((it) => (
                  <Fragment key={it.key}>
                  <tr className={it.state === "diff" ? "" : "text-slate-500"}>
                    <td className="px-2 py-2 align-top">
                      {canTick(it) && canPublish ? <input type="checkbox" checked={picked.has(it.key)} onChange={() => toggle(it.key)} disabled={sending} aria-label={`ส่ง${DRIFT_LABEL[it.key]}`} /> : null}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="font-medium text-slate-800">{DRIFT_LABEL[it.key]}</div>
                      <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${it.state === "diff" ? "border-amber-200 bg-amber-50 text-amber-800" : it.state === "same" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        <Icon name={it.state === "diff" ? "warning" : it.state === "same" ? "done" : "info"} />{it.summary}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600 break-words">{it.before}</td>
                    <td className="px-2 py-2 align-top break-words">
                      {it.after}
                      {it.note && <div className={`mt-1 text-[11px] ${it.note.startsWith("ตรวจก่อนส่ง") ? "inline-flex items-start gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800" : "text-slate-500"}`}>{it.note.startsWith("ตรวจก่อนส่ง") && <Icon name="warning" />}{it.note}</div>}
                      {it.cannot && it.state !== "same" && <div className="mt-1 inline-flex items-start gap-1 text-[11px] text-amber-700"><Icon name="warning" />{it.cannot}</div>}
                      {it.rows && it.rows.length > 0 && (
                        <div className="mt-1">
                          <button type="button" className="text-[11px] text-violet-700 hover:underline" onClick={() => setOpenRows((s) => { const n = new Set(s); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n; })}>
                            {openRows.has(it.key) ? "ซ่อนรายตัวเลือก" : `ดูรายตัวเลือก (${it.rows.length})`}
                          </button>
                          {openRows.has(it.key) && (
                            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                              {it.rows.map((r) => <li key={r.label}><span className="font-mono">{r.label}</span>: {r.before} → <b className="font-medium text-slate-800">{r.after}</b></li>)}
                            </ul>
                          )}
                        </div>
                      )}
                      {/* รูป/รายละเอียดที่ตรงอยู่แล้ว = ซ่อนรายละเอียดไว้ กดดูได้ */}
                      {it.state !== "diff" && ((it.key === "images" && (it.media?.before.length || it.media?.after.length)) || (it.key === "description" && it.text)) ? (
                        <button type="button" className="mt-1 block text-[11px] text-violet-700 hover:underline" onClick={() => setOpenRows((s) => { const n = new Set(s); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n; })}>
                          {openRows.has(it.key) ? "ซ่อน" : it.key === "images" ? "ดูรูป" : "ดูรายละเอียดเต็ม"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {(it.state === "diff" || openRows.has(it.key)) && it.key === "images" && it.media && (it.media.before.length > 0 || it.media.after.length > 0) && (
                    <tr><td /><td colSpan={3} className="px-2 pb-3"><ImagesCompare before={it.media.before} after={it.media.after} shopName={shopName} /></td></tr>
                  )}
                  {(it.state === "diff" || openRows.has(it.key)) && it.key === "description" && it.text && (
                    <tr><td /><td colSpan={3} className="px-2 pb-3"><DescCompare before={it.text.before} after={it.text.after} /></td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-slate-500 space-y-0.5">
            <div>ไม่แตะสต๊อก (BigSeller ดูแล) · ส่งแล้วระบบดึงกลับมาเทียบให้ และลงประวัติว่าใครส่ง ก่อน → หลัง · ถ้ามีคนแก้บนร้านระหว่างนี้ ระบบจะไม่ส่งทับ</div>
            {reviewNote && <div>{reviewNote}</div>}
          </div>
          {steps && (
            <ul className="rounded-lg border border-slate-200 p-2 space-y-1 text-xs">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Icon name={s.state === "ok" ? "done" : s.state === "fail" ? "warning" : s.state === "run" ? "refresh" : "info"} />
                  <span className={s.state === "fail" ? "text-rose-700" : s.state === "ok" ? "text-emerald-700" : "text-slate-600"}>
                    ส่ง{s.label} — {s.state === "ok" ? "สำเร็จ" : s.state === "fail" ? `ไม่สำเร็จ: ${s.error}` : s.state === "run" ? "กำลังส่ง…" : "รอ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </ERPModal>
  );
}

// ───────── รูป: 2 แถวเรียงตามลำดับ (บนร้าน / หลังส่ง) + กดดูรูปใหญ่ ─────────
// เจ้าของขอ 2026-11-21 "อยากให้โชว์รูปด้วย" (ข้อ 1) · ตัวดูรูปเต็มจอ = ImageLightbox (ของกลาง)
function ImagesCompare({ before, after, shopName }: { before: string[]; after: string[]; shopName: string }) {
  const [idx, setIdx] = useState(-1);
  const all: LightboxImage[] = useMemo(() => [
    ...before.map((url, i) => ({ url, group: "shop", label: `บน ${shopName} ตอนนี้ · รูป ${i + 1}/${before.length}${i === 0 ? " (ปก)" : ""}` })),
    ...after.map((url, i) => ({ url, group: "sys", label: `หลังส่ง (ตามระบบ) · รูป ${i + 1}/${after.length}${i === 0 ? " (ปก)" : ""}` })),
  ], [before, after, shopName]);
  const strip = (urls: string[], offset: number, label: string) => (
    <div>
      <div className="mb-1 text-[11px] text-slate-500">{label} ({urls.length})</div>
      {urls.length ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {urls.map((u, i) => (
            <button key={`${i}-${u}`} type="button" onClick={() => setIdx(offset + i)} title="กดเพื่อดูรูปใหญ่"
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute left-0.5 top-0.5 rounded bg-white/85 px-1 text-[10px] text-slate-700">{i + 1}{i === 0 ? " ปก" : ""}</span>
            </button>
          ))}
        </div>
      ) : <div className="text-[11px] text-slate-400">ไม่มีรูป</div>}
    </div>
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      {strip(before, 0, `บน ${shopName} ตอนนี้`)}
      {strip(after, before.length, "หลังส่ง (ตามระบบ)")}
      <ImageLightbox images={all} index={idx} onClose={() => setIdx(-1)} onIndex={setIdx} thumbnails
        groups={[{ key: "shop", label: `บน ${shopName} ตอนนี้` }, { key: "sys", label: "หลังส่ง (ตามระบบ)" }]} />
    </div>
  );
}

// ───────── รายละเอียด: เต็ม 2 ฝั่ง วางเทียบซ้าย-ขวา + ไฮไลต์บรรทัดที่ต่าง · ดูแบบที่ขึ้นบนร้าน (ข้อ 2, 3) ─────────
type DescMode = "side" | "shop" | "sys" | "diff" | "look";
const isPhoneNow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
const RICH_CLS = "tiptap-content text-[13px] leading-relaxed text-slate-700 [overflow-wrap:anywhere] [&_img]:max-w-full [&_img]:rounded [&_li]:my-0 [&_p]:my-0 [&_p:empty]:h-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5";

function DescCompare({ before, after }: { before: string; after: string }) {
  const [phone] = useState(isPhoneNow);
  const [mode, setMode] = useState<DescMode>(phone ? "diff" : "side");
  const [lookSide, setLookSide] = useState<"sys" | "shop">("sys");
  const diff = useMemo(() => lineDiff(descLines(before), descLines(after)), [before, after]);
  const modes: [DescMode, string][] = phone
    ? [["diff", "เฉพาะที่ต่าง"], ["shop", "บนร้าน"], ["sys", "หลังส่ง"], ["look", "แบบบนร้าน"]]
    : [["side", "วางเทียบ"], ["diff", "เฉพาะที่ต่าง"], ["look", "แบบที่ขึ้นบนร้าน"]];
  const lines = (ls: { text: string; changed: boolean }[], tone: "del" | "add") => (
    <div className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[12px] leading-relaxed">
      {ls.length ? ls.map((l, i) => (
        <div key={i} className={l.changed ? (tone === "del" ? "bg-rose-50 text-rose-800 line-through decoration-rose-300" : "bg-emerald-50 text-emerald-800") : "text-slate-700"}>{l.text}</div>
      )) : <div className="text-slate-400">(ว่าง)</div>}
    </div>
  );
  const look = (src: string) => {
    const imgs = looksHtml(src) ? [] : descImages(src);
    return (
      <div className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-white p-3">
        {looksHtml(src)
          ? <div className={RICH_CLS} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(src) }} />
          : <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{src.trim() || "(ว่าง)"}</div>}
        {imgs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{imgs.map((u) => <img key={u} src={u} alt="" className="h-16 rounded border border-slate-200" />)}</div>}
      </div>
    );
  };
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modes.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
            className={`h-7 rounded-md border px-2 text-[11px] ${mode === k ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>{l}</button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">ต่าง {diff.changes.toLocaleString()} บรรทัด · <span className="rounded bg-rose-50 px-1 text-rose-700 line-through">จะหาย</span> <span className="rounded bg-emerald-50 px-1 text-emerald-700">จะเพิ่ม</span></span>
      </div>
      {mode === "side" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><div className="mb-1 text-[11px] text-slate-500">บนร้านตอนนี้ · {descLines(before).join("").length.toLocaleString()} ตัวอักษร</div>{lines(diff.left, "del")}</div>
          <div><div className="mb-1 text-[11px] text-slate-500">หลังส่ง (ตามระบบ) · {descLines(after).join("").length.toLocaleString()} ตัวอักษร</div>{lines(diff.right, "add")}</div>
        </div>
      )}
      {mode === "shop" && lines(diff.left, "del")}
      {mode === "sys" && lines(diff.right, "add")}
      {mode === "diff" && (
        <div className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-[12px] leading-relaxed">
          {diff.changes ? (
            <>
              {diff.left.filter((l) => l.changed).map((l, i) => <div key={`d${i}`} className="bg-rose-50 text-rose-800"><span className="mr-1 font-mono">−</span><span className="line-through decoration-rose-300">{l.text}</span></div>)}
              {diff.right.filter((l) => l.changed).map((l, i) => <div key={`a${i}`} className="bg-emerald-50 text-emerald-800"><span className="mr-1 font-mono">+</span>{l.text}</div>)}
            </>
          ) : <div className="text-slate-500">ข้อความเหมือนกัน (ต่างแค่การจัดรูปแบบ/ช่องว่าง)</div>}
        </div>
      )}
      {mode === "look" && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {(["sys", "shop"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setLookSide(k)} aria-pressed={lookSide === k}
                className={`h-7 rounded-md border px-2 text-[11px] ${lookSide === k ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>{k === "sys" ? "หลังส่ง (ตามระบบ)" : "บนร้านตอนนี้"}</button>
            ))}
          </div>
          {look(lookSide === "sys" ? after : before)}
        </div>
      )}
    </div>
  );
}
