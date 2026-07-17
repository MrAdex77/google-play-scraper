import * as z from 'zod/mini';
import { permission } from '../../constants.js';

export const permissionTypeSchema = z.union([
  z.literal(permission.COMMON),
  z.literal(permission.OTHER),
]);

export const permissionSchema = z.object({
  permission: z.string(),
  type: permissionTypeSchema,
});

export type AppPermission = z.infer<typeof permissionSchema>;
