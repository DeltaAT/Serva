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
import { registerConfigRoutes } from "./routes/config";
import { registerMenuRoutes } from "./routes/menu";
import { registerOrderRoutes } from "./routes/orders";
import { registerOpsRoutes } from "./routes/operations";
import { registerPrinterRoutes } from "./routes/printers";
import { registerStockRoutes } from "./routes/stock";
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
        { name: "config", description: "Event configuration endpoints" },
        { name: "menu", description: "Menu categories and items" },
        { name: "orders", description: "Order submission and order history" },
        { name: "printers", description: "Printer management and test-print endpoints" },
        { name: "stock", description: "Stock item management" },
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
  registerConfigRoutes(app);
  registerPrinterRoutes(app);
  registerUserRoutes(app);
  registerMenuRoutes(app);
  registerOrderRoutes(app);
  registerStockRoutes(app);
  registerTableRoutes(app);

  return app;
}

