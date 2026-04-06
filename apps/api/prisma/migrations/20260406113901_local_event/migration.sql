-- CreateTable
CREATE TABLE "Configurations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "MenuCategories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL,
    "weight" INTEGER NOT NULL,
    "printer_id" INTEGER NOT NULL,
    "orderDisplay_id" INTEGER NOT NULL,
    CONSTRAINT "MenuCategories_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "Printers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MenuCategories_orderDisplay_id_fkey" FOREIGN KEY ("orderDisplay_id") REFERENCES "OrderDisplays" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuItems" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "isLocked" BOOLEAN NOT NULL,
    "menuCategory_id" INTEGER NOT NULL,
    CONSTRAINT "MenuItems_menuCategory_id_fkey" FOREIGN KEY ("menuCategory_id") REFERENCES "MenuCategories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "StockItems" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "StockItemMenuItem" (
    "stockItem_id" INTEGER NOT NULL,
    "menuItem_id" INTEGER NOT NULL,
    "quantityRequired" INTEGER NOT NULL,

    PRIMARY KEY ("stockItem_id", "menuItem_id"),
    CONSTRAINT "StockItemMenuItem_stockItem_id_fkey" FOREIGN KEY ("stockItem_id") REFERENCES "StockItems" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockItemMenuItem_menuItem_id_fkey" FOREIGN KEY ("menuItem_id") REFERENCES "MenuItems" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL,
    "table_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "Orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "Tables" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItems" (
    "order_id" INTEGER NOT NULL,
    "menuItem_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "specialRequests" TEXT NOT NULL,

    PRIMARY KEY ("order_id", "menuItem_id"),
    CONSTRAINT "OrderItems_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItems_menuItem_id_fkey" FOREIGN KEY ("menuItem_id") REFERENCES "MenuItems" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Printers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "connectionDetails" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "OrderDisplays" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "connectionDetails" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Configurations_name_key" ON "Configurations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE INDEX "MenuCategories_printer_id_idx" ON "MenuCategories"("printer_id");

-- CreateIndex
CREATE INDEX "MenuCategories_orderDisplay_id_idx" ON "MenuCategories"("orderDisplay_id");

-- CreateIndex
CREATE INDEX "MenuItems_menuCategory_id_idx" ON "MenuItems"("menuCategory_id");

-- CreateIndex
CREATE INDEX "StockItemMenuItem_menuItem_id_idx" ON "StockItemMenuItem"("menuItem_id");

-- CreateIndex
CREATE INDEX "Orders_table_id_idx" ON "Orders"("table_id");

-- CreateIndex
CREATE INDEX "Orders_user_id_idx" ON "Orders"("user_id");

-- CreateIndex
CREATE INDEX "OrderItems_menuItem_id_idx" ON "OrderItems"("menuItem_id");
