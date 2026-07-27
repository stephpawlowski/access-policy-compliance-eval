# Access Policy Compliance Checker

I wanted to know if an LLM can actually apply a written access policy the way a
human IAM reviewer would. Not just handle the obvious cases, but know when to
punt to a human instead of guessing. This is a small eval built with
[promptfoo](https://www.promptfoo.dev/), a free, open-source tool for testing
and scoring LLM prompts against a dataset of test cases.

## The setup

IAM and governance work comes down to applying rules consistently: approve,
deny, or escalate a request based on someone's role, department, and the
specifics of the situation. So I wrote a policy, wrote a batch of test
requests, and checked whether the model's decisions matched what I'd decided
myself ahead of time, including on the requests where the "right" answer is
"escalate to a human," not a confident guess either way.

## What's in this repo

- **`policy.md`** is a fictional but realistic IAM policy, 10 rules, covering
  contractors, employees, interns, admins, billing access, production access,
  cross-department approvals, offboarding, and HR data access.
- **`tests.csv`** has 30 hypothetical access requests. Each one has an answer
  I wrote myself (approve, deny, or escalate) plus the reasoning behind it.
  There's one request per rule, a couple of "trap" cases where a sympathetic
  justification should still get denied per the policy as written (see #27),
  and a case where two rules pull in different directions (#28).
- **`prompt.txt`** is the template sent to the model: the full policy, then
  one request, then instructions to answer APPROVE/DENY/ESCALATE on the first
  line and give a one-sentence reason citing the rule.
- **`promptfooconfig.yaml`** ties the prompt and the test cases together and
  grades each response against the `expected` column in tests.csv.

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

## Running it

```bash
npm run eval
```

That runs all 30 cases and prints a pass/fail summary with overall accuracy.
For a browsable view of each individual result:

```bash
npm run view
```

You can filter down to just the failures there, which is honestly the more
useful part once you're past the first run.

## What I found

Model tested: `claude-sonnet-5`, one provider.

**28 out of 30 correct (93.3%).**

### The two misses

Both wrong answers were the same kind of mistake: expected `deny`, got
`escalate`.

Row 20 is a Sales employee asking for access to an Engineering tool, with
neither their manager nor an Engineering admin having approved it. My answer
key says deny: the rule requires both approvals, and zero approvals isn't a
partial case that needs a human to sort out, it's just a request that doesn't
clear the bar. The model said escalate.

Row 24 is an HR employee asking for write access to HR systems, no
People-team admin approval anywhere in the request. Same story: the
requirement isn't met, so deny. Model said escalate again.

### Why this happened

The model treats "no approval mentioned" as an open question, like the
approval could still show up later and someone should go check. I'd treated
it as a closed one: the policy says approval is required, none exists, so the
answer is no. Rule 6 actually gives a hint about which reading is closer to
right, it says "if only one has approved, escalate," which implies there's a
difference between one approval and zero. Zero isn't the ambiguous case that
line was written for.

I don't think this is the model being sloppy. In both cases it cited the
correct rule and gave a reasonable explanation for its answer. It just landed
on the more cautious reading of a rule that had a gap in it. Honestly, that
gap is on me and my policy draft, not the model. If I tightened Rule 6 to
spell out "zero approvals is a deny, exactly one is an escalate," this
probably goes away.

### Take away

93% is a good first pass, but I wouldn't call it hands-off for anything that
actually matters, like real access grants or billing changes. And the
interesting thing here isn't that the model hallucinated or forgot a rule,
it read an ambiguous rule cautiously instead of strictly. That's a policy
problem more than a prompting problem: the fix is writing tighter rules, not
a better prompt. It also makes me think an LLM reviewer erring toward
"escalate" over "approve" when it's unsure is a fine default to have, even
when it costs a point against my answer key.

## Files

```
access-policy-eval/
├── policy.md              the policy being tested
├── tests.csv              30 test cases plus my answer key
├── prompt.txt             what actually gets sent to the model
├── promptfooconfig.yaml   wires it all together and grades it
├── package.json
└── README.md
```

## Why I built this

I wanted real, hands-on reps at LLM evaluation: writing test cases, deciding
what "correct" means ahead of time, and measuring a model against that. This
was the domain I know best, so I used it as the test bed.
