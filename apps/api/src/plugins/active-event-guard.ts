import type { FastifyInstance } from "fastify";
import { ApiError } from "../domain/api-error";
import { eventStore } from "../domain/state";

export function registerActiveEventGuard(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    const routeConfig = request.routeOptions.config;
    if (!routeConfig.requiresActiveEvent) {
      return;
    }

    if (!eventStore.getActiveEvent()) {
      throw new ApiError(
        409,
        "NO_ACTIVE_EVENT",
        "No active event exists. Activate an event before calling this endpoint."
      );
    }
  });
}

