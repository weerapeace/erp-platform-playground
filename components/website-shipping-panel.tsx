"use client";

/**
 * 🚚 WebsiteShippingPanel — แท็บ "🚚 การจัดส่ง" ในหน้า /website/<slug>
 *
 * ตั้ง "วิธีจัดส่ง" ที่ลูกค้าเลือกได้ตอนสั่ง (แทนค่าส่งเหมาตัวเดียว): ค่าส่งเหมา/ตามจำนวนชิ้น (+ กล่องแนะนำ) · ส่งฟรีแยกตามวิธี
 * · บวกพื้นที่ห่างไกล · จำกัดพื้นที่ · เก็บปลายทางได้ไหม + ค่าธรรมเนียม · ระยะเวลาถึง/รอบตัดส่ง · รับเองที่ร้าน
 * + ตัวลองคิดค่าส่ง (สูตรเดียวกับเว็บร้าน/ตอนรับออเดอร์ — lib/website-shipping)
 * ข้อมูล: /api/website/shipping · ของกลาง: SaveBar · MoneyInput · ConfirmDialog
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { SaveBar } from "@/components/save-bar";
import { MoneyInput } from "@/components/money-input";
import { ConfirmDialog } from "@/components/modal";
import {
  cutoffText,
  feeSummary,
  normalizeMethod,
  quoteMethod,
  type ShippingArea,
  type ShippingConfig,
  type ShippingMethod,
} from "@/lib/website-shipping";

type Meta = {
  carriers: { key: string; label: string }[];
  boxes: { name: string; size: string }[];
  areas: { key: ShippingArea; th: string; hint: string }[];
  suggestedRemote: string[];
  payCod: boolean;
};

const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const n = (raw: string) => Math.max(0, Number(raw) || 0);

/** วิธีสำเร็จรูป — กดเพิ่มแล้วแก้ต่อได้ */
const TEMPLATES: { label: string; make: () => Partial<ShippingMethod> }[] = [
  {
    label: "ส่งธรรมดา (Flash/Kerry/J&T)",
    make: () => ({
      kind: "ship", name: "ส่งธรรมดา", name_en: "Standard delivery", carrier: "flash", eta: "1–3 วัน", eta_en: "1–3 days", codAllowed: true, codFee: 30, remoteFee: 50, freeMin: 1500,
      fee: { kind: "tiers", tiers: [{ upTo: 1, fee: 45, box: "A" }, { upTo: 2, fee: 55, box: "B" }, { upTo: 4, fee: 70, box: "C" }, { upTo: null, fee: 80, box: "E" }] },
    }),
  },
  { label: "EMS ไปรษณีย์ไทย", make: () => ({ kind: "ship", name: "EMS ไปรษณีย์ไทย", name_en: "EMS Thailand Post", carrier: "thaipost", eta: "1–2 วัน", eta_en: "1–2 days", fee: { kind: "flat", amount: 80 }, remoteFee: 0, codAllowed: false }) },
  { label: "ด่วนในวัน (กทม.)", make: () => ({ kind: "ship", name: "ด่วนในวัน (กทม.)", name_en: "Same-day (Bangkok)", carrier: "other", area: "bkk", eta: "ภายในวันนี้", eta_en: "Today", cutoff: "14:00", fee: { kind: "flat", amount: 120 }, codAllowed: false }) },
  { label: "รับเองที่ร้าน", make: () => ({ kind: "pickup", name: "รับเองที่ร้าน", name_en: "Pick up at store", eta: "พร้อมรับภายใน 1 วัน", eta_en: "Ready within 1 day", fee: { kind: "flat", amount: 0 }, codAllowed: true, note: "" }) },
];

export function WebsiteShippingPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<ShippingConfig | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<ShippingMethod | null>(null);
  const [remoteText, setRemoteText] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/website/shipping?shop=${encodeURIComponent(shopSlug)}`).then((r) => r.json());
      if (j.error) return toast.error(j.error);
      setCfg(j.config);
      setSaved(JSON.stringify(j.config));
      setRemoteText((j.config.remotePostals ?? []).join(" "));
      setMeta({ carriers: j.carriers, boxes: j.boxes, areas: j.areas, suggestedRemote: j.suggestedRemote, payCod: j.payCod });
    } catch {
      toast.error("โหลดการตั้งค่าจัดส่งไม่สำเร็จ");
    }
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!cfg && JSON.stringify({ ...cfg, legacy: undefined }) !== JSON.stringify({ ...(JSON.parse(saved || "{}") as ShippingConfig), legacy: undefined });

  const setMethod = (id: string, patch: Partial<ShippingMethod>) =>
    setCfg((c) => (c ? { ...c, legacy: undefined, methods: c.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c));
  const move = (i: number, d: -1 | 1) =>
    setCfg((c) => {
      if (!c) return c;
      const arr = [...c.methods];
      const j = i + d;
      if (j < 0 || j >= arr.length) return c;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...c, legacy: undefined, methods: arr };
    });
  const add = (t: Partial<ShippingMethod>) =>
    setCfg((c) => {
      if (!c) return c;
      const used = new Set(c.methods.map((m) => m.id));
      let k = c.methods.length + 1;
      while (used.has(`m${k}`)) k++;
      return { ...c, legacy: undefined, methods: [...c.methods, normalizeMethod({ ...t, id: `m${k}` }, k)] };
    });

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const remotePostals = remoteText.split(/[\s,]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 2);
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

  return (
    <div className="space-y-4 pb-20" data-shipping-panel>
      {cfg.legacy && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ร้านนี้ยังใช้ <b>ค่าส่งเหมา</b> จากแท็บ 🏪 ข้อมูลร้าน (ด้านล่างคือค่าเดิมที่แปลงมาให้) — แก้/เพิ่มวิธีส่งแล้วกด 💾 บันทึก เพื่อเริ่มให้ลูกค้าเลือกวิธีส่งเอง
        </p>
      )}
      {!meta.payCod && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          ℹ️ ร้านปิด "รับเก็บเงินปลายทาง" อยู่ (แท็บ 🏪 ข้อมูลร้าน) — ติ๊กเก็บปลายทางรายวิธีจะยังไม่มีผลจนกว่าจะเปิด
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">เพิ่มวิธีส่งสำเร็จรูป:</span>
        {TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => add(t.make())} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700">
            + {t.label}
          </button>
        ))}
        <button type="button" onClick={() => add({ kind: "ship", name: "วิธีส่งใหม่" })} className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:text-blue-700">
          + ว่าง
        </button>
      </div>

      <div className="space-y-3">
        {cfg.methods.map((m, i) => (
          <MethodCard
            key={m.id}
            m={m}
            meta={meta}
            first={i === 0}
            last={i === cfg.methods.length - 1}
            onChange={(p) => setMethod(m.id, p)}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onDelete={() => setDel(m)}
          />
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">🏝 รหัสไปรษณีย์พื้นที่ห่างไกล</h3>
        <p className="text-xs text-slate-500">
          ใส่ 5 หลัก (ตรงตัว) หรือ 2–4 หลัก (ขึ้นต้นด้วย) คั่นด้วยเว้นวรรค · วิธีส่งที่ตั้ง "บวกพื้นที่ห่างไกล" จะบวกให้เอง (ส่งฟรีก็ยังบวก เพราะขนส่งเก็บจริง)
          · ⚠️ รายการแนะนำเป็นตัวอย่าง — เช็กกับขนส่งที่ใช้จริงแล้วแก้ได้
        </p>
        <textarea value={remoteText} onChange={(e) => { setRemoteText(e.target.value); setCfg((c) => (c ? { ...c, legacy: undefined } : c)); }} rows={2}
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs" placeholder="94 95 96 84320" />
        <button type="button" onClick={() => setRemoteText([...new Set([...remoteText.split(/[\s,]+/).filter(Boolean), ...meta.suggestedRemote])].join(" "))} className="text-xs text-blue-600 hover:underline">
          + เติมรายการแนะนำ ({meta.suggestedRemote.length} รหัส)
        </button>
      </section>

      <QuotePreview cfg={{ ...cfg, remotePostals: remoteText.split(/[\s,]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 2) }} />

      <SaveBar dirty={dirty || remoteDirty} saving={saving} onSave={save} onDiscard={() => { const c = JSON.parse(saved) as ShippingConfig; setCfg(c); setRemoteText(c.remotePostals.join(" ")); }} note="บันทึกแล้วเว็บร้านเปลี่ยนภายใน ~1 นาที" />

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        variant="danger"
        title={`ลบวิธีส่ง "${del?.name ?? ""}"?`}
        message="ออเดอร์เก่าที่เลือกวิธีนี้ยังเก็บชื่อไว้ครบ · ถ้าแค่อยากหยุดชั่วคราว ใช้สวิตช์ปิดแทนได้"
        confirmText="ลบวิธีนี้"
        onConfirm={() => {
          if (del) setCfg((c) => (c ? { ...c, legacy: undefined, methods: c.methods.filter((x) => x.id !== del.id) } : c));
          setDel(null);
        }}
      />
    </div>
  );
}

function MethodCard({ m, meta, first, last, onChange, onUp, onDown, onDelete }: {
  m: ShippingMethod; meta: Meta; first: boolean; last: boolean;
  onChange: (p: Partial<ShippingMethod>) => void; onUp: () => void; onDown: () => void; onDelete: () => void;
}) {
  const field = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";
  const lbl = "block text-[11px] font-medium text-slate-500 mb-1";
  const tiers = m.fee.kind === "tiers" ? m.fee.tiers : null;
  return (
    <section className={`rounded-xl border p-3 space-y-3 ${m.enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-75"}`} data-method={m.id}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={m.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="h-4 w-4" />
          <span className={m.enabled ? "font-semibold text-slate-800" : "text-slate-500"}>{m.kind === "pickup" ? "🏪" : "🚚"} {m.name || "(ไม่มีชื่อ)"}</span>
        </label>
        <span className="text-xs text-slate-400">{feeSummary(m)}{m.freeMin > 0 ? ` · ส่งฟรีเมื่อ ${money(m.freeMin)}` : ""}</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" disabled={first} onClick={onUp} title="เลื่อนขึ้น (ลูกค้าเห็นตามลำดับนี้)" className="h-7 w-7 rounded border border-slate-200 text-xs disabled:opacity-30">↑</button>
          <button type="button" disabled={last} onClick={onDown} title="เลื่อนลง" className="h-7 w-7 rounded border border-slate-200 text-xs disabled:opacity-30">↓</button>
          <button type="button" onClick={onDelete} className="h-7 rounded border border-rose-200 px-2 text-xs text-rose-600 hover:bg-rose-50">ลบ</button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={lbl}>ชื่อที่ลูกค้าเห็น</label>
          <div className="flex gap-1.5">
            <input className={field} value={m.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="เช่น ส่งธรรมดา" />
            <input className={field} value={m.name_en ?? ""} onChange={(e) => onChange({ name_en: e.target.value })} placeholder="EN (ไม่ใส่ก็ได้)" />
          </div>
        </div>
        <div>
          <label className={lbl}>ชนิด</label>
          <select className={field} value={m.kind} onChange={(e) => onChange({ kind: e.target.value as ShippingMethod["kind"], ...(e.target.value === "pickup" ? { remoteFee: 0 } : {}) })}>
            <option value="ship">ส่งถึงบ้าน</option>
            <option value="pickup">รับเองที่ร้าน (ไม่ต้องกรอกที่อยู่)</option>
          </select>
        </div>
        {m.kind === "ship" && (
          <div>
            <label className={lbl}>ขนส่ง (ไว้เลือกให้ตอนใส่เลขพัสดุ)</label>
            <select className={field} value={m.carrier} onChange={(e) => onChange({ carrier: e.target.value })}>
              <option value="">— ไม่ระบุ —</option>
              {meta.carriers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ค่าส่ง */}
      <div className="rounded-lg bg-slate-50 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[11px] font-medium text-slate-500">คิดค่าส่ง</span>
          <label className="inline-flex items-center gap-1"><input type="radio" checked={m.fee.kind === "flat"} onChange={() => onChange({ fee: { kind: "flat", amount: tiers?.[0]?.fee ?? 0 } })} /> เหมา</label>
          {m.kind === "ship" && (
            <label className="inline-flex items-center gap-1"><input type="radio" checked={m.fee.kind === "tiers"} onChange={() => onChange({ fee: { kind: "tiers", tiers: [{ upTo: 1, fee: m.fee.kind === "flat" ? m.fee.amount : 0, box: "" }, { upTo: null, fee: m.fee.kind === "flat" ? m.fee.amount : 0, box: "" }] } })} /> ตามจำนวนชิ้น (เลือกกล่องให้)</label>
          )}
        </div>
        {m.fee.kind === "flat" ? (
          <div className="flex items-center gap-2 text-sm">
            <MoneyInput value={m.fee.amount} onChange={(v) => onChange({ fee: { kind: "flat", amount: n(v) } })} className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <span className="text-xs text-slate-500">บาท / ออเดอร์ {m.fee.amount === 0 ? "(ฟรี)" : ""}</span>
          </div>
        ) : (
          <table className="text-sm">
            <tbody>
              {tiers!.map((t, ti) => {
                const prev = ti === 0 ? 0 : tiers![ti - 1].upTo ?? 0;
                const isLast = ti === tiers!.length - 1;
                const setTier = (p: Partial<typeof t>) => onChange({ fee: { kind: "tiers", tiers: tiers!.map((x, xi) => (xi === ti ? { ...x, ...p } : x)) } });
                return (
                  <tr key={ti}>
                    <td className="pr-2 py-0.5 text-xs text-slate-500 whitespace-nowrap">
                      {isLast ? <>{prev + 1} ชิ้นขึ้นไป</> : (
                        <>{prev + 1}–<input type="number" min={prev + 1} value={t.upTo ?? ""} onChange={(e) => setTier({ upTo: Math.max(prev + 1, Math.floor(Number(e.target.value) || prev + 1)) })} className="w-12 rounded border border-slate-200 px-1 py-0.5 text-xs" /> ชิ้น</>
                      )}
                    </td>
                    <td className="pr-2 py-0.5"><MoneyInput value={t.fee} onChange={(v) => setTier({ fee: n(v) })} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" /></td>
                    <td className="pr-2 py-0.5">
                      <select value={t.box} onChange={(e) => setTier({ box: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" title="กล่องที่แนะนำให้คนแพ็ก">
                        <option value="">กล่อง: —</option>
                        {meta.boxes.map((b) => <option key={b.name} value={b.name}>กล่อง {b.name} ({b.size})</option>)}
                      </select>
                    </td>
                    <td className="py-0.5">
                      {tiers!.length > 1 && <button type="button" onClick={() => onChange({ fee: { kind: "tiers", tiers: tiers!.filter((_, xi) => xi !== ti).map((x, xi, arr) => (xi === arr.length - 1 ? { ...x, upTo: null } : x)) } })} className="text-xs text-slate-400 hover:text-rose-600">✕</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {m.fee.kind === "tiers" && (
          <button type="button" onClick={() => {
            const t = tiers!;
            const lastPrev = t.length > 1 ? t[t.length - 2].upTo ?? 0 : 0;
            const next = [...t.slice(0, -1), { ...t[t.length - 1], upTo: lastPrev + 1 }, { upTo: null, fee: t[t.length - 1].fee, box: t[t.length - 1].box }];
            onChange({ fee: { kind: "tiers", tiers: next } });
          }} className="text-xs text-blue-600 hover:underline">+ เพิ่มขั้น</button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={lbl}>ส่งฟรีเมื่อยอดสินค้าถึง (0 = ไม่มี)</label>
          <MoneyInput value={m.freeMin} onChange={(v) => onChange({ freeMin: n(v) })} className={field} />
        </div>
        {m.kind === "ship" && (
          <>
            <div>
              <label className={lbl}>บวกพื้นที่ห่างไกล (0 = ไม่บวก)</label>
              <MoneyInput value={m.remoteFee} onChange={(v) => onChange({ remoteFee: n(v) })} className={field} />
            </div>
            <div>
              <label className={lbl}>ส่งได้ที่</label>
              <select className={field} value={m.area} onChange={(e) => onChange({ area: e.target.value as ShippingArea })}>
                {meta.areas.map((a) => <option key={a.key} value={a.key}>{a.th} — {a.hint}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className={lbl}>เก็บเงินปลายทาง</label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={m.codAllowed} onChange={(e) => onChange({ codAllowed: e.target.checked })} /> {m.kind === "pickup" ? "จ่ายหน้าร้านได้" : "ได้"}</label>
            {m.codAllowed && m.kind === "ship" && (
              <span className="flex items-center gap-1 text-xs text-slate-500">+<MoneyInput value={m.codFee} onChange={(v) => onChange({ codFee: n(v) })} className="w-16 rounded border border-slate-200 px-1.5 py-1 text-sm" />฿</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={lbl}>{m.kind === "pickup" ? "พร้อมรับเมื่อไร" : "ถึงภายใน"}</label>
          <div className="flex gap-1.5">
            <input className={field} value={m.eta} onChange={(e) => onChange({ eta: e.target.value })} placeholder={m.kind === "pickup" ? "พร้อมรับภายใน 1 วัน" : "1–3 วัน"} />
            <input className={field} value={m.eta_en ?? ""} onChange={(e) => onChange({ eta_en: e.target.value })} placeholder="EN" />
          </div>
        </div>
        <div>
          <label className={lbl}>รอบตัดส่ง (ว่าง = ไม่บอก)</label>
          <input type="time" className={field} value={m.cutoff} onChange={(e) => onChange({ cutoff: e.target.value })} />
          {m.cutoff && <p className="mt-0.5 text-[11px] text-slate-400">ลูกค้าเห็น: “{cutoffText(m, new Date())}”</p>}
        </div>
        <div>
          <label className={lbl}>{m.kind === "pickup" ? "ที่อยู่/เวลารับของ" : "หมายเหตุ (ไม่ใส่ก็ได้)"}</label>
          <input className={field} value={m.note} onChange={(e) => onChange({ note: e.target.value })} placeholder={m.kind === "pickup" ? "เช่น ร้านสาขาสีลม 10:00–19:00" : ""} />
        </div>
      </div>
    </section>
  );
}

/** 🧮 ลองคิดค่าส่ง — สูตรเดียวกับเว็บร้านและตอนรับออเดอร์ */
function QuotePreview({ cfg }: { cfg: ShippingConfig }) {
  const [subtotal, setSubtotal] = useState("990");
  const [qty, setQty] = useState("1");
  const [postal, setPostal] = useState("10200");
  const [cod, setCod] = useState(false);
  const rows = useMemo(
    () => cfg.methods.filter((m) => m.enabled).map((m) => ({ m, q: quoteMethod(m, { subtotal: n(subtotal), qty: Math.max(1, Math.floor(Number(qty) || 1)), postal, cod }, cfg) })),
    [cfg, subtotal, qty, postal, cod],
  );
  const field = "rounded-lg border border-slate-200 px-2 py-1 text-sm";
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2" data-quote-preview>
      <h3 className="text-sm font-semibold text-slate-700">🧮 ลองคิดค่าส่ง (ลูกค้าจะเห็นแบบนี้)</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        ยอดสินค้า <MoneyInput value={subtotal} onChange={setSubtotal} className={`${field} w-24`} />
        จำนวน <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} w-16`} /> ชิ้น
        รหัสไปรษณีย์ <input value={postal} onChange={(e) => setPostal(e.target.value.replace(/\D/g, "").slice(0, 5))} className={`${field} w-20 font-mono`} />
        <label className="inline-flex items-center gap-1"><input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} /> เก็บปลายทาง</label>
      </div>
      <ul className="space-y-1 text-sm">
        {rows.map(({ m, q }) => (
          <li key={m.id} className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 ${q.available ? "border-slate-200" : "border-slate-100 text-slate-400"}`}>
            <span className="font-medium">{m.name}</span>
            {q.box && <span className="text-[11px] text-slate-400">กล่อง {q.box}</span>}
            <span className="text-[11px] text-slate-400">
              {q.freeApplied ? "ส่งฟรี" : ""}{q.remoteFee ? ` +ห่างไกล ${money(q.remoteFee)}` : ""}{q.codFee ? ` +COD ${money(q.codFee)}` : ""}{q.toFree > 0 ? ` · ขาดอีก ${money(q.toFree)} ส่งฟรี` : ""}
            </span>
            <span className="ml-auto font-semibold">
              {q.available ? money(q.fee + q.codFee) : q.reason === "area" ? "ส่งไม่ถึงพื้นที่นี้" : q.reason === "cod" ? "เก็บปลายทางไม่ได้" : "ปิดอยู่"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
