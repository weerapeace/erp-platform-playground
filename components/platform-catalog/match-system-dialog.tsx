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
import { useAuth } from "@/components/auth";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { DRIFT_KEYS, DRIFT_LABEL, descImages, descLines, lineDiff, looksHtml, type DriftItem, type DriftKey, type VariantTableRow } from "@/lib/platform-listing-drift";

type Check = { listing_id: string; platform_code: string; items: DriftItem[]; issues: DriftKey[]; checked_at: string; external_product_id?: string | null; shop_ref?: string | null; listing_status?: string | null };
/** ชื่อร้านสั้น (แจ้งผลของตัวเปิดหน้าให้เช็ก) */
const SHOP_LABEL: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE" };
type Call = { url: string; body: Record<string, unknown>; label: string };
type Step = { label: string; state: "wait" | "run" | "ok" | "fail"; error?: string; warnings?: string[] };
/** คำเตือนจากร้านที่ต้องรีบดู (โชว์กรอบแดงใหญ่ + แจ้งผลมุมจอ) */
const URGENT = /ถูกสร้างใหม่|BigSeller ด่วน|structure/i;

const REVIEW_NOTE: Record<string, string> = {
  tiktok: "TikTok: ส่งชื่อ/รูป/รายละเอียด/ชื่อตัวเลือก แล้ว TikTok ต้องตรวจใหม่ (ปกติไม่เกิน 1 วัน) ระหว่างนั้นร้านยังขายของเดิม · ราคามีผลทันที · ส่งหลายเรื่องพร้อมกัน = ตรวจรอบเดียว",
  lazada: "Lazada: แก้ชื่อ/รูป/รายละเอียดแล้วอาจต้องรอ Lazada ตรวจ (Pending QC) · ราคามีผลทันที",
};
/** เรื่องรูป: "บอกไม่ได้" ก็ติ๊กส่งครั้งแรกได้ (ระบบจำชุดที่ส่งไว้เทียบรอบหน้า) */
const FIRST_SEND: DriftKey[] = ["images", "desc_images", "variant_images"];
const canTick = (it: DriftItem) => it.sendable && (it.state === "diff" || (FIRST_SEND.includes(it.key) && it.state === "unknown"));
/** "ใช้ของร้าน" (ลงร่างของร้านนี้ · ย้อนได้) — เรื่องที่ให้ระบบใช้ตามร้านได้ (ตรงกับ ADOPT_KEYS ฝั่งเซิร์ฟเวอร์) */
const ADOPT_IN_DIALOG: DriftKey[] = ["title", "description", "attrs"];
/** ร้านที่เก็บชื่อสีแยกร้านในร่างได้ (ไม่มี = "ใช้ของร้าน" ต้องแก้ที่ SKU กลาง) */
const OPT_DRAFT_SHOPS = ["shopee", "lazada"];

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
  const { can } = useAuth();
  const canEdit = can("products.platforms.edit");
  const canProd = can("products.edit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [picked, setPicked] = useState<Set<DriftKey>>(new Set());
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [sending, setSending] = useState(false);
  const [openRows, setOpenRows] = useState<Set<DriftKey>>(new Set());
  /** ชื่อตัวเลือก: ตัวจริงของแต่ละรหัส (เจ้าของเลือก 2026-11-24 ข้อ 2) · sys = ส่งชื่อระบบขึ้นร้าน · shop = ระบบใช้ชื่อร้าน */
  const [optPick, setOptPick] = useState<Record<string, "shop" | "sys">>({});
  /** ข้อ 5: ใช้ชื่อร้านกับทุกร้าน (แก้ Color Th ของ SKU กลาง) — ค่าเริ่มต้นเปิด (ต้องมีสิทธิ์แก้สินค้า) */
  const [optCentral, setOptCentral] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // 🐛 2026-11-21: เดิม apply/load ขึ้นกับ onChanged (หน้าที่เรียกส่งฟังก์ชันใหม่ทุกครั้งที่วาด) → ผลออก → หน้าที่เรียกอัปเดตป้าย → วาดใหม่
  //    → load ตัวใหม่ → useEffect โหลดซ้ำวนไม่จบ (ปุ่มยืนยันจางเพราะ "กำลังโหลด" ตลอด · ติ๊กแล้วถูกรีเซ็ต · ถามร้านซ้ำ ๆ)
  //    → เก็บ onChanged ไว้ใน ref · โหลดใหม่เฉพาะตอนเปิด/เปลี่ยนรายการ
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const apply = useCallback((c: Check) => {
    setCheck(c);
    // ราคาไม่ติ๊กไว้ให้ก่อน — ร้านมักตั้งราคาเต็มสูงไว้ทำโปร ต้องให้คนดูแล้วติ๊กเอง
    // เรื่องที่มีคำเตือน "ตรวจก่อนส่ง" (เช่น รายละเอียดมาจากร่างที่แก้ไว้) ก็ไม่ติ๊กไว้ให้
    // ข้อมูลจำเพาะ (2026-11-23) ไม่ติ๊กไว้ให้ — ค่าระบบส่วนใหญ่มาจากค่าเริ่มต้นของร้าน อาจทับค่าที่ตั้งบนร้านไว้แล้วโดยตั้งใจ
    setPicked(new Set(c.items.filter((i) => canTick(i) && i.state === "diff" && i.key !== "price" && i.key !== "attrs" && !i.note?.startsWith("ตรวจก่อนส่ง")).map((i) => i.key)));
    // ชื่อตัวเลือก: เริ่มที่ "ระบบ" ถ้าส่งได้ · ส่งไม่ได้ (Lazada/LINE) = ยังไม่เลือก
    const opt = c.items.find((i) => i.key === "options");
    setOptPick(opt?.state === "diff" && opt.sendable ? Object.fromEntries((opt.rows ?? []).map((r) => [r.label, "sys" as const])) : {});
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
  // ชื่อตัวเลือก: แถวที่เลือก "ของร้าน" = ระบบใช้ชื่อร้าน (ไม่ส่งขึ้นร้าน) · ไม่มีแถว "ของระบบ" = ไม่ส่งเรื่องชื่อตัวเลือก
  const shopCodes = Object.entries(optPick).filter(([, v]) => v === "shop").map(([k]) => k);
  const sysCodes = Object.entries(optPick).filter(([, v]) => v === "sys").map(([k]) => k);
  const sendKeys = [...picked].filter((k) => k !== "options" || sysCodes.length > 0);
  const tickN = sendKeys.length;
  const optCentralOn = optCentral && canProd;

  const postDrift = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ listing_id: listingId, ...body }) });
    const j = await r.json().catch(() => ({ error: `ระบบตอบผิดพลาด (HTTP ${r.status})` }));
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j as { check?: Check | null; before?: unknown; changed?: { code: string; name: string }[]; warnings?: string[] };
  };
  /** ข้อ 1: ข้าม (ถือว่าตรง) / เลิกข้าม — จำไว้จนกว่าฝั่งร้านหรือระบบเปลี่ยน */
  const setIgnore = async (key: DriftKey, on: boolean) => {
    setBusyKey(`ig-${key}`);
    try {
      const j = await postDrift({ action: on ? "ignore" : "unignore", key });
      if (j.check) apply(j.check);
      if (on) toast.undo(`ข้าม “${DRIFT_LABEL[key]}” ไว้แล้ว — ถ้าบนร้านหรือในระบบเปลี่ยนอีกจะเตือนใหม่`, () => void setIgnore(key, false), { ms: 8000 });
      else toast.success(`เลิกข้าม “${DRIFT_LABEL[key]}” แล้ว`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyKey(null); }
  };
  /** ข้อ 4: ใช้ของร้าน (ชื่อ/รายละเอียด/ข้อมูลจำเพาะ → ร่างของร้านนี้ · ย้อนได้) */
  const adoptKey = async (key: DriftKey) => {
    setBusyKey(`ad-${key}`);
    try {
      const j = await postDrift({ action: "adopt", key });
      if (j.check) apply(j.check);
      const before = j.before;
      toast.undo(`ระบบใช้${DRIFT_LABEL[key]}ของร้านแล้ว (ร่างของร้านนี้ · ร้านอื่นไม่เปลี่ยน)`, () => {
        void postDrift({ action: "adopt_undo", key, before }).then((u) => { if (u.check) apply(u.check); toast.success("ย้อนกลับแล้ว"); }).catch((e) => toast.error((e as Error).message));
      }, { ms: 10000 });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyKey(null); }
  };
  const pickOpt = (codes: string[], v: "shop" | "sys") => {
    const next = { ...optPick }; for (const c of codes) next[c] = v;
    setOptPick(next);
    const anySys = Object.values(next).includes("sys");
    setPicked((p) => { const n = new Set(p); if (anySys) n.add("options"); else n.delete("options"); return n; });
  };

  const send = async () => {
    if (!listingId || (!tickN && !shopCodes.length) || !check) return;
    // เปิดหน้าให้เช็กหลังส่ง (ของกลาง push-open · ตั้งค่าต่อคน ค่าเริ่มต้นปิด) — ต้องเรียกก่อน await (ยังอยู่ในจังหวะกด)
    const session = pushOpen.prepare(tickN ? [{ code: check.platform_code }] : []);
    let opened = false;
    setSending(true); setSteps(null);
    const keys = sendKeys;
    try {
      // ชื่อตัวเลือก "ของร้าน" → ระบบใช้ชื่อร้านก่อน (ไม่แตะร้าน) · แล้วค่อยส่งเรื่องอื่น (ชื่อที่เลือก "ของระบบ" ยังต่างอยู่ = ส่งตามเดิม)
      if (shopCodes.length) {
        const j = await postDrift({ action: "adopt_options", codes: shopCodes, central: optCentralOn });
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        const before = j.before;
        toast.undo(`ระบบใช้ชื่อตัวเลือกของร้านแล้ว ${(j.changed ?? []).length} ชื่อ${optCentralOn ? " (แก้ Color Th ที่ SKU กลาง — ทุกร้านเปลี่ยนตาม)" : " (ร่างของร้านนี้)"}`, () => {
          void postDrift({ action: "adopt_options_undo", before }).then((u) => { if (u.check) apply(u.check); toast.success("ย้อนชื่อตัวเลือกแล้ว"); }).catch((e) => toast.error((e as Error).message));
        }, { ms: 12000 });
        if (!keys.length) { if (j.check) apply(j.check); return; }
      }
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
        const warns = Array.isArray(j.warnings) ? (j.warnings as unknown[]).map(String).filter(Boolean) : [];
        st[i] = { ...st[i], state: err ? "fail" : "ok", error: err ?? undefined, warnings: warns }; setSteps([...st]);
        const urgent = warns.filter((w) => URGENT.test(w));
        if (urgent.length) toast.error(urgent.join(" · "));
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
          {canPublish && !sending && (loading || (!tickN && !shopCodes.length)) && (
            <span className="text-xs text-slate-500">{loading ? "กำลังดึงข้อมูลล่าสุดจากร้าน…" : diffN ? "ติ๊กเรื่องที่จะส่งก่อน" : "ตรงกับระบบแล้ว ไม่มีอะไรต้องส่ง"}</span>
          )}
          {canPublish || (canEdit && shopCodes.length) ? (
            <button type="button" onClick={() => void send()} disabled={(!tickN && !shopCodes.length) || sending || loading}
              className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {sending ? "กำลังส่ง…" : tickN && shopCodes.length ? `ยืนยัน (ส่ง ${tickN} เรื่อง · ใช้ชื่อร้าน ${shopCodes.length})` : shopCodes.length ? `บันทึกชื่อของร้าน (${shopCodes.length})` : `ยืนยันส่งที่ติ๊ก (${tickN})`}
            </button>
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
          {/* อ่านก่อนเริ่ม: ร้านนี้ต้องรอตรวจไหม + จะส่งอะไรบ้าง (เจ้าของ 2026-11-21 "เช็ค tiktok ให้หน่อยดูงงๆ") */}
          {reviewNote && (
            <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Icon name="info" /><span>{reviewNote}</span></div>
          )}
          <div className="text-xs text-slate-600">
            {tickN ? <>จะส่ง: <b className="font-medium text-slate-800">{DRIFT_KEYS.filter((k) => sendKeys.includes(k)).map((k) => DRIFT_LABEL[k]).join(" · ")}</b> — เรื่องอื่นบนร้านคงเดิม</> : shopCodes.length ? null : "ยังไม่ได้ติ๊กเรื่องที่จะส่ง — ติ๊กช่องหน้าเรื่องที่อยากให้ร้านเหมือนระบบ"}
            {shopCodes.length > 0 && <span className="ml-1">{tickN ? "· " : ""}ระบบใช้ชื่อตัวเลือกของร้าน {shopCodes.length} ชื่อ{optCentralOn ? " (แก้ที่ SKU กลาง)" : " (ร่างของร้านนี้)"} — ไม่ส่งขึ้นร้าน</span>}
          </div>
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
                      {/* ข้อ 1 ข้าม (ถือว่าตรง) · ข้อ 4 ใช้ของร้าน (เจ้าของเลือก 2026-11-24) */}
                      {canEdit && !sending && (it.ignored || it.state === "diff") && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {it.ignored ? (
                            <button type="button" disabled={!!busyKey} onClick={() => void setIgnore(it.key, false)} className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">{busyKey === `ig-${it.key}` ? "กำลังบันทึก…" : "เลิกข้าม"}</button>
                          ) : (
                            <button type="button" disabled={!!busyKey} onClick={() => void setIgnore(it.key, true)} title="ถือว่าเรื่องนี้ตรงแล้ว — ระบบจำไว้ ถ้าบนร้านหรือในระบบเปลี่ยนอีกจะเตือนใหม่ (ไม่ส่ง ไม่แก้อะไร)"
                              className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">{busyKey === `ig-${it.key}` ? "กำลังบันทึก…" : "ข้าม (ถือว่าตรง)"}</button>
                          )}
                          {it.state === "diff" && ADOPT_IN_DIALOG.includes(it.key) && (it.key !== "attrs" || check.platform_code === "shopee") && (
                            <button type="button" disabled={!!busyKey} onClick={() => void adoptKey(it.key)} title="บันทึกค่าบนร้านเป็นค่าของระบบ — ลงร่างของร้านนี้เท่านั้น (ร้านอื่น/สินค้าหลักไม่เปลี่ยน) · ย้อนกลับได้"
                              className="h-6 rounded-md border border-violet-300 bg-white px-1.5 text-[11px] text-violet-800 hover:bg-violet-50 disabled:opacity-50">{busyKey === `ad-${it.key}` ? "กำลังบันทึก…" : "ใช้ของร้าน"}</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600 break-words">{it.before}</td>
                    <td className="px-2 py-2 align-top break-words">
                      {it.after}
                      {it.note && <div className={`mt-1 text-[11px] ${it.note.startsWith("ตรวจก่อนส่ง") ? "inline-flex items-start gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800" : "text-slate-500"}`}>{it.note.startsWith("ตรวจก่อนส่ง") && <Icon name="warning" />}{it.note}</div>}
                      {it.cannot && it.state !== "same" && <div className="mt-1 inline-flex items-start gap-1 text-[11px] text-amber-700"><Icon name="warning" />{it.cannot}</div>}
                      {it.rows && it.rows.length > 0 && !(it.key === "options" && it.state === "diff") && (
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
                      {it.state !== "diff" && (((it.key === "images" || it.key === "desc_images") && (it.media?.before.length || it.media?.after.length)) || (it.key === "description" && it.text) || (it.key === "options" && it.table?.length)) ? (
                        <button type="button" className="mt-1 block text-[11px] text-violet-700 hover:underline" onClick={() => setOpenRows((s) => { const n = new Set(s); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n; })}>
                          {openRows.has(it.key) ? "ซ่อน" : it.key === "description" ? "ดูรายละเอียดเต็ม" : it.key === "options" ? "ดูตารางตัวเลือก" : "ดูรูป"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {/* ข้อ 2 + 5: ชื่อตัวเลือก — เลือกตัวจริงทีละแถว (ของร้าน = ระบบใช้ชื่อร้าน · ของระบบ = ส่งขึ้นร้าน) */}
                  {it.key === "options" && it.state === "diff" && (it.rows?.length ?? 0) > 0 && (
                    <tr><td /><td colSpan={3} className="px-2 pb-3">
                      <OptionTruthPicker rows={it.rows!} pick={optPick} onPick={pickOpt} sendable={it.sendable && canPublish}
                        canShop={canEdit && (OPT_DRAFT_SHOPS.includes(check.platform_code) || canProd)} needCentral={!OPT_DRAFT_SHOPS.includes(check.platform_code)}
                        central={optCentralOn} canCentral={canProd} onCentral={setOptCentral} shopName={shopName} disabled={sending} />
                    </td></tr>
                  )}
                  {(it.state === "diff" || openRows.has(it.key)) && (it.key === "images" || it.key === "desc_images") && it.media && (it.media.before.length > 0 || it.media.after.length > 0) && (
                    <tr><td /><td colSpan={3} className="px-2 pb-3"><ImagesCompare before={it.media.before} after={it.media.after} shopName={shopName} /></td></tr>
                  )}
                  {/* ตารางตัวเลือก รูป · สี · ราคา 2 ฝั่ง (เจ้าของ 2026-11-21 ข้อ 3) — โชว์เมื่อชื่อ/รูป/ราคาตัวเลือกไม่ตรง หรือกดดู */}
                  {it.key === "options" && it.table && it.table.length > 0 && (openRows.has("options") || items.some((x) => (x.key === "options" || x.key === "variant_images" || x.key === "price") && x.state === "diff")) && (
                    <tr><td /><td colSpan={3} className="px-2 pb-3"><VariantTable rows={it.table} shopName={shopName} /></td></tr>
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
          </div>
          {steps && (
            <ul className="rounded-lg border border-slate-200 p-2 space-y-1 text-xs">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Icon name={s.state === "ok" ? "done" : s.state === "fail" ? "warning" : s.state === "run" ? "refresh" : "info"} />
                  <span className={s.state === "fail" ? "text-rose-700" : s.state === "ok" ? "text-emerald-700" : "text-slate-600"}>
                    ส่ง{s.label} — {s.state === "ok" ? "สำเร็จ" : s.state === "fail" ? `ไม่สำเร็จ: ${s.error}` : s.state === "run" ? "กำลังส่ง…" : "รอ"}
                    {s.warnings?.filter((w) => !URGENT.test(w)).map((w) => <span key={w} className="block text-[11px] text-slate-500">{w}</span>)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* คำเตือนด่วนจากร้าน (เช่น ตัวเลือกบน Shopee ถูกสร้างใหม่ → เช็ก BigSeller) — ต้องเห็นชัด */}
          {steps?.some((s) => s.warnings?.some((w) => URGENT.test(w))) && (
            <div className="flex items-start gap-1.5 rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
              <Icon name="warning" />
              <span>{steps.flatMap((s) => s.warnings ?? []).filter((w) => URGENT.test(w)).join(" · ")}</span>
            </div>
          )}
        </div>
      ) : null}
    </ERPModal>
  );
}

// ───────── ชื่อตัวเลือก: เลือกตัวจริงทีละแถว (เจ้าของเลือก 2026-11-24 ข้อ 2 + 5) ─────────
function OptionTruthPicker({ rows, pick, onPick, sendable, canShop, needCentral, central, canCentral, onCentral, shopName, disabled }: {
  rows: { label: string; before: string; after: string }[];
  pick: Record<string, "shop" | "sys">;
  onPick: (codes: string[], v: "shop" | "sys") => void;
  /** ส่งชื่อระบบขึ้นร้านได้ไหม (Lazada/LINE ยังไม่ได้) */
  sendable: boolean;
  /** เลือก "ของร้าน" ได้ไหม (สิทธิ์ + ร้านมีช่องในร่าง หรือแก้ SKU กลางได้) */
  canShop: boolean;
  /** ร้านนี้ไม่มีช่องชื่อแยกร้าน → "ของร้าน" ต้องแก้ที่ SKU กลาง */
  needCentral: boolean;
  central: boolean; canCentral: boolean; onCentral: (v: boolean) => void;
  shopName: string; disabled: boolean;
}) {
  const codes = rows.map((r) => r.label);
  const shopOk = canShop && (!needCentral || central);
  const nShop = codes.filter((c) => pick[c] === "shop").length, nSys = codes.filter((c) => pick[c] === "sys").length;
  const btn = (on: boolean, tone: "shop" | "sys") => `min-h-7 w-full rounded-md border px-2 py-1 text-left text-[11px] leading-snug disabled:opacity-40 ${on ? (tone === "sys" ? "border-violet-400 bg-violet-50 text-violet-900" : "border-emerald-400 bg-emerald-50 text-emerald-900") : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-600">ตัวจริงคือ:</span>
        <button type="button" disabled={disabled || !shopOk} onClick={() => onPick(codes, "shop")} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">ของร้านทั้งหมด</button>
        <button type="button" disabled={disabled || !sendable} onClick={() => onPick(codes, "sys")} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 disabled:opacity-40">ของระบบทั้งหมด</button>
        <span className="text-[11px] text-slate-500">{nSys ? `ส่งขึ้น ${shopName} ${nSys} ชื่อ` : ""}{nSys && nShop ? " · " : ""}{nShop ? `ระบบใช้ชื่อร้าน ${nShop} ชื่อ` : ""}{!nSys && !nShop ? "ยังไม่ได้เลือก (ไม่ทำอะไร)" : ""}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[7rem_1fr_1fr]">
          <span className="font-mono text-[11px] text-slate-500">{r.label}</span>
          <button type="button" disabled={disabled || !shopOk} onClick={() => onPick([r.label], "shop")} className={btn(pick[r.label] === "shop", "shop")}>
            {pick[r.label] === "shop" && <Icon name="done" className="mr-0.5" />}ร้าน: {r.before}
          </button>
          <button type="button" disabled={disabled || !sendable} onClick={() => onPick([r.label], "sys")} className={btn(pick[r.label] === "sys", "sys")}>
            {pick[r.label] === "sys" && <Icon name="done" className="mr-0.5" />}ระบบ: {r.after}
          </button>
        </div>
      ))}
      {canShop && (
        <label className={`flex items-start gap-1.5 text-[11px] ${canCentral ? "text-slate-700" : "text-slate-400"}`}>
          <input type="checkbox" checked={central} disabled={disabled || !canCentral} onChange={(e) => onCentral(e.target.checked)} className="mt-0.5" />
          <span>ใช้ชื่อร้านกับทุกร้าน (แก้ “Color Th” ของ SKU กลาง — ชื่อนี้จะขึ้นในร้านอื่น/เอกสารด้วย){!canCentral ? " · ต้องมีสิทธิ์แก้สินค้า" : ""}{needCentral ? ` · ${shopName} ไม่มีช่องชื่อแยกร้าน ต้องติ๊กข้อนี้ถึงจะเลือก "ร้าน" ได้` : " · ไม่ติ๊ก = จำไว้ในร่างของร้านนี้เท่านั้น"}</span>
        </label>
      )}
      {!sendable && <p className="text-[11px] text-amber-700">ร้านนี้ส่งชื่อตัวเลือกจากระบบไม่ได้ — เลือก “ร้าน” เพื่อให้ระบบตรงกับร้าน หรือกด “ข้าม (ถือว่าตรง)”</p>}
      <p className="text-[11px] text-slate-400">ของร้าน = ระบบเปลี่ยนตามร้าน (ไม่แตะร้าน · ย้อนได้ที่แจ้งผลมุมจอ) · ของระบบ = ส่งชื่อระบบขึ้นร้านตอนกดยืนยัน</p>
    </div>
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
      {ls.some((l) => l.text) ? ls.map((l, i) => (
        // บรรทัดว่าง = เว้นบรรทัดจริง (เจ้าของ 2026-11-21 "อยากให้ preview เว้นบรรทัด")
        l.text ? <div key={i} className={l.changed ? (tone === "del" ? "bg-rose-50 text-rose-800 line-through decoration-rose-300" : "bg-emerald-50 text-emerald-800") : "text-slate-700"}>{l.text}</div>
          : <div key={i} className="h-3" aria-hidden />
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

// ───────── ตัวเลือก: ตารางรูป · สี · ราคา 2 ฝั่ง (เจ้าของเลือก 2026-11-21 ข้อ 3) ─────────
const bahtTxt = (n: number | null | undefined) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`);
function priceCell(x: { price: number | null; pay?: number | null; special?: number | null }) {
  const pay = x.pay ?? x.special;
  return pay != null && x.price != null && pay < x.price - 0.005
    ? <><span>{bahtTxt(pay)}</span> <span className="text-[11px] text-slate-400 line-through">{bahtTxt(x.price)}</span></>
    : <span>{bahtTxt(x.price)}</span>;
}
function VariantTable({ rows, shopName }: { rows: VariantTableRow[]; shopName: string }) {
  const [idx, setIdx] = useState(-1);
  // รูปทั้งหมดในตาราง (บนร้าน → หลังส่ง ต่อแถว) ไว้เปิดดูรูปใหญ่
  const pics: LightboxImage[] = useMemo(() => rows.flatMap((r) => [
    ...(r.shop?.image ? [{ url: r.shop.image, label: `${r.code} · บน ${shopName} ตอนนี้` }] : []),
    ...(r.sys.image ? [{ url: r.sys.image, label: `${r.code} · หลังส่ง (ตามระบบ)` }] : []),
  ]), [rows, shopName]);
  const open = (url: string | null | undefined) => { if (url) setIdx(pics.findIndex((p) => p.url === url)); };
  const thumb = (url: string | null | undefined, warn = false) => url
    // eslint-disable-next-line @next/next/no-img-element
    ? <button type="button" onClick={() => open(url)} className={`h-10 w-10 shrink-0 overflow-hidden rounded border bg-slate-50 cursor-zoom-in ${warn ? "border-amber-400" : "border-slate-200"}`}><img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>
    : <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border text-[10px] ${warn ? "border-amber-300 bg-amber-50 text-amber-700" : "border-dashed border-slate-200 text-slate-400"}`}>ไม่มีรูป</span>;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="text-[11px] text-slate-500">
            <tr><th className="px-1.5 py-1">SKU</th><th className="px-1.5 py-1">บน {shopName} ตอนนี้</th><th className="px-1.5 py-1">หลังส่ง (ตามระบบ)</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.code} className="align-middle">
                <td className="px-1.5 py-1.5 font-mono text-[11px] text-slate-600">{r.code}</td>
                <td className="px-1.5 py-1.5">
                  {r.shop ? (
                    <div className="flex items-center gap-2">
                      {thumb(r.shop.image, r.imageMissing)}
                      <div className="min-w-0">
                        <div className={r.nameDiff ? "rounded bg-rose-50 px-1 text-rose-800 line-through decoration-rose-300" : "text-slate-700"}>{r.shop.label || "—"}</div>
                        <div className={r.priceDiff ? "rounded bg-rose-50 px-1 text-rose-800" : "text-slate-500"}>{priceCell(r.shop)}</div>
                      </div>
                    </div>
                  ) : <span className="text-[11px] text-slate-400">ไม่มีตัวเลือกนี้บนร้าน</span>}
                </td>
                <td className="px-1.5 py-1.5">
                  <div className="flex items-center gap-2">
                    {thumb(r.sys.image)}
                    <div className="min-w-0">
                      <div className={r.nameDiff ? "rounded bg-emerald-50 px-1 text-emerald-800" : "text-slate-700"}>{r.sys.label}</div>
                      <div className={r.priceDiff ? "rounded bg-emerald-50 px-1 text-emerald-800" : "text-slate-500"}>{priceCell(r.sys)}</div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">แดง = จะหาย/เปลี่ยน · เขียว = หลังส่ง · กรอบส้ม = ตัวเลือกบนร้านยังไม่มีรูป · กดรูปเพื่อดูใหญ่ · ส่งแยกเรื่องได้ที่แถว "ชื่อตัวเลือก" "รูปตัวเลือก" "ราคา"</div>
      <ImageLightbox images={pics} index={idx} onClose={() => setIdx(-1)} onIndex={setIdx} />
    </div>
  );
}
