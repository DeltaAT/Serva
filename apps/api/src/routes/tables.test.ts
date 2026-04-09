import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { buildApp } from "../app";
import { eventStore } from "../domain/state";

function createEventPrefix(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function seedTables(
  dbFilePath: string,
  tables: Array<{ name: string; weight: number; isLocked?: boolean }>
) {
  const db = new Database(dbFilePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      isLocked INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS Tables_name_key ON Tables(name);
  `);

  const insert = db.prepare("INSERT INTO Tables (name, weight, isLocked) VALUES (?, ?, ?)");
  for (const table of tables) {
    insert.run(table.name, table.weight, table.isLocked ? 1 : 0);
  }

  db.close();
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

test("tables endpoint rejects unauthorized requests", { concurrency: false }, async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/tables",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");
  await app.close();
});

test("waiter session can access GET /tables", { concurrency: false }, async () => {
  const eventPasscode = "tables-pass";
  const created = eventStore.createEvent({
    eventName: createEventPrefix("tables-waiter"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);
  seedTables(created.dbFilePath, [{ name: "A1", weight: 1 }]);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode);

  const response = await app.inject({
    method: "GET",
    url: "/tables",
    headers: { authorization: `Bearer ${waiterToken}` },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { tables: Array<{ name: string }> };
  assert.deepEqual(body.tables.map((table) => table.name), ["A1"]);
  await app.close();
});

test("tables endpoint requires active event", { concurrency: false }, async () => {
  const eventPasscode = "tables-no-active";
  const created = eventStore.createEvent({
    eventName: createEventPrefix("tables-no-active"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(created.id);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode);

  eventStore.deactivateEvent(created.id);

  const response = await app.inject({
    method: "GET",
    url: "/tables",
    headers: { authorization: `Bearer ${waiterToken}` },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "NO_ACTIVE_EVENT");
  await app.close();
});

test("GET /tables returns only active event and sorts by weight", { concurrency: false }, async () => {
  const eventPasscode = "tables-sorting";
  const activeEvent = eventStore.createEvent({
    eventName: createEventPrefix("tables-active"),
    eventPasscode,
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  eventStore.activateEvent(activeEvent.id);
  seedTables(activeEvent.dbFilePath, [
    { name: "B2", weight: 2 },
    { name: "A1", weight: 1 },
  ]);

  const inactiveEvent = eventStore.createEvent({
    eventName: createEventPrefix("tables-inactive"),
    eventPasscode: "inactive-pass",
    adminUsername: "chef",
    adminPassword: "secret123",
  });
  seedTables(inactiveEvent.dbFilePath, [{ name: "ZZ1", weight: 0 }]);

  const app = await buildApp();
  const waiterToken = await loginWaiter(app, eventPasscode, "sort-waiter");

  const response = await app.inject({
    method: "GET",
    url: "/tables?sort=weight,name",
    headers: { authorization: `Bearer ${waiterToken}` },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { tables: Array<{ name: string }> };
  assert.deepEqual(body.tables.map((table) => table.name), ["A1", "B2"]);
  await app.close();
});

test("admin CRUD and bulk table endpoints work", { concurrency: false }, async () => {
  const adminPassword = "secret123";
  const created = eventStore.createEvent({
    eventName: createEventPrefix("tables-crud"),
    eventPasscode: "tables-crud-pass",
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

  const createSingle = await app.inject({
    method: "POST",
    url: "/tables",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "A1", weight: 10 },
  });
  assert.equal(createSingle.statusCode, 201);
  const singleTableId = createSingle.json().id as number;

  const duplicateSingle = await app.inject({
    method: "POST",
    url: "/tables",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "A1" },
  });
  assert.equal(duplicateSingle.statusCode, 409);
  assert.equal(duplicateSingle.json().error.code, "TABLE_ALREADY_EXISTS");

  const bulkCreate = await app.inject({
    method: "POST",
    url: "/tables/bulk",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { rows: ["B"], from: 1, to: 3, lockNew: true },
  });
  assert.equal(bulkCreate.statusCode, 201);
  const bulkBody = bulkCreate.json() as { tables: Array<{ name: string; isLocked: boolean }> };
  assert.equal(bulkBody.tables.length, 3);
  assert.deepEqual(
    bulkBody.tables.map((table) => table.name),
    ["B1", "B2", "B3"]
  );
  assert.equal(bulkBody.tables.every((table) => table.isLocked), true);

  const patchSingle = await app.inject({
    method: "PATCH",
    url: `/tables/${singleTableId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "A1-renamed", isLocked: true, weight: 1 },
  });
  assert.equal(patchSingle.statusCode, 200);
  assert.equal(patchSingle.json().name, "A1-renamed");
  assert.equal(patchSingle.json().isLocked, true);

  const qrSingle = await app.inject({
    method: "GET",
    url: `/tables/${singleTableId}/qr`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(qrSingle.statusCode, 200);
  assert.match(qrSingle.headers["content-type"] ?? "", /image\/svg\+xml/);
  assert.match(qrSingle.body, /<svg/);

  const qrPdf = await app.inject({
    method: "GET",
    url: "/tables/qr.pdf",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(qrPdf.statusCode, 200);
  assert.match(qrPdf.headers["content-type"] ?? "", /application\/pdf/);
  assert.equal(qrPdf.body.startsWith("%PDF-"), true);

  const waiterToken = await loginWaiter(app, "tables-crud-pass", "crud-waiter");
  const waiterCreate = await app.inject({
    method: "POST",
    url: "/tables",
    headers: { authorization: `Bearer ${waiterToken}` },
    payload: { name: "C1" },
  });
  assert.equal(waiterCreate.statusCode, 403);

  await app.close();
});

