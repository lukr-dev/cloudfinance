import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AuthContext } from "../shared/auth";
import * as s from "../shared/schemas";
import * as settings from "./settings";
import * as accounts from "./accounts";
import * as categories from "./categories";
import * as budget from "./budget";
import * as transactions from "./transactions";
import * as shares from "./shares";
import * as invitations from "./invitations";
import { listMembers } from "./members";
import * as attachments from "./attachments";
import { listPayees } from "./payees";
import { listAuditEvents } from "./audit";
import { DomainError } from "./errors";
export function mcpHandler(auth: AuthContext, origin = "") {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: "cloudfinance", version: "1.0.0" });
      function tool<S extends z.ZodType>(
        name: string,
        description: string,
        schema: S,
        run: (input: z.output<S>) => Promise<unknown>,
        readOnly = false,
        idempotent = false,
        destructive = false,
        embeddedResource = false,
      ) {
        server.registerTool<z.ZodType, z.ZodType>(
          name,
          {
            description,
            inputSchema: schema,
            annotations: {
              readOnlyHint: readOnly,
              idempotentHint: readOnly || idempotent,
              destructiveHint: destructive,
              openWorldHint: false,
            },
          },
          async (args) => {
            try {
              const result = await run(schema.parse(args));
              // structuredContent must be a JSON object; text mirrors it for clients that ignore it.
              const structured = (
                Array.isArray(result) ? { items: result } : (result ?? { ok: true })
              ) as Record<string, unknown>;
              const resource = embeddedResource
                ? (structured as { uri: string; mimeType: string; blob: string })
                : undefined;
              const output = resource
                ? { uri: resource.uri, mimeType: resource.mimeType }
                : structured;
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify(output) },
                  ...(resource ? [{ type: "resource" as const, resource }] : []),
                ],
                structuredContent: output,
              };
            } catch (error) {
              if (error instanceof DomainError)
                return {
                  isError: true,
                  content: [{ type: "text", text: error.message }],
                  structuredContent: { error: { code: error.code, message: error.message } },
                };
              throw error;
            }
          },
        );
      }
      const units =
        "All money is signed integer minor units (100 minor units = CHF 1.00): negative outflow, positive inflow. Budgets are independent per currency; no FX conversion. ";
      const month = s.monthParamsSchema.extend({ currency: s.currencySchema.optional() });
      tool(
        "get_settings",
        "Read preferences and enabled currencies.",
        s.emptySchema,
        () => settings.getSettings(auth),
        true,
      );
      tool(
        "update_settings",
        "Update locale, theme and enabled currencies. Base currency must be enabled.",
        s.settingsUpdateSchema,
        (x) => settings.updateSettings(auth, x),
        false,
        true,
      );
      tool(
        "list_accounts",
        units + "List accounts with total, cleared and uncleared balances.",
        z.object({ include_closed: z.boolean().optional() }),
        (x) => accounts.listAccounts(auth, x.include_closed),
        true,
      );
      tool(
        "create_account",
        "Create an account in an enabled currency. on_budget=false creates a tracking account.",
        s.accountCreateSchema,
        (x) => accounts.createAccount(auth, x),
      );
      tool(
        "update_account",
        "Rename, sort, close or reopen an account. Currency/budget status cannot change after transactions exist.",
        s.accountUpdateSchema.extend({ id: s.idSchema }),
        ({ id, ...x }) => accounts.updateAccount(auth, id, x),
        false,
        true,
      );
      tool(
        "list_categories",
        "List your categories including immutable Ready to Assign and Shared repayment (excluded from all budget figures).",
        s.emptySchema,
        () => categories.listCategories(auth),
        true,
      );
      tool("create_category_group", "Create a category group.", s.groupCreateSchema, (x) =>
        categories.createGroup(auth, x),
      );
      tool(
        "create_category",
        "Create an expense category. Colors default in round-robin order.",
        s.categoryCreateSchema,
        (x) => categories.createCategory(auth, x),
      );
      tool(
        "update_category",
        "Update an expense category. System categories are immutable.",
        s.categoryUpdateSchema.extend({ id: s.idSchema }),
        ({ id, ...x }) => categories.updateCategory(auth, id, x),
        false,
        true,
      );
      tool(
        "get_budget_month",
        units +
          "Get YYYY-MM budget with full rollover including negatives. Ready to Assign subtracts all assignments, including future months.",
        month,
        (x) => budget.getBudgetMonth(auth, x.month, x.currency),
        true,
      );
      tool(
        "get_category_month",
        units +
          "Inspect a YYYY-MM category, previous month and 3-month spending average; up to 20 transactions.",
        month.extend({ id: s.idSchema }),
        (x) => budget.getCategoryMonth(auth, x.month, x.id, x.currency),
        true,
      );
      tool(
        "assign_to_category",
        units +
          "Set the absolute assignment for category/currency in YYYY-MM. Repeating this call does not add money twice.",
        s.assignmentSchema.extend({ month: s.monthSchema, category_id: s.idSchema }),
        (x) => budget.assignToCategory(auth, x.month, x.category_id, x),
        false,
        true,
      );
      tool(
        "move_money",
        units +
          "Move a positive amount between two category assignments in YYYY-MM; total assigned is unchanged.",
        s.moveSchema.extend({ month: s.monthSchema }),
        (x) => budget.moveMoney(auth, x.month, x),
      );
      // Query booleans are native JSON booleans in MCP, strings in REST URLs.
      tool(
        "list_transactions",
        units +
          "List newest first using an opaque keyset cursor; filter by account/category/date/payee or uncategorized.",
        s.transactionQuerySchema
          .omit({ uncategorized: true })
          .extend({ uncategorized: z.boolean().optional() }),
        (x) => transactions.listTransactions(auth, x),
        true,
      );
      tool(
        "create_transactions",
        units +
          "Create up to 500 transactions atomically; invalid items roll back the batch. Use external_id for idempotent retry per account. Transfers create linked legs: same currency requires opposite equal amounts; cross-currency requires transfer_amount_minor of opposite sign and defaults both categories to income. Tracking transfers require the on-budget category (category_id or transfer_category_id). Source is mcp.",
        s.transactionBatchSchema,
        (x) => transactions.createTransactions(auth, x, "mcp"),
        false,
        false,
      );
      tool(
        "update_transaction",
        units +
          "Update a transaction and its linked transfer. Cross-currency amount edits require both amounts. share replaces participants and reactivates them; share:null removes sharing. Equal/percent shares recompute on amount edits, with truncation toward zero and remainders kept by owner.",
        s.transactionUpdateSchema.extend({ id: s.idSchema }),
        ({ id, ...x }) => transactions.updateTransaction(auth, id, x),
        false,
        true,
      );
      tool(
        "delete_transaction",
        "Delete a transaction and its linked transfer leg.",
        s.idParamsSchema,
        (x) => transactions.deleteTransaction(auth, x.id),
        false,
        true,
        true,
      );
      tool(
        "list_attachments",
        "List attachment metadata newest first, filtered by category or transaction, with a keyset cursor.",
        s.attachmentQuerySchema,
        async (x) => {
          const page = await attachments.listAttachments(auth, x);
          return { items: page.attachments, next_cursor: page.next_cursor };
        },
        true,
      );
      tool(
        "get_attachment",
        "Read attachment metadata and note.",
        s.idParamsSchema,
        (x) => attachments.getAttachment(auth, x.id),
        true,
      );
      tool(
        "upload_attachment",
        "Upload a document or image as base64 with exactly one category_id or transaction_id. Decoded size is capped at 4 MB for the Worker CPU budget; use multipart REST /api/v1/attachments for files up to 10 MB. File type is detected from magic bytes.",
        s.attachmentMcpUploadSchema,
        (x) => attachments.uploadAttachmentBase64(auth, x),
      );
      tool(
        "get_attachment_content",
        "Read a file as an embedded resource (blob and mimeType). Maximum 4 MB; for larger files use REST /api/v1/attachments/:id/content.",
        s.idParamsSchema,
        (x) => attachments.attachmentBlob(auth, x.id),
        true,
        false,
        false,
        true,
      );
      tool(
        "update_attachment",
        "Update the free-text note or display file name. Parents cannot be changed.",
        s.attachmentUpdateSchema.extend({ id: s.idSchema }),
        ({ id, ...x }) => attachments.updateAttachment(auth, id, x),
        false,
        true,
      );
      tool(
        "delete_attachment",
        "Delete attachment metadata and its stored file.",
        s.idParamsSchema,
        (x) => attachments.deleteAttachment(auth, x.id),
        false,
        true,
        true,
      );
      tool(
        "list_payees",
        "Autocomplete distinct payee names.",
        s.payeeQuerySchema,
        (x) => listPayees(auth, x.q),
        true,
      );
      tool(
        "list_audit_events",
        "List newest audit events including user or API-key actor IDs.",
        s.pageQuerySchema,
        (x) => listAuditEvents(auth, x),
        true,
      );
      tool(
        "create_transaction",
        units +
          "Create one transaction, optionally shared by member email. Equal splits include the owner; percent uses basis points up to 10000 total; amount uses signed minor units. Remainders stay with the owner. Transfers and Shared repayment cannot be shared.",
        s.transactionCreateSchema,
        (x) => transactions.createTransactions(auth, x, "mcp"),
      );
      tool(
        "list_incoming_shares",
        units +
          "List incoming shares newest first. Active shares count in your budget but never account balances.",
        s.incomingShareQuerySchema
          .omit({ uncategorized: true })
          .extend({ uncategorized: z.boolean().optional() }),
        (x) => shares.listIncomingShares(auth, x),
        true,
      );
      tool(
        "update_incoming_share",
        units +
          "Choose your own expense/income category, or decline/re-accept an incoming share. Declining returns that part to the owner's budget.",
        s.incomingShareUpdateSchema.extend({ id: s.idSchema }),
        ({ id, ...x }) => shares.updateIncomingShare(auth, id, x),
        false,
        true,
      );
      tool(
        "list_share_contacts",
        "List only members you share entries with, for email autocomplete.",
        s.emptySchema,
        () => shares.listShareContacts(auth),
        true,
      );
      tool(
        "list_members",
        "Admin only: list instance members.",
        s.emptySchema,
        () => listMembers(auth),
        true,
      );
      tool(
        "list_invitations",
        "Admin only: list invitation metadata; never returns tokens.",
        s.emptySchema,
        () => invitations.listInvitations(auth),
        true,
      );
      tool(
        "create_invitation",
        "Admin only: create a one-time invitation expiring in 7 days, optionally bound to an email. Copy the returned token/join URL; no email is sent.",
        s.invitationCreateSchema,
        (x) => invitations.createInvitation(auth, x, origin),
      );
      tool(
        "revoke_invitation",
        "Admin only: revoke an invitation.",
        s.idParamsSchema,
        (x) => invitations.revokeInvitation(auth, x.id),
        false,
        true,
        true,
      );
      return server;
    },
    { legacy: "reject" },
  );
}
