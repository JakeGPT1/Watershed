-- Hard backstop against duplicate companies: no two rows may share a case-insensitive name.
-- Application code (findOrCreateCompany) handles fuzzy variants; this index guarantees the
-- exact-name race (two concurrent creates of "Gong") can never produce duplicates again.
CREATE UNIQUE INDEX "Company_name_ci_key" ON "Company" (lower("name"));
