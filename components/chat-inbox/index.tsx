"use client";
/**
 * ห้องแชทรวม (หน้า /chat) — 3 ช่อง: รายการห้อง · ข้อความ + กล่องตอบ · ข้อมูลลูกค้า
 *   มือถือ: ทีละช่อง (รายการ → ห้อง · ข้อมูลลูกค้าเปิดทับ) · จอกลาง: ข้อมูลลูกค้าเปิดทับ · จอใหญ่ (xl): 3 ช่องพร้อมกัน
 *   ?brand=<id> = เฉพาะแบรนด์ (ลิงก์จากหน้าแบรนด์) · ?c=<id> = เปิดห้องนั้น (ลิงก์จากกระดิ่ง/ศูนย์แจ้งเตือน)
 *   โหลดใหม่เอง: รายการทุก 20 วิ · ห้องที่เปิดทุก 10 วิ (เฉพาะตอนหน้าเปิดอยู่)
 * ของกลาง: BrandFilterChip/useBrandParam · ERPSelect · ERPInput · ToggleSwitch · state-views · useAuth · lib/chat/*
 * คู่มือ: docs/chat-inbox.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ERPInput, ERPSelect } from "@/components/form";
import { ToggleSwitch } from "@/components/toggle-switch";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { BrandFilterChip, useBrandParam } from "@/components/brand-hub/brand-filter";
import type { BrandSelectOption } from "@/components/brand-select";
import { CHAT_CHANNEL_INFO, quickRepliesFor } from "@/lib/chat/rules";
import { CHAT_CHANNELS, type ChatConversation, type ChatMessage, type ChatSettings } from "@/lib/chat/types";
import { ConversationList } from "./conversation-list";
import { ChatThread } from "./thread";
import { CustomerPanel } from "./customer-panel";
import { ChatSettingsModal } from "./settings-modal";
import type { ChatDetail } from "./shared";

const LIST_POLL_MS = 20_000;
const DETAIL_POLL_MS = 10_000;

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

/** เรียกซ้ำทุก ms ตอนหน้าเปิดอยู่ + เรียกทันทีเมื่อกลับมาที่แท็บ */
function usePoll(fn: () => void, ms: number, on: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => { if (visible()) ref.current(); }, ms);
    const onVis = () => { if (visible()) ref.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [ms, on]);
}

export function ChatInbox() {
  const { can, permsReady } = useAuth();
  const canReply = can("chat.reply");
  const canAssign = can("chat.assign");
  const canSettings = can("chat.settings");

  const [brandId, clearBrand] = useBrandParam();
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const [unanswered, setUnanswered] = useState(false);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const [rows, setRows] = useState<ChatConversation[] | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // ?c=<id> จากกระดิ่ง/ศูนย์แจ้งเตือน → เปิดห้องนั้น (อ่านครั้งเดียวหลังโหลดหน้า)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get("c"); if (c) setSelectedId(c);
      if (sp.get("unanswered") === "1") setUnanswered(true);   // ลิงก์ "เปิดหน้าแชท" จากศูนย์แจ้งเตือน
    } catch { /* ไม่มีก็ไม่เป็นไร */ }
  }, []);

  useEffect(() => {
    apiFetch("/api/brands").then((r) => r.json())
      .then((j: { data?: { id: string; name: string; is_customer_job?: boolean | null }[] }) =>
        setBrands((j.data ?? []).filter((b) => !b.is_customer_job).map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => { /* ไม่มีชื่อแบรนด์ก็ยังใช้ได้ */ });
    apiFetch("/api/chat/settings").then((r) => r.json())
      .then((j: { settings?: ChatSettings }) => { if (j.settings) setSettings(j.settings); })
      .catch(() => { /* ไม่มีข้อความสำเร็จรูปก็ยังตอบได้ */ });
  }, []);

  const listUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (channel) p.set("channel", channel);
    if (brandId) p.set("brand", brandId);
    if (status !== "open") p.set("status", status);
    if (unanswered) p.set("unanswered", "1");
    if (mine) p.set("mine", "1");
    if (qDebounced) p.set("q", qDebounced);
    return `/api/chat/conversations?${p.toString()}`;
  }, [channel, brandId, status, unanswered, mine, qDebounced]);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setListLoading(true);
    try {
      const r = await apiFetch(listUrl);
      const j = (await r.json()) as { data?: ChatConversation[]; waiting?: number; error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRows(j.data ?? []); setWaiting(j.waiting ?? 0); setListError(null);
    } catch (e) { setListError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { if (!quiet) setListLoading(false); }
  }, [listUrl]);

  useEffect(() => { if (permsReady && can("chat.view")) void loadList(); }, [loadList, permsReady, can]);
  usePoll(() => void loadList(true), LIST_POLL_MS, permsReady && can("chat.view"));

  const markRead = useCallback((id: string) => {
    void apiFetch(`/api/chat/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read" }) })
      .then(() => setRows((rs) => rs?.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)) ?? rs))
      .catch(() => { /* อ่านแล้วไม่สำเร็จก็ไม่เป็นไร */ });
  }, []);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) { setDetail((d) => (d?.conversation.id === id ? d : null)); setDetailError(null); }
    try {
      const r = await apiFetch(`/api/chat/conversations/${id}`);
      const j = (await r.json()) as ChatDetail & { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setDetail((prev) => {
        // โหลดเงียบ ๆ ระหว่างเปิดห้อง: เก็บข้อความเก่าที่กด "ดูก่อนหน้า" ไว้ด้วย
        if (quiet && prev?.conversation.id === id && prev.messages.length > j.messages.length) {
          const known = new Set(j.messages.map((m) => m.id));
          return { ...j, has_more: prev.has_more, messages: [...prev.messages.filter((m) => !known.has(m.id) && m.sent_at < (j.messages[0]?.sent_at ?? "")), ...j.messages] };
        }
        return j;
      });
      if (j.conversation.unread_count > 0) markRead(id);
    } catch (e) { if (!quiet) setDetailError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [markRead]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("c", selectedId);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* ไม่เป็นไร */ }
  }, [selectedId, loadDetail]);
  usePoll(() => { if (selectedId) void loadDetail(selectedId, true); }, DETAIL_POLL_MS, !!selectedId);

  const loadOlder = async () => {
    if (!detail || !detail.messages.length) return;
    setLoadingOlder(true);
    try {
      const r = await apiFetch(`/api/chat/conversations/${detail.conversation.id}?before=${encodeURIComponent(detail.messages[0].sent_at)}`);
      const j = (await r.json()) as { messages?: ChatMessage[]; has_more?: boolean };
      if (j.messages) setDetail((d) => (d ? { ...d, messages: [...j.messages!, ...d.messages], has_more: !!j.has_more } : d));
    } finally { setLoadingOlder(false); }
  };

  const onSent = (m: ChatMessage | null) => {
    if (m) setDetail((d) => (d ? { ...d, messages: d.messages.some((x) => x.id === m.id) ? d.messages : [...d.messages, m] } : d));
    if (selectedId) void loadDetail(selectedId, true);
    void loadList(true);
  };

  const onChanged = () => { if (selectedId) void loadDetail(selectedId, true); void loadList(true); };

  const back = () => {
    setSelectedId(null); setPanelOpen(false);
    try { const u = new URL(window.location.href); u.searchParams.delete("c"); window.history.replaceState(window.history.state, "", u.toString()); } catch { /* ไม่เป็นไร */ }
  };

  const quickReplies = useMemo(() => quickRepliesFor(settings?.quick_replies ?? [], detail?.conversation.brand_id ?? null), [settings, detail?.conversation.brand_id]);

  const emptyHint = unanswered ? "ไม่มีห้องที่ยังไม่ตอบ เยี่ยมมาก" : qDebounced ? "ไม่พบห้องที่ตรงกับคำค้น ลองคำอื่น" :
    "ยังไม่มีแชทเข้ามา — ต่อ LINE OA ของร้านที่ปุ่มตั้งค่า (เฟือง) แล้วชี้ webhook มาที่ ERP";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[520px] md:h-[100dvh]">
      {/* ── ซ้าย: รายการห้อง ── */}
      <aside className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 bg-white md:w-80 md:shrink-0`}>
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-lg font-semibold text-slate-800"><Icon name="chat" /> แชทลูกค้า</h1>
            {waiting > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">ยังไม่ตอบ {waiting}</span>}
            <button type="button" onClick={() => void loadList()} title="โหลดใหม่" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><Icon value="i:refresh" /></button>
            {canSettings && <button type="button" onClick={() => setSettingsOpen(true)} title="ตั้งค่าห้องแชท" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><Icon value="i:settings" /></button>}
          </div>
          <BrandFilterChip brandId={brandId} brands={brands} onClear={clearBrand} />
          <ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อลูกค้า / ข้อความ…" />
          <div className="grid grid-cols-2 gap-2">
            <ERPSelect value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="ทุกช่องทาง"
              options={[{ value: "", label: "ทุกช่องทาง" }, ...CHAT_CHANNELS.map((c) => ({ value: c, label: CHAT_CHANNEL_INFO[c].label }))]} />
            <ERPSelect value={status} onChange={(e) => setStatus(e.target.value as "open" | "done" | "all")}
              options={[{ value: "open", label: "ยังเปิดอยู่" }, { value: "done", label: "จบแล้ว" }, { value: "all", label: "ทั้งหมด" }]} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <ToggleSwitch on={unanswered} onChange={setUnanswered} label="ยังไม่ตอบเท่านั้น" size="sm" />
            <ToggleSwitch on={mine} onChange={setMine} label="ของฉัน" size="sm" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList rows={rows} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setPanelOpen(false); }}
            loading={listLoading} error={listError} onRetry={() => void loadList()} emptyHint={emptyHint} />
        </div>
      </aside>

      {/* ── กลาง: ข้อความ ── */}
      <main className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-slate-50`}>
        {!selectedId ? (
          <EmptyState icon={<Icon name="chat" />} title="เลือกห้องแชททางซ้าย" hint="ห้องที่ลูกค้ายังรอคำตอบมีป้ายสีเหลือง" className="m-auto" />
        ) : detailError && !detail ? (
          <ErrorState title="เปิดห้องนี้ไม่ได้" hint={detailError} onRetry={() => void loadDetail(selectedId)} className="m-auto" />
        ) : !detail ? (
          <LoadingState label="กำลังเปิดห้อง…" className="m-auto" />
        ) : (
          <ChatThread detail={detail} quickReplies={quickReplies} canReply={canReply} onBack={back}
            onTogglePanel={() => setPanelOpen((v) => !v)} onLoadOlder={() => void loadOlder()} loadingOlder={loadingOlder} onSent={onSent} />
        )}
      </main>

      {/* ── ขวา: ข้อมูลลูกค้า (xl = ตลอด · เล็กกว่านั้น = เปิดทับ) ── */}
      {detail && selectedId && (
        <>
          <aside className="hidden w-72 shrink-0 border-l border-slate-200 xl:block">
            <CustomerPanel detail={detail} canAssign={canAssign} onChanged={onChanged} />
          </aside>
          {panelOpen && (
            <div className="fixed inset-0 z-40 flex justify-end bg-black/30 xl:hidden" onClick={() => setPanelOpen(false)}>
              <div className="h-full w-[min(20rem,90vw)] shadow-xl" onClick={(e) => e.stopPropagation()}>
                <CustomerPanel detail={detail} canAssign={canAssign} onChanged={onChanged} onClose={() => setPanelOpen(false)} />
              </div>
            </div>
          )}
        </>
      )}

      {settingsOpen && (
        <ChatSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} brands={brands} onSaved={(s) => setSettings(s)} />
      )}
    </div>
  );
}
