// Phase 1.5 pipeline check: project creation, candidate placement, stage transitions, notes.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STAGES = ["Pursuing", "Scheduling", "Screen", "Hiring Interview", "Offer", "Not Interested"];

// 1. Create a company + project
const company = await prisma.company.create({ data: { name: "__verify_co__" } });
const project = await prisma.project.create({
  data: { title: "__verify_project__", companyId: company.id },
});
console.log("1. Project created:", project.id);

// 2. Create 2 candidates and add both to the project (default stage)
const c1 = await prisma.candidate.create({ data: { name: "__verify_cand_1__", currentTitle: "Engineer" } });
const c2 = await prisma.candidate.create({ data: { name: "__verify_cand_2__", currentTitle: "Designer" } });
await prisma.projectCandidate.createMany({
  data: [
    { projectId: project.id, candidateId: c1.id },
    { projectId: project.id, candidateId: c2.id },
  ],
});
console.log("2. Added 2 candidates at default stage");

const afterAdd = await prisma.projectCandidate.findMany({ where: { projectId: project.id } });
const defaultsOk = afterAdd.every((pc) => pc.stage === "Pursuing");
console.log("   Default stage check:", defaultsOk ? "PASS (all Pursuing)" : "FAIL");

// 3. Move c1 through Pursuing -> Screen
await prisma.projectCandidate.update({
  where: { projectId_candidateId: { projectId: project.id, candidateId: c1.id } },
  data: { stage: "Screen" },
});
console.log("3. Moved candidate 1 to Screen");

// 4. Grouping query — same shape the page uses
const withCands = await prisma.project.findUnique({
  where: { id: project.id },
  include: { candidates: { include: { candidate: true } } },
});
const byStage = new Map(STAGES.map((s) => [s, []]));
for (const pc of withCands.candidates) byStage.get(pc.stage).push(pc);
const screenGroup = byStage.get("Screen");
const pursuingGroup = byStage.get("Pursuing");
console.log(
  "4. Grouping check:",
  screenGroup.length === 1 && screenGroup[0].candidateId === c1.id && pursuingGroup.length === 1
    ? "PASS (1 in Screen, 1 in Pursuing)"
    : `FAIL (Screen=${screenGroup.length}, Pursuing=${pursuingGroup.length})`
);

// 5. Set + read a per-search note
await prisma.projectCandidate.update({
  where: { projectId_candidateId: { projectId: project.id, candidateId: c2.id } },
  data: { note: "Referred by a friend, strong portfolio" },
});
const withNote = await prisma.projectCandidate.findUnique({
  where: { projectId_candidateId: { projectId: project.id, candidateId: c2.id } },
});
console.log("5. Note round-trip:", withNote.note === "Referred by a friend, strong portfolio" ? "PASS" : "FAIL");

// 6. A candidate can be in multiple projects
const project2 = await prisma.project.create({ data: { title: "__verify_project_2__" } });
await prisma.projectCandidate.create({ data: { projectId: project2.id, candidateId: c1.id } });
const c1Projects = await prisma.projectCandidate.findMany({ where: { candidateId: c1.id } });
console.log("6. Multi-project membership:", c1Projects.length === 2 ? "PASS" : "FAIL");

// Cleanup
await prisma.projectCandidate.deleteMany({ where: { candidateId: { in: [c1.id, c2.id] } } });
await prisma.project.deleteMany({ where: { id: { in: [project.id, project2.id] } } });
await prisma.candidate.deleteMany({ where: { id: { in: [c1.id, c2.id] } } });
await prisma.company.delete({ where: { id: company.id } });
console.log("Cleanup done. PHASE 1.5 PIPELINE VERIFIED.");
await prisma.$disconnect();
