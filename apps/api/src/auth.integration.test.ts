import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import * as request from 'supertest';

describe('Auth Integration Tests (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/dev-login', () => {
    it('should create user and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          orgName: 'Test Org',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('org');
      expect(response.body).toHaveProperty('workspace');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.org.name).toBe('Test Org');
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({
          email: 'not-an-email',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should reuse existing user on second login', async () => {
      const email = 'reuse@example.com';

      // First login
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({ email });
      expect(first.status).toBe(200);
      const firstUserId = first.body.user.id;

      // Second login
      const second = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({ email });
      expect(second.status).toBe(200);
      const secondUserId = second.body.user.id;

      expect(firstUserId).toBe(secondUserId);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should generate new access token', async () => {
      // Get tokens
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({ email: 'refresh-test@example.com' });

      const { refreshToken } = login.body;

      // Refresh
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user with JWT token', async () => {
      // Login
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({ email: 'me-test@example.com' });

      const { accessToken } = login.body;

      // Get /me
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('orgId');
      expect(response.body).toHaveProperty('permissions');
    });

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('should invalidate refresh token', async () => {
      // Login
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/dev-login')
        .send({ email: 'logout-test@example.com' });

      const { accessToken, refreshToken } = login.body;

      // Logout
      const logout = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(logout.status).toBe(204);

      // Try to refresh (should fail)
      const refresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(refresh.status).toBe(400);
    });
  });
});

describe('Orgs Integration Tests (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let orgId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    // Setup: login
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email: 'orgs-test@example.com' });

    accessToken = login.body.accessToken;
    orgId = login.body.org.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /orgs', () => {
    it('should list user organizations', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orgs')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /orgs', () => {
    it('should create new organization', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/orgs')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Test Org' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Test Org');
    });
  });

  describe('GET /orgs/:orgId', () => {
    it('should get organization details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('memberCount');
    });
  });

  describe('PATCH /orgs/:orgId', () => {
    it('should update organization', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Org Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Org Name');
    });
  });
});
