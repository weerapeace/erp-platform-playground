"use client";

// ============================================================
// useCanvasRealtime — ชั้น realtime ของกระดาน (แยกจาก index.tsx)
//
// แชร์สดหลายคนผ่าน Supabase Broadcast (เบราว์เซอร์↔Supabase ตรงๆ ไม่ผ่าน Cloudflare worker → ไม่กิน CPU)
// ห้องเป็น private channel: เฉพาะผู้ใช้ที่ล็อกอิน (RLS realtime.messages policy canvas:* / authenticated)
//
// ส่ง: เฉพาะ "ชิ้นที่ version เปลี่ยน" (delta, throttle ~200ms, cap ~200KB)
// รับ: merge by version ต่อ id (รองรับลบด้วย isDeleted) + กัน loop ด้วย sceneSig/lastVer
// persist จริงยังเป็นหน้าที่ของ doSave ในไฟล์หลัก — hook นี้เป็นแค่ชั้นโชว์สด
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, useMemo, type MutableRefObject } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { sceneSig, userColor, BROADCAST_MS, BC_MAX_BYTES } from "./utils";

/** คนที่อยู่ในห้องพร้อมเรา (คนอื่น ไม่รวมตัวเอง) */
export type CanvasPeer = { id: string; name: string; avatar: string | null; color: string; editing: boolean };

export function useCanvasRealtime({
  collab, editable, ready, entityType, entityId, apiRef, selfId = "", selfName = "", selfAvatar = null,
}: {
  collab: boolean;
  editable: boolean;
  ready: boolean;                       // กระดานโหลดเสร็จแล้วหรือยัง (scene !== "loading")
  entityType: string;
  entityId: string;
  apiRef: MutableRefObject<any>;        // Excalidraw API ของไฟล์หลัก
  selfId?: string;                      // ตัวตนของเรา (โชว์ว่าใครออนไลน์) — id/ชื่อ/avatar
  selfName?: string;
  selfAvatar?: string | null;
}) {
  const [basePeers, setBasePeers] = useState<Omit<CanvasPeer, "editing">[]>([]); // คนอื่นในห้อง (จาก presence)
  const editingRef = useRef<Map<string, number>>(new Map());  // userId → เวลาแก้ล่าสุด (โชว์ "กำลังแก้")
  const [editTick, setEditTick] = useState(0);                // bump เพื่อ recompute สถานะกำลังแก้ (หมดอายุ)
  const selfRef = useRef({ id: selfId, name: selfName, avatar: selfAvatar });
  selfRef.current = { id: selfId, name: selfName, avatar: selfAvatar };
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const applyingRemoteRef = useRef(false);   // กันส่งซ้ำตอนเอาของคนอื่นมาวาง
  const bcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>("");     // ลายเซ็นกระดานล่าสุดที่ส่ง/รับ — กัน loop ส่งวนไม่จบ
  const lastVerRef = useRef<Map<string, number>>(new Map()); // version ล่าสุดต่อ element ที่ส่ง/รับ — ส่งเฉพาะที่เปลี่ยน (delta)

  // รวมชื่อ/สีคน (จาก presence) + สถานะ "กำลังแก้" (จาก broadcast ล่าสุด ~3.5วิ)
  const peerList = useMemo<CanvasPeer[]>(() => {
    const now = Date.now();
    void editTick; // dep เพื่อ recompute เมื่อมีคนแก้/หมดเวลา
    return basePeers.map((p) => ({ ...p, editing: now - (editingRef.current.get(p.id) ?? 0) < 3500 }));
  }, [basePeers, editTick]);

  // ส่งเฉพาะ "ชิ้นที่เปลี่ยน" (delta) ให้คนอื่นในห้อง (throttle ~200ms)
  const broadcast = useCallback(() => {
    if (!collab) return;
    if (bcTimerRef.current) return; // มีคิวส่งอยู่แล้ว
    bcTimerRef.current = setTimeout(() => {
      bcTimerRef.current = null;
      const a = apiRef.current; const ch = channelRef.current;
      if (!a || !ch) return;
      const els = a.getSceneElementsIncludingDeleted() as any[];
      const sig = sceneSig(els);
      if (sig === lastSigRef.current) return; // ไม่เปลี่ยนจากที่ส่ง/รับล่าสุด → ไม่ส่ง (กัน loop)
      lastSigRef.current = sig;
      const changed = els.filter((e) => (e.version ?? 0) > (lastVerRef.current.get(e.id) ?? -1)); // เฉพาะที่เปลี่ยน
      if (!changed.length) return;
      for (const e of changed) lastVerRef.current.set(e.id, e.version ?? 0);
      const payload = { els: changed, by: selfRef.current.id }; // แนบ id คนส่ง → ฝั่งรับโชว์ "กำลังแก้"
      try {
        if (JSON.stringify(payload).length > BC_MAX_BYTES) return; // ใหญ่ไป → ข้าม (save+refresh จะ sync)
        void ch.send({ type: "broadcast", event: "scene", payload });
      } catch { /* noop */ }
    }, BROADCAST_MS);
  }, [collab, apiRef]);

  // ส่งรูป (ลิงก์ R2) ให้คนอื่นเรนเดอร์ได้ — เรียกหลังย้ายรูปขึ้น R2 เสร็จ
  const broadcastFiles = useCallback((files: any[]) => {
    try { channelRef.current?.send({ type: "broadcast", event: "files", payload: { files } }); } catch { /* noop */ }
  }, []);

  // เอาของคนอื่นมา merge (เลือกตัว version ใหม่กว่าต่อ id — รองรับลบด้วย isDeleted)
  const applyRemote = useCallback((remoteEls: any[]) => {
    const api = apiRef.current; if (!api || !Array.isArray(remoteEls)) return;
    const local = api.getSceneElementsIncludingDeleted() as any[];
    const byId = new Map<string, any>(local.map((e) => [e.id, e]));
    let changed = false;
    for (const r of remoteEls) {
      if (!r?.id) continue;
      lastVerRef.current.set(r.id, Math.max(lastVerRef.current.get(r.id) ?? -1, r.version ?? 0)); // จำว่ารับแล้ว → ไม่ส่งกลับ
      const cur = byId.get(r.id);
      if (!cur) { byId.set(r.id, r); changed = true; continue; }
      if (cur.isDeleted && !r.isDeleted) continue;                                   // local ลบแล้ว → คงลบไว้ (การลบชนะ กันเด้งกลับ)
      if (r.isDeleted && !cur.isDeleted) { byId.set(r.id, r); changed = true; continue; }  // remote ลบ → ลบตาม
      if ((r.version ?? 0) > (cur.version ?? 0)) { byId.set(r.id, r); changed = true; }     // สถานะลบเท่ากัน → version ใหม่กว่า
    }
    if (!changed) return;
    const merged = [...byId.values()];
    lastSigRef.current = sceneSig(merged); // จำลายเซ็นของที่เพิ่งรับ → onChange ที่ตามมาจะไม่ส่งซ้ำ (ตัด loop)
    applyingRemoteRef.current = true;
    try { api.updateScene({ elements: merged }); }
    finally { setTimeout(() => { applyingRemoteRef.current = false; }, 0); }
  }, [apiRef]);

  // ต่อห้อง Supabase Broadcast (private channel — เฉพาะคนล็อกอิน)
  useEffect(() => {
    if (!collab || !editable || !ready) return;
    lastVerRef.current = new Map();
    const room = `canvas:${entityType}:${entityId}`;
    const myKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;
    let cancelled = false;
    void (async () => {
      // ส่ง token ของผู้ใช้ให้ realtime ก่อนเข้าห้อง private (กัน race ตอนเพิ่งโหลด session จาก localStorage)
      try { const { data } = await supabaseBrowser.auth.getSession(); const tok = data.session?.access_token; if (tok) await supabaseBrowser.realtime.setAuth(tok); } catch { /* ไม่มี token ก็ลองต่อ — ถ้าไม่ผ่านจะใช้กระดานแบบเดี่ยวได้ปกติ */ }
      if (cancelled) return;
      const ch = supabaseBrowser.channel(room, { config: { private: true, broadcast: { self: false }, presence: { key: myKey } } });
      ch
        .on("broadcast", { event: "scene" }, (msg: { payload?: { els?: any[]; by?: string } }) => {
          const by = msg?.payload?.by;   // คนที่ส่ง = คนที่เพิ่งแก้ → ติดธง "กำลังแก้" ~3.5วิ
          if (by && by !== selfRef.current.id) { editingRef.current.set(by, Date.now()); setEditTick((v) => v + 1); setTimeout(() => setEditTick((v) => v + 1), 3600); }
          applyRemote(msg?.payload?.els ?? []);
        })
        .on("broadcast", { event: "files" }, (msg: { payload?: { files?: any[] } }) => { const fs = msg?.payload?.files; if (fs?.length && apiRef.current) { try { apiRef.current.addFiles(fs); } catch { /* noop */ } } })
        .on("presence", { event: "sync" }, () => {
          // แปลง presence → รายชื่อคนอื่น (ไม่รวมตัวเอง + รวมหลายแท็บของคนเดียวเป็นคนเดียว)
          const state = ch.presenceState() as Record<string, any[]>;
          const map = new Map<string, Omit<CanvasPeer, "editing">>();
          for (const key of Object.keys(state)) {
            const meta = (state[key]?.[0] ?? {}) as { id?: string; name?: string; avatar?: string | null };
            const uid = String(meta.id ?? key);
            if (selfRef.current.id && uid === selfRef.current.id) continue;   // ข้ามตัวเอง (รวมแท็บอื่นของเรา)
            if (map.has(uid)) continue;                                        // dedupe คนเดียวหลายแท็บ
            map.set(uid, { id: uid, name: String(meta.name || "ไม่ทราบชื่อ"), avatar: meta.avatar ?? null, color: userColor(uid) });
          }
          setBasePeers([...map.values()]);
        })
        .subscribe((status) => { if (status === "SUBSCRIBED") void ch.track({ id: selfRef.current.id, name: selfRef.current.name, avatar: selfRef.current.avatar, at: Date.now() }); });
      channel = ch;
      channelRef.current = ch;
    })();
    return () => {
      cancelled = true;
      if (channel) { try { void supabaseBrowser.removeChannel(channel); } catch { /* noop */ } }
      channelRef.current = null; setBasePeers([]); editingRef.current.clear();
    };
  }, [collab, editable, ready, entityType, entityId, selfId, applyRemote, apiRef]);

  return { peerList, broadcast, broadcastFiles, applyingRemoteRef };
}
