import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { registerActiveEventGuard } from "./plugins/active-event-guard";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerJwtAuthGuard } from "./plugins/jwt-auth-guard";
import { registerAdminEventRoutes } from "./routes/admin-events";
import { registerAuthRoutes } from "./routes/auth";
import { registerOpsRoutes } from "./routes/operations";

export async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "dev-jwt-secret-change-me",
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Serva API",
        description: "Runtime-validated contracts shared across frontend and backend",
        version: "1.0.0",
      },
      tags: [
        { name: "admin-events", description: "Admin event lifecycle endpoints" },
        { name: "auth", description: "Authentication endpoints" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "Token",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  registerErrorHandler(app);
  registerJwtAuthGuard(app);
  registerActiveEventGuard(app);
  registerOpsRoutes(app);
  registerAdminEventRoutes(app);
  registerAuthRoutes(app);

  return app;
}

