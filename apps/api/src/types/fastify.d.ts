import "fastify";
import "@fastify/jwt";

type SessionRole = "master" | "admin" | "waiter";

declare module "fastify" {
  interface FastifyContextConfig {
    requiresActiveEvent?: boolean;
    requiresAuth?: boolean;
    requiresRole?: SessionRole;
  }

  interface FastifyRequest {
    auth: {
      role: SessionRole;
      eventId?: number;
      username?: string;
    };
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      role: SessionRole;
      eventId?: number;
      username?: string;
    };
    user: {
      role: SessionRole;
      eventId?: number;
      username?: string;
    };
  }
}

