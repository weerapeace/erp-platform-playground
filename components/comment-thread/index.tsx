"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth, usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { Comment, CommentsResponse } from "@/app/api/comments/route";
import type { MentionUser } from "@/app/api/mention-search/route";

// ---- Time helper ----

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "เมื่อสักครู่";
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 86400*7) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short" });
}

// ---- Body renderer: highlight @mentions ----

function renderBody(body: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(@[A-Za-z0-9_฀-๿.]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{body.slice(last, m.index)}</span>);
    parts.push(<span key={key++} className="text-blue-600 bg-blue-50 px-1 rounded font-medium">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(<span key={key++}>{body.slice(last)}</span>);
  return parts;
}

// ============================================================
// CommentThread component
// ============================================================

export type CommentThreadProps = {
  entityType: string;
  entityId:   string;
  /** หัวข้อด้านบน */
  title?: string;
  /** สูงสุดความสูงของ list (overflow scroll) */
  maxHeight?: number;
};

export function CommentThread({ entityType, entityId, title = "💬 ความคิดเห็น", maxHeight = 400 }: CommentThreadProps) {
  const { user } = useAuth();
  const canView   = usePermission("comments.view");
  const canCreate = usePermission("comments.create");
  const canEdit   = usePermission("comments.edit");

  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [draft, setDraft]   = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- Mention autocomplete ----
  const [mentionOpen, setMentionOpen]       = useState(false);
  const [mentionQuery, setMentionQuery]     = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionIdx, setMentionIdx]         = useState(0);

  // ---- Fetch ----
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
      const json: CommentsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [entityType, entityId, canView]);
  useEffect(() => { load(); }, [load]);

  // ---- Mention search ----
  useEffect(() => {
    if (!mentionOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/mention-search?q=${encodeURIComponent(mentionQuery)}`);
        const json = await res.json();
        if (!cancelled) { setMentionResults(json.data ?? []); setMentionIdx(0); }
      } catch { /* silent */ }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mentionQuery, mentionOpen]);

  // ---- Handle textarea input — detect @ ----
  const onDraftChange = (val: string) => {
    setDraft(val);
    // หา @ ล่าสุดก่อน cursor
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = before.match(/@([A-Za-z0-9_฀-๿.]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionQuery(m[1]);
    } else {
      setMentionOpen(false);
    }
  };

  // เลือก mention
  const pickMention = (u: MentionUser) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after  = draft.slice(cursor);
    const replaced = before.replace(/@([A-Za-z0-9_฀-๿.]*)$/, `@${u.display_name ?? u.email.split("@")[0]} `);
    setDraft(replaced + after);
    setMentionOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ---- Submit ----
  const submit = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await apiFetch("/api/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType, entity_id: entityId,
          body: draft, actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDraft("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "โพสไม่สำเร็จ"); }
    finally { setPosting(false); }
  };

  // ---- Edit / delete ----
  const startEdit = (c: Comment) => { setEditingId(c.id); setEditDraft(c.body); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };
  const saveEdit = async () => {
    if (!editingId || !editDraft.trim()) return;
    try {
      const res = await apiFetch("/api/comments", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, body: editDraft, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      cancelEdit();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };
  const remove = async (c: Comment) => {
    if (!confirm("ลบ comment นี้?")) return;
    try {
      const res = await apiFetch(`/api/comments?id=${c.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
  };

  // keyboard nav ใน mention dropdown
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => Math.min(mentionResults.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (mentionResults[mentionIdx]) pickMention(mentionResults[mentionIdx]);
        return;
      }
      if (e.key === "Escape") { setMentionOpen(false); return; }
    }
    // Submit ด้วย Cmd/Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const sorted = useMemo(() => items, [items]);

  if (!canView) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          {title} <span className="text-xs font-normal text-slate-400">({items.filter(c => !c.deleted_at).length})</span>
        </h3>
      </div>

      {error && <div className="m-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">⚠ {error}</div>}

      {/* List */}
      <div className="overflow-y-auto px-3 py-2" style={{ maxHeight }}>
        {loading ? (
          <div className="space-y-2">{[0,1].map(i => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">ยังไม่มี comment — เป็นคนแรก!</div>
        ) : (
          <ul className="space-y-2">
            {sorted.map(c => {
              const isMe = c.user_id === user?.id;
              const isEditing = editingId === c.id;
              const isDeleted = !!c.deleted_at;
              return (
                <li key={c.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(c.user_name ?? c.user_email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className={`flex-1 min-w-0 ${isDeleted ? "opacity-50 italic" : ""}`}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">{c.user_name ?? c.user_email}</span>
                      <span className="text-[10px] text-slate-400" title={c.created_at}>{relTime(c.created_at)}</span>
                      {c.edited && <span className="text-[10px] text-slate-400">(แก้แล้ว)</span>}
                      {isMe && !isDeleted && canEdit && !isEditing && (
                        <>
                          <button onClick={() => startEdit(c)} className="text-[10px] text-slate-400 hover:text-blue-600">แก้</button>
                          <button onClick={() => remove(c)}   className="text-[10px] text-slate-400 hover:text-red-600">ลบ</button>
                        </>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-1">
                        <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={2}
                          className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <div className="flex gap-1.5 mt-1">
                          <button onClick={saveEdit} className="h-6 px-3 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">บันทึก</button>
                          <button onClick={cancelEdit} className="h-6 px-3 text-xs text-slate-500 hover:bg-slate-50 rounded">ยกเลิก</button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{renderBody(c.body)}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      {canCreate && user && (
        <div className="border-t border-slate-100 p-3 relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="เขียน comment... (พิมพ์ @ เพื่อ mention, ⌘/Ctrl+Enter เพื่อส่ง)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={submit} disabled={!draft.trim() || posting}
              className="h-8 px-4 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {posting ? "..." : "ส่ง"}
            </button>
            <span className="text-[10px] text-slate-400">⌘/Ctrl+Enter</span>
          </div>

          {/* Mention dropdown */}
          {mentionOpen && mentionResults.length > 0 && (
            <div className="absolute left-3 right-3 -top-2 transform -translate-y-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-20 max-h-56 overflow-y-auto">
              {mentionResults.map((u, i) => (
                <button key={u.id} onMouseDown={e => { e.preventDefault(); pickMention(u); }}
                  onMouseEnter={() => setMentionIdx(i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm transition-colors ${
                    i === mentionIdx ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}>
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                    {(u.display_name ?? u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-800 truncate">{u.display_name ?? u.email}</div>
                    <div className="text-[10px] text-slate-400 truncate">{u.email} · {u.role}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
