import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleName: string;
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    roleName: string;
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    roleName: string;
    permissions: string[];
  }
}
