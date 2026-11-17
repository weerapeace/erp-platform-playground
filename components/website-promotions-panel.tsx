"use client";

/**
 * 🏷 แท็บโปรโมชันอัตโนมัติของเว็บร้าน (/website/<shop>?tab=promotions)
 *
 * รายการ = MiniTable กลาง · เพิ่ม/แก้ = ERPModal · ลบ = ConfirmDialog · เวลาใช้ ERPDateTime24 (24 ชม. · เวลาไทย)
 * ชนิด: 🏷 ลดรายชิ้น · ⚡ Flash sale · ซื้อครบ N ชิ้นลด % · ซื้อ X แถม Y · ยอดครบขั้นบันได · ซื้อเป็นเซ็ต (กฎ lib/website-promotions · ERP คิดใหม่ตอนรับออเดอร์)
 * ไม่ต้องใส่โค้ด — ตะกร้าลดให้เอง · ลดต่อชิ้น (⚡/🏷) ถูกสุดตัวเดียว → โปรตะกร้าใช้ตัวที่ลดมากสุด 1 ตัว → คูปองคิดต่อจากยอดหลังโปร
 * เลือกสินค้า = ตัวเลือกกลาง WebsiteProductPicker (รูป · ตาราง/การ์ด · เลือกล่าสุด) · ขอบเขตเลือก 📦 กลุ่มสินค้าได้ + ยกเว้นรุ่น/กลุ่ม
 * 🏷 ลดรายชิ้น: ตั้งค่าตั้งต้นทีเดียว แล้วแก้รายตัว (ลด % / ลดบาท / ราคาพิเศษ) + ปัดราคาสวย + 🛡 เตือนลดเกินกำหนด / ต่ำกว่าทุน (เฉพาะคนมีสิทธิ์ดูทุน)
 * ตัวอย่างราคาในตารางใช้ตัวคิดเดียวกับเว็บร้าน (สินค้าจาก API สาธารณะ = ข้อมูลที่ลูกค้าเห็น)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPDateTime24 } from "@/components/form";
import { useToast } from "@/components/toast";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { ProductGroupEditor, ProductGroupsPanel, productLine, thumbUrl, type ShopProduct } from "@/components/website-product-groups";
import { apiFetch } from "@/lib/api";
import { loadStorefrontProducts, loadWebListings } from "@/lib/website-data";
import {
  inScope,
  isLive,
  itemDealPrice,
  promoBadge,
  PRICE_ROUNDS,
  PROMO_KINDS as PROMO_KINDS_TH,
  type DiscountKind,
  type ItemDealKind,
  type Promotion,
  type PromoKind,
  type PromoScope,
} from "@/lib/website-promotions";
import { localizedOpts } from "@/lib/website-admin-en";
// 🌐 ป้ายจากไฟล์มิเรอร์หน้าร้าน (แก้ที่ต้นทางไม่ได้) → แปลตอนแสดงผล
const PROMO_KINDS = localizedOpts(PROMO_KINDS_TH);
import { groupSummary, type ProductGroupRow } from "@/lib/website-product-groups";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";

type Tier = { min: string; kind: DiscountKind; value: string };
type DealForm = { kind: ItemDealKind; value: string };
type Form = {
  id?: string;
  name: string;
  kind: PromoKind;
  active: boolean;
  startsAt: string;
  endsAt: string;
  scopeMode: PromoScope["mode"];
  codes: string[];
  categories: string[];
  groups: string[];
  excludeCodes: string[];
  excludeGroups: string[];
  showExclude: boolean;
  percent: string;
  minQty: string;
  buyQty: string;
  getQty: string;
  getPercent: string;
  tiers: Tier[];
  bundleCodes: string[];
  bundleKind: DiscountKind;
  bundleValue: string;
  itemDef: DealForm;
  items: Record<string, DealForm>;
  round: number;
  countdown: boolean;
  noCoupon: boolean;
  badge: string;
};

const EMPTY: Form = {
  name: "",
  kind: "item",
  active: true,
  startsAt: "",
  endsAt: "",
  scopeMode: "codes",
  codes: [],
  categories: [],
  groups: [],
  excludeCodes: [],
  excludeGroups: [],
  showExclude: false,
  percent: "10",
  minQty: "2",
  buyQty: "2",
  getQty: "1",
  getPercent: "100",
  tiers: [{ min: "1500", kind: "fixed", value: "100" }],
  bundleCodes: [],
  bundleKind: "fixed",
  bundleValue: "200",
  itemDef: { kind: "percent", value: "10" },
  items: {},
  round: 0,
  countdown: false,
  noCoupon: false,
  badge: "",
};

const DEAL_KINDS: { k: ItemDealKind; l: string }[] = [
  { k: "percent", get l() { return tr("ลด %", "% off"); } },
  { k: "fixed", get l() { return tr("ลด ฿", "฿ off"); } },
  { k: "price", get l() { return tr("ราคาพิเศษ", "Special price"); } },
];
const ROUND_LABEL: Record<number, string> = {
  get 0() { return tr("ไม่ปัด", "No rounding"); },
  get 1() { return tr("ปัดเป็นบาทเต็ม", "Round to whole baht"); },
  get 9() { return tr("ปัดลงท้าย 9 (฿239)", "Round to end in 9 (฿239)"); },
  get 90() { return tr("ปัดลงท้าย 90 (฿1,090)", "Round to end in 90 (฿1,090)"); },
  get 100() { return tr("ปัดเป็นหลักร้อย (฿1,300)", "Round to hundreds (฿1,300)"); },
};

/** ISO → "YYYY-MM-DDTHH:mm" เวลาไทย (ช่อง ERPDateTime24) */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? `${local}:00+07:00` : "");
const thWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLang() === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "");
const money = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const dealOk = (d: DealForm | undefined) => !!d && d.value !== "" && Number(d.value) > 0;

const labelCls = webForm.label;
const inputCls = webForm.inputH9;
/** ช่องในแถวเดียวกัน (กว้างตามที่กำหนด ไม่ยืดเต็มแถว) */
const inlineCls = webForm.inputH9.replace("w-full ", "");

function statusOf(p: Promotion): { label: string; cls: string } {
  const now = Date.now();
  if (!p.active) return { label: tr("ปิดอยู่", "Off"), cls: "bg-slate-100 text-slate-500" };
  if (p.endsAt && new Date(p.endsAt).getTime() <= now) return { label: tr("หมดเวลา", "Ended"), cls: "bg-slate-100 text-slate-500" };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: tr("ยังไม่เริ่ม", "Not started"), cls: "bg-amber-50 text-amber-700" };
  return isLive(p) ? { label: tr("ใช้อยู่", "Active"), cls: "bg-emerald-50 text-emerald-700" } : { label: "—", cls: "" };
}

/** ชิปเลือกกลุ่มสินค้า (หลายกลุ่มได้) */
function GroupChips({ groups, value, onChange, onCreate, tone = "orange" }: { groups: ProductGroupRow[]; value: string[]; onChange: (v: string[]) => void; onCreate?: () => void; tone?: "orange" | "red" }) {
  const t = useT();
  const on = tone === "red" ? "border-red-400 bg-red-50 text-red-700" : "border-orange-500 bg-orange-50 text-orange-800";
  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.map((g) => {
        const sel = value.includes(g.id);
        return (
          <button key={g.id} type="button" title={groupSummary(g)} onClick={() => onChange(sel ? value.filter((x) => x !== g.id) : [...value, g.id])} className={`h-7 px-2.5 rounded-full text-xs border ${sel ? on : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
            {g.mode === "smart" ? "✨" : "✋"} {g.name}
          </button>
        );
      })}
      {value.filter((id) => !groups.some((g) => g.id === id)).map((id) => (
        <button key={id} type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="h-7 px-2.5 rounded-full text-xs border border-amber-300 bg-amber-50 text-amber-700" title={t("กลุ่มนี้ถูกลบไปแล้ว — กดเพื่อเอาออก", "This group was deleted — click to remove")}>
          {t("กลุ่มที่ถูกลบ ×", "Deleted group ×")}
        </button>
      ))}
      {onCreate && (
        <button type="button" onClick={onCreate} className="h-7 px-2.5 rounded-full text-xs border border-dashed border-slate-300 text-slate-600 hover:border-slate-500">
          {t("+ สร้างกลุ่มใหม่", "+ New group")}
        </button>
      )}
      {!groups.length && !onCreate && <span className="text-xs text-slate-400">{t("ยังไม่มีกลุ่มสินค้า", "No product groups yet")}</span>}
    </div>
  );
}

/** แถวในตารางลดรายชิ้น */
type DealRow = ShopProduct & { after: number; off: number; own: boolean; cost: number | null };

export function WebsitePromotionsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<Promotion[] | null>(null);
  const [used, setUsed] = useState<Record<string, { orders: number; discount: number }>>({});
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Promotion | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [cats, setCats] = useState<{ key: string; label: string }[]>([]);
  const [groups, setGroups] = useState<ProductGroupRow[]>([]);
  const [usedBy, setUsedBy] = useState<Record<string, string[]>>({});
  const [canCost, setCanCost] = useState(false);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [newGroupFor, setNewGroupFor] = useState<"scope" | "exclude" | null>(null);
  const [lossConfirm, setLossConfirm] = useState<number>(0);
  /** 🛡 เตือนเมื่อลดเกินกี่ % (ต่อเครื่อง · ไม่กระทบเว็บ) */
  const [warnPct, setWarnPct] = useState(50);

  useEffect(() => {
    let alive = true;
    loadWebListings<unknown, unknown, { key: string; label: string }>(shopSlug, true)
      .then((j) => alive && setCats((j.categories ?? []).map((c) => ({ key: c.key, label: c.label }))))
      .catch(() => undefined);
    loadStorefrontProducts<{ code?: string; name?: string; price?: number; categories?: string[]; category?: string; listedAt?: string | null; images?: string[] }>(shopSlug, true)
      .then((j) => {
        if (!alive) return;
        setProducts(
          (j.products ?? [])
            .filter((p) => p.code)
            .map((p) => ({ code: String(p.code).toUpperCase(), name: p.name ?? "", price: Number(p.price) || 0, categories: p.categories?.length ? p.categories : p.category ? [p.category] : [], listedAt: p.listedAt ?? null, image: p.images?.[0] ?? null })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [shopSlug]);

  const loadGroups = useCallback(() => {
    apiFetch(`/api/website/product-groups?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        setGroups(j.groups ?? []);
        setUsedBy(j.usedBy ?? {});
      })
      .catch(() => toast.error(tr("โหลดกลุ่มสินค้าไม่สำเร็จ", "Couldn't load product groups")));
  }, [shopSlug, toast]);

  const load = useCallback(() => {
    apiFetch(`/api/website/promotions?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.promotions ?? []);
        setUsed(j.used ?? {});
        setCanCost(!!j.canCost);
        setCosts(j.costs ?? {});
      })
      .catch(() => {
        toast.error(tr("โหลดโปรโมชันไม่สำเร็จ", "Couldn't load promotions"));
        setRows([]);
      });
    loadGroups();
  }, [shopSlug, toast, loadGroups]);
  useEffect(() => load(), [load]);

  const edit = (p: Promotion) => {
    const r = p.rule;
    const deal = (d: { kind: ItemDealKind; value: number } | undefined): DealForm => (d ? { kind: d.kind, value: String(d.value) } : { kind: "percent", value: "" });
    setForm({
      id: p.id,
      name: p.name,
      kind: p.kind,
      active: p.active,
      startsAt: toLocal(p.startsAt),
      endsAt: toLocal(p.endsAt),
      scopeMode: r.scope.mode,
      codes: r.scope.codes,
      categories: r.scope.categories,
      groups: r.scope.groups ?? [],
      excludeCodes: r.scope.excludeCodes ?? [],
      excludeGroups: r.scope.excludeGroups ?? [],
      showExclude: !!(r.scope.excludeCodes?.length || r.scope.excludeGroups?.length),
      percent: String(r.percent ?? 10),
      minQty: String(r.minQty ?? 2),
      buyQty: String(r.buyQty ?? 2),
      getQty: String(r.getQty ?? 1),
      getPercent: String(r.getPercent ?? 100),
      tiers: (r.tiers ?? []).map((t) => ({ min: String(t.min), kind: t.kind, value: String(t.value) })),
      bundleCodes: r.bundleCodes ?? [],
      bundleKind: r.bundleKind ?? "fixed",
      bundleValue: String(r.bundleValue ?? 200),
      itemDef: deal(r.item),
      items: Object.fromEntries(Object.entries(r.items ?? {}).map(([c, d]) => [c, deal(d)])),
      round: r.round ?? 0,
      countdown: !!r.countdown,
      noCoupon: !!r.noCoupon,
      badge: r.badge ?? "",
    });
  };

  const scopeOf = (f: Form): PromoScope => ({
    mode: f.scopeMode,
    codes: f.codes,
    categories: f.categories,
    groups: f.groups,
    excludeCodes: f.showExclude ? f.excludeCodes : [],
    excludeGroups: f.showExclude ? f.excludeGroups : [],
  });

  const payload = (f: Form) => ({
    name: f.name,
    kind: f.kind,
    active: f.active,
    startsAt: toIso(f.startsAt),
    endsAt: toIso(f.endsAt),
    rule: {
      scope: scopeOf(f),
      percent: Number(f.percent),
      minQty: Number(f.minQty),
      buyQty: Number(f.buyQty),
      getQty: Number(f.getQty),
      getPercent: Number(f.getPercent),
      tiers: f.tiers.map((t) => ({ min: Number(t.min), kind: t.kind, value: Number(t.value) })),
      bundleCodes: f.bundleCodes,
      bundleKind: f.bundleKind,
      bundleValue: Number(f.bundleValue),
      item: dealOk(f.itemDef) ? { kind: f.itemDef.kind, value: Number(f.itemDef.value) } : null,
      items: Object.fromEntries(Object.entries(f.items).filter(([, d]) => dealOk(d)).map(([c, d]) => [c, { kind: d.kind, value: Number(d.value) }])),
      round: f.round,
      countdown: f.countdown,
      noCoupon: f.noCoupon,
      badge: f.badge,
    },
  });

  const f = form;
  const set = (p: Partial<Form>) => setForm((x) => (x ? { ...x, ...p } : x));
  const preview = f ? promoBadge({ kind: f.kind, rule: payload(f).rule as unknown as Promotion["rule"] }) : "";

  // สินค้าที่ร่วมโปรตามขอบเขตที่ตั้งอยู่ (ตัวตัดสินเดียวกับเว็บร้าน · นิยามกลุ่มจากกลุ่มของร้าน)
  const inScopeProducts = useMemo(() => {
    if (!f || f.kind === "bundle") return [];
    const scope: PromoScope = { ...scopeOf(f), groupDefs: groups };
    return products.filter((p) => inScope(scope, productLine(p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f?.kind, f?.scopeMode, f?.codes, f?.categories, f?.groups, f?.excludeCodes, f?.excludeGroups, f?.showExclude, products, groups]);

  // 🏷 ตารางลดรายชิ้น: ราคาหลังลดของทุกรุ่นที่ร่วม
  const dealRows = useMemo<DealRow[]>(() => {
    if (!f || f.kind !== "item") return [];
    return inScopeProducts.map((p) => {
      const own = dealOk(f.items[p.code]);
      const d = own ? f.items[p.code] : dealOk(f.itemDef) ? f.itemDef : null;
      const after = d ? itemDealPrice(p.price, { kind: d.kind, value: Number(d.value) }, f.round) : p.price;
      const off = p.price > 0 ? Math.round((1 - after / p.price) * 100) : 0;
      return { ...p, after, off, own, cost: costs[p.code] ?? null };
    });
  }, [f, inScopeProducts, costs]);
  const belowCost = dealRows.filter((r) => r.cost != null && r.after < r.cost).length;
  const overWarn = dealRows.filter((r) => r.off > warnPct).length;
  const noDeal = dealRows.filter((r) => r.after >= r.price).length;

  const save = async (confirmedLoss = false) => {
    if (!form) return;
    if (form.kind === "item" && belowCost > 0 && !confirmedLoss) {
      setLossConfirm(belowCost);
      return;
    }
    setSaving(true);
    try {
      const body = { ...payload(form), ...(form.id ? { id: form.id } : { shopId }) };
      const r = await apiFetch("/api/website/promotions", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      toast.success(form.id ? t("บันทึกโปรโมชันแล้ว — เว็บอัปเดตภายใน ~1 นาที", "Promotion saved — site updates within ~1 min") : t(`สร้างโปร "${form.name}" แล้ว — ตะกร้าลดให้เองเมื่อถึงเวลา`, `Created "${form.name}" — cart applies it automatically when it starts`));
      setForm(null);
      load();
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: Promotion) => {
    const r = await apiFetch("/api/website/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, active: !p.active }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
    else {
      toast.success(p.active ? t(`ปิด "${p.name}" แล้ว`, `Turned off "${p.name}"`) : t(`เปิด "${p.name}" แล้ว`, `Turned on "${p.name}"`));
      load();
    }
  };

  const remove = async () => {
    if (!del) return;
    const r = await apiFetch(`/api/website/promotions?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? t("ลบไม่สำเร็จ", "Delete failed"));
    else {
      toast.success(t(`ลบ "${del.name}" แล้ว`, `Deleted "${del.name}"`));
      load();
    }
    setDel(null);
  };

  const setItem = (code: string, d: DealForm | null) =>
    setForm((x) => {
      if (!x) return x;
      const items = { ...x.items };
      if (d) items[code] = d;
      else delete items[code];
      return { ...x, items };
    });

  const scopeText = (r: Promotion) => {
    const s = r.rule.scope;
    const base = s.mode === "all" ? t("ทุกสินค้า", "All products") : s.mode === "codes" ? t(`${s.codes.length} รุ่น`, `${s.codes.length} models`) : s.mode === "groups" ? t(`กลุ่ม ${(s.groups ?? []).map((id) => groups.find((g) => g.id === id)?.name ?? "?").join(", ")}`, `Group ${(s.groups ?? []).map((id) => groups.find((g) => g.id === id)?.name ?? "?").join(", ")}`) : t(`${s.categories.length} หมวด`, `${s.categories.length} categories`);
    const ex = (s.excludeCodes?.length ?? 0) + (s.excludeGroups?.length ?? 0);
    return `${base}${ex ? t(` · ยกเว้น ${ex}`, ` · except ${ex}`) : ""}${r.rule.noCoupon ? t(" · ห้ามคูปอง", " · no coupons") : ""}`;
  };

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</div>;

  return (
    <div className="space-y-3">
      <MiniTable<Promotion>
        title={t("🏷 โปรโมชันอัตโนมัติ", "🏷 Auto promotions")}
        rows={rows}
        rowKey={(r) => r.id}
        countUnit={t("โปร", "promos")}
        searchText={(r) => `${r.name} ${r.rule.scope.codes.join(" ")} ${Object.keys(r.rule.items ?? {}).join(" ")}`}
        searchPlaceholder={t("ค้นหาชื่อโปร / รหัสรุ่น", "Search promo name / model code")}
        onRowClick={edit}
        actions={
          <button type="button" onClick={() => setForm({ ...EMPTY })} className="h-8 px-3 text-xs font-medium text-white rounded-lg bg-orange-600 hover:bg-orange-700">
            {t("+ สร้างโปรโมชัน", "+ New promotion")}
          </button>
        }
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">{t("ยังไม่มีโปรโมชัน", "No promotions yet")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("เช่น 🏷 ลดรายชิ้น (แต่ละรุ่นไม่เท่ากัน) · ⚡ Flash sale 11.11 ลด 20% · ซื้อ 2 ชิ้นลด 10% · ซื้อ 2 แถม 1 · ครบ ฿1,500 ลด ฿100 · กระเป๋า+เข็มขัด ลด ฿200 — ลูกค้าไม่ต้องใส่โค้ด", "e.g. 🏷 per-item discount (different per model) · ⚡ Flash sale 11.11 20% off · buy 2 get 10% off · buy 2 get 1 · spend ฿1,500 save ฿100 · bag + belt save ฿200 — customers don't need a code")}</p>
          </div>
        }
        columns={[
          { key: "name", header: t("โปรโมชัน", "Promotion"), width: "1.6fr", cell: (r) => <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{r.name}</span><span className="block text-[11px] text-slate-500">{promoBadge(r)}</span></span>, sortValue: (r) => r.name },
          { key: "kind", header: t("ชนิด", "Type"), width: "1fr", cell: (r) => <span className="text-xs text-slate-600">{PROMO_KINDS.find((k) => k.key === r.kind)?.label}</span> },
          { key: "scope", header: t("สินค้าที่ร่วม", "Products"), width: "1.1fr", cell: (r) => <span className="text-xs text-slate-500">{scopeText(r)}</span> },
          { key: "when", header: t("ช่วงเวลา", "Period"), width: "1.2fr", cell: (r) => <span className="text-xs text-slate-500">{r.startsAt || r.endsAt ? `${thWhen(r.startsAt) || t("ตอนนี้", "Now")} – ${thWhen(r.endsAt) || t("ไม่มีกำหนด", "No end")}` : t("ไม่จำกัด", "No limit")}</span> },
          { key: "used", header: t("ใช้ไป (90 วัน)", "Used (90 days)"), align: "right", width: "7rem", cell: (r) => <span className="text-xs tabular-nums">{used[r.id] ? t(`${used[r.id].orders} ออเดอร์ · ${money(used[r.id].discount)}`, `${used[r.id].orders} orders · ${money(used[r.id].discount)}`) : "—"}</span>, sortValue: (r) => used[r.id]?.orders ?? 0 },
          { key: "status", header: t("สถานะ", "Status"), width: "6rem", cell: (r) => { const s = statusOf(r); return <span className={`px-1.5 py-0.5 rounded text-[11px] ${s.cls}`}>{s.label}</span>; } },
          {
            key: "act",
            header: "",
            width: "7rem",
            align: "right",
            cell: (r) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => void toggle(r)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 hover:border-slate-400">{r.active ? t("ปิด", "Turn off") : t("เปิด", "Turn on")}</button>
                <button type="button" onClick={() => setDel(r)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-red-600 hover:border-red-300">{t("ลบ", "Delete")}</button>
              </span>
            ),
          },
        ]}
        footnote={t("ลดต่อชิ้น (⚡ Flash sale / 🏷 ลดรายชิ้น) หลายโปรทับกัน = ใช้ราคาที่ถูกสุดตัวเดียว · โปรตะกร้า (4 ชนิดที่เหลือ) ใช้ตัวที่ลดได้มากสุด 1 ตัว · คูปองคิดต่อจากยอดหลังโปร · ส่วนลดรวมอยู่ในช่องส่วนลดของออเดอร์ (แยกชื่อโปรให้เห็น)", "Per-item discounts (⚡ Flash sale / 🏷 per-item) that overlap = only the lowest price applies · cart promos (the other 4 types) = only the single biggest discount applies · coupons apply after promos · discounts are summed into the order's discount field (promo names shown)")}
      />

      <ProductGroupsPanel shopSlug={shopSlug} shopId={shopId} groups={groups} usedBy={usedBy} products={products} cats={cats} onChanged={loadGroups} />

      <ERPModal
        open={!!f}
        onClose={() => setForm(null)}
        title={f?.id ? t(`แก้โปร ${f.name}`, `Edit promo ${f.name}`) : t("สร้างโปรโมชัน", "New promotion")}
        size={f?.kind === "item" ? "xl" : "md"}
        defaultExpanded={false}
        footer={
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-xs text-slate-500 line-clamp-2">
              {preview && t(`ป้ายบนเว็บ: ${preview}`, `Site badge: ${preview}`)}
              {f && f.kind !== "bundle" && t(` · ร่วมโปร ${inScopeProducts.length} จาก ${products.length} รุ่น`, ` · ${inScopeProducts.length} of ${products.length} models in promo`)}
            </span>
            <button type="button" onClick={() => setForm(null)} className="h-9 px-4 text-sm rounded-lg border border-slate-200">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm rounded-lg bg-orange-600 text-white disabled:opacity-50">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
          </div>
        }
      >
        {f && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>{t("ชนิดโปรโมชัน", "Promotion type")}</label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROMO_KINDS.map((k) => (
                  <button key={k.key} type="button" onClick={() => set({ kind: k.key })} className={`text-left rounded-lg border px-3 py-2 ${f.kind === k.key ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}>
                    <span className="block text-sm font-medium text-slate-800">{k.label}</span>
                    <span className="block text-[11px] text-slate-500">{k.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>{t("ชื่อโปร (ลูกค้าเห็นในตะกร้า/ใบเสร็จ)", "Promo name (customers see it in cart/receipt)")}</label>
              <input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value.slice(0, 80) })} placeholder={f.kind === "flash" ? "Flash sale 11.11" : f.kind === "item" ? t("ลดราคาพิเศษปลายปี", "Year-end special") : t("ซื้อ 2 ชิ้น ลด 10%", "Buy 2, get 10% off")} />
            </div>

            {(f.kind === "flash" || f.kind === "qty_percent") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t("ลดกี่ %", "Discount %")}</label>
                  <input type="number" min={1} max={99} className={inputCls} value={f.percent} onChange={(e) => set({ percent: e.target.value })} />
                </div>
                {f.kind === "qty_percent" && (
                  <div>
                    <label className={labelCls}>{t("ซื้อครบกี่ชิ้น", "Min. items")}</label>
                    <input type="number" min={2} max={100} className={inputCls} value={f.minQty} onChange={(e) => set({ minQty: e.target.value })} />
                  </div>
                )}
              </div>
            )}
            {f.kind === "bxgy" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={labelCls}>{t("ซื้อ (ชิ้น)", "Buy (items)")}</label><input type="number" min={1} max={20} className={inputCls} value={f.buyQty} onChange={(e) => set({ buyQty: e.target.value })} /></div>
                <div><label className={labelCls}>{t("แถม (ชิ้น)", "Free (items)")}</label><input type="number" min={1} max={20} className={inputCls} value={f.getQty} onChange={(e) => set({ getQty: e.target.value })} /></div>
                <div><label className={labelCls}>{t("ชิ้นที่แถมลด % (100 = ฟรี)", "Free item % off (100 = free)")}</label><input type="number" min={1} max={100} className={inputCls} value={f.getPercent} onChange={(e) => set({ getPercent: e.target.value })} /></div>
                <p className="sm:col-span-3 text-[11px] text-slate-500">{t(`เรียงชิ้นในตะกร้าจากแพงไปถูก ทุก ${Number(f.buyQty) + Number(f.getQty) || "?"} ชิ้น → ชิ้นที่ถูกสุด ${f.getQty || "?"} ชิ้นได้ลด`, `Cart items sorted from most to least expensive: every ${Number(f.buyQty) + Number(f.getQty) || "?"} items → the cheapest ${f.getQty || "?"} get the discount`)}</p>
              </div>
            )}
            {f.kind === "tier" && (
              <div>
                <label className={labelCls}>{t("ขั้นยอดซื้อ (ใช้ขั้นสูงสุดที่ลูกค้าซื้อถึง)", "Spend tiers (highest tier reached applies)")}</label>
                <div className="space-y-1.5">
                  {f.tiers.map((tier, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-slate-500">{t("ครบ ฿", "Spend ฿")}</span>
                      <input type="number" min={1} className={`${inlineCls} w-28`} value={tier.min} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)) })} />
                      <span className="text-slate-500">{t("ลด", "Save")}</span>
                      <input type="number" min={1} className={`${inlineCls} w-24`} value={tier.value} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                      <select className={`${inlineCls} w-24`} value={tier.kind} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, kind: e.target.value as DiscountKind } : x)) })}>
                        <option value="fixed">{t("บาท", "Baht")}</option>
                        <option value="percent">%</option>
                      </select>
                      <button type="button" onClick={() => set({ tiers: f.tiers.filter((_, j) => j !== i) })} className="text-xs text-red-600">{t("ลบขั้น", "Remove tier")}</button>
                    </div>
                  ))}
                  {f.tiers.length < 6 && <button type="button" onClick={() => set({ tiers: [...f.tiers, { min: "", kind: "fixed", value: "" }] })} className="text-xs text-orange-700">{t("+ เพิ่มขั้น", "+ Add tier")}</button>}
                </div>
              </div>
            )}
            {f.kind === "bundle" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>{t("รุ่นในเซ็ต (ต้องซื้อครบทุกรุ่น · 2–6 รุ่น)", "Models in set (all must be bought · 2–6 models)")}</label>
                  <WebsiteProductPicker shopSlug={shopSlug} value={f.bundleCodes} max={6} onChange={(v) => set({ bundleCodes: v.slice(0, 6) })} />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">{t("ลดต่อเซ็ต", "Discount per set")}</span>
                  <input type="number" min={1} className={`${inlineCls} w-28`} value={f.bundleValue} onChange={(e) => set({ bundleValue: e.target.value })} />
                  <select className={`${inlineCls} w-24`} value={f.bundleKind} onChange={(e) => set({ bundleKind: e.target.value as DiscountKind })}>
                    <option value="fixed">{t("บาท", "Baht")}</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
            )}

            {f.kind !== "bundle" && (
              <div className="space-y-2">
                <label className={labelCls}>{t("สินค้าที่ร่วมโปร", "Products in promo")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {([["all", t("ทุกสินค้า", "All products")], ["codes", t("เลือกรุ่น", "Pick models")], ["groups", t("📦 กลุ่มสินค้า", "📦 Product groups")], ["categories", t("ตามหมวด", "By category")]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ scopeMode: k })} className={`h-8 px-3 rounded-lg text-xs border ${f.scopeMode === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600"}`}>{l}</button>
                  ))}
                </div>
                {f.scopeMode === "codes" && <WebsiteProductPicker shopSlug={shopSlug} value={f.codes} max={300} onChange={(v) => set({ codes: v })} />}
                {f.scopeMode === "groups" && <GroupChips groups={groups} value={f.groups} onChange={(v) => set({ groups: v })} onCreate={() => setNewGroupFor("scope")} />}
                {f.scopeMode === "categories" && (
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map((c) => {
                      const on = f.categories.includes(c.key);
                      return (
                        <button key={c.key} type="button" onClick={() => set({ categories: on ? f.categories.filter((x) => x !== c.key) : [...f.categories, c.key] })} className={`h-7 px-2.5 rounded-full text-xs border ${on ? "border-orange-500 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-600"}`}>{c.label}</button>
                      );
                    })}
                    {!cats.length && <span className="text-xs text-slate-400">{t("ยังไม่มีหมวดเว็บ — ตั้งที่แท็บ 📂 หมวดหมู่", "No web categories yet — set them in the 📂 Categories tab")}</span>}
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-600 pt-1">
                  <input type="checkbox" checked={f.showExclude} onChange={(e) => set({ showExclude: e.target.checked })} /> {t("🚫 ยกเว้นบางรุ่น / บางกลุ่ม", "🚫 Exclude some models / groups")}
                </label>
                {f.showExclude && (
                  <div className="space-y-2 rounded-lg border border-red-100 bg-red-50/40 p-2.5">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">{t("ยกเว้นกลุ่ม (เช่น \"มาใหม่ 30 วัน\" ไม่ลด)", "Exclude groups (e.g. \"New in 30 days\" not discounted)")}</p>
                      <GroupChips groups={groups} value={f.excludeGroups} onChange={(v) => set({ excludeGroups: v })} onCreate={() => setNewGroupFor("exclude")} tone="red" />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">{t("ยกเว้นรุ่น", "Exclude models")}</p>
                      <WebsiteProductPicker shopSlug={shopSlug} value={f.excludeCodes} max={300} onChange={(v) => set({ excludeCodes: v })} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {f.kind === "item" && (
              <div className="space-y-2">
                <label className={labelCls}>{t("ส่วนลดรายชิ้น — ตั้งค่าตั้งต้นทีเดียว แล้วแก้รายตัวได้ในตาราง", "Per-item discount — set a default once, then adjust each model in the table")}</label>
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2">
                  <span className="text-xs text-slate-600">{t("ทุกรุ่น", "All models")}</span>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
                    {DEAL_KINDS.map((d) => (
                      <button key={d.k} type="button" onClick={() => set({ itemDef: { ...f.itemDef, kind: d.k } })} className={`h-8 px-2.5 text-xs ${f.itemDef.kind === d.k ? "bg-orange-50 text-orange-800 font-medium" : "text-slate-600"}`}>{d.l}</button>
                    ))}
                  </div>
                  <input type="number" min={0} className={`${inlineCls} w-24`} value={f.itemDef.value} onChange={(e) => set({ itemDef: { ...f.itemDef, value: e.target.value } })} placeholder={t("ไม่ตั้ง", "None")} title={t("เว้นว่าง = ไม่ลดตั้งต้น (ลดเฉพาะรุ่นที่ตั้งรายตัว)", "Leave blank = no default discount (only models set individually)")} />
                  <select className={`${inlineCls} w-56`} title={t("ปัดเฉพาะลด % / ลด ฿ — ราคาพิเศษใช้ตามที่พิมพ์", "Rounding applies to % off / ฿ off only — special price is used as typed")} value={f.round} onChange={(e) => set({ round: Number(e.target.value) })}>
                    {PRICE_ROUNDS.map((r) => (
                      <option key={r} value={r}>{ROUND_LABEL[r]}</option>
                    ))}
                  </select>
                  {Object.keys(f.items).length > 0 && (
                    <button type="button" onClick={() => set({ items: {} })} className="h-8 px-2.5 text-xs rounded-lg border border-slate-200 hover:border-slate-400" title={t("ล้างที่ตั้งรายตัวทั้งหมด → ทุกรุ่นใช้ค่าตั้งต้น", "Clear all per-model settings → all models use the default")}>
                      {t("↺ ใช้ค่าตั้งต้นกับทุกตัว (", "↺ Use default for all (")}{Object.keys(f.items).length})
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-slate-500">{t("🛡 เตือนเมื่อลดเกิน", "🛡 Warn when discount over")}</span>
                  <input type="number" min={1} max={99} value={warnPct} onChange={(e) => setWarnPct(Math.max(1, Math.min(99, Number(e.target.value) || 50)))} className="h-6 w-14 rounded border border-slate-200 px-1 text-[11px]" />
                  <span className="text-slate-500">%</span>
                  {overWarn > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{t(`⚠ ลดเกิน ${warnPct}% ${overWarn} รุ่น`, `⚠ Over ${warnPct}% off: ${overWarn} models`)}</span>}
                  {belowCost > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">{t(`⛔ ต่ำกว่าทุน ${belowCost} รุ่น`, `⛔ Below cost: ${belowCost} models`)}</span>}
                  {noDeal > 0 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t(`ไม่ได้ลด ${noDeal} รุ่น`, `No discount: ${noDeal} models`)}</span>}
                  {canCost && !Object.keys(costs).length && <span className="text-slate-400">{t("· ยังไม่มีต้นทุนในระบบ — เตือนต่ำกว่าทุนจะเริ่มทำงานเมื่อกรอกต้นทุนที่ Parent SKU", "· No costs in the system yet — below-cost warning starts once costs are entered on the Parent SKU")}</span>}
                </div>
                <MiniTable<DealRow>
                  rows={dealRows}
                  rowKey={(r) => r.code}
                  countUnit={t("รุ่น", "models")}
                  dense
                  maxHeightClass="max-h-[420px]"
                  searchText={(r) => `${r.code} ${r.name}`}
                  searchPlaceholder={t("ค้นหารหัส / ชื่อ", "Search code / name")}
                  emptyText={<p className="py-4 text-center text-xs text-slate-400">{t("ยังไม่มีสินค้าที่ร่วมโปร — เลือกสินค้าด้านบนก่อน", "No products in this promo yet — pick products above first")}</p>}
                  columns={[
                    {
                      key: "p",
                      header: t("รุ่น", "models"),
                      width: "1.7fr",
                      sortValue: (r) => r.code,
                      cell: (r) => (
                        <span className="flex items-center gap-2 min-w-0">
                          {r.image ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={thumbUrl(r.image) ?? ""} alt="" className="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" />
                          ) : (
                            <span className="w-8 h-8 rounded bg-slate-100 shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block font-mono text-[11px] text-slate-700">{r.code}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{r.name}</span>
                          </span>
                        </span>
                      ),
                    },
                    { key: "price", header: t("ราคาเดิม", "Original price"), align: "right", width: "5.5rem", sortValue: (r) => r.price, cell: (r) => <span className="text-xs tabular-nums text-slate-500">{money(r.price)}</span> },
                    {
                      key: "deal",
                      header: t("ลดแบบ", "Discount type"),
                      width: "13rem",
                      cell: (r) => {
                        const d = f.items[r.code];
                        return (
                          <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={d ? d.kind : ""}
                              onChange={(e) => setItem(r.code, e.target.value ? { kind: e.target.value as ItemDealKind, value: d?.value ?? "" } : null)}
                              className={`h-7 rounded border px-1 text-[11px] ${d ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-500"}`}
                            >
                              <option value="">{t("ตามค่าตั้งต้น", "Use default")}</option>
                              {DEAL_KINDS.map((k) => (
                                <option key={k.k} value={k.k}>{k.l}</option>
                              ))}
                            </select>
                            {d && <input type="number" min={0} value={d.value} onChange={(e) => setItem(r.code, { ...d, value: e.target.value })} className="h-7 w-20 rounded border border-orange-300 px-1 text-[11px]" placeholder={d.kind === "price" ? "฿" : d.kind === "percent" ? "%" : "฿"} />}
                          </span>
                        );
                      },
                    },
                    {
                      key: "after",
                      header: t("ราคาหลังลด", "Sale price"),
                      align: "right",
                      width: "8rem",
                      sortValue: (r) => r.after,
                      cell: (r) => {
                        const low = r.cost != null && r.after < r.cost;
                        const warn = r.off > warnPct;
                        return (
                          <span className="text-right" title={r.cost != null ? t(`ต้นทุน ${money(r.cost)}`, `Cost ${money(r.cost)}`) : undefined}>
                            <span className={`block text-xs font-medium tabular-nums ${low ? "text-red-600" : r.after < r.price ? "text-emerald-700" : "text-slate-400"}`}>{money(r.after)}</span>
                            <span className={`block text-[10px] ${low ? "text-red-600" : warn ? "text-amber-600" : "text-slate-400"}`}>{r.after >= r.price ? t("ไม่ได้ลด", "No discount") : `−${r.off}%`}{low ? t(" · ต่ำกว่าทุน", " · below cost") : warn ? " ⚠" : ""}</span>
                          </span>
                        );
                      },
                    },
                    {
                      key: "x",
                      header: "",
                      width: "3.5rem",
                      align: "right",
                      cell: (r) => (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItem(r.code, null);
                            set({ showExclude: true, excludeCodes: [...new Set([...f.excludeCodes, r.code])] });
                          }}
                          className="h-6 px-1.5 text-[10px] rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"
                          title={t("ไม่ร่วมโปรนี้ (ย้ายไปรายการยกเว้น)", "Exclude from this promo (move to exclusions)")}
                        >
                          {t("ยกเว้น", "Exclude")}
                        </button>
                      ),
                    },
                  ]}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.countdown} onChange={(e) => set({ countdown: e.target.checked })} /> {t("⏳ โชว์นับถอยหลังบนเว็บ (ต้องใส่เวลาสิ้นสุด)", "⏳ Show countdown on site (end time required)")}</label>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("เริ่ม (เว้นว่าง = ตอนนี้)", "Start (blank = now)")}</label>
                <ERPDateTime24 value={f.startsAt} onChange={(v) => set({ startsAt: v })} defaultTime="00:00" />
              </div>
              <div>
                <label className={labelCls}>{t("สิ้นสุด", "End")} {f.kind === "flash" || (f.kind === "item" && f.countdown) ? t("(ต้องใส่ · เว็บนับถอยหลัง)", "(required · site counts down)") : t("(เว้นว่าง = ไม่มีกำหนด)", "(blank = no end)")}</label>
                <ERPDateTime24 value={f.endsAt} onChange={(v) => set({ endsAt: v })} defaultTime="23:59" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t("ป้ายบนเว็บ (เว้นว่าง = สร้างให้)", "Site badge (blank = auto)")}</label>
                <input className={inputCls} value={f.badge} onChange={(e) => set({ badge: e.target.value.slice(0, 40) })} placeholder={preview} />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.noCoupon} onChange={(e) => set({ noCoupon: e.target.checked })} /> {t("ใช้คู่โค้ดส่วนลดไม่ได้", "Can't combine with discount codes")}</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> {t("เปิดใช้", "Active")}</label>
              </div>
            </div>
          </div>
        )}
      </ERPModal>

      {newGroupFor && (
        <ProductGroupEditor
          open
          initial={null}
          shopSlug={shopSlug}
          shopId={shopId}
          products={products}
          cats={cats}
          onClose={() => setNewGroupFor(null)}
          onSaved={(id) => {
            // กลุ่มใหม่ = เลือกให้ในโปรที่กำลังตั้งเลย
            if (newGroupFor === "scope") setForm((x) => (x ? { ...x, scopeMode: "groups", groups: [...new Set([...x.groups, id])] } : x));
            else setForm((x) => (x ? { ...x, showExclude: true, excludeGroups: [...new Set([...x.excludeGroups, id])] } : x));
            setNewGroupFor(null);
            loadGroups();
          }}
        />
      )}

      <ConfirmDialog
        open={lossConfirm > 0}
        onClose={() => setLossConfirm(0)}
        onConfirm={() => {
          setLossConfirm(0);
          void save(true);
        }}
        variant="danger"
        title={t(`ขายต่ำกว่าทุน ${lossConfirm} รุ่น — ยืนยันบันทึก?`, `${lossConfirm} models below cost — save anyway?`)}
        message={t("ราคาหลังลดของบางรุ่นต่ำกว่าต้นทุนที่บันทึกไว้ (ตัวแดงในตาราง) · ถ้าตั้งใจเคลียร์สต็อกกดยืนยันได้เลย", "Some sale prices are below the recorded cost (red in the table) · if you're intentionally clearing stock, go ahead and confirm")}
        confirmText={t("ยืนยัน ขายต่ำกว่าทุน", "Confirm, sell below cost")}
      />

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        variant="danger"
        title={t(`ลบโปร "${del?.name ?? ""}"?`, `Delete promo "${del?.name ?? ""}"?`)}
        message={t('ตะกร้าจะไม่ลดให้อีก · ออเดอร์ที่ใช้โปรนี้ไปแล้วยังเก็บชื่อและยอดลดไว้เหมือนเดิม · ถ้าแค่พักไว้ ใช้ปุ่ม "ปิด" แทน', 'The cart will stop applying it · orders that already used this promo keep its name and discount · to just pause it, use "Turn off" instead')}
        confirmText={t("ลบโปร", "Delete promo")}
      />
    </div>
  );
}
