// Vitest test setup file
// Mock Chrome Extension APIs for testing

const storageData = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: storageData[keys] });
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(k => {
            if (storageData[k] !== undefined) result[k] = storageData[k];
          });
          return Promise.resolve(result);
        }
        return Promise.resolve({});
      }),
      set: vi.fn((items) => {
        Object.assign(storageData, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach(k => delete storageData[k]);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  sidePanel: {
    setPanelBehavior: vi.fn(() => Promise.resolve()),
    open: vi.fn(() => Promise.resolve()),
  },
  tabs: {
    create: vi.fn(() => Promise.resolve()),
  },
};

// Expose mock globally
globalThis.chrome = mockChrome;

// Helper to reset storage between tests
globalThis.__resetMockStorage = () => {
  Object.keys(storageData).forEach(k => delete storageData[k]);
  mockChrome.storage.local.get.mockClear();
  mockChrome.storage.local.set.mockClear();
  mockChrome.storage.local.remove.mockClear();
};

// Helper to seed storage data
globalThis.__seedStorage = (data) => {
  Object.assign(storageData, data);
};

// Mock fetch for API tests
globalThis.__mockFetchResponses = [];

const originalFetch = globalThis.fetch;

globalThis.fetch = vi.fn(async (url, options) => {
  const mock = globalThis.__mockFetchResponses.shift();
  if (mock) {
    return {
      ok: mock.ok !== undefined ? mock.ok : true,
      status: mock.status || 200,
      json: () => Promise.resolve(mock.body || {}),
      text: () => Promise.resolve(JSON.stringify(mock.body || {})),
    };
  }
  // Fallback - return empty success
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{}'),
  };
});

globalThis.__resetFetchMocks = () => {
  globalThis.__mockFetchResponses = [];
  globalThis.fetch.mockClear();
};

// Reset before each test
beforeEach(() => {
  globalThis.__resetMockStorage();
  globalThis.__resetFetchMocks();
});
