import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SMART = process.env.CLAUDE_MODEL_SMART || "claude-sonnet-5";
const CHEAP = process.env.CLAUDE_MODEL_CHEAP || "claude-haiku-4-5";

export type TagKind =
  | "skill" | "seniority" | "status" | "location" | "comp" | "vertical" | "other";
export interface ExtractedTag { label: string; kind: TagKind; }

/** Strip markdown fences and parse the first JSON object in a model response. */
function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model response");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export interface ResumeParse {
  currentTitle: string | null;
  location: string | null;
  compExpect: string | null;
  summary: string;
  skills: string[];
}

/** Parse a resume. Pass either extracted text or a PDF buffer (Claude reads PDFs natively). */
export async function parseResume(
  input: { text: string } | { pdfBase64: string }
): Promise<ResumeParse> {
  const instruction =
    'You are parsing a resume for a recruiter\'s ATS. Return JSON only: { "currentTitle": string, "location": string|null, "compExpect": string|null, "summary": string (<=25 words), "skills": string[] }.';

  const content: Anthropic.ContentBlockParam[] =
    "pdfBase64" in input
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
          },
          { type: "text", text: instruction },
        ]
      : [{ type: "text", text: `${instruction} Resume text: ${input.text}` }];

  const msg = await anthropic.messages.create({
    model: CHEAP,
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });
  return parseJson<ResumeParse>(textOf(msg));
}

export interface LinkedInParse {
  currentTitle: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
}

export async function parseLinkedIn(
  rawText: string,
  existingSummary: string | null,
  existingSkills: string[]
): Promise<LinkedInParse> {
  const msg = await anthropic.messages.create({
    model: CHEAP,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          'You are extracting profile details from pasted LinkedIn text for a recruiter\'s ATS. This candidate may already have some fields filled from a resume — treat this as an ADDITIONAL, possibly more current source, not a replacement. Return JSON only: { "currentTitle": string|null, "location": string|null, "summary": string|null (<=25 words, only if you can improve on the existing one), "skills": string[] }. ' +
          `Existing candidate summary: ${existingSummary ?? "(none)"}. Existing skills: ${existingSkills.join(", ") || "(none)"}. Pasted LinkedIn text: ${rawText}`,
      },
    ],
  });
  return parseJson<LinkedInParse>(textOf(msg));
}

export async function tagNote(body: string): Promise<ExtractedTag[]> {
  const msg = await anthropic.messages.create({
    model: CHEAP,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content:
          'Extract recruiter tags from this note. Return JSON only: { "tags": [{ "label": string (lowercase, short), "kind": "skill"|"seniority"|"status"|"location"|"comp"|"vertical"|"other" }] }. Note: ' +
          body,
      },
    ],
  });
  return parseJson<{ tags: ExtractedTag[] }>(textOf(msg)).tags ?? [];
}

export interface TranscriptParse { summary: string; tags: ExtractedTag[]; }

export async function summarizeTranscript(
  input: { text: string } | { pdfBase64: string }
): Promise<TranscriptParse> {
  const instruction =
    'You are reviewing a recruiter\'s call transcript with a candidate. Return JSON only: { "summary": string (<=60 words, key facts: motivation, comp expectations, availability, concerns, standout skills), "tags": [{ "label": string (lowercase, short), "kind": "skill"|"seniority"|"status"|"location"|"comp"|"vertical"|"other" }] }. Ignore filler/small talk.';

  const content: Anthropic.ContentBlockParam[] =
    "pdfBase64" in input
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
          },
          { type: "text", text: instruction },
        ]
      : [{ type: "text", text: `${instruction} Transcript: ${input.text}` }];

  const msg = await anthropic.messages.create({
    model: CHEAP,
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });
  const parsed = parseJson<TranscriptParse>(textOf(msg));
  return { summary: parsed.summary ?? "", tags: parsed.tags ?? [] };
}

/** Why a candidate fits a job — capped to top matches only by the caller (cost control). */
export async function matchRationale(
  jobRequirements: string,
  candidateSummary: string
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content:
          `Recruiter is matching a candidate to a job. In <=40 words, state why this candidate fits and the single biggest gap. Job requirements: ${jobRequirements}. Candidate summary+tags: ${candidateSummary}.`,
      },
    ],
  });
  return textOf(msg).trim();
}

export interface BlindDraft {
  subject: string;
  body: string;
}

/**
 * Draft a BD email pitching a candidate to a hiring manager with the candidate fully
 * anonymized — only the target company + role stay identifiable. Draft-only; never sent
 * by this app. The caller (draftBlindEmail action) applies an additional server-side
 * name-redaction backstop after this returns.
 */
const BLIND_DRAFT_TOOL: Anthropic.Tool = {
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

async function draftBlindOutreachOnce(input: {
  targetCompany: string;
  roleTitle: string;
  roleContext: string;
  candidateSummary: string;
  candidateSeniority: string;
  candidateSkills: string;
  candidateLocation: string;
}): Promise<BlindDraft> {
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1024,
    tools: [BLIND_DRAFT_TOOL],
    tool_choice: { type: "tool", name: "submit_blind_draft" },
    messages: [
      {
        role: "user",
        content:
          'You are drafting a business-development email for Jake, founder of the recruiting firm Watershed. Jake is writing directly to a hiring manager about their open role. TWO GOALS: (1) make the featured candidate sound as compelling as possible for THIS role, and (2) position Jake/Watershed memorably — the reader should come away thinking "I should talk to Watershed when I\'m hiring GTM talent," even if this candidate isn\'t the one.\n\n' +
          'SENDER IS NOT ANONYMOUS: write in Jake\'s first-person voice. Mention Watershed exactly ONCE in the whole email, worked in naturally (e.g. "I run Watershed, a search firm focused on GTM talent") — never repeat the firm name, never stack title+firm in the signature. Sign off simply: "Best,\\nJake". No self-important framing; let the candidate quality do the selling.\n\n' +
          "CANDIDATE IS BLIND: the subject and body MUST NOT contain the candidate's name or any part of it; names of their current/past employers; or any uniquely identifying, reverse-searchable detail (specific product names, unusual exact titles, personal URLs, exact tenure dates). Instead SELL them generically but vividly: seniority, years as a range, quantified wins kept generic (\"grew a book 3x\", \"closed multiple 7-figure deals\"), the TYPE of company they've worked at, general region, and precisely WHY they map to this role's needs. The reader should be intrigued enough to reply, and unable to find the candidate on their own.\n\n" +
          "Do not invent facts beyond what is provided. Confident, direct, warm; <=170 words; end with a specific, low-friction call to action to book a 15-minute call.\n\n" +
          `Target company: ${input.targetCompany}. Open role: ${input.roleTitle} (${input.roleContext}). Candidate to BLIND — summary: ${input.candidateSummary}; seniority/title: ${input.candidateSeniority}; skills: ${input.candidateSkills}; location: ${input.candidateLocation}.\n\n` +
          "Call submit_blind_draft with the finished subject and body.",
      },
    ],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("Blind draft truncated — retry");
  }
  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_blind_draft"
  );
  if (!toolUse) throw new Error("Model did not call submit_blind_draft");
  return toolUse.input as BlindDraft;
}

export async function draftBlindOutreach(input: {
  targetCompany: string;
  roleTitle: string;
  roleContext: string;
  candidateSummary: string;
  candidateSeniority: string;
  candidateSkills: string;
  candidateLocation: string;
}): Promise<BlindDraft> {
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

export interface StandardOutreachCandidate {
  name: string;
  title: string;
  skills: string;
  summary: string;
  rationale: string;
}

const STANDARD_OUTREACH_TOOL: Anthropic.Tool = {
  name: "submit_outreach_draft",
  description: "Submit the finished BD email draft.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "Email body, plain text" },
    },
    required: ["subject", "body"],
  },
};

async function draftStandardOutreachOnce(input: {
  jobTitle: string;
  company: string;
  contactName: string | null;
  candidates: StandardOutreachCandidate[];
}): Promise<BlindDraft> {
  const candidateLines = input.candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} — title: ${c.title || "n/a"}; skills: ${c.skills || "n/a"}; summary: ${c.summary || "n/a"}; why they fit: ${c.rationale || "n/a"}`
    )
    .join("\n");

  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1024,
    tools: [STANDARD_OUTREACH_TOOL],
    tool_choice: { type: "tool", name: "submit_outreach_draft" },
    messages: [
      {
        role: "user",
        content:
          'You are drafting a business-development email from a recruiter ("Jake" at the search firm "Watershed") to a hiring manager, pitching real candidates for their open role. This is NOT blind — you MAY name the candidates and cite their specific strengths. Reference the top matched candidate(s) by name with 1-2 concrete highlights each (title, skills, standout fit). Do not invent facts beyond what is provided. Concise, confident, <=180 words; address the contact by name if provided; end with a soft call to book a short call, signed "Best,\\nJake\\nWatershed".\n\n' +
          `Role: ${input.jobTitle} at ${input.company}. Hiring manager: ${input.contactName ?? "the team"}. Candidates:\n${candidateLines}\n\n` +
          "Call submit_outreach_draft with the finished subject and body.",
      },
    ],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("Outreach draft truncated — retry");
  }
  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_outreach_draft"
  );
  if (!toolUse) throw new Error("Model did not call submit_outreach_draft");
  return toolUse.input as BlindDraft;
}

/** Draft a standard (named) BD email — the non-blind counterpart to draftBlindOutreach. */
export async function draftStandardOutreach(input: {
  jobTitle: string;
  company: string;
  contactName: string | null;
  candidates: StandardOutreachCandidate[];
}): Promise<BlindDraft> {
  try {
    return await draftStandardOutreachOnce(input);
  } catch (firstErr) {
    try {
      return await draftStandardOutreachOnce(input);
    } catch {
      const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`Could not generate outreach draft: ${detail.slice(0, 200)}`);
    }
  }
}

export interface JobExtract {
  title: string;
  requirements: string;
  matchText: string;
}

const JOB_EXTRACT_TOOL: Anthropic.Tool = {
  name: "submit_job_extract",
  description: "Submit the extracted job fields.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The role title" },
      requirements: { type: "string", description: "Bulleted must-haves, <=120 words" },
      matchText: {
        type: "string",
        description: "Dense, keyword-rich paragraph optimized for semantic similarity matching against candidate profiles",
      },
    },
    required: ["title", "requirements", "matchText"],
  },
};

async function extractJobFromJDOnce(rawText: string): Promise<JobExtract> {
  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1024,
    tools: [JOB_EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "submit_job_extract" },
    messages: [
      {
        role: "user",
        content:
          "Extract from this job description for a recruiter's matching system. title = the role title. " +
          "requirements = bulleted must-haves, <=120 words. matchText = a dense, keyword-rich paragraph " +
          "optimized for semantic similarity matching against candidate profiles.\n\n" +
          `JD: ${rawText}\n\nCall submit_job_extract with the extracted fields.`,
      },
    ],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("Job extract truncated — retry");
  }
  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_job_extract"
  );
  if (!toolUse) throw new Error("Model did not call submit_job_extract");
  return toolUse.input as JobExtract;
}

/** Extract title/requirements/matchText from a pasted job description (manual JD flow). */
export async function extractJobFromJD(rawText: string): Promise<JobExtract> {
  try {
    return await extractJobFromJDOnce(rawText);
  } catch (firstErr) {
    try {
      return await extractJobFromJDOnce(rawText);
    } catch {
      const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`Could not extract job: ${detail.slice(0, 200)}`);
    }
  }
}

/**
 * Analyze a job-description document into a concise recruiter-facing brief for the
 * project notes. Returns plain text (not JSON) — a readable summary the recruiter scans.
 */
export async function analyzeJobDescription(
  input: { text: string } | { pdfBase64: string }
): Promise<string> {
  const instruction =
    "You are a recruiter's assistant analyzing a job description for an engaged search. " +
    "Write a concise brief (plain text, no markdown headers, <=180 words) with short labeled lines covering: " +
    "Role, Seniority, Location/Remote, Comp (if stated), Must-have skills, Nice-to-have skills, and a one-line 'What they're really after' read-between-the-lines note. " +
    "Only state facts from the document; write 'not specified' where the JD is silent. Do not invent details.";

  const content: Anthropic.ContentBlockParam[] =
    "pdfBase64" in input
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 },
          },
          { type: "text", text: instruction },
        ]
      : [{ type: "text", text: `${instruction}\n\nJob description:\n${input.text}` }];

  const msg = await anthropic.messages.create({
    model: SMART,
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });
  return textOf(msg).trim();
}
