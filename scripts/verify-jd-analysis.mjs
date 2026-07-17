// Verifies JD-drop analysis: real Claude call + the merge/refresh-in-place behavior.
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JD_START = "━━━ Job description analysis ━━━";
function mergeJdAnalysis(existingNotes, analysis) {
  const body = analysis.replace(/\n{2,}/g, "\n").trim();
  const block = `${JD_START}\n${body}`;
  const notes = existingNotes ?? "";
  const manual = notes.replace(new RegExp(`${JD_START}[\\s\\S]*?(?:\\n\\n|$)`), "").trim();
  return manual ? `${block}\n\n${manual}` : block;
}

const instruction =
  "You are a recruiter's assistant analyzing a job description for an engaged search. " +
  "Write a concise brief (plain text, no markdown headers, <=180 words) with short labeled lines covering: " +
  "Role, Seniority, Location/Remote, Comp (if stated), Must-have skills, Nice-to-have skills, and a one-line 'What they're really after' read-between-the-lines note. " +
  "Only state facts from the document; write 'not specified' where the JD is silent. Do not invent details.";

const JD = `Senior Backend Engineer — Fintech payments team.
We're hiring a senior engineer (7+ years) to own our payments ledger service.
Must have: Python, PostgreSQL, distributed systems, event-driven architecture (Kafka).
Nice to have: Go, experience with PCI compliance, prior fintech.
Remote within US. Comp: $180-210k base + equity. Reports to the VP of Engineering.`;

async function analyze(text) {
  const msg = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL_SMART,
    max_tokens: 1024,
    messages: [{ role: "user", content: `${instruction}\n\nJob description:\n${text}` }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

const project = await prisma.project.create({ data: { title: "__verify_jd__" } });
console.log("1. Project created (notes empty:", project.notes === null, ")");

// First drop
const a1 = await analyze(JD);
await prisma.project.update({ where: { id: project.id }, data: { notes: mergeJdAnalysis(null, a1) } });
let p = await prisma.project.findUnique({ where: { id: project.id } });
const hasMarker = p.notes.includes(JD_START);
const noEndFooter = !/end analysis/i.test(p.notes);
const mentionsKey = /python/i.test(p.notes) && /(180|210|remote)/i.test(p.notes);
console.log("2. First analysis stored — marker:", hasMarker, "| no 'end analysis' footer:", noEndFooter, "| captured key facts:", mentionsKey);
console.log("   --- analysis preview ---");
console.log("   " + a1.split("\n").slice(0, 4).join("\n   "));

// Add a manual note below, then re-drop — manual note must survive, only ONE analysis block
await prisma.project.update({
  where: { id: project.id },
  data: { notes: p.notes + "\n\nMANUAL: candidate Jane looks perfect for this." },
});
const a2 = await analyze(JD);
p = await prisma.project.findUnique({ where: { id: project.id } });
await prisma.project.update({ where: { id: project.id }, data: { notes: mergeJdAnalysis(p.notes, a2) } });
p = await prisma.project.findUnique({ where: { id: project.id } });

const blockCount = (p.notes.match(new RegExp(JD_START, "g")) || []).length;
const manualSurvived = p.notes.includes("MANUAL: candidate Jane looks perfect");
const stillNoFooter = !/end analysis/i.test(p.notes);
console.log("3. Re-drop refresh — analysis blocks:", blockCount, "(expect 1) | manual note preserved:", manualSurvived, "| no footer:", stillNoFooter);

await prisma.project.delete({ where: { id: project.id } });
console.log("Cleanup done.");
console.log(
  hasMarker && noEndFooter && mentionsKey && blockCount === 1 && manualSurvived && stillNoFooter
    ? "JD ANALYSIS VERIFIED."
    : "VERIFICATION FAILED — check output above."
);
await prisma.$disconnect();
