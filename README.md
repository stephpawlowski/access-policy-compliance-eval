# Access Policy Compliance Checker

I wanted to know if an LLM can actually apply a written access policy the way a
human IAM reviewer would. Not just handle the obvious cases, but know when to
punt to a human instead of guessing. This is a small eval built with
[promptfoo](https://www.promptfoo.dev/), a free, open-source tool for testing
and scoring LLM prompts against a dataset of test cases.

This is version 3 of the project. The first version had 30 test cases and 10
rules written in fairly abstract terms ("billing access," "production system
access"). Version 2 named 10 actual systems (Billing System, Production
Database, Customer PII, and so on), tripled the test set to 90 cases, and
added a live simulator on the dashboard where you can toggle role,
department, system, and a few context flags yourself and see what the policy
says, instantly, without calling a model at all.

Version 3 adds two things. First, a "Customize the policy" panel: every
approval threshold in the policy is now a parameter, not a hardcoded number,
so you can loosen or tighten any of them and see how many of the test cases
would flip to a different correct answer. Second, 15 new adversarial test
cases that don't test new rules — they test whether a model handles
*ambiguity and distraction* the way a careful reviewer would, rather than
just applying clean, fully-specified rules correctly. That includes fixing a
real gap v2's own findings surfaced: Employee Records requests from a Manager
now explicitly track whether the records belong to their own direct
report, and if a request doesn't say, the correct answer is to escalate for
clarification, not to guess.

## The setup

IAM and governance work comes down to applying rules consistently: approve,
deny, or escalate a request based on someone's role, department, and the
specifics of the situation. So I wrote a policy, wrote a batch of test
requests, and checked whether the model's decisions matched what I'd decided
myself ahead of time, including on the requests where the "right" answer is
"escalate to a human," not a confident guess either way.

The bigger change in v2 is that the policy logic itself now lives in one
place, a small JavaScript rules engine, and everything else is generated from
it. The 90 test cases and their answer key come from running that engine, and
the dashboard's live simulator calls the exact same code. That means the
simulator and the eval's answer key can't drift apart from each other. If I
ever change a rule, I change it once.

## What's in this repo

- **`policy.md`** is the fictional but realistic IAM policy: 5 roles, 6
  departments, 10 named systems, and 10 rules covering standing access,
  approval thresholds, offboarding, and a catch-all for anything not
  explicitly listed.
- **`docs/policy-engine.js`** is the rules engine itself, the actual source of
  truth for the policy logic. It's plain JavaScript with no dependencies, so
  it runs the same way in Node (to generate test cases) and in the browser
  (to power the dashboard's simulator).
- **`scripts/generate-scenarios.js`** builds `tests.csv` from the engine: a
  couple of hand-picked examples per rule branch (38 branches across the 10
  rules, so every path through the policy gets tested at least twice) plus a
  seeded-random fill to round it out to 90 and add realistic variety.
- **`tests.csv`** has the 105 generated access requests (90 core cases plus 15
  adversarial ones), each with its expected decision and a one-sentence
  citation of the rule that produced it.
- **`prompt.txt`** is the template sent to the model: the full v2 policy, then
  the request as structured fields (role, department, system, approvals,
  offboarding status, active incident), then instructions to answer
  APPROVE/DENY/ESCALATE on the first line and cite the rule.
- **`promptfooconfig.yaml`** ties the prompt and the test cases together and
  grades each response against the `expected` column in tests.csv.

## Try it yourself

The [live dashboard](https://access-checker.stephpawlowski.com) has a "Try it
yourself" panel: pick a role, a department, a system, an approval count, and
whether the account is offboarding or there's an active incident, and it'll
tell you the decision and which rule produced it. That part runs entirely in
your browser off `policy-engine.js`, no API key or server involved. It's the
fastest way to get a feel for how the policy actually behaves before reading
the 105 test cases one by one.

## Setup

You'll need [Node.js](https://nodejs.org/) 18 or later.

```bash
cd access-policy-eval
npm install
```

Then set an Anthropic API key (grab one at https://console.anthropic.com/):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Want to test a different model instead? Edit the `providers:` list in
`promptfooconfig.yaml` and set the matching API key.

If you want to regenerate `tests.csv` yourself, or change a rule and see how
the answer key updates:

```bash
node scripts/generate-scenarios.js > tests.csv
```

## Running it

```bash
npm run eval -- -o results.json
```

That runs all 105 cases, prints a pass/fail summary with overall accuracy, and
saves the full results to `results.json`. For a browsable view of each
individual result:

```bash
npm run view
```

You can filter down to just the failures there, which is honestly the more
useful part once you're past the first run.

## What I found

Model tested: `claude-sonnet-5`, one provider. This is the v3 run: all 105
scenarios, including the 15 new adversarial cases.

**104 out of 105 correct (99.05%)** — every one of the 15 adversarial cases
passed, including the direct-report ambiguity checks that v3 added
specifically because v2's own findings had surfaced a real gap in how the
Employee Records rule was being tested (see below). By expected decision:
38/39 on deny, 34/34 on approve, 32/32 on escalate.

Both issues that showed up in the v2 run are gone in this one, and for the
reasons I expected: the rule-threshold miss (a Manager with one approval
requesting Admin Console access) is now answered correctly, and the two
answer-key gaps around "Manager access to Employee Records" are resolved
now that the scenario generator explicitly states whether the records belong
to the manager's own direct report. Fixing the test generator fixed the
model's score, not the other way around — which is itself worth noting: some
of what looks like "the model got it wrong" in an eval is actually "the eval
didn't specify enough for a careful reader to get it right."

### The one remaining miss is a formatting quirk, not a policy error

Row 59: an Intern in Engineering requesting Employee Records with zero
prior approvals. Expected: DENY. The model's raw output:

> ESCALATE
>
> Rule 8: Employee Records — Intern is not HR, Manager, or Admin, and has 0
> prior approvals, so per the "everyone else" clause with zero approvals
> this would normally be a Deny; however, since the requester is not a
> Manager, the "own direct reports" ambiguity does not apply, and with 0
> prior approvals the correct outcome under Rule 8 is Deny.
>
> **Correction:**
>
> DENY
> Rule 8 applies: Employee Records access outside HR/Manager/Admin requires
> at least one prior approval to escalate, and since this Intern has zero
> prior approvals, the request is denied.

The model talks itself into the wrong answer, catches the mistake mid-stream,
and corrects to the right one. But my grading script only reads the first
line — as instructed by the prompt — so this scores as a fail even though the
final, considered answer is correct. This is the exact same failure mode I
saw three times in the v2 run (ids 35, 73, and 79 back then), just down to
one instance now that the answer-key gaps are fixed. If I graded on the last
decision line instead of the first, this eval would be 105/105 (100%), not
99.05%. I'm keeping first-line grading, since that's what the prompt actually
instructs and changing the grading criteria after seeing the results would be
moving the goalposts — but it's worth flagging that the one point separating
"perfect" from "99%" here is a formatting habit, not a misapplied rule.

### Take away

Going from 93.3% (v2, 90 cases, several real answer-key gaps) to 99.05% (v3,
105 cases including 15 adversarial ones, no answer-key gaps left) is the
result I'd hope for from doing a second pass properly: fix what the model's
misses revealed about the test itself, add harder cases specifically designed
to catch ambiguity-handling and distraction-resistance, and see whether the
score holds up. It did — every adversarial case passed, including the ones
built to catch the model borrowing details from a semantically similar but
wrong resource name, or getting pulled off course by an irrelevant narrative
detail. The only thing left standing between this eval and a clean 100% is a
model tendency to talk through its reasoning and self-correct after the
line my grading script actually reads, which is a different kind of miss than
"misapplied the policy."

## Files

```
access-policy-eval/
├── policy.md                    the v2 policy being tested
├── tests.csv                    105 test cases plus the generated answer key
├── prompt.txt                   what actually gets sent to the model
├── promptfooconfig.yaml         wires it all together and grades it
├── scripts/
│   └── generate-scenarios.js    builds tests.csv from policy-engine.js
├── docs/
│   ├── policy-engine.js         the actual policy logic, shared by the generator and the simulator
│   └── index.html               the dashboard: results table + live simulator
├── package.json
└── README.md
```

## Why I built this

I wanted real, hands-on reps at LLM evaluation: writing test cases, deciding
what "correct" means ahead of time, and measuring a model against that. This
was the domain I know best, so I used it as the test bed. Expanding it to v2
was also a chance to fix a structural problem with the first version: the
answer key was something only I could reason about by hand. Now it's
generated code, which means it's checkable, reproducible, and reusable for
the interactive simulator instead of a one-time spreadsheet.
