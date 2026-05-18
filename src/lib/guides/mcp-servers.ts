import type { StudyGuide } from "../guide-types";

export const mcpServersGuide: StudyGuide = {
  topicTitle: "MCP servers",
  topicSlug: "mcp-servers",
  sections: [
    // ---------------------------------------------------------------
    // Section 1 — Mental model: MCP as a portable tool-use contract
    // ---------------------------------------------------------------
    {
      title: "Mental model: MCP as a portable tool-use contract",
      blocks: [
        {
          kind: "prose",
          markdown: `
**MCP (Model Context Protocol) is the "USB-C for AI tools."** It's an open protocol
that lets any MCP-capable client — Claude Desktop, Claude Code, Cursor, custom apps
built on the Anthropic API — discover and call tools, read resources, and use prompts
exposed by an MCP server you control.

The FDE-relevant pitch:

> *"Write the integration once. Every client gets it."*

Before MCP, every customer wanting to expose their internal Jira / Helpdesk / Snowflake
to Claude had to ship a custom tool-use schema inside their app and re-implement the
same plumbing for every UI. With MCP, you stand up a single server that wraps the
internal system, and any MCP-aware client connects to it the same way.

The architecture is a clean client–server split over JSON-RPC 2.0:

\`\`\`
┌─────────────────────┐         JSON-RPC          ┌─────────────────────┐
│  MCP Client         │ ◄──── (stdio / HTTP+SSE) ──► │  MCP Server         │
│  (Claude Desktop,   │                              │  (your code: wraps  │
│   Cursor, your app) │                              │   internal API/DB)  │
└─────────────────────┘                              └─────────────────────┘
        │                                                       │
        ▼                                                       ▼
   talks to Claude                                       talks to your
   via Messages API                                      customer's system
\`\`\`
`,
        },
        {
          kind: "key_insight",
          label: "The three MCP primitives",
          insight: `An MCP server exposes three kinds of things to its clients — keep them straight:

1. **Tools** — *callable* functions with JSON-schema parameters. Side-effectful or non-deterministic (e.g., \`create_ticket\`, \`search_tickets\`, \`run_query\`). This is the bucket that maps to Anthropic's tool-use feature.
2. **Resources** — *readable* data addressed by URI (e.g., \`ticket://1234\`, \`file:///etc/hosts\`). Cacheable, deterministic, GET-shaped. The client decides when to fetch them.
3. **Prompts** — *parameterized templates* the user (or client) can pick from a menu (e.g., "summarize this ticket," "draft a customer reply"). Reusable conversation starters, not auto-invoked.

If you find yourself debating "should this be a tool or a resource?" — ask: *does the model need to choose to call it (tool), or does the user/client know to fetch it (resource)?*`,
        },
        {
          kind: "flashcard",
          front:
            "Should this capability be a tool, a resource, or a prompt? — three quick cases.",
          back: `**Case A:** *"Look up ticket #1234 by ID."* → **Resource** (\`ticket://1234\`). Deterministic GET, URI-addressable, cacheable.

**Case B:** *"Search tickets matching a free-text query."* → **Tool** (\`search_tickets(query)\`). The model has to *decide* to call it with a constructed argument.

**Case C:** *"Daily standup summary"* template the user picks from a menu before chatting. → **Prompt** (parameterized template).

Rule of thumb: parameterized + model-invoked = **tool**; URI-addressable + client-invoked = **resource**; user-picked template = **prompt**.`,
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 2 — The three primitives in FastMCP
    // ---------------------------------------------------------------
    {
      title: "Defining tools, resources, and prompts in FastMCP",
      blocks: [
        {
          kind: "method_ref",
          title: "FastMCP decorators (Python `mcp` SDK)",
          importLine: "from mcp.server.fastmcp import FastMCP",
          methods: [
            {
              signature: "mcp = FastMCP(name)",
              description:
                "Create the server. `name` is what clients see in the picker (e.g., 'helpdesk'). Holds the registry of tools/resources/prompts.",
            },
            {
              signature: "@mcp.tool()",
              description:
                "Register a callable. Type hints + docstring become the JSON schema and description the client/model sees. Sync or async functions both work.",
            },
            {
              signature: '@mcp.resource("scheme://{var}")',
              description:
                "Register a readable resource. The URI template's `{var}` becomes a function parameter. Return value is the resource body (str, bytes, or list of content blocks).",
            },
            {
              signature: "@mcp.prompt()",
              description:
                "Register a parameterized template. Returns a list of `Message` objects (`UserMessage`, `AssistantMessage`) that the client injects into the conversation when the user picks the prompt.",
            },
            {
              signature: "mcp.run(transport='stdio')",
              description:
                "Start the server. `stdio` for local processes spawned by clients like Claude Desktop; `sse` or `streamable-http` for network-accessible servers.",
            },
          ],
        },
        {
          kind: "code_comparison",
          label: "Same capability as a tool vs. as a resource",
          left: {
            title: "As a tool — model-invoked",
            code: `from mcp.server.fastmcp import FastMCP

mcp = FastMCP("helpdesk")

@mcp.tool()
def get_ticket(ticket_id: int) -> dict:
    """Fetch a ticket by its numeric ID."""
    return _helpdesk_api.get(f"/tickets/{ticket_id}")

# Client/model picks this. Shows up in tools/list.
# Auto-called when the model decides it needs ticket data.`,
            annotation:
              "Picks up a JSON schema from type hints. The model can *decide* to call it mid-conversation. Side-effectful and parameter-rich tools belong here.",
          },
          right: {
            title: "As a resource — client-invoked",
            code: `@mcp.resource("ticket://{ticket_id}")
def ticket_resource(ticket_id: str) -> str:
    """A single ticket, addressed by its ID."""
    return json.dumps(_helpdesk_api.get(f"/tickets/{ticket_id}"))

# Shows up in resources/list. The client (or user)
# decides when to read \`ticket://1234\` and injects
# the body into context BEFORE the model sees it.`,
            annotation:
              "Deterministic, URI-addressable, cacheable. The user or client app chooses to load it — the model never picks it out of a list mid-conversation.",
          },
          takeaway:
            "Same backend call, two roles. Expose the **deterministic, ID-shaped** view as a resource (cheaper, cacheable, user-controlled). Expose the **fuzzy/decision-shaped** view (search, create, update) as a tool. Real servers usually have both for the same domain object.",
        },
        {
          kind: "scenario_predict",
          label: "What JSON schema does FastMCP generate from this signature?",
          language: "python",
          scenario: `@mcp.tool()
def search_tickets(
    query: str,
    status: str = "open",
    limit: int = 10,
) -> list[dict]:
    """Search helpdesk tickets matching \`query\`.

    Args:
        query: Free-text search across title + description.
        status: One of "open", "closed", "all". Defaults to "open".
        limit: Max results to return.
    """
    ...`,
          question:
            "What does the generated `tools/list` entry look like? Specifically: which fields are required, which have defaults, and where does the docstring end up?",
          answer: `Roughly:

\`\`\`json
{
  "name": "search_tickets",
  "description": "Search helpdesk tickets matching \`query\`.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":  { "type": "string", "description": "Free-text search across title + description." },
      "status": { "type": "string", "description": "One of \\"open\\", \\"closed\\", \\"all\\". Defaults to \\"open\\".", "default": "open" },
      "limit":  { "type": "integer", "description": "Max results to return.", "default": 10 }
    },
    "required": ["query"]
  }
}
\`\`\`

\`query\` is **required** (no default). \`status\` and \`limit\` are **optional** with defaults. The docstring's first line becomes \`description\`; the \`Args:\` section is parsed for per-parameter descriptions.`,
          explanation:
            "FastMCP's whole pitch is 'your Python signature *is* the schema.' Type hints → JSON types; defaults → optional fields; docstring → descriptions. This is also why missing or wrong type hints quietly break tool discoverability — the model can't infer what `def foo(x)` takes.",
        },
        {
          kind: "warm_up",
          title: "Pick the right primitive",
          prompt: `For each capability, pick **tool**, **resource**, or **prompt**:

1. *"Run a parameterized SQL query and return rows."*
2. *"Render the on-call schedule for this week as a markdown table."* (Fixed URL, no params from the model.)
3. *"Generate a daily standup template the user can pick from a menu."*
4. *"Create a new Jira issue with given title and description."*`,
          answer:
            "1. **Tool** (parameterized, model decides args). 2. **Resource** (deterministic, no model-chosen parameters). 3. **Prompt** (user-picked template). 4. **Tool** (side-effectful, parameterized).",
          explanation:
            "The pattern: **parameter-rich + model-invoked → tool**; **URI-addressable + client/user-invoked → resource**; **template-shaped + user-picked → prompt**. Most real servers ship a handful of each — don't force everything through the tool primitive just because it's the most familiar.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 3 — JSON-RPC wire format & lifecycle
    // ---------------------------------------------------------------
    {
      title: "JSON-RPC wire format and the server lifecycle",
      blocks: [
        {
          kind: "prose",
          markdown: `
**The wire format is JSON-RPC 2.0** over a transport (stdio or HTTP+SSE/streamable-HTTP).
You'll rarely write the raw JSON yourself — the SDK does it — but you need to recognize
it when debugging.

Three message types:

- **Request:** has \`id\`, \`method\`, \`params\`. Expects a response.
- **Response:** has the same \`id\`, plus either \`result\` or \`error\`.
- **Notification:** has \`method\` + \`params\` but no \`id\`. Fire-and-forget (used for things like \`notifications/initialized\`, \`notifications/resources/list_changed\`).

The handshake every MCP session starts with:

\`\`\`
Client → Server:   { "method": "initialize", "params": { protocolVersion, clientInfo, capabilities } }
Server → Client:   { "result": { protocolVersion, serverInfo, capabilities } }
Client → Server:   { "method": "notifications/initialized" }
   ↓
   (normal tools/list, tools/call, resources/read, etc. now allowed)
\`\`\`

Until \`notifications/initialized\` is sent, the client must not call regular methods.
This is the #1 source of "my server connects but the client doesn't see any tools" bugs
when writing a custom client — you skipped the second handshake step.
`,
        },
        {
          kind: "method_ref",
          title: "Key JSON-RPC methods to memorize",
          importLine: "JSON-RPC 2.0 over MCP",
          methods: [
            {
              signature: "initialize",
              description:
                "First call. Client announces protocol version + its capabilities; server replies with its capabilities (which primitives it supports). Always paired with a `notifications/initialized` notification from the client.",
            },
            {
              signature: "tools/list",
              description:
                "Returns the list of registered tools with their JSON schemas. The client typically passes these straight into the Messages API's `tools` parameter.",
            },
            {
              signature: "tools/call",
              description:
                "Invoke a tool. Params: `{ name, arguments }`. Response: `{ content: [{ type: 'text' | 'image' | ..., ... }], isError? }`.",
            },
            {
              signature: "resources/list",
              description:
                "Enumerate available resources (or resource templates, for URI patterns with variables).",
            },
            {
              signature: "resources/read",
              description:
                "Fetch one resource by URI. Returns `{ contents: [{ uri, mimeType, text|blob }] }`.",
            },
            {
              signature: "prompts/list & prompts/get",
              description:
                "Enumerate available prompts; fetch a parameterized prompt's expanded message list.",
            },
            {
              signature: "notifications/*",
              description:
                "One-way events: `initialized` (handshake), `resources/list_changed`, `tools/list_changed`, `progress`. No response expected.",
            },
          ],
        },
        {
          kind: "scenario_predict",
          label: "tools/call request → response shape",
          language: "json",
          scenario: `// Client → Server
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "search_tickets",
    "arguments": { "query": "VPN broken", "status": "open", "limit": 3 }
  }
}`,
          question:
            "What does the success response look like? What's the field name for the actual tool output, and what's the field that distinguishes an *application-level* error from a JSON-RPC protocol error?",
          answer: `Success response:

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 17,
  "result": {
    "content": [
      { "type": "text", "text": "[ {ticket 1041}, {ticket 1052}, {ticket 1077} ]" }
    ],
    "isError": false
  }
}
\`\`\`

The tool's output goes into **\`result.content\`** — always an array of content blocks (\`text\`, \`image\`, \`resource\`, etc.), even for a single text return. **\`result.isError: true\`** is how the server signals an application-level error (e.g., "ticket not found") *without* failing the JSON-RPC call itself. A JSON-RPC protocol error (malformed request, unknown method) uses the top-level \`error\` field instead of \`result\`.`,
          explanation:
            "Two distinct error channels confuse a lot of developers. Use top-level `error` *only* for protocol-level failures (bad method, bad params). Use `result.isError: true` for tool execution failures — the model needs to see the failure as a tool_result to react to it.",
        },
        {
          kind: "code_comparison",
          label: "stdio transport vs. HTTP+SSE transport — when to use which",
          left: {
            title: "stdio (local, spawned by client)",
            code: `# server.py
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("helpdesk")
# ... register tools ...
if __name__ == "__main__":
    mcp.run(transport="stdio")

# Claude Desktop config:
# {
#   "mcpServers": {
#     "helpdesk": {
#       "command": "python",
#       "args": ["/abs/path/to/server.py"],
#       "env": { "HELPDESK_TOKEN": "..." }
#     }
#   }
# }`,
            annotation:
              "Server runs as a subprocess of the client. Communication is JSON-RPC over stdin/stdout. Zero networking config — perfect for desktop clients, dev loops, and any 'this server only needs to talk to one client process' case.",
          },
          right: {
            title: "Streamable HTTP / SSE (network-accessible)",
            code: `# server.py
mcp = FastMCP("helpdesk")
# ... register tools ...
if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8080)

# Client points at the URL:
# {
#   "mcpServers": {
#     "helpdesk": {
#       "url": "https://mcp.acme.internal/helpdesk",
#       "headers": { "Authorization": "Bearer ..." }
#     }
#   }
# }`,
            annotation:
              "Server runs as a long-lived HTTP service. Used when multiple clients connect to one server (e.g., team-shared internal-tool server) or when the server can't run on the user's local machine (needs prod DB access, runs in K8s).",
          },
          takeaway:
            "Default to **stdio** for personal/dev/desktop scenarios — it's simpler, more secure, and has no networking surface. Move to **streamable-HTTP** when the server needs to be shared, when it needs prod-network access the user's laptop can't have, or when you want a single deployment target instead of N user installs.",
        },
      ],
    },

    // ---------------------------------------------------------------
    // Section 4 — Build & ship a Python MCP server
    // ---------------------------------------------------------------
    {
      title: "Build & ship a Python MCP server",
      blocks: [
        {
          kind: "prose",
          markdown: `
**The minimum-viable shipping path for a Python MCP server:**

1. \`pip install mcp\` (the official Python SDK, includes \`FastMCP\`).
2. Write a \`server.py\` that creates a \`FastMCP\` instance, registers tools/resources/prompts, and calls \`mcp.run(transport="stdio")\` at the bottom.
3. Test locally with the MCP Inspector: \`npx @modelcontextprotocol/inspector python server.py\`. This gives you a UI to call your tools without any client integration.
4. Wire into Claude Desktop by editing \`claude_desktop_config.json\` (path differs by OS — on macOS it's \`~/Library/Application Support/Claude/claude_desktop_config.json\`).
5. Restart Claude Desktop. The server shows up in the tool picker.

Production hardening beyond the MVP:

- **Auth:** stdio servers inherit the user's env (good for local secrets); HTTP servers need an auth header scheme (Bearer token, mTLS).
- **Error handling:** every tool should catch exceptions and return \`isError: true\` with a useful message — never let unhandled exceptions kill the server process.
- **Logging:** log to a file, **not** stdout (stdout is the JSON-RPC channel for stdio servers — writing to it corrupts the wire format).
- **Versioning:** pin the \`mcp\` package version, pin your tool schemas. Tool removal/rename breaks any client/user mid-session.
- **Observability:** structured logs of every \`tools/call\` (name, args, result-or-error, latency). The audit trail for "what did the agent do to our system?"
`,
        },
        {
          kind: "code_comparison",
          label: "Bare server vs. production server",
          left: {
            title: "Bare MVP — one tool, no error handling",
            code: `# server.py
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("helpdesk")

@mcp.tool()
def get_ticket(ticket_id: int) -> dict:
    """Fetch a ticket by ID."""
    r = httpx.get(f"https://helpdesk.internal/tickets/{ticket_id}")
    return r.json()

if __name__ == "__main__":
    mcp.run(transport="stdio")`,
            annotation:
              "Fine for a demo. Will crash the server on the first network error or 404 — and a crashed stdio server takes the whole MCP session down with it.",
          },
          right: {
            title: "Production — env config, errors, logging",
            code: `# server.py
import logging, os
import httpx
from mcp.server.fastmcp import FastMCP

# Log to a file — NEVER stdout (stdout is the JSON-RPC channel).
logging.basicConfig(
    filename=os.environ.get("HELPDESK_LOG", "/tmp/helpdesk-mcp.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("helpdesk")

BASE_URL = os.environ["HELPDESK_BASE_URL"]
TOKEN = os.environ["HELPDESK_TOKEN"]
mcp = FastMCP("helpdesk")

_client = httpx.Client(
    base_url=BASE_URL,
    headers={"Authorization": f"Bearer {TOKEN}"},
    timeout=10.0,
)

@mcp.tool()
def get_ticket(ticket_id: int) -> dict:
    """Fetch a ticket by its numeric ID."""
    try:
        r = _client.get(f"/tickets/{ticket_id}")
        r.raise_for_status()
        log.info("get_ticket id=%s ok", ticket_id)
        return r.json()
    except httpx.HTTPStatusError as e:
        log.warning("get_ticket id=%s http=%s", ticket_id, e.response.status_code)
        raise ValueError(f"ticket {ticket_id} not found") from e
    except httpx.HTTPError as e:
        log.exception("get_ticket id=%s transport error", ticket_id)
        raise RuntimeError(f"helpdesk transport error: {e}") from e

if __name__ == "__main__":
    mcp.run(transport="stdio")`,
            annotation:
              "Env-based config (no secrets in code), file-based logging (no stdout corruption), explicit error mapping (404 → ValueError, network → RuntimeError). FastMCP converts raised exceptions into `isError: true` tool_results — the model sees a useful message instead of a dropped session.",
          },
          takeaway:
            "Three things separate a demo MCP server from a production one: (1) **never write to stdout** on stdio transport, (2) catch and translate exceptions instead of letting them propagate, (3) put secrets in env vars and pull them at startup. Everything else is incremental polish.",
        },
        {
          kind: "mini_challenge",
          title: "Build the helpdesk MCP server",
          prompt: `Build a Python MCP server \`helpdesk_mcp\` that wraps a customer's internal helpdesk API. It must expose:

1. **Tool \`search_tickets(query: str, status: str = "open", limit: int = 10) -> list[dict]\`** — free-text search.
2. **Tool \`create_ticket(title: str, description: str, priority: str = "normal") -> dict\`** — creates a new ticket.
3. **Resource \`ticket://{ticket_id}\`** — read a single ticket by ID.
4. **Prompt \`summarize_ticket(ticket_id: str)\`** — returns a 2-message conversation starter that asks Claude to summarize the ticket.

Assume an HTTP client \`_api\` with methods \`.get(path)\`, \`.post(path, json=...)\` is in scope. Use FastMCP. Set up file logging. Run on stdio. Show the \`claude_desktop_config.json\` snippet at the bottom.`,
          hints: [
            "Use type hints + docstrings (with `Args:` sections) on every tool — that's how the schema gets generated.",
            "For the resource, the function parameter name must match the `{ticket_id}` in the URI template.",
            "For the prompt, return a list of `UserMessage` / `AssistantMessage` from `mcp.types`. The user message is the instruction; you don't need an assistant message.",
            "Log to a file path from an env var; do NOT log to stdout.",
          ],
          solution: `# helpdesk_mcp/server.py
import json, logging, os
from mcp.server.fastmcp import FastMCP
from mcp.types import TextContent
from mcp.server.fastmcp.prompts.base import UserMessage

logging.basicConfig(
    filename=os.environ.get("HELPDESK_LOG", "/tmp/helpdesk-mcp.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("helpdesk")

mcp = FastMCP("helpdesk")


# ── Tools ────────────────────────────────────────────────────────
@mcp.tool()
def search_tickets(
    query: str,
    status: str = "open",
    limit: int = 10,
) -> list[dict]:
    """Search helpdesk tickets by free text.

    Args:
        query: Free-text search across title + description.
        status: One of "open", "closed", "all". Defaults to "open".
        limit: Max results to return. Defaults to 10.
    """
    try:
        params = {"q": query, "status": status, "limit": limit}
        return _api.get("/tickets/search", params=params)
    except Exception as e:
        log.exception("search_tickets failed")
        raise ValueError(f"search failed: {e}") from e


@mcp.tool()
def create_ticket(
    title: str,
    description: str,
    priority: str = "normal",
) -> dict:
    """Create a new helpdesk ticket.

    Args:
        title: Short summary of the issue.
        description: Full description, may include reproduction steps.
        priority: One of "low", "normal", "high", "urgent". Defaults to "normal".
    """
    try:
        body = {"title": title, "description": description, "priority": priority}
        return _api.post("/tickets", json=body)
    except Exception as e:
        log.exception("create_ticket failed")
        raise ValueError(f"create failed: {e}") from e


# ── Resource ─────────────────────────────────────────────────────
@mcp.resource("ticket://{ticket_id}")
def ticket_resource(ticket_id: str) -> str:
    """A single ticket, addressed by its numeric ID."""
    return json.dumps(_api.get(f"/tickets/{ticket_id}"))


# ── Prompt ───────────────────────────────────────────────────────
@mcp.prompt()
def summarize_ticket(ticket_id: str) -> list[UserMessage]:
    """Ask Claude to summarize a specific ticket."""
    return [
        UserMessage(
            content=TextContent(
                type="text",
                text=(
                    f"Please read \`ticket://{ticket_id}\` and produce a 3-bullet "
                    "summary covering: (1) the reported problem, (2) what's been "
                    "tried so far, (3) the recommended next action."
                ),
            )
        )
    ]


if __name__ == "__main__":
    mcp.run(transport="stdio")


# claude_desktop_config.json snippet:
# {
#   "mcpServers": {
#     "helpdesk": {
#       "command": "python",
#       "args": ["/abs/path/to/helpdesk_mcp/server.py"],
#       "env": {
#         "HELPDESK_BASE_URL": "https://helpdesk.internal",
#         "HELPDESK_TOKEN": "tok_...",
#         "HELPDESK_LOG": "/tmp/helpdesk-mcp.log"
#       }
#     }
#   }
# }`,
          takeaway:
            "A real internal-tool MCP server is ~100 lines: a handful of tools, one or two resources, an optional prompt menu, file-based logging, and a config snippet. The pattern repeats verbatim for every customer system — once you've shipped one, the next one is a copy-paste.",
        },
        {
          kind: "key_insight",
          label: "Operational realities that bite",
          insight: `Four things to remember when an MCP server goes to production:

1. **Versioning is the customer's problem.** When you rename a tool or change its schema, every connected client breaks until the user restarts and re-syncs. Treat tool names + schemas as a public API and version them.
2. **stdout is sacred on stdio transport.** Any \`print()\` or library that writes to stdout corrupts the JSON-RPC stream. Use a file logger; pipe everything else to stderr.
3. **Auth is your job.** MCP itself has no built-in auth. stdio servers inherit the user's env (fine); HTTP servers need you to invent the auth layer (Bearer/mTLS/OAuth) — pick one and document it.
4. **The model sees \`isError: true\`, not your stack trace.** Every tool should translate exceptions into actionable messages. "Ticket not found" >> "httpx.HTTPStatusError: 404."`,
        },
      ],
    },
  ],
};
