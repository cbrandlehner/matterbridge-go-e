import { jest } from '@jest/globals';

type ServiceUpHandler = (service: { name: string; host?: string; addresses?: string[]; txt?: { serial?: string; friendly_name?: string } }) => void;

const listeners = new Map<string, ServiceUpHandler[]>();

const browser = {
  on: jest.fn((event: string, handler: ServiceUpHandler) => {
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
  stop: jest.fn(),
};

const destroy = jest.fn();

jest.unstable_mockModule('bonjour-service', () => ({
  Bonjour: class {
    find(): typeof browser {
      return browser;
    }
    destroy(): void {
      destroy();
    }
  },
}));

const { discoverGoEChargers } = await import('../src/discovery/mdns.js');

describe('discoverGoEChargers', () => {
  beforeEach(() => {
    listeners.clear();
    browser.on.mockClear();
    browser.stop.mockClear();
    destroy.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should collect unique chargers from mDNS up events', async () => {
    const discovery = discoverGoEChargers();

    browser.emit('up', {
      name: 'go-e-1',
      host: 'goe.local',
      addresses: ['fe80::1', '192.168.1.50'],
      txt: { serial: '206540', friendly_name: 'Garage' },
    });
    browser.emit('up', {
      name: 'go-e-2',
      host: '10.0.0.9',
    });
    browser.emit('up', {
      name: 'ignored',
      host: '',
      addresses: [],
    });

    await jest.advanceTimersByTimeAsync(5000);
    const chargers = await discovery;

    expect(browser.stop).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(chargers).toEqual([
      { host: '192.168.1.50', port: 502, unitId: 1, name: 'Garage', serial: '206540' },
      { host: '10.0.0.9', port: 502, unitId: 1, name: 'go-e-2', serial: 'go-e-2' },
    ]);
  });
});
