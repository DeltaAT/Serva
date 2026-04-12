import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";
import { setupEventTestUtils } from "../test-utils/event-test-utils";

const { createEventPrefix, createTestEvent } = setupEventTestUtils(test, eventStore);

function configureMasterCredentials() {
  process.env.MASTER_USERNAME = "master";
  process.env.MASTER_PASSWORD = "master-secret";
}

async function loginMaster(app: Awaited<ReturnType<typeof buildApp>>) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/master/login",
    payload: {
      username: process.env.MASTER_USERNAME,
      password: process.env.MASTER_PASSWORD,
    },
  });

  assert.equal(login.statusCode, 200);
  return (login.json() as { accessToken: string }).accessToken;
}

async function loginAdmin(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: { eventId: number; username: string; password: string }
) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/admin/login",
    payload: input,
  });

  assert.equal(login.statusCode, 200);
  return (login.json() as { accessToken: string }).accessToken;
}

async function loginWaiter(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: { username: string; eventPasscode: string }
) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: input,
  });

  assert.equal(login.statusCode, 200);
  return (login.json() as { accessToken: string }).accessToken;
}

test("auth endpoints reject missing, invalid and expired tokens", { concurrency: false }, async () => {
  configureMasterCredentials();
  const app = await buildApp();

  const missingToken = await app.inject({
    method: "GET",
    url: "/auth/me",
  });
  assert.equal(missingToken.statusCode, 401);
  assert.equal(missingToken.json().error.code, "UNAUTHORIZED");

  const invalidToken = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: "Bearer not-a-jwt",
    },
  });
  assert.equal(invalidToken.statusCode, 401);
  assert.equal(invalidToken.json().error.code, "UNAUTHORIZED");

  const expiredToken = await app.jwt.sign({ role: "master" }, { expiresIn: 1 });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const expiredResponse = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${expiredToken}`,
    },
  });
  assert.equal(expiredResponse.statusCode, 401);
  assert.equal(expiredResponse.json().error.code, "UNAUTHORIZED");

  await app.close();
});

test("roles are enforced exactly on protected routes", { concurrency: false }, async () => {
  configureMasterCredentials();

  const created = createTestEvent({
    eventName: createEventPrefix("auth-role-check"),
    eventPasscode: "role-pass",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const masterToken = await loginMaster(app);
  const waiterToken = await loginWaiter(app, {
    username: "waiter-role-check",
    eventPasscode: "role-pass",
  });

  const masterOnConfig = await app.inject({
    method: "GET",
    url: "/config",
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(masterOnConfig.statusCode, 403);
  assert.equal(masterOnConfig.json().error.code, "FORBIDDEN");

  const waiterOnAdminEvents = await app.inject({
    method: "GET",
    url: "/admin/events/active",
    headers: { authorization: `Bearer ${waiterToken}` },
  });
  assert.equal(waiterOnAdminEvents.statusCode, 403);
  assert.equal(waiterOnAdminEvents.json().error.code, "FORBIDDEN");

  await app.close();
});

test("admin tokens are bound to their own event", { concurrency: false }, async () => {
  configureMasterCredentials();

  const firstEvent = createTestEvent({
    eventName: createEventPrefix("auth-admin-bound-a"),
    eventPasscode: "pass-a",
    adminUsername: "chef-a",
    adminPassword: "secret-a",
  });
  const secondEvent = createTestEvent({
    eventName: createEventPrefix("auth-admin-bound-b"),
    eventPasscode: "pass-b",
    adminUsername: "chef-b",
    adminPassword: "secret-b",
  });
  eventStore.activateEvent(secondEvent.id);

  const app = await buildApp();
  const adminToken = await loginAdmin(app, {
    eventId: firstEvent.id,
    username: "chef-a",
    password: "secret-a",
  });

  const configResponse = await app.inject({
    method: "GET",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(configResponse.statusCode, 403);
  assert.equal(configResponse.json().error.code, "FORBIDDEN");

  await app.close();
});

test("auth login requires an active event and malformed admin tokens are rejected", { concurrency: false }, async () => {
  configureMasterCredentials();
  const activeEvent = eventStore.getActiveEvent();
  if (activeEvent) {
    eventStore.deactivateEvent(activeEvent.id);
  }
  const app = await buildApp();

  const noActiveEvent = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      username: "waiter-no-active",
      eventPasscode: "missing-pass",
    },
  });
  assert.equal(noActiveEvent.statusCode, 409);
  assert.equal(noActiveEvent.json().error.code, "NO_ACTIVE_EVENT");

  const malformedAdminToken = await app.jwt.sign({
    role: "admin",
    username: "chef",
  } as never);

  const malformedResponse = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${malformedAdminToken}`,
    },
  });
  assert.equal(malformedResponse.statusCode, 401);
  assert.equal(malformedResponse.json().error.code, "UNAUTHORIZED");

  await app.close();
});

