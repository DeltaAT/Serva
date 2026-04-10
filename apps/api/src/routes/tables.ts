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
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
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

async function renderTableHalf(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  nameFont: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  table: { id: number; name: string };
  slotBottomY: number;
  slotHeight: number;
}) {
  const { pdfDoc, page, nameFont, table, slotBottomY, slotHeight } = input;
  const pageWidth = page.getWidth();
  const title = `${table.name}`;
  const titleSize = 72;
  const titleTopPadding = 24;
  const titleBottomGap = 22;
  const slotBottomPadding = 24;
  const qrFramePadding = 8;
  const titleWidth = nameFont.widthOfTextAtSize(title, titleSize);
  const titleY = slotBottomY + slotHeight - titleTopPadding - titleSize;
  page.drawText(title, {
    x: Math.max(24, (pageWidth - titleWidth) / 2),
    y: titleY,
    size: titleSize,
    font: nameFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const qrPayload = JSON.stringify({ tableId: table.id, tableName: table.name });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 1000,
  });
  const qrBase64 = qrDataUrl.slice(qrDataUrl.indexOf(",") + 1);
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrBase64, "base64"));

  const qrAreaTopY = titleY - titleBottomGap;
  const qrAreaBottomY = slotBottomY + slotBottomPadding;
  const availableQrHeight = Math.max(80, qrAreaTopY - qrAreaBottomY);
  const maxQrSize = Math.min(availableQrHeight, pageWidth - 120, 340);
  const qrSize = Math.max(120, maxQrSize);
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = qrAreaBottomY + Math.max(0, (availableQrHeight - qrSize) / 2);

  page.drawRectangle({
    x: qrX - qrFramePadding,
    y: qrY - qrFramePadding,
    width: qrSize + qrFramePadding * 2,
    height: qrSize + qrFramePadding * 2,
    borderWidth: 1,
    borderColor: rgb(0.82, 0.82, 0.82),
  });
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
}

async function buildTablesQrPdf(tables: Array<{ id: number; name: string }>) {
  const pdfDoc = await PDFDocument.create();
  const nameFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];

  if (tables.length === 0) {
    const page = pdfDoc.addPage(pageSize);
    page.drawText("No tables available", {
      x: 200,
      y: 420,
      size: 24,
      font: nameFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    return Buffer.from(await pdfDoc.save());
  }

  for (let index = 0; index < tables.length; index += 2) {
    const page = pdfDoc.addPage(pageSize);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const slotHeight = pageHeight / 2;

    page.drawLine({
      start: { x: 24, y: slotHeight },
      end: { x: pageWidth - 24, y: slotHeight },
      thickness: 1,
      color: rgb(0.75, 0.75, 0.75),
    });

    await renderTableHalf({
      pdfDoc,
      page,
      nameFont,
      table: tables[index],
      slotBottomY: slotHeight,
      slotHeight,
    });

    if (tables[index + 1]) {
      await renderTableHalf({
        pdfDoc,
        page,
        nameFont,
        table: tables[index + 1],
        slotBottomY: 0,
        slotHeight,
      });
    }
  }

  return Buffer.from(await pdfDoc.save());
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
          200: z.unknown().describe("PDF document containing table QR codes"),
          401: ApiErrorEnvelopeSchema,
          403: ApiErrorEnvelopeSchema,
          409: ApiErrorEnvelopeSchema,
        },
      },
    },
    async (_request, reply) => {
      const tables = tableStore.listTables({});
      const pdf = await buildTablesQrPdf(tables.map((table) => ({ id: table.id, name: table.name })));
      return reply
        .header("Content-Disposition", "attachment; filename=tables-qr.pdf")
        .type("application/pdf")
        .send(pdf);
    }
  );
}

