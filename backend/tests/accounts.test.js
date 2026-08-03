const request = require('supertest');
const app = require('../src/app');
const { seed, login } = require('./helpers');

let adminToken, adminId;
beforeEach(async () => {
  const ids = await seed();
  adminId = ids.adminId;
  adminToken = await login(app, 'OWNER001');
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Admin account management', () => {
  test('admin creates a chef account (201, no password_hash)', async () => {
    const res = await request(app).post('/api/admin/accounts').set(auth(adminToken))
      .send({ name: 'New Chef', roll_number: 'CHEF002', phone: '9000000099', password: 'chefpass', role: 'chef' });
    expect(res.status).toBe(201);
    expect(res.body.data.account.role).toBe('chef');
    expect(res.body.data.account.password_hash).toBeUndefined();
  });

  test('a created account can immediately log in', async () => {
    await request(app).post('/api/admin/accounts').set(auth(adminToken))
      .send({ name: 'New Chef', roll_number: 'CHEF002', phone: '9000000099', password: 'chefpass', role: 'chef' });
    const res = await request(app).post('/api/auth/login').send({ identifier: 'CHEF002', password: 'chefpass' });
    expect(res.status).toBe(200);
    expect(res.body.data.student.role).toBe('chef');
  });

  test('duplicate roll number → 409', async () => {
    const res = await request(app).post('/api/admin/accounts').set(auth(adminToken))
      .send({ name: 'Dup', roll_number: 'CHEF001', phone: '9000000098', password: 'secret1', role: 'chef' });
    expect(res.status).toBe(409);
  });

  test('a non-admin (chef) cannot create accounts → 403', async () => {
    const chefToken = await login(app, 'CHEF001');
    const res = await request(app).post('/api/admin/accounts').set(auth(chefToken))
      .send({ name: 'X', roll_number: 'ZZZ1', phone: '9000000097', password: 'secret1', role: 'chef' });
    expect(res.status).toBe(403);
  });

  test('admin resets a password; the new password works', async () => {
    // list accounts to find the student's id
    const list = await request(app).get('/api/admin/accounts?role=student').set(auth(adminToken));
    const student = list.body.data.accounts.find((a) => a.roll_number === 'STU001');
    const res = await request(app).patch(`/api/admin/accounts/${student.id}`).set(auth(adminToken))
      .send({ password: 'brandnew1' });
    expect(res.status).toBe(200);
    const relogin = await request(app).post('/api/auth/login').send({ identifier: 'STU001', password: 'brandnew1' });
    expect(relogin.status).toBe(200);
  });

  test('admin deactivates an account; that account can no longer log in', async () => {
    const list = await request(app).get('/api/admin/accounts?role=student').set(auth(adminToken));
    const student = list.body.data.accounts.find((a) => a.roll_number === 'STU001');
    await request(app).patch(`/api/admin/accounts/${student.id}`).set(auth(adminToken)).send({ is_active: false });
    const relogin = await request(app).post('/api/auth/login').send({ identifier: 'STU001', password: 'test1234' });
    expect(relogin.status).toBe(403);
  });

  test('self-lockout guard: an admin cannot deactivate their own account → 400', async () => {
    const res = await request(app).patch(`/api/admin/accounts/${adminId}`).set(auth(adminToken)).send({ is_active: false });
    expect(res.status).toBe(400);
  });

  test('self-lockout guard: an admin cannot demote their own role → 400', async () => {
    const res = await request(app).patch(`/api/admin/accounts/${adminId}`).set(auth(adminToken)).send({ role: 'student' });
    expect(res.status).toBe(400);
  });
});
