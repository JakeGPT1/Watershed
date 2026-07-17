import { prisma } from "@/lib/prisma";
async function main() {
  const c = await prisma.candidate.findFirst({ where: { email: "bot@example.com" } });
  console.log(c ? "FOUND (BAD - honeypot failed)" : "NOT FOUND (correct - honeypot worked)");
}
main().finally(() => prisma.$disconnect());
