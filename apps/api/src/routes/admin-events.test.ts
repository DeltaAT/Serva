import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";
import { setupEventTestUtils } from "../test-utils/event-test-utils";

const { createEventPrefix, createTestEvent, forgetEvent } = setupEventTestUtils(test, eventStore);

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

test("delete event endpoint rejects unauthorized requests", { concurrency: false }, async () => {
  process.env.MASTER_USERNAME = "master";
  process.env.MASTER_PASSWORD = "master-secret";

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-unauthorized"),
    eventPasscode: "pass-1",
    adminUsername: "chef",
    adminPassword: "secret123",
  });

  const app = await buildApp();
  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
  await app.close();
});

test("master can delete inactive event", { concurrency: false }, async () => {
  process.env.MASTER_USERNAME = "master";
  process.env.MASTER_PASSWORD = "master-secret";

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-inactive"),
    eventPasscode: "pass-2",
    adminUsername: "chef",
    adminPassword: "secret123",
  });

  const app = await buildApp();
  const masterToken = await loginMaster(app);

  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 204);
  forgetEvent(created.id);
  assert.equal(eventStore.getEvent(created.id), null);
  await app.close();
});

test("master can delete active event and active event becomes empty", { concurrency: false }, async () => {
  process.env.MASTER_USERNAME = "master";
  process.env.MASTER_PASSWORD = "master-secret";

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-active"),
    eventPasscode: "pass-3",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const masterToken = await loginMaster(app);

  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 204);
  forgetEvent(created.id);
  assert.equal(eventStore.getEvent(created.id), null);
  assert.equal(eventStore.getActiveEvent(), null);
  await app.close();
});

test("delete event endpoint returns not found for unknown event", { concurrency: false }, async () => {
  process.env.MASTER_USERNAME = "master";
  process.env.MASTER_PASSWORD = "master-secret";

  const app = await buildApp();
  const masterToken = await loginMaster(app);

  const response = await app.inject({
    method: "DELETE",
    url: "/admin/events/99999999",
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "EVENT_NOT_FOUND");
  await app.close();
});

