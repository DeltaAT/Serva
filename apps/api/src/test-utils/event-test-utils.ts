import type test from "node:test";
import type { EventStore } from "../domain/event-store";

type EventCreateInput = {
  eventName: string;
  eventPasscode: string;
  adminUsername: string;
  adminPassword: string;
};

type TestModuleWithAfter = Pick<typeof test, "after">;

type EventStoreForTests = Pick<EventStore, "createEvent" | "deleteEvent">;

export function setupEventTestUtils(testModule: TestModuleWithAfter, store: EventStoreForTests) {
  const createdEventIds = new Set<number>();

  testModule.after(() => {
    for (const eventId of createdEventIds) {
      try {
        store.deleteEvent(eventId);
      } catch {
        // Ignore already-deleted events during cleanup.
      }
    }
    createdEventIds.clear();
  });

  function createEventPrefix(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function createTestEvent(input: EventCreateInput) {
    const event = store.createEvent(input);
    createdEventIds.add(event.id);
    return event;
  }

  function forgetEvent(eventId: number) {
    createdEventIds.delete(eventId);
  }

  return {
    createEventPrefix,
    createTestEvent,
    forgetEvent,
  };
}

