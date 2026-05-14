/**
 * Python source for a minimal mock of the `anthropic` SDK, written into
 * Pyodide's in-memory filesystem at runtime so that tool-use snippets in
 * the study guide actually execute end-to-end without a real API key.
 *
 * This is a pedagogical mock. It implements just enough of the surface area
 * (`Anthropic().messages.create(...)` returning a `Message` with `.content`,
 * `.stop_reason`, `.usage`) for the tool-use loop guide's snippets to run.
 * Tool definitions, the `tool_choice` semantics, parallel tool calls, and
 * the loop terminator (`stop_reason == "end_turn"` once tool results arrive)
 * all behave like the real SDK. The model "reply" itself is rule-based.
 */
export const MOCK_ANTHROPIC_PY = String.raw`
"""Pedagogical mock of the anthropic SDK. Not for production use."""
import json
import re
import uuid


class _Usage:
    def __init__(self, input_tokens, output_tokens):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class TextBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text

    def __repr__(self):
        return f"TextBlock(type='text', text={self.text!r})"


class ToolUseBlock:
    def __init__(self, id, name, input):
        self.type = "tool_use"
        self.id = id
        self.name = name
        self.input = input

    def __repr__(self):
        return (
            f"ToolUseBlock(type='tool_use', id={self.id!r}, "
            f"name={self.name!r}, input={self.input!r})"
        )


class Message:
    def __init__(self, content, stop_reason, model, input_tokens, output_tokens):
        self.id = "msg_" + uuid.uuid4().hex[:24]
        self.content = content
        self.stop_reason = stop_reason
        self.model = model
        self.role = "assistant"
        self.type = "message"
        self.usage = _Usage(input_tokens, output_tokens)


def _last_user_text(messages):
    """Return the most recent user message's text (string content only)."""
    for m in reversed(messages):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                # If it is a list of tool_result blocks, return ""
                texts = [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"]
                return " ".join(texts)
    return ""


def _has_tool_results(messages):
    """True if the most recent message is a user turn carrying tool_result blocks."""
    if not messages:
        return False
    m = messages[-1]
    if m.get("role") != "user":
        return False
    c = m.get("content")
    if not isinstance(c, list):
        return False
    return any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)


def _summarize_tool_results(messages):
    """Build a plain-English summary string from the trailing tool_result blocks."""
    parts = []
    for b in messages[-1].get("content", []):
        if isinstance(b, dict) and b.get("type") == "tool_result":
            content = b.get("content", "")
            try:
                parsed = json.loads(content) if isinstance(content, str) else content
                parts.append(json.dumps(parsed))
            except Exception:
                parts.append(str(content))
    return " ".join(parts)


def _default_input_for_schema(schema, hint_text):
    """Synthesize a plausible input dict for a tool, given its JSON schema and
    the latest user message (used as a hint for value extraction)."""
    out = {}
    props = (schema or {}).get("properties", {}) if isinstance(schema, dict) else {}
    for name, spec in props.items():
        t = spec.get("type", "string")
        if t == "string":
            # Try to pull a plausible value out of the user text
            if "city" in name.lower():
                m = re.search(r"\b(?:in|for|at)\s+([A-Z][A-Za-z .]+)", hint_text)
                out[name] = m.group(1).strip() if m else "San Francisco"
            elif "ticker" in name.lower() or "symbol" in name.lower():
                m = re.search(r"\b([A-Z]{2,5})\b", hint_text)
                out[name] = m.group(1) if m else "AAPL"
            elif "from_currency" in name.lower():
                out[name] = "USD"
            elif "to_currency" in name.lower():
                m = re.search(r"\b(EUR|GBP|JPY|CAD|AUD)\b", hint_text.upper())
                out[name] = m.group(1) if m else "EUR"
            elif "query" in name.lower():
                out[name] = hint_text[:80] or "claude tool use"
            elif "doc_id" in name.lower() or "id" in name.lower():
                out[name] = "doc-1"
            else:
                out[name] = "value"
        elif t in ("integer", "number"):
            out[name] = 1
        elif t == "boolean":
            out[name] = True
        elif t == "array":
            out[name] = []
        else:
            out[name] = None
    return out


def _which_tools_to_call(tools, hint_text):
    """Return a list of tool names the mock should invoke based on user text.
    If the user text mentions multiple recognizable concepts, return multiple
    tool names so the snippet can exercise parallel tool calls."""
    if not tools:
        return []
    names = [t["name"] for t in tools]
    chosen = []
    lower = hint_text.lower()
    # Keyword → tool-name fragment matches (best-effort).
    keyword_map = [
        ("weather", "weather"),
        ("stock", "stock"),
        ("price", "stock"),
        ("ticker", "stock"),
        ("exchange", "exchange"),
        ("euro", "exchange"),
        ("currency", "exchange"),
        ("search", "search"),
        ("find", "search"),
        ("read", "read"),
        ("open", "read"),
    ]
    for kw, frag in keyword_map:
        if kw in lower:
            for n in names:
                if frag in n.lower() and n not in chosen:
                    chosen.append(n)
    if not chosen:
        chosen.append(names[0])
    return chosen


class _Messages:
    def create(
        self,
        model,
        max_tokens,
        messages,
        system=None,
        tools=None,
        tool_choice=None,
        temperature=None,
        stop_sequences=None,
        **kwargs,
    ):
        # 1. If the user just sent tool_result blocks, terminate the loop.
        if _has_tool_results(messages):
            summary = _summarize_tool_results(messages)
            text = "Final answer based on tool results: " + summary
            return Message(
                content=[TextBlock(text)],
                stop_reason="end_turn",
                model=model,
                input_tokens=42,
                output_tokens=len(text) // 4 or 1,
            )

        hint = _last_user_text(messages)

        # 2. tool_choice forces a specific tool.
        if tool_choice and isinstance(tool_choice, dict):
            tc_type = tool_choice.get("type")
            if tc_type == "tool":
                forced = tool_choice.get("name")
                tool = next((t for t in (tools or []) if t["name"] == forced), None)
                if tool is not None:
                    args = _default_input_for_schema(tool.get("input_schema"), hint)
                    block = ToolUseBlock(
                        id="toolu_" + uuid.uuid4().hex[:22],
                        name=forced,
                        input=args,
                    )
                    return Message([block], "tool_use", model, 30, 20)
            elif tc_type == "any" and tools:
                tool = tools[0]
                args = _default_input_for_schema(tool.get("input_schema"), hint)
                block = ToolUseBlock(
                    id="toolu_" + uuid.uuid4().hex[:22],
                    name=tool["name"],
                    input=args,
                )
                return Message([block], "tool_use", model, 30, 20)

        # 3. If tools are available, invoke matching ones (possibly in parallel).
        if tools:
            chosen = _which_tools_to_call(tools, hint)
            blocks = []
            for name in chosen:
                tool = next(t for t in tools if t["name"] == name)
                args = _default_input_for_schema(tool.get("input_schema"), hint)
                blocks.append(
                    ToolUseBlock(
                        id="toolu_" + uuid.uuid4().hex[:22],
                        name=name,
                        input=args,
                    )
                )
            return Message(blocks, "tool_use", model, 30, 20 * len(blocks))

        # 4. Plain text reply (no tools defined).
        text = "Mock response to: " + (hint[:120] if hint else "(empty)")
        return Message([TextBlock(text)], "end_turn", model, 20, len(text) // 4 or 1)


class Anthropic:
    def __init__(self, api_key=None, **kwargs):
        self.api_key = api_key or "mock-key"
        self.messages = _Messages()
`;
