import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const tables = await prisma.$queryRaw`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name;`;
console.log("Tables:", tables.map((t) => t.table_name).join(", "));

const indexes = await prisma.$queryRaw`
  select indexname from pg_indexes
  where indexname in ('candidate_embedding_idx', 'job_embedding_idx');`;
console.log("Vector indexes:", indexes.map((i) => i.indexname).join(", ") || "MISSING");

const vec = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)));
const c = await prisma.candidate.create({ data: { name: "__verify__" } });
await prisma.$executeRaw`update "Candidate" set embedding = ${vec}::vector where id = ${c.id}`;
const near = await prisma.$queryRaw`
  select id, 1 - (embedding <=> ${vec}::vector) as score
  from "Candidate" where embedding is not null
  order by embedding <=> ${vec}::vector limit 1;`;
console.log("Vector round-trip score (expect 1):", near[0]?.score);
await prisma.candidate.delete({ where: { id: c.id } });
console.log("Cleanup done. DB scaffold VERIFIED.");
await prisma.$disconnect();
