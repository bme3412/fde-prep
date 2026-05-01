import type { StudyGuide } from "../guide-types";

export const messagesApiGuide: StudyGuide = {
  topicTitle: "Messages API & structured output",
  topicSlug: "messages-api-structured-output",
  sections: [
    // ================================================================
    // 1. Your first API call
    // ================================================================
    {
      title: "Your first API call",
      blocks: [
        {
          kind: "prose",
          markdown: `The Anthropic Python SDK gives you one main method: \`client.messages.create()\`. You give it a model name, a max token count, and a list of messages. It returns a response object.

Let's start with the simplest possible call:

\`\`\`python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "What is 2 + 2?"}
    ],
)
\`\`\`

Three required parameters. That's it. Let's look at what comes back:`,
        },
        {
          kind: "scenario_predict",
          label: "what does the response look like?",
          scenario: `{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "2 + 2 = 4."
    }
  ],
  "model": "claude-sonnet-4-5",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 14,
    "output_tokens": 11
  }
}`,
          language: "json",
          question:
            "Where in this JSON is the actual text of Claude's answer?",
          answer: 'content[0].text — it\'s "2 + 2 = 4."',
          explanation:
            "The response content is always a list of content blocks. For a simple text response, there's one block with type 'text'. In Python SDK you'd access it as message.content[0].text.",
        },
        {
          kind: "key_insight",
          label: "Content is always a list",
          insight: `Claude's response \`content\` is always a **list of blocks**, not a plain string. Even for a simple text answer, it's \`[{type: "text", text: "..."}]\`. This matters because when Claude uses tools, the content list can contain multiple blocks of different types.`,
        },
        {
          kind: "warm_up",
          title: "extracting the text",
          prompt:
            "You have a response stored in `message`. Write the Python expression to get the text of Claude's answer as a string.",
          answer: "message.content[0].text",
          explanation:
            "The SDK returns typed objects, so you access content as a list and grab the .text attribute of the first block.",
        },
      ],
    },

    // ================================================================
    // 2. The three required parameters
    // ================================================================
    {
      title: "The three required parameters",
      blocks: [
        {
          kind: "prose",
          markdown: `Every \`messages.create()\` call needs exactly three things:

**\`model\`** — which Claude model to use. Common choices:
- \`"claude-sonnet-4-5"\` — fast, cheap, good for most tasks
- \`"claude-opus-4"\` — most capable, more expensive

**\`max_tokens\`** — the maximum number of tokens Claude can generate in its response. One token is roughly 3/4 of a word. If Claude hits this limit, it stops mid-sentence and the \`stop_reason\` will be \`"max_tokens"\` instead of \`"end_turn"\`.

**\`messages\`** — a list of message dicts, each with a \`role\` ("user" or "assistant") and \`content\` (a string or list of content blocks).`,
        },
        {
          kind: "code_predict",
          label: "what happens when max_tokens is too low?",
          code: `import anthropic
client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=10,
    messages=[{"role": "user", "content": "Write a haiku about Python"}],
)

print(message.content[0].text)
print(message.stop_reason)`,
          output: `Sil\nmax_tokens`,
          explanation: `With max_tokens set to just 10, Claude can only generate about 10 tokens before being cut off. The response text is incomplete, and stop_reason is "max_tokens" instead of "end_turn". This tells you the response was truncated, not finished naturally.`,
        },
        {
          kind: "warm_up",
          title: "stop_reason check",
          prompt:
            'What are the two most common values of `stop_reason`, and what does each mean?',
          answer:
            '"end_turn" = Claude finished naturally. "max_tokens" = Claude was cut off by the token limit.',
          explanation:
            'A third value is "tool_use" — Claude wants to call a tool. We\'ll cover that later.',
        },
      ],
    },

    // ================================================================
    // 3. System prompts
    // ================================================================
    {
      title: "System prompts: setting the rules",
      blocks: [
        {
          kind: "prose",
          markdown: `A **system prompt** is an instruction that sets Claude's behavior for the entire conversation. It goes in a separate \`system\` parameter — not inside the \`messages\` list:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    system="You are a senior Python developer. Always include type hints in code examples. Keep explanations under 3 sentences.",
    messages=[
        {"role": "user", "content": "How do I read a JSON file?"}
    ],
)
\`\`\`

The system prompt is like a set of standing orders — Claude follows these instructions throughout the conversation without the user needing to repeat them.`,
        },
        {
          kind: "flashcard",
          context: "API design",
          front:
            "Where does the system prompt go in a messages.create() call?",
          back: 'In the `system` parameter — a separate top-level argument. NOT inside the `messages` list as a {"role": "system"} message.',
        },
        {
          kind: "warm_up",
          title: "system prompt placement",
          prompt:
            "True or false: You can put the system prompt inside the messages list as a message with role 'system'.",
          answer: "False",
          explanation:
            "The system prompt must go in the `system` parameter. The Anthropic API does not have a 'system' role in messages — only 'user' and 'assistant'. This is different from some other LLM APIs.",
        },
      ],
    },

    // ================================================================
    // 4. Multi-turn conversations
    // ================================================================
    {
      title: "Multi-turn conversations",
      blocks: [
        {
          kind: "prose",
          markdown: `The Messages API is **stateless** — it doesn't remember previous calls. To have a conversation, you send the entire history every time. Messages must alternate between "user" and "assistant" roles:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "What's the capital of France?"},
        {"role": "assistant", "content": "The capital of France is Paris."},
        {"role": "user", "content": "What's the population?"},
    ],
)
\`\`\`

Claude sees all three messages and understands that "What's the population?" refers to Paris.`,
        },
        {
          kind: "key_insight",
          label: "Stateless means you manage history",
          insight: `The API doesn't store your conversation. Every call includes the full message history. In practice, this means your application maintains a list of messages and appends to it after each turn:

1. Start with \`messages = []\`
2. Append the user message
3. Call the API with the full list
4. Append Claude's response as an assistant message
5. Repeat from step 2`,
        },
        {
          kind: "code_predict",
          label: "building a conversation loop",
          code: `import anthropic
client = anthropic.Anthropic()

messages = []
messages.append({"role": "user", "content": "Remember: my name is Alice"})

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    messages=messages,
)
messages.append({"role": "assistant", "content": response.content[0].text})

messages.append({"role": "user", "content": "What's my name?"})
response2 = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    messages=messages,
)
print(response2.content[0].text)`,
          output: `Your name is Alice.`,
          explanation: `The second API call includes all four messages (user, assistant, user again), so Claude can see the earlier context where the user said their name was Alice. If we'd only sent the last message, Claude wouldn't know the name.`,
        },
        {
          kind: "warm_up",
          title: "message ordering",
          prompt:
            "Messages must alternate between which two roles?",
          answer: '"user" and "assistant"',
          explanation:
            "The messages list must start with a user message and alternate: user, assistant, user, assistant, ... The last message is usually a user message (what you want Claude to respond to).",
        },
      ],
    },

    // ================================================================
    // 5. Prefilling: putting words in Claude's mouth
    // ================================================================
    {
      title: "Prefilling: putting words in Claude's mouth",
      blocks: [
        {
          kind: "prose",
          markdown: `You can end the messages list with a partial **assistant** message. Claude will continue from where you left off. This is called **prefilling** and it's powerful for controlling output format:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=100,
    messages=[
        {"role": "user", "content": "What's 2 + 2? Reply with just the number."},
        {"role": "assistant", "content": "The answer is: "},
    ],
)
# Claude continues from "The answer is: " → "4"
\`\`\`

This is especially useful for forcing Claude to start its response with specific text, like a JSON opening brace.`,
        },
        {
          kind: "code_predict",
          label: "forcing JSON output with prefill",
          code: `import anthropic
client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    messages=[
        {"role": "user", "content": "List 3 fruits as a JSON array"},
        {"role": "assistant", "content": "["},
    ],
)
full_response = "[" + message.content[0].text
print(full_response)`,
          output: `["apple", "banana", "cherry"]`,
          explanation: `We prefilled with "[" so Claude continues from there, producing valid JSON. We then prepend the "[" to get the complete response. Note: you won't always need this trick — the tool use pattern (covered later) is a more reliable way to get structured output.`,
        },
        {
          kind: "flashcard",
          context: "Multiple choice extraction",
          front: "You want Claude to respond with ONLY a letter grade (A, B, C, D, F). How do you use prefilling to guarantee a clean answer?",
          back: 'Prefill with {"role": "assistant", "content": "Grade: "} and set max_tokens=1. Claude will output just the letter.',
        },
      ],
    },

    // ================================================================
    // 6. Temperature and stop sequences
    // ================================================================
    {
      title: "Temperature and stop sequences",
      blocks: [
        {
          kind: "prose",
          markdown: `Two optional parameters that control Claude's output:

**\`temperature\`** (0.0 to 1.0, default 1.0) — controls randomness.
- \`0.0\` = deterministic, always picks the most likely next token. Best for coding, math, extraction.
- \`1.0\` = creative, samples more broadly. Good for brainstorming, creative writing.

**\`stop_sequences\`** — a list of strings. If Claude generates any of these strings, it stops immediately. Useful for structured extraction:

\`\`\`python
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=256,
    temperature=0.0,
    stop_sequences=["\\n\\n"],
    messages=[
        {"role": "user", "content": "Give me one fun fact about ants."}
    ],
)
\`\`\`

Here Claude stops after the first paragraph break. The \`stop_reason\` will be \`"end_turn"\` if Claude finishes naturally, or \`"stop_sequence"\` if it hit one of your stop strings.`,
        },
        {
          kind: "warm_up",
          title: "choosing temperature",
          prompt:
            "You're building a code generation tool that needs reliable, correct output. Should you use temperature 0.0 or 1.0?",
          answer: "0.0",
          explanation:
            "Temperature 0.0 makes Claude deterministic — it always picks the most likely token. For code generation and factual tasks, this gives more consistent, reliable results.",
        },
        {
          kind: "flashcard",
          context: "Stop reasons",
          front:
            "What are all the possible values of stop_reason?",
          back: '"end_turn" (finished naturally), "max_tokens" (hit the limit), "stop_sequence" (hit a stop string), "tool_use" (wants to call a tool).',
        },
      ],
    },

    // ================================================================
    // 7. The response object
    // ================================================================
    {
      title: "The response object: what comes back",
      blocks: [
        {
          kind: "prose",
          markdown: `Let's map out every field in the response so there are no surprises:`,
        },
        {
          kind: "method_ref",
          title: "Message response",
          importLine: "from anthropic.types import Message",
          methods: [
            {
              signature: "message.id",
              description:
                'Unique ID for this response (e.g. "msg_01XFD..."). Useful for logging and debugging.',
              returns: "str",
            },
            {
              signature: "message.content",
              description:
                'List of content blocks. Usually one TextBlock, but can include ToolUseBlock when Claude calls tools.',
              returns: "list[TextBlock | ToolUseBlock]",
            },
            {
              signature: "message.stop_reason",
              description:
                'Why Claude stopped generating. "end_turn", "max_tokens", "stop_sequence", or "tool_use".',
              returns: "str",
            },
            {
              signature: "message.usage.input_tokens",
              description:
                "How many tokens were in your prompt (messages + system). This is what you pay for on the input side.",
              returns: "int",
            },
            {
              signature: "message.usage.output_tokens",
              description:
                "How many tokens Claude generated. This is what you pay for on the output side.",
              returns: "int",
            },
            {
              signature: "message.model",
              description:
                "The model that handled the request. Confirms which model actually ran.",
              returns: "str",
            },
          ],
        },
        {
          kind: "warm_up",
          title: "token usage",
          prompt:
            "You sent a request with 100 input tokens and got 50 output tokens. Which costs more per-token for most Claude models — input or output?",
          answer: "Output",
          explanation:
            "Output tokens are more expensive than input tokens for all Claude models. That's why max_tokens matters — it caps both the length of the response and your cost.",
        },
      ],
    },

    // ================================================================
    // 8. Tool use: getting structured output
    // ================================================================
    {
      title: "Tool use: getting structured output",
      blocks: [
        {
          kind: "prose",
          markdown: `The most reliable way to get structured data from Claude is **tool use**. You define a "tool" with a JSON Schema describing the output shape you want. Claude will return data matching that schema.

Even if you don't plan to execute the tool — you're just using it to force structured output — this is the standard pattern:

\`\`\`python
import anthropic
import json

client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=[
        {
            "name": "extract_info",
            "description": "Extract structured info from text",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "city": {"type": "string"},
                },
                "required": ["name", "age", "city"],
            },
        }
    ],
    tool_choice={"type": "tool", "name": "extract_info"},
    messages=[
        {"role": "user", "content": "Alice is 30 and lives in NYC"}
    ],
)
\`\`\``,
        },
        {
          kind: "scenario_predict",
          label: "tool use response",
          scenario: `# What does message.content look like?
[
  ToolUseBlock(
    type="tool_use",
    id="toolu_01A09q90qw90lq917835lq9",
    name="extract_info",
    input={"name": "Alice", "age": 30, "city": "NYC"}
  )
]

# message.stop_reason is:
"tool_use"`,
          language: "python",
          question:
            "How do you get the extracted data as a Python dict?",
          answer: "message.content[0].input",
          explanation: `When Claude uses a tool, the content block is a ToolUseBlock instead of a TextBlock. The extracted data is in the .input field — already a Python dict matching your schema. The stop_reason is "tool_use" instead of "end_turn".`,
        },
        {
          kind: "key_insight",
          label: "tool_choice forces the format",
          insight: `The key parameter is \`tool_choice={"type": "tool", "name": "extract_info"}\`. This forces Claude to use that specific tool, guaranteeing you get structured output. Without it, Claude might decide to respond with plain text instead.

Three options for tool_choice:
- \`{"type": "auto"}\` — Claude decides whether to use a tool (default)
- \`{"type": "any"}\` — Claude must use one of the tools, its choice
- \`{"type": "tool", "name": "..."}\` — Claude must use this specific tool`,
        },
      ],
    },

    // ================================================================
    // 9. The tool-use loop
    // ================================================================
    {
      title: "The tool use loop: calling real functions",
      blocks: [
        {
          kind: "prose",
          markdown: `When tools represent real functions (like looking up a stock price or querying a database), you need a **loop**:

1. Send messages with tool definitions
2. Claude responds with a \`tool_use\` block (saying "call this function with these args")
3. You execute the function
4. You send the result back as a \`tool_result\` message
5. Claude uses the result to form its final answer

Here's the pattern:`,
        },
        {
          kind: "code_predict",
          label: "the agentic tool loop",
          code: `import anthropic, json
client = anthropic.Anthropic()

tools = [{
    "name": "get_weather",
    "description": "Get current weather for a city",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    },
}]

def get_weather(city: str) -> str:
    return json.dumps({"city": city, "temp_f": 72, "condition": "sunny"})

messages = [{"role": "user", "content": "What's the weather in SF?"}]

response = client.messages.create(
    model="claude-sonnet-4-5", max_tokens=1024,
    tools=tools, messages=messages,
)

# Check if Claude wants to use a tool
if response.stop_reason == "tool_use":
    tool_block = response.content[-1]  # the ToolUseBlock
    result = get_weather(**tool_block.input)

    # Send the result back
    messages.append({"role": "assistant", "content": response.content})
    messages.append({
        "role": "user",
        "content": [{
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": result,
        }],
    })

    final = client.messages.create(
        model="claude-sonnet-4-5", max_tokens=1024,
        tools=tools, messages=messages,
    )
    print(final.content[0].text)`,
          output: `The weather in San Francisco is currently sunny with a temperature of 72°F.`,
          explanation: `The loop: (1) Claude sees the tools and the user question. (2) Instead of answering directly, it returns a tool_use block asking to call get_weather with {"city": "SF"}. (3) We execute the function and get the weather data. (4) We send the result back as a tool_result. (5) Claude reads the result and writes a human-friendly answer.`,
        },
        {
          kind: "warm_up",
          title: "tool_result format",
          prompt:
            'When sending a tool result back, what field links the result to the original tool call?',
          answer: "tool_use_id",
          explanation:
            'Each tool_use block has a unique id. The tool_result must include the same id in "tool_use_id" so Claude knows which call this result is for.',
        },
      ],
    },

    // ================================================================
    // 10. API quick reference
    // ================================================================
    {
      title: "API quick reference",
      blocks: [
        {
          kind: "prose",
          markdown: `All the parameters for \`client.messages.create()\` in one place:`,
        },
        {
          kind: "method_ref",
          title: "messages.create()",
          importLine: "import anthropic",
          methods: [
            {
              signature: "model (required)",
              description:
                'Which Claude model to use. e.g. "claude-sonnet-4-5", "claude-opus-4".',
              returns: "str",
            },
            {
              signature: "max_tokens (required)",
              description:
                "Maximum tokens Claude can generate. If hit, stop_reason is 'max_tokens'.",
              returns: "int",
            },
            {
              signature: "messages (required)",
              description:
                'List of message dicts with "role" (user/assistant) and "content" (str or list of blocks). Must alternate roles.',
              returns: "list[dict]",
            },
            {
              signature: "system",
              description:
                "System prompt — standing instructions for Claude's behavior.",
              returns: "str (optional)",
            },
            {
              signature: "temperature",
              description:
                "Randomness (0.0 = deterministic, 1.0 = creative). Default 1.0.",
              returns: "float (optional)",
            },
            {
              signature: "stop_sequences",
              description:
                "List of strings that make Claude stop early if generated.",
              returns: "list[str] (optional)",
            },
            {
              signature: "tools",
              description:
                "List of tool definitions with name, description, and input_schema.",
              returns: "list[dict] (optional)",
            },
            {
              signature: "tool_choice",
              description:
                'Control tool usage: {"type": "auto"}, {"type": "any"}, or {"type": "tool", "name": "..."}.',
              returns: "dict (optional)",
            },
            {
              signature: "stream",
              description:
                "Set to True for streaming responses. Returns an iterable of events instead of a complete message.",
              returns: "bool (optional)",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 11. When to use what
    // ================================================================
    {
      title: "When to use what",
      blocks: [
        {
          kind: "prose",
          markdown: `You've seen the full API surface. Now test your instincts — for each scenario, decide which parameter or pattern to reach for:`,
        },
        {
          kind: "flashcard",
          context: "You need consistent JSON output",
          front:
            "You want Claude to always return a specific JSON structure with name, age, and email fields.",
          back: "Define a tool with the JSON schema and use tool_choice to force it. This guarantees the shape of the output.",
        },
        {
          kind: "flashcard",
          context: "Building a chatbot",
          front:
            "Your app has a back-and-forth conversation. How do you maintain context across turns?",
          back: "Maintain a messages list in your app. After each API call, append Claude's response as an assistant message. Send the full list on every call.",
        },
        {
          kind: "flashcard",
          context: "Code generation",
          front:
            "You want Claude to write deterministic, reliable code — not creative variations each time.",
          back: "Set temperature=0.0. This makes Claude always pick the most likely token, giving consistent output.",
        },
        {
          kind: "flashcard",
          context: "Extracting a single value",
          front:
            "You want Claude to answer a multiple-choice question with just the letter (A, B, C, or D).",
          back: 'Prefill with {"role": "assistant", "content": "The answer is ("} and set max_tokens=1. Claude outputs just the letter.',
        },
        {
          kind: "flashcard",
          context: "Setting behavior rules",
          front:
            "You want Claude to always respond in French and keep answers under 100 words.",
          back: 'Put it in the system parameter: system="Always respond in French. Keep answers under 100 words." Don\'t put it in the messages list.',
        },
        {
          kind: "flashcard",
          context: "Truncated responses",
          front:
            'Your API call returns a response where stop_reason is "max_tokens". What happened and how do you fix it?',
          back: "Claude hit the max_tokens limit and was cut off mid-response. Increase the max_tokens parameter to allow a longer response.",
        },
      ],
    },

    // ================================================================
    // 12. Warm-up: build a classifier
    // ================================================================
    {
      title: "Warm-up: build a sentiment classifier",
      blocks: [
        {
          kind: "prose",
          markdown: `Let's combine what you've learned. This uses system prompts, temperature, and tool use to build a reliable classifier.`,
        },
        {
          kind: "mini_challenge",
          title: "Sentiment classifier",
          prompt: `Build a function that takes a product review string and returns structured output with:
- \`sentiment\`: one of "positive", "negative", or "neutral"
- \`confidence\`: a float from 0.0 to 1.0
- \`summary\`: a one-sentence summary

Use tool use to guarantee the output format. Use temperature=0.0 for consistency.

\`\`\`python
# Should work like this:
result = classify_sentiment("This product is amazing! Best purchase I've ever made.")
print(result)
# {"sentiment": "positive", "confidence": 0.95, "summary": "Customer is highly satisfied with their purchase."}
\`\`\``,
          hints: [
            "Define a tool called 'classify' with an input_schema that has the three fields (sentiment as enum, confidence as number, summary as string).",
            "Use tool_choice={\"type\": \"tool\", \"name\": \"classify\"} to force the tool call. The result is in message.content[0].input.",
          ],
          solution: `import anthropic

client = anthropic.Anthropic()

def classify_sentiment(review: str) -> dict:
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=256,
        temperature=0.0,
        system="You are a sentiment analysis tool. Classify the given review.",
        tools=[{
            "name": "classify",
            "description": "Classify the sentiment of a product review",
            "input_schema": {
                "type": "object",
                "properties": {
                    "sentiment": {
                        "type": "string",
                        "enum": ["positive", "negative", "neutral"],
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Confidence score from 0.0 to 1.0",
                    },
                    "summary": {
                        "type": "string",
                        "description": "One-sentence summary of the review",
                    },
                },
                "required": ["sentiment", "confidence", "summary"],
            },
        }],
        tool_choice={"type": "tool", "name": "classify"},
        messages=[{"role": "user", "content": review}],
    )
    return message.content[0].input

result = classify_sentiment("This product is amazing! Best purchase I've ever made.")
print(result)`,
          takeaway:
            "This pattern — tool definition + tool_choice to force it + temperature=0.0 — is the standard way to build reliable extractors and classifiers with Claude.",
        },
      ],
    },

    // ================================================================
    // 13. Challenge: multi-turn tool agent
    // ================================================================
    {
      title: "Challenge: multi-turn tool agent",
      blocks: [
        {
          kind: "prose",
          markdown: `Now build a more complete agent. This combines multi-turn conversations with the tool loop pattern.`,
        },
        {
          kind: "mini_challenge",
          title: "Lookup agent",
          prompt: `Build a function \`ask_agent(question)\` that:

1. Defines two tools: \`lookup_stock_price(ticker)\` and \`lookup_exchange_rate(from_currency, to_currency)\`
2. Sends the user's question to Claude with both tools
3. If Claude wants to use a tool, executes it and sends the result back
4. Returns Claude's final text answer

The tool implementations can return fake data — the point is getting the loop right.

\`\`\`python
print(ask_agent("What's AAPL's stock price in euros?"))
# Claude should call lookup_stock_price("AAPL"), then lookup_exchange_rate("USD", "EUR"),
# then combine the results into a final answer.
\`\`\``,
          hints: [
            "You need a while loop that keeps calling the API as long as stop_reason is 'tool_use'. Claude may need multiple tool calls to answer one question.",
            "After each tool call, append the assistant response and the tool_result to the messages list, then call the API again.",
          ],
          solution: `import anthropic, json
client = anthropic.Anthropic()

tools = [
    {
        "name": "lookup_stock_price",
        "description": "Get the current stock price for a ticker symbol",
        "input_schema": {
            "type": "object",
            "properties": {"ticker": {"type": "string"}},
            "required": ["ticker"],
        },
    },
    {
        "name": "lookup_exchange_rate",
        "description": "Get exchange rate between two currencies",
        "input_schema": {
            "type": "object",
            "properties": {
                "from_currency": {"type": "string"},
                "to_currency": {"type": "string"},
            },
            "required": ["from_currency", "to_currency"],
        },
    },
]

def execute_tool(name: str, args: dict) -> str:
    if name == "lookup_stock_price":
        return json.dumps({"ticker": args["ticker"], "price": 195.50, "currency": "USD"})
    elif name == "lookup_exchange_rate":
        return json.dumps({"from": args["from_currency"], "to": args["to_currency"], "rate": 0.92})
    return json.dumps({"error": "Unknown tool"})

def ask_agent(question: str) -> str:
    messages = [{"role": "user", "content": question}]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1024,
            tools=tools, messages=messages,
        )

        if response.stop_reason == "end_turn":
            return response.content[0].text

        # Append assistant response
        messages.append({"role": "assistant", "content": response.content})

        # Process all tool calls in the response
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "user", "content": tool_results})

print(ask_agent("What's AAPL stock price in euros?"))`,
          takeaway:
            "The while loop keeps going until stop_reason is 'end_turn'. This handles multi-step tool chains where Claude needs to call several tools before it has enough information to answer. This is the core of every agentic application.",
        },
      ],
    },

    // ================================================================
    // 14. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now know:

- The three required parameters: \`model\`, \`max_tokens\`, \`messages\`
- How to use \`system\` prompts for persistent instructions
- Multi-turn conversations by managing a messages list
- Prefilling to control output format
- \`temperature\` and \`stop_sequences\` for fine-tuning behavior
- Tool use for guaranteed structured output
- The agentic tool loop for calling real functions

Next steps:
- **Streaming** — use \`client.messages.stream()\` for real-time responses
- **Prompt caching** — reduce latency and cost for repeated system prompts
- **Batch API** — process thousands of requests at 50% cost reduction`,
        },
      ],
    },
  ],
};
