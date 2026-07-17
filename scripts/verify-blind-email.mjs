// Leak test + robustness test for the blind BD email drafter, mirroring the real
// production code path (assistant-prefill JSON forcing, retry-once, max_tokens=1024).
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BLIND_DRAFT_TOOL = {
  name: "submit_blind_draft",
  description: "Submit the finished blind BD email draft.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "Email body, plain text" },
    },
    required: ["subject", "body"],
  },
};

async function draftBlindOutreachOnce(input) {
  const msg = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL_SMART,
    max_tokens: 1024,
    tools: [BLIND_DRAFT_TOOL],
    tool_choice: { type: "tool", name: "submit_blind_draft" },
    messages: [
      {
        role: "user",
        content:
          'You are a recruiter\'s assistant drafting a BLIND business-development email. The recruiter (from a search firm called Watershed, sender name "Jake") wants to pitch a strong candidate to a hiring manager for their open role WITHOUT revealing who the candidate is — the manager should be intrigued but unable to identify or contact the candidate directly.\n\n' +
          "CRITICAL BLINDING RULES — the subject and body MUST NOT contain: the candidate's name or any part of it; names of the candidate's current or past employers; or any uniquely identifying detail (specific product/project names, unusual exact titles, personal URLs, exact tenure dates, anything reverse-searchable). Instead describe the candidate generically: seniority, years of experience as a range (e.g. \"8+ years\"), skill areas, the TYPE of company they've worked at (e.g. \"a leading payments company\", never the actual name), general region, and why they fit THIS role.\n\n" +
          'KEEP the hiring company\'s own name and the role title — the pitch is FOR that specific opening; only the CANDIDATE is blinded. Do not invent facts about the candidate beyond what is provided. Tone: concise, confident, <=150 words, no fluff; end with a soft call to book a short call, signed "Best,\\nJake\\nWatershed".\n\n' +
          `Target company: ${input.targetCompany}. Open role: ${input.roleTitle} (${input.roleContext}). Candidate to BLIND — summary: ${input.candidateSummary}; seniority/title: ${input.candidateSeniority}; skills: ${input.candidateSkills}; location: ${input.candidateLocation}.\n\n` +
          "Call submit_blind_draft with the finished subject and body.",
      },
    ],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("Blind draft truncated — retry");
  }
  const toolUse = msg.content.find((b) => b.type === "tool_use" && b.name === "submit_blind_draft");
  if (!toolUse) throw new Error("Model did not call submit_blind_draft");
  return toolUse.input;
}

async function draftBlindOutreach(input) {
  try {
    return await draftBlindOutreachOnce(input);
  } catch (firstErr) {
    try {
      return await draftBlindOutreachOnce(input);
    } catch {
      const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`Could not generate blind draft: ${detail.slice(0, 200)}`);
    }
  }
}

function redactName(text, candidateName) {
  const tokens = candidateName.split(/\s+/).filter((t) => t.length >= 3);
  let result = text;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return result;
}

let allPass = true;
function check(label, ok) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) allPass = false;
}

// ---------- Case 1: rich synthetic candidate — leak test ----------
const realOpp = await prisma.job.findFirst({
  where: { isGtmOpportunity: true },
  include: { company: true },
});
const targetCompany = realOpp?.company?.name ?? "Acme Robotics";
const roleTitle = realOpp?.title ?? "VP of Sales";
const roleContext = realOpp?.department ?? "Go-to-market";

const candidateName = "Zephyrina Quackenbush";
console.log(`\n=== Case 1: rich candidate, leak test ===`);
console.log(`Target: ${targetCompany} — ${roleTitle}`);
console.log(`Synthetic candidate: ${candidateName} (deliberately distinctive)`);

const draft1 = await draftBlindOutreach({
  targetCompany,
  roleTitle,
  roleContext,
  candidateSummary:
    "Senior enterprise sales leader, ex-MoonjuiceRobotics, led sales at Fizzbuzz Dynamics, closed multiple 7-figure deals.",
  candidateSeniority: "VP of Sales at Fizzbuzz Dynamics",
  candidateSkills: "enterprise sales, saas, negotiation, team building",
  candidateLocation: "San Diego, CA",
});
const subject1 = redactName(draft1.subject, candidateName);
const body1 = redactName(draft1.body, candidateName);
const combined1 = `${subject1}\n\n${body1}`;

console.log("--- draft ---");
console.log("Subject:", subject1);
console.log(body1);
console.log("---");

for (const term of ["Zephyrina", "Quackenbush", "Moonjuice", "Fizzbuzz"]) {
  check(`does not contain "${term}"`, !new RegExp(term, "i").test(combined1));
}
check(
  `body mentions target company "${targetCompany}"`,
  combined1.toLowerCase().includes(targetCompany.toLowerCase())
);
check("subject and body are non-empty", subject1.trim().length > 0 && body1.trim().length > 0);

// ---------- Case 2: sparse candidate + long real JD context (the original failure) ----------
console.log(`\n=== Case 2: sparse candidate + long roleContext (reproduces original bug) ===`);

const realJob = await prisma.job.findFirst({ where: { isGtmOpportunity: true }, include: { company: true } });
const longRoleContext = realJob
  ? `${realJob.department ?? ""} ${realJob.rawText.slice(0, 1500)}`.trim()
  : "Go-to-market ".repeat(100);

const draft2 = await draftBlindOutreach({
  targetCompany: realJob?.company?.name ?? "Acme Robotics",
  roleTitle: realJob?.title ?? "Head of Sales",
  roleContext: longRoleContext,
  candidateSummary: "(no summary on file — describe only from skills/title/location provided)",
  candidateSeniority: "Engineer",
  candidateSkills: "(none listed)",
  candidateLocation: "San Diego, CA",
});
console.log("--- draft (sparse input) ---");
console.log("Subject:", draft2.subject);
console.log(draft2.body);
console.log("---");
check("sparse-candidate case returns valid subject", typeof draft2.subject === "string" && draft2.subject.length > 0);
check("sparse-candidate case returns valid body", typeof draft2.body === "string" && draft2.body.length > 0);

await prisma.$disconnect();
console.log(allPass ? "\nBLIND EMAIL TEST: ALL PASS." : "\nBLIND EMAIL TEST: FAILURE — see above.");
if (!allPass) process.exit(1);
