import Database from "better-sqlite3";
import type {
  PrinterCreateRequest,
  PrinterDto,
  PrinterTestPrintResponse,
  PrinterUpdateRequest,
} from "@serva/shared-types";
import { PrinterTypes, ThermalPrinter } from "node-thermal-printer";
import { ApiError } from "./api-error";
import type { EventStore } from "./event-store";

type PrinterRow = {
  id: number;
  name: string;
  ipAddress: string;
  connectionDetails: string;
};

export class PrinterStore {
  constructor(private readonly eventStore: EventStore) {}

  private openActiveEventDb() {
    const activeEvent = this.eventStore.getActiveEvent();
    if (!activeEvent) {
      throw new ApiError(
        409,
        "NO_ACTIVE_EVENT",
        "No active event exists. Activate an event before calling this endpoint."
      );
    }

    const db = new Database(activeEvent.dbFilePath);
    this.ensurePrinterSchema(db);
    return db;
  }

  private ensurePrinterSchema(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Printers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ipAddress TEXT NOT NULL,
        connectionDetails TEXT NOT NULL DEFAULT ''
      );

      CREATE UNIQUE INDEX IF NOT EXISTS Printers_name_key ON Printers(name);
    `);
  }

  private mapDbError(error: unknown): never {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new ApiError(409, "PRINTER_ALREADY_EXISTS", "Printer name already exists");
    }

    throw error;
  }

  private toPrinterDto(row: PrinterRow): PrinterDto {
    return {
      id: row.id,
      name: row.name,
      ipAddress: row.ipAddress,
      connectionDetails: row.connectionDetails,
    };
  }

  private getPrinterRowById(db: Database.Database, printerId: number) {
    return db
      .prepare(
        `
        SELECT id, name, ipAddress, connectionDetails
        FROM Printers
        WHERE id = ?
        `
      )
      .get(printerId) as PrinterRow | undefined;
  }

  private getPort(connectionDetails: string) {
    const trimmed = connectionDetails.trim();
    if (!trimmed) {
      return 9100;
    }

    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }

    return 9100;
  }

  listPrinters(): PrinterDto[] {
    const db = this.openActiveEventDb();
    try {
      const rows = db
        .prepare(
          `
          SELECT id, name, ipAddress, connectionDetails
          FROM Printers
          ORDER BY name COLLATE NOCASE ASC
          `
        )
        .all() as PrinterRow[];
      return rows.map((row) => this.toPrinterDto(row));
    } finally {
      db.close();
    }
  }

  getPrinter(printerId: number): PrinterDto {
    const db = this.openActiveEventDb();
    try {
      const row = this.getPrinterRowById(db, printerId);
      if (!row) {
        throw new ApiError(404, "PRINTER_NOT_FOUND", "Printer not found");
      }

      return this.toPrinterDto(row);
    } finally {
      db.close();
    }
  }

  createPrinter(input: PrinterCreateRequest): PrinterDto {
    const db = this.openActiveEventDb();
    try {
      let result: Database.RunResult;
      try {
        result = db
          .prepare("INSERT INTO Printers (name, ipAddress, connectionDetails) VALUES (?, ?, ?)")
          .run(input.name, input.ipAddress, input.connectionDetails ?? "");
      } catch (error) {
        this.mapDbError(error);
      }

      const created = this.getPrinterRowById(db, Number(result!.lastInsertRowid));
      if (!created) {
        throw new ApiError(500, "PRINTER_CREATE_FAILED", "Failed to create printer");
      }

      return this.toPrinterDto(created);
    } finally {
      db.close();
    }
  }

  updatePrinter(printerId: number, input: PrinterUpdateRequest): PrinterDto {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getPrinterRowById(db, printerId);
      if (!existing) {
        throw new ApiError(404, "PRINTER_NOT_FOUND", "Printer not found");
      }

      try {
        db
          .prepare(
            `
            UPDATE Printers
            SET name = ?, ipAddress = ?, connectionDetails = ?
            WHERE id = ?
            `
          )
          .run(
            input.name ?? existing.name,
            input.ipAddress ?? existing.ipAddress,
            input.connectionDetails ?? existing.connectionDetails,
            printerId
          );
      } catch (error) {
        this.mapDbError(error);
      }

      const updated = this.getPrinterRowById(db, printerId);
      if (!updated) {
        throw new ApiError(500, "PRINTER_UPDATE_FAILED", "Failed to update printer");
      }

      return this.toPrinterDto(updated);
    } finally {
      db.close();
    }
  }

  deletePrinter(printerId: number): void {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getPrinterRowById(db, printerId);
      if (!existing) {
        throw new ApiError(404, "PRINTER_NOT_FOUND", "Printer not found");
      }

      const usage = db
        .prepare("SELECT COUNT(*) as count FROM MenuCategories WHERE printer_id = ?")
        .get(printerId) as { count: number };
      if (usage.count > 0) {
        throw new ApiError(
          409,
          "PRINTER_IN_USE",
          "Cannot delete printer while it is assigned to menu categories"
        );
      }

      db.prepare("DELETE FROM Printers WHERE id = ?").run(printerId);
    } finally {
      db.close();
    }
  }

  async sendTestPrint(printerId: number): Promise<PrinterTestPrintResponse> {
    const db = this.openActiveEventDb();
    try {
      const printerRow = this.getPrinterRowById(db, printerId);
      if (!printerRow) {
        throw new ApiError(404, "PRINTER_NOT_FOUND", "Printer not found");
      }

      const port = this.getPort(printerRow.connectionDetails);
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${printerRow.ipAddress}:${port}`,
        options: { timeout: 4000 },
      });

      const connected = await printer.isPrinterConnected();
      if (!connected) {
        throw new ApiError(
          409,
          "PRINTER_CONNECTION_FAILED",
          "Could not connect to thermal printer"
        );
      }

      const now = new Date().toISOString();
      printer.alignCenter();
      printer.bold(true);
      printer.println("Serva Print Demo");
      printer.bold(false);
      printer.drawLine();

      printer.alignLeft();
      printer.println(`Printer: ${printerRow.name}`);
      printer.println(`Address: ${printerRow.ipAddress}:${port}`);
      printer.println(`Time: ${now}`);
      printer.newLine();

      //printer.println("Textgroessen:");
      //printer.setTextNormal();
      //printer.println("Normal");
      //printer.setTextDoubleHeight();
      //printer.println("Double Height");
      //printer.setTextDoubleWidth();
      //printer.println("Double Width");
      //printer.setTextQuadArea();
      //printer.println("Quad Area");
      //printer.setTextSize(1, 1);
      //printer.println("Text 1, 1");
      //printer.setTextSize(2, 2);
      //printer.println("Text 2, 2");
      //printer.setTextSize(3, 3);
      //printer.println("Text 3, 3");
      //printer.setTextNormal();
      //printer.newLine();
//
      //printer.println("Stile:");
      //printer.bold(true);
      //printer.println("Bold");
      //printer.bold(false);
      //printer.underline(true);
      //printer.println("Underline");
      //printer.underline(false);
      //printer.invert(true);
      //printer.println("Invert");
      //printer.invert(false);

      printer.drawLine();
      printer.println("Ende Testdruck");
      printer.newLine();
      printer.cut();

      await printer.execute();
      return {
        ok: true,
        message: "Test print sent successfully",
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(409, "PRINTER_CONNECTION_FAILED", "Thermal printer request failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      db.close();
    }
  }
}

