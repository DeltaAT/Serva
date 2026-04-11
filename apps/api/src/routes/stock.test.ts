import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
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

function seedMenuItem(dbFilePath: string) {
  const db = new Database(dbFilePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS MenuCategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      isLocked INTEGER NOT NULL DEFAULT 0,
      weight INTEGER NOT NULL DEFAULT 0,
      printer_id INTEGER,
      orderDisplay_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS MenuItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      weight INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      isLocked INTEGER NOT NULL DEFAULT 0,
      menuCategory_id INTEGER NOT NULL
    );
  `);

  const categoryId = Number(
    db.prepare(
      "INSERT INTO MenuCategories (name, description, isLocked, weight, printer_id, orderDisplay_id) VALUES (?, ?, ?, ?, NULL, NULL)"
    ).run("Food", "", 0, 0).lastInsertRowid
  );
  const menuItemId = Number(
    db.prepare(
      "INSERT INTO MenuItems (name, description, weight, price, isLocked, menuCategory_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Burger", "", 0, 8.5, 0, categoryId).lastInsertRowid
  );

  db.close();
  return menuItemId;
}

test("stock endpoints reject unauthorized requests", { concurrency: false }, async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/stock/items",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
  await app.close();
});

test("stock endpoints require active event", { concurrency: false }, async () => {
  const created = createTestEvent({
    eventName: createEventPrefix("stock-no-active"),
    eventPasscode: "stock-pass",
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
    url: "/stock/items",
    headers: { authorization: `Bearer ${adminToken}` },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "NO_ACTIVE_EVENT");
  await app.close();
});

test("waiter session cannot access admin stock endpoints", { concurrency: false }, async () => {
  const eventPasscode = "stock-waiter-pass";
  const created = createTestEvent({
    eventName: createEventPrefix("stock-forbidden"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode, "waiter-stock");

  const response = await app.inject({
    method: "POST",
    url: "/stock/items",
    headers: { authorization: `Bearer ${waiterToken}` },
    payload: { name: "Tomato", quantity: 10 },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "FORBIDDEN");
  await app.close();
});

test("admin can manage stock items and menu stock requirements", { concurrency: false }, async () => {
  const adminPassword = "secret123";
  const created = createTestEvent({
    eventName: createEventPrefix("stock-crud"),
    eventPasscode: "stock-crud-pass",
    adminUsername: "chef",
    adminPassword,
  });
  eventStore.activateEvent(created.id);
  const menuItemId = seedMenuItem(created.dbFilePath);

  const app = await buildApp();
  const adminToken = await loginAdmin(app, {
    eventId: created.id,
    username: "chef",
    password: adminPassword,
  });

  const createTomato = await app.inject({
    method: "POST",
    url: "/stock/items",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "Tomato", quantity: 12 },
  });
  assert.equal(createTomato.statusCode, 201);
  const tomatoId = createTomato.json().id as number;

  const createBun = await app.inject({
    method: "POST",
    url: "/stock/items",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "Bun", quantity: 20 },
  });
  assert.equal(createBun.statusCode, 201);
  const bunId = createBun.json().id as number;

  const list = await app.inject({
    method: "GET",
    url: "/stock/items",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(
    (list.json() as { items: Array<{ name: string }> }).items.map((item) => item.name),
    ["Bun", "Tomato"]
  );

  const setQuantity = await app.inject({
    method: "PATCH",
    url: `/stock/items/${tomatoId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { quantity: 10 },
  });
  assert.equal(setQuantity.statusCode, 200);
  assert.equal(setQuantity.json().quantity, 10);

  const applyDelta = await app.inject({
    method: "PATCH",
    url: `/stock/items/${tomatoId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { delta: -3 },
  });
  assert.equal(applyDelta.statusCode, 200);
  assert.equal(applyDelta.json().quantity, 7);

  const replaceRequirements = await app.inject({
    method: "PUT",
    url: `/menu/items/${menuItemId}/stock-requirements`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      requirements: [
        { stockItemId: tomatoId, quantityRequired: 2 },
        { stockItemId: bunId, quantityRequired: 1 },
      ],
    },
  });
  assert.equal(replaceRequirements.statusCode, 200);
  assert.deepEqual(replaceRequirements.json().requirements, [
    { stockItemId: tomatoId, quantityRequired: 2 },
    { stockItemId: bunId, quantityRequired: 1 },
  ]);

  const duplicateRequirements = await app.inject({
    method: "PUT",
    url: `/menu/items/${menuItemId}/stock-requirements`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      requirements: [
        { stockItemId: tomatoId, quantityRequired: 1 },
        { stockItemId: tomatoId, quantityRequired: 3 },
      ],
    },
  });
  assert.equal(duplicateRequirements.statusCode, 400);
  assert.equal(duplicateRequirements.json().error.code, "DUPLICATE_STOCK_REQUIREMENT");

  const clearRequirements = await app.inject({
    method: "PUT",
    url: `/menu/items/${menuItemId}/stock-requirements`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      requirements: [],
    },
  });
  assert.equal(clearRequirements.statusCode, 200);
  assert.deepEqual(clearRequirements.json().requirements, []);

  await app.close();
});

