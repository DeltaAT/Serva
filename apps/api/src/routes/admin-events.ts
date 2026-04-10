import {
  AdminEventActivateResponseSchema,
  AdminEventCreateRequest,
  AdminEventCreateRequestSchema,
  AdminEventCreateResponseSchema,
  AdminEventDeactivateResponseSchema,
  ApiErrorEnvelopeSchema,
  ActiveEventResponseSchema,
} from "@serva/shared-types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventStore } from "../domain/state";
import { ApiError } from "../domain/api-error";

const EventIdParamsSchema = z.object({ eventId: z.coerce.number().int().positive() });
type EventIdParams = z.infer<typeof EventIdParamsSchema>;

function toEventDto(event: {
  id: number;
  eventName: string;
  adminUsername: string;
  isActive: boolean;
  createdAt: string;
  closedAt?: string;
}) {
  return {
    id: event.id,
    eventName: event.eventName,
    adminUsername: event.adminUsername,
    isActive: event.isActive,
    createdAt: event.createdAt,
    closedAt: event.closedAt,
  };
}

export function registerAdminEventRoutes(app: FastifyInstance) {
  app.post<{ Body: AdminEventCreateRequest }>(
    "/admin/events",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Create a new event",
        security: [{ bearerAuth: [] }],
        body: AdminEventCreateRequestSchema,
        response: {
          201: AdminEventCreateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = eventStore.createEvent(request.body);
      return reply.status(201).send(toEventDto(created));
    }
  );

  app.post<{ Params: EventIdParams }>(
    "/admin/events/:eventId/activate",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Activate an event (deactivates any previously active event)",
        security: [{ bearerAuth: [] }],
        params: EventIdParamsSchema,
        response: {
          200: AdminEventActivateResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => toEventDto(eventStore.activateEvent(request.params.eventId))
  );

  app.post<{ Params: EventIdParams }>(
    "/admin/events/:eventId/deactivate",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Deactivate an event",
        security: [{ bearerAuth: [] }],
        params: EventIdParamsSchema,
        response: {
          200: AdminEventDeactivateResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => toEventDto(eventStore.deactivateEvent(request.params.eventId))
  );

  app.post<{ Params: EventIdParams }>(
    "/admin/events/:eventId/close",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Close an event",
        security: [{ bearerAuth: [] }],
        params: EventIdParamsSchema,
        response: {
          200: AdminEventDeactivateResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => toEventDto(eventStore.closeEvent(request.params.eventId))
  );

  app.get(
    "/admin/events/active",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Get active event",
        security: [{ bearerAuth: [] }],
        response: {
          200: ActiveEventResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async () => {
      const activeEvent = eventStore.getActiveEvent();
      if (!activeEvent) {
        throw new ApiError(
          409,
          "NO_ACTIVE_EVENT",
          "No active event exists. Activate an event first."
        );
      }

      return toEventDto(activeEvent);
    }
  );

  app.delete<{ Params: EventIdParams }>(
    "/admin/events/:eventId",
    {
      config: {
        requiresRole: "master",
      },
      schema: {
        tags: ["admin-events"],
        summary: "Delete an event",
        security: [{ bearerAuth: [] }],
        params: EventIdParamsSchema,
        response: {
          204: z.null(),
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      eventStore.deleteEvent(request.params.eventId);
      return reply.status(204).send();
    }
  );
}

