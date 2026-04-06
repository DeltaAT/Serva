import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonEmptyString = z.string().trim().min(1);

export const ConfigurationsSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    value: z.string(),
  })
  .strict();
export type Configurations = z.infer<typeof ConfigurationsSchema>;

export const UsersSchema = z
  .object({
    id: positiveInt,
    username: nonEmptyString,
    isLocked: z.boolean(),
  })
  .strict();
export type Users = z.infer<typeof UsersSchema>;

export const PrintersSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    ipAddress: z.string(),
    connectionDetails: z.string(),
  })
  .strict();
export type Printers = z.infer<typeof PrintersSchema>;

export const OrderDisplaysSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    ipAddress: z.string(),
    connectionDetails: z.string(),
  })
  .strict();
export type OrderDisplays = z.infer<typeof OrderDisplaysSchema>;

export const TablesSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    weight: z.number().int(),
    isLocked: z.boolean(),
  })
  .strict();
export type Tables = z.infer<typeof TablesSchema>;

export const MenuCategoriesSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    description: z.string(),
    isLocked: z.boolean(),
    weight: z.number().int(),
    printer_id: positiveInt,
    orderDisplay_id: positiveInt,
  })
  .strict();
export type MenuCategories = z.infer<typeof MenuCategoriesSchema>;

export const MenuItemsSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    description: z.string(),
    weight: z.number().int(),
    price: z.number().nonnegative(),
    isLocked: z.boolean(),
    menuCategory_id: positiveInt,
  })
  .strict();
export type MenuItems = z.infer<typeof MenuItemsSchema>;

export const StockItemsSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    quantity: z.number().int().nonnegative(),
  })
  .strict();
export type StockItems = z.infer<typeof StockItemsSchema>;

export const StockItemMenuItemSchema = z
  .object({
    stockItem_id: positiveInt,
    menuItem_id: positiveInt,
    quantityRequired: z.number().int().positive(),
  })
  .strict();
export type StockItemMenuItem = z.infer<typeof StockItemMenuItemSchema>;

export const OrdersSchema = z
  .object({
    id: positiveInt,
    timestamp: z.string().datetime(),
    table_id: positiveInt,
    user_id: positiveInt,
  })
  .strict();
export type Orders = z.infer<typeof OrdersSchema>;

export const OrderItemsSchema = z
  .object({
    order_id: positiveInt,
    menuItem_id: positiveInt,
    quantity: z.number().int().positive(),
    specialRequests: z.string(),
  })
  .strict();
export type OrderItems = z.infer<typeof OrderItemsSchema>;

export const UserDtoSchema = z
  .object({
    id: positiveInt,
    username: nonEmptyString,
    isLocked: z.boolean(),
  })
  .strict();
export type UserDto = z.infer<typeof UserDtoSchema>;

export const TableDtoSchema = z
  .object({
    id: positiveInt,
    name: nonEmptyString,
    weight: z.number().int(),
    isLocked: z.boolean(),
  })
  .strict();
export type TableDto = z.infer<typeof TableDtoSchema>;

export const OrderSubmitItemRequestSchema = z
  .object({
    menuItemId: positiveInt,
    quantity: z.number().int().positive(),
    specialRequests: z.string().trim().max(500).optional(),
  })
  .strict();
export type OrderSubmitItemRequest = z.infer<
  typeof OrderSubmitItemRequestSchema
>;

export const OrderItemDtoSchema = z
  .object({
    id: positiveInt,
    menuItemId: positiveInt,
    quantity: z.number().int().positive(),
    specialRequests: z.string().trim().max(500).optional(),
  })
  .strict();
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;

export const OrderDtoSchema = z
  .object({
    id: positiveInt,
    timestamp: z.string().datetime(),
    tableId: positiveInt,
    userId: positiveInt,
    items: z.array(OrderItemDtoSchema),
  })
  .strict();
export type OrderDto = z.infer<typeof OrderDtoSchema>;

export const WaiterSessionStartRequestSchema = z
  .object({
    username: nonEmptyString,
    eventPasscode: nonEmptyString,
  })
  .strict();
export type WaiterSessionStartRequest = z.infer<
  typeof WaiterSessionStartRequestSchema
>;

export const WaiterSessionStartResponseSchema = z
  .object({
    accessToken: nonEmptyString,
    expiresInSeconds: z.number().int().positive(),
    refreshToken: z.string().trim().min(1).optional(),
    user: UserDtoSchema.optional(),
  })
  .strict();
export type WaiterSessionStartResponse = z.infer<
  typeof WaiterSessionStartResponseSchema
>;

export const TableQrResolveRequestSchema = z
  .object({
    qrValue: nonEmptyString,
  })
  .strict();
export type TableQrResolveRequest = z.infer<
  typeof TableQrResolveRequestSchema
>;

export const TableQrResolveResponseSchema = TableDtoSchema;
export type TableQrResolveResponse = TableDto;

export const OrderSubmitRequestSchema = z
  .object({
    tableId: positiveInt,
    items: z.array(OrderSubmitItemRequestSchema).min(1),
  })
  .strict();
export type OrderSubmitRequest = z.infer<typeof OrderSubmitRequestSchema>;

export const OrderSubmitResponseSchema = OrderDtoSchema;
export type OrderSubmitResponse = OrderDto;

export const ApiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: nonEmptyString,
        message: nonEmptyString,
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const SharedModelSchemas = {
  configurations: ConfigurationsSchema,
  menuCategories: MenuCategoriesSchema,
  menuItems: MenuItemsSchema,
  orderDisplays: OrderDisplaysSchema,
  orderItems: OrderItemsSchema,
  orders: OrdersSchema,
  printers: PrintersSchema,
  stockItemMenuItem: StockItemMenuItemSchema,
  stockItems: StockItemsSchema,
  tables: TablesSchema,
  users: UsersSchema,
} as const;

export type SharedModelTypes = {
  configurations: Configurations;
  menuCategories: MenuCategories;
  menuItems: MenuItems;
  orderDisplays: OrderDisplays;
  orderItems: OrderItems;
  orders: Orders;
  printers: Printers;
  stockItemMenuItem: StockItemMenuItem;
  stockItems: StockItems;
  tables: Tables;
  users: Users;
};


