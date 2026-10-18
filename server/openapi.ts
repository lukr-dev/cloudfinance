import { z } from "zod";
import { endpoints } from "../shared/endpoints";
import { errorSchema } from "../shared/schemas";
export function getOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  const json = (schema: z.ZodType) =>
    z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  for (const endpoint of endpoints) {
    const parameters: unknown[] = [];
    for (const slot of ["query", "params"] as const) {
      if (slot in endpoint) {
        const schema = (endpoint as unknown as Record<string, z.ZodObject>)[slot]!;
        for (const [name, value] of Object.entries(schema.shape))
          parameters.push({
            name,
            in: slot === "params" ? "path" : "query",
            required: slot === "params" || !value.isOptional(),
            schema: json(value),
          });
      }
    }
    const responses: Record<string, unknown> = {
      "200": {
        description: "Success",
        content: { "application/json": { schema: z.toJSONSchema(endpoint.response) } },
      },
    };
    for (const code of ["400", "401", "404", "409", "500"])
      responses[code] = {
        description: (
          {
            400: "Validation failed",
            401: "Authentication required",
            404: "Not found",
            409: "Conflict",
            500: "Internal error",
          } as Record<string, string>
        )[code],
        content: { "application/json": { schema: json(errorSchema) } },
      };
    if (!("public" in endpoint && endpoint.public)) {
      responses["429"] = {
        description: "API key rate limit exceeded (RATE_LIMITED). Retry after the indicated delay.",
        headers: {
          "Retry-After": {
            description: "Seconds to wait before retrying with the same key.",
            schema: { type: "integer", minimum: 1 },
          },
        },
        content: { "application/json": { schema: json(errorSchema) } },
      };
    }
    (paths[endpoint.path] ??= {})[endpoint.method] = {
      operationId: endpoint.operationId,
      security:
        "public" in endpoint && endpoint.public ? [] : [{ bearerAuth: [] }, { sessionCookie: [] }],
      parameters,
      ...("body" in endpoint
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: json(endpoint.body) } },
            },
          }
        : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "cloudfinance API",
      version: "1.0.0",
      description:
        "Zero-based budgets, independently per currency. Money uses signed integer minor units: negative amounts are outflows; positive amounts are inflows. No currency conversion. Months use YYYY-MM, dates YYYY-MM-DD. Full rollover includes negative balances. Ready to Assign subtracts all assignments including future months. Transfers have two linked transactions. Transaction batches are atomic; invalid items roll back the entire batch. Retry safely using external_id.",
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
        sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      },
    },
    paths,
  };
}
