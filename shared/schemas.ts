import { z } from "zod";
import { currencyExponents } from "./money";
export const currencySchema = z.enum(
  Object.keys(currencyExponents) as [
    keyof typeof currencyExponents,
    ...(keyof typeof currencyExponents)[],
  ],
);
export const minorSchema = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const dateSchema = z.iso.date();
export const idSchema = z.string().min(1).max(128);
export const nameSchema = z.string().trim().min(1).max(200);
export const colors = [
  "teal",
  "orange",
  "pink",
  "indigo",
  "violet",
  "amber",
  "red",
  "green",
  "blue",
  "slate",
] as const;
export const colorSchema = z.enum(colors);
export const emptySchema = z.object({}).strict();
export const idParamsSchema = z.object({ id: idSchema });
export const monthParamsSchema = z.object({ month: monthSchema });
export const categoryMonthParamsSchema = z.object({ month: monthSchema, id: idSchema });
export const assignmentParamsSchema = z.object({ month: monthSchema, categoryId: idSchema });
export const currencyQuerySchema = z.object({ currency: currencySchema.optional() });
export const boolQuerySchema = z.enum(["true", "false"]).transform((v) => v === "true");
export const accountQuerySchema = z.object({ include_closed: boolQuerySchema.optional() });
export const settingsUpdateSchema = z
  .object({
    base_currency: currencySchema.optional(),
    enabled_currencies: z.array(currencySchema).min(1).max(5).optional(),
    locale: z.enum(["de", "en"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
  })
  .strict();
export const accountCreateSchema = z
  .object({
    name: nameSchema,
    type: z.enum(["checking", "savings", "credit_card", "cash", "investment", "other"]),
    currency: currencySchema,
    on_budget: z.boolean().optional(),
    institution: z.string().max(200).nullable().optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();
export const accountUpdateSchema = accountCreateSchema
  .partial()
  .extend({ closed_at: z.iso.datetime().nullable().optional() });
export const groupCreateSchema = z
  .object({
    name: nameSchema,
    sort_order: z.number().int().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export const groupUpdateSchema = groupCreateSchema.partial();
export const categoryCreateSchema = z
  .object({
    group_id: idSchema,
    name: nameSchema,
    color: colorSchema.optional(),
    note: z.string().max(2000).optional(),
    sort_order: z.number().int().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export const categoryUpdateSchema = categoryCreateSchema.partial();
export const categoryDeleteQuerySchema = z.object({ reassign_to: idSchema.optional() });
export const assignmentSchema = z
  .object({ currency: currencySchema, amount_minor: minorSchema })
  .strict();
export const moveSchema = z
  .object({
    currency: currencySchema,
    from_category_id: idSchema,
    to_category_id: idSchema,
    amount_minor: minorSchema.positive(),
  })
  .strict();
export const transactionCreateSchema = z
  .object({
    account_id: idSchema,
    date: dateSchema,
    amount_minor: minorSchema,
    currency: currencySchema.optional(),
    payee: z.string().max(200).optional(),
    memo: z.string().max(4000).optional(),
    category_id: idSchema.nullable().optional(),
    cleared: z.enum(["uncleared", "cleared", "reconciled"]).optional(),
    transfer_account_id: idSchema.optional(),
    transfer_amount_minor: minorSchema.optional(),
    transfer_category_id: idSchema.nullable().optional(),
    external_id: z.string().min(1).max(200).optional(),
    source: z
      .string()
      .regex(/^(manual|api|mcp|import:.+)$/)
      .optional(),
  })
  .strict();
export const transactionUpdateSchema = transactionCreateSchema
  .omit({ account_id: true, external_id: true, source: true })
  .partial();
export const transactionBatchSchema = z
  .object({ transactions: z.array(transactionCreateSchema).min(1).max(500) })
  .strict();
export const transactionBodySchema = z.union([transactionCreateSchema, transactionBatchSchema]);
export const pageQuerySchema = z.object({
  cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const transactionQuerySchema = pageQuerySchema.extend({
  account_id: idSchema.optional(),
  category_id: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  q: z.string().max(200).optional(),
  uncategorized: boolQuerySchema.optional(),
});
export const payeeQuerySchema = z.object({ q: z.string().max(200).optional() });
const row = { id: z.string(), user_id: z.string(), created_at: z.string(), updated_at: z.string() };
export const settingsSchema = z.object({
  ...row,
  base_currency: currencySchema,
  enabled_currencies: z.array(currencySchema),
  locale: z.enum(["de", "en"]),
  theme: z.enum(["light", "dark", "system"]),
});
export const accountSchema = accountCreateSchema.required().extend({
  ...row,
  closed_at: z.string().nullable(),
  balance_minor: minorSchema,
  cleared_balance_minor: minorSchema,
  uncleared_balance_minor: minorSchema,
});
export const groupSchema = groupCreateSchema.required().extend(row);
export const categorySchema = categoryCreateSchema
  .required()
  .extend({ ...row, group_id: z.string().nullable(), kind: z.enum(["income", "expense"]) });
export const assignmentRowSchema = assignmentSchema.extend({
  ...row,
  month: monthSchema,
  category_id: z.string(),
});
export const transactionSchema = z.object({
  ...row,
  account_id: z.string(),
  date: dateSchema,
  amount_minor: minorSchema,
  currency: currencySchema,
  payee: z.string(),
  memo: z.string(),
  category_id: z.string().nullable(),
  cleared: z.enum(["uncleared", "cleared", "reconciled"]),
  transfer_account_id: z.string().nullable(),
  transfer_transaction_id: z.string().nullable(),
  source: z.string(),
  external_id: z.string().nullable(),
  account_name: z.string(),
  category_name: z.string().nullable(),
  category_color: colorSchema.nullable(),
});
export const transactionListSchema = z.object({
  transactions: z.array(transactionSchema),
  next_cursor: z.string().nullable(),
  uncategorized_count: z.number().int(),
});
export const transactionResultSchema = z.object({
  created: z.array(transactionSchema),
  skipped: z.array(z.object({ id: z.string(), account_id: z.string(), external_id: z.string() })),
});
export const budgetCategorySchema = categorySchema.extend({
  assigned_minor: minorSchema,
  activity_minor: minorSchema,
  available_minor: minorSchema,
  carried_over_minor: minorSchema,
});
export const budgetGroupSchema = groupSchema.extend({
  assigned_minor: minorSchema,
  activity_minor: minorSchema,
  available_minor: minorSchema,
  categories: z.array(budgetCategorySchema),
});
export const budgetMonthSchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  ready_to_assign_minor: minorSchema,
  income_this_month_minor: minorSchema,
  assigned_this_month_minor: minorSchema,
  activity_this_month_minor: minorSchema,
  available_total_minor: minorSchema,
  uncategorized_count: z.number().int(),
  groups: z.array(budgetGroupSchema),
});
export const categoryMonthSchema = budgetCategorySchema.extend({
  month: monthSchema,
  currency: currencySchema,
  assigned_last_month_minor: minorSchema,
  spent_last_month_minor: minorSchema,
  average_spent_3m_minor: z.number(),
  transactions: z.array(transactionSchema).max(20),
});
export const auditEventSchema = z.object({
  ...row,
  at: z.string(),
  actor_type: z.enum(["user", "api_key"]),
  actor_id: z.string(),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export const auditListSchema = z.object({
  events: z.array(auditEventSchema),
  next_cursor: z.string().nullable(),
});
export const successSchema = z.object({ ok: z.literal(true) });
export const starterResultSchema = z.object({
  created: z.boolean(),
  groups: z.array(groupSchema),
  categories: z.array(categorySchema),
});
export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type CategoryGroup = z.infer<typeof groupSchema>;
export type GroupCreate = z.infer<typeof groupCreateSchema>;
export type GroupUpdate = z.infer<typeof groupUpdateSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type BudgetAssignment = z.infer<typeof assignmentRowSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type MoveInput = z.infer<typeof moveSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type TransactionBody = z.infer<typeof transactionBodySchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type TransactionList = z.infer<typeof transactionListSchema>;
export type TransactionResult = z.infer<typeof transactionResultSchema>;
export type BudgetMonth = z.infer<typeof budgetMonthSchema>;
export type CategoryMonth = z.infer<typeof categoryMonthSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditList = z.infer<typeof auditListSchema>;
export type PageQuery = z.infer<typeof pageQuerySchema>;
export type ApiError = z.infer<typeof errorSchema>;
export type StarterResult = z.infer<typeof starterResultSchema>;
export type AccountQuery = z.infer<typeof accountQuerySchema>;
export type CurrencyQuery = z.infer<typeof currencyQuerySchema>;
export type CategoryDeleteQuery = z.infer<typeof categoryDeleteQuerySchema>;
export type PayeeQuery = z.infer<typeof payeeQuerySchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
export type MonthParams = z.infer<typeof monthParamsSchema>;
export type CategoryMonthParams = z.infer<typeof categoryMonthParamsSchema>;
export type AssignmentParams = z.infer<typeof assignmentParamsSchema>;
export type TransactionBatch = z.infer<typeof transactionBatchSchema>;
export type BudgetCategory = z.infer<typeof budgetCategorySchema>;
export type BudgetGroup = z.infer<typeof budgetGroupSchema>;
export type Success = z.infer<typeof successSchema>;
