"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, prisma, recordAudit } from "@mabres/db";
import {
  generatePropertyCode,
  propertyCreateSchema,
  propertyInactivateSchema,
  propertyUpdateSchema,
} from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { getMatchesForProperty } from "@/lib/matching-service";

function readPropertyForm(formData: FormData) {
  return {
    purpose: formData.get("purpose") || "VENDA",
    propertyType: formData.get("propertyType"),
    externalRef: formData.get("externalRef") || null,
    addressLine: formData.get("addressLine") || null,
    number: formData.get("number") || null,
    complement: formData.get("complement") || null,
    neighborhood: formData.get("neighborhood") || null,
    city: formData.get("city") || "Sorocaba",
    state: formData.get("state") || "SP",
    zipCode: formData.get("zipCode") || null,
    condoName: formData.get("condoName") || null,
    salePrice: formData.get("salePrice") || null,
    rentPrice: formData.get("rentPrice") || null,
    condoFee: formData.get("condoFee") || null,
    iptu: formData.get("iptu") || null,
    landArea: formData.get("landArea") || null,
    builtArea: formData.get("builtArea") || null,
    bedrooms: formData.get("bedrooms") || null,
    suites: formData.get("suites") || null,
    bathrooms: formData.get("bathrooms") || null,
    coveredParking: formData.get("coveredParking") || null,
    uncoveredParking: formData.get("uncoveredParking") || null,
    furnished: formData.get("furnished") === "on",
    hasPool: formData.get("hasPool") === "on",
    hasGourmetArea: formData.get("hasGourmetArea") === "on",
    hasBackyard: formData.get("hasBackyard") === "on",
    acceptsFinancing: formData.get("acceptsFinancing") === "on",
    acceptsFgts: formData.get("acceptsFgts") === "on",
    acceptsTrade: formData.get("acceptsTrade") === "on",
    title: formData.get("title") || null,
    shortDescription: formData.get("shortDescription") || null,
    fullDescription: formData.get("fullDescription") || null,
    legalNotes: formData.get("legalNotes") || null,
    ownerId: formData.get("ownerId") || null,
    photoUrls: String(formData.get("photoUrls") ?? "")
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean),
  };
}

export async function createPropertyAction(formData: FormData) {
  const session = await requirePermission("properties:create");

  const parsed = propertyCreateSchema.safeParse(readPropertyForm(formData));
  if (!parsed.success) {
    redirect(`/properties/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;

  let property: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !property; attempt++) {
    try {
      property = await prisma.property.create({
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
          responsibleUserId: session.user.id,
          capturedAt: new Date(),
          photos: {
            create: data.photoUrls.map((url, index) => ({ url, order: index, isCover: index === 0 })),
          },
          owners: data.ownerId
            ? { create: [{ ownerId: data.ownerId, ownershipPercent: 100 }] }
            : undefined,
          priceHistory: {
            create: [
              {
                salePrice: data.salePrice ?? null,
                rentPrice: data.rentPrice ?? null,
                changedByUserId: session.user.id,
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

  await recordAudit(prisma, {
    entityType: "Property",
    entityId: property.id,
    action: "create",
    actorType: "USER",
    actorUserId: session.user.id,
    after: { propertyType: data.propertyType, city: data.city, salePrice: data.salePrice ?? null },
  });

  revalidatePath("/properties");
  redirect(`/properties/${property.id}`);
}

export async function updatePropertyAction(formData: FormData) {
  const session = await requirePermission("properties:update");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "ativo");

  const parsed = propertyUpdateSchema.safeParse({ ...readPropertyForm(formData), id, status });
  if (!parsed.success) {
    redirect(`/properties/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  }

  const data = parsed.data;
  const current = await prisma.property.findUniqueOrThrow({ where: { id: data.id } });

  const priceChanged =
    Number(current.salePrice ?? 0) !== Number(data.salePrice ?? 0) ||
    Number(current.rentPrice ?? 0) !== Number(data.rentPrice ?? 0);
  const statusChanged = current.status !== data.status;

  await prisma.$transaction([
    prisma.property.update({
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
          prisma.propertyPriceHistory.create({
            data: {
              propertyId: data.id,
              salePrice: data.salePrice ?? null,
              rentPrice: data.rentPrice ?? null,
              changedByUserId: session.user.id,
            },
          }),
        ]
      : []),
    ...(statusChanged
      ? [
          prisma.propertyStatusHistory.create({
            data: {
              propertyId: data.id,
              fromStatus: current.status,
              toStatus: data.status,
              changedByUserId: session.user.id,
            },
          }),
        ]
      : []),
  ]);

  await recordAudit(prisma, {
    entityType: "Property",
    entityId: data.id,
    action: "update",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { salePrice: current.salePrice, rentPrice: current.rentPrice, status: current.status },
    after: { salePrice: data.salePrice ?? null, rentPrice: data.rentPrice ?? null, status: data.status },
  });

  revalidatePath(`/properties/${data.id}`);
  revalidatePath("/properties");
  redirect(`/properties/${data.id}`);
}

export async function inactivatePropertyAction(formData: FormData) {
  const session = await requirePermission("properties:update");

  const parsed = propertyInactivateSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const id = String(formData.get("id") ?? "");
    redirect(`/properties/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Informe o motivo")}`);
  }

  const { id, reason } = parsed.data;
  const current = await prisma.property.findUniqueOrThrow({ where: { id } });

  await prisma.$transaction([
    prisma.property.update({
      where: { id },
      data: { status: "inativo", inactivatedAt: new Date(), inactivationReason: reason },
    }),
    prisma.propertyStatusHistory.create({
      data: { propertyId: id, fromStatus: current.status, toStatus: "inativo", reason, changedByUserId: session.user.id },
    }),
  ]);

  await recordAudit(prisma, {
    entityType: "Property",
    entityId: id,
    action: "inactivate",
    actorType: "USER",
    actorUserId: session.user.id,
    before: { status: current.status },
    after: { status: "inativo", reason },
  });

  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

export async function recalculateMatchesForPropertyAction(formData: FormData) {
  await requirePermission("matches:recalculate");
  const propertyId = String(formData.get("propertyId") ?? "");
  await getMatchesForProperty(propertyId, { forceRecalculate: true });
  revalidatePath(`/properties/${propertyId}`);
}
