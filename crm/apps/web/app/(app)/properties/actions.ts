"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@mabres/db";
import { propertyCreateSchema, propertyInactivateSchema, propertyUpdateSchema } from "@mabres/shared";
import { requirePermission } from "@/lib/session";
import { getMatchesForProperty } from "@/lib/matching-service";
import { createProperty, inactivateProperty, updateProperty } from "@/lib/property-service";

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
  const property = await createProperty(prisma, data, session.user.id);

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

  await updateProperty(prisma, data, current, session.user.id);

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

  const { id } = parsed.data;
  const current = await prisma.property.findUniqueOrThrow({ where: { id } });

  await inactivateProperty(prisma, parsed.data, current, session.user.id);

  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

export async function recalculateMatchesForPropertyAction(formData: FormData) {
  await requirePermission("matches:recalculate");
  const propertyId = String(formData.get("propertyId") ?? "");
  await getMatchesForProperty(propertyId, { forceRecalculate: true });
  revalidatePath(`/properties/${propertyId}`);
}
