/**
 * Minimal RFC 6455 WebSocket server
 *
 * Implements the WebSocket protocol over Node's built-in `http` + `crypto`
 * so we get real-time push without adding a third-party dependency. It
 * attaches to an existing http.Server's 'upgrade' event, performs the
 * opening handshake, parses incoming text/close/ping frames, and exposes a
 * `broadcast()` that fans JSON messages out to every connected client.
 *
 * Scope: server-to-client TEXT frames (our use case is JSON event push),
 * plus correct handling of client close and ping frames. Client→server
 * masking is handled per spec.
 */

import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Socket } from 'net';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

/** Magic GUID defined by RFC 6455 §1.3. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Opcodes (RFC 6455 §5.2). */
const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
} as const;

/**
 * A message pushed to dashboard clients. `type` is a stable event name
 * (e.g. 'job.status', 'job.progress', 'screenshot.completed').
 */
export interface RealtimeMessage {
  type: string;
  timestamp: string;
  payload: unknown;
}

/**
 * A single connected client. Wraps the raw socket together with its
 * half-parsed frame buffer so fragmented frames are reassembled correctly.
 */
interface ClientConnection {
  socket: Socket;
  /** Accumulated bytes not yet consumed by a complete frame. */
  buffer: Buffer;
  /** True once we have sent/received a close handshake. */
  closing: boolean;
}

export interface WebSocketServerOptions {
  /** URL path the server listens on (default '/ws'). */
  path?: string;
}

export class WebSocketServer {
  private server: HttpServer;
  private path: string;
  private clients: Set<ClientConnection> = new Set();
  private upgradeListener: ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | null = null;
  private messageListeners: Array<(data: string, client: ClientConnection) => void> = [];

  constructor(server: HttpServer, options: WebSocketServerOptions = {}) {
    this.server = server;
    this.path = options.path ?? '/ws';
  }

  /**
   * Register the 'upgrade' handler on the underlying http server.
   * Call this once the http server is listening.
   */
  attach(): void {
    this.upgradeListener = (req, socket, head) => this.handleUpgrade(req, socket, head);
    this.server.on('upgrade', this.upgradeListener);
    logger.info(`[WebSocket] Attached on path ${this.path}`);
  }

  /**
   * Detach from the http server and drop every client. Safe to call on a
   * server that never attached.
   */
  close(): void {
    if (this.upgradeListener) {
      this.server.removeListener('upgrade', this.upgradeListener);
      this.upgradeListener = null;
    }
    for (const client of this.clients) {
      this.closeClient(client, 1001, 'going away');
    }
    this.clients.clear();
  }

  /** Number of currently connected clients. */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Subscribe to client→server text messages (e.g. subscription requests).
   * Mostly used for tests and optional client-driven topics.
   */
  onMessage(listener: (data: string, client: ClientConnection) => void): void {
    this.messageListeners.push(listener);
  }

  /**
   * Broadcast a structured event to every connected client as a JSON
   * TEXT frame. Callers may pass a fully-formed RealtimeMessage or a
   * partial object — missing fields are filled in (timestamp defaults to
   * now, type defaults to 'message', payload defaults to the whole object).
   */
  broadcast(message: Partial<RealtimeMessage> & { type?: string; payload?: unknown }): void {
    const full: RealtimeMessage = {
      type: message.type ?? 'message',
      timestamp: message.timestamp ?? new Date().toISOString(),
      payload: message.payload ?? message,
    };
    const json = JSON.stringify(full);
    this.broadcastText(json);
  }

  /** Broadcast a raw text frame to every connected client. */
  broadcastText(text: string): void {
    const frame = encodeTextFrame(text);
    for (const client of this.clients) {
      if (client.closing) continue;
      this.writeRaw(client, frame);
    }
  }

  /**
   * Send a text frame to a single client.
   */
  send(client: ClientConnection, text: string): void {
    this.writeRaw(client, encodeTextFrame(text));
  }

  // ------------------------------------------------------------------
  // Handshake
  // ------------------------------------------------------------------

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    // Only handle our path; reject other upgrade requests with 404 + close
    // so the client fails immediately rather than hanging on an open socket.
    const reqPath = req.url ?? '';
    if (!reqPath.startsWith(this.path)) {
      try {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      } catch {
        // ignore write failures
      }
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'] as string | undefined;
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = computeAcceptKey(key);
    const responseLines = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ];
    socket.write(responseLines.join('\r\n'));

    const client: ClientConnection = { socket, buffer: Buffer.alloc(0), closing: false };
    this.clients.add(client);

    if (head && head.length > 0) {
      client.buffer = Buffer.concat([client.buffer, head]);
      this.consumeFrames(client);
    }

    socket.on('data', (chunk: Buffer) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      this.consumeFrames(client);
    });

    socket.on('error', (err) => {
      logger.debug(`[WebSocket] socket error: ${err.message}`);
    });

    socket.on('close', () => {
      this.clients.delete(client);
    });

    socket.setNoDelay(true);
    logger.debug(`[WebSocket] Client connected (${this.clients.size} total)`);
  }

  // ------------------------------------------------------------------
  // Frame parsing
  // ------------------------------------------------------------------

  /**
   * Pull as many complete frames as possible out of the client buffer.
   * Handles text frames (the common case) plus close and ping control
   * frames. Continuation/binary frames are accumulated but not surfaced
   * (we only need server-bound text).
   */
  private consumeFrames(client: ClientConnection): void {
    while (true) {
      const parsed = this.parseFrame(client.buffer);
      if (!parsed) {
        break; // need more bytes
      }
      client.buffer = client.buffer.subarray(parsed.consumed);

      switch (parsed.opcode) {
        case OPCODE.TEXT:
          for (const listener of this.messageListeners) {
            listener(parsed.payload.toString('utf8'), client);
          }
          break;
        case OPCODE.PING:
          this.writeRaw(client, encodeFrame(OPCODE.PONG, parsed.payload));
          break;
        case OPCODE.CLOSE:
          // Echo a close frame and tear down per §5.5.1.
          this.closeClient(client, 1000, 'client closed');
          break;
        case OPCODE.PONG:
          // Ignore; keepalive acknowledged.
          break;
        default:
          // Continuation / binary — not surfaced, but acknowledged by consuming.
          break;
      }

      if (client.closing) {
        break;
      }
    }
  }

  /**
   * Attempt to parse a single frame from `buf`.
   * @returns the frame payload + consumed byte count, or null if incomplete.
   */
  private parseFrame(buf: Buffer): { opcode: number; payload: Buffer; consumed: number } | null {
    if (buf.length < 2) {
      return null;
    }

    const b0 = buf[0];
    const b1 = buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) === 0x80;
    let payloadLen = b1 & 0x7f;

    let offset = 2;

    if (payloadLen === 126) {
      if (buf.length < offset + 2) return null;
      payloadLen = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (buf.length < offset + 8) return null;
      // Read as BigInt then downcast — frames this large are not expected
      // in practice but the protocol requires 64-bit support.
      const high = buf.readUInt32BE(offset);
      const low = buf.readUInt32BE(offset + 4);
      payloadLen = high * 2 ** 32 + low;
      offset += 8;
    }

    let maskKey: Buffer | undefined;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + payloadLen) {
      return null;
    }

    let payload = buf.subarray(offset, offset + payloadLen);
    if (masked && maskKey) {
      payload = unmask(payload, maskKey);
    }

    return { opcode, payload, consumed: offset + payloadLen };
  }

  // ------------------------------------------------------------------
  // Writing / closing
  // ------------------------------------------------------------------

  private writeRaw(client: ClientConnection, data: Buffer): void {
    if (client.socket.destroyed || client.closing) {
      return;
    }
    client.socket.write(data);
  }

  private closeClient(client: ClientConnection, code: number, reason: string): void {
    if (client.closing) {
      return;
    }
    client.closing = true;
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2, 'utf8');
    this.writeRaw(client, encodeFrame(OPCODE.CLOSE, payload));
    try {
      client.socket.end();
    } catch {
      // ignore
    }
    this.clients.delete(client);
  }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/** RFC 6455 §1.3: Sec-WebSocket-Accept = base64(SHA1(key + GUID)). */
export function computeAcceptKey(key: string): string {
  return createHash('sha1').update(key + WS_GUID).digest('base64');
}

/** XOR a masked payload with the 4-byte masking key. */
function unmask(payload: Buffer, maskKey: Buffer): Buffer {
  const out = Buffer.allocUnsafe(payload.length);
  for (let i = 0; i < payload.length; i++) {
    out[i] = payload[i] ^ maskKey[i % 4];
  }
  return out;
}

/** Encode an unmasked server→client frame for the given opcode. */
function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN=1
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
    header.writeUInt32BE(len % 2 ** 32, 6);
  }
  return Buffer.concat([header, payload]);
}

/** Encode a server→client TEXT frame (FIN=1, opcode=1, unmasked). */
function encodeTextFrame(text: string): Buffer {
  return encodeFrame(OPCODE.TEXT, Buffer.from(text, 'utf8'));
}
