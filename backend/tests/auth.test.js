const request = require('supertest');
const app = require('../src/app');
const { seed, login } = require('./helpers');

beforeAll(async () => { await seed(); });

describe('Authentication', () => {
  test('login with correct password returns a token + role, never the hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'CHEF001', password: 'test1234' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.student.role).toBe('chef');
    expect(res.body.data.student.password_hash).toBeUndefined();
  });

  test('login with wrong password → 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'CHEF001', password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('login with unknown identifier → 401 (no user enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'GHOST', password: 'test1234' });
    expect(res.status).toBe(401);
  });

  test('login by phone works too', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: '9000000001', password: 'test1234' });
    expect(res.status).toBe(200);
    expect(res.body.data.student.role).toBe('student');
  });

  test('GET /auth/me returns the server-verified role for a valid token', async () => {
    const token = await login(app, 'OWNER001');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  test('GET /auth/me without a token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('signup creates a student and returns a token, not the hash', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ name: 'New Student', roll_number: 'NEW001', phone: '9111111111', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.student.role).toBe('student');
    expect(res.body.data.student.password_hash).toBeUndefined();
  });

  test('signup with a short password → 400', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ name: 'X', roll_number: 'SHORT1', phone: '9222222222', password: '123' });
    expect(res.status).toBe(400);
  });

  test('signup with a duplicate roll number → 409', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ name: 'Dup', roll_number: 'CHEF001', phone: '9333333333', password: 'secret123' });
    expect(res.status).toBe(409);
  });
});
