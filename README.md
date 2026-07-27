# Access Policy Compliance Checker

An LLM evaluation project: can an LLM correctly apply a written IAM access policy to
hypothetical access requests? Built with [promptfoo](https://www.promptfoo.dev/), an
open-source tool for testing and scoring LLM prompts against a dataset.

## Problem

IAM/governance work involves applying written access policies consistently:
approve, deny, or escalate a request based on role, department, and specific rules.
This project asks whether an LLM, given the same policy a human reviewer would use,
makes the same calls a human governance reviewer would — including on genuinely
ambiguous edge cases where the right answer is "escalate to a human," not a guess.

## Approach

1. **`policy.md`** — a fictional but realistic IAM policy (10 rules) covering
   contractor/employee/intern/admin roles, billing access, production access,
   cross-department approvals, offboarding, and HR data access.
2. **`tests.csv`** — 30 hypothetical access requests, each with a self-written
   correct answer (`approve` / `deny` / `escalate`) and the rule-based reasoning
   behind it. The set deliberately includes: one request per rule, a few "trap"
   cases where a sympathetic justification should still be denied per the policy
   as written (#27), and cases that pit two rules against each other (#28).
3. **`prompt.txt`** — the prompt template: the full policy + one request, asking
   the model to answer APPROVE/DENY/ESCALATE on the first line with a one-sentence,
   rule-citing justification.
4. **`promptfooconfig.yaml`** — wires the prompt and dataset together and grades
   each response by checking whether the model's first-line decision matches the
   `expected` column in `tests.csv`.

## Setup

Requires [Node.js](https://nodejs.org/) 18+.

```bash
cd access-policy-eval
npm install
```

Set your Anthropic API key (get one at https://console.anthropic.com/):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

(To test other models instead, edit the `providers:` list in `promptfooconfig.yaml` —
e.g. uncomment the OpenAI lines and set `OPENAI_API_KEY` instead/as well.)

## Running the eval

```bash
npm run eval
```

This runs all 30 test cases against the configured model(s) and prints a pass/fail
summary with overall accuracy. To browse individual results in a local web UI:

```bash
npm run view
```

This opens a browser view where you can see, per test case: the exact request, the
model's full response, whether it matched the expected decision, and filter down to
just the failures — the most interesting part for write-up purposes.

## Findings

**Model tested:** `claude-sonnet-5` (single-provider run)

**Overall accuracy: 28/30 (93.3%)**

### The two failures

Both failures had the *same* expected decision (`deny`) and the *same* actual
decision (`escalate`) — not random noise, a consistent pattern:

- **Row 20** — Sales FTE requests Engineering-tool access; neither their manager nor
  any Engineering admin has approved. Expected: `deny` (Rule 6 requires both
  approvals; with zero approvals on record, there's no pending decision to route to
  a human — the request simply doesn't meet the bar). Model said: `escalate`.
- **Row 24** — HR FTE requests write access to HR systems with no People-team admin
  approval mentioned anywhere. Expected: `deny` (Rule 8's approval requirement isn't
  met). Model said: `escalate`.

### Pattern in errors

In both cases the model **over-escalates when a rule is approval-gated and no
approval is mentioned**. It reads "no approval on record" as *unresolved* — as if
the approval might still be forthcoming and a human should check — rather than as
"the stated requirement for approval isn't satisfied, so deny." My answer key
treated an explicitly-absent approval as a clean denial, since Rule 6 says "if only
one has approved, escalate" (implying a two-state contrast: partial vs. none), and
zero approvals isn't the partial-approval case that escalate branch was written for.

This is a genuinely defensible disagreement, not a random model error, which is
what makes it interesting: it's really a policy-drafting ambiguity `policy.md`
didn't fully close. A stricter version of Rule 6 would explicitly say "zero
approvals = deny; exactly one approval = escalate" instead of leaving "neither has
approved" to be inferred. In both failures, the model cited the correct rule number
and articulated a coherent rationale — it wasn't confused about the policy, it just
resolved a genuine ambiguity in the more cautious direction.

### What this suggests about using an LLM for policy enforcement in production

93% is a strong starting point but not "hands-off" territory for anything with real
consequences (access grants, billing, production data). The failure mode here isn't
hallucination or rule-forgetting — it's a difference in how strictly to read a rule
with an implicit gap. That means the fix isn't "prompt harder," it's **tightening
the policy's own wording** before trusting an LLM as a first-pass reviewer, and
keeping a human in the loop specifically around approval-chain edge cases until the
policy language is airtight. It also argues for treating an over-cautious "escalate"
as a much cheaper mistake than an incorrect "approve" — which is a reasonable
default bias for an LLM reviewer to have, even when it doesn't match the answer key.

## Project structure

```
access-policy-eval/
├── policy.md              # The IAM access policy being tested
├── tests.csv               # 30 test cases + answer key (id, request, expected, reasoning)
├── prompt.txt              # Prompt template sent to the LLM
├── promptfooconfig.yaml    # promptfoo config wiring prompt + tests + grading
├── package.json
└── README.md
```

## Why this project

Built as a hands-on rep in LLM evaluation methodology — writing test cases, defining
ground truth, and measuring model accuracy against it — applied to a real IAM/access-
governance scenario.
