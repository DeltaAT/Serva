import {
  ApiErrorEnvelopeSchema,
  OrderGetResponseSchema,
  OrderParams,
  OrderParamsSchema,
  OrdersQuery,
  OrdersQuerySchema,
  OrdersResponseSchema,
  OrderSubmitRequest,
  OrderSubmitRequestSchema,
  OrderSubmitResponseSchema,
} from "@serva/shared-types";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../domain/api-error";
import { orderStore } from "../domain/state";

export function registerOrderRoutes(app: FastifyInstance) {
  app.get<{ Querystring: OrdersQuery }>(
    "/orders",
    {
      config: {
        requiresAuth: true,
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["orders"],
        operationId: "ordersList",
        summary: "Bestellungen auflisten",
        description:
          "Liefert Bestellungen des aktiven Events. Waiter sehen nur eigene Bestellungen. Query: tableId, userId, from, to.",
        security: [{ bearerAuth: [] }],
        querystring: OrdersQuerySchema,
        response: {
          200: OrdersResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          423: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      if (request.auth.role === "master") {
        throw new ApiError(403, "FORBIDDEN", "Only waiter/admin roles can access orders");
      }

      return {
        orders: orderStore.listOrders(request.query, {
          role: request.auth.role,
          username: request.auth.username,
        }),
      };
    }
  );

  app.post<{ Body: OrderSubmitRequest }>(
    "/orders",
    {
      config: {
        requiresAuth: true,
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["orders"],
        operationId: "ordersCreate",
        summary: "Bestellung anlegen",
        description:
          "Erstellt eine neue Bestellung fuer den authentifizierten User. Locked Tables/Items/Categories erzeugen 409, Out-of-stock 422.",
        security: [{ bearerAuth: [] }],
        body: OrderSubmitRequestSchema,
        response: {
          201: OrderSubmitResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          423: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
          422: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role === "master") {
        throw new ApiError(403, "FORBIDDEN", "Only waiter/admin roles can submit orders");
      }

      const created = orderStore.submitOrder(request.body, {
        role: request.auth.role,
        username: request.auth.username,
      });
      return reply.status(201).send(created);
    }
  );

  app.get<{ Params: OrderParams }>(
    "/orders/:orderId",
    {
      config: {
        requiresAuth: true,
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["orders"],
        operationId: "ordersGetById",
        summary: "Bestellung im Detail abrufen",
        description:
          "Liefert Bestellung inkl. Items. Waiter duerfen nur eigene Bestellungen lesen.",
        security: [{ bearerAuth: [] }],
        params: OrderParamsSchema,
        response: {
          200: OrderGetResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          423: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      if (request.auth.role === "master") {
        throw new ApiError(403, "FORBIDDEN", "Only waiter/admin roles can access orders");
      }

      return orderStore.getOrder(request.params.orderId, {
        role: request.auth.role,
        username: request.auth.username,
      });
    }
  );
}

