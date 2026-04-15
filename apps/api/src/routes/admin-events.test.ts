import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";
import { setupEventTestUtils } from "../test-utils/event-test-utils";

const {
  createEventPrefix,
  createTestEvent,
  forgetEvent,
  createAppFixture,
  configureMasterCredentials,
  createAuthFixture,
} = setupEventTestUtils(test, eventStore);

async function createEvent(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  input: {
    eventName: string;
    eventPasscode: string;
    adminUsername: string;
    adminPassword: string;
  }
) {
  const response = await app.inject({
    method: "POST",
    url: "/admin/events",
    headers: { authorization: `Bearer ${token}` },
    payload: input,
  });

  assert.equal(response.statusCode, 201);
  return response.json() as {
    id: number;
    eventName: string;
    adminUsername: string;
    isActive: boolean;
    createdAt: string;
    closedAt?: string;
  };
}

test("event lifecycle keeps exactly one active event and cleans up deleted event dbs", { concurrency: false }, async () => {
  configureMasterCredentials();

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const masterToken = await auth.loginMaster();

  const first = createEventPrefix("admin-event-lifecycle-a");
  const second = createEventPrefix("admin-event-lifecycle-b");

  const createdFirst = await createEvent(app, masterToken, {
    eventName: first,
    eventPasscode: "pass-a",
    adminUsername: "chef-a",
    adminPassword: "secret-a",
  });
  const createdSecond = await createEvent(app, masterToken, {
    eventName: second,
    eventPasscode: "pass-b",
    adminUsername: "chef-b",
    adminPassword: "secret-b",
  });

  const activeBefore = await app.inject({
    method: "GET",
    url: "/admin/events/active",
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(activeBefore.statusCode, 409);
  assert.equal(activeBefore.json().error.code, "NO_ACTIVE_EVENT");

  const activateFirst = await app.inject({
    method: "POST",
    url: `/admin/events/${createdFirst.id}/activate`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(activateFirst.statusCode, 200);
  assert.equal(activateFirst.json().isActive, true);

  const activeAfterFirst = await app.inject({
    method: "GET",
    url: "/admin/events/active",
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(activeAfterFirst.statusCode, 200);
  assert.equal(activeAfterFirst.json().id, createdFirst.id);

  const activateSecond = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/activate`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(activateSecond.statusCode, 200);
  assert.equal(activateSecond.json().isActive, true);

  const firstEventAfterSwitch = eventStore.getEvent(createdFirst.id);
  assert.ok(firstEventAfterSwitch);
  assert.equal(firstEventAfterSwitch?.isActive, false);
  assert.equal(firstEventAfterSwitch?.closedAt, undefined);

  const activeAfterSecond = await app.inject({
    method: "GET",
    url: "/admin/events/active",
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(activeAfterSecond.statusCode, 200);
  assert.equal(activeAfterSecond.json().id, createdSecond.id);

  const deactivateSecond = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/deactivate`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(deactivateSecond.statusCode, 200);
  assert.equal(deactivateSecond.json().isActive, false);
  assert.equal(deactivateSecond.json().closedAt, undefined);

  const noActiveAfterDeactivate = await app.inject({
    method: "GET",
    url: "/admin/events/active",
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(noActiveAfterDeactivate.statusCode, 409);
  assert.equal(noActiveAfterDeactivate.json().error.code, "NO_ACTIVE_EVENT");

  const closeSecond = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/close`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(closeSecond.statusCode, 200);
  assert.equal(closeSecond.json().isActive, false);
  assert.ok(closeSecond.json().closedAt);

  const closeAgain = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/close`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(closeAgain.statusCode, 409);
  assert.equal(closeAgain.json().error.code, "EVENT_CLOSED");

  const reactivateClosed = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/activate`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(reactivateClosed.statusCode, 409);
  assert.equal(reactivateClosed.json().error.code, "EVENT_CLOSED");

  const deactivateClosed = await app.inject({
    method: "POST",
    url: `/admin/events/${createdSecond.id}/deactivate`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(deactivateClosed.statusCode, 409);
  assert.equal(deactivateClosed.json().error.code, "EVENT_CLOSED");

  const createdFirstDbFile = firstEventAfterSwitch.dbFilePath;
  assert.equal(existsSync(createdFirstDbFile), true);

  const deleteFirst = await app.inject({
    method: "DELETE",
    url: `/admin/events/${createdFirst.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(deleteFirst.statusCode, 204);
  assert.equal(eventStore.getEvent(createdFirst.id), null);
  assert.equal(existsSync(createdFirstDbFile), false);
  forgetEvent(createdFirst.id);

  const deleteSecond = await app.inject({
    method: "DELETE",
    url: `/admin/events/${createdSecond.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(deleteSecond.statusCode, 204);
  assert.equal(eventStore.getEvent(createdSecond.id), null);
  assert.equal(eventStore.getActiveEvent(), null);
  forgetEvent(createdSecond.id);

});

test("create event endpoint rejects duplicate event names", { concurrency: false }, async () => {
  configureMasterCredentials();

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const masterToken = await auth.loginMaster();
  const eventName = createEventPrefix("admin-event-duplicate");

  const first = await createEvent(app, masterToken, {
    eventName,
    eventPasscode: "dup-pass-a",
    adminUsername: "dup-chef-a",
    adminPassword: "dup-secret-a",
  });

  const duplicate = await app.inject({
    method: "POST",
    url: "/admin/events",
    headers: { authorization: `Bearer ${masterToken}` },
    payload: {
      eventName,
      eventPasscode: "dup-pass-b",
      adminUsername: "dup-chef-b",
      adminPassword: "dup-secret-b",
    },
  });

  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error.code, "EVENT_ALREADY_EXISTS");

  const deleteFirst = await app.inject({
    method: "DELETE",
    url: `/admin/events/${first.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });
  assert.equal(deleteFirst.statusCode, 204);
  forgetEvent(first.id);

});

test("delete event endpoint rejects unauthorized requests", { concurrency: false }, async () => {
  configureMasterCredentials();

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-unauthorized"),
    eventPasscode: "pass-1",
    adminUsername: "chef",
    adminPassword: "secret123",
  });

  const app = await createAppFixture(buildApp);
  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
});

test("master can delete inactive event", { concurrency: false }, async () => {
  configureMasterCredentials();

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-inactive"),
    eventPasscode: "pass-2",
    adminUsername: "chef",
    adminPassword: "secret123",
  });

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const masterToken = await auth.loginMaster();

  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 204);
  forgetEvent(created.id);
  assert.equal(eventStore.getEvent(created.id), null);
});

test("master can delete active event and active event becomes empty", { concurrency: false }, async () => {
  configureMasterCredentials();

  const created = createTestEvent({
    eventName: createEventPrefix("admin-delete-active"),
    eventPasscode: "pass-3",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const masterToken = await auth.loginMaster();

  const response = await app.inject({
    method: "DELETE",
    url: `/admin/events/${created.id}`,
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 204);
  forgetEvent(created.id);
  assert.equal(eventStore.getEvent(created.id), null);
  assert.equal(eventStore.getActiveEvent(), null);
});

test("delete event endpoint returns not found for unknown event", { concurrency: false }, async () => {
  configureMasterCredentials();

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const masterToken = await auth.loginMaster();

  const response = await app.inject({
    method: "DELETE",
    url: "/admin/events/99999999",
    headers: { authorization: `Bearer ${masterToken}` },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "EVENT_NOT_FOUND");
});

