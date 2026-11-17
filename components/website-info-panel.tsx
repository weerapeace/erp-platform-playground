"use client";

/**
 * WebsiteInfoPanel — แท็บ "🏪 ข้อมูลร้าน" ในหน้า /website/<slug>
 *
 * คำโปรย/คำอธิบายร้าน · ช่องทางติดต่อ · ค่าส่ง + ช่องทางชำระเงิน + ตัวย่อเลขออเดอร์
 * ฟอร์มวาดจากนิยามฟิลด์ที่ API ส่งมา (lib/website-site-info.ts) — เพิ่มช่องใหม่ที่ lib ที่เดียว หน้านี้ขึ้นเอง
 * ข้อมูล: /api/website/settings (guardApi + audit)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { apiFetch } from "@/lib/api";
import { loadWebSettings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { GiftCardsEditor } from "@/components/website-gift-cards-editor";
import { RestockCard } from "@/components/website-restock-panel";
import { ContactInboxCard } from "@/components/website-contact-inbox";
import { SaveBar } from "@/components/save-bar";
import { ScrollTabs } from "@/components/scroll-tabs";
import { BilingualText, ContentLangProvider, TranslationBar } from "@/components/bilingual-field";
import { coverageOf, needsTranslation, readMeta, translationPatch, translationStatus } from "@/lib/content-i18n";
import { translateContent } from "@/lib/content-translate";
import { webForm } from "@/lib/website-form-styles";
import { FeedCheckCard } from "@/components/website-feed-check";
import { useT } from "@/components/i18n";
import { tr, getLang } from "@/lib/lang";
import { labelEn } from "@/lib/website-admin-en";

type FieldDef = {
  key: string;
  label: string;
  hint?: string;
  group: string;
  type: "text" | "textarea" | "number" | "bool";
  isPublic: boolean;
  placeholder?: string;
  /** 🌐 มีภาษาอังกฤษคู่ (<key>_en) */
  i18n?: boolean;
};
type GroupDef = { key: string; label: string; hint: string };
type Info = Record<string, unknown>;

const inputCls = webForm.input;
const labelCls = webForm.label;
const cardCls = webForm.card;

/** แท็บรายชื่อ (ไม่ใช่ช่องตั้งค่า) — ต่อท้ายแท็บหมวดข้อมูลร้าน */
const LIST_TABS = [
  { key: "messages", get label() { return tr("📨 ข้อความลูกค้า", "📨 Customer messages"); } },
  { key: "subscribers", get label() { return tr("📬 รับข่าวสาร", "📬 Newsletter"); } },
  { key: "restock", get label() { return tr("🔔 รอแจ้งของเข้า", "🔔 Restock alerts"); } },
];
/** จำแท็บล่าสุด (เครื่องนี้) — เปิดมาอีกครั้งอยู่แท็บเดิม */
const TAB_KEY = "website-info-tab";

export function WebsiteInfoPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const t = useT();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [saved, setSaved] = useState<Info>({});
  const [info, setInfo] = useState<Info>({});
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  /** ที่อยู่เว็บจริงของร้าน (ลิงก์ฟีดสินค้า) · ยังไม่ผูกโดเมน = null */
  const [siteUrl, setSiteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await loadWebSettings<FieldDef, GroupDef>(shopSlug, true);
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setFields(j.fields ?? []);
      setGroups(j.groups ?? []);
      setSaved(j.info ?? {});
      setInfo(j.info ?? {});
      setPrefix(j.effectiveOrderPrefix ?? "");
      setSiteUrl(j.siteUrl ?? null);
    } catch {
      toast.error(tr("โหลดข้อมูลร้านไม่สำเร็จ", "Couldn't load shop info"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(info), [saved, info]);

  // 🗂 แท็บ: ทีละหมวด เต็มความกว้าง (เดิมการ์ดเรียง 2 คอลัมน์ รก) · ว่าง/หาไม่เจอ = หมวดแรก
  // ลิงก์จากกระดิ่ง (เช่น ข้อความลูกค้าใหม่) ส่ง ?sub=messages มา → เปิดแท็บย่อยนั้นก่อน
  const [tab, setTabState] = useState<string>(() => {
    try {
      const sub = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sub") : null;
      if (sub && LIST_TABS.some((l) => l.key === sub)) return sub;
      return localStorage.getItem(TAB_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const setTab = (k: string) => {
    setTabState(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {
      /* โหมดส่วนตัว — ไม่จำก็ได้ */
    }
  };
  const groupTabs = groups.filter((g) => fields.some((f) => f.group === g.key));
  const active = groupTabs.some((g) => g.key === tab) || LIST_TABS.some((l) => l.key === tab) ? tab : groupTabs[0]?.key ?? "";
  // หมวดที่มีช่องแก้แล้วยังไม่บันทึก (รวมช่องอังกฤษ) → จุดบนแท็บ
  const groupDirty = (g: string) =>
    fields.some((f) => f.group === g && [f.key, `${f.key}_en`].some((k) => JSON.stringify(saved[k] ?? null) !== JSON.stringify(info[k] ?? null)));

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, info }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Couldn't save"));
        return;
      }
      setSaved(j.info);
      setInfo(j.info);
      setPrefix(j.effectiveOrderPrefix ?? "");
      window.dispatchEvent(new Event("website-info-saved"));
      toast.success(t("บันทึกข้อมูลร้านแล้ว — เว็บจะอัปเดตภายใน 1 นาที", "Shop info saved — the site updates within 1 minute"));
    } catch {
      toast.error(t("บันทึกไม่สำเร็จ", "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: string | number | boolean) => setInfo((p) => ({ ...p, [k]: v }));

  // 🌐 ข้อความร้าน 2 ภาษา (ของกลาง lib/content-i18n + components/bilingual-field)
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const i18nSlots = useMemo(() => {
    const meta = readMeta(info);
    return fields
      .filter((f) => f.i18n && needsTranslation(info[f.key]))
      .map((f) => ({ key: f.key, th: String(info[f.key] ?? ""), status: translationStatus(info[f.key], info[`${f.key}_en`], meta[f.key]) }));
  }, [fields, info]);
  const translateMissing = async () => {
    const todo = i18nSlots.filter((x) => x.status === "empty" || x.status === "stale");
    if (!todo.length) return;
    setTxBusy(true);
    setTxError(null);
    try {
      const out = await translateContent(todo.map((x) => x.th), "en", { place: "website" });
      setInfo((prev) => {
        let next = { ...prev };
        todo.forEach((x, i) => {
          if (out[i]?.trim()) next = { ...next, ...translationPatch(next, x.key, x.th, out[i].trim(), true) };
        });
        return next;
      });
      if (out.filter((x) => x.trim()).length < todo.length) setTxError(t("แปลไม่ครบบางช่อง — กดอีกครั้งเพื่อแปลส่วนที่เหลือ", "Some fields weren't translated — press again to translate the rest"));
    } catch (e) {
      setTxError(e instanceof Error ? e.message : t("แปลไม่สำเร็จ", "Translation failed"));
    } finally {
      setTxBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">{t("กำลังโหลดข้อมูลร้าน…", "Loading shop info…")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {t("ข้อมูลพวกนี้ขึ้นที่ท้ายเว็บ หน้า /contact และหน้าชำระเงินของเว็บร้าน · เว้นว่างช่องไหน เว็บจะไม่โชว์ช่องนั้น", "This info shows in the site footer, the /contact page and checkout · Empty fields are hidden on the site")}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setInfo(saved)}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              {t("ละทิ้งการเปลี่ยนแปลง", "Discard changes")}
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
          </button>
        </div>
      </div>

      <GiftCardsEditor open={cardsOpen} onClose={() => setCardsOpen(false)} shopSlug={shopSlug} shopId={shopId} />

      <ContentLangProvider>
      {i18nSlots.length > 0 && (
        <div className={`${cardCls} !p-3`}>
          <p className="text-[11px] text-slate-500 mb-2">{t("🌐 ข้อความร้านภาษาอังกฤษ (หน้าเว็บ /en) — สลับเป็น EN เพื่อกรอก/ตรวจทีละช่อง · ช่องที่ว่าง ลูกค้าเห็นภาษาไทยแทน", "🌐 English shop text (/en pages) — switch to EN to fill in/check each field · Empty fields show Thai to customers")}</p>
          <TranslationBar coverage={coverageOf(i18nSlots)} busy={txBusy} error={txError} onTranslateMissing={() => void translateMissing()} />
        </div>
      )}
      {/* 🗂 แถบแท็บ (ของกลาง ScrollTabs) — หมวดข้อมูลร้าน + รายชื่อ · ● = แก้แล้วยังไม่บันทึก */}
      <ScrollTabs activeKey={active} className="border-b border-slate-200">
        {[...groupTabs.map((g) => ({ key: g.key, label: labelEn(g.label), dot: groupDirty(g.key) })), ...LIST_TABS.map((l) => ({ key: l.key, label: l.label, dot: false }))].map((tb) => (
          <button
            key={tb.key}
            type="button"
            data-tab-key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === tb.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tb.label}
            {tb.dot && <span className="ml-1 text-amber-500" title={t("มีการแก้ที่ยังไม่บันทึก", "Unsaved changes")}>●</span>}
          </button>
        ))}
      </ScrollTabs>

      {active === "messages" && <ContactInboxCard shopSlug={shopSlug} cardCls={cardCls} />}
      {active === "subscribers" && <SubscribersCard shopSlug={shopSlug} defaultOpen />}
      {active === "restock" && <RestockCard shopSlug={shopSlug} cardCls={cardCls} defaultOpen />}

      <div>
        {groupTabs.map((g) => {
          const list = fields.filter((f) => f.group === g.key);
          if (g.key !== active) return null;
          return (
            <section key={g.key} className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800">{labelEn(g.label)}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{labelEn(g.hint)}</p>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {list.map((f) =>
                  f.i18n ? (
                    <BilingualText
                      key={f.key}
                      label={labelEn(f.label)}
                      hint={f.hint ? labelEn(f.hint) : f.hint}
                      wide={f.type === "textarea"}
                      multiline={f.type === "textarea"}
                      placeholder={f.placeholder ? labelEn(f.placeholder) : f.placeholder}
                      value={info}
                      fieldKey={f.key}
                      onPatch={(patch) => setInfo((p) => ({ ...p, ...patch }))}
                    />
                  ) : (
                    <Field key={f.key} f={f} value={info[f.key] as string | number | boolean | undefined} onChange={(v) => set(f.key, v)} />
                  ),
                )}
              </div>
              {g.key === "gift" && (
                <div className="mt-3 rounded-lg bg-pink-50 px-3 py-2 flex flex-wrap items-center gap-2">
                  <p className="flex-1 min-w-[12rem] text-[11px] text-pink-800">{t("🎴 การ์ดของขวัญ: ลายการ์ดของร้าน · ขนาด · โอกาส + ไอเดียข้อความ (ใช้เมื่อเปิด \"ให้ลูกค้าเขียนข้อความบนการ์ด\") · 🎀 แบบห่อหลายแบบ (ชื่อ/รูป/ราคา)", "🎴 Gift cards: shop card designs · sizes · occasions + message ideas (used when \"Let customers write a card message\" is on) · 🎀 Multiple wrap styles (name/image/price)")}</p>
                  <button type="button" onClick={() => setCardsOpen(true)} className="px-3 py-1.5 rounded-lg border border-pink-300 bg-white text-xs text-pink-700 hover:bg-pink-100">
                    {t("⚙ ตั้งค่าการ์ด + แบบห่อ", "⚙ Card + wrap settings")}
                  </button>
                </div>
              )}
              {g.key === "tracking" && <FeedLinks siteUrl={siteUrl} />}
              {g.key === "tracking" && siteUrl && <FeedCheckCard siteUrl={siteUrl} />}
              {g.key === "search" && <SearchTermsBox shopId={shopId} />}
              {g.key === "order" && (
                <p className="text-[11px] text-slate-500 mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  {t("เลขที่ออเดอร์ของร้านนี้จะขึ้นต้นด้วย", "Order numbers for this shop start with")} <span className="font-mono font-semibold text-slate-800">{prefix}-</span>{" "}
                  {t("ตามด้วยปี พ.ศ. + เดือน และลำดับ 5 หลัก เช่น", "followed by the Thai (BE) year + month and a 5-digit sequence, e.g.")} {prefix}-{new Date().getFullYear() + 543}
                  {String(new Date().getMonth() + 1).padStart(2, "0")}-00001
                </p>
              )}
            </section>
          );
        })}
      </div>
      </ContentLangProvider>

      {/* 💾 แถบบันทึก (ของกลาง) — หน้านี้ยาว ปุ่มบนสุดเลื่อนหายไป */}
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setInfo(saved)} note={t("บันทึกแล้วเว็บร้านเปลี่ยนภายใน ~1 นาที", "The site updates ~1 minute after saving")} />
    </div>
  );
}

/** 📦 ฟีดสินค้า (เว็บร้าน /feeds/*.xml — รูปแบบ Google ที่ Meta/TikTok รับได้) — ลิงก์ไปวางใน Merchant Center / Commerce Manager / TikTok Catalog */
const FEEDS = [
  { file: "google.xml", label: "Google Merchant Center", get where() { return tr("Merchant Center › ผลิตภัณฑ์ › ฟีด › เพิ่มฟีด › ดึงข้อมูลตามกำหนดเวลา (วันละครั้ง)", "Merchant Center › Products › Feeds › Add feed › Scheduled fetch (daily)"); } },
  { file: "facebook.xml", label: "Meta (Facebook/IG) Catalog", get where() { return tr("Commerce Manager › แคตตาล็อก › แหล่งข้อมูล › ฟีดข้อมูล › URL ตามกำหนดเวลา", "Commerce Manager › Catalog › Data sources › Data feed › Scheduled URL"); } },
  { file: "tiktok.xml", label: "TikTok Catalog", where: "TikTok Ads Manager › Assets › Catalogs › Add products › Data feed (URL)" },
];
function FeedLinks({ siteUrl }: { siteUrl: string | null }) {
  const toast = useToast();
  const t = useT();
  if (!siteUrl) return <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{t("📦 ฟีดสินค้า: ร้านนี้ยังไม่ได้ผูกโดเมน — ผูกโดเมนก่อนแล้วลิงก์ฟีดจะขึ้นตรงนี้", "📦 Product feeds: this shop has no domain yet — connect a domain and the feed links will appear here")}</p>;
  const base = siteUrl.replace(/\/$/, "");
  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-semibold text-slate-700">{t("📦 ฟีดสินค้า (อัปเดตเองตามสินค้าที่เผยแพร่ · ราคา/สต็อก/รูปทุกสี)", "📦 Product feeds (auto-updated from published products · price/stock/images for every color)")}</p>
      {FEEDS.map((f) => {
        const url = `${base}/feeds/${f.file}`;
        return (
          <div key={f.file} className="flex flex-wrap items-center gap-2">
            <span className="w-44 text-[11px] text-slate-600">{f.label}</span>
            <code className="flex-1 min-w-[12rem] truncate rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-800">{url}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success(t("คัดลอกลิงก์ฟีดแล้ว", "Feed link copied")), () => toast.error(t("คัดลอกไม่สำเร็จ", "Couldn't copy")))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:border-blue-500"
            >
              {t("📋 คัดลอก", "📋 Copy")}
            </button>
            <p className="basis-full pl-0 sm:pl-[11.5rem] text-[10px] text-slate-500">{f.where}</p>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-500">{t("ร้านปิดเว็บชั่วคราวอยู่ = ฟีดว่าง (ไม่ยิงแอดไปหน้าที่ลูกค้าเข้าไม่ได้)", "While the site is temporarily closed the feed is empty (no ads to pages customers can't open)")}</p>
    </div>
  );
}

/** 🔍 คำที่ลูกค้าค้นบนเว็บ 30 วันล่าสุด (/api/website/search-terms) — หาไม่เจอ = ไว้เติมคำพ้อง/เพิ่มสินค้า */
function SearchTermsBox({ shopId }: { shopId: string }) {
  const toast = useToast();
  const t = useT();
  const [notFound, setNotFound] = useState(true);
  const [terms, setTerms] = useState<{ q: string; hits: number; lastResults: number; lastDay: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    setTerms(null);
    apiFetch(`/api/website/search-terms?shopId=${encodeURIComponent(shopId)}&days=30${notFound ? "&notFound=1" : ""}`)
      .then((r) => r.json())
      .then((j) => alive && setTerms(j.terms ?? []))
      .catch(() => alive && setTerms([]));
    return () => {
      alive = false;
    };
  }, [shopId, notFound]);
  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[11px] font-semibold text-slate-700">{t("🔍 คำที่ลูกค้าค้น (30 วันล่าสุด)", "🔍 Customer searches (last 30 days)")}</p>
        {(["notFound", "all"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setNotFound(k === "notFound")}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${notFound === (k === "notFound") ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600"}`}
          >
            {k === "notFound" ? t("หาไม่เจอ", "Not found") : t("ทั้งหมด", "All")}
          </button>
        ))}
      </div>
      {terms === null ? (
        <p className="mt-2 text-[11px] text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
      ) : terms.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">{notFound ? t("ยังไม่มีคำที่ค้นแล้วไม่เจอ 👍", "No searches without results 👍") : t("ยังไม่มีคนค้นในช่วงนี้", "No searches in this period")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <li key={term.q}>
              <button
                type="button"
                title={t(`ค้น ${term.hits} ครั้ง · ครั้งล่าสุด ${term.lastDay} เจอ ${term.lastResults} ชิ้น — กดเพื่อคัดลอกไปใส่คำพ้อง`, `Searched ${term.hits} times · last on ${term.lastDay}, ${term.lastResults} results — click to copy for synonyms`)}
                onClick={() => navigator.clipboard?.writeText(term.q).then(() => toast.success(t(`คัดลอก "${term.q}" แล้ว`, `Copied "${term.q}"`)), () => undefined)}
                className={`rounded-full border bg-white px-2 py-0.5 text-[11px] hover:border-blue-500 ${term.lastResults === 0 ? "border-red-200 text-red-700" : "border-slate-200 text-slate-700"}`}
              >
                {term.q} <span className="text-slate-400">×{term.hits}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-slate-500">{t("สีแดง = ครั้งล่าสุดหาไม่เจอ · เอาคำนี้ไปจับคู่กับคำที่มีในชื่อสินค้าในช่องคำพ้องด้านบน หรือเพิ่มสินค้าที่ลูกค้าตามหา · ไม่เก็บว่าใครค้น", "Red = no results last time · Map these words to words in product names in the synonyms field above, or add the products customers want · Who searched is not stored")}</p>
    </div>
  );
}

function Field({
  f,
  value,
  onChange,
}: {
  f: FieldDef;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  if (f.type === "bool") {
    return (
      <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-800 py-1 cursor-pointer">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
        <span>{labelEn(f.label)}</span>
        {f.hint && <span className="text-[11px] text-slate-400">— {labelEn(f.hint)}</span>}
      </label>
    );
  }
  const wide = f.type === "textarea" ? "sm:col-span-2" : "";
  return (
    <div className={wide}>
      <label className={labelCls}>{labelEn(f.label)}</label>
      {f.type === "textarea" ? (
        <textarea
          rows={3}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder ? labelEn(f.placeholder) : f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={f.type === "number" ? "number" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          min={f.type === "number" ? 0 : undefined}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder ? labelEn(f.placeholder) : f.placeholder}
          onChange={(e) => onChange(f.type === "number" ? e.target.value : e.target.value)}
        />
      )}
      {f.hint && <p className="text-[11px] text-slate-400 mt-1">{labelEn(f.hint)}</p>}
    </div>
  );
}

type Subscriber = { id: string; email: string; source: string; created_at: string };

/** รายชื่อสมัครรับข่าวสาร (จากบล็อก "สมัครรับข่าวสาร" บนเว็บ) — ดู/ลบ/ก๊อปอีเมล */
function SubscribersCard({ shopSlug, defaultOpen = false }: { shopSlug: string; defaultOpen?: boolean }) {
  const toast = useToast();
  const t = useT();
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/website/subscribers?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setRows(j.subscribers ?? []);
      setTotal(j.total ?? 0);
      setNote(j.error ?? null);
    } catch {
      setNote(tr("โหลดรายชื่อไม่สำเร็จ", "Couldn't load the list"));
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (s: Subscriber) => {
    if (!(await askConfirm({ title: t(`ลบ ${s.email} ออกจากรายชื่อรับข่าวสาร?`, `Remove ${s.email} from the newsletter list?`), variant: "danger", confirmText: t("ลบ", "Delete") }))) return;
    const r = await apiFetch(`/api/website/subscribers?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error ?? t("ลบไม่สำเร็จ", "Couldn't delete"));
    toast.success(t("ลบแล้ว", "Deleted"));
    void load();
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join("\n"));
      toast.success(t(`คัดลอก ${rows.length} อีเมลแล้ว`, `Copied ${rows.length} emails`));
    } catch {
      toast.error(t("คัดลอกไม่สำเร็จ", "Couldn't copy"));
    }
  };

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t("📬 รายชื่อรับข่าวสาร", "📬 Newsletter subscribers")}</h3>
        <span className="text-xs text-slate-500">{t(`${total} รายชื่อ (จากบล็อก "สมัครรับข่าวสาร" บนเว็บ)`, `${total} subscribers (from the "Newsletter signup" block on the site)`)}</span>
        <div className="ml-auto flex gap-2">
          {rows.length > 0 && (
            <button onClick={copyAll} className="px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">{t("คัดลอกอีเมลทั้งหมด", "Copy all emails")}</button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
            {open ? t("ซ่อน", "Hide") : t("ดูรายชื่อ", "View list")}
          </button>
        </div>
      </div>
      {note && <p className="text-[11px] text-amber-600 mt-1">{note}</p>}
      {open && (
        <div className="mt-3">
          <MiniTable<Subscriber>
            rows={rows}
            rowKey={(r) => r.id}
            dense
            countUnit={t("รายชื่อ", "subscribers")}
            emptyText={t("ยังไม่มีใครสมัคร — เพิ่มบล็อก 'สมัครรับข่าวสาร' ในหน้าแรกได้ที่แท็บหน้าแรก", "No subscribers yet — add a 'Newsletter signup' block in the Home page tab")}
            searchText={(r) => r.email}
            maxHeightClass="max-h-80"
            columns={[
              { key: "email", header: t("อีเมล", "Email"), width: "1fr", cell: (r) => <span className="text-sm">{r.email}</span>, sortValue: (r) => r.email },
              { key: "src", header: t("ที่มา", "Source"), width: "6rem", cell: (r) => <span className="text-xs text-slate-500">{r.source}</span> },
              {
                key: "at",
                header: t("สมัครเมื่อ", "Signed up"),
                width: "9rem",
                cell: (r) => <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { dateStyle: "short", timeStyle: "short" })}</span>,
                sortValue: (r) => r.created_at,
              },
              { key: "del", header: "", width: "3rem", cell: (r) => <button onClick={() => void remove(r)} className="text-xs text-red-500 hover:underline">{t("ลบ", "Delete")}</button> },
            ]}
          />
        </div>
      )}
    </section>
  );
}
