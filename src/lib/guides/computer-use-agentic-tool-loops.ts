import type { StudyGuide } from "../guide-types";

export const computerUseAgenticToolLoopsGuide: StudyGuide = {
  topicTitle: "Computer use & agentic tool loops",
  topicSlug: "computer-use-agentic-tool-loops",
  sections: [
    // ---------------------------------------------------------------
    // Section 1 — Mental model: agentic loop as tool-use special case
    // ---------------------------------------------------------------
    {
      title: "Mental model: agentic loop as a tool-use special case",
      blocks: [
        {
          kind: "prose",
          markdown: `
**Computer use is just the tool-use loop applied to a virtual desktop.** The shape is
identical to any other tool-use integration: you send a Messages request, Claude
returns \`tool_use\` blocks, you execute them, you return \`tool_result\` blocks, repeat
until \`stop_reason == "end_turn"\`. The only differences are:

1. The tools — \`computer\`, \`bash\`, \`text_editor\` — are *provided by Anthropic* as
   versioned beta tools. You don't declare their schemas; you just enable them by name
   and version.
2. The \`tool_result\` for a \`screenshot\` action is itself an **image content block**, so
   the conversation accumulates rendered desktop frames the same way a multimodal chat
   accumulates images.
3. Claude has been **trained** to use this exact tool family on real-screen workflows —
   you don't have to teach it "click then verify" patterns the way you would with a
   custom tool.

The customer use case to keep in mind for the FDE interview: **a legacy internal app
with no API.** Maybe an HR system, a legacy ERP, a regulator portal. The customer
wants automation, has no integration surface, and Selenium/RPA can't keep up with UI
churn. Computer use is the "API-less app integration" you reach for.
`,
        },
        {
          kind: "key_insight",
          label: "The loop is the same loop",
          insight: `If you can write a text-only tool-use loop, you can write a computer-use loop — the control flow is identical. **Send → check \`stop_reason\` → if \`tool_use\`, execute and append \`tool_result\` → resend.** The hard parts of computer use aren't loop logic; they're *latency*, *visual perception failures* ("did the page actually load?"), and *blast-radius control* ("don't let the agent click 'Delete account'"). All three live outside the model.`,
        },
        {
          kind: "flashcard",
          front: "What makes computer use harder than regular text-only tool use?",
          back: `Three things:

1. **Latency.** Each step = screenshot upload + reasoning + action. ~5–20s per step, so a 10-step workflow can run 1–3 minutes.
2. **Visual perception failures.** The model can misread a small/blurry button, claim success on a still-loading page, or get stuck on a modal it doesn't see.
3. **Blast radius.** Real desktop actions are *side-effectful and often irreversible* (clicking "Delete", sending email, submitting forms). You must constrain what the sandbox can touch.

Text-only tool use has none of these — same loop shape, very different operational profile.`,
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 2 — The computer-use tool family
    // ---------------------------------------------------------------
    {
      title: "The computer-use tool family",
      blocks: [
        {
          kind: "method_ref",
          title: "Anthropic-provided beta tools",
          importLine:
            'anthropic-beta: computer-use-2025-01-24   (or current beta tag)',
          methods: [
            {
              signature:
                '{ type: "computer_20250124", name: "computer", display_width_px, display_height_px, display_number? }',
              description:
                "The screen-driving tool. Actions: `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `mouse_move`, `left_click_drag`, `type`, `key`, `cursor_position`, `scroll`, `wait`. You must declare the virtual display dimensions so the model can compute pixel coordinates.",
            },
            {
              signature: '{ type: "bash_20250124", name: "bash" }',
              description:
                "A persistent shell session inside the sandbox. The model uses it for file ops, installing packages, running scripts. Stateful across the conversation (cwd, env vars persist).",
            },
            {
              signature: '{ type: "text_editor_20250124", name: "str_replace_editor" }',
              description:
                "File I/O with `view`, `create`, `str_replace`, `insert`, `undo_edit` commands. Reaches for it instead of `bash cat`/`sed` when the model needs to read or edit a file precisely.",
            },
            {
              signature: "Tool versions are explicit",
              description:
                "The `type` field embeds the tool version (`_20250124`). When Anthropic ships an updated tool, you bump the type string deliberately — there's no auto-upgrade. Always pin the version your prompt was tested against.",
            },
            {
              signature: 'tool_choice: { type: "auto" } (default)',
              description:
                'Don\'t force a tool with `{ type: "tool", name: "computer" }` — the model needs to decide when to screenshot vs. when to act. Forcing tools breaks the loop.',
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Enabling all three tools vs. only `computer`",
          left: {
            title: "All three (full agent)",
            code: `client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    tools=[
        {"type": "computer_20250124", "name": "computer",
         "display_width_px": 1280, "display_height_px": 800},
        {"type": "bash_20250124", "name": "bash"},
        {"type": "text_editor_20250124", "name": "str_replace_editor"},
    ],
    messages=[...],
    extra_headers={"anthropic-beta": "computer-use-2025-01-24"},
)`,
            annotation:
              "Maximum capability — the model can fall back to bash/file edits when the UI is too slow or fragile. The right default for legacy-app workflows that involve config files or downloaded artifacts.",
          },
          right: {
            title: "Only `computer` (pure UI driving)",
            code: `client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    tools=[
        {"type": "computer_20250124", "name": "computer",
         "display_width_px": 1280, "display_height_px": 800},
    ],
    messages=[...],
    extra_headers={"anthropic-beta": "computer-use-2025-01-24"},
)`,
            annotation:
              "Forces the model to do everything through the UI. Useful when the sandbox has no shell access (kiosk-style VM) or when you want auditable, click-by-click traces.",
          },
          takeaway:
            "Enabling `bash` and `text_editor` dramatically expands what the agent can do — and the blast radius. For a customer demo of a fragile legacy app, start UI-only; add bash/text_editor only when the workflow genuinely needs them (and the sandbox isolation can absorb it).",
        },
        {
          kind: "scenario_predict",
          label: "What a screenshot tool_result looks like",
          language: "json",
          scenario: `// Model returns:
{
  "type": "tool_use",
  "id": "toolu_01abc",
  "name": "computer",
  "input": { "action": "screenshot" }
}

// Your code captures a PNG of the VM screen and returns:
{
  "type": "tool_result",
  "tool_use_id": "toolu_01abc",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/png",
        "data": "<base64 PNG bytes>"
      }
    }
  ]
}`,
          question:
            "What's the one thing developers most often get wrong about this tool_result shape, and what's the token-cost implication?",
          answer: `Developers wrap the PNG as a plain text string ("data:image/png;base64,...") instead of as an **image content block**. The \`tool_result.content\` must be a list containing an \`image\` block (or a mix of text + image blocks) — not a flat base64 string. **Token-cost implication:** every screenshot is ~1500–3000 image tokens depending on display resolution, *and* the entire prior conversation (with all past screenshots) is re-sent on every loop iteration. Costs balloon fast on long workflows — this is why screenshot dedup and aggressive trimming matter.`,
          explanation:
            "Image content blocks in tool_results are what make computer use 'multimodal tool use.' If you send a text-encoded screenshot, the model sees text it can't interpret as a UI. Always wrap as `{type: 'image', source: {...}}`.",
        },
        {
          kind: "warm_up",
          title: "Enable the computer-use beta",
          prompt: `Fill in the two missing pieces a Messages request needs to use the \`computer\` tool:

\`\`\`python
client.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    tools=[{
        "type": "____________________",
        "name": "computer",
        "display_width_px": 1280,
        "display_height_px": 800,
    }],
    messages=[...],
    extra_headers={"________________": "computer-use-2025-01-24"},
)
\`\`\``,
          answer:
            "`type: \"computer_20250124\"` (the versioned tool type) and `extra_headers={\"anthropic-beta\": ...}` (the beta opt-in header).",
          explanation:
            "Two version stamps to memorize: the tool's `type` field embeds the tool version, and the `anthropic-beta` header opts the *request* into the feature. Both must match — using the right tool version with a stale beta header (or vice versa) returns a 400. Pin both in code, bump deliberately.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 3 — The agentic loop with guardrails
    // ---------------------------------------------------------------
    {
      title: "The agentic loop with guardrails",
      blocks: [
        {
          kind: "prose",
          markdown: `
The loop is mechanically simple:

1. Call \`messages.create()\` with the conversation so far.
2. Read \`response.stop_reason\`:
   - \`"end_turn"\` → done, return the assistant message.
   - \`"tool_use"\` → for each \`tool_use\` block in \`response.content\`, dispatch to your
     executor (screenshot the VM, click pixel coords, type a string, run bash, ...) and
     gather \`tool_result\` blocks.
3. Append \`response.content\` (assistant turn) and a new user message containing your
   \`tool_result\` blocks. Resend.

Production loops layer on:

- **Max-step cap.** A hard limit (e.g. 50 steps) so a confused model can't loop forever.
- **Screenshot dedup.** If two consecutive screenshots are pixel-identical (or hash-near),
  the agent is stuck — abort or escalate. Models will happily click the same disabled
  button 30 times in a row otherwise.
- **Allowlist.** Either at the tool-executor layer (don't click outside a coord range,
  don't run \`rm -rf\`) or via system prompt + sandbox isolation.
- **Idle/timeout.** Real UIs have loading states. Insert \`wait\` actions or detect
  spinners; don't act on a half-rendered page.
- **Human-in-the-loop checkpoints.** For destructive actions (submit, delete, send),
  break out of the loop and require an explicit confirmation before resuming.
`,
        },
        {
          kind: "code_comparison",
          label: "Naive loop vs. production loop",
          left: {
            title: "Naive — 'loop until done'",
            code: `messages = [{"role": "user", "content": task}]
while True:
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        tools=TOOLS,
        messages=messages,
        extra_headers={"anthropic-beta": BETA},
    )
    if resp.stop_reason == "end_turn":
        return resp
    messages.append({"role": "assistant", "content": resp.content})
    results = [run_tool(b) for b in resp.content
               if b.type == "tool_use"]
    messages.append({"role": "user", "content": results})`,
            annotation:
              "Works for a happy-path 5-step demo. Will silently run forever, drain your token budget, and accumulate hundreds of redundant screenshots on a real-world flow.",
          },
          right: {
            title: "Production — bounded, dedup'd, abortable",
            code: `MAX_STEPS = 50
SCREENSHOT_HASHES = []

for step in range(MAX_STEPS):
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        tools=TOOLS,
        messages=messages,
        extra_headers={"anthropic-beta": BETA},
    )
    if resp.stop_reason == "end_turn":
        return resp
    if resp.stop_reason not in {"tool_use"}:
        raise RuntimeError(f"unexpected stop_reason {resp.stop_reason}")

    messages.append({"role": "assistant", "content": resp.content})
    results = []
    for block in resp.content:
        if block.type != "tool_use":
            continue
        result = run_tool(block)        # raises on policy violation
        if _is_screenshot(block):
            h = phash(result.image)
            if SCREENSHOT_HASHES[-2:].count(h) >= 2:
                raise StuckError("3 identical screenshots in a row")
            SCREENSHOT_HASHES.append(h)
        results.append(result.as_block())
    messages.append({"role": "user", "content": results})

raise StepLimitExceeded(f"hit {MAX_STEPS} steps without end_turn")`,
            annotation:
              "Step cap + screenshot hash dedup + explicit stop_reason check + per-tool policy enforcement in `run_tool`. The dedup catches the 'clicking a disabled button forever' failure mode that's the #1 source of runaway bills.",
          },
          takeaway:
            "The loop logic is 20 lines; the guardrails around it are 80. Always cap steps, always dedup screenshots, always validate `stop_reason`. The most expensive computer-use bugs are operational, not model bugs.",
        },
        {
          kind: "scenario_predict",
          label: "What `stop_reason` should you see at each turn?",
          language: "text",
          scenario: `Task: "Open the HR app, navigate to Reports, download the monthly headcount CSV."

Turn 1 — model returns tool_use(screenshot).
Turn 2 — model returns tool_use(left_click, coords=(124, 488)) [clicks Reports].
Turn 3 — model returns tool_use(screenshot).
Turn 4 — model returns tool_use(left_click, coords=(870, 240)) [Download button].
Turn 5 — model returns "I've downloaded headcount_2025_04.csv to ~/Downloads. Done."`,
          question:
            "What are the `stop_reason` values for turns 1, 2, 3, 4, 5? And what does each one tell your loop to do?",
          answer: `Turns 1–4: \`stop_reason == "tool_use"\` (model wants you to execute the tool and resume). Turn 5: \`stop_reason == "end_turn"\` (no tool calls; final assistant message; loop exits). The loop **must** branch on \`stop_reason\` — relying on "did the response contain tool_use blocks?" misses edge cases like \`stop_reason == "max_tokens"\` (the model ran out mid-thought; you need to send an empty user message to continue) or \`stop_reason == "refusal"\` (the model declined; treat as terminal failure).`,
          explanation:
            "`stop_reason` is the *authoritative* loop-control field. Possible values: `end_turn`, `tool_use`, `max_tokens`, `stop_sequence`, `refusal`. Any value other than `tool_use` should exit or escalate, not just retry blindly.",
        },
        {
          kind: "mini_challenge",
          title: "Write a bounded, dedup'd loop runner",
          prompt: `Write a function \`run_agent(client, task, *, max_steps=50)\` that:

1. Initializes a conversation with the user's \`task\`.
2. Calls Messages, branches on \`stop_reason\`:
   - \`end_turn\` → return the final assistant text.
   - \`tool_use\` → dispatch each tool_use block to a stub \`execute_tool(block)\` (assume it exists and returns a \`tool_result\` block dict) and append results.
   - Anything else → raise \`AgentError(stop_reason)\`.
3. Caps at \`max_steps\` — raises \`StepLimitExceeded\` if exceeded.
4. **Detects stuck loops:** if three screenshot tool_results in a row are byte-identical, raise \`StuckError\`.

Assume \`client\`, \`TOOLS\`, and \`BETA_HEADER\` are in scope.`,
          hints: [
            "Loop over `range(max_steps)`. The default is fine; don't reach for `while True`.",
            "Branch on `stop_reason` *first*, then iterate `content` blocks. Don't iterate blocks if `stop_reason` is `end_turn`.",
            "For the screenshot-dedup check, keep a list of the last 3 screenshot bytes/hashes. The simplest version: `hashlib.sha256(image_bytes).hexdigest()`.",
            "`execute_tool` is a stub — assume it returns the right tool_result block shape, including the `image` content block for screenshots. Treat any block whose original tool_use action was `screenshot` as a screenshot result.",
          ],
          solution: `import hashlib

class AgentError(Exception): ...
class StepLimitExceeded(AgentError): ...
class StuckError(AgentError): ...


def run_agent(client, task, *, max_steps: int = 50) -> str:
    messages = [{"role": "user", "content": task}]
    recent_screenshot_hashes: list[str] = []

    for _step in range(max_steps):
        resp = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=4096,
            tools=TOOLS,
            messages=messages,
            extra_headers={"anthropic-beta": BETA_HEADER},
        )

        if resp.stop_reason == "end_turn":
            # Concatenate any text blocks in the final assistant message.
            return "".join(
                b.text for b in resp.content if b.type == "text"
            )

        if resp.stop_reason != "tool_use":
            raise AgentError(f"unexpected stop_reason: {resp.stop_reason}")

        # Append assistant turn (the tool_use blocks).
        messages.append({"role": "assistant", "content": resp.content})

        results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            result_block = execute_tool(block)  # returns a tool_result dict
            results.append(result_block)

            # Stuck detection: hash screenshot bytes from screenshot actions.
            if (
                block.name == "computer"
                and block.input.get("action") == "screenshot"
            ):
                img = _extract_image_bytes(result_block)
                h = hashlib.sha256(img).hexdigest()
                recent_screenshot_hashes.append(h)
                recent = recent_screenshot_hashes[-3:]
                if len(recent) == 3 and len(set(recent)) == 1:
                    raise StuckError("3 identical screenshots in a row")

        messages.append({"role": "user", "content": results})

    raise StepLimitExceeded(f"reached {max_steps} steps without end_turn")


def _extract_image_bytes(tool_result_block: dict) -> bytes:
    # Pull the base64-encoded PNG out of the first image block.
    import base64
    for c in tool_result_block.get("content", []):
        if c.get("type") == "image":
            return base64.b64decode(c["source"]["data"])
    return b""`,
          takeaway:
            "Every computer-use loop in production has these three guardrails: **step cap, screenshot dedup, stop_reason validation**. The agent loop itself is ~15 lines; the guardrails are the rest. Without them, a confused model will burn through your token budget on an infinite click-loop.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 4 — Sandboxing, latency, and when to use it
    // ---------------------------------------------------------------
    {
      title: "Sandboxing, latency, and when to actually use it",
      blocks: [
        {
          kind: "key_insight",
          label: "Sandboxing is your problem, not Anthropic's",
          insight: `Anthropic doesn't run a VM for you. **You** stand up an isolated environment — typically a Docker container with Xvfb + a VNC server, or a remote-desktop service — and you screenshot it and execute clicks against it. Anthropic just sees the screenshot bytes you upload and emits tool_use blocks. This means **blast-radius control is entirely on you**: network isolation, ephemeral filesystem, no access to prod credentials, no shared volumes, ideally one-VM-per-session. Treat the sandbox like you'd treat any code-execution environment.`,
        },
        {
          kind: "prose",
          markdown: `
**Latency profile to memorize before any customer call:**

- Per step: ~5–20 seconds (screenshot encode + upload + model reasoning + action).
- 10-step workflow: ~1–3 minutes wall-clock.
- 50-step workflow (e.g., legacy ERP report extraction): ~5–15 minutes.

**Cost profile:**

- Each screenshot is ~1500–3000 image input tokens depending on display resolution.
- The conversation grows monotonically — every prior screenshot is re-sent on the next
  turn. After 20 screenshots you're sending ~30–60k tokens *per request*.
- Aggressive trimming (drop older screenshots, keep only the last N) cuts this by 10×
  but the model loses long-range visual memory of where it has been.

**When computer use beats the alternatives:**

| Alternative           | Computer use wins when…                                                       |
|-----------------------|-------------------------------------------------------------------------------|
| **Direct API call**   | No API exists, or API exists but is undocumented / requires legal approval. |
| **Selenium / Playwright** | UI changes weekly; you can't maintain selectors; the app is non-web (Citrix/legacy desktop). |
| **RPA tools (UiPath, etc.)** | The workflow has natural-language branching ("if the totals don't reconcile, do X"); RPA can't read intent. |
| **Hire an offshore team** | You need on-demand bursts, not steady-state throughput, and the data is sensitive. |

**When computer use loses:**

- The app *has* an API — use it. Even a clunky REST API is ~100× cheaper and faster.
- Throughput requirement > a few hundred runs/day — latency and cost dominate.
- Strict SLA on completion time — agentic loops are inherently variable-time.
- Workflow is fully deterministic and stable — write Playwright once, it'll outlast you.
`,
        },
        {
          kind: "multiple_choice",
          title: "Pick the right automation tool for the customer",
          prompt:
            "An enterprise customer says: *'We have an internal legacy expense-reporting app (Java desktop, no API, UI changed twice last year). Our finance team manually re-keys ~200 expense reports per week into our new SAP system. Can your AI automate this?'* Which approach do you propose?",
          choices: [
            {
              text: "Standard Selenium/Playwright pipeline",
              correct: false,
              rationale:
                "Won't work — Selenium/Playwright drive *web browsers*, not Java desktop apps. Even if you used a desktop UI testing framework (e.g., WinAppDriver), the 'UI changed twice last year' fact kills selector-based automation: the maintenance burden is the bottleneck.",
            },
            {
              text: "Computer use agent with a sandboxed VM + careful guardrails",
              correct: true,
              rationale:
                "Strong fit: no API, non-web UI, churn-prone selectors, modest volume (~200/week = ~40/day = well inside latency budget), and the natural-language framing ('re-key with judgment') matches what the model is good at. Sandbox the Java app in a VM, write a system prompt with the 5–10 expense categories, add a human-in-the-loop checkpoint on submit.",
            },
            {
              text: "Direct API integration with SAP",
              correct: false,
              rationale:
                "Only handles half the problem — the *source* app has no API. You'd still be stuck on the legacy side. (You probably do integrate with SAP via API as the destination — but that's not 'the' answer here.)",
            },
            {
              text: "Hire an outsourced data-entry team",
              correct: false,
              rationale:
                "Often the right business answer for low-volume work, but the customer is asking for an AI solution and the volume is well-suited to computer use. Lead with the technical answer; mention outsourcing as a fallback if the agent fails on edge cases.",
            },
          ],
          explanation:
            "Computer use shines on the three-way intersection of (no API) + (UI churn that breaks Selenium) + (modest volume that fits the latency budget). Always ask 'is there an API?' first — but when there genuinely isn't one, this is the killer demo.",
        },
        {
          kind: "prose",
          markdown: `
**The pre-flight checklist when an FDE prospect asks for computer use:**

1. **Is there an API?** If yes, propose API integration first; computer use is plan B.
2. **What's the volume?** < ~1000 runs/day fits the latency/cost envelope. Above that, push back.
3. **What's the worst thing the agent could click?** Delete-all, send-to-customer, irrevocable financial action. Define the blast radius before the demo.
4. **Sandbox plan.** One VM per session, no shared creds, no prod network access, ephemeral disk. Who's running it?
5. **Step cap.** What's the max number of clicks for a successful run? Set the cap at 2× that.
6. **Screenshot trim policy.** Keep the last N screenshots in context (typically 5–10), summarize earlier ones in text. Prevents token blowup on long flows.
7. **Human-in-the-loop checkpoints.** Which actions require explicit confirmation? Build the pause/resume API before the agent goes live.
8. **Observability.** Log every tool_use and tool_result. The replay should be enough for a human to audit a failed run.
9. **Fallback.** What happens when the agent gives up (StuckError, StepLimitExceeded, refusal)? Queue for human review, don't silently drop.

If you can answer all nine on a whiteboard, you can propose a computer-use solution.
`,
        },
      ],
    },
  ],
};
