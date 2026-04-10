import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";

const createdEventIds = new Set<number>();

function createTestEvent(input: {
  eventName: string;
  eventPasscode: string;
  adminUsername: string;
  adminPassword: string;
}) {
  const event = eventStore.createEvent(input);
  createdEventIds.add(event.id);
  return event;
}

test.after(() => {
  for (const eventId of createdEventIds) {
    try {
      eventStore.deleteEvent(eventId);
    } catch {
      // Ignore already-deleted events during cleanup.
    }
  }
  createdEventIds.clear();
});

function createEventPrefix(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

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

test("users endpoints reject unauthorized requests", { concurrency: false }, async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/users",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
  await app.close();
});

test("users endpoints require active event", { concurrency: false }, async () => {
  const eventPasscode = "users-no-active-pass";
  const created = createTestEvent({
    eventName: createEventPrefix("users-no-active"),
    eventPasscode,
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
    url: "/users",
    headers: { authorization: `Bearer ${adminToken}` },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "NO_ACTIVE_EVENT");
  await app.close();
});

test("waiter cannot manage users", { concurrency: false }, async () => {
  const eventPasscode = "users-forbidden-pass";
  const created = createTestEvent({
    eventName: createEventPrefix("users-forbidden"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode, "waiter-only");

  const response = await app.inject({
    method: "POST",
    url: "/users",
    headers: { authorization: `Bearer ${waiterToken}` },
    payload: { username: "new-user" },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "FORBIDDEN");
  await app.close();
});

test("admin can perform users CRUD and filters", { concurrency: false }, async () => {
  const eventPasscode = "users-crud-pass";
  const adminPassword = "secret123";
  const created = createTestEvent({
    eventName: createEventPrefix("users-crud"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword,
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const adminToken = await loginAdmin(app, {
    eventId: created.id,
    username: "chef",
    password: adminPassword,
  });

  const createUser = await app.inject({
    method: "POST",
    url: "/users",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: "anna", isLocked: false },
  });
  assert.equal(createUser.statusCode, 201);
  const userId = createUser.json().id as number;

  const duplicateUser = await app.inject({
    method: "POST",
    url: "/users",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: "anna" },
  });
  assert.equal(duplicateUser.statusCode, 409);
  assert.equal(duplicateUser.json().error.code, "USER_ALREADY_EXISTS");

  const createLocked = await app.inject({
    method: "POST",
    url: "/users",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username: "bert", isLocked: true },
  });
  assert.equal(createLocked.statusCode, 201);

  const listAll = await app.inject({
    method: "GET",
    url: "/users",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(listAll.statusCode, 200);
  assert.deepEqual(
    (listAll.json() as { users: Array<{ username: string }> }).users.map((user) => user.username),
    ["anna", "bert"]
  );

  const listLocked = await app.inject({
    method: "GET",
    url: "/users?locked=true",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(listLocked.statusCode, 200);
  assert.deepEqual(
    (listLocked.json() as { users: Array<{ username: string }> }).users.map((user) => user.username),
    ["bert"]
  );

  const listSearch = await app.inject({
    method: "GET",
    url: "/users?search=ann",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(listSearch.statusCode, 200);
  assert.deepEqual(
    (listSearch.json() as { users: Array<{ username: string }> }).users.map((user) => user.username),
    ["anna"]
  );

  const getUser = await app.inject({
    method: "GET",
    url: `/users/${userId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(getUser.statusCode, 200);
  assert.equal(getUser.json().username, "anna");

  const patchUser = await app.inject({
    method: "PATCH",
    url: `/users/${userId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { isLocked: true },
  });
  assert.equal(patchUser.statusCode, 200);
  assert.equal(patchUser.json().isLocked, true);

  const lockedLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { username: "anna", eventPasscode },
  });
  assert.equal(lockedLogin.statusCode, 423);
  assert.equal(lockedLogin.json().error.code, "USER_LOCKED");

  const deleteUser = await app.inject({
    method: "DELETE",
    url: `/users/${userId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(deleteUser.statusCode, 204);

  const getDeleted = await app.inject({
    method: "GET",
    url: `/users/${userId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(getDeleted.statusCode, 404);
  assert.equal(getDeleted.json().error.code, "USER_NOT_FOUND");

  await app.close();
});

