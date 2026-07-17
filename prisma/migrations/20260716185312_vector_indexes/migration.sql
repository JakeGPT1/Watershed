-- hnsw indexes for cosine similarity search (works from first row, no training data needed)
CREATE INDEX IF NOT EXISTS candidate_embedding_idx ON "Candidate" USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS job_embedding_idx ON "Job" USING hnsw (embedding vector_cosine_ops);
