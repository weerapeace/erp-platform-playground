"use client";

/**
 * 🌐 ศูนย์แปลภาษา — แท็บ "🌐 แปลภาษา" ใน /website/<ร้าน>
 *
 * ทุกข้อความที่ลูกค้าเห็นของร้านนี้อยู่ในตารางเดียว: หน้าแรก · หน้าเว็บ · ธีม (เมนู/ท้ายเว็บ/หน้าสินค้า) ·
 * หมวด + ตัวเลือก/หน่วย · คอลเลกชัน · ข้อมูลร้าน · ชื่อ/คำอธิบายสินค้า
 * กรองตามที่มา/สถานะ/ค้นหา → แปลที่ยังขาดทีเดียว → ตรวจ → บันทึก
 *
 * ข้อมูล: GET /api/website/translations (อ่านทีเดียว) · บันทึกกลับทาง API เดิมของแต่ละแท็บ (สิทธิ์/audit/ล้างแคชตามเดิม)
 *   หน้าแรก/หน้าเว็บ/ธีม: ต่างจากที่เผยแพร่แค่คำแปล = เผยแพร่เลย · มีร่างอื่นค้าง = เก็บเป็นร่าง (ไม่พางานที่ยังไม่พร้อมขึ้นเว็บ)
 * ของกลาง: lib/translation-center (ตัวเชื่อม) · lib/content-translate · components/bilingual-field (ป้าย/แถบ) · SaveBar
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadWebSettings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { SaveBar, useReportUnsaved } from "@/components/save-bar";
import { TranslationBar, TranslationChip } from "@/components/bilingual-field";
import { coverageOf, pickTranslations, type TranslationStatus } from "@/lib/content-i18n";
import { translateContent } from "@/lib/content-translate";
import { THEME_TEXT_KEYS, themeCrumb } from "@/lib/website-theme";
import { CATEGORY_TEXT_KEYS } from "@/lib/website-field-map";
import { COLLECTION_TEXT_KEYS } from "@/lib/website-collections";
import {
  blocksAdapter,
  onlyTranslationsDiffer,
  pathsAdapter,
  productPatch,
  productsAdapter,
  type CenterAdapter,
  type CenterProduct,
  type CenterRow,
} from "@/lib/translation-center";

type Blocks = unknown[];
interface Payload {
  shop: { id: string; slug: string; name: string };
  layout: { published: Blocks; draft: Blocks | null };
  pages: { id: string; slug: string; title: string; published: Blocks; draft: Blocks | null }[];
  theme: { published: Record<string, unknown>; draft: Record<string, unknown> | null };
  fieldMap: Record<string, unknown>;
  collections: (Record<string, unknown> & { id: string; name: string; title: string })[];
  info: Record<string, unknown>;
  products: CenterProduct[];
  /** ฟิลด์ข้อความร้านที่แปลได้ (จาก /api/website/settings) */
  infoKeys: string[];
}

/** 1 แหล่งข้อความ = ค่าที่แก้อยู่ + ตัวเชื่อม + วิธีบันทึก */
interface Source {
  key: string;
  label: string;
  icon: string;
  group: string;
  value: unknown;
  adapter: CenterAdapter<unknown>;
}

const STATUS_FILTERS: { k: "all" | "todo" | TranslationStatus; l: string }[] = [
  { k: "todo", l: "ยังต้องทำ" },
  { k: "empty", l: "ยังไม่มี EN" },
  { k: "stale", l: "ไทยเปลี่ยน" },
  { k: "ai", l: "AI รอตรวจ" },
  { k: "ok", l: "ครบแล้ว" },
  { k: "all", l: "ทั้งหมด" },
];

const FM_CRUMB: Record<string, string> = { categories: "หมวด", options: "ตัวเลือกชุดที่ 1", options2: "ตัวเลือกชุดที่ 2", unit: "หน่วย", label: "ชื่อ", blurb: "คำโปรย", seoTitle: "ชื่อใน Google", seoDescription: "คำอธิบายใน Google", default: "หน่วยตั้งต้น" };
const COL_CRUMB: Record<string, string> = { title: "ชื่อบนเว็บ", story: "เรื่องราว", seoTitle: "ชื่อใน Google", seoDescription: "คำอธิบายใน Google" };

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";

export function WebsiteTranslationCenter({ shopSlug }: { shopSlug: string }) {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [srcFilter, setSrcFilter] = useState<string>("all");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["k"]>("todo");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, s] = await Promise.all([
        apiFetch(`/api/website/translations?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json()),
        loadWebSettings<{ key: string; i18n?: boolean }>(shopSlug, true),
      ]);
      if (j.error) throw new Error(j.error);
      const infoKeys = (s.fields ?? []).filter((f) => f.i18n).map((f) => f.key);
      const p = { ...(j as Payload), infoKeys };
      const list: Source[] = [
        { key: "layout", label: "หน้าแรก", icon: "🧱", group: "หน้าเว็บ", value: p.layout.draft ?? p.layout.published, adapter: blocksAdapter("layout") as CenterAdapter<unknown> },
        ...p.pages.map((pg) => ({
          key: `page:${pg.id}`,
          label: `หน้า ${pg.title || pg.slug}`,
          icon: "📄",
          group: "หน้าเว็บ",
          value: pg.draft ?? pg.published,
          adapter: blocksAdapter(`page:${pg.id}`) as CenterAdapter<unknown>,
        })),
        { key: "theme", label: "ธีม · เมนู · ท้ายเว็บ · หน้าสินค้า", icon: "🎨", group: "ธีม", value: p.theme.draft ?? p.theme.published, adapter: pathsAdapter("theme", THEME_TEXT_KEYS, themeCrumb) as CenterAdapter<unknown> },
        {
          key: "fieldmap",
          label: "หมวด · ตัวเลือก · หน่วย",
          icon: "📂",
          group: "หมวด",
          value: p.fieldMap,
          // เฉพาะส่วนที่เป็นข้อความ (กันช่องรหัส เช่น category.default)
          adapter: scopedPaths("fieldmap", ["categories", "options", "options2", "unit"], [...CATEGORY_TEXT_KEYS, "label", "default"], (f) => FM_CRUMB[f] ?? null),
        },
        // ชื่อบนเว็บว่าง = ใช้ชื่อคอลเลกชันใน ERP มาให้แปล (บันทึกคืนเป็นว่างเหมือนเดิม)
        { key: "collections", label: "คอลเลกชัน", icon: "🎞", group: "คอลเลกชัน", value: p.collections.map((c) => ({ ...c, title: c.title || c.name })), adapter: pathsAdapter("collections", COLLECTION_TEXT_KEYS, (f) => COL_CRUMB[f] ?? null) as CenterAdapter<unknown> },
        { key: "info", label: "ข้อมูลร้าน", icon: "🏪", group: "ข้อมูลร้าน", value: p.info, adapter: pathsAdapter("info", infoKeys, (f) => ((s.fields ?? []) as { key: string; label: string }[]).find((x) => x.key === f)?.label ?? null) as CenterAdapter<unknown> },
        { key: "products", label: "สินค้า", icon: "🛍", group: "สินค้า", value: p.products, adapter: productsAdapter() as CenterAdapter<unknown> },
      ];
      setData(p);
      setSources(list);
      setOriginal(Object.fromEntries(list.map((x) => [x.key, JSON.stringify(x.value)])));
      setError(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดข้อความไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => sources.flatMap((s) => s.adapter.rows(s.value)), [sources]);
  const dirtyKeys = useMemo(() => sources.filter((s) => JSON.stringify(s.value) !== original[s.key]).map((s) => s.key), [sources, original]);
  useReportUnsaved(dirtyKeys.length > 0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (srcFilter === "all" || r.source === srcFilter || (srcFilter === "pages" && r.source.startsWith("page:"))) &&
        (status === "all" || (status === "todo" ? r.status !== "ok" : r.status === status)) &&
        (!needle || r.th.toLowerCase().includes(needle) || r.en.toLowerCase().includes(needle) || r.where.toLowerCase().includes(needle)),
    );
  }, [rows, srcFilter, status, q]);

  const patchSource = (key: string, fn: (v: unknown, a: CenterAdapter<unknown>) => unknown) =>
    setSources((list) => list.map((s) => (s.key === key ? { ...s, value: fn(s.value, s.adapter) } : s)));

  /** แปลหลายแถว (ทุกแหล่ง) ในครั้งเดียว · ผลติดป้าย AI รอตรวจ */
  const translate = async (todo: CenterRow[], scope: string) => {
    if (!todo.length) return;
    setBusy(scope);
    setError(null);
    try {
      const out = await translateContent(todo.map((r) => r.th));
      setSources((list) =>
        list.map((s) => {
          let v = s.value;
          todo.forEach((r, i) => {
            if (r.source === s.key && out[i]?.trim()) v = s.adapter.setEn(v, r.id, out[i].trim(), true);
          });
          return v === s.value ? s : { ...s, value: v };
        }),
      );
      const got = out.filter((x) => x.trim()).length;
      if (!got) throw new Error("แปลไม่สำเร็จ ลองใหม่อีกครั้ง");
      if (got < todo.length) setError(`แปลได้ ${got}/${todo.length} ช่อง — กดอีกครั้งเพื่อแปลส่วนที่เหลือ`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "แปลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  /** บันทึกเฉพาะแหล่งที่แก้ — ทาง API เดิมของแต่ละแท็บ */
  const save = async () => {
    if (!data) return;
    setSaving(true);
    const done: string[] = [];
    const drafts: string[] = [];
    const failed: string[] = [];
    const put = async (url: string, body: unknown, method = "PUT") => {
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `บันทึกไม่สำเร็จ (${r.status})`);
      return j;
    };
    for (const key of dirtyKeys) {
      const s = sources.find((x) => x.key === key)!;
      try {
        if (key === "layout") {
          const publish = onlyTranslationsDiffer(data.layout.published, s.value);
          await put("/api/website/layout", { shopId: data.shop.id, blocks: s.value, mode: publish ? "publish" : "draft" });
          (publish ? done : drafts).push(s.label);
        } else if (key.startsWith("page:")) {
          const pg = data.pages.find((x) => `page:${x.id}` === key)!;
          const publish = onlyTranslationsDiffer(pg.published, s.value);
          await put("/api/website/pages", { pageId: pg.id, blocks: s.value, mode: publish ? "publish" : "draft" });
          (publish ? done : drafts).push(s.label);
        } else if (key === "theme") {
          const publish = onlyTranslationsDiffer(data.theme.published, s.value);
          await put("/api/website/theme", { shopId: data.shop.id, theme: s.value, mode: publish ? "publish" : "draft", note: "🌐 คำแปลภาษาอังกฤษ" });
          (publish ? done : drafts).push(s.label);
        } else if (key === "fieldmap") {
          await put("/api/website/field-map", { shopId: data.shop.id, fieldMap: s.value });
          done.push(s.label);
        } else if (key === "collections") {
          // ชื่อบนเว็บที่เราเติมชื่อ ERP ให้ (เดิมว่าง) → คืนเป็นว่างเหมือนเดิม
          const list = (s.value as Payload["collections"]).map((c, i) => {
            const orig = data.collections[i];
            const { name: _n, ...rest } = c;
            void _n;
            return { ...rest, title: !orig?.title && c.title === orig?.name ? "" : c.title };
          });
          await put("/api/website/collections", { shopId: data.shop.id, collections: list });
          done.push(s.label);
        } else if (key === "info") {
          // แก้เฉพาะช่องคำแปล (patch) — ช่องอื่นของแท็บข้อมูลร้านไม่ถูกทับ
          const v = s.value as Record<string, unknown>;
          const patch: Record<string, unknown> = { ...pickTranslations(v) };
          for (const k of data.infoKeys) patch[`${k}_en`] = String(v[`${k}_en`] ?? "");
          await put("/api/website/settings", { shopId: data.shop.id, patch });
          done.push(s.label);
        } else if (key === "products") {
          const before = new Map(data.products.map((p) => [p.id, p]));
          let n = 0;
          for (const p of s.value as CenterProduct[]) {
            const patch = productPatch(before.get(p.id), p);
            if (!patch) continue;
            await put(`/api/master-v2/parent-skus/${p.id}`, patch, "PATCH");
            n++;
          }
          done.push(`${s.label} ${n} รุ่น`);
        }
      } catch (e) {
        failed.push(`${s.label}: ${e instanceof Error ? e.message : "ไม่สำเร็จ"}`);
      }
    }
    setSaving(false);
    if (failed.length) toast.error(`บันทึกไม่สำเร็จ — ${failed.join(" · ")}`);
    if (done.length) toast.success(`บันทึกแล้ว: ${done.join(" · ")} — เว็บอัปเดตภายใน ~1 นาที`);
    if (drafts.length) toast.success(`เก็บเป็นร่าง: ${drafts.join(" · ")} — มีงานอื่นที่ยังไม่เผยแพร่ค้างอยู่ ไปกด "เผยแพร่" ที่แท็บนั้นเมื่อพร้อม`);
    await load();
  };

  if (loading && !sources.length) return <p className="text-sm text-slate-500 py-8 text-center">กำลังรวบรวมข้อความทั้งร้าน…</p>;

  const srcChips = [
    { k: "all", l: "ทั้งหมด", icon: "🌐" },
    { k: "layout", l: "หน้าแรก", icon: "🧱" },
    ...(data?.pages.length ? [{ k: "pages", l: "หน้าเว็บ", icon: "📄" }] : []),
    { k: "theme", l: "ธีม/เมนู", icon: "🎨" },
    { k: "fieldmap", l: "หมวด/ตัวเลือก", icon: "📂" },
    { k: "collections", l: "คอลเลกชัน", icon: "🎞" },
    { k: "info", l: "ข้อมูลร้าน", icon: "🏪" },
    { k: "products", l: "สินค้า", icon: "🛍" },
  ];
  const countOf = (k: string) => {
    const list = rows.filter((r) => k === "all" || r.source === k || (k === "pages" && r.source.startsWith("page:")));
    return { todo: list.filter((r) => r.status !== "ok").length, total: list.length };
  };
  const labelOf = (key: string) => sources.find((s) => s.key === key);

  // จัดกลุ่มตามที่มา (หัวกลุ่ม 1 ครั้ง)
  let lastSource = "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-base font-semibold text-slate-800">🌐 ศูนย์แปลภาษา</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ทุกข้อความที่ลูกค้าเห็นบนหน้าเว็บภาษาอังกฤษ (/en) ของร้านนี้อยู่ที่นี่ — แปลรวดเดียว ตรวจ แล้วกดบันทึกครั้งเดียว · ช่องที่ยังว่าง ลูกค้าเห็นภาษาไทยแทน
          </p>
        </div>
        <TranslationBar
          className="w-full sm:w-[420px]"
          showSwitch={false}
          coverage={coverageOf(shown)}
          busy={busy === "bulk"}
          error={error}
          onTranslateMissing={() => void translate(shown.filter((r) => r.status === "empty" || r.status === "stale"), "bulk")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {srcChips.map((c) => {
          const n = countOf(c.k);
          const on = srcFilter === c.k;
          return (
            <button
              key={c.k}
              type="button"
              onClick={() => setSrcFilter(c.k)}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}
            >
              {c.icon} {c.l} <span className={n.todo ? "text-amber-600" : "text-emerald-600"}>{n.todo ? `${n.todo}` : "✓"}</span>
              <span className="text-slate-400">/{n.total}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {STATUS_FILTERS.map((f) => (
            <button key={f.k} type="button" onClick={() => setStatus(f.k)} className={`h-8 px-2.5 text-xs ${status === f.k ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} border-l first:border-l-0 border-slate-200`}>
              {f.l}
            </button>
          ))}
        </div>
        <input className={`${inputCls} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหาข้อความ / ตำแหน่ง" />
        <span className="text-xs text-slate-400">{shown.length} ช่อง</span>
        {shown.some((r) => r.status === "ai") && (
          <button
            type="button"
            onClick={() => shown.filter((r) => r.status === "ai").forEach((r) => patchSource(r.source, (v, a) => a.confirm(v, r.id)))}
            className="ml-auto h-8 px-2.5 rounded-lg border border-emerald-200 bg-white text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            title="อ่านแล้ว คำแปล AI ที่เห็นอยู่ถูกต้องทั้งหมด"
          >
            ✓ ตรวจแล้วทั้งหมดที่เห็น ({shown.filter((r) => r.status === "ai").length})
          </button>
        )}
      </div>

      {!shown.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
          {rows.length ? "ไม่มีช่องที่ตรงกับตัวกรอง 🎉" : "ร้านนี้ยังไม่มีข้อความภาษาไทยให้แปล"}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {shown.map((r) => {
            const head = r.source !== lastSource ? labelOf(r.source) : null;
            lastSource = r.source;
            const id = `${r.source}#${r.id}`;
            const setEn = (en: string) => patchSource(r.source, (v, a) => a.setEn(v, r.id, en, false));
            return (
              <li key={id}>
                {head && (
                  <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-600 sticky top-0 z-[1]">
                    {head.icon} {head.label}
                  </div>
                )}
                <div className="px-3 py-2.5 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400 truncate" title={r.where}>{r.where}</p>
                    <p className="text-sm text-slate-700 break-words whitespace-pre-line">{r.th}</p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    {r.long ? (
                      <textarea className={inputCls} rows={r.list ? Math.min(8, r.th.split("\n").length + 1) : 3} value={r.en} placeholder={r.list ? "English (บรรทัดละรายการ)" : "English"} onChange={(e) => setEn(e.target.value)} />
                    ) : (
                      <input className={inputCls} value={r.en} placeholder="English" onChange={(e) => setEn(e.target.value)} />
                    )}
                    <div className="flex items-center gap-1.5">
                      <TranslationChip status={r.status} />
                      <span className="flex-1" />
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void translate([r], id)}
                        className="h-6 px-2 rounded-md border border-indigo-200 bg-white text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {busy === id ? "กำลังแปล…" : r.status === "empty" ? "🌐 แปล" : "🌐 แปลใหม่"}
                      </button>
                      {r.status === "ai" && (
                        <button
                          type="button"
                          onClick={() => patchSource(r.source, (v, a) => a.confirm(v, r.id))}
                          className="h-6 px-2 rounded-md border border-emerald-200 bg-white text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          ✓ ตรวจแล้ว
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SaveBar
        dirty={dirtyKeys.length > 0}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => void load()}
        note={dirtyKeys.length ? `แก้ ${dirtyKeys.length} ส่วน: ${dirtyKeys.map((k) => labelOf(k)?.label ?? k).join(" · ")}` : "บันทึกแล้วเว็บร้านอัปเดตภายใน ~1 นาที"}
      />
    </div>
  );
}

/** ตัวเชื่อมแบบ path แต่ดูเฉพาะบางส่วนของ object (เช่น field map: หมวด/ตัวเลือก/หน่วย — ไม่แตะช่องรหัส) */
function scopedPaths(source: string, parts: string[], keys: readonly string[], crumbOf: (f: string) => string | null): CenterAdapter<unknown> {
  const inner = pathsAdapter<Record<string, unknown>>(source, keys, crumbOf);
  const pick = (v: unknown) => Object.fromEntries(parts.map((p) => [p, (v as Record<string, unknown>)?.[p]]));
  return {
    rows: (v) => inner.rows(pick(v)),
    setEn: (v, id, en, ai) => ({ ...(v as Record<string, unknown>), ...inner.setEn(pick(v), id, en, ai) }),
    confirm: (v, id) => ({ ...(v as Record<string, unknown>), ...inner.confirm(pick(v), id) }),
  };
}
