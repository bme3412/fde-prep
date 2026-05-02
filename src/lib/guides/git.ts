import type { StudyGuide } from "../guide-types";

export const gitGuide: StudyGuide = {
  topicTitle: "git patterns for collaborative work",
  topicSlug: "git-patterns-for-collaborative-work",
  sections: [
    // ================================================================
    // 1. Why git fluency matters
    // ================================================================
    {
      title: "Why git fluency matters",
      blocks: [
        {
          kind: "prose",
          markdown: `As a Field Development Engineer, you are constantly context-switching between codebases. One moment you are live-demoing how to integrate an SDK into a customer's repo. The next, you are prototyping a feature on a branch, pushing it up for review, and walking through the diff on a screen share. The audience is technical, and they notice when you fumble.

Git fluency matters here because it is visible. If you panic at a merge conflict, stare at a detached HEAD, or lose work because you ran the wrong reset, it erodes confidence in everything else you are showing. Conversely, if you calmly stash your work, cherry-pick the right commit, and resolve a conflict inline, it builds trust.

This guide covers the patterns you will actually use in collaborative, customer-facing work:

- **Staging with precision** so you commit only what you intend
- **Reading history** to understand unfamiliar codebases fast
- **Branching and rebasing** to keep pull requests clean
- **Undoing mistakes** without losing work
- **Working with remotes** including forks and upstream repos

Every section builds on the previous one. The goal is not to memorize flags, but to develop a mental model of what git is actually doing so you can reason through any situation on the fly.`,
        },
      ],
    },

    // ================================================================
    // 2. The three trees: working dir, staging, HEAD
    // ================================================================
    {
      title: "The three trees: working dir, staging, HEAD",
      blocks: [
        {
          kind: "prose",
          markdown: `Almost every git command moves content between three areas. If you understand these three areas, you can predict what any command will do.

**Working directory** — the files on disk, exactly as you see them in your editor. When you edit a file and save, the change lives here.

**Staging area (index)** — a snapshot of what will go into your next commit. When you run \`git add\`, you copy changes from the working directory into the staging area. Think of it as a loading dock: you put boxes on the dock, and when you are ready, you ship them all at once.

**HEAD** — the last commit on your current branch. When you run \`git commit\`, everything on the staging area gets packaged into a new commit, and HEAD moves forward to point at it.

Here is the flow: **Working dir** --add--> **Staging** --commit--> **HEAD**

Let's see this in practice. Suppose you create a file, stage it, and then modify it again before committing:`,
        },
        {
          kind: "code_predict",
          label: "tracking file states across the three areas",
          code: `echo "hello" > greeting.txt
git add greeting.txt
echo "hello world" > greeting.txt
git status`,
          output: `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	new file:   greeting.txt

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   greeting.txt`,
          explanation: `The file appears in two sections because it exists in two different states. The staging area has the version that says "hello" (from when we ran git add). The working directory has the newer version that says "hello world" (from the second echo). If you commit right now, only the "hello" version goes in. The "hello world" change is still unstaged.`,
        },
        {
          kind: "code_predict",
          label: "what happens after committing with unstaged changes",
          code: `# continuing from above...
git commit -m "add greeting"
git status`,
          output: `[main abc1234] add greeting
 1 file changed, 1 insertion(+)
 create mode 100644 greeting.txt
On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   greeting.txt`,
          explanation: `The commit captured the staged version ("hello"). The working directory still has "hello world", which was never staged. So git status shows the file as modified but not staged. This is why staging exists: it lets you control exactly what goes into each commit, even if your working directory has extra changes.`,
        },
        {
          kind: "key_insight",
          label: "Mental model",
          insight: `Every git command moves data between these three areas. \`git add\` copies from working dir to staging. \`git commit\` copies from staging to HEAD. \`git checkout\` / \`git restore\` copies from HEAD back to working dir. Once you see the three areas, commands stop feeling arbitrary.`,
        },
      ],
    },

    // ================================================================
    // 3. Staging with precision: add -p, reset, restore
    // ================================================================
    {
      title: "Staging with precision: add -p, reset, restore",
      blocks: [
        {
          kind: "prose",
          markdown: `In a demo or prototype, you often have debug prints, console.logs, and scratch code mixed in with real changes. You need to commit the real changes and leave the debug junk out. \`git add .\` stages everything, which is the opposite of precise.

The key tool for precision staging is \`git add -p\` (patch mode). Instead of staging whole files, it shows you each change one hunk at a time and asks: stage this? You answer \`y\` (yes), \`n\` (no), or \`s\` (split into smaller hunks). This lets you stage individual changes within a single file.`,
        },
        {
          kind: "code_comparison",
          label: "bulk staging vs. patch staging",
          left: {
            title: "git add . (everything)",
            code: `# Stages ALL changes in the repo
git add .
git commit -m "add feature"

# Problem: your debug prints,
# scratch notes, and unrelated
# fixes all go into one commit.`,
            annotation: "fast but imprecise",
          },
          right: {
            title: "git add -p (per-hunk)",
            code: `# Review each hunk interactively
git add -p
# Stage this hunk? [y/n/s/q]
# y = yes, n = no, s = split

git commit -m "add feature"

# Only the hunks you approved
# are in this commit.`,
            annotation: "precise and professional",
          },
          takeaway: `Use \`git add .\` when all your changes belong in one commit. Use \`git add -p\` when you need to separate concerns. In customer-facing work, prefer smaller, focused commits.`,
        },
        {
          kind: "code_predict",
          label: "unstaging a file with git restore",
          code: `# Suppose you accidentally staged a debug file
git add .
git status --short
# A  feature.py
# A  debug_notes.txt

# Unstage just the debug file:
git restore --staged debug_notes.txt
git status --short`,
          output: `A  feature.py
?? debug_notes.txt`,
          explanation: `git restore --staged moves a file back from the staging area to being untracked or just a working directory change. The file is not deleted from disk; it is simply removed from the "to be committed" list. feature.py stays staged because we only unstaged debug_notes.txt.`,
        },
        {
          kind: "warm_up",
          title: "unstaging a mistake",
          prompt: `You ran \`git add .\` and realize you staged a file called \`tmp_debug.py\` that should not be committed. What single command removes it from staging without deleting it from disk?`,
          answer: `git restore --staged tmp_debug.py`,
          explanation: `git restore --staged moves the file from the staging area back to the working directory. The older equivalent is \`git reset HEAD tmp_debug.py\`, but \`git restore --staged\` is the modern and clearer command.`,
        },
      ],
    },

    // ================================================================
    // 4. Commit archaeology: log, diff, show, blame
    // ================================================================
    {
      title: "Commit archaeology: log, diff, show, blame",
      blocks: [
        {
          kind: "prose",
          markdown: `When you are dropped into a customer's repo, you need to understand what happened recently. Who changed what, and why? Git gives you four core tools for this:

- \`git log\` — see the commit history
- \`git diff\` — see what changed between two points
- \`git show\` — see the full details of a specific commit
- \`git blame\` — see who last edited each line of a file

Let's practice reading the output of each one.`,
        },
        {
          kind: "code_predict",
          label: "reading git log --oneline",
          code: `git log --oneline -5`,
          output: `a1b2c3d Fix rate limiter edge case
e4f5g6h Add retry logic to API client
i7j8k9l Update SDK to v2.3.0
m0n1o2p Refactor auth middleware
q3r4s5t Initial project setup`,
          explanation: `The --oneline flag shows one commit per line: the short hash on the left, the commit message on the right. The -5 limits output to the 5 most recent commits. The newest commit is at the top. This is your first stop when you want a quick overview of what has been happening in a repo.`,
        },
        {
          kind: "code_predict",
          label: "reading git diff output",
          code: `git diff HEAD~1 -- api_client.py`,
          output: `diff --git a/api_client.py b/api_client.py
index 1234567..abcdefg 100644
--- a/api_client.py
+++ b/api_client.py
@@ -10,6 +10,9 @@ def call_api(url, payload):
     response = requests.post(url, json=payload)
-    return response.json()
+    for attempt in range(3):
+        response = requests.post(url, json=payload)
+        if response.status_code == 200:
+            return response.json()
+    raise RuntimeError("API call failed after 3 retries")`,
          explanation: `Lines starting with - were removed (the old single request.post call). Lines starting with + were added (the new retry loop). The @@ line tells you the location: this change starts around line 10. HEAD~1 means "compare the current commit to one commit ago." This is how you read what a specific commit actually changed.`,
        },
        {
          kind: "warm_up",
          title: "find who changed a line",
          prompt: `You are looking at a file called \`auth.py\` and want to know who last modified line 42 and in which commit. What command do you run?`,
          answer: `git blame auth.py`,
          explanation: `git blame annotates each line of a file with the commit hash, author, and date of the last change to that line. Look for line 42 in the output. You can also use \`git blame -L 42,42 auth.py\` to show only that line.`,
        },
        {
          kind: "code_predict",
          label: "using git show to inspect a specific commit",
          code: `git show a1b2c3d --stat`,
          output: ` api_client.py | 8 ++++++--
 tests/test_api.py | 15 +++++++++++++++
 2 files changed, 21 insertions(+), 2 deletions(-)`,
          explanation: `git show with --stat gives a summary: which files were touched and how many lines changed. Without --stat, you get the full diff. This is useful when someone says "look at commit a1b2c3d" and you want to quickly understand the scope of the change.`,
        },
      ],
    },

    // ================================================================
    // 5. Branching & merging
    // ================================================================
    {
      title: "Branching & merging",
      blocks: [
        {
          kind: "prose",
          markdown: `A branch in git is just a movable pointer to a commit. When you create a branch, git creates a new pointer. When you commit on that branch, the pointer moves forward. That is all a branch is: a sticky note attached to a commit.

This is why branching is cheap and fast in git. There is no copying of files. Creating a branch is creating a 41-byte file (the commit hash it points to).

The typical workflow:

1. Create a feature branch from main
2. Make commits on the feature branch
3. Merge or rebase the feature branch back into main
4. Delete the feature branch

Let's trace through a branch and merge:`,
        },
        {
          kind: "code_predict",
          label: "basic branch and merge",
          code: `git checkout -b feature/add-auth
# ... make changes and commit ...
git commit -m "add auth middleware"
git checkout main
git merge feature/add-auth
git log --oneline -3`,
          output: `f8e7d6c Merge branch 'feature/add-auth'
a1b2c3d add auth middleware
e4f5g6h previous commit on main`,
          explanation: `git checkout -b creates and switches to a new branch. After committing on the feature branch, we switch back to main and merge. Because main had not moved forward, git could have done a fast-forward merge (just moving the pointer). But here it created a merge commit, which is the default for git merge. The merge commit (f8e7d6c) has two parents: the feature branch commit and the previous main commit.`,
        },
        {
          kind: "code_comparison",
          label: "merge vs. rebase",
          left: {
            title: "git merge",
            code: `git checkout main
git merge feature/auth

# Creates a merge commit
# History shows the branch:
#   * Merge branch 'feature/auth'
#   |\
#   | * add auth
#   |/
#   * previous main commit`,
            annotation: "preserves full branch history",
          },
          right: {
            title: "git rebase",
            code: `git checkout feature/auth
git rebase main

# Replays commits on top of main
# History is linear:
#   * add auth
#   * previous main commit
#
# Then fast-forward main:
# git checkout main
# git merge feature/auth`,
            annotation: "clean, linear history",
          },
          takeaway: `Merge preserves the exact history of when branches diverged and joined. Rebase rewrites history to make it linear. Use rebase for local cleanup before pushing. Use merge for shared branches or when you want to preserve the branch history.`,
        },
        {
          kind: "key_insight",
          label: "The golden rule of rebase",
          insight: `Never rebase commits that have been pushed to a shared branch. Rebase rewrites commit hashes, which means anyone who pulled the old commits will have conflicts. Rebase your own local work before pushing. Once it is pushed, use merge.`,
        },
      ],
    },

    // ================================================================
    // 6. The rebase workflow
    // ================================================================
    {
      title: "The rebase workflow",
      blocks: [
        {
          kind: "prose",
          markdown: `Interactive rebase (\`git rebase -i\`) is how you clean up messy commit history before sharing your work. It lets you:

- **squash** — combine multiple commits into one
- **fixup** — same as squash but discards the commit message
- **reword** — change a commit message
- **edit** — pause at a commit to amend it
- **drop** — delete a commit entirely
- **reorder** — move commits around by reordering the lines

The workflow looks like this:

1. You have 5 messy commits on your feature branch
2. Run \`git rebase -i HEAD~5\`
3. Git opens your editor with a list of the 5 commits
4. You mark which ones to squash, fixup, reword, etc.
5. Save and close — git replays the commits with your changes

The editor shows something like:

\`\`\`
pick a1b2c3d WIP: start auth
pick e4f5g6h fix typo
pick i7j8k9l more auth work
pick m0n1o2p forgot to add file
pick q3r4s5t finish auth feature
\`\`\`

To squash the middle three into the first one, you change it to:

\`\`\`
pick a1b2c3d WIP: start auth
fixup e4f5g6h fix typo
fixup i7j8k9l more auth work
fixup m0n1o2p forgot to add file
pick q3r4s5t finish auth feature
\`\`\`

Now you have two clean commits instead of five messy ones.`,
        },
        {
          kind: "code_predict",
          label: "squash three commits into one",
          code: `git log --oneline -4
# Output before rebase:
# q3r4s5t fix tests
# m0n1o2p fix typo in handler
# i7j8k9l add request handler
# e4f5g6h setup express server

# Run: git rebase -i HEAD~3
# Change the editor contents to:
#   pick i7j8k9l add request handler
#   fixup m0n1o2p fix typo in handler
#   fixup q3r4s5t fix tests
# Save and close.

git log --oneline -2`,
          output: `a9b8c7d add request handler
e4f5g6h setup express server`,
          explanation: `The three commits (add request handler, fix typo, fix tests) were combined into a single commit with the message from the first one: "add request handler." The fixup command merges the changes but throws away the commit messages of the fixup commits. The commit hash changed (from i7j8k9l to a9b8c7d) because rebase creates new commits.`,
        },
        {
          kind: "warm_up",
          title: "cleaning up before a PR",
          prompt: `You have 5 messy commits on your feature branch (typo fixes, WIP saves, etc.) and want to squash them into 2 meaningful commits. What command starts the interactive rebase?`,
          answer: `git rebase -i HEAD~5`,
          explanation: `HEAD~5 means "go back 5 commits from the current HEAD." This opens an editor where you can mark commits as pick, squash, fixup, etc. Change the ones you want to combine from "pick" to "fixup" (or "squash" if you want to merge their messages too).`,
        },
      ],
    },

    // ================================================================
    // 7. Stash: shelving work in progress
    // ================================================================
    {
      title: "Stash: shelving work in progress",
      blocks: [
        {
          kind: "prose",
          markdown: `You are halfway through a feature when someone asks you to hotfix a bug on main. You are not ready to commit — the code is broken, tests are failing, half the function is written. \`git stash\` saves your work-in-progress to a temporary storage area and reverts your working directory to a clean state.

Later, you switch back to your branch and run \`git stash pop\` to restore everything exactly as it was.

Think of the stash as a stack of saved states. Each \`git stash\` pushes a new entry. \`git stash pop\` pops the most recent one. You can have multiple stashes and refer to them by index.`,
        },
        {
          kind: "code_predict",
          label: "stash and pop workflow",
          code: `# You're mid-feature on a branch
git status --short
# M  feature.py
# M  utils.py

git stash push -m "WIP: auth feature"
git status --short`,
          output: ``,
          explanation: `After stashing, the working directory is clean: git status shows nothing. Your changes to feature.py and utils.py are saved in the stash under the label "WIP: auth feature." The working directory now matches HEAD, so you can safely switch branches.`,
        },
        {
          kind: "code_predict",
          label: "listing and restoring stashes",
          code: `git stash list`,
          output: `stash@{0}: On feature/auth: WIP: auth feature
stash@{1}: On main: debug session saves`,
          explanation: `The stash is a stack. stash@{0} is the most recent (the auth feature WIP). stash@{1} is an older stash from a debug session. Running \`git stash pop\` restores stash@{0} and removes it from the list. If you want a specific stash, use \`git stash pop stash@{1}\`.`,
        },
        {
          kind: "warm_up",
          title: "mid-feature hotfix",
          prompt: `You are working on \`feature/search\` and need to hotfix a bug on main. Your current changes are not ready to commit. Write the sequence of commands to: (1) save your work, (2) switch to main, (3) fix and commit the bug, (4) return to your feature branch, (5) restore your work.`,
          answer: `git stash push -m "WIP: search feature"
git checkout main
# ... fix the bug ...
git commit -am "fix: handle null input"
git checkout feature/search
git stash pop`,
          explanation: `Stash saves your uncommitted changes and cleans the working directory, letting you switch branches safely. After fixing the bug on main, you switch back and pop the stash to restore exactly where you left off. The -m flag on stash is optional but helpful for identifying stashes later.`,
        },
      ],
    },

    // ================================================================
    // 8. Undoing things: reset, revert, reflog
    // ================================================================
    {
      title: "Undoing things: reset, revert, reflog",
      blocks: [
        {
          kind: "prose",
          markdown: `Things go wrong. You commit the wrong file, push a broken build, or realize the last three commits should not exist. Git has several tools for undoing work, and choosing the right one depends on whether the commits have been shared with others.

**reset** — moves HEAD backward, effectively un-making commits. Changes can go back to staging (--soft), working directory (--mixed), or be thrown away (--hard). Use for local, unpushed commits.

**revert** — creates a new commit that undoes the changes of a previous commit. Use for shared, already-pushed commits.

**reflog** — a log of every place HEAD has pointed to. Your safety net when you mess up a reset.`,
        },
        {
          kind: "code_comparison",
          label: "the three flavors of reset",
          left: {
            title: "reset --soft HEAD~1",
            code: `# Undoes the commit
# Keeps changes STAGED
#
# Before: A - B - C (HEAD)
# After:  A - B (HEAD)
#   Changes from C are staged
#
# Use case: "I want to
# rewrite the commit message"
# or combine with next commit`,
            annotation: "safest reset: nothing is lost",
          },
          right: {
            title: "reset --hard HEAD~1",
            code: `# Undoes the commit
# DISCARDS all changes
#
# Before: A - B - C (HEAD)
# After:  A - B (HEAD)
#   Changes from C are GONE
#
# Use case: "I want to
# completely forget this
# commit ever happened"`,
            annotation: "destructive: changes are lost (but reflog can help)",
          },
          takeaway: `There is also --mixed (the default), which undoes the commit and unstages the changes, but keeps them in the working directory. Think of it as: --soft keeps everything staged, --mixed keeps everything unstaged, --hard throws everything away.`,
        },
        {
          kind: "code_predict",
          label: "revert creates a new commit",
          code: `git log --oneline -3
# c3c3c3c add broken feature
# b2b2b2b update readme
# a1a1a1a initial setup

git revert c3c3c3c --no-edit
git log --oneline -4`,
          output: `d4d4d4d Revert "add broken feature"
c3c3c3c add broken feature
b2b2b2b update readme
a1a1a1a initial setup`,
          explanation: `Unlike reset, revert does not rewrite history. It creates a brand new commit (d4d4d4d) that undoes the changes from c3c3c3c. The original broken commit is still in the history. This is safe to use on shared branches because nobody's history gets rewritten.`,
        },
        {
          kind: "key_insight",
          label: "The reflog is your safety net",
          insight: `Every time HEAD moves, git records it in the reflog. Even after a \`reset --hard\`, the old commits are still in git's database for at least 30 days. Run \`git reflog\` to see everywhere HEAD has been, then \`git reset --hard <hash>\` to jump back to any of those points. The reflog is how you recover from almost any mistake.`,
        },
        {
          kind: "warm_up",
          title: "recovering from reset --hard",
          prompt: `You ran \`git reset --hard HEAD~3\` and immediately realize you wanted to keep those commits. How do you get them back?`,
          answer: `git reflog
# Find the commit hash from before the reset
git reset --hard <hash>`,
          explanation: `The reflog shows every position HEAD has been at. Find the entry from right before your reset (it will show the hash you were at). Then reset --hard back to that hash. The commits were never truly deleted — git just moved the pointer. The reflog lets you move it back.`,
        },
      ],
    },

    // ================================================================
    // 9. Cherry-pick & bisect
    // ================================================================
    {
      title: "Cherry-pick & bisect",
      blocks: [
        {
          kind: "prose",
          markdown: `**Cherry-pick** copies a single commit from one branch to another. It does not merge or move branches. It takes the diff introduced by a commit and applies it as a new commit on your current branch.

Use cases:
- Backporting a bugfix from main to a release branch
- Grabbing one useful commit from a coworker's feature branch without merging their whole branch
- Recovering a specific commit after a messy rebase

**Bisect** uses binary search to find which commit introduced a bug. Instead of checking every commit one by one, git jumps to the middle, asks "is the bug here?", and eliminates half the remaining commits. For 1000 commits, it takes about 10 checks instead of 1000.`,
        },
        {
          kind: "code_predict",
          label: "cherry-pick a bugfix",
          code: `# You're on the release branch
git checkout release/v2

# Grab a specific bugfix from main
git cherry-pick f9e8d7c
git log --oneline -3`,
          output: `a1b2c3d Fix null pointer in auth handler
e4f5g6h release v2.0
i7j8k9l prepare release branch`,
          explanation: `Cherry-pick created a new commit (a1b2c3d) on the release branch with the same changes as f9e8d7c from main. The hash is different because it is a new commit with a different parent. The original commit on main is untouched. This is the standard way to backport fixes to release branches.`,
        },
        {
          kind: "prose",
          markdown: `The bisect workflow is straightforward:

1. \`git bisect start\` — begin the session
2. \`git bisect bad\` — mark the current commit as having the bug
3. \`git bisect good <hash>\` — mark a known-good commit (e.g., last release)
4. Git checks out the middle commit. You test it.
5. \`git bisect good\` or \`git bisect bad\` depending on whether the bug is present
6. Repeat steps 4-5 until git identifies the first bad commit
7. \`git bisect reset\` — return to where you started

For automated bisect, you can pass a test script: \`git bisect run npm test\`. Git runs the script at each step and uses the exit code (0 = good, non-zero = bad) to navigate automatically.`,
        },
        {
          kind: "warm_up",
          title: "finding the bug fast",
          prompt: `A bug was introduced somewhere in the last 20 commits. Manually testing each one would take forever. What git command uses binary search to find the guilty commit in about 4-5 checks?`,
          answer: `git bisect start
git bisect bad
git bisect good HEAD~20`,
          explanation: `Bisect performs binary search on the commit range. 20 commits requires about log2(20) = 4-5 checks. At each step, git checks out the midpoint and you test whether the bug exists. You can even automate it with \`git bisect run <test-script>\`.`,
        },
      ],
    },

    // ================================================================
    // 10. Working with remotes
    // ================================================================
    {
      title: "Working with remotes",
      blocks: [
        {
          kind: "prose",
          markdown: `A remote is a copy of the repository hosted somewhere else (GitHub, GitLab, etc.). Most repos have one remote called \`origin\` — this is where you push and pull from. When working with forks, you typically have two remotes:

- \`origin\` — your fork
- \`upstream\` — the original repo you forked from

**fetch vs. pull** — this is a common source of confusion.

\`git fetch\` downloads new commits from the remote but does NOT change your working directory or your branches. It updates your remote-tracking branches (like \`origin/main\`).

\`git pull\` is \`git fetch\` + \`git merge\`. It downloads new commits AND merges them into your current branch.

If you want to see what changed on the remote before merging, use fetch first:

\`\`\`
git fetch origin
git log main..origin/main --oneline
# See what's new on the remote
git merge origin/main
\`\`\`

This two-step approach gives you a chance to review before merging, which is safer than pulling blindly.`,
        },
        {
          kind: "code_predict",
          label: "checking remote status",
          code: `git remote -v`,
          output: `origin	git@github.com:you/project.git (fetch)
origin	git@github.com:you/project.git (push)
upstream	git@github.com:company/project.git (fetch)
upstream	git@github.com:company/project.git (push)`,
          explanation: `This shows two remotes: origin (your fork) and upstream (the original repo). Each remote has a fetch URL and a push URL (usually the same). This is the typical setup for contributing to open source or customer repos.`,
        },
        {
          kind: "code_predict",
          label: "syncing a fork with upstream",
          code: `git fetch upstream
git checkout main
git merge upstream/main
git push origin main
git log --oneline -3`,
          output: `f1e2d3c Latest upstream feature
a4b5c6d Upstream bugfix
e7f8g9h Your last local commit`,
          explanation: `This is the standard fork sync workflow. Fetch gets the latest commits from upstream without changing your branch. Then you merge those commits into your local main. Finally, push updates your fork (origin) on GitHub. Now your fork is up to date with the original repo.`,
        },
        {
          kind: "warm_up",
          title: "fork behind upstream",
          prompt: `Your fork is 30 commits behind the upstream repo. What sequence of commands brings your fork up to date?`,
          answer: `git fetch upstream
git checkout main
git merge upstream/main
git push origin main`,
          explanation: `Fetch downloads the 30 new commits from upstream. Merge integrates them into your local main. Push sends them to your fork on GitHub. You can also use \`git pull upstream main\` to combine fetch and merge, but the two-step approach lets you review first.`,
        },
      ],
    },

    // ================================================================
    // 11. Git cheat sheet
    // ================================================================
    {
      title: "Git cheat sheet",
      blocks: [
        {
          kind: "prose",
          markdown: `Quick reference cards for the most common git commands, grouped by what you are trying to do.`,
        },
        {
          kind: "method_ref",
          title: "Staging & committing",
          importLine: "# no import needed",
          methods: [
            {
              signature: "git add -p",
              description: "Interactively stage individual hunks (portions of changes) within files.",
              returns: "Staged changes, ready to commit",
            },
            {
              signature: "git add <file>",
              description: "Stage all changes in a specific file.",
            },
            {
              signature: "git restore --staged <file>",
              description: "Unstage a file (move it back from staging to working directory).",
            },
            {
              signature: "git commit -m 'msg'",
              description: "Create a commit with the staged changes.",
              returns: "A new commit at HEAD",
            },
            {
              signature: "git commit --amend",
              description: "Replace the last commit with a new one (add forgotten files, fix message).",
              returns: "A rewritten HEAD commit",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Branching & merging",
          importLine: "# no import needed",
          methods: [
            {
              signature: "git branch <name>",
              description: "Create a new branch pointing at the current commit.",
            },
            {
              signature: "git checkout -b <name>",
              description: "Create and switch to a new branch in one step.",
            },
            {
              signature: "git merge <branch>",
              description: "Merge another branch into the current branch.",
              returns: "A merge commit (or fast-forward)",
            },
            {
              signature: "git rebase <branch>",
              description: "Replay current branch commits on top of another branch.",
              returns: "Rewritten linear history",
            },
            {
              signature: "git rebase -i HEAD~N",
              description: "Interactive rebase: squash, reorder, edit the last N commits.",
            },
            {
              signature: "git branch -d <name>",
              description: "Delete a branch (only if fully merged).",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Undoing & recovering",
          importLine: "# no import needed",
          methods: [
            {
              signature: "git reset --soft HEAD~1",
              description: "Undo last commit, keep changes staged.",
            },
            {
              signature: "git reset --mixed HEAD~1",
              description: "Undo last commit, keep changes in working directory (unstaged). This is the default.",
            },
            {
              signature: "git reset --hard HEAD~1",
              description: "Undo last commit and discard all changes. Destructive.",
            },
            {
              signature: "git revert <hash>",
              description: "Create a new commit that undoes a previous commit. Safe for shared branches.",
            },
            {
              signature: "git reflog",
              description: "Show every position HEAD has been at. Your safety net for recovery.",
            },
            {
              signature: "git stash push -m 'msg'",
              description: "Save uncommitted changes to the stash and clean working directory.",
            },
            {
              signature: "git stash pop",
              description: "Restore the most recent stash and remove it from the stash list.",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Remotes & collaboration",
          importLine: "# no import needed",
          methods: [
            {
              signature: "git remote -v",
              description: "List all remotes with their URLs.",
            },
            {
              signature: "git fetch <remote>",
              description: "Download new commits from remote without merging.",
            },
            {
              signature: "git pull <remote> <branch>",
              description: "Fetch and merge in one step.",
            },
            {
              signature: "git push -u <remote> <branch>",
              description: "Push branch and set upstream tracking.",
            },
            {
              signature: "git cherry-pick <hash>",
              description: "Copy a single commit to the current branch.",
              returns: "A new commit with the same changes",
            },
            {
              signature: "git bisect start/bad/good",
              description: "Binary search through commits to find when a bug was introduced.",
            },
          ],
        },
        {
          kind: "method_ref",
          title: "Investigating history",
          importLine: "# no import needed",
          methods: [
            {
              signature: "git log --oneline -N",
              description: "Show last N commits, one per line.",
            },
            {
              signature: "git log --graph --oneline",
              description: "Show commit graph with branch structure.",
            },
            {
              signature: "git diff HEAD~1",
              description: "Show what changed in the last commit.",
            },
            {
              signature: "git show <hash>",
              description: "Show full details (message + diff) of a specific commit.",
            },
            {
              signature: "git blame <file>",
              description: "Annotate each line with the commit and author that last changed it.",
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
          markdown: `For each scenario, decide which git command or workflow you would use. Flip the card to check your answer.`,
        },
        {
          kind: "flashcard",
          context: "You just committed but realize the commit message has a typo.",
          front: "How do you fix the commit message without creating a new commit?",
          back: "git commit --amend — this replaces the last commit. Only use this if you have NOT pushed yet. If already pushed, make a new commit instead.",
        },
        {
          kind: "flashcard",
          context: "You made one commit that contains two unrelated changes (a bugfix and a feature).",
          front: "How do you split this commit into two separate commits?",
          back: "git reset --soft HEAD~1 to undo the commit but keep changes staged. Then git restore --staged . to unstage everything. Now use git add -p to stage just the bugfix changes, commit, then stage and commit the feature changes separately.",
        },
        {
          kind: "flashcard",
          context: "You made 3 commits on main that should have been on a feature branch.",
          front: "How do you move those 3 commits to a new branch and reset main?",
          back: "git branch feature/my-work (creates branch at current HEAD). Then git reset --hard HEAD~3 (moves main back 3 commits). Your commits are safe on the feature branch. Switch to it with git checkout feature/my-work.",
        },
        {
          kind: "flashcard",
          context: "You are merging a feature branch and git reports a conflict in config.json.",
          front: "What is the workflow to resolve a merge conflict?",
          back: "Open the conflicted file. Look for <<<<<<< HEAD, =======, and >>>>>>> markers. Edit the file to keep the correct code, removing all markers. Then git add config.json and git commit to finish the merge. Use git diff --check to verify no markers remain.",
        },
        {
          kind: "flashcard",
          context: "A line of code is causing a bug and you need to know who wrote it and when.",
          front: "What command tells you who last modified a specific line?",
          back: "git blame <file> — annotates each line with the commit hash, author, and date. For more context, use git show <hash> on the commit that changed the line.",
        },
        {
          kind: "flashcard",
          context: "Your fork on GitHub is 45 commits behind the upstream repo.",
          front: "How do you sync your fork with upstream?",
          back: "git fetch upstream to download new commits. git checkout main to ensure you are on main. git merge upstream/main to integrate. git push origin main to update your fork on GitHub.",
        },
        {
          kind: "flashcard",
          context: "You want to stage only the validation logic changes in a file, not the debug logging you added.",
          front: "How do you stage part of a file?",
          back: "git add -p <file> — this enters interactive patch mode where git shows each hunk and asks whether to stage it. Answer y for the validation hunks, n for the debug logging hunks.",
        },
        {
          kind: "flashcard",
          context: "You ran git reset --hard HEAD~5 and immediately realize you needed those commits.",
          front: "How do you recover the lost commits?",
          back: "git reflog — find the commit hash from before the reset (it will be in the list). Then git reset --hard <hash> to return to that point. Commits are retained in git's database for at least 30 days, even after reset --hard.",
        },
      ],
    },

    // ================================================================
    // 13. Challenge: Untangle a messy history
    // ================================================================
    {
      title: "Challenge: Untangle a messy history",
      blocks: [
        {
          kind: "prose",
          markdown: `This challenge combines stashing, rebasing, and cherry-picking into a realistic scenario. Read the situation carefully before writing your solution.`,
        },
        {
          kind: "mini_challenge",
          title: "Untangle a messy history",
          prompt: `You are working on \`feature/dashboard\` and the commit history looks like this:

\`\`\`
git log --oneline
f5f5f5f WIP: half-done chart component
e4e4e4e add console.log debugging
d3d3d3d fix: API rate limit bug (IMPORTANT - needed on main NOW)
c2c2c2c add dashboard layout
b1b1b1b add dashboard route
\`\`\`

You have uncommitted changes in your working directory (more chart work).

Your tasks:
1. Save your uncommitted work safely
2. Get the rate-limit bugfix (d3d3d3d) onto main immediately
3. Clean up your feature branch: squash the WIP and debug commits, keep the meaningful ones
4. Restore your uncommitted work and continue

Write the sequence of git commands to accomplish all four tasks.`,
          hints: [
            "Use git stash to save uncommitted work before switching branches.",
            "Use git cherry-pick to copy the bugfix commit onto main without merging the whole feature branch.",
            "Use git rebase -i to squash the WIP and debug commits on your feature branch.",
            "Use git stash pop to restore your work at the end.",
          ],
          solution: `# 1. Save uncommitted work
git stash push -m "WIP: chart component work"

# 2. Cherry-pick the bugfix onto main
git checkout main
git cherry-pick d3d3d3d
# main now has the rate-limit fix

# 3. Return to feature branch and clean up
git checkout feature/dashboard
git rebase -i HEAD~4
# In the editor, change to:
#   pick b1b1b1b add dashboard route
#   pick c2c2c2c add dashboard layout
#   pick d3d3d3d fix: API rate limit bug
#   fixup e4e4e4e add console.log debugging
#   fixup f5f5f5f WIP: half-done chart component
#
# This keeps the 3 meaningful commits and
# folds the debug/WIP commits into the
# rate-limit fix commit.

# 4. Restore uncommitted work
git stash pop

# Now your feature branch is clean,
# main has the hotfix, and your
# uncommitted work is restored.`,
          takeaway: `This is a realistic workflow: stash to free your hands, cherry-pick to deliver an urgent fix, interactive rebase to clean up before a PR, and stash pop to resume. Each tool has a specific job, and they compose naturally.`,
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
          markdown: `You now have a solid mental model of git's core workflows:

- **The three trees** — every command moves data between working directory, staging, and HEAD
- **Precision staging** — add -p for partial staging, restore --staged for unstaging
- **History reading** — log, diff, show, blame for understanding any codebase
- **Branching** — branches are cheap pointers; merge for shared work, rebase for local cleanup
- **Interactive rebase** — squash, fixup, reword to clean up before sharing
- **Stashing** — shelve work-in-progress without committing
- **Undoing** — reset for local undo, revert for shared undo, reflog for recovery
- **Cherry-pick and bisect** — surgical commit copying and binary search for bugs
- **Remotes** — fetch before pull, sync forks with upstream

To build real fluency, practice these patterns in a scratch repo. Create intentional messes and clean them up:

1. **Create a conflict on purpose**: branch, make conflicting changes on both branches, merge, resolve.
2. **Practice interactive rebase**: make 5 junk commits, squash them into 2 clean ones.
3. **Simulate a hotfix**: stash, switch branches, cherry-pick, return, pop.
4. **Break and recover**: reset --hard, then use reflog to get back.
5. **Set up a fork workflow**: fork a repo, add upstream remote, practice syncing.

The goal is not to memorize flags. It is to build the muscle memory so that when you are live in front of a customer, you do not hesitate. You know what git is doing, you know what each command moves where, and you can fix anything that goes wrong.`,
        },
      ],
    },
  ],
};
