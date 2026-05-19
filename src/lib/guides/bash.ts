import type { StudyGuide } from "../guide-types";

export const bashGuide: StudyGuide = {
  topicTitle: "bash scripting & CLI fluency",
  topicSlug: "bash-scripting-cli-fluency",
  sections: [
    // ================================================================
    // 1. Why bash fluency matters
    // ================================================================
    {
      title: "Why bash fluency matters",
      blocks: [
        {
          kind: "prose",
          markdown: `As an FDE you will regularly SSH into customer machines, triage production issues, and chain together quick diagnostic commands under time pressure. You cannot afford to google every flag for \`grep\` or fumble through a \`for\` loop while a customer watches.

Bash fluency is about **speed and confidence**. The commands themselves are simple, but stringing them together — pipes, redirects, loops, conditionals, \`jq\`, \`curl\` — is what separates someone who *can* use a terminal from someone who *lives* in one.

Why bash specifically? Because it is **everywhere**. Every Linux server, every macOS machine, every Docker container, every CI/CD runner. Python might be more elegant, but bash is already installed, already running, and requires zero setup. When you SSH into a customer's production box at 2 AM, bash is what you have.

This guide is structured around the patterns you will actually use on the job:

- **Pipes & redirects** — chaining tools together
- **grep / sed / awk** — slicing through log files
- **find & xargs** — batch operations across file trees
- **Variables, loops, conditionals** — writing quick scripts
- **Command & process substitution** — capturing output inline
- **String manipulation** — parameter expansion patterns
- **jq & curl** — working with APIs from the terminal
- **Error handling & signals** — writing scripts that fail safely and clean up after themselves
- **Environment variables** — managing config and secrets

Every section has predict-the-output exercises. Cover the output, think, then check. That is the fastest path to fluency.`,
        },
      ],
    },

    // ================================================================
    // 2. Pipes & redirects: the core mental model
    // ================================================================
    {
      title: "Pipes & redirects: the core mental model",
      blocks: [
        {
          kind: "prose",
          markdown: `Every Unix process has three default streams:

| Stream | File descriptor | Default destination |
|--------|----------------|-------------------|
| **stdin**  | 0 | keyboard |
| **stdout** | 1 | terminal |
| **stderr** | 2 | terminal |

These are not abstractions — they are actual file descriptors that the operating system opens for every process. When you type a command and press Enter, the shell sets up these three connections before the program even starts running. The program has no idea whether its output is going to a terminal, a file, or another program. It just writes to file descriptor 1.

The **pipe** (\`|\`) connects the stdout of one command to the stdin of the next. The **redirect** (\`>\`, \`>>\`, \`2>\`) sends a stream to a file instead of the terminal.

Think of it physically: every program is a box with an "in" hole (fd 0), an "out" hole (fd 1), and an "error" hole (fd 2). A pipe is a tube connecting one box's "out" to the next box's "in." A redirect plugs a file into one of those holes instead of the default terminal. The program inside the box neither knows nor cares what is on the other end of those holes.

This is the Unix philosophy in action: small tools that each do one thing, composed via pipes. \`grep\` does not know how to count lines — that is \`wc\`'s job. \`sort\` does not know how to deduplicate — that is \`uniq\`'s job. You compose them into pipelines that can do surprisingly powerful things with zero code.`,
        },
        {
          kind: "prose",
          markdown: `**How data flows through a pipeline**

Consider this pipeline: \`cat trades.csv | grep AAPL | sort -t, -k3 -rn | head -5\`

Here is exactly what happens:

1. The shell creates **three** processes and connects them with pipes before any of them start
2. \`cat\` reads \`trades.csv\` and writes every line to its stdout (fd 1)
3. \`grep AAPL\` reads from its stdin (connected to cat's stdout), filters lines, writes matches to its stdout
4. \`sort\` reads all of grep's output, sorts it, writes the sorted result to its stdout
5. \`head -5\` reads from sort's stdout, prints the first 5 lines, then exits

All four processes run **concurrently**. \`grep\` does not wait for \`cat\` to finish — it processes lines as they arrive. This is why pipes are fast even on huge files: data streams through the pipeline without ever being fully loaded into memory.`,
        },
        {
          kind: "code_predict",
          label: "piping three commands together",
          code: `# Given a file called server.log with these lines:
# 2024-01-15 INFO  Server started
# 2024-01-15 ERROR Connection refused
# 2024-01-15 INFO  Request handled
# 2024-01-15 ERROR Timeout expired
# 2024-01-15 ERROR Disk full

cat server.log | grep ERROR | wc -l`,
          output: `3`,
          explanation: `cat reads the file to stdout. grep ERROR filters to only lines containing "ERROR" (3 lines). wc -l counts those lines. Each pipe connects stdout of the left command to stdin of the right. Note: cat is unnecessary here — you can write grep ERROR server.log | wc -l instead. Using cat to start a pipe is a common anti-pattern called "useless use of cat."`,
        },
        {
          kind: "code_predict",
          label: "a real pipeline — top traded tickers",
          code: `# trades.csv contains:
# AAPL,150.25,1000,2024-01-15
# NVDA,480.50,500,2024-01-15
# AAPL,151.00,750,2024-01-15
# MSFT,380.20,200,2024-01-15
# NVDA,481.00,300,2024-01-15
# AAPL,149.75,1200,2024-01-15
# TSLA,245.00,400,2024-01-15

cut -d, -f1 trades.csv | sort | uniq -c | sort -rn`,
          output: `   3 AAPL
   2 NVDA
   1 TSLA
   1 MSFT`,
          explanation: `cut -d, -f1 extracts the first comma-delimited field (ticker). sort groups identical tickers together (required by uniq). uniq -c counts consecutive duplicates. sort -rn ranks by count, highest first. This pipeline answers "which stocks traded most frequently?" — a question you could write a Python script for, or solve in one line with pipes.`,
        },
        {
          kind: "code_comparison",
          label: "redirect operators",
          left: {
            title: "> (overwrite) vs >> (append)",
            code: `echo "first" > out.txt
echo "second" > out.txt
cat out.txt`,
            annotation: `Only "second" — the > overwrites the file each time.`,
          },
          right: {
            title: ">> (append)",
            code: `echo "first" > out.txt
echo "second" >> out.txt
cat out.txt`,
            annotation: `Both "first" and "second" — >> appends to the file.`,
          },
          takeaway: `Use > to create/overwrite, >> to append. Getting this wrong can destroy log files. A common pattern: use > to create a report header, then >> to append data rows.`,
        },
        {
          kind: "code_predict",
          label: "redirecting stderr",
          code: `# Redirect both stdout and stderr to the same file
ls /real/dir /fake/dir > output.txt 2>&1
cat output.txt`,
          output: `ls: /fake/dir: No such file or directory
/real/dir:
(contents of /real/dir)`,
          explanation: `2>&1 means "send file descriptor 2 (stderr) to wherever file descriptor 1 (stdout) is going." Since stdout is already redirected to output.txt, stderr goes there too. Without 2>&1, the error message would print to the terminal instead of the file. Order matters: > output.txt 2>&1 is correct. Writing 2>&1 > output.txt would send stderr to the terminal (where stdout originally pointed) and only stdout to the file.`,
        },
        {
          kind: "code_predict",
          label: "separating stdout and stderr into different files",
          code: `# Suppose we query a portfolio API that outputs data on stdout
# and warnings on stderr
# Simulating with a script:
{ echo "AAPL: +2.3%"; echo "NVDA: +5.1%"; echo "WARNING: stale data for TSLA" >&2; echo "MSFT: -0.4%"; } > gains.txt 2> warnings.txt

echo "=== gains.txt ==="
cat gains.txt
echo "=== warnings.txt ==="
cat warnings.txt`,
          output: `=== gains.txt ===
AAPL: +2.3%
NVDA: +5.1%
MSFT: -0.4%
=== warnings.txt ===
WARNING: stale data for TSLA`,
          explanation: `> gains.txt sends stdout (fd 1) to one file. 2> warnings.txt sends stderr (fd 2) to a different file. The >&2 in the script redirects that specific echo to stderr. This pattern is common in production: capture clean output in one file and errors/warnings in another so you can process them separately.`,
        },
        {
          kind: "code_predict",
          label: "tee: writing to a file AND the terminal",
          code: `echo "Hello World" | tee output.txt | wc -c`,
          output: `12`,
          explanation: `tee copies stdin to both a file AND stdout. Here "Hello World\\n" (12 bytes including the newline) is written to output.txt AND piped to wc -c. This is essential when you want to save output while also processing it further in the pipeline. Without tee, you would have to choose between redirecting to a file or piping. Named after a T-shaped pipe fitting that splits water flow into two directions.`,
        },
        {
          kind: "code_predict",
          label: "tee in a real pipeline — save intermediate results",
          code: `# trades.csv has: ticker,price,volume,date
# Save the filtered AAPL trades AND continue the pipeline
grep "AAPL" trades.csv | tee aapl_trades.csv | wc -l`,
          output: `3`,
          explanation: `grep filters to AAPL rows. tee saves those rows to aapl_trades.csv AND passes them through to wc -l for counting. This is extremely useful for debugging long pipelines: insert tee at any point to inspect what data looks like at that stage without breaking the pipeline.`,
        },
        {
          kind: "code_predict",
          label: "here-strings with <<<",
          code: `# Feed a string directly as stdin (no echo | needed)
grep -o "world" <<< "hello world"`,
          output: `world`,
          explanation: `<<< feeds a string to a command's stdin without needing echo and a pipe. It is cleaner and more efficient than echo "hello world" | grep -o "world". The -o flag makes grep print only the matching portion. Here-strings also work with variables: grep "AAPL" <<< "$PORTFOLIO" searches through the variable's content.`,
        },
        {
          kind: "code_predict",
          label: "/dev/null — the black hole",
          code: `# Suppress stdout, keep only stderr
ls /real/dir /fake/dir > /dev/null
echo "Exit code: $?"`,
          output: `ls: /fake/dir: No such file or directory
Exit code: 1`,
          explanation: `/dev/null is a special file that discards everything written to it. Redirecting stdout to /dev/null (> /dev/null) silences normal output while still showing errors on stderr. This is useful when you only care whether a command succeeded (check $?) or want to see only its errors. To silence everything: command > /dev/null 2>&1.`,
        },
        {
          kind: "key_insight",
          label: "Unix philosophy",
          insight: `Pipes are the glue of Unix. Each command does one small thing well (filter, transform, count, sort). You compose them into powerful pipelines. This is why \`grep | sort | uniq -c | sort -rn\` can replace a 50-line Python script.

The core building blocks: \`cat\` reads, \`grep\` filters, \`cut\` slices columns, \`sed\` transforms, \`awk\` extracts, \`sort\` orders, \`uniq\` deduplicates, \`wc\` counts, \`head\`/\`tail\` trims, \`tee\` duplicates. Learn these ten commands and you can build almost any text-processing pipeline.`,
        },
        {
          kind: "warm_up",
          title: "build a pipeline from scratch",
          prompt: `Given a file \`portfolio.csv\` with lines like \`AAPL,150.25,BUY\` and \`NVDA,480.50,SELL\`, write a one-liner that counts how many BUY orders there are.`,
          answer: `grep "BUY" portfolio.csv | wc -l`,
          explanation: `grep filters to lines containing "BUY", wc -l counts them. You could also use grep -c "BUY" portfolio.csv which combines both steps. For more precision, use grep ",BUY$" to match only the action column (avoiding false matches if "BUY" appeared in a ticker name).`,
        },
      ],
    },

    // ================================================================
    // 3. grep, sed, awk: the text processing trinity
    // ================================================================
    {
      title: "grep, sed, awk: the text processing trinity",
      blocks: [
        {
          kind: "prose",
          markdown: `These three commands handle 90% of text processing tasks in the terminal:

- **grep** — **search** for lines matching a pattern (\`grep\` = "Global Regular Expression Print")
- **sed** — **transform** text (substitutions, deletions) (\`sed\` = "Stream Editor")
- **awk** — **extract** and process columns/fields (\`awk\` = named after its creators: Aho, Weinberger, Kernighan)

The mental model: **grep filters rows, awk filters columns, sed transforms content.** When you need to find lines, use grep. When you need to pull specific fields from structured output, use awk. When you need to replace or delete text, use sed.

Master these and you can tear through any log file, CSV dump, or API output. In a real FDE scenario, you will often chain all three: grep to narrow down to relevant lines, awk to extract a specific field, sed to clean up the output.`,
        },
        {
          kind: "prose",
          markdown: `### grep deep dive

\`grep\` is the command you will use most often. It searches text line-by-line and prints lines that match a pattern. The pattern can be a literal string or a regular expression.

The flags you must know cold:

| Flag | What it does | Example |
|------|-------------|---------|
| **-i** | Case-insensitive | \`grep -i "error" log\` matches ERROR, Error, error |
| **-r** | Recursive (search directories) | \`grep -r "TODO" src/\` |
| **-n** | Show line numbers | \`grep -n "fail" log\` → \`42:connection failed\` |
| **-c** | Count matches (don't print them) | \`grep -c "ERROR" log\` → \`7\` |
| **-l** | Print only filenames with matches | \`grep -l "API_KEY" *.env\` |
| **-v** | Invert — print lines that do NOT match | \`grep -v "DEBUG" log\` |
| **-o** | Print only the matching part | \`grep -o "[0-9]\\\\+" log\` |
| **-A N** | Print N lines **after** each match | \`grep -A 3 "ERROR" log\` |
| **-B N** | Print N lines **before** each match | \`grep -B 2 "FATAL" log\` |
| **-E** | Extended regex (same as \`egrep\`) | \`grep -E "warn|error|fatal" log\` |

The most important combo for FDE work: \`grep -rn\` (recursive with line numbers). It is how you search an unfamiliar codebase from the terminal.`,
        },
        {
          kind: "code_predict",
          label: "grep flags you must know",
          code: `# app.log contains:
# Error: connection failed
# INFO: request handled
# error: timeout
# ERROR: disk full
# Info: startup complete

grep -i "error" app.log`,
          output: `Error: connection failed
error: timeout
ERROR: disk full`,
          explanation: `The -i flag makes grep case-insensitive, matching "Error", "error", and "ERROR". Without -i, only exact case matches would appear. This is essential when you don't know how a system formats its error messages.`,
        },
        {
          kind: "code_predict",
          label: "grep -c and grep -l",
          code: `# Three files in the current directory:
# api.log contains 2 lines with "ERROR"
# web.log contains 0 lines with "ERROR"
# worker.log contains 5 lines with "ERROR"

grep -c "ERROR" *.log
echo "---"
grep -l "ERROR" *.log`,
          output: `api.log:2
web.log:0
worker.log:5
---
api.log
worker.log`,
          explanation: `-c prints the count of matching lines per file. -l prints only the filenames that contain at least one match (web.log is excluded because it has 0 matches). Use -c when you need counts, -l when you just need to know which files are affected.`,
        },
        {
          kind: "code_predict",
          label: "grep -A and -B — context around matches",
          code: `# trading_errors.log contains:
# 2024-01-15 10:30:01 Processing order #1042
# 2024-01-15 10:30:01 Ticker: NVDA, Qty: 500, Price: 480.50
# 2024-01-15 10:30:02 ERROR: Insufficient funds for order #1042
# 2024-01-15 10:30:03 Rolling back transaction
# 2024-01-15 10:30:05 Processing order #1043

grep -B 2 "ERROR" trading_errors.log`,
          output: `2024-01-15 10:30:01 Processing order #1042
2024-01-15 10:30:01 Ticker: NVDA, Qty: 500, Price: 480.50
2024-01-15 10:30:02 ERROR: Insufficient funds for order #1042`,
          explanation: `-B 2 shows 2 lines BEFORE each match, giving you the context that led to the error. Here we can see the specific order (NVDA, 500 shares at $480.50) that triggered the insufficient funds error. -A works the same way but shows lines AFTER the match. Use -C N for N lines of context on BOTH sides.`,
        },
        {
          kind: "code_predict",
          label: "grep -E — extended regex for multiple patterns",
          code: `# market_feed.log contains:
# 10:30:01 AAPL price=150.25 volume=10000
# 10:30:01 NVDA price=480.50 volume=5000
# 10:30:02 MSFT price=380.20 volume=3000
# 10:30:02 TSLA price=245.00 volume=8000
# 10:30:03 GOOG price=140.50 volume=2000

grep -E "AAPL|NVDA|TSLA" market_feed.log`,
          output: `10:30:01 AAPL price=150.25 volume=10000
10:30:01 NVDA price=480.50 volume=5000
10:30:02 TSLA price=245.00 volume=8000`,
          explanation: `-E enables extended regular expressions. The | is the regex OR operator, so this matches lines containing AAPL OR NVDA OR TSLA. Without -E, you would need to escape the pipes: grep "AAPL\\|NVDA\\|TSLA". This is how you filter for a watchlist of tickers from a data feed.`,
        },
        {
          kind: "code_predict",
          label: "grep -r for recursive search",
          code: `# Directory structure:
# src/
#   main.py    (contains "TODO: fix auth")
#   utils.py   (contains "TODO: refactor")
#   tests/
#     test_main.py (contains "TODO: add test")

grep -rn "TODO" src/`,
          output: `src/main.py:1:TODO: fix auth
src/utils.py:1:TODO: refactor
src/tests/test_main.py:1:TODO: add test`,
          explanation: `-r searches recursively through directories. -n adds line numbers. This is one of the most common patterns for finding things in a codebase. When you first SSH into a customer's project, grep -rn is how you orient yourself.`,
        },
        {
          kind: "prose",
          markdown: `### sed deep dive

\`sed\` processes text line by line, applying transformations as data streams through it. The most common operation is substitution: \`s/old/new/\`.

Key sed patterns:

- \`sed 's/old/new/'\` — replace first occurrence on each line
- \`sed 's/old/new/g'\` — replace ALL occurrences on each line (**g** = global)
- \`sed '/pattern/d'\` — delete lines matching pattern
- \`sed -n '/pattern/p'\` — print ONLY lines matching pattern (like grep)
- \`sed '3,7d'\` — delete lines 3 through 7
- \`sed -i '' 's/old/new/g' file\` — edit file **in place** (macOS; Linux omits the \`''\`)

The \`s\` command structure: \`s/PATTERN/REPLACEMENT/FLAGS\`. The delimiter does not have to be \`/\` — you can use any character. This is useful when your pattern contains slashes: \`sed 's|/usr/local|/opt|g'\` is cleaner than escaping every slash.`,
        },
        {
          kind: "code_predict",
          label: "sed substitution — basic and global",
          code: `echo "AAPL AAPL AAPL" | sed 's/AAPL/NVDA/'
echo "---"
echo "AAPL AAPL AAPL" | sed 's/AAPL/NVDA/g'`,
          output: `NVDA AAPL AAPL
---
NVDA NVDA NVDA`,
          explanation: `Without the g flag, sed replaces only the FIRST occurrence on each line. With g, it replaces ALL occurrences. This is a common gotcha — forgetting g when you want to replace every instance. Think of g as "globally on this line."`,
        },
        {
          kind: "code_predict",
          label: "sed — transforming CSV data",
          code: `# portfolio.csv contains:
# AAPL,150.25,100,BUY
# NVDA,480.50,50,SELL
# MSFT,380.20,75,BUY

# Replace commas with tabs for readability
sed 's/,/\\t/g' portfolio.csv`,
          output: `AAPL	150.25	100	BUY
NVDA	480.50	50	SELL
MSFT	380.20	75	BUY`,
          explanation: `sed replaces every comma with a tab character (\\t), converting CSV to TSV. This is a quick way to make comma-separated data more readable in the terminal, or to prepare it for awk (which splits on whitespace by default). The g flag ensures ALL commas on each line are replaced.`,
        },
        {
          kind: "code_predict",
          label: "sed — delete lines matching a pattern",
          code: `# config.txt contains:
# host=localhost
# # This is a comment
# port=8080
# # Another comment
# debug=true

sed '/^#/d' config.txt`,
          output: `host=localhost
port=8080
debug=true`,
          explanation: `sed '/pattern/d' deletes lines matching the pattern. ^# matches lines starting with #. This is useful for stripping comments from config files. The original file is unchanged — sed outputs to stdout by default. To also strip blank lines: sed '/^#/d; /^$/d' config.txt.`,
        },
        {
          kind: "prose",
          markdown: `### awk deep dive

\`awk\` is the most powerful of the three. It is essentially a pattern-matching programming language designed for columnar data. Every line is automatically split into fields (\`$1\`, \`$2\`, etc.), and you can write conditions, loops, and even functions.

The basic structure of an awk program: \`pattern { action }\`

- If the pattern matches, the action runs. If no pattern is given, the action runs on every line.
- \`$0\` = the entire line, \`$1\` = first field, \`$2\` = second field, etc.
- \`NR\` = current line number, \`NF\` = number of fields on current line
- \`-F\` sets the field separator (default: whitespace)

Think of awk as a mini SQL engine for text files: \`awk -F',' '$4 == "BUY" {print $1, $3}'\` is like \`SELECT ticker, quantity FROM trades WHERE action = 'BUY'\`.`,
        },
        {
          kind: "code_predict",
          label: "awk column extraction",
          code: `# access.log contains:
# 192.168.1.1 GET /api/users 200 45ms
# 192.168.1.2 POST /api/login 401 12ms
# 192.168.1.1 GET /api/data 500 230ms

awk '{print $1, $4}' access.log`,
          output: `192.168.1.1 200
192.168.1.2 401
192.168.1.1 500`,
          explanation: `awk splits each line on whitespace by default. $1 is the first field (IP), $4 is the fourth (status code). $0 would be the entire line. This is the fastest way to extract columns from structured text.`,
        },
        {
          kind: "code_predict",
          label: "awk with -F for CSV — extracting stock data",
          code: `# trades.csv contains:
# AAPL,150.25,1000,BUY
# NVDA,480.50,500,SELL
# MSFT,380.20,200,BUY
# TSLA,245.00,400,SELL
# AAPL,151.00,750,BUY

awk -F',' '$4 == "BUY" {printf "%s: %s shares @ $%s\\n", $1, $3, $2}' trades.csv`,
          output: `AAPL: 1000 shares @ $150.25
MSFT: 200 shares @ $380.20
AAPL: 750 shares @ $151.00`,
          explanation: `-F',' sets the field separator to comma so awk correctly splits CSV columns. The condition $4 == "BUY" filters rows. printf gives formatted output. This is awk acting as a mini SQL query: SELECT ticker, quantity, price FROM trades WHERE action = 'BUY'.`,
        },
        {
          kind: "code_predict",
          label: "awk with conditions and built-in variables",
          code: `# access.log contains:
# 192.168.1.1 GET /api/users 200 45ms
# 192.168.1.2 POST /api/login 401 12ms
# 192.168.1.1 GET /api/data 500 230ms
# 192.168.1.3 GET /api/users 200 89ms

awk '$4 >= 400 {print $1, $2, $3, "->", $4}' access.log`,
          output: `192.168.1.2 POST /api/login -> 401
192.168.1.1 GET /api/data -> 500`,
          explanation: `awk can filter rows with conditions before the action block. $4 >= 400 matches only lines where the 4th field (status code) is 400 or higher. This is like a WHERE clause in SQL — awk is surprisingly powerful for structured data.`,
        },
        {
          kind: "code_predict",
          label: "awk with BEGIN/END — computing totals",
          code: `# trades.csv contains:
# AAPL,150.25,1000
# NVDA,480.50,500
# MSFT,380.20,200

awk -F',' '
  BEGIN { total = 0 }
  { cost = $2 * $3; total += cost; printf "%s: $%.2f\\n", $1, cost }
  END { printf "Total: $%.2f\\n", total }
' trades.csv`,
          output: `AAPL: $150250.00
NVDA: $240250.00
MSFT: $76040.00
Total: $466540.00`,
          explanation: `BEGIN runs once before any input is processed — used for initialization. The main block runs on every line — here it calculates cost (price * quantity) and accumulates a running total. END runs once after all input is processed — used for summaries. This is how awk computes aggregations like a spreadsheet.`,
        },
        {
          kind: "code_predict",
          label: "awk with NR and NF — line and field counts",
          code: `# portfolio.csv contains:
# ticker,price,shares,sector
# AAPL,150.25,1000,tech
# NVDA,480.50,500,tech
# JPM,175.30,300,finance

awk -F',' 'NR > 1 && $4 == "tech" {print NR": "$1, "$"$2}' portfolio.csv`,
          output: `2: AAPL $150.25
3: NVDA $480.50`,
          explanation: `NR is the current line number (1-indexed). NR > 1 skips the header row. $4 == "tech" filters to tech stocks. NR is printed as a line reference. NF (not used here) gives the number of fields on the current line — useful for detecting malformed rows: awk -F',' 'NF != 4' would find lines that don't have exactly 4 columns.`,
        },
        {
          kind: "prose",
          markdown: `### Chaining all three together

The real power comes from combining grep, awk, and sed in a pipeline. Each one handles what it does best:

1. **grep** narrows the dataset (fast — written in C, optimized for line matching)
2. **awk** extracts and computes on specific fields
3. **sed** cleans up the final output format

The classic "what is breaking most?" pipeline: \`grep ERROR log | awk '{print $4}' | sort | uniq -c | sort -rn\`

This is the equivalent of writing \`SELECT component, COUNT(*) FROM logs WHERE level = 'ERROR' GROUP BY component ORDER BY COUNT(*) DESC\` — but it runs on any text file with zero setup.`,
        },
        {
          kind: "code_predict",
          label: "chaining grep, awk, and sort together",
          code: `# server.log contains:
# 2024-01-15 10:00 ERROR [db] timeout after 5000ms
# 2024-01-15 10:01 INFO  [api] request completed
# 2024-01-15 10:02 ERROR [auth] invalid token
# 2024-01-15 10:03 ERROR [db] connection refused
# 2024-01-15 10:04 ERROR [auth] expired session
# 2024-01-15 10:05 ERROR [db] timeout after 3000ms

grep ERROR server.log | awk '{print $4}' | sort | uniq -c | sort -rn`,
          output: `   3 [db]
   2 [auth]`,
          explanation: `This is the classic "top N" pipeline. grep filters to error lines, awk extracts the component field, sort groups identical values together (required by uniq), uniq -c counts consecutive duplicates, and sort -rn ranks by count descending. This pattern answers "what is breaking the most?"`,
        },
        {
          kind: "code_predict",
          label: "full pipeline — analyzing trade volume by ticker",
          code: `# trades.csv contains (header + data):
# ticker,price,volume,action
# AAPL,150.25,1000,BUY
# NVDA,480.50,500,SELL
# AAPL,151.00,750,BUY
# MSFT,380.20,200,BUY
# NVDA,481.00,300,BUY
# AAPL,149.75,1200,SELL
# TSLA,245.00,400,SELL

# Total volume per ticker, sorted highest first
tail -n +2 trades.csv | awk -F',' '{vol[$1] += $3} END {for (t in vol) print vol[t], t}' | sort -rn`,
          output: `2950 AAPL
800 NVDA
400 TSLA
200 MSFT`,
          explanation: `tail -n +2 skips the header row. awk uses an associative array (vol) to accumulate volume by ticker — vol["AAPL"] += 1000, then += 750, then += 1200 = 2950. The END block iterates over the array and prints totals. sort -rn ranks by volume descending. This is GROUP BY + SUM + ORDER BY in one pipeline.`,
        },
        {
          kind: "code_predict",
          label: "grep + sed — cleaning up API output",
          code: `# api_response.log contains:
# {"model": "claude-sonnet-4-20250514", "tokens": 1024, "status": "ok"}
# {"model": "claude-sonnet-4-20250514", "tokens": 2048, "status": "error"}
# {"model": "claude-sonnet-4-20250514", "tokens": 512, "status": "ok"}
# {"model": "gpt-4", "tokens": 1500, "status": "error"}

grep '"status": "error"' api_response.log | sed 's/.*"model": "//; s/".*//'`,
          output: `claude-sonnet-4-20250514
gpt-4`,
          explanation: `grep filters to error responses. sed uses two commands separated by ; — the first strips everything up to and including "model": ", the second strips everything from the next " onward. This leaves just the model name. For real JSON, you should use jq, but this grep+sed approach works when you need a quick answer and the structure is predictable.`,
        },
        {
          kind: "key_insight",
          label: "grep filters rows, awk filters columns",
          insight: `Think of your data as a table. \`grep\` selects which **rows** to keep (like SQL WHERE). \`awk\` selects which **columns** to show (like SQL SELECT). \`sed\` transforms **cell values** (like SQL UPDATE).

Quick decision guide:
- "Show me lines containing X" → **grep**
- "Show me the 3rd column" → **awk**
- "Replace X with Y" → **sed**
- "Count occurrences of each X" → **sort | uniq -c**
- "Show me the top 10" → **sort -rn | head -10**

When you need to find lines with errors, extract the timestamp column, and reformat the date — that is grep | awk | sed.`,
        },
        {
          kind: "warm_up",
          title: "count errors in a log",
          prompt: `Write a one-liner that counts how many lines in \`app.log\` contain the word "ERROR" (case-sensitive).`,
          answer: `grep -c "ERROR" app.log`,
          explanation: `grep -c returns only the count. You could also do grep "ERROR" app.log | wc -l but -c is cleaner.`,
        },
        {
          kind: "warm_up",
          title: "extract buy-side tickers",
          prompt: `Given \`trades.csv\` with lines like \`AAPL,150.25,1000,BUY\`, write a one-liner that prints only the ticker symbols for BUY trades.`,
          answer: `grep "BUY" trades.csv | awk -F',' '{print $1}'`,
          explanation: `grep filters to BUY rows, then awk with -F',' splits on commas and prints the first field (ticker). You could also do this in pure awk: awk -F',' '$4 == "BUY" {print $1}' trades.csv — which is more precise since it checks only the action column.`,
        },
      ],
    },

    // ================================================================
    // 4. find & xargs: batch operations
    // ================================================================
    {
      title: "find & xargs: batch operations",
      blocks: [
        {
          kind: "prose",
          markdown: `\`find\` locates files by name, type, size, modification time, and other attributes. \`xargs\` takes a list of items (typically filenames) from stdin and passes them as arguments to another command. Together they let you perform batch operations across an entire directory tree.

Why not just use \`ls\` or shell globs? Globs like \`*.py\` only match in the current directory. \`find\` walks the entire tree recursively and supports filters that globs cannot express (modification time, file size, permissions). And unlike \`ls\`, \`find\` outputs clean paths suitable for piping to other commands.

The key pattern: **find locates, xargs acts**. Find produces a list of paths; xargs feeds that list to whatever command you need to run on them.`,
        },
        {
          kind: "prose",
          markdown: `### find — the file locator

\`find\` walks a directory tree and tests each file against your criteria. The syntax is: \`find <starting-path> <tests> <actions>\`

Essential tests:

| Test | What it matches | Example |
|------|----------------|---------|
| **-name "pattern"** | Filename matches glob | \`-name "*.csv"\` |
| **-iname "pattern"** | Filename matches (case-insensitive) | \`-iname "*.PDF"\` |
| **-type f** | Regular files only | (excludes directories, symlinks) |
| **-type d** | Directories only | (useful for permission fixes) |
| **-mtime -N** | Modified less than N days ago | \`-mtime -1\` = last 24 hours |
| **-mtime +N** | Modified more than N days ago | \`-mtime +30\` = older than 30 days |
| **-mmin -N** | Modified less than N minutes ago | \`-mmin -60\` = last hour |
| **-size +N** | Larger than N | \`-size +100M\`, \`-size +1G\` |
| **-empty** | Zero-size files or empty dirs | useful for cleanup |
| **-maxdepth N** | Don't descend more than N levels | \`-maxdepth 1\` = current dir only |
| **-not** / **!** | Negate a test | \`-not -name "*.pyc"\` |

Multiple tests are AND'd by default. Use \`-o\` for OR: \`find . -name "*.csv" -o -name "*.tsv"\`

Built-in actions: \`-print\` (default), \`-delete\`, \`-exec command {} \\;\`, \`-print0\``,
        },
        {
          kind: "code_predict",
          label: "find basics",
          code: `# Directory structure:
# project/
#   app.py
#   utils.py
#   data/
#     input.csv
#     output.csv
#   tests/
#     test_app.py

find project/ -name "*.py" -type f`,
          output: `project/app.py
project/utils.py
project/tests/test_app.py`,
          explanation: `-name "*.py" matches files ending in .py. -type f restricts to regular files (not directories). find recursively walks the directory tree by default. The CSV files in data/ are not listed because they don't match *.py.`,
        },
        {
          kind: "code_predict",
          label: "find with -mtime — recently changed files",
          code: `# Find files modified in the last 24 hours
find /var/log -name "*.log" -mtime -1 -type f`,
          output: `/var/log/syslog.log
/var/log/auth.log`,
          explanation: `-mtime -1 means "modified less than 1 day ago." Use +7 for "more than 7 days ago." The minus/plus distinction is critical: -N means "less than N days," +N means "more than N days," and plain N means "exactly N days ago." This is essential for finding recent log files or cleaning up old temp files.`,
        },
        {
          kind: "code_predict",
          label: "find with -mmin — files changed in the last hour",
          code: `# A customer says their trading config changed "just now"
# Find what changed in the last 60 minutes
find /opt/trading-app/config -type f -mmin -60`,
          output: `/opt/trading-app/config/risk-limits.json
/opt/trading-app/config/symbols.csv`,
          explanation: `-mmin -60 means "modified less than 60 minutes ago." This is more precise than -mtime for recent changes. When a customer says "something changed recently," this is your first command. You can combine it with ls -la to see who changed it and when: find ... -mmin -60 -exec ls -la {} \\;`,
        },
        {
          kind: "code_predict",
          label: "find with -size and multiple conditions",
          code: `# Find large log files that haven't been modified recently
find /var/log -name "*.log" -size +100M -mtime +30 -type f`,
          output: `/var/log/old-app.log
/var/log/archive/debug.log`,
          explanation: `-size +100M finds files larger than 100 megabytes. -mtime +30 means "modified more than 30 days ago." Multiple conditions are AND'd together by default. This is the standard pattern for disk cleanup — find old, large files that are safe to remove. Add -exec du -sh {} \\; to see the actual sizes.`,
        },
        {
          kind: "code_predict",
          label: "find with -maxdepth and -not",
          code: `# A trading system directory:
# /opt/app/
#   config.json
#   data/
#     prices_AAPL.csv
#     prices_NVDA.csv
#     archive/
#       prices_2023.csv.gz
#   logs/
#     app.log

# Find CSV files only in the top two levels (skip archive/)
find /opt/app -maxdepth 2 -name "*.csv" -type f`,
          output: `/opt/app/data/prices_AAPL.csv
/opt/app/data/prices_NVDA.csv`,
          explanation: `-maxdepth 2 means "look at most 2 levels deep from the starting path." Level 0 is /opt/app itself, level 1 is data/ and logs/, level 2 is the files inside those. The .csv.gz file in archive/ is at level 3 and is excluded. maxdepth is useful when you know the files are near the top and want to avoid descending into large subtrees.`,
        },
        {
          kind: "prose",
          markdown: `### xargs — the argument builder

\`xargs\` solves a fundamental problem: many commands accept filenames as arguments, but pipes deliver data on stdin. \`xargs\` bridges this gap — it reads items from stdin and passes them as **arguments** to a command.

Without xargs: \`find . -name "*.csv"\` prints filenames to stdout, one per line. You can see them, but you cannot feed them to \`wc\` or \`grep\` as filenames via a pipe alone.

With xargs: \`find . -name "*.csv" | xargs wc -l\` turns those filenames into arguments: \`wc -l file1.csv file2.csv file3.csv\`

Key xargs options:

- **\`xargs command\`** — appends all items as args to one command call (batched)
- **\`xargs -I{} command {} ...\`** — runs command once per item, replacing {} with the item
- **\`xargs -n N command\`** — pass at most N items per command invocation
- **\`xargs -P N command\`** — run up to N commands in **parallel** (huge for performance)
- **\`xargs -0\`** — expect null-delimited input (pair with \`find -print0\`)`,
        },
        {
          kind: "code_predict",
          label: "find piped to xargs",
          code: `# Count total lines across all Python files
find src/ -name "*.py" -type f | xargs wc -l | tail -1`,
          output: `  1247 total`,
          explanation: `find produces a list of .py files. xargs takes that list and passes all filenames as arguments to wc -l. The tail -1 grabs just the total line. This is a quick way to measure codebase size. Without xargs, wc would try to read filenames from stdin as content, not treat them as arguments.`,
        },
        {
          kind: "code_predict",
          label: "find + xargs + grep — searching inside found files",
          code: `# Find all CSV files and search for AAPL trades inside them
find /data/trades -name "*.csv" -type f | xargs grep "AAPL"`,
          output: `/data/trades/2024-01.csv:AAPL,150.25,1000,BUY
/data/trades/2024-01.csv:AAPL,151.00,750,SELL
/data/trades/2024-02.csv:AAPL,148.50,500,BUY`,
          explanation: `find locates all CSV files across the directory tree. xargs feeds them as arguments to grep, which then searches inside each file. The output includes the filename prefix so you know which file each match came from. This is equivalent to grep -r "AAPL" /data/trades --include="*.csv" but the find+xargs approach is more flexible when your search criteria are complex.`,
        },
        {
          kind: "code_comparison",
          label: "find -exec vs xargs",
          left: {
            title: "find -exec (one at a time)",
            code: `find . -name "*.tmp" \\
  -exec rm {} \\;`,
            annotation: `Runs rm once per file. Slower for many files because it spawns a new rm process each time.`,
          },
          right: {
            title: "find | xargs (batched)",
            code: `find . -name "*.tmp" \\
  | xargs rm`,
            annotation: `Passes many files to one rm call. Much faster — one process handles all files.`,
          },
          takeaway: `xargs batches arguments for efficiency. On 10,000 files, -exec spawns 10,000 rm processes; xargs might spawn only 2-3. Use -exec when you need per-file logic (like renaming with a different pattern each time). Use xargs when you just need to feed files to a command.`,
        },
        {
          kind: "code_predict",
          label: "xargs with -I for placeholders",
          code: `# Create a dated backup of each config file
find /opt/trading/config -name "*.json" -type f | xargs -I{} cp {} {}.bak`,
          output: `(no output — creates .bak copies of each file)`,
          explanation: `-I{} tells xargs to replace {} with each input item. This lets you use the filename in multiple positions within the command. Without -I, xargs just appends all items to the end, which does not work when you need the filename in a specific position (like both arguments of cp). Note: -I processes one item at a time, so it loses xargs's batching advantage.`,
        },
        {
          kind: "code_predict",
          label: "xargs -P for parallel execution",
          code: `# Compress all large CSV data files in parallel (4 at a time)
find /data -name "*.csv" -size +50M -type f | xargs -P 4 -I{} gzip {}

# Equivalent: fetch prices for multiple tickers in parallel
echo -e "AAPL\\nNVDA\\nMSFT\\nTSLA" | xargs -P 4 -I{} curl -s "https://api.example.com/quote/{}" -o {}.json`,
          output: `(no output — compresses files / downloads data in parallel)`,
          explanation: `-P 4 runs up to 4 commands simultaneously. Combined with -I{}, each item gets its own command but 4 run at the same time. This is one of the easiest ways to parallelize work in bash. For the curl example, all 4 API calls happen concurrently instead of sequentially — 4x faster.`,
        },
        {
          kind: "code_predict",
          label: "find with -exec — per-file logic",
          code: `# Show size + modification time for each market data file
find /data/market -name "*.csv" -type f -exec ls -lh {} \\; | awk '{print $5, $6, $7, $9}'`,
          output: `45M Jan 15 /data/market/AAPL_2024.csv
120M Jan 15 /data/market/SPY_2024.csv
12M Jan 14 /data/market/NVDA_2024.csv`,
          explanation: `-exec ls -lh {} \\; runs ls -lh on each found file. The {} is replaced with the filename. The \\; terminates the -exec command (the backslash escapes the semicolon from the shell). The output is piped to awk to extract just the columns we care about: size, date, and path.`,
        },
        {
          kind: "code_predict",
          label: "find with -delete — the cleanup one-liner",
          code: `# Count old temp files first, then delete them
echo "Files to delete:"
find /tmp/trading-cache -name "*.tmp" -mtime +7 -type f | wc -l

# Actually delete them
find /tmp/trading-cache -name "*.tmp" -mtime +7 -type f -delete`,
          output: `Files to delete:
42`,
          explanation: `-delete is a built-in find action — no need for xargs or -exec rm. It is the cleanest way to delete files matching criteria. Pro tip: always run the find without -delete first to preview what will be deleted. The -delete action prints no output, so you cannot recover from mistakes. IMPORTANT: -delete must come AFTER the tests, not before — find -delete -name "*.tmp" would delete everything!`,
        },
        {
          kind: "key_insight",
          label: "Handle spaces in filenames",
          insight: `Filenames with spaces break the basic \`find | xargs\` pattern because xargs splits on whitespace by default. Use the null-delimiter combo to handle any filename safely:

\`\`\`bash
find . -name "*.log" -print0 | xargs -0 rm
\`\`\`

\`-print0\` separates filenames with null bytes instead of newlines. \`-0\` tells xargs to expect null-delimited input. Always use this pattern in production scripts where you cannot control filenames.

A real example: \`find "/data/Q1 2024 Reports" -name "*.csv" -print0 | xargs -0 wc -l\` — without -print0/-0, this fails because the space in "Q1 2024" gets treated as a filename separator.`,
        },
        {
          kind: "key_insight",
          label: "The find + xargs decision tree",
          insight: `Choose the right pattern for the job:

- **Delete matching files** → \`find ... -delete\` (simplest)
- **Run one command on all files** → \`find ... | xargs command\` (fast, batched)
- **Run command per file with custom args** → \`find ... | xargs -I{} command {} ...\` (flexible)
- **Run commands in parallel** → \`find ... | xargs -P N -I{} command {}\` (fast + parallel)
- **Complex per-file logic** → \`find ... -exec command {} \\;\` (full control)
- **Filenames have spaces** → add \`-print0\` and \`-0\` to any pattern above`,
        },
        {
          kind: "warm_up",
          title: "delete all .pyc files",
          prompt: `Write a command to find and delete all \`.pyc\` files under the current directory.`,
          answer: `find . -name "*.pyc" -type f -delete`,
          explanation: `find's built-in -delete action is the cleanest approach. You could also use find . -name "*.pyc" -type f | xargs rm -f, but -delete avoids piping entirely. Always add -type f to avoid accidentally matching directories named something.pyc.`,
        },
        {
          kind: "warm_up",
          title: "search all CSV files for a ticker",
          prompt: `Write a command that finds all \`.csv\` files under \`/data\` and searches inside them for lines containing "TSLA". Handle filenames with spaces safely.`,
          answer: `find /data -name "*.csv" -type f -print0 | xargs -0 grep "TSLA"`,
          explanation: `-print0 outputs null-delimited filenames, -0 tells xargs to expect them. This safely handles paths like "/data/Q1 2024/trades.csv". grep then searches inside each found file for "TSLA" and prints matching lines with filenames.`,
        },
      ],
    },

    // ================================================================
    // 5. Variables, loops & conditionals
    // ================================================================
    {
      title: "Variables, loops & conditionals",
      blocks: [
        {
          kind: "prose",
          markdown: `Bash scripts need variables, loops, and conditionals just like any programming language. The syntax has a few gotchas that trip up newcomers — especially around spacing and quoting.

The golden rules:
- **No spaces around \`=\` in assignments** — \`NAME="Alice"\` not \`NAME = "Alice"\`
- **Always double-quote variables** — \`"$var"\` not \`$var\` (prevents word splitting)
- **Use \`[[ ]]\` not \`[ ]\`** — double brackets are safer, more powerful, and bash-specific
- **Use \`\$(command)\` not backticks** — easier to read and nest

If you remember nothing else from this section, remember the quoting rule: **when in doubt, double-quote it**. Unquoted variables are the source of most bash bugs.`,
        },
        {
          kind: "prose",
          markdown: `### Variables

Bash variables are untyped — everything is a string. There is no \`let\`, \`var\`, or \`const\`. You just assign with \`=\` and read with \`$\`.

Key variable concepts:

| Syntax | What it does | Example |
|--------|-------------|---------|
| **\`VAR=value\`** | Assign a variable | \`TICKER="AAPL"\` |
| **\`$VAR\`** | Read a variable | \`echo $TICKER\` → AAPL |
| **\`\${VAR}\`** | Read with explicit boundaries | \`echo "\${TICKER}_data"\` → AAPL_data |
| **\`\${VAR:-default}\`** | Default if unset | \`\${PORT:-8080}\` |
| **\`\${VAR:=default}\`** | Assign default if unset | Sets AND returns default |
| **\`\${VAR:?error msg}\`** | Error if unset | Exits with message |
| **\`\$1, \$2, ...\`** | Script/function arguments | \`./script.sh AAPL\` → \`$1\` is "AAPL" |
| **\`\$@\`** | All arguments (as separate words) | Used in loops: \`for arg in "$@"\` |
| **\`\$#\`** | Number of arguments | \`if [[ $# -lt 1 ]]\` |
| **\`\$?\`** | Exit code of last command | 0 = success, non-zero = failure |
| **\`\$!\`** | PID of last background process | \`sleep 10 & echo $!\` |

The \`\${}\` syntax is not just for clarity — it is required when the variable is followed by characters that could be part of the name: \`echo "$TICKERprice"\` looks for a variable called \`TICKERprice\`, but \`echo "\${TICKER}price"\` correctly reads \`TICKER\` and appends "price."`,
        },
        {
          kind: "code_predict",
          label: "variable assignment — the spacing trap",
          code: `# Which of these works?
NAME="Alice"
echo "Hello $NAME"

# vs.
# NAME = "Alice"   <-- this would FAIL`,
          output: `Hello Alice`,
          explanation: `In bash, variable assignment must have NO spaces around the =. Writing NAME = "Alice" makes bash interpret NAME as a command and = as its first argument. This is the #1 bash gotcha for beginners. Why? Because bash uses spaces to separate commands from arguments — NAME = "Alice" looks like running a program called "NAME" with two arguments.`,
        },
        {
          kind: "code_predict",
          label: "variable expansion and boundaries",
          code: `TICKER="AAPL"
PRICE=150.25

echo "$TICKER is at \\$$PRICE"
echo "\${TICKER}_daily_prices.csv"
echo "$TICKERprice"`,
          output: `AAPL is at $150.25
AAPL_daily_prices.csv
`,
          explanation: `Line 1: \\$ is a literal dollar sign, $PRICE expands to 150.25. Line 2: \${TICKER} with braces cleanly separates the variable from the suffix "_daily_prices.csv". Line 3: without braces, bash looks for a variable called TICKERprice which does not exist, so it expands to an empty string. This is why \${} is essential when building filenames and paths.`,
        },
        {
          kind: "code_predict",
          label: "special variables — arguments and exit codes",
          code: `# Imagine this is inside a script called check_ticker.sh
# run as: ./check_ticker.sh NVDA AAPL TSLA

echo "Script received $# arguments"
echo "First ticker: $1"
echo "All tickers: $@"

grep -q "$1" portfolio.csv
echo "Grep exit code: $?"`,
          output: `Script received 3 arguments
First ticker: NVDA
All tickers: NVDA AAPL TSLA
Grep exit code: 0`,
          explanation: `$# is the argument count. $1, $2, $3 are positional arguments. $@ is all of them. $? is the exit code of the previous command — 0 means grep found a match. These special variables are the foundation of every bash script that takes input.`,
        },
        {
          kind: "prose",
          markdown: `### Loops

Bash has three loop types:

- **\`for x in list\`** — iterate over a fixed list (words, globs, command output)
- **\`while condition\`** — loop while a condition is true
- **\`until condition\`** — loop until a condition becomes true (rarely used)

The most common patterns:

\`\`\`bash
for ticker in AAPL NVDA MSFT; do ...    # iterate a literal list
for f in *.csv; do ...                   # iterate matching files
for i in {1..10}; do ...                 # iterate a numeric range
while read -r line; do ... done < file   # process a file line by line
while true; do ... sleep 5; done         # infinite loop (polling)
\`\`\`

The \`while read\` pattern is especially important — it is the correct way to process files line by line. Never use \`for line in \\$(cat file)\` because word splitting will break lines containing spaces.`,
        },
        {
          kind: "code_predict",
          label: "for loop — iterating a list",
          code: `for ticker in AAPL NVDA MSFT TSLA; do
  echo "Fetching quote for $ticker..."
done`,
          output: `Fetching quote for AAPL...
Fetching quote for NVDA...
Fetching quote for MSFT...
Fetching quote for TSLA...`,
          explanation: `The for-in loop iterates over a space-separated list. The do/done keywords delimit the loop body. Each value is assigned to the variable (ticker) in turn. This pattern is common for iterating over a small known set of items.`,
        },
        {
          kind: "code_predict",
          label: "for loop — iterating files with globs",
          code: `# files in current directory: AAPL.csv NVDA.csv MSFT.csv
for f in *.csv; do
  lines=\$(wc -l < "$f")
  echo "$f: $lines records"
done`,
          output: `AAPL.csv: 252 records
MSFT.csv: 252 records
NVDA.csv: 252 records`,
          explanation: `The glob *.csv expands to matching files (sorted alphabetically). \\$(wc -l < "$f") captures the line count — the < avoids printing the filename. Note the quotes around "$f" — without them, a filename like "Q1 2024.csv" would break the script.`,
        },
        {
          kind: "code_predict",
          label: "for loop — numeric ranges with {N..M}",
          code: `# Download the last 5 days of trade data
for day in {1..5}; do
  echo "Downloading trades_2024-01-0$day.csv"
done`,
          output: `Downloading trades_2024-01-01.csv
Downloading trades_2024-01-02.csv
Downloading trades_2024-01-03.csv
Downloading trades_2024-01-04.csv
Downloading trades_2024-01-05.csv`,
          explanation: `{1..5} expands to 1 2 3 4 5 (brace expansion). You can also use {1..100..5} to step by 5 (1, 6, 11, ...). Brace expansion happens before variable expansion, so {1..$N} does NOT work — use seq $N instead: for i in \\$(seq 1 $N).`,
        },
        {
          kind: "code_predict",
          label: "while read loop — processing a CSV file",
          code: `# portfolio.csv contains:
# AAPL,150.25,1000
# NVDA,480.50,500
# MSFT,380.20,200

while IFS=',' read -r ticker price shares; do
  value=\$(echo "$price * $shares" | bc)
  echo "$ticker: $shares shares x \\$$price = \\$$value"
done < portfolio.csv`,
          output: `AAPL: 1000 shares x $150.25 = $150250.00
NVDA: 500 shares x $480.50 = $240250.00
MSFT: 200 shares x $380.20 = $76040.00`,
          explanation: `while read loops are the standard way to process a file line by line. IFS=',' sets the field separator to comma, splitting each line into the three variables. -r prevents backslash interpretation. The < portfolio.csv at the end redirects the file into the entire loop's stdin. bc handles floating-point math (bash only does integers natively).`,
        },
        {
          kind: "code_predict",
          label: "while loop — polling until a condition is met",
          code: `# Wait for a trading service to become healthy
attempt=1
while [[ $attempt -le 5 ]]; do
  echo "Health check attempt $attempt..."
  # Simulating: service comes up on attempt 3
  if [[ $attempt -eq 3 ]]; then
    echo "Service is healthy!"
    break
  fi
  ((attempt++))
done`,
          output: `Health check attempt 1...
Health check attempt 2...
Health check attempt 3...
Service is healthy!`,
          explanation: `This is the standard retry/polling pattern. [[ $attempt -le 5 ]] checks if attempt is less than or equal to 5. ((attempt++)) increments the counter (the (( )) context enables C-style arithmetic). break exits the loop early when the condition is met. In a real script, you would add sleep 2 between attempts to avoid hammering the service.`,
        },
        {
          kind: "prose",
          markdown: `### Conditionals

Bash conditionals use \`if/then/elif/else/fi\`. The condition is tested by \`[[ ]]\` (preferred) or \`[ ]\` (POSIX-compatible but less safe).

**Test operators you must know:**

| Test | What it checks | Example |
|------|---------------|---------|
| **-f file** | File exists and is regular | \`[[ -f "config.json" ]]\` |
| **-d dir** | Directory exists | \`[[ -d "/data" ]]\` |
| **-e path** | Path exists (any type) | \`[[ -e "$path" ]]\` |
| **-z string** | String is empty | \`[[ -z "$TICKER" ]]\` |
| **-n string** | String is non-empty | \`[[ -n "$API_KEY" ]]\` |
| **str1 == str2** | String equality | \`[[ "$action" == "BUY" ]]\` |
| **str1 != str2** | String inequality | \`[[ "$env" != "prod" ]]\` |
| **str =~ regex** | Regex match (bash-only) | \`[[ "$ticker" =~ ^[A-Z]{1,5}$ ]]\` |
| **n1 -eq n2** | Numeric equality | \`[[ $count -eq 0 ]]\` |
| **n1 -lt n2** | Numeric less than | \`[[ $price -lt 100 ]]\` |
| **n1 -gt n2** | Numeric greater than | \`[[ $shares -gt 0 ]]\` |

**Why \`[[ ]]\` over \`[ ]\`?** Double brackets are a bash built-in (faster), support regex with \`=~\`, allow \`&&\`/\`||\` inside the brackets, and do not require quoting variables to prevent word-splitting errors. Single brackets are an external command (\`/usr/bin/[\`) and have more gotchas.`,
        },
        {
          kind: "code_predict",
          label: "if/then with [[ ]] — file checks",
          code: `FILE="config.json"
if [[ -f "$FILE" ]]; then
  echo "Config found"
else
  echo "Config missing!"
  exit 1
fi`,
          output: `Config found`,
          explanation: `[[ -f "$FILE" ]] tests if the file exists and is a regular file. The then keyword starts the success branch, else the failure branch, and fi closes the block. This pattern — check for a required file and exit if missing — is the standard way to validate prerequisites at the top of a script.`,
        },
        {
          kind: "code_predict",
          label: "if/elif chain — validating script arguments",
          code: `# ./trade.sh BUY AAPL 100
ACTION="\$1"
TICKER="\$2"
SHARES="\$3"

if [[ -z "$ACTION" || -z "$TICKER" || -z "$SHARES" ]]; then
  echo "Usage: trade.sh ACTION TICKER SHARES" >&2
  exit 1
elif [[ "$ACTION" != "BUY" && "$ACTION" != "SELL" ]]; then
  echo "ERROR: Action must be BUY or SELL, got '$ACTION'" >&2
  exit 1
elif [[ $SHARES -le 0 ]]; then
  echo "ERROR: Shares must be positive" >&2
  exit 1
else
  echo "Placing $ACTION order: $SHARES shares of $TICKER"
fi`,
          output: `Placing BUY order: 100 shares of AAPL`,
          explanation: `This demonstrates input validation with an if/elif chain. -z tests for empty strings (missing arguments). != and && test string values. -le 0 is numeric comparison. Error messages go to stderr with >&2 so they do not pollute stdout. Each validation exits with code 1 on failure. This is the standard pattern for script argument validation.`,
        },
        {
          kind: "code_predict",
          label: "regex matching with =~",
          code: `TICKER="AAPL"

if [[ "$TICKER" =~ ^[A-Z]{1,5}$ ]]; then
  echo "$TICKER is a valid ticker format"
else
  echo "$TICKER is NOT a valid ticker"
fi

TICKER="aapl123"
if [[ "$TICKER" =~ ^[A-Z]{1,5}$ ]]; then
  echo "$TICKER is valid"
else
  echo "$TICKER is NOT valid"
fi`,
          output: `AAPL is a valid ticker format
aapl123 is NOT valid`,
          explanation: `The =~ operator performs a regex match (only available in [[ ]], not [ ]). ^[A-Z]{1,5}$ matches 1-5 uppercase letters with nothing before or after. AAPL matches. aapl123 fails because it has lowercase letters and digits. This is useful for input validation without external tools.`,
        },
        {
          kind: "code_predict",
          label: "case statement — routing by pattern",
          code: `# Process different file types from a data feed
FILE="prices_AAPL.csv.gz"

case "$FILE" in
  *.csv.gz)
    echo "Compressed CSV: will decompress first"
    ;;
  *.csv)
    echo "Plain CSV: processing directly"
    ;;
  *.json)
    echo "JSON: will use jq"
    ;;
  *)
    echo "Unknown format: $FILE"
    exit 1
    ;;
esac`,
          output: `Compressed CSV: will decompress first`,
          explanation: `case matches $FILE against glob patterns (not regex). *.csv.gz matches first because patterns are tested in order. Each branch ends with ;;. The * pattern is the default/catch-all. case is cleaner than a long if/elif chain when matching a single variable against multiple patterns, and it supports glob wildcards natively.`,
        },
        {
          kind: "code_comparison",
          label: "[ ] vs [[ ]] — why double brackets win",
          left: {
            title: "[ ] — fragile, POSIX",
            code: `# These break with [ ]:
FILE=""
[ -f $FILE ]  # error: too many args
[ $a == $b ]  # error if a or b empty
[ $x -gt 0 ] && [ $x -lt 10 ]`,
            annotation: `Unquoted empty variables cause parse errors. No && inside brackets.`,
          },
          right: {
            title: "[[ ]] — safe, bash",
            code: `# These all work with [[ ]]:
FILE=""
[[ -f $FILE ]]  # fine, no error
[[ $a == $b ]]  # fine even if empty
[[ $x -gt 0 && $x -lt 10 ]]`,
            annotation: `Handles empty vars, supports && and || inside, supports regex =~.`,
          },
          takeaway: `Always use [[ ]] in bash scripts. [ ] is only needed for strict POSIX compliance (rare). The quoting issues with [ ] have caused countless production bugs.`,
        },
        {
          kind: "code_predict",
          label: "arithmetic with (( )) and let",
          code: `SHARES=100
PRICE=150

# (( )) for arithmetic evaluation
TOTAL=$(( SHARES * PRICE ))
echo "Total: \\$$TOTAL"

# (( )) as a conditional (0 = false, non-zero = true)
if (( TOTAL > 10000 )); then
  echo "Large order — requires approval"
fi

# Increment
(( SHARES++ ))
echo "Shares now: $SHARES"`,
          output: `Total: $15000
Large order — requires approval
Shares now: 101`,
          explanation: `(( )) enables C-style arithmetic. Inside (( )), you don't need $ for variables and can use *, +, -, /, %, ++, --, and comparison operators directly. $(( expr )) captures the result. (( expr )) as a condition is true if the result is non-zero. This is how bash handles integer math — note that bash does NOT support floating-point arithmetic natively (use bc or awk for decimals).`,
        },
        {
          kind: "key_insight",
          label: "Always quote your variables",
          insight: `Unquoted variables undergo **word splitting** and **glob expansion**. This causes subtle, dangerous bugs:

\`\`\`bash
FILE="my report.txt"
rm $FILE    # BAD: runs rm my report.txt (two args!)
rm "$FILE"  # GOOD: runs rm "my report.txt" (one arg)
\`\`\`

Rule: always write \`"$var"\` with double quotes unless you specifically want word splitting (rare). This applies everywhere: \`if [[ -f "$file" ]]\`, \`for f in "$@"\`, \`echo "$result"\`.

The one exception: inside \`(( ))\` and \`[[ ]]\` you technically do not need quotes, but quoting never hurts. When in doubt, quote.`,
        },
        {
          kind: "key_insight",
          label: "Bash arithmetic is integers only",
          insight: `Bash's built-in \`(( ))\` and \`$(( ))\` only handle **integers**. For any financial or decimal calculation, you must use an external tool:

\`\`\`bash
# BAD — silently truncates to integer:
echo $(( 150 * 25 / 100 ))  # 37, not 37.5

# GOOD — use bc for decimals:
echo "150.25 * 1000" | bc    # 150250.00

# GOOD — use awk for more complex math:
awk 'BEGIN { printf "%.2f\\n", 150.25 * 1000 }'  # 150250.00
\`\`\`

This is a critical gotcha for any script dealing with prices, percentages, or financial data. Always use \`bc\` or \`awk\` for non-integer math.`,
        },
        {
          kind: "warm_up",
          title: "loop over .txt files",
          prompt: `Write a loop that prints the filename and line count for every \`.txt\` file in the current directory.`,
          answer: `for f in *.txt; do echo "$f: \\$(wc -l < "$f") lines"; done`,
          explanation: `The glob *.txt expands to all matching files. wc -l < "$f" counts lines (using < avoids printing the filename). Always quote "$f" in case filenames contain spaces.`,
        },
        {
          kind: "warm_up",
          title: "validate a required argument",
          prompt: `Write a snippet that checks if the first argument (\`$1\`) was provided to a script. If not, print a usage message to stderr and exit with code 1.`,
          answer: `if [[ -z "\$1" ]]; then echo "Usage: \$0 <ticker>" >&2; exit 1; fi`,
          explanation: `-z tests if a string is empty. >&2 sends the message to stderr (not stdout) so it does not interfere with piped output. $0 is the script's own name, which is conventionally included in usage messages. exit 1 signals failure to the caller.`,
        },
      ],
    },

    // ================================================================
    // 6. Command substitution & process substitution
    // ================================================================
    {
      title: "Command substitution & process substitution",
      blocks: [
        {
          kind: "prose",
          markdown: `Two essential bash features for composing commands:

- **Command substitution** \`\\$(command)\` — captures a command's stdout as a string
- **Process substitution** \`<(command)\` — presents a command's output as a file

These let you use command output anywhere you would use a string or a filename.

**Command substitution** is the more common one. It runs a command, captures everything it writes to stdout, and substitutes the result inline — either into a variable assignment or directly inside a string. The command runs in a **subshell**, so it cannot modify variables in the parent shell.

**Process substitution** is less common but incredibly useful when a command expects a filename argument but you want to give it the output of another command instead. It creates a temporary file descriptor that behaves like a file.`,
        },
        {
          kind: "prose",
          markdown: `### Command substitution: \`\\$(command)\`

Two syntaxes exist, but always prefer \`\\$()\`:

| Syntax | Example | Notes |
|--------|---------|-------|
| **\`\\$(command)\`** | \`TODAY=\\$(date +%F)\` | Modern, nestable, clear |
| **\`\\\`command\\\`\`** | \`TODAY=\\\`date +%F\\\`\` | Legacy, hard to nest, avoid |

Why \`\\$()\` wins: it nests cleanly. \`\\$(echo \\$(whoami))\` is readable. With backticks, nesting requires escaping: \`\\\`echo \\\\\\\`whoami\\\\\\\`\\\`\`. Never use backticks.

Command substitution captures **stdout only**. stderr still goes to the terminal (or wherever it was redirected). If the command produces trailing newlines, bash strips them.`,
        },
        {
          kind: "code_predict",
          label: "command substitution — variable assignment",
          code: `TODAY=\$(date +%Y-%m-%d)
echo "Today is $TODAY"
echo "There are \$(ls *.py | wc -l) Python files"`,
          output: `Today is 2024-01-15
There are 7 Python files`,
          explanation: `\\$(command) runs the command and substitutes its stdout inline. You can use it in variable assignments or directly inside strings. In the second echo, the substitution happens inside the double-quoted string — bash evaluates \\$() inside double quotes but NOT inside single quotes.`,
        },
        {
          kind: "code_predict",
          label: "command substitution — building filenames dynamically",
          code: `# Create a timestamped backup of a portfolio file
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP="portfolio_backup_\${TIMESTAMP}.csv"
echo "Backing up to: $BACKUP"

# Count lines in that backup
LINES=\$(wc -l < portfolio.csv)
echo "Portfolio has $LINES positions"`,
          output: `Backing up to: portfolio_backup_20240115_103000.csv
Portfolio has 42 positions`,
          explanation: `Command substitution is commonly used to build dynamic filenames with timestamps, compute values for messages, and capture counts or other metadata. The \\$() runs in a subshell, so any cd or variable assignment inside it does not affect the parent script.`,
        },
        {
          kind: "code_predict",
          label: "command substitution — nested commands",
          code: `# Get the directory of the script itself (common pattern)
SCRIPT_DIR=\$(dirname "\$(readlink -f "\$0")")
echo "Script is located in: $SCRIPT_DIR"

# Equivalent: find which config file is being used
CONFIG_PATH=\$(readlink -f "\$(which python3)")
echo "Python resolves to: $CONFIG_PATH"`,
          output: `Script is located in: /opt/trading/scripts
Python resolves to: /usr/local/bin/python3.11`,
          explanation: `\\$() nests cleanly — the inner \\$() runs first, its output becomes the argument to the outer command. This is why \\$() is better than backticks — try nesting backticks and you will quickly regret it. The pattern \\$(dirname "\\$(readlink -f "\\$0")") is the standard way to find the directory containing the current script, regardless of how it was invoked.`,
        },
        {
          kind: "code_predict",
          label: "command substitution — capturing exit codes",
          code: `# Command substitution and $? work together
QUOTE=\$(curl -s "https://api.example.com/quote/AAPL" 2>/dev/null)
STATUS=$?

if [[ $STATUS -eq 0 ]]; then
  echo "Got quote: $QUOTE"
else
  echo "Failed to fetch quote (exit code: $STATUS)"
fi`,
          output: `Got quote: {"ticker":"AAPL","price":150.25}`,
          explanation: `$? captures the exit code of the command inside \\$(). You must save it immediately — any subsequent command will overwrite $?. This pattern — capture output AND check exit code — is common when calling APIs or external tools that might fail.`,
        },
        {
          kind: "prose",
          markdown: `### Process substitution: \`<(command)\` and \`>(command)\`

Process substitution creates a temporary file-like path (usually \`/dev/fd/63\` or similar) that connects to a command's output. The key use case: **commands that require filename arguments but you want to give them dynamic content**.

- \`<(command)\` — presents command output as a readable file
- \`>(command)\` — presents a writable file that feeds into a command

Process substitution is available in bash and zsh but NOT in POSIX sh or dash.`,
        },
        {
          kind: "code_predict",
          label: "process substitution — comparing two command outputs",
          code: `# Compare today's portfolio with yesterday's
diff <(sort today_portfolio.csv) <(sort yesterday_portfolio.csv)`,
          output: `2a3
> TSLA,245.00,400`,
          explanation: `<(sort file) creates a temporary file descriptor containing the sorted output. diff sees two "files" to compare. Without process substitution, you would need to sort into temp files, diff those, then clean up: sort today.csv > /tmp/a && sort yesterday.csv > /tmp/b && diff /tmp/a /tmp/b. Process substitution does this in one line with no temp files.`,
        },
        {
          kind: "code_predict",
          label: "process substitution — feeding dynamic data to commands",
          code: `# Join two data streams on a common field
# prices.csv: AAPL,150.25 / NVDA,480.50
# volumes.csv: AAPL,1000 / NVDA,500

paste -d',' <(sort prices.csv) <(sort volumes.csv | cut -d',' -f2)`,
          output: `AAPL,150.25,1000
NVDA,480.50,500`,
          explanation: `paste merges lines from two "files" side by side. The first <() provides sorted prices. The second <() provides sorted volumes with the ticker column removed (since it would be duplicate). This avoids creating temp files for intermediate results.`,
        },
        {
          kind: "code_predict",
          label: "process substitution — while read without a subshell",
          code: `# Without process substitution, pipe creates a subshell:
COUNT=0
cat tickers.txt | while read -r ticker; do
  (( COUNT++ ))
done
echo "Count: $COUNT"  # Always 0! Loop ran in a subshell

# With process substitution, no subshell:
COUNT=0
while read -r ticker; do
  (( COUNT++ ))
done < <(cat tickers.txt)
echo "Count: $COUNT"  # Correct count!`,
          output: `Count: 0
Count: 5`,
          explanation: `When you pipe into a while loop (cmd | while ...), the loop runs in a subshell. Variables modified inside it are lost when the subshell exits. Using process substitution (< <(cmd)), the loop runs in the current shell and variable changes persist. This is a common gotcha — if your while-read loop seems to lose variable changes, this is why.`,
        },
        {
          kind: "key_insight",
          label: "Command sub vs process sub",
          insight: `**Command substitution** \`\\$()\` captures **text** — use it when you need a command's output as a string (variable assignment, inline in a string).

**Process substitution** \`<()\` creates a **file** — use it when a command expects a filename argument but you want to give it dynamic content.

\`\`\`bash
# Command sub: capture text
LINES=\\$(wc -l < data.csv)

# Process sub: create a "file" for diff
diff <(sort old.csv) <(sort new.csv)
\`\`\`

Decision rule: if you need to **store the result**, use \`\\$()\`. If you need to **pass it as a file**, use \`<()\`.`,
        },
        {
          kind: "warm_up",
          title: "capture today's date",
          prompt: `Write a command that sets a variable called BACKUP_NAME to "backup-2024-01-15" (using the current date dynamically).`,
          answer: `BACKUP_NAME="backup-\\$(date +%Y-%m-%d)"`,
          explanation: `\\$(date +%Y-%m-%d) runs the date command with a format string and substitutes the output. The result is assigned to the variable.`,
        },
        {
          kind: "warm_up",
          title: "compare two sorted outputs",
          prompt: `Write a one-liner that shows the differences between the sorted contents of \`portfolio_old.csv\` and \`portfolio_new.csv\` without creating temp files.`,
          answer: `diff <(sort portfolio_old.csv) <(sort portfolio_new.csv)`,
          explanation: `Process substitution <() creates temporary file descriptors from each sorted output. diff receives them as two "files" to compare. No temp files needed, no cleanup required.`,
        },
      ],
    },

    // ================================================================
    // 7. String manipulation & parameter expansion
    // ================================================================
    {
      title: "String manipulation & parameter expansion",
      blocks: [
        {
          kind: "prose",
          markdown: `Bash has powerful built-in string manipulation through **parameter expansion**. These operations avoid spawning external processes like \`sed\` or \`cut\`, making them faster and more portable. They look cryptic at first but become second nature quickly.

The key operators:

| Operator | What it does | Example |
|----------|-------------|---------|
| **\`\${var#pattern}\`** | Remove shortest match from **start** | \`\${path#*/}\` |
| **\`\${var##pattern}\`** | Remove longest match from **start** | \`\${path##*/}\` → filename |
| **\`\${var%pattern}\`** | Remove shortest match from **end** | \`\${file%.*}\` → strip ext |
| **\`\${var%%pattern}\`** | Remove longest match from **end** | \`\${file%%.*}\` → first part |
| **\`\${var/old/new}\`** | Replace first occurrence | \`\${s/AAPL/NVDA}\` |
| **\`\${var//old/new}\`** | Replace all occurrences | \`\${s//,/ }\` |
| **\`\${#var}\`** | String length | \`\${#ticker}\` → 4 |
| **\`\${var:offset:len}\`** | Substring | \`\${date:0:4}\` → year |
| **\`\${var^}\`** | Uppercase first char | \`\${name^}\` |
| **\`\${var^^}\`** | Uppercase all | \`\${ticker^^}\` |
| **\`\${var,}\`** | Lowercase first char | \`\${Name,}\` |
| **\`\${var,,}\`** | Lowercase all | \`\${TICKER,,}\` |

Memory trick: \`#\` is on the left side of \`$\` on your keyboard, so it strips from the left (start). \`%\` is on the right side, so it strips from the right (end). Single \`#\`/\`%\` = shortest match (greedy off). Double \`##\`/\`%%\` = longest match (greedy on).`,
        },
        {
          kind: "code_predict",
          label: "extracting filename and extension",
          code: `FILE="/home/user/documents/report.final.pdf"

echo "Full path: $FILE"
echo "Filename:  \${FILE##*/}"
echo "Directory: \${FILE%/*}"
echo "Extension: \${FILE##*.}"
echo "No ext:    \${FILE%.*}"`,
          output: `Full path: /home/user/documents/report.final.pdf
Filename:  report.final.pdf
Directory: /home/user/documents
Extension: pdf
No ext:    /home/user/documents/report.final`,
          explanation: `## strips the longest match of */ from the start, leaving just the filename. % strips the shortest match of /* from the end, leaving the directory. ##*. strips everything up to the last dot, leaving the extension. %.*  strips from the last dot onward. Note the difference between # (shortest) and ## (longest) — with "report.final.pdf", #*. would only strip "report." leaving "final.pdf".`,
        },
        {
          kind: "code_predict",
          label: "# vs ## — shortest vs longest match",
          code: `DATA="AAPL,150.25,1000,BUY"

# Single # — remove shortest match from start
echo "\${DATA#*,}"

# Double ## — remove longest match from start
echo "\${DATA##*,}"`,
          output: `150.25,1000,BUY
BUY`,
          explanation: `#*, removes the shortest match of "anything followed by comma" from the start — just "AAPL,", leaving the rest. ##*, removes the longest match — "AAPL,150.25,1000,", leaving only the last field. This is how you extract the first field (#) vs the last field (##) from delimited data without awk or cut.`,
        },
        {
          kind: "code_predict",
          label: "% vs %% — extracting from the end",
          code: `FILE="prices_AAPL_2024.csv.gz"

# Single % — remove shortest match from end
echo "\${FILE%.*}"

# Double %% — remove longest match from end
echo "\${FILE%%.*}"

# Extract just the ticker
TEMP="\${FILE#prices_}"
TICKER="\${TEMP%%_*}"
echo "Ticker: $TICKER"`,
          output: `prices_AAPL_2024.csv
prices_AAPL_2024
Ticker: AAPL`,
          explanation: `%.* removes the shortest match from the end — just ".gz", leaving "prices_AAPL_2024.csv". %%.* removes the longest match — ".csv.gz", leaving "prices_AAPL_2024". The ticker extraction chains two operations: first strip "prices_" from the start, then strip everything from the first underscore onward. This avoids needing sed or awk for simple parsing.`,
        },
        {
          kind: "code_predict",
          label: "string replacement and length",
          code: `RECORD="AAPL,150.25,1000,BUY"

# Replace commas with spaces
echo "\${RECORD//,/ }"

# Replace just the ticker
echo "\${RECORD/AAPL/NVDA}"

# String length
echo "Length: \${#RECORD}"

# Substring: extract price (offset 5, length 6)
echo "Price: \${RECORD:5:6}"`,
          output: `AAPL 150.25 1000 BUY
NVDA,150.25,1000,BUY
Length: 21
Price: 150.25`,
          explanation: `// replaces all occurrences (every comma → space). Single / replaces only the first match. \${#var} gives the character count. \${var:5:6} extracts 6 characters starting at position 5 (0-indexed). These are all pure bash — no subprocess spawning.`,
        },
        {
          kind: "code_predict",
          label: "case conversion (bash 4+)",
          code: `INPUT="aapl"

# Uppercase for API call
TICKER="\${INPUT^^}"
echo "Querying: $TICKER"

# Lowercase for filename
FILENAME="\${TICKER,,}_data.csv"
echo "Saving to: $FILENAME"

# Capitalize first letter only
STATUS="active"
echo "Status: \${STATUS^}"`,
          output: `Querying: AAPL
Saving to: aapl_data.csv
Status: Active`,
          explanation: `^^ uppercases all characters, ,, lowercases all, ^ uppercases just the first character. This is useful for normalizing user input — tickers should be uppercase for APIs but lowercase for filenames. These are bash 4+ features (not available on macOS's default bash 3.2, but work in brew-installed bash and on Linux).`,
        },
        {
          kind: "code_predict",
          label: "practical example — parsing a market data filename",
          code: `# Parse structured filename: exchange_ticker_date.csv
FILE="NYSE_AAPL_20240115.csv"

EXCHANGE="\${FILE%%_*}"
TEMP="\${FILE#*_}"
TICKER="\${TEMP%%_*}"
DATE="\${TEMP#*_}"
DATE="\${DATE%.csv}"

echo "Exchange: $EXCHANGE"
echo "Ticker:   $TICKER"
echo "Date:     $DATE"`,
          output: `Exchange: NYSE
Ticker:   AAPL
Date:     20240115`,
          explanation: `This chains multiple parameter expansions to parse a structured filename into its components. %%_* gets the first field (longest match of _* from end = everything after first _). #*_ strips the first field. Then we repeat the pattern. This is pure bash — no awk, sed, or cut needed. Fast enough to run inside a loop over thousands of files.`,
        },
        {
          kind: "key_insight",
          label: "Parameter expansion vs external commands",
          insight: `Every time you pipe to \`sed\`, \`cut\`, or \`awk\` for simple string operations, you spawn a new process. In a loop processing thousands of items, this adds up fast. Parameter expansion runs inside bash itself — no process spawning, no overhead.

\`\`\`bash
# Slow (spawns sed for each iteration):
for f in *.tar.gz; do echo "$f" | sed 's/.tar.gz//'; done

# Fast (pure bash):
for f in *.tar.gz; do echo "\${f%.tar.gz}"; done
\`\`\`

Benchmark: on 10,000 files, the sed version takes ~15 seconds (10,000 process spawns). The parameter expansion version takes ~0.1 seconds. Use parameter expansion for simple string operations inside loops. Save \`sed\`/\`awk\` for complex transformations or when processing file contents.`,
        },
        {
          kind: "key_insight",
          label: "The parameter expansion cheat sheet",
          insight: `Four patterns cover 90% of use cases:

1. **Get filename from path**: \`\${path##*/}\` (same as \`basename\`)
2. **Get directory from path**: \`\${path%/*}\` (same as \`dirname\`)
3. **Strip extension**: \`\${file%.*}\`
4. **Get extension**: \`\${file##*.}\`

For delimited data:
- **First field**: \`\${line%%,*}\`
- **Last field**: \`\${line##*,}\`
- **Everything after first delimiter**: \`\${line#*,}\``,
        },
        {
          kind: "warm_up",
          title: "rename file extensions",
          prompt: `Write a one-liner loop that renames all \`.txt\` files in the current directory to \`.md\`. Use parameter expansion, not \`sed\`.`,
          answer: `for f in *.txt; do mv "$f" "\${f%.txt}.md"; done`,
          explanation: `\${f%.txt} strips the .txt suffix from the end of the filename. We then append .md. This is the idiomatic bash way to batch-rename files by extension.`,
        },
        {
          kind: "warm_up",
          title: "extract ticker from filename",
          prompt: `Given a filename in the variable \`FILE="data_NVDA_20240115.csv"\`, write commands that extract just the ticker ("NVDA") into a variable called TICKER using only parameter expansion.`,
          answer: `TEMP="\${FILE#data_}"; TICKER="\${TEMP%%_*}"`,
          explanation: `First strip "data_" from the start with #, leaving "NVDA_20240115.csv". Then strip from the first underscore to the end with %%, leaving just "NVDA". This two-step pattern is how you extract middle fields from structured strings.`,
        },
      ],
    },

    // ================================================================
    // 8. Exit codes & error handling
    // ================================================================
    {
      title: "Exit codes & error handling",
      blocks: [
        {
          kind: "prose",
          markdown: `Every command returns an **exit code**: 0 means success, anything else means failure. This is how bash knows if a command worked.

This is not just a convention — it is the foundation of how bash makes decisions. \`if\`, \`&&\`, \`||\`, \`while\`, and \`set -e\` all depend on exit codes. Understanding them is essential for writing scripts that do not silently fail.

Key concepts:

| Concept | What it does | Example |
|---------|-------------|---------|
| **\`$?\`** | Exit code of last command | \`grep -q "AAPL" file; echo $?\` |
| **\`&&\`** | Run next ONLY if previous succeeded | \`mkdir dir && cd dir\` |
| **\`||\`** | Run next ONLY if previous failed | \`cmd || echo "failed"\` |
| **\`exit N\`** | Exit script with code N | \`exit 1\` (failure) |
| **\`return N\`** | Return from function with code N | \`return 0\` (success) |
| **\`set -e\`** | Exit on any error | Stops the script immediately |

Common exit codes: 0 = success, 1 = general error, 2 = misuse of command, 126 = command not executable, 127 = command not found, 128+N = killed by signal N.`,
        },
        {
          kind: "code_predict",
          label: "exit codes and $?",
          code: `ls /tmp > /dev/null
echo "Exit code: $?"

ls /nonexistent > /dev/null 2>&1
echo "Exit code: $?"`,
          output: `Exit code: 0
Exit code: 2`,
          explanation: `$? gives the exit code of the previous command. ls /tmp succeeds (exit 0). ls /nonexistent fails (exit 2 — "no such file"). We redirect output to /dev/null to keep things clean. Important: $? is overwritten by EVERY command, so if you need to check it, save it immediately: status=$?`,
        },
        {
          kind: "code_predict",
          label: "&& and || — conditional execution chains",
          code: `# && runs next only if previous succeeded
echo "Step 1" && echo "Step 2" && echo "Step 3"

# || runs next only if previous failed
grep -q "AAPL" portfolio.csv && echo "AAPL found" || echo "AAPL not in portfolio"`,
          output: `Step 1
Step 2
Step 3
AAPL found`,
          explanation: `&& is logical AND — it short-circuits on the first failure. || is logical OR — it runs the next command only if the previous failed. The grep -q example is a common idiom: -q (quiet) suppresses output, and we branch on the exit code. This is more concise than a full if/then/fi block for simple checks.`,
        },
        {
          kind: "code_predict",
          label: "|| fallback pattern",
          code: `# Try to read config, fall back to default
CONFIG=\$(cat config.json 2>/dev/null) || CONFIG='{"port": 8080}'
echo "$CONFIG"`,
          output: `{"port": 8080}`,
          explanation: `If cat config.json fails (file doesn't exist), the || runs the fallback assignment. This is the bash equivalent of a try/catch with a default value. 2>/dev/null suppresses the error message. This pattern is extremely common in scripts that need sensible defaults.`,
        },
        {
          kind: "code_predict",
          label: "&& chain for multi-step operations",
          code: `# Deploy pipeline: each step only runs if previous succeeded
echo "Building..." \\
  && echo "Running tests..." \\
  && echo "Deploying to staging..." \\
  && echo "All steps completed!"

# If any step fails, remaining steps are skipped
false && echo "This never prints"
echo "Exit code: $?"`,
          output: `Building...
Running tests...
Deploying to staging...
All steps completed!
Exit code: 1`,
          explanation: `The && chain runs each command only if the previous succeeded. If any command fails (returns non-zero), the rest of the chain is skipped. This is a lightweight alternative to set -e for short command sequences. The last example shows that false (which always exits 1) stops the chain, and $? reflects the failure.`,
        },
        {
          kind: "prose",
          markdown: `### \`set -euo pipefail\` — the safety net

Bash's default behavior is dangerous: when a command fails, the script **keeps running**. This means errors are silently ignored, and subsequent commands may operate on corrupt or missing data.

\`set -euo pipefail\` changes three behaviors:

- **\`-e\` (errexit)** — exit immediately if any command returns non-zero. Without this, a failing \`cd\` command would silently fail and the next \`rm -rf *\` would delete files in the wrong directory.

- **\`-u\` (nounset)** — treat references to unset variables as errors. Without this, a typo like \`$TIKER\` instead of \`$TICKER\` silently expands to an empty string, potentially causing \`rm -rf /data/$TIKER/\` to become \`rm -rf /data//\`.

- **\`-o pipefail\` — a pipeline's exit code is the last non-zero exit code from any command in the pipe, not just the last command. Without this, \`curl BADURL | jq .\` would show jq's exit code (success, because it got valid empty input), hiding curl's failure.`,
        },
        {
          kind: "code_comparison",
          label: "with vs without set -euo pipefail",
          left: {
            title: "Without (dangerous)",
            code: `#!/bin/bash
cd /wrong/path
rm -rf *
echo "Done"`,
            annotation: `cd fails silently, rm runs in the CURRENT directory. Catastrophic data loss!`,
          },
          right: {
            title: "With set -euo pipefail",
            code: `#!/bin/bash
set -euo pipefail
cd /wrong/path
rm -rf *
echo "Done"`,
            annotation: `cd fails, script exits immediately with an error. rm never runs. Safe!`,
          },
          takeaway: `This is the most dangerous pattern in bash scripting. Without set -e, the cd failure is ignored and rm operates in whatever directory the script happened to be in. Always start scripts with set -euo pipefail.`,
        },
        {
          kind: "code_predict",
          label: "set -u catches typos in variable names",
          code: `#!/bin/bash
set -euo pipefail

TICKER="AAPL"
echo "Fetching data for $TIKER"  # Typo! TIKER instead of TICKER`,
          output: `./script.sh: line 4: TIKER: unbound variable`,
          explanation: `Without set -u, the typo $TIKER silently expands to an empty string, and the script continues with bad data. With set -u, bash catches it immediately and exits with an error message showing exactly which variable was undefined. This catches a huge class of bugs — especially dangerous when the variable is used in a file path or database query.`,
        },
        {
          kind: "code_predict",
          label: "pipefail catches hidden failures in pipes",
          code: `#!/bin/bash
set -euo pipefail

# Without pipefail, this would "succeed" even if curl fails
curl -s "https://api.example.com/quotes/INVALID" | jq -r '.price'
echo "This line never executes if curl or jq fails"`,
          output: `(script exits with error from curl or jq)`,
          explanation: `Without pipefail, a pipe's exit code is the exit code of the LAST command. So if curl fails but jq succeeds (processing empty input), the pipe reports success. With pipefail, if ANY command in the pipe fails, the whole pipe fails. This prevents silently processing bad data from a failed API call.`,
        },
        {
          kind: "code_predict",
          label: "handling expected failures with set -e",
          code: `#!/bin/bash
set -euo pipefail

# This would exit the script because grep returns 1 when no match:
# grep "TSLA" portfolio.csv

# Solution 1: use || true to suppress the error
RESULT=\$(grep "TSLA" portfolio.csv || true)
echo "Result: '$RESULT'"

# Solution 2: use if to handle both cases
if grep -q "TSLA" portfolio.csv; then
  echo "TSLA found"
else
  echo "TSLA not in portfolio"
fi`,
          output: `Result: ''
TSLA not in portfolio`,
          explanation: `set -e treats ANY non-zero exit code as a fatal error, but grep returns 1 when it finds no matches — which is often expected behavior, not an error. Two solutions: || true turns the failure into success (the exit code becomes 0). Or use if, which naturally handles both cases without triggering set -e. This is the main gotcha with set -e — you need || true for commands that legitimately return non-zero.`,
        },
        {
          kind: "key_insight",
          label: "Start every script with set -euo pipefail",
          insight: `This is the single most important line in bash scripting:

\`\`\`bash
#!/bin/bash
set -euo pipefail
\`\`\`

- **-e** — exit immediately if any command fails
- **-u** — treat unset variables as errors (catches typos)
- **-o pipefail** — a pipe fails if ANY command in it fails (not just the last one)

Without this, bash happily continues after errors, leading to data loss and corrupted state. Every production script should start with this.

The one caveat: commands that return non-zero for "expected" reasons (like \`grep\` finding no matches) will exit your script. Use \`|| true\` to suppress those: \`grep "PATTERN" file || true\`.`,
        },
        {
          kind: "key_insight",
          label: "The production script template",
          insight: `Every production bash script should follow this template:

\`\`\`bash
#!/bin/bash
set -euo pipefail

# Validate inputs
[[ \${1:-} ]] || { echo "Usage: $0 <ticker>" >&2; exit 1; }

# Set up cleanup
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Your logic here...
\`\`\`

This gives you: fail-fast on errors (\`set -euo pipefail\`), input validation (\`[[ \${1:-} ]]\`), and automatic cleanup (\`trap EXIT\`). With these three patterns, your scripts are safe, robust, and professional.`,
        },
        {
          kind: "warm_up",
          title: "safe directory change",
          prompt: `Write a command that changes to \`/opt/trading/data\` and exits with an error message if the directory does not exist. Do it in one line without \`set -e\`.`,
          answer: `cd /opt/trading/data || { echo "ERROR: /opt/trading/data not found" >&2; exit 1; }`,
          explanation: `The || runs the block only if cd fails. The { } groups the echo and exit into a single block (braces must have spaces and the last command must end with ;). >&2 sends the error to stderr. This is the standard "safe cd" pattern for scripts that don't use set -e.`,
        },
      ],
    },

    // ================================================================
    // 9. Signals, traps & cleanup
    // ================================================================
    {
      title: "Signals, traps & cleanup",
      blocks: [
        {
          kind: "prose",
          markdown: `When your script creates temporary files, holds locks, or starts background processes, you need to **clean up** when the script exits — whether it succeeds, fails, or gets killed with Ctrl+C.

The \`trap\` command registers a function to run when the script receives a signal. Think of it as bash's equivalent of \`try/finally\` in Python or \`defer\` in Go.

| Signal | Number | Trigger | Example scenario |
|--------|--------|---------|-----------------|
| **EXIT** | — | Script exits for any reason | Clean up temp files |
| **INT** | 2 | User presses Ctrl+C | Cancel gracefully |
| **TERM** | 15 | \`kill PID\` (default signal) | Shutdown request |
| **HUP** | 1 | Terminal closed / SSH disconnected | Save state |
| **ERR** | — | A command returns non-zero (with set -e) | Log the error |

The most important pattern: **trap cleanup EXIT**. This runs your cleanup function no matter how the script ends — normal exit, error, Ctrl+C, or kill signal. The EXIT trap fires on ALL of these, so you rarely need to trap individual signals separately.

Syntax: \`trap 'commands' SIGNAL\` or \`trap function_name SIGNAL\`. Use a function for complex cleanup logic, an inline command for simple one-liners.`,
        },
        {
          kind: "code_predict",
          label: "trap for temp file cleanup",
          code: `#!/bin/bash
set -euo pipefail

TMPFILE=\$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

echo "Working with $TMPFILE"
echo "some data" > "$TMPFILE"
cat "$TMPFILE"
# TMPFILE is automatically deleted when script exits`,
          output: `Working with /tmp/tmp.xYz12AbC
some data`,
          explanation: `mktemp creates a secure temporary file with a random name. The trap registers a cleanup command that runs when the script exits — whether normally, due to an error (set -e), or due to Ctrl+C. Without the trap, the temp file would be left behind on errors. This is the single most important pattern for writing production bash scripts.`,
        },
        {
          kind: "code_predict",
          label: "real-world trap — market data processing script",
          code: `#!/bin/bash
set -euo pipefail

# Create temp workspace for processing
WORKDIR=\$(mktemp -d)
LOCKFILE="/tmp/market-data-processor.lock"

cleanup() {
  echo "Cleaning up workspace..."
  rm -rf "$WORKDIR"
  rm -f "$LOCKFILE"
}
trap cleanup EXIT

# Prevent duplicate runs with a lock file
if [[ -f "$LOCKFILE" ]]; then
  echo "ERROR: Another instance is running" >&2
  exit 1
fi
echo $$ > "$LOCKFILE"

echo "Processing in $WORKDIR"
echo "AAPL,150.25" > "$WORKDIR/prices.csv"
cat "$WORKDIR/prices.csv"
echo "Done processing"`,
          output: `Processing in /tmp/tmp.Ab3xYz
AAPL,150.25
Done processing
Cleaning up workspace...`,
          explanation: `This script creates a temp directory AND a lock file. The cleanup function removes both when the script exits. The lock file prevents duplicate runs — important for data processing scripts that should not overlap. Even if the script crashes, cleanup removes the lock so future runs are not blocked. $$ is the current script's PID, written to the lock file for debugging.`,
        },
        {
          kind: "code_predict",
          label: "trap with a cleanup function — background processes",
          code: `#!/bin/bash
set -euo pipefail

TMPDIR=\$(mktemp -d)
PID=""

cleanup() {
  echo "Cleaning up..."
  [[ -n "$PID" ]] && kill "$PID" 2>/dev/null || true
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

# Start a background process
sleep 100 &
PID=$!
echo "Started background process: $PID"

# Script logic here...
echo "Done"
# cleanup runs automatically on exit`,
          output: `Started background process: 12345
Done
Cleaning up...`,
          explanation: `The cleanup function handles multiple resources: killing a background process and removing a temp directory. trap cleanup EXIT ensures it runs no matter what. The || true after kill prevents the script from failing if the process already exited. $! holds the PID of the last background process. This pattern is essential when your script launches background services, watchers, or tail processes.`,
        },
        {
          kind: "code_predict",
          label: "trap ERR — logging errors before exit",
          code: `#!/bin/bash
set -euo pipefail

on_error() {
  echo "ERROR on line $1: command exited with status $2" >&2
  echo "Failed while processing market data" >&2
}
trap 'on_error $LINENO $?' ERR

echo "Step 1: Downloading data..."
echo "Step 2: Parsing CSV..."
false  # Simulates a failing command
echo "Step 3: This never runs"`,
          output: `Step 1: Downloading data...
Step 2: Parsing CSV...
ERROR on line 11: command exited with status 1
Failed while processing market data`,
          explanation: `The ERR trap fires when any command fails (with set -e). $LINENO gives the line number where the error occurred, $? gives the exit code. This is incredibly useful for debugging — instead of a cryptic "script failed," you get the exact line and status. Note: ERR trap runs BEFORE EXIT trap, so you can log the error and then clean up.`,
        },
        {
          kind: "key_insight",
          label: "Always use trap EXIT for cleanup",
          insight: `Any script that creates temporary files, directories, lock files, or background processes should have a \`trap cleanup EXIT\` near the top. This is non-negotiable for production scripts.

\`\`\`bash
TMPFILE=\$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
\`\`\`

Without this, your temp files accumulate on every error, every Ctrl+C, every SSH disconnect. On a customer's server, leftover temp files from a crashed script are embarrassing and potentially dangerous (they can fill up /tmp).

Pro pattern: combine ERR and EXIT traps for both error reporting AND cleanup:
\`\`\`bash
trap 'echo "Error on line $LINENO" >&2' ERR
trap 'rm -rf "$TMPDIR"' EXIT
\`\`\``,
        },
        {
          kind: "warm_up",
          title: "write a safe temp file script",
          prompt: `Write a script skeleton that creates a temp directory, sets up cleanup with trap, and runs a command inside the temp directory. The cleanup should fire even if the command fails.`,
          answer: `#!/bin/bash
set -euo pipefail
TMPDIR=\\$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
# Your logic using $TMPDIR here`,
          explanation: `mktemp -d creates a temp directory. trap ensures it is removed on exit. set -euo pipefail ensures errors stop the script (but cleanup still runs). This 4-line skeleton is the foundation of every safe bash script.`,
        },
      ],
    },

    // ================================================================
    // 10. jq: JSON on the command line
    // ================================================================
    {
      title: "jq: JSON on the command line",
      blocks: [
        {
          kind: "prose",
          markdown: `\`jq\` is the command-line JSON processor. As an FDE, you will use it constantly — parsing API responses, extracting fields from config files, transforming data. It is the single most useful tool for working with JSON outside of a programming language.

jq has its own mini-language with filters, pipes, and functions. The core concept: **everything is a filter**. Input JSON flows through filters left to right, and each filter transforms the data. The \`.\` filter is the identity — it passes data through unchanged (useful for pretty-printing).

Key jq patterns to memorize:
- \`.field\` — extract a field
- \`.[]\` — iterate over array elements
- \`.[] | .field\` — extract a field from each array element
- \`select(condition)\` — filter elements
- \`{newKey: .oldKey}\` — reshape objects
- \`@csv\`, \`@tsv\` — format output as CSV or TSV
- \`-r\` flag — raw string output (no quotes)`,
        },
        {
          kind: "code_predict",
          label: "basic jq extraction",
          code: `echo '{"ticker": "AAPL", "price": 150.25, "volume": 1000000}' | jq '.ticker'`,
          output: `"AAPL"`,
          explanation: `.ticker extracts the "ticker" field. jq outputs JSON by default, so strings include quotes. Use -r (raw output) to strip the quotes: jq -r '.ticker' would output just AAPL. Numbers and booleans do not get quotes.`,
        },
        {
          kind: "code_predict",
          label: "jq — nested fields and optional access",
          code: `echo '{"data": {"quote": {"price": 150.25, "change": 2.3}}}' | jq '.data.quote.price'
echo '---'
echo '{"data": {}}' | jq '.data.quote.price'
echo '---'
echo '{"data": {}}' | jq '.data.quote.price // "N/A"'`,
          output: `150.25
---
null
---
"N/A"`,
          explanation: `Dot-chain for nested fields: .data.quote.price drills three levels deep. If any intermediate key is missing, jq returns null (not an error). The // operator provides a default value when the result is null or false — like Python's "or" or bash's \${VAR:-default}. This prevents scripts from breaking on missing data.`,
        },
        {
          kind: "code_predict",
          label: "jq array iteration",
          code: `echo '[
  {"ticker": "AAPL", "price": 150.25},
  {"ticker": "NVDA", "price": 480.50},
  {"ticker": "MSFT", "price": 380.20}
]' | jq '.[].ticker'`,
          output: `"AAPL"
"NVDA"
"MSFT"`,
          explanation: `.[] iterates over all elements in the array. .ticker then extracts the ticker field from each element. This pattern — .[].field — is the most common jq operation. Each result is printed on a separate line.`,
        },
        {
          kind: "code_predict",
          label: "jq select — filtering stock data",
          code: `echo '[
  {"ticker": "AAPL", "price": 150.25, "change_pct": 2.3},
  {"ticker": "NVDA", "price": 480.50, "change_pct": -1.5},
  {"ticker": "MSFT", "price": 380.20, "change_pct": 0.8},
  {"ticker": "TSLA", "price": 245.00, "change_pct": -3.2}
]' | jq '.[] | select(.change_pct > 0) | .ticker'`,
          output: `"AAPL"
"MSFT"`,
          explanation: `select() filters elements based on a condition. The pipe inside jq works like Unix pipes — data flows left to right. We iterate the array, filter to stocks with positive change, then extract tickers. You can combine conditions: select(.change_pct > 0 and .price < 200) would find cheap gainers.`,
        },
        {
          kind: "code_predict",
          label: "jq with -r for raw output",
          code: `echo '{"model": "claude-sonnet-4-5", "tokens": 1024}' | jq -r '.model'`,
          output: `claude-sonnet-4-5`,
          explanation: `The -r flag outputs raw strings without JSON quotes. Without it, you would get "claude-sonnet-4-5" (with quotes). Use -r when you need to feed jq output into other commands.`,
        },
        {
          kind: "code_predict",
          label: "jq — constructing new objects",
          code: `echo '[
  {"ticker": "AAPL", "price": 150.25, "shares": 1000},
  {"ticker": "NVDA", "price": 480.50, "shares": 500},
  {"ticker": "MSFT", "price": 380.20, "shares": 200}
]' | jq '[.[] | {ticker: .ticker, value: (.price * .shares)}]'`,
          output: `[
  {
    "ticker": "AAPL",
    "value": 150250
  },
  {
    "ticker": "NVDA",
    "value": 240250
  },
  {
    "ticker": "MSFT",
    "value": 76040
  }
]`,
          explanation: `{ticker: .ticker, value: (.price * .shares)} constructs a new object for each element. jq can do arithmetic inline — .price * .shares computes the position value. Wrapping in [...] collects results back into an array. This is how you transform API data into the shape you need.`,
        },
        {
          kind: "code_predict",
          label: "jq — aggregation and summary",
          code: `echo '[
  {"ticker": "AAPL", "price": 150.25, "shares": 1000, "sector": "tech"},
  {"ticker": "NVDA", "price": 480.50, "shares": 500, "sector": "tech"},
  {"ticker": "JPM", "price": 175.30, "shares": 300, "sector": "finance"},
  {"ticker": "MSFT", "price": 380.20, "shares": 200, "sector": "tech"}
]' | jq '{
  total_positions: length,
  total_value: (map(.price * .shares) | add),
  tech_tickers: [.[] | select(.sector == "tech") | .ticker]
}'`,
          output: `{
  "total_positions": 4,
  "total_value": 543130,
  "tech_tickers": [
    "AAPL",
    "NVDA",
    "MSFT"
  ]
}`,
          explanation: `This builds a portfolio summary. length counts positions. map(.price * .shares) computes the value of each position, and | add sums them. select filters to tech stocks. This shows jq's power — aggregation, filtering, and reshaping in a single expression. Parentheses around (map(...) | add) are needed so the pipe does not break the object construction.`,
        },
        {
          kind: "key_insight",
          label: "jq is a full language",
          insight: `jq is far more powerful than most people realize. It has variables (\`as $x\`), conditionals (\`if-then-else\`), functions (\`def\`), string interpolation (\`"\\(.field)"\`), and even reduce. But 80% of the time, you only need five patterns:

1. \`.field\` — get a value
2. \`.[].field\` — get values from each array element
3. \`select(.x > 0)\` — filter
4. \`{new: .old}\` — reshape
5. \`-r\` — raw output for scripting`,
        },
        {
          kind: "warm_up",
          title: "extract model IDs from API response",
          prompt: `Given this JSON from an API: \`{"models": [{"id": "claude-3"}, {"id": "claude-4"}]}\`, write a jq expression to print each model ID without quotes.`,
          answer: `jq -r '.models[].id'`,
          explanation: `.models accesses the array, [] iterates over it, .id extracts the field, -r strips quotes. The full command would be: echo '...' | jq -r '.models[].id'.`,
        },
        {
          kind: "warm_up",
          title: "find stocks down more than 2%",
          prompt: `Given a JSON array of stock quotes like \`[{"ticker":"AAPL","change_pct":1.5},{"ticker":"TSLA","change_pct":-3.2}]\`, write a jq expression to print just the tickers of stocks down more than 2% (raw output, no quotes).`,
          answer: `jq -r '.[] | select(.change_pct < -2) | .ticker'`,
          explanation: `select(.change_pct < -2) filters to stocks with change below -2%. .ticker extracts the name. -r gives raw output. The pipe inside jq chains the operations: iterate → filter → extract.`,
        },
      ],
    },

    // ================================================================
    // 9. curl for API work
    // ================================================================
    {
      title: "curl for API work",
      blocks: [
        {
          kind: "prose",
          markdown: `\`curl\` is your go-to for making HTTP requests from the terminal. As an FDE, you will use it to test API endpoints, debug webhook payloads, and verify integrations. Combined with \`jq\`, it is an incredibly powerful debugging tool.

Essential flags to memorize:
- **\`-s\`** — silent mode (no progress bar)
- **\`-S\`** — show errors even in silent mode
- **\`-X METHOD\`** — set HTTP method (POST, PUT, DELETE)
- **\`-H "Header: value"\`** — add a header
- **\`-d 'body'\`** — set request body (implies POST)
- **\`-o file\`** — write output to file instead of stdout
- **\`-w "format"\`** — write out metadata (status code, timing)
- **\`-v\`** — verbose mode (shows full request/response headers)
- **\`-L\`** — follow redirects

The most common combo: \`curl -sS URL | jq .\` — silent request with error reporting, piped to jq for pretty-printing.`,
        },
        {
          kind: "code_predict",
          label: "curl GET — fetching stock data",
          code: `curl -s "https://api.example.com/quote/AAPL" \\
  -H "Authorization: Bearer sk-abc123" | jq '.'`,
          output: `{
  "ticker": "AAPL",
  "price": 150.25,
  "change": 2.30,
  "volume": 45000000
}`,
          explanation: `The simplest curl pattern: GET request with an auth header, piped to jq for pretty-printing. -s suppresses the progress bar. GET is the default method, so -X GET is not needed. The | jq '.' is the identity filter — it just formats the JSON nicely.`,
        },
        {
          kind: "code_predict",
          label: "curl POST with JSON body",
          code: `curl -s -X POST https://api.example.com/orders \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-abc123" \\
  -d '{"ticker": "NVDA", "shares": 100, "action": "BUY"}'`,
          output: `{"order_id": "ORD-42", "ticker": "NVDA", "shares": 100, "status": "filled", "price": 480.50}`,
          explanation: `-s is silent mode (no progress bar). -X POST sets the method. -H adds headers. -d sets the request body (and implies POST, so -X POST is technically redundant but makes intent clear). This is the standard pattern for any API call with a JSON body.`,
        },
        {
          kind: "code_predict",
          label: "curl piped to jq — transforming API data",
          code: `curl -s "https://api.example.com/portfolio" \\
  -H "Authorization: Bearer sk-abc123" \\
  | jq '.positions[] | {ticker: .ticker, value: (.price * .shares)}'`,
          output: `{
  "ticker": "AAPL",
  "value": 150250
}
{
  "ticker": "NVDA",
  "value": 240250
}`,
          explanation: `curl fetches the JSON. jq iterates over the positions array and constructs a new object with computed values for each position. This is the bread and butter of API debugging from the terminal — fetch data and reshape it in one pipeline.`,
        },
        {
          kind: "code_predict",
          label: "curl — measuring response time",
          code: `curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\\n" https://api.example.com/health`,
          output: `HTTP 200 in 0.142s`,
          explanation: `-o /dev/null discards the response body. -w formats metadata: %{http_code} is the status code, %{time_total} is the total request time in seconds. This is the quickest way to check if an endpoint is responding and how fast. Other useful -w variables: %{time_connect}, %{time_starttransfer}, %{size_download}.`,
        },
        {
          kind: "code_predict",
          label: "curl — verbose mode for debugging",
          code: `curl -v https://api.example.com/health 2>&1 | head -15`,
          output: `*   Trying 93.184.216.34:443...
* Connected to api.example.com (93.184.216.34) port 443
* SSL connection using TLSv1.3
> GET /health HTTP/2
> Host: api.example.com
> User-Agent: curl/8.1.2
> Accept: */*
>
< HTTP/2 200
< content-type: application/json
< x-request-id: abc-123
<`,
          explanation: `-v (verbose) shows the full request/response exchange. Lines starting with > are what curl sent. Lines starting with < are what the server returned. Lines starting with * are connection metadata. Note: verbose output goes to stderr, so we redirect with 2>&1 to pipe it to head. This is essential for debugging SSL issues, header problems, and redirect chains.`,
        },
        {
          kind: "code_predict",
          label: "curl — retry loop for flaky APIs",
          code: `# Retry a quote request up to 3 times
for i in {1..3}; do
  STATUS=\$(curl -s -o /tmp/quote.json -w "%{http_code}" \\
    "https://api.example.com/quote/AAPL")
  if [[ "$STATUS" == "200" ]]; then
    echo "Got quote on attempt $i"
    cat /tmp/quote.json | jq -r '.price'
    break
  fi
  echo "Attempt $i failed (HTTP $STATUS), retrying..."
  sleep 2
done`,
          output: `Attempt 1 failed (HTTP 503), retrying...
Got quote on attempt 2
150.25`,
          explanation: `-o /tmp/quote.json saves the response body to a file. -w "%{http_code}" outputs just the status code to stdout (which we capture). We check if it is 200, and if not, retry after a 2-second delay. This retry pattern is essential when working with rate-limited or flaky APIs. In production, you would add exponential backoff.`,
        },
        {
          kind: "warm_up",
          title: "GET with pretty-printed JSON",
          prompt: `Write a curl command that hits \`https://api.example.com/health\` and pretty-prints the JSON response.`,
          answer: `curl -s https://api.example.com/health | jq .`,
          explanation: `jq . is the identity filter — it just pretty-prints the JSON with indentation and syntax highlighting. The -s flag suppresses curl's progress bar so it does not interfere with the JSON output.`,
        },
        {
          kind: "warm_up",
          title: "POST a trade order",
          prompt: `Write a curl command that sends a POST request to \`https://api.example.com/orders\` with a JSON body containing \`{"ticker": "TSLA", "shares": 50, "action": "SELL"}\`. Include an Authorization header with bearer token \`sk-xyz\`. Print only the HTTP status code.`,
          answer: `curl -s -o /dev/null -w "%{http_code}" -X POST https://api.example.com/orders -H "Content-Type: application/json" -H "Authorization: Bearer sk-xyz" -d '{"ticker": "TSLA", "shares": 50, "action": "SELL"}'`,
          explanation: `-o /dev/null discards the response body. -w "%{http_code}" prints the status code. -X POST, -H for headers, -d for the JSON body. This is the pattern for "fire and check" — you only care if the request succeeded.`,
        },
      ],
    },

    // ================================================================
    // 10. Environment variables & dotfiles
    // ================================================================
    {
      title: "Environment variables & dotfiles",
      blocks: [
        {
          kind: "prose",
          markdown: `Environment variables configure how programs behave. They are the standard way to pass configuration — API keys, database URLs, feature flags — to applications without hardcoding values.

Key concepts:

- **\`export VAR=value\`** — makes a variable available to child processes
- **\`.env\` files** — store variables in a file, one per line (\`KEY=value\`)
- **\`source .env\`** — loads a file's variables into the current shell
- **\`$VAR\`** — reads a variable's value

Without \`export\`, a variable is local to the current shell and invisible to any command you run.

Why environment variables instead of config files? Because they follow the **12-factor app** methodology: configuration that changes between environments (dev, staging, prod) should live in the environment, not in code. This lets you deploy the same code everywhere and change behavior via environment variables like \`API_ENDPOINT\`, \`LOG_LEVEL\`, or \`TRADING_MODE\`.`,
        },
        {
          kind: "prose",
          markdown: `### Default value operators

Bash has four operators for handling unset/empty variables. These are essential for writing scripts with sensible defaults:

| Operator | Behavior | Use case |
|----------|----------|----------|
| **\`\${VAR:-default}\`** | Return default if unset/empty | Read with fallback |
| **\`\${VAR:=default}\`** | Set AND return default if unset/empty | Set-once default |
| **\`\${VAR:+alternate}\`** | Return alternate if var IS set | Conditional flag |
| **\`\${VAR:?error msg}\`** | Exit with error if unset/empty | Require variable |

The \`:-\` operator is by far the most common. The \`:?\` operator is incredibly useful for validating that required env vars are set at the top of a script.`,
        },
        {
          kind: "code_predict",
          label: "variable defaults with :-",
          code: `# PORT is not set
echo "Port: \${PORT:-8080}"

# Now set it
PORT=3000
echo "Port: \${PORT:-8080}"`,
          output: `Port: 8080
Port: 3000`,
          explanation: `The :- operator provides a default value. If PORT is unset or empty, it uses 8080. If PORT has a value, it uses that value. This is the standard pattern for optional configuration with sensible defaults.`,
        },
        {
          kind: "code_predict",
          label: ":? — requiring variables with error messages",
          code: `#!/bin/bash
set -euo pipefail

# These will exit with an error if not set
: "\${API_KEY:?ERROR: API_KEY must be set}"
: "\${TRADING_ENV:?ERROR: TRADING_ENV must be set (staging|production)}"

echo "Using API key: \${API_KEY:0:8}..."
echo "Environment: $TRADING_ENV"`,
          output: `./script.sh: line 4: API_KEY: ERROR: API_KEY must be set`,
          explanation: `The :? operator exits the script with the given error message if the variable is unset or empty. The : (colon) command is a no-op — it evaluates its arguments but does nothing, which is why we use it as a "validation statement." This is the cleanest way to require env vars at the top of a script. \${API_KEY:0:8} shows only the first 8 chars for security.`,
        },
        {
          kind: "code_predict",
          label: "export vs no export",
          code: `SECRET="local_only"
export API_KEY="shared_with_children"

# Run a child process
bash -c 'echo "SECRET=$SECRET"'
bash -c 'echo "API_KEY=$API_KEY"'`,
          output: `SECRET=
API_KEY=shared_with_children`,
          explanation: `Without export, SECRET is only visible in the current shell — child processes cannot see it. API_KEY is exported, so it is inherited by the bash -c child process. This is why you must export variables that your scripts and applications need to read.`,
        },
        {
          kind: "code_predict",
          label: "sourcing a .env file",
          code: `# .env file contains:
# DATABASE_URL=postgresql://localhost/mydb
# API_KEY=sk-abc123
# DEBUG=true

set -a
source .env
set +a

echo "DB: $DATABASE_URL"
echo "Debug: $DEBUG"`,
          output: `DB: postgresql://localhost/mydb
Debug: true`,
          explanation: `source (or .) executes a file in the current shell, making its variables available. set -a automatically exports all variables that get set (so child processes inherit them too). set +a turns that behavior off. This is the standard pattern for loading .env files in shell scripts.`,
        },
        {
          kind: "key_insight",
          label: "The environment is inherited, not shared",
          insight: `Environment variables flow **downward** from parent to child processes, never upward. When you export a variable and run a command, the command gets a **copy** of the variable. If the child modifies it, the parent's copy is unchanged.

This means:
- \`export FOO=bar && ./script.sh\` — script sees FOO
- If script.sh does \`FOO=baz\`, the parent's FOO is still "bar"
- Each process gets its own copy of the environment

This is why \`source\` exists — it runs commands in the **current** shell instead of a child process, so variable changes stick.`,
        },
        {
          kind: "code_predict",
          label: "inline env vars — setting for a single command",
          code: `# Set TICKER just for this one command, not permanently
TICKER="NVDA" python3 -c "import os; print(os.environ['TICKER'])"
echo "TICKER in parent: '\${TICKER:-not set}'"`,
          output: `NVDA
TICKER in parent: 'not set'`,
          explanation: `Prefixing a command with VAR=value sets that variable ONLY for the duration of that command. The parent shell is unaffected. This is incredibly useful for one-off configuration changes without modifying your environment. Common example: DEBUG=1 ./run_server.sh enables debug mode for just that run.`,
        },
        {
          kind: "code_predict",
          label: "practical .env pattern for a trading app",
          code: `# .env.staging contains:
# TRADING_ENV=staging
# API_ENDPOINT=https://sandbox.api.example.com
# MAX_ORDER_SIZE=100
# LOG_LEVEL=debug

# Load environment-specific config
ENV_FILE=".env.\${1:-staging}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "Loaded $ENV_FILE"
else
  echo "WARNING: $ENV_FILE not found" >&2
fi

echo "Endpoint: $API_ENDPOINT"
echo "Max order: $MAX_ORDER_SIZE"`,
          output: `Loaded .env.staging
Endpoint: https://sandbox.api.example.com
Max order: 100`,
          explanation: `This pattern loads different .env files based on a script argument. \${1:-staging} defaults to "staging" if no argument is given. set -a/+a auto-exports all sourced variables. The -f check prevents errors if the file is missing. This is a common pattern for scripts that need to work in multiple environments (dev, staging, production).`,
        },
        {
          kind: "warm_up",
          title: "set default if not already set",
          prompt: `Write a one-liner that sets DATABASE_URL to "postgresql://localhost/mydb" only if it is not already set.`,
          answer: `export DATABASE_URL="\${DATABASE_URL:-postgresql://localhost/mydb}"`,
          explanation: `The :- operator returns the default only if the variable is unset or empty. Combined with export, this ensures the variable is available to child processes. This pattern is common at the top of deployment scripts.`,
        },
        {
          kind: "warm_up",
          title: "require an API key",
          prompt: `Write a line at the top of a script that exits with an error message if the \`API_KEY\` environment variable is not set.`,
          answer: `: "\${API_KEY:?API_KEY environment variable is required}"`,
          explanation: `The :? operator exits with the error message if API_KEY is unset or empty. The : (colon) is a no-op command that evaluates its argument without doing anything else. This is the cleanest one-line validation pattern for required environment variables.`,
        },
      ],
    },

    // ================================================================
    // 11. Bash cheat sheet
    // ================================================================
    {
      title: "Bash cheat sheet",
      blocks: [
        {
          kind: "method_ref",
          title: "File & text search",
          importLine: "Essential search commands",
          methods: [
            {
              signature: `grep -r "pattern" dir/`,
              description: "Search recursively for pattern in all files under dir/",
              returns: "matching lines with filenames",
            },
            {
              signature: `grep -i "pattern" file`,
              description: "Case-insensitive search",
              returns: "matching lines",
            },
            {
              signature: `grep -c "pattern" file`,
              description: "Count matching lines instead of printing them",
              returns: "integer count",
            },
            {
              signature: `grep -l "pattern" *.log`,
              description: "Print only filenames that contain matches",
              returns: "filenames",
            },
            {
              signature: `grep -v "pattern" file`,
              description: "Invert match — print lines that do NOT match",
              returns: "non-matching lines",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Text transformation",
          importLine: "sed & awk essentials",
          methods: [
            {
              signature: `sed 's/old/new/g' file`,
              description: "Replace all occurrences of 'old' with 'new' in file",
              returns: "transformed text to stdout",
            },
            {
              signature: `sed -i '' 's/old/new/g' file`,
              description: "In-place replacement (macOS). On Linux, use sed -i without ''.",
              returns: "modifies file directly",
            },
            {
              signature: `awk '{print $1, $3}' file`,
              description: "Print the 1st and 3rd columns (whitespace-delimited)",
              returns: "selected columns",
            },
            {
              signature: `awk -F',' '{print $2}' file.csv`,
              description: "Print the 2nd column of a CSV (comma-delimited)",
              returns: "selected column",
            },
            {
              signature: `sort file | uniq -c | sort -rn`,
              description: "Count occurrences of each unique line, sorted by frequency",
              returns: "count + line pairs",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "File operations",
          importLine: "find, xargs & file management",
          methods: [
            {
              signature: `find dir/ -name "*.py" -type f`,
              description: "Find all .py files under dir/ recursively",
              returns: "file paths",
            },
            {
              signature: `find dir/ -mtime -1`,
              description: "Find files modified in the last 24 hours",
              returns: "file paths",
            },
            {
              signature: `find dir/ -name "*.tmp" -delete`,
              description: "Find and delete matching files in one command",
              returns: "deletes files (no output)",
            },
            {
              signature: `find . -name "*.js" | xargs wc -l`,
              description: "Count lines across all matching files",
              returns: "line counts + total",
            },
            {
              signature: `tar czf archive.tar.gz dir/`,
              description: "Create a gzipped tarball of a directory",
              returns: "archive file",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Networking & APIs",
          importLine: "curl & network diagnostics",
          methods: [
            {
              signature: `curl -s URL | jq .`,
              description: "GET request with pretty-printed JSON output",
              returns: "formatted JSON",
            },
            {
              signature: `curl -s -X POST -H "Content-Type: application/json" -d '{}' URL`,
              description: "POST JSON to an endpoint",
              returns: "response body",
            },
            {
              signature: `curl -o file.zip URL`,
              description: "Download a file",
              returns: "saves to file.zip",
            },
            {
              signature: `curl -w "%{http_code}" -s -o /dev/null URL`,
              description: "Get just the HTTP status code",
              returns: "status code (e.g. 200)",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "JSON processing (jq)",
          importLine: "Essential jq patterns",
          methods: [
            {
              signature: `jq '.field'`,
              description: "Extract a field from a JSON object",
              returns: "field value",
            },
            {
              signature: `jq '.[].field'`,
              description: "Extract a field from each array element",
              returns: "one value per element",
            },
            {
              signature: `jq '.[] | select(.x > 0)'`,
              description: "Filter array elements by condition",
              returns: "matching elements",
            },
            {
              signature: `jq '{new: .old}'`,
              description: "Reshape objects with new field names",
              returns: "reshaped objects",
            },
            {
              signature: `jq -r '.field'`,
              description: "Raw output (no JSON quotes on strings)",
              returns: "raw string",
            },
            {
              signature: `jq '.field // "default"'`,
              description: "Default value if field is null",
              returns: "value or default",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "String manipulation",
          importLine: "Parameter expansion essentials",
          methods: [
            {
              signature: `\${var##*/}`,
              description: "Extract filename from path (like basename)",
              returns: "filename",
            },
            {
              signature: `\${var%/*}`,
              description: "Extract directory from path (like dirname)",
              returns: "directory path",
            },
            {
              signature: `\${var%.*}`,
              description: "Strip file extension",
              returns: "path without extension",
            },
            {
              signature: `\${var##*.}`,
              description: "Get file extension only",
              returns: "extension",
            },
            {
              signature: `\${var/old/new}`,
              description: "Replace first occurrence of old with new",
              returns: "modified string",
            },
            {
              signature: `\${var:-default}`,
              description: "Return default if var is unset or empty",
              returns: "value or default",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Process & system",
          importLine: "Process management essentials",
          methods: [
            {
              signature: `ps aux | grep process_name`,
              description: "Find a running process by name",
              returns: "process details",
            },
            {
              signature: `kill -9 PID`,
              description: "Force kill a process by PID",
              returns: "terminates process",
            },
            {
              signature: `lsof -i :8080`,
              description: "Find what process is using port 8080",
              returns: "process using the port",
            },
            {
              signature: `du -sh dir/`,
              description: "Show total disk usage of a directory (human-readable)",
              returns: "size (e.g. 1.2G)",
            },
            {
              signature: `df -h`,
              description: "Show disk space usage for all mounted filesystems",
              returns: "filesystem usage table",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Script safety",
          importLine: "Error handling & cleanup",
          methods: [
            {
              signature: `set -euo pipefail`,
              description: "Exit on errors, unset vars, pipe failures",
              returns: "script safety net",
            },
            {
              signature: `trap 'cleanup' EXIT`,
              description: "Run cleanup function when script exits (any reason)",
              returns: "automatic cleanup",
            },
            {
              signature: `mktemp / mktemp -d`,
              description: "Create secure temp file / directory",
              returns: "temp path",
            },
            {
              signature: `command || true`,
              description: "Suppress non-zero exit code (for set -e)",
              returns: "always succeeds",
            },
            {
              signature: `: "\${VAR:?error message}"`,
              description: "Exit with error if VAR is not set",
              returns: "validation",
            },
          ],
        },
      ],
    },

    // ================================================================
    // 12. Decision flashcards
    // ================================================================
    {
      title: "Decision flashcards",
      blocks: [
        {
          kind: "prose",
          markdown: `Test your instincts: for each scenario, decide which tool or pattern to reach for.`,
        },
        {
          kind: "flashcard",
          context: "You need to search for a string across an entire project directory",
          front: `You are SSH'd into a customer's server and need to find every file that references "DATABASE_URL" in \`/opt/app\`.`,
          back: `grep -r "DATABASE_URL" /opt/app/ — recursive grep is the fastest way to search across a directory tree. Add -l for just filenames, -n for line numbers.`,
        },
        {
          kind: "flashcard",
          context: "You need to process JSON from an API response",
          front: `A curl command returns a big JSON blob. You need to extract just the "id" field from each object in a "results" array.`,
          back: `Pipe to jq: curl -s URL | jq -r '.results[].id' — jq is the right tool for any JSON extraction or transformation on the command line.`,
        },
        {
          kind: "flashcard",
          context: "You need to batch rename files",
          front: `You have 100 files named report_001.txt through report_100.txt and need to rename them all to start with "2024_" instead of "report_".`,
          back: `Use a for loop with parameter expansion: for f in report_*.txt; do mv "$f" "2024_\${f#report_}"; done — the \${f#report_} syntax strips the "report_" prefix.`,
        },
        {
          kind: "flashcard",
          context: "You need to check if a previous command succeeded",
          front: `Your script runs a database migration. You need to check if it succeeded before proceeding with the deployment.`,
          back: `Check $?: run_migration && deploy_app || echo "Migration failed, aborting". Or use set -e at the top of the script so any failure stops execution automatically.`,
        },
        {
          kind: "flashcard",
          context: "You need to find files modified recently",
          front: `A customer says their config was changed sometime today. You need to find which files in /etc were modified in the last 24 hours.`,
          back: `find /etc -mtime -1 -type f — the -mtime -1 flag means "modified less than 1 day ago." Add -ls for detailed output.`,
        },
        {
          kind: "flashcard",
          context: "You need to watch a log file in real time",
          front: `You want to monitor a log file as new entries are written, filtering for only ERROR lines.`,
          back: `tail -f /var/log/app.log | grep ERROR — tail -f follows the file (outputs new lines as they are appended), and grep filters them in real time.`,
        },
        {
          kind: "flashcard",
          context: "You need to find what is using a port",
          front: `Your app cannot start because port 8080 is already in use. How do you find out what is using it?`,
          back: `lsof -i :8080 — shows the process using port 8080. Then kill the PID if needed. On Linux, you can also use ss -tlnp | grep 8080.`,
        },
        {
          kind: "flashcard",
          context: "You need to set a variable with a fallback default",
          front: `Your deployment script needs a REGION variable, but it should default to "us-east-1" if not set by the caller.`,
          back: `Use the :- default operator: REGION="\${REGION:-us-east-1}". This uses the existing value if set, otherwise falls back to us-east-1.`,
        },
        {
          kind: "flashcard",
          context: "You need to clean up temporary files even if the script crashes",
          front: `Your script creates a temp file with mktemp. How do you ensure it gets deleted even if the script exits due to an error or Ctrl+C?`,
          back: `Use trap: TMPFILE=$(mktemp) && trap 'rm -f "$TMPFILE"' EXIT. The EXIT trap fires no matter how the script ends — normal exit, error, or signal. This is the bash equivalent of try/finally.`,
        },
        {
          kind: "flashcard",
          context: "You need to extract part of a filename in a bash script",
          front: `You have a variable FILE="report.2024.tar.gz". How do you extract just the extension "gz" and just the basename without any extension?`,
          back: `Extension: \${FILE##*.} gives "gz" (longest match from start). No extension: \${FILE%%.*} gives "report" (longest match from end). # strips from left, % strips from right. Double ## or %% means longest match.`,
        },
        {
          kind: "flashcard",
          context: "You need to debug a slow API response",
          front: `A customer reports their API calls are slow. You want to measure the exact response time from the terminal without seeing the response body.`,
          back: `curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s" URL — the -w flag outputs timing metadata while -o /dev/null discards the body. You can also break down DNS (%{time_namelookup}), connect (%{time_connect}), and TTFB (%{time_starttransfer}).`,
        },
        {
          kind: "flashcard",
          context: "You need to process a CSV file in bash",
          front: `You have a CSV file with lines like "alice,admin,active" and need to loop through it extracting the name and role columns.`,
          back: `Use a while-read loop with IFS: while IFS=',' read -r name role status; do echo "$name is $role"; done < file.csv. IFS sets the field separator. -r prevents backslash interpretation. The < at the end feeds the file into the loop.`,
        },
      ],
    },

    // ================================================================
    // 13. Challenge: Log analysis one-liner
    // ================================================================
    {
      title: "Challenge: Log analysis one-liner",
      blocks: [
        {
          kind: "prose",
          markdown: `This is the kind of task you will do frequently as an FDE: a customer has a log file and wants to know what is going wrong. You need to answer quickly.`,
        },
        {
          kind: "mini_challenge",
          title: "Top error analysis",
          prompt: `You have a log file at \`/var/log/app.log\` with lines like:

\`\`\`
2024-01-15 10:30:01 ERROR [auth] Invalid token for user=alice
2024-01-15 10:30:02 INFO  [api] Request handled in 45ms
2024-01-15 10:30:03 ERROR [db] Connection refused to primary
2024-01-15 10:30:04 ERROR [auth] Invalid token for user=bob
2024-01-15 10:30:05 ERROR [db] Connection refused to primary
2024-01-15 10:30:06 ERROR [db] Connection refused to primary
2024-01-15 10:30:07 WARN  [api] Slow query detected
\`\`\`

Write a one-liner that:
1. Filters to only ERROR lines
2. Extracts the component in brackets (e.g., "auth", "db")
3. Counts occurrences of each component
4. Sorts by frequency (most common first)

Expected output:
\`\`\`
   3 db
   2 auth
\`\`\``,
          hints: [
            `Start with grep ERROR to filter, then pipe to awk or sed to extract the bracketed component.`,
            `awk can extract fields and you can use gsub to strip brackets: awk '{gsub(/\\[|\\]/, "", $4); print $4}'`,
            `sort | uniq -c | sort -rn is the classic "count and rank" pipeline.`,
          ],
          solution: `grep ERROR /var/log/app.log | awk '{gsub(/\\[|\\]/, "", $4); print $4}' | sort | uniq -c | sort -rn`,
          takeaway: `This pipeline — grep | awk | sort | uniq -c | sort -rn — is the Swiss Army knife of log analysis. Memorize it. You will use it constantly: find errors, extract a field, count occurrences, rank by frequency.`,
        },
      ],
    },

    // ================================================================
    // 14. Challenge: Deployment script
    // ================================================================
    {
      title: "Challenge: Deployment script",
      blocks: [
        {
          kind: "prose",
          markdown: `Now write a real bash script. This is the kind of thing you might write during a customer onboarding or when helping automate a deployment workflow.`,
        },
        {
          kind: "mini_challenge",
          title: "Safe deployment script",
          prompt: `Write a bash script called \`deploy.sh\` that:

1. Starts with \`set -euo pipefail\`
2. Requires an \`API_KEY\` environment variable (exit with an error if not set)
3. Takes a deployment target as the first argument (\`$1\`), defaulting to "staging"
4. Calls a health check endpoint with curl: \`GET https://api.example.com/health\`
5. If the health check returns HTTP 200, print "Health check passed" and proceed
6. If it returns anything else, print the status code and exit with error
7. Calls a deploy endpoint: \`POST https://api.example.com/deploy\` with the target in the JSON body
8. Prints the response

The script should demonstrate: error handling, environment variables, argument defaults, curl usage, and exit codes.`,
          hints: [
            `Use :- for the default target: TARGET="\${1:-staging}"`,
            `Check API_KEY with: if [[ -z "$API_KEY" ]]; then echo "error" >&2; exit 1; fi`,
            `Use curl -w "%{http_code}" -s -o /dev/null to get just the status code`,
            `Use -s (silent) and pipe the deploy response through jq for readability`,
          ],
          solution: `#!/bin/bash
set -euo pipefail

# Require API_KEY
if [[ -z "\${API_KEY:-}" ]]; then
  echo "ERROR: API_KEY environment variable is required" >&2
  exit 1
fi

# Default target to "staging"
TARGET="\${1:-staging}"
echo "Deploying to: $TARGET"

# Health check
HTTP_CODE=\\$(curl -s -o /dev/null -w "%{http_code}" \\
  -H "Authorization: Bearer $API_KEY" \\
  https://api.example.com/health)

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Health check failed with HTTP $HTTP_CODE" >&2
  exit 1
fi
echo "Health check passed"

# Deploy
echo "Starting deployment..."
RESPONSE=\\$(curl -s -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_KEY" \\
  -d "{\\"target\\": \\"$TARGET\\"}" \\
  https://api.example.com/deploy)

echo "Deploy response:"
echo "$RESPONSE" | jq .
echo "Deployment to $TARGET complete!"`,
          takeaway: `This script demonstrates the key patterns for production bash: set -euo pipefail for safety, environment variable validation, argument defaults, curl with status code checking, and clear error messages to stderr. This is the quality bar for scripts you write as an FDE.`,
        },
      ],
    },

    // ================================================================
    // 15. Bash for the Anthropic API: curl + jq in anger
    // ================================================================
    {
      title: "Bash for the Anthropic API: curl + jq in anger",
      blocks: [
        {
          kind: "prose",
          markdown: `As an FDE you will hit the Anthropic API from the terminal more often than you expect: smoke-testing a customer's prompt before opening Python, reproducing a bug from a curl log, running a quick eval against 50 prompts, checking latency p95 on a fresh model. The Python SDK is your default — but \`curl | jq\` is what you reach for when you need an answer in 30 seconds, not 3 minutes.

This section drills the three patterns you will use constantly:

1. **Single-shot curl** to \`/v1/messages\` with a hand-rolled JSON body
2. **jq** to pluck \`content[0].text\`, usage tokens, and stop reasons out of the response
3. **xargs** to fan a prompt list out to N parallel requests with a concurrency cap

Everything here uses the public Anthropic Messages API surface. The point is not to memorize the JSON shape — it is to memorize the **bash plumbing** so you stop fighting the shell and start solving the customer's problem.`,
        },
        {
          kind: "method_ref",
          title: "Anthropic API one-liners (Messages)",
          importLine: `export ANTHROPIC_API_KEY="sk-ant-..."  # always read from env, never hardcode`,
          methods: [
            {
              signature: `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-opus-4-5","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'`,
              description: `Smallest possible Messages call. Required headers: x-api-key, anthropic-version, content-type. Required body fields: model, max_tokens, messages.`,
              returns: `JSON response with id, type, role, content[], model, stop_reason, usage{input_tokens, output_tokens}`,
            },
            {
              signature: `... | jq -r '.content[0].text'`,
              description: `Extract just the assistant's text. -r drops the surrounding quotes so you can pipe it onward (into another command, into a file, etc.).`,
            },
            {
              signature: `... | jq '{tokens: .usage, stop: .stop_reason}'`,
              description: `Quick health-check: did we hit max_tokens? How many tokens did this cost? Best habit for any eval loop.`,
            },
            {
              signature: `... | jq -c '.content[] | select(.type=="tool_use") | {name, input}'`,
              description: `Filter tool_use blocks out of a response with tools. -c gives one compact JSON object per line — perfect for piping into another tool.`,
            },
            {
              signature: `curl -N ... -d '{"stream": true, ...}' | jq -c --unbuffered 'select(.type=="content_block_delta") | .delta.text'`,
              description: `Stream tokens. -N disables curl's output buffering; --unbuffered makes jq flush each event as it arrives. Without both flags streaming "works" but feels frozen.`,
            },
            {
              signature: `cat prompts.txt | xargs -P 5 -I{} curl -s ... -d '{"messages":[{"role":"user","content":"{}"}]}' > out.ndjson`,
              description: `Fan out one curl per line of prompts.txt, 5 in parallel. Output is concatenated JSONL — readable by jq, pandas, DuckDB, anything.`,
            },
          ],
        },
        {
          kind: "code_predict",
          label: "extract the assistant's reply with jq -r",
          code: `# response.json contains:
# {
#   "id": "msg_01ABC",
#   "type": "message",
#   "role": "assistant",
#   "content": [
#     {"type": "text", "text": "Hello! How can I help?"}
#   ],
#   "model": "claude-opus-4-5",
#   "stop_reason": "end_turn",
#   "usage": {"input_tokens": 12, "output_tokens": 8}
# }

cat response.json | jq -r '.content[0].text'`,
          output: `Hello! How can I help?`,
          explanation: `.content is an array of blocks; .content[0] picks the first block; .text gets its text field. -r ("raw") strips the JSON quotes so the output is plain text suitable for piping. Without -r you would see "Hello! How can I help?" with literal quotes around it.`,
        },
        {
          kind: "code_predict",
          label: "compute total tokens across a JSONL eval log",
          code: `# eval_results.ndjson — one JSON response per line, 3 lines total:
# {"usage":{"input_tokens":120,"output_tokens":45},"stop_reason":"end_turn"}
# {"usage":{"input_tokens":80,"output_tokens":200},"stop_reason":"end_turn"}
# {"usage":{"input_tokens":150,"output_tokens":300},"stop_reason":"max_tokens"}

jq -s '[.[].usage.output_tokens] | add' eval_results.ndjson`,
          output: `545`,
          explanation: `jq -s ("slurp") reads the whole stream into one array. .[].usage.output_tokens emits one number per record; wrapping in [ ... ] re-collects them; | add sums. 45 + 200 + 300 = 545. This is the bash equivalent of pandas df["output_tokens"].sum() — fast enough for thousand-line logs.`,
        },
        {
          kind: "code_predict",
          label: "find every response that hit max_tokens",
          code: `# eval_results.ndjson (same 3 lines as above):
# {"id":"msg_a","usage":{"output_tokens":45},"stop_reason":"end_turn"}
# {"id":"msg_b","usage":{"output_tokens":200},"stop_reason":"end_turn"}
# {"id":"msg_c","usage":{"output_tokens":300},"stop_reason":"max_tokens"}

jq -r 'select(.stop_reason == "max_tokens") | .id' eval_results.ndjson`,
          output: `msg_c`,
          explanation: `select(...) is jq's WHERE clause — it keeps records matching the predicate and drops the rest. This is the single most useful jq idiom for evals: which prompts ran out of room, which timed out, which errored. Pipe to wc -l to count.`,
        },
        {
          kind: "warm_up",
          title: "fill in the curl headers",
          prompt: `An Anthropic Messages API call requires three headers. Fill in the missing two:

\`\`\`bash
curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "_______________: 2023-06-01" \\
  -H "_______________: application/json" \\
  -d '...'
\`\`\``,
          answer: `anthropic-version, content-type`,
          explanation: `anthropic-version is required on every request — it pins the response schema to a known version. content-type tells the server you are sending JSON. Forgetting anthropic-version is the #1 cause of "why is this giving a 400" when copy-pasting curl from a different SDK.`,
        },
        {
          kind: "code_predict",
          label: "fan-out with xargs -P (parallel curl)",
          code: `# prompts.txt:
# Summarize the French Revolution in one sentence.
# Explain why the sky is blue, briefly.
# What is the capital of Mongolia?

# How many curl processes run at once?
cat prompts.txt | xargs -P 3 -I{} -d '\\n' \\
  curl -s https://api.anthropic.com/v1/messages \\
    -H "x-api-key: $ANTHROPIC_API_KEY" \\
    -H "anthropic-version: 2023-06-01" \\
    -H "content-type: application/json" \\
    -d '{"model":"claude-opus-4-5","max_tokens":100,"messages":[{"role":"user","content":"{}"}]}' \\
  >> out.ndjson`,
          output: `3`,
          explanation: `-P 3 sets the parallelism cap. xargs spawns up to 3 curl processes concurrently and as soon as one finishes, starts the next from the queue. -I{} swaps the prompt into the JSON body. -d '\\n' tells xargs to split input on newlines only (so prompts can contain spaces). Append (>>) is safe because each curl writes one line atomically — but for production evals you want a per-record tempfile + concat to be 100% safe.`,
        },
        {
          kind: "code_comparison",
          label: "sequential vs parallel eval loops",
          left: {
            title: "Sequential (the obvious version)",
            code: `while IFS= read -r prompt; do
  curl -s https://api.anthropic.com/v1/messages \\
    -H "x-api-key: $ANTHROPIC_API_KEY" \\
    -H "anthropic-version: 2023-06-01" \\
    -H "content-type: application/json" \\
    -d "{\\"model\\":\\"claude-opus-4-5\\",\\"max_tokens\\":100,
        \\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"$prompt\\"}]}" \\
    >> out.ndjson
done < prompts.txt
# 100 prompts × ~2s each = ~3.5 minutes`,
            annotation: `One request at a time. Easy to read, but every prompt waits for the previous to finish.`,
          },
          right: {
            title: "Parallel with xargs -P",
            code: `cat prompts.txt | xargs -P 10 -I{} -d '\\n' \\
  curl -s https://api.anthropic.com/v1/messages \\
    -H "x-api-key: $ANTHROPIC_API_KEY" \\
    -H "anthropic-version: 2023-06-01" \\
    -H "content-type: application/json" \\
    -d '{"model":"claude-opus-4-5","max_tokens":100,
         "messages":[{"role":"user","content":"{}"}]}' \\
  >> out.ndjson
# 100 prompts ÷ 10 parallel ≈ 20 seconds`,
            annotation: `-P 10 caps concurrency. ~10x faster on 100 prompts — the network IO overlaps.`,
          },
          takeaway: `For ad-hoc eval loops, xargs -P is hard to beat: zero code, built into every box, gives you a tunable concurrency knob. The only thing it does not give you is structured retry on 429/529 — for that, drop into Python.`,
        },
        {
          kind: "scenario_predict",
          label: "rate-limit retry with curl",
          scenario: `RESP=$(curl -s -w "\\n%{http_code}" https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-opus-4-5","max_tokens":100,
       "messages":[{"role":"user","content":"hi"}]}')

CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [[ "$CODE" == "429" ]]; then
  echo "rate-limited, sleeping"
  sleep 5
fi`,
          language: "bash",
          question: `Why use \`-w "\\n%{http_code}"\` plus \`tail\`/\`sed\` instead of just \`curl -s\` and checking the body?`,
          answer: `Because curl exits 0 even on HTTP 429 — the response body is "successful" from curl's perspective. You need the actual HTTP status code to branch on, and -w "%{http_code}" is how you ask curl to print it.`,
          explanation: `curl's exit code is about whether the network call succeeded (got bytes back), not whether the server liked the request. To branch on 429 / 529 / 5xx you must capture the HTTP code separately. The "\\n" before %{http_code} puts it on its own line so you can split body and code with tail/sed. The cleaner alternative is curl -o body.json -w "%{http_code}" — write the body to a file and let curl print just the status code to stdout.`,
        },
        {
          kind: "mini_challenge",
          title: "Eval one-liner: success rate + p95 latency",
          prompt: `You ran 100 prompts through the Messages API and captured each response (with \`-w '%{http_code} %{time_total}\\n'\` appended) into \`eval.ndjson\`. The status code and latency live on the **last line** after each JSON body, like:

\`\`\`
{"id":"msg_a","content":[...],"usage":{...},"stop_reason":"end_turn"}
200 1.245
{"type":"error","error":{...}}
429 0.082
\`\`\`

In bash (no Python), compute:
1. The **success rate** (fraction of 200s)
2. The **p95 latency** of successful requests`,
          hints: [
            "awk is the right tool — it lets you split on whitespace, compare strings, and accumulate counters in one pass.",
            "For the success rate: count lines matching '^200 ' and divide by total status lines.",
            "For p95: extract the latency column for 200s with awk, sort numerically, and pick the 95th index. p95 of 100 values = the 95th value when sorted ascending.",
            "Combining both: a single awk pass for the success rate, plus a pipe-based one-liner for p95.",
          ],
          solution: `# 1. Success rate
TOTAL=$(grep -E '^[0-9]{3} ' eval.ndjson | wc -l)
OK=$(grep -E '^200 ' eval.ndjson | wc -l)
echo "success rate: $(awk -v ok=$OK -v t=$TOTAL 'BEGIN{printf "%.2f%%\\n", 100*ok/t}')"

# 2. p95 latency of successful requests
grep -E '^200 ' eval.ndjson \\
  | awk '{print $2}' \\
  | sort -n \\
  | awk 'BEGIN{c=0} {a[c++]=$1} END{print a[int(c*0.95)]}'

# Or, a single awk that does both:
awk '
  /^[0-9]{3} / { total++; if ($1=="200") { ok++; lat[++n]=$2 } }
  END {
    printf "success: %.2f%%\\n", 100*ok/total
    # sort lat[] — awk does not have a built-in sort, so use asort()
    asort(lat)
    printf "p95: %.3fs\\n", lat[int(n*0.95)]
  }
' eval.ndjson`,
          takeaway: `This is the canonical FDE move: "we shipped a new prompt — what's the success rate and tail latency?" You should be able to write this in under 60 seconds without googling. awk handles the streaming aggregation; sort -n handles ordering; arithmetic is one line of awk. No Python, no pandas, no overhead — just the right two tools composed.`,
        },
        {
          kind: "flashcard",
          front: `When should you reach for **bash + curl + jq** vs. the **Anthropic Python SDK**?`,
          back: `**Bash** when you need an answer fast and the loop is tiny: smoke-test one prompt, scan a streaming SSE response, sanity-check a header, fan 50 prompts out for a quick eval.

**Python SDK** when you need: retries with backoff and jitter, typed responses, complex tool loops, streaming with cancellation, anything you will check into git. Rule of thumb: if you would catch an exception, you want the SDK.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `**Every Anthropic API workflow in bash is the same three-stage pipeline:** \`curl\` (get JSON over the wire) → \`jq\` (extract / filter / reshape) → \`xargs\` or \`awk\` (loop / aggregate). Memorize one full example per stage and you can build any ad-hoc eval, smoke test, or production triage tool in seconds.`,
        },
      ],
    },

    // ================================================================
    // 16. What to practice next
    // ================================================================
    {
      title: "What to practice next",
      blocks: [
        {
          kind: "prose",
          markdown: `You now have the core bash toolkit for FDE work:

- **Pipes & redirects** — composing commands, directing output
- **grep / sed / awk** — searching and transforming text
- **find & xargs** — batch file operations
- **Variables, loops, conditionals** — writing scripts
- **String manipulation** — parameter expansion for filenames, extensions, replacements
- **Command & process substitution** — capturing output
- **Exit codes & set -euo pipefail** — error handling
- **Signals & traps** — cleanup and resource management
- **jq** — JSON processing
- **curl** — API interaction and debugging
- **Environment variables** — configuration management
- **Anthropic API in anger** — curl + jq + xargs for smoke tests, evals, and triage

**What to practice next:**

1. **SSH & remote work** — \`ssh\`, \`scp\`, \`rsync\`, SSH tunnels. You will SSH into customer machines constantly.
2. **tmux / screen** — terminal multiplexing for long-running sessions. Essential when SSH connections might drop.
3. **Docker CLI** — \`docker logs\`, \`docker exec\`, \`docker-compose\`. Many customer deployments are containerized.
4. **Git from the CLI** — \`git log --oneline\`, \`git diff\`, \`git bisect\`. Faster than any GUI.
5. **Regular expressions** — level up your grep/sed/awk with more advanced patterns.
6. **Shell scripting idioms** — arrays, associative arrays, \`getopts\` for argument parsing, heredocs for multi-line strings.

The best way to practice: **stop using GUIs**. Force yourself to do everything from the terminal for a week. Check API responses with curl instead of Postman. Search code with grep instead of your IDE. The discomfort fades fast and the speed compounds.`,
        },
      ],
    },
  ],
};
