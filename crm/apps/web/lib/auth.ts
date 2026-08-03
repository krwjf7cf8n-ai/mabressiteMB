import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma, recordAudit } from "@mabres/db";
import { verifyPassword } from "@mabres/shared";

/**
 * NextAuth usa sessão JWT (stateless — sem tabela de sessão do próprio
 * NextAuth). Para permitir revogação individual de sessão (desativar
 * usuário, forçar troca de senha, "encerrar esta sessão"), cada login cria
 * uma linha em `UserSession` e o token carrega o `sessionId`. A cada
 * requisição autenticada, o callback `jwt()` confere se essa sessão ainda é
 * válida — se foi revogada, ou o usuário foi desativado nesse meio tempo, o
 * token é marcado inválido e `session()` devolve uma sessão sem `user`
 * (o que já é tratado por `requireSession()` como "não autenticado").
 */
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
        const userAgent = (req?.headers?.["user-agent"] as string | undefined) ?? null;

        if (!user || !user.isActive || user.deletedAt || user.disabledAt || !user.passwordHash) {
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

        const session = await prisma.userSession.create({ data: { userId: user.id, ip, userAgent } });

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
          mustChangePassword: user.mustChangePassword,
          sessionId: session.id,
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
        token.mustChangePassword = (user as any).mustChangePassword;
        token.sessionId = (user as any).sessionId;
        token.invalid = false;
        return token;
      }

      // Requisições subsequentes: revalida a sessão contra o banco a cada checagem.
      if (token.sessionId) {
        const session = await prisma.userSession.findUnique({
          where: { id: token.sessionId as string },
          include: { user: true },
        });
        const revoked = !session || session.revokedAt !== null;
        const userGone = !session?.user || !session.user.isActive || session.user.deletedAt || session.user.disabledAt;
        if (revoked || userGone) {
          token.invalid = true;
        } else {
          token.mustChangePassword = session.user.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalid) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).roleName = token.roleName;
        (session.user as any).permissions = token.permissions;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session.user as any).sessionId = token.sessionId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
