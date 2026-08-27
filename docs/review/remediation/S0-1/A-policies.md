# `S0-1` Stage A — the policy objects

**Status:** proposed for `S0-8` review · these are the shapes the Stage D checks read

## 0. One rule, applied four times

`P-5` selected `RC-8C`: **one home per fact; every consumer reads the home; where two artifacts must agree, the
agreement is checked in both directions by something that is neither of them.** Each object below names its home
and its consumers, because a policy object without a stated home is the second copy the rule exists to prevent.

## 1. `SuitePath` — an exhaustive enum, and what it means

```
SuitePath = 'async' | 'sync' | 'none'

  async   the primitive EXECUTES on the asynchronous path
  sync    the primitive EXECUTES on the synchronous journal path
  none    this role selects NO primitive at all
```

**`path` is about execution, not about what a value is later used for**, and that definition is the whole reason
`both` looked plausible. HKDF-SHA-256 derives the journal subkey — a key consumed synchronously — and is `async`
because the derivation runs at open. Row 1 already says _labels are what keep §13.2's separation real_; without
the definition written down, _it produces something the sync path uses_ is a live reading and is how a second
`both` arrives.

**`both` is not a member, and the refusal names the rule.** Under the selected stronger reading a primitive on
both paths is the violation, so a label asserting it is a violation asserting itself. The error says that rather
than saying _unknown enum value_.

**`none` is constrained, because otherwise it is the next `both`.** A role at `none` must name no primitive —
the two current ones read _"None. HKDF-SHA-256 only"_ and _"None, and nothing to stretch"_. A role labelled
`none` whose primitive is a real primitive is refused, or `none` becomes the hatch for hiding a primitive from
the separation check exactly as `both` was.

**Classification is total, not filtered.**

```
for each role:
    switch (role.path)
      'async' -> async bucket
      'sync'  -> sync bucket
      'none'  -> assert the primitive is none
      'both'  -> FAIL: §13.10 forbids the state this label asserts
      other   -> FAIL: unknown path, and an unclassified role is an unchecked one
then: async ∩ sync must be empty, and sync must be non-empty
```

**The bug was the `filter`, not the value.** `filter(r => r.path === want)` drops everything it does not
recognise, so the check could only ever pass on an unrecognised label. `'Async'`, `'sync '` and `'shared'` fail
today the same way `both` does; a `switch` with a default that throws is what makes the classification total.

**Home:** `SUITE_1` in `scripts/generate-suite-vectors.mjs`. **Consumers:** `checkSeparation`, the published
vector, row 1 §3's prose — and the agreement between the last two is checked in both directions, because row 1
§3 lists the async set in words and has been right while the data was wrong.

## 2. `EmbeddingPolicy` — same-origin only, two independent checks

```
accept(cd) requires:
  cd.crossOrigin !== true          the ceremony was not performed in a frame
  cd.topOrigin === undefined       and no embedding origin is claimed
```

**Two checks rather than one, because a client can contradict itself.** The specification emits `topOrigin` only
when `crossOrigin` is true, so a `clientDataJSON` carrying `crossOrigin: false` **and** a `topOrigin` is
malformed — and a verifier reading only the boolean accepts it while the signed bytes record an embedding it
never looked at.

**Absent is not false, and that matters here.** `crossOrigin` is optional in the serialization; a missing member
is the ordinary same-origin case and is accepted. So the test is `!== true` rather than `=== false`, and a
negative that omits the member must still pass.

**Home:** `scripts/lib/webauthn.mjs`, beside the ceremony it belongs to. **Consumers:** row 12's slot verifier
and row 14 §5's step-up verifier, which are the two selections that put an assertion in front of an operation.
Neither may implement its own copy — that is the drift the helper was created to stop.

**Not a substitute for the deployment control, and not substituted by it.** CSP `frame-ancestors 'none'` makes
the framed ceremony unreachable and is selected in §3 below; this is the half that can be tested from the
repository, and §10.9's argument is that the origin boundary is defended in the build rather than assumed.

## 3. `OriginClaim` — allowlist by default, and a claim the size of its evidence

```
AllowedOrigin = { origin, category, reason }

  category  'namespace-identifier'  a name that is never fetched
            'subresource'           an asset the build actually loads

Rule:  every remote origin appearing in built output is a VIOLATION unless it
       is allowlisted. There is no "mention" that passes.
```

**The seven-syntax list had no policy behind it.** `ALLOWED_ORIGINS` is already empty — no remote origin may be
referenced at all — so the distinction between a fetching form and a mention was never a policy distinction, and
the script already computes the set of every remote origin it sees. Inverting the default deletes an entire
class of miss: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `setAttribute`, worker constructors and
anything else expressible.

**Measured before selecting.** The current build contains exactly one remote origin, `http://www.w3.org`, and
every occurrence is an XML namespace identifier — the SVG, MathML, `xlink` and `xml` namespaces React hands to
`setAttributeNS`. **The inversion costs one entry, and it is a category rather than a party.**

**What the claim becomes, which is smaller than the sentence it replaces:**

> No literal remote URL appears in built output, other than allowlisted namespace identifiers, which are names
> and not fetches.

**What it stops claiming:** _the key-holding origin is first-party only._ A URL assembled from parts, or code
fetched and then evaluated, is invisible to any static scan — `originOf` already discards anything carrying
JavaScript punctuation as a fragment, which is correct and is also the boundary of what can be proved here.

**The residual's control is CSP**, selected now and read back later: `default-src 'self'`, `connect-src 'self'`,
`frame-ancestors 'none'`. The third is the same header §2 leans on, which is one artifact answering two
findings.

**Home:** `ALLOWED_ORIGINS` in `scripts/check-origin-isolation.mjs`. **Consumers:** `pnpm build`, row 17
addendum A1, TRD §10.9 — and A1's claim text must match the printed conclusion, checked rather than assumed.

## 4. `DatedObservation` — the outside world has no home to read

```
DatedObservation = { claim, source, observed, expires }
```

External facts — browser support for X25519, a deployed header, an authenticator's behaviour — are not in the
repository, so `RC-8C`'s _read the home_ has nothing to read. They get their own discipline:

**Source, date, and an expiry — and an observation with no expiry is the defect an unbounded retention is**
(§16.6's instinct at a different object). A support claim recorded once and never re-checked is a claim about a
browser version nobody is running.

**This is why §10.11's evidence table is correctly empty rather than incomplete.** Its own rule is a floor _with
evidence and a date_; an asserted version row would be worse than the omission, because it would look like
evidence. What is added here is that empty-under-a-stated-rule is the right state until a dated source exists,
and that enforcement belongs at the gate that consumes it (`L-4`) rather than at every build.

**Home:** the evidence table beside §10.11's rule. **Consumers:** the release gate, and `S0-9`'s challenge.

## 5. `StatusAgreement` — §15.1 is the register, in both directions

```
forward   a row §15.1 lists as selected is not described as open anywhere in the PRD
backward  a PRD statement that a row is open names a row §15.1 also lists as open
```

`checkCoverage` already reads §15.1 rather than trusting an owner string, which is the forward habit. What has
never existed is the backward one — and that is exactly how `f-tip-prd-stale-selection-status` survived: the
TRD closed rows 5, 11 and part of 14 while three PRD subsections went on calling them open, and every check was
green throughout.

**The check lives in neither document.** That is `RC-8C`'s third clause and the reason a one-directional check
in the generator was not enough: the generator is one of the two things that can be wrong.

## Falsifier map

| #   | Falsifier                                                                       | Object |
| --- | ------------------------------------------------------------------------------- | ------ |
| 1   | A role labelled `both` fails, and the message names §13.10 rather than the enum | 1      |
| 2   | An unknown `path` value fails instead of entering no bucket                     | 1      |
| 3   | A `none` role naming a real primitive fails                                     | 1      |
| 4   | Two roles sharing a primitive across `async` and `sync` still fail              | 1      |
| 5   | The published async/sync sets and row 1 §3's prose agree, in both directions    | 1      |
| 6   | `crossOrigin: true` with **no** `topOrigin` is refused, for that reason         | 2      |
| 7   | `topOrigin` present with `crossOrigin: false` is refused, for that reason       | 2      |
| 8   | A `clientDataJSON` **omitting** `crossOrigin` verifies                          | 2      |
| 9   | Both ceremonies refuse both cases, from the one shared predicate                | 2      |
| 10  | A built file containing `fetch("https://x.example")` fails                      | 3      |
| 11  | A remote URL in any other position fails                                        | 3      |
| 12  | The allowlisted namespace identifier passes; an un-reasoned second origin fails | 3      |
| 13  | The printed conclusion states only what was checked                             | 3      |
| 14  | An observation without a date or an expiry fails at the gate that reads it      | 4      |
| 15  | A PRD subsection calling a selected row open fails                              | 5      |
| 16  | A PRD statement naming a row open that §15.1 lists as selected fails            | 5      |
