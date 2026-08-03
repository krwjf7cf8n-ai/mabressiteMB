import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma, recordAudit } from "@mabres/db";
import { verifyPassword } from "@mabres/shared";

export const authOptions: AuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas — sessão expira e exige novo login
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });

        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null;

        if (!user || !user.isActive || user.deletedAt || !user.passwordHash) {
          await recordAudit(prisma, {
            entityType: "User",
            entityId: user?.id ?? credentials.email,
            action: "login_failed",
            actorType: "USER",
            ip,
          });
          return null;
        }

        const validPassword = await verifyPassword(credentials.password, user.passwordHash);
        if (!validPassword) {
          await recordAudit(prisma, {
            entityType: "User",
            entityId: user.id,
            action: "login_failed",
            actorType: "USER",
            actorUserId: user.id,
            ip,
          });
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await recordAudit(prisma, {
          entityType: "User",
          entityId: user.id,
          action: "login",
          actorType: "USER",
          actorUserId: user.id,
          ip,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roleName: user.role.name,
          permissions: user.role.permissions.map((rp) => rp.permission.key),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.roleName = (user as any).roleName;
        token.permissions = (user as any).permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).roleName = token.roleName;
        (session.user as any).permissions = token.permissions;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
