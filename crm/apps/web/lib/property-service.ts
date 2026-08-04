import { Prisma, recordAudit, type PrismaClient } from "@mabres/db";
import {
  generatePropertyCode,
  type PropertyCreateInput,
  type PropertyInactivateInput,
  type PropertyUpdateInput,
} from "@mabres/shared";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

/**
 * Cria o imóvel com um `internalCode` único. Colisões de código (raras) são
 * resolvidas tentando gerar outro — até `MAX_CODE_GENERATION_ATTEMPTS` vezes.
 */
export async function createProperty(client: PrismaClient, data: PropertyCreateInput, actorUserId: string) {
  let property: { id: string } | null = null;

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS && !property; attempt++) {
    try {
      property = await client.property.create({
        data: {
          internalCode: generatePropertyCode(),
          purpose: data.purpose,
          propertyType: data.propertyType,
          externalRef: data.externalRef || null,
          sourceSystem: "CRM",
          addressLine: data.addressLine || null,
          number: data.number || null,
          complement: data.complement || null,
          neighborhood: data.neighborhood || null,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode || null,
          condoName: data.condoName || null,
          salePrice: data.salePrice ?? null,
          rentPrice: data.rentPrice ?? null,
          condoFee: data.condoFee ?? null,
          iptu: data.iptu ?? null,
          landArea: data.landArea ?? null,
          builtArea: data.builtArea ?? null,
          bedrooms: data.bedrooms ?? null,
          suites: data.suites ?? null,
          bathrooms: data.bathrooms ?? null,
          coveredParking: data.coveredParking ?? null,
          uncoveredParking: data.uncoveredParking ?? null,
          furnished: data.furnished,
          hasPool: data.hasPool,
          hasGourmetArea: data.hasGourmetArea,
          hasBackyard: data.hasBackyard,
          acceptsFinancing: data.acceptsFinancing,
          acceptsFgts: data.acceptsFgts,
          acceptsTrade: data.acceptsTrade,
          title: data.title || null,
          shortDescription: data.shortDescription || null,
          fullDescription: data.fullDescription || null,
          legalNotes: data.legalNotes || null,
          responsibleUserId: actorUserId,
          capturedAt: new Date(),
          photos: {
            create: data.photoUrls.map((url, index) => ({ url, order: index, isCover: index === 0 })),
          },
          owners: data.ownerId ? { create: [{ ownerId: data.ownerId, ownershipPercent: 100 }] } : undefined,
          priceHistory: {
            create: [
              {
                salePrice: data.salePrice ?? null,
                rentPrice: data.rentPrice ?? null,
                changedByUserId: actorUserId,
              },
            ],
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue; // colisão de internalCode (rara) — tenta gerar outro código
      }
      throw error;
    }
  }

  if (!property) {
    throw new Error("Não foi possível gerar um código interno único para o imóvel. Tente novamente.");
  }

  await recordAudit(client, {
    entityType: "Property",
    entityId: property.id,
    action: "create",
    actorType: "USER",
    actorUserId,
    after: { propertyType: data.propertyType, city: data.city, salePrice: data.salePrice ?? null },
  });

  return property;
}

/**
 * Atualiza o imóvel e registra histórico de preço/status quando eles mudam.
 * `current` deve ser lido antes de chamar (o caller decide como reagir a
 * imóvel inexistente).
 */
export async function updateProperty(
  client: PrismaClient,
  data: PropertyUpdateInput,
  current: { status: string; salePrice: Prisma.Decimal | null; rentPrice: Prisma.Decimal | null },
  actorUserId: string,
) {
  const priceChanged =
    Number(current.salePrice ?? 0) !== Number(data.salePrice ?? 0) ||
    Number(current.rentPrice ?? 0) !== Number(data.rentPrice ?? 0);
  const statusChanged = current.status !== data.status;

  await client.$transaction([
    client.property.update({
      where: { id: data.id },
      data: {
        purpose: data.purpose,
        propertyType: data.propertyType,
        externalRef: data.externalRef || null,
        status: data.status,
        addressLine: data.addressLine || null,
        number: data.number || null,
        complement: data.complement || null,
        neighborhood: data.neighborhood || null,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode || null,
        condoName: data.condoName || null,
        salePrice: data.salePrice ?? null,
        rentPrice: data.rentPrice ?? null,
        condoFee: data.condoFee ?? null,
        iptu: data.iptu ?? null,
        landArea: data.landArea ?? null,
        builtArea: data.builtArea ?? null,
        bedrooms: data.bedrooms ?? null,
        suites: data.suites ?? null,
        bathrooms: data.bathrooms ?? null,
        coveredParking: data.coveredParking ?? null,
        uncoveredParking: data.uncoveredParking ?? null,
        furnished: data.furnished,
        hasPool: data.hasPool,
        hasGourmetArea: data.hasGourmetArea,
        hasBackyard: data.hasBackyard,
        acceptsFinancing: data.acceptsFinancing,
        acceptsFgts: data.acceptsFgts,
        acceptsTrade: data.acceptsTrade,
        title: data.title || null,
        shortDescription: data.shortDescription || null,
        fullDescription: data.fullDescription || null,
        legalNotes: data.legalNotes || null,
      },
    }),
    ...(priceChanged
      ? [
          client.propertyPriceHistory.create({
            data: {
              propertyId: data.id,
              salePrice: data.salePrice ?? null,
              rentPrice: data.rentPrice ?? null,
              changedByUserId: actorUserId,
            },
          }),
        ]
      : []),
    ...(statusChanged
      ? [
          client.propertyStatusHistory.create({
            data: {
              propertyId: data.id,
              fromStatus: current.status,
              toStatus: data.status,
              changedByUserId: actorUserId,
            },
          }),
        ]
      : []),
  ]);

  await recordAudit(client, {
    entityType: "Property",
    entityId: data.id,
    action: "update",
    actorType: "USER",
    actorUserId,
    before: { salePrice: current.salePrice, rentPrice: current.rentPrice, status: current.status },
    after: { salePrice: data.salePrice ?? null, rentPrice: data.rentPrice ?? null, status: data.status },
  });
}

/** Inativa o imóvel, registrando o motivo no histórico de status. */
export async function inactivateProperty(
  client: PrismaClient,
  data: PropertyInactivateInput,
  current: { status: string },
  actorUserId: string,
) {
  await client.$transaction([
    client.property.update({
      where: { id: data.id },
      data: { status: "inativo", inactivatedAt: new Date(), inactivationReason: data.reason },
    }),
    client.propertyStatusHistory.create({
      data: {
        propertyId: data.id,
        fromStatus: current.status,
        toStatus: "inativo",
        reason: data.reason,
        changedByUserId: actorUserId,
      },
    }),
  ]);

  await recordAudit(client, {
    entityType: "Property",
    entityId: data.id,
    action: "inactivate",
    actorType: "USER",
    actorUserId,
    before: { status: current.status },
    after: { status: "inativo", reason: data.reason },
  });
}
