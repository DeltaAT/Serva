import {
  AdminSessionStartRequest,
  AdminSessionStartRequestSchema,
  AdminSessionStartResponseSchema,
  ApiErrorEnvelopeSchema,
  AuthLoginRequest,
  AuthLoginRequestSchema,
  AuthLoginResponseSchema,
  AuthMeResponseSchema,
  MasterSessionStartRequest,
  MasterSessionStartRequestSchema,
  MasterSessionStartResponseSchema,
} from "@serva/shared-types";
import type { FastifyInstance } from "fastify";
import { authStore } from "../domain/state";

const TOKEN_TTL_SECONDS = 60 * 60;

export function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: MasterSessionStartRequest }>(
    "/auth/master/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Master login for global event management",
        body: MasterSessionStartRequestSchema,
        response: {
          200: MasterSessionStartResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          500: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      authStore.authenticateMaster(request.body);
      const accessToken = await app.jwt.sign(
        { role: "master" },
        { expiresIn: TOKEN_TTL_SECONDS }
      );
      return {
        accessToken,
        expiresInSeconds: TOKEN_TTL_SECONDS,
        role: "master" as const,
      };
    }
  );

  app.post<{ Body: AdminSessionStartRequest }>(
    "/auth/admin/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Event admin login with username/password",
        body: AdminSessionStartRequestSchema,
        response: {
          200: AdminSessionStartResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
          500: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const result = authStore.authenticateAdmin(request.body);
      const accessToken = await app.jwt.sign(
        {
          role: "admin",
          eventId: result.eventId,
          username: request.body.username,
        },
        { expiresIn: TOKEN_TTL_SECONDS }
      );

      return {
        accessToken,
        expiresInSeconds: TOKEN_TTL_SECONDS,
        role: "admin" as const,
        eventId: result.eventId,
      };
    }
  );

  app.post<{ Body: AuthLoginRequest }>(
    "/auth/login",
    {
      config: {
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["auth"],
        summary: "Login with username and event passcode",
        body: AuthLoginRequestSchema,
        response: {
          200: AuthLoginResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const waiter = authStore.loginWaiter(request.body);
      const accessToken = await app.jwt.sign(
        {
          role: "waiter",
          eventId: waiter.eventId,
          username: waiter.user.username,
        },
        { expiresIn: TOKEN_TTL_SECONDS }
      );

      return {
        accessToken,
        expiresInSeconds: TOKEN_TTL_SECONDS,
        role: "waiter" as const,
        eventId: waiter.eventId,
        user: {
          id: waiter.user.id,
          username: waiter.user.username,
          isLocked: waiter.user.isLocked,
        },
      };
    }
  );

  app.get(
    "/auth/me",
    {
      config: {
        requiresAuth: true,
      },
      schema: {
        tags: ["auth"],
        summary: "Get current user from access token",
        security: [{ bearerAuth: [] }],
        response: {
          200: AuthMeResponseSchema,
          401: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => authStore.getPrincipalFromClaims(request.auth)
  );
}

