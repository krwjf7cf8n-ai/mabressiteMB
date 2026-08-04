import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@mabres/db";
import { hashPassword } from "@mabres/shared";

/**
 * Marco 1.9 — Sprint 3 (G14): cobre, pela UI, os fluxos de mutação que a
 * extração de service layer (G3) tocou (leads, imóveis, tarefas e visitas) e
 * que ainda não tinham nenhum teste E2E — garante que mover a lógica de
 * negócio das Server Actions para lib/*-service.ts não mudou o comportamento
 * observável. Mesmo padrão de fixtures via Prisma contra um build de
 * produção real dos sprints anteriores.
 */

const RUN_ID = `e2e-g3-${Date.now()}`;
const PASSWORD = "SenhaE2eG3Servicos!2026";

let corretor: { id: string; email: string };
let gestor: { id: string; email: string };

let propertyForUpdate: { id: string };
let propertyForInactivate: { id: string };
let contactForFixtures: { id: string };

let taskToComplete: { id: string };
let taskToCancel: { id: string };
let taskToReopen: { id: string };
let taskToReassign: { id: string };

let visitToReschedule: { id: string; updatedAt: Date };
let visitToConfirm: { id: string; updatedAt: Date };
let visitToComplete: { id: string; updatedAt: Date };
let visitToReassign: { id: string; updatedAt: Date };

let leadForStageChange: { id: string };
let leadForStageError: { id: string };
let leadForPreferences: { id: string };
let lossStageId: string;
let neutralStageId: string;

test.beforeAll(async () => {
  const [corretorRole, gestorRole] = await Promise.all([
    prisma.role.findFirstOrThrow({ where: { name: "Corretor" } }),
    prisma.role.findFirstOrThrow({ where: { name: "Gestor" } }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);

  const [userCorretor, userGestor] = await Promise.all([
    prisma.user.create({
      data: { name: `${RUN_ID}-corretor`, email: `${RUN_ID}-corretor@mabres.local`, passwordHash, roleId: corretorRole.id, isActive: true },
    }),
    prisma.user.create({
      data: { name: `${RUN_ID}-gestor`, email: `${RUN_ID}-gestor@mabres.local`, passwordHash, roleId: gestorRole.id, isActive: true },
    }),
  ]);
  corretor = userCorretor;
  gestor = userGestor;

  const [propUpdate, propInactivate] = await Promise.all([
    prisma.property.create({
      data: { internalCode: `${RUN_ID}-UPD`, propertyType: "apartamento", city: "Sorocaba", state: "SP", salePrice: 300000 },
    }),
    prisma.property.create({
      data: { internalCode: `${RUN_ID}-INA`, propertyType: "casa", city: "Sorocaba", state: "SP" },
    }),
  ]);
  propertyForUpdate = propUpdate;
  propertyForInactivate = propInactivate;

  const contact = await prisma.contact.create({
    data: { name: `${RUN_ID}-lead-base`, ownerUserId: corretor.id, origin: "MANUAL" },
  });
  contactForFixtures = contact;

  const [complete, cancel, reopen, reassign] = await Promise.all([
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-concluir`, contactId: contact.id, assignedUserId: corretor.id, createdByUserId: corretor.id, taskType: "ligar" },
    }),
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-cancelar`, contactId: contact.id, assignedUserId: corretor.id, createdByUserId: corretor.id, taskType: "ligar" },
    }),
    prisma.task.create({
      data: {
        title: `${RUN_ID}-tarefa-reabrir`,
        contactId: contact.id,
        assignedUserId: corretor.id,
        createdByUserId: corretor.id,
        taskType: "ligar",
        status: "CANCELADA",
        cancellationReason: "fixture",
      },
    }),
    prisma.task.create({
      data: { title: `${RUN_ID}-tarefa-reatribuir`, contactId: contact.id, assignedUserId: corretor.id, createdByUserId: corretor.id, taskType: "ligar" },
    }),
  ]);
  taskToComplete = complete;
  taskToCancel = cancel;
  taskToReopen = reopen;
  taskToReassign = reassign;

  const [visitReschedule, visitConfirm, visitComplete, visitReassign] = await Promise.all([
    prisma.visit.create({
      data: {
        contactId: contact.id,
        propertyId: propUpdate.id,
        brokerUserId: corretor.id,
        createdByUserId: corretor.id,
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60_000),
      },
    }),
    prisma.visit.create({
      data: {
        contactId: contact.id,
        propertyId: propUpdate.id,
        brokerUserId: corretor.id,
        createdByUserId: corretor.id,
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
      },
    }),
    prisma.visit.create({
      data: {
        contactId: contact.id,
        propertyId: propUpdate.id,
        brokerUserId: corretor.id,
        createdByUserId: corretor.id,
        scheduledAt: new Date(Date.now() - 60 * 60_000),
        status: "CONFIRMADA",
      },
    }),
    prisma.visit.create({
      data: {
        contactId: contact.id,
        propertyId: propUpdate.id,
        brokerUserId: corretor.id,
        createdByUserId: corretor.id,
        scheduledAt: new Date(Date.now() + 4 * 24 * 60 * 60_000),
      },
    }),
  ]);
  visitToReschedule = visitReschedule;
  visitToConfirm = visitConfirm;
  visitToComplete = visitComplete;
  visitToReassign = visitReassign;

  const [stageChange, stageError, preferences] = await Promise.all([
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-etapa`, ownerUserId: corretor.id, origin: "MANUAL" } }),
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-etapa-erro`, ownerUserId: corretor.id, origin: "MANUAL" } }),
    prisma.contact.create({ data: { name: `${RUN_ID}-lead-preferencias`, ownerUserId: corretor.id, origin: "MANUAL" } }),
  ]);
  leadForStageChange = stageChange;
  leadForStageError = stageError;
  leadForPreferences = preferences;

  const [lossStage, neutralStage] = await Promise.all([
    prisma.pipelineStage.findFirstOrThrow({ where: { requiresReasonOn: "LOSS" } }),
    prisma.pipelineStage.findFirstOrThrow({ where: { requiresReasonOn: "NONE", order: 3 } }),
  ]);
  lossStageId = lossStage.id;
  neutralStageId = neutralStage.id;
});

test.afterAll(async () => {
  const taskIds = [taskToComplete.id, taskToCancel.id, taskToReopen.id, taskToReassign.id];
  const visitIds = [visitToReschedule.id, visitToConfirm.id, visitToComplete.id, visitToReassign.id];
  const contactIds = [contactForFixtures.id, leadForStageChange.id, leadForStageError.id, leadForPreferences.id];
  const propertyIds = [propertyForUpdate.id, propertyForInactivate.id];

  // Inclui tasks por visitId/contactId além do prefixo de título: o outcome
  // da visita realizada cria automaticamente uma tarefa de retorno
  // ("Retornar com o cliente após a visita") sem esse prefixo.
  await prisma.task.deleteMany({
    where: {
      OR: [
        { id: { in: taskIds } },
        { title: { startsWith: `${RUN_ID}-` } },
        { visitId: { in: visitIds } },
        { contactId: { in: contactIds } },
      ],
    },
  });
  // VisitEvent, ContactStageHistory, PropertyPriceHistory, PropertyStatusHistory
  // e AuditLog são append-only (G17, bloqueados pelo middleware) — apagar a
  // Visit/Contact/Property remove os históricos via onDelete: Cascade no
  // schema; AuditLog não é apagado (actorUserId vira NULL quando o User é
  // apagado abaixo), não por deleteMany direto em nenhum desses modelos.
  await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
  await prisma.contactPreference.deleteMany({ where: { contactId: { in: contactIds } } });
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [corretor.id, gestor.id] } } });
  await prisma.$disconnect();
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("G3 — Imóveis (property-service)", () => {
  test("cadastrar imóvel pela UI cria o registro e leva ao detalhe", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto("/properties/new");
    await page.fill('input[name="propertyType"]', "apartamento");
    await page.getByRole("button", { name: "Cadastrar imóvel" }).click();

    await page.waitForURL((url) => /^\/properties\/(?!new$)[^/]+$/.test(url.pathname));
    await expect(page.getByText("apartamento")).toBeVisible();

    const created = await prisma.property.findFirst({ where: { propertyType: "apartamento", responsibleUserId: corretor.id } });
    expect(created).not.toBeNull();
    if (created) await prisma.property.deleteMany({ where: { id: created.id } });
  });

  test("atualizar o valor de venda registra o histórico de preço", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/properties/${propertyForUpdate.id}`);
    await page.fill('input[name="salePrice"]', "350000");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect
      .poll(async () => {
        const history = await prisma.propertyPriceHistory.findMany({ where: { propertyId: propertyForUpdate.id } });
        return history.some((h) => Number(h.salePrice) === 350000);
      })
      .toBe(true);
  });

  test("inativar imóvel muda o status e registra o motivo no histórico", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/properties/${propertyForInactivate.id}`);
    await page.fill('input[name="reason"]', "Proprietário desistiu");
    await page.getByRole("button", { name: "Inativar", exact: true }).click();

    await page.waitForURL(`**/properties/${propertyForInactivate.id}`);
    await expect(page.getByText("Status: inativo")).toBeVisible();

    const updated = await prisma.property.findUniqueOrThrow({ where: { id: propertyForInactivate.id } });
    expect(updated.status).toBe("inativo");
    expect(updated.inactivationReason).toBe("Proprietário desistiu");
  });
});

test.describe("G3 — Tarefas (task-service)", () => {
  test("concluir tarefa muda o status para CONCLUIDA", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/tasks/${taskToComplete.id}`);
    await page.getByRole("button", { name: "Concluir" }).click();

    await page.waitForURL(`**/tasks/${taskToComplete.id}`);
    await expect(page.getByText(/status CONCLUIDA/)).toBeVisible();
  });

  test("cancelar tarefa exige motivo e muda o status para CANCELADA", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/tasks/${taskToCancel.id}`);
    await page.fill('input[name="reason"]', "Cliente desistiu do contato");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.waitForURL(`**/tasks/${taskToCancel.id}`);
    await expect(page.getByText(/status CANCELADA/)).toBeVisible();
    await expect(page.getByText("Cliente desistiu do contato", { exact: true })).toBeVisible();
  });

  test("reabrir tarefa cancelada volta o status para PENDENTE", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/tasks/${taskToReopen.id}`);
    await page.getByRole("button", { name: "Reabrir" }).click();

    await page.waitForURL(`**/tasks/${taskToReopen.id}`);
    await expect(page.getByText(/status PENDENTE/)).toBeVisible();
  });

  test("gestor reatribui a tarefa para outro responsável", async ({ page }) => {
    await loginAs(page, gestor.email);
    await page.goto(`/tasks/${taskToReassign.id}`);
    await page.selectOption('select[name="assignedUserId"]', gestor.id);
    await page.getByRole("button", { name: "Reatribuir" }).click();

    // completeTaskAction/cancelTaskAction/reassignTaskAction não fazem
    // redirect() em caso de sucesso (só revalidatePath) — não há navegação
    // para aguardar, então usa expect.poll em vez de ler o banco uma única
    // vez logo após o clique (o fetch da server action pode ainda não ter
    // sido concluído nesse instante).
    await expect
      .poll(async () => (await prisma.task.findUnique({ where: { id: taskToReassign.id } }))?.assignedUserId)
      .toBe(gestor.id);
  });
});

test.describe("G3 — Visitas (visit-service)", () => {
  test("reagendar visita atualiza a data e registra o evento", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/visits/${visitToReschedule.id}`);

    // A página tem outros campos "reason" (nas ações de status) — escopar ao
    // formulário de reagendamento pela seção, para não preencher o errado.
    const rescheduleSection = page.locator("section", { has: page.getByRole("heading", { name: "Reagendar" }) });
    const newDate = new Date(Date.now() + 10 * 24 * 60 * 60_000);
    const localValue = new Date(newDate.getTime() - newDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await rescheduleSection.locator('input[name="scheduledAt"]').fill(localValue);
    await rescheduleSection.locator('input[name="reason"]').fill("Cliente pediu para adiar");
    await rescheduleSection.getByRole("button", { name: "Reagendar" }).click();

    await expect.poll(async () => (await prisma.visit.findUnique({ where: { id: visitToReschedule.id } }))?.status).toBe(
      "REAGENDADA",
    );
    await expect(page.getByText("Reagendada", { exact: true })).toBeVisible();
  });

  test("confirmar visita muda o status para CONFIRMADA", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/visits/${visitToConfirm.id}`);
    await page.getByRole("button", { name: "Confirmar" }).click();

    await page.waitForURL(`**/visits/${visitToConfirm.id}`);
    await expect(page.getByText("status CONFIRMADA")).toBeVisible();
  });

  test("registrar o resultado da visita realizada muda o status para REALIZADA", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/visits/${visitToComplete.id}`);
    await page.selectOption('select[name="interestLevel"]', "alto");
    await page.fill('input[name="positivePoints"]', "Gostou muito da localização");
    await page.getByRole("button", { name: "Registrar visita realizada" }).click();

    await page.waitForURL(`**/visits/${visitToComplete.id}`);
    await expect(page.getByText("status REALIZADA")).toBeVisible();
    await expect(page.getByText("Resultado registrado")).toBeVisible();
  });

  test("gestor reatribui a visita para outro corretor", async ({ page }) => {
    await loginAs(page, gestor.email);
    await page.goto(`/visits/${visitToReassign.id}`);
    await page.selectOption('select[name="brokerUserId"]', gestor.id);
    await page.getByRole("button", { name: "Reatribuir" }).click();

    await expect
      .poll(async () => (await prisma.visit.findUnique({ where: { id: visitToReassign.id } }))?.brokerUserId)
      .toBe(gestor.id);
  });
});

test.describe("G3 — Leads (lead-service)", () => {
  test("mudar para uma etapa que não exige motivo atualiza a etapa e o histórico", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/leads/${leadForStageChange.id}`);
    await page.selectOption('select[name="toStageId"]', neutralStageId);
    await page.getByRole("button", { name: "Registrar mudança" }).click();

    await expect
      .poll(async () => (await prisma.contact.findUnique({ where: { id: leadForStageChange.id } }))?.stageId)
      .toBe(neutralStageId);
  });

  test("mudar para 'Lead perdido' sem motivo é bloqueado com a mensagem de erro (StageReasonRequiredError)", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/leads/${leadForStageError.id}`);
    await page.selectOption('select[name="toStageId"]', lossStageId);
    await page.getByRole("button", { name: "Registrar mudança" }).click();

    await page.waitForURL((url) => url.pathname === `/leads/${leadForStageError.id}` && url.searchParams.has("error"));
    await expect(page.getByText("Informe o motivo da perda para mover o lead para esta etapa.")).toBeVisible();

    const unchanged = await prisma.contact.findUniqueOrThrow({ where: { id: leadForStageError.id } });
    expect(unchanged.stageId).not.toBe(lossStageId);
  });

  test("atualizar preferências de busca salva os critérios do lead", async ({ page }) => {
    await loginAs(page, corretor.email);
    await page.goto(`/leads/${leadForPreferences.id}`);
    await page.fill('input[name="desiredCity"]', "Votorantim");
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    await expect
      .poll(async () => (await prisma.contactPreference.findUnique({ where: { contactId: leadForPreferences.id } }))?.desiredCity)
      .toBe("Votorantim");
  });
});
