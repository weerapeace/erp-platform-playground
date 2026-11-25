"use client";

/**
 * 🐾 หน้าของแมว 1 ตัว — รูปใหญ่ + ข้อมูล + แท็บ วัคซีน / ยา / น้ำหนัก
 *   PC = รูปซ้ายใหญ่ ข้อมูลขวา · มือถือ = รูปเต็มความกว้างด้านบน
 *   ปุ่มต่อรายการ: ฉีดแล้ว/ให้ยาแล้ว (เฉพาะครั้งล่าสุดที่มีวันนัด) · แก้ · ลบ (ไปถังขยะ)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { formatDate, todayBangkok } from "@/lib/date";
import { sinceText, weightAlert } from "@/lib/cats-extras";
import { WeightAlertBadge } from "./extras-ui";
import { ageText, dueLabel, daysBetween, isLatestRecord, latestWeight, SEX_LABEL, TREATMENT_LABEL, type Cat, type CatKind, type CatsData, type Treatment, type Vaccination } from "@/lib/cats";
import { WeightChart } from "./weight-chart";
import { catPhotoUrl, fmtMoney } from "./use-cats";
import type { FormTarget } from "./cat-forms";

type Tab = "info" | "vaccinations" | "treatments" | "weights" | "vet";
const TONE = { danger: "bg-rose-50 text-rose-700 border-rose-200", warning: "bg-amber-50 text-amber-700 border-amber-200", ok: "bg-emerald-50 text-emerald-700 border-emerald-200" };

export function DuePill({ due, today }: { due: string; today: string }) {
  const l = dueLabel(daysBetween(today, due));
  return <span className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TONE[l.tone]}`}>{l.text}</span>;
}

export function CatPhoto({ cat, className = "", w = 800, onClick }: { cat: Cat; className?: string; w?: number; onClick?: () => void }) {
  const url = catPhotoUrl(cat.photo_r2_key, w);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={cat.name} onClick={onClick} className={`object-cover ${onClick ? "cursor-zoom-in" : ""} ${className}`} loading="lazy" />
  ) : (
    <div className={`flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 text-orange-300 ${className}`}>
      <Icon name="cat" size="45%" />
    </div>
  );
}

export function CatDetail({ cat, data, canEdit, onBack, onForm, onDone, onDelete, onZoom, onZoomUrl }: {
  cat: Cat;
  data: CatsData;
  canEdit: boolean;
  onBack: () => void;
  onForm: (t: FormTarget) => void;
  onDone: (kind: "vaccinations" | "treatments", row: Vaccination | Treatment) => void;
  onDelete: (kind: CatKind, row: Record<string, unknown>, label: string) => void;
  onZoom: () => void;
  /** เปิดรูปอื่นเต็มจอ (รูปใบเสร็จ) */
  onZoomUrl: (url: string, label: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("vaccinations");
  const today = todayBangkok();
  const vacs = useMemo(() => data.vaccinations.filter((v) => v.cat_id === cat.id).sort((a, b) => b.date_given.localeCompare(a.date_given)), [data.vaccinations, cat.id]);
  const treats = useMemo(() => data.treatments.filter((t) => t.cat_id === cat.id).sort((a, b) => b.date_given.localeCompare(a.date_given)), [data.treatments, cat.id]);
  const weights = useMemo(() => data.weights.filter((w) => w.cat_id === cat.id).sort((a, b) => a.date.localeCompare(b.date)), [data.weights, cat.id]);
  const visits = useMemo(() => data.vet_visits.filter((x) => x.cat_id === cat.id).sort((a, b) => b.date.localeCompare(a.date)), [data.vet_visits, cat.id]);
  const lw = latestWeight(data.weights, cat.id);
  const clinicName = (id: string | null) => data.clinics.find((c) => c.id === id)?.name ?? "";
  const age = ageText(cat.birth_date, today);
  const wAlert = weightAlert(data.weights, cat.id, today);
  const since = sinceText(cat.adopted_date, today);

  const info: [string, string][] = [
    ["เพศ", cat.sex ? SEX_LABEL[cat.sex] : "—"],
    ["วันเกิด", cat.birth_date ? `${formatDate(cat.birth_date)}${age ? ` (${age})` : ""}` : "—"],
    ["วันรับเลี้ยง", cat.adopted_date ? `${formatDate(cat.adopted_date)}${since ? ` (อยู่บ้านมา ${since})` : ""}` : "—"],
    ["สายพันธุ์", cat.breed || "—"],
    ["สี", cat.color || "—"],
    ["ทำหมัน", cat.neutered ? "ทำแล้ว" : "ยังไม่ทำ"],
    ["ไมโครชิป", cat.microchip || "—"],
    ["น้ำหนักล่าสุด", lw ? `${lw.kg.toFixed(2)} กก. (${formatDate(lw.date)})` : "—"],
  ];

  const tabs: { k: Tab; label: string; n?: number }[] = [
    { k: "vaccinations", label: "วัคซีน", n: vacs.length },
    { k: "treatments", label: "ยา", n: treats.length },
    { k: "weights", label: "น้ำหนัก", n: weights.length },
    { k: "vet", label: "หาหมอ", n: visits.length },
    { k: "info", label: "ข้อมูล" },
  ];

  const addBtn = (kind: CatKind, label: string) => canEdit && (
    <button type="button" onClick={() => onForm({ kind, preset: { cat_id: cat.id } })}
      className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
      <Icon name="plus" /> {label}
    </button>
  );

  const rowActions = (kind: CatKind, row: Record<string, unknown>, label: string) => canEdit && (
    <div className="flex shrink-0 gap-1">
      <button type="button" aria-label="แก้ไข" title="แก้ไข" onClick={() => onForm({ kind, row })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" /></button>
      <button type="button" aria-label="ลบ" title="ลบ (ไปถังขยะ)" onClick={() => onDelete(kind, row, label)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <Icon name="arrow-left" /> แมวทั้งหมด
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid md:grid-cols-[minmax(0,380px)_1fr]">
        <CatPhoto cat={cat} w={900} onClick={cat.photo_r2_key ? onZoom : undefined} className="aspect-square w-full md:h-full md:min-h-[380px]" />
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{cat.name}</h2>
              <p className="text-sm text-slate-500">{[cat.sex ? SEX_LABEL[cat.sex] : "", age, cat.breed].filter(Boolean).join(" · ")}</p>
              {wAlert && <button type="button" onClick={() => setTab("weights")} className="mt-1"><WeightAlertBadge alert={wAlert} /></button>}
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <a href={`/misc/cats/book?cat=${cat.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Icon name="printer" /> สมุดสุขภาพ</a>
            {canEdit && (
              <div className="flex gap-1">
                <button type="button" onClick={() => onForm({ kind: "cats", row: cat })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Icon name="edit" /> แก้ไข</button>
                <button type="button" aria-label="ลบแมว" title="ลบแมว (ไปถังขยะ)" onClick={() => onDelete("cats", cat, cat.name)} className="rounded-lg border border-slate-300 px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
              </div>
            )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {info.map(([k, val]) => (
              <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="text-slate-700">{val}</dd></div>
            ))}
          </dl>
          {cat.note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{cat.note}</p>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.k ? "border-sky-600 font-medium text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}{t.n != null && <span className="ml-1 text-xs text-slate-400">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          ข้อมูลทั้งหมดอยู่ในกล่องด้านบน · กด <b>แก้ไข</b> เพื่อเปลี่ยนรูป ชื่อ หรือรายละเอียด · ประวัติการแก้ทุกครั้งถูกบันทึกไว้
        </div>
      )}

      {tab === "vaccinations" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-700">ประวัติวัคซีน</h3>{addBtn("vaccinations", "เพิ่มวัคซีน")}</div>
          {vacs.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติวัคซีน</p>}
          {vacs.map((v) => {
            const latest = isLatestRecord(data, "vaccinations", v.id);
            return (
              <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <Icon name="shield-check" className="text-sky-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{v.vaccine_name}</div>
                  <div className="text-xs text-slate-500">ฉีด {formatDate(v.date_given)}{v.clinic_id ? ` · ${clinicName(v.clinic_id)}` : ""}{v.cost != null ? ` · ${fmtMoney(v.cost)}` : ""}{v.next_due_date ? ` · นัด ${formatDate(v.next_due_date)}` : ""}</div>
                </div>
                {latest && v.next_due_date && <DuePill due={v.next_due_date} today={today} />}
                {latest && v.next_due_date && canEdit && <button type="button" onClick={() => onDone("vaccinations", v)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">ฉีดแล้ว</button>}
                {rowActions("vaccinations", v, v.vaccine_name)}
              </div>
            );
          })}
        </section>
      )}

      {tab === "treatments" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-700">ยาถ่ายพยาธิ / ยาหยดกันเห็บหมัด</h3>{addBtn("treatments", "เพิ่มยา")}</div>
          {treats.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติการให้ยา</p>}
          {treats.map((t) => {
            const latest = isLatestRecord(data, "treatments", t.id);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <Icon name={t.type === "flea" ? "droplet" : "heart-plus"} className={t.type === "flea" ? "text-violet-500" : "text-orange-500"} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{TREATMENT_LABEL[t.type]} · {t.product}</div>
                  <div className="text-xs text-slate-500">ให้ {formatDate(t.date_given)}{t.interval_days ? ` · ทุก ${t.interval_days} วัน` : ""}{t.cost != null ? ` · ${fmtMoney(t.cost)}` : ""}{t.next_due_date ? ` · ครั้งถัดไป ${formatDate(t.next_due_date)}` : ""}</div>
                </div>
                {latest && t.next_due_date && <DuePill due={t.next_due_date} today={today} />}
                {latest && t.next_due_date && canEdit && <button type="button" onClick={() => onDone("treatments", t)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">ให้ยาแล้ว</button>}
                {rowActions("treatments", t, `${TREATMENT_LABEL[t.type]} ${t.product}`)}
              </div>
            );
          })}
        </section>
      )}

      {tab === "vet" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-700">ป่วย / ไปหาหมอ</h3>{addBtn("vet_visits", "บันทึกหาหมอ")}</div>
          {visits.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติการไปหาหมอ</p>}
          {visits.map((x) => {
            const receipt = catPhotoUrl(x.receipt_r2_key, 300);
            return (
              <div key={x.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <Icon name="building-hospital" className="text-rose-500" /> {formatDate(x.date)}{x.clinic_id ? ` · ${clinicName(x.clinic_id)}` : ""}{x.cost != null ? ` · ${fmtMoney(x.cost)}` : ""}
                  </div>
                  {x.symptoms && <div><span className="text-slate-400">อาการ: </span>{x.symptoms}</div>}
                  {x.diagnosis && <div className="font-medium text-slate-800"><span className="font-normal text-slate-400">วินิจฉัย: </span>{x.diagnosis}</div>}
                  {x.medicines && <div><span className="text-slate-400">ยา: </span>{x.medicines}</div>}
                  {x.note && <div className="text-xs text-slate-500">{x.note}</div>}
                </div>
                {receipt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receipt} alt="ใบเสร็จ" onClick={() => onZoomUrl(catPhotoUrl(x.receipt_r2_key, 2000)!, `ใบเสร็จ ${formatDate(x.date)}`)} className="h-20 w-16 shrink-0 cursor-zoom-in rounded-md border border-slate-200 object-cover" />
                )}
                {rowActions("vet_visits", x, `หาหมอ ${formatDate(x.date)}`)}
              </div>
            );
          })}
        </section>
      )}

      {tab === "weights" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-700">น้ำหนัก</h3>{addBtn("weights", "ชั่งน้ำหนัก")}</div>
          {wAlert && (
            <p className={`rounded-lg px-3 py-2 text-sm ${wAlert.kind === "drop" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700"}`}>
              {wAlert.kind === "drop"
                ? <>น้ำหนักลด {wAlert.pct}% จากครั้งก่อน ({wAlert.fromKg} → {wAlert.toKg} กก.) · ลองสังเกตการกิน/อาการ ถ้าลดต่อเนื่องควรพาไปหาหมอ</>
                : <>ไม่ได้ชั่งมา {wAlert.days} วัน · ชั่งเดือนละครั้งจะเห็นความเปลี่ยนแปลงเร็ว</>}
            </p>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <WeightChart points={weights.map((w) => ({ date: w.date, kg: Number(w.weight_kg) }))} />
          </div>
          {[...weights].reverse().map((w, i, arr) => {
            const prev = arr[i + 1];
            const diff = prev ? Math.round((Number(w.weight_kg) - Number(prev.weight_kg)) * 100) / 100 : null;
            return (
              <div key={w.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="w-24 text-sm text-slate-500">{formatDate(w.date)}</span>
                <span className="flex-1 font-medium text-slate-800">{Number(w.weight_kg).toFixed(2)} กก.
                  {diff != null && diff !== 0 && <span className={`ml-2 text-xs ${diff > 0 ? "text-amber-600" : "text-sky-600"}`}>{diff > 0 ? "+" : ""}{diff.toFixed(2)}</span>}
                  {w.note && <span className="ml-2 text-xs font-normal text-slate-400">{w.note}</span>}
                </span>
                {rowActions("weights", w, `${Number(w.weight_kg).toFixed(2)} กก.`)}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
