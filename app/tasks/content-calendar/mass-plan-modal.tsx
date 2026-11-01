"use client";
/**
 * วางแผนแบบ Mass — ป๊อปในปฏิทินคอนเทนต์ (ปุ่ม "วางแผนแบบ Mass" ข้าง "+ สร้างคอนเทนต์")
 *   1) ตั้งโจทย์: แบรนด์ · ช่วงวัน · แพลตฟอร์ม + ความถี่ต่อแพลตฟอร์ม (ครั้ง/สัปดาห์ หรือ /เดือน · เริ่มที่ไม่ติ๊ก) · แนว · สินค้า/แคมเปญ
 *      การ์ดรู้จักแบรนด์ (ของกลาง ../content/brand-profile-modal) + เทรนด์: ให้ AI ข้างนอกค้นเว็บเอง (ติ๊ก) และ/หรือ เทรนด์จากบอร์ด 🔥
 *      จำชุดความถี่เป็นค่าประจำแบรนด์ได้ = เป้ารายเดือน "ทุกประเภท" (ตารางเดียวกับ 🎯 เป้าเดือนในแท็บวางแผน)
 *   2) ร่าง 2 ทาง: ก๊อป prompt ไปถาม AI เอง (ฟรี) แล้ววางคำตอบ/อัปไฟล์  หรือ  ให้ AI ในระบบร่างเลย (มีค่าใช้จ่ายเล็กน้อย)
 *   3) ตรวจ (ใช้ร่วมกันทั้งสองทาง) → ลงปฏิทินเป็นร่าง · ย้อนทั้งชุดได้ทันทีหลังลง
 * ตัวคิดทั้งหมดอยู่ที่ lib/marketing/mass-plan · บันทึกผ่าน /api/marketing/content-plan/mass · ไม่ทับคอนเทนต์เดิมเด็ดขาด
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { PlatformIcon } from "@/components/platform-icon";
import { StepInput } from "@/components/step-input";
import { copyText } from "@/components/copy-button";
import { usePushToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { todayBangkok } from "@/lib/date";
import { parseImportFile } from "@/lib/import";
import { dateKeyOf } from "@/lib/marketing/content-plan";
import {
  addDaysKey, briefFromCaptions, buildMassPlanPrompt, checkPost, countForRange, daysInRange, freqFromMonthly, freqHint, groupMassPlan, matchPlatform,
  freqLabel, monthRange, monthlyFromFreq, normTime, normalizeHashtagText, parseMassPlanText, platformRule, postLevel, productionRange, rowsFromGrid, specialDaysBetween,
  activeTrends, massPostBrief, thaiDateLabel, trendLabel, weekdayOf, FREQ_MAX, MASS_AI_MAX_ROWS, MASS_MAX_POSTS,
  type TrendRowLike,
  type MassFreq, type MassFreqUnit, type MassIssue, type MassPlanBrief, type MassPlatform, type MassPost, type MassRawRow,
} from "@/lib/marketing/mass-plan";
import {
  aiMassPlan, bulkDeleteContent, defaultHashtags, getBrandMonthlyTargets, getBrandProfile, getCaptionConfig, getRecommendedTimes, massImportContent, resolvePrompt,
  saveBrandMonthlyTargets,
  type BrandOption, type CaptionConfig, type ContentItem, type MassImportResult, type PlatformSettings, type RecommendedTimes,
} from "../data";
import { getBrandPlatforms, type BrandFormatMap, type BrandPlatformMap } from "../content/brand-platforms-modal";
import { BrandProfileModal } from "../content/brand-profile-modal";
import { brandProfileFilled, brandProfileLines, type BrandProfile } from "@/lib/marketing/brand-profile";
import { platformMeta, type PlatformOpt } from "../use-options";

type Step = "setup" | "draft" | "review" | "done";
type Pillar = { id: string; name: string; is_active?: boolean };

const WD_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const LEVEL_CLS: Record<"error" | "warn" | "info" | "ok", string> = {
  error: "text-red-600", warn: "text-amber-600", info: "text-slate-400", ok: "text-emerald-600",
};
const LEVEL_ICON: Record<"error" | "warn" | "ok", string> = { error: "cancel", warn: "warning", ok: "done" };
const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-violet-400 focus:outline-none";
const chipCls = (on: boolean) => `inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border transition ${on ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`;

export function MassPlanModal({ open, onClose, brands, platforms, pset, items, defaultBrandId, defaultMonth, onCreated }: {
  open: boolean;
  onClose: () => void;
  brands: BrandOption[];
  /** แพลตฟอร์มที่เปิดใช้ (useCreativeOptions().platforms) */
  platforms: PlatformOpt[];
  pset: PlatformSettings | undefined;
  /** คอนเทนต์ทั้งหมดที่ปฏิทินโหลดไว้ — ใช้เตือนวันชน (ไม่ต้องโหลดซ้ำ) */
  items: ContentItem[];
  defaultBrandId: string | null;
  /** เดือนที่ปฏิทินเปิดอยู่ "YYYY-MM" */
  defaultMonth: string;
  /** ลง/ย้อนเสร็จ → ให้ปฏิทินโหลดใหม่ */
  onCreated: () => void;
}) {
  const t = useT();
  const pushToast = usePushToast();
  const { can } = useAuth();
  const canAi = can("ai.caption" as never);
  const canDelete = can("tasks.delete" as never);
  const canRemember = can("marketing.label.manage" as never);   // สิทธิ์เดียวกับแก้ 🎯 เป้าเดือน
  const today = todayBangkok();

  // ── ค่าตั้งต้นที่โหลดครั้งเดียวต่อการเปิด ──
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [bpMap, setBpMap] = useState<BrandPlatformMap>({});
  const [bpFormats, setBpFormats] = useState<BrandFormatMap>({});
  const [capCfg, setCapCfg] = useState<CaptionConfig>({});
  const [recTimes, setRecTimes] = useState<RecommendedTimes>({});
  const [trendRows, setTrendRows] = useState<TrendRowLike[]>([]);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      const [pj, bp, cfg, rt, tj] = await Promise.all([
        apiFetch("/api/marketing/sku-labels?kind=pillar").then((r) => r.json()).catch(() => ({})),
        getBrandPlatforms(),
        getCaptionConfig().catch(() => ({} as CaptionConfig)),
        getRecommendedTimes().catch(() => ({} as RecommendedTimes)),
        apiFetch("/api/creative-trends").then((r) => r.json()).catch(() => ({})),
      ]);
      setTrendRows(((tj as { data?: TrendRowLike[] }).data ?? []));
      const ps = ((pj as { data?: Pillar[] }).data ?? []).filter((p) => p.is_active !== false);
      setPillars(ps);
      setSelPillars(new Set(ps.map((p) => p.name)));
      setBpMap(bp.map); setBpFormats(bp.formats); setCapCfg(cfg); setRecTimes(rt);
    })();
  }, [open]);

  // ── ขั้น 1: ตั้งโจทย์ ──
  // ช่วงตั้งต้น = เดือนที่ปฏิทินเปิดอยู่ (เดือนที่ผ่านไปแล้ว → เดือนนี้) · ตัดวันที่ผ่านแล้วออก
  const initRange = () => {
    const r = monthRange(defaultMonth).end < today ? monthRange(today.slice(0, 7)) : monthRange(defaultMonth);
    return { start: r.start < today ? today : r.start, end: r.end };
  };
  const [step, setStep] = useState<Step>("setup");
  const [brandId, setBrandId] = useState<string>(defaultBrandId ?? brands[0]?.id ?? "");
  const [start, setStart] = useState(() => initRange().start);
  const [end, setEnd] = useState(() => initRange().end);
  // แพลตฟอร์มเริ่มที่ "ไม่ติ๊กเลย" (เจ้าของขอ 2026-11-01) — กดเลือกทีละอัน หรือกดปุ่มใช้ค่าที่จำไว้ของแบรนด์
  const [selPlats, setSelPlats] = useState<Set<string>>(new Set());
  const [freq, setFreq] = useState<Record<string, MassFreq>>({});
  const [share, setShare] = useState(true);
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState<Record<string, number>>({});   // เป้ารายเดือนที่จำไว้ของแบรนด์ { platform: ครั้ง/เดือน }
  // การ์ดรู้จักแบรนด์ + สินค้าเด่นตอนนี้ (ฝั่ง AI ในระบบ เซิร์ฟเวอร์โหลดเอง — ตรงนี้ไว้ใส่ prompt ที่ก๊อปไป + โชว์ว่ากรอกครบไหม)
  const [card, setCard] = useState<{ profile: BrandProfile; highlights: string[] } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [searchTrends, setSearchTrends] = useState(true);
  const [selPillars, setSelPillars] = useState<Set<string>>(new Set());
  const [campaign, setCampaign] = useState("");
  const [extra, setExtra] = useState("");
  const [setupErr, setSetupErr] = useState<string | null>(null);
  useEffect(() => { if (!brandId && brands[0]) setBrandId(defaultBrandId ?? brands[0].id); }, [brands, brandId, defaultBrandId]);

  useEffect(() => {
    if (!open || !brandId) return;
    let alive = true;
    setSaved({});
    getBrandMonthlyTargets(brandId).then((m) => { if (alive) setSaved(m); }).catch(() => {});
    setCard(null);
    getBrandProfile(brandId).then((r) => { if (alive) setCard({ profile: r.profile, highlights: r.highlights }); }).catch(() => {});
    return () => { alive = false; };
  }, [open, brandId]);

  const massPlatforms: MassPlatform[] = useMemo(() => platforms.map((p) => ({
    code: p.value, label: p.label,
    useCaption: pset?.[p.value]?.use_caption !== false, useHashtags: pset?.[p.value]?.use_hashtags !== false, note: pset?.[p.value]?.note ?? null,
  })), [platforms, pset]);
  const chosen = useMemo(() => massPlatforms.filter((p) => selPlats.has(p.code)), [massPlatforms, selPlats]);
  const savedFreq = useMemo(() => Object.fromEntries(Object.entries(saved)
    .filter(([c]) => massPlatforms.some((p) => p.code === c)).map(([c, m]) => [c, freqFromMonthly(m)])) as Record<string, MassFreq>, [saved, massPlatforms]);
  // ปุ่มลัด: ค่าที่จำไว้ (มีความถี่) → ไม่มี = แพลตฟอร์มที่ตั้งไว้ต่อแบรนด์ (⚙️ ตั้งค่าต่อแบรนด์ · ความถี่ตั้งต้น)
  const preset = useMemo((): { saved: boolean; codes: string[] } | null => {
    if (Object.keys(savedFreq).length) return { saved: true, codes: massPlatforms.map((p) => p.code).filter((c) => savedFreq[c]) };
    const mine = bpMap[brandId];
    const codes = mine?.length ? massPlatforms.map((p) => p.code).filter((c) => mine.includes(c)) : [];
    return codes.length ? { saved: false, codes } : null;
  }, [savedFreq, bpMap, brandId, massPlatforms]);
  const freqOf = (code: string): MassFreq => freq[code] ?? savedFreq[code] ?? freqHint(code).def;
  const setPlatFreq = (code: string, patch: Partial<MassFreq>) => setFreq((all) => {
    const cur = all[code] ?? savedFreq[code] ?? freqHint(code).def;
    const unit = patch.unit ?? cur.unit;
    return { ...all, [code]: { unit, n: Math.min(FREQ_MAX[unit], Math.max(1, Math.round(patch.n ?? cur.n))) } };
  });
  const togglePlat = (code: string) => setSelPlats((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const applyPreset = () => {
    if (!preset) return;
    setSelPlats(new Set(preset.codes));
    if (preset.saved) setFreq((all) => ({ ...all, ...savedFreq }));
  };
  const labelOf = (code: string) => massPlatforms.find((p) => p.code === code)?.label ?? code;
  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";
  const recTimesText = useMemo(() => [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => recTimes[String(d)]?.length)
    .map((d) => `${WD_TH[d]} ${recTimes[String(d)].map((x) => x.time).join("/")}`).join(" · "), [recTimes]);
  const rangeOk = !!start && !!end && start <= end;
  const specialDays = useMemo(() => (rangeOk ? specialDaysBetween(start, end) : []), [rangeOk, start, end]);
  const brief: MassPlanBrief = {
    brandName, start, end, freq: Object.fromEntries(chosen.map((p) => [p.code, freqOf(p.code)])), share, platforms: chosen, pillars: pillars.filter((p) => selPillars.has(p.name)).map((p) => p.name),
    campaign, specialDays, recommendedTimes: recTimesText, tone: resolvePrompt(capCfg, brandId || null), extra,
    brandProfile: brandProfileLines(card?.profile, { highlights: card?.highlights }),
    trends: rangeOk ? activeTrends(trendRows, brandId || null, start, end) : [],
    searchTrends,
  };
  const cardFilled = brandProfileFilled(card?.profile);
  const platCount = (code: string) => (rangeOk ? countForRange(freqOf(code), start < today ? today : start, end) : 0);
  const planCounts = chosen.map((p) => platCount(p.code));
  const planTotal = planCounts.reduce((a, b) => a + b, 0);
  const production = productionRange(planCounts, share);

  /** ติ๊ก "จำชุดนี้" → แทนที่เป้ารายเดือนทั่วไปของแบรนด์ (ทำเบื้องหลังตอนกดไปขั้นถัดไป · ไม่ขวางการร่าง) */
  const rememberIfAsked = () => {
    if (!remember || !canRemember || !brandId || !chosen.length) return;
    const keep = Object.fromEntries(Object.entries(saved).filter(([c]) => !massPlatforms.some((p) => p.code === c)));   // แพลตฟอร์มที่ปิดใช้อยู่ ไม่แตะ
    const next: Record<string, number> = { ...keep, ...Object.fromEntries(chosen.map((p) => [p.code, monthlyFromFreq(freqOf(p.code))])) };
    const same = Object.keys(next).length === Object.keys(saved).length && Object.entries(next).every(([c, m]) => saved[c] === m);
    if (same) return;
    saveBrandMonthlyTargets(brandId, next)
      .then(() => { setSaved(next); pushToast("success", t(`จำค่าประจำของ ${brandName} แล้ว`, `Saved as ${brandName} defaults`)); })
      .catch((e) => pushToast("error", t("จำค่าประจำแบรนด์ไม่สำเร็จ: ", "Could not save brand defaults: ") + (e as Error).message));
  };

  const validateSetup = (): boolean => {
    if (!brandId) { setSetupErr(t("เลือกแบรนด์ก่อน", "Pick a brand first")); return false; }
    if (!start || !end || end < start) { setSetupErr(t("ช่วงวันที่ไม่ถูกต้อง", "Invalid date range")); return false; }
    if (end < today) { setSetupErr(t("ช่วงวันที่ผ่านไปแล้วทั้งช่วง", "The whole range is in the past")); return false; }
    if (daysInRange(start, end) > 62) { setSetupErr(t("ช่วงยาวเกินไป — วางได้ครั้งละไม่เกิน 62 วัน", "Range too long — max 62 days")); return false; }
    if (!chosen.length) { setSetupErr(t("เลือกแพลตฟอร์มอย่างน้อย 1 อัน (กดชื่อแพลตฟอร์ม หรือปุ่มใช้ค่าของแบรนด์)", "Pick at least one platform")); return false; }
    setSetupErr(null);
    return true;
  };

  // ── ขั้น 2: ร่าง ──
  const [paste, setPaste] = useState("");
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ model: string; warnings: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showEach, setShowEach] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = async (key: string, text: string) => {
    if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); }
    else pushToast("error", t("คัดลอกไม่สำเร็จ — ลากคลุมข้อความแล้วกด Ctrl+C แทน", "Copy failed — select the text and press Ctrl+C"));
  };

  // ── ขั้น 3: ตรวจ ──
  const [posts, setPosts] = useState<MassPost[]>([]);
  const [rowErrors, setRowErrors] = useState<MassIssue[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<MassImportResult | null>(null);
  const [undoAsk, setUndoAsk] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);

  const existing = useMemo(() => items
    .filter((c) => c.brand_id === brandId && !c.is_template && c.status !== "cancelled" && c.scheduled_at)
    .map((c) => ({ date: dateKeyOf(c.scheduled_at), title: c.title, platforms: c.platforms ?? [] })), [items, brandId]);
  const checkCtx = useMemo(() => ({ platforms: massPlatforms, todayKey: today, existing }), [massPlatforms, today, existing]);

  /** แถวดิบ → เติมแฮชแท็กเริ่มต้นของแบรนด์/แพลตฟอร์ม (แบบเดียวกับสร้างคอนเทนต์ใหม่) → รวมเป็นโพสต์ + ตรวจ → หน้าตรวจ */
  const review = (rows: MassRawRow[]) => {
    const withTags = rows.map((r) => {
      const code = matchPlatform(r.platform, massPlatforms);
      const plat = massPlatforms.find((p) => p.code === code);
      if (!code || plat?.useHashtags === false || !(r.caption.trim() || r.hashtags.trim())) return r;
      return { ...r, hashtags: normalizeHashtagText(r.hashtags, defaultHashtags(capCfg, brandId || null, code)) };
    });
    const g = groupMassPlan(withTags, {
      ...checkCtx, pillars: pillars.map((p) => ({ id: p.id, name: p.name })),
      defaultTime: (d) => recTimes[String(weekdayOf(d))]?.[0]?.time ?? null,
    });
    if (!g.posts.length) { setDraftErr(g.errors[0]?.text ?? t("ไม่พบแถวที่อ่านได้ — ตรวจว่าวางทั้งตาราง (มีวันที่ แพลตฟอร์ม หัวข้อ)", "No readable rows — paste the whole table")); return false; }
    setPosts(g.posts); setRowErrors(g.errors); setExpanded(new Set()); setDraftErr(null); setStep("review");
    return true;
  };
  const checkPaste = () => {
    if (!paste.trim()) { setDraftErr(t("ยังไม่มีข้อมูล — วางคำตอบจาก AI หรืออัปไฟล์ก่อน", "Paste the AI answer or upload a file first")); return; }
    setAiNote(null);
    review(parseMassPlanText(paste));
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const pf = await parseImportFile(f);
      setAiNote(null);
      review(rowsFromGrid([pf.headers, ...pf.rows.map((r) => pf.headers.map((h) => r[h] ?? ""))]));
    } catch (e) { setDraftErr(t("อ่านไฟล์ไม่สำเร็จ: ", "Could not read file: ") + (e as Error).message); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const runAi = async () => {
    if (!validateSetup()) return;
    if (planTotal > MASS_AI_MAX_ROWS) {
      setSetupErr(t(`รวม ≈ ${planTotal} โพสต์ เกินที่ AI ในระบบร่างได้ต่อครั้ง (${MASS_AI_MAX_ROWS}) — ลดความถี่หรือช่วงวัน หรือใช้ปุ่ม "ขอ prompt" แทน`, `≈ ${planTotal} posts is over the AI limit (${MASS_AI_MAX_ROWS}) — lower frequency/range or use the prompt button`));
      return;
    }
    rememberIfAsked();
    setAiBusy(true); setSetupErr(null);
    try {
      const r = await aiMassPlan({
        brand_id: brandId, start: start < today ? today : start, end, freq: brief.freq, share, platforms: chosen.map((p) => p.code),
        pillars: brief.pillars, campaign, extra, tone: brief.tone, recommended_times: recTimesText,
      });
      setAiNote({ model: r.model, warnings: r.warnings });
      if (!review(r.rows)) setStep("draft");
    } catch (e) { setSetupErr((e as Error).message); }
    finally { setAiBusy(false); }
  };

  const updatePost = (key: string, patch: Partial<MassPost>, recheck = false) => setPosts((list) => list.map((p) => {
    if (p.key !== key) return p;
    const next = { ...p, ...patch };
    return recheck ? checkPost(next, checkCtx) : next;
  }));
  const updateCaption = (key: string, platform: string, patch: { caption?: string; hashtags?: string }) =>
    setPosts((list) => list.map((p) => (p.key !== key ? p : { ...p, captions: p.captions.map((c) => (c.platform === platform ? { ...c, ...patch } : c)) })));

  const included = posts.filter((p) => p.include && !p.blocked);
  const selected = useMemo(() => new Set(posts.filter((p) => p.include && !p.blocked).map((p) => p.key)), [posts]);
  const counts = {
    posts: included.length,
    captions: included.reduce((s, p) => s + p.captions.length, 0),
    warn: included.filter((p) => postLevel(p) === "warn").length,
    skip: posts.length - included.length,
  };

  const save = async () => {
    if (!included.length) { pushToast("warning", t("ยังไม่มีโพสต์ที่ติ๊กไว้", "No posts selected")); return; }
    if (included.length > MASS_MAX_POSTS) { pushToast("warning", t(`ลงได้ครั้งละไม่เกิน ${MASS_MAX_POSTS} โพสต์`, `Max ${MASS_MAX_POSTS} posts at once`)); return; }
    setSaving(true);
    try {
      const fmt = bpFormats[brandId] ?? {};
      const r = await massImportContent(brandId, included.map((p) => {
        const plats = p.captions.map((c) => c.platform);
        return {
          date: p.date, time: normTime(p.time) || "10:00", title: p.title.trim(), pillar_id: p.pillarId,
          brief: massPostBrief(p, labelOf),
          platform_formats: Object.fromEntries(Object.entries(fmt).filter(([k]) => plats.includes(k))),
          captions: p.captions.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags })),
        };
      }));
      setResult(r); setStep("done"); onCreated();
      pushToast("success", t(`ลงปฏิทินเป็นร่างแล้ว ${r.created} โพสต์`, `${r.created} draft posts added`));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  const undo = async () => {
    if (!result?.ids.length) return;
    setUndoBusy(true);
    try {
      const r = await bulkDeleteContent(result.ids);
      pushToast("success", t(`ย้อนแล้ว — ยกเลิก ${r.success} โพสต์ที่เพิ่งลง`, `Undone — removed ${r.success} posts`));
      setUndoAsk(false); onCreated(); onClose();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setUndoBusy(false); }
  };

  const dirty = step !== "done" && (posts.length > 0 || paste.trim() !== "");

  // ── ตารางตรวจ (MiniTable กลาง: ค้นหา/เรียง/ติ๊ก) ──
  const columns: MiniColumn<MassPost>[] = [
    {
      key: "date", header: t("วัน/เวลา", "Date/time"), width: "8.5rem", sortValue: (p) => `${p.date}${p.time}`,
      cell: (p) => (
        <div className="space-y-1">
          <input type="date" value={p.date} onChange={(e) => updatePost(p.key, { date: e.target.value }, true)} className="h-7 w-full rounded border border-slate-200 px-1 text-xs" aria-label={t("วันที่", "Date")} />
          <input type="time" value={p.time} onChange={(e) => updatePost(p.key, { time: e.target.value })} className="h-7 w-full rounded border border-slate-200 px-1 text-xs" aria-label={t("เวลา", "Time")} />
        </div>
      ),
    },
    {
      key: "title", header: t("หัวข้อ · แนว", "Title · pillar"), width: "1fr", sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <input value={p.title} onChange={(e) => updatePost(p.key, { title: e.target.value }, true)} className="h-8 w-full rounded border border-slate-200 px-2 text-sm font-medium" aria-label={t("หัวข้อ", "Title")} />
          <div className="mt-1 text-xs text-slate-500 truncate">
            {p.pillarId ? pillars.find((x) => x.id === p.pillarId)?.name : <span className="text-slate-400">{t("ไม่ระบุแนว", "No pillar")}</span>}
            {p.trend && <span className="text-amber-700"> · <Icon name="hot" /> {p.trend}</span>}
            {briefFromCaptions(p.captions, labelOf) && <span className="text-slate-400"> · {briefFromCaptions(p.captions, labelOf)?.replace(/\n/g, " · ")}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "platforms", header: t("ลงที่", "Platforms"), width: "9.5rem", sortValue: (p) => p.captions.length,
      cell: (p) => (
        <div>
          <div className="flex flex-wrap gap-1">
            {p.captions.map((c) => (
              <span key={c.platform} title={labelOf(c.platform)} className={`inline-flex items-center rounded-md border px-1 py-0.5 ${c.caption.trim() || !massPlatforms.find((x) => x.code === c.platform)?.useCaption ? "border-slate-200" : "border-amber-300 bg-amber-50"}`}>
                <PlatformIcon code={c.platform} iconKey={platformMeta(c.platform)?.icon_key ?? null} size={16} />
              </span>
            ))}
          </div>
          {p.captions.length > 0 && (
            <button type="button" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })}
              className="mt-1 text-xs text-violet-600 hover:underline">
              {expanded.has(p.key) ? t("ซ่อนแคปชั่น", "Hide captions") : t(`ดู/แก้แคปชั่น (${p.captions.length})`, `Captions (${p.captions.length})`)}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "check", header: t("ผลตรวจ", "Check"), width: "13rem", sortValue: (p) => ({ error: 0, warn: 1, ok: 2 })[postLevel(p)],
      cell: (p) => {
        const lv = postLevel(p);
        return (
          <div className="text-xs leading-5">
            {lv === "ok" && <div className={LEVEL_CLS.ok}><Icon name={LEVEL_ICON.ok} /> {t("พร้อมลง", "Ready")}</div>}
            {p.issues.map((i, n) => (
              <div key={n} className={LEVEL_CLS[i.level]}>{i.level !== "info" && <Icon name={i.level === "error" ? LEVEL_ICON.error : LEVEL_ICON.warn} />} {i.text}</div>
            ))}
          </div>
        );
      },
    },
  ];

  const renderCaptions = (p: MassPost) => (
    <div className="grid gap-2 bg-slate-50 px-3 py-2 sm:grid-cols-2">
      {p.captions.map((c) => {
        const plat = massPlatforms.find((x) => x.code === c.platform);
        return (
          <div key={c.platform} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <PlatformIcon code={c.platform} iconKey={platformMeta(c.platform)?.icon_key ?? null} size={14} /> {labelOf(c.platform)}
              {plat?.useCaption === false && <span className="font-normal text-slate-400">· {t("ไม่ใช้แคปชั่น", "No caption")}</span>}
            </div>
            <textarea value={c.caption} onChange={(e) => updateCaption(p.key, c.platform, { caption: e.target.value })} rows={3}
              placeholder={plat?.useCaption === false ? t("แพลตฟอร์มนี้ลงแค่รูป", "Image-only platform") : t("ยังไม่มีแคปชั่น", "No caption yet")}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
            {plat?.useHashtags !== false && (
              <input value={c.hashtags} onChange={(e) => updateCaption(p.key, c.platform, { hashtags: e.target.value })} placeholder="#hashtag"
                className="mt-1 h-7 w-full rounded border border-slate-200 px-2 text-xs text-violet-700" />
            )}
            {c.idea && <div className="mt-1 text-[11px] text-slate-500">{t("ไอเดียรูป/คลิป", "Visual idea")}: {c.idea}</div>}
          </div>
        );
      })}
    </div>
  );

  // ปฏิทินย่อของช่วงที่ลง (จุดสี = แพลตฟอร์มที่จะลงใหม่ · จุดเทา = ของเดิม · กรอบเหลือง = มีคำเตือน)
  const miniCal = useMemo(() => {
    if (!posts.length) return null;
    const dates = posts.map((p) => p.date).filter((d) => d >= today).sort();
    if (!dates.length) return null;
    const first = dates[0] < start ? dates[0] : start;
    const last = dates[dates.length - 1] > end ? dates[dates.length - 1] : end;
    const n = Math.min(daysInRange(first, last), 93);
    const lead = weekdayOf(first);
    return { first, n, lead };
  }, [posts, start, end, today]);

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      {step === "setup" && <>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <div className="flex-1" />
        <button onClick={() => { if (validateSetup()) { rememberIfAsked(); setStep("draft"); } }} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
          <Icon name="list" /> {t("ขอ prompt ไปถาม AI เอง (ฟรี)", "Get prompt for your own AI (free)")}
        </button>
        <button onClick={runAi} disabled={aiBusy || !canAi} title={canAi ? undefined : t("ต้องมีสิทธิ์ใช้ AI (ai.caption) — ใช้ปุ่มขอ prompt แทนได้", "Needs AI permission (ai.caption)")}
          className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          <Icon name="ai" /> {aiBusy ? t("AI กำลังวางแผน…", "AI is planning…") : t("ให้ AI ในระบบร่างเลย", "Let AI draft it")}
        </button>
      </>}
      {step === "draft" && <>
        <button onClick={() => setStep("setup")} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"><Icon name="back" /> {t("แก้โจทย์", "Back")}</button>
        <div className="flex-1" />
        <button onClick={checkPaste} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700"><Icon name="done" /> {t("ตรวจข้อมูล", "Check")}</button>
      </>}
      {step === "review" && <>
        <button onClick={() => setStep(aiNote ? "setup" : "draft")} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"><Icon name="back" /> {t("ย้อนกลับ", "Back")}</button>
        <div className="flex-1 text-xs text-slate-500">
          {t(`จะลง ${counts.posts} โพสต์ · การ์ดแคปชั่น ${counts.captions} · มีคำเตือน ${counts.warn} · ข้าม ${counts.skip}`, `${counts.posts} posts · ${counts.captions} captions · ${counts.warn} warnings · ${counts.skip} skipped`)}
        </div>
        <button onClick={save} disabled={saving || !counts.posts} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          <Icon name="calendar" /> {saving ? t("กำลังลง…", "Saving…") : t(`ลงปฏิทินเป็นร่าง ${counts.posts} โพสต์`, `Add ${counts.posts} draft posts`)}
        </button>
      </>}
      {step === "done" && <>
        {canDelete && !!result?.ids.length && (
          <button onClick={() => setUndoAsk(true)} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"><Icon name="back" /> {t("ยกเลิกทั้งชุดนี้", "Undo this batch")}</button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">{t("ไปดูในปฏิทิน", "Back to calendar")}</button>
      </>}
    </div>
  );

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="xl" storageKey="content-mass-plan" hasUnsavedChanges={dirty}
        title={t("วางแผนแบบ Mass", "Mass planning")}
        description={t("ตั้งโจทย์ → ให้ AI ร่างหลายวันหลายแพลตฟอร์ม → ตรวจ → ลงปฏิทินเป็นร่างทีเดียว (ไม่ทับของเดิม)", "Brief → AI drafts many posts → review → add as drafts (never overwrites)")}
        footer={footer}>
        {/* ตัวบอกขั้น */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {([["setup", t("1 ตั้งโจทย์", "1 Brief")], ["draft", t("2 ร่างกับ AI", "2 Draft with AI")], ["review", t("3 ตรวจก่อนลง", "3 Review")], ["done", t("4 ลงแล้ว", "4 Done")]] as [Step, string][]).map(([s, label], i) => (
            <span key={s} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">›</span>}
              <span className={step === s ? "rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700" : "text-slate-400"}>{label}</span>
            </span>
          ))}
        </div>

        {step === "setup" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("แบรนด์", "Brand")}</span>
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("ตั้งแต่วันที่", "From")}</span>
                <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">{t("ถึงวันที่", "To")}</span>
                <input type="date" value={end} min={start || today} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
              </label>
            </div>
            {brandId && (
              <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${cardFilled.done ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <Icon name={cardFilled.done ? "note" : "warning"} />
                <span className="font-medium">{t("การ์ดรู้จักแบรนด์", "Brand card")}</span>
                <span>{card == null ? t("กำลังโหลด…", "Loading…")
                  : cardFilled.done ? t(`กรอกแล้ว ${cardFilled.done}/${cardFilled.total} — AI ใช้ข้อมูลนี้วางแผนและเขียนแคปชั่น`, `${cardFilled.done}/${cardFilled.total} filled — AI uses it`)
                  : t("ยังไม่ได้ทำ — AI จะรู้จักแบรนด์น้อย แผนออกมากลาง ๆ", "Not set — AI knows little about this brand")}</span>
                {!!card?.highlights.length && <span className="text-slate-500">· {t(`สินค้าเด่น ${card.highlights.length} รุ่น`, `${card.highlights.length} highlighted products`)}</span>}
                <button type="button" onClick={() => setCardOpen(true)} className="ml-auto h-7 px-2.5 text-xs text-violet-700 border border-violet-200 bg-white rounded-lg hover:bg-violet-50">{cardFilled.done ? t("เปิดการ์ด", "Open card") : t("ทำการ์ด", "Set up card")}</button>
              </div>
            )}
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{t("แพลตฟอร์มและความถี่ (กดชื่อเพื่อเลือก)", "Platforms and frequency (click a name to pick)")}</span>
                <div className="flex items-center gap-1.5">
                  {preset && (
                    <button type="button" onClick={applyPreset} className="h-7 px-2.5 inline-flex items-center gap-1 text-xs text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">
                      <Icon name="bookmark" /> {preset.saved ? t(`ใช้ค่าที่จำไว้ของแบรนด์ (${preset.codes.length})`, `Use saved brand set (${preset.codes.length})`) : t(`ติ๊กตามแพลตฟอร์มของแบรนด์ (${preset.codes.length})`, `Tick brand platforms (${preset.codes.length})`)}
                    </button>
                  )}
                  {selPlats.size > 0 && (
                    <button type="button" onClick={() => setSelPlats(new Set())} className="h-7 px-2.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ล้าง", "Clear")}</button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {massPlatforms.map((p) => {
                  const on = selPlats.has(p.code);
                  const f = freqOf(p.code);
                  const hint = freqHint(p.code).text;
                  return (
                    <div key={p.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 ${on ? "" : "bg-slate-50/60"}`}>
                      <button type="button" onClick={() => togglePlat(p.code)} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left">
                        <input type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden className="pointer-events-none h-4 w-4 shrink-0 accent-violet-600" />
                        <PlatformIcon code={p.code} iconKey={platformMeta(p.code)?.icon_key ?? null} size={16} />
                        <span className={`text-sm ${on ? "font-medium text-slate-800" : "text-slate-500"}`}>{p.label}</span>
                        {!p.useCaption && <span className="text-[11px] text-slate-400">{t("ลงแค่รูป", "image only")}</span>}
                        {hint && <span className="hidden truncate text-[11px] text-slate-400 sm:inline">· {t("ทั่วไป", "typical")} {hint}</span>}
                      </button>
                      {on && (
                        <div className="flex items-center gap-2">
                          <StepInput value={f.n} onChange={(v) => { if (v != null) setPlatFreq(p.code, { n: v }); }} min={1} max={FREQ_MAX[f.unit]} integer className="h-8 w-24" ariaLabel={t(`จำนวนครั้ง ${p.label}`, `${p.label} count`)} />
                          <select value={f.unit} onChange={(e) => setPlatFreq(p.code, { unit: e.target.value as MassFreqUnit })}
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-violet-400 focus:outline-none">
                            <option value="week">{t("ครั้ง/สัปดาห์", "per week")}</option>
                            <option value="month">{t("ครั้ง/เดือน", "per month")}</option>
                          </select>
                          <span className="w-16 text-right text-xs text-slate-500">≈ {platCount(p.code)} {t("ชิ้น", "posts")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {chosen.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>{t(`เลือก ${chosen.length} แพลตฟอร์ม`, `${chosen.length} platforms`)}</span>
                  <span>{t(`แคปชั่น/โพสต์ทั้งช่วง ≈ ${planTotal}`, `≈ ${planTotal} posts in range`)}</span>
                  <span className="font-medium text-slate-800"><Icon name="camera" /> {t(`ทีมต้องทำรูป/คลิปจริง ≈ ${production.min === production.max ? production.max : `${production.min}–${production.max}`} ชิ้น`, `Team makes ≈ ${production.min === production.max ? production.max : `${production.min}–${production.max}`} visuals`)}</span>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">{t("ยังไม่ได้เลือกแพลตฟอร์ม", "No platform picked yet")}</div>
              )}
              {planTotal > MASS_AI_MAX_ROWS && (
                <div className="mt-1 text-xs text-amber-700"><Icon name="warning" /> {t(`รวมเกิน ${MASS_AI_MAX_ROWS} — ปุ่ม AI ในระบบร่างครั้งเดียวไม่ไหว ลดความถี่/ช่วงวัน หรือใช้ปุ่มขอ prompt (ลงปฏิทินได้ครั้งละไม่เกิน ${MASS_MAX_POSTS} โพสต์)`, `Over ${MASS_AI_MAX_ROWS} — too many for the in-system AI`)}</div>
              )}
              {chosen.length > 1 && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 accent-violet-600" />
                  {t("เรื่องเดียวกันลงหลายแพลตฟอร์มได้ (ประหยัดงานถ่าย)", "Same story can go to several platforms (less shooting)")}
                </label>
              )}
              {canRemember && chosen.length > 0 && (
                <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
                  <span>
                    {t(`จำชุดนี้เป็นค่าประจำของ ${brandName}`, `Remember this set for ${brandName}`)}
                    <span className="block text-[11px] text-slate-400">{t("ครั้งหน้ากดปุ่มเดียวได้ชุดเดิม · ใช้เป็นเป้ารายเดือนในแท็บวางแผนด้วย · แพลตฟอร์มที่ไม่ได้ติ๊กจะออกจากค่าประจำ · บันทึกตอนกดไปขั้นถัดไป", "Also used as monthly targets in the Plan tab · unticked platforms are removed · saved when you continue")}</span>
                  </span>
                </label>
              )}
            </div>
            {pillars.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t("แนวคอนเทนต์ที่ใช้ได้", "Content pillars")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {pillars.map((p) => {
                    const on = selPillars.has(p.name);
                    return (
                      <button key={p.id} type="button" className={chipCls(on)}
                        onClick={() => setSelPillars((s) => { const n = new Set(s); if (n.has(p.name)) n.delete(p.name); else n.add(p.name); return n; })}>
                        {on && <Icon name="done" />} {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">{t("สินค้า / แคมเปญช่วงนี้", "Products / campaign")}</span>
              <textarea value={campaign} onChange={(e) => setCampaign(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                placeholder={t("เช่น กระเป๋าหนังรุ่นใหม่ + โปร 11.11 ลด 11% ทั้งร้าน", "e.g. new leather bag + 11.11 sale 11% off")} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">{t("สั่งเพิ่ม (ไม่บังคับ)", "Extra instructions (optional)")}</span>
              <input value={extra} onChange={(e) => setExtra(e.target.value)} className={inputCls} placeholder={t("เช่น เน้นลูกค้าผู้หญิงวัยทำงาน · ห้ามใช้คำว่าถูกที่สุด", "e.g. target working women")} />
            </label>
            <div className="rounded-lg border border-slate-200 px-3 py-2 space-y-1.5">
              <div className="text-xs font-medium text-slate-600"><Icon name="hot" /> {t("เทรนด์", "Trends")}</div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={searchTrends} onChange={(e) => setSearchTrends(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
                <span>
                  {t("ให้ AI หาเทรนด์ล่าสุดก่อนวางแผน (ค้นเว็บ + แนบลิงก์ที่มา)", "Ask the AI to search current trends first (with sources)")}
                  <span className="block text-[11px] text-slate-400">{t("ใช้กับปุ่มขอ prompt — ChatGPT / Gemini ค้นเว็บให้ · AI ในระบบค้นเว็บเองไม่ได้ ใช้เฉพาะเทรนด์จากบอร์ด", "Prompt button only — ChatGPT/Gemini search the web · the in-system AI can't browse, it uses board trends only")}</span>
                </span>
              </label>
              <div className="text-xs text-slate-600">
                {t("เทรนด์จากบอร์ด (ทีมคัดไว้)", "Board trends")}: {brief.trends?.length
                  ? brief.trends.map(trendLabel).join(" · ")
                  : <span className="text-slate-400">{t("ไม่มีเทรนด์ที่ยังไม่หมดอายุในช่วงนี้", "none active in this range")}</span>}
                {" "}<a href="/tasks/trends" target="_blank" rel="noreferrer" className="text-violet-700 hover:underline">{t("จัดการบอร์ดเทรนด์", "Manage trends")}</a>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <div><Icon name="calendar" /> {t("วันสำคัญที่ใส่ให้อัตโนมัติ", "Key dates included")}: {specialDays.length ? specialDays.map((d) => `${thaiDateLabel(d.date)} ${d.label}`).join(" · ") : t("ไม่มีในช่วงนี้", "none in range")}</div>
              {recTimesText && <div><Icon name="clock" /> {t("เวลาโพสต์ประจำ (ใช้เมื่อ AI ไม่ระบุเวลา)", "Usual posting times")}: {recTimesText}</div>}
              {brief.tone && <div><Icon name="note" /> {t("ใช้แนวทางการเขียนของแบรนด์ที่ตั้งไว้ (พรอมต์แคปชั่น) ด้วย", "Uses the brand's caption prompt as tone")}</div>}
              <div><Icon name="ai" /> {t("ปุ่ม AI ในระบบ: ใช้เวลาประมาณ 30–90 วินาที · ค่าใช้จ่ายราว 1–3 บาทต่อครั้ง ตามจำนวนโพสต์ (ไม่ส่งรูป) · ยังไม่ลงปฏิทินจนกว่าจะกดยืนยันในหน้าตรวจ", "AI in system: ~30–90s · about 1–3 THB per run · nothing is saved until you confirm")}</div>
            </div>
            {setupErr && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{setupErr}</div>}
          </div>
        )}

        {step === "draft" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-slate-800">{t("Prompt รวมทุกแพลตฟอร์ม (แนะนำ — ถามรอบเดียว เรื่องตรงกันข้ามแพลตฟอร์ม)", "Combined prompt (recommended)")}</div>
                <div className="flex-1" />
                <button onClick={() => copy("all", buildMassPlanPrompt(brief))} className="h-8 px-3 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
                  <Icon name={copied === "all" ? "done" : "list"} /> {copied === "all" ? t("คัดลอกแล้ว", "Copied") : t("คัดลอก prompt", "Copy prompt")}
                </button>
              </div>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-600">{buildMassPlanPrompt(brief)}</pre>
              <div className="mt-2 text-xs text-slate-500">{t("ก๊อปไปวางใน ChatGPT / Claude / Gemini → คัดลอกตารางคำตอบทั้งตาราง → วางในช่องด้านล่าง", "Paste into ChatGPT / Claude / Gemini → copy the whole answer table → paste below")}</div>
            </div>

            <div>
              <div className="mb-1.5 text-xs text-slate-500">{t("หรือถามแยกทีละแพลตฟอร์ม (แต่ละที่เขียนต่างกัน)", "Or ask per platform")}</div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {chosen.map((p) => (
                  <div key={p.code} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformIcon code={p.code} iconKey={platformMeta(p.code)?.icon_key ?? null} size={16} />
                      <span className="text-sm font-medium text-slate-700 w-28">{p.label}</span>
                      <span className="flex-1 min-w-[12rem] text-xs text-slate-500">
                        <b className="font-medium text-slate-700">{freqLabel(freqOf(p.code))} ≈ {platCount(p.code)} {t("โพสต์", "posts")}</b> · {platformRule(p)}
                      </span>
                      <button onClick={() => setShowEach((s) => (s === p.code ? null : p.code))} className="h-7 px-2 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">{showEach === p.code ? t("ซ่อน", "Hide") : t("ดู prompt", "View")}</button>
                      <button onClick={() => copy(p.code, buildMassPlanPrompt(brief, [p]))} className="h-7 px-2 inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
                        <Icon name={copied === p.code ? "done" : "list"} /> {copied === p.code ? t("คัดลอกแล้ว", "Copied") : t("คัดลอก", "Copy")}
                      </button>
                    </div>
                    {showEach === p.code && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{buildMassPlanPrompt(brief, [p])}</pre>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{t("วางคำตอบของ AI (ตาราง | ของ ChatGPT, Tab จาก Excel หรือ CSV ได้หมด)", "Paste the AI answer (markdown, Excel or CSV table)")}</span>
                <div className="flex-1" />
                <button onClick={() => fileRef.current?.click()} className="h-7 px-2 inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"><Icon name="upload" /> {t("อัปไฟล์ .xlsx / .csv", "Upload .xlsx / .csv")}</button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              </div>
              <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setDraftErr(null); }} rows={8}
                placeholder={"| วันที่ | เวลา | แพลตฟอร์ม | แนว | หัวข้อ | แคปชั่น | แฮชแท็ก | ไอเดียรูป/คลิป |\n| 3/11/2569 | 19:00 | Facebook | โชว์สินค้า | กระเป๋าใหม่ | ... | #... | ... |"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-violet-400 focus:outline-none" />
              {draftErr && <div className="mt-1 text-sm text-red-600">{draftErr}</div>}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            {aiNote && (
              <div className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
                <Icon name="ai" /> {t(`AI ในระบบร่างให้แล้ว (${aiNote.model}) — ตรวจ/แก้ได้ก่อนลง ยังไม่ได้บันทึก`, `Drafted by AI (${aiNote.model}) — review before saving`)}
                {aiNote.warnings.map((w, i) => <div key={i} className="mt-1 text-amber-700"><Icon name="warning" /> {w}</div>)}
              </div>
            )}
            {rowErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
                {rowErrors.slice(0, 6).map((e, i) => <div key={i}>{e.text}</div>)}
                {rowErrors.length > 6 && <div>{t(`…และอีก ${rowErrors.length - 6} แถว`, `…and ${rowErrors.length - 6} more`)}</div>}
              </div>
            )}
            <MiniTable<MassPost>
              rows={posts} columns={columns} rowKey={(p) => p.key}
              searchText={(p) => `${p.title} ${p.captions.map((c) => `${labelOf(c.platform)} ${c.caption}`).join(" ")}`}
              searchPlaceholder={t("ค้นหาหัวข้อ/แคปชั่น", "Search title/caption")}
              selectable selected={selected}
              onSelectedChange={(next) => setPosts((list) => list.map((p) => (p.blocked ? p : { ...p, include: next.has(p.key) })))}
              expandedKeys={expanded} renderExpanded={renderCaptions}
              countUnit={t("โพสต์", "posts")} dense
              title={<span className="text-sm font-medium">{t("เรื่องเดียวกันหลายแพลตฟอร์ม = รวมเป็น 1 โพสต์ (แคปชั่นแยกตามแพลตฟอร์ม)", "Same topic across platforms = 1 post")}</span>}
            />
            {miniCal && (
              <div>
                <div className="mb-1 text-xs text-slate-500">{t("ภาพรวม: จุดสี = แพลตฟอร์มที่จะลงใหม่ · จุดเทา = ของเดิม · กรอบเหลือง = มีคำเตือน", "Overview: colored = new · gray = existing · yellow = warning")}</div>
                <div className="grid grid-cols-7 gap-1">
                  {WD_TH.map((w) => <div key={w} className="text-center text-[11px] text-slate-400">{w}</div>)}
                  {Array.from({ length: miniCal.lead }).map((_, i) => <div key={`b${i}`} />)}
                  {Array.from({ length: miniCal.n }).map((_, i) => {
                    const d = addDaysKey(miniCal.first, i);
                    const mine = included.filter((p) => p.date === d);
                    const old = existing.filter((e) => e.date === d).length;
                    const warn = mine.some((p) => postLevel(p) === "warn");
                    return (
                      <div key={d} className={`min-h-[2.4rem] rounded-md border px-1 py-0.5 ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200"} ${d < today ? "opacity-40" : ""}`} title={mine.map((p) => p.title).join("\n")}>
                        <div className={`text-[11px] ${mine.length ? "font-medium text-slate-700" : "text-slate-400"}`}>{Number(d.slice(8))}{d.slice(8) === "01" ? ` ${thaiDateLabel(d).split(" ")[1]}` : ""}</div>
                        <div className="flex flex-wrap gap-0.5">
                          {mine.flatMap((p) => p.captions).slice(0, 8).map((c, n) => <span key={n} className="h-1.5 w-1.5 rounded-full" style={{ background: platformMeta(c.platform)?.color || "#7c3aed" }} />)}
                          {Array.from({ length: Math.min(old, 4) }).map((_, n) => <span key={`o${n}`} className="h-1.5 w-1.5 rounded-full bg-slate-300" />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
              <div className="font-medium"><Icon name="done" /> {t(`ลงปฏิทินแล้ว ${result.created} โพสต์ สถานะ "ร่าง"`, `${result.created} draft posts added`)}</div>
              <div className="mt-1 text-sm">{t("โพสต์เดิมไม่ถูกแตะ · เปิดการ์ดในปฏิทินเพื่อใส่รูป/ให้ AI เขียนแคปชั่นที่ยังว่าง · กด \"ยกเลิกทั้งชุดนี้\" ได้ถ้าลงผิด", "Existing posts untouched · open a card to add images or AI captions")}</div>
              {result.content_nos.length > 0 && <div className="mt-1 text-xs text-emerald-700">{result.content_nos[0]}{result.content_nos.length > 1 ? ` – ${result.content_nos[result.content_nos.length - 1]}` : ""}</div>}
            </div>
            {result.caption_error && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><Icon name="warning" /> {result.caption_error}</div>}
            {result.skipped.length > 0 && (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="font-medium text-slate-700">{t(`ข้าม ${result.skipped.length} โพสต์`, `${result.skipped.length} skipped`)}</div>
                {result.skipped.slice(0, 10).map((s, i) => <div key={i} className="text-xs text-slate-500">{s.date} · {s.title} — {s.reason}</div>)}
              </div>
            )}
          </div>
        )}
      </ERPModal>
      {cardOpen && brandId && (
        <BrandProfileModal brandId={brandId} brandName={brandName} onClose={() => setCardOpen(false)}
          onSaved={(p) => setCard((c) => ({ profile: p, highlights: c?.highlights ?? [] }))} />
      )}
      <ConfirmDialog open={undoAsk} onClose={() => setUndoAsk(false)} onConfirm={undo} loading={undoBusy} variant="danger"
        title={t("ยกเลิกทั้งชุดนี้?", "Undo this batch?")}
        message={t(`จะลบ ${result?.ids.length ?? 0} โพสต์ที่เพิ่งลงจากชุดนี้ (โพสต์อื่นไม่โดน)`, `Removes the ${result?.ids.length ?? 0} posts just added (nothing else)`)}
        confirmText={t("ยกเลิกทั้งชุด", "Undo batch")} />
    </>
  );
}
