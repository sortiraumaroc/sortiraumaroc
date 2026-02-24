/**
 * Zod Schemas for Admin Collaborators Routes
 *
 * Validates admin-facing collaborator inputs: create, update, password reset,
 * role management, profile updates, and login.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";
import { zEmail, zNonEmptyString } from "../lib/validate";

// =============================================================================
// Collaborators CRUD
// =============================================================================

/**
 * POST /api/admin/collaborators
 * Handler: createCollaborator
 */
export const CreateCollaboratorSchema = z.object({
  email: zEmail,
  firstName: zNonEmptyString,
  lastName: zNonEmptyString,
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caracteres"),
  displayName: z.string().optional(),
  function: z.string().optional(),
  joinedAt: z.string().optional(),
  avatarUrl: z.string().optional(),
  roleId: z.string().optional(),
});

/**
 * POST /api/admin/collaborators/:id/update
 * Handler: updateCollaborator
 */
export const UpdateCollaboratorSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  function: z.string().optional(),
  joinedAt: z.string().optional(),
  avatarUrl: z.string().optional(),
  roleId: z.string().optional(),
});

/**
 * POST /api/admin/collaborators/:id/reset-password
 * Handler: resetCollaboratorPassword
 */
export const ResetCollaboratorPasswordSchema = z.object({
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caracteres"),
});

// =============================================================================
// Roles CRUD
// =============================================================================

/**
 * POST /api/admin/roles
 * Handler: createRole
 */
export const CreateRoleSchema = z.object({
  id: zNonEmptyString,
  name: zNonEmptyString,
  permissions: z.any().optional(),
});

/**
 * POST /api/admin/roles/:id/update
 * Handler: updateRole
 */
export const UpdateRoleSchema = z.object({
  name: z.string().optional(),
  permissions: z.any().optional(),
});

// =============================================================================
// Current User Profile
// =============================================================================

/**
 * POST /api/admin/me
 * Handler: updateMyProfile
 */
export const UpdateMyProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  function: z.string().optional(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

// =============================================================================
// Collaborator Login
// =============================================================================

/**
 * POST /api/admin/collaborators/login
 * Handler: collaboratorLogin
 */
export const CollaboratorLoginSchema = z.object({
  email: zEmail,
  password: zNonEmptyString,
});
