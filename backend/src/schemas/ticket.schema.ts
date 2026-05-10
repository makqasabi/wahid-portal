import { z } from "zod";

const uuidString = z.string().uuid();

export const createTicketSchema = z.object({
  submittingTeamId: uuidString,
  categoryId: uuidString,
  clientId: uuidString,
  actionItem: z.string().min(1, "Action item is required"),
  ownerId: uuidString,
  supportId: uuidString.optional(),
  dueDate: z.string().optional().nullable(),
  ownerEntityId: uuidString,
  ownerTeamId: uuidString,
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

export const updateTicketSchema = createTicketSchema.partial().extend({
  progress: z.enum(["IN_PROGRESS", "DELAYED", "COMPLETED", "ON_HOLD", "DEPENDENT"]).optional(),
  closureDate: z.string().optional().nullable(),
});

export const ticketFilterSchema = z.object({
  entityId: uuidString.optional(),
  teamId: uuidString.optional(),
  clientId: uuidString.optional(),
  categoryId: uuidString.optional(),
  progress: z.string().optional(), // supports comma-separated values e.g. "IN_PROGRESS,DELAYED"
  priority: z.string().optional(), // supports comma-separated values e.g. "CRITICAL,HIGH"
  ownerId: uuidString.optional(),
  submittedById: uuidString.optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "updatedAt", "dueDate", "priority", "progress", "displayId"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketFilterInput = z.infer<typeof ticketFilterSchema>;
