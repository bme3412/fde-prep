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

The **pipe** (\`|\`) connects the stdout of one command to the stdin of the next. The **redirect** (\`>\`, \`>>\`, \`2>\`) sends a stream to a file instead of the terminal.

Think of it physically: every program is a box with an "in" hole, an "out" hole, and an "error" hole. A pipe is a tube connecting one box's "out" to the next box's "in." A redirect plugs a file into one of those holes instead of the default terminal.

This is the Unix philosophy in action: small tools that each do one thing, composed via pipes. \`grep\` does not know how to count lines — that is \`wc\`'s job. \`sort\` does not know how to deduplicate — that is \`uniq\`'s job. You compose them.`,
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
          explanation: `cat reads the file to stdout. grep ERROR filters to only lines containing "ERROR" (3 lines). wc -l counts those lines. Each pipe connects stdout of the left command to stdin of the right.`,
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
          takeaway: `Use > to create/overwrite, >> to append. Getting this wrong can destroy log files.`,
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
          explanation: `2>&1 means "send file descriptor 2 (stderr) to wherever file descriptor 1 (stdout) is going." Since stdout is already redirected to output.txt, stderr goes there too. Without 2>&1, the error message would print to the terminal instead of the file.`,
        },
        {
          kind: "code_predict",
          label: "tee: writing to a file AND the terminal",
          code: `echo "Hello World" | tee output.txt | wc -c`,
          output: `12`,
          explanation: `tee copies stdin to both a file AND stdout. Here "Hello World\\n" (12 bytes including the newline) is written to output.txt AND piped to wc -c. This is essential when you want to save output while also processing it further in the pipeline. Without tee, you would have to choose between redirecting to a file or piping.`,
        },
        {
          kind: "code_predict",
          label: "here-strings with <<<",
          code: `# Feed a string directly as stdin (no echo | needed)
grep -o "world" <<< "hello world"`,
          output: `world`,
          explanation: `<<< feeds a string to a command's stdin without needing echo and a pipe. It is cleaner and more efficient than echo "hello world" | grep -o "world". The -o flag makes grep print only the matching portion.`,
        },
        {
          kind: "key_insight",
          label: "Unix philosophy",
          insight: `Pipes are the glue of Unix. Each command does one small thing well (filter, transform, count, sort). You compose them into powerful pipelines. This is why \`grep | sort | uniq -c | sort -rn\` can replace a 50-line Python script.

The core building blocks: \`cat\` reads, \`grep\` filters, \`sed\` transforms, \`awk\` extracts, \`sort\` orders, \`uniq\` deduplicates, \`wc\` counts, \`head\`/\`tail\` trims, \`tee\` duplicates. Learn these ten commands and you can build almost any text-processing pipeline.`,
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

Master these and you can tear through any log file. In a real FDE scenario, you will often chain all three: grep to narrow down to relevant lines, awk to extract a specific field, sed to clean up the output.`,
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
          explanation: `The -i flag makes grep case-insensitive, matching "Error", "error", and "ERROR". Without -i, only exact case matches would appear.`,
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
          explanation: `-c prints the count of matching lines per file. -l prints only the filenames that contain at least one match (web.log is excluded because it has 0 matches).`,
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
          explanation: `-r searches recursively through directories. -n adds line numbers. This is one of the most common patterns for finding things in a codebase.`,
        },
        {
          kind: "code_predict",
          label: "sed substitution",
          code: `echo "Hello World" | sed 's/World/Bash/'`,
          output: `Hello Bash`,
          explanation: `sed 's/old/new/' replaces the first occurrence of "old" with "new" on each line. Add the g flag (s/old/new/g) to replace ALL occurrences on each line.`,
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
          explanation: `sed '/pattern/d' deletes lines matching the pattern. ^# matches lines starting with #. This is useful for stripping comments from config files. The original file is unchanged — sed outputs to stdout by default.`,
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
          kind: "key_insight",
          label: "grep filters rows, awk filters columns",
          insight: `Think of your data as a table. \`grep\` selects which **rows** to keep (like SQL WHERE). \`awk\` selects which **columns** to show (like SQL SELECT). \`sed\` transforms **cell values** (like SQL UPDATE). When you need to find lines with errors, extract the timestamp column, and reformat the date — that is grep | awk | sed.`,
        },
        {
          kind: "warm_up",
          title: "count errors in a log",
          prompt: `Write a one-liner that counts how many lines in \`app.log\` contain the word "ERROR" (case-sensitive).`,
          answer: `grep -c "ERROR" app.log`,
          explanation: `grep -c returns only the count. You could also do grep "ERROR" app.log | wc -l but -c is cleaner.`,
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
          explanation: `-name "*.py" matches files ending in .py. -type f restricts to regular files (not directories). find recursively walks the directory tree by default.`,
        },
        {
          kind: "code_predict",
          label: "find with -mtime",
          code: `# Find files modified in the last 24 hours
find /var/log -name "*.log" -mtime -1 -type f`,
          output: `/var/log/syslog.log
/var/log/auth.log`,
          explanation: `-mtime -1 means "modified less than 1 day ago." Use +7 for "more than 7 days ago." This is essential for finding recent log files or cleaning up old temp files.`,
        },
        {
          kind: "code_predict",
          label: "find piped to xargs",
          code: `# Count total lines across all Python files
find src/ -name "*.py" -type f | xargs wc -l | tail -1`,
          output: `  1247 total`,
          explanation: `find produces a list of .py files. xargs takes that list and passes all filenames as arguments to wc -l. The tail -1 grabs just the total line. This is a quick way to measure codebase size.`,
        },
        {
          kind: "code_comparison",
          label: "find -exec vs xargs",
          left: {
            title: "find -exec (one at a time)",
            code: `find . -name "*.tmp" \\
  -exec rm {} \\;`,
            annotation: `Runs rm once per file. Slower for many files.`,
          },
          right: {
            title: "find | xargs (batched)",
            code: `find . -name "*.tmp" \\
  | xargs rm`,
            annotation: `Passes many files to one rm call. Faster.`,
          },
          takeaway: `xargs batches arguments for efficiency. Use -exec when you need per-file logic (like renaming). Use xargs when you just need to feed files to a command.`,
        },
        {
          kind: "code_predict",
          label: "find with -size and multiple conditions",
          code: `# Find large log files that haven't been modified recently
find /var/log -name "*.log" -size +100M -mtime +30 -type f`,
          output: `/var/log/old-app.log
/var/log/archive/debug.log`,
          explanation: `-size +100M finds files larger than 100 megabytes. -mtime +30 means "modified more than 30 days ago." Multiple conditions are AND'd together by default. This is the standard pattern for disk cleanup — find old, large files that are safe to remove.`,
        },
        {
          kind: "code_predict",
          label: "xargs with -I for placeholders",
          code: `# Create a backup of each config file
find /etc/app -name "*.conf" -type f | xargs -I{} cp {} {}.backup`,
          output: `(no output — creates .backup copies of each file)`,
          explanation: `-I{} tells xargs to replace {} with each input item. This lets you use the filename in multiple positions within the command. Without -I, xargs just appends items to the end of the command.`,
        },
        {
          kind: "key_insight",
          label: "Handle spaces in filenames",
          insight: `Filenames with spaces break the basic \`find | xargs\` pattern because xargs splits on whitespace by default. Use the null-delimiter combo to handle any filename safely:

\`\`\`bash
find . -name "*.log" -print0 | xargs -0 rm
\`\`\`

\`-print0\` separates filenames with null bytes instead of newlines. \`-0\` tells xargs to expect null-delimited input. Always use this pattern in production scripts where you cannot control filenames.`,
        },
        {
          kind: "warm_up",
          title: "delete all .pyc files",
          prompt: `Write a command to find and delete all \`.pyc\` files under the current directory.`,
          answer: `find . -name "*.pyc" -type f | xargs rm -f`,
          explanation: `find locates the files, xargs feeds them to rm. The -f flag prevents errors if no files match. You could also use find . -name "*.pyc" -delete.`,
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
          kind: "code_predict",
          label: "variable assignment — the spacing trap",
          code: `# Which of these works?
NAME="Alice"
echo "Hello $NAME"

# vs.
# NAME = "Alice"   <-- this would FAIL`,
          output: `Hello Alice`,
          explanation: `In bash, variable assignment must have NO spaces around the =. Writing NAME = "Alice" makes bash interpret NAME as a command and = as its first argument. This is the #1 bash gotcha for beginners.`,
        },
        {
          kind: "code_predict",
          label: "for loop",
          code: `for fruit in apple banana cherry; do
  echo "I like $fruit"
done`,
          output: `I like apple
I like banana
I like cherry`,
          explanation: `The for-in loop iterates over a space-separated list. The do/done keywords delimit the loop body. Each value is assigned to the variable (fruit) in turn.`,
        },
        {
          kind: "code_predict",
          label: "looping over command output",
          code: `# files in current directory: a.txt b.txt c.txt
for f in *.txt; do
  lines=\$(wc -l < "$f")
  echo "$f: $lines lines"
done`,
          output: `a.txt: 10 lines
b.txt: 3 lines
c.txt: 25 lines`,
          explanation: `The glob *.txt expands to matching files. The \\$(wc -l < "$f") captures the line count for each file. Note the quotes around "$f" — always quote variables that might contain spaces.`,
        },
        {
          kind: "code_predict",
          label: "if/then with [[ ]]",
          code: `FILE="config.json"
if [[ -f "$FILE" ]]; then
  echo "Config found"
else
  echo "Config missing!"
  exit 1
fi`,
          output: `Config found`,
          explanation: `[[ -f "$FILE" ]] tests if the file exists and is a regular file. Other useful tests: -d (directory exists), -z (string is empty), -n (string is non-empty), -eq/-lt/-gt (numeric comparison).`,
        },
        {
          kind: "code_predict",
          label: "while read loop — processing lines from a file",
          code: `# users.csv contains:
# alice,admin
# bob,user
# carol,admin

while IFS=',' read -r name role; do
  echo "$name is a $role"
done < users.csv`,
          output: `alice is a admin
bob is a user
carol is a admin`,
          explanation: `while read loops are the standard way to process a file line by line. IFS=',' sets the field separator to comma. -r prevents backslash interpretation. The < users.csv at the end redirects the file into the entire loop's stdin. This pattern is safer than for-looping over \$(cat file) because it handles spaces and special characters correctly.`,
        },
        {
          kind: "code_predict",
          label: "case statement — cleaner than if/elif chains",
          code: `ENVIRONMENT="production"

case "$ENVIRONMENT" in
  production)
    echo "Using prod database"
    ;;
  staging)
    echo "Using staging database"
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac`,
          output: `Using prod database`,
          explanation: `case is bash's switch statement. Each pattern ends with ). Each branch ends with ;;. The * pattern is the default/fallback case. case is cleaner than a long if/elif/elif chain when matching a single variable against multiple values.`,
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

Rule: always write \`"$var"\` with double quotes unless you specifically want word splitting (rare). This applies everywhere: \`if [[ -f "$file" ]]\`, \`for f in "$@"\`, \`echo "$result"\`.`,
        },
        {
          kind: "warm_up",
          title: "loop over .txt files",
          prompt: `Write a loop that prints the filename and line count for every \`.txt\` file in the current directory.`,
          answer: `for f in *.txt; do echo "$f: \\$(wc -l < "$f") lines"; done`,
          explanation: `The glob *.txt expands to all matching files. wc -l < "$f" counts lines (using < avoids printing the filename). Always quote "$f" in case filenames contain spaces.`,
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

These let you use command output anywhere you would use a string or a filename.`,
        },
        {
          kind: "code_predict",
          label: "command substitution",
          code: `TODAY=\$(date +%Y-%m-%d)
echo "Today is $TODAY"
echo "There are \$(ls *.py | wc -l) Python files"`,
          output: `Today is 2024-01-15
There are 7 Python files`,
          explanation: `\\$(command) runs the command and substitutes its stdout inline. You can use it in variable assignments or directly inside strings. The older backtick syntax (\\\`command\\\`) does the same thing but is harder to nest.`,
        },
        {
          kind: "code_predict",
          label: "process substitution",
          code: `# Compare sorted versions of two files
diff <(sort file1.txt) <(sort file2.txt)`,
          output: `2a3
> extra_line_in_file2`,
          explanation: `<(sort file1.txt) creates a temporary file-like object containing the sorted output. diff sees two "files" to compare. Without process substitution, you would need to create temporary files manually.`,
        },
        {
          kind: "warm_up",
          title: "capture today's date",
          prompt: `Write a command that sets a variable called BACKUP_NAME to "backup-2024-01-15" (using the current date dynamically).`,
          answer: `BACKUP_NAME="backup-\\$(date +%Y-%m-%d)"`,
          explanation: `\\$(date +%Y-%m-%d) runs the date command with a format string and substitutes the output. The result is assigned to the variable.`,
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
- **\`\${var#pattern}\`** — remove shortest match from the **start**
- **\`\${var##pattern}\`** — remove longest match from the **start**
- **\`\${var%pattern}\`** — remove shortest match from the **end**
- **\`\${var%%pattern}\`** — remove longest match from the **end**
- **\`\${var/old/new}\`** — replace first occurrence
- **\`\${var//old/new}\`** — replace all occurrences
- **\`\${#var}\`** — string length
- **\`\${var:offset:length}\`** — substring extraction

Memory trick: \`#\` is on the left side of \`$\` on your keyboard, so it strips from the left (start). \`%\` is on the right side, so it strips from the right (end).`,
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
          label: "string replacement and length",
          code: `MSG="Hello World World"

echo "\${MSG/World/Bash}"
echo "\${MSG//World/Bash}"
echo "Length: \${#MSG}"
echo "Substr: \${MSG:6:5}"`,
          output: `Hello Bash World
Hello Bash Bash
Length: 17
Substr: World`,
          explanation: `Single / replaces only the first match. Double // replaces all matches. \${#var} gives the string length. \${var:offset:length} extracts a substring starting at offset (0-indexed) for length characters.`,
        },
        {
          kind: "code_predict",
          label: "case conversion (bash 4+)",
          code: `NAME="hello world"

echo "\${NAME^}"
echo "\${NAME^^}"

UPPER="HELLO"
echo "\${UPPER,,}"`,
          output: `Hello world
HELLO WORLD
hello`,
          explanation: `^ uppercases the first character, ^^ uppercases all characters. , lowercases the first character, ,, lowercases all. These are bash 4+ features — they will not work on older macOS default bash (3.2) but work everywhere else.`,
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

Use parameter expansion for simple string operations inside loops. Save \`sed\`/\`awk\` for complex transformations or when processing file contents.`,
        },
        {
          kind: "warm_up",
          title: "rename file extensions",
          prompt: `Write a one-liner loop that renames all \`.txt\` files in the current directory to \`.md\`. Use parameter expansion, not \`sed\`.`,
          answer: `for f in *.txt; do mv "$f" "\${f%.txt}.md"; done`,
          explanation: `\${f%.txt} strips the .txt suffix from the end of the filename. We then append .md. This is the idiomatic bash way to batch-rename files by extension.`,
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

The variable \`$?\` holds the exit code of the last command. You can use \`&&\` (run next only if previous succeeded) and \`||\` (run next only if previous failed) to chain commands based on success/failure.`,
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
          explanation: `$? gives the exit code of the previous command. ls /tmp succeeds (exit 0). ls /nonexistent fails (exit 2 — "no such file"). We redirect output to /dev/null to keep things clean.`,
        },
        {
          kind: "code_predict",
          label: "|| fallback pattern",
          code: `# Try to read config, fall back to default
CONFIG=\$(cat config.json 2>/dev/null) || CONFIG='{"port": 8080}'
echo "$CONFIG"`,
          output: `{"port": 8080}`,
          explanation: `If cat config.json fails (file doesn't exist), the || runs the fallback assignment. This is the bash equivalent of a try/catch with a default value. 2>/dev/null suppresses the error message.`,
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
            annotation: `cd fails silently, rm runs in the CURRENT directory. Catastrophic!`,
          },
          right: {
            title: "With set -euo pipefail",
            code: `#!/bin/bash
set -euo pipefail
cd /wrong/path
rm -rf *
echo "Done"`,
            annotation: `cd fails, script exits immediately. rm never runs. Safe!`,
          },
          takeaway: `set -e exits on any error. set -u exits on undefined variables. set -o pipefail catches errors in pipes. Always start scripts with set -euo pipefail.`,
        },
        {
          kind: "key_insight",
          label: "Start every script with set -euo pipefail",
          insight: `This is the single most important line in bash scripting:

\`\`\`bash
set -euo pipefail
\`\`\`

- **-e** — exit immediately if any command fails
- **-u** — treat unset variables as errors (catches typos)
- **-o pipefail** — a pipe fails if ANY command in it fails (not just the last one)

Without this, bash happily continues after errors, leading to data loss and corrupted state. Every production script should start with this.`,
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

The \`trap\` command registers a function to run when the script receives a signal:

| Signal | Number | Trigger |
|--------|--------|---------|
| **EXIT** | — | Script exits for any reason |
| **INT** | 2 | User presses Ctrl+C |
| **TERM** | 15 | \`kill PID\` (default signal) |
| **HUP** | 1 | Terminal closed / SSH disconnected |

The most important pattern: **trap cleanup EXIT**. This runs your cleanup function no matter how the script ends — normal exit, error, or signal. It is the bash equivalent of \`try/finally\`.`,
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
          explanation: `mktemp creates a secure temporary file. The trap registers a cleanup command that runs when the script exits — whether normally, due to an error (set -e), or due to Ctrl+C. Without the trap, the temp file would be left behind on errors. This is the single most important pattern for writing production bash scripts.`,
        },
        {
          kind: "code_predict",
          label: "trap with a cleanup function",
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
          explanation: `The cleanup function handles multiple resources: killing a background process and removing a temp directory. trap cleanup EXIT ensures it runs no matter what. The || true after kill prevents the script from failing if the process already exited. $! holds the PID of the last background process.`,
        },
        {
          kind: "key_insight",
          label: "Always use trap EXIT for cleanup",
          insight: `Any script that creates temporary files, directories, lock files, or background processes should have a \`trap cleanup EXIT\` near the top. This is non-negotiable for production scripts.

\`\`\`bash
TMPFILE=\$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
\`\`\`

Without this, your temp files accumulate on every error, every Ctrl+C, every SSH disconnect. On a customer's server, leftover temp files from a crashed script are embarrassing and potentially dangerous (they can fill up /tmp).`,
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
          code: `echo '{"name": "Alice", "age": 30, "city": "NYC"}' | jq '.name'`,
          output: `"Alice"`,
          explanation: `.name extracts the "name" field. jq outputs JSON by default, so strings include quotes. Use -r (raw output) to strip the quotes: jq -r '.name' would output just Alice.`,
        },
        {
          kind: "code_predict",
          label: "jq array iteration",
          code: `echo '[{"id": 1, "name": "foo"}, {"id": 2, "name": "bar"}]' | jq '.[].name'`,
          output: `"foo"
"bar"`,
          explanation: `.[] iterates over all elements in the array. .name then extracts the name field from each element. This pattern — .[].field — is the most common jq operation.`,
        },
        {
          kind: "code_predict",
          label: "jq select (filtering)",
          code: `echo '[
  {"name": "web", "status": "running"},
  {"name": "db", "status": "stopped"},
  {"name": "cache", "status": "running"}
]' | jq '.[] | select(.status == "running") | .name'`,
          output: `"web"
"cache"`,
          explanation: `select() filters elements based on a condition. The pipe inside jq works like Unix pipes — data flows left to right. We iterate the array, filter to running services, then extract names.`,
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
  {"name": "web", "cpu": 45, "memory": 512},
  {"name": "db", "cpu": 92, "memory": 2048},
  {"name": "cache", "cpu": 12, "memory": 256}
]' | jq '[.[] | select(.cpu > 40) | {service: .name, cpu_pct: .cpu}]'`,
          output: `[
  {
    "service": "web",
    "cpu_pct": 45
  },
  {
    "service": "db",
    "cpu_pct": 92
  }
]`,
          explanation: `This chains multiple operations: .[] iterates the array, select(.cpu > 40) filters to high-CPU services, {service: .name, cpu_pct: .cpu} reshapes each object with new field names, and wrapping everything in [...] collects the results back into an array. This is a very common pattern for transforming API responses.`,
        },
        {
          kind: "code_predict",
          label: "jq — map, length, and aggregation",
          code: `echo '{"users": [
  {"name": "Alice", "role": "admin"},
  {"name": "Bob", "role": "user"},
  {"name": "Carol", "role": "admin"},
  {"name": "Dave", "role": "user"}
]}' | jq '{
  total: (.users | length),
  admins: [.users[] | select(.role == "admin") | .name]
}'`,
          output: `{
  "total": 4,
  "admins": [
    "Alice",
    "Carol"
  ]
}`,
          explanation: `This builds a summary object. length counts array elements. The admin names are collected by iterating, filtering with select, extracting .name, and wrapping in []. Parentheses around (.users | length) are needed so jq evaluates the pipe before assigning to the key.`,
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
          label: "curl POST with JSON body",
          code: `curl -s -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-abc123" \\
  -d '{"name": "Alice", "email": "alice@example.com"}'`,
          output: `{"id": 42, "name": "Alice", "email": "alice@example.com", "created_at": "2024-01-15T10:30:00Z"}`,
          explanation: `-s is silent mode (no progress bar). -X POST sets the method. -H adds headers. -d sets the request body. This is the standard pattern for any API call with a JSON body.`,
        },
        {
          kind: "code_predict",
          label: "curl piped to jq",
          code: `curl -s https://api.example.com/models | jq '.data[] | {id: .id, created: .created}'`,
          output: `{
  "id": "claude-3-opus",
  "created": 1698958800
}
{
  "id": "claude-3-sonnet",
  "created": 1698958800
}`,
          explanation: `curl fetches the JSON. jq iterates over the data array and constructs a new object with only the fields we care about. This is the bread and butter of API debugging from the terminal.`,
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
          kind: "warm_up",
          title: "GET with pretty-printed JSON",
          prompt: `Write a curl command that hits \`https://api.example.com/health\` and pretty-prints the JSON response.`,
          answer: `curl -s https://api.example.com/health | jq .`,
          explanation: `jq . is the identity filter — it just pretty-prints the JSON with indentation and syntax highlighting. The -s flag suppresses curl's progress bar so it does not interfere with the JSON output.`,
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

Without \`export\`, a variable is local to the current shell and invisible to any command you run.`,
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
          kind: "warm_up",
          title: "set default if not already set",
          prompt: `Write a one-liner that sets DATABASE_URL to "postgresql://localhost/mydb" only if it is not already set.`,
          answer: `export DATABASE_URL="\${DATABASE_URL:-postgresql://localhost/mydb}"`,
          explanation: `The :- operator returns the default only if the variable is unset or empty. Combined with export, this ensures the variable is available to child processes. This pattern is common at the top of deployment scripts.`,
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
    // 15. What to practice next
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
