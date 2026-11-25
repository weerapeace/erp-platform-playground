"use client";

/**
 * 🐾 ทะเบียนแมว (แอป "งานอื่นๆ") — ตัวแอปทั้งหน้า
 *   รอบ 5: ตัวช่วยเริ่มต้น · วันเกิด/วันรับเลี้ยง · ป้ายน้ำหนักลด · รายการต้องซื้อ · ประวัติราคา · สมุดสุขภาพ (/misc/cats/book)
 *   แท็บ: หน้าแรก (ใกล้ถึงกำหนด + ของใกล้หมด + แมวรูปใหญ่) · อาหาร/ทราย · ค่าใช้จ่าย · ปฏิทิน · คลินิก · ตั้งค่า (LINE) · ถังขยะ
 *   กดแมว = หน้าของแมวตัวนั้น (?cat=<id>)
 *   ข้อมูล/เขียน ผ่าน use-cats (API กลาง /api/cats) · กติกาคำนวณ = lib/cats · lib/cats-supplies · lib/cats-costs · lib/cats-notify
 *   ใช้ร่วมกันในบ้าน: ทุกคนที่มีสิทธิ์ cats.view เห็นชุดเดียวกัน · cats.edit = เพิ่ม/แก้/ลบ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { DocCalendar, type CalDoc } from "@/components/doc-calendar";
import { ImageLightbox } from "@/components/image-lightbox";
import { SoloInstallSection } from "@/components/install-app";
import { formatDate, todayBangkok } from "@/lib/date";
import { ageText, CATS_EDIT, CATS_VIEW, doneAgain, dueItems, dueLabel, latestWeight, SEX_LABEL, TREATMENT_LABEL, type Cat, type CatKind, type Purchase, type Supply, type Treatment, type Vaccination } from "@/lib/cats";
import { asMealPlan, asNotify, fmtQty, stockUnitLabel, supplyStatus } from "@/lib/cats-supplies";
import { costEntries, monthSummary } from "@/lib/cats-costs";
import { anniversaries, nextAnniversary, weightAlert, type SetupStepKey } from "@/lib/cats-extras";
import { AnniversaryList, PriceHistoryModal, SetupGuide, ShoppingListModal, WeightAlertBadge } from "./extras-ui";
import { CatLogo, CuteEmpty, pawBurst } from "./cats-cute";
import "./cats-theme.css";
import { catPhotoUrl, fmtMoney, useCatsData, useCatsSettingsWrite, useCatsWrite } from "./use-cats";
import { BulkWeighModal, PurchaseModal, RecordFormModal, StockCountModal, type FormTarget, type PurchaseTarget } from "./cat-forms";
import { CatDetail, CatPhoto, DuePill } from "./cat-detail";
import { CatsTrash } from "./cats-trash";
import { FoodTab } from "./food-tab";
import { CostsTab } from "./costs-tab";
import { SettingsTab } from "./settings-tab";

type View = "home" | "food" | "costs" | "calendar" | "clinics" | "settings" | "trash";
const VIEWS: { k: View; label: string; icon: string }[] = [
  { k: "home", label: "หน้าแรก", icon: "home" },
  { k: "food", label: "อาหาร/ทราย", icon: "box" },
  { k: "costs", label: "ค่าใช้จ่าย", icon: "receipt" },
  { k: "calendar", label: "ปฏิทิน", icon: "calendar" },
  { k: "clinics", label: "คลินิก", icon: "building-hospital" },
  { k: "settings", label: "แจ้งเตือน", icon: "bell" },
  { k: "trash", label: "ถังขยะ", icon: "trash" },
];
const TONE_COLOR = { danger: "#e11d48", warning: "#d97706", ok: "#059669" };

function readUrl(): { view: View; cat: string | null } {
  if (typeof window === "undefined") return { view: "home", cat: null };
  const q = new URLSearchParams(window.location.search);
  const v = q.get("tab") as View | null;
  return { view: v && VIEWS.some((x) => x.k === v) ? v : "home", cat: q.get("cat") };
}

export function CatsApp() {
  const { can, permsReady, user } = useAuth();
  const canView = can(CATS_VIEW);
  const canEdit = can(CATS_EDIT);
  const { data, settings, loading, error, reload } = useCatsData();
  // ถังขยะโหลดชุดของตัวเอง — เขียนจากหน้าอื่น (เช่น กดย้อนกลับในแจ้งผล) แล้วให้ถังขยะโหลดใหม่ด้วย
  const [trashStamp, setTrashStamp] = useState(0);
  const reloadAll = useCallback(async () => { await reload(); setTrashStamp((s) => s + 1); }, [reload]);
  const w = useCatsWrite(reloadAll);
  const saveSetting = useCatsSettingsWrite(reload);
  const today = todayBangkok();
  const [buy, setBuy] = useState<PurchaseTarget | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [priceOf, setPriceOf] = useState<Supply | null>(null);
  const [count, setCount] = useState<{ s: Supply; est: number } | null>(null);
  const [zoomImg, setZoomImg] = useState<{ url: string; label: string } | null>(null);

  const [view, setView] = useState<View>("home");
  const [catId, setCatId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [weighOpen, setWeighOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [confirmCat, setConfirmCat] = useState<Cat | null>(null);
  const [cursor, setCursor] = useState(() => new Date());

  // ที่อยู่ในแถบ URL: ?tab= / ?cat= (กดย้อนกลับของเบราว์เซอร์ได้ · ลิงก์ส่งต่อได้)
  useEffect(() => {
    const sync = () => { const u = readUrl(); setView(u.view); setCatId(u.cat); };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const go = useCallback((next: { view?: View; cat?: string | null }) => {
    const q = new URLSearchParams(window.location.search);
    const v = next.view ?? view;
    if (v === "home") q.delete("tab"); else q.set("tab", v);
    if (next.cat) q.set("cat", next.cat); else q.delete("cat");
    const s = q.toString();
    window.history.pushState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
    setView(v); setCatId(next.cat ?? null);
    window.scrollTo({ top: 0 });
  }, [view]);

  const cats = useMemo(() => data.cats.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)), [data.cats]);
  const due = useMemo(() => dueItems(data, today, 30), [data, today]);
  const cat = catId ? data.cats.find((c) => c.id === catId && c.is_active) ?? null : null;
  const plan = useMemo(() => asMealPlan(settings.meal_plan), [settings.meal_plan]);
  const notify = useMemo(() => asNotify(settings.notify), [settings.notify]);
  // ของใกล้หมด (ภายในวันเตือนที่ตั้ง · ค่าเริ่ม 7 วัน) เรียงหมดก่อนขึ้นก่อน
  const lowStock = useMemo(() => {
    const active = data.supplies.filter((s) => s.is_active);
    return active.map((s) => ({ s, st: supplyStatus(s, data.purchases, plan, active, today) }))
      .filter((x) => x.st.daysLeft != null && x.st.daysLeft <= notify.supply_days)
      .sort((a, b) => (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
  }, [data.supplies, data.purchases, plan, notify.supply_days, today]);
  const annis = useMemo(() => anniversaries(cats, today, 7), [cats, today]);
  const monthTotal = useMemo(() => monthSummary(costEntries(data), today.slice(0, 7), cats.map((c) => c.id)).total, [data, today, cats]);

  // ─── การกระทำ ───
  const save = useCallback(async (kind: CatKind, values: Record<string, unknown>, row?: Record<string, unknown> | null) => {
    if (row) {
      const patch = Object.fromEntries(Object.entries(values).filter(([k, val]) => JSON.stringify(val ?? null) !== JSON.stringify(row[k] ?? null) && !(val === "" && row[k] == null)));
      if (!Object.keys(patch).length) return true;
      return w.update(kind, String(row.id), patch, row);
    }
    const created = await w.create(kind, values, kind === "cats" ? `เพิ่ม "${values.name}" แล้ว` : "บันทึกแล้ว");
    if (created && kind === "cats") go({ cat: String(created.id) });
    return !!created;
  }, [w, go]);

  const markDone = useCallback(async (kind: "vaccinations" | "treatments", row: Vaccination | Treatment) => {
    const body = kind === "vaccinations" ? doneAgain("vaccinations", row as Vaccination, today) : doneAgain("treatments", row as Treatment, today);
    await w.create(kind, body, `บันทึกแล้ว · นัดครั้งถัดไป ${formatDate(String(body.next_due_date))}`);
  }, [w, today]);

  const doneFromDue = (kind: "vaccinations" | "treatments", recordId: string) => {
    const row = kind === "vaccinations" ? data.vaccinations.find((x) => x.id === recordId) : data.treatments.find((x) => x.id === recordId);
    if (row) void markDone(kind, row);
  };

  const askDelete = (kind: CatKind, row: Record<string, unknown>, label: string) => {
    if (kind === "cats") { setConfirmCat(row as Cat); return; }
    void w.remove(kind, String(row.id), label);
  };

  const supplyLabel = (s: Supply) => [s.brand, s.flavor].filter(Boolean).join(" ");
  const savePurchase = async (values: Record<string, unknown>, row?: Purchase | null) => {
    const s = data.supplies.find((x) => x.id === values.supply_id);
    if (row) {
      const before = row as unknown as Record<string, unknown>;
      const patch = Object.fromEntries(Object.entries(values).filter(([k, val]) => JSON.stringify(val ?? null) !== JSON.stringify(before[k] ?? null) && !(val === "" && before[k] == null)));
      return Object.keys(patch).length ? w.update("purchases", row.id, patch, before) : true;
    }
    return !!(await w.create("purchases", values, `ซื้อเข้า ${s ? supplyLabel(s) : ""} +${fmtQty(Number(values.qty))} ${s ? stockUnitLabel(s) : ""}`));
  };
  const saveCount = async (qty: number) => {
    if (!count) return false;
    return w.update("supplies", count.s.id, { stock_base_qty: qty, stock_base_at: new Date().toISOString() }, count.s as unknown as Record<string, unknown>);
  };

  // ตัวช่วยเริ่มต้น → เปิดฟอร์ม/แท็บของขั้นนั้น
  const onSetupStep = (k: SetupStepKey) => {
    if (k === "cats") setForm({ kind: "cats" });
    else if (k === "supplies") setForm({ kind: "supplies" });
    else if (k === "notify") go({ view: "settings" });
    else { go({ view: "food" }); if (k === "meal") setTimeout(() => document.getElementById("cats-meal-plan")?.scrollIntoView({ behavior: "smooth" }), 120); }
  };

  // ─── ด่านสิทธิ์ ───
  if (!user || !permsReady) return <LoadingState variant="cards" rows={4} />;
  if (!canView) return <EmptyState icon={<Icon name="paw" />} title="ยังไม่มีสิทธิ์ดูทะเบียนแมว" hint="ขอให้แอดมินเปิดสิทธิ์ “ดูทะเบียนแมว” ให้ที่ ตั้งค่าแอป → สิทธิ์ตามเมนู" />;

  const header = (
    <div className="mb-4 flex items-center gap-2">
      <div className="mr-auto flex min-w-0 flex-1 items-center gap-2.5">
        <span className="cat-logo"><CatLogo /></span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight text-slate-800 sm:text-2xl">ทะเบียนแมว</h1>
          <p className="truncate text-xs text-slate-500 sm:text-sm">{cats.length ? `บ้านเรามีน้อง ${cats.length} ตัว · ${cats.map((c) => c.name).join(" ")}` : "เริ่มจากเพิ่มน้องตัวแรกกัน"}</p>
        </div>
      </div>
      <button type="button" onClick={() => setInstallOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Icon name="device-mobile" /> <span className="hidden sm:inline">ติดตั้งบนมือถือ</span></button>
      {canEdit && <button type="button" onClick={() => setWeighOpen(true)} disabled={!cats.length} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="scale" /> <span className="hidden sm:inline">ชั่งทุกตัว</span></button>}
      {canEdit && <button type="button" onClick={() => setForm({ kind: "cats" })} aria-label="เพิ่มน้องแมว" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 sm:px-3 text-sm font-medium text-white hover:bg-orange-600"><Icon name="plus" /> <span className="hidden whitespace-nowrap sm:inline">เพิ่มน้อง</span></button>}
    </div>
  );

  const tabs = (
    <div className="cat-tabs sticky top-0 z-10 -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 py-2 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:px-6">
      {VIEWS.map((t) => (
        <button key={t.k} type="button" onClick={() => go({ view: t.k })} aria-current={view === t.k && !cat ? "page" : undefined} className="cat-tab">
          <Icon name={t.icon} /> {t.label}
          {t.k === "home" && due.some((d) => d.daysLeft <= 7) && <span className="h-2 w-2 rounded-full bg-rose-400 ring-2 ring-white" aria-label="มีเรื่องใกล้ถึงกำหนด" />}
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (loading) body = <LoadingState variant="cards" rows={4} />;
  else if (error) body = <ErrorState title="โหลดทะเบียนแมวไม่ได้" hint={error} onRetry={() => void reload()} />;
  else if (cat) body = (
    <CatDetail cat={cat} data={data} canEdit={canEdit} onBack={() => go({ view: "home" })} onForm={setForm} onDone={markDone} onDelete={askDelete}
      onZoom={() => cat.photo_r2_key && setZoomImg({ url: catPhotoUrl(cat.photo_r2_key, 2000)!, label: cat.name })} onZoomUrl={(url, label) => setZoomImg({ url, label })} />
  );
  else if (view === "home") body = (
    <div className="space-y-6">
      {canEdit && <SetupGuide data={data} settings={settings} onStep={onSetupStep} />}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "ใกล้ถึงกำหนด", icon: "alarm", chip: "bg-rose-50 text-rose-500", value: String(due.length), tone: due.some((d) => d.daysLeft <= 0) ? "text-rose-600" : "text-slate-800", go: () => document.getElementById("cats-due")?.scrollIntoView({ behavior: "smooth" }) },
          { label: "ของใกล้หมด", icon: "shopping-cart", chip: "bg-amber-50 text-amber-600", value: String(lowStock.length), tone: lowStock.some((x) => (x.st.daysLeft ?? 9) <= 1) ? "text-rose-600" : "text-slate-800", go: () => go({ view: "food" }) },
          { label: "จ่ายเดือนนี้", icon: "wallet", chip: "bg-emerald-50 text-emerald-600", value: fmtMoney(Math.round(monthTotal)) || "฿0", tone: "text-slate-800", go: () => go({ view: "costs" }) },
        ].map((m) => (
          <button key={m.label} type="button" onClick={m.go} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300">
            <span className={`cat-chip mb-1.5 ${m.chip}`}><Icon name={m.icon} /></span>
            <div className="text-xs text-slate-500">{m.label}</div>
            <div className={`cat-title text-lg font-bold sm:text-2xl ${m.tone}`}>{m.value}</div>
          </button>
        ))}
      </div>
      {annis.length > 0 && <AnniversaryList items={annis} onOpen={(id) => go({ cat: id })} />}
      {lowStock.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><Icon name="box" /> ของใกล้หมด <span className="text-xs font-normal text-slate-400">ภายใน {notify.supply_days} วัน</span>
            <button type="button" onClick={() => setShopOpen(true)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"><Icon name="shopping-cart" /> รายการต้องซื้อ</button></h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {lowStock.map(({ s, st }) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <button type="button" onClick={() => go({ view: "food" })} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-slate-800">{supplyLabel(s)}</span>
                  <span className="text-xs text-slate-500">เหลือ {fmtQty(st.remaining)} {stockUnitLabel(s)}{st.runOut ? ` · หมด ${formatDate(st.runOut)}` : ""}</span>
                </button>
                {st.runOut && <DuePill due={st.runOut} today={today} />}
                {s.shop_url && <a href={s.shop_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100">สั่งซื้อ</a>}
                {canEdit && <button type="button" onClick={() => setBuy({ supply: s })} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">ซื้อเข้า</button>}
              </div>
            ))}
          </div>
        </section>
      )}
      <section id="cats-due">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><Icon name="alarm" /> ใกล้ถึงกำหนด <span className="text-xs font-normal text-slate-400">ภายใน 30 วัน</span></h2>
        {due.length === 0 ? (
          <CuteEmpty compact title="สบายใจได้ ไม่มีนัดใกล้ ๆ" hint="ไม่มีวัคซีนหรือยาที่ต้องให้ภายใน 30 วัน" />
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {due.map((d) => {
              const c = data.cats.find((x) => x.id === d.catId)!;
              return (
                <div key={d.key} className="flex items-center gap-3 px-3 py-2.5">
                  <button type="button" onClick={() => go({ cat: d.catId })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <CatPhoto cat={c} w={120} className="h-11 w-11 shrink-0 rounded-full" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium text-slate-800">{d.catName} · {d.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{d.kind === "vaccinations" ? "นัดฉีด" : "ครบกำหนด"} {formatDate(d.due)}<span className="sm:hidden"><DuePill due={d.due} today={today} /></span></span>
                    </span>
                  </button>
                  <span className="hidden sm:inline"><DuePill due={d.due} today={today} /></span>
                  {canEdit && <button type="button" onClick={(e) => { pawBurst(e); doneFromDue(d.kind, d.recordId); }} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">{d.kind === "vaccinations" ? "ฉีดแล้ว" : "ให้ยาแล้ว"}</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><Icon name="cat" /> น้องแมวของเรา <span className="text-xs font-normal text-slate-400">{cats.length} ตัว</span></h2>
        {cats.length === 0 ? (
          <CuteEmpty title="ยังไม่มีน้องแมวในทะเบียน" hint="เพิ่มน้องตัวแรก ใส่รูป ชื่อ วันเกิด" actionLabel="＋ เพิ่มน้องแมว" onAction={canEdit ? () => setForm({ kind: "cats" }) : undefined} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cats.map((c) => {
              const worst = due.filter((d) => d.catId === c.id)[0];
              const lw = latestWeight(data.weights, c.id);
              const age = ageText(c.birth_date, today);
              const wa = weightAlert(data.weights, c.id, today);
              return (
                <button key={c.id} type="button" onClick={() => go({ cat: c.id })} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="cat-card-photo relative">
                    <CatPhoto cat={c} w={600} className="aspect-square w-full transition group-hover:scale-[1.03]" />
                    {wa && <WeightAlertBadge alert={wa} className="absolute bottom-2 left-2" />}
                    {worst && worst.daysLeft <= 7 && (
                      <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white ${dueLabel(worst.daysLeft).tone === "danger" ? "bg-rose-600" : "bg-amber-500"}`}>{dueLabel(worst.daysLeft).text}</span>
                    )}
                  </div>
                  <div className="px-3 pb-3 pt-2 text-center">
                    <div className="cat-title text-lg font-bold text-slate-800 sm:text-xl">{c.name}</div>
                    <div className="truncate text-xs text-slate-500">{[c.sex ? SEX_LABEL[c.sex] : "", age, lw ? `${lw.kg.toFixed(1)} กก.` : ""].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
  else if (view === "calendar") {
    const docs: CalDoc[] = [];
    const catOf = new Map<string, string>();
    for (const d of dueItems(data, today, 400)) {
      catOf.set(d.key, d.catId);
      docs.push({ id: d.key, no: d.catName, sub: d.title, date: d.due, color: TONE_COLOR[dueLabel(d.daysLeft).tone], title: `${d.catName} · ${d.title} · ${dueLabel(d.daysLeft).text}` });
    }
    const name = (id: string) => data.cats.find((c) => c.id === id && c.is_active)?.name;
    for (const v of data.vaccinations) if (name(v.cat_id)) { catOf.set(`gv:${v.id}`, v.cat_id); docs.push({ id: `gv:${v.id}`, no: name(v.cat_id)!, sub: `ฉีด ${v.vaccine_name}`, date: v.date_given, color: "#94a3b8" }); }
    // วันเกิด / วันรับเลี้ยง ทุกปี (ปีที่แล้ว – ปีหน้า)
    const ty = Number(today.slice(0, 4));
    for (const c of cats) for (const [kind, origin] of [["birthday", c.birth_date], ["adopted", c.adopted_date]] as const) {
      if (!origin) continue;
      for (const y of [ty - 1, ty, ty + 1]) {
        const n = nextAnniversary(origin, `${y}-01-01`);
        if (!n || n.years < 1 || !n.date.startsWith(String(y))) continue;
        const id = `an:${kind}:${c.id}:${y}`;
        catOf.set(id, c.id);
        docs.push({ id, no: c.name, sub: kind === "birthday" ? `วันเกิด ครบ ${n.years} ขวบ` : `ครบ ${n.years} ปีที่มาอยู่บ้าน`, date: n.date, color: kind === "birthday" ? "#db2777" : "#0284c7" });
      }
    }
    for (const t of data.treatments) if (name(t.cat_id)) { catOf.set(`gt:${t.id}`, t.cat_id); docs.push({ id: `gt:${t.id}`, no: name(t.cat_id)!, sub: `${TREATMENT_LABEL[t.type]} ${t.product}`, date: t.date_given, color: "#94a3b8" }); }
    body = (
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
        <DocCalendar docs={docs} cursor={cursor} onCursor={setCursor} unit="รายการ" onPick={(id) => { const c = catOf.get(id); if (c) go({ cat: c }); }}
          hint={<span className="text-xs text-slate-500">สีแดง/ส้ม/เขียว = วันนัด (เลยกำหนด / ใกล้ / ยังไกล) · สีเทา = วันที่ฉีดหรือให้ยาไปแล้ว · ชมพู = วันเกิด · ฟ้า = วันรับเลี้ยง</span>} />
      </div>
    );
  } else if (view === "clinics") {
    const clinics = data.clinics.filter((c) => c.is_active).sort((a, b) => Number(b.is_24h) - Number(a.is_24h) || a.name.localeCompare(b.name, "th"));
    body = (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">คลินิก / โรงพยาบาลสัตว์</h2>
          {canEdit && <button type="button" onClick={() => setForm({ kind: "clinics" })} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" /> เพิ่มคลินิก</button>}
        </div>
        {clinics.length === 0 && <CuteEmpty title="ยังไม่มีคลินิก" hint="เพิ่มคลินิกประจำและคลินิกฉุกเฉิน 24 ชม. ไว้กดโทรได้ทันทีตอนน้องป่วย" actionLabel="＋ เพิ่มคลินิก" onAction={canEdit ? () => setForm({ kind: "clinics" }) : undefined} />}
        <div className="grid gap-3 sm:grid-cols-2">
          {clinics.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-1 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  {c.is_24h && <span className="mt-0.5 inline-block rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">ฉุกเฉิน 24 ชม.</span>}
                </div>
                {canEdit && <>
                  <button type="button" aria-label="แก้ไข" onClick={() => setForm({ kind: "clinics", row: c })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" /></button>
                  <button type="button" aria-label="ลบ" onClick={() => void w.remove("clinics", c.id, c.name)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
                </>}
              </div>
              {c.address && <p className="text-sm text-slate-500">{c.address}</p>}
              {c.note && <p className="mt-1 text-xs text-slate-400">{c.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700"><Icon name="phone" /> {c.phone}</a>}
                {c.map_url && /^https?:\/\//.test(c.map_url) && <a href={c.map_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600"><Icon name="map-pin" /> แผนที่</a>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  } else if (view === "food") body = (
    <FoodTab data={data} mealPlanRaw={settings.meal_plan} canEdit={canEdit} onForm={setForm}
      onPurchase={(s) => setBuy({ supply: s })} onCount={(s, est) => setCount({ s, est })}
      onShopping={() => setShopOpen(true)} onPriceHistory={setPriceOf} onEditPurchase={(s, p) => setBuy({ supply: s, row: p })}
      onDelete={(s) => void w.remove("supplies", s.id, supplyLabel(s))}
      onDeletePurchase={(id, label) => void w.remove("purchases", id, label)}
      onSaveMealPlan={(p, before) => saveSetting("meal_plan", p, before, "บันทึกตารางมื้อแล้ว")} />
  );
  else if (view === "costs") body = (
    <CostsTab data={data} canEdit={canEdit} onForm={setForm} onDeleteExpense={(id, label) => void w.remove("expenses", id, label)} onOpenCat={(id) => go({ cat: id })} />
  );
  else if (view === "settings") body = (
    <SettingsTab data={data} settingsRaw={settings} canEdit={canEdit} isAdmin={user.role === "admin"} onSaveNotify={(v, before) => saveSetting("notify", v, before, "บันทึกการแจ้งเตือนแล้ว")} />
  );
  else body = <CatsTrash key={trashStamp} canEdit={canEdit} onChanged={reload} />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      {header}
      {tabs}
      {body}

      <RecordFormModal target={form} data={data} onClose={() => setForm(null)} onSave={save} />
      <BulkWeighModal open={weighOpen} data={data} onClose={() => setWeighOpen(false)} onSave={(items) => w.createMany("weights", items, `บันทึกน้ำหนัก ${items.length} ตัวแล้ว`)} />
      <ConfirmDialog open={!!confirmCat} onClose={() => setConfirmCat(null)} variant="danger" confirmText="ย้ายไปถังขยะ"
        title={`ลบ "${confirmCat?.name ?? ""}" ?`}
        message="แมวตัวนี้จะไปอยู่ในถังขยะ ประวัติวัคซีน ยา น้ำหนัก และหาหมอยังเก็บไว้ครบ กู้คืนได้จากแท็บถังขยะ"
        onConfirm={async () => { const c = confirmCat; setConfirmCat(null); if (c && await w.remove("cats", c.id, c.name)) go({ view: "home" }); }} />
      <ERPModal open={installOpen} onClose={() => setInstallOpen(false)} title="ติดตั้งแอปแมวบนมือถือ" description="กดไอคอนบนหน้าจอแล้วเข้าทะเบียนแมวได้ทันที ไม่เห็นเมนูอื่นของ ERP" size="md">
        <SoloInstallSection open={installOpen} path="/misc/cats" />
      </ERPModal>
      <PurchaseModal target={buy} data={data} onClose={() => setBuy(null)} onSave={savePurchase} />
      <ShoppingListModal open={shopOpen} data={data} plan={plan} today={today} onClose={() => setShopOpen(false)} />
      <PriceHistoryModal supply={priceOf} data={data} canEdit={canEdit} onClose={() => setPriceOf(null)}
        onEdit={(s, p) => setBuy({ supply: s, row: p })} onDelete={(p, label) => void w.remove("purchases", p.id, label)} />
      <StockCountModal supply={count?.s ?? null} estimate={count?.est ?? 0} onClose={() => setCount(null)} onSave={saveCount} />
      {zoomImg && <ImageLightbox images={[zoomImg]} index={0} onIndex={() => undefined} onClose={() => setZoomImg(null)} />}
    </div>
  );
}
