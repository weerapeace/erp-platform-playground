"use client";

/**
 * 🐾 ทะเบียนแมว (แอป "งานอื่นๆ") — ตัวแอปทั้งหน้า
 *   แท็บ: หน้าแรก (ใกล้ถึงกำหนด + แมวรูปใหญ่) · ปฏิทิน · คลินิก · ถังขยะ · กดแมว = หน้าของแมวตัวนั้น (?cat=<id>)
 *   ข้อมูล/เขียน ผ่าน use-cats (API กลาง /api/cats) · กติกาคำนวณ = lib/cats
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
import { ageText, CATS_EDIT, CATS_VIEW, doneAgain, dueItems, dueLabel, latestWeight, SEX_LABEL, TREATMENT_LABEL, type Cat, type CatKind, type Treatment, type Vaccination } from "@/lib/cats";
import { catPhotoUrl, useCatsData, useCatsWrite } from "./use-cats";
import { BulkWeighModal, RecordFormModal, type FormTarget } from "./cat-forms";
import { CatDetail, CatPhoto, DuePill } from "./cat-detail";
import { CatsTrash } from "./cats-trash";

type View = "home" | "calendar" | "clinics" | "trash";
const VIEWS: { k: View; label: string; icon: string }[] = [
  { k: "home", label: "หน้าแรก", icon: "home" },
  { k: "calendar", label: "ปฏิทิน", icon: "calendar" },
  { k: "clinics", label: "คลินิก", icon: "building-hospital" },
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
  const { data, loading, error, reload } = useCatsData();
  // ถังขยะโหลดชุดของตัวเอง — เขียนจากหน้าอื่น (เช่น กดย้อนกลับในแจ้งผล) แล้วให้ถังขยะโหลดใหม่ด้วย
  const [trashStamp, setTrashStamp] = useState(0);
  const reloadAll = useCallback(async () => { await reload(); setTrashStamp((s) => s + 1); }, [reload]);
  const w = useCatsWrite(reloadAll);
  const today = todayBangkok();

  const [view, setView] = useState<View>("home");
  const [catId, setCatId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [weighOpen, setWeighOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [zoom, setZoom] = useState(-1);
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

  // ─── ด่านสิทธิ์ ───
  if (!user || !permsReady) return <LoadingState variant="cards" rows={4} />;
  if (!canView) return <EmptyState icon={<Icon name="paw" />} title="ยังไม่มีสิทธิ์ดูทะเบียนแมว" hint="ขอให้แอดมินเปิดสิทธิ์ “ดูทะเบียนแมว” ให้ที่ ตั้งค่าแอป → สิทธิ์ตามเมนู" />;

  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h1 className="mr-auto flex items-center gap-2 text-xl font-bold sm:text-2xl text-slate-800"><Icon name="paw" className="text-orange-500" /> ทะเบียนแมว</h1>
      <button type="button" onClick={() => setInstallOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Icon name="device-mobile" /> <span className="hidden sm:inline">ติดตั้งบนมือถือ</span></button>
      {canEdit && <button type="button" onClick={() => setWeighOpen(true)} disabled={!cats.length} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="scale" /> <span className="hidden sm:inline">ชั่งทุกตัว</span></button>}
      {canEdit && <button type="button" onClick={() => setForm({ kind: "cats" })} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"><Icon name="plus" /> เพิ่มแมว</button>}
    </div>
  );

  const tabs = (
    <div className="sticky top-0 z-10 -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
      {VIEWS.map((t) => (
        <button key={t.k} type="button" onClick={() => go({ view: t.k })}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${view === t.k && !cat ? "border-orange-500 font-medium text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          <Icon name={t.icon} /> {t.label}
          {t.k === "home" && due.some((d) => d.daysLeft <= 7) && <span className="h-2 w-2 rounded-full bg-rose-500" aria-label="มีเรื่องใกล้ถึงกำหนด" />}
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (loading) body = <LoadingState variant="cards" rows={4} />;
  else if (error) body = <ErrorState title="โหลดทะเบียนแมวไม่ได้" hint={error} onRetry={() => void reload()} />;
  else if (cat) body = (
    <CatDetail cat={cat} data={data} canEdit={canEdit} onBack={() => go({ view: "home" })} onForm={setForm} onDone={markDone} onDelete={askDelete} onZoom={() => setZoom(0)} />
  );
  else if (view === "home") body = (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><Icon name="alarm" /> ใกล้ถึงกำหนด <span className="text-xs font-normal text-slate-400">ภายใน 30 วัน</span></h2>
        {due.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-sm text-slate-400">ไม่มีวัคซีนหรือยาที่ใกล้ถึงกำหนด</p>
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
                  {canEdit && <button type="button" onClick={() => doneFromDue(d.kind, d.recordId)} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">{d.kind === "vaccinations" ? "ฉีดแล้ว" : "ให้ยาแล้ว"}</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-700"><Icon name="cat" /> แมวของเรา <span className="text-xs font-normal text-slate-400">{cats.length} ตัว</span></h2>
        {cats.length === 0 ? (
          <EmptyState icon={<Icon name="cat" />} title="ยังไม่มีแมวในทะเบียน" hint="เริ่มจากเพิ่มแมวตัวแรก ใส่รูป ชื่อ วันเกิด" onCreate={canEdit ? () => setForm({ kind: "cats" }) : undefined} createLabel="เพิ่มแมว" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cats.map((c) => {
              const worst = due.filter((d) => d.catId === c.id)[0];
              const lw = latestWeight(data.weights, c.id);
              const age = ageText(c.birth_date, today);
              return (
                <button key={c.id} type="button" onClick={() => go({ cat: c.id })} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:shadow-md">
                  <div className="relative">
                    <CatPhoto cat={c} w={600} className="aspect-square w-full transition group-hover:scale-[1.02]" />
                    {worst && worst.daysLeft <= 7 && (
                      <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white ${dueLabel(worst.daysLeft).tone === "danger" ? "bg-rose-600" : "bg-amber-500"}`}>{dueLabel(worst.daysLeft).text}</span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-lg font-bold text-slate-800">{c.name}</div>
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
    for (const t of data.treatments) if (name(t.cat_id)) { catOf.set(`gt:${t.id}`, t.cat_id); docs.push({ id: `gt:${t.id}`, no: name(t.cat_id)!, sub: `${TREATMENT_LABEL[t.type]} ${t.product}`, date: t.date_given, color: "#94a3b8" }); }
    body = (
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
        <DocCalendar docs={docs} cursor={cursor} onCursor={setCursor} unit="รายการ" onPick={(id) => { const c = catOf.get(id); if (c) go({ cat: c }); }}
          hint={<span className="text-xs text-slate-500">สีแดง/ส้ม/เขียว = วันนัด (เลยกำหนด / ใกล้ / ยังไกล) · สีเทา = วันที่ฉีดหรือให้ยาไปแล้ว</span>} />
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
        {clinics.length === 0 && <EmptyState icon={<Icon name="building-hospital" />} title="ยังไม่มีคลินิก" hint="เพิ่มคลินิกประจำและคลินิกฉุกเฉิน 24 ชม. ไว้กดโทรได้ทันที" onCreate={canEdit ? () => setForm({ kind: "clinics" }) : undefined} createLabel="เพิ่มคลินิก" />}
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
  } else body = <CatsTrash key={trashStamp} canEdit={canEdit} onChanged={reload} />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      {header}
      {tabs}
      {body}

      <RecordFormModal target={form} data={data} onClose={() => setForm(null)} onSave={save} />
      <BulkWeighModal open={weighOpen} data={data} onClose={() => setWeighOpen(false)} onSave={(items) => w.createMany("weights", items, `บันทึกน้ำหนัก ${items.length} ตัวแล้ว`)} />
      <ConfirmDialog open={!!confirmCat} onClose={() => setConfirmCat(null)} variant="danger" confirmText="ย้ายไปถังขยะ"
        title={`ลบ "${confirmCat?.name ?? ""}" ?`}
        message="แมวตัวนี้จะไปอยู่ในถังขยะ ประวัติวัคซีน ยา และน้ำหนักยังเก็บไว้ครบ กู้คืนได้จากแท็บถังขยะ"
        onConfirm={async () => { const c = confirmCat; setConfirmCat(null); if (c && await w.remove("cats", c.id, c.name)) go({ view: "home" }); }} />
      <ERPModal open={installOpen} onClose={() => setInstallOpen(false)} title="ติดตั้งแอปแมวบนมือถือ" description="กดไอคอนบนหน้าจอแล้วเข้าทะเบียนแมวได้ทันที ไม่เห็นเมนูอื่นของ ERP" size="md">
        <SoloInstallSection open={installOpen} path="/misc/cats" />
      </ERPModal>
      {cat?.photo_r2_key && (
        <ImageLightbox images={[{ url: catPhotoUrl(cat.photo_r2_key, 2000)!, label: cat.name }]} index={zoom} onIndex={setZoom} onClose={() => setZoom(-1)} />
      )}
    </div>
  );
}
