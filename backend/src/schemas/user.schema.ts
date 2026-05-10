import { z } from "zod";

const roleEnum = z.enum([
  "SUPER_ADMIN",
  "ENTITY_ADMIN",
  "TEAM_LEAD",
  "MEMBER",
  "OBSERVER",
  "EXTERNAL_STAKEHOLDER",
]);

export const createUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/,
      "Password must meet complexity requirements",
    ),
  entityId: z.string().uuid(),
  teamId: z.string().uuid(),
  role: roleEnum.default("MEMBER"),
});

export const updateUserSchema = createUserSchema.partial();

export const inviteUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  entityId: z.string().uuid(),
  teamId: z.string().uuid(),
  role: roleEnum.default("MEMBER"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
