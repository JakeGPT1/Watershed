"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/supabase/server";
import { failTo } from "@/lib/formError";

export async function createCompany(formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo("/companies/new", "Name is required");

  const company = await prisma.company.create({
    data: {
      name,
      industry: String(formData.get("industry") ?? "").trim() || null,
      website: String(formData.get("website") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(companyId: string, formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo(`/companies/${companyId}`, "Name is required");

  const existing = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const fundingStage = String(formData.get("fundingStage") ?? "").trim() || null;
  const fundingChanged = fundingStage !== existing.fundingStage;

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name,
      industry: String(formData.get("industry") ?? "").trim() || null,
      website: String(formData.get("website") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      fundingStage,
      // Only stamp a manual-override basis/date when the owner actually changed the value —
      // resubmitting the form unchanged must not reset the research-derived basis/checkedAt.
      ...(fundingChanged
        ? { fundingBasis: "Set manually by owner", fundingCheckedAt: new Date() }
        : {}),
    },
  });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function addContact(companyId: string, formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo(`/companies/${companyId}`, "Contact name is required");

  await prisma.contact.create({
    data: {
      companyId,
      name,
      title: String(formData.get("title") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    },
  });
  revalidatePath(`/companies/${companyId}`);
}

export async function updateContact(contactId: string, companyId: string, formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) failTo(`/companies/${companyId}`, "Contact name is required");

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      name,
      title: String(formData.get("title") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    },
  });
  revalidatePath(`/companies/${companyId}`);
}

export async function removeContact(contactId: string, companyId: string) {
  await requireOwner();
  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath(`/companies/${companyId}`);
}
