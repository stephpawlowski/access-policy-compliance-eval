# Access Policy Compliance Checker

I wanted to know if an LLM can actually apply a written access policy the way a
human IAM reviewer would. Not just handle the obvious cases, but know when to
punt to a human instead of guessing. This is a small eval built with
[promptfoo](https://www.promptfoo.dev/), a free, open-source tool for testing
and scoring LLM prompts against a dataset of test cases.

This is version 4 of the project. See "What I found" below for the real
results against `claude-sonnet-5` on all 161 cases across the three
companies.

## What changed in v4

The first three versions of this project all tested a single fictional
company, Fernwood Systems, against a single pass/fail grade: did the model's
first-line decision (APPROVE/DENY/ESCALATE) match the answer key. That's a
real test, but it leaves two harder questions unasked. Can a model juggle
*several* candidate policies at once without letting one bleed into another?
And when it gets the final decision right, is that because it actually
reasoned through the correct rule, or did it land on the right answer for
the wrong reason?

v4 answers both by doing two things at once:

1. **Three companies instead of one.** Fernwood Systems is joined by Meridian
   Health (a fictional hospital system) and Vertex Capital (a fictional
   trading firm), each with its own roles, departments, systems, and rules.
   Every request in the test set names which company it's for, and the
   model is given all three policies in context, on purpose, so getting the
   right answer requires actually picking the right policy, not just having
   memorized the only one available.
2. **Three graded dimensions instead of one.** Every response is now scored
   on `policy_correct` (did the model apply the right company's policy at
   all), `rule_correct` (did it cite the exact right rule number within that
   policy), and `decision_correct` (did it reach the right final answer).
   These are genuinely different failures: a model can reach the correct
   decision while citing the wrong rule, or cite a rule from the wrong
   company's policy entirely while still landing on a plausible-sounding
   answer. Collapsing all of that into a single pass/fail, like v1 through
   v3 did, hides which of those is actually happening.

To make `policy_correct` and `rule_correct` gradable, every rule in every
policy now has a company-prefixed tag, Fernwood's rules are F1 through F10,
Meridian's are M1 through M8, Vertex's are V1 through V8, and the prompt
requires the model to cite that exact tag in its justification.

## The three companies

- **Fernwood Systems** (general corporate IAM, carried forward from v1
  through v3 essentially unchanged): 5 roles, 6 departments, 10 named
  systems, 10 rules. This is the baseline the other two are built to
  contrast with.
- **Meridian Health** (fictional hospital system, HIPAA-flavored): 5
  clinical/administrative roles, 5 departments, 6 named systems, 8 rules.
  The interesting wrinkle here is a break-glass clause on Patient Records:
  during an active declared clinical emergency, a Clinician can get
  emergency access outside their normal assignment with a lower approval
  bar than usual, mirroring how Fernwood's Rule 3 loosens Incident Response
  Tools access during an active security incident, but applied to a
  completely different kind of emergency and a completely different system.
- **Vertex Capital** (fictional asset-management/trading firm,
  segregation-of-duties flavored): 5 roles, 5 departments, 6 named systems,
  8 rules. This one leans hardest into rules that exist specifically to
  keep a role *out* of a system, no matter how many approvals pile up: the
  Compliance Officer is denied Trading System access outright, always,
  because compliance staff should never be able to place trades, and
  Traders are denied Model Risk Repository access outright, always, because
  a trader shouldn't have direct access to the risk models that govern
  their own limits. Fernwood and Meridian don't have any role that's
  unconditionally denied a system regardless of context besides the
  offboarding override; Vertex has two.

One pattern shows up across all three policies without me planning it that
way going in: every company's audit/logging system has no escalate path at
all. Fernwood doesn't have a dedicated one, but Meridian's Audit Logs and
Vertex's Audit Trail both work this way. Every other resource in every policy
gives a borderline case somewhere to escalate to a human. The audit system
never does. Once you're not on the short list of roles with standing access,
the answer is just no, regardless of how many approvals you've collected.
That felt like the right way to model it: the one thing regulators actually
check is the one place none of these companies wanted to leave room for a
judgment call.

The catch-alls (the rule that applies when a resource isn't explicitly
listed) differ across the three companies too, deliberately. Fernwood's and
Vertex's catch-alls both have an auto-approve path at two or more prior
approvals. Meridian's doesn't, one or more approvals only ever gets you
escalated, never approved outright. Healthcare access policy erring more
conservative by default felt like the realistic choice.

## What's in this repo

```
access-policy-compliance-eval-v4/
├── policies/
│   ├── fernwood.md         Fernwood Systems policy (10 rules, tags F1-F10)
│   ├── meridian.md         Meridian Health policy (8 rules, tags M1-M8)
│   └── vertex.md           Vertex Capital policy (8 rules, tags V1-V8)
├── docs/
│   ├── policy-engine.js    the actual policy logic for all three companies,
│   │                       shared by the generator and the simulator
│   └── index.html          the dashboard: results table + live simulator
├── scripts/
│   └── generate-scenarios.js   builds tests.csv from policy-engine.js
├── tests.csv               161 test cases plus the generated answer key
├── prompt.txt               what actually gets sent to the model
├── promptfooconfig.yaml     wires it all together and grades three
│                             separate dimensions per response
├── package.json
└── README.md
```

**`docs/policy-engine.js`** is still the single source of truth for the
policy logic, now for all three companies instead of one. It exports
`evaluate(company, input, config)` plus per-company `ROLES`, `DEPARTMENTS`,
`RESOURCES`, and `DEFAULT_CONFIG`, where `company` is `'fernwood'`,
`'meridian'`, or `'vertex'`. Both the test generator and the dashboard's live
simulator call this exact code, so the simulator and the eval's answer key
can never drift apart from each other, for any of the three companies.

**`scripts/generate-scenarios.js`** builds `tests.csv`: hand-picked scenarios
per company covering every rule-and-decision combination at least twice,
adversarial cases per company testing ambiguity and distraction, a new
cross-company adversarial set (8 rows) specifically testing whether the
model conflates similarly-named systems that belong to different companies,
Meridian's Billing/Claims System versus Fernwood's Billing System, Meridian's
Audit Logs versus Vertex's Audit Trail, and so on, and a coverage summary
printed to stderr so gaps are visible rather than assumed away. 161 rows
total: 64 Fernwood, 50 Meridian, 47 Vertex.

**`prompt.txt`** gives the model all three full policies in clearly labeled
sections, then the request as structured fields including which company it's
for, then instructions to answer APPROVE/DENY/ESCALATE on the first line and
cite the specific company-prefixed rule tag on the second.

**`promptfooconfig.yaml`** grades each response on three named metrics:
`policy_correct` (does the cited rule tag's company-letter prefix match the
expected company), `rule_correct` (does the output cite the exact expected
rule tag, checked as a whole token so "M2" doesn't false-positive match
inside "M20"), and `decision_correct` (does the first line match the
expected decision). A response that doesn't cite any rule tag at all fails
`policy_correct` outright, that's a real miss, not a free pass.

## Try it yourself

Open `docs/index.html` in a browser. The "Try it yourself" panel lets you
pick a company, which changes the role/department/system/context-flag
options to match that company's policy, then computes the decision instantly
in your browser off `policy-engine.js`, no API key or server involved.

The results table below it is populated with the real run described below:
all 161 cases, each with three separate pass/fail badges (Policy, Rule,
Decision) and a filter to show only the failures on a given dimension.

The v3 dashboard also had an "Ask the real model" button that called a small
Cloudflare Worker holding the Anthropic API key server-side. That worker was
written for the single-company v3 prompt and doesn't understand the v4
multi-company prompt or the three-dimension grading, so it isn't wired up in
this pass, there's a comment in `docs/index.html` marking it as a follow-up
rather than shipping it silently broken.

## Setup

You'll need [Node.js](https://nodejs.org/) 18 or later.

```bash
cd access-policy-compliance-eval-v4
npm install
```

Then set an Anthropic API key (grab one at https://console.anthropic.com/):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Want to test a different model instead? Edit the `providers:` list in
`promptfooconfig.yaml` and set the matching API key.

If you want to regenerate `tests.csv` yourself, or change a rule in any of
the three companies' engines and see how the answer key updates:

```bash
node scripts/generate-scenarios.js > tests.csv
```

## Running it

```bash
npm run eval -- -o results.json
```

That runs all 161 cases across all three companies, grades each response on
all three dimensions, and saves the full results to `results.json`. For a
browsable view of each individual result, including a per-metric breakdown:

```bash
npm run view
```

## What I found

Model tested: `claude-sonnet-5`, one provider, all 161 cases across the three
companies.

**Policy correct: 161/161 (100%). Rule correct: 161/161 (100%). Decision
correct: 160/161 (99.4%).**

The two dimensions I built this version specifically to test came back
clean. The model never once cited a rule from the wrong company's policy,
not on the general adversarial cases, and not on the eight cross-company
naming-confusion rows built specifically to tempt that mistake (a Meridian
Billing/Claims System request reasoned about with Fernwood's Billing System
rule, a Vertex Audit Trail request answered with Meridian's Audit Logs rule,
and so on). It also never cited the wrong rule number within the correct
policy. Going in, I expected stuffing three full policies into one prompt to
produce at least a handful of cross-contamination errors. It didn't. That's
a genuinely useful negative result: the concern the whole multi-company
redesign was built around turned out not to be where this model struggles.

By company: Fernwood 63/64 decision-correct (98.4%), Meridian 50/50 (100%),
Vertex 47/47 (100%). Every miss on any dimension, all one of them, was on
Fernwood.

### The one remaining miss, again, is a formatting habit

Row 19: an Employee in Engineering (not Finance) requesting the Payroll
System with zero prior approvals. Expected: DENY, rule F4. The model's raw
output:

> ESCALATE
> Rule F4 applies because the requester is an Employee outside Finance
> requesting a Finance-restricted system, and only Managers/Admins with
> prior approvals qualify for escalation, however, since the requester is
> an Employee (not Manager/Admin), F4's "everyone else outside Finance is
> denied" applies...
>
> Wait, let me reconsider: F4 states Managers and Admins with approvals are
> escalated; everyone else outside Finance is denied.
>
> DENY
> Rule F4 applies because the requester is an Engineering Employee (not
> Finance, not a Manager or Admin) requesting a Finance-restricted system,
> and F4 denies all non-Finance staff who aren't Managers/Admins with prior
> approvals, regardless of approval count.

This is the exact same failure shape as the one miss in v3 (an Intern
requesting Employee Records, back then): the model second-guesses itself
mid-answer, and the corrected, final answer is right. My grading script
reads the first line, per what the prompt instructs, so this scores as a
fail on `decision_correct` even though `rule_correct` and `policy_correct`
both pass, since the eventual rule citation and reasoning are correct
throughout. Multi-dimensional grading actually makes this easier to see
clearly than v3's single pass/fail did: this row isn't a policy mix-up or a
wrong rule, it's specifically and only a first-line formatting habit,
because the other two metrics say so directly instead of me having to infer
it from reading the transcript.

### Take away

The headline result isn't the 99.4%, it's that the two failure modes I
built this version to go looking for (blending two companies' rules
together, and citing a real but wrong rule number) didn't show up at all,
against a fairly deliberate adversarial set designed to provoke exactly
that. The one thing that did go wrong is the same thing that went wrong in
v3: a model that talks through its reasoning out loud and self-corrects
past the point my grader is instructed to stop reading.

## Why I built this

I wanted real, hands-on reps at LLM evaluation: writing test cases, deciding
what "correct" means ahead of time, and measuring a model against that. This
was the domain I know best, so I used it as the test bed. v1 through v3
answered "can a model apply one written policy correctly," including knowing
when to escalate instead of guessing (v3 landed at 99.05%, 104 of 105, with
the one miss being a grading-format artifact rather than a misapplied rule).
v4 is a deliberately harder question: can a model keep several written
policies straight at once, and when it gets the right answer, is that for
the right reason. Splitting the old single pass/fail into three separate
dimensions was the only way I could think of to actually find out, rather
than just assuming a correct final decision meant correct reasoning
underneath it.
