import Fastify from "fastify";
import {
  ApiErrorEnvelopeSchema,
  OrderSubmitRequestSchema,
  TableQrResolveRequestSchema,
  WaiterSessionStartRequestSchema,
  WaiterSessionStartResponseSchema,
} from "@serva/shared-types";

const app = Fastify({ logger: true });

const contractSmokeTests = {
  waiterSessionStartRequest: WaiterSessionStartRequestSchema.safeParse({
    username: "demo-waiter",
    eventPasscode: "demo-passcode",
  }),
  waiterSessionStartResponse: WaiterSessionStartResponseSchema.safeParse({
    accessToken: "demo-access-token",
    expiresInSeconds: 3600,
    user: {
      id: 1,
      username: "demo-waiter",
      isLocked: false,
    },
  }),
  tableQrResolveRequest: TableQrResolveRequestSchema.safeParse({
    qrValue: "table-qr-1",
  }),
  orderSubmitRequest: OrderSubmitRequestSchema.safeParse({
    tableId: 1,
    items: [{ menuItemId: 1, quantity: 2 }],
  }),
  apiErrorEnvelope: ApiErrorEnvelopeSchema.safeParse({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid request",
    },
  }),
};

void contractSmokeTests;

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }).then(() => {
    console.log(`API running on http://${host}:${port}`);
});