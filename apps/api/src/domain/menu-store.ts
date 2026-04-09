import Database from "better-sqlite3";
import type {
  MenuCategoryCreateRequest,
  MenuCategoryDto,
  MenuCategoryUpdateRequest,
  MenuItemCreateRequest,
  MenuItemDto,
  MenuItemUpdateRequest,
} from "@serva/shared-types";
import { ApiError } from "./api-error";
import type { EventStore } from "./event-store";

type ListMenuCategoriesInput = {
  locked?: boolean;
  includeRouting?: boolean;
};

type ListMenuItemsInput = {
  categoryId?: number;
  locked?: boolean;
};

type CategoryRow = {
  id: number;
  name: string;
  description: string;
  isLocked: number;
  weight: number;
  printerId: number | null;
  orderDisplayId: number | null;
};

type ItemRow = {
  id: number;
  name: string;
  description: string;
  weight: number;
  price: number;
  isLocked: number;
  menuCategoryId: number;
};

export class MenuStore {
  constructor(private readonly eventStore: EventStore) {}

  private toCategoryDto(row: CategoryRow, includeRouting = true): MenuCategoryDto {
    const category: MenuCategoryDto = {
      id: row.id,
      name: row.name,
      description: row.description,
      isLocked: row.isLocked === 1,
      weight: row.weight,
    };

    if (includeRouting) {
      if (row.printerId !== null) {
        category.printerId = row.printerId;
      }
      if (row.orderDisplayId !== null) {
        category.orderDisplayId = row.orderDisplayId;
      }
    }

    return category;
  }

  private toItemDto(row: ItemRow): MenuItemDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      weight: row.weight,
      price: row.price,
      isLocked: row.isLocked === 1,
      menuCategoryId: row.menuCategoryId,
    };
  }

  private getCategoryRow(db: Database.Database, categoryId: number) {
    return db
      .prepare(
        `
        SELECT
          id,
          name,
          description,
          isLocked,
          weight,
          printer_id as printerId,
          orderDisplay_id as orderDisplayId
        FROM MenuCategories
        WHERE id = ?
        `
      )
      .get(categoryId) as CategoryRow | undefined;
  }

  private getItemRow(db: Database.Database, menuItemId: number) {
    return db
      .prepare(
        `
        SELECT
          id,
          name,
          description,
          weight,
          price,
          isLocked,
          menuCategory_id as menuCategoryId
        FROM MenuItems
        WHERE id = ?
        `
      )
      .get(menuItemId) as ItemRow | undefined;
  }

  private assertCategoryExists(db: Database.Database, categoryId: number) {
    const row = db
      .prepare("SELECT id FROM MenuCategories WHERE id = ?")
      .get(categoryId) as { id: number } | undefined;

    if (!row) {
      throw new ApiError(404, "MENU_CATEGORY_NOT_FOUND", "Menu category not found");
    }
  }

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
    this.ensureMenuSchema(db);
    return db;
  }

  private ensureMenuSchema(db: Database.Database) {
    // Backfill minimal menu tables for existing event DBs created before menu endpoints.
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
  }

  listCategories(input: ListMenuCategoriesInput): MenuCategoryDto[] {
    const db = this.openActiveEventDb();
    try {
      const where: string[] = [];
      const params: Array<string | number> = [];

      if (input.locked !== undefined) {
        where.push("isLocked = ?");
        params.push(input.locked ? 1 : 0);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const rows = db
        .prepare(
          `
          SELECT
            id,
            name,
            description,
            isLocked,
            weight,
            printer_id as printerId,
            orderDisplay_id as orderDisplayId
          FROM MenuCategories
          ${whereClause}
          ORDER BY weight ASC, name COLLATE NOCASE ASC
          `
        )
        .all(...params) as CategoryRow[];

      return rows.map((row) => this.toCategoryDto(row, Boolean(input.includeRouting)));
    } finally {
      db.close();
    }
  }

  listItems(input: ListMenuItemsInput): MenuItemDto[] {
    const db = this.openActiveEventDb();
    try {
      const where: string[] = [];
      const params: Array<string | number> = [];

      if (input.categoryId !== undefined) {
        where.push("menuCategory_id = ?");
        params.push(input.categoryId);
      }

      if (input.locked !== undefined) {
        where.push("isLocked = ?");
        params.push(input.locked ? 1 : 0);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const rows = db
        .prepare(
          `
          SELECT
            id,
            name,
            description,
            weight,
            price,
            isLocked,
            menuCategory_id as menuCategoryId
          FROM MenuItems
          ${whereClause}
          ORDER BY weight ASC, name COLLATE NOCASE ASC
          `
        )
        .all(...params) as ItemRow[];

      return rows.map((row) => this.toItemDto(row));
    } finally {
      db.close();
    }
  }

  createCategory(input: MenuCategoryCreateRequest): MenuCategoryDto {
    const db = this.openActiveEventDb();
    try {
      const result = db
        .prepare(
          `
          INSERT INTO MenuCategories (name, description, isLocked, weight, printer_id, orderDisplay_id)
          VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          input.name,
          input.description ?? "",
          input.isLocked ? 1 : 0,
          input.weight ?? 0,
          input.printerId ?? null,
          input.orderDisplayId ?? null
        );

      const created = this.getCategoryRow(db, Number(result.lastInsertRowid));
      if (!created) {
        throw new ApiError(500, "MENU_CATEGORY_CREATE_FAILED", "Failed to create menu category");
      }

      return this.toCategoryDto(created, true);
    } finally {
      db.close();
    }
  }

  updateCategory(categoryId: number, input: MenuCategoryUpdateRequest): MenuCategoryDto {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getCategoryRow(db, categoryId);
      if (!existing) {
        throw new ApiError(404, "MENU_CATEGORY_NOT_FOUND", "Menu category not found");
      }

      db
        .prepare(
          `
          UPDATE MenuCategories
          SET
            name = ?,
            description = ?,
            isLocked = ?,
            weight = ?,
            printer_id = ?,
            orderDisplay_id = ?
          WHERE id = ?
          `
        )
        .run(
          input.name ?? existing.name,
          input.description ?? existing.description,
          input.isLocked === undefined ? existing.isLocked : input.isLocked ? 1 : 0,
          input.weight ?? existing.weight,
          input.printerId ?? existing.printerId,
          input.orderDisplayId ?? existing.orderDisplayId,
          categoryId
        );

      const updated = this.getCategoryRow(db, categoryId);
      if (!updated) {
        throw new ApiError(500, "MENU_CATEGORY_UPDATE_FAILED", "Failed to update menu category");
      }

      return this.toCategoryDto(updated, true);
    } finally {
      db.close();
    }
  }

  deleteCategory(categoryId: number): void {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getCategoryRow(db, categoryId);
      if (!existing) {
        throw new ApiError(404, "MENU_CATEGORY_NOT_FOUND", "Menu category not found");
      }

      const itemCount = db
        .prepare("SELECT COUNT(*) as count FROM MenuItems WHERE menuCategory_id = ?")
        .get(categoryId) as { count: number };
      if (itemCount.count > 0) {
        throw new ApiError(
          409,
          "MENU_CATEGORY_NOT_EMPTY",
          "Cannot delete category while it still contains menu items"
        );
      }

      db.prepare("DELETE FROM MenuCategories WHERE id = ?").run(categoryId);
    } finally {
      db.close();
    }
  }

  createItem(input: MenuItemCreateRequest): MenuItemDto {
    const db = this.openActiveEventDb();
    try {
      this.assertCategoryExists(db, input.menuCategoryId);
      const result = db
        .prepare(
          `
          INSERT INTO MenuItems (name, description, weight, price, isLocked, menuCategory_id)
          VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          input.name,
          input.description ?? "",
          input.weight ?? 0,
          input.price,
          input.isLocked ? 1 : 0,
          input.menuCategoryId
        );

      const created = this.getItemRow(db, Number(result.lastInsertRowid));
      if (!created) {
        throw new ApiError(500, "MENU_ITEM_CREATE_FAILED", "Failed to create menu item");
      }

      return this.toItemDto(created);
    } finally {
      db.close();
    }
  }

  updateItem(menuItemId: number, input: MenuItemUpdateRequest): MenuItemDto {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getItemRow(db, menuItemId);
      if (!existing) {
        throw new ApiError(404, "MENU_ITEM_NOT_FOUND", "Menu item not found");
      }

      if (input.menuCategoryId !== undefined) {
        this.assertCategoryExists(db, input.menuCategoryId);
      }

      db
        .prepare(
          `
          UPDATE MenuItems
          SET
            name = ?,
            description = ?,
            weight = ?,
            price = ?,
            isLocked = ?,
            menuCategory_id = ?
          WHERE id = ?
          `
        )
        .run(
          input.name ?? existing.name,
          input.description ?? existing.description,
          input.weight ?? existing.weight,
          input.price ?? existing.price,
          input.isLocked === undefined ? existing.isLocked : input.isLocked ? 1 : 0,
          input.menuCategoryId ?? existing.menuCategoryId,
          menuItemId
        );

      const updated = this.getItemRow(db, menuItemId);
      if (!updated) {
        throw new ApiError(500, "MENU_ITEM_UPDATE_FAILED", "Failed to update menu item");
      }

      return this.toItemDto(updated);
    } finally {
      db.close();
    }
  }

  deleteItem(menuItemId: number): void {
    const db = this.openActiveEventDb();
    try {
      const existing = this.getItemRow(db, menuItemId);
      if (!existing) {
        throw new ApiError(404, "MENU_ITEM_NOT_FOUND", "Menu item not found");
      }

      db.prepare("DELETE FROM MenuItems WHERE id = ?").run(menuItemId);
    } finally {
      db.close();
    }
  }
}

