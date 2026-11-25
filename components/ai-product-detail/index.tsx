"use client";

// ============================================================
// AiProductDetailModal — ป๊อป "✨ ให้ AI คิดรายละเอียดสินค้า" (ของกลาง · 2 ภาษา)
//   AI ดูรูปสินค้า + ข้อมูลที่มีอยู่ → เขียน ชื่อสินค้า / Introduction / Description
//   ทั้งไทยและอังกฤษ แล้วให้ผู้ใช้ t("ติ๊กเลือกทีละช่อง", "Tick each field you want") ว่าจะเอาอันไหน (ไม่ทับทั้งดุ้น)
//   ค่าที่เลือกจะลงในฟอร์มเฉย ๆ — ต้องกดบันทึกเองอีกที
//   ขนาด/น้ำหนัก: เอามาเฉพาะที่ t("มีตัวเลขเขียนอยู่ในรูป", "numbers written in the image") (รูปสเปค/ตารางไซซ์) ห้าม AI กะจากสายตา
//   → แถวขนาดจะไม่ติ๊กให้อัตโนมัติเสมอ ต้องกดยืนยันเอง
// ============================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { useFormDraft } from "@/components/form/use-form-draft";
import { DRAFT_PREFIX, decodeDraft } from "@/lib/form-draft";
import { parseFits, type FitPick } from "@/lib/product-fits";
import { isPhrase, isSlot, slotText, type SnippetItem } from "@/lib/detail-snippets";
import {
  MANUAL_FIELDS, cleanMaterialRules, fitsFromSize, materialHighlights, highlightChoices, isNegativeAnswer, mergeExtras, normalizeExtras, visibleSlots, missingManual, missingTopics, pickParcelBox, templateFor,
  type FitCatalogRow, type MaterialRule, type ParcelBox,
} from "@/lib/ai-draft-setup";
import { CreateTagModal, EditTagModal, ImageStrip, MaterialRuleEditor, RefSelect, RuleQuickEditor, TemplatePicker, WarrantySelect, useDraftSetup, type ImageGroupKey, type MatchedRule } from "@/components/ai-product-detail/wizard-parts";
import { apiFetch } from "@/lib/api";
import { AI_MODEL_CHOICES, productDetailCostThb } from "@/lib/ai-caption-models";
import { ancestorTagsOf, type TagGroupLike } from "@/lib/tag-hierarchy";
import { Spinner } from "@/components/spinner";
import { useTickCatalog } from "@/components/tick-list-field";
import { MaterialQuickPick } from "@/components/material-quick-pick";
import type { MaterialRow } from "@/lib/product-materials";

/** ช่องข้อความสูงตามเนื้อหา — ผลจาก AI อ่านได้ทั้งก้อน ไม่ต้องเลื่อนในช่อง (เจ้าของขอ 2026-11-25) */
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ ...props.style, overflow: "hidden", resize: "none" }} />;
}

/** ช่องข้อความที่ AI เขียนให้ — เรียงตามที่เห็นในฟอร์ม */
const FIELDS: { key: string; label: string; lang: "th" | "en"; long?: boolean }[] = [
  { key: "name_th",             label: "ชื่อสินค้า",          lang: "th" },
  { key: "introduction",        label: "Introduction",        lang: "th", long: true },
  { key: "description",         label: "Description",         lang: "th", long: true },
  { key: "name_en",             label: "Name En",             lang: "en" },
  { key: "introduction_en",     label: "Introduction En",     lang: "en", long: true },
  { key: "english_description", label: "English Description", lang: "en", long: true },
];

type Sizes = Record<string, number | string | null>;
type Result = Record<string, string> & {
  image_count?: number; sizes?: Sizes | null; size_source?: string;
  questions?: string[]; questions_en?: string[]; suggestions?: string[]; rules_used?: string[];
};

const isBlank = (v: unknown) => {
  const s = String(v ?? "").trim();
  return !s || s === "-" || s === "—" || s === "–";
};

/** คำสั่ง AI 1 ระดับ (ค่ากลาง หรือ เฉพาะแบรนด์นี้) */
type PromptRow = { brand_id: string | null; platform: string | null; prompt: string };

/**
 * ช่องที่ตั้งคำสั่ง AI แยกได้ (ตรงกับ PRODUCT_FIELD_KEYS ใน lib/ai-caption.ts)
 * เขียนซ้ำที่นี่เพราะไฟล์นั้นเป็นโค้ดฝั่งเซิร์ฟเวอร์ (ต่อ Supabase/R2) ดึงเข้าหน้าเว็บตรง ๆ ไม่ได้
 */
const CFG_FIELDS: { field: string; label: string; en: string; hint: string }[] = [
  { field: "name_th",      label: "ชื่อสินค้า",   en: "Name En",             hint: "เช่น ขึ้นต้นด้วยแบรนด์ (Collection) ตามด้วยประเภทสินค้า + คำ SEO 3 คำ + รหัสสินค้า" },
  { field: "introduction", label: "Introduction", en: "Introduction En",     hint: "เช่น 2-3 บรรทัด เปิดด้วยปัญหาที่สินค้าช่วยแก้ ปิดด้วยจุดขายเด่น" },
  { field: "description",  label: "Description",  en: "English Description", hint: "เช่น แบ่งเป็นหัวข้อ: จุดเด่น / วัสดุ / ขนาด / การดูแล ใช้ • นำหน้าแต่ละข้อ" },
];

/** แท็กสินค้า 2 ภาษา (product_families) */
type TagRow = { id: string; name: string; name_en?: string | null; group_id?: string | null };

/**
 * เลือกโมเดล AI ที่ใช้เขียน (เก็บที่ ui_config key = ai_product_model)
 * รายการรุ่น + ราคา = ของกลาง lib/ai-caption-models (เพิ่มรุ่นที่นั่นที่เดียว) · ราคาต่อสินค้า 1 ตัว = productDetailCostThb
 */
const fmtBaht = (n: number) => (n < 1 ? n.toFixed(2) : n.toFixed(1));
const MODEL_CHOICES = AI_MODEL_CHOICES.map((m) => ({ ...m, perItem: productDetailCostThb(m) }));

function ModelPicker() {
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch("/api/ui-config?key=ai_product_model").then((r) => r.json())
      .then((j) => setModel(String((j.value ?? {}).model ?? "gpt-4o-mini")))
      .catch(() => setModel("gpt-4o-mini"));
  }, []);

  const save = async (id: string) => {
    setBusy(true); setMsg("");
    try {
      const j = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ai_product_model", value: { model: id } }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setModel(id); setMsg("บันทึกแล้ว — กด “ให้คิดใหม่” เพื่อใช้โมเดลนี้");
    } catch (e) { setMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 mb-2">
      <p className="text-[12px] font-medium text-slate-600 mb-1.5">
        🧠 โมเดล AI ที่ใช้เขียน <span className="font-normal text-slate-400">· ยิ่งแพงยิ่งเขียนดี — ราคาต่อสินค้า 1 ตัว (รูป ~5 ใบ)</span>
      </p>
      <div className="space-y-1">
        {MODEL_CHOICES.map((m) => {
          const on = model === m.id;
          return (
            <button key={m.id} type="button" disabled={busy} onClick={() => void save(m.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition ${on
                ? "border-fuchsia-300 bg-fuchsia-50" : "border-slate-200 hover:bg-slate-50"} disabled:opacity-50`}>
              <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${on ? "border-fuchsia-500 bg-fuchsia-500" : "border-slate-300"}`} />
              <span className="text-[12.5px] font-medium text-slate-700 w-[110px] shrink-0">{m.id}</span>
              <span className="text-[11.5px] text-slate-500 flex-1 min-w-0">{m.note}</span>
              <span className="text-[11.5px] font-semibold text-slate-600 tabular-nums shrink-0">~{fmtBaht(m.perItem)} บาท</span>
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-1.5 text-[11.5px] text-slate-500">{msg}</p>}
      <p className="mt-1 text-[11px] text-slate-400">
        ทั้งระบบ 1,482 สินค้า: {MODEL_CHOICES.filter((m) => ["gpt-4.1-mini", "gpt-5.4-mini", "gpt-5.4"].includes(m.id))
          .map((m) => `${m.id} ≈ ${Math.round(m.perItem * 1482).toLocaleString()} บาท`).join(" · ")}
      </p>
    </div>
  );
}

/**
 * เลือกแท็กให้สินค้าได้จากในป๊อป AI เลย (ไม่ต้องออกไปหน้าอื่น)
 * แท็กมีผลกับ AI 2 ทาง: ① ใช้จับ "กฎตามประเภทสินค้า"  ② ส่งเข้า prompt ให้ AI รู้ว่าสินค้าเป็นของประเภทไหน
 * แสดง 2 ภาษา (ไทย · EN) — แท็กไหนยังไม่มีชื่ออังกฤษ เติมได้ในที่เดียวกัน
 */
function TagPicker({ parentId, onChanged, onCount, onPicked, canRule = false, onEditRule }: {
  parentId: string; onChanged?: () => void; onCount?: (n: number) => void;
  /** แท็กที่ติดอยู่ (ไว้สร้างกฎประเภทจากแท็ก) */
  onPicked?: (tags: { id: string; name: string }[]) => void;
  /** สร้างกฎประเภทไปพร้อมแท็กใหม่ได้ (tasks.approve) */
  canRule?: boolean;
  /** ป๊อปแก้แท็ก → "แก้กฎ" = ไปตั้งค่าประเภทในขั้น 2 */
  onEditRule?: () => void;
}) {
  const [createName, setCreateName] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<TagRow | null>(null);
  const [all, setAll] = useState<TagRow[] | null>(null);
  const [groups, setGroups] = useState<TagGroupLike[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string>("");
  const [open, setOpen] = useState(false);        // ดรอปดาวน์เลือกแท็ก
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/product-tags?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json());
      setAll(((j.tags ?? []) as TagRow[]).filter((t) => t.id && t.name));
      setGroups(((j.groups ?? []) as TagGroupLike[]).map((g) => ({ id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null })));
      setMine(new Set(((j.mine ?? []) as string[]).map(String)));
    } catch { setAll([]); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (all === null) return;
    onCount?.(mine.size);
    onPicked?.(all.filter((t) => mine.has(t.id)).map((t) => ({ id: t.id, name: t.name })));
  }, [all, mine, onCount, onPicked]);

  const setTag = async (tagId: string, on: boolean) => {
    const j = await apiFetch("/api/product-tags", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: parentId, tag_id: tagId, on }),
    }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    setMine((p) => { const n = new Set(p); if (on) n.add(tagId); else n.delete(tagId); return n; });
  };
  // ติดแท็กย่อย → ติดแท็กแม่ให้ด้วย (กฎกลาง lib/tag-hierarchy) · เอาแท็กแม่ออกเองได้
  const toggle = async (t: TagRow) => {
    const on = mine.has(t.id);
    setBusy(t.id); setMsg(""); setInfo("");
    try {
      const parents = on ? [] : ancestorTagsOf(t.id, all ?? [], groups, (x) => x.name).filter((p) => !mine.has(p.id)).reverse();
      for (const p of parents) await setTag(p.id, true);
      await setTag(t.id, !on);
      if (parents.length) setInfo(`ติดแท็กแม่ “${parents.map((p) => p.name).join(", ")}” ให้ด้วย (เอาออกได้)`);
      onChanged?.();
    } catch (e) { setMsg(e instanceof Error ? e.message : "เปลี่ยนแท็กไม่สำเร็จ"); }
    finally { setBusy(""); }
  };

  // หมายเหตุ: การตั้งชื่ออังกฤษของแท็กย้ายไปหน้า Tags Manager (ที่นี่โชว์เฉย ๆ ไม่ให้รก)

  if (all === null) return <p className="text-[12px] text-slate-400"><Spinner /> กำลังโหลดแท็ก…</p>;

  const picked = all.filter((t) => mine.has(t.id));
  const q = search.trim().toLowerCase();
  const options = all
    .filter((t) => !mine.has(t.id))
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.name_en ?? "").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[12.5px] font-medium text-slate-600">แท็กประเภทสินค้า</span>
        <span className="text-[11.5px] text-slate-400">แท็กช่วยให้ AI รู้ว่าเป็นสินค้าประเภทไหน และไปเข้ากฎที่ตั้งไว้</span>
      </div>

      {/* แท็กที่ติดอยู่ = ชิปพร้อมปุ่มเอาออก · เพิ่มแท็กใหม่ผ่านดรอปดาวน์ค้นหาได้ (ไม่กางรายการทั้งหมดให้รก) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {picked.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-emerald-300 bg-emerald-50 text-[12px] text-emerald-700">
            {/* กดชื่อ = แก้แท็ก (ชื่อ/EN/กลุ่ม) · กด ✕ = เอาออกจากสินค้านี้ */}
            <button type="button" onClick={() => setEditTag(t)} title="กดเพื่อแก้แท็ก" className="inline-flex items-center gap-1 hover:underline">
              {t.name}{t.name_en ? <span className="text-emerald-500/70 text-[10.5px]">· {t.name_en}</span> : null}
              <span className="text-emerald-500/70 text-[10px]">✎</span>
            </button>
            <button type="button" disabled={busy === t.id} onClick={() => void toggle(t)} title="เอาแท็กนี้ออก"
              className="w-5 h-5 rounded-full text-emerald-600 hover:bg-emerald-100 disabled:opacity-40">✕</button>
          </span>
        ))}
        {picked.length === 0 && <span className="text-[12px] text-slate-400">ยังไม่ได้ติดแท็ก</span>}

        <div className="relative">
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="h-7 px-2.5 text-[12px] font-medium rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">
            ＋ เพิ่มแท็ก
          </button>
          {open && (
            <div className="absolute z-20 mt-1 w-[260px] bg-white border border-slate-200 rounded-lg shadow-lg p-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus placeholder="ค้นหาแท็ก (ไทย/EN)…"
                className="w-full h-8 px-2 mb-1.5 text-[13px] border border-slate-200 rounded-md" />
              <div className="max-h-44 overflow-y-auto">
                {options.map((t) => (
                  <button key={t.id} type="button" disabled={busy === t.id}
                    onClick={() => { void toggle(t); setSearch(""); }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {t.name}
                    <span className={`ml-1.5 text-[11px] ${t.name_en ? "text-slate-400" : "text-amber-500"}`}>
                      {t.name_en ? `· ${t.name_en}` : "· ยังไม่มี EN"}
                    </span>
                  </button>
                ))}
                {options.length === 0 && <p className="px-2 py-3 text-[12px] text-slate-400 text-center">ไม่พบแท็กที่ค้นหา</p>}
              </div>
              {/* ค้นไม่เจอ/ไม่ตรงเป๊ะ → สร้างแท็กใหม่ได้เลย (ป๊อปใส่ชื่ออังกฤษ/กลุ่ม + สร้างกฎประเภทไปด้วย) */}
              {q && !all.some((t) => t.name.trim().toLowerCase() === q) && (
                <button type="button" onClick={() => { setCreateName(search.trim()); setOpen(false); }}
                  className="mt-1 w-full h-8 px-2 text-[12.5px] font-medium rounded-md border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-left">
                  ＋ สร้างแท็ก “{search.trim()}”
                </button>
              )}
              <p className="mt-1 pt-1 border-t border-slate-100 text-[11px] text-slate-400">
                ตั้งชื่ออังกฤษของแท็กได้ที่หน้า SKU → แท็บ Tags Manager
              </p>
            </div>
          )}
        </div>
      </div>
      {msg && <p className="mt-1 text-[12px] text-rose-600">{msg}</p>}
      {info && !msg && <p className="mt-1 text-[12px] text-emerald-600">✓ {info}</p>}
      {createName !== null && (
        <CreateTagModal parentId={parentId} initialName={createName} groups={groups} canRule={canRule}
          onDone={() => { setSearch(""); void load(); onChanged?.(); }} onClose={() => setCreateName(null)} />
      )}
      {editTag && (
        <EditTagModal tag={editTag} groups={groups} canRule={canRule}
          onDone={() => { void load(); onChanged?.(); }} onEditRule={onEditRule} onClose={() => setEditTag(null)} />
      )}
    </div>
  );
}

/** กฎคำสั่งตามประเภทสินค้า — จับจากแท็กที่ติดไว้ หรือคำที่อยู่ในชื่อสินค้า */
type Rule = {
  id?: string; name: string; tag_ids: string[]; name_keywords: string[]; brand_id: string | null;
  instruction: string; required_topics: string[]; required_topics_en?: string[];
  /** คำตอบแนะนำต่อหัวข้อ { หัวข้อไทย: [ตัวเลือก...] } */
  topic_options?: Record<string, string[]>;
  hint: string | null; is_active?: boolean;
};
type TagOpt = { id: string; name: string };

const EMPTY_RULE: Rule = { name: "", tag_ids: [], name_keywords: [], brand_id: null, instruction: "", required_topics: [], hint: "" };

/**
 * แผงจัดการ t("กฎตามประเภทสินค้า", "Rules by product type")
 * เช่น กฎ "กระเป๋าสตางค์" → บังคับให้ Description บอกจำนวนช่องใส่บัตร/ธนบัตร/อเนกประสงค์เสมอ
 * จับสินค้าได้ 2 ทาง (แท็ก หรือ คำในชื่อ) เพราะของจริงยังติดแท็กประเภทสินค้ากันน้อย
 */
function RulesEditor({ brandId, suggestKeyword }: { brandId?: string | null; suggestKeyword?: string }) {
  const t = useT();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [edit, setEdit] = useState<Rule | null>(null);
  // ⚠️ ต้องเก็บ "ข้อความดิบ" ระหว่างพิมพ์ แล้วค่อยแปลงเป็นรายการตอนบันทึก
  //    เดิมแปลงทุกครั้งที่พิมพ์ (split + filter(Boolean)) → กด Enter/พิมพ์ลูกน้ำแล้วตัวคั่นถูกตัดทันที
  //    = ขึ้นบรรทัดใหม่ไม่ได้เลย (เจ้าของเจอเอง)
  const [topicsText, setTopicsText] = useState("");
  const [topicsEnText, setTopicsEnText] = useState("");
  const [optionsText, setOptionsText] = useState<Record<string, string>>({});   // หัวข้อ → คำตอบแนะนำ (คั่นลูกน้ำ)
  const [keywordsText, setKeywordsText] = useState("");
  const openEdit = (r: Rule) => {
    setEdit(r);
    setTopicsText((r.required_topics ?? []).join("\n"));
    setTopicsEnText((r.required_topics_en ?? []).join("\n"));
    setKeywordsText((r.name_keywords ?? []).join(", "));
    // ⚠️ ต้องเติมคำตอบแนะนำที่บันทึกไว้ด้วย — ถ้าไม่เติม ช่องจะว่างทุกครั้งที่เปิด
    //    และตอนกดบันทึกจะเขียนทับของเดิมด้วยค่าว่าง (ของที่ตั้งไว้หายหมด)
    // เก็บตาม "ลำดับบรรทัด" ไม่ใช่ตามข้อความหัวข้อ — เดิมผูกกับข้อความ พอไปแก้ข้อความหัวข้อ
    // (เช่นเติม ": ตาม Tags เลย") คำตอบแนะนำที่พิมพ์ไว้จะหลุดคีย์แล้วหายตอนบันทึกแบบเงียบ ๆ
    setOptionsText(Object.fromEntries(
      (r.required_topics ?? []).map((tp, i) => [String(i), ((r.topic_options ?? {})[tp] ?? []).join(", ")]),
    ));
  };
  const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const splitCommas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await apiFetch("/api/ai/product-rules").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRules((j.data ?? []) as Rule[]);
      setTags((j.tags ?? []) as TagOpt[]);
    } catch (e) { setRules([]); setMsg(e instanceof Error ? e.message : t("โหลดกฎไม่สำเร็จ", "Could not load rules")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true); setMsg("");
    try {
      // แปลงข้อความดิบ → รายการ ตอนบันทึกเท่านั้น
      const topicsNow = splitLines(topicsText);
      // เก็บคำตอบแนะนำเฉพาะหัวข้อที่ยังอยู่ (ลบหัวข้อออก = ตัวเลือกของมันหายไปด้วย)
      const optsNow: Record<string, string[]> = {};
      topicsNow.forEach((tp, i) => { const v = splitCommas(optionsText[String(i)] ?? ""); if (v.length) optsNow[tp] = v; });
      const payload: Rule = { ...edit, required_topics: topicsNow, required_topics_en: splitLines(topicsEnText), topic_options: optsNow, name_keywords: splitCommas(keywordsText) };
      const j = await apiFetch("/api/ai/product-rules", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setMsg(t("บันทึกกฎแล้ว — กด “ให้คิดใหม่” เพื่อใช้กฎใหม่", "Rule saved — press “Redraft” to use it"));
      setEdit(null); void load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setBusy(false); }
  };

  const del = async (id?: string) => {
    if (!id || !window.confirm(t("ลบกฎนี้?", "Delete this rule?"))) return;
    setBusy(true);
    try {
      const j = await apiFetch(`/api/ai/product-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setEdit(null); void load();
    } catch (e) { setMsg(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setBusy(false); }
  };

  if (rules === null) return <p className="text-[12.5px] text-slate-400 py-2"><Spinner />{t("กำลังโหลดกฎ…", "Loading rules…")}</p>;

  if (edit) {
    const lines = (v: string[]) => v.join("\n");
    return (
      <div className="space-y-2">
        <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          placeholder={t("ชื่อกฎ เช่น กระเป๋าสตางค์", "Rule name, e.g. wallet")}
          className="w-full h-9 px-3 text-[13px] font-medium border border-slate-200 rounded-lg bg-white" />

        <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
          <p className="text-[12px] font-semibold text-slate-600">{t("ใช้กฎนี้กับสินค้าที่… (เข้าข้อใดข้อหนึ่งก็พอ)", "Apply this rule when… (any one match is enough)")}</p>
          <div>
            <p className="text-[11.5px] text-slate-500 mb-1">{t("① ติดแท็กเหล่านี้", "① Has these tags")}</p>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {tags.map((t) => {
                const on = edit.tag_ids.includes(t.id);
                return (
                  <button key={t.id} type="button"
                    onClick={() => setEdit({ ...edit, tag_ids: on ? edit.tag_ids.filter((x) => x !== t.id) : [...edit.tag_ids, t.id] })}
                    className={`h-7 px-2.5 text-[12px] rounded-full border ${on ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {t.name}
                  </button>
                );
              })}
              {tags.length === 0 && <span className="text-[12px] text-slate-400">{t("ยังไม่มีแท็กในระบบ", "No tags in the system yet")}</span>}
            </div>
          </div>
          <div>
            <p className="text-[11.5px] text-slate-500 mb-1">{t("② หรือ ชื่อสินค้ามีคำว่า (คั่นด้วยลูกน้ำ)", "② Or the name contains (comma-separated)")}</p>
            <input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)}
              placeholder={suggestKeyword ? `เช่น ${suggestKeyword}` : t("เช่น กระเป๋าสตางค์, wallet", "e.g. wallet, purse")}
              className="w-full h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg" />
          </div>
        </div>

        <div>
          <p className="text-[11.5px] text-slate-500 mb-1">{t("หัวข้อที่ Description ต้องมีเสมอ (บรรทัดละหัวข้อ)", "Headings the description must always include (one per line)")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <textarea value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={4}
              placeholder={"จำนวนช่องใส่บัตร\nจำนวนช่องใส่ธนบัตร\nช่องอเนกประสงค์"}
              className="w-full px-2.5 py-2 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
            {/* หัวข้อฉบับอังกฤษ (บรรทัดต่อบรรทัดกับฝั่งไทย) — เว้นได้ ระบบจะใช้ไทยแทน */}
            <textarea value={topicsEnText} onChange={(e) => setTopicsEnText(e.target.value)} rows={4}
              placeholder={"Number of card slots\nNumber of bill compartments\nMulti-purpose compartment"}
              className="w-full px-2.5 py-2 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {t("ช่องซ้าย = ไทย · ช่องขวา = อังกฤษ (บรรทัดต่อบรรทัด · เว้นได้ ระบบใช้ไทยแทน) · ช่องเหล่านี้จะไปโผล่เป็นช่องให้กรอกในป๊อป AI", "Left = Thai · Right = English (line by line, optional) · these become answer fields in the AI popup")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{t("ถ้าดูจากรูปไม่ออก AI จะถามกลับให้เองแทนที่จะเดา", "If the images aren't clear, AI asks instead of guessing")}</p>

          {/* คำตอบแนะนำต่อหัวข้อ — ผู้ใช้จะกดเลือกได้เลยในป๊อป (ไม่ต้องพิมพ์) */}
          {splitLines(topicsText).length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
              <p className="text-[11.5px] font-medium text-slate-600">
                {t("คำตอบแนะนำของแต่ละหัวข้อ (คั่นด้วยลูกน้ำ — ไม่บังคับ)", "Suggested answers per heading (comma-separated — optional)")}
              </p>
              {splitLines(topicsText).map((tp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[12px] text-slate-600 w-[38%] shrink-0 truncate" title={tp}>{tp}</span>
                  <input value={optionsText[String(i)] ?? ""} onChange={(e) => setOptionsText((p) => ({ ...p, [String(i)]: e.target.value }))}
                    placeholder={t("เช่น หัวเข็ม, หัวออโต้, หัวกลัด", "e.g. pin-buckle, auto-lock, plate")}
                    className="flex-1 h-8 px-2 text-[12.5px] border border-slate-200 rounded-md bg-white" />
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                {t("ผู้ใช้จะเห็นเป็นปุ่มกดเลือกในป๊อป AI · ยังพิมพ์คำตอบอื่นเองได้", "Users get these as one-tap chips in the AI popup, and can still type their own")}
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-[11.5px] text-slate-500 mb-1">{t("คำสั่งเพิ่มให้ AI (ไม่บังคับ)", "Extra instruction for AI (optional)")}</p>
          <textarea value={edit.instruction} rows={3} onChange={(e) => setEdit({ ...edit, instruction: e.target.value })}
            placeholder={t("เช่น เน้นความจุและการพกพา · บอกด้วยว่าใส่ธนบัตรไทยได้พอดีไหม", "e.g. focus on capacity and portability · say whether Thai banknotes fit")}
            className="w-full px-2.5 py-2 text-[12.5px] border border-slate-200 rounded-lg bg-white" />
        </div>

        <div>
          <p className="text-[11.5px] text-slate-500 mb-1">{t("ใบ้ถาวรของสินค้าประเภทนี้ (ไม่บังคับ — ไม่ต้องพิมพ์ซ้ำทุกครั้ง)", "Saved hints for this product type (optional — no need to retype)")}</p>
          <input value={edit.hint ?? ""} onChange={(e) => setEdit({ ...edit, hint: e.target.value })}
            placeholder={t("เช่น หนัง PU เกรดพรีเมียม ซับในผ้าโพลีเอสเตอร์", "e.g. premium PU leather, polyester lining")}
            className="w-full h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg" />
        </div>

        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          <input type="checkbox" checked={edit.brand_id !== null} className="h-4 w-4 accent-indigo-600" disabled={!brandId}
            onChange={(e) => setEdit({ ...edit, brand_id: e.target.checked ? brandId ?? null : null })} />
          ใช้เฉพาะแบรนด์ของสินค้าตัวนี้ {brandId ? "" : t("(สินค้ายังไม่ระบุแบรนด์)", "(no brand set)")}
        </label>

        {/* ปุ่มบันทึกลอยติดขอบล่าง — เดิมอยู่สุดหน้าจอที่ต้องเลื่อนลงไปหา พิมพ์เสร็จแล้วกดปิดเลย ของหาย */}
        <div className="flex items-center gap-2 flex-wrap sticky bottom-0 -mx-1 px-1 py-2 bg-white/95 backdrop-blur border-t border-slate-200">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="h-8 px-3 text-[12.5px] font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
            {busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกกฎ", "Save rule")}
          </button>
          <button type="button" onClick={() => { setEdit(null); setMsg(""); }} className="h-8 px-3 text-[12.5px] border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          {edit.id && <button type="button" onClick={() => void del(edit.id)} disabled={busy} className="h-8 px-3 text-[12.5px] text-rose-600 hover:bg-rose-50 rounded-lg">{t("ลบกฎนี้", "Delete this rule")}</button>}
          {msg
            ? <span className="text-[12px] text-slate-500">{msg}</span>
            : <span className="text-[11.5px] text-amber-600">{t("พิมพ์เสร็จต้องกด “บันทึกกฎ” ก่อนปิด ไม่งั้นของที่พิมพ์หาย", "Press “Save rule” before closing or your edits are lost")}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && <p className="text-[12.5px] text-slate-400">{t("ยังไม่มีกฎ — กดปุ่มด้านล่างเพื่อสร้างกฎแรก", "No rules yet — use the button below to add the first one")}</p>}
      {rules.map((r) => (
        <button key={r.id} type="button" onClick={() => openEdit({ ...r, hint: r.hint ?? "" })}
          className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="text-[12.5px] text-slate-700">{r.name}</b>
            {(r.required_topics ?? []).length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">บังคับ {r.required_topics.length} หัวข้อ</span>
            )}
            {r.hint && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{t("มีใบ้ถาวร", "has saved hints")}</span>}
          </div>
          <p className="text-[11.5px] text-slate-400 mt-0.5">
            {(r.tag_ids ?? []).length > 0 && `แท็ก ${r.tag_ids.length} รายการ`}
            {(r.tag_ids ?? []).length > 0 && (r.name_keywords ?? []).length > 0 && " · "}
            {(r.name_keywords ?? []).length > 0 && `ชื่อมีคำว่า: ${r.name_keywords.join(", ")}`}
          </p>
        </button>
      ))}
      <button type="button" onClick={() => openEdit({ ...EMPTY_RULE, name_keywords: suggestKeyword ? [suggestKeyword] : [] })}
        className="h-8 px-3 text-[12.5px] font-medium rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
        + สร้างกฎใหม่
      </button>
      {msg && <span className="ml-2 text-[12px] text-slate-500">{msg}</span>}
    </div>
  );
}

/**
 * ✨ ป๊อปให้ AI ร่างรายละเอียดสินค้า — แบบแท็บ 5 ขั้น (เจ้าของเลือก 2026-11-25 · Theme แบบ B · รูปแบบ A)
 *   ① ตั้งต้น: คัดลอกจากรุ่นเก่า (ติ๊กเลือกกลุ่ม) · แท็กประเภทสินค้า (บังคับ) · ชุดแม่แบบ · ช่องที่ให้ AI เขียน
 *   ② ประเภท & จุดเด่น: หัวข้อที่ต้องตอบตามกฎ (บังคับ) + ⚙ ตั้งค่าหัวข้อในตัว · จุดเด่นแบบติ๊ก (+ AI แนะนำ) · จำนวนช่อง · ใบ้
 *   ③ ขนาด & กล่อง: AI อ่านตัวเลขจากรูป (แก้ได้) → ใส่อะไรได้ (คิดจากขนาด) → กล่องไปรษณีย์เล็กสุดที่ใส่ได้
 *   ④ AI ร่าง: ชื่อ/Introduction/Description ไทย+EN ตามแม่แบบ · แก้ได้ · แปลอีกภาษาตาม
 *   ⑤ กรอกมือ: ประกัน · Custom size · Size/Special description (บังคับตามกฎ)
 *   ข้ามขั้นได้ แต่มีจุดแดงบอกขั้นที่ขาด · กด AI ร่างไม่ได้จนกว่าขั้น ①② ครบ · จำร่างค้างต่อสินค้า (useFormDraft)
 *   ค่าที่ได้ลงฟอร์มเฉย ๆ — ต้องกดบันทึกเอง (โหมดดู = บันทึกทันที)
 */
export function AiProductDetailModal({
  parentId, brandId, suggestKeyword, current, onApply, onClose,
}: {
  parentId: string;
  /** แบรนด์ของสินค้าตัวนี้ — ไว้ตั้งคำสั่ง AI / แม่แบบเริ่มต้นเฉพาะแบรนด์ */
  brandId?: string | null;
  /** คำที่เดาจากชื่อสินค้าตัวนี้ — เติมให้ตอนสร้างกฎใหม่ (เช่น "กระเป๋าสตางค์") */
  suggestKeyword?: string;
  /** ค่าปัจจุบันในฟอร์ม (ไว้เทียบว่าจะทับของเดิมไหม) */
  current: Record<string, unknown>;
  /** ค่าที่จะลงฟอร์ม — ข้อความ = string · ใส่อะไรได้ = array · ล้างค่า = null */
  onApply: (values: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { can } = useAuth();
  const canRule = can("tasks.approve" as Parameters<typeof can>[0]);   // แก้กฎ/แม่แบบ = สิทธิ์เดียวกับหลังบ้าน (product-rules)
  const canTpl = canRule && can("products.edit");
  const STEPS = [t("ตั้งต้น", "Start"), t("ประเภท & จุดเด่น", "Type & highlights"), t("ขนาด & กล่อง", "Size & box"), t("AI ร่าง", "AI draft"), t("กรอกมือ", "Manual")];
  const [step, setStep] = useState(0);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  // ── แผงตั้งคำสั่ง AI (เปิด/ปิดในป๊อปเดียวกัน ไม่ต้องออกไปหน้าตั้งค่า) ──
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgTab, setCfgTab] = useState<"main" | "rules">("main");
  const [cfgField, setCfgField] = useState<string>("");   // "" = คำสั่งรวมทุกช่อง · ไม่ว่าง = คำสั่งเฉพาะช่องนั้น
  const [cfgScope, setCfgScope] = useState<"global" | "brand">("global");
  const [cfgRows, setCfgRows] = useState<PromptRow[] | null>(null);
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");

  /**
   * ข้อความที่พิมพ์ค้างไว้ แยกตาม "ช่อง + ระดับ" — สลับช่องแล้วกลับมา ข้อความเดิมยังอยู่
   * (เดิมเก็บเป็นค่าเดียว สลับช่องทีไรของที่พิมพ์ยังไม่บันทึกหายทุกที)
   */
  const cfgKey = `${cfgScope}|${cfgField}`;
  const [cfgEdits, setCfgEdits] = useState<Record<string, string>>({});
  const platOf = (field: string) => (field ? `product_detail:${field}` : "product_detail");
  /** ข้อความที่บันทึกไว้จริงของช่อง+ระดับที่กำลังดู */
  const cfgSaved = (cfgRows ?? []).find(
    (r) => r.platform === platOf(cfgField) && r.brand_id === (cfgScope === "brand" ? brandId ?? null : null),
  )?.prompt ?? "";
  const cfgDraft = cfgEdits[cfgKey] ?? cfgSaved;
  const setCfgDraft = (v: string) => setCfgEdits((d) => ({ ...d, [cfgKey]: v }));
  const cfgDirty = cfgDraft.trim() !== cfgSaved.trim();

  const loadCfg = useCallback(async () => {
    try {
      const j = await apiFetch("/api/ai/caption-prompts").then((r) => r.json());
      setCfgRows(((j.data ?? []) as PromptRow[]).filter((r) => String(r.platform ?? "").startsWith("product_detail")));
    } catch { setCfgRows([]); }
  }, []);
  useEffect(() => { if (cfgOpen && cfgRows === null) void loadCfg(); }, [cfgOpen, cfgRows, loadCfg]);
  // สลับช่อง/ระดับ → ล้างข้อความสถานะเท่านั้น (ข้อความที่พิมพ์ค้างเก็บไว้ใน cfgEdits ไม่หาย)
  useEffect(() => { setCfgMsg(""); }, [cfgScope, cfgField]);

  const saveCfg = async () => {
    if (!cfgDraft.trim()) { setCfgMsg(t("กรุณาใส่คำสั่งก่อนบันทึก", "Please enter a prompt before saving")); return; }
    setCfgBusy(true); setCfgMsg("");
    try {
      const j = await apiFetch("/api/ai/caption-prompts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: cfgScope === "brand" ? brandId : null, platform: cfgField ? `product_detail:${cfgField}` : "product_detail", prompt: cfgDraft.trim() }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setCfgMsg(t("บันทึกคำสั่งแล้ว — กด “ให้คิดใหม่” เพื่อใช้คำสั่งใหม่", "Prompt saved — press “Redraft” to use it"));
      setCfgEdits((d) => { const n = { ...d }; delete n[cfgKey]; return n; });   // บันทึกแล้ว → กลับไปอ่านค่าจากฐานข้อมูล
      setCfgRows(null); void loadCfg();
    } catch (e) { setCfgMsg(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setCfgBusy(false); }
  };

  /** ลบคำสั่งของช่อง/ระดับที่กำลังดู → กลับไปใช้คำสั่งรวม (หรือค่าในโค้ด) */
  const delCfg = async () => {
    setCfgBusy(true); setCfgMsg("");
    try {
      const plat = cfgField ? `product_detail:${cfgField}` : "product_detail";
      const qs = new URLSearchParams({ platform: plat });
      if (cfgScope === "brand" && brandId) qs.set("brand_id", brandId);
      const j = await apiFetch(`/api/ai/caption-prompts?${qs.toString()}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setCfgEdits((d) => { const n = { ...d }; delete n[cfgKey]; return n; });
      setCfgMsg(t("ลบคำสั่งนี้แล้ว", "Prompt removed"));
      setCfgRows(null); void loadCfg();
    } catch (e) { setCfgMsg(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setCfgBusy(false); }
  };

  // คำตอบหัวข้อบังคับ + คำถามที่ AI ถามกลับ (คีย์ = คำถามฉบับไทย)
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pickFields, setPickFields] = useState<string[]>(["name", "intro", "desc"]);

  // ── แท็ก + กฎตามประเภทสินค้าที่สินค้านี้เข้า ──
  const [tagCount, setTagCount] = useState<number | null>(null);
  const [tagTick, setTagTick] = useState(0);          // คัดลอกแท็กจากรุ่นเก่าแล้ว → โหลดแท็ก/กฎใหม่
  const [rulesTick, setRulesTick] = useState(0);      // แก้กฎในขั้น 2 แล้ว → โหลดใหม่
  const [rulesMatched, setRulesMatched] = useState<MatchedRule[]>([]);
  const [ruleEditOpen, setRuleEditOpen] = useState(false);
  const [pickedTags, setPickedTags] = useState<{ id: string; name: string }[]>([]);
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  useEffect(() => {
    let off = false;
    apiFetch(`/api/ai/product-rules?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json())
      .then((j) => { if (!off) setRulesMatched((j.matched ?? []) as MatchedRule[]); })
      .catch(() => { if (!off) setRulesMatched([]); });
    return () => { off = true; };
  }, [parentId, rulesTick, tagTick]);
  const topics = useMemo(() => {
    const out: { th: string; en: string; rule: string; options: string[]; optionsEn: string[] }[] = [];
    for (const r of rulesMatched) {
      const exEn = normalizeExtras(r.extras).topic_options_en;
      const en = r.required_topics_en ?? [];
      (r.required_topics ?? []).forEach((topic, i) => {
        if (topic && !out.some((x) => x.th === topic)) out.push({ th: topic, en: en[i] ?? "", rule: r.name, options: (r.topic_options ?? {})[topic] ?? [], optionsEn: exEn[topic] ?? [] });
      });
    }
    return out;
  }, [rulesMatched]);
  const extras = useMemo(() => mergeExtras(rulesMatched.map((r) => r.extras)), [rulesMatched]);
  const topicLabel = (x: { th: string; en: string }) => (t("th", "en") === "en" && x.en ? x.en : x.th);

  // ── ชุดแม่แบบ ──
  const { setup, save: saveSetup } = useDraftSetup();
  const [tplId, setTplId] = useState<string | null>(null);
  useEffect(() => { if (setup && !tplId) setTplId(templateFor(setup, brandId)?.id ?? null); }, [setup, tplId, brandId]);
  const tpl = setup?.templates.find((x) => x.id === tplId && !x.archived) ?? null;

  // ── จุดเด่น ──
  const [hl, setHl] = useState<string[]>([]);
  const [hlInput, setHlInput] = useState("");
  const [aiHl, setAiHl] = useState<string[]>([]);
  const [aiHlEn, setAiHlEn] = useState<Record<string, string>>({});
  const [aiHlBusy, setAiHlBusy] = useState(false);
  const [aiHlAllowed, setAiHlAllowed] = useState(true);
  useEffect(() => {
    apiFetch("/api/ai/desc-highlights?check=1").then((r) => r.json()).then((j) => setAiHlAllowed(j?.data?.allowed !== false)).catch(() => { /* ให้หลังบ้านตัดสินตอนกด */ });
  }, []);
  const toggleHl = (h: string) => {
    // เอาติ๊กจุดเด่นที่ระบบติ๊กให้จากวัสดุออก = จำไว้ ไม่ติ๊กให้ซ้ำ (ติ๊กกลับได้)
    if (hl.includes(h) && matAutoHl.some((x) => x.highlight === h)) setHlOff((p) => [...new Set([...p, h])]);
    if (!hl.includes(h)) setHlOff((p) => p.filter((x) => x !== h));
    setHl((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));
  };
  const askAiHl = async () => {
    setAiHlBusy(true);
    try {
      const j = await apiFetch("/api/ai/desc-highlights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, shown: [...extras.highlights, ...aiHl], chosen: hl, extra: extra.trim() || undefined }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const raw = ((j.data?.items ?? []) as { th?: string; en?: string }[]).map((x) => ({ th: String(x.th ?? "").trim(), en: String(x.en ?? "").trim() })).filter((x) => x.th);
      setAiHl((p) => [...new Set([...p, ...raw.map((x) => x.th)])]);
      setAiHlEn((p) => ({ ...p, ...Object.fromEntries(raw.filter((x) => x.en).map((x) => [x.th, x.en])) }));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("AI แนะนำไม่สำเร็จ", "AI suggestions failed")); }
    finally { setAiHlBusy(false); }
  };

  // ── จำนวนช่อง (คลังกลางเดียวกับป๊อปแทรกรายละเอียด: product_highlight_items ชนิด slot) ──
  const [slotItems, setSlotItems] = useState<SnippetItem[] | null>(null);
  const [phraseItems, setPhraseItems] = useState<SnippetItem[]>([]);   // คลังประโยคกลาง = จุดเด่นให้เลือกเมื่อประเภทยังไม่ได้ตั้ง
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [showAllSlots, setShowAllSlots] = useState(false);
  useEffect(() => {
    apiFetch("/api/master-v2/product_highlight_items?limit=1000").then((r) => r.json())
      .then((j) => {
        const all = ((j.data ?? []) as SnippetItem[]).filter((x) => x.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setSlotItems(all.filter((x) => isSlot(x)));
        setPhraseItems(all.filter((x) => isPhrase(x)));
      })
      .catch(() => setSlotItems([]));
  }, []);

  // จุดเด่นให้เลือก: ชุดของประเภท · ไม่ได้ตั้ง = คลังประโยคกลาง
  const hlChoices = highlightChoices(extras, phraseItems.map((x) => x.name));

  // ── วัสดุ (ของกลาง MaterialQuickPick · ตาราง product_materials เดียวกับป๊อปแทรกรายละเอียด) — เจ้าของขอ 2026-11-25 ──
  const { data: matRows } = useTickCatalog("product_materials");
  const matList = useMemo(() => ((matRows ?? []) as unknown as MaterialRow[]).filter((m) => m.is_active !== false), [matRows]);
  const [mats, setMats] = useState<string[]>([]);
  const [hlOff, setHlOff] = useState<string[]>([]);   // จุดเด่นจากวัสดุที่คนเอาติ๊กออกเอง — ไม่ติ๊กให้ซ้ำ
  const [matRuleOpen, setMatRuleOpen] = useState(false);
  const [typeTopic, setTypeTopic] = useState<string | null>(null);   // หัวข้อ Yes/No ที่กำลังพิมพ์คำตอบเอง
  /** บันทึกกติกาวัสดุ → จุดเด่น (ui_config ai_desc_templates · audit ที่ API) + ย้อนกลับได้ */
  const saveMatRules = async (rules: MaterialRule[]) => {
    if (!setup) return;
    const prev = setup;
    try {
      await saveSetup({ ...setup, material_rules: cleanMaterialRules(rules) });
      toast.undo(t("บันทึกกติกาวัสดุแล้ว", "Material rules saved"), async () => { try { await saveSetup(prev); } catch (e) { toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); } });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
  };
  const pickedMats = useMemo(() => mats.flatMap((id) => matList.filter((m) => m.id === id)), [mats, matList]);
  const matAutoHl = useMemo(() => materialHighlights(setup?.material_rules ?? [], pickedMats), [setup?.material_rules, pickedMats]);
  // เลือกวัสดุที่เข้ากติกา → ติ๊กจุดเด่นให้ (เช่น หนังวัว → ผลิตจากหนังวัวแท้ 100%)
  useEffect(() => {
    const add = matAutoHl.map((x) => x.highlight).filter((h) => !hlOff.includes(h));
    if (add.some((h) => !hl.includes(h))) setHl((p) => [...new Set([...p, ...add])]);
  }, [matAutoHl, hlOff]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** ชื่อจุดเด่นภาษาอังกฤษ (กฎประเภท → คลังกลาง → AI → กติกาวัสดุ) */
  const hlEn = (h: string) => extras.highlights_en[h] || phraseItems.find((x) => x.name === h)?.name_en || aiHlEn[h] || (setup?.material_rules ?? []).find((x) => x.highlight === h)?.highlight_en || "";
  const matName = (m: MaterialRow) => t(m.name, m.name_en?.trim() || m.name);

  // ── รูปที่ AI จะดู ──
  const [imgKeys, setImgKeys] = useState<string[] | null>(null);
  const [imgGroups, setImgGroups] = useState<Record<string, ImageGroupKey> | undefined>(undefined);
  const [imgMax, setImgMax] = useState(10);
  const [skip, setSkip] = useState<string[]>([]);
  useEffect(() => {
    apiFetch(`/api/ai/product-detail?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json())
      .then((j) => { setImgKeys((j.data?.keys ?? []) as string[]); if (j.data?.groups) setImgGroups(j.data.groups as Record<string, ImageGroupKey>); if (j.data?.max) setImgMax(Number(j.data.max)); })
      .catch(() => setImgKeys([]));
  }, [parentId]);

  // ── ขนาด ──
  const SIZE_INPUTS = [
    { key: "size_length_cm", label: t("กว้าง/ยาว (ซม.)", "Length (cm)") },
    { key: "size_height_cm", label: t("สูง (ซม.)", "Height (cm)") },
    { key: "size_thickness_cm", label: t("หนา (ซม.)", "Depth (cm)") },
    { key: "weight_g", label: t("น้ำหนัก (กรัม)", "Weight (g)") },
  ];
  const curStr = (k: string) => (current[k] === null || current[k] === undefined ? "" : String(current[k]));
  const [sizes, setSizes] = useState<Record<string, string>>(() => Object.fromEntries(SIZE_INPUTS.map((f) => [f.key, curStr(f.key)])));
  const [sizeBusy, setSizeBusy] = useState(false);
  const [sizeMsg, setSizeMsg] = useState("");
  const readSizes = async () => {
    setSizeBusy(true); setSizeMsg("");
    try {
      const j = await apiFetch("/api/ai/product-detail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, sizes_only: true, skip_keys: skip }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const sz = (j.data?.sizes ?? null) as Record<string, number | null> | null;
      const st = (j.data?.strap ?? null) as { has_strap?: boolean | null; has_handle?: boolean | null; strap_drop_cm?: number | null; strap_drop_max_cm?: number | null; handle_drop_cm?: number | null } | null;
      if (st) setStrap((p) => ({
        ...p, byAi: true,
        has: typeof st.has_strap === "boolean" ? st.has_strap : p.has,
        handle: typeof st.has_handle === "boolean" ? st.has_handle : p.handle,
        drop: st.strap_drop_cm ? String(st.strap_drop_cm) : p.drop,
        max: st.strap_drop_max_cm ? String(st.strap_drop_max_cm) : p.max,
        handleDrop: st.handle_drop_cm ? String(st.handle_drop_cm) : p.handleDrop,
      }));
      if (!sz) { setSizeMsg(t("ไม่พบตัวเลขขนาดเขียนอยู่ในรูป — กรอกเองได้เลย", "No size numbers in the images — type them in")); return; }
      setSizes((p) => { const n = { ...p }; for (const f of SIZE_INPUTS) if (sz[f.key] !== null && sz[f.key] !== undefined) n[f.key] = String(sz[f.key]); return n; });
      setSizeMsg(t(`อ่านจาก: ${j.data?.size_source || "รูปสินค้า"} — ตรวจกับของจริงก่อนใช้`, `Read from: ${j.data?.size_source || "images"} — check against the real product`));
    } catch (e) { setSizeMsg(e instanceof Error ? e.message : t("อ่านขนาดไม่สำเร็จ", "Could not read sizes")); }
    finally { setSizeBusy(false); }
  };
  const dims = { w: sizes.size_length_cm, h: sizes.size_height_cm, d: sizes.size_thickness_cm };

  // ── สาย / หูกระเป๋า (ช่องของสินค้าเดิม: strap_drop_cm · strap_drop_max_cm · handle_drop_cm) — เจ้าของขอ 2026-11-25 ──
  //    มีสาย/มีหู = ติ๊ก (AI ดูรูปติ๊กให้ก่อนได้) · ความยาว = ตัวเลขที่เขียนในรูป หรือพิมพ์เอง · ไม่ติ๊ก = ไม่เขียนเรื่องนี้
  const [strap, setStrap] = useState(() => ({
    has: Number(current.strap_drop_cm) > 0, drop: curStr("strap_drop_cm"), max: curStr("strap_drop_max_cm"),
    handle: Number(current.handle_drop_cm) > 0, handleDrop: curStr("handle_drop_cm"), byAi: false,
  }));
  /** บรรทัดข้อมูลสาย/หูหิ้วที่ส่งให้ AI */
  const strapFacts = (): string => {
    const parts: string[] = [];
    if (strap.has) parts.push(`มีสายสะพาย/สายคล้อง${Number(strap.drop) > 0 ? ` ยาว ${strap.drop} ซม.` : ""}${Number(strap.max) > 0 ? ` ปรับได้ถึง ${strap.max} ซม.` : ""}`);
    if (strap.handle) parts.push(`มีหูหิ้ว${Number(strap.handleDrop) > 0 ? ` สูง ${strap.handleDrop} ซม.` : ""}`);
    return parts.length ? `สาย/หูกระเป๋า: ${parts.join(" · ")}` : "สินค้านี้ไม่มีสายสะพายและไม่มีหูหิ้ว — ห้ามเขียนเรื่องสาย";
  };
  // เข้าขั้นขนาดครั้งแรก + สินค้ายังไม่เคยตั้งสาย/หู → ให้ AI ดูรูปติ๊กให้ก่อน 1 ครั้ง (ข้อเสนอ 3 · คนแก้ได้)
  const autoStrapRef = useRef(false);
  useEffect(() => {
    if (step !== 2 || autoStrapRef.current || strap.byAi || !imgKeys?.length) return;
    if (Number(current.strap_drop_cm) > 0 || Number(current.handle_drop_cm) > 0) return;
    autoStrapRef.current = true;
    void readSizes();
  }, [step, imgKeys]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── ใส่อะไรได้ (คิดจากขนาด) ──
  const [fitRows, setFitRows] = useState<FitCatalogRow[] | null>(null);
  const [fitPicks, setFitPicks] = useState<FitPick[]>(() => parseFits(current.fits));
  const [fitTouched, setFitTouched] = useState(false);
  useEffect(() => {
    apiFetch("/api/master-v2/product_fit_items?limit=1000").then((r) => r.json())
      .then((j) => setFitRows((j.data ?? []) as FitCatalogRow[])).catch(() => setFitRows([]));
  }, []);
  const fitSug = useMemo(() => (fitRows ? fitsFromSize(dims, fitRows) : []), [fitRows, dims.w, dims.h, dims.d]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ยังไม่เคยตั้ง "ใส่อะไรได้" + ยังไม่ได้แตะ → ติ๊กของที่ใส่ได้ตามขนาดให้ก่อน (เจ้าของขอ: ใส่ตามที่วัดจากขนาดก่อน)
  useEffect(() => {
    if (fitTouched || parseFits(current.fits).length > 0) return;
    setFitPicks(fitSug.filter((x) => x.fits).map((x) => ({ id: x.id, size: x.size })));
  }, [fitSug, fitTouched, current.fits]);
  const toggleFit = (id: string, size: string | null) => {
    setFitTouched(true);
    setFitPicks((p) => (p.some((x) => x.id === id) ? p.filter((x) => x.id !== id) : [...p, { id, size }]));
  };
  const fitName = (id: string) => fitRows?.find((x) => x.id === id)?.name ?? id;

  // ── กล่องไปรษณีย์ ──
  const [boxes, setBoxes] = useState<ParcelBox[] | null>(null);
  const [parcelId, setParcelId] = useState<string>(curStr("parcel_size_id"));
  const [parcelManual, setParcelManual] = useState<boolean>(!!curStr("parcel_size_id"));
  useEffect(() => {
    apiFetch("/api/master-v2/parcel_sizes?limit=200").then((r) => r.json())
      .then((j) => setBoxes((j.data ?? []) as ParcelBox[])).catch(() => setBoxes([]));
  }, []);
  const autoBox = useMemo(() => (boxes ? pickParcelBox(dims, boxes) : null), [boxes, dims.w, dims.h, dims.d]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!parcelManual && autoBox) setParcelId(autoBox.id); }, [autoBox, parcelManual]);
  const boxLabel = (b: ParcelBox) => `${b.name}${b.size_text ? ` (${b.size_text})` : ` (${b.width_cm}×${b.length_cm}×${b.height_cm} ซม.)`}`;

  // ── ช่องกรอกมือ ──
  const [manual, setManual] = useState<Record<string, string>>(() => Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, curStr(f.key)])));

  // ── คัดลอกจากรุ่นเก่า ──
  const COPY_GROUPS = [
    { key: "tags", label: t("แท็ก", "Tags") },
    { key: "answers", label: t("คำตอบ/จุดเด่น/ช่อง", "Answers/highlights/slots") },
    { key: "size", label: t("ขนาด/ใส่อะไรได้/กล่อง", "Size/fits/box") },
    { key: "manual", label: t("ช่องกรอกมือ", "Manual fields") },
    { key: "text", label: t("ตัวอย่าง Description", "Description example") },
  ];
  const [copySrc, setCopySrc] = useState<ParentSkuPickerValue | null>(null);
  const [copyGroups, setCopyGroups] = useState<string[]>(["tags", "answers", "manual", "text"]);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [refText, setRefText] = useState("");
  const [refFrom, setRefFrom] = useState("");

  // ── จำร่างค้างไว้ต่อสินค้า (ของกลาง useFormDraft · เก็บในเครื่องนี้ 7 วัน) ──
  const snapshot = { step, tplId, pickFields, answers, hl, aiHl, mats, hlOff, strap, slots, extra, sizes, fitPicks, fitTouched, parcelId, parcelManual, manual, skip, res, picked, refText, refFrom };
  const dirty = step > 0 || Object.values(answers).some((v) => v.trim()) || hl.length > 0 || mats.length > 0 || !!extra.trim() || res !== null || Object.keys(slots).length > 0;
  const draft = useFormDraft({ key: `ai-draft:${parentId}`, values: snapshot as unknown as Record<string, unknown>, dirty, active: true });
  const restore = (v: Record<string, unknown> | null) => {
    if (!v) return;
    const s = v as Partial<typeof snapshot>;
    if (typeof s.step === "number") setStep(Math.min(4, Math.max(0, s.step)));
    if (s.tplId) setTplId(s.tplId);
    if (Array.isArray(s.pickFields) && s.pickFields.length) setPickFields(s.pickFields);
    if (s.answers) setAnswers(s.answers);
    if (Array.isArray(s.hl)) setHl(s.hl);
    if (Array.isArray(s.aiHl)) setAiHl(s.aiHl);
    if (Array.isArray(s.mats)) setMats(s.mats);
    if (Array.isArray(s.hlOff)) setHlOff(s.hlOff);
    if (s.strap && typeof s.strap === "object") setStrap((p) => ({ ...p, ...s.strap }));
    if (s.slots) setSlots(s.slots);
    if (typeof s.extra === "string") setExtra(s.extra);
    if (s.sizes) setSizes((p) => ({ ...p, ...s.sizes }));
    if (Array.isArray(s.fitPicks)) setFitPicks(s.fitPicks);
    if (s.fitTouched) setFitTouched(true);
    if (typeof s.parcelId === "string") setParcelId(s.parcelId);
    if (s.parcelManual) setParcelManual(true);
    if (s.manual) setManual((p) => ({ ...p, ...s.manual }));
    if (Array.isArray(s.skip)) setSkip(s.skip);
    if (s.res) setRes(s.res);
    if (s.picked) setPicked(s.picked);
    if (typeof s.refText === "string") setRefText(s.refText);
    if (typeof s.refFrom === "string") setRefFrom(s.refFrom);
  };

  const doCopy = async (): Promise<boolean> => {
    if (!copySrc) return false;
    if (copySrc.id === parentId) { toast.warning(t("นี่คือรุ่นที่เปิดอยู่ — เลือกรุ่นอื่น", "This is the open product — pick another")); return false; }
    setCopyBusy(true);
    const before = { mats, strap, sizes, fitPicks, fitTouched, parcelId, parcelManual, manual, refText, refFrom, answers, hl, slots, tplId };
    const addedTags: string[] = [];
    const done: string[] = [];
    try {
      const rec = ((await apiFetch(`/api/master-v2/parent-skus/${encodeURIComponent(copySrc.id)}`).then((r) => r.json())).data ?? {}) as Record<string, unknown>;
      if (copyGroups.includes("tags")) {
        const [src, mine] = await Promise.all([
          apiFetch(`/api/product-tags?parent_id=${encodeURIComponent(copySrc.id)}`).then((r) => r.json()),
          apiFetch(`/api/product-tags?parent_id=${encodeURIComponent(parentId)}`).then((r) => r.json()),
        ]);
        const have = new Set(((mine.mine ?? []) as string[]).map(String));
        for (const id of ((src.mine ?? []) as string[]).map(String)) {
          if (have.has(id)) continue;
          const j = await apiFetch("/api/product-tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_id: parentId, tag_id: id, on: true }) }).then((r) => r.json());
          if (!j.error) addedTags.push(id);
        }
        setTagTick((x) => x + 1);
        done.push(t(`แท็ก ${addedTags.length}`, `${addedTags.length} tags`));
      }
      if (copyGroups.includes("answers")) {
        // คำตอบ/จุดเด่น/ช่อง ไม่ได้เก็บในสินค้า — ดึงจากร่างของรุ่นนั้นที่จำไว้ในเครื่องนี้ (ถ้ามี)
        let d: Record<string, unknown> | null = null;
        try { d = decodeDraft(localStorage.getItem(`${DRAFT_PREFIX}ai-draft:${copySrc.id}`))?.values ?? null; } catch { d = null; }
        if (d) {
          const s = d as Partial<typeof snapshot>;
          if (s.answers) setAnswers((p) => ({ ...s.answers, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v.trim())) }));
          if (Array.isArray(s.hl)) setHl((p) => [...new Set([...p, ...(s.hl ?? [])])]);
          if (Array.isArray(s.mats)) setMats((p) => [...new Set([...p, ...(s.mats ?? [])])]);
          if (s.slots) setSlots((p) => ({ ...s.slots, ...p }));
          if (s.tplId) setTplId(s.tplId);
          done.push(t("คำตอบ/จุดเด่น", "answers/highlights"));
        } else done.push(t("คำตอบ (รุ่นนั้นไม่มีร่างในเครื่องนี้)", "answers (no saved draft for that model here)"));
      }
      if (copyGroups.includes("size")) {
        setSizes((p) => { const n = { ...p }; for (const f of SIZE_INPUTS) if (rec[f.key] !== null && rec[f.key] !== undefined && rec[f.key] !== "") n[f.key] = String(rec[f.key]); return n; });
        const f = parseFits(rec.fits);
        if (f.length) { setFitPicks(f); setFitTouched(true); }
        if (rec.parcel_size_id) { setParcelId(String(rec.parcel_size_id)); setParcelManual(true); }
        if (Number(rec.strap_drop_cm) > 0 || Number(rec.handle_drop_cm) > 0) setStrap((p) => ({ ...p, has: Number(rec.strap_drop_cm) > 0, drop: Number(rec.strap_drop_cm) > 0 ? String(rec.strap_drop_cm) : p.drop, max: Number(rec.strap_drop_max_cm) > 0 ? String(rec.strap_drop_max_cm) : p.max, handle: Number(rec.handle_drop_cm) > 0, handleDrop: Number(rec.handle_drop_cm) > 0 ? String(rec.handle_drop_cm) : p.handleDrop }));
        done.push(t("ขนาด", "size"));
      }
      if (copyGroups.includes("manual")) {
        setManual((p) => { const n = { ...p }; for (const m of MANUAL_FIELDS) if (!isBlank(rec[m.key])) n[m.key] = String(rec[m.key]); return n; });
        done.push(t("ช่องกรอกมือ", "manual fields"));
      }
      if (copyGroups.includes("text")) {
        const txt = String(rec.description ?? "").trim();
        setRefText(txt); setRefFrom(copySrc.code);
        done.push(txt ? t("ตัวอย่าง Description", "description example") : t("ตัวอย่าง (รุ่นนั้นยังไม่มี Description)", "example (that model has no description)"));
      }
      toast.undo(t(`คัดลอกจาก ${copySrc.code} แล้ว: ${done.join(" · ")}`, `Copied from ${copySrc.code}: ${done.join(" · ")}`), async () => {
        for (const id of addedTags) await apiFetch("/api/product-tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_id: parentId, tag_id: id, on: false }) }).catch(() => null);
        setSizes(before.sizes); setFitPicks(before.fitPicks); setFitTouched(before.fitTouched); setParcelId(before.parcelId); setParcelManual(before.parcelManual);
        setMats(before.mats); setStrap(before.strap);
        setManual(before.manual); setRefText(before.refText); setRefFrom(before.refFrom); setAnswers(before.answers); setHl(before.hl); setSlots(before.slots); setTplId(before.tplId);
        setTagTick((x) => x + 1);
      }, { ms: 8000 });
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("คัดลอกไม่สำเร็จ", "Copy failed")); return false; }
    finally { setCopyBusy(false); }
  };

  // ── แก้ข้อความในผลลัพธ์ได้เลย + ให้อีกภาษาแปลตามอัตโนมัติ (ไทย↔EN) ──
  //    คู่ช่อง: ชื่อสินค้า · Introduction · Description  · หยุดพิมพ์ 1.2 วินาทีแล้วค่อยยิงแปล (ไม่ยิงทุกตัวอักษร)
  const PAIRS: Record<string, { other: string; to: "en" | "th" }> = {
    name_th: { other: "name_en", to: "en" },
    name_en: { other: "name_th", to: "th" },
    introduction: { other: "introduction_en", to: "en" },
    introduction_en: { other: "introduction", to: "th" },
    description: { other: "english_description", to: "en" },
    english_description: { other: "description", to: "th" },
  };
  const [syncing, setSyncing] = useState<string | null>(null);
  /**
   * ตัวนับเวลาแยก "รายช่อง" — เดิมใช้ตัวเดียวร่วมกัน ถ้าแก้ 2 ช่องติดกัน ช่องแรกถูกยกเลิกไปเงียบ ๆ
   * (อาการที่เจ้าของเจอ: แก้แล้วอีกภาษาไม่แปลตาม ต้องไปกดแปลเอง)
   */
  const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editField = (key: string, value: string) => {
    setRes((p) => (p ? { ...p, [key]: value } : p));
    setPicked((p) => ({ ...p, [key]: true }));            // แก้แล้ว = ติ๊กใช้ให้เลย
    const pair = PAIRS[key];
    if (!pair) return;
    if (syncTimers.current[key]) clearTimeout(syncTimers.current[key]);
    syncTimers.current[key] = setTimeout(() => { void syncOther(key, value, pair); }, 1200);
  };
  /** ออกจากช่อง = แปลทันที ไม่ต้องรอครบ 1.2 วิ (กันเคสพิมพ์เสร็จแล้วกด "ใช้ค่าที่เลือก" เลย) */
  const flushSync = (key: string) => {
    const pair = PAIRS[key];
    if (!pair) return;
    if (syncTimers.current[key]) { clearTimeout(syncTimers.current[key]); delete syncTimers.current[key]; }
    void syncOther(key, String(res?.[key] ?? ""), pair);
  };
  const syncOther = async (key: string, value: string, pair: { other: string; to: "en" | "th" }) => {
    const src = value.trim();
    if (!src) return;
    setSyncing(key);
    try {
      const r = await apiFetch("/api/ai/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: "product", text: src.slice(0, 4000), to: pair.to }),
      });
      const j = await r.json().catch(() => ({}));
      const out = String((j?.data?.translated ?? j?.translated) ?? "").trim();
      if (out) {
        setRes((p) => (p ? { ...p, [pair.other]: out } : p));
        setPicked((p) => ({ ...p, [pair.other]: true }));
      }
    } catch { /* แปลไม่ได้ก็ปล่อยให้แก้เองต่อ */ }
    finally { setSyncing(null); }
  };

  // ── ขั้นไหนยังขาดข้อบังคับ (จุดแดง) ──
  const missTopics = missingTopics(topics, answers, extras.optional_topics);
  const missManual = missingManual(extras.manual_required, manual);
  const stepMissing = [tagCount === 0, missTopics.length > 0, false, false, missManual.length > 0];
  const canDraft = !stepMissing[0] && !stepMissing[1];

  /** ข้อมูลจากทุกขั้นที่ส่งให้ AI (บรรทัดละเรื่อง) */
  const facts = (): string[] => {
    const out: string[] = [];
    if (pickedMats.length) out.push(`วัสดุ (ผู้ใช้เลือก ใช้ตามนี้): ${pickedMats.map((m) => (m.name_en ? `${m.name} (${m.name_en})` : m.name)).join(", ")}`);
    if (hl.length) out.push(`จุดเด่นที่ผู้ใช้เลือก (ต้องใส่ทุกข้อ): ${hl.join(", ")}`);
    const sf = strapFacts();
    if (sf) out.push(sf);
    const slotPicks = (slotItems ?? []).filter((x) => (slots[x.id] ?? 0) > 0);
    if (slotPicks.length) out.push(`ช่องใส่ของ: ${slotPicks.map((x) => slotText(x, slots[x.id], "th") ?? `${x.name} ${slots[x.id]} ช่อง`).join(", ")}`);
    const sz = SIZE_INPUTS.filter((f) => Number(sizes[f.key]) > 0).map((f) => `${f.label} ${sizes[f.key]}`);
    if (sz.length) out.push(`ขนาดที่ยืนยันแล้ว (ใช้ตัวเลขนี้): ${sz.join(" · ")}`);
    if (fitPicks.length) out.push(`ใส่ได้: ${fitPicks.map((x) => `${fitName(x.id)}${x.size ? ` (${x.size})` : ""}`).join(", ")}`);
    if (!isBlank(manual.warranty)) out.push(`ประกัน: ${manual.warranty}`);
    if (!isBlank(manual.custom_size)) out.push(`สั่งขนาดพิเศษ: ${manual.custom_size}`);
    if (refText) out.push(`ตัวอย่าง Description จากรุ่น ${refFrom} (เขียนแนวเดียวกัน ห้ามลอกข้อมูลที่ไม่ตรงกับสินค้านี้): ${refText.slice(0, 300)}`);
    return out;
  };

  const run = useCallback(async (opts?: { withAnswers?: boolean }) => {
    setLoading(true); setErr(null);
    const topicQa = topics.map((x) => ({ q: topicLabel(x), a: (answers[x.th] ?? "").trim() })).filter((x) => x.a)
      .map((x) => (isNegativeAnswer(x.a) ? { ...x, a: `${x.a} (คำตอบปฏิเสธ — ห้ามเขียนลงรายละเอียด)` } : x));
    const qa = [
      ...topicQa,
      ...(opts?.withAnswers
        ? Object.entries(answers).filter(([q, a]) => a.trim() && !topics.some((x) => x.th === q)).map(([q, a]) => ({ q, a: a.trim() }))
        : []),
    ];
    setRes(null);
    try {
      const r = await apiFetch("/api/ai/product-detail", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: parentId, extra: extra.trim() || undefined, answers: qa.length ? qa : undefined, fields: pickFields, template: tpl ?? undefined, facts: facts(), skip_keys: skip }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || `เรียก AI ไม่สำเร็จ (${r.status})`);
      const data = (j.data ?? {}) as Result;
      setRes(data);
      // ติ๊กเฉพาะช่องที่ของเดิมยังว่าง (กันทับงานที่เขียนเอง)
      const init: Record<string, boolean> = {};
      for (const f of FIELDS) init[f.key] = !!String(data[f.key] ?? "").trim() && isBlank(current[f.key]);
      setPicked(init);
      // AI เจอประกันในรูป + ช่องประกันยังว่าง → เติมให้ในขั้นกรอกมือ (ยังแก้ได้)
      const w = String(data.sizes?.warranty ?? "").trim();
      if (w) setManual((p) => (isBlank(p.warranty) ? { ...p, warranty: w } : p));
    } catch (e) { setErr(e instanceof Error ? e.message : t("เรียก AI ไม่สำเร็จ", "Could not reach AI")); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, extra, current, answers, topics, pickFields, tpl, skip, hl, slots, sizes, fitPicks, manual, refText, pickedMats, strap]);

  const rows = res ? FIELDS.filter((f) => String(res[f.key] ?? "").trim()) : [];
  const missingEn = res
    ? CFG_FIELDS.filter((f) => String(res[f.field] ?? "").trim() && !String(res[f.field === "name_th" ? "name_en" : f.field === "introduction" ? "introduction_en" : "english_description"] ?? "").trim())
    : [];
  const willOverwrite = rows.filter((f) => picked[f.key] && !isBlank(current[f.key])).length;

  /** ค่าที่จะลงฟอร์ม — เฉพาะที่ติ๊ก/เปลี่ยนจริง */
  const output = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of rows) if (picked[f.key]) out[f.key] = String(res?.[f.key] ?? "").trim();
    for (const f of SIZE_INPUTS) if (sizes[f.key].trim() !== curStr(f.key)) out[f.key] = sizes[f.key].trim();
    if (JSON.stringify(fitPicks) !== JSON.stringify(parseFits(current.fits))) out.fits = fitPicks.length ? fitPicks : null;
    if (parcelId !== curStr("parcel_size_id")) out.parcel_size_id = parcelId || null;
    // สาย/หู: ไม่ติ๊ก = ล้างค่า (ถ้าเดิมมี) · ติ๊ก = ค่าที่กรอก
    const sv = { strap_drop_cm: strap.has ? strap.drop.trim() : "", strap_drop_max_cm: strap.has ? strap.max.trim() : "", handle_drop_cm: strap.handle ? strap.handleDrop.trim() : "" };
    for (const [k, v] of Object.entries(sv)) if (v !== curStr(k)) out[k] = v || null;
    for (const m of MANUAL_FIELDS) if ((manual[m.key] ?? "").trim() !== curStr(m.key)) out[m.key] = (manual[m.key] ?? "").trim() || null;
    return out;
  };
  const outCount = Object.keys(output()).length;
  const apply = () => {
    if (missManual.length) { setStep(4); toast.warning(t("กรอกช่องที่บังคับในขั้นกรอกมือให้ครบก่อน", "Fill the required manual fields first")); return; }
    const out = output();
    if (!Object.keys(out).length) { toast.info(t("ยังไม่มีอะไรเปลี่ยน", "Nothing changed yet")); return; }
    onApply(out);
    draft.discard();
    onClose();
  };

  const goNext = () => {
    if (step === 2) {
      if (!canDraft) { setStep(stepMissing[0] ? 0 : 1); toast.warning(t("ยังขาดข้อมูลที่จำเป็น (จุดแดง) — กรอกให้ครบก่อนให้ AI ร่าง", "Required info missing (red dot) — complete it before drafting")); return; }
      setStep(3); void run(); return;
    }
    setStep((s) => Math.min(4, s + 1));
  };
  const nextLabel = step === 2 ? t("✨ ให้ AI ร่าง", "✨ Let AI draft") : step === 4 ? t(`ใส่ลงฟอร์ม (${outCount})`, `Put into form (${outCount})`) : t("ถัดไป", "Next");

  // ตัวอย่าง Description แบบบรรทัด (คร่าว ๆ จากที่เลือกในขั้นนี้ — AI จะเรียบเรียงตาม Theme อีกที)
  const uiEn = t("th", "en") === "en";
  const previewLines: string[] = [
    ...(pickedMats.length ? [`${t("วัสดุ", "Material")}: ${pickedMats.map(matName).join(", ")}`] : []),
    ...hl.map((h) => t(h, hlEn(h) || h)),
    ...(slotItems ?? []).filter((x) => (slots[x.id] ?? 0) > 0).map((x) => slotText(x, slots[x.id], uiEn ? "en" : "th") ?? `${t(x.name, x.name_en || x.name)} × ${slots[x.id]}`),
    ...(strap.has ? [t(`สายสะพาย${Number(strap.drop) > 0 ? ` ยาว ${strap.drop} ซม.` : ""}${Number(strap.max) > 0 ? ` (ปรับได้ถึง ${strap.max} ซม.)` : ""}`, `Strap${Number(strap.drop) > 0 ? ` ${strap.drop} cm` : ""}${Number(strap.max) > 0 ? ` (adjustable to ${strap.max} cm)` : ""}`)] : []),
    ...(strap.handle ? [t(`หูหิ้ว${Number(strap.handleDrop) > 0 ? ` สูง ${strap.handleDrop} ซม.` : ""}`, `Handle${Number(strap.handleDrop) > 0 ? ` ${strap.handleDrop} cm drop` : ""}`)] : []),
  ];
  const descPreview = (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      <p className="text-[11.5px] font-medium text-slate-500 mb-1">{t("ตัวอย่าง Description", "Description preview")}</p>
      {previewLines.length
        ? previewLines.map((l, i) => <p key={i} className="text-[12.5px] text-slate-700 leading-relaxed">- {l}</p>)
        : <p className="text-[12px] text-slate-400">{t("เลือกวัสดุ / จุดเด่น / ช่อง แล้วจะเห็นตัวอย่างตรงนี้", "Pick material / highlights / compartments to see a preview")}</p>}
      <p className="mt-1.5 text-[10.5px] text-slate-400">{t("ตัวอย่างคร่าว ๆ — AI จะเรียบเรียงตาม Theme ที่เลือก", "Rough preview — AI will arrange it by the chosen theme")}</p>
    </div>
  );
  const chip = (on: boolean) => `h-7 px-2.5 text-[12px] rounded-full border ${on ? "bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`;
  const label = "block text-[12.5px] font-medium text-slate-600 mb-1";

  return (
    <ERPModal open onClose={onClose} size="xl" title={t("✨ ให้ AI ร่างรายละเอียดสินค้า", "✨ Let AI draft the product details")}
      description={t("ทำทีละขั้น ข้ามได้ · จุดแดง = ยังขาดข้อมูลที่จำเป็น · ร่างค้างไว้จะจำให้อัตโนมัติ", "Step by step, skippable · red dot = required info missing · drafts are remembered")}
      footer={
        <div className="flex items-center justify-between w-full gap-2 flex-wrap">
          <span className="text-[11.5px] text-slate-400 w-full sm:w-auto">
            {res ? `AI ดูรูป ${res.image_count ?? 0} รูป${(res.rules_used?.length ?? 0) > 0 ? ` · ใช้กฎ: ${res.rules_used?.join(", ")}` : ""}${tpl ? ` · แม่แบบ: ${tpl.name}` : ""}`
              : t("ค่าที่ได้จะลงในฟอร์ม ต้องกดบันทึกเองอีกที", "Results go into the form — you still press Save")}
          </span>
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="h-9 px-3 sm:px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            {step > 0 && <button onClick={() => setStep((s) => s - 1)} className="h-9 px-3 sm:px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ย้อน", "Back")}</button>}
            {step === 3 && res && (
              <button onClick={() => void run()} disabled={loading} className="h-9 px-3 sm:px-4 text-sm font-medium border border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 rounded-lg hover:bg-fuchsia-100 disabled:opacity-50">
                {t("ให้คิดใหม่", "Redraft")}
              </button>
            )}
            {step === 3 && !res && !loading && (
              <button onClick={() => (canDraft ? void run() : goNext())} className="h-9 px-3 sm:px-4 text-sm font-medium border border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 rounded-lg hover:bg-fuchsia-100">
                {t("✨ ให้ AI ร่าง", "✨ Let AI draft")}
              </button>
            )}
            <button onClick={step === 4 ? apply : goNext} disabled={loading}
              className={`h-9 px-3 sm:px-4 text-sm font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-2 ${step === 2 ? "border border-fuchsia-300 text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
              {loading && step === 3 && <Spinner />}{nextLabel}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {/* ร่างค้างจากครั้งก่อน */}
        {draft.pending && (
          <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
            <span className="flex-1 min-w-0">{t(`มีร่างค้างไว้เมื่อ ${new Date(draft.pending.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} — ทำต่อจากเดิมไหม?`, `You have a saved draft from ${new Date(draft.pending.at).toLocaleString()} — continue?`)}</span>
            <button type="button" onClick={() => restore(draft.take())} className="h-7 px-2.5 text-[12px] font-medium rounded-lg bg-amber-600 text-white">{t("ทำต่อ", "Continue")}</button>
            <button type="button" onClick={() => draft.discard()} className="h-7 px-2.5 text-[12px] rounded-lg border border-amber-300 bg-white">{t("เริ่มใหม่", "Start over")}</button>
          </div>
        )}

        {/* แท็บขั้นตอน — กดข้ามได้ · จุดแดง = ขาดข้อบังคับ · มือถือโชว์ชื่อเฉพาะขั้นที่อยู่ */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5">
          {STEPS.map((name, i) => {
            const on = step === i;
            const ok = i < step && !stepMissing[i];
            return (
              <button key={i} type="button" onClick={() => setStep(i)}
                className={`shrink-0 h-8 px-2.5 text-[12px] rounded-lg border inline-flex items-center gap-1 ${on ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : ok ? "border-slate-200 text-emerald-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <span>{ok ? "✓" : `${i + 1}.`}</span>
                <span className={on ? "" : "hidden sm:inline"}>{name}</span>
                {stepMissing[i] && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title={t("ยังขาดข้อมูลที่จำเป็น", "Required info missing")} />}
              </button>
            );
          })}
          <button type="button" onClick={() => setCfgOpen(true)} className="shrink-0 ml-auto h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            {t("⚙ คำสั่ง AI", "⚙ AI prompt")}
          </button>
        </div>

        {/* ตั้งค่าคำสั่ง AI = ป๊อปแยก (ซ้อนบนป๊อปนี้) — ไม่กางในหน้าให้ยาว เลื่อนหาของยาก */}
        {cfgOpen && (
          <ERPModal open onClose={() => setCfgOpen(false)} size="lg"
            title={t("⚙ ตั้งค่าคำสั่ง AI", "⚙ AI prompt settings")}
            description={t("คำสั่งหลัก = ตั้งรวมทุกช่อง หรือแยกรายช่องก็ได้ (รายช่องสำคัญกว่า) · กฎตามประเภทสินค้า = ใช้เมื่อเข้าเงื่อนไขแท็ก/ชื่อ", "Main prompt: set once for all fields or per field (per-field wins) · Rules apply when tag/name matches")}
            footer={
              <div className="flex justify-end w-full">
                <button onClick={() => setCfgOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
              </div>
            }>
          <div className="space-y-2">
            {/* 2 แท็บ: คำสั่งหลัก (ทุกสินค้า/ต่อแบรนด์) · กฎตามประเภทสินค้า (แท็ก/คำในชื่อ) */}
            <div className="flex gap-1 border-b border-slate-200 -mx-3 px-3 pb-1.5">
              {([["main", t("คำสั่งหลัก", "Main prompt")], ["rules", t("กฎตามประเภทสินค้า", "Rules by product type")]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setCfgTab(k)}
                  className={`h-7 px-3 text-[12.5px] font-medium rounded-lg ${cfgTab === k ? "bg-white border border-slate-200 text-slate-700" : "text-slate-500 hover:bg-white/70"}`}>
                  {label}
                </button>
              ))}
            </div>

            {cfgTab === "rules" ? (
              <RulesEditor brandId={brandId} suggestKeyword={suggestKeyword} />
            ) : (
            <>
            <ModelPicker />
            {/* เลือกว่าจะตั้งคำสั่ง "รวมทุกช่อง" หรือ "เฉพาะช่องนี้" — ช่องที่ตั้งไว้แล้วมีจุดเขียว */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
              <p className="text-[11.5px] font-medium text-slate-500">
                {t("ตั้งคำสั่งของช่องไหน", "Which field is this prompt for?")}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {([["", t("รวมทุกช่อง", "All fields")], ...CFG_FIELDS.map((f) => [f.field, f.label] as const)] as const).map(([k, label]) => {
                  const has = (cfgRows ?? []).some((r) => r.platform === platOf(k) && (r.prompt ?? "").trim());
                  // ● เขียว = บันทึกแล้ว · ● เหลือง = พิมพ์ค้างไว้ยังไม่บันทึก (สลับช่องได้ ไม่หาย)
                  const savedOf = (cfgRows ?? []).find((r) => r.platform === platOf(k) && r.brand_id === (cfgScope === "brand" ? brandId ?? null : null))?.prompt ?? "";
                  const editOf = cfgEdits[`${cfgScope}|${k}`];
                  const dirty = editOf !== undefined && editOf.trim() !== savedOf.trim();
                  const on = cfgField === k;
                  return (
                    <button key={k || "_all"} type="button" onClick={() => setCfgField(k)}
                      title={dirty ? t("พิมพ์ค้างไว้ยังไม่บันทึก", "Unsaved changes here")
                        : has ? t("ช่องนี้ตั้งคำสั่งไว้แล้ว", "This field already has a prompt")
                        : t("ยังไม่ได้ตั้งคำสั่งของช่องนี้", "No prompt set for this field yet")}
                      className={`h-7 px-2.5 text-[12px] rounded-full border inline-flex items-center gap-1 ${on
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                      {dirty ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        : has ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : null}
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {cfgField
                  ? t(`คำสั่งนี้คุมช่องนี้ + ${CFG_FIELDS.find((f) => f.field === cfgField)?.en ?? ""} (ฝั่งอังกฤษ = แปลจากฝั่งไทยให้ตรงกัน ไม่ต้องเขียนคำสั่งซ้ำ) · มีน้ำหนักมากกว่าคำสั่งรวม`,
                      `Covers this field and its English pair (${CFG_FIELDS.find((f) => f.field === cfgField)?.en ?? ""}) — the English text is translated from the Thai · outweighs the all-fields prompt`)
                  : t("คำสั่งรวม = ใช้กับทุกช่องที่ไม่ได้ตั้งคำสั่งเฉพาะไว้", "All-fields prompt = used by every field without its own prompt")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
                <button type="button" onClick={() => setCfgScope("global")}
                  className={`h-8 px-3 text-[12px] font-medium ${cfgScope === "global" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
                  ค่ากลาง (ทุกแบรนด์)
                </button>
                <button type="button" onClick={() => setCfgScope("brand")} disabled={!brandId}
                  title={brandId ? t("ตั้งคำสั่งเฉพาะแบรนด์ของสินค้าตัวนี้", "Set a prompt just for this product's brand") : t("สินค้าตัวนี้ยังไม่ได้ระบุแบรนด์", "This product has no brand set")}
                  className={`h-8 px-3 text-[12px] font-medium border-l border-slate-200 disabled:opacity-40 ${cfgScope === "brand" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
                  เฉพาะแบรนด์นี้
                </button>
              </div>
              <span className="text-[11.5px] text-slate-400">
                {cfgScope === "brand" ? t("ถ้าเว้นว่าง = ใช้ค่ากลาง", "Leave empty = use the global prompt") : t("ใช้กับสินค้าทุกแบรนด์ที่ไม่ได้ตั้งเฉพาะ", "Applies to every brand without its own prompt")}
              </span>
            </div>
            {cfgRows === null ? (
              <p className="text-[12.5px] text-slate-400 py-2"><Spinner />{t("กำลังโหลดคำสั่ง…", "Loading prompt…")}</p>
            ) : (
              <>
                <textarea value={cfgDraft} onChange={(e) => setCfgDraft(e.target.value)} rows={7}
                  placeholder={cfgField
                    ? (CFG_FIELDS.find((f) => f.field === cfgField)?.hint ?? "")
                    : t("เช่น เขียนโทนพรีเมียม เน้นงานคราฟต์ · ห้ามใช้คำว่า ถูกที่สุด · ปิดท้ายด้วยการรับประกัน", "e.g. premium, craft-focused tone · never say “cheapest” · end with the warranty")}
                  className="w-full px-3 py-2 text-[13px] leading-relaxed border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 font-mono" />
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => void saveCfg()} disabled={cfgBusy}
                    className="h-8 px-3 text-[12.5px] font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
                    {cfgBusy ? t("กำลังบันทึก…", "Saving…") : t("บันทึกคำสั่ง", "Save prompt")}
                  </button>
                  {cfgDirty && !cfgBusy && (
                    <span className="text-[11.5px] text-amber-600 font-medium">
                      {t("● ยังไม่บันทึก", "● Unsaved")}
                    </span>
                  )}
                  {!!cfgSaved.trim() && (
                    <button type="button" onClick={() => void delCfg()} disabled={cfgBusy}
                      title={t("กลับไปใช้คำสั่งรวม/ค่าในโค้ด", "Fall back to the all-fields prompt")}
                      className="h-8 px-3 text-[12.5px] border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50">
                      {t("ลบคำสั่งนี้", "Remove")}
                    </button>
                  )}
                  {cfgMsg && <span className="text-[12px] text-slate-500">{cfgMsg}</span>}
                </div>
                <p className="text-[11.5px] text-slate-400">
                  กติกาความปลอดภัย (ห้ามแต่งข้อมูลที่ไม่เห็น · ห้ามเดาขนาด · ต้องตอบเป็น JSON) ระบบใส่ให้อัตโนมัติเสมอ ไม่ต้องเขียนเอง ·
                  แก้จากหน้ารวมได้ที่ งาน → ตั้งค่า → Prompt แคปชั่น AI
                </p>
              </>
            )}
            </>
            )}
          </div>
          </ERPModal>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {/* รูปที่ AI จะดู — ข้างซ้ายทุกขั้น (มือถือ = แถบเลื่อนด้านบน) */}
          <div className="sm:w-[168px] shrink-0">
            <ImageStrip keys={imgKeys} groups={imgGroups} max={imgMax} skip={skip} onToggleSkip={(k) => setSkip((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))} />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {/* ① ตั้งต้น */}
            {step === 0 && (
              <>
                <div>
                  {/* คัดลอกจากรุ่นเก่า = ปุ่มเล็ก กดแล้วเด้งป๊อปเลือกรุ่น + เลือกว่าจะดึงอะไร (เจ้าของขอ 2026-11-25) */}
                  <button type="button" onClick={() => setCopyOpen(true)}
                    className="h-8 px-3 text-[12.5px] font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
                    ⧉ {t("คัดลอกจากรุ่นเก่า", "Copy from an older model")}
                  </button>
                  <ERPModal open={copyOpen} onClose={() => { if (!copyBusy) setCopyOpen(false); }} size="sm" title={t("คัดลอกจากรุ่นเก่า", "Copy from an older model")}
                    footer={
                      <div className="flex justify-end gap-2 w-full">
                        <button type="button" onClick={() => setCopyOpen(false)} disabled={copyBusy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
                        <button type="button" onClick={() => void doCopy().then((ok) => { if (ok) setCopyOpen(false); })} disabled={!copySrc || copyBusy || copyGroups.length === 0}
                          className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5">
                          {copyBusy && <Spinner />}{t("คัดลอก", "Copy")}
                        </button>
                      </div>
                    }>
                    <p className="text-[12px] text-slate-500 mb-1">{t("รุ่นต้นแบบ", "Source model")}</p>
                    <ParentSkuPicker value={copySrc} onChange={setCopySrc} disableCreate placeholder={t("ค้นรหัส/ชื่อรุ่น…", "Search code/name…")} />
                    <p className="text-[12px] text-slate-500 mt-3 mb-1">{t("เลือกว่าจะดึงอะไรมา", "What to bring over")}</p>
                    <div className="space-y-1">
                      {COPY_GROUPS.map((g) => {
                        const on = copyGroups.includes(g.key);
                        return (
                          <label key={g.key} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={on} onChange={() => setCopyGroups((p) => (on ? p.filter((x) => x !== g.key) : [...p, g.key]))} className="h-4 w-4 accent-indigo-600" />
                            {g.label}
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">{t("แค่เติมลงป๊อปนี้ ยังไม่บันทึก · กด \"ย้อนกลับ\" ในแจ้งผลได้", "Only fills this popup — nothing is saved · Undo from the notice")}</p>
                  </ERPModal>
                  {refText && (
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      {t(`ใช้ Description ของ ${refFrom} เป็นตัวอย่างการเขียน`, `Using ${refFrom}'s description as a writing example`)} ·{" "}
                      <button type="button" onClick={() => { setRefText(""); setRefFrom(""); }} className="text-rose-500 underline">{t("เอาออก", "Remove")}</button>
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-2.5">
                  <TagPicker key={tagTick} parentId={parentId} onChanged={() => setRulesTick((x) => x + 1)} onCount={setTagCount} onPicked={setPickedTags} canRule={canRule}
                    onEditRule={() => { setStep(1); if (rulesMatched.length) setRuleEditOpen(true); else setNewRuleOpen(true); }} />
                  {tagCount === 0 && <p className="mt-1 text-[11.5px] text-rose-600">{t("● จำเป็น: ติดแท็กประเภทสินค้าอย่างน้อย 1 แท็ก — AI จะรู้ว่าเป็นสินค้าอะไรและเข้ากฎที่ตั้งไว้", "● Required: add at least one product-type tag")}</p>}
                  {rulesMatched.length > 0 && (
                    <p className="mt-1.5 text-[12px] text-emerald-700">
                      ✓ {t(`เข้ากฎ "${rulesMatched.map((r) => r.name).join(", ")}" → มีหัวข้อที่ต้องตอบ ${topics.length} ข้อในขั้นถัดไป`, `Matches rule "${rulesMatched.map((r) => r.name).join(", ")}" → ${topics.length} questions next`)}
                    </p>
                  )}
                </div>

                <div>
                  <span className={label}>{t("Theme = ชุดแม่แบบ (ลำดับหัวข้อ + รูปแบบ Description)", "Theme = template (heading order + description format)")}</span>
                  {setup
                    ? <TemplatePicker setup={setup} save={saveSetup} value={tplId} onChange={setTplId} brandId={brandId} canEdit={canTpl} />
                    : <p className="text-[12px] text-slate-400"><Spinner /> {t("กำลังโหลดแม่แบบ…", "Loading templates…")}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-medium text-slate-600">{t("ให้ AI เขียน", "Let AI write")}</span>
                  {([["name", t("ชื่อสินค้า", "Product name")], ["intro", "Introduction"], ["desc", "Description"]] as const).map(([k, lb]) => {
                    const on = pickFields.includes(k);
                    return (
                      <button key={k} type="button" onClick={() => setPickFields((p) => (p.includes(k) ? (p.length > 1 ? p.filter((x) => x !== k) : p) : [...p, k]))} className={chip(on)}>
                        {on ? "✓ " : ""}{lb}
                      </button>
                    );
                  })}
                  <span className="text-[11.5px] text-slate-400">{t("(ได้คู่ภาษาอังกฤษด้วย)", "(includes English)")}</span>
                </div>
              </>
            )}

            {/* ② ประเภท & จุดเด่น */}
            {step === 1 && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-semibold text-slate-700 flex-1 min-w-0">
                    {t("หัวข้อที่ต้องตอบ", "Questions to answer")}
                    {rulesMatched.length > 0 && <span className="ml-1.5 text-[11.5px] font-normal text-slate-400">({t("จากกฎ", "from rule")}: {rulesMatched.map((r) => r.name).join(", ")})</span>}
                  </span>
                  {canRule && rulesMatched.length > 0 && !ruleEditOpen && (
                    <button type="button" onClick={() => setRuleEditOpen(true)} className="h-7 px-2.5 text-[12px] rounded-lg border border-violet-200 text-violet-700 bg-white hover:bg-violet-50">
                      {t("⚙ ตั้งค่าประเภทนี้", "⚙ Set up this type")}
                    </button>
                  )}
                  {/* ยังไม่เข้ากฎใด → สร้างกฎประเภทจากแท็กที่ติดอยู่ได้เลย */}
                  {canRule && rulesMatched.length === 0 && pickedTags.length > 0 && !newRuleOpen && (
                    <button type="button" onClick={() => setNewRuleOpen(true)} className="h-7 px-2.5 text-[12px] rounded-lg border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100">
                      {t(`＋ สร้างกฎประเภท “${pickedTags[pickedTags.length - 1].name}”`, `＋ Create a rule for “${pickedTags[pickedTags.length - 1].name}”`)}
                    </button>
                  )}
                </div>
                {ruleEditOpen || newRuleOpen ? (
                  <RuleQuickEditor rules={rulesMatched}
                    newRule={newRuleOpen ? { name: pickedTags[pickedTags.length - 1]?.name ?? "", tag_ids: pickedTags.map((x) => x.id) } : null}
                    slotItems={(slotItems ?? []).map((x) => ({ id: x.id, name: x.name }))} centralHighlights={phraseItems.map((x) => x.name)}
                    onSaved={() => setRulesTick((x) => x + 1)} onClose={() => { setRuleEditOpen(false); setNewRuleOpen(false); }} />
                ) : topics.length === 0 ? (
                  <p className="text-[12px] text-slate-400">
                    {rulesMatched.length === 0
                      ? pickedTags.length
                        ? t("สินค้านี้ยังไม่เข้ากฎประเภทใด — กด “สร้างกฎประเภท” ด้านบนเพื่อตั้งหัวข้อ/จุดเด่น/ชนิดช่อง", "No type rule yet — press “Create a rule” above")
                        : t("ยังไม่ได้ติดแท็กประเภทสินค้า — ติดแท็กในขั้นแรกก่อน", "No product-type tag yet — add one in step 1")
                      : t("กฎนี้ยังไม่มีหัวข้อที่ต้องตอบ", "This rule has no questions yet")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {topics.map((x) => {
                      const cur = answers[x.th] ?? "";
                      const req = !extras.optional_topics.includes(x.th);
                      const miss = req && isBlank(cur);
                      // มี 2 ตัวเลือก (Yes/No · กันน้ำ/ไม่กันน้ำ) = บรรทัดเดียวสั้น ๆ · พิมพ์เองได้ที่ ✎ (เจ้าของขอ 2026-11-25)
                      if (x.options.length === 2 && typeTopic !== x.th) {
                        const custom = cur.trim() && !x.options.includes(cur.trim());
                        return (
                          <div key={x.th} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${miss ? "border-rose-200 bg-rose-50/30" : "border-slate-200"}`}>
                            <span className="flex-1 min-w-0 text-[12.5px] text-slate-700 leading-snug">{topicLabel(x)}{req && <span className="text-rose-500"> *</span>}
                              {custom && <span className="block text-[11px] text-violet-700 truncate">“{cur}”</span>}
                            </span>
                            <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-violet-200">
                              {x.options.map((op, oi) => {
                                const on = cur.trim() === op;
                                const shown = t("th", "en") === "en" && x.optionsEn[oi] ? x.optionsEn[oi] : op;
                                return <button key={op} type="button" onClick={() => setAnswers((p) => ({ ...p, [x.th]: on ? "" : op }))}
                                  className={`h-7 px-2.5 text-[12px] ${oi > 0 ? "border-l border-violet-200" : ""} ${on ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"}`}>{shown}</button>;
                              })}
                            </span>
                            <button type="button" onClick={() => setTypeTopic(x.th)} title={t("พิมพ์คำตอบเอง", "Type an answer")} aria-label={t("พิมพ์คำตอบเอง", "Type an answer")}
                              className="shrink-0 h-7 w-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">✎</button>
                          </div>
                        );
                      }
                      return (
                        <div key={x.th} className={`rounded-lg border p-2 ${miss ? "border-rose-200 bg-rose-50/30" : "border-slate-200"}`}>
                          <p className="text-[12px] text-slate-600 mb-1">{topicLabel(x)}{req && <span className="text-rose-500"> *</span>}</p>
                          {x.options.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {x.options.map((op, oi) => {
                                const on = cur.trim() === op;
                                const shown = t("th", "en") === "en" && x.optionsEn[oi] ? x.optionsEn[oi] : op;
                                return <button key={op} type="button" onClick={() => setAnswers((p) => ({ ...p, [x.th]: on ? "" : op }))} title={x.optionsEn[oi] && shown === op ? x.optionsEn[oi] : undefined}
                                  className={`h-6 px-2 text-[11.5px] rounded-full border ${on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-violet-200 text-violet-700 hover:bg-violet-50"}`}>{shown}</button>;
                              })}
                            </div>
                          )}
                          <input value={cur} onChange={(e) => setAnswers((p) => ({ ...p, [x.th]: e.target.value }))} placeholder={t("หรือพิมพ์คำตอบ…", "or type an answer…")}
                            autoFocus={typeTopic === x.th} onBlur={() => { if (typeTopic === x.th) setTimeout(() => setTypeTopic((v) => (v === x.th ? null : v)), 200); }}
                            className="w-full h-8 px-2 text-[12.5px] border border-slate-200 rounded-md bg-white" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* วัสดุ (ของกลาง MaterialQuickPick — เหมือนป๊อปแทรกรายละเอียด) · เลือกวัสดุที่เข้ากติกา = ติ๊กจุดเด่นให้เอง */}
                <div>
                  <span className={label}>
                    {t("วัสดุ", "Material")}
                    {canTpl && <button type="button" onClick={() => setMatRuleOpen((v) => !v)} className="ml-2 text-[11px] font-normal text-indigo-600 underline">{t("⚙ กติกาวัสดุ → จุดเด่น", "⚙ Material → highlight rules")}</button>}
                  </span>
                  <MaterialQuickPick items={matList} value={mats} onChange={setMats} lang={t("th", "en") === "en" ? "en" : "th"}
                    hint={typeof current.materials === "string" && current.materials.trim() ? current.materials.replace(/s+/g, " ").trim() : null} />
                  {matAutoHl.length > 0 && (
                    <p className="mt-1 text-[11.5px] text-emerald-700">✓ {t("ติ๊กจุดเด่นให้จากวัสดุ:", "Auto-ticked from material:")} {matAutoHl.map((x) => t(x.highlight, x.highlight_en || x.highlight)).join(", ")}</p>
                  )}
                  {matRuleOpen && setup && <MaterialRuleEditor rules={setup.material_rules} onSave={saveMatRules} />}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
                <div>
                  <span className={label}>
                    {t("จุดเด่น (ติ๊กเลือก)", "Highlights (tick)")}
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">{hlChoices.fromType ? t("· ชุดของประเภทนี้", "· this type's set") : t("· จากคลังกลาง (ตั้งชุดของประเภทได้ที่ ⚙)", "· from the shared library (set per type via ⚙)")}</span>
                  </span>
                  {/* checklist โชว์ภาษาที่ใช้อยู่ภาษาเดียว (เจ้าของขอ 2026-11-25) · EN จากกฎ / คลังกลาง / AI / กติกาวัสดุ — ไม่มี EN = โชว์ไทย */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5">
                    {[...new Set([...hlChoices.list, ...aiHl, ...hl])].map((h) => {
                      const shown = t(h, hlEn(h) || h);
                      const on = hl.includes(h);
                      const auto = on && matAutoHl.some((x) => x.highlight === h);
                      return (
                        <label key={h} className="flex items-start gap-2 py-1 cursor-pointer">
                          <input type="checkbox" checked={on} onChange={() => toggleHl(h)} className="mt-0.5 h-4 w-4 accent-fuchsia-600 shrink-0" />
                          <span className="min-w-0">
                            <span className={`block text-[12.5px] ${on ? "text-slate-800 font-medium" : "text-slate-600"}`}>{aiHl.includes(h) && !hlChoices.list.includes(h) ? "✨ " : ""}{shown}</span>
                            {auto && <span className="inline-block mt-0.5 text-[10px] px-1.5 rounded bg-emerald-50 text-emerald-700">{t("อัตโนมัติจากวัสดุ", "auto from material")}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {aiHlAllowed && (
                      <button type="button" onClick={() => void askAiHl()} disabled={aiHlBusy} className="h-7 px-2.5 text-[12px] rounded-full border border-dashed border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50 disabled:opacity-50 inline-flex items-center gap-1">
                        {aiHlBusy && <Spinner />}{t("✨ AI ดูรูปแล้วแนะนำ", "✨ AI suggests from images")}
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input value={hlInput} onChange={(e) => setHlInput(e.target.value)} placeholder={t("พิมพ์จุดเด่นเอง แล้วกด Enter", "Type a highlight and press Enter")}
                      onKeyDown={(e) => { if (e.key === "Enter" && hlInput.trim()) { e.preventDefault(); setHl((p) => [...new Set([...p, hlInput.trim()])]); setHlInput(""); } }}
                      className="flex-1 h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg" />
                  </div>
                </div>
                {/* ตัวอย่าง Description แบบบรรทัด — PC ข้างขวา · มือถือพับไว้ (เจ้าของเลือก 2026-11-25) */}
                <div className="hidden lg:block lg:sticky lg:top-0">{descPreview}</div>
                <details className="lg:hidden rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <summary className="text-[12px] text-slate-600 cursor-pointer">{t("ดูตัวอย่าง Description", "Show Description preview")}</summary>
                  <div className="mt-1.5">{descPreview}</div>
                </details>
                </div>

                <div>
                  <span className={label}>
                    {t("จำนวนช่อง", "Compartments")}
                    {extras.slot_ids.length > 0 && slotItems && (
                      <button type="button" onClick={() => setShowAllSlots((v) => !v)} className="ml-2 text-[11px] font-normal text-indigo-600 underline">
                        {showAllSlots ? t("โชว์เฉพาะของประเภทนี้", "Show this type only") : t(`ดูทั้งหมด (${slotItems.length} ชนิด)`, `Show all (${slotItems.length})`)}
                      </button>
                    )}
                  </span>
                  {slotItems === null ? <p className="text-[12px] text-slate-400"><Spinner /></p>
                    : slotItems.length === 0 ? <p className="text-[12px] text-slate-400">{t("ยังไม่มีชนิดช่องในคลังกลาง (ตั้งได้ที่ป๊อปแทรกรายละเอียด)", "No compartment types yet")}</p>
                    : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {visibleSlots(slotItems, extras.slot_ids, slots, showAllSlots).map((s) => {
                          const n = slots[s.id] ?? 0;
                          const set = (v: number) => setSlots((p) => { const c = { ...p }; if (v > 0) c[s.id] = v; else delete c[s.id]; return c; });
                          return (
                            <div key={s.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${n > 0 ? "border-fuchsia-200 bg-fuchsia-50/40" : "border-slate-200"}`}>
                              <span className="flex-1 min-w-0 truncate text-[12.5px] text-slate-700">{t(s.name, s.name_en || s.name)}</span>
                              <button type="button" onClick={() => set(Math.max(0, n - 1))} className="w-6 h-6 rounded border border-slate-200 text-slate-500" aria-label={t("ลด", "Less")}>−</button>
                              {/* พิมพ์ตัวเลขได้ (0-99) · มือถือขึ้นแป้นตัวเลข · ± ยังกดได้ */}
                              <input value={n ? String(n) : ""} placeholder="0" inputMode="numeric" aria-label={t(`จำนวน ${s.name}`, `Count of ${s.name}`)}
                                onChange={(e) => { const v = Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 2)); set(Number.isFinite(v) ? Math.min(99, v) : 0); }}
                                onFocus={(e) => e.currentTarget.select()}
                                className="w-11 h-7 text-center text-[12.5px] tabular-nums border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-fuchsia-100 focus:border-fuchsia-300" />
                              <button type="button" onClick={() => set(Math.min(99, n + 1))} className="w-6 h-6 rounded border border-slate-200 text-slate-500" aria-label={t("เพิ่ม", "More")}>＋</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>

                <div>
                  <span className={label}>{t("บอกใบ้เพิ่ม (ไม่บังคับ)", "Extra hints (optional)")}</span>
                  <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={500}
                    placeholder={t("เช่น เหมาะกับนักศึกษา ใส่ไปทำงานได้", "e.g. good for students and work")}
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" />
                </div>
              </>
            )}

            {/* ③ ขนาด & กล่อง */}
            {step === 2 && (
              <>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[12.5px] font-medium text-slate-600 flex-1">{t("ขนาดสินค้า", "Product size")}</span>
                    <button type="button" onClick={() => void readSizes()} disabled={sizeBusy || !imgKeys?.length}
                      className="h-7 px-2.5 text-[12px] rounded-lg border border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 disabled:opacity-40 inline-flex items-center gap-1">
                      {sizeBusy && <Spinner />}{t("✨ ให้ AI อ่านขนาด + ดูสายจากรูป", "✨ AI reads sizes + strap from images")}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SIZE_INPUTS.map((f) => (
                      <label key={f.key} className="block">
                        <span className="text-[11.5px] text-slate-500">{f.label}</span>
                        <input value={sizes[f.key]} inputMode="decimal" onChange={(e) => setSizes((p) => ({ ...p, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
                          className={`w-full h-9 px-2.5 text-[13px] border rounded-lg tabular-nums ${sizes[f.key] !== curStr(f.key) ? "border-sky-300 bg-sky-50/40" : "border-slate-200"}`} />
                      </label>
                    ))}
                  </div>
                  {sizeMsg && <p className="mt-1 text-[11.5px] text-slate-500">{sizeMsg}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">{t("AI อ่านเฉพาะตัวเลขที่เขียนอยู่ในรูป ไม่กะจากสายตา · ช่องสีฟ้า = เปลี่ยนจากเดิม", "AI only reads numbers written in images · blue = changed")}</p>
                </div>

                {/* สาย / หูกระเป๋า — AI ดูรูปแล้วติ๊กให้ก่อน (ปุ่ม ✨ ด้านบน) · ความยาวเอาเฉพาะตัวเลขที่เขียนในรูป · แก้ได้ */}
                <div>
                  <span className={label}>
                    {t("สาย / หูกระเป๋า", "Strap / handle")}
                    {strap.byAi && <span className="ml-1.5 text-[10.5px] font-normal px-1.5 rounded bg-emerald-50 text-emerald-700">{t("AI ดูจากรูปแล้ว — ตรวจอีกที", "AI checked the images — please verify")}</span>}
                  </span>
                  <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={strap.has} onChange={(e) => setStrap((p) => ({ ...p, has: e.target.checked }))} className="h-4 w-4 accent-fuchsia-600" />
                    {t("มีสายสะพาย / สายคล้อง", "Has a shoulder / neck strap")}
                  </label>
                  {strap.has && (
                    <div className="grid grid-cols-2 gap-2 mt-1 ml-6 max-w-sm">
                      <label className="block"><span className="text-[11.5px] text-slate-500">{t("ความยาวสาย (ซม.)", "Strap drop (cm)")}</span>
                        <input value={strap.drop} inputMode="decimal" onChange={(e) => setStrap((p) => ({ ...p, drop: e.target.value.replace(/[^d.]/g, "") }))} className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg tabular-nums" /></label>
                      <label className="block"><span className="text-[11.5px] text-slate-500">{t("ปรับยาวได้ถึง (ซม.)", "Adjustable to (cm)")}</span>
                        <input value={strap.max} inputMode="decimal" placeholder="—" onChange={(e) => setStrap((p) => ({ ...p, max: e.target.value.replace(/[^d.]/g, "") }))} className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg tabular-nums" /></label>
                    </div>
                  )}
                  <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={strap.handle} onChange={(e) => setStrap((p) => ({ ...p, handle: e.target.checked }))} className="h-4 w-4 accent-fuchsia-600" />
                    {t("มีหูหิ้ว", "Has a handle")}
                  </label>
                  {strap.handle && (
                    <label className="block mt-1 ml-6 max-w-[11rem]"><span className="text-[11.5px] text-slate-500">{t("ความสูงหูหิ้ว (ซม.)", "Handle drop (cm)")}</span>
                      <input value={strap.handleDrop} inputMode="decimal" placeholder="—" onChange={(e) => setStrap((p) => ({ ...p, handleDrop: e.target.value.replace(/[^d.]/g, "") }))} className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-lg tabular-nums" /></label>
                  )}
                </div>

                <div>
                  <span className={label}>{t("ใส่อะไรได้บ้าง (คิดจากขนาดด้านบน · ติ๊กแก้ได้)", "What fits (from the size above · editable)")}</span>
                  {fitRows === null ? <p className="text-[12px] text-slate-400"><Spinner /></p> : (
                    <div className="flex flex-wrap gap-1.5">
                      {fitSug.length === 0 && fitPicks.length === 0 && <span className="text-[12px] text-slate-400">{t("กรอกขนาดให้ครบ 3 ด้านก่อน ระบบจะคิดให้ว่าใส่อะไรได้", "Enter all 3 dimensions first")}</span>}
                      {fitSug.map((x) => {
                        const on = fitPicks.some((p) => p.id === x.id);
                        return (
                          <button key={x.id} type="button" onClick={() => toggleFit(x.id, x.size)} title={x.fits ? "" : t("ตามขนาดน่าจะใส่ไม่ได้", "Probably too big")}
                            className={`${chip(on)} ${!x.fits && !on ? "line-through text-slate-400" : ""}`}>
                            {on ? "✓ " : ""}{x.name}{x.size ? ` ${x.size}` : ""}
                          </button>
                        );
                      })}
                      {fitPicks.filter((p) => !fitSug.some((x) => x.id === p.id)).map((p) => (
                        <button key={p.id} type="button" onClick={() => toggleFit(p.id, p.size ?? null)} className={chip(true)}>✓ {fitName(p.id)}{p.size ? ` ${p.size}` : ""}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className={label}>{t("กล่องไปรษณีย์", "Parcel box")}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={parcelId} onChange={(e) => { setParcelId(e.target.value); setParcelManual(true); }} disabled={boxes === null}
                      className="flex-1 min-w-[200px] h-9 px-2 text-[13px] border border-slate-200 rounded-lg bg-white">
                      <option value="">{t("— ไม่ระบุ —", "— none —")}</option>
                      {(boxes ?? []).filter((b) => b.is_active !== false).map((b) => <option key={b.id} value={b.id}>{boxLabel(b)}</option>)}
                    </select>
                    {parcelManual && autoBox && autoBox.id !== parcelId && (
                      <button type="button" onClick={() => { setParcelManual(false); setParcelId(autoBox.id); }} className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 hover:bg-slate-50">
                        {t(`ใช้กล่องที่แนะนำ: ${autoBox.name}`, `Use suggested: ${autoBox.name}`)}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {autoBox ? t(`กล่องเล็กสุดที่ใส่ได้ตามขนาด: ${boxLabel(autoBox)}`, `Smallest box that fits: ${boxLabel(autoBox)}`)
                      : Number(dims.w) > 0 && Number(dims.h) > 0 && Number(dims.d) > 0 ? t("ไม่มีกล่องที่ใหญ่พอ — เลือกเองได้", "No box is big enough — pick one")
                      : t("กรอกขนาดครบ 3 ด้าน ระบบจะเลือกกล่องให้", "Enter 3 dimensions to auto-pick a box")}
                  </p>
                </div>
              </>
            )}

            {/* ④ AI ร่าง */}
            {step === 3 && (
              <>
                {err && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[13px] text-rose-700">{err}</div>}
                {!res && !loading && !err && (
                  <p className="py-8 text-center text-sm text-slate-400">
                    {canDraft
                      ? t(`กด “✨ ให้ AI ร่าง” แล้วรอ ~10-20 วินาที${tpl ? ` · เขียนตามแม่แบบ "${tpl.name}"` : ""}`, `Press “✨ Let AI draft” and wait ~10-20 s${tpl ? ` · template "${tpl.name}"` : ""}`)
                      : t("ยังขาดข้อมูลที่จำเป็นในขั้นที่มีจุดแดง — กรอกให้ครบก่อน", "Fill the steps with a red dot first")}
                  </p>
                )}
                {loading && <p className="py-8 text-center text-sm text-slate-400"><Spinner />{t("AI กำลังดูรูปและเขียนข้อความ…", "AI is reading the images and writing…")}</p>}
                {res && rows.length === 0 && !loading && (
                  <p className="py-8 text-center text-sm text-slate-400">{t("AI ไม่ได้ส่งข้อความกลับมา — ลองกด “ให้คิดใหม่” อีกครั้ง", "AI returned nothing — press “Redraft” to try again")}</p>
                )}
                {rows.length > 0 && !loading && (
                  <>
            {missingEn.length > 0 && (
              <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12.5px] text-slate-600">
                ℹ️ {t(`AI ไม่ได้ส่งฉบับอังกฤษของ ${missingEn.map((f) => f.label).join(", ")} มา`,
                     `AI returned no English version of ${missingEn.map((f) => f.label).join(", ")}`)} —
                {t(" กดปุ่ม ⇄ แปล ใต้ช่องไทยได้ หรือกด “ให้คิดใหม่”", " use the ⇄ translate button under the Thai field, or press “Redraft”")}
              </div>
            )}
            {willOverwrite > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
                ⚠️ มี {willOverwrite} ช่องที่ติ๊กไว้และ<b>{t("มีข้อความเดิมอยู่แล้ว", "already has text")}</b> — กด “ใส่ลงฟอร์ม” ในขั้นสุดท้ายจะเขียนทับของเดิม (ยังไม่บันทึกจนกว่าจะกดบันทึกในฟอร์ม)
              </div>
            )}
            {/* ไทย | English ข้างกัน (เจ้าของเลือกแบบ A) · มือถือ = ไทยบน อังกฤษล่าง */}
            <div className="rounded-lg border border-slate-200 overflow-hidden grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
              {([["name_th", "name_en"], ["introduction", "introduction_en"], ["description", "english_description"]] as const)
                .filter(([a, b]) => rows.some((r) => r.key === a || r.key === b))
                .flatMap(([a, b]) => [rows.find((r) => r.key === a) ?? { key: `_${a}`, label: "", lang: "th" as const }, rows.find((r) => r.key === b) ?? { key: `_${b}`, label: "", lang: "en" as const }])
                .map((f) => {
                if (f.key.startsWith("_")) return <div key={f.key} className="bg-white" />;
                const now = String(current[f.key] ?? "").trim();
                const next = String(res?.[f.key] ?? "").trim();
                return (
                  <label key={f.key} className="flex gap-3 px-3 py-2.5 items-start cursor-pointer bg-white hover:bg-slate-50/70">
                    <input type="checkbox" checked={!!picked[f.key]}
                      onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-indigo-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[12.5px] font-semibold text-slate-700">{f.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${f.lang === "th" ? "bg-slate-100 text-slate-500" : "bg-sky-50 text-sky-600"}`}>
                          {f.lang === "th" ? t("ไทย", "Thai") : "EN"}
                        </span>
                        {isBlank(now)
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">{t("เดิมว่าง", "was empty")}</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{t("จะทับของเดิม", "will overwrite")}</span>}
                      </div>
                      {!isBlank(now) && (
                        <p className="text-[11.5px] text-slate-400 line-through whitespace-pre-wrap break-words mb-1">{now}</p>
                      )}
                      {/* แก้ข้อความได้ตรงนี้เลย · แก้ฝั่งหนึ่งแล้วอีกฝั่ง (ไทย↔EN) จะแปลตามให้อัตโนมัติ */}
                      <AutoTextarea value={next} rows={f.long ? 3 : 1}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => editField(f.key, e.target.value)}
                        onBlur={() => flushSync(f.key)}
                        className="w-full px-2 py-1.5 text-[13px] leading-relaxed text-slate-700 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" />
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {/* กดแปลเดี๋ยวนี้ได้ ไม่ต้องรอ auto (เจ้าของเจอเคสแก้แล้วอีกภาษายังไม่เปลี่ยน) */}
                        {PAIRS[f.key] && !!next && (
                          <button type="button" disabled={syncing === f.key}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); flushSync(f.key); }}
                            className="h-6 px-2 text-[11px] rounded-full border border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50">
                            {syncing === f.key
                              ? t("กำลังแปล…", "Translating…")
                              : f.lang === "th" ? t("⇄ แปลไปช่องอังกฤษ", "⇄ Translate to English") : t("⇄ แปลไปช่องไทย", "⇄ Translate to Thai")}
                          </button>
                        )}
                        {syncing === f.key && <span className="text-[11px] text-indigo-500">{t("กำลังแปลอีกภาษาให้…", "Translating the other language…")}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            {/* ❓ AI ถามกลับ — ตอบแล้วให้คิดใหม่ ข้อความจะแม่นขึ้น */}
            {(res?.questions?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-violet-200 overflow-hidden">
                <div className="px-3 py-2 bg-violet-50 border-b border-violet-200">
                  <p className="text-[12.5px] font-semibold text-violet-800">{t("❓ AI มีเรื่องที่ไม่แน่ใจ — ตอบแล้วจะเขียนได้แม่นขึ้น", "❓ AI is unsure about a few things — answering makes it more accurate")}</p>
                  <p className="text-[11.5px] text-violet-700 mt-0.5">{t("ตอบเท่าที่รู้ ข้อไหนไม่รู้ปล่อยว่างได้ · ข้อความด้านบนใช้ได้เลยถ้าไม่อยากตอบ", "Answer what you know, leave the rest blank · the text above is usable as-is")}</p>
                </div>
                <div className="p-3 space-y-2">
                  {/* คำถามแสดงตามภาษาหน้าจอ (AI ส่งมาทั้งไทย/อังกฤษ) · คำตอบผูกกับคำถามฉบับไทยเสมอ
                      เพื่อให้สลับภาษาแล้วคำตอบที่พิมพ์ไว้ไม่หาย */}
                  {(res?.questions ?? []).map((q, i) => {
                    const label = t("th", "en") === "en" ? ((res?.questions_en ?? [])[i] || q) : q;
                    return (
                      <div key={q}>
                        <label className="block text-[12.5px] text-slate-600 mb-1">{label}</label>
                        <input value={answers[q] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q]: e.target.value }))}
                          placeholder={t("พิมพ์คำตอบ…", "Type your answer…")}
                          className="w-full h-8 px-2.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300" />
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => void run({ withAnswers: true })}
                    disabled={loading || Object.values(answers).every((v) => !v.trim())}
                    className="h-8 px-3 text-[12.5px] font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
                    {t("✓ ตอบแล้ว ให้คิดใหม่", "✓ Answered — redraft")}
                  </button>
                </div>
              </div>
            )}

            {/* 💡 ควรเติมข้อมูลในระบบ */}
            {(res?.suggestions?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-slate-600 mb-1">{t("💡 ควรเติมข้อมูลพวกนี้ในระบบ จะได้ไม่ต้องตอบซ้ำทุกครั้ง", "💡 Fill these into the system so you don't answer every time")}</p>
                <ul className="space-y-0.5">
                  {(res?.suggestions ?? []).map((s) => (
                    <li key={s} className="text-[12.5px] text-slate-500">• {s}</li>
                  ))}
                </ul>
              </div>
            )}
                  </>
                )}
              </>
            )}

            {/* ⑤ กรอกมือ */}
            {step === 4 && (
              <>
                <p className="text-[12px] text-slate-500">{t("ช่องที่ AI ไม่เดา — กรอกเองตามจริง · * = บังคับตามกฎของประเภทสินค้านี้", "Fields AI never guesses — fill them in · * = required by this product type's rule")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {MANUAL_FIELDS.map((f) => {
                    const req = extras.manual_required.includes(f.key);
                    const miss = req && isBlank(manual[f.key]);
                    if (f.key === "warranty") return (
                      <div key={f.key}>
                        <span className={`text-[12.5px] ${miss ? "text-rose-600" : "text-slate-600"}`}>{t(f.label, f.en)}{req && <span className="text-rose-500"> *</span>}</span>
                        <WarrantySelect value={manual.warranty ?? ""} onChange={(v) => setManual((p) => ({ ...p, warranty: v }))} setup={setup} save={saveSetup} canEdit={canTpl} invalid={miss} />
                      </div>
                    );
                    return (
                      <label key={f.key} className="block">
                        <span className={`text-[12.5px] ${miss ? "text-rose-600" : "text-slate-600"}`}>{t(f.label, f.en)}{req && <span className="text-rose-500"> *</span>}</span>
                        {f.kind === "ref" && f.entity
                          ? <RefSelect entity={f.entity} value={manual[f.key] ?? ""} onChange={(v) => setManual((p) => ({ ...p, [f.key]: v }))} />
                          : <input value={manual[f.key] ?? ""} onChange={(e) => setManual((p) => ({ ...p, [f.key]: e.target.value }))}
                              placeholder={f.key === "warranty" ? t("เช่น 1 ปี ตะเข็บหลุด", "e.g. 1 year seams") : t("เช่น สั่งขนาดพิเศษได้ แจ้งทางแชต", "e.g. custom sizes on request")}
                              className={`w-full h-9 px-2.5 text-[13px] border rounded-lg ${miss ? "border-rose-300" : "border-slate-200"}`} />}
                      </label>
                    );
                  })}
                </div>
                {/* สรุปสิ่งที่จะลงฟอร์ม */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12px] text-slate-600">
                  <b className="font-semibold">{t("จะลงฟอร์ม", "Will go into the form")}:</b>{" "}
                  {outCount === 0 ? t("ยังไม่มีอะไรเปลี่ยน", "nothing changed yet") : Object.keys(output()).map((k) => FIELDS.find((f) => f.key === k)?.label ?? SIZE_INPUTS.find((f) => f.key === k)?.label ?? MANUAL_FIELDS.find((f) => f.key === k)?.label ?? (k === "fits" ? t("ใส่อะไรได้", "What fits") : k === "parcel_size_id" ? t("กล่องไปรษณีย์", "Parcel box") : k)).join(" · ")}
                  {willOverwrite > 0 && <span className="block mt-0.5 text-amber-700">⚠️ {t(`${willOverwrite} ช่องข้อความจะเขียนทับของเดิม`, `${willOverwrite} text field(s) will overwrite existing text`)}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
