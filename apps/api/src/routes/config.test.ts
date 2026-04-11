import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";
import { setupEventTestUtils } from "../test-utils/event-test-utils";

const { createTestEvent, createEventPrefix } = setupEventTestUtils(test, eventStore);

async function loginWaiter(
  app: Awaited<ReturnType<typeof buildApp>>,
  eventPasscode: string,
  username = "waiter"
) {
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { username, eventPasscode },
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

test("config endpoints reject unauthorized requests", { concurrency: false }, async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/config",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
  await app.close();
});

test("config endpoints require active event", { concurrency: false }, async () => {
  const created = createTestEvent({
    eventName: createEventPrefix("config-no-active"),
    eventPasscode: "config-pass",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const adminToken = await loginAdmin(app, {
    eventId: created.id,
    username: "chef",
    password: "secret123",
  });

  eventStore.deactivateEvent(created.id);

  const response = await app.inject({
    method: "GET",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "NO_ACTIVE_EVENT");
  await app.close();
});

test("waiter cannot access admin config endpoints", { concurrency: false }, async () => {
  const eventPasscode = "config-waiter-pass";
  const created = createTestEvent({
    eventName: createEventPrefix("config-forbidden"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode, "waiter-config");

  const response = await app.inject({
    method: "PATCH",
    url: "/config",
    headers: { authorization: `Bearer ${waiterToken}` },
    payload: { values: { currency: "EUR" } },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "FORBIDDEN");
  await app.close();
});

test("admin can get and patch config values", { concurrency: false }, async () => {
  const created = createTestEvent({
    eventName: createEventPrefix("config-crud"),
    eventPasscode: "config-crud-pass",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const adminToken = await loginAdmin(app, {
    eventId: created.id,
    username: "chef",
    password: "secret123",
  });

  const getEmpty = await app.inject({
    method: "GET",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(getEmpty.statusCode, 200);
  assert.deepEqual(getEmpty.json().values, {});

  const patchConfig = await app.inject({
    method: "PATCH",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      values: {
        currency: "EUR",
        serviceChargePercent: "10",
      },
    },
  });
  assert.equal(patchConfig.statusCode, 200);
  assert.deepEqual(patchConfig.json().values, {
    currency: "EUR",
    serviceChargePercent: "10",
  });

  const patchOverwrite = await app.inject({
    method: "PATCH",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      values: {
        serviceChargePercent: "12",
      },
    },
  });
  assert.equal(patchOverwrite.statusCode, 200);
  assert.deepEqual(patchOverwrite.json().values, {
    currency: "EUR",
    serviceChargePercent: "12",
  });

  const getUpdated = await app.inject({
    method: "GET",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(getUpdated.statusCode, 200);
  assert.deepEqual(getUpdated.json().values, {
    currency: "EUR",
    serviceChargePercent: "12",
  });

  const patchInvalid = await app.inject({
    method: "PATCH",
    url: "/config",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      values: {},
    },
  });
  assert.equal(patchInvalid.statusCode, 400);
  assert.equal(patchInvalid.json().error.code, "VALIDATION_ERROR");

  await app.close();
});

