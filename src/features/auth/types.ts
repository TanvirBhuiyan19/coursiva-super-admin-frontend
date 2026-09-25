import type { Permission, Role } from './permissions';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  permissions: Permission[];
  /** Minutes without activity before the console locks (platform policy). */
  idleLockMinutes: number;
}

export interface LoginInput {
  email: string;
  password: string;
  remember: boolean;
}

export interface LoginResult {
  /** True when the account has 2FA and the code step is still required. */
  twoFactorRequired: boolean;
  user: User | null;
}
