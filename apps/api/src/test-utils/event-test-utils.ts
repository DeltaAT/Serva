import type test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type { buildApp } from "../app";
import type { EventStore } from "../domain/event-store";

type EventCreateInput = {
  eventName: string;
  eventPasscode: string;
  adminUsername: string;
  adminPassword: string;
};

type TestModuleWithHooks = Pick<typeof test, "after" | "afterEach">;

type EventStoreForTests = Pick<EventStore, "createEvent" | "deleteEvent" | "activateEvent">;

type TestApp = Awaited<ReturnType<typeof buildApp>>;

export function setupEventTestUtils(testModule: TestModuleWithHooks, store: EventStoreForTests) {
  const createdEventIds = new Set<number>();
  const createdDbFilePaths = new Set<string>();
  const openedApps = new Set<TestApp>();

  async function cleanupApps() {
    for (const app of openedApps) {
      try {
        await app.close();
      } catch {
        // Ignore already-closed app instances during cleanup.
      }
    }
    openedApps.clear();
  }

  function cleanupEvents() {
    for (const eventId of createdEventIds) {
      try {
        store.deleteEvent(eventId);
      } catch {
        // Ignore already-deleted events during cleanup.
      }
    }
    createdEventIds.clear();

    for (const dbFilePath of createdDbFilePaths) {
      try {
        rmSync(dbFilePath, { force: true });
      } catch {
        // Ignore file cleanup errors for temporary test artifacts.
      }
    }
    createdDbFilePaths.clear();
  }

  async function cleanup() {
    await cleanupApps();
    cleanupEvents();
  }

  testModule.afterEach(async () => {
    await cleanup();
  });

  testModule.after(async () => {
    await cleanup();
  });

  function createEventPrefix(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function createTestEvent(input: EventCreateInput) {
    const event = store.createEvent(input);
    createdEventIds.add(event.id);
    createdDbFilePaths.add(event.dbFilePath);
    return event;
  }

  function forgetEvent(eventId: number) {
    createdEventIds.delete(eventId);
  }

  async function createAppFixture(createApp: () => Promise<TestApp>) {
    const app = await createApp();
    openedApps.add(app);
    return app;
  }

  function createActiveEventFixture(input: EventCreateInput) {
    const event = createTestEvent(input);
    return store.activateEvent(event.id);
  }

  function createActiveDbFixture(input: EventCreateInput) {
    const event = createActiveEventFixture(input);
    return {
      event,
      dbFilePath: event.dbFilePath,
    };
  }

  function configureMasterCredentials(username = "master", password = "master-secret") {
    process.env.MASTER_USERNAME = username;
    process.env.MASTER_PASSWORD = password;
    return { username, password };
  }

  function createAuthFixture(app: TestApp) {
    return {
      async loginMaster(input?: { username?: string; password?: string }) {
        const login = await app.inject({
          method: "POST",
          url: "/auth/master/login",
          payload: {
            username: input?.username ?? process.env.MASTER_USERNAME,
            password: input?.password ?? process.env.MASTER_PASSWORD,
          },
        });

        assert.equal(login.statusCode, 200);
        return (login.json() as { accessToken: string }).accessToken;
      },

      async loginAdmin(input: { eventId: number; username: string; password: string }) {
        const login = await app.inject({
          method: "POST",
          url: "/auth/admin/login",
          payload: input,
        });

        assert.equal(login.statusCode, 200);
        return (login.json() as { accessToken: string }).accessToken;
      },

      async loginWaiter(input: { username: string; eventPasscode: string }) {
        const login = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: input,
        });

        assert.equal(login.statusCode, 200);
        return login.json() as {
          accessToken: string;
          user: { id: number; username: string };
        };
      },
    };
  }

  return {
    createEventPrefix,
    createTestEvent,
    createActiveEventFixture,
    createActiveDbFixture,
    createAppFixture,
    configureMasterCredentials,
    createAuthFixture,
    forgetEvent,
  };
}

