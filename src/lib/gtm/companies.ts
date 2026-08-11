export interface SeedCompany {
  name: string;
  atsType?: "greenhouse" | "lever" | "ashby";
  atsSlug?: string;
}

// Seed list of growth-stage companies to monitor for GTM hiring signal — San Diego-rooted,
// broadened to national growth SaaS that actively hire sales & marketing talent (Watershed's
// ideal clientele). Entries with a known atsType/atsSlug are scraped directly; name-only
// entries are auto-resolved by the monitor's ATS discovery (and cached), so it's safer to
// leave the slug off than to guess it wrong (a wrong slug silently fetches nothing).
export const GTM_SEED_COMPANIES: SeedCompany[] = [
  // Original San Diego set
  { name: "Shield AI", atsType: "lever", atsSlug: "shieldai" },
  { name: "ClickUp", atsType: "ashby", atsSlug: "clickup" },
  { name: "Unconventional AI" },
  { name: "JuiceBox" },
  { name: "Iambic Therapeutics" },
  { name: "Brain Corp" },
  { name: "Netradyne" },
  { name: "Kneron" },
  { name: "Yembo" },
  { name: "Equal Parts" },
  // San Diego / SoCal growth SaaS
  { name: "Drata" },
  { name: "Seismic" },
  { name: "Tealium" },
  { name: "Measurabl" },
  { name: "SOCi" },
  { name: "Cloudbeds" },
  { name: "Classy" },
  { name: "Kyriba" },
  { name: "Digital.ai" },
  { name: "Mitek Systems" },
  // National growth SaaS — heavy, ongoing GTM hiring
  { name: "Vanta" },
  { name: "Gong" },
  { name: "Clari" },
  { name: "Rippling" },
  { name: "Ramp" },
  { name: "Airtable" },
];
