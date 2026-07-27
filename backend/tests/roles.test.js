const request = require('supertest');
const app = require('../src/app');
const { seed, login } = require('./helpers');

beforeAll(async () => { await seed(); });

describe('Role-based access control', () => {
  test('admin route with no token → 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('admin route as a student → 403', async () => {
    const token = await login(app, 'STU001');
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('admin route as a chef → 403 (chef is not admin)', async () => {
    const token = await login(app, 'CHEF001');
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('admin route as an admin → 200', async () => {
    const token = await login(app, 'OWNER001');
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('admin account list never leaks password_hash', async () => {
    const token = await login(app, 'OWNER001');
    const res = await request(app).get('/api/admin/accounts?role=all').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const acc of res.body.data.accounts) {
      expect(acc.password_hash).toBeUndefined();
    }
  });

  test('an invalid/garbage token → 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});
