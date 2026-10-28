"use client";

/**
 * 🚚 WebsiteShippingPanel — แท็บ "🚚 การจัดส่ง" ในหน้า /website/<slug>
 *
 * ตั้ง "วิธีจัดส่ง" ที่ลูกค้าเลือกได้ตอนสั่ง (แทนค่าส่งเหมาตัวเดียว): ค่าส่งเหมา/ตามจำนวนชิ้น (+ กล่องแนะนำ) · ส่งฟรีแยกตามวิธี
 * · บวกพื้นที่ห่างไกล · จำกัดพื้นที่ · เก็บปลายทางได้ไหม + ค่าธรรมเนียม · ระยะเวลาถึง/รอบตัดส่ง · รับเองที่ร้าน
 *
 * หน้าตา (2026-10-28 เจ้าของเลือก "แบบ B" จากตัวอย่าง 3 แบบ):
 *   ซ้าย = รายการวิธีส่ง (การ์ดสั้น · ลากเรียง · สวิตช์เปิด/ปิด · ป้ายสรุป) + เมนู 🏝 พื้นที่ห่างไกล
 *   กลาง = รายละเอียดวิธีที่เลือก แบ่งกลุ่ม: ลูกค้าเห็นอะไร / ค่าส่ง / ส่งที่ไหน / เก็บปลายทาง / ระยะเวลา (+ จุดที่ควรดูในแต่ละกลุ่ม)
 *   ขวา = 👀 ลูกค้าจะเห็นแบบนี้ + ลองคิดค่าส่ง (components/website-shipping-preview)
 *   กว้างไม่พอ 3 ช่อง = ตัวอย่างไปอยู่ใต้รายละเอียด · จอแคบ/มือถือ = รายการ → แตะ → รายละเอียด (ปุ่มย้อนกลับ)
 *
 * ข้อมูล/สูตรไม่เปลี่ยน: /api/website/shipping + lib/website-shipping · ตัวเตือนตั้งค่าขัดกัน: lib/website-shipping-checks
 * ของกลาง: SaveBar · MoneyInput · askConfirm · useDragReorder/DragHandle · ToggleSwitch · Seg · FloatingDropdown · webForm
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { SaveBar } from "@/components/save-bar";
import { MoneyInput } from "@/components/money-input";
import { askConfirm } from "@/components/modal/ask-dialog";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { ToggleSwitch } from "@/components/toggle-switch";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { Seg } from "@/components/website-block-editor";
import { ShippingCustomerPreview } from "@/components/website-shipping-preview";
import {
  cutoffText,
  feeSummary,
  isRemotePostal,
  normalizeMethod,
  type ShippingArea,
  type ShippingConfig,
  type ShippingMethod,
} from "@/lib/website-shipping";
import {
  MAX_SHIPPING_METHODS,
  isSeriousIssue,
  methodIssues,
  shippingIssues,
  type ShippingIssue,
  type ShippingIssueGroup,
  type ShippingIssueLevel,
} from "@/lib/website-shipping-checks";
import { webForm } from "@/lib/website-form-styles";

type Meta = {
  carriers: { key: string; label: string }[];
  boxes: { name: string; size: string }[];
  areas: { key: ShippingArea; th: string; hint: string }[];
  suggestedRemote: string[];
  payCod: boolean;
};

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const n = (raw: string) => Math.max(0, Number(raw) || 0);
const parsePostals = (text: string) => text.split(/[\s,]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 2);
/** เมนูซ้ายตัวพิเศษ (ไม่ใช่วิธีส่ง) */
const REMOTE = "__remote";

/** วิธีสำเร็จรูป — กดเพิ่มแล้วแก้ต่อได้ */
const TEMPLATES: { icon: string; label: string; desc: string; make: () => Partial<ShippingMethod> }[] = [
  {
    icon: "🚚",
    label: "ส่งธรรมดา (Flash/Kerry/J&T)",
    desc: "฿45–80 ตามจำนวนชิ้น · ส่งฟรีเมื่อ ฿1,500 · COD ได้",
    make: () => ({
      kind: "ship", name: "ส่งธรรมดา", name_en: "Standard delivery", carrier: "flash", eta: "1–3 วัน", eta_en: "1–3 days", codAllowed: true, codFee: 30, remoteFee: 50, freeMin: 1500,
      fee: { kind: "tiers", tiers: [{ upTo: 1, fee: 45, box: "A" }, { upTo: 2, fee: 55, box: "B" }, { upTo: 4, fee: 70, box: "C" }, { upTo: null, fee: 80, box: "E" }] },
    }),
  },
  { icon: "📮", label: "EMS ไปรษณีย์ไทย", desc: "เหมา ฿80 · ถึงใน 1–2 วัน", make: () => ({ kind: "ship", name: "EMS ไปรษณีย์ไทย", name_en: "EMS Thailand Post", carrier: "thaipost", eta: "1–2 วัน", eta_en: "1–2 days", fee: { kind: "flat", amount: 80 }, remoteFee: 0, codAllowed: false }) },
  { icon: "⚡", label: "ด่วนในวัน (กทม.)", desc: "เหมา ฿120 · ตัดรอบ 14:00 · เฉพาะ กทม.", make: () => ({ kind: "ship", name: "ด่วนในวัน (กทม.)", name_en: "Same-day (Bangkok)", carrier: "other", area: "bkk", eta: "ภายในวันนี้", eta_en: "Today", cutoff: "14:00", fee: { kind: "flat", amount: 120 }, codAllowed: false }) },
  { icon: "🏪", label: "รับเองที่ร้าน", desc: "ฟรี · ลูกค้าไม่ต้องกรอกที่อยู่", make: () => ({ kind: "pickup", name: "รับเองที่ร้าน", name_en: "Pick up at store", eta: "พร้อมรับภายใน 1 วัน", eta_en: "Ready within 1 day", fee: { kind: "flat", amount: 0 }, codAllowed: true, note: "" }) },
];

/** id ใหม่ที่ยังไม่ซ้ำ (m1, m2, …) */
const nextId = (methods: ShippingMethod[]) => {
  const used = new Set(methods.map((m) => m.id));
  let k = methods.length + 1;
  while (used.has(`m${k}`)) k++;
  return `m${k}`;
};

export function WebsiteShippingPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<ShippingConfig | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [remoteText, setRemoteText] = useState("");
  /** วิธีที่เลือกดูรายละเอียด (หรือ REMOTE) */
  const [sel, setSel] = useState<string | null>(null);
  /** จอแคบ: เปิดหน้ารายละเอียดอยู่ (ไม่ใช่หน้ารายการ) */
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/website/shipping?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json());
      if (j.error) return toast.error(j.error);
      setCfg(j.config);
      setSaved(JSON.stringify(j.config));
      setRemoteText((j.config.remotePostals ?? []).join(" "));
      setMeta({ carriers: j.carriers, boxes: j.boxes, areas: j.areas, suggestedRemote: j.suggestedRemote, payCod: j.payCod });
      setSel((s) => (s && (s === REMOTE || (j.config.methods as ShippingMethod[]).some((m) => m.id === s)) ? s : j.config.methods[0]?.id ?? null));
    } catch {
      toast.error("โหลดการตั้งค่าจัดส่งไม่สำเร็จ");
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  // วัดความกว้างจริงของแผง (หน้าเว็บไซต์ตั้งความกว้างหน้าได้ 3 แบบ → ใช้ความกว้างแผง ไม่ใช่ความกว้างจอ)
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ready = !!cfg && !!meta;
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const dirty = !!cfg && JSON.stringify({ ...cfg, legacy: undefined }) !== JSON.stringify({ ...(JSON.parse(saved || "{}") as ShippingConfig), legacy: undefined });

  const setMethod = (id: string, patch: Partial<ShippingMethod>) =>
    setCfg((c) => (c ? { ...c, legacy: undefined, methods: c.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c));
  const reorder = (from: number, to: number) => setCfg((c) => (c ? { ...c, legacy: undefined, methods: moveItem(c.methods, from, to) } : c));
  const choose = (id: string) => {
    setSel(id);
    setOpen(true);
  };
  const add = (t: Partial<ShippingMethod>) => {
    if (!cfg || cfg.methods.length >= MAX_SHIPPING_METHODS) return;
    const id = nextId(cfg.methods);
    setCfg((c) => (c ? { ...c, legacy: undefined, methods: [...c.methods, normalizeMethod({ ...t, id }, c.methods.length)] } : c));
    choose(id);
  };
  const duplicate = (m: ShippingMethod) => {
    if (!cfg || cfg.methods.length >= MAX_SHIPPING_METHODS) return;
    const id = nextId(cfg.methods);
    const copy: ShippingMethod = { ...(JSON.parse(JSON.stringify(m)) as ShippingMethod), id, name: `${m.name} (สำเนา)`.slice(0, 80) };
    setCfg((c) => {
      if (!c) return c;
      const arr = [...c.methods];
      arr.splice(arr.findIndex((x) => x.id === m.id) + 1, 0, copy);
      return { ...c, legacy: undefined, methods: arr };
    });
    setSel(id);
    toast.success("ทำซ้ำแล้ว — แก้ต่อได้เลย (ยังไม่บันทึก)");
  };
  const remove = async (m: ShippingMethod) => {
    const ok = await askConfirm({
      title: `ลบวิธีส่ง "${m.name}"?`,
      message: "ออเดอร์เก่าที่เลือกวิธีนี้ยังเก็บชื่อไว้ครบ · ถ้าแค่อยากหยุดชั่วคราว ใช้สวิตช์ปิดแทนได้",
      confirmText: "ลบวิธีนี้",
      variant: "danger",
    });
    if (!ok || !cfg) return;
    const rest = cfg.methods.filter((x) => x.id !== m.id);
    setCfg((c) => (c ? { ...c, legacy: undefined, methods: c.methods.filter((x) => x.id !== m.id) } : c));
    if (sel === m.id) {
      setSel(rest[0]?.id ?? null);
      setOpen(false);
    }
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const remotePostals = parsePostals(remoteText);
      const j = await apiFetch("/api/website/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, config: { ...cfg, remotePostals } }),
      }).then((r) => r.json());
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      setCfg(j.config);
      setSaved(JSON.stringify(j.config));
      setRemoteText((j.config.remotePostals ?? []).join(" "));
      toast.success("บันทึกวิธีจัดส่งแล้ว — เว็บร้านเปลี่ยนภายใน ~1 นาที");
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!cfg || !meta) return <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</p>;
  const remoteDirty = remoteText.trim() !== (JSON.parse(saved || "{}") as ShippingConfig).remotePostals?.join(" ");
  // ค่าที่ใช้ตรวจ/ตัวอย่าง = รวมรายการพื้นที่ห่างไกลที่กำลังพิมพ์ (ยังไม่บันทึก) ด้วย
  const live: ShippingConfig = { ...cfg, remotePostals: parsePostals(remoteText) };
  const checkOpts = { shopCod: meta.payCod, hasBoxes: meta.boxes.length > 0 };
  const m = sel && sel !== REMOTE ? cfg.methods.find((x) => x.id === sel) ?? null : null;
  const cols = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  const back = cols === 1 ? () => setOpen(false) : undefined;

  const list = (
    <MethodList
      cfg={live}
      sel={cols === 1 ? null : sel}
      checkOpts={checkOpts}
      onSelect={choose}
      onToggle={(id, v) => setMethod(id, { enabled: v })}
      onReorder={reorder}
      onAdd={add}
    />
  );
  const detail =
    sel === REMOTE ? (
      <RemoteEditor
        text={remoteText}
        suggested={meta.suggestedRemote}
        onText={(v) => {
          setRemoteText(v);
          setCfg((c) => (c ? { ...c, legacy: undefined } : c));
        }}
        back={back}
      />
    ) : m ? (
      <MethodDetail
        m={m}
        index={cfg.methods.findIndex((x) => x.id === m.id)}
        meta={meta}
        issues={methodIssues(m, live, checkOpts)}
        remoteCount={live.remotePostals.length}
        canDuplicate={cfg.methods.length < MAX_SHIPPING_METHODS}
        onChange={(p) => setMethod(m.id, p)}
        onDuplicate={() => duplicate(m)}
        onDelete={() => void remove(m)}
        onOpenRemote={() => choose(REMOTE)}
        back={back}
        compact={cols === 1}
      />
    ) : (
      <p className="py-10 text-center text-sm text-slate-400">{cfg.methods.length ? "เลือกวิธีส่งทางซ้ายเพื่อดูรายละเอียด" : "ยังไม่มีวิธีส่ง — กด + เพิ่มวิธีส่ง"}</p>
    );
  const preview = <ShippingCustomerPreview cfg={live} selectedId={m?.id ?? null} />;

  return (
    <div ref={rootRef} className="space-y-4 pb-20" data-shipping-panel data-cols={cols}>
      {cfg.legacy && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ร้านนี้ยังใช้ <b>ค่าส่งเหมา</b> จากแท็บ 🏪 ข้อมูลร้าน (ด้านล่างคือค่าเดิมที่แปลงมาให้) — แก้/เพิ่มวิธีส่งแล้วกด 💾 บันทึก เพื่อเริ่มให้ลูกค้าเลือกวิธีส่งเอง
        </p>
      )}

      {cols === 3 ? (
        <div className="grid grid-cols-[260px_minmax(0,1fr)_320px] items-start gap-4">
          <div>{list}</div>
          <div className="min-w-0">{detail}</div>
          <aside className="sticky top-2 space-y-2" data-preview-aside>
            <div className="text-sm font-semibold text-slate-700">👀 ลูกค้าจะเห็นแบบนี้</div>
            {preview}
          </aside>
        </div>
      ) : cols === 2 ? (
        <div className="grid grid-cols-[250px_minmax(0,1fr)] items-start gap-4">
          <div>{list}</div>
          <div className="min-w-0 space-y-4">
            {detail}
            <PreviewCard>{preview}</PreviewCard>
          </div>
        </div>
      ) : open && sel ? (
        <div className="space-y-4">
          {detail}
          <PreviewCard>{preview}</PreviewCard>
        </div>
      ) : (
        list
      )}

      <SaveBar dirty={dirty || remoteDirty} saving={saving} onSave={save} onDiscard={() => { const c = JSON.parse(saved) as ShippingConfig; setCfg(c); setRemoteText(c.remotePostals.join(" ")); }} note="บันทึกแล้วเว็บร้านเปลี่ยนภายใน ~1 นาที" />
    </div>
  );
}

function PreviewCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">👀 ลูกค้าจะเห็นแบบนี้</div>
      {children}
    </section>
  );
}

/* ───────── ซ้าย: รายการวิธีส่ง ───────── */

const LEVEL: Record<ShippingIssueLevel, { icon: string; cls: string }> = {
  error: { icon: "⛔", cls: "border-rose-200 bg-rose-50 text-rose-800" },
  warn: { icon: "⚠️", cls: "border-amber-200 bg-amber-50 text-amber-900" },
  info: { icon: "ℹ️", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  tip: { icon: "💡", cls: "border-blue-100 bg-blue-50 text-blue-800" },
};

function IssueList({ list }: { list: ShippingIssue[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-1.5" data-issues>
      {list.map((x, i) => (
        <li key={i} className={`flex gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${LEVEL[x.level].cls}`}>
          <span>{LEVEL[x.level].icon}</span>
          <span>{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

const TAG = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;
function Tag({ c, children }: { c: keyof typeof TAG; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[11px] ring-1 ring-inset ${TAG[c]}`}>{children}</span>;
}

function MethodList({ cfg, sel, checkOpts, onSelect, onToggle, onReorder, onAdd }: {
  cfg: ShippingConfig;
  sel: string | null;
  checkOpts: { shopCod: boolean; hasBoxes: boolean };
  onSelect: (id: string) => void;
  onToggle: (id: string, v: boolean) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: (t: Partial<ShippingMethod>) => void;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder);
  const firstOn = cfg.methods.find((m) => m.enabled)?.id;
  const full = cfg.methods.length >= MAX_SHIPPING_METHODS;
  return (
    <div className="space-y-2.5" data-method-list>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">วิธีจัดส่ง</h2>
          <p className="text-xs text-slate-500">
            {cfg.methods.length} วิธี · เปิดอยู่ {cfg.methods.filter((m) => m.enabled).length} · ลากเรียงได้ (ลูกค้าเห็นตามลำดับนี้)
          </p>
        </div>
        <AddMenu disabled={full} onAdd={onAdd} />
      </div>
      <IssueList list={shippingIssues(cfg, checkOpts)} />
      <div className="space-y-2">
        {cfg.methods.map((m, i) => (
          <MethodCard
            key={m.id}
            m={m}
            active={sel === m.id}
            isDefault={m.id === firstOn}
            serious={methodIssues(m, cfg, checkOpts).filter(isSeriousIssue).length}
            rowProps={rowProps(i)}
            rowCls={rowCls(i)}
            handle={handleProps(i)}
            onSelect={() => onSelect(m.id)}
            onToggle={(v) => onToggle(m.id, v)}
          />
        ))}
      </div>
      {full && <p className="text-xs text-slate-400">ครบ {MAX_SHIPPING_METHODS} วิธีแล้ว (สูงสุดที่ระบบรับ)</p>}
      <div className="pt-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">ตั้งค่ารวมทุกวิธี</div>
      <button
        type="button"
        onClick={() => onSelect(REMOTE)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white p-2.5 text-left transition ${sel === REMOTE ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}
        data-remote-menu
      >
        <span className="text-lg leading-none">🏝</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">พื้นที่ห่างไกล</span>
          <span className="block text-xs text-slate-500">{cfg.remotePostals.length} รหัสไปรษณีย์ · ใช้กับวิธีที่ตั้ง “บวกพื้นที่ห่างไกล”</span>
        </span>
        <span className="text-slate-300">›</span>
      </button>
    </div>
  );
}

function MethodCard({ m, active, isDefault, serious, rowProps, rowCls, handle, onSelect, onToggle }: {
  m: ShippingMethod;
  active: boolean;
  isDefault: boolean;
  serious: number;
  rowProps: Record<string, unknown>;
  rowCls: string;
  handle: Record<string, unknown>;
  onSelect: () => void;
  onToggle: (v: boolean) => void;
}) {
  const tags: [keyof typeof TAG, string][] = [];
  if (m.freeMin > 0) tags.push(["emerald", `ส่งฟรี ${money(m.freeMin)}`]);
  if (m.codAllowed) tags.push(["amber", m.kind === "pickup" ? "จ่ายหน้าร้าน" : `COD${m.codFee ? ` +${money(m.codFee)}` : ""}`]);
  if (m.kind === "ship" && m.area !== "all") tags.push(["sky", m.area === "bkk" ? "กทม.เท่านั้น" : "กทม.+ปริมณฑล"]);
  if (m.cutoff) tags.push(["slate", `ตัดรอบ ${m.cutoff}`]);
  return (
    <div
      {...rowProps}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer gap-2 rounded-xl border p-2.5 text-left transition ${active ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"} ${m.enabled ? "bg-white" : "bg-slate-50"} ${rowCls}`}
      data-method={m.id}
    >
      <DragHandle {...handle} className="pt-0.5" />
      <span className={`pt-0.5 text-lg leading-none ${m.enabled ? "" : "opacity-50 grayscale"}`}>{m.kind === "pickup" ? "🏪" : "🚚"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-semibold ${m.enabled ? "text-slate-800" : "text-slate-400"}`}>{m.name || "(ไม่มีชื่อ)"}</span>
          {isDefault && (
            <span className="shrink-0 rounded bg-blue-600 px-1 text-[10px] font-medium text-white" title="วิธีแรกที่เปิดอยู่ = ถูกเลือกไว้ก่อนตอนลูกค้าเปิดหน้าชำระเงิน">
              ค่าเริ่มต้น
            </span>
          )}
        </div>
        <div className={`text-xs tabular-nums ${m.enabled ? "text-slate-500" : "text-slate-400"}`}>
          {feeSummary(m)}
          {m.eta ? ` · ${m.eta}` : ""}
        </div>
        {(!m.enabled || tags.length > 0 || serious > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {!m.enabled && <Tag c="slate">ปิดอยู่</Tag>}
            {tags.map(([c, t]) => <Tag key={t} c={c}>{t}</Tag>)}
            {serious > 0 && <Tag c="rose">⚠ {serious} จุดควรดู</Tag>}
          </div>
        )}
      </div>
      <ToggleSwitch on={m.enabled} onChange={onToggle} title={m.enabled ? "เปิดให้ลูกค้าเลือกอยู่ — กดเพื่อปิด" : "ปิดอยู่ — กดเพื่อเปิด"} />
    </div>
  );
}

function AddMenu({ disabled, onAdd }: { disabled: boolean; onAdd: (t: Partial<ShippingMethod>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (t: Partial<ShippingMethod>) => {
    setOpen(false);
    onAdd(t);
  };
  return (
    <div ref={ref} className="shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? `ครบ ${MAX_SHIPPING_METHODS} วิธีแล้ว` : "เพิ่มจากแบบสำเร็จรูป หรือเริ่มว่าง"}
        className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
        data-add-method
      >
        + เพิ่มวิธีส่ง
      </button>
      <FloatingDropdown anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={300}>
        <div className="overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg" style={{ maxHeight: "var(--fd-max-h)" }}>
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">เริ่มจากแบบสำเร็จรูป</div>
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" onClick={() => pick(t.make())} className="flex w-full gap-2.5 px-3 py-2 text-left hover:bg-slate-50">
              <span className="text-lg leading-none">{t.icon}</span>
              <span>
                <span className="block text-sm text-slate-800">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.desc}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => pick({ kind: "ship", name: "วิธีส่งใหม่" })} className="flex w-full gap-2.5 border-t border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
            <span className="text-lg leading-none">✏️</span>
            <span className="text-sm text-slate-700">ว่าง (ตั้งเองทั้งหมด)</span>
          </button>
        </div>
      </FloatingDropdown>
    </div>
  );
}

/* ───────── กลาง: รายละเอียดวิธีที่เลือก ───────── */

function Group({ icon, title, hint, issues, children, id }: { icon: string; title: string; hint?: string; issues?: ShippingIssue[]; children: ReactNode; id: ShippingIssueGroup }) {
  return (
    <section className={webForm.card} data-group={id}>
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {icon} {title}
        </h3>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </header>
      <div className="space-y-3">
        {issues && <IssueList list={issues} />}
        {children}
      </div>
    </section>
  );
}

function MethodDetail({ m, index, meta, issues, remoteCount, canDuplicate, onChange, onDuplicate, onDelete, onOpenRemote, back, compact }: {
  m: ShippingMethod;
  index: number;
  meta: Meta;
  issues: ShippingIssue[];
  remoteCount: number;
  canDuplicate: boolean;
  onChange: (p: Partial<ShippingMethod>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenRemote: () => void;
  back?: () => void;
  /** ช่องแคบ (มือถือ) — ตารางขั้นค่าส่งเรียง 2 บรรทัด */
  compact?: boolean;
}) {
  const lbl = webForm.label;
  const field = webForm.input;
  const of = (g: ShippingIssueGroup) => issues.filter((x) => x.group === g);
  const pickup = m.kind === "pickup";
  const tiers = m.fee.kind === "tiers" ? m.fee.tiers : null;
  const setTiers = (t: { upTo: number | null; fee: number; box: string }[]) => onChange({ fee: { kind: "tiers", tiers: t } });

  return (
    <div className="space-y-3" data-method-detail={m.id}>
      <div className="space-y-1">
        {back && (
          <button type="button" onClick={back} className="mb-1 text-sm text-blue-600 hover:underline">
            ‹ วิธีส่งทั้งหมด
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl leading-none">{pickup ? "🏪" : "🚚"}</span>
          <h2 className="min-w-0 truncate text-lg font-semibold text-slate-900">{m.name || "(ไม่มีชื่อ)"}</h2>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
            <ToggleSwitch on={m.enabled} onChange={(v) => onChange({ enabled: v })} size="sm" label={m.enabled ? "ลูกค้าเลือกได้" : "ปิดอยู่"} />
          </span>
          <span className="ml-auto flex gap-1.5">
            <button type="button" disabled={!canDuplicate} onClick={onDuplicate} title={canDuplicate ? "สร้างวิธีใหม่จากวิธีนี้ แล้วแก้ต่อ" : `ครบ ${MAX_SHIPPING_METHODS} วิธีแล้ว`}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 disabled:opacity-40" data-duplicate>
              ⧉ ทำซ้ำ
            </button>
            <button type="button" onClick={onDelete} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">
              ลบ
            </button>
          </span>
        </div>
        <p className="text-xs tabular-nums text-slate-500">
          ลำดับที่ {index + 1} ที่ลูกค้าเห็น · {feeSummary(m)}
          {m.freeMin > 0 ? ` · ส่งฟรีเมื่อ ${money(m.freeMin)}` : ""}
        </p>
      </div>

      <Group id="customer" icon="👀" title="ลูกค้าเห็นอะไร" hint="ชื่อและหมายเหตุโชว์ในหน้าชำระเงินของเว็บร้าน" issues={of("customer")}>
        <div className="max-w-xs">
          <label className={lbl}>ชนิด</label>
          <Seg
            value={m.kind}
            onChange={(v) =>
              onChange(
                v === "pickup"
                  ? // รับเองที่ร้าน: ไม่มีพื้นที่ห่างไกล · ค่าส่งเป็นแบบเหมาเท่านั้น (เดิมตอนบันทึกขั้นตามจำนวนชิ้นจะกลายเป็น 0 เงียบ ๆ → แปลงให้เห็นตรงนี้เลย)
                    { kind: v, remoteFee: 0, ...(m.fee.kind === "tiers" ? { fee: { kind: "flat" as const, amount: m.fee.tiers[0]?.fee ?? 0 } } : {}) }
                  : { kind: v },
              )
            }
            options={[{ v: "ship", l: "🚚 ส่งถึงบ้าน" }, { v: "pickup", l: "🏪 รับเองที่ร้าน" }]}
          />
        </div>
        <div>
          <label className={lbl}>ชื่อที่ลูกค้าเห็น</label>
          <div className="grid grid-cols-2 gap-2">
            <input className={field} value={m.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="เช่น ส่งธรรมดา" />
            <input className={field} value={m.name_en ?? ""} onChange={(e) => onChange({ name_en: e.target.value })} placeholder="English (ไม่ใส่ก็ได้)" />
          </div>
        </div>
        <div>
          <label className={lbl}>{pickup ? "ที่อยู่ / เวลารับของ" : "หมายเหตุ (ไม่ใส่ก็ได้)"}</label>
          <input className={field} value={m.note} onChange={(e) => onChange({ note: e.target.value })} placeholder={pickup ? "เช่น ร้านสาขาสีลม 10:00–19:00" : "เช่น งดส่งวันอาทิตย์"} />
        </div>
      </Group>

      <Group id="fee" icon="💰" title="ค่าส่ง" hint={pickup ? "รับเองที่ร้านส่วนใหญ่ไม่คิดค่าส่ง (ใส่ 0)" : "เหมาราคาเดียว หรือแบ่งตามจำนวนชิ้น (แต่ละขั้นเลือกกล่องให้คนแพ็ก)"} issues={of("fee")}>
        {!pickup && (
          <div className="max-w-xs">
            <Seg
              value={m.fee.kind}
              onChange={(v) => {
                if (v === m.fee.kind) return;
                if (v === "flat") onChange({ fee: { kind: "flat", amount: tiers?.[0]?.fee ?? 0 } });
                else {
                  const a = m.fee.kind === "flat" ? m.fee.amount : 0;
                  setTiers([{ upTo: 1, fee: a, box: "" }, { upTo: null, fee: a, box: "" }]);
                }
              }}
              options={[{ v: "flat", l: "เหมาราคาเดียว" }, { v: "tiers", l: "ตามจำนวนชิ้น" }]}
            />
          </div>
        )}
        {m.fee.kind === "flat" ? (
          <div className="flex items-center gap-2 text-sm">
            <MoneyInput value={m.fee.amount} onChange={(v) => onChange({ fee: { kind: "flat", amount: n(v) } })} className={`${field} !w-28 tabular-nums`} />
            <span className="text-xs text-slate-500">บาท / ออเดอร์ {m.fee.amount === 0 ? "(ฟรี)" : ""}</span>
          </div>
        ) : (
          <TierTable tiers={tiers!} boxes={meta.boxes} onChange={setTiers} compact={compact} />
        )}
        <div className="border-t border-slate-100 pt-3">
          <label className={lbl}>ส่งฟรีเมื่อยอดสินค้าถึง</label>
          <div className="flex flex-wrap items-center gap-2">
            <MoneyInput value={m.freeMin} onChange={(v) => onChange({ freeMin: n(v) })} className={`${field} !w-28 tabular-nums`} />
            <span className="text-xs text-slate-500">{m.freeMin > 0 ? `ซื้อครบ ${money(m.freeMin)} ไม่คิดค่าส่ง (เทียบยอดก่อนส่วนลด)` : "0 = ไม่มีส่งฟรี"}</span>
          </div>
        </div>
      </Group>

      {!pickup && (
        <Group id="area" icon="📍" title="ส่งที่ไหน · ใช้ขนส่งอะไร" issues={of("area")}>
          <div>
            <label className={lbl}>ส่งได้ที่</label>
            <div className="grid gap-1.5">
              {meta.areas.map((a) => (
                <label key={a.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 ${m.area === a.key ? "border-blue-400 bg-blue-50/60" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" className="mt-1" name={`area-${m.id}`} checked={m.area === a.key} onChange={() => onChange({ area: a.key })} />
                  <span>
                    <span className="block text-sm text-slate-800">{a.th}</span>
                    <span className="block text-xs text-slate-500">{a.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>บวกเพิ่มพื้นที่ห่างไกล</label>
            <div className="flex flex-wrap items-center gap-2">
              <MoneyInput value={m.remoteFee} onChange={(v) => onChange({ remoteFee: n(v) })} className={`${field} !w-28 tabular-nums`} />
              <span className="text-xs text-slate-500">
                {m.remoteFee > 0 ? "บวกแม้ส่งฟรี (ขนส่งเก็บจริง)" : "0 = ไม่บวก"} ·{" "}
                <button type="button" onClick={onOpenRemote} className="text-blue-600 hover:underline">
                  รายการรหัส ({remoteCount}) ›
                </button>
              </span>
            </div>
          </div>
          <div>
            <label className={lbl}>
              ขนส่ง <span className="font-normal text-slate-400">· ลูกค้าไม่เห็น ใช้เลือกให้เองตอนใส่เลขพัสดุ</span>
            </label>
            <select className={field} value={m.carrier} onChange={(e) => onChange({ carrier: e.target.value })}>
              <option value="">— ไม่ระบุ —</option>
              {meta.carriers.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </Group>
      )}

      <Group id="cod" icon="💵" title={pickup ? "จ่ายเงินตอนรับของ" : "เก็บเงินปลายทาง (COD)"} issues={of("cod")}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-700">{pickup ? "ลูกค้าจ่ายที่ร้านตอนมารับได้" : "ลูกค้าเลือกจ่ายตอนรับของได้"}</span>
          <ToggleSwitch on={m.codAllowed} onChange={(v) => onChange({ codAllowed: v })} title="เปิด/ปิด" />
        </div>
        {m.codAllowed && !pickup && (
          <div>
            <label className={lbl}>ค่าธรรมเนียมเก็บปลายทาง</label>
            <div className="flex flex-wrap items-center gap-2">
              <MoneyInput value={m.codFee} onChange={(v) => onChange({ codFee: n(v) })} className={`${field} !w-28 tabular-nums`} />
              <span className="text-xs text-slate-500">{m.codFee ? "บวกเมื่อลูกค้าเลือกเก็บปลายทาง" : "0 = ไม่คิดเพิ่ม"}</span>
            </div>
          </div>
        )}
      </Group>

      <Group id="time" icon="⏱" title="ระยะเวลา" issues={of("time")}>
        <div>
          <label className={lbl}>{pickup ? "พร้อมรับเมื่อไร" : "ถึงภายใน"}</label>
          <div className="grid grid-cols-2 gap-2">
            <input className={field} value={m.eta} onChange={(e) => onChange({ eta: e.target.value })} placeholder={pickup ? "พร้อมรับภายใน 1 วัน" : "1–3 วัน"} />
            <input className={field} value={m.eta_en ?? ""} onChange={(e) => onChange({ eta_en: e.target.value })} placeholder="English" />
          </div>
          {!pickup && <p className="mt-1 text-[11px] text-slate-400">ขึ้นต้นด้วยตัวเลข (เช่น 1–3 วัน) ลูกค้าจะเห็น “ถึงภายใน 1–3 วัน”</p>}
        </div>
        <div>
          <label className={lbl}>รอบตัดส่ง</label>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" className={`${field} !w-32`} value={m.cutoff} onChange={(e) => onChange({ cutoff: e.target.value })} />
            {m.cutoff ? (
              <>
                <button type="button" onClick={() => onChange({ cutoff: "" })} className="text-xs text-slate-400 hover:text-rose-600">
                  ล้าง
                </button>
                <span className="text-xs text-slate-500">ลูกค้าเห็นตอนนี้: “{cutoffText(m, new Date())}”</span>
              </>
            ) : (
              <span className="text-xs text-slate-400">ว่าง = ไม่บอกรอบตัด</span>
            )}
          </div>
        </div>
      </Group>
    </div>
  );
}

function TierTable({ tiers, boxes, onChange, compact }: { tiers: { upTo: number | null; fee: number; box: string }[]; boxes: Meta["boxes"]; onChange: (t: { upTo: number | null; fee: number; box: string }[]) => void; compact?: boolean }) {
  // จอแคบ: แต่ละขั้นเป็น 2 บรรทัด (จำนวนชิ้น+✕ / ค่าส่ง+กล่อง) — แถวเดียวจะเบียดจนอ่านไม่ออก
  const cols = compact
    ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-x-2 gap-y-1 rounded-lg border border-slate-100 p-2"
    : "grid grid-cols-[minmax(0,1.1fr)_6.5rem_minmax(0,1.2fr)_1.25rem] items-center gap-2";
  const addTier = () => {
    const lastPrev = tiers.length > 1 ? tiers[tiers.length - 2].upTo ?? 0 : 0;
    onChange([...tiers.slice(0, -1), { ...tiers[tiers.length - 1], upTo: lastPrev + 1 }, { upTo: null, fee: tiers[tiers.length - 1].fee, box: tiers[tiers.length - 1].box }]);
  };
  return (
    <div className="space-y-1.5" data-tiers>
      {!compact && (
        <div className={`${cols} text-[11px] font-medium text-slate-400`}>
          <span>จำนวนชิ้นในออเดอร์</span>
          <span>ค่าส่ง (บาท)</span>
          <span>กล่องที่ให้คนแพ็ก</span>
          <span />
        </div>
      )}
      {tiers.map((t, ti) => {
        const prev = ti === 0 ? 0 : tiers[ti - 1].upTo ?? 0;
        const isLast = ti === tiers.length - 1;
        const setTier = (p: Partial<typeof t>) => onChange(tiers.map((x, xi) => (xi === ti ? { ...x, ...p } : x)));
        return (
          <div key={ti} className={cols}>
            <span className={`whitespace-nowrap text-sm tabular-nums text-slate-600 ${compact ? "order-1 col-span-2" : ""}`}>
              {isLast ? (
                <>{prev + 1} ชิ้นขึ้นไป</>
              ) : (
                <>
                  {prev + 1}–
                  <input type="number" min={prev + 1} value={t.upTo ?? ""} onChange={(e) => setTier({ upTo: Math.max(prev + 1, Math.floor(Number(e.target.value) || prev + 1)) })}
                    className="mx-1 w-12 rounded border border-slate-200 px-1 py-0.5 text-sm tabular-nums" aria-label={`ขั้นที่ ${ti + 1} ถึงกี่ชิ้น`} />
                  ชิ้น
                </>
              )}
            </span>
            <MoneyInput value={t.fee} onChange={(v) => setTier({ fee: n(v) })} className={`${webForm.input} tabular-nums ${compact ? "order-3" : ""}`} title="ค่าส่ง (บาท)" />
            <select value={t.box} onChange={(e) => setTier({ box: e.target.value })} className={`${webForm.input} ${compact ? "order-4" : ""}`} title="กล่องที่แนะนำให้คนแพ็ก">
              <option value="">— ไม่ระบุ —</option>
              {boxes.map((b) => (
                <option key={b.name} value={b.name}>
                  กล่อง {b.name} ({b.size})
                </option>
              ))}
            </select>
            {tiers.length > 1 ? (
              <button type="button" title="ลบขั้นนี้" className={`text-slate-300 hover:text-rose-600 ${compact ? "order-2" : ""}`}
                onClick={() => onChange(tiers.filter((_, xi) => xi !== ti).map((x, xi, arr) => (xi === arr.length - 1 ? { ...x, upTo: null } : x)))}>
                ✕
              </button>
            ) : (
              <span className={compact ? "order-2" : ""} />
            )}
          </div>
        );
      })}
      <button type="button" onClick={addTier} className="text-xs text-blue-600 hover:underline">
        + เพิ่มขั้น
      </button>
    </div>
  );
}

/* ───────── 🏝 พื้นที่ห่างไกล (ใช้ร่วมทุกวิธี) ───────── */

function RemoteEditor({ text, suggested, onText, back }: { text: string; suggested: string[]; onText: (v: string) => void; back?: () => void }) {
  const [probe, setProbe] = useState("84320");
  const list = parsePostals(text);
  const hit = probe.length === 5 ? isRemotePostal(probe, { remotePostals: list }) : null;
  return (
    <div className="space-y-3" data-remote-editor>
      {back && (
        <button type="button" onClick={back} className="text-sm text-blue-600 hover:underline">
          ‹ วิธีส่งทั้งหมด
        </button>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">🏝 พื้นที่ห่างไกล</h2>
        <p className="text-xs text-slate-500">ใช้กับทุกวิธีที่ตั้ง “บวกพื้นที่ห่างไกล” ไว้ · ส่งฟรีก็ยังบวก เพราะขนส่งเก็บจริง</p>
      </div>
      <section className={`${webForm.card} space-y-2`}>
        <h3 className="text-sm font-semibold text-slate-800">✏️ รายการรหัสไปรษณีย์</h3>
        <p className="text-xs text-slate-500">ใส่ 5 หลัก = ตรงตัว · 2–4 หลัก = ทุกรหัสที่ขึ้นต้นด้วยเลขนี้ · คั่นด้วยเว้นวรรค</p>
        <textarea value={text} onChange={(e) => onText(e.target.value)} rows={3} className={`${webForm.input} font-mono text-xs`} placeholder="94 95 96 84320" />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-500">{list.length} รหัส</span>
          <button type="button" onClick={() => onText([...new Set([...text.split(/[\s,]+/).filter(Boolean), ...suggested])].join(" "))} className="text-blue-600 hover:underline">
            + เติมรายการแนะนำ ({suggested.length} รหัส)
          </button>
          <span className="text-slate-400">⚠️ รายการแนะนำเป็นตัวอย่าง — เช็กกับขนส่งที่ใช้จริงแล้วแก้ได้</span>
        </div>
      </section>
      <section className={`${webForm.card} space-y-2`}>
        <h3 className="text-sm font-semibold text-slate-800">🔎 ลองเช็กรหัส</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input value={probe} onChange={(e) => setProbe(e.target.value.replace(/\D/g, "").slice(0, 5))} className={`${webForm.input} !w-28 font-mono`} aria-label="รหัสไปรษณีย์ที่จะเช็ก" />
          {hit === null ? (
            <span className="text-xs text-slate-400">ใส่ให้ครบ 5 หลัก</span>
          ) : hit ? (
            <Tag c="amber">อยู่ในพื้นที่ห่างไกล — บวกเพิ่ม</Tag>
          ) : (
            <Tag c="emerald">ไม่ใช่พื้นที่ห่างไกล</Tag>
          )}
        </div>
      </section>
    </div>
  );
}
