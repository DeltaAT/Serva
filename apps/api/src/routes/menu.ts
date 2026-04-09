import {
  ApiErrorEnvelopeSchema,
  MenuCategoryCreateRequest,
  MenuCategoryCreateRequestSchema,
  MenuCategoryCreateResponseSchema,
  MenuCategoryParams,
  MenuCategoryParamsSchema,
  MenuCategoryUpdateRequest,
  MenuCategoryUpdateRequestSchema,
  MenuCategoryUpdateResponseSchema,
  MenuCategoriesQuery,
  MenuCategoriesQuerySchema,
  MenuCategoriesResponseSchema,
  MenuItemCreateRequest,
  MenuItemCreateRequestSchema,
  MenuItemCreateResponseSchema,
  MenuItemParams,
  MenuItemParamsSchema,
  MenuItemUpdateRequest,
  MenuItemUpdateRequestSchema,
  MenuItemUpdateResponseSchema,
  MenuItemsQuery,
  MenuItemsQuerySchema,
  MenuItemsResponseSchema,
} from "@serva/shared-types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { menuStore } from "../domain/state";

export function registerMenuRoutes(app: FastifyInstance) {
  app.get<{ Querystring: MenuCategoriesQuery }>(
    "/menu/categories",
    {
      config: {
        requiresRole: "waiter",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Get menu categories for the active event",
        description:
          "Examples: /menu/categories?locked=false and /menu/categories?includeRouting=true",
        security: [{ bearerAuth: [] }],
        querystring: MenuCategoriesQuerySchema,
        response: {
          200: MenuCategoriesResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return {
        categories: menuStore.listCategories({
          locked: request.query.locked,
          includeRouting: request.query.includeRouting,
        }),
      };
    }
  );

  app.get<{ Querystring: MenuItemsQuery }>(
    "/menu/items",
    {
      config: {
        requiresRole: "waiter",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Get menu items for the active event",
        description:
          "Examples: /menu/items?categoryId=2&sort=weight,name and /menu/items?locked=false",
        security: [{ bearerAuth: [] }],
        querystring: MenuItemsQuerySchema,
        response: {
          200: MenuItemsResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return {
        items: menuStore.listItems({
          categoryId: request.query.categoryId,
          locked: request.query.locked,
        }),
      };
    }
  );

  app.post<{ Body: MenuCategoryCreateRequest }>(
    "/menu/categories",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Create a menu category",
        security: [{ bearerAuth: [] }],
        body: MenuCategoryCreateRequestSchema,
        response: {
          201: MenuCategoryCreateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = menuStore.createCategory(request.body);
      return reply.status(201).send(created);
    }
  );

  app.patch<{ Params: MenuCategoryParams; Body: MenuCategoryUpdateRequest }>(
    "/menu/categories/:categoryId",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Update a menu category",
        security: [{ bearerAuth: [] }],
        params: MenuCategoryParamsSchema,
        body: MenuCategoryUpdateRequestSchema,
        response: {
          200: MenuCategoryUpdateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return menuStore.updateCategory(request.params.categoryId, request.body);
    }
  );

  app.delete<{ Params: MenuCategoryParams }>(
    "/menu/categories/:categoryId",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Delete a menu category",
        security: [{ bearerAuth: [] }],
        params: MenuCategoryParamsSchema,
        response: {
          204: z.null(),
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      menuStore.deleteCategory(request.params.categoryId);
      return reply.status(204).send();
    }
  );

  app.post<{ Body: MenuItemCreateRequest }>(
    "/menu/items",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Create a menu item",
        security: [{ bearerAuth: [] }],
        body: MenuItemCreateRequestSchema,
        response: {
          201: MenuItemCreateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = menuStore.createItem(request.body);
      return reply.status(201).send(created);
    }
  );

  app.patch<{ Params: MenuItemParams; Body: MenuItemUpdateRequest }>(
    "/menu/items/:menuItemId",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Update a menu item",
        security: [{ bearerAuth: [] }],
        params: MenuItemParamsSchema,
        body: MenuItemUpdateRequestSchema,
        response: {
          200: MenuItemUpdateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return menuStore.updateItem(request.params.menuItemId, request.body);
    }
  );

  app.delete<{ Params: MenuItemParams }>(
    "/menu/items/:menuItemId",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["menu"],
        summary: "Delete a menu item",
        security: [{ bearerAuth: [] }],
        params: MenuItemParamsSchema,
        response: {
          204: z.null(),
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      menuStore.deleteItem(request.params.menuItemId);
      return reply.status(204).send();
    }
  );
}

