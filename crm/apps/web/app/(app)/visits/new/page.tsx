import { prisma } from "@mabres/db";
import { getCurrentSession } from "@/lib/session";
import { NewVisitForm } from "./new-visit-form";

export default async function NewVisitPage() {
  const session = await getCurrentSession();

  const [contacts, properties, brokers] = await Promise.all([
    prisma.contact.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.property.findMany({
      where: { deletedAt: null },
      select: { id: true, internalCode: true, propertyType: true, status: true },
      orderBy: { internalCode: "asc" },
    }),
    prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Agendar visita</h1>
        <p className="text-sm text-slate-500">Conflitos de agenda geram aviso — não bloqueiam automaticamente.</p>
      </div>
      <NewVisitForm
        contacts={contacts}
        properties={properties}
        brokers={brokers}
        canOverrideConflict={session?.user.permissions.includes("visits:override_conflict") ?? false}
      />
    </div>
  );
}
