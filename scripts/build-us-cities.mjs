// One-time generator for src/lib/gtm/us-places.json — a static set of US city names
// used by isUsLocation() to recognize bare city names ("Carlsbad") without an allowlist.
//
// Source: kelvins/US-Cities-Database (MIT licensed), a maintained CSV of US cities with
// state codes — https://github.com/kelvins/US-Cities-Database
// (Census.gov's Gazetteer files, the originally planned source, are unreachable from this
// environment — this GitHub-hosted dataset is the practical substitute; re-run this script
// against Census data instead if that source becomes reachable later.)
//
// Re-run with: node scripts/build-us-cities.mjs

import { writeFileSync } from "node:fs";

const SOURCE_URL =
  "https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv";

// Real US place names that collide with far-more-famous foreign cities or common English
// words. Excluding them here means the segment-exact city match in filter.ts never fires
// on them; the state-abbreviation tier (e.g. "Mobile, AL") still recognizes them correctly.
const EXCLUDE = new Set([
  "london", "dublin", "paris", "berlin", "munich", "madrid", "barcelona", "amsterdam",
  "toronto", "vancouver", "sydney", "melbourne", "tokyo", "manila", "moscow", "athens",
  "rome", "milan", "naples", "florence", "venice", "geneva", "oxford", "cambridge",
  "mobile", "normal", "home", "hurricane", "remote", "industry", "cosmopolis",
]);

function parseCsvLine(line) {
  // Minimal CSV parser sufficient for this dataset (quoted fields only around COUNTY).
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

async function main() {
  console.log("Fetching", SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  const header = parseCsvLine(lines[0]);
  const cityIdx = header.indexOf("CITY");
  if (cityIdx === -1) throw new Error("CITY column not found in source CSV");

  const names = new Set();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const raw = fields[cityIdx];
    if (!raw) continue;
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized.length < 4) continue; // drop short names (avoid "roy", "ada" collisions)
    if (EXCLUDE.has(normalized)) continue;
    names.add(normalized);
  }

  const sorted = Array.from(names).sort();
  writeFileSync(
    new URL("../src/lib/gtm/us-places.json", import.meta.url),
    JSON.stringify(sorted)
  );

  console.log(`Wrote ${sorted.length} US place names.`);
  console.log("Sample:", sorted.slice(0, 5));
  console.log("Contains 'san francisco':", sorted.includes("san francisco"));
  console.log("Contains 'carlsbad':", sorted.includes("carlsbad"));
  console.log("Contains 'salt lake city':", sorted.includes("salt lake city"));
  console.log("Excludes 'london':", !sorted.includes("london"));
}

main();
