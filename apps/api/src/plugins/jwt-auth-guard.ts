import type { FastifyInstance } from "fastify";
import { ApiError } from "../domain/api-error";

const roleOrder = {
  waiter: 1,
  admin: 2,
  master: 3,
} as const;

export function registerJwtAuthGuard(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    const routeConfig = request.routeOptions.config;
    const requiresAuth = Boolean(routeConfig?.requiresAuth || routeConfig?.requiresRole);
    if (!requiresAuth) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing bearer token");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing bearer token");
    }

    try {
      const payload = await request.jwtVerify<{
        role: "master" | "admin" | "waiter";
        eventId?: number;
        username?: string;
      }>();
      request.auth = payload;
    } catch {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid access token");
    }

    const minRole = routeConfig?.requiresRole;
    if (!minRole) {
      return;
    }

    if (roleOrder[request.auth.role] < roleOrder[minRole]) {
      throw new ApiError(403, "FORBIDDEN", `${minRole} role required`);
    }
  });
}

