import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma, recordAudit } from "@mabres/db";
import { hashPassword, verifyPassword } from "@mabres/shared";
import { getRedisClient } from "./redis";
import { checkLoginRateLimit, registerFailedLoginAttempt, resetLoginRateLimit } from "./rate-limit";

/**
 * G23 — mitigação de timing side-channel: sem isso, o caminho "usuário não
 * existe/inativo" retorna sem nunca rodar o bcrypt (custo ~O(2^12)),
 * enquanto o caminho "senha errada para usuário existente" roda. A diferença
 * de tempo de resposta permite inferir se um e-mail está cadastrado, mesmo
 * com a mensagem de erro idêntica nos dois casos. Um hash fixo, calculado
 * uma única vez (lazy, no primeiro uso) e comparado nos dois caminhos,
 * equaliza o custo sem afetar o resultado da autenticação.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("mabres-timing-side-channel-dummy-hash");
  }
  return dummyHashPromise;
}

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

        const normalizedEmail = credentials.email.trim().toLowerCase();
        const ip =
          (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null;
        const userAgent = (req?.headers?.["user-agent"] as string | undefined) ?? null;

        // G22 — no máximo 5 tentativas com falha a cada 15 min por e-mail,
        // via a mesma infraestrutura Redis do worker. Checado antes de tocar
        // no banco: uma tentativa bloqueada não deve nem chegar a comparar
        // senha (evita gastar o custo do bcrypt à toa e ajuda a manter o
        // tempo de resposta previsível — G23).
        const redis = getRedisClient();
        const rateLimit = await checkLoginRateLimit(redis, normalizedEmail);
        if (rateLimit.limited) {
          await recordAudit(prisma, {
            entityType: "User",
            entityId: normalizedEmail,
            action: "login_rate_limited",
            actorType: "USER",
            ip,
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });

        if (!user || !user.isActive || user.deletedAt || user.disabledAt || !user.passwordHash) {
          // G23 — roda um bcrypt.compare mesmo sem usuário/hash real, para
          // que o tempo de resposta seja equivalente ao do caminho "senha
          // errada" abaixo (ver getDummyHash()).
          await verifyPassword(credentials.password, await getDummyHash());
          await registerFailedLoginAttempt(redis, normalizedEmail);
          await recordAudit(prisma, {
            entityType: "User",
            entityId: user?.id ?? normalizedEmail,
            action: "login_failed",
            actorType: "USER",
            ip,
          });
          return null;
        }

        const validPassword = await verifyPassword(credentials.password, user.passwordHash);
        if (!validPassword) {
          await registerFailedLoginAttempt(redis, normalizedEmail);
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

        await resetLoginRateLimit(redis, normalizedEmail);

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
        token.userId = user.id;
        token.roleName = user.roleName;
        token.permissions = user.permissions;
        token.mustChangePassword = user.mustChangePassword;
        token.sessionId = user.sessionId;
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
        session.user.id = token.userId;
        session.user.roleName = token.roleName;
        session.user.permissions = token.permissions;
        session.user.mustChangePassword = token.mustChangePassword;
        session.user.sessionId = token.sessionId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
