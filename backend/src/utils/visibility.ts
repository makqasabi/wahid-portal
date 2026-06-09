import type { Prisma } from "@prisma/client";

export interface VisibilityUser {
  id: string;
  role: string;
  entityId: string;
  teamId: string;
}

/**
 * Role-based ticket visibility (single source of truth).
 *
 *  SUPER_ADMIN   → everything
 *  ENTITY_ADMIN  → all tickets in their entity (owner or submitting side)
 *  TEAM_LEAD     → their team's tickets (owner team or submitting team) + their own
 *  everyone else → only tickets they opened or are assigned to (owner/support/submitter)
 *
 * Returns a Prisma where-fragment to AND/merge into a ticket query.
 */
export function ticketVisibilityWhere(user: VisibilityUser): Prisma.TicketWhereInput {
  switch (user.role) {
    case "SUPER_ADMIN":
      return {};
    case "ENTITY_ADMIN":
      return {
        OR: [{ ownerEntityId: user.entityId }, { submittingEntityId: user.entityId }],
      };
    case "TEAM_LEAD":
      return {
        OR: [
          { ownerTeamId: user.teamId },
          { submittingTeamId: user.teamId },
          { ownerId: user.id },
          { supportId: user.id },
          { submittedById: user.id },
        ],
      };
    default:
      // MEMBER, OBSERVER, EXTERNAL_STAKEHOLDER, or any unknown role
      return {
        OR: [{ ownerId: user.id }, { supportId: user.id }, { submittedById: user.id }],
      };
  }
}

/** Boolean equivalent for a single already-loaded ticket (e.g. GET /:id). */
export function canViewTicket(
  user: VisibilityUser,
  t: {
    ownerEntityId: string;
    submittingEntityId: string;
    ownerTeamId: string;
    submittingTeamId: string;
    ownerId: string;
    supportId: string | null;
    submittedById: string;
  },
): boolean {
  switch (user.role) {
    case "SUPER_ADMIN":
      return true;
    case "ENTITY_ADMIN":
      return t.ownerEntityId === user.entityId || t.submittingEntityId === user.entityId;
    case "TEAM_LEAD":
      return (
        t.ownerTeamId === user.teamId ||
        t.submittingTeamId === user.teamId ||
        t.ownerId === user.id ||
        t.supportId === user.id ||
        t.submittedById === user.id
      );
    default:
      return t.ownerId === user.id || t.supportId === user.id || t.submittedById === user.id;
  }
}
