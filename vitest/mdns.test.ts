type ServiceUpHandler = (service: { name: string; host?: string; addresses?: string[]; txt?: { serial?: string; friendly_name?: string } }) => void;

const mdnsMocks = vi.hoisted(() => {
  const listeners = new Map<string, ServiceUpHandler[]>();
  const browser = {
    on: vi.fn((event: string, handler: ServiceUpHandler) => {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      return browser;
    }),
    emit: (event: string, service: Parameters<ServiceUpHandler>[0]): void => {
      for (const handler of listeners.get(event) ?? []) {
        handler(service);
      }
    },
    stop: vi.fn(),
    reset: (): void => {
      listeners.clear();
    },
  };
  return {
    browser,
    destroy: vi.fn(),
  };
});

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    find(): typeof mdnsMocks.browser {
      return mdnsMocks.browser;
    }
    destroy(): void {
      mdnsMocks.destroy();
    }
  },
}));

const { discoverGoEChargers } = await import('../src/discovery/mdns.js');

describe('discoverGoEChargers', () => {
  beforeEach(() => {
    mdnsMocks.browser.reset();
    mdnsMocks.browser.on.mockClear();
    mdnsMocks.browser.stop.mockClear();
    mdnsMocks.destroy.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should collect unique chargers from mDNS up events', async () => {
    const discovery = discoverGoEChargers();

    mdnsMocks.browser.emit('up', {
      name: 'go-e-1',
      host: 'goe.local',
      addresses: ['fe80::1', '192.168.1.50'],
      txt: { serial: '206540', friendly_name: 'Garage' },
    });
    mdnsMocks.browser.emit('up', {
      name: 'go-e-2',
      host: '10.0.0.9',
    });
    mdnsMocks.browser.emit('up', {
      name: 'ignored',
      host: '',
      addresses: [],
    });

    await vi.advanceTimersByTimeAsync(5000);
    const chargers = await discovery;

    expect(mdnsMocks.browser.stop).toHaveBeenCalled();
    expect(mdnsMocks.destroy).toHaveBeenCalled();
    expect(chargers).toEqual([
      { host: '192.168.1.50', port: 502, unitId: 1, name: 'Garage', serial: '206540' },
      { host: '10.0.0.9', port: 502, unitId: 1, name: 'go-e-2', serial: 'go-e-2' },
    ]);
  });
});
