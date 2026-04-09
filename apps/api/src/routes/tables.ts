import {
  ApiErrorEnvelopeSchema,
  TableBulkCreateRequest,
  TableBulkCreateRequestSchema,
  TableBulkCreateResponseSchema,
  TableCreateRequest,
  TableCreateRequestSchema,
  TableCreateResponseSchema,
  TableParams,
  TableParamsSchema,
  TablesQuery,
  TablesQuerySchema,
  TablesResponseSchema,
  TableUpdateRequest,
  TableUpdateRequestSchema,
  TableUpdateResponseSchema,
} from "@serva/shared-types";
import type { FastifyInstance } from "fastify";
import { tableStore } from "../domain/state";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildTableQrSvg(input: { id: number; name: string }) {
  const text = `${input.name} (#${input.id})`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect x="0" y="0" width="320" height="320" fill="#ffffff" />
  <rect x="20" y="20" width="280" height="280" fill="#000000" />
  <rect x="40" y="40" width="240" height="240" fill="#ffffff" />
  <text x="160" y="160" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="16" fill="#000000">${escapeXml(
    text
  )}</text>
</svg>`;
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function buildSimplePdf(lines: string[]) {
  const content = lines
    .map((line, index) => `BT /F1 12 Tf 50 ${780 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream\nendobj\n`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += object;
  }

  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

export function registerTableRoutes(app: FastifyInstance) {
  app.get<{ Querystring: TablesQuery }>(
    "/tables",
    {
      config: {
        requiresRole: "waiter",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Get tables for the active event",
        description: "Examples: /tables?locked=false and /tables?sort=weight,name",
        security: [{ bearerAuth: [] }],
        querystring: TablesQuerySchema,
        response: {
          200: TablesResponseSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return {
        tables: tableStore.listTables({
          locked: request.query.locked,
        }),
      };
    }
  );

  app.post<{ Body: TableCreateRequest }>(
    "/tables",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Create a table",
        security: [{ bearerAuth: [] }],
        body: TableCreateRequestSchema,
        response: {
          201: TableCreateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = tableStore.createTable(request.body);
      return reply.status(201).send(created);
    }
  );

  app.post<{ Body: TableBulkCreateRequest }>(
    "/tables/bulk",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Create a table range in bulk",
        security: [{ bearerAuth: [] }],
        body: TableBulkCreateRequestSchema,
        response: {
          201: TableBulkCreateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const created = tableStore.createTablesBulk(request.body);
      return reply.status(201).send({ tables: created });
    }
  );

  app.patch<{ Params: TableParams; Body: TableUpdateRequest }>(
    "/tables/:tableId",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Update a table",
        security: [{ bearerAuth: [] }],
        params: TableParamsSchema,
        body: TableUpdateRequestSchema,
        response: {
          200: TableUpdateResponseSchema,
          400: ApiErrorEnvelopeSchema,
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      return tableStore.updateTable(request.params.tableId, request.body);
    }
  );

  app.get<{ Params: TableParams }>(
    "/tables/:tableId/qr",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Get a table QR as SVG",
        security: [{ bearerAuth: [] }],
        params: TableParamsSchema,
        response: {
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          404: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const table = tableStore.getTable(request.params.tableId);
      const svg = buildTableQrSvg({ id: table.id, name: table.name });
      return reply.type("image/svg+xml").send(svg);
    }
  );

  app.get(
    "/tables/qr.pdf",
    {
      config: {
        requiresRole: "admin",
        requiresActiveEvent: true,
      },
      schema: {
        tags: ["tables"],
        summary: "Export table QR overview as PDF",
        security: [{ bearerAuth: [] }],
        response: {
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (_request, reply) => {
      const tables = tableStore.listTables({});
      const lines = ["Serva Tables QR Export", ...tables.map((table) => `${table.name} (id=${table.id})`)];
      const pdf = buildSimplePdf(lines);
      return reply
        .header("Content-Disposition", "inline; filename=tables-qr.pdf")
        .type("application/pdf")
        .send(pdf);
    }
  );
}

