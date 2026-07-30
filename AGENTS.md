# Repository guidance

- Keep document ingestion, retrieval, reranking, context building, and Gemini generation in separate service modules.
- Never add OpenAI SDKs, Gemini embeddings, Gemini File Search, hardcoded chatbot answers, or string `includes` retrieval.
- Never expose `GEMINI_API_KEY` through frontend variables, API responses, logs, or the database.
- Preserve `workspace_id` filtering on every tenant-owned query.
- Render chat content as plain text or sanitize Markdown before adding rich rendering.
- Run frontend build/tests and the API unit suite after material changes.
- Mark model, database, Docker, and paid Gemini integration tests accurately when their prerequisites are unavailable.
