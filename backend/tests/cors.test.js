// ============================================================================
// CORS ORIGIN MATCHING
// ============================================================================
// Regression cover for a config error that cost a full deploy cycle to spot:
// FRONTEND_URLS was set to "https://app.vercel.app/" — copied from a browser
// address bar, trailing slash and all. A browser's Origin header never has a
// path, so it sends "https://app.vercel.app", and exact string matching
// rejected every request from the site that had just been allowlisted.
//
// The symptom was especially misleading: reads kept working. Requests go
// through the Vercel rewrite, making them same-origin, and a same-origin GET
// sends no Origin header at all — while POST/PUT/DELETE do. So the menu loaded
// and only writes failed, which reads as a broken cart rather than bad config.
// ============================================================================

const request = require('supertest');

const VERCEL = 'https://smart-canteen-pi-gray.vercel.app';

/** Load a fresh app instance with the given FRONTEND_URLS. */
const appWith = (frontendUrls) => {
  jest.resetModules();
  process.env.FRONTEND_URLS = frontendUrls;
  return require('../src/app');
};

const origEnv = process.env.FRONTEND_URLS;
afterAll(() => {
  if (origEnv === undefined) delete process.env.FRONTEND_URLS;
  else process.env.FRONTEND_URLS = origEnv;
});

describe('origin allowlist', () => {
  test('a trailing slash in FRONTEND_URLS still matches — the real-world typo', async () => {
    const app = appWith(`${VERCEL}/`);
    const res = await request(app).get('/health').set('Origin', VERCEL);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(VERCEL);
  });

  test('multiple trailing slashes are tolerated too', async () => {
    const app = appWith(`${VERCEL}///`);
    const res = await request(app).get('/health').set('Origin', VERCEL);
    expect(res.status).toBe(200);
  });

  test('surrounding whitespace from a sloppy paste is tolerated', async () => {
    const app = appWith(`  ${VERCEL}  `);
    const res = await request(app).get('/health').set('Origin', VERCEL);
    expect(res.status).toBe(200);
  });

  test('a comma-separated list allows every entry', async () => {
    const app = appWith(`https://a.example.com/, ${VERCEL}/`);
    for (const o of ['https://a.example.com', VERCEL]) {
      const res = await request(app).get('/health').set('Origin', o);
      expect(res.status).toBe(200);
    }
  });

  test('an unlisted origin is still refused — normalising must not mean allowing all', async () => {
    const app = appWith(VERCEL);
    const res = await request(app).get('/health').set('Origin', 'https://attacker.example.com');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/FRONTEND_URLS/);
  });

  test('a different host that merely shares a prefix is refused', async () => {
    const app = appWith(VERCEL);
    // Substring matching would wrongly allow this; exact comparison must not.
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://smart-canteen-pi-gray.vercel.app.evil.com');
    expect(res.status).toBe(403);
  });

  test('requests with no Origin are allowed — server-to-server and the Vercel proxy', async () => {
    const app = appWith(VERCEL);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('localhost dev origin works even when FRONTEND_URLS is empty', async () => {
    const app = appWith('');
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
  });
});
