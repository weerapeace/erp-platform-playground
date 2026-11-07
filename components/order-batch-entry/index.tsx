"use client";

/**
 * ของกลาง — ลงออเดอร์ลูกค้าทีละหลายรายการ + จับชุด: OrderBatchEntryModal
 *   เพิ่มรายการได้หลายทาง (ปนกันได้) — ทุกทางใช้ตัวเลือกกลาง ไม่ทำ dropdown/ตารางเอง:
 *     • วางจาก Excel / แม่แบบ        → LineImportModal (components/line-import)
 *     • เลือกสินค้าหลายตัว            → SkuMultiPickerModal (components/sku-multi-picker)
 *     • เลือกทั้งรุ่น (กางทุกสี/แบบ)   → ParentSkuMultiPickerModal + /api/pickers/skus?parent_sku_id=
 *     • ดึงจากใบเสนอราคา             → SourceDocPickerModal mode "so_quote"
 *     • ดึงจากใบสั่งผลิต              → MoMultiPickerModal (components/mo-picker) + ราคาจาก /api/so-orders/sources?mo_nos=
 *   ตารางรายการ = SOLineEditor (ตัวเดียวกับใบขาย) + คอลัมน์เสริม ติ๊ก / ชุด (MoGroupPicker)
 *   บันทึก = ใบสั่งขาย 1 ใบ (POST /api/so-orders) · ชุดใหม่สร้างให้ฝั่งเซิร์ฟเวอร์ · เปิดใบสั่งผลิตแล้วเข้าชุดเอง
 * ใช้ที่: หน้าใบสั่งขาย (ปุ่ม "เพิ่มหลายรายการ") · Design Dashboard (ลงออเดอร์จากใบงาน — ส่ง seedLines มา)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CustomerPicker, type CustomerPickerValue, type SkuPickerValue } from "@/components/pickers";
import type { BrandCustomer } from "@/lib/brand-customers";
import { DateInput } from "@/components/date-input";
import { SOLineEditor, VatModeToggle, calculateEditorTotals, emptyLine, vatRateForCompany, type EditorLine, type LineExtraColumn } from "@/components/sales-line-items";
import { toMajor } from "@/lib/money";
import { LineImportModal, type ImportedLine } from "@/components/line-import";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { ParentSkuMultiPickerModal, type ParentSkuPick } from "@/components/parent-sku-multi-picker";
import { SourceDocPickerModal, type SourceDocRow } from "@/components/source-doc-picker";
import { MoMultiPickerModal, type MoPickRow } from "@/components/mo-picker";
import { MoGroupPicker, rememberMoGroup, type MoGroupPick } from "@/components/mo-group-picker";
import { pickQuoteDocs } from "@/lib/quote-pull";
import type { SourceDoc, SourceLine } from "@/app/api/so-orders/sources/route";

/** รายการตั้งต้นที่หน้าอื่นส่งเข้ามา (เช่น Design Dashboard) */
export type BatchSeedLine = {
  sku: string | null; product_name: string; qty?: number; unit?: string | null; unit_price?: number;
  note?: string | null; image_key?: string | null; mo_id?: string | null; mo_no?: string | null;
  source?: "manual" | "quote" | "mo" | "design";
  /** ใบเสนอราคาต้นทาง (ดึงจากใบเสนอราคา) */
  quote_id?: string | null; quote_no?: string | null;
  discount_type?: "percent" | "amount"; discount_value?: number;
  /** ใบงานยังไม่มี SKU — ลงชื่อไว้ก่อน เปิดใบสั่งผลิตไม่ได้จนกว่าจะสร้าง SKU */
  no_sku_hint?: string | null;
};

type Company = { id: string; company_code: string; name: string; is_default: boolean; vat_registered?: boolean };
type LineMeta = { group: MoGroupPick | null; groupManual: boolean; mo_id: string | null; mo_no: string | null; quote_id?: string | null; quote_no?: string | null; source: string; hint: string | null };
type Picker = null | "excel" | "sku" | "parent" | "quote" | "mo";

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const newKey = (name: string) => `new:${name.trim()}`;

/** ค่าที่จำ "แบรนด์นี้ปกติเป็นลูกค้าใคร" ต่อผู้ใช้ (/api/user-prefs) — ลงออเดอร์จากใบงานครั้งถัดไปเติมให้ */
const BRAND_CUSTOMER_PREF = "so_order_brand_customer";
type BrandCustomerMap = Record<string, { id: string; code: string | null; name: string }>;

/** ใบงานออกแบบ → รายการตั้งต้น: มี Parent SKU = กางทุกสี/แบบ · ยังไม่มี = ลงเป็นชื่อไว้ก่อน (เปิดผลิตไม่ได้จนสร้าง SKU) */
export async function seedsFromDesignSheets(sheets: { id: string; code: string; name: string }[]): Promise<BatchSeedLine[]> {
  const out: BatchSeedLine[] = [];
  for (const s of sheets) {
    let skus: { code: string; name_th: string | null; color: string | null; list_price: number | null; cover_image_r2_key: string | null }[] = [];
    try { const j = await apiFetch(`/api/design-sheets/${s.id}/skus`).then((r) => r.json()); skus = j.data ?? []; } catch { /* ถือว่ายังไม่มี SKU */ }
    if (skus.length) {
      for (const k of skus) out.push({ sku: k.code, product_name: k.name_th || k.code, qty: 0, unit_price: Number(k.list_price) || 0, note: k.color, image_key: k.cover_image_r2_key, source: "design" });
    } else {
      out.push({ sku: null, product_name: `${s.name} (${s.code})`, qty: 0, source: "design", no_sku_hint: `ใบงาน ${s.code} ยังไม่มี SKU — สร้าง SKU ก่อนจึงเปิดใบสั่งผลิตได้` });
    }
  }
  return out;
}

export function OrderBatchEntryModal({ open, onClose, onSaved, seedLines, seedCustomer, brand, title = "เพิ่มออเดอร์หลายรายการ" }: {
  open: boolean;
  onClose: () => void;
  onSaved?: (r: { id: string; order_no: string | null }) => void;
  seedLines?: BatchSeedLine[];
  seedCustomer?: CustomerPickerValue | null;
  /** มาจากใบงานแบรนด์เดียว → เติมลูกค้าที่เคยใช้กับแบรนด์นี้ + จำไว้หลังบันทึก */
  brand?: { id: string; name: string | null } | null;
  title?: string;
}) {
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [poNo, setPoNo] = useState("");
  const [vat, setVat] = useState({ rate: 7, included: false });   // ภาษีขาย — ตั้งต้นตามบริษัท (vatRateForCompany)
  const [defaultGroup, setDefaultGroup] = useState<MoGroupPick | null>(null);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [meta, setMeta] = useState<Record<string, LineMeta>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkQty, setBulkQty] = useState("");
  const [openMo, setOpenMo] = useState(true);
  const [picker, setPicker] = useState<Picker>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [brandMap, setBrandMap] = useState<BrandCustomerMap>({});
  const [autoCustomer, setAutoCustomer] = useState(false);
  /** ลูกค้าประจำแบรนด์ (ตั้งที่หน้าแบรนด์ · หลายสาขาได้) */
  const [teamCusts, setTeamCusts] = useState<BrandCustomer[]>([]);

  // ── เปิดป๊อป = เริ่มใหม่ (+ รายการตั้งต้น) ──
  useEffect(() => {
    if (!open) return;
    setCustomer(seedCustomer ?? null); setDueDate(""); setPoNo(""); setDefaultGroup(null);
    setLines([]); setMeta({}); setPicked(new Set()); setBulkQty(""); setOpenMo(true); setErr("");    if (seedLines?.length) addSeeds(seedLines, null, []);
    setAutoCustomer(false); setTeamCusts([]);
    if (brand?.id) void (async () => {
      try {
        // ลูกค้าประจำแบรนด์ (ตั้งที่หน้าแบรนด์ — ใช้ทั้งทีม) มาก่อน · ไม่มี = ค่าที่ผู้ใช้คนนี้เคยเลือก
        const [bj, j] = await Promise.all([
          apiFetch("/api/brands").then((r) => r.json()).catch(() => ({ data: [] })),
          apiFetch(`/api/user-prefs?key=${BRAND_CUSTOMER_PREF}`).then((r) => r.json()),
        ]);
        const map = (j.value ?? {}) as BrandCustomerMap;
        setBrandMap(map);
        // ลูกค้าประจำแบรนด์หลายสาขาได้ (lib/brand-customers): รายเดียว = เติมให้ · หลายราย = ให้กดเลือกสาขา
        //   (เติมให้เฉพาะสาขาที่ผู้ใช้คนนี้เลือกครั้งก่อน — ไม่เดาสาขาเอง)
        const team = ((bj.data ?? []) as { id: string; default_customers?: BrandCustomer[] }[])
          .find((b) => b.id === brand.id)?.default_customers ?? [];
        setTeamCusts(team);
        const mine = map[brand.id];
        const c = team.length === 1 ? team[0] : team.length > 1 ? team.find((t) => t.id === mine?.id) ?? null : mine ?? null;
        if (c && !seedCustomer) { setCustomer({ id: c.id, code: c.code, name: c.name } as CustomerPickerValue); setAutoCustomer(true); }
      } catch { /* ไม่มีค่าจำ = เลือกเอง */ }
    })();
    void (async () => {
      try {
        const j = await apiFetch("/api/admin/companies").then((r) => r.json());
        const cs = (j.data ?? []) as Company[];
        setCompanies(cs);
        const def = cs.find((c) => c.is_default) ?? cs[0];
        setCompanyCode(def?.company_code ?? ""); setVat({ rate: vatRateForCompany(def), included: false });
      } catch { /* ไม่มีบริษัท = ใช้เลขชุดกลาง */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── เพิ่มรายการ (ทุกทางเข้ามาที่นี่) ──
  function addSeeds(seeds: BatchSeedLine[], group: MoGroupPick | null, base: EditorLine[] = lines) {
    const add: EditorLine[] = [];
    const addMeta: Record<string, LineMeta> = {};
    for (const s of seeds) {
      const l: EditorLine = {
        ...emptyLine(), sku: s.sku, product_name: s.product_name || s.sku || "",
        qty: Number(s.qty) || 0, unit: s.unit || "ชิ้น", unit_price: Number(s.unit_price) || 0,
        discount_type: s.discount_type ?? "amount", discount_value: Number(s.discount_value) || 0,
        note: s.note ?? undefined, image_key: s.image_key ?? null,
      };
      add.push(l);
      addMeta[l.tempId] = { group, groupManual: false, mo_id: s.mo_id ?? null, mo_no: s.mo_no ?? null, quote_id: s.quote_id ?? null, quote_no: s.quote_no ?? null, source: s.source ?? "manual", hint: s.no_sku_hint ?? null };
    }
    const kept = base.filter((l) => l.product_name.trim() || l.sku);
    // SKU เดิมที่ไม่ได้ผูกใบสั่งผลิต/ใบเสนอราคา ไม่เพิ่มซ้ำ (ไปแก้จำนวนที่แถวเดิม) — บรรทัดจากใบเสนอราคาเพิ่มเสมอ (ไม่งั้นการผูกใบหาย)
    const have = new Set(kept.filter((l) => l.sku).map((l) => l.sku as string));
    const fresh = add.filter((l) => !(l.sku && have.has(l.sku) && !addMeta[l.tempId].mo_id && !addMeta[l.tempId].quote_id));
    if (add.length > fresh.length) toast.info(`ข้าม ${add.length - fresh.length} รายการที่มีอยู่แล้ว`);
    setLines([...kept, ...fresh]);
    setMeta((m) => ({ ...m, ...addMeta }));
    setErr("");
  }
  const addWithDefault = (seeds: BatchSeedLine[]) => addSeeds(seeds, defaultGroup);

  const onExcel = (rows: ImportedLine[]) => {
    addWithDefault(rows.map((r) => ({
      sku: r.matched ? r.sku : null, product_name: r.product_name || r.sku, qty: r.qty, unit: r.unit, unit_price: r.unit_price,
      note: r.note || null, no_sku_hint: r.matched ? null : `ไม่พบรหัส ${r.sku} ในระบบ`,
    })));
    setPicker(null);
  };
  const onSkus = (skus: SkuPickerValue[]) => {
    addWithDefault(skus.map((s) => ({ sku: s.code, product_name: s.name, qty: 0, unit: s.uom_name, unit_price: Number(s.list_price) || 0, note: s.color ?? null, image_key: s.image_key ?? null })));
    setPicker(null);
  };
  const onParents = async (items: ParentSkuPick[]) => {
    setPicker(null);
    const all: BatchSeedLine[] = [];
    for (const p of items) {
      try {
        const j = await apiFetch(`/api/pickers/skus?parent_sku_id=${encodeURIComponent(p.id)}&limit=100&sort=code`).then((r) => r.json());
        for (const s of (j.data ?? []) as SkuPickerValue[]) all.push({ sku: s.code, product_name: s.name, qty: 0, unit: s.uom_name, unit_price: Number(s.list_price) || 0, note: s.color ?? null, image_key: s.image_key ?? null });
      } catch { toast.error(`โหลดสี/แบบของ ${p.code} ไม่สำเร็จ`); }
    }
    if (all.length === 0) { toast.error("รุ่นที่เลือกยังไม่มี SKU ลูก"); return; }
    addWithDefault(all);
    toast.success(`กาง ${items.length} รุ่น ได้ ${all.length} รายการ — ใส่จำนวนต่อได้เลย`);
  };
  const fromSourceLines = (ls: SourceLine[], source: "quote" | "mo"): BatchSeedLine[] => ls.map((l) => ({
    sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
    discount_type: l.discount_type, discount_value: l.discount_value,
    mo_id: l.mo_id, mo_no: l.mo_no, quote_id: l.quote_id, quote_no: l.quote_no,
    source, note: l.mo_no ? `จากใบสั่งผลิต ${l.mo_no}` : l.quote_no ? `จากใบเสนอราคา ${l.quote_no}` : null,
  }));
  // ใบเสนอราคาหลายใบเข้าใบเดียวได้ — ต้องเป็นลูกค้าเดียวกัน · ใบที่ดึงมาแล้วไม่ดึงซ้ำ (กติกา lib/quote-pull)
  const onQuotes = (rows: SourceDocRow[]) => {
    const have = lines.map((l) => meta[l.tempId]?.quote_id).filter((x): x is string => !!x);
    const { keep, skipped } = pickQuoteDocs(rows as unknown as SourceDoc[], { customerId: customer?.id || null, customerName: customer?.name ?? null, have });
    if (skipped.length) toast.error(`ข้าม ${skipped.join(" · ")}`);
    if (!keep.length) return;
    addWithDefault(keep.flatMap((d) => fromSourceLines(d.lines, "quote")));
    const d0 = keep[0];
    if (!customer && d0.customer_name) setCustomer({ id: d0.customer_id ?? "", code: d0.customer_code ?? null, name: d0.customer_name } as CustomerPickerValue);
  };
  const onMos = async (rows: MoPickRow[]) => {
    setPicker(null);
    if (rows.length === 0) return;
    try {
      const nos = rows.map((r) => r.mo_no);
      const j = await apiFetch(`/api/so-orders/sources?type=mo&mo_nos=${encodeURIComponent(nos.join(","))}`).then((r) => r.json());
      const docs = (j.data ?? []) as SourceDoc[];
      addWithDefault(docs.flatMap((d) => fromSourceLines(d.lines, "mo")));
      const missing = nos.length - docs.length;
      if (missing > 0) toast.error(`${missing} ใบผูกใบสั่งขายอื่นแล้ว หรือปิด/ยกเลิกไปแล้ว — ข้าม`);
    } catch { toast.error("ดึงใบสั่งผลิตไม่สำเร็จ"); }
  };

  // ── ชุด ──
  const setLineGroup = (tempIds: string[], g: MoGroupPick | null) =>
    setMeta((m) => { const n = { ...m }; for (const id of tempIds) n[id] = { ...(n[id] ?? blankMeta()), group: g, groupManual: true }; return n; });
  const changeDefaultGroup = (g: MoGroupPick | null) => {
    setDefaultGroup(g);
    // แถวที่ยังไม่ได้ตั้งชุดเอง ตามชุดหลักไปด้วย
    setMeta((m) => { const n = { ...m }; for (const id of Object.keys(n)) if (!n[id].groupManual) n[id] = { ...n[id], group: g }; return n; });
  };

  // ── ติ๊กเลือกแถว (ใส่จำนวนเท่ากัน / ย้ายชุด / ลบ) ──
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = lines.length > 0 && lines.every((l) => picked.has(l.tempId));
  const applyBulkQty = () => {
    const q = Number(bulkQty);
    if (!(q > 0)) { toast.error("ใส่จำนวนก่อน"); return; }
    setLines((ls) => ls.map((l) => (picked.has(l.tempId) ? { ...l, qty: q } : l)));
    setBulkQty(""); setErr("");
  };
  const removePicked = () => { setLines((ls) => ls.filter((l) => !picked.has(l.tempId))); setPicked(new Set()); };

  const extraColumns: LineExtraColumn[] = [
    { key: "pick", position: "start", className: "w-8",
      header: <input type="checkbox" aria-label="ติ๊กทั้งหมด" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(lines.map((l) => l.tempId)))} className="rounded border-slate-300" />,
      cell: (l) => <input type="checkbox" aria-label="เลือกแถว" checked={picked.has(l.tempId)} onChange={() => toggle(l.tempId)} className="mt-2.5 rounded border-slate-300" /> },
    { key: "group", position: "end", className: "w-48", header: "ชุด",
      cell: (l) => {
        const m = meta[l.tempId];
        return (
          <div className="space-y-1">
            <MoGroupPicker size="sm" value={m?.group ?? null} onChange={(g) => setLineGroup([l.tempId], g)} placeholder="ไม่จัดชุด" />
            {m?.mo_no && <div className="text-[10px] text-emerald-700">ผูก {m.mo_no}</div>}
            {(m?.hint || !l.sku) && <div className="text-[10px] text-amber-700">{m?.hint ?? "ยังไม่มี SKU — เปิดใบสั่งผลิตไม่ได้"}</div>}
          </div>
        );
      } },
  ];

  // ── สรุป + บันทึก ──
  const filled = lines.filter((l) => l.product_name.trim() || l.sku);
  const groupNames = useMemo(() => new Set(filled.map((l) => meta[l.tempId]?.group?.name).filter(Boolean)), [filled, meta]);
  const canOpen = filled.filter((l) => l.sku && !meta[l.tempId]?.hint).length;
  const company = companies.find((c) => c.company_code === companyCode);
  const companyNoVat = company?.vat_registered === false;
  const vatRate = companyNoVat ? 0 : vat.rate;
  const total = toMajor(calculateEditorTotals(filled, { vatRate, vatIncluded: vat.included, whtRate: 0, headerDiscountType: "amount", headerDiscountValue: 0, shippingFee: 0 }).grand_total.amount);

  const save = async () => {
    let e = "";
    if (!customer?.name) e = "เลือกลูกค้าก่อน";
    else if (filled.length === 0) e = "ยังไม่มีรายการ — เพิ่มอย่างน้อย 1 รายการ";
    else { const bad = filled.filter((l) => !(l.qty > 0)).length; if (bad) e = `ใส่จำนวนให้ครบ (ยังว่าง ${bad} แถว — ติ๊กแล้วใส่ทีเดียวได้)`; }
    setErr(e); if (e) return;

    const newGroups: Record<string, string> = {};
    const body = {
      header: {
        company_id: company?.id ?? null, company_code: company?.company_code ?? null,
        customer_id: customer!.id || null, customer_name: customer!.name, customer_code: customer!.code ?? null,
        customer_po_no: poNo || null, order_date: todayIso(), due_date: dueDate || null,
        vat_rate: vatRate, vat_included: vatRate > 0 && vat.included, wht_rate: 0, header_discount_type: "amount", header_discount_value: 0, shipping_fee: 0,
      },
      lines: filled.map((l) => {
        const m = meta[l.tempId];
        const g = m?.group ?? null;
        if (g && !g.id) newGroups[newKey(g.name)] = g.name;
        return {
          sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit, unit_price: l.unit_price,
          discount_type: l.discount_type, discount_value: l.discount_value, note: l.note ?? null,
          mo_id: m?.mo_id ?? null, mo_no: m?.mo_no ?? null, quote_id: m?.quote_id ?? null, quote_no: m?.quote_no ?? null,
          source: m?.mo_id ? "mo" : m?.quote_id ? "quote" : (m?.source ?? "manual"),
          mo_group_id: g?.id ?? null, mo_group_key: g && !g.id ? newKey(g.name) : null,
        };
      }),
      open_mo: openMo, new_groups: newGroups,
    };
    setSaving(true);
    try {
      const res = await apiFetch("/api/so-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      for (const g of filled.map((l) => meta[l.tempId]?.group).filter((g): g is MoGroupPick => !!g?.id)) rememberMoGroup({ id: g.id!, name: g.name });
      for (const g of (j.new_groups ?? []) as { id: string; name: string }[]) rememberMoGroup(g);
      // จำลูกค้าของแบรนด์นี้ไว้ (ลงออเดอร์จากใบงานครั้งหน้าเติมให้)
      if (brand?.id && customer!.id && brandMap[brand.id]?.id !== customer!.id) {
        void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: BRAND_CUSTOMER_PREF, value: { ...brandMap, [brand.id]: { id: customer!.id, code: customer!.code ?? null, name: customer!.name } } }) }).catch(() => {});
      }
      const op = j.opened as { created: number; linked: number; grouped?: number } | null;
      toast.success(`สร้างใบสั่งขาย ${j.order_no ?? ""} · ${filled.length} รายการ${op ? ` · เปิดใบสั่งผลิต ${op.created} ใบ · ผูกเดิม ${op.linked} ใบ` : ""}${groupNames.size ? ` · เข้าชุด ${[...groupNames].join(", ")}` : ""}`);
      onSaved?.({ id: j.id, order_no: j.order_no ?? null });
      onClose();
    } catch (x) { setErr(x instanceof Error ? x.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const srcBtn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50";
  const excludeIds = useMemo(() => [] as string[], []);

  return (
    <>
      <ERPModal open={open} onClose={() => !saving && onClose()} size="xl" title={title} hasUnsavedChanges={filled.length > 0 && !saving}
        footer={<>
          <span className="mr-auto text-[12px] text-slate-500">
            {filled.length ? <>ได้ใบสั่งขาย 1 ใบ · {filled.length} รายการ · {groupNames.size} ชุด · รวม ฿{Math.round(total).toLocaleString("th-TH")}{vatRate > 0 ? (vat.included ? " (รวม VAT แล้ว)" : " (บวก VAT แล้ว)") : " (ไม่มี VAT)"} · เปิดผลิตได้ {canOpen}/{filled.length}</> : "ยังไม่มีรายการ"}
          </span>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : openMo ? "บันทึก + เปิดใบสั่งผลิต" : "บันทึกออเดอร์"}
          </button>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div><span className="text-[11px] text-slate-500">ลูกค้า *</span>
              <div className="mt-0.5"><CustomerPicker value={customer} onChange={(v) => { setCustomer(v); setAutoCustomer(false); setErr(""); }} /></div>
              {teamCusts.length > 1 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-slate-400">สาขาของ {brand?.name ?? "แบรนด์"}:</span>
                  {teamCusts.map((c) => (
                    <button key={c.id} type="button" title={c.code ? `${c.code} · ${c.name}` : c.name}
                      onClick={() => { setCustomer({ id: c.id, code: c.code, name: c.name } as CustomerPickerValue); setAutoCustomer(false); setErr(""); }}
                      className={`h-6 max-w-[200px] truncate rounded-full border px-2 text-[11px] ${customer?.id === c.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {autoCustomer && brand?.name && <p className="mt-0.5 text-[11px] text-slate-400">เติมให้จากแบรนด์ {brand.name} ({teamCusts.length === 1 ? "ลูกค้าประจำแบรนด์" : "เคยใช้ครั้งก่อน"} · เปลี่ยนได้)</p>}
              {!autoCustomer && brand?.id && !customer && teamCusts.length === 0 && <p className="mt-0.5 text-[11px] text-slate-400">เลือกครั้งเดียว — ครั้งหน้าระบบจำลูกค้าของแบรนด์ {brand.name ?? ""} ให้</p>}</div>
            <label className="block"><span className="text-[11px] text-slate-500">กำหนดส่ง</span>
              <div className="mt-0.5"><DateInput value={dueDate} onChange={setDueDate} /></div></label>
            <label className="block"><span className="text-[11px] text-slate-500">เลข PO ลูกค้า</span>
              <input value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="ถ้ามี" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm" /></label>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div><span className="text-[11px] text-slate-500">เข้าชุด — ตั้งให้ทุกแถว (เปลี่ยนรายแถวได้ในตาราง)</span>
              <div className="mt-0.5"><MoGroupPicker value={defaultGroup} onChange={changeDefaultGroup} placeholder="เลือกชุด หรือพิมพ์ชื่อชุดใหม่…" /></div>
              <p className="mt-1 text-[11px] text-slate-400">ใบสั่งผลิตที่เปิดจากออเดอร์นี้จะเข้าชุดเดียวกันให้เอง — ไปโผล่ที่หน้าใบสั่งผลิต / บอร์ดจ่ายงานเลย</p></div>
            {companies.length > 1 && (
              <label className="block"><span className="text-[11px] text-slate-500">บริษัท (ชุดเลขเอกสาร)</span>
                <select value={companyCode} onChange={(e) => { setCompanyCode(e.target.value); setVat((v) => ({ rate: vatRateForCompany(companies.find((c) => c.company_code === e.target.value)), included: v.included })); }} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  {companies.map((c) => <option key={c.id} value={c.company_code}>{c.name}</option>)}
                </select></label>
            )}
          </div>

          <div>
            <div className="mb-1 text-[11px] text-slate-500">เพิ่มรายการ — ใช้หลายวิธีปนกันได้</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPicker("excel")} className={srcBtn}><Icon name="import" /> วางจาก Excel</button>
              <button type="button" onClick={() => setPicker("sku")} className={srcBtn}><Icon name="package" /> เลือกสินค้าหลายตัว</button>
              <button type="button" onClick={() => setPicker("parent")} className={srcBtn}><Icon name="basket" /> เลือกทั้งรุ่น (กางทุกสี)</button>
              <button type="button" onClick={() => setPicker("quote")} className={srcBtn}><Icon name="documents" /> ดึงจากใบเสนอราคา</button>
              <button type="button" onClick={() => setPicker("mo")} className={srcBtn}><Icon name="factory" /> ดึงจากใบสั่งผลิต</button>
            </div>
          </div>

          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
              <b className="text-sm text-slate-700">ติ๊ก {picked.size} แถว</b>
              <input value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} inputMode="decimal" placeholder="จำนวน"
                onKeyDown={(e) => { if (e.key === "Enter") applyBulkQty(); }}
                className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-right text-sm" />
              <button type="button" onClick={applyBulkQty} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs">ใส่จำนวนเท่ากัน</button>
              <span className="text-xs text-slate-500">ย้ายไปชุด</span>
              <div className="w-56"><MoGroupPicker size="sm" value={null} placeholder="เลือกชุด…" onChange={(g) => { setLineGroup([...picked], g); setPicked(new Set()); }} /></div>
              <button type="button" onClick={removePicked} className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs text-rose-600">ลบแถว</button>
              <button type="button" onClick={() => setPicked(new Set())} className="ml-auto text-xs text-slate-500 hover:underline">ล้างที่ติ๊ก</button>
            </div>
          )}

          <SOLineEditor lines={lines} layout="table" extraColumns={extraColumns}
            onChange={(ls) => {
              setLines(ls);
              // แถวที่เพิ่งกด "+ เพิ่มรายการ" ได้ชุดหลักไปด้วย
              setMeta((m) => { const n = { ...m }; for (const l of ls) if (!n[l.tempId]) n[l.tempId] = { ...blankMeta(), group: defaultGroup }; return n; });
              setErr("");
            }} />

          <VatModeToggle rate={vatRate} included={vat.included} companyNoVat={companyNoVat} onChange={setVat} />

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={openMo} onChange={(e) => setOpenMo(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            เปิดใบสั่งผลิตให้เลย (เข้าชุดเดียวกันอัตโนมัติ · แถวที่ยังไม่มี SKU จะรอไว้)
          </label>
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        </div>
      </ERPModal>

      {picker === "excel" && <LineImportModal open onClose={() => setPicker(null)} onConfirm={onExcel} title="ลงรายการจากตาราง / Excel" />}
      {picker === "sku" && <SkuMultiPickerModal open onClose={() => setPicker(null)} onConfirm={onSkus} excludeIds={excludeIds} />}
      {picker === "parent" && <ParentSkuMultiPickerModal open onClose={() => setPicker(null)} onConfirm={(items) => void onParents(items)} title="เลือกทั้งรุ่น (กางทุกสี/แบบลงตาราง)" />}
      {picker === "quote" && <SourceDocPickerModal open mode="so_quote" onClose={() => setPicker(null)} onConfirm={onQuotes} />}
      {picker === "mo" && <MoMultiPickerModal open scope="open" title="ดึงจากใบสั่งผลิต" onClose={() => setPicker(null)} onConfirm={(rows) => void onMos(rows)}
        exclude={Object.values(meta).map((m) => m.mo_no).filter((x): x is string => !!x)} />}
    </>
  );
}

const blankMeta = (): LineMeta => ({ group: null, groupManual: false, mo_id: null, mo_no: null, source: "manual", hint: null });
