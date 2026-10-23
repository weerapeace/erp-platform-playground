/**
 * 💬 Discord (ของกลาง · ฝั่งเซิร์ฟเวอร์เท่านั้น — ห้าม import จากหน้าจอ)
 * บอทส่งข้อความ/รูป/ปุ่ม · ตรวจลายเซ็นตอนมีคนกดปุ่ม (Interactions) · ผูกบัญชีด้วย Discord OAuth (scope identify)
 * env (ตั้งใน Vercel): DISCORD_APPLICATION_ID · DISCORD_PUBLIC_KEY · DISCORD_BOT_TOKEN · DISCORD_CLIENT_SECRET
 * คู่มือตั้งบอท: docs/discord-setup.md
 */
import crypto from "node:crypto";

const API = "https://discord.com/api/v10";

export function discordEnv() {
  return {
    appId: (process.env.DISCORD_APPLICATION_ID ?? "").trim(),
    publicKey: (process.env.DISCORD_PUBLIC_KEY ?? "").trim(),
    botToken: (process.env.DISCORD_BOT_TOKEN ?? "").trim(),
    clientSecret: (process.env.DISCORD_CLIENT_SECRET ?? "").trim(),
  };
}

/** ตั้งอะไรครบแล้วบ้าง — bot = ส่งข้อความได้ · buttons = ปุ่มติ๊กใช้ได้ · link = ผูกบัญชีได้ */
export function discordReady() {
  const e = discordEnv();
  return { bot: !!(e.appId && e.botToken), buttons: !!(e.appId && e.botToken && e.publicKey), link: !!(e.appId && e.clientSecret) };
}

/** ลิงก์เชิญบอทเข้าเซิร์ฟเวอร์ — สิทธิ์: ดูห้อง · ส่งข้อความ · แนบลิงก์/การ์ด · แนบไฟล์ · แท็กบทบาท */
export function discordInviteUrl(): string | null {
  const { appId } = discordEnv();
  const perms = 1024 + 2048 + 16384 + 32768 + 131072;   // VIEW_CHANNEL · SEND_MESSAGES · EMBED_LINKS · ATTACH_FILES · MENTION_EVERYONE
  return appId ? `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot&permissions=${perms}` : null;
}

export class DiscordError extends Error {
  constructor(public status: number, message: string, public code?: number) { super(message); }
}

/** ข้อความผิดพลาดภาษาคน (ไม่โชว์ error ดิบ) */
function discordErrorText(status: number, code: number | undefined): string {
  if (code === 50007) return "ส่ง DM ไม่ได้ — ผู้รับปิดรับข้อความจากสมาชิกเซิร์ฟเวอร์ หรือไม่ได้อยู่เซิร์ฟเวอร์เดียวกับบอท";
  if (code === 50013 || status === 403) return "บอทไม่มีสิทธิ์ในห้องนี้ — ให้สิทธิ์ View Channel · Send Messages · Embed Links · Attach Files";
  if (code === 10003 || status === 404) return "ไม่พบห้อง Discord (ห้องถูกลบ หรือบอทไม่ได้อยู่ในเซิร์ฟเวอร์นั้น)";
  if (status === 401) return "โทเคนบอท Discord ไม่ถูกต้อง (DISCORD_BOT_TOKEN)";
  if (status === 429) return "Discord ให้รอสักครู่ (ส่งถี่เกิน)";
  return `Discord ตอบกลับผิดพลาด (${status}${code ? ` · ${code}` : ""})`;
}

type ApiInit = { method?: string; json?: unknown; form?: () => FormData; auth?: "bot" | "none" };

export async function discordApi<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { botToken } = discordEnv();
  const useBot = init.auth !== "none";
  if (useBot && !botToken) throw new DiscordError(0, "ยังไม่ได้ตั้งบอท Discord (DISCORD_BOT_TOKEN)");
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: init.method ?? (init.json !== undefined || init.form ? "POST" : "GET"),
      headers: { ...(useBot ? { Authorization: `Bot ${botToken}` } : {}), ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.form ? init.form() : init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    if (res.status === 429) {   // ส่งถี่เกิน → รอตามที่ Discord บอกแล้วลองใหม่
      const j = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(250, (j.retry_after ?? 1) * 1000))));
      continue;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { code?: number };
      throw new DiscordError(res.status, discordErrorText(res.status, j.code), j.code);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }
  throw new DiscordError(429, discordErrorText(429, undefined));
}

export type DiscordFile = { name: string; data: Buffer; type: string };
export type DiscordMessage = Record<string, unknown>;

/** ส่งข้อความเข้าห้อง (แนบไฟล์ได้) → { id } */
export async function discordSend(channelId: string, payload: DiscordMessage, files: DiscordFile[] = []): Promise<{ id: string }> {
  if (!files.length) return discordApi(`/channels/${channelId}/messages`, { json: payload });
  return discordApi(`/channels/${channelId}/messages`, {
    form: () => {
      const fd = new FormData();
      fd.append("payload_json", JSON.stringify({ ...payload, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
      files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([new Uint8Array(f.data)], { type: f.type }), f.name));
      return fd;
    },
  });
}

/** ห้อง DM ของบอทกับผู้ใช้ (ส่งทดสอบถึงตัวเอง) */
export async function discordDmChannel(discordUserId: string): Promise<string> {
  const ch = await discordApi<{ id: string }>("/users/@me/channels", { json: { recipient_id: discordUserId } });
  return ch.id;
}

/** ห้องข้อความ + บทบาท ของทุกเซิร์ฟเวอร์ที่บอทอยู่ (ให้เลือกในหน้าตั้งค่า) */
export async function discordGuildOptions() {
  const guilds = await discordApi<{ id: string; name: string }[]>("/users/@me/guilds");
  const out: { channels: { id: string; name: string; guild: string }[]; roles: { id: string; name: string; guild: string }[] } = { channels: [], roles: [] };
  for (const g of guilds.slice(0, 10)) {
    const [chs, roles] = await Promise.all([
      discordApi<{ id: string; name: string; type: number; position: number }[]>(`/guilds/${g.id}/channels`),
      discordApi<{ id: string; name: string; position: number; managed: boolean }[]>(`/guilds/${g.id}/roles`),
    ]);
    for (const c of chs.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position)) out.channels.push({ id: c.id, name: c.name, guild: g.name });
    for (const r of roles.filter((r) => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position)) out.roles.push({ id: r.id, name: r.name, guild: g.name });
  }
  return out;
}

// ---- ปุ่มที่กดใน Discord (Interactions) ----

/** ตรวจลายเซ็น Ed25519 ที่ Discord แนบมา — ไม่ผ่าน = ไม่ใช่ Discord จริง */
export function discordVerify(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const { publicKey } = discordEnv();
  if (!publicKey || !signature || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKey) || !/^[0-9a-f]+$/i.test(signature)) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch { return false; }
}

/** ตอบเพิ่มเติมหลังรับปุ่มแล้ว (ข้อความเห็นคนเดียว = ephemeral) */
export function discordFollowup(token: string, payload: DiscordMessage) {
  return discordApi(`/webhooks/${discordEnv().appId}/${token}`, { json: payload, auth: "none" });
}
/** แก้ข้อความที่มีปุ่มนั้น (หลังติ๊ก) */
export function discordEditOriginal(token: string, payload: DiscordMessage) {
  return discordApi(`/webhooks/${discordEnv().appId}/${token}/messages/@original`, { method: "PATCH", json: payload, auth: "none" });
}

// ---- ผูกบัญชี (OAuth2 · scope identify) ----

const b64url = (b: Buffer) => b.toString("base64url");
/** state กันปลอม: ใครเริ่มผูก (ผู้ใช้ ERP) + หมดอายุ 15 นาที · เซ็นด้วย client secret */
export function discordSignState(userId: string): string {
  const body = b64url(Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 15 * 60_000, n: crypto.randomBytes(8).toString("hex") })));
  const sig = b64url(crypto.createHmac("sha256", discordEnv().clientSecret).update(body).digest());
  return `${body}.${sig}`;
}
export function discordReadState(state: string | null): string | null {
  const [body, sig] = (state ?? "").split(".");
  const { clientSecret } = discordEnv();
  if (!body || !sig || !clientSecret) return null;
  const want = b64url(crypto.createHmac("sha256", clientSecret).update(body).digest());
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { u?: string; e?: number };
    return p.u && p.e && p.e > Date.now() ? p.u : null;
  } catch { return null; }
}
export function discordAuthorizeUrl(state: string, redirectUri: string): string {
  const q = new URLSearchParams({ client_id: discordEnv().appId, response_type: "code", scope: "identify", redirect_uri: redirectUri, state, prompt: "consent" });
  return `https://discord.com/oauth2/authorize?${q}`;
}
/** แลก code → ข้อมูลผู้ใช้ Discord ที่กดยืนยัน */
export async function discordUserFromCode(code: string, redirectUri: string): Promise<{ id: string; username: string }> {
  const { appId, clientSecret } = discordEnv();
  const tok = await fetch(`${API}/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  }).then((r) => r.json()) as { access_token?: string };
  if (!tok.access_token) throw new DiscordError(400, "ยืนยันกับ Discord ไม่สำเร็จ ลองกดผูกบัญชีใหม่");
  const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()) as { id?: string; username?: string; global_name?: string | null };
  if (!me.id) throw new DiscordError(400, "อ่านข้อมูลบัญชี Discord ไม่ได้");
  return { id: me.id, username: me.global_name || me.username || me.id };
}
