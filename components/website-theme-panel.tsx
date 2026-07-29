"use client";

/**
 * WebsiteThemePanel — แท็บ "🎨 ดีไซน์" ในหน้า /website/<slug>
 *
 * หมวด: สี · ตัวอักษร · โลโก้และแบรนด์ · Header · การ์ดสินค้า · รูปทรง · ประวัติ
 * ร่าง/เผยแพร่ · undo/redo (Ctrl+Z) · คืนค่ารายช่อง · ตรวจ contrast (WCAG) ·
 * พรีวิว = เว็บจริงใน iframe (?preview=1) ส่งธีมสดผ่าน postMessage
 *
 * ข้อมูล: /api/website/theme · /api/website/theme/versions · อัปโหลดรูปผ่าน /api/admin/upload (R2)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { contrastRatio, wcagLevel, WCAG_LABEL, suggestReadable, shades, darken } from "@/lib/color-utils";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";

type Radius = "sharp" | "soft" | "round";
type LogoMode = "icon-text" | "image" | "text" | "icon";
type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
type MenuAlign = "left" | "center" | "right";
type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
type CardHover = "none" | "lift" | "zoom";

interface Theme {
  colors: { brand: string; brandDeep: string; ink: string; page: string; surface: string; muted: string };
  fonts: { display: string; body: string };
  radius: Radius;
  logo: {
    mark: string;
    text: string;
    mode: LogoMode;
    imageKey: string | null;
    imageDarkKey: string | null;
    faviconKey: string | null;
    height: number;
  };
  header: { height: number; sticky: boolean; bg: HeaderBg; menuAlign: MenuAlign; showCart: boolean; border: boolean };
  card: { preset: CardPreset; imageRatio: ImageRatio; titleLines: number; showBadge: boolean; showStock: boolean; hover: CardHover };
}

interface Choices {
  fonts: string[];
  radius: { value: Radius; label: string }[];
  logoModes: { value: LogoMode; label: string }[];
  headerBg: { value: HeaderBg; label: string }[];
  menuAligns: { value: MenuAlign; label: string }[];
  cardPresets: { value: CardPreset; label: string; hint: string }[];
  imageRatios: { value: ImageRatio; label: string }[];
  cardHovers: { value: CardHover; label: string }[];
}

type ColorKey = keyof Theme["colors"];
type TabKey = "colors" | "fonts" | "logo" | "header" | "card" | "shape" | "history";
type Device = "desktop" | "tablet" | "mobile";

const TABS: { k: TabKey; label: string }[] = [
  { k: "colors", label: "สี" },
  { k: "fonts", label: "ตัวอักษร" },
  { k: "logo", label: "โลโก้" },
  { k: "header", label: "Header" },
  { k: "card", label: "การ์ดสินค้า" },
  { k: "shape", label: "รูปทรง" },
  { k: "history", label: "ประวัติ" },
];

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "brand", label: "สีหลักแบรนด์", hint: "ปุ่มหลัก ราคา ลิงก์สำคัญ" },
  { key: "brandDeep", label: "สีหลักเข้ม", hint: "ตอนชี้เมาส์ปุ่ม" },
  { key: "ink", label: "สีตัวอักษรหลัก", hint: "หัวข้อและเนื้อหา" },
  { key: "muted", label: "สีตัวอักษรรอง", hint: "คำอธิบายจาง ๆ" },
  { key: "page", label: "สีพื้นหลังเว็บ", hint: "พื้นหลังทั้งหน้า" },
  { key: "surface", label: "สีพื้นการ์ด", hint: "กล่อง/การ์ดสินค้า" },
];

const DEVICES: { k: Device; label: string; w: number; h: number; icon: string }[] = [
  { k: "desktop", label: "คอมพิวเตอร์", w: 1440, h: 900, icon: "🖥️" },
  { k: "tablet", label: "แท็บเล็ต", w: 768, h: 1024, icon: "📱" },
  { k: "mobile", label: "มือถือ", w: 390, h: 844, icon: "📲" },
];

/** ระดับการย่อพรีวิว — "fit" = ย่อให้พอดีกล่อง (เหมือนแท็บจัดหน้าแรก) */
type Zoom = "fit" | 0.5 | 0.75 | 1;

const PAGES = [
  { path: "/", label: "หน้าแรก" },
  { path: "/shop", label: "ร้านวัสดุ" },
  { path: "/oem", label: "รับผลิต" },
  { path: "/quote", label: "ขอใบเสนอราคา" },
  { path: "/contact", label: "ติดต่อ" },
];

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
  {
    name: "IG ส้มคลาสสิก",
    theme: {
      colors: { brand: "#E2540F", brandDeep: "#B8420A", ink: "#141517", page: "#FAFAF9", surface: "#FFFFFF", muted: "#9BA1A9" },
      fonts: { display: "Kanit", body: "Noto Sans Thai" },
      radius: "soft",
    },
  },
  {
    name: "ดำอุตสาหกรรม",
    theme: {
      colors: { brand: "#F59E0B", brandDeep: "#B45309", ink: "#0B0C0E", page: "#F4F4F5", surface: "#FFFFFF", muted: "#8B8F96" },
      fonts: { display: "Prompt", body: "Sarabun" },
      radius: "sharp",
    },
  },
  {
    name: "ขาวมินิมอล",
    theme: {
      colors: { brand: "#111827", brandDeep: "#000000", ink: "#111827", page: "#FFFFFF", surface: "#FAFAFA", muted: "#9CA3AF" },
      fonts: { display: "IBM Plex Sans Thai", body: "IBM Plex Sans Thai" },
      radius: "sharp",
    },
  },
  {
    name: "น้ำเงินหรู",
    theme: {
      colors: { brand: "#1E3A5F", brandDeep: "#132639", ink: "#0F172A", page: "#F8FAFC", surface: "#FFFFFF", muted: "#94A3B8" },
      fonts: { display: "Kanit", body: "Sarabun" },
      radius: "soft",
    },
  },
  {
    name: "เบจอบอุ่น",
    theme: {
      colors: { brand: "#A87C4F", brandDeep: "#7A5734", ink: "#2E2A26", page: "#FBF8F4", surface: "#FFFFFF", muted: "#A9A096" },
      fonts: { display: "Prompt", body: "Noto Sans Thai" },
      radius: "round",
    },
  },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export function WebsiteThemePanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [theme, setTheme] = useState<Theme | null>(null);
  const [published, setPublished] = useState<Theme | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [lastVersion, setLastVersion] = useState<{ version_no: number; created_at: string } | null>(null);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [tab, setTab] = useState<TabKey>("colors");
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [page, setPage] = useState("/");
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; theme: Theme }[]>([]);

  const undoStack = useRef<Theme[]>([]);
  const redoStack = useRef<Theme[]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // วัดกล่องพรีวิวจริง เพื่อย่อ "พอดีจอ" (เดิม hardcode 400px → จอคอมถูกบีบเหลือ ~28%)
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(420);
  const [boxH, setBoxH] = useState(600);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/theme?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setTheme(j.draft ?? j.published);
      setPublished(j.published);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setChoices(j.choices ?? null);
      setLastVersion(j.lastVersion ?? null);
      setHadDraft(Boolean(j.hasDraft));
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      toast.error("โหลดธีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // วัดขนาดกล่องพรีวิวเพื่อคำนวณ "พอดีจอ" (แบบเดียวกับแท็บ 🧱 จัดหน้าแรก)
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const read = () => {
      setBoxW(el.clientWidth);
      setBoxH(el.clientHeight);
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [loading]);

  const apply = useCallback((next: Theme) => {
    setTheme((prev) => {
      if (prev) {
        undoStack.current = [...undoStack.current.slice(-49), prev];
        redoStack.current = [];
      }
      return next;
    });
    tick((n) => n + 1);
  }, []);

  const setColor = (k: ColorKey, v: string) => theme && apply({ ...theme, colors: { ...theme.colors, [k]: v } });
  const setLogo = (p: Partial<Theme["logo"]>) => theme && apply({ ...theme, logo: { ...theme.logo, ...p } });
  const setHeader = (p: Partial<Theme["header"]>) => theme && apply({ ...theme, header: { ...theme.header, ...p } });
  const setCard = (p: Partial<Theme["card"]>) => theme && apply({ ...theme, card: { ...theme.card, ...p } });

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setTheme((cur) => {
      if (cur) redoStack.current = [...redoStack.current, cur];
      return prev;
    });
    tick((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setTheme((cur) => {
      if (cur) undoStack.current = [...undoStack.current, cur];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ส่งธีมเข้า iframe แบบสด
  useEffect(() => {
    if (!theme) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme }, "*");
    }, 120);
    return () => clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && theme) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme }, "*");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [theme]);

  const dirtyFields = useMemo(() => {
    if (!theme || !published) return [] as string[];
    const out: string[] = [];
    for (const f of COLOR_FIELDS) if (theme.colors[f.key] !== published.colors[f.key]) out.push(f.label);
    if (theme.fonts.display !== published.fonts.display) out.push("ฟอนต์หัวข้อ");
    if (theme.fonts.body !== published.fonts.body) out.push("ฟอนต์เนื้อหา");
    if (theme.radius !== published.radius) out.push("ความมนขอบ");
    if (!eq(theme.logo, published.logo)) out.push("โลโก้");
    if (!eq(theme.header, published.header)) out.push("Header");
    if (!eq(theme.card, published.card)) out.push("การ์ดสินค้า");
    return out;
  }, [theme, published]);

  const isDirty = dirtyFields.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const save = async (mode: "draft" | "publish") => {
    if (!theme) return;
    if (mode === "publish" && !confirm("ยืนยันเผยแพร่ธีมนี้ไปยังเว็บไซต์จริง?\nผู้เข้าชมจะเห็นการเปลี่ยนแปลงภายในประมาณ 1 นาที")) return;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, theme, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      if (mode === "publish") {
        setPublished(j.theme);
        setHadDraft(false);
        setLastVersion({ version_no: j.version, created_at: new Date().toISOString() });
        toast.success(`เผยแพร่แล้ว (เวอร์ชัน ${j.version}) — เว็บจะอัปเดตภายใน ~1 นาที`);
      } else {
        setHadDraft(true);
        toast.success("บันทึกร่างแล้ว — เว็บไซต์จริงยังไม่เปลี่ยน");
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!confirm("ละทิ้งการเปลี่ยนแปลงทั้งหมด กลับไปใช้ธีมที่เผยแพร่อยู่?")) return;
    try {
      await apiFetch(`/api/website/theme?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
    toast.info("ละทิ้งการเปลี่ยนแปลงแล้ว");
  };

  const loadVersions = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/website/theme/versions?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setVersions(j.versions ?? []);
    } catch {
      toast.error("โหลดประวัติไม่สำเร็จ");
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    if (tab === "history") void loadVersions();
  }, [tab, loadVersions]);

  const restore = async (versionNo: number) => {
    if (!confirm(`ดึงเวอร์ชัน ${versionNo} กลับมาเป็นร่าง?\n(ยังไม่เปลี่ยนเว็บจริงจนกว่าจะกดเผยแพร่)`)) return;
    try {
      const r = await apiFetch("/api/website/theme/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, versionNo }),
      });
      const j = await r.json();
      if (j.ok) {
        apply(j.theme);
        setHadDraft(true);
        setTab("colors");
        toast.success(`กู้คืนเวอร์ชัน ${versionNo} เป็นร่างแล้ว`);
      } else toast.error(j.error ?? "กู้คืนไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!theme || !published || !choices) return <div className="py-16 text-center text-sm text-slate-400">โหลดธีมไม่สำเร็จ</div>;

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}${page}?preview=1` : null;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (boxW - 16) / dev.w)) : zoom;
  // สูงพอให้เนื้อเว็บเต็มกล่องหลังย่อแล้ว (ไม่งั้นเหลือที่ว่างข้างล่าง)
  const frameH = Math.max(dev.h, Math.round((boxH - 16) / scale));

  const checks = [
    { label: "ตัวอักษรบนพื้นหลังเว็บ", fg: theme.colors.ink, bg: theme.colors.page },
    { label: "ตัวอักษรรองบนพื้นการ์ด", fg: theme.colors.muted, bg: theme.colors.surface },
    { label: "ตัวอักษรขาวบนปุ่มหลัก", fg: "#FFFFFF", bg: theme.colors.brand },
    { label: "สีแบรนด์บนพื้นหลังเว็บ", fg: theme.colors.brand, bg: theme.colors.page },
  ].map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const level = wcagLevel(ratio);
    return { ...c, ratio, level, suggest: level === "fail" ? suggestReadable(c.fg, c.bg) : null };
  });
  const failCount = checks.filter((c) => c.level === "fail").length;

  const ResetBtn = ({ onClick, show }: { onClick: () => void; show: boolean }) =>
    show ? (
      <button onClick={onClick} title="คืนค่าที่เผยแพร่อยู่" className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400 text-xs">
        ↺
      </button>
    ) : null;

  const tabDirty = (k: TabKey) =>
    (k === "colors" && dirtyFields.some((d) => COLOR_FIELDS.some((c) => c.label === d))) ||
    (k === "fonts" && dirtyFields.some((d) => d.startsWith("ฟอนต์"))) ||
    (k === "logo" && dirtyFields.includes("โลโก้")) ||
    (k === "header" && dirtyFields.includes("Header")) ||
    (k === "card" && dirtyFields.includes("การ์ดสินค้า")) ||
    (k === "shape" && dirtyFields.includes("ความมนขอบ"));

  return (
    <div className="space-y-3">
      {/* แถบสถานะ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDirty || hadDraft ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {isDirty ? "● มีการแก้ไขที่ยังไม่บันทึก" : hadDraft ? "● มีร่างที่ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
        </span>
        {lastVersion && (
          <span className="text-[11px] text-slate-400">
            เผยแพร่ล่าสุด: เวอร์ชัน {lastVersion.version_no} · {timeAgo(lastVersion.created_at)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-2.5">
        <p className="text-sm text-slate-700 font-medium">กำลังแก้ไขธีมของเว็บไซต์จริง</p>
        <p className="text-xs text-slate-500 mt-0.5">
          กด &quot;บันทึกร่าง&quot; จะยังไม่เปลี่ยนหน้าเว็บ จนกว่าจะกด &quot;เผยแพร่&quot;
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] items-start">
        {/* ── ซ้าย: ตั้งค่า ── */}
        <div className="min-w-0 space-y-3">
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-3.5 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition ${
                  tab === t.k ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                {tabDirty(t.k) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />}
              </button>
            ))}
          </div>

          {/* ── สี ── */}
          {tab === "colors" && (
            <>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ชุดสีสำเร็จรูป</h3>
                <p className="text-[11px] text-slate-500 mb-3">เลือกแล้วปรับต่อได้ · ย้อนกลับได้ก่อนบันทึก</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.name} onClick={() => apply({ ...theme, ...p.theme } as Theme)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500">
                      <span className="flex gap-0.5">
                        {[p.theme.colors?.brand, p.theme.colors?.ink, p.theme.colors?.page].map((c, i) => (
                          <span key={i} style={{ background: c, width: 10, height: 10, borderRadius: 3, border: "1px solid rgba(0,0,0,.1)" }} />
                        ))}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">สี</h3>
                  <button onClick={() => apply({ ...theme, colors: { ...theme.colors, brandDeep: darken(theme.colors.brand) } })} className="text-[11px] text-blue-600 hover:underline">
                    สร้างสีเข้มจากสีหลักอัตโนมัติ
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {COLOR_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className={labelCls}>
                        {f.label} <span className="text-slate-400">· {f.hint}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5" aria-label={f.label} />
                        <input value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className={inputCls} />
                        <ResetBtn show={theme.colors[f.key] !== published.colors[f.key]} onClick={() => setColor(f.key, published.colors[f.key])} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className={labelCls}>เฉดสีจากสีหลัก (ระบบสร้างให้อัตโนมัติ)</p>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200">
                    {Object.entries(shades(theme.colors.brand)).map(([k, v]) => (
                      <div key={k} className="flex-1 h-8" style={{ background: v }} title={`${k} · ${v}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ตรวจความอ่านง่าย (WCAG)</h3>
                <p className="text-[11px] text-slate-500 mb-3">{failCount ? `⚠️ พบ ${failCount} จุดที่อ่านยาก` : "✓ ผ่านทุกจุด"}</p>
                <ul className="space-y-2">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded shrink-0" style={{ background: c.bg, color: c.fg, minWidth: 46 }}>Aa</span>
                      <span className="flex-1 text-slate-600">{c.label}</span>
                      <span className={c.level === "fail" ? "text-red-600" : c.level === "AA-large" ? "text-amber-600" : "text-emerald-600"}>
                        {c.ratio}:1 · {WCAG_LABEL[c.level]}
                      </span>
                      {c.suggest && (
                        <button
                          onClick={() => {
                            const key = COLOR_FIELDS.find((f) => theme.colors[f.key] === c.fg)?.key;
                            if (key) setColor(key, c.suggest!);
                          }}
                          className="text-blue-600 hover:underline whitespace-nowrap"
                        >
                          ใช้ {c.suggest}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ── ตัวอักษร ── */}
          {tab === "fonts" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ตัวอักษร</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>ฟอนต์หัวข้อ</label>
                  <div className="flex items-center gap-2">
                    <select className={inputCls} value={theme.fonts.display} onChange={(e) => apply({ ...theme, fonts: { ...theme.fonts, display: e.target.value } })}>
                      {choices.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ResetBtn show={theme.fonts.display !== published.fonts.display} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, display: published.fonts.display } })} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>ฟอนต์เนื้อหา</label>
                  <div className="flex items-center gap-2">
                    <select className={inputCls} value={theme.fonts.body} onChange={(e) => apply({ ...theme, fonts: { ...theme.fonts, body: e.target.value } })}>
                      {choices.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ResetBtn show={theme.fonts.body !== published.fonts.body} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, body: published.fonts.body } })} />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                <p className={labelCls}>ตัวอย่าง</p>
                <p className="text-xl font-semibold" style={{ color: theme.colors.ink }}>งานหนังคุณภาพ ครบจบที่เดียว</p>
                <p className="text-lg font-semibold" style={{ color: theme.colors.ink }}>Premium leather manufacturing</p>
                <p className="text-sm" style={{ color: theme.colors.muted }}>หนังวัวแท้ฟอกฝาด ผิวเรียบเนียน — 0123456789</p>
              </div>
            </div>
          )}

          {/* ── โลโก้ ── */}
          {tab === "logo" && (
            <>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">รูปแบบโลโก้</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>แสดงแบบ</label>
                    <select className={inputCls} value={theme.logo.mode} onChange={(e) => setLogo({ mode: e.target.value as LogoMode })}>
                      {choices.logoModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>ความสูงโลโก้ · {theme.logo.height}px</label>
                    <input type="range" min={20} max={80} value={theme.logo.height} onChange={(e) => setLogo({ height: Number(e.target.value) })} className="w-full accent-blue-600" />
                  </div>
                  <div>
                    <label className={labelCls}>อักษรในกล่อง (1-4 ตัว)</label>
                    <input className={inputCls} maxLength={4} value={theme.logo.mark} onChange={(e) => setLogo({ mark: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>ชื่อร้าน</label>
                    <input className={inputCls} value={theme.logo.text} onChange={(e) => setLogo({ text: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">รูปโลโก้ &amp; ไอคอน</h3>
                <p className="text-[11px] text-slate-500 mb-3">อัปโหลดแล้วเลือก &quot;แสดงแบบ: รูปโลโก้&quot; ด้านบน · รองรับ PNG/JPG/WebP (โปร่งใสแนะนำ PNG)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ImageUploadField label="โลโก้หลัก" hint="ใช้บนพื้นสว่าง" value={theme.logo.imageKey} onChange={(k) => setLogo({ imageKey: k })} previewBg={theme.colors.page} />
                  <ImageUploadField label="โลโก้สำหรับพื้นเข้ม" hint="ใช้ตอน Header สีเข้ม" value={theme.logo.imageDarkKey} onChange={(k) => setLogo({ imageDarkKey: k })} previewBg={theme.colors.ink} />
                  <ImageUploadField label="ไอคอนแท็บเบราว์เซอร์ (Favicon)" hint="จัตุรัส 64px+" value={theme.logo.faviconKey} onChange={(k) => setLogo({ faviconKey: k })} height={44} />
                </div>
              </div>

              <div className={cardCls}>
                <p className={labelCls}>ดูบนพื้นหลังต่าง ๆ</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { bg: "#FFFFFF", label: "พื้นขาว", dark: false },
                    { bg: theme.colors.ink, label: "พื้นเข้ม", dark: true },
                    { bg: theme.colors.brand, label: "พื้นแบรนด์", dark: true },
                  ].map((v) => {
                    const img = v.dark && theme.logo.imageDarkKey ? theme.logo.imageDarkKey : theme.logo.imageKey;
                    const showImg = theme.logo.mode === "image" && img;
                    return (
                      <div key={v.label} className="rounded-lg p-3 border border-slate-200 text-center" style={{ background: v.bg }}>
                        <span className="inline-flex items-center gap-1.5">
                          {showImg ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={keyUrl(img, 200)!} alt="โลโก้" style={{ height: Math.min(theme.logo.height, 34) }} />
                          ) : (
                            <>
                              {(theme.logo.mode === "icon-text" || theme.logo.mode === "icon") && (
                                <span className="inline-flex items-center justify-center text-white font-semibold" style={{ width: 22, height: 22, borderRadius: 6, background: theme.colors.brand, fontSize: 10 }}>
                                  {theme.logo.mark}
                                </span>
                              )}
                              {(theme.logo.mode === "icon-text" || theme.logo.mode === "text") && (
                                <span className="text-xs font-semibold" style={{ color: v.dark ? "#fff" : theme.colors.ink }}>{theme.logo.text}</span>
                              )}
                            </>
                          )}
                        </span>
                        <p className="text-[9px] mt-1.5" style={{ color: v.dark ? "rgba(255,255,255,.6)" : "#94a3b8" }}>{v.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Header ── */}
          {tab === "header" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">แถบเมนูด้านบน (Header)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>ความสูง · {theme.header.height}px</label>
                  <input type="range" min={48} max={120} value={theme.header.height} onChange={(e) => setHeader({ height: Number(e.target.value) })} className="w-full accent-blue-600" />
                </div>
                <div>
                  <label className={labelCls}>สีพื้นหลัง</label>
                  <select className={inputCls} value={theme.header.bg} onChange={(e) => setHeader({ bg: e.target.value as HeaderBg })}>
                    {choices.headerBg.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ตำแหน่งเมนู</label>
                  <select className={inputCls} value={theme.header.menuAlign} onChange={(e) => setHeader({ menuAlign: e.target.value as MenuAlign })}>
                    {choices.menuAligns.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2 justify-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.sticky} onChange={(e) => setHeader({ sticky: e.target.checked })} />
                    ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.showCart} onChange={(e) => setHeader({ showCart: e.target.checked })} />
                    แสดงไอคอนตะกร้า
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.border} onChange={(e) => setHeader({ border: e.target.checked })} />
                    มีเส้นคั่นด้านล่าง
                  </label>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">* หน้าที่สร้างเองจะเพิ่มเข้าเมนูอัตโนมัติเมื่อเผยแพร่</p>
            </div>
          )}

          {/* ── การ์ดสินค้า ── */}
          {tab === "card" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">การ์ดสินค้า</h3>

              <label className={labelCls}>รูปแบบการ์ด</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {choices.cardPresets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setCard({ preset: p.value })}
                    title={p.hint}
                    className={`px-3.5 py-2 rounded-lg border text-sm transition ${
                      theme.card.preset === p.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>สัดส่วนรูปสินค้า</label>
                  <select className={inputCls} value={theme.card.imageRatio} onChange={(e) => setCard({ imageRatio: e.target.value as ImageRatio })}>
                    {choices.imageRatios.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ชื่อสินค้าแสดงกี่บรรทัด</label>
                  <select className={inputCls} value={theme.card.titleLines} onChange={(e) => setCard({ titleLines: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>เอฟเฟกต์ตอนชี้เมาส์</label>
                  <select className={inputCls} value={theme.card.hover} onChange={(e) => setCard({ hover: e.target.value as CardHover })}>
                    {choices.cardHovers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showBadge} onChange={(e) => setCard({ showBadge: e.target.checked })} />
                  แสดงป้าย (ขายดี/แนะนำ)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showStock} onChange={(e) => setCard({ showStock: e.target.checked })} />
                  แสดงสถานะสต๊อก
                </label>
              </div>
            </div>
          )}

          {/* ── รูปทรง ── */}
          {tab === "shape" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ความมนของขอบ (ทั้งเว็บ)</h3>
              <div className="flex flex-wrap gap-2">
                {choices.radius.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => apply({ ...theme, radius: o.value })}
                    className={`px-4 py-3 border text-sm transition ${theme.radius === o.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    style={{ borderRadius: o.value === "sharp" ? 2 : o.value === "soft" ? 12 : 22 }}
                  >
                    {o.label}
                  </button>
                ))}
                <ResetBtn show={theme.radius !== published.radius} onClick={() => apply({ ...theme, radius: published.radius })} />
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className={labelCls}>ตัวอย่างปุ่มและการ์ด</p>
                <div className="flex items-center gap-3">
                  <span className="px-4 py-2 text-xs font-semibold text-white" style={{ background: theme.colors.brand, borderRadius: theme.radius === "sharp" ? 2 : theme.radius === "soft" ? 10 : 99 }}>ปุ่มหลัก</span>
                  <span className="px-4 py-2 text-xs border" style={{ borderColor: "#d6d6d2", color: theme.colors.ink, borderRadius: theme.radius === "sharp" ? 2 : theme.radius === "soft" ? 10 : 99 }}>ปุ่มรอง</span>
                  <span className="w-16 h-12 border inline-block" style={{ background: theme.colors.surface, borderColor: "#e7e7e4", borderRadius: theme.radius === "sharp" ? 3 : theme.radius === "soft" ? 14 : 24 }} />
                </div>
              </div>
            </div>
          )}

          {/* ── ประวัติ ── */}
          {tab === "history" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ประวัติการเผยแพร่</h3>
              {!versions.length ? (
                <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติ — จะบันทึกทุกครั้งที่กดเผยแพร่</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <li key={v.versionNo} className="flex items-center gap-3 py-2.5">
                      <span className="text-xs text-slate-400 w-10">#{v.versionNo}</span>
                      <span className="flex gap-1">
                        {[v.theme.colors.brand, v.theme.colors.ink, v.theme.colors.page].map((c, i) => (
                          <span key={i} style={{ background: c, width: 14, height: 14, borderRadius: 4, border: "1px solid rgba(0,0,0,.1)" }} />
                        ))}
                      </span>
                      <span className="flex-1 text-xs text-slate-600">
                        {v.theme.fonts.display} / {v.theme.fonts.body} · {timeAgo(v.createdAt)}
                      </span>
                      <button onClick={() => void restore(v.versionNo)} className="text-xs text-blue-600 hover:underline">กู้คืนเป็นร่าง</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── ขวา: พรีวิวเว็บจริง ── */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {DEVICES.map((d) => (
              <button key={d.k} onClick={() => setDevice(d.k)} title={`${d.label} ${d.w}px`} className={`px-2.5 py-1 rounded-lg border text-xs transition ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                {d.icon}
              </button>
            ))}
            <select value={page} onChange={(e) => setPage(e.target.value)} className={inputCls} style={{ width: "auto" }}>
              {PAGES.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
            </select>
            <select
              value={String(zoom)}
              onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))}
              title="ขนาดที่แสดง"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
            >
              <option value="fit">พอดีจอ</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
            {previewSrc && <a href={previewSrc} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>}
            <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="โหลดใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↻</button>
            <span className="text-[10px] text-slate-400 ml-auto">{dev.w}px · {Math.round(scale * 100)}%</span>
          </div>

          <div ref={previewBoxRef} className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: "72vh", minHeight: 420 }}>
            {previewSrc ? (
              <div className="w-full h-full overflow-auto py-2">
                {/* กล่องนอกกว้างเท่า "ขนาดหลังย่อ" — transform ไม่ย่อกล่อง layout ถ้าไม่ครอบแบบนี้จะเหลือที่ว่างมหาศาล */}
                <div style={{ width: dev.w * scale, height: frameH * scale, margin: "0 auto", overflow: "hidden" }}>
                  <iframe
                    ref={iframeRef}
                    src={previewSrc}
                    title="พรีวิวเว็บไซต์"
                    className="bg-white border-0 shadow-sm"
                    style={{
                      width: dev.w,
                      height: frameH,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      // ⚠️ สำคัญ: ถ้าไม่ล็อก iframe จะโดนบีบให้แคบตามกล่อง → เว็บข้างในสลับไปหน้าตามือถือ
                      flexShrink: 0,
                      display: "block",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <span className="text-3xl">🔗</span>
                <p className="text-sm text-slate-500">ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">
            สี/ฟอนต์เปลี่ยนทันที · โลโก้/Header/การ์ด กด ↻ หลังบันทึกร่างเพื่อดูผล
          </p>
        </div>
      </div>

      {/* ── แถบปุ่มล่าง ── */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">
          {isDirty ? (
            <>
              มีการแก้ไขที่ยังไม่บันทึก <span className="font-medium text-amber-700">{dirtyFields.length} รายการ</span>
              <span className="text-slate-400"> · {dirtyFields.slice(0, 3).join(", ")}{dirtyFields.length > 3 ? "…" : ""}</span>
            </>
          ) : hadDraft ? "มีร่างบันทึกไว้ — ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty && !hadDraft} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">ละทิ้งการเปลี่ยนแปลง</button>
          <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
            {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>
    </div>
  );
}
