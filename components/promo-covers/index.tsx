"use client";
/**
 * 🖼 เปลี่ยนปกโปรทุกร้าน — หน้าหลัก (/master/promo-covers)
 *   เจ้าของขอ 2026-11-20 "เปลี่ยนรูปปก ทีเดียวทุก Platforms … ทำ Promotion แล้วต้องแก้รูปปก" · เลือกแบบจาก widget (PC+มือถือ)
 *   PC = รายการชุดโปรซ้าย + ตัวแก้/ผลรายร้านขวา · มือถือ = รายการ → แตะชุด = เปิดตัวแก้ (ปุ่มกลับ)
 *   ลบ = ลงถังขยะ (กู้คืนได้ · ต้องย้อนปกเดิมให้ครบก่อน) · ทุกการแก้/ส่ง/ย้อนลงประวัติ
 *   กติกา = lib/promo-cover · ยิงร้าน = lib/promo-cover-server · คู่มือ docs/promo-covers.md
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { CAMPAIGN_STATUS, ON_SHOP, thTime } from "@/lib/promo-cover";
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, patchCampaign, reuseCampaign, type CampaignListRow, type Full, type Preview } from "./api";
import { PromoEditor } from "./editor";
import { PromoResults } from "./results";
import { ConfirmPromoModal } from "./confirm-modal";
import { Pill } from "./parts";

export function PromoCoversPage() {
  const toast = useToast();
  const canPublish = usePermission("products.platforms.publish");
  const [trash, setTrash] = useState(false);
  const [list, setList] = useState<CampaignListRow[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [fullErr, setFullErr] = useState<string | null>(null);
  const [confirmPv, setConfirmPv] = useState<Preview | null | undefined>(undefined);
  const [delAsk, setDelAsk] = useState(false);
  const [creating, setCreating] = useState(false);
  /** ชุดที่เพิ่งกดใช้ซ้ำ → เปิดตัวแก้ให้ตั้งเวลาเลย */
  const [editNew, setEditNew] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListErr(null);
    try { setList(await listCampaigns(trash)); } catch (e) { setListErr((e as Error).message); }
  }, [trash]);
  useEffect(() => { setList(null); void loadList(); }, [loadList]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("id"); if (id) setSelId(id); }, []);

  const loadFull = useCallback(async (id: string) => {
    setFullErr(null);
    try { setFull(await getCampaign(id)); } catch (e) { setFullErr((e as Error).message); }
  }, []);
  useEffect(() => { if (selId) { setFull(null); void loadFull(selId); } else setFull(null); }, [selId, loadFull]);
  const select = (id: string | null) => {
    setSelId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("id", id); else u.searchParams.delete("id");
    window.history.replaceState(null, "", u.toString());
  };
  const reload = async () => { if (selId) await loadFull(selId); await loadList(); };

  const create = async () => {
    setCreating(true);
    try {
      const d = new Date(Date.now() + 7 * 3600_000);
      const c = await createCampaign({ name: `โปร ${d.getUTCDate()}/${d.getUTCMonth() + 1}` });
      setTrash(false); await loadList(); select(c.id);
      toast.success("สร้างชุดโปรแล้ว — ตั้งชื่อ เลือกรุ่น ใส่ปกโปร เลือกร้าน แล้วตั้งเวลา");
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  };
  const remove = async () => {
    if (!full) return;
    try {
      const id = full.campaign.id; const name = full.campaign.name;
      await deleteCampaign(id); select(null); await loadList();
      toast.undo(`ย้ายชุด "${name}" ลงถังขยะแล้ว`, async () => { await patchCampaign(id, { restore: true }); await loadList(); select(id); });
    } catch (e) { toast.error((e as Error).message); }
  };
  /** ใช้ซ้ำ: ชุดใหม่ (ร่าง) รุ่น + ปก + ร้านเหมือนเดิม → เปิดตัวแก้ให้ตั้งเวลา · ย้อนกลับ = ลบชุดใหม่ลงถังขยะ */
  const reuse = async () => {
    if (!full) return;
    setCreating(true);
    try {
      const fromId = full.campaign.id;
      const c = await reuseCampaign(fromId);
      setTrash(false); setEditNew(c.id); await loadList(); select(c.id);
      toast.undo(`ใช้ซ้ำแล้ว — สร้าง "${c.name}" (ร่าง) ตั้งเวลาแล้วกดยืนยันได้เลย`, async () => { await deleteCampaign(c.id); await loadList(); select(fromId); });
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  };
  const restore = async () => {
    if (!full) return;
    try { await patchCampaign(full.campaign.id, { restore: true }); toast.success("กู้คืนแล้ว"); setTrash(false); await loadList(); await loadFull(full.campaign.id); }
    catch (e) { toast.error((e as Error).message); }
  };

  const live = list?.filter((c) => c.status === "live").length ?? 0;
  const sched = list?.filter((c) => c.status === "scheduled").length ?? 0;
  const onShop = full?.targets.some((t) => ON_SHOP.has(t.status)) ?? false;

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-slate-900">เปลี่ยนปกโปรทุกร้าน</h1>
          <p className="text-[12px] text-slate-500">เลือกรุ่น วางปกโปร เลือกร้าน ตั้งเวลา — จบโปรแล้วย้อนเป็นปกเดิมเอง{list && !trash ? ` · ${list.length} ชุด · กำลังใช้ ${live} · รอเริ่ม ${sched}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setTrash(!trash); select(null); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
            <Icon name={trash ? "back" : "delete"} /> {trash ? "กลับรายการ" : "ถังขยะ"}
          </button>
          {canPublish && !trash && (
            <button type="button" disabled={creating} onClick={() => void create()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm text-white hover:bg-sky-700 disabled:opacity-60">
              <Icon name="add" /> {creating ? "กำลังสร้าง…" : "สร้างชุดโปรใหม่"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* รายการชุดโปร — มือถือซ่อนเมื่อเปิดชุด */}
        <div className={`${selId ? "hidden lg:block" : ""} space-y-2`}>
          {listErr ? <ErrorState title="โหลดชุดโปรไม่สำเร็จ" hint={listErr} onRetry={() => void loadList()} /> : !list ? <LoadingState rows={4} /> : list.length === 0 ? (
            <EmptyState icon={<Icon name="image" size={36} />}title={trash ? "ถังขยะว่าง" : "ยังไม่มีชุดโปร"} hint={trash ? undefined : "สร้างชุดโปรแรก แล้วตั้งเวลาให้ระบบเปลี่ยนปกทุกร้านให้"} onCreate={canPublish && !trash ? () => void create() : undefined} createLabel="สร้างชุดโปรใหม่" />
          ) : (
            <ul className="space-y-1.5">
              {list.map((c) => {
                const st = CAMPAIGN_STATUS[c.status];
                const bad = c.counts.failed + c.counts.revert_failed + c.counts.conflict;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => select(c.id)} className={`w-full rounded-xl border p-2.5 text-left ${selId === c.id ? "border-sky-400 bg-sky-50/50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className="flex items-center gap-2">
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{c.name}</span>
                        {bad > 0 && <Pill tone="bad">ต้องดู {bad}</Pill>}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {c.items} รุ่น · {c.starts_at ? `เริ่ม ${thTime(c.starts_at)}` : "เริ่มทันทีที่ยืนยัน"}{c.ends_at ? ` · จบ ${thTime(c.ends_at)}${c.auto_revert ? " ↩" : ""}` : ""}
                        {c.counts.total > 0 ? ` · ขึ้น ${c.counts.applied + c.counts.review}/${c.counts.total}` : ""}{c.status === "ended" ? ` · ย้อนแล้ว ${c.counts.reverted}` : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ตัวแก้ + ผลรายร้าน */}
        <div className={`${selId ? "" : "hidden lg:block"} min-w-0 space-y-3`}>
          {!selId ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">เลือกชุดโปรทางซ้าย หรือกด &quot;สร้างชุดโปรใหม่&quot;</div>
          ) : fullErr ? <ErrorState title="โหลดชุดโปรไม่สำเร็จ" hint={fullErr} onRetry={() => void loadFull(selId)} /> : !full ? <LoadingState rows={6} /> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => select(null)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[12px] text-slate-600 lg:hidden"><Icon name="back" /> ชุดโปรทั้งหมด</button>
                <Pill tone={CAMPAIGN_STATUS[full.campaign.status].tone}>{CAMPAIGN_STATUS[full.campaign.status].label}</Pill>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{full.campaign.name}</span>
                {canPublish && full.campaign.deleted_at && <button type="button" onClick={() => void restore()} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[12px] text-slate-700"><Icon name="back" /> กู้คืน</button>}
                {canPublish && !full.campaign.deleted_at && (
                  <button type="button" disabled={creating} onClick={() => void reuse()} title="สร้างชุดใหม่ (ร่าง) ที่มีรุ่น ปกโปร และร้านเหมือนชุดนี้ แล้วตั้งเวลาใหม่" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon name="repeat" /> {creating ? "กำลังสร้าง…" : "ใช้ซ้ำ"}</button>
                )}
                {canPublish && !full.campaign.deleted_at && (
                  <button type="button" onClick={() => setDelAsk(true)} title={onShop ? "ยังมีปกโปรค้างบนร้าน — ย้อนปกเดิมก่อน" : undefined} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[12px] text-rose-600 hover:bg-rose-50"><Icon name="delete" /> ลบชุด</button>
                )}
              </div>
              {full.campaign.status !== "draft" && <PromoResults full={full} canRun={canPublish} onReload={reload} />}
              <PromoEditor full={full} canEdit={canPublish} startEditing={editNew === full.campaign.id} onChanged={(f) => { setFull(f); void loadList(); }} onAskConfirm={(pv) => setConfirmPv(pv)} />
            </>
          )}
        </div>
      </div>

      {full && confirmPv !== undefined && (
        <ConfirmPromoModal open full={full} preview={confirmPv} onClose={() => setConfirmPv(undefined)} onDone={() => { setConfirmPv(undefined); void reload(); }} />
      )}
      <ConfirmDialog open={delAsk} onClose={() => setDelAsk(false)} variant="danger" title="ลบชุดโปรนี้?" confirmText="ย้ายลงถังขยะ"
        message={onShop ? "ยังมีปกโปรค้างอยู่บนร้าน — ต้องกด \"ย้อนปกเดิมเดี๋ยวนี้\" ให้ครบก่อน ถึงจะลบได้" : "ย้ายลงถังขยะ (กู้คืนได้ภายหลัง) · ไม่แตะรูปบนร้าน"}
        onConfirm={() => { setDelAsk(false); void remove(); }} />
    </div>
  );
}
