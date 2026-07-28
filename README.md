# Access Policy Compliance Checker

I wanted to know if an LLM can actually apply a written access policy the way a
human IAM reviewer would. Not just handle the obvious cases, but know when to
punt to a human instead of guessing. This is a small eval built with
[promptfoo](https://www.promptfoo.dev/), a free, open-source tool for testing
and scoring LLM prompts against a dataset of test cases.

This is version 2 of the project. The first version had 30 test cases and 10
rules written in fairly abstract terms ("billing access," "production system
access"). This version names 10 actual systems (Billing System, Production
Database, Customer PII, and so on), triples the test set to 90 cases, and adds
something the first version didn't have: a live simulator on the dashboard
where you can toggle role, department, system, and a few context flags
yourself and see what the policy says, instantly, without calling a model at
all.

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
- **`tests.csv`** has the 90 generated access requests, each with its expected
  decision and a one-sentence citation of the rule that produced it.
- **`prompt.txt`** is the template sent to the model: the full v2 policy, then
  the request as structured fields (role, department, system, approvals,
  offboarding status, active incident), then instructions to answer
  APPROVE/DENY/ESCALATE on the first line and cite the rule.
- **`promptfooconfig.yaml`** ties the prompt and the test cases together and
  grades each response against the `expected` column in tests.csv.

## Try it yourself

The [live dashboard](https://projects.stephpawlowski.com) has a "Try it
yourself" panel: pick a role, a department, a system, an approval count, and
whether the account is offboarding or there's an active incident, and it'll
tell you the decision and which rule produced it. That part runs entirely in
your browser off `policy-engine.js`, no API key or server involved. It's the
fastest way to get a feel for how the policy actually behaves before reading
the 90 test cases one by one.

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

That runs all 90 cases, prints a pass/fail summary with overall accuracy, and
saves the full results to `results.json`. For a browsable view of each
individual result:

```bash
npm run view
```

You can filter down to just the failures there, which is honestly the more
useful part once you're past the first run.

## What I found

_This section gets filled in once I run the v2 eval against all 90 cases.
The first version scored 28/30 (93.3%), with both misses being the same kind
of mistake: the model treated "zero prior approvals" as an open question
worth escalating, where the policy meant it as a closed one, a plain no. It'll
be interesting to see whether naming the actual systems and giving structured
fields instead of a free-text sentence tightens that up, or whether the same
pattern shows up again at 3x the scale._

## Files

```
access-policy-eval/
├── policy.md                    the v2 policy being tested
├── tests.csv                    90 test cases plus the generated answer key
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
