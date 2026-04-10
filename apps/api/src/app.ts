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
import { registerMenuRoutes } from "./routes/menu";
import { registerOpsRoutes } from "./routes/operations";
import { registerTableRoutes } from "./routes/tables";
import { registerUserRoutes } from "./routes/users";

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
        { name: "menu", description: "Menu categories and items" },
        { name: "tables", description: "Table management endpoints" },
        { name: "users", description: "Admin waiter user management endpoints" },
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
  registerUserRoutes(app);
  registerMenuRoutes(app);
  registerTableRoutes(app);

  return app;
}

