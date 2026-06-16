// ============================================================
// ERP Collab Worker — realtime กระดานแคมเปญ (Excalidraw) แบบหลายคนพร้อมกัน
// 1 board (entityId) = 1 Durable Object "ห้อง" · WebSocket relay (broadcast)
// ไคลเอนต์ต่อ: wss://erp-collab.<subdomain>.workers.dev/room/<entityId>
//
// ใช้ Hibernatable WebSockets (state.acceptWebSocket) — ประหยัด, ห้องอยู่ได้นาน
// ข้อความเป็น JSON ดิบ (relay ไปทุกคนในห้อง ยกเว้นคนส่ง) — ฝั่งแอปกำหนด schema เอง
// ============================================================

export interface Env {
  ROOMS: DurableObjectNamespace;
}

export class CanvasRoom {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernatable: ผูก WS กับ DO (อยู่รอดแม้ DO sleep ระหว่างไม่มีข้อความ)
    this.state.acceptWebSocket(server);

    // แจ้งจำนวนคนในห้องให้คนที่เพิ่งเข้า
    server.send(JSON.stringify({ t: "hello", peers: this.peerCount() }));
    this.broadcast(JSON.stringify({ t: "presence", peers: this.peerCount() }), server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // relay ทุกข้อความไปให้คนอื่นในห้อง (ยกเว้นคนส่ง)
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const data = typeof message === "string" ? message : new TextDecoder().decode(message);
    this.broadcast(data, ws);
  }

  webSocketClose(ws: WebSocket): void {
    try { ws.close(); } catch { /* noop */ }
    this.broadcast(JSON.stringify({ t: "presence", peers: this.peerCount() }), ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcast(JSON.stringify({ t: "presence", peers: this.peerCount() }), ws);
  }

  private peerCount(): number {
    return this.state.getWebSockets().length;
  }

  private broadcast(data: string, except?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* ปิดไปแล้ว */ }
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("erp-collab ok", { status: 200, headers: { "content-type": "text/plain" } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/);
    if (!m) return new Response("not found", { status: 404 });
    const id = env.ROOMS.idFromName(m[1]);
    const stub = env.ROOMS.get(id);
    return stub.fetch(req);
  },
};
