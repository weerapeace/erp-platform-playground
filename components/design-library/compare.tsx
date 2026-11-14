"use client";

/**
 * 📚 Design Library — เทียบ 2 สูตรข้างกัน (/master/design-library/compare?a=<สูตร>&b=<สูตร>&ca=<ชุดสี>&cb=<ชุดสี>)
 * เทียบได้ทุกสูตร (ข้ามแม่แบบ) · วัสดุจับคู่ตาม "หมวด" ไม่ใช่ตำแหน่งจุด · บรรทัดที่ต่างไฮไลต์ + กรอง "เฉพาะที่ต่าง"
 * กฎเทียบ = lib/design-library compareRecipes (เทสต์ได้) · ข้อมูล = /api/design-library/bundle (ตัวเดียวกับหน้าสูตร)
 * สิทธิ์ design_library.view
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { applyColorway, cleanSpec, colorwayLabel, compareRecipes, type CompareRow, type Pick, type Spec } from "@/lib/design-library";
import { PickThumb } from "./pick-panel";
import { api, img, LIB_HREF, recipeHref, type RecipeBundle, type RecipeCard, type Template } from "./shared";

type Side = "a" | "b";

/** เลือกสูตร: แม่แบบ → สูตร */
function RecipeSelect({ templates, value, templateId, onPick }: {
  templates: Template[]; value: string | null; templateId: string | null; onPick: (recipeId: string) => void;
}) {
  const [tpl, setTpl] = useState<string>(templateId ?? "");
  const [recipes, setRecipes] = useState<RecipeCard[] | null>(null);
  useEffect(() => { if (templateId) setTpl(templateId); }, [templateId]);
  useEffect(() => {
    if (!tpl) { setRecipes(null); return; }
    let alive = true;
    api<{ recipes: RecipeCard[] }>(`/api/design-library/bundle?template_id=${tpl}`).then((d) => { if (alive) setRecipes(d.recipes); }).catch(() => { if (alive) setRecipes([]); });
    return () => { alive = false; };
  }, [tpl]);
  const cls = "h-9 px-2 border border-slate-200 rounded-lg text-[13px] bg-white min-w-0 w-full";
  return (
    <div className="grid grid-cols-2 gap-2">
      <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={cls} aria-label="แม่แบบ">
        <option value="">เลือกแม่แบบ…</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
      </select>
      <select value={value ?? ""} onChange={(e) => e.target.value && onPick(e.target.value)} className={cls} aria-label="สูตร" disabled={!tpl}>
        <option value="">{!tpl ? "เลือกแม่แบบก่อน" : recipes == null ? "กำลังโหลด…" : recipes.length ? "เลือกสูตร…" : "แม่แบบนี้ยังไม่มีสูตร"}</option>
        {(recipes ?? []).map((r) => <option key={r.id} value={r.id}>สูตร #{r.seq}{r.name ? ` · ${r.name}` : ""}</option>)}
      </select>
    </div>
  );
}

function Thumbs({ picks, spec, b, cat }: { picks?: (Pick | null)[]; spec: Spec; b: RecipeBundle; cat: string }) {
  if (!picks?.length) return null;
  return <span className="flex gap-1 shrink-0">{picks.slice(0, 3).map((p, i) => <PickThumb key={i} pick={p} spec={spec} choices={b.choices} cat={cat} size={34} />)}</span>;
}

export function RecipeCompare() {
  const sp = useSearchParams();
  const router = useRouter();
  const ids = { a: sp.get("a"), b: sp.get("b") };
  const cws = { a: sp.get("ca"), b: sp.get("cb") };
  const [templates, setTemplates] = useState<Template[]>([]);
  const [data, setData] = useState<Record<Side, RecipeBundle | null>>({ a: null, b: null });
  const [err, setErr] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  useEffect(() => { api<Template[]>(`/api/design-library/bundle?overview=1`).then(setTemplates).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => {
    let alive = true;
    (["a", "b"] as Side[]).forEach((s) => {
      const id = ids[s];
      if (!id) { setData((d) => ({ ...d, [s]: null })); return; }
      if (data[s]?.recipe.id === id) return;
      api<RecipeBundle>(`/api/design-library/bundle?recipe_id=${id}`).then((r) => { if (alive) setData((d) => ({ ...d, [s]: r })); }).catch((e: Error) => { if (alive) setErr(e.message); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.a, ids.b]);

  const setParam = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    router.replace(`${LIB_HREF}/compare?${q.toString()}`, { scroll: false });
  };

  const specs = useMemo(() => ({
    a: data.a ? applyColorway(cleanSpec(data.a.recipe.spec), cws.a) : null,
    b: data.b ? applyColorway(cleanSpec(data.b.recipe.spec), cws.b) : null,
  }), [data.a, data.b, cws.a, cws.b]);
  const rows: CompareRow[] = useMemo(() => (data.a && data.b && specs.a && specs.b
    ? compareRecipes({ spec: specs.a, choices: data.a.choices, template: data.a.template }, { spec: specs.b, choices: data.b.choices, template: data.b.template })
    : []), [data.a, data.b, specs.a, specs.b]);
  const diffCount = rows.filter((r) => !r.same).length;
  const shown = onlyDiff ? rows.filter((r) => !r.same) : rows;

  const head = (s: Side) => {
    const b = data[s]; const full = b ? cleanSpec(b.recipe.spec) : null;
    const cover = b ? (b.renders.filter((r) => (r.colorway_id ?? null) === cws[s] && r.view_key === "grid4")[0]?.image_key ?? b.template.image_key) : null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 min-w-0">
        <div className="text-[12px] text-slate-500 mb-1.5">สูตร {s === "a" ? "ซ้าย" : "ขวา"}</div>
        <RecipeSelect templates={templates} value={ids[s]} templateId={b?.template.id ?? null} onPick={(id) => setParam({ [s]: id, [`c${s}`]: null })} />
        {ids[s] && !b && <div className="h-40 flex items-center justify-center text-[13px] text-slate-400">กำลังโหลด…</div>}
        {b && full && (
          <div className="mt-2">
            <div className="aspect-[4/3] rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover ? <img src={img(cover, 700)} alt="" className="w-full h-full object-contain" /> : <span className="text-[12px] text-slate-400">ไม่มีรูป</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Link href={recipeHref(b.recipe.id)} className="text-[14px] font-medium text-slate-800 hover:text-indigo-700 truncate">{b.template.code} · สูตร #{b.recipe.seq}{b.recipe.name ? ` ${b.recipe.name}` : ""}</Link>
              {full.colorways.length > 0 && (
                <select value={cws[s] ?? ""} onChange={(e) => setParam({ [`c${s}`]: e.target.value || null })} className="ml-auto h-8 px-2 border border-slate-200 rounded-md text-[12.5px] bg-white" aria-label="ชุดสี">
                  <option value="">{colorwayLabel(full, null)}</option>
                  {full.colorways.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (err) return <div className="p-6"><ErrorState title="เปิดหน้าเทียบสูตรไม่สำเร็จ" hint={err} onRetry={() => { setErr(null); window.location.reload(); }} /></div>;
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={ids.a ? recipeHref(ids.a) : LIB_HREF} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="กลับ"><Icon value="i:arrow-left" /></Link>
        <div className="min-w-0 mr-auto">
          <h1 className="text-xl font-semibold text-slate-800">เทียบ 2 สูตร</h1>
          <p className="text-[13px] text-slate-500">เทียบข้ามแม่แบบได้ · วัสดุจับคู่ตามหมวด (ซิปเทียบกับซิป แม้จุดอยู่คนละที่)</p>
        </div>
        {ids.a && ids.b && <button type="button" onClick={() => setParam({ a: ids.b, b: ids.a, ca: cws.b, cb: cws.a })} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:arrows-exchange" />สลับซ้าย-ขวา</button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{head("a")}{head("b")}</div>

      {data.a && data.b && specs.a && specs.b ? (
        <section className="rounded-xl border border-slate-200 bg-white mt-4">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100">
            <span className="text-[14px] font-medium text-slate-800">{diffCount ? `ต่างกัน ${diffCount} บรรทัด` : "เหมือนกันทุกบรรทัด"}</span>
            <label className="ml-auto text-[13px] text-slate-600 inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />แสดงเฉพาะที่ต่าง</label>
          </div>
          <div className="divide-y divide-slate-100">
            {shown.map((r, i) => (
              <div key={`${r.group}-${r.label}-${i}`}>
                {(i === 0 || shown[i - 1].group !== r.group) && <div className="px-3 pt-3 pb-1 text-[12px] text-slate-400">{r.group}</div>}
                <div className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-1.5 text-[13px] ${r.same ? "" : "bg-amber-50/70"}`}>
                  <div className="text-slate-500 flex items-center gap-1">{!r.same && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}{r.label}</div>
                  {(["a", "b"] as Side[]).map((s) => (
                    <div key={s} className="flex items-center gap-2 min-w-0">
                      <Thumbs picks={s === "a" ? r.picksA : r.picksB} spec={specs[s]!} b={data[s]!} cat={r.cat ?? ""} />
                      <span className={`min-w-0 break-words ${r.same ? "text-slate-600" : "text-slate-900"}`}>{s === "a" ? r.a : r.b}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!shown.length && <div className="px-3 py-6 text-center text-[13px] text-slate-500">ไม่มีบรรทัดที่ต่างกัน</div>}
          </div>
        </section>
      ) : (ids.a && ids.b) ? <div className="mt-6"><LoadingState label="กำลังเทียบ…" /></div> : (
        <div className="mt-6 text-center text-[13px] text-slate-500">เลือกสูตรทั้ง 2 ฝั่งเพื่อเริ่มเทียบ</div>
      )}
    </div>
  );
}
