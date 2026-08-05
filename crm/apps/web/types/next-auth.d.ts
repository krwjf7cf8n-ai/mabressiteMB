import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleName: string;
      permissions: string[];
      mustChangePassword: boolean;
      sessionId: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roleName: string;
    permissions: string[];
    mustChangePassword: boolean;
    sessionId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    roleName: string;
    permissions: string[];
    mustChangePassword: boolean;
    sessionId: string;
    invalid: boolean;
  }
}
