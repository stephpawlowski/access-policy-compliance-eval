# Access Policy — Pantheon-style IAM Scenario (fictional company: "Fernwood Systems")

This is the plain-English access policy the LLM will be asked to enforce. It's written
the way a real internal IAM/governance policy reads — a mix of clear rules and a few
genuinely ambiguous edges, on purpose, so the eval has real signal.

## Roles
- **Employee (Full-Time, FTE)** — permanent staff.
- **Contractor** — external, time-boxed engagement, no equity, access reviewed quarterly.
- **Intern** — temporary FTE-track, always paired with an FTE sponsor/manager.
- **Admin** — any FTE granted elevated IAM privileges (can grant/revoke access for others).
- **Manager** — an FTE with direct reports.

## Departments
Engineering, Finance, Sales, Support, People (HR), Security.

## Rules

1. **Contractors get read-only access** to systems relevant to their statement of work.
   Contractors may never be granted write, admin, or billing access, regardless of
   who requests it or how senior the requester is.

2. **Billing/financial-systems access** may only be granted to full-time employees
   on the Finance team. No exceptions for other departments, even for senior staff
   (e.g., a VP of Engineering does not get billing access by virtue of seniority).

3. **Admins may grant access**, but only within the scope of rule 1 and rule 2 — an
   admin cannot override the contractor read-only limit or the Finance-only billing
   restriction for anyone, including themselves.

4. **Production system access** (customer data, prod databases, deploy tooling)
   requires: FTE status AND either (a) Engineering or Security department membership,
   or (b) explicit written approval from a Security team admin. Contractors may be
   granted read-only, non-production (staging/sandbox) access only, never production.

5. **Interns** get the same access ceiling as a Contractor (read-only, non-production,
   no billing) UNLESS their sponsoring manager is an Admin who explicitly co-signs a
   broader request in writing — in that case, treat as escalate (needs human judgment,
   not an auto-approve).

6. **Cross-department requests** (e.g., a Sales employee requesting Engineering system
   access) require the requester's manager AND the owning department's admin to both
   approve. If only one has approved, escalate.

7. **Offboarding**: any access request from a person whose employment/contract end date
   has passed must be denied outright, regardless of role or past access level.

8. **People (HR) team** has read-only access to personnel records for all departments
   by default; write access to HR systems requires People-team admin approval.

9. **Security team members** (FTE) may request elevated/admin access to any system for
   incident-response purposes; these are auto-approved but logged for retroactive
   review within 24 hours — treat as approve, but note the retroactive-review caveat.

10. **Anything not clearly covered by rules 1-9** (genuinely novel requests, unclear
    role/department combinations, conflicting information in the request) should be
    escalated to a human reviewer rather than guessed at.

## Decision categories
Every request should be classified as exactly one of:
- **Approve** — grant the access as requested.
- **Deny** — refuse the access as requested.
- **Escalate** — insufficient information or a genuine judgment call; route to a human.
