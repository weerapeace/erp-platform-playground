"use client";

/**
 * ตัวช่วยลงสินค้าขึ้นร้าน (ของกลาง) — เจ้าของเลือก flow "เข้าได้ 2 ทาง ใช้ตัวช่วยตัวเดียว" (2026-11-08)
 * --------------------------------------------------------------------------
 * ใช้ที่: หน้าสินค้าบนแพลตฟอร์ม (มุมมองหน้าร้าน แท็บ "ยังไม่ลง") · Parent SKU (แท็บแพลตฟอร์ม "ลงร้านนี้" + ติ๊กหลายตัวในหน้ารายการ)
 * 3 ขั้น (เจ้าของขอ 2026-11-10 "ต้องบอกว่ารายละเอียดจะดึงอะไรไปบ้าง แก้ได้ด้วย ทำให้ดูง่าย"):
 *   1 เลือกร้าน — ร้านที่ลงจริงได้ (LINE) เด่น · ร้านอื่น (บันทึกร่าง) พับไว้ พร้อมตัวเลือกราคา/ร่างเดิม
 *   2 ดูและแก้รายละเอียด — LINE: LineCreatePreviewEditor (ทุกช่องที่จะส่ง + มาจากไหน + แก้ได้ · ราคาแก้ = ราคาในระบบ)
 *       ร้านอื่น: ความครบ + แก้เลย / สร้างงานเติม / ข้าม (เหมือนเดิม)
 *   3 ยืนยัน + ติดตามผล
 *   เข้าขั้น 2 = บันทึกร่าง LINE ให้ก่อน (เติมเฉพาะช่องที่ว่าง) เพื่อให้เห็นหมวด/รูปที่ระบบเติมให้ และแก้ลงร่างได้ · ตอนลงจริงไม่เขียนทับสิ่งที่แก้
 *
 * ของเดิมที่ใช้ (ไม่ทำซ้ำ):
 *   ตรวจ = GET /api/product-platforms/readiness?parent_sku_ids= (+on_shop) · บันทึกร่าง = POST /api/product-platforms/prepare
 *   ลงจริง = POST /api/line-shopping/create-product (เฉพาะร้านที่มีตัวเชื่อมจริง — ตอนนี้ LINE) · แก้ = ProductPlatformManager
 *   สร้างงาน = CreateTaskModal (presetProducts) · ป๊อป = ERPModal · กฎตัดสิน = lib/platform-add-plan (pure + เทสต์)
 * ลงร้านอื่นจากรายการบนร้าน (prop sources — เปิดจากลิ้นชักสินค้าบนร้าน / ติ๊กหลายรายการในมุมมองหน้าร้าน · เจ้าของอนุมัติเฟส 1 2026-11-10):
 *   ไม่ให้เลือกร้านต้นทางเป็นปลายทาง · เข้าขั้น 2 = คัดลอกข้อมูลจากร้านต้นทางลงร่าง LINE (ค่าเริ่ม) ทีละตัว
 *   → ตารางจับคู่ CopyMappingTable (เปลี่ยนแหล่งรายช่อง / เติมราคาที่ว่าง) อยู่เหนือหน้าดูก่อนส่ง · ลงจริงใช้ create-product เดิม (อ่านร่าง)
 * ลงทุกร้านในครั้งเดียว (เจ้าของอนุมัติ 2026-11-10 เฟส A+B): ร้านที่ลงจริงได้/ดูก่อนส่งได้ มาจากทะเบียนกลาง lib/platform-create-registry
 *   ขั้น 2 = แท็บต่อร้าน (LINE: LineCreatePreviewEditor · Lazada: LazadaCreatePreviewEditor · TikTok: TiktokCreatePreviewEditor — ลงเป็นฉบับร่าง) · ขั้น 3 ลงทุกร้านในรอบเดียว + ผลแยกร้าน
 *   Lazada ยังไม่เปิดลงจริง (LAZADA_CREATE_LIVE) → ดูก่อนส่ง + บันทึกร่าง · ร้านใหม่ = เพิ่มแถวในทะเบียน + หน้าดูก่อนส่งของร้านนั้น
 * กันซ้ำ: ข้ามตัวที่มีบนร้านแล้ว (on_shop / ร่างมีรหัส) · ลงจริงทีละตัว · server ล็อกระหว่างสร้าง · ลงจริง > 20 ต้องพิมพ์ยืนยัน
 * สิทธิ์: บันทึกร่าง = products.platforms.edit · ลงจริง = products.platforms.publish · สร้างงาน = tasks.create
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { LineCreatePreviewEditor } from "./line-create-preview";
import { LineStorefrontPreview } from "./line-storefront-preview";
import type { LineCreatePreview } from "@/lib/line-create-payload";
import type { LazCreatePreview } from "@/lib/lazada-create-plan";
import type { TtsCreatePreview } from "@/lib/tiktok-create-plan";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { normalizePriceRule } from "@/lib/platform-listing-builder";
import { creatorOf, hasCreatePreview, liveCreateEndpoint } from "@/lib/platform-create-registry";
import type { ParentSkuPickerValue } from "@/components/pickers";
import {
  ADD_CONFIRM_WORD, ADD_DECISION_LABEL, ADD_MAX_ITEMS, decideAdd, isOnShop, missingList, needsTypedConfirm, summarizePlan,
  type AddDecision, type AddReadinessRow,
} from "@/lib/platform-add-plan";

const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });
const CreateTaskModal = dynamic(() => import("@/app/tasks/create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });
// ตารางจับคู่ช่อง (ลงร้านอื่นจากรายการนี้) — โหลดเมื่อใช้โหมดคัดลอกเท่านั้น (ไม่ถ่วงหน้าที่ใช้ตัวช่วยแบบปกติ)
const CopyMappingTable = dynamic(() => import("./copy-mapping-table").then((m) => m.CopyMappingTable), { ssr: false });
// หน้าดูก่อนส่งของ Lazada — โหลดเมื่อเลือก Lazada เท่านั้น
const LazadaCreatePreviewEditor = dynamic(() => import("./lazada-create-preview").then((m) => m.LazadaCreatePreviewEditor), { ssr: false });
// หน้าดูก่อนส่งของ TikTok (ลงเป็นฉบับร่าง) — โหลดเมื่อเลือก TikTok เท่านั้น
const TiktokCreatePreviewEditor = dynamic(() => import("./tiktok-create-preview").then((m) => m.TiktokCreatePreviewEditor), { ssr: false });

type Pf = { id: string; code: string; name_th: string; icon_key: string | null; can_publish?: boolean };
export type AddWizardParent = { id: string; code: string; name: string | null };
/** รายการบนร้านต้นทางที่ใช้เป็นต้นแบบ (ลงร้านอื่นจากรายการนี้) */
export type CopySourceRef = { listing_id: string; platform_code: string; platform_name?: string | null };
type Outcome = { parent_id: string; platform: string; ok: boolean; text: string };
const STEPS = ["เลือกร้าน", "ดูและแก้รายละเอียด", "ยืนยัน"];

export function AddToPlatformWizard({ open, onClose, onDone, parents, brandId, initialPlatformCodes = [], sources }: {
  open: boolean;
  onClose: () => void;
  /** ลงเสร็จ (มีอะไรเปลี่ยน) — ให้หน้าแม่โหลดใหม่ */
  onDone?: () => void;
  parents: AddWizardParent[];
  /** แบรนด์ของสินค้า (ใช้เลือกไว้ให้ในป๊อปสร้างงาน) */
  brandId?: string | null;
  /** ร้านที่ติ๊กไว้ให้ก่อน (code) */
  initialPlatformCodes?: string[];
  /** ลงร้านอื่นจากรายการบนร้าน: parent id → รายการต้นทาง (ไม่ส่ง = ลงจากข้อมูลในระบบตามเดิม) */
  sources?: Record<string, CopySourceRef>;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const canPublish = can("products.platforms.publish" as Parameters<typeof can>[0]);
  const canTask = can("tasks.create" as Parameters<typeof can>[0]);
  const canEditPrice = can("products.edit");

  const list = useMemo(() => parents.slice(0, ADD_MAX_ITEMS), [parents]);
  const [step, setStep] = useState(1);
  const [pfs, setPfs] = useState<Pf[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());          // platform code
  const [real, setReal] = useState<Set<string>>(new Set());              // code ที่เลือก "ลงจริง"
  const [mode, setMode] = useState<"same" | "pct">("same");
  const [pct, setPct] = useState("5");
  const [overwrite, setOverwrite] = useState(false);
  const [rows, setRows] = useState<Record<string, AddReadinessRow[]>>({}); // code → แถว
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());       // parent id ที่ผู้ใช้กดข้าม
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [fixFor, setFixFor] = useState<{ parentId: string; platformId: string } | null>(null);
  const [taskFor, setTaskFor] = useState<ParentSkuPickerValue[] | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);                     // ขั้น 1: กล่องร้านอื่น (บันทึกร่าง)
  const [focus, setFocus] = useState<string | null>(null);                 // ขั้น 2: สินค้าที่กำลังดู
  const [tab, setTab] = useState<string | null>(null);                     // ขั้น 2: แท็บร้าน (code)
  const [pvState, setPvState] = useState<Record<string, number>>({});      // "code:parent id" → จำนวนข้อที่ขาด (จากหน้าดูก่อนส่ง)
  const [preparing, setPreparing] = useState(false);
  const [afterDisplay, setAfterDisplay] = useState<"hide" | "onsale">("hide");   // ขั้น 3: หลังลง เปิด/ปิดขาย (ค่าเริ่ม ปิดไว้ก่อน)
  const [previewFor, setPreviewFor] = useState<string | null>(null);              // ขั้น 3: ดูแบบหน้าร้าน (parent id)
  const preparedRef = useRef<Set<string>>(new Set());                      // บันทึกร่าง LINE ไปแล้ว (ไม่ทำซ้ำตอนย้อนไปมา)
  const stopRef = useRef(false);
  // ลงร้านอื่นจากรายการบนร้าน: คัดลอกลงร่าง LINE แล้ว (ไม่ทำซ้ำ — ไม่ทับที่ผู้ใช้เลือกใหม่ในตาราง) · ผลต่อสินค้า · ความคืบหน้า
  const copyMode = !!sources && Object.keys(sources).length > 0;
  const sourceCodes = useMemo(() => new Set(Object.values(sources ?? {}).map((s) => s.platform_code)), [sources]);
  const sourceNames = useMemo(() => [...new Set(Object.values(sources ?? {}).map((s) => s.platform_name || s.platform_code))].join(" · "), [sources]);
  const copiedRef = useRef<Set<string>>(new Set());
  const [copyErr, setCopyErr] = useState<Record<string, string>>({});
  const [copying, setCopying] = useState<{ done: number; total: number } | null>(null);
  const [pvNonce, setPvNonce] = useState(0);                               // หน้าดูก่อนส่งโหลดใหม่หลังใช้ตารางจับคู่

  // เปิดใหม่ = เริ่มขั้น 1 · ติ๊กร้านที่ส่งมาให้ · ร้านลงจริงได้ + มีสิทธิ์ = ติ๊ก "ลงจริง" ไว้ให้
  useEffect(() => {
    if (!open) return;
    setStep(1); setRows({}); setSkipped(new Set()); setTyped(""); setOutcomes(null); setCheckErr(null); setProgress({ done: 0, total: 0, label: "" });
    setFocus(null); setTab(null); setPvState({}); preparedRef.current = new Set(); setOthersOpen(false); setAfterDisplay("hide"); setPreviewFor(null);
    copiedRef.current = new Set(); setCopyErr({}); setCopying(null);
    let alive = true;
    apiFetch(`/api/platform-accounts${brandId ? `?brand_id=${encodeURIComponent(brandId)}` : ""}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      // ลงร้านอื่น: ร้านต้นทางไม่ใช่ปลายทาง
      const sel = ((j.platforms ?? []) as Pf[]).filter((p) => isSellingPlatform(p.code) && !sourceCodes.has(p.code));
      setPfs(sel);
      const init = new Set(initialPlatformCodes.filter((c) => sel.some((p) => p.code === c)));
      setPicked(init);
      setReal(new Set(sel.filter((p) => init.has(p.code) && liveCreateEndpoint(p.code) && canPublish).map((p) => p.code)));
    }).catch(() => { if (alive) setPfs([]); });
    return () => { alive = false; };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickedPfs = useMemo(() => (pfs ?? []).filter((p) => picked.has(p.code)), [pfs, picked]);
  // ลงจริงได้ = ทะเบียนกลางเปิดตัวสร้างของร้านนั้นแล้ว (lib/platform-create-registry) + มีสิทธิ์ลงขาย
  const realOk = (p: Pf) => !!liveCreateEndpoint(p.code) && canPublish;

  const realOn = (p: Pf) => real.has(p.code) && realOk(p);
  // ร้านที่มีหน้า "ดูก่อนส่ง": เลือกลงจริงไว้ (LINE) หรือมีตัวสร้างแต่ยังไม่เปิดลงจริง (Lazada — ดูก่อนส่ง + บันทึกร่าง)
  const showPreview = (p: Pf) => hasCreatePreview(p.code) && (realOn(p) || !creatorOf(p.code)?.live);
  const previewPfs = pickedPfs.filter(showPreview);
  const linePf = previewPfs.find((p) => p.code === "line_shopping" && realOn(p)) ?? null;
  const othersPfs = pickedPfs.filter((p) => !previewPfs.includes(p));
  const activePf = previewPfs.find((p) => p.code === tab) ?? previewPfs[0] ?? null;

  // ---------- ตรวจความครบ (เฉพาะสินค้าที่เลือก ทีละร้าน) ----------
  const check = useCallback(async (): Promise<Record<string, AddReadinessRow[]> | null> => {
    setChecking(true); setCheckErr(null);
    try {
      const ids = list.map((p) => p.id).join(",");
      const res = await Promise.all(pickedPfs.map(async (p) => {
        const j = await apiFetch(`/api/product-platforms/readiness?platform_code=${encodeURIComponent(p.code)}&parent_sku_ids=${encodeURIComponent(ids)}`).then((r) => r.json());
        if (j.error) throw new Error(`${p.name_th}: ${j.error}`);
        return [p.code, (j.data ?? []) as AddReadinessRow[]] as const;
      }));
      const m = Object.fromEntries(res);
      setRows(m);
      return m;
    } catch (e) { setCheckErr((e as Error).message || "ตรวจไม่สำเร็จ"); return null; }
    finally { setChecking(false); }
  }, [list, pickedPfs]);

  // บันทึกร่างของร้านที่มีหน้าดูก่อนส่งให้ก่อน (เติมเฉพาะช่องที่ว่าง — ไม่ทับที่เคยแก้) → เห็นหมวด/รูปที่ระบบเติมให้ และแก้ลงร่างได้
  const prepareLine = async (pf: Pf, ids: string[]) => {
    const todo = ids.filter((id) => !preparedRef.current.has(`${pf.code}:${id}`));
    if (!todo.length || !canEdit) return;
    setPreparing(true);
    try {
      for (let i = 0; i < todo.length; i += 100) {
        const chunk = todo.slice(i, i + 100);
        const j = await apiFetch("/api/product-platforms/prepare", { method: "POST", body: JSON.stringify({ platform_code: pf.code, parent_sku_ids: chunk, price_rule: normalizePriceRule({ mode: "same", pct: 0 }), overwrite: false }) }).then((r) => r.json());
        if (!j.error) for (const id of chunk) preparedRef.current.add(`${pf.code}:${id}`);
      }
    } catch { /* ดูก่อนส่งยังเปิดได้ — แค่หมวด/รูปอาจยังไม่ถูกเติม */ }
    finally { setPreparing(false); }
  };

  // ลงร้านอื่น: คัดลอกข้อมูลจากรายการต้นทางลงร่าง LINE (ค่าเริ่มของตารางจับคู่) ทีละตัว — Lazada ต้องดึงสดทีละรายการ
  const copyLine = async (ids: string[]) => {
    const todo = ids.filter((id) => sources?.[id] && !copiedRef.current.has(id));
    if (!todo.length || !canEdit) return;
    setCopying({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const id = todo[i]; const src = sources![id];
      try {
        const j = await apiFetch("/api/platform-listing/copy", { method: "POST", body: JSON.stringify({ listing_id: src.listing_id, target: "line_shopping", action: "apply" }) }).then((r) => r.json()) as { error: string | null };
        if (j.error) setCopyErr((m) => ({ ...m, [id]: j.error as string }));
        else { copiedRef.current.add(id); setCopyErr((m) => { const n = { ...m }; delete n[id]; return n; }); }
      } catch (e) { setCopyErr((m) => ({ ...m, [id]: (e as Error).message || "คัดลอกไม่สำเร็จ" })); }
      setCopying({ done: i + 1, total: todo.length });
      // เว้นจังหวะ — Lazada จำกัดความถี่การดึงสด
      if (src.platform_code === "lazada" && i < todo.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    setCopying(null);
  };

  const goNext = async () => {
    if (step === 1) {
      if (!pickedPfs.length) { toast.warning("เลือกร้านอย่างน้อย 1 ร้าน"); return; }
      setStep(2);
      const m = await check();
      // ทุกร้านที่มีหน้าดูก่อนส่ง (LINE / Lazada …): เตรียมร่างก่อน
      if (m) for (const pf of previewPfs) {
        const todo = (m[pf.code] ?? []).filter((r) => !isOnShop(r)).map((r) => r.id);
        await prepareLine(pf, todo);
        setFocus((f) => f ?? todo[0] ?? (m[pf.code] ?? [])[0]?.id ?? null);
      }
      // ลงร้านอื่น: คัดลอกจากร้านต้นทางลงร่าง LINE (ทั้งลงจริงและบันทึกร่าง) — หลังเตรียมร่าง เพื่อให้ค่าจากร้านต้นทางอยู่บนสุด
      const copyPf = pickedPfs.find((p) => p.code === "line_shopping");
      if (m && copyMode && copyPf) await copyLine((m[copyPf.code] ?? []).filter((r) => !isOnShop(r)).map((r) => r.id));
      return;
    }
    if (step === 2) {
      // ตรวจใหม่หลังแก้ (ราคา/หมวด/รูป) → ขั้นยืนยันตัดสิน "ลงจริง/ข้าม" จากข้อมูลล่าสุด
      const m = await check();
      if (m) setStep(3);
      return;
    }
  };

  // ---------- แผน (ต่อร้าน × สินค้า) ----------
  const plan = useMemo(() => {
    const out: { pf: Pf; row: AddReadinessRow; decision: AddDecision }[] = [];
    for (const p of pickedPfs) for (const r of rows[p.code] ?? []) out.push({ pf: p, row: r, decision: decideAdd(r, real.has(p.code) && realOk(p), skipped.has(r.id)) });
    return out;
  }, [pickedPfs, rows, real, skipped]);   // eslint-disable-line react-hooks/exhaustive-deps
  const summary = summarizePlan(plan.map((x) => x.decision));
  const needTyped = needsTypedConfirm(summary.publish);
  const problemParents = useMemo(() => {
    const m = new Map<string, { row: AddReadinessRow; pfs: { pf: Pf; missing: string[] }[] }>();
    for (const x of plan) {
      if (previewPfs.includes(x.pf)) continue;   // ร้านที่มีหน้าดูก่อนส่ง = แก้ในแท็บของร้านนั้น (ไม่อยู่ในรายการนี้)
      if (isOnShop(x.row) || x.row.ready_now) continue;
      const cur = m.get(x.row.id) ?? { row: x.row, pfs: [] };
      cur.pfs.push({ pf: x.pf, missing: missingList(x.row.missing) });
      m.set(x.row.id, cur);
    }
    return [...m.values()];
  }, [plan, previewPfs]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ขั้น 1: ร้านที่ลงจริงได้ (เด่น) · ร้านที่ดูก่อนส่งได้แต่ยังไม่เปิดลงจริง (เด่น + บอกเหตุผล) · ร้านอื่น (บันทึกร่าง · พับไว้)
  const realPfs = (pfs ?? []).filter((p) => !!liveCreateEndpoint(p.code));
  const soonPfs = (pfs ?? []).filter((p) => hasCreatePreview(p.code) && !liveCreateEndpoint(p.code));
  const draftPfs = (pfs ?? []).filter((p) => !hasCreatePreview(p.code));
  const pickedDraftN = draftPfs.filter((p) => picked.has(p.code)).length;
  const togglePick = (code: string) => setPicked((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const toggleSkip = (id: string) => setSkipped((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // ขั้น 2: แท็บร้าน → สินค้าที่กำลังดูก่อนส่ง
  const lineRows = activePf ? rows[activePf.code] ?? [] : [];
  const focusRow = lineRows.find((r) => r.id === focus) ?? lineRows[0] ?? null;
  // ต้องคงที่ (หน้าดูก่อนส่งโหลดใหม่เมื่อ onLoaded เปลี่ยน)
  const onLazLoaded = useCallback((pv: LazCreatePreview, blockers: string[]) => {
    setPvState((s) => ({ ...s, [`lazada:${pv.parent_id}`]: pv.missing.length + blockers.filter((b) => !b.startsWith("มีบน Lazada")).length }));
  }, []);
  const onTtLoaded = useCallback((pv: TtsCreatePreview, blockers: string[]) => {
    setPvState((s) => ({ ...s, [`tiktok:${pv.parent_id}`]: pv.missing.length + blockers.filter((b) => !b.startsWith("มีบน TikTok")).length }));
  }, []);
  const onPvLoaded = useCallback((pv: LineCreatePreview) => {
    setPvState((s) => ({ ...s, [`line_shopping:${pv.parent_id}`]: pv.missing.length + pv.blockers.filter((b) => !b.startsWith("มีบน LINE")).length }));
  }, []);

  // ---------- ขั้น 3: ลง ----------
  const run = async () => {
    if (needTyped && typed.trim() !== ADD_CONFIRM_WORD) { toast.warning(`พิมพ์ "${ADD_CONFIRM_WORD}" ก่อนลงจริง`); return; }
    setRunning(true); stopRef.current = false;
    const res: Outcome[] = [];
    const rule = normalizePriceRule({ mode, pct: Number(pct) });
    const toCreate: { pf: Pf; id: string }[] = [];
    try {
      // 1) บันทึกร่าง (ทุกตัวที่ไม่ข้าม) — ร่างคือสิ่งที่ "ลงจริง" ใช้ส่งขึ้นร้าน
      const prepTotal = plan.filter((x) => x.decision === "prepare" || x.decision === "publish").length;
      let done = 0;
      setProgress({ done: 0, total: prepTotal, label: "กำลังบันทึกร่าง" });
      for (const p of pickedPfs) {
        const mine = plan.filter((x) => x.pf.code === p.code && (x.decision === "prepare" || x.decision === "publish"));
        for (let i = 0; i < mine.length; i += 100) {
          const chunk = mine.slice(i, i + 100);
          // ร้านที่มีหน้าดูก่อนส่ง (LINE / Lazada) ห้ามเขียนทับ — ผู้ใช้แก้ร่างไว้แล้วในขั้น 2 · ลงร้านอื่น: ร่าง LINE มีค่าที่คัดลอกมา ห้ามทับ
          const keepDraft = previewPfs.includes(p) || (copyMode && p.code === "line_shopping");
          const r = await apiFetch("/api/product-platforms/prepare", { method: "POST", body: JSON.stringify({ platform_code: p.code, parent_sku_ids: chunk.map((x) => x.row.id), price_rule: rule, overwrite: keepDraft ? false : overwrite }) });
          const j = await r.json();
          if (j.error) { for (const x of chunk) res.push({ parent_id: x.row.id, platform: p.name_th, ok: false, text: `บันทึกร่างไม่สำเร็จ: ${j.error}` }); }
          else {
            for (const it of (j.results ?? []) as { parent_sku_id: string; result: string; ready: boolean; blockers?: string[] }[]) {
              const x = chunk.find((c) => c.row.id === it.parent_sku_id);
              if (!x) continue;
              if (it.result === "skipped_listed") { res.push({ parent_id: x.row.id, platform: p.name_th, ok: true, text: "มีบนร้านแล้ว — ข้าม" }); continue; }
              if (x.decision === "publish" && it.ready) toCreate.push({ pf: p, id: x.row.id });
              else res.push({ parent_id: x.row.id, platform: p.name_th, ok: true, text: it.ready ? "บันทึกร่างแล้ว · พร้อมลง" : ((it.blockers ?? []).length ? `บันทึกร่างแล้ว · ยังขาด ${(it.blockers ?? []).length} ข้อ` : "บันทึกร่างแล้ว · ยังขาดข้อมูล") });
            }
          }
          done += chunk.length; setProgress({ done, total: prepTotal, label: "กำลังบันทึกร่าง" });
        }
      }
      // 2) ลงจริง ทีละตัว (กันกดรัว + server ล็อกซ้ำอีกชั้น) · กดหยุดได้ระหว่างทาง
      setProgress({ done: 0, total: toCreate.length, label: "กำลังลงบนร้าน" });
      for (let i = 0; i < toCreate.length; i++) {
        const { pf, id } = toCreate[i];
        if (stopRef.current) { res.push({ parent_id: id, platform: pf.name_th, ok: false, text: "หยุดก่อนลง (บันทึกร่างไว้แล้ว)" }); continue; }
        const endpoint = liveCreateEndpoint(pf.code);
        if (!endpoint) { res.push({ parent_id: id, platform: pf.name_th, ok: true, text: "บันทึกร่างแล้ว · ร้านนี้ยังไม่เปิดลงจริง" }); continue; }
        try {
          const r = await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ parent_sku_id: id, display: afterDisplay }) });
          const j = await r.json();
          if (j.error || j.ok === false) res.push({ parent_id: id, platform: pf.name_th, ok: false, text: `ลงไม่สำเร็จ: ${j.error ?? "ไม่ทราบสาเหตุ"}` });
          else {
            // รูปในรายละเอียด (ทดลอง) — พลาดไม่ทำให้ลงไม่สำเร็จ แค่บอกให้รู้
            const di = j.desc_images as { ok: boolean; present: number; total: number; error: string | null } | null | undefined;
            const diText = di ? (di.ok ? ` · รูปในรายละเอียด ${di.present} รูป` : ` · รูปในรายละเอียดไม่สำเร็จ (${di.error ?? "ไม่ทราบสาเหตุ"})`) : "";
            // ของขวัญ: LINE ไม่รับผ่าน API (ทดสอบ 2026-11-10) → เตือนให้ไปติ๊กเอง พร้อมค่าที่ตั้งใจไว้
            const gf = j.gift as { manual?: boolean; want?: { status: string; categories: string[] } } | null | undefined;
            const gfText = gf?.manual && gf.want ? ` · ของขวัญ: ไปติ๊กเองใน LINE (${gf.want.status === "gift_only" ? "เฉพาะของขวัญ" : "เปิด"}${gf.want.categories.length ? ` · ${gf.want.categories.join(", ")}` : ""})` : "";
            const dp = j.display as { ok: boolean; status: "onsale" | "hide" } | null | undefined;
            const dpText = dp ? (dp.ok ? (dp.status === "onsale" ? " · เปิดขายแล้ว" : " · ปิดขายไว้") : " · ตั้งเปิด/ปิดขายไม่สำเร็จ") : "";
            if (j.draft) { res.push({ parent_id: id, platform: pf.name_th, ok: true, text: `สร้างฉบับร่างบนร้านแล้ว${j.product_id ? ` (#${j.product_id})` : ""} · ยังไม่ขึ้นขาย — ตรวจ/กรอกช่องที่เหลือ/ใส่สต๊อก แล้วกดเผยแพร่ในหลังร้าน${Array.isArray(j.warnings) && j.warnings.length ? ` · ${(j.warnings as string[]).slice(0, 2).join(" · ")}` : ""}` }); }
            else res.push({ parent_id: id, platform: pf.name_th, ok: true, text: `ลงบนร้านแล้ว${j.product_id ? ` (#${j.product_id})` : ""}${dpText}${gfText}${diText}` });
          }
        } catch (e) { res.push({ parent_id: id, platform: pf.name_th, ok: false, text: `ลงไม่สำเร็จ: ${(e as Error).message}` }); }
        setProgress({ done: i + 1, total: toCreate.length, label: "กำลังลงบนร้าน" });
      }
      for (const x of plan) if (x.decision.startsWith("skip")) res.push({ parent_id: x.row.id, platform: x.pf.name_th, ok: x.decision === "skip_listed", text: ADD_DECISION_LABEL[x.decision] });
    } finally {
      setRunning(false);
      setOutcomes(res);
      onDone?.();
    }
  };

  // ---------- แสดงผล ----------
  const nameOf = (id: string) => { const p = list.find((x) => x.id === id); return p ? `${p.code}${p.name ? ` · ${p.name}` : ""}` : id; };
  const fails = outcomes?.filter((o) => !o.ok) ?? [];
  const lineFail = fails.some((o) => o.text.startsWith("ลงไม่สำเร็จ"));
  const title = outcomes ? "ผลการลงสินค้า" : copyMode ? `ลงร้านอื่นจาก ${sourceNames} · ${list.length.toLocaleString()} สินค้า` : `ลงสินค้า · ${list.length.toLocaleString()} สินค้า`;

  const footer = outcomes ? (
    <div className="flex justify-end"><button type="button" onClick={onClose} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700">ปิด</button></div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || running} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:invisible">ย้อนกลับ</button>
      <span className="text-xs text-slate-500">ขั้น {step}/{STEPS.length} · {STEPS[step - 1]}</span>
      {step < STEPS.length ? (
        <button type="button" onClick={() => void goNext()} disabled={checking || preparing || !!copying || (step === 1 && !pfs)} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">{step === 2 ? "ถัดไป: ยืนยัน" : "ถัดไป"}</button>
      ) : running ? (
        <button type="button" onClick={() => { stopRef.current = true; }} className="h-9 px-4 text-sm rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50">หยุด</button>
      ) : (
        <button type="button" onClick={() => void run()} disabled={!canEdit || summary.publish + summary.prepare === 0} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
          {summary.publish > 0 ? `ลงสินค้า (${summary.publish.toLocaleString()} ลงจริง)` : `บันทึกร่าง (${summary.prepare.toLocaleString()})`}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ERPModal open={open} onClose={() => { if (!running) onClose(); }} title={title} size="lg" footer={footer}
        closeOnBackdrop={false} hasUnsavedChanges={running} storageKey="add-to-platform-wizard"
        description={parents.length > ADD_MAX_ITEMS ? `เลือกมา ${parents.length.toLocaleString()} ตัว — ลงได้ครั้งละ ${ADD_MAX_ITEMS} ตัว (ใช้ ${ADD_MAX_ITEMS} ตัวแรก)` : undefined}>
        {!outcomes && (
          <ol className="flex items-center gap-1.5 mb-3 text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className={`inline-flex items-center gap-1.5 ${i + 1 === step ? "text-violet-700 font-medium" : i + 1 < step ? "text-emerald-700" : "text-slate-400"}`}>
                <span className={`h-5 w-5 rounded-full border inline-flex items-center justify-center ${i + 1 === step ? "border-violet-400 bg-violet-50" : i + 1 < step ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>{i + 1 < step ? <Icon name="done" /> : i + 1}</span>
                {s}{i < STEPS.length - 1 && <span className="w-4 h-px bg-slate-200 ml-1" />}
              </li>
            ))}
          </ol>
        )}

        {outcomes ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-emerald-700">สำเร็จ {(outcomes.length - fails.length).toLocaleString()}</span>
              {fails.length > 0 && <span className="text-rose-700">ไม่สำเร็จ {fails.length.toLocaleString()}</span>}
            </div>
            {lineFail && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">ตัวที่ลงไม่สำเร็จ: ถ้าไม่แน่ใจว่าร้านสร้างไปแล้วหรือยัง ให้กด &quot;ดึงสินค้าจากร้าน&quot; ก่อนลองใหม่ — ระบบจะไม่สร้างซ้ำตัวที่จับคู่บนร้านแล้ว</p>
            )}
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-auto">
              {outcomes.map((o, i) => (
                <div key={`${o.parent_id}-${o.platform}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className={o.ok ? "text-emerald-600" : "text-rose-600"}><Icon name={o.ok ? "done" : "warning"} /></span>
                  <div className="min-w-0 flex-1"><div className="truncate">{nameOf(o.parent_id)}</div><div className="text-xs text-slate-500">{o.platform} · {o.text}</div></div>
                </div>
              ))}
            </div>
          </div>
        ) : step === 1 ? (
          !pfs ? <LoadingState label="กำลังโหลดร้าน..." /> : (
            <div className="space-y-3">
              {copyMode && (
                <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                  <Icon name="documents" /> ใช้รายการบน {sourceNames} เป็นต้นแบบ — ขั้นถัดไปจะดึงชื่อ รายละเอียด รูป และน้ำหนักจากร้านต้นทางมาใส่ให้ (ช่องที่ร้านไม่มีใช้ข้อมูลในระบบ) และเลือกเปลี่ยนได้ทีละช่อง · ตอนนี้คัดลอกได้เฉพาะไป LINE SHOPPING · สต๊อกไม่คัดลอก
                </p>
              )}
              {/* ร้านที่ลงจริงได้ (มีตัวเชื่อม) — เด่น */}
              {realPfs.map((p) => {
                const on = picked.has(p.code);
                return (
                  <div key={p.id} className={`rounded-xl border px-3 py-2.5 ${on ? "border-violet-400 bg-violet-50/40" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="flex min-w-[10rem] flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={on} onChange={() => togglePick(p.code)} />
                        <PlatformIcon code={p.code} iconKey={p.icon_key} size={20} /><span className="text-sm font-medium">{p.name_th}</span>
                        <span className="text-[11px] text-emerald-700">{creatorOf(p.code)?.mode === "draft" ? "ลงเป็นฉบับร่างบนร้านได้" : "ลงบนร้านจริงได้"}</span>
                      </label>
                      {canPublish ? (
                        <select value={real.has(p.code) ? "real" : "draft"} disabled={!on}
                          onChange={(e) => setReal((s) => { const n = new Set(s); if (e.target.value === "real") n.add(p.code); else n.delete(p.code); return n; })}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs disabled:opacity-50">
                          <option value="real">{creatorOf(p.code)?.mode === "draft" ? "ลงเป็นฉบับร่างบนร้าน" : "ลงบนร้านจริง"}</option>
                          <option value="draft">บันทึกร่างอย่างเดียว</option>
                        </select>
                      ) : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">บันทึกร่าง · ลงจริงต้องมีสิทธิ์ลงขาย</span>}
                    </div>
                    {creatorOf(p.code)?.note && <p className="mt-1 pl-6 text-[11px] text-sky-700">{creatorOf(p.code)!.note}</p>}
                    {on && realOn(p) && <p className="mt-1 pl-6 text-[11px] text-slate-500">ขั้นถัดไปจะเห็นทุกอย่างที่จะส่งขึ้นร้าน (รูป ชื่อ หมวด รายละเอียด ราคา สต๊อก) ว่ามาจากไหน และแก้ได้ก่อนลง</p>}
                  </div>
                );
              })}

              {/* ร้านที่ดูก่อนส่งได้ แต่ยังไม่เปิดลงจริง (เช่น Lazada ช่วงแคมเปญ) — เด่น + บอกเหตุผล · ลงรอบนี้ = บันทึกร่าง */}
              {soonPfs.map((p) => {
                const on = picked.has(p.code);
                return (
                  <div key={p.id} className={`rounded-xl border px-3 py-2.5 ${on ? "border-violet-400 bg-violet-50/40" : "border-slate-200"}`}>
                    <label className="flex cursor-pointer flex-wrap items-center gap-2">
                      <input type="checkbox" checked={on} onChange={() => togglePick(p.code)} />
                      <PlatformIcon code={p.code} iconKey={p.icon_key} size={20} /><span className="text-sm font-medium">{p.name_th}</span>
                      <span className="text-[11px] text-sky-700">ดูก่อนส่งได้ · บันทึกร่าง</span>
                    </label>
                    <p className="mt-1 pl-6 text-[11px] text-slate-500">{creatorOf(p.code)?.notLiveReason}</p>
                  </div>
                );
              })}

              {/* ร้านอื่น (ยังลงจริงไม่ได้) — พับไว้ */}
              {draftPfs.length > 0 && (
                <div className="rounded-xl border border-dashed border-slate-300">
                  <button type="button" onClick={() => setOthersOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-600">
                    <Icon name="store" />ร้านอื่น {draftPfs.length.toLocaleString()} ร้าน
                    <span className="text-xs text-slate-400">· บันทึกร่างไว้ก่อน (ยังลงจริงไม่ได้)</span>
                    <span className="ml-auto text-xs text-violet-700">{pickedDraftN > 0 ? `เลือก ${pickedDraftN} · ` : ""}{othersOpen ? "ซ่อน" : "แสดง"}</span>
                  </button>
                  {othersOpen && (
                    <div className="space-y-2 border-t border-slate-100 px-3 py-2.5">
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {draftPfs.map((p) => (
                          <label key={p.id} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={picked.has(p.code)} onChange={() => togglePick(p.code)} />
                            <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />{p.name_th}
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-slate-500">ราคาในร่าง</span>
                        <select value={mode} onChange={(e) => setMode(e.target.value as "same" | "pct")} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                          <option value="same">ใช้ราคาขายในระบบ</option>
                          <option value="pct">บวกเพิ่ม % (ปัดขึ้น)</option>
                        </select>
                        {mode === "pct" && <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))} className="h-8 w-16 rounded-md border border-slate-200 px-2 text-sm" aria-label="บวกเพิ่มกี่เปอร์เซ็นต์" />}
                        <span className="ml-2 text-slate-500">ร่างเดิม</span>
                        <select value={overwrite ? "1" : "0"} onChange={(e) => setOverwrite(e.target.value === "1")} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm">
                          <option value="0">เติมเฉพาะช่องที่ว่าง</option>
                          <option value="1">เขียนทับด้วยข้อมูลในระบบ</option>
                        </select>
                      </div>
                      <p className="text-[11px] text-slate-400">ร่าง = เตรียมข้อมูลไว้ในระบบ ยังไม่ขึ้นร้าน · ลงจริงได้เมื่อต่อตัวเชื่อมของร้านนั้นแล้ว</p>
                    </div>
                  )}
                </div>
              )}
              {!canEdit && <p className="text-xs text-rose-700">คุณไม่มีสิทธิ์บันทึกร่าง/ลงสินค้า (ดูได้อย่างเดียว)</p>}
            </div>
          )
        ) : step === 2 ? (
          checking && Object.keys(rows).length === 0 ? <LoadingState label="กำลังตรวจความครบ..." /> : checkErr ? (
            <div className="space-y-2 text-sm text-rose-700"><p>{checkErr}</p><button type="button" onClick={() => void check()} className="h-8 rounded-lg border border-slate-200 px-3 text-sm">ลองใหม่</button></div>
          ) : preparing ? <LoadingState label="กำลังเตรียมข้อมูลที่จะส่งขึ้นร้าน..." /> : copying ? (
            <LoadingState label={`กำลังดึงข้อมูลจาก ${sourceNames} ${copying.done.toLocaleString()}/${copying.total.toLocaleString()}...`} />
          ) : (
            <div className="space-y-4">
              {activePf && (
                <div className="space-y-2">
                  {previewPfs.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2" role="tablist" aria-label="ร้านที่จะลง">
                      {previewPfs.map((p) => (
                        <button key={p.id} type="button" role="tab" aria-selected={p === activePf} onClick={() => setTab(p.code)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm ${p === activePf ? "border-violet-400 bg-violet-50 font-medium text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                          <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />{p.name_th}
                          {!realOn(p) && <span className="text-[10px] text-sky-700">ร่าง</span>}
                        </button>
                      ))}
                    </div>
                  ) : <div className="flex items-center gap-1.5 text-sm font-medium"><PlatformIcon code={activePf.code} iconKey={activePf.icon_key} size={16} />{activePf.name_th} — สิ่งที่จะส่งขึ้นร้าน</div>}
                  {lineRows.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {lineRows.map((r) => {
                        const shop = isOnShop(r); const sk = skipped.has(r.id);
                        const miss = pvState[`${activePf.code}:${r.id}`] ?? (r.ready_now ? 0 : 1);
                        return (
                          <button key={r.id} type="button" onClick={() => setFocus(r.id)}
                            className={`max-w-[12rem] shrink-0 rounded-lg border px-2 py-1 text-left text-xs ${focus === r.id ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:bg-slate-50"} ${shop || sk ? "opacity-60" : ""}`}>
                            <div className="flex items-center gap-1">
                              <span className={shop || sk ? "text-slate-400" : miss ? "text-rose-600" : "text-emerald-600"}><Icon name={shop ? "store" : sk ? "cancel" : miss ? "warning" : "done"} /></span>
                              <span className="truncate font-mono">{r.code}</span>
                            </div>
                            <div className="truncate text-slate-500">{shop ? "มีบนร้านแล้ว" : sk ? "ข้ามตัวนี้" : miss ? `ขาด ${miss} อย่าง` : "พร้อมลง"}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {focusRow && (isOnShop(focusRow) ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{focusRow.name || focusRow.code} มีบนร้านแล้ว — ไม่ลงซ้ำ</p>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 text-sm"><span className="font-medium">{focusRow.name || focusRow.code}</span> <span className="font-mono text-[11px] text-slate-400">{focusRow.code}</span></div>
                        <div className="flex gap-1">
                          {canTask && <button type="button" onClick={() => setTaskFor([{ id: focusRow.id, code: focusRow.code, name: focusRow.name || focusRow.code }])} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50"><Icon name="add" />สร้างงานให้ทีมเติม</button>}
                          <button type="button" onClick={() => toggleSkip(focusRow.id)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">{skipped.has(focusRow.id) ? "เอากลับมา" : "ข้ามตัวนี้"}</button>
                        </div>
                      </div>
                      {skipped.has(focusRow.id)
                        ? <p className="py-3 text-center text-xs text-slate-500">ข้ามตัวนี้ — จะไม่ลงร้าน</p>
                        : activePf.code === "lazada" ? (
                          <LazadaCreatePreviewEditor key={`laz:${focusRow.id}:${pvNonce}`} parentId={focusRow.id} canEdit={canEdit} onLoaded={onLazLoaded} />
                        ) : activePf.code === "tiktok" ? (
                          <TiktokCreatePreviewEditor key={`tts:${focusRow.id}:${pvNonce}`} parentId={focusRow.id} canEdit={canEdit} onLoaded={onTtLoaded} />
                        ) : (
                          <>
                            {/* ลงร้านอื่น: ตารางจับคู่ช่อง (ร้านต้นทาง / ข้อมูลในระบบ) — ใช้แล้วหน้าดูก่อนส่งด้านล่างโหลดใหม่ */}
                            {sources?.[focusRow.id] && (
                              <>
                                {copyErr[focusRow.id] && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"><Icon name="warning" /> คัดลอกจากร้านต้นทางไม่สำเร็จ: {copyErr[focusRow.id]} — ด้านล่างเป็นข้อมูลในระบบ</p>}
                                <CopyMappingTable key={`copy-${focusRow.id}`} listingId={sources[focusRow.id].listing_id} canEdit={canEdit} canEditPrice={canEditPrice}
                                  onApplied={() => { copiedRef.current.add(focusRow.id); setCopyErr((m) => { const n = { ...m }; delete n[focusRow.id]; return n; }); setPvNonce((n) => n + 1); }} />
                              </>
                            )}
                            <LineCreatePreviewEditor key={`${focusRow.id}:${pvNonce}`} parentId={focusRow.id} canEdit={canEdit} canEditPrice={canEditPrice} onLoaded={onPvLoaded} />
                          </>
                        )}
                    </div>
                  ))}
                </div>
              )}

              {othersPfs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">{previewPfs.length ? "ร้านอื่น — บันทึกร่างไว้ก่อน" : "ความครบของข้อมูล"}</div>
                  {copyMode && othersPfs.some((p) => p.code === "line_shopping") && (
                    <p className="text-xs text-violet-700">คัดลอกข้อมูลจาก {sourceNames} ลงร่าง LINE แล้ว {copiedRef.current.size.toLocaleString()} ตัว{Object.keys(copyErr).length ? ` · ไม่สำเร็จ ${Object.keys(copyErr).length.toLocaleString()} ตัว (${Object.values(copyErr)[0]})` : ""}</p>
                  )}
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {othersPfs.map((p) => {
                      const rs = rows[p.code] ?? [];
                      const shop = rs.filter(isOnShop).length;
                      const ok = rs.filter((r) => !isOnShop(r) && r.ready_now).length;
                      return (
                        <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                          <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} /><span>{p.name_th}</span>
                          <span className="text-xs text-emerald-700">พร้อม {ok.toLocaleString()}</span>
                          {rs.length - ok - shop > 0 && <span className="text-xs text-rose-700">ขาดข้อมูล {(rs.length - ok - shop).toLocaleString()}</span>}
                          {shop > 0 && <span className="text-xs text-slate-500">มีบนร้านแล้ว {shop.toLocaleString()} (ข้ามให้)</span>}
                        </div>
                      );
                    })}
                  </div>
                  {problemParents.length > 0 && (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">ตัวที่ข้อมูลยังไม่ครบ — แก้เลย หรือส่งงานให้ทีมเติม แล้วกด &quot;ตรวจใหม่&quot;</p>
                        <div className="flex gap-2">
                          {canTask && <button type="button" onClick={() => setTaskFor(problemParents.map((x) => ({ id: x.row.id, code: x.row.code, name: x.row.name || x.row.code })))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50"><Icon name="add" />สร้างงานเติมทั้งหมด ({problemParents.length})</button>}
                          <button type="button" onClick={() => void check()} disabled={checking} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" />ตรวจใหม่</button>
                        </div>
                      </div>
                      <div className="max-h-[40vh] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
                        {problemParents.map(({ row, pfs: ps }) => {
                          const sk = skipped.has(row.id);
                          return (
                            <div key={row.id} className={`flex flex-wrap items-start gap-2 px-3 py-2 text-sm ${sk ? "opacity-50" : ""}`}>
                              <span className="mt-0.5 text-rose-600"><Icon name="warning" /></span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{row.name || row.code} <span className="font-mono text-[11px] text-slate-400">{row.code}</span></div>
                                {ps.map(({ pf, missing }) => <div key={pf.code} className="text-xs text-rose-700">{pf.name_th}: ขาด {missing.join(" · ")}</div>)}
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {canEdit && <button type="button" onClick={() => setFixFor({ parentId: row.id, platformId: ps[0].pf.id })} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50"><Icon name="edit" />แก้เลย</button>}
                                {canTask && <button type="button" onClick={() => setTaskFor([{ id: row.id, code: row.code, name: row.name || row.code }])} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50"><Icon name="add" />สร้างงานเติม</button>}
                                <button type="button" onClick={() => toggleSkip(row.id)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">{sk ? "เอากลับมา" : "ข้ามตัวนี้"}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3 text-sm">
            {running ? (
              <div className="space-y-2 py-4">
                <div className="text-slate-600">{progress.label} {progress.done.toLocaleString()}/{progress.total.toLocaleString()}</div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
                <p className="text-xs text-slate-400">ห้ามปิดหน้าระหว่างลง · กด &quot;หยุด&quot; ได้ (ตัวที่ยังไม่ลงจะบันทึกร่างไว้)</p>
              </div>
            ) : (
              <>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {pickedPfs.map((p) => {
                    const mine = plan.filter((x) => x.pf.code === p.code);
                    const s = summarizePlan(mine.map((x) => x.decision));
                    return (
                      <div key={p.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1.5 font-medium"><PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />{p.name_th}</span>
                        {s.publish > 0 && <span className="text-emerald-700">ลงบนร้านจริง {s.publish.toLocaleString()}</span>}
                        {s.prepare > 0 && <span className="text-sky-700">บันทึกร่าง {s.prepare.toLocaleString()}</span>}
                        {s.prepare > 0 && creatorOf(p.code) && !creatorOf(p.code)!.live && <span className="text-[11px] text-slate-400">· ลงจริงเปิดเมื่อ {p.name_th} ให้สร้างสินค้าอีกครั้ง</span>}
                        {s.skip_listed > 0 && <span className="text-slate-500">มีบนร้านแล้ว {s.skip_listed.toLocaleString()}</span>}
                        {s.skip_missing > 0 && <span className="text-rose-700">ข้าม (ไม่ครบ) {s.skip_missing.toLocaleString()}</span>}
                        {s.skip_user > 0 && <span className="text-slate-500">เลือกไม่ลง {s.skip_user.toLocaleString()}</span>}
                      </div>
                    );
                  })}
                </div>
                {/* LINE: ตัวที่จะลง (ดูแบบหน้าร้าน) + ตัวที่ข้ามพร้อมเหตุผล (กลับไปแก้) + เปิด/ปิดขายหลังลง */}
                {linePf && (() => {
                  const mine = plan.filter((x) => x.pf === linePf);
                  const pub = mine.filter((x) => x.decision === "publish");
                  const miss = mine.filter((x) => x.decision === "skip_missing");
                  return (pub.length > 0 || miss.length > 0) && (
                    <div className="space-y-2 rounded-xl border border-slate-200 px-3 py-2">
                      {pub.length > 0 && (
                        <div className="max-h-56 divide-y divide-slate-100 overflow-auto">
                          {pub.map((x) => (
                            <div key={x.row.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                              <span className="text-emerald-600"><Icon name="done" /></span>
                              <span className="min-w-0 flex-1 truncate">{x.row.name || x.row.code} <span className="font-mono text-[11px] text-slate-400">{x.row.code}</span></span>
                              <button type="button" onClick={() => setPreviewFor(x.row.id)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50"><Icon name="mobile" />ดูแบบหน้าร้าน</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {miss.length > 0 && (
                        <div className="divide-y divide-slate-100 border-t border-slate-100">
                          {miss.map((x) => (
                            <div key={x.row.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                              <span className="text-rose-600"><Icon name="warning" /></span>
                              <span className="min-w-0 flex-1">{x.row.name || x.row.code} <span className="text-xs text-rose-700">· ข้าม — ขาด: {missingList(x.row.missing).join(" · ") || "ข้อมูลไม่ครบ"}</span></span>
                              <button type="button" onClick={() => { setFocus(x.row.id); setStep(2); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปแก้</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {pub.length > 0 && (
                        <div className="border-t border-slate-100 pt-2">
                          <div className="mb-1 text-xs text-slate-500">หลังลงร้านเสร็จ</div>
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="เปิดหรือปิดขายหลังลง">
                            {([["hide", "ปิดไว้ก่อน (ตรวจบนร้านแล้วค่อยเปิด)"], ["onsale", "เปิดขายทันที"]] as const).map(([v, l]) => (
                              <button key={v} type="button" role="radio" aria-checked={afterDisplay === v} onClick={() => setAfterDisplay(v)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${afterDisplay === v ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                                <span className={`h-3 w-3 rounded-full border ${afterDisplay === v ? "border-[4px] border-violet-600" : "border-slate-300"}`} />{l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <p className="text-xs text-slate-500">ตัวที่มีบนร้านแล้ว/กำลังลงอยู่ ระบบข้ามให้เอง · ทุกตัวบันทึกประวัติว่าใครลงอะไร{summary.publish > 0 ? " · ลงจริงทีละตัว (ร้านใหญ่อาจใช้เวลาหลายนาที)" : ""}</p>
                {needTyped && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-rose-700">ลงจริง {summary.publish.toLocaleString()} ตัว — พิมพ์ &quot;{ADD_CONFIRM_WORD}&quot; เพื่อเริ่ม</span>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-8 w-32 border border-slate-200 rounded-md px-2 text-sm" aria-label="พิมพ์คำยืนยัน" />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ERPModal>

      {previewFor && (
        <ERPModal open onClose={() => setPreviewFor(null)} title="ดูแบบหน้าร้าน LINE (จำลอง)" size="sm">
          <LineStorefrontPreview parentId={previewFor} />
        </ERPModal>
      )}
      {fixFor && (
        <ProductPlatformManager parentSkuId={fixFor.parentId} initialPlatformId={fixFor.platformId} canEdit={canEdit} canPublish={false}
          onClose={() => { setFixFor(null); void check(); }} />
      )}
      {taskFor && (
        <CreateTaskModal open onClose={() => setTaskFor(null)} pushToast={(type, m) => toast.show(m, type)}
          onCreated={(r) => { setTaskFor(null); toast.action(`สร้างงาน ${r.task_no} แล้ว`, "เปิดงาน", () => window.open(`/tasks?task=${r.id}`, "_blank")); }}
          presetProducts={{ brandId: brandId || null, parents: taskFor, platforms: pickedPfs.map((p) => p.code) }} />
      )}
    </>
  );
}
