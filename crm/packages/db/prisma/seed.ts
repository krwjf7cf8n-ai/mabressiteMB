import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_PIPELINE_STAGES,
  PERMISSIONS,
  SYSTEM_ROLE_DEFAULTS,
  hashPassword,
  resolveRolePermissions,
} from "@mabres/shared";

const prisma = new PrismaClient();

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

async function seedPermissionsAndRoles() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: { key: permission.key, description: permission.description },
    });
  }

  const roleIds: Record<string, string> = {};

  for (const roleName of Object.keys(SYSTEM_ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, isSystem: true },
    });
    roleIds[roleName] = role.id;

    const permissionKeys = resolveRolePermissions(roleName as keyof typeof SYSTEM_ROLE_DEFAULTS);
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  return roleIds;
}

async function seedPipelineStages() {
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    await prisma.pipelineStage.upsert({
      where: { order: stage.order },
      update: { name: stage.name, requiresReasonOn: stage.requiresReasonOn },
      create: { name: stage.name, order: stage.order, requiresReasonOn: stage.requiresReasonOn },
    });
  }
}

async function seedAdminUsers(adminRoleId: string) {
  const seedUsers = [
    {
      name: "Matheus Henrique",
      email: process.env.SEED_MATHEUS_EMAIL ?? "matheus@mabresnegociosimobiliarios.com.br",
      passwordEnv: "SEED_MATHEUS_PASSWORD",
    },
    {
      name: "Brenda Lo Campos",
      email: process.env.SEED_BRENDA_EMAIL ?? "brenda@mabresnegociosimobiliarios.com.br",
      passwordEnv: "SEED_BRENDA_PASSWORD",
    },
  ];

  for (const seedUser of seedUsers) {
    const existing = await prisma.user.findUnique({ where: { email: seedUser.email } });
    if (existing) continue;

    const rawPassword = process.env[seedUser.passwordEnv] ?? generateTempPassword();
    const passwordHash = await hashPassword(rawPassword);

    await prisma.user.create({
      data: {
        name: seedUser.name,
        email: seedUser.email,
        passwordHash,
        roleId: adminRoleId,
      },
    });

    if (!process.env[seedUser.passwordEnv]) {
      // eslint-disable-next-line no-console
      console.warn(
        `[seed] Senha temporária gerada para ${seedUser.email}: ${rawPassword}\n` +
          `Troque no primeiro login e defina ${seedUser.passwordEnv} no .env para ambientes futuros.`,
      );
    }
  }
}

async function seedOrgSettings() {
  await prisma.orgSetting.upsert({
    where: { key: "lgpd_officer" },
    update: {},
    create: {
      key: "lgpd_officer",
      value: {
        name: null,
        email: null,
        phone: null,
        note:
          "Responsável formal pela LGPD ainda não definido. Configurar no painel administrativo antes da entrada em produção.",
      },
    },
  });

  await prisma.orgSetting.upsert({
    where: { key: "data_retention_policy" },
    update: {},
    create: {
      key: "data_retention_policy",
      value: {
        financialDataRetentionDays: null,
        documentsRetentionDays: null,
        note:
          "Política definitiva pendente de validação jurídica. Até lá, nada é excluído automaticamente — apenas soft delete manual.",
      },
    },
  });
}

async function main() {
  const roleIds = await seedPermissionsAndRoles();
  await seedPipelineStages();
  await seedAdminUsers(roleIds.Administrador as string);
  await seedOrgSettings();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
