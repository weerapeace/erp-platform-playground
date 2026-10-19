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
import { useToast } from "@/components/toast";
import { GiftCardsEditor } from "@/components/website-gift-cards-editor";
import { RestockCard } from "@/components/website-restock-panel";
import { SaveBar } from "@/components/save-bar";
import { ScrollTabs } from "@/components/scroll-tabs";
import { BilingualText, ContentLangProvider, TranslationBar } from "@/components/bilingual-field";
import { coverageOf, needsTranslation, readMeta, translationPatch, translationStatus } from "@/lib/content-i18n";
import { translateContent } from "@/lib/content-translate";

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

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

/** แท็บรายชื่อ (ไม่ใช่ช่องตั้งค่า) — ต่อท้ายแท็บหมวดข้อมูลร้าน */
const LIST_TABS = [
  { key: "subscribers", label: "📬 รับข่าวสาร" },
  { key: "restock", label: "🔔 รอแจ้งของเข้า" },
];
/** จำแท็บล่าสุด (เครื่องนี้) — เปิดมาอีกครั้งอยู่แท็บเดิม */
const TAB_KEY = "website-info-tab";

export function WebsiteInfoPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [saved, setSaved] = useState<Info>({});
  const [info, setInfo] = useState<Info>({});
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/settings?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setFields(j.fields ?? []);
      setGroups(j.groups ?? []);
      setSaved(j.info ?? {});
      setInfo(j.info ?? {});
      setPrefix(j.effectiveOrderPrefix ?? "");
    } catch {
      toast.error("โหลดข้อมูลร้านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(info), [saved, info]);

  // 🗂 แท็บ: ทีละหมวด เต็มความกว้าง (เดิมการ์ดเรียง 2 คอลัมน์ รก) · ว่าง/หาไม่เจอ = หมวดแรก
  const [tab, setTabState] = useState<string>(() => {
    try {
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
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSaved(j.info);
      setInfo(j.info);
      setPrefix(j.effectiveOrderPrefix ?? "");
      window.dispatchEvent(new Event("website-info-saved"));
      toast.success("บันทึกข้อมูลร้านแล้ว — เว็บจะอัปเดตภายใน 1 นาที");
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
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
      const out = await translateContent(todo.map((x) => x.th));
      setInfo((prev) => {
        let next = { ...prev };
        todo.forEach((x, i) => {
          if (out[i]?.trim()) next = { ...next, ...translationPatch(next, x.key, x.th, out[i].trim(), true) };
        });
        return next;
      });
      if (out.filter((x) => x.trim()).length < todo.length) setTxError("แปลไม่ครบบางช่อง — กดอีกครั้งเพื่อแปลส่วนที่เหลือ");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "แปลไม่สำเร็จ");
    } finally {
      setTxBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">กำลังโหลดข้อมูลร้าน…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          ข้อมูลพวกนี้ขึ้นที่ท้ายเว็บ หน้า /contact และหน้าชำระเงินของเว็บร้าน · เว้นว่างช่องไหน เว็บจะไม่โชว์ช่องนั้น
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={() => setInfo(saved)}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              ละทิ้งการเปลี่ยนแปลง
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      <GiftCardsEditor open={cardsOpen} onClose={() => setCardsOpen(false)} shopSlug={shopSlug} shopId={shopId} />

      <ContentLangProvider>
      {i18nSlots.length > 0 && (
        <div className={`${cardCls} !p-3`}>
          <p className="text-[11px] text-slate-500 mb-2">🌐 ข้อความร้านภาษาอังกฤษ (หน้าเว็บ /en) — สลับเป็น EN เพื่อกรอก/ตรวจทีละช่อง · ช่องที่ว่าง ลูกค้าเห็นภาษาไทยแทน</p>
          <TranslationBar coverage={coverageOf(i18nSlots)} busy={txBusy} error={txError} onTranslateMissing={() => void translateMissing()} />
        </div>
      )}
      {/* 🗂 แถบแท็บ (ของกลาง ScrollTabs) — หมวดข้อมูลร้าน + รายชื่อ · ● = แก้แล้วยังไม่บันทึก */}
      <ScrollTabs activeKey={active} className="border-b border-slate-200">
        {[...groupTabs.map((g) => ({ key: g.key, label: g.label, dot: groupDirty(g.key) })), ...LIST_TABS.map((l) => ({ ...l, dot: false }))].map((t) => (
          <button
            key={t.key}
            type="button"
            data-tab-key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === t.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.dot && <span className="ml-1 text-amber-500" title="มีการแก้ที่ยังไม่บันทึก">●</span>}
          </button>
        ))}
      </ScrollTabs>

      {active === "subscribers" && <SubscribersCard shopSlug={shopSlug} defaultOpen />}
      {active === "restock" && <RestockCard shopSlug={shopSlug} cardCls={cardCls} defaultOpen />}

      <div>
        {groupTabs.map((g) => {
          const list = fields.filter((f) => f.group === g.key);
          if (g.key !== active) return null;
          return (
            <section key={g.key} className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800">{g.label}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{g.hint}</p>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {list.map((f) =>
                  f.i18n ? (
                    <BilingualText
                      key={f.key}
                      label={f.label}
                      hint={f.hint}
                      wide={f.type === "textarea"}
                      multiline={f.type === "textarea"}
                      placeholder={f.placeholder}
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
                  <p className="flex-1 min-w-[12rem] text-[11px] text-pink-800">🎴 การ์ดของขวัญ: ลายการ์ดของร้าน · ขนาด · โอกาส + ไอเดียข้อความ (ใช้เมื่อเปิด &quot;ให้ลูกค้าเขียนข้อความบนการ์ด&quot;)</p>
                  <button type="button" onClick={() => setCardsOpen(true)} className="px-3 py-1.5 rounded-lg border border-pink-300 bg-white text-xs text-pink-700 hover:bg-pink-100">
                    ⚙ ตั้งค่าการ์ด
                  </button>
                </div>
              )}
              {g.key === "order" && (
                <p className="text-[11px] text-slate-500 mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  เลขที่ออเดอร์ของร้านนี้จะขึ้นต้นด้วย <span className="font-mono font-semibold text-slate-800">{prefix}-</span>{" "}
                  ตามด้วยปี พ.ศ. + เดือน และลำดับ 5 หลัก เช่น {prefix}-{new Date().getFullYear() + 543}
                  {String(new Date().getMonth() + 1).padStart(2, "0")}-00001
                </p>
              )}
            </section>
          );
        })}
      </div>
      </ContentLangProvider>

      {/* 💾 แถบบันทึก (ของกลาง) — หน้านี้ยาว ปุ่มบนสุดเลื่อนหายไป */}
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setInfo(saved)} note="บันทึกแล้วเว็บร้านเปลี่ยนภายใน ~1 นาที" />
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
        <span>{f.label}</span>
        {f.hint && <span className="text-[11px] text-slate-400">— {f.hint}</span>}
      </label>
    );
  }
  const wide = f.type === "textarea" ? "sm:col-span-2" : "";
  return (
    <div className={wide}>
      <label className={labelCls}>{f.label}</label>
      {f.type === "textarea" ? (
        <textarea
          rows={3}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={f.type === "number" ? "number" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          min={f.type === "number" ? 0 : undefined}
          className={inputCls}
          value={String(value ?? "")}
          placeholder={f.placeholder}
          onChange={(e) => onChange(f.type === "number" ? e.target.value : e.target.value)}
        />
      )}
      {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
    </div>
  );
}

type Subscriber = { id: string; email: string; source: string; created_at: string };

/** รายชื่อสมัครรับข่าวสาร (จากบล็อก "สมัครรับข่าวสาร" บนเว็บ) — ดู/ลบ/ก๊อปอีเมล */
function SubscribersCard({ shopSlug, defaultOpen = false }: { shopSlug: string; defaultOpen?: boolean }) {
  const toast = useToast();
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
      setNote("โหลดรายชื่อไม่สำเร็จ");
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (s: Subscriber) => {
    if (!confirm(`ลบ ${s.email} ออกจากรายชื่อรับข่าวสาร?`)) return;
    const r = await apiFetch(`/api/website/subscribers?id=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.ok) return toast.error(j.error ?? "ลบไม่สำเร็จ");
    toast.success("ลบแล้ว");
    void load();
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join("\n"));
      toast.success(`คัดลอก ${rows.length} อีเมลแล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">📬 รายชื่อรับข่าวสาร</h3>
        <span className="text-xs text-slate-500">{total} รายชื่อ (จากบล็อก &quot;สมัครรับข่าวสาร&quot; บนเว็บ)</span>
        <div className="ml-auto flex gap-2">
          {rows.length > 0 && (
            <button onClick={copyAll} className="px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">คัดลอกอีเมลทั้งหมด</button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">
            {open ? "ซ่อน" : "ดูรายชื่อ"}
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
            countUnit="รายชื่อ"
            emptyText="ยังไม่มีใครสมัคร — เพิ่มบล็อก 'สมัครรับข่าวสาร' ในหน้าแรกได้ที่แท็บหน้าแรก"
            searchText={(r) => r.email}
            maxHeightClass="max-h-80"
            columns={[
              { key: "email", header: "อีเมล", width: "1fr", cell: (r) => <span className="text-sm">{r.email}</span>, sortValue: (r) => r.email },
              { key: "src", header: "ที่มา", width: "6rem", cell: (r) => <span className="text-xs text-slate-500">{r.source}</span> },
              {
                key: "at",
                header: "สมัครเมื่อ",
                width: "9rem",
                cell: (r) => <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>,
                sortValue: (r) => r.created_at,
              },
              { key: "del", header: "", width: "3rem", cell: (r) => <button onClick={() => void remove(r)} className="text-xs text-red-500 hover:underline">ลบ</button> },
            ]}
          />
        </div>
      )}
    </section>
  );
}
