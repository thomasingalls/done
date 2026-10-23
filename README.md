# done

**A minimal daily tracker focused on what you finish.** Moving a _next task_ to _done_ is the main
gesture, and most of the app exists to keep that gesture short. You also get a big markdown file — Goals —
to keep track of everything that isn't active yet.

A day has three sections, read in the order **Next, Done, Scheduled**: what you are doing, what you did,
and the tail of intentions that have not come up yet. Next holds three items at a time. Done reads
newest-first — anything completed goes on top, and that order is the record.

Local-first, offline by default, and your data is plain markdown on the way out.

## Where things are

**This file deliberately does not track the state of the project.** It used to, and it was reliably
out of date. Everything below is maintained where it belongs:

| If you want                                   | Read                                       |
| --------------------------------------------- | ------------------------------------------ |
| **What the project is doing right now**       | [docs/progress.md](docs/progress.md)       |
| What has to happen before what, and why       | [docs/sequencing.md](docs/sequencing.md)   |
| What the product is, normatively              | [docs/PRD.md](docs/PRD.md)                 |
| Product follow-ups and ideas to revisit       | [docs/product-backlog.md](docs/product-backlog.md) |
| How it is built, normatively                  | [docs/TRD.md](docs/TRD.md)                 |
| How to run, build and test it                 | [docs/development.md](docs/development.md) |
| What the code is and where                    | [docs/codebase.md](docs/codebase.md)       |
| Why an implementation choice was made         | [docs/decisions.md](docs/decisions.md)     |
| Why a product or architecture choice was made | [docs/sessions.md](docs/sessions.md)       |
| What has shipped                              | [docs/completed.md](docs/completed.md)     |
| Measured performance against the budgets      | [docs/performance.md](docs/performance.md) |

**The PRD and TRD are what is currently true.** The decision records preserve the reasoning behind them,
including reasoning that has since been superseded — where a record and the requirements disagree, the
requirements win.

## Running it

```
corepack enable
pnpm install
pnpm dev
```

Then <http://localhost:5173>. Full instructions, the test matrix and the Tailscale HTTPS setup are in
[docs/development.md](docs/development.md). The relay is a separate package with its own install and its
own tests — see [relay/README.md](relay/README.md).
