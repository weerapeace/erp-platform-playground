"use client";

/**
 * 🗓️ วางแผนคอนเทนต์ (ตัวหน้าจอ) — ข้อมูลชุดเดียวกับปฏิทินคอนเทนต์เดิม (erp_creative_content)
 *   แท็บแบรนด์ · มุมมอง สัปดาห์ (แถว=ช่องทาง) / เดือน / บอร์ดตามขั้น · กรองแนวคอนเทนต์ · สรุปแนวในช่วงที่ดูอยู่
 *   กล่องไอเดียยังไม่ลงวัน · ลากวางเปลี่ยนวัน/ขั้น · การ์ดไอเดีย (PlanModal) · รายละเอียดเต็ม = ContentDrawer เดิม
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { useViewPref } from "@/lib/use-view-pref";
import { listContent, listBrands, updateContent, type ContentItem, type BrandOption } from "@/app/tasks/data";
import { useCreativeOptions } from "@/app/tasks/use-options";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";
import {
  stageOf, statusForStage, dateKeyOf, timeOf, toScheduledIso, localDateKey, weekStart, addDays, shortThaiDate, parseDateKey,
  type PlanStage,
} from "@/lib/marketing/content-plan";
import { getBrandPlatforms, type BrandPlatformMap } from "@/app/tasks/content/brand-platforms-modal";
import { PlanModal, type PlatformOpt } from "./plan-modal";
import { PlanSettingsModal, type PlanSettingsTab } from "./plan-settings-modal";
import { TargetsPanel, GenerateModal } from "./plan-targets-slots";
import { DEFAULT_PLACEMENTS, type PlanTarget, type PlacementType } from "@/lib/marketing/content-plan";
import { WeekView, MonthView, BoardView, BacklogPanel } from "./plan-views";

// รายละเอียดเต็ม/แคปชั่น = ContentDrawer ตัวเดิม (โหลดเมื่อเปิด)
const ContentDrawer = dynamic(() => import("@/app/tasks/content/content").then((m) => m.ContentDrawer), { ssr: false });

const VIEWS = ["week", "month", "board"] as const;
type View = (typeof VIEWS)[number];
const BRAND_KEY = "content-plan:brand";
const readLS = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function ContentPlanView({ canCreate, canEdit, canPillars }: { canCreate: boolean; canEdit: boolean; canPillars: boolean }) {
  const toast = useToast();
  const { platforms: platformOpts, reload: reloadOptions } = useCreativeOptions();
  const platforms = platformOpts as PlatformOpt[];

  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [pillars, setPillars] = useState<MarketingSkuLabel[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [brandTab, setBrandTab] = useState("");
  const [pillarFilter, setPillarFilter] = useState("");   // "" ทั้งหมด · "__none" ไม่ระบุแนว · id
  const [q, setQ] = useState("");
  const [anchorWeek, setAnchorWeek] = useState(() => weekStart(localDateKey(new Date())));
  const [anchorMonth, setAnchorMonth] = useState(() => localDateKey(new Date()).slice(0, 7));
  const [modal, setModal] = useState<{ item: ContentItem | null; date?: string | null; platform?: string | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlanSettingsTab | null>(null);   // เปิดตั้งค่าหน้า (แท็บไหน)
  const [planPlatforms, setPlanPlatforms] = useState<string[] | null>(null); // ช่องทางที่ตั้งให้โชว์ · null = ทั้งหมด
  const [brandPlatforms, setBrandPlatforms] = useState<BrandPlatformMap>({});
  const [targets, setTargets] = useState<PlanTarget[]>([]);
  const [placementSetting, setPlacementSetting] = useState<PlacementType[] | null>(null);   // null = ยังไม่ตั้ง → ค่าเริ่มต้น
  const placementTypes = placementSetting ?? DEFAULT_PLACEMENTS;
  const [genOpen, setGenOpen] = useState(false);
  const { view, setView, saveDefault } = useViewPref<View>("content_plan_view", VIEWS, "week");
  const pickView = (v: View) => { setView(v); void saveDefault(v); };

  useEffect(() => { setBrandTab(readLS(BRAND_KEY)); }, []);

  const loadPillars = useCallback(async () => {
    try {
      const j = await apiFetch("/api/marketing/sku-labels?kind=pillar").then((r) => r.json());
      if (!j.error) setPillars((j.data ?? []) as MarketingSkuLabel[]);
    } catch { /* แนวโหลดไม่ได้ = การ์ดไม่มีสี ไม่ใช่เรื่องใหญ่ */ }
  }, []);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const [c, b] = await Promise.all([listContent(), listBrands()]);
      setItems(c);
      setBrands(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);
  const loadSettings = useCallback(async () => {
    try {
      const [j, bp] = await Promise.all([apiFetch("/api/marketing/content-plan-settings").then((r) => r.json()), getBrandPlatforms()]);
      if (!j.error) { setPlanPlatforms(Array.isArray(j.platforms) ? j.platforms : null); setPlacementSetting(Array.isArray(j.placements) ? j.placements : null); }
      setBrandPlatforms(bp.map);
    } catch { /* ตั้งค่าโหลดไม่ได้ = โชว์ทุกช่องทาง */ }
  }, []);
  const loadTargets = useCallback(async () => {
    try { const j = await apiFetch("/api/marketing/content-plan/targets").then((r) => r.json()); if (!j.error) setTargets((j.data ?? []) as PlanTarget[]); }
    catch { /* ไม่มีเป้า = แผงเป้าโชว์ชวนตั้ง */ }
  }, []);
  useEffect(() => { void load(); void loadPillars(); void loadSettings(); void loadTargets(); }, [load, loadPillars, loadSettings, loadTargets]);

  // แถวช่องทาง = ที่ตั้งไว้ (ตามลำดับ) หรือทั้งหมด · เลือกแท็บแบรนด์ที่ตั้ง "ลงช่องทางไหน" ไว้ → เหลือเฉพาะของแบรนด์นั้น
  const rowPlatforms = useMemo(() => {
    const byKey = new Map(platforms.map((p) => [p.value, p]));
    let keys = planPlatforms ? planPlatforms.filter((k) => byKey.has(k)) : platforms.map((p) => p.value);
    const brandList = brandTab ? brandPlatforms[brandTab] : undefined;
    if (brandList) keys = keys.filter((k) => brandList.includes(k));
    return keys.map((k) => byKey.get(k)!);
  }, [platforms, planPlatforms, brandPlatforms, brandTab]);
  const brandFiltered = !!(brandTab && brandPlatforms[brandTab]);

  const pillarMap = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);
  const pillarOf = useCallback((c: ContentItem) => (c.pillar_id ? pillarMap.get(c.pillar_id) : undefined), [pillarMap]);

  // ข้อมูลในแผน = ไม่ยกเลิก + ตามแบรนด์/แนว/คำค้น
  const live = useMemo(() => (items ?? []).filter((c) => stageOf(c) !== null), [items]);
  const brandCounts = useMemo(() => { const m = new Map<string, number>(); for (const c of live) if (c.brand_id) m.set(c.brand_id, (m.get(c.brand_id) ?? 0) + 1); return m; }, [live]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return live.filter((c) => (!brandTab || c.brand_id === brandTab)
      && (!pillarFilter || (pillarFilter === "__none" ? !c.pillar_id : c.pillar_id === pillarFilter))
      && (!t || `${c.title} ${c.content_no ?? ""} ${c.parent_sku_code ?? ""} ${c.brief ?? ""}`.toLowerCase().includes(t)));
  }, [live, brandTab, pillarFilter, q]);
  const backlog = useMemo(() => filtered.filter((c) => !c.scheduled_at && stageOf(c) !== "published")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")), [filtered]);

  // ช่วงที่ดูอยู่ → สรุปแนวคอนเทนต์ (ช่วยดูว่าแผนสมดุลไหม)
  const range = view === "week" ? [anchorWeek, addDays(anchorWeek, 6)]
    : view === "month" ? [`${anchorMonth}-01`, localDateKey(new Date(parseDateKey(`${anchorMonth}-01`).getFullYear(), parseDateKey(`${anchorMonth}-01`).getMonth() + 1, 0))]
    : null;
  const inRange = useMemo(() => range ? filtered.filter((c) => { const k = dateKeyOf(c.scheduled_at); return !!k && k >= range[0] && k <= range[1]; }) : filtered,
    [filtered, range?.[0], range?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const mix = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of inRange) m.set(c.pillar_id ?? "__none", (m.get(c.pillar_id ?? "__none") ?? 0) + 1);
    return m;
  }, [inRange]);

  // ── actions ──
  const patchLocal = (id: string, p: Partial<ContentItem>) => setItems((list) => list && list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const move = async (id: string, date: string | null, platform: string | null) => {
    const c = items?.find((x) => x.id === id);
    if (!c) return;
    const newAt = date ? toScheduledIso(date, timeOf(c.scheduled_at)) : null;
    const plats = c.platforms ?? [];
    const newPlats = platform && !plats.includes(platform) && plats.length === 0 ? [platform] : plats;   // ยังไม่มีช่องทาง → ใส่ช่องทางของแถวที่วาง
    if (newAt === c.scheduled_at && newPlats === plats) return;
    if (c.status === "published" && newPlats !== plats) { toast.warning("โพสต์แล้ว — เปลี่ยนช่องทางไม่ได้"); return; }
    const before = { scheduled_at: c.scheduled_at, platforms: c.platforms };
    patchLocal(id, { scheduled_at: newAt, platforms: newPlats });
    try {
      await updateContent(id, newPlats !== plats ? { scheduled_at: newAt, platforms: newPlats } : { scheduled_at: newAt });
      toast.success(date ? `ย้ายไป ${shortThaiDate(date)} แล้ว` : "ย้ายกลับกล่องไอเดียแล้ว");
    } catch (e) {
      patchLocal(id, before);
      toast.error(e instanceof Error ? e.message : "ย้ายไม่สำเร็จ");
    }
  };
  const changeStage = async (id: string, stage: PlanStage) => {
    const c = items?.find((x) => x.id === id);
    if (!c || stageOf(c) === stage) return;
    if (stage === "making") {
      if (c.task_id) return;
      toast.info("ส่งเข้า \"กำลังทำ\" ด้วยปุ่ม 🎬 ส่งเป็นงาน ในการ์ด (ระบบจะสร้างงานให้ทีม Creative)");
      setModal({ item: c });
      return;
    }
    if (stage === "idea" && c.task_id) { toast.warning("ไอเดียนี้ส่งเป็นงานแล้ว — ถอดงานได้ที่ 📝 รายละเอียด"); return; }
    const status = statusForStage(stage);
    if (!status) return;
    const before = c.status;
    patchLocal(id, { status: status as ContentItem["status"] });
    try { await updateContent(id, { status }); toast.success("ย้ายขั้นแล้ว"); }
    catch (e) { patchLocal(id, { status: before }); toast.error(e instanceof Error ? e.message : "ย้ายขั้นไม่สำเร็จ"); }
  };
  const pushToast = useCallback((type: "success" | "error" | "info", m: string) => { (type === "error" ? toast.error : type === "success" ? toast.success : toast.info)(m); }, [toast]);

  const openNew = (date?: string | null, platform?: string | null) => canCreate && setModal({ item: null, date: date ?? null, platform: platform ?? null });
  const openItem = (c: ContentItem) => setModal({ item: c });
  const pickBrand = (k: string) => { setBrandTab(k); writeLS(BRAND_KEY, k); };

  const pillarsWithUsage = useMemo(() => pillars.map((p) => ({ ...p, usage_count: live.filter((c) => c.pillar_id === p.id).length })), [pillars, live]);
  const tabBtn = (on: boolean) => `flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-sm border-b-2 -mb-px transition-colors ${on ? "border-blue-600 text-blue-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`;
  const seg = (on: boolean) => `h-7 rounded-md px-2.5 text-xs font-medium transition ${on ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`;
  const navBtn = "h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50";
  const periodLabel = view === "week"
    ? `${shortThaiDate(anchorWeek)} – ${shortThaiDate(addDays(anchorWeek, 6))}`
    : parseDateKey(`${anchorMonth}-01`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const shift = (n: number) => {
    if (view === "week") setAnchorWeek((w) => addDays(w, 7 * n));
    else { const d = parseDateKey(`${anchorMonth}-01`); d.setMonth(d.getMonth() + n); setAnchorMonth(localDateKey(d).slice(0, 7)); }
  };
  // เดือนของช่วงที่ดูอยู่ (สัปดาห์ = เดือนของวันพฤหัสในสัปดาห์นั้น) — ใช้กับแผงเป้า + สร้างแผนจากสล็อต
  const periodMonth = view === "month" ? anchorMonth : view === "week" ? addDays(anchorWeek, 3).slice(0, 7) : localDateKey(new Date()).slice(0, 7);
  const brandName = brands.find((b) => b.id === brandTab)?.name ?? "";
  const goToday = () => { const t = localDateKey(new Date()); setAnchorWeek(weekStart(t)); setAnchorMonth(t.slice(0, 7)); };

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">🗓️ วางแผนคอนเทนต์</h1>
            <p className="text-sm text-slate-500 mt-1">จะลงอะไร แนวไหน ลงที่ไหน · ข้อมูลชุดเดียวกับ <Link href="/tasks/content-calendar" className="text-blue-600 hover:underline">ปฏิทินคอนเทนต์</Link> ของทีม Creative</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSettings("platforms")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">⚙️ ตั้งค่า</button>
            {canCreate && <button type="button" onClick={() => openNew()} className="h-9 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700">＋ ไอเดียใหม่</button>}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-4 max-w-7xl mx-auto">
        {err && !items ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-sm text-red-700">{err}</div>
            <button onClick={() => load()} className="mt-3 rounded-lg border border-red-200 bg-white text-red-700 px-4 py-1.5 text-sm font-medium hover:bg-red-50">ลองใหม่</button>
          </div>
        ) : !items ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : (
          <>
            {/* แท็บแบรนด์ */}
            <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
              <button type="button" onClick={() => pickBrand("")} className={tabBtn(!brandTab)}>ทุกแบรนด์ <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{live.length}</span></button>
              {brands.filter((b) => brandCounts.has(b.id) || brandTab === b.id).sort((a, b) => (brandCounts.get(b.id) ?? 0) - (brandCounts.get(a.id) ?? 0)).map((b) => (
                <button key={b.id} type="button" onClick={() => pickBrand(b.id)} className={tabBtn(brandTab === b.id)}>
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color ?? "#94a3b8" }} />{b.name}
                  <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{brandCounts.get(b.id) ?? 0}</span>
                </button>
              ))}
            </div>

            {/* แถบเครื่องมือ: มุมมอง · ช่วงเวลา · ค้นหา */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="มุมมอง">
                {([["week", "สัปดาห์"], ["month", "เดือน"], ["board", "บอร์ดตามขั้น"]] as const).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => pickView(v)} aria-pressed={view === v} className={seg(view === v)}>{t}</button>
                ))}
              </div>
              {view !== "board" && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => shift(-1)} className={navBtn} aria-label="ก่อนหน้า">‹</button>
                  <button type="button" onClick={goToday} className={navBtn}>วันนี้</button>
                  <button type="button" onClick={() => shift(1)} className={navBtn} aria-label="ถัดไป">›</button>
                  <span className="ml-1 text-sm font-semibold text-slate-700">{periodLabel}</span>
                </div>
              )}
              {canCreate && (
                <button type="button" onClick={() => setGenOpen(true)} disabled={!brandTab}
                  title={brandTab ? `ลงไอเดียตามสล็อตประจำสัปดาห์ของ ${brandName} ทั้งเดือน` : "เลือกแท็บแบรนด์ก่อน (สล็อตตั้งแยกต่อแบรนด์)"}
                  className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40">⚡ สร้างแผนจากสล็อต</button>
              )}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหาหัวข้อ / รหัส / บรีฟ…"
                className="ml-auto h-9 w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <TargetsPanel targets={targets} items={live} month={periodMonth} brandTab={brandTab} brands={brands} platforms={platforms}
              canSetup={canPillars} onSetup={() => setSettings("targets")} />

            {/* แนวคอนเทนต์: กรอง + สรุปจำนวนในช่วงที่ดู */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-slate-500">{view === "board" ? "แนวคอนเทนต์" : `แนวในช่วงนี้ (${inRange.length} ชิ้น)`}</span>
              <button type="button" onClick={() => setPillarFilter("")}
                className={`rounded-full border px-3 py-1 text-xs ${!pillarFilter ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>ทั้งหมด</button>
              {[...pillars.filter((p) => p.is_active || mix.has(p.id)), { id: "__none", name: "ไม่ระบุแนว", icon: null, color: "#cbd5e1" } as MarketingSkuLabel].map((p) => {
                const on = pillarFilter === p.id;
                const n = mix.get(p.id) ?? 0;
                if (p.id === "__none" && n === 0 && !on) return null;
                return (
                  <button key={p.id} type="button" onClick={() => setPillarFilter(on ? "" : p.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${on ? "text-white" : "bg-white text-slate-600 hover:border-slate-400"}`}
                    style={on ? { background: p.color, borderColor: p.color } : { borderColor: `${p.color}88` }}>
                    {p.icon && <span>{p.icon}</span>}{p.name}<span className={on ? "text-white/80" : "text-slate-400"}>{n}</span>
                  </button>
                );
              })}
            </div>

            {view === "board" ? (
              <BoardView items={filtered} pillarOf={pillarOf} canEdit={canEdit} onOpen={openItem} onStage={(id, s) => void changeStage(id, s)} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="min-w-0">
                  {view === "week"
                    ? <WeekView start={anchorWeek} items={filtered} platforms={rowPlatforms} allPlatforms={platforms} placementTypes={placementTypes} pillarOf={pillarOf} canEdit={canEdit}
                        onOpen={openItem} onAdd={(d, p) => openNew(d, p)} onMove={(id, d, p) => void move(id, d, p)} />
                    : <MonthView ym={anchorMonth} items={filtered} pillarOf={pillarOf} canEdit={canEdit}
                        onOpen={openItem} onAdd={(d) => openNew(d)} onMove={(id, d) => void move(id, d, null)} />}
                </div>
                <BacklogPanel items={backlog} pillarOf={pillarOf} canEdit={canEdit} onOpen={openItem} onAdd={() => openNew()}
                  onDrop={(id) => void move(id, null, null)} />
              </div>
            )}
            {view === "week" && brandFiltered && <p className="text-xs text-slate-400">แสดงเฉพาะช่องทางที่แบรนด์นี้ลง ({rowPlatforms.length}) · ปรับได้ที่ ⚙️ ตั้งค่า → ช่องทาง → ตั้งค่าต่อแบรนด์</p>}
            {canEdit && view !== "board" && <p className="text-xs text-slate-400">ลากการ์ดไปวางช่องวันเพื่อเปลี่ยนวัน (เวลาเดิมคงไว้) · ลากกลับกล่องไอเดีย = เอาวันออก · กด ＋ ในช่องเพื่อเพิ่มไอเดียลงวันนั้น</p>}
          </>
        )}
      </div>

      <PlanModal open={!!modal} item={modal?.item ?? null} defaults={{ brandId: brandTab || null, date: modal?.date ?? null, platform: modal?.platform ?? null }}
        brands={brands} pillars={pillars} platforms={platforms} planPlatforms={planPlatforms} brandPlatforms={brandPlatforms} placementTypes={placementTypes} canEdit={modal?.item ? canEdit : canCreate}
        onClose={() => setModal(null)} onSaved={() => void load()} onOpenDetail={(id) => { setModal(null); setDetailId(id); }}
        onOpenSettings={() => setSettings("platforms")} />

      {detailId && <ContentDrawer contentId={detailId} brands={brands} onClose={() => setDetailId(null)} onChanged={() => void load()} pushToast={pushToast} />}

      <PlanSettingsModal open={!!settings} initialTab={settings ?? "platforms"} onClose={() => setSettings(null)}
        allPlatforms={platforms} planPlatforms={planPlatforms} placementTypes={placementTypes} pillars={pillarsWithUsage} brands={brands}
        canEdit={canPillars} canEditBrands={canEdit}
        onPlatformsSaved={(pf, pt) => { setPlanPlatforms(pf); setPlacementSetting(pt); }} onPillarsChanged={() => void loadPillars()}
        onOptionsChanged={() => reloadOptions(true)} onBrandPlatformsSaved={setBrandPlatforms}
        defaultBrandId={brandTab || null} onTargetsChanged={() => void loadTargets()} />

      {brandTab && (
        <GenerateModal open={genOpen} brandId={brandTab} brandName={brandName} month={periodMonth} platforms={platforms} pillars={pillars}
          onClose={() => setGenOpen(false)} onDone={() => void load()} onSetup={() => { setGenOpen(false); setSettings("slots"); }} />
      )}
    </>
  );
}
