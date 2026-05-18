import type { StudyGuide } from "../guide-types";

export const filesApiCitationsGuide: StudyGuide = {
  topicTitle: "Files API & Citations",
  topicSlug: "files-api-citations",
  sections: [
    // ---------------------------------------------------------------
    // Section 1 — Mental model: upload once, cite everywhere
    // ---------------------------------------------------------------
    {
      title: "Mental model: upload once, cite everywhere",
      blocks: [
        {
          kind: "prose",
          markdown: `
The Files API and the citations feature are designed to be used **together**. They're
the cleanest path to a doc-grounded answer with provenance — the demo every FDE prospect
asks for inside the first 30 minutes:

> *"Upload our policy/contract/manual. Ask a question. Show me where in the doc the
> answer came from."*

The flow has four steps:

1. **Upload** a PDF (or text/JSON) to \`POST /v1/files\` → you get back a \`file_id\`.
2. **Reference** that \`file_id\` from a \`document\` content block in a normal Messages
   request. No base64, no re-upload — the file lives server-side.
3. **Enable** citations on the document block (\`citations: { enabled: true }\`).
4. **Parse** the response: Claude returns text blocks **with embedded \`citations\` arrays**
   that point back at the exact page (or char range) the answer is grounded in.

The win: the same uploaded PDF can power dozens of questions without paying upload
bandwidth each time, and every answer is provenance-traceable for the UI.
`,
        },
        {
          kind: "key_insight",
          label: "The four-step flow",
          insight: `**Upload → reference → enable → parse.** The Files API replaces base64 inlining (cheaper requests, deduplication across calls). Citations are a per-document opt-in flag on the request; they're returned as **structured blocks inside the response content**, not as a separate field. If you forget the \`enabled: true\` flag, you'll get the right answer with **no provenance** — a classic demo foot-gun.`,
        },
        {
          kind: "flashcard",
          front:
            "When should you use Files API + file_id vs. inline base64 PDF source?",
          back: `**Files API** when: you'll query the same doc multiple times (Q&A sessions, agents), the doc is large (saves upload bandwidth per request), or you want a stable handle to manage (delete/list). **Inline base64** when: one-shot calls, the doc is small and ephemeral, or you don't want to manage server-side file lifecycle. For citations specifically, **both** sources work — the citations feature is a flag on the document block, not on the source type.`,
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 2 — Files API: upload, list, delete
    // ---------------------------------------------------------------
    {
      title: "Files API: upload, list, delete",
      blocks: [
        {
          kind: "method_ref",
          title: "Files API endpoints",
          importLine:
            'anthropic-beta: files-api-2025-04-14   (or current beta header)',
          methods: [
            {
              signature: "POST /v1/files",
              description:
                "Multipart upload. Form field name is `file`. Returns `{ id, type: 'file', filename, mime_type, size_bytes, created_at, downloadable }`. The `id` (e.g. `file_abc123`) is what you pass into `document.source.file_id`.",
            },
            {
              signature: "GET /v1/files/{file_id}",
              description:
                "Retrieve metadata for one file. Useful to confirm size/mime before referencing in a request.",
            },
            {
              signature: "GET /v1/files",
              description:
                "List your workspace's files (paginated via `before_id`/`after_id`/`limit`). Use this to GC old uploads or build a file-picker UI.",
            },
            {
              signature: "DELETE /v1/files/{file_id}",
              description:
                "Permanent. Files don't auto-expire — you own the cleanup. In production, set a TTL job to delete uploads older than your retention policy.",
            },
            {
              signature: "GET /v1/files/{file_id}/content",
              description:
                "Download the raw bytes back. Useful for debugging or re-rendering the source doc client-side alongside citations.",
            },
            {
              signature: "Supported types & limits",
              description:
                "PDF, text, JSON, images, CSVs. Max ~32 MB per file (matches PDF input limit). One file_id = one document — to query a multi-doc corpus, upload each separately and reference multiple `document` blocks.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Upload via SDK helper vs. raw multipart POST",
          left: {
            title: "Python SDK (recommended)",
            code: `import anthropic

client = anthropic.Anthropic(
    default_headers={"anthropic-beta": "files-api-2025-04-14"},
)

with open("contract.pdf", "rb") as f:
    uploaded = client.beta.files.upload(file=("contract.pdf", f, "application/pdf"))

print(uploaded.id)        # "file_01ABCxyz..."
print(uploaded.size_bytes)`,
            annotation:
              "Handles multipart encoding, auth, retries, and the beta header. The `(filename, fileobj, mime)` tuple is the SDK convention.",
          },
          right: {
            title: "Raw HTTP (curl)",
            code: `curl https://api.anthropic.com/v1/files \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "anthropic-beta: files-api-2025-04-14" \\
  -F "file=@contract.pdf;type=application/pdf"

# {"id":"file_01ABCxyz...","type":"file","filename":"contract.pdf",
#  "mime_type":"application/pdf","size_bytes":482918,"created_at":"...",
#  "downloadable":true}`,
            annotation:
              "Useful for debugging, scripting, or non-Python languages. Note the two version headers — `anthropic-version` is required, `anthropic-beta` opts into the Files API.",
          },
          takeaway:
            "Use the SDK in app code; reach for curl when reproducing a customer's bug or testing a fresh API key. The wire format is the same.",
        },
        {
          kind: "scenario_predict",
          label: "Successful upload response shape",
          language: "json",
          scenario: `POST /v1/files (multipart, file=contract.pdf, ~480 KB)
→ HTTP 200

{
  "id": "file_01ABCxyz...",
  "type": "file",
  "filename": "contract.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 482918,
  "created_at": "2025-04-15T18:22:10Z",
  "downloadable": true
}`,
          question:
            "Which two fields do you actually persist in your app DB, and why?",
          answer: `Persist **\`id\`** (the file handle you'll pass into every future Messages request — without it the upload is unreachable) and **\`created_at\`** (so a TTL/GC job can delete files older than your retention policy). \`filename\` and \`mime_type\` are nice-to-haves for UI; \`size_bytes\` is useful for billing/usage display. \`type\` and \`downloadable\` are mostly informational.`,
          explanation:
            "The Files API has no native TTL — you own deletion. Storing `id` and `created_at` lets a daily cron sweep stale uploads, which is critical at scale (it's easy to leak thousands of files in a long-running Q&A app).",
        },
        {
          kind: "warm_up",
          title: "Enable the Files API beta",
          prompt: `Fill in the missing header line that opts a Messages request into the Files API:

\`\`\`http
POST /v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01
____________________________________
Content-Type: application/json
\`\`\``,
          answer: '`anthropic-beta: files-api-2025-04-14`',
          explanation:
            "Files API ships behind a beta header. Forgetting it returns a 400 with `'unknown content block type: file' or similar` — a five-minute foot-gun in demos. Always set the beta header on both the upload call and any Messages call that references a `file_id`.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 3 — Reference files + enable citations
    // ---------------------------------------------------------------
    {
      title: "Reference files in messages + enable citations",
      blocks: [
        {
          kind: "prose",
          markdown: `
Once a file is uploaded, you reference it from a normal Messages request the same way
you'd reference an inline PDF — except the \`source\` block uses \`type: "file"\` and a
\`file_id\` instead of inline bytes.

Citations are turned on **per document block**, not globally on the request. That's
intentional: in a multi-doc Q&A you might cite some PDFs (contracts, manuals) and
deliberately *not* cite others (a scratchpad, a system-of-record export). Granularity
lives at the content-block level.

What you get back when citations are enabled: the response \`content\` array still
contains \`text\` blocks, but each text block now has a \`citations\` array attached.
Each citation is a structured pointer (\`document_index\`, \`document_title\`,
\`start_page_number\`, \`end_page_number\`, \`cited_text\`) — exactly what you need to
render a footnote, a page-anchored hover card, or an "Open at page N" link in the UI.
`,
        },
        {
          kind: "method_ref",
          title: "Document content block with file_id + citations",
          importLine:
            'content: [{ type: "document", source: {...}, citations: {...}, title?, context? }]',
          methods: [
            {
              signature: 'source: { type: "file", file_id: "file_..." }',
              description:
                "Reference an uploaded file by its `file_id`. The model behaves identically to inline base64, but the request body stays tiny.",
            },
            {
              signature: 'citations: { enabled: true }',
              description:
                "Per-block opt-in. When true, every text block in the response that draws from this document gets a `citations` array.",
            },
            {
              signature: "title?: string",
              description:
                'Optional human-readable title (e.g. "MSA — Acme Corp v2"). The model uses it when phrasing its answer and it appears in `citations[*].document_title` for free.',
            },
            {
              signature: "context?: string",
              description:
                'Optional short framing string ("This is the master services agreement signed in 2024."). Helps the model rank multi-doc context.',
            },
            {
              signature: "Order matters in content[]",
              description:
                "Put `document` blocks **before** the question text. Models ground better when context precedes instruction; this is the recommended pattern in Anthropic's docs.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Without citations vs. with citations enabled",
          left: {
            title: "Plain PDF Q&A — no citations",
            code: `client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {
                    "type": "file",
                    "file_id": "file_01ABCxyz",
                },
            },
            {
                "type": "text",
                "text": "What is the termination clause?",
            },
        ],
    }],
)`,
            annotation:
              "Returns the right answer, but `content` is a flat list of `text` blocks with no provenance. Your UI has no way to anchor 'see page 14' affordances.",
          },
          right: {
            title: "Same request, citations enabled",
            code: `client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {
                    "type": "file",
                    "file_id": "file_01ABCxyz",
                },
                "title": "MSA — Acme Corp v2",
                "citations": {"enabled": True},
            },
            {
                "type": "text",
                "text": "What is the termination clause?",
            },
        ],
    }],
)`,
            annotation:
              "Same call, one extra flag. Response now contains text blocks with `citations` arrays pointing to exact page ranges. `title` shows up in each citation for free.",
          },
          takeaway:
            "The citations flag is the cheapest UI upgrade you can ship — flip one boolean, get page-anchored provenance throughout the response.",
        },
        {
          kind: "scenario_predict",
          label: "Citations flag with the wrong document type",
          language: "json",
          scenario: `{
  "type": "document",
  "source": {
    "type": "text",
    "media_type": "text/plain",
    "data": "Section 1. Term. This agreement begins on..."
  },
  "citations": { "enabled": true }
}`,
          question:
            "Will citations work here? If so, what fields do you get back instead of page numbers?",
          answer: `Yes — citations work for **plain-text document blocks too**, not just PDFs. But you don't get \`start_page_number\`/\`end_page_number\` (the doc has no pages); instead each citation has \`start_char_index\` and \`end_char_index\` pointing to the substring inside the \`data\` field. Your UI has to handle both shapes: page-based for PDFs, char-based for text.`,
          explanation:
            "This is the most common 'why doesn't my citation renderer work?' bug. The schema varies by document type. Branch on the presence of `start_page_number` vs `start_char_index` when rendering, or you'll silently drop half your citations.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 4 — Parse citation blocks in responses
    // ---------------------------------------------------------------
    {
      title: "Parse citation blocks in responses",
      blocks: [
        {
          kind: "prose",
          markdown: `
With citations enabled, the response \`content\` array is no longer a flat list of
plain text blocks. Each \`text\` block now has a \`citations\` array attached.

The structure looks like this (PDF source):

\`\`\`json
{
  "content": [
    {
      "type": "text",
      "text": "Either party may terminate with 30 days' notice.",
      "citations": [
        {
          "type": "page_location",
          "cited_text": "Either party may terminate this Agreement upon thirty (30) days' written notice...",
          "document_index": 0,
          "document_title": "MSA — Acme Corp v2",
          "start_page_number": 14,
          "end_page_number": 14
        }
      ]
    },
    { "type": "text", "text": " There is also a for-cause clause. ", "citations": [] }
  ]
}
\`\`\`

Note three things:

1. **Some text blocks have citations, some don't** — the model only cites blocks that
   make a factual claim about a document. Filler/transitional prose gets an empty array.
2. **\`document_index\` matches the position of the document in the request's content array**,
   so for multi-doc requests you map indices back to your own file IDs.
3. **\`cited_text\` is the verbatim source quote** — usually slightly longer than the
   model's paraphrase. This is what you show on hover or in the footnote.
`,
        },
        {
          kind: "scenario_predict",
          label: "Citation fields by source type",
          language: "json",
          scenario: `// PDF source
{
  "type": "page_location",
  "cited_text": "...",
  "document_index": 0,
  "document_title": "MSA",
  "start_page_number": 14,
  "end_page_number": 14
}

// Plain-text source
{
  "type": "char_location",
  "cited_text": "...",
  "document_index": 1,
  "document_title": "Internal FAQ",
  "start_char_index": 1820,
  "end_char_index": 1955
}`,
          question:
            "What's the single field a renderer should branch on to handle both shapes?",
          answer: `Branch on the \`type\` field. \`"page_location"\` → render with \`start_page_number\`/\`end_page_number\` and a 'Open at page N' link. \`"char_location"\` → render with \`start_char_index\`/\`end_char_index\` and substring-highlight on the source text. Don't branch on the presence of \`start_page_number\` — \`type\` is the authoritative tag.`,
          explanation:
            "Anthropic adds new citation types over time (e.g., `content_block_location` for structured docs). Branching on `type` keeps your renderer forward-compatible; branching on field presence breaks the next time a new shape ships.",
        },
        {
          kind: "code_comparison",
          label: "Reconstructing the answer text — naive vs. proper",
          left: {
            title: "Naive — drop citations, concat text",
            code: `def render(resp):
    return "".join(
        block.text
        for block in resp.content
        if block.type == "text"
    )

# Loses ALL provenance — citations array is silently
# discarded. The "before citations" UX.`,
            annotation:
              "Works, but throws away exactly the data you turned citations on to get. A surprisingly common mistake in early integrations.",
          },
          right: {
            title: "Proper — emit footnotes alongside text",
            code: `def render_with_footnotes(resp):
    body, notes = [], []
    for block in resp.content:
        if block.type != "text":
            continue
        body.append(block.text)
        for cite in getattr(block, "citations", []) or []:
            n = len(notes) + 1
            body.append(f"[^{n}]")
            notes.append(_format_note(n, cite))
    return "".join(body) + "\\n\\n" + "\\n".join(notes)

def _format_note(n, cite):
    title = cite.document_title or f"Doc {cite.document_index}"
    if cite.type == "page_location":
        loc = f"p. {cite.start_page_number}"
    else:  # char_location
        loc = f"chars {cite.start_char_index}–{cite.end_char_index}"
    return f"[^{n}]: {title}, {loc} — \\"{cite.cited_text}\\""`,
            annotation:
              "Iterates content in order, attaches footnote markers inline, builds the notes list with page or char ranges depending on citation type. Drop straight into a markdown renderer.",
          },
          takeaway:
            "Citations are the easy half; the renderer is where the UX win lives. Always iterate `content` in order and attach footnote markers inline — out-of-order citations break the reader's flow.",
        },
        {
          kind: "mini_challenge",
          title: "Build `format_with_footnotes(response)`",
          prompt: `Write a Python function that takes the Anthropic Messages response \`response\` (an object with a \`content\` list) and returns a single markdown string with:

1. **Inline footnote markers** (\`[^1]\`, \`[^2]\`, ...) immediately after each text block that has citations.
2. **A footnotes section** at the bottom listing each citation with its document title and page-range (or char-range) and the \`cited_text\` as the quote.
3. **No empty notes** — text blocks without citations contribute prose only.

Handle both \`page_location\` and \`char_location\` citation types.`,
          hints: [
            "Iterate `response.content` in order. Footnote numbering should be global, not per-block.",
            'Branch on `cite.type`: `"page_location"` → page range, `"char_location"` → char range.',
            "Use `getattr(block, 'citations', None) or []` to handle SDK objects where the attribute is missing or `None`.",
            "Build the body and notes lists separately, then join at the end — easier to keep numbering aligned.",
          ],
          solution: `def format_with_footnotes(response) -> str:
    body_parts: list[str] = []
    notes: list[str] = []

    for block in response.content:
        if getattr(block, "type", None) != "text":
            continue
        body_parts.append(block.text)
        for cite in getattr(block, "citations", None) or []:
            idx = len(notes) + 1
            body_parts.append(f"[^{idx}]")
            notes.append(_format_citation(idx, cite))

    body = "".join(body_parts)
    if not notes:
        return body
    return body + "\\n\\n" + "\\n".join(notes)


def _format_citation(idx: int, cite) -> str:
    title = getattr(cite, "document_title", None) or f"Document {cite.document_index}"
    ctype = getattr(cite, "type", "page_location")
    if ctype == "page_location":
        start = cite.start_page_number
        end = cite.end_page_number
        loc = f"p. {start}" if start == end else f"pp. {start}–{end}"
    elif ctype == "char_location":
        loc = f"chars {cite.start_char_index}–{cite.end_char_index}"
    else:
        loc = ctype  # forward-compat: unknown location type
    quote = (cite.cited_text or "").strip().replace("\\n", " ")
    if len(quote) > 200:
        quote = quote[:197] + "..."
    return f'[^{idx}]: *{title}*, {loc} — "{quote}"'`,
          takeaway:
            "The shape of a doc-grounded answer is: inline prose + footnote markers + a notes block. Branching on `cite.type` (not on field presence) keeps the renderer forward-compatible. Truncating `cited_text` keeps long quotes from blowing out the footnote section.",
        },
      ],
    },
  ],
};
