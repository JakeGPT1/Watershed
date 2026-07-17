export interface SeedCompany {
  name: string;
  atsType?: "greenhouse" | "lever" | "ashby";
  atsSlug?: string;
}

/** Seed list of San Diego AI companies to monitor for GTM hiring signal. */
export const GTM_SEED_COMPANIES: SeedCompany[] = [
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
];
