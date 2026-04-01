# Voice agent knowledge base (RAG)

Per-agent knowledge bases are stored in MongoDB (`VoiceAgent`, `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk`) and queried with OpenAI embeddings plus optional `gpt-4o-mini` answer compression.

## Setup

1. Set `OPENAI_API_KEY` in `.env`.
2. Set `BOLNA_AGENT_ID` and `BOLNA_CANDIDATE_AGENT_ID` as today. On server start, matching `VoiceAgent` rows are **upserted** from those env values (names only on insert).
3. Grant admins the same access as Bolna candidate settings (`users.manage` or Administrator / platform super user).

## API (prefix `/v1`)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/agents` | List / create local registry agents |
| GET/PATCH | `/agents/:agentId` | Detail (Mongo id or Bolna external id) / update name, `knowledgeBaseEnabled`, description |
| POST | `/kb/query` | Body `{ agentId, query, includeSources? }` → `{ answer, fallback?, ... }` |
| POST | `/kb/:agentId/documents/pdf` | Multipart field `file` (PDF), optional `title` |
| POST | `/kb/:agentId/documents/text` | JSON `{ title?, text }` |
| POST | `/kb/:agentId/documents/url` | JSON `{ url }` (HTTP/HTTPS, SSRF mitigations) |
| GET | `/kb/:agentId/documents` | List documents (no `rawText`) |
| DELETE | `/kb/documents/:documentId` | Remove document and chunks |

`agentId` in paths may be the Mongo `_id` or the Bolna `externalAgentId` string.

## Environment variables

See `.env.example` (section “Voice agent knowledge base”). Highlights:

- **KB_MIN_SIMILARITY** — cosine threshold before calling the LLM; if all top‑k scores are below it, the API returns the support fallback line (short TTL cache for misses).
- **KB_QUERY_CACHE_TTL_SECONDS** / **KB_QUERY_CACHE_MISS_TTL_SECONDS** — cache hits for successful answers vs fallback/low-confidence paths.
- **KB_MAX_DOCS_PER_AGENT** — cap on concurrent non-failed documents per KB.
- **KB_MAX_URL_BYTES** — hard cap on fetched body size for URL ingest.
- **MONGODB_VECTOR_SEARCH_ENABLED** — reserved for a future Atlas `$vectorSearch` path; MVP uses in-app cosine over stored vectors.

## URL ingest and SSRF

URL ingestion:

- Allows only `http:` and `https:`; rejects credentials in the URL.
- Resolves the hostname and **rejects** if any resolved address is private, loopback, link-local, metadata (e.g. `169.254.0.0/16`), or IPv6 ULA/link-local.
- Uses **`redirect: 'error'`** (no redirects followed).
- Enforces timeout and max body size.

For stricter deployments, consider an allowlist layer in front of this feature.

## Bolna integration

### In-app RAG + prompt context

For **candidate verification** calls, when the knowledge base is enabled for the matching `VoiceAgent`, a short seed retrieval block is appended to **extra system instructions** (alongside DB overrides) so the agent can reference uploaded facts. True per-turn RAG on live user utterances requires a backend hook for transcript text (webhook or telephony), but `getAnswer` / `POST /v1/kb/query` are available for that path.

### Optional: mirror ingests to Bolna’s hosted Knowledge Base

Set **`KB_BOLNA_SYNC_ENABLED=true`** (and keep **`BOLNA_API_KEY`** set). When enabled:

- **PDF** and **URL** documents are sent to Bolna **`POST /knowledgebase`** after the local `KnowledgeDocument` row is created (asynchronous; same flow as local chunking).
- **`metadata.bolna`** on the document stores `rag_id`, `status`, and any sync error.
- **Deleting** a document in Dharwin calls **`DELETE /knowledgebase/:rag_id`** when a `rag_id` exists (runs even if sync is later disabled, to avoid orphaned Bolna KBs).
- **Pasted text** is not supported by Bolna’s create API (file or URL only); those docs are local-only.

Bolna’s documented **PATCH `/v2/agent/{id}`** schema does not include attaching knowledge bases. You still need to open **Bolna → your agent → LLM tab → Knowledge base** and select the new RAG (or use a future Bolna API if they add one). The Settings UI shows the **Bolna RAG** column for copy/paste.

Optional tuning: **`KB_BOLNA_KB_MULTILINGUAL`**, **`KB_BOLNA_KB_CHUNK_SIZE`**, **`KB_BOLNA_KB_OVERLAPPING`**, **`KB_BOLNA_KB_SIMILARITY_TOP_K`** (passed through to Bolna’s multipart form). Bolna’s PDF limit is **20 MB** per upload; larger files skip Bolna sync with an error recorded in `metadata.bolna`.

## Operations notes

- **Scanned PDFs**: extraction uses `pdf-parse` (no OCR). Empty text yields `failed` with metadata code `SCANNED_PDF_NEEDS_OCR`.
- **Deduping**: uploads use `contentSha256` per KB and type; duplicates return the existing document.
- **Chunk growth**: very large PDFs increase embedding cost; tune `KB_CHUNK_TARGET_TOKENS` and caps.
