import { createServer, type Server } from 'node:net';

import type { AnsiLogger } from 'matterbridge/logger';

import { createGoEClient, GoEModbusClient } from '../src/modbus/client.js';

const mockLog = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  notice: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as AnsiLogger;

/**
 * Starts a local TCP acceptor and returns host/port plus a shutdown helper.
 *
 * @returns {Promise<{ host: string; port: number; close: () => Promise<void> }>} Listener info.
 */
async function listenLocalTcp(): Promise<{ host: string; port: number; close: () => Promise<void> }> {
  const tcpServer: Server = createServer((socket) => {
    socket.on('data', () => {
      // Ignore inbound bytes; this listener only accepts connections for close tests.
    });
  });

  await new Promise<void>((resolve, reject) => {
    tcpServer.once('error', reject);
    tcpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = tcpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected TCP listen address');
  }

  return {
    host: '127.0.0.1',
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        tcpServer.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

describe('GoEModbusClient', () => {
  it('rejects connect and closes promptly for an unreachable host', async () => {
    // Unroutable TEST-NET address: connect times out rather than hanging the process.
    const client = new GoEModbusClient({ host: '192.0.2.1', port: 502, unitId: 1 }, mockLog);

    // Shorten the library timeout so the unit test stays fast.
    const raw = (client as unknown as { client: { setTimeout(ms: number): void } }).client;
    raw.setTimeout(400);

    const connectStart = Date.now();
    await expect(client.connect()).rejects.toThrow();
    expect(Date.now() - connectStart).toBeLessThan(3_000);

    // Regression: close after a failed connect used to hang forever.
    const closeStart = Date.now();
    await client.close();
    expect(Date.now() - closeStart).toBeLessThan(1_000);
  }, 10_000);

  it('closes an open connection without hanging', async () => {
    const listener = await listenLocalTcp();
    const client = new GoEModbusClient({ host: listener.host, port: listener.port, unitId: 1 }, mockLog);

    try {
      await expect(client.connect()).resolves.toBeUndefined();
      const firstCloseStart = Date.now();
      await expect(client.close()).resolves.toBeUndefined();
      expect(Date.now() - firstCloseStart).toBeLessThan(2_000);

      // Second close on an already-closed client must not hang.
      const secondCloseStart = Date.now();
      await expect(client.close()).resolves.toBeUndefined();
      expect(Date.now() - secondCloseStart).toBeLessThan(1_000);
    } finally {
      await listener.close();
    }
  }, 10_000);

  it('createGoEClient returns a GoEModbusClient', () => {
    const client = createGoEClient({ host: '127.0.0.1', port: 502, unitId: 1 }, mockLog);
    expect(client).toBeInstanceOf(GoEModbusClient);
  });
});
