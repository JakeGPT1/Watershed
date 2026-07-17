export interface NormalizedPosting {
  externalId: string; // ats:slug:jobId — stable dedupe key
  title: string;
  department: string | null;
  location: string | null;
  url: string;
  postedAt: Date | null;
  description: string;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGreenhouse(slug: string): Promise<NormalizedPosting[] | null> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  )) as { jobs?: unknown[] } | null;
  if (!data?.jobs) return null;
  return data.jobs.map((j) => {
    const job = j as {
      id: number;
      title: string;
      departments?: { name: string }[];
      location?: { name: string };
      absolute_url: string;
      updated_at?: string;
      content?: string;
    };
    return {
      externalId: `greenhouse:${slug}:${job.id}`,
      title: job.title,
      department: job.departments?.[0]?.name ?? null,
      location: job.location?.name ?? null,
      url: job.absolute_url,
      postedAt: job.updated_at ? new Date(job.updated_at) : null,
      description: job.content ? stripHtml(job.content) : job.title,
    };
  });
}

async function fetchLever(slug: string): Promise<NormalizedPosting[] | null> {
  const data = (await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`)) as
    | unknown[]
    | null;
  if (!data) return null;
  return data.map((j) => {
    const job = j as {
      id: string;
      text: string;
      categories?: { team?: string; location?: string };
      hostedUrl: string;
      createdAt?: number;
      descriptionPlain?: string;
      description?: string;
    };
    return {
      externalId: `lever:${slug}:${job.id}`,
      title: job.text,
      department: job.categories?.team ?? null,
      location: job.categories?.location ?? null,
      url: job.hostedUrl,
      postedAt: job.createdAt ? new Date(job.createdAt) : null,
      description: job.descriptionPlain ?? (job.description ? stripHtml(job.description) : job.text),
    };
  });
}

async function fetchAshby(slug: string): Promise<NormalizedPosting[] | null> {
  const data = (await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)) as {
    jobs?: unknown[];
  } | null;
  if (!data?.jobs) return null;
  return data.jobs.map((j) => {
    const job = j as {
      id: string;
      title: string;
      department?: string;
      location?: string;
      jobUrl: string;
      publishedAt?: string;
      descriptionPlain?: string;
    };
    return {
      externalId: `ashby:${slug}:${job.id}`,
      title: job.title,
      department: job.department ?? null,
      location: job.location ?? null,
      url: job.jobUrl,
      postedAt: job.publishedAt ? new Date(job.publishedAt) : null,
      description: job.descriptionPlain ?? job.title,
    };
  });
}

export async function fetchPostings(
  atsType: "greenhouse" | "lever" | "ashby",
  slug: string
): Promise<NormalizedPosting[] | null> {
  switch (atsType) {
    case "greenhouse":
      return fetchGreenhouse(slug);
    case "lever":
      return fetchLever(slug);
    case "ashby":
      return fetchAshby(slug);
  }
}
