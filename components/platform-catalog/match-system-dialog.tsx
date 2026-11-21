"use client";

/**
 * MatchSystemDialog — "อัปเดตร้านให้ตรงกับระบบ" (ของกลาง) · หน้าเทียบ "บนร้านตอนนี้ → หลังส่ง (ตามระบบ)" แล้วค่อยยืนยันส่ง
 * ใช้: แท็บแพลตฟอร์มของ Parent SKU (ปุ่ม "อัปเดตให้ตรง") · เช็กข้ามร้าน (ไล่แก้ทีละรุ่นตามคิว)
 *
 * ขั้นตอน:
 *   1) เปิด = GET /api/platform-catalog/drift?listing_id (ดึงสดทั้งร้าน + ระบบ) → 4 เรื่อง รูป/รายละเอียด/ชื่อตัวเลือก/ราคา
 *   2) ติ๊กเรื่องที่จะส่ง (ไม่ตรง + ร้านรองรับ ติ๊กไว้ให้ก่อน · เรื่องที่ส่งไม่ได้บอกเหตุผล)
 *   3) ยืนยัน = POST build (ประกอบคำสั่งใหม่จากข้อมูลสด) → ยิงไป API แก้สินค้าบนร้านเดิมทีละคำสั่ง (ตรวจชนกัน/สิทธิ์/ลงประวัติที่ปลายทาง)
 *   4) สำเร็จ = POST mark (จำชุดรูปที่ส่ง) → ตรวจใหม่ให้เห็นผล
 * การส่งขึ้นร้านย้อนอัตโนมัติไม่ได้ → หน้านี้คือหน้ายืนยันก่อนส่ง (ต้องกดยืนยันเอง) · ไม่แตะสต๊อก
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { DRIFT_LABEL, type DriftItem, type DriftKey } from "@/lib/platform-listing-drift";

type Check = { listing_id: string; platform_code: string; items: DriftItem[]; issues: DriftKey[]; checked_at: string };
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [picked, setPicked] = useState<Set<DriftKey>>(new Set());
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [sending, setSending] = useState(false);
  const [openRows, setOpenRows] = useState<Set<DriftKey>>(new Set());

  const apply = useCallback((c: Check) => {
    setCheck(c);
    setPicked(new Set(c.items.filter((i) => canTick(i) && i.state === "diff").map((i) => i.key)));
    onChanged?.(c);
  }, [onChanged]);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoading(true); setError(null); setSteps(null);
    try {
      const j = await apiFetch(`/api/platform-catalog/drift?listing_id=${encodeURIComponent(listingId)}`).then((r) => r.json());
      if (j.error || !j.check) throw new Error(j.error || "ตรวจไม่สำเร็จ");
      apply(j.check as Check);
    } catch (e) { setError((e as Error).message); setCheck(null); }
    finally { setLoading(false); }
  }, [listingId, apply]);
  useEffect(() => { if (open) void load(); else { setCheck(null); setSteps(null); setError(null); } }, [open, load]);

  const items = check?.items ?? [];
  const diffN = items.filter((i) => i.state === "diff").length;
  const tickN = picked.size;

  const send = async () => {
    if (!listingId || !tickN) return;
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
      if (st.some((s) => s.state === "ok")) onSent?.();
      if (failed) toast.error("ส่งไม่ครบ — ดูรายการที่ไม่สำเร็จในหน้าต่าง");
      else toast.success(`ส่งขึ้น ${shopName} แล้ว${skipped.length ? ` (ข้าม ${skipped.length} เรื่อง)` : ""}`);
    } catch (e) { toast.error(`ส่งไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSending(false); }
  };

  const toggle = (k: DriftKey) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const reviewNote = check ? REVIEW_NOTE[check.platform_code] : null;
  const sorted = useMemo(() => [...items].sort((a, b) => (a.state === "diff" ? 0 : 1) - (b.state === "diff" ? 0 : 1)), [items]);

  return (
    <ERPModal open={open} onClose={() => { if (!sending) onClose(); }} size="lg" closeOnBackdrop={!sending}
      title={`อัปเดต ${shopName} ให้ตรงกับระบบ`}
      description={check ? (diffN ? `ไม่ตรงกับระบบ ${diffN} เรื่อง — ติ๊กเรื่องที่จะส่ง แล้วกดยืนยัน (ยังไม่ส่งจนกว่าจะกด)` : "ทุกเรื่องตรงกับระบบแล้ว") : "กำลังเทียบข้อมูลบนร้านกับระบบ…"}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || sending} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="refresh" />ตรวจใหม่</button>
          {footerExtra}
          <span className="ml-auto" />
          <button type="button" onClick={onClose} disabled={sending} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ปิด</button>
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[34rem] text-left">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="w-8 px-2 py-2" /><th className="px-2 py-2">เรื่อง</th><th className="px-2 py-2">บนร้านตอนนี้</th><th className="px-2 py-2">หลังส่ง (ตามระบบ)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((it) => (
                  <tr key={it.key} className={it.state === "diff" ? "" : "text-slate-500"}>
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
                      {it.note && <div className="mt-1 text-[11px] text-slate-500">{it.note}</div>}
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
                    </td>
                  </tr>
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
