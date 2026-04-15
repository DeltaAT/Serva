import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";
import { setupEventTestUtils } from "../test-utils/event-test-utils";

const { createTestEvent, createEventPrefix, createAppFixture, createAuthFixture } = setupEventTestUtils(
  test,
  eventStore
);

test("users endpoints reject unauthorized requests", { concurrency: false }, async () => {
  const app = await createAppFixture(buildApp);

  const response = await app.inject({
    method: "GET",
    url: "/users",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
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

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const adminToken = await auth.loginAdmin({
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

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const waiterToken = (await auth.loginWaiter({ username: "waiter-only", eventPasscode })).accessToken;

  const response = await app.inject({
    method: "POST",
    url: "/users",
    headers: { authorization: `Bearer ${waiterToken}` },
    payload: { username: "new-user" },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "FORBIDDEN");
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

  const app = await createAppFixture(buildApp);
  const auth = createAuthFixture(app);
  const adminToken = await auth.loginAdmin({
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

});

