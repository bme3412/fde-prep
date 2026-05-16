import type { StudyGuide } from "../guide-types";

export const visionPdfInputsGuide: StudyGuide = {
  topicTitle: "Vision & PDF inputs",
  topicSlug: "vision-pdf-inputs",
  sections: [
    // ============================================================
    // Section 1 — Why multimodal matters
    // ============================================================
    {
      title: "Why multimodal matters",
      blocks: [
        {
          kind: "prose",
          markdown: `## Three customer requests, one API

Picture three Slack messages from three different customers, all sent on the same Tuesday afternoon:

1. **"My app is crashing — here's a screenshot of the stack trace."** Attached: a 1200×800 PNG.
2. **"Can you extract line items from these invoices?"** Attached: a folder of 40 scanned JPEGs, some rotated.
3. **"Find every indemnification clause in this contract."** Attached: a 200-page PDF.

The pre-multimodal answer to all three was roughly the same shape:

\`\`\`
image/PDF → Tesseract (OCR) → custom layout parser → prompt-template glue → LLM call
\`\`\`

Each stage had its own failure modes (Tesseract on rotated scans, layout parsers on multi-column PDFs, prompt templates that exploded when a table was bigger than expected). FDEs spent more time fighting OCR than answering customer questions.

The post-multimodal answer is one line:

\`\`\`python
client.messages.create(
    model="claude-opus-4-7",
    max_tokens=2048,
    messages=[{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
        {"type": "text", "text": "What's the bug?"},
    ]}],
)
\`\`\`

Same call shape for screenshots, photos, scans, and PDFs. Different \`type\` on the content block, different bytes inside \`source\`, but the *control flow* is identical. That collapse is what this guide is about.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `**Multimodal is a *pipeline collapse*, not a feature add.** The product win isn't "Claude can describe an image" — it's "the OCR, layout, and chart-parsing stages of your pipeline disappear." When you pitch vision/PDF to a customer, lead with the stages you delete, not the new capability you gain.`,
        },
        {
          kind: "flashcard",
          context: `An FDE on the discovery call needs three concrete "pipeline collapse" examples ready to fire off in 30 seconds.`,
          front: `Name three real FDE use cases that become a single \`messages.create\` call once vision + PDF land.`,
          back: `(1) **Expense parsing** — a photo of a receipt → JSON line items in one call, no Textract. (2) **Bug triage** — a screenshot of a stack trace + the user's question → a fix suggestion, no separate OCR. (3) **Contract Q&A** — a 200-page PDF + "find every termination clause" → answers with the right pages cited, no chunking-then-RAG infrastructure.`,
        },
        {
          kind: "prose",
          markdown: `Two warnings before we go further:

- **It's input-only.** The model can *see* images and PDFs in your messages, but its responses are always text (or tool calls, or thinking). You cannot ask Claude to "return an image of a cat." That's a different product (Imagen, DALL·E, etc.).
- **It's not magic.** There are documented things Claude vision is bad at — identifying specific people, counting more than ~20 objects, precise spatial reasoning. Section 7 has the full list. If you skip it you will eventually ship a feature your customer thinks works and then doesn't.

Everything else in this guide is mechanics: what the JSON looks like, how to pick a source variant, what it costs in tokens, and the half-dozen pitfalls that eat 80% of FDE time on multimodal projects.`,
        },
      ],
    },

    // ============================================================
    // Section 2 — Anatomy of an image content block
    // ============================================================
    {
      title: "Anatomy of an image content block",
      blocks: [
        {
          kind: "prose",
          markdown: `## Content blocks, again

Recall from the Messages API guide that \`messages[].content\` can be either:

- A **string** (the convenient shorthand for "this message is just text"), or
- An **array of typed blocks**, each with a \`"type"\` discriminator: \`{"type": "text", "text": "..."}\`, \`{"type": "image", "source": {...}}\`, \`{"type": "tool_use", ...}\`, etc.

Adding an image is just adding another block to that array. The Messages API doesn't grow a new top-level field for images, and there's no separate \`/v1/vision\` endpoint. **Multimodal lives inside the same \`messages.create\` you already use.** The only new thing to learn is the shape of the image block itself.`,
        },
        {
          kind: "method_ref",
          title: "Image content block schema",
          importLine: `# Inside messages[].content[]`,
          methods: [
            {
              signature: `{"type": "image", "source": {...}}`,
              description: `The outer envelope. Lives in the content array, peer of text blocks.`,
              returns: `Block (input-only)`,
            },
            {
              signature: `source: {"type": "base64", "media_type": "...", "data": "..."}`,
              description: `Inline-encoded bytes. \`data\` is the base64 STRING (not bytes). \`media_type\` is one of "image/jpeg" | "image/png" | "image/gif" | "image/webp".`,
            },
            {
              signature: `source: {"type": "url", "url": "https://..."}`,
              description: `Claude fetches the image from a public URL. No base64, no media_type — the server sniffs it.`,
            },
            {
              signature: `source: {"type": "file", "file_id": "file_..."}`,
              description: `Reference to an asset uploaded via the Files API. Requires beta header \`anthropic-beta: files-api-2025-04-14\`.`,
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: `Schema validation — where does the data live?`,
          scenario: `{
  "role": "user",
  "content": [
    {
      "type": "image",
      "media_type": "image/jpeg",
      "data": "/9j/4AAQSkZJRg..."
    },
    { "type": "text", "text": "What is this?" }
  ]
}`,
          language: "json",
          question: `Why does the API reject this payload with a 400?`,
          answer: `\`media_type\` and \`data\` belong inside a nested \`source\` object, not at the top of the image block.`,
          explanation: `Every multimodal block (image OR document) wraps its bytes in a \`source\` envelope whose \`type\` discriminator picks between \`base64\` / \`url\` / \`file\`. Flattening \`media_type\` and \`data\` next to \`type: "image"\` breaks the discriminator. The fix is \`{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "/9j/..."}}\`.`,
        },
        {
          kind: "code_predict",
          label: `Where does the image show up in the response?`,
          code: `import anthropic, base64
client = anthropic.Anthropic()
with open("chart.png", "rb") as f:
    b64 = base64.standard_b64encode(f.read()).decode("ascii")
resp = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": [
        {"type": "image", "source": {
            "type": "base64", "media_type": "image/png", "data": b64,
        }},
        {"type": "text", "text": "Summarize this chart in one sentence."},
    ]}],
)
print(type(resp.content[0]).__name__)`,
          output: `TextBlock`,
          explanation: `Claude only *consumes* images — it never produces them. The response \`content\` array contains \`TextBlock\` (and possibly \`ToolUseBlock\` / \`ThinkingBlock\`) but never an image block. If your customer asks "can Claude return an annotated version of the image?" the answer is no — generate annotations as text + coordinates, then render client-side.`,
        },
        {
          kind: "key_insight",
          label: "Rule",
          insight: `**Images are *input-only*.** \`resp.content\` will never contain an image. The model's output is always text-shaped (TextBlock, ToolUseBlock, ThinkingBlock). If you need an image-out workflow, you need a different model.`,
        },
      ],
    },

    // ============================================================
    // Section 3 — The three source variants
    // ============================================================
    {
      title: "The three source variants",
      blocks: [
        {
          kind: "prose",
          markdown: `## base64 vs url vs file

Every multimodal block (image OR document) has the same three options for *how* the bytes get to the API:

| Source       | Best for                                  | Tradeoff                                                          |
|--------------|--------------------------------------------|-------------------------------------------------------------------|
| \`base64\`   | One-off calls, files on local disk        | ~33% bandwidth overhead from base64 inflation                     |
| \`url\`      | Assets already hosted publicly            | Claude must fetch it; URL must be public (no auth headers)        |
| \`file\`     | Same asset referenced across many calls   | Requires upload via Files API + a beta header                     |

The default — and what 90% of customer demos use — is **\`base64\`**. You read bytes from disk, base64-encode them to a string, drop the string into \`source.data\`. Self-contained, no auth, works in a notebook with no infrastructure. Pay the bandwidth cost; move on.

\`url\` and \`file\` are optimizations. Reach for \`url\` when the asset lives at a stable public URL anyway (S3 with public read, a CDN, a public docs site). Reach for \`file\` when you'll reference the same asset across more than one API call — this is the Files API and you should know it exists, but a full treatment is in the Files API & Citations guide.`,
        },
        {
          kind: "code_comparison",
          label: `base64 vs url — picking your poison`,
          left: {
            title: "base64 (self-contained)",
            code: `import base64
with open("invoice.png", "rb") as f:
    b64 = base64.standard_b64encode(
        f.read()
    ).decode("ascii")

block = {"type": "image", "source": {
    "type": "base64",
    "media_type": "image/png",
    "data": b64,
}}`,
            annotation: `Bytes travel with the request. Works offline, works in a notebook, no infra to set up. The \`b64\` string is ~33% larger than the raw file.`,
          },
          right: {
            title: "url (lightweight)",
            code: `block = {"type": "image", "source": {
    "type": "url",
    "url": "https://cdn.example.com/invoice.png",
}}`,
            annotation: `No base64, no media_type — Claude fetches it and sniffs the type. URL must be publicly reachable; no custom auth headers. Faster uploads, but adds a network dependency.`,
          },
          takeaway: `Reach for \`url\` only when the asset is already public. If you have to make a bucket public *just* to use it, you've shifted the bandwidth cost to a security problem. Stick with base64.`,
        },
        {
          kind: "scenario_predict",
          label: `Forgetting the Files API beta header`,
          scenario: `POST /v1/messages
Content-Type: application/json
x-api-key: sk-ant-...

{
  "model": "claude-opus-4-7",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": [
    {"type": "image", "source": {
      "type": "file", "file_id": "file_011CRk6Y..."
    }},
    {"type": "text", "text": "What is this?"}
  ]}]
}`,
          language: "json",
          question: `What is the most likely failure response, and what header is missing?`,
          answer: `400 invalid_request_error — the request is missing \`anthropic-beta: files-api-2025-04-14\`.`,
          explanation: `\`file_id\` sources go through the Files API surface, which is currently gated behind a beta header. The header opts your request into the beta feature set. Without it, the API refuses to dereference the \`file_id\` and returns an invalid-request error. Once the Files API graduates from beta the header will become optional, but until then it's mandatory for any \`type: "file"\` source.`,
        },
        {
          kind: "multiple_choice",
          title: `The 5 MB limit — measured how?`,
          prompt: `Your image is 4.8 MB on disk as a JPEG. After base64 encoding the string is 6.4 MB. Which value does Anthropic's 5 MB per-image limit apply to?`,
          choices: [
            {
              text: `The base64-encoded string (6.4 MB) — so this request would be rejected.`,
              correct: false,
              rationale: `The limit is on the *original asset*, not its base64 expansion. If you measured by base64 you'd lose 33% of your usable size for no good reason.`,
            },
            {
              text: `The raw image file (4.8 MB) — under the 5 MB cap, the request is accepted.`,
              correct: true,
              rationale: `Correct. The 5 MB API limit applies to the underlying image bytes (what's on disk before encoding). You will not be rejected just because base64 inflated the wire payload.`,
            },
            {
              text: `The decoded pixel buffer (W × H × channels) — depends on resolution.`,
              correct: false,
              rationale: `Decoded pixel buffers can be enormous (a 4000×3000 RGB image is 36 MB decoded). The API doesn't check that — it checks the encoded file size.`,
            },
            {
              text: `Both the file and the base64 — whichever is larger.`,
              correct: false,
              rationale: `Only the original file size matters for the 5 MB cap. The wire payload size is a separate concern (your HTTP client may complain about giant requests, but that's not Anthropic's 5 MB image limit).`,
            },
          ],
          explanation: `Always size your assets *before* encoding. A quick \`os.path.getsize("file.jpg") <= 5 * 1024 * 1024\` check is enough. The cap is on the image, not the wire format.`,
        },
        {
          kind: "flashcard",
          context: `You're architecting a dashboard that runs 50 different prompts against the same logo image to test brand-voice consistency.`,
          front: `Which \`source\` variant lets you upload the logo *once* and reference it across all 50 calls without re-uploading bytes?`,
          back: `\`{"type": "file", "file_id": "file_..."}\` — the Files API. Upload once, get a \`file_id\`, reference it everywhere. Saves bandwidth and (importantly) lets the same asset participate in prompt-caching across calls.`,
        },
      ],
    },

    // ============================================================
    // Section 4 — Supported formats and hard limits
    // ============================================================
    {
      title: "Supported formats and hard limits",
      blocks: [
        {
          kind: "prose",
          markdown: `## The box you have to fit in

Before you architect anything multimodal, memorize the limits. They're small and they bite. Every "weird intermittent error" with vision in production traces back to one of these caps being violated for one request out of a thousand.`,
        },
        {
          kind: "method_ref",
          title: "Vision limits cheat-sheet",
          importLine: `# All limits documented at docs.claude.com/build-with-claude/vision`,
          methods: [
            {
              signature: `media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"`,
              description: `The only four formats accepted. Note "image/jpeg" — NOT "image/jpg".`,
            },
            {
              signature: `max bytes per image (API): 5 MB`,
              description: `Measured on the original file, not the base64 string.`,
            },
            {
              signature: `max bytes per image (claude.ai UI): 10 MB`,
              description: `The web UI is more permissive. Don't confuse "it worked in the chat UI" with "it'll work in your API call."`,
            },
            {
              signature: `max images per request: 100 (200k-context models) | 600 (others) | 20 (claude.ai)`,
              description: `Two regimes. The "100 vs 600" split is by model family, not by API tier.`,
            },
            {
              signature: `max dimensions: 8000 x 8000 px (or 2000 x 2000 px if >20 images in one request)`,
              description: `The "many small images" path forces lower per-image resolution. Plan accordingly.`,
            },
          ],
        },
        {
          kind: "warm_up",
          title: "Format gotcha",
          prompt: `You try to send a screenshot saved as \`screen.bmp\` and the API returns a 400. Which limit did you hit?`,
          answer: `BMP is not a supported \`media_type\`.`,
          explanation: `Only \`image/jpeg\`, \`image/png\`, \`image/gif\`, and \`image/webp\` are accepted. BMP, TIFF, HEIC, and AVIF are all unsupported. The fix is to convert client-side (e.g. Pillow: \`Image.open("screen.bmp").save("screen.png")\`) before encoding.`,
        },
        {
          kind: "scenario_predict",
          label: `Which limit bites first?`,
          scenario: `{
  "model": "claude-opus-4-7",
  "messages": [{"role": "user", "content": [
    /* 25 images, each 4000 x 4000 px */
    ...,
    {"type": "text", "text": "Compare these product photos."}
  ]}]
}`,
          language: "json",
          question: `Which documented limit does this request violate first?`,
          answer: `The "if more than 20 images in one request, max dimensions drop to 2000 x 2000" rule.`,
          explanation: `25 images is under the 100-image cap (so the count itself is fine), and 4000 x 4000 is under the absolute 8000 x 8000 cap, but the *combination* — more than 20 images AND each one larger than 2000 x 2000 — is what trips. The fix is either (a) resize each image to 2000 x 2000 client-side, or (b) split into two calls of ≤20 images each. Always check the count-vs-resolution interaction before architecting "wall of thumbnails" UIs.`,
        },
        {
          kind: "key_insight",
          label: "Two regimes",
          insight: `**There are two image-count regimes: 100 (200K-context models) vs 600 (other models).** This is counterintuitive — the bigger context window has the *smaller* image cap. The reason is that each image at native resolution can be ~1.5–5K tokens, and 600 images would blow past 200K. Always check your model's regime before architecting a "thousand thumbnails" workflow.`,
        },
      ],
    },

    // ============================================================
    // Section 5 — Token cost: the (W * H) / 750 formula
    // ============================================================
    {
      title: "Token cost: the (W × H) / 750 formula",
      blocks: [
        {
          kind: "prose",
          markdown: `## Why pixel area, not file size, is your bill

Image tokens are billed by *pixel area*, not file size. The documented estimate is:

\`\`\`
tokens ≈ (width × height) / 750
\`\`\`

A 1024×768 screenshot? About **1,049 tokens**. A 1920×1080 product photo? About **2,765 tokens**. Send ten 1920×1080 images and you've spent ~28K tokens *before any text*.

There's a second wrinkle: if your image is larger than the model's native-resolution cap, **Claude downsamples it before counting tokens**, so very large images don't keep getting more expensive. The caps:

- **Claude Opus 4.7**: up to ~4,784 tokens / 2,576px on the long edge.
- **Other models (Sonnet, Haiku families)**: up to ~1,568 tokens / 1,568px on the long edge.

That means a 5000×5000 image sent to Sonnet costs the *same* as a 1568×1568 image sent to Sonnet — the server resizes both to fit. Opus 4.7 lets you push more detail through without resizing.`,
        },
        {
          kind: "code_predict",
          label: `The basic formula`,
          runnable: true,
          code: `def img_tokens(w, h):
    return (w * h) // 750

print(img_tokens(1024, 768))`,
          output: `1048`,
          explanation: `(1024 × 768) = 786,432; ÷ 750 = 1048 (integer division). This is what a typical laptop screenshot costs you in tokens — about 1K, before any of the text you wrap around it. Useful as a sanity check before you architect a "100 screenshots per request" workflow.`,
        },
        {
          kind: "code_predict",
          label: `Resize cap on non-Opus models`,
          runnable: true,
          code: `def img_tokens_capped(w, h, cap=1568):
    raw = (w * h) // 750
    return min(raw, cap)

# A 3000 x 2000 image sent to Sonnet
print(img_tokens_capped(3000, 2000))`,
          output: `1568`,
          explanation: `Raw (3000 × 2000) / 750 = 8000 tokens. But Sonnet caps image tokens at ~1568 by downsampling to a max 1568px long edge. You don't get to "spend more tokens for more detail" past the cap — you just pay 1568 and get the downsampled version. Opus 4.7 has a higher cap (~4784) so it can preserve more detail.`,
        },
        {
          kind: "scenario_predict",
          label: `Estimating a batch cost`,
          scenario: `images = [(1920, 1080)] * 10  # ten Full HD screenshots
# Sent to Sonnet (cap = 1568 tokens per image)
total = sum(min((w * h) // 750, 1568) for w, h in images)
print(total)`,
          language: "python",
          question: `What does this print, and what's the practical takeaway?`,
          answer: `15,680. Each 1920×1080 image is uncapped at ~2,764 tokens but gets capped at 1,568 on Sonnet — ten of them sum to 15,680 image tokens.`,
          explanation: `On Sonnet, that batch costs you ~15.7K input tokens before any prompt text. On Opus 4.7 (cap ~4,784) the same batch would be 10 × 2,764 = ~27,640 tokens. The model choice meaningfully changes per-image cost on large screenshots, and the math is easy enough to do in your head during a customer call.`,
        },
        {
          kind: "mini_challenge",
          title: "Build prepare_image_payload",
          prompt: `Write a Python function \`prepare_image_payload(path: str) -> dict\` that reads an image file and returns a *content block dict* ready to drop into \`messages[].content\`. Requirements:

- Sniff the media type from the file extension (\`.jpg\`/\`.jpeg\` → \`image/jpeg\`, \`.png\` → \`image/png\`, \`.gif\` → \`image/gif\`, \`.webp\` → \`image/webp\`).
- base64-encode the file bytes.
- Return the full \`{"type": "image", "source": {...}}\` dict.
- Raise \`ValueError\` for unsupported extensions.

This is the function every team writes once and copy-pastes thereafter.`,
          hints: [
            `Use \`os.path.splitext(path)[1].lower()\` to get the extension.`,
            `Use \`base64.standard_b64encode(bytes_obj).decode("ascii")\` — the API needs a *string*, not bytes.`,
            `Build a small dict literal mapping extension → media_type rather than calling \`mimetypes\`, which is inconsistent across platforms (e.g. it may give \`image/jpg\` on Windows).`,
          ],
          solution: `import base64
import os

_EXT_TO_MEDIA_TYPE = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
}

def prepare_image_payload(path: str) -> dict:
    ext = os.path.splitext(path)[1].lower()
    media_type = _EXT_TO_MEDIA_TYPE.get(ext)
    if media_type is None:
        raise ValueError(
            f"Unsupported image extension {ext!r}. "
            f"Supported: {sorted(_EXT_TO_MEDIA_TYPE)}"
        )
    with open(path, "rb") as f:
        b64 = base64.standard_b64encode(f.read()).decode("ascii")
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": b64,
        },
    }`,
          takeaway: `Three traps this function avoids: (1) it normalizes \`.jpg\` → \`image/jpeg\` (NOT \`image/jpg\`); (2) it \`.decode("ascii")\` so the value is a JSON-serializable string; (3) it fails loudly on unsupported formats instead of letting the API return a confusing 400. Keep it pure (no logging, no side effects) so it composes into batch pipelines.`,
        },
        {
          kind: "key_insight",
          label: "Rule of thumb",
          insight: `**Cost goes up with *pixel area*, not file size.** A heavily-compressed 50 KB JPEG at 4000×3000 costs more tokens than a 2 MB PNG at 800×600. Resize *before* uploading if your use case doesn't need the resolution — it's free token savings and you control the downsampling instead of the server.`,
        },
      ],
    },

    // ============================================================
    // Section 6 — Multi-image requests and positioning
    // ============================================================
    {
      title: "Multi-image requests and positioning",
      blocks: [
        {
          kind: "prose",
          markdown: `## Two rules, both about ordering

The documented best practices for multi-image prompts are tiny and consistently violated:

1. **Put images *before* the text question** in the \`content[]\` array.
2. **Label them** with adjacent text blocks ("Image 1:", "Image 2:", ...) so your downstream question can refer to them by name.

The model can technically handle either ordering, but quality drops measurably when text-then-images is used, especially on long prompts. Image-first lets the model build its visual context before reading what you want it to do with that context — same reason you put exemplars before instructions in few-shot prompting.

Labeling matters because without it, "in the second image, what color is the button?" is ambiguous — the model has to count blocks, and counting is one of the things vision is documented to be bad at. With labels, you've turned a counting problem into a lookup.`,
        },
        {
          kind: "code_comparison",
          label: `Two layouts for the same task`,
          left: {
            title: "Bad: text first, no labels",
            code: `content = [
    {"type": "text",
     "text": "Compare these three product photos. "
             "Which has the most consistent lighting?"},
    {"type": "image", "source": {...}},
    {"type": "image", "source": {...}},
    {"type": "image", "source": {...}},
]`,
            annotation: `Model reads the question, then encounters three nameless images. Has to count them to answer "which" and may confuse the order. Quality is lower and harder to evaluate.`,
          },
          right: {
            title: "Good: labeled images, then question",
            code: `content = [
    {"type": "text", "text": "Image 1:"},
    {"type": "image", "source": {...}},
    {"type": "text", "text": "Image 2:"},
    {"type": "image", "source": {...}},
    {"type": "text", "text": "Image 3:"},
    {"type": "image", "source": {...}},
    {"type": "text",
     "text": "Compare lighting consistency across "
             "Images 1-3. Which is most consistent?"},
]`,
            annotation: `Each image arrives with a stable referent. The question can name them directly. The model's answer can cite "Image 2" unambiguously and you can map that back to the file.`,
          },
          takeaway: `The "label + image + label + image + ... + question" pattern scales to dozens of images. Bake it into your \`prepare_payload\` helper — never hand-build multi-image content arrays.`,
        },
        {
          kind: "scenario_predict",
          label: `Spot the layout bug`,
          scenario: `{
  "role": "user",
  "content": [
    {"type": "text", "text": "Which of these screenshots shows the bug?"},
    {"type": "image", "source": {...}},
    {"type": "image", "source": {...}},
    {"type": "image", "source": {...}}
  ]
}`,
          language: "json",
          question: `What two documented best practices does this violate, and how would you fix it?`,
          answer: `Violates "images before text" AND "label each image". Fix: prepend each image with a text block "Screenshot 1:" / "Screenshot 2:" / "Screenshot 3:" and move the question to the end.`,
          explanation: `As written, the model has to count nameless images to answer "which" — and its reply will be hard to evaluate ("the second one" leaves you matching positions). The labeled-and-reordered version produces answers like "Screenshot 2 shows the bug" that map deterministically back to your files.`,
        },
        {
          kind: "multiple_choice",
          title: "Best-practice ordering",
          prompt: `Which content[] ordering best matches Anthropic's documented best practices for a multi-image prompt?`,
          choices: [
            {
              text: `text question first, then all images appended at the end`,
              correct: false,
              rationale: `Inverted. The recommendation is images first so the model builds visual context before reading the instruction.`,
            },
            {
              text: `interleaved: "Label N:" text block, image block, ... then a single text question at the end`,
              correct: true,
              rationale: `Correct. Labels + images + question at end is the documented pattern. It gives every image a stable referent and lets the question name them directly.`,
            },
            {
              text: `all images first (unlabeled), then the text question, then a "P.S. they were images 1 through N" note`,
              correct: false,
              rationale: `Images first is right, but un-labeled images plus a trailing note is fragile — the model still has to count to map "image 1" to position. Inline labels are more reliable.`,
            },
            {
              text: `each image followed by its own text question (one Q per image)`,
              correct: false,
              rationale: `Works for independent per-image questions but breaks for *comparison* tasks ("which of these..."). Use the interleaved-labels pattern as default; it covers both cases.`,
            },
          ],
          explanation: `The interleaved labels pattern is the safe default. It handles single-image, multi-image-independent, AND multi-image-comparison prompts without restructuring. Internalize it as your one true multi-image layout.`,
        },
        {
          kind: "flashcard",
          context: `You're explaining the "Image 1:" / "Image 2:" labels to a junior engineer who thinks they're cosmetic.`,
          front: `Why label images with "Image 1:" / "Image 2:" instead of just placing them in order?`,
          back: `Labels give the model a **stable referent** so your text prompt can say "in Image 2, what color is the button?" unambiguously. Without labels, the model has to *count* image blocks (something vision is documented to be bad at) and your evaluation pipeline has to *guess* which image its answer refers to. Labels turn a counting problem into a lookup problem on both sides.`,
        },
      ],
    },

    // ============================================================
    // Section 7 — Vision's limitations
    // ============================================================
    {
      title: "Vision's limitations (the things it cannot do)",
      blocks: [
        {
          kind: "prose",
          markdown: `## Pre-emptive refusal saves your customer's evaluation

The single most expensive FDE mistake on vision projects is shipping a demo that *looks* like it works, only to discover three weeks into the customer pilot that the use case is one of the documented limitations. The customer evaluates on their hardest examples, the model fails predictably, and now you're explaining limitations after you already promised the moon.

The documented limitations of Claude vision are short and worth memorizing:

- **No person identification.** Claude will not identify named individuals from photos. Don't build "verify this is the same person across two images."
- **Limited spatial reasoning.** Coordinates, precise distances, "how far apart are X and Y", "draw a bounding box" — these are weak. Get an approximate answer at best.
- **Approximate counting only.** Counting more than ~20 of anything (people in a crowd, items on a shelf) is unreliable. Past that threshold, errors compound.
- **Struggles with rotated / blurry / low-contrast images.** Pre-rotate and pre-enhance client-side. The model will not silently apply OCR-grade preprocessing.
- **No medical or legal diagnoses.** Don't ship "what disease does this X-ray show?" as a product feature.

The good news: all five of these are predictable. You can refuse the use case before the contract is signed, or build the classical CV component upstream of Claude.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `**Vision is *descriptive*, not *forensic*.** If your use case requires pixel-perfect counts, exact coordinates, identity matching, or evidentiary precision, you need a classical CV model in front of Claude. Use Claude for the *reasoning over* the CV output — "given that the classifier said this is a stop sign at confidence 0.94, what should the autonomous-driving stack do?" — not for the recognition itself.`,
        },
        {
          kind: "multiple_choice",
          title: "Which use case is the wrong fit?",
          prompt: `Of the four use cases below, which one is Claude vision *specifically documented as bad at*, and should NOT be the primary tool?`,
          choices: [
            {
              text: `Summarizing a bar chart screenshot into 3 bullet points`,
              correct: false,
              rationale: `Charts are a strong use case for vision — describing structure, comparing bars, identifying outliers. Ship it.`,
            },
            {
              text: `Counting roughly how many chairs are in a meeting-room photo (≤ 8)`,
              correct: false,
              rationale: `Counting under ~20 is acceptable. It's the >20 regime where counting gets unreliable.`,
            },
            {
              text: `Confirming whether the same person appears in two photographs`,
              correct: true,
              rationale: `Correct — Claude is documented as not performing person identification. Use a face-matching API (or refuse the use case entirely on privacy grounds), then have Claude reason over the matcher's output if needed.`,
            },
            {
              text: `Identifying the dominant color palette in a product photo`,
              correct: false,
              rationale: `Color description and brand-palette analysis are perfectly fine. Ship it.`,
            },
          ],
          explanation: `Person identification is the one to memorize — it comes up surprisingly often in customer conversations (security, HR, retail). Have a polite refusal ready: "Claude doesn't identify specific individuals from images. I'd pair it with a face-matching service for the recognition step."`,
        },
        {
          kind: "flashcard",
          context: `Customer pilot kickoff. The PM asks: "Can we use Claude to verify the same person appears in two driver-license photos?"`,
          front: `How do you respond?`,
          back: `Claude does not perform identity recognition. Recommend a dedicated face-matching API for the verification step (AWS Rekognition, Azure Face, or a vendor-specific solution) and use Claude only for downstream reasoning over its output — e.g., explaining a low-confidence match to an analyst or drafting the rejection email. Be explicit on the call so the limitation is on record before contracts.`,
        },
      ],
    },

    // ============================================================
    // Section 8 — PDF inputs: the document content block
    // ============================================================
    {
      title: "PDF inputs: the document content block",
      blocks: [
        {
          kind: "prose",
          markdown: `## A PDF is just another content block

Sending a PDF to Claude has the **same shape** as sending an image — same \`content[]\` array, same three source variants, same positioning rules. The only differences:

- The block \`type\` is \`"document"\` instead of \`"image"\`.
- For base64 sources, \`media_type\` is \`"application/pdf"\`.

Mechanically, here's what Claude does with a PDF on the server side: **each page is rendered as an image AND its text is extracted**, and both representations are fed to the model together. That gives you the best of both worlds:

- The **image** preserves layout, charts, signatures, scanned content that has no machine-readable text.
- The **extracted text** preserves exact wording, so the model can quote and cite accurately.

This dual representation is also why PDFs are *expensive*: every page costs you roughly the text tokens of that page (~1,500–3,000) PLUS the image tokens for the rendered page. A 100-page contract can blow past 200K input tokens easily.`,
        },
        {
          kind: "method_ref",
          title: "Document content block schema",
          importLine: `# Inside messages[].content[] — same array as image and text blocks`,
          methods: [
            {
              signature: `{"type": "document", "source": {...}}`,
              description: `Outer envelope. Same array position as image / text blocks; one block = one document (PDF).`,
            },
            {
              signature: `source: {"type": "base64", "media_type": "application/pdf", "data": "..."}`,
              description: `Inline base64. \`data\` is the base64 STRING of the PDF bytes. \`media_type\` is always "application/pdf".`,
            },
            {
              signature: `source: {"type": "url", "url": "https://..."}`,
              description: `Public URL to the PDF. Claude fetches it server-side.`,
            },
            {
              signature: `source: {"type": "file", "file_id": "file_..."}`,
              description: `PDF uploaded via Files API. Requires \`anthropic-beta: files-api-2025-04-14\` header.`,
            },
          ],
        },
        {
          kind: "key_insight",
          label: "Cost mental model",
          insight: `**One PDF page ≈ one image's worth of tokens PLUS the page's extracted text (~1,500–3,000 tokens).** Multiply by page count. A 100-page PDF can easily be 200K+ input tokens — past the context window of any non-200K model and a real budget hit even on the big ones. Always check page count before estimating cost.`,
        },
        {
          kind: "scenario_predict",
          label: `Token estimate for a 50-page PDF`,
          scenario: `# 50-page PDF, base64 encoded, sent inline as a single document block
content = [
    {"type": "document", "source": {
        "type": "base64",
        "media_type": "application/pdf",
        "data": pdf_b64,
    }},
    {"type": "text", "text": "Summarize the key terms."},
]`,
          language: "python",
          question: `Roughly how many *input* tokens does this single request consume before the model writes anything?`,
          answer: `Roughly 100,000 input tokens (50 pages × ~2,000 tokens/page average).`,
          explanation: `Per-page cost = extracted text tokens (~1,500–3,000) + per-page image tokens. Averaging ~2,000/page, a 50-page PDF is around 100K input tokens. That's half your budget on a 200K-context model used on a single document. This is why caching long PDFs (Section 9) is non-negotiable for any workflow that asks more than one question of the same document.`,
        },
        {
          kind: "flashcard",
          context: `A customer asks why PDFs are billed so heavily compared to plain text input.`,
          front: `Why does Claude analyze PDFs as "page images + extracted text" instead of just one or the other?`,
          back: `**Images preserve** layout, charts, signatures, scanned content, hand-marked annotations — things text extraction loses. **Extracted text preserves** exact wording, so the model can quote precisely and you can citation-back. Combining both maximizes fidelity (layout-aware reasoning) AND accuracy (exact quotes). The cost is paying for both representations per page.`,
        },
        {
          kind: "prose",
          markdown: `## What this enables

Because the model sees both layout and text, a single \`document\` block can answer questions that previously required a three-stage pipeline:

- "What's the total invoice amount?" → reads the bold number in the bottom-right cell of a table image.
- "List every section heading in this contract." → reads the larger / bolder text, infers heading structure.
- "Was this form signed?" → looks at the signature box pixel-region, not just the text.

All without you writing a single line of layout-parsing code. That's the pipeline collapse from Section 1, but specifically for documents.`,
        },
      ],
    },

    // ============================================================
    // Section 9 — PDF limits, caching, best practices
    // ============================================================
    {
      title: "PDF limits, caching, and best practices",
      blocks: [
        {
          kind: "prose",
          markdown: `## The PDF limits box

PDFs have their own caps, and they're stricter than images on some axes:

- **32 MB per request** (total payload, not per document).
- **600 pages per PDF.** *But* if the model has a 200K context window (Sonnet, Opus families), the cap drops to **100 pages per PDF.**
- **No passwords, no encryption.** The PDF must be openable without a credential.
- **Standard PDF** (no exotic extensions, no AcroForm-only documents with no visual layer).

The 100-page cap on 200K models trips people up because it's the *opposite* of the intuitive expectation — bigger context, smaller cap. The reason is the same as the 100 vs 600 image regime: per-page cost is high, so 600 pages would blow past 200K context easily.

Same positioning advice as images: **put \`document\` blocks before the text question** in \`content[]\`. The labeling pattern ("Document 1:", "Document 2:") also applies for multi-document requests.`,
        },
        {
          kind: "method_ref",
          title: "PDF limits cheat-sheet",
          importLine: `# All limits documented at docs.claude.com/build-with-claude/pdf-support`,
          methods: [
            {
              signature: `max bytes per request: 32 MB`,
              description: `Total payload size, summed across all documents in the request.`,
            },
            {
              signature: `max pages per PDF: 600 (general) | 100 (200K-context models)`,
              description: `Sonnet/Opus families have the 100-page cap. Smaller models go up to 600.`,
            },
            {
              signature: `format: standard PDF, no passwords, no encryption`,
              description: `Strip security via a client-side library (qpdf, pdftk) before upload if needed.`,
            },
            {
              signature: `positioning: place document blocks BEFORE text in content[]`,
              description: `Same rule as images — context first, question last.`,
            },
            {
              signature: `model support: all currently active Claude models`,
              description: `PDF support is not a beta feature; it's GA across the active model lineup.`,
            },
          ],
        },
        {
          kind: "prose",
          markdown: `## Caching long PDFs

Document blocks support \`cache_control\`. That means a 100-page contract can be cached once and re-read across many user questions for ~10% of the original cost on cache reads. The cache placement rules are the same as for any other block — see the **Streaming & prompt caching** guide for the full mechanics. The pattern in words:

\`\`\`python
content=[
    {"type": "document", "source": {"type": "file", "file_id": "file_..."},
     "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": user_question},
]
\`\`\`

On the first call you pay full price for the PDF (\`cache_creation_input_tokens\` ≈ all the document tokens). On every subsequent call with the same PDF block, you pay ~10% of that (\`cache_read_input_tokens\`) — only the changing user question is fresh tokens.

For any workflow where the same PDF gets multiple questions (legal review, RFP Q&A, customer support over a manual), **not caching is throwing money at Anthropic's bandwidth bill.**`,
        },
        {
          kind: "scenario_predict",
          label: `What's the inefficiency?`,
          scenario: `{
  "messages": [{"role": "user", "content": [
    {"type": "document", "source": {
      "type": "base64",
      "media_type": "application/pdf",
      "data": "<200-page contract as base64>"
    }},
    {"type": "text", "text": "Find the indemnification clauses."}
  ]}]
}
// Called 10 times with 10 different user questions, same PDF.`,
          language: "json",
          question: `What's the inefficiency in this pattern, and what one change fixes it?`,
          answer: `The PDF is re-tokenized and re-billed on every one of the 10 calls. Add \`"cache_control": {"type": "ephemeral"}\` to the document block; then call 1 pays \`cache_creation\` for the full PDF and calls 2–10 pay only \`cache_read\` (~10%) for the PDF plus fresh tokens for the changing question.`,
          explanation: `For a 200-page PDF (~400K document tokens, well past any model's context — assume the customer chunked, but stick with this for illustration): without cache, you'd pay 10 × full price. With cache: 1 × full + 9 × 10% = effectively 1.9 × full. That's a ~80% savings on a workflow you'd run anyway. The single line of JSON pays back in the first session.`,
        },
        {
          kind: "warm_up",
          title: "Encrypted PDF",
          prompt: `You try to upload a password-protected PDF. What does the API return, and what's the fix?`,
          answer: `400 invalid_request_error. Fix: decrypt client-side with qpdf / pdftk / a PDF library before encoding.`,
          explanation: `The PDF must be openable without a credential. The API doesn't accept passwords through the request. Standard remediation: \`qpdf --password=PASSWORD --decrypt encrypted.pdf decrypted.pdf\` on the client, then encode \`decrypted.pdf\`. Make this a step in your upload pipeline if customers regularly send encrypted docs.`,
        },
        {
          kind: "multiple_choice",
          title: "400-page PDF, 200K-context model",
          prompt: `A customer wants to send a 400-page PDF as a single \`document\` block to Claude Sonnet (200K context). What happens?`,
          choices: [
            {
              text: `Works fine — 400 pages is under the 600-page cap.`,
              correct: false,
              rationale: `The 600-page cap doesn't apply here. 200K-context models have the *smaller* 100-page cap.`,
            },
            {
              text: `Rejected — Sonnet's 200K context comes with a 100-page-per-PDF cap, and 400 > 100.`,
              correct: true,
              rationale: `Correct. The intuition-violating rule: bigger context = smaller PDF cap. Fix is either (a) split the PDF into chunks of ≤100 pages and use multiple document blocks, or (b) use a non-200K-context model that allows up to 600 pages.`,
            },
            {
              text: `Silently truncated to the first 100 pages and processed.`,
              correct: false,
              rationale: `Silent truncation would be a terrible API design. You get an explicit error, not a stealth data loss.`,
            },
            {
              text: `Auto-summarized into a 100-page version by Claude before processing.`,
              correct: false,
              rationale: `The server does no summarization. It returns an error and lets you decide how to split.`,
            },
          ],
          explanation: `The 100-vs-600 page split mirrors the 100-vs-600 image-count split — both stem from "200K context can hold fewer expensive multimodal assets." Memorize the rule: **200K-context models = 100 pages OR 100 images max.**`,
        },
      ],
    },

    // ============================================================
    // Section 10 — Files API teaser & the file_id source
    // ============================================================
    {
      title: "Files API teaser & the file_id source",
      blocks: [
        {
          kind: "prose",
          markdown: `## Upload once, reference everywhere

You've seen \`{"type": "file", "file_id": "file_..."}\` listed as the third source variant in both image and document blocks. Here's the one-paragraph summary of what it actually is:

The **Files API** lets you upload an asset (image or PDF) *once* via a separate endpoint, receive back a \`file_id\`, and then reference that \`file_id\` in any number of subsequent \`messages.create\` calls without re-uploading bytes. Requires the beta header \`anthropic-beta: files-api-2025-04-14\` on both the upload call and any \`messages.create\` that references a \`file_id\`.

We won't go deeper here — the **Files API & Citations** guide covers upload endpoints, listing, deletion, retention, and the Citations feature that pairs with it. For now you need to know two things:

1. The third source variant exists, and it's the *right* answer whenever an asset is reused across multiple API calls.
2. The beta header is mandatory until Files graduates from beta.`,
        },
        {
          kind: "code_comparison",
          label: `When to graduate from base64 to Files API`,
          left: {
            title: "base64 inline (10 calls, 10 uploads)",
            code: `b64 = encode_image("logo.png")  # 4 MB string

for question in test_questions:  # 10 prompts
    client.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": b64,
            }},
            {"type": "text", "text": question},
        ]}],
    )
# Bytes uploaded: 10 x 4 MB = 40 MB`,
            annotation: `Same logo bytes travel over the wire 10 times. Slower, more bandwidth, no opportunity for caching across calls because the upload path is per-request.`,
          },
          right: {
            title: "Files API (1 upload, 10 references)",
            code: `# Upload once (requires beta header)
file_obj = client.beta.files.upload(
    file=open("logo.png", "rb"),
)
file_id = file_obj.id  # "file_011CRk..."

for question in test_questions:
    client.beta.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        betas=["files-api-2025-04-14"],
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {
                "type": "file",
                "file_id": file_id,
            }},
            {"type": "text", "text": question},
        ]}],
    )
# Bytes uploaded: 4 MB (once)`,
            annotation: `One upload, ten cheap references. Bandwidth drops 10x. Bonus: the same \`file_id\` participates in prompt-caching, so the image tokens hit the cache after the first call.`,
          },
          takeaway: `Rule of thumb: **>1 call against the same asset → Files API.** For a one-shot demo or notebook, base64 is fine. For a customer dashboard that runs 50 prompts/day against the same logo, Files API is the difference between a $4/day bill and a $40/day bill.`,
        },
        {
          kind: "flashcard",
          context: `Architecture review: a colleague is base64-encoding the same 8 MB product photo into every call of a 30-prompt batch eval suite.`,
          front: `What's the one architectural change that yields the biggest win, and why?`,
          back: `Switch to the Files API: \`client.beta.files.upload\` once → reference the resulting \`file_id\` in all 30 calls. Wins: (1) bytes uploaded drops from 240 MB to 8 MB; (2) the image content participates in prompt-caching across calls; (3) the \`file_id\` is stable and re-usable in tomorrow's batch run too. Cost: one beta header on every relevant call.`,
        },
      ],
    },

    // ============================================================
    // Section 11 — OCR vs vision: choosing the right tool
    // ============================================================
    {
      title: "OCR vs vision: choosing the right tool",
      blocks: [
        {
          kind: "prose",
          markdown: `## The tradeoff in one paragraph

Classical OCR (Tesseract, AWS Textract, Google Document AI) gives you **per-token bounding boxes**, **per-character confidence scores**, and **predictable per-page cost** down to fractions of a cent. It's deterministic and auditable. It struggles when the input deviates from "clean printed text on white paper" — rotated scans, mixed-language documents, hand-written annotations, complex multi-column layouts.

Claude vision gives you **semantic understanding**, **layout-aware Q&A**, **table-to-JSON in one shot**, and **tolerance for messy real-world scans**. It doesn't expose bounding boxes or per-character confidences. It costs more per page and the cost varies with the question asked. It is non-deterministic in the strict sense (set temperature=0 and it's *near* deterministic, but not bit-identical).

In a customer architecture review, the choice usually isn't either-or — it's "which one *front-ends* the other?":

- **Pipeline A**: OCR-first, then Claude. Tesseract extracts text → Claude reasons over the extracted text. Cheaper, no Claude vision tokens, but you lose layout info and any chart/signature content. Good for high-volume, simple text documents.
- **Pipeline B**: Claude-first (vision/PDF block). Claude both reads and reasons in one call. Higher per-page cost, but no layout-parser engineering, and Claude sees charts/scans/signatures. Good for varied document types, lower volume, or anywhere a customer is currently struggling with their OCR pipeline.`,
        },
        {
          kind: "code_comparison",
          label: `Pipeline shapes`,
          left: {
            title: "Pre-multimodal: 4-stage pipeline",
            code: `# Per document:
text = textract.detect_text(pdf_bytes)
tables = textract.analyze(pdf_bytes, ["TABLES"])
layout = custom_layout_parser(text, tables)
prompt = render_template(layout, user_question)
answer = claude.messages.create(messages=[{
    "role": "user", "content": prompt
}])
# 4 services, 4 failure modes,
# template explodes when tables grow.`,
            annotation: `Engineering surface area: text extraction config, table extraction config, layout parsing rules, prompt template maintenance. Every customer document type that doesn't fit triggers a new branch in the layout parser.`,
          },
          right: {
            title: "Post-multimodal: 1 call",
            code: `# Per document:
answer = claude.messages.create(messages=[{
    "role": "user", "content": [
        {"type": "document", "source": {
            "type": "base64",
            "media_type": "application/pdf",
            "data": pdf_b64,
        }},
        {"type": "text", "text": user_question},
    ]
}])
# 1 service, 1 failure mode,
# new document types Just Work.`,
            annotation: `Engineering surface area: encode the PDF and write the question. Tables, charts, scans, signatures all flow through the same call. Higher per-page cost in exchange for collapsing four stages of pipeline.`,
          },
          takeaway: `The right answer depends on **document variety** and **volume**. If your customer has 50 unique document templates and 100 docs/day, multimodal wins on engineering cost alone. If they have 2 templates and 100,000 docs/day, OCR + classical layout parsing wins on per-doc cost.`,
        },
        {
          kind: "key_insight",
          label: "Decision rule",
          insight: `**Use OCR when you need coordinates, audit trails, or sub-cent cost per page. Use Claude vision when you need *answers* and the document set is heterogeneous.** The crossover point is roughly: low document variety + high volume → OCR; high variety + lower volume → Claude. Hybrid pipelines (OCR for the bulk, Claude for the exceptions) are almost always the long-run answer for serious deployments.`,
        },
        {
          kind: "multiple_choice",
          title: "Pick the best fit for Claude vision",
          prompt: `Which of the following customer use cases is the **best** fit for Claude vision (as opposed to Textract or another classical OCR tool)?`,
          choices: [
            {
              text: `Extracting the routing/account number from 50,000 standardized US bank checks per day.`,
              correct: false,
              rationale: `High volume, low variety, character-precision matters — that's classical OCR territory (Textract has a dedicated check API).`,
            },
            {
              text: `Ad-hoc Q&A across a folder of vendor PDFs with varying layouts (some scanned, some native, some with charts).`,
              correct: true,
              rationale: `Correct. Heterogeneous documents + question-answering workflow = the multimodal sweet spot. Building a classical pipeline that handles all three sub-types would be weeks of engineering; the Claude version is one prompt template.`,
            },
            {
              text: `Drawing precise bounding boxes around every word in a legal contract for downstream highlighting.`,
              correct: false,
              rationale: `Spatial reasoning + per-word coordinates = explicit vision limitations. Use a layout-aware OCR.`,
            },
            {
              text: `Real-time license plate recognition from a traffic camera feed at 60 FPS.`,
              correct: false,
              rationale: `Real-time, high-throughput, character-precision — that's a specialized ALPR model, not a general LLM. Latency alone disqualifies a Claude call per frame.`,
            },
          ],
          explanation: `The pattern: Claude vision wins on *heterogeneity* and *reasoning*. It loses on *precision*, *volume*, and *real-time latency*. Map the customer's use case onto those two axes before recommending an approach.`,
        },
        {
          kind: "flashcard",
          context: `Customer call: "We need per-character confidence scores for every digit in the check amount to flag low-confidence reads for human review."`,
          front: `Claude or classical OCR?`,
          back: `**Classical OCR** — Claude does not expose per-character confidences or bounding boxes. Use Textract (or a check-specific service) for the extraction with confidences; if needed, use Claude downstream to reason over the low-confidence cases ("explain why this digit might have been misread" or "draft a human-review queue entry").`,
        },
      ],
    },

    // ============================================================
    // Section 12 — Pitfalls grab-bag
    // ============================================================
    {
      title: "Pitfalls grab-bag (the FDE field manual)",
      blocks: [
        {
          kind: "prose",
          markdown: `## The bugs you'll actually hit

The official limits are documented. The five bugs below aren't — they're field-collected from the kind of mistakes that eat half a day to debug because the error message doesn't tell you what's wrong.

Memorize the *symptoms*, not the fixes. When you see one, you'll know which section of this guide to re-read.`,
        },
        {
          kind: "scenario_predict",
          label: `What's missing?`,
          scenario: `import requests
image_bytes = requests.get("https://example.com/cat.jpg").content
block = {
    "type": "image",
    "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": image_bytes,  # !
    },
}`,
          language: "python",
          question: `What will happen when this block is serialized and sent, and what's the fix?`,
          answer: `\`json.dumps\` (or the SDK's serializer) will raise — \`bytes\` is not JSON-serializable. Fix: \`base64.standard_b64encode(image_bytes).decode("ascii")\`.`,
          explanation: `Raw bytes from \`requests.get(...).content\` are NOT base64-encoded just because the field is called \`data\` — the API expects a base64 STRING. Two transformations are needed: encode (raw bytes → base64 bytes) and decode (base64 bytes → ASCII string). Skipping either one produces a confusing error before the request ever leaves the client.`,
        },
        {
          kind: "scenario_predict",
          label: `The "image/jpg" trap`,
          scenario: `{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpg",
    "data": "/9j/4AAQ..."
  }
}`,
          language: "json",
          question: `Why does the API reject this 400 invalid_request_error?`,
          answer: `\`image/jpg\` is not a valid media_type. The canonical MIME type is \`image/jpeg\` (note the "e").`,
          explanation: `Even though file extensions are often \`.jpg\`, the IANA MIME type is \`image/jpeg\`. The API checks this string literally. \`mimetypes.guess_type\` is inconsistent across platforms — on some Windows configs it returns \`image/jpg\`, which will fail. Always use the explicit string map from the mini-challenge in Section 5.`,
        },
        {
          kind: "code_predict",
          label: `Layout that confuses the model`,
          code: `content = [{"type": "text",
            "text": "Look at these and tell me which is brighter."}]
for path in glob.glob("photos/*.jpg"):
    content.append({
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg",
                   "data": encode(path)},
    })
# Send: text first, then 50 unlabeled images.
# Predict the quality of the model's answer.`,
          output: `Lower-quality answers; model often confuses order and may answer about images it never saw clearly.`,
          explanation: `Two best practices violated: (1) text-first instead of images-first, (2) no labels. The model has to count nameless images to answer "which is brighter" and its answer is hard to map back to a specific file. Fix: build the content array as alternating \`{"type":"text","text":f"Image {i+1}:"}\` + image block, then put the question last.`,
        },
        {
          kind: "scenario_predict",
          label: `Missing beta header on curl`,
          scenario: `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": [
      {"type": "image", "source": {
        "type": "file", "file_id": "file_011CRk..."
      }},
      {"type": "text", "text": "Describe this."}
    ]}]
  }'`,
          language: "bash",
          question: `What HTTP response do you get and what header fixes it?`,
          answer: `400 invalid_request_error. Add \`-H "anthropic-beta: files-api-2025-04-14"\`.`,
          explanation: `\`file_id\` sources are gated behind the Files API beta header. The beta header must be present on every request that references a \`file_id\`, not just the original upload call. Missing it is the #1 cause of "but it worked in my notebook!" — your notebook had the SDK's beta wrapper, your curl didn't.`,
        },
        {
          kind: "key_insight",
          label: "The 80/20 pitfalls",
          insight: `**Three bugs eat 80% of FDE time on multimodal: (1) forgetting to base64-encode** (or forgetting to \`.decode("ascii")\`), **(2) wrong MIME string** (especially \`image/jpg\` instead of \`image/jpeg\`), **(3) missing the Files API beta header** on \`file_id\` references. Build a \`prepare_payload\` helper that handles all three correctly and use it everywhere — never hand-roll multimodal content arrays.`,
        },
        {
          kind: "multiple_choice",
          title: "Why might the model 'see' a different image?",
          prompt: `A user reports: "I sent a clear photo of a cat, and Claude described a dog." Assuming the file is genuinely a cat, what is the *most likely* root cause?`,
          choices: [
            {
              text: `The file got corrupted in transit.`,
              correct: false,
              rationale: `Possible but rare — transport corruption typically triggers a decode error on the server, not a wrong-content response.`,
            },
            {
              text: `Images over 5 MB are silently downsampled to a stub.`,
              correct: false,
              rationale: `There is no silent stub. Oversize images return an explicit error.`,
            },
            {
              text: `\`media_type\` was set incorrectly (e.g., declared \`image/png\` but the bytes are JPEG), causing the server to misparse.`,
              correct: true,
              rationale: `Correct. \`media_type\` tells the server how to decode the base64 bytes. Lying about the type — even by accident, via a bad mimetype guess — can produce garbled pixel data that the model "sees" as something completely different.`,
            },
            {
              text: `Claude vision is non-deterministic and randomly hallucinates objects.`,
              correct: false,
              rationale: `At low temperature, vision is highly reliable on clear photos. A wholesale species swap is a signal of a *systemic* bug (decoding, encoding, file mixup), not a hallucination.`,
            },
          ],
          explanation: `When the model returns wildly wrong content, suspect the *encoding* before suspecting the *model*. Check: (1) \`media_type\` matches the actual bytes, (2) bytes were base64-encoded once not twice, (3) you're sending the file you think you're sending (\`.glob\` orderings differ across OSes — print the path before the call).`,
        },
      ],
    },

    // ============================================================
    // Section 13 — Cold-recall lock-in
    // ============================================================
    {
      title: "Lock it in: cold recall from memory",
      blocks: [
        {
          kind: "prose",
          markdown: `## One sweep, no peeking

Close the previous sections. Each warm-up and MCQ below targets a specific fact you should now own. If any one of them stumps you for more than 10 seconds, go re-read the section it tests before moving on. Cold recall is the point — re-reading is comprehension, not recall.`,
        },
        {
          kind: "warm_up",
          title: "Image size cap",
          prompt: `What is the per-image size limit via the API?`,
          answer: `5 MB (measured on the raw file, not the base64 string).`,
          explanation: `Section 4 / Section 3. Note that claude.ai's web UI allows 10 MB — don't confuse that with the API limit.`,
        },
        {
          kind: "warm_up",
          title: "Token formula",
          prompt: `What is the documented estimate for image tokens, given width \`W\` and height \`H\`?`,
          answer: `tokens ≈ (W × H) / 750`,
          explanation: `Section 5. A 1024×768 screenshot is about 1,049 tokens. The result is capped per-model (Opus 4.7: ~4,784; others: ~1,568) by server-side downsampling.`,
        },
        {
          kind: "warm_up",
          title: "Files API beta header",
          prompt: `What header must be on every request that uses a \`file_id\` source?`,
          answer: `anthropic-beta: files-api-2025-04-14`,
          explanation: `Section 3 / Section 10 / Section 12. Required on both the original upload call AND any \`messages.create\` that references the resulting \`file_id\`.`,
        },
        {
          kind: "warm_up",
          title: "PDF page cap on 200K models",
          prompt: `What is the max page count per PDF for a model with a 200K-token context window?`,
          answer: `100 pages.`,
          explanation: `Section 9. Counterintuitive: bigger context = smaller PDF cap. Non-200K models go up to 600 pages.`,
        },
        {
          kind: "warm_up",
          title: "Positioning rule",
          prompt: `Where should image and document blocks be placed relative to text blocks inside \`content[]\`?`,
          answer: `Before the text. Multimodal first, question last.`,
          explanation: `Section 2 / Section 6 / Section 8. Same rule for images and PDFs. Pair with the "Image 1:" / "Document 1:" labeling pattern for multi-asset requests.`,
        },
        {
          kind: "multiple_choice",
          title: "PNG media_type",
          prompt: `Which is the **only** valid \`media_type\` string for a PNG screenshot?`,
          choices: [
            {
              text: `image/png`,
              correct: true,
              rationale: `Correct — lowercase, no underscores, no prefix.`,
            },
            {
              text: `image/x-png`,
              correct: false,
              rationale: `An old experimental MIME prefix not accepted by the API.`,
            },
            {
              text: `image/PNG`,
              correct: false,
              rationale: `MIME types are case-sensitive; the canonical form is lowercase.`,
            },
            {
              text: `application/png`,
              correct: false,
              rationale: `Wrong top-level type — images are under \`image/...\`, not \`application/...\`.`,
            },
          ],
          explanation: `The four valid image MIME types are exactly \`image/jpeg\`, \`image/png\`, \`image/gif\`, \`image/webp\` — lowercase, no variants. Don't trust \`mimetypes.guess_type\`; hardcode the mapping.`,
        },
        {
          kind: "multiple_choice",
          title: "Best architecture for a long-PDF Q&A workflow",
          prompt: `A customer has a 150-page contract and wants to ask 30 different questions about it across a session. Which architecture is best?`,
          choices: [
            {
              text: `30 separate calls, each with the PDF inlined as base64.`,
              correct: false,
              rationale: `Re-uploads and re-tokenizes the PDF 30 times. Slowest, most expensive, no caching benefit.`,
            },
            {
              text: `1 Files API upload, then 30 calls each referencing the \`file_id\` with \`cache_control: {"type": "ephemeral"}\` on the document block.`,
              correct: true,
              rationale: `Correct — Files API for bandwidth (1 upload), \`cache_control\` for token cost (call 1 pays creation, calls 2-30 pay reads). Best on both axes.`,
            },
            {
              text: `Split the PDF into 30 single-page PDFs and ask one question of each.`,
              correct: false,
              rationale: `Defeats the point: most questions need cross-page context. You'd lose document-wide reasoning entirely.`,
            },
            {
              text: `Pre-OCR the PDF to plain text and send the text in each call.`,
              correct: false,
              rationale: `Loses layout, charts, signatures — the things you used multimodal *for*. Also requires the OCR pipeline you were trying to avoid.`,
            },
          ],
          explanation: `Files API + cache_control is the canonical pattern for repeated-question workflows on the same asset. Combines two distinct optimizations (one for bandwidth, one for tokens). Remember it as the default for "many questions, one document."`,
        },
        {
          kind: "code_predict",
          label: `BUG HUNT — find the bug`,
          code: `import base64

def prepare_image(path):
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read())
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": data,  # bug here
        },
    }

block = prepare_image("photo.jpg")
# Sent to the API — predict the response.`,
          output: `API returns 400 invalid_request_error (or the SDK raises a JSON serialization error before sending).`,
          explanation: `\`base64.standard_b64encode\` returns \`bytes\`, not \`str\`. The \`data\` field must be a JSON-serializable string, so this needs \`.decode("ascii")\` chained on the end: \`base64.standard_b64encode(f.read()).decode("ascii")\`. This is bug #1 from Section 12's "80/20 pitfalls" — bake \`.decode("ascii")\` into your helper function and never write the encode call inline again.`,
        },
        {
          kind: "flashcard",
          context: `Recall test on Section 7.`,
          front: `State the four documented vision limitations.`,
          back: `(1) No person identification. (2) Limited spatial reasoning (coordinates, distances). (3) Approximate counting only — unreliable past ~20 objects. (4) Struggles with rotated / blurry / low-contrast images. Bonus: no medical or legal diagnoses as a product feature.`,
        },
        {
          kind: "flashcard",
          context: `Architecture decision card — practice the one-liner.`,
          front: `One-line decision rule for picking between \`base64\`, \`url\`, and \`file\` sources?`,
          back: `**base64** for one-off self-contained calls; **url** for assets already hosted publicly; **file** for any asset reused across more than one call (and accept the beta header cost).`,
        },
        {
          kind: "key_insight",
          label: "Capstone",
          insight: `**Vision and PDF are the FDE's biggest pipeline-collapse lever.** They turn three- and four-stage OCR/layout/template pipelines into one API call — but only if you respect the three constants: **5 MB per image, 100 pages on 200K-context models, multimodal blocks before text.** Everything else in this guide is a refinement on those three. Internalize them and you'll catch 90% of the bugs in PR review before they ship.`,
        },
      ],
    },
  ],
};
