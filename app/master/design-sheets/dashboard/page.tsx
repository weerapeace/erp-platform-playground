"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const WorkflowStatusManager = dynamic(
  () => import("@/components/workflow-status-manager").then((mod) => mod.WorkflowStatusManager),
  { ssr: false }
);

type Tone = "danger" | "warn" | "good" | "done" | "normal";

type BrandTheme = {
  name: string;
  accent: string;
  soft: string;
  aura: string;
  ink: string;
};

type Brand = {
  name: string;
  code: string;
  total: number;
  urgent: number;
  active: number;
  theme: BrandTheme;
};

type StageCard = {
  code: string;
  brand: string;
  name: string;
  due: string;
  tone: Tone;
};

type Stage = {
  key: string;
  title: string;
  color: string;
  count: number;
  cards: StageCard[];
};

const STORAGE_KEY = "design-dashboard-brand-themes-v1";

const fallbackTheme: BrandTheme = {
  name: "Fantasy Gold",
  accent: "#f59e0b",
  soft: "#fef3c7",
  aura: "#fff7ed",
  ink: "#0f172a",
};

const themePresets: BrandTheme[] = [
  { name: "Fantasy Gold", accent: "#f59e0b", soft: "#fef3c7", aura: "#fff7ed", ink: "#0f172a" },
  { name: "Moon Lilac", accent: "#8b5cf6", soft: "#ede9fe", aura: "#f5f3ff", ink: "#1e1b4b" },
  { name: "Sky Charm", accent: "#0ea5e9", soft: "#e0f2fe", aura: "#f0f9ff", ink: "#0c4a6e" },
  { name: "Garden Mint", accent: "#10b981", soft: "#d1fae5", aura: "#ecfdf5", ink: "#064e3b" },
  { name: "Rose Crystal", accent: "#f43f5e", soft: "#ffe4e6", aura: "#fff1f2", ink: "#881337" },
];

const baseBrands: Brand[] = [
  { name: "Luna Atelier", code: "LA", total: 18, urgent: 4, active: 12, theme: themePresets[1] },
  { name: "Mira Bag", code: "MB", total: 14, urgent: 2, active: 9, theme: themePresets[2] },
  { name: "Orchid House", code: "OH", total: 11, urgent: 1, active: 7, theme: themePresets[3] },
  { name: "Velvet Studio", code: "VS", total: 9, urgent: 3, active: 5, theme: themePresets[0] },
  { name: "Rose Vale", code: "RV", total: 7, urgent: 2, active: 4, theme: themePresets[4] },
];

const defaultThemes = baseBrands.reduce<Record<string, BrandTheme>>((acc, brand) => {
  acc[brand.code] = brand.theme;
  return acc;
}, {});

const stages: Stage[] = [
  {
    key: "design",
    title: "ออกแบบ",
    color: "#64748b",
    count: 8,
    cards: [
      { code: "DS-1042", brand: "LA", name: "กระเป๋าทรง bucket", due: "วันนี้", tone: "danger" },
      { code: "DS-1038", brand: "OH", name: "ซองแว่นผ้าปัก", due: "2 วัน", tone: "warn" },
    ],
  },
  {
    key: "sent",
    title: "ส่งลูกค้าดู",
    color: "#3b82f6",
    count: 5,
    cards: [
      { code: "DS-1035", brand: "MB", name: "tote canvas mini", due: "รอ feedback", tone: "normal" },
    ],
  },
  {
    key: "revise",
    title: "แก้ไข",
    color: "#f59e0b",
    count: 6,
    cards: [
      { code: "DS-1031", brand: "VS", name: "ปรับหูหิ้ว + โลโก้", due: "พรุ่งนี้", tone: "warn" },
    ],
  },
  {
    key: "cost",
    title: "ตีราคา",
    color: "#a855f7",
    count: 4,
    cards: [
      { code: "DS-1028", brand: "RV", name: "set pouch 3 size", due: "วันนี้", tone: "danger" },
    ],
  },
  {
    key: "quote",
    title: "เสนอราคา",
    color: "#6366f1",
    count: 3,
    cards: [
      { code: "DS-1026", brand: "LA", name: "ใบเสนอราคา V2", due: "ส่งแล้ว", tone: "normal" },
    ],
  },
  {
    key: "approved",
    title: "อนุมัติ",
    color: "#10b981",
    count: 5,
    cards: [
      { code: "DS-1021", brand: "OH", name: "รอตั้ง Parent SKU", due: "พร้อมต่อ", tone: "good" },
    ],
  },
  {
    key: "sku",
    title: "ตั้ง SKU แล้ว",
    color: "#7c3aed",
    count: 12,
    cards: [
      { code: "DS-1019", brand: "MB", name: "เข้า master แล้ว", due: "จบงาน", tone: "done" },
    ],
  },
];

const auditRows = [
  { time: "10:42", actor: "May", text: "ย้าย DS-1031 จาก ส่งลูกค้าดู เป็น แก้ไข", note: "ลูกค้าขอปรับโลโก้" },
  { time: "09:18", actor: "Ploy", text: "ย้าย DS-1028 เข้า ตีราคา", note: "รายละเอียดวัสดุครบแล้ว" },
  { time: "เมื่อวาน", actor: "Admin", text: "เพิ่มสถานะ ตั้ง SKU แล้ว", note: "ใช้กับงานที่ผ่านราคาแล้ว" },
];

function CardDeadline({ tone, label }: { tone: Tone; label: string }) {
  const styles: Record<Tone, string> = {
    danger: "bg-rose-500 text-rose-700",
    warn: "bg-amber-500 text-amber-700",
    good: "bg-emerald-500 text-emerald-700",
    done: "bg-violet-500 text-violet-700",
    normal: "bg-slate-300 text-slate-500",
  };
  const [dot, text] = styles[tone].split(" ");
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function blendTheme(theme: BrandTheme) {
  return {
    page: `radial-gradient(circle at top left, ${theme.soft} 0, #f8fafc 30%, ${theme.aura} 100%)`,
    cardPreview: `linear-gradient(135deg, #ffffff 0%, ${theme.soft} 56%, ${theme.aura} 100%)`,
    ring: `0 0 0 1px ${theme.accent}33, 0 18px 45px ${theme.accent}18`,
  };
}

export default function DesignSheetsDashboardPage() {
  const [selectedBrandCode, setSelectedBrandCode] = useState("ALL");
  const [hoveredBrandCode, setHoveredBrandCode] = useState<string | null>(null);
  const [editingBrandCode, setEditingBrandCode] = useState(baseBrands[0].code);
  const [themes, setThemes] = useState<Record<string, BrandTheme>>(defaultThemes);
  const [draftTheme, setDraftTheme] = useState<BrandTheme>(defaultThemes[baseBrands[0].code]);
  const [statusMgr, setStatusMgr] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, BrandTheme>;
      setThemes({ ...defaultThemes, ...saved });
    } catch {
      setThemes(defaultThemes);
    }
  }, []);

  const brands = useMemo(
    () => baseBrands.map((brand) => ({ ...brand, theme: themes[brand.code] ?? brand.theme })),
    [themes]
  );

  const editingBrand = brands.find((brand) => brand.code === editingBrandCode) ?? brands[0];
  const selectedBrand = brands.find((brand) => brand.code === selectedBrandCode) ?? null;
  const activeBrandCode = hoveredBrandCode ?? selectedBrand?.code ?? null;
  const activeTheme = selectedBrand?.theme ?? (activeBrandCode ? brands.find((b) => b.code === activeBrandCode)?.theme : null) ?? fallbackTheme;
  const visuals = blendTheme(activeTheme);

  useEffect(() => {
    setDraftTheme(themes[editingBrandCode] ?? defaultThemes[editingBrandCode] ?? fallbackTheme);
  }, [editingBrandCode, themes]);

  const visibleStages = useMemo(
    () => stages.map((stage) => {
      const cards = selectedBrandCode === "ALL"
        ? stage.cards
        : stage.cards.filter((card) => card.brand === selectedBrandCode);
      return { ...stage, count: selectedBrandCode === "ALL" ? stage.count : cards.length, cards };
    }),
    [selectedBrandCode]
  );

  const totalJobs = selectedBrand ? selectedBrand.total : brands.reduce((sum, brand) => sum + brand.total, 0);
  const urgentJobs = selectedBrand ? selectedBrand.urgent : brands.reduce((sum, brand) => sum + brand.urgent, 0);
  const activeJobs = selectedBrand ? selectedBrand.active : brands.reduce((sum, brand) => sum + brand.active, 0);
  const shownCards = visibleStages.reduce((sum, stage) => sum + stage.cards.length, 0);

  function selectBrand(code: string) {
    setSelectedBrandCode(code);
    if (code !== "ALL") setEditingBrandCode(code);
  }

  function saveTheme() {
    const next = { ...themes, [editingBrand.code]: draftTheme };
    setThemes(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedNotice(`บันทึกธีม ${editingBrand.name} ในเบราว์เซอร์นี้แล้ว`);
  }

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ background: visuals.page }}>
      <div className="w-full px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.8)]" />
              Fantasy workflow preview
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">แผนที่ภารกิจงานออกแบบ</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Dashboard ทดลองสำหรับดูงานหลายแบรนด์ เปลี่ยนสถานะบ่อย และตั้งอารมณ์ภาพของแต่ละแบรนด์จากจุดเดียว
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/master/design-sheets" className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white/90 px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white">
              กลับ Design Sheets
            </a>
            <button className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              อัปเดตหลายงาน
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            ["งานทั้งหมด", totalJobs, selectedBrand ? selectedBrand.name : "ทุกแบรนด์ในเดือนนี้"],
            ["กำลังเดินงาน", activeJobs, "ยังไม่จบหรือยกเลิก"],
            ["ใกล้ครบกำหนด", urgentJobs, "ควรไล่สถานะวันนี้"],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium text-slate-400">{label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{hint}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">แบรนด์</h2>
                  <p className="text-xs text-slate-400">คลิกเพื่อกรองงานและดูธีม</p>
                </div>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{brands.length} แบรนด์</span>
              </div>

              <button
                onClick={() => selectBrand("ALL")}
                className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${selectedBrandCode === "ALL" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <span className="font-semibold">ทั้งหมด</span>
                <span className="text-xs opacity-70">{brands.reduce((sum, brand) => sum + brand.active, 0)} งานเดินอยู่</span>
              </button>

              <div className="space-y-2">
                {brands.map((brand) => {
                  const selected = selectedBrandCode === brand.code;
                  const hovered = hoveredBrandCode === brand.code;
                  return (
                    <button
                      key={brand.code}
                      onClick={() => selectBrand(brand.code)}
                      onMouseEnter={() => setHoveredBrandCode(brand.code)}
                      onMouseLeave={() => setHoveredBrandCode(null)}
                      className="w-full rounded-lg border bg-white p-3 text-left shadow-[3px_3px_0_rgba(148,163,184,0.16)] transition hover:-translate-y-0.5"
                      style={{ borderColor: selected || hovered ? brand.theme.accent : "#e2e8f0", boxShadow: selected || hovered ? blendTheme(brand.theme).ring : undefined }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: brand.theme.accent }}>
                          {brand.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-800">{brand.name}</div>
                          <div className="text-xs text-slate-400">{brand.active} งานกำลังเดิน</div>
                        </div>
                        <span className="rounded-md px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: brand.theme.soft, color: brand.theme.ink }}>
                          {brand.theme.name}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-slate-50 px-2 py-1.5">
                          <div className="text-slate-400">งานค้าง</div>
                          <div className="font-semibold text-slate-700">{brand.total}</div>
                        </div>
                        <div className="rounded-md bg-rose-50 px-2 py-1.5">
                          <div className="text-rose-400">ใกล้ครบ</div>
                          <div className="font-semibold text-rose-700">{brand.urgent}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-white/70 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">ธีมแบรนด์</h2>
                  <p className="text-xs text-slate-400">{editingBrand.name}</p>
                </div>
                <span className="rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: draftTheme.soft, color: draftTheme.ink }}>
                  {editingBrand.code}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                {themePresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setDraftTheme(preset)}
                    className="rounded-lg border bg-white px-2 py-2 text-left text-xs font-medium text-slate-600 transition hover:-translate-y-0.5"
                    style={{ borderColor: draftTheme.name === preset.name ? preset.accent : "#e2e8f0" }}
                  >
                    <span className="mb-2 flex gap-1">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.accent }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.soft }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.aura }} />
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="space-y-2 text-xs text-slate-500">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span>สีหลัก</span>
                  <input type="color" value={draftTheme.accent} onChange={(e) => setDraftTheme({ ...draftTheme, accent: e.target.value, name: "Custom" })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span>สีรอง</span>
                  <input type="color" value={draftTheme.soft} onChange={(e) => setDraftTheme({ ...draftTheme, soft: e.target.value, name: "Custom" })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span>พื้นหลัง</span>
                  <input type="color" value={draftTheme.aura} onChange={(e) => setDraftTheme({ ...draftTheme, aura: e.target.value, name: "Custom" })} />
                </label>
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-3" style={{ background: blendTheme(draftTheme).cardPreview }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ backgroundColor: draftTheme.accent }}>
                    {editingBrand.code}
                  </span>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: draftTheme.ink }}>{editingBrand.name}</div>
                    <div className="text-xs text-slate-500">ตัวอย่างการ์ดแบรนด์</div>
                  </div>
                </div>
              </div>

              <button onClick={saveTheme} className="mt-3 h-9 w-full rounded-md bg-slate-900 text-sm font-medium text-white hover:bg-slate-800">
                บันทึกธีมแบรนด์
              </button>
              {savedNotice && <div className="mt-2 text-xs text-emerald-600">{savedNotice}</div>}
            </section>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="min-w-0 rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">เส้นทางสถานะ</h2>
                  <p className="text-xs text-slate-400">{selectedBrand ? selectedBrand.name : "ทุกแบรนด์"} • แสดง {shownCards} การ์ดตัวอย่าง</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> ด่วน</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> ใกล้ครบ</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> พร้อมต่อ</span>
                  </div>
                  <button
                    onClick={() => setStatusMgr(true)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    จัดการสถานะ
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[1120px] grid-cols-7 gap-3">
                  {visibleStages.map((stage, index) => (
                    <div key={stage.key} className="relative">
                      {index < visibleStages.length - 1 && (
                        <div className="absolute left-[62%] top-8 h-px w-[76%] bg-gradient-to-r from-amber-300 via-amber-200 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.45)]" />
                      )}
                      <div className="relative mb-3 rounded-lg border px-2 py-2 text-center shadow-sm" style={{ borderColor: `${activeTheme.accent}33`, background: `linear-gradient(180deg, #ffffff 0%, ${activeTheme.soft} 100%)` }}>
                        <div className="mx-auto mb-1 h-3 w-3 rounded-full shadow-[0_0_16px_rgba(245,158,11,0.65)]" style={{ backgroundColor: stage.color }} />
                        <div className="text-xs font-semibold text-slate-800">{stage.title}</div>
                        <div className="text-[11px] text-slate-400">{stage.count} งาน</div>
                      </div>
                      <div className="min-h-[128px] space-y-2">
                        {stage.cards.map((card) => {
                          const brand = brands.find((item) => item.code === card.brand);
                          const dimmed = Boolean(activeBrandCode && card.brand !== activeBrandCode);
                          return (
                            <div
                              key={card.code}
                              className="rounded-lg border border-slate-200 bg-white p-2 shadow-[3px_3px_0_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5"
                              style={{ opacity: dimmed ? 0.38 : 1, borderColor: brand?.theme.accent === activeTheme.accent ? `${brand?.theme.accent}66` : undefined }}
                            >
                              <div className="mb-2 h-14 rounded-md border border-slate-100" style={{ background: blendTheme(brand?.theme ?? fallbackTheme).cardPreview }} />
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand?.theme.accent ?? "#cbd5e1" }} />
                                <span className="font-mono text-[11px] text-slate-400">{card.code}</span>
                              </div>
                              <div className="mt-0.5 min-h-[32px] text-xs font-semibold text-slate-800">{card.name}</div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-slate-400">{card.brand}</span>
                                <CardDeadline tone={card.tone} label={card.due} />
                              </div>
                            </div>
                          );
                        })}
                        {stage.cards.length === 0 && (
                          <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-3 text-center text-xs text-slate-400">
                            ไม่มีงานของแบรนด์นี้
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-white/70 bg-slate-900 p-4 text-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">ประวัติการเปลี่ยนสถานะล่าสุด</h2>
                  <p className="mt-1 text-xs text-slate-300">ตามย้อนหลังว่าใครย้ายงาน เพราะอะไร</p>
                </div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-200">Audit Log กลาง</span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {auditRows.map((row) => (
                  <div key={`${row.time}-${row.text}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]" />
                      <span className="text-[11px] text-slate-400">{row.time} • {row.actor}</span>
                    </div>
                    <div className="text-xs font-medium text-white">{row.text}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{row.note}</div>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      </div>

      {statusMgr && (
        <WorkflowStatusManager
          open={statusMgr}
          onClose={() => setStatusMgr(false)}
          entityType="design_sheet"
          actor={null}
          onChanged={() => setSavedNotice("อัปเดตสถานะกลางแล้ว")}
        />
      )}
    </div>
  );
}
