import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { ApiError } from "./api-error";
import { hashPassword, verifyPassword } from "./password";

export type EventRecord = {
  id: number;
  eventName: string;
  adminUsername: string;
  isActive: boolean;
  createdAt: string;
  closedAt?: string;
  dbFilePath: string;
};

export class EventStore {
  private readonly controlDb: Database.Database;
  private readonly eventsDir: string;

  constructor(baseDir = resolve(process.cwd(), "data")) {
    mkdirSync(baseDir, { recursive: true });
    this.eventsDir = join(baseDir, "events");
    mkdirSync(this.eventsDir, { recursive: true });

    const controlPath = join(baseDir, "control.db");
    this.controlDb = new Database(controlPath);
    this.initializeControlSchema();
  }

  private initializeControlSchema() {
    this.controlDb.exec(`
      CREATE TABLE IF NOT EXISTS Events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eventName TEXT NOT NULL UNIQUE,
        eventPasscodeHash TEXT NOT NULL,
        adminUsername TEXT NOT NULL,
        adminPasswordHash TEXT NOT NULL,
        dbFilePath TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        closedAt TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS Events_single_active_idx
        ON Events(isActive)
        WHERE isActive = 1;
    `);
  }

  private mapEventRow(row: {
    id: number;
    eventName: string;
    adminUsername: string;
    isActive: number;
    createdAt: string;
    closedAt: string | null;
    dbFilePath: string;
  }): EventRecord {
    return {
      id: row.id,
      eventName: row.eventName,
      adminUsername: row.adminUsername,
      isActive: row.isActive === 1,
      createdAt: row.createdAt,
      closedAt: row.closedAt ?? undefined,
      dbFilePath: row.dbFilePath,
    };
  }

  private createEventDatabase(eventId: number) {
    const dbPath = join(this.eventsDir, `event-${eventId}.db`);
    mkdirSync(dirname(dbPath), { recursive: true });
    const eventDb = new Database(dbPath);
    eventDb.exec(`
      CREATE TABLE IF NOT EXISTS EventMeta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        eventId INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);
    eventDb.prepare("INSERT OR IGNORE INTO EventMeta (id, eventId, createdAt) VALUES (1, ?, ?)").run(eventId, new Date().toISOString());
    eventDb.close();
    return dbPath;
  }

  createEvent(input: {
    eventName: string;
    eventPasscode: string;
    adminUsername: string;
    adminPassword: string;
  }) {
    const now = new Date().toISOString();
    const insert = this.controlDb.prepare(
      `
      INSERT INTO Events (eventName, eventPasscodeHash, adminUsername, adminPasswordHash, dbFilePath, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, 0, ?)
      `
    );

    try {
      const result = insert.run(
        input.eventName,
        hashPassword(input.eventPasscode),
        input.adminUsername,
        hashPassword(input.adminPassword),
        "",
        now
      );
      const eventId = Number(result.lastInsertRowid);
      const dbFilePath = this.createEventDatabase(eventId);
      this.controlDb
        .prepare("UPDATE Events SET dbFilePath = ? WHERE id = ?")
        .run(dbFilePath, eventId);

      return this.getEvent(eventId) as EventRecord;
    } catch {
      throw new ApiError(409, "EVENT_ALREADY_EXISTS", "Event name already exists");
    }
  }

  getEvent(eventId: number) {
    const row = this.controlDb
      .prepare(
        "SELECT id, eventName, adminUsername, isActive, createdAt, closedAt, dbFilePath FROM Events WHERE id = ?"
      )
      .get(eventId) as
      | {
          id: number;
          eventName: string;
          adminUsername: string;
          isActive: number;
          createdAt: string;
          closedAt: string | null;
          dbFilePath: string;
        }
      | undefined;

    return row ? this.mapEventRow(row) : null;
  }

  getActiveEvent() {
    const row = this.controlDb
      .prepare(
        "SELECT id, eventName, adminUsername, isActive, createdAt, closedAt, dbFilePath FROM Events WHERE isActive = 1 LIMIT 1"
      )
      .get() as
      | {
          id: number;
          eventName: string;
          adminUsername: string;
          isActive: number;
          createdAt: string;
          closedAt: string | null;
          dbFilePath: string;
        }
      | undefined;

    return row ? this.mapEventRow(row) : null;
  }

  activateEvent(eventId: number) {
    const target = this.getEvent(eventId);
    if (!target) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found");
    }

    if (target.closedAt) {
      throw new ApiError(409, "EVENT_CLOSED", "Closed event cannot be activated");
    }

    this.controlDb.transaction(() => {
      this.controlDb.prepare("UPDATE Events SET isActive = 0 WHERE isActive = 1").run();
      this.controlDb.prepare("UPDATE Events SET isActive = 1 WHERE id = ?").run(eventId);
    })();

    return this.getEvent(eventId) as EventRecord;
  }

  deactivateEvent(eventId: number) {
    const target = this.getEvent(eventId);
    if (!target) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found");
    }

    this.controlDb.prepare("UPDATE Events SET isActive = 0 WHERE id = ?").run(eventId);
    return this.getEvent(eventId) as EventRecord;
  }

  closeEvent(eventId: number) {
    const target = this.getEvent(eventId);
    if (!target) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found");
    }

    const closedAt = new Date().toISOString();
    this.controlDb
      .prepare("UPDATE Events SET isActive = 0, closedAt = ? WHERE id = ?")
      .run(closedAt, eventId);
    return this.getEvent(eventId) as EventRecord;
  }

  deleteEvent(eventId: number) {
    const target = this.getEvent(eventId);
    if (!target) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found");
    }

    this.controlDb.prepare("DELETE FROM Events WHERE id = ?").run(eventId);

    try {
      rmSync(target.dbFilePath, { force: true });
    } catch (error) {
      throw new ApiError(500, "EVENT_DELETE_FAILED", "Failed to delete event database file", error);
    }
  }

  verifyActiveEventPasscode(eventPasscode: string) {
    const row = this.controlDb
      .prepare("SELECT id, eventPasscodeHash FROM Events WHERE isActive = 1 LIMIT 1")
      .get() as { id: number; eventPasscodeHash: string } | undefined;

    if (!row) {
      throw new ApiError(409, "NO_ACTIVE_EVENT", "No active event exists. Activate an event first.");
    }

    if (!verifyPassword(eventPasscode, row.eventPasscodeHash)) {
      throw new ApiError(401, "INVALID_EVENT_PASSCODE", "Invalid event passcode");
    }

    return row.id;
  }

  verifyEventAdminCredentials(eventId: number, username: string, password: string) {
    const row = this.controlDb
      .prepare("SELECT adminUsername, adminPasswordHash, closedAt FROM Events WHERE id = ?")
      .get(eventId) as
      | { adminUsername: string; adminPasswordHash: string; closedAt: string | null }
      | undefined;

    if (!row) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found");
    }

    if (row.closedAt) {
      throw new ApiError(409, "EVENT_CLOSED", "Closed event cannot be used for admin login");
    }

    if (row.adminUsername !== username || !verifyPassword(password, row.adminPasswordHash)) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid admin credentials");
    }
  }
}

