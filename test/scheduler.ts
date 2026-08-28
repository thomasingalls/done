/**
 * The storage-model scheduler (queue item 3b, the `S0-2`/`S0-3` interface).
 *
 * **Why this exists.** `HANDOFF.md`'s class 2 is *interleavings the pure models
 * cannot schedule: crash points and second writers that are unexpressible
 * rather than refuted*. `FU-08`'s finding is the type specimen: `commitBatch`
 * was a total synchronous function, so *"there is no kill point between the
 * journal write and the IndexedDB commit anywhere in the file"* — the window
 * the design worries about was not a state the model could reach, and 18/18
 * tests passed around it. `P-3`'s ratified rule is the charter here: **a window
 * the models cannot schedule is an open defect, never a passed test.**
 *
 * So a model under this scheduler is written as *atomic steps over a world that
 * separates durable from volatile state*, and the scheduler supplies the two
 * things the pure models could not: a **kill** at any step boundary (volatile
 * state is rebuilt from durable state by the model's own recovery rule) and a
 * **second writer** interleaved at any step boundary (each writer's program
 * order is enforced; everything between writers is the schedule's to choose).
 *
 * **What a kill means, exactly.** The page dies. A writer's un-run steps died
 * with it, so scheduling one afterwards is an error the harness throws on —
 * unless the writer is declared `resumable`, which is a claim about its design:
 * its steps read durable state to decide what remains (the shape
 * `GenerationApply` earns with its durable `apply` record, and the shape
 * `P-1`'s enrollment states must earn at the `S0-2` return). The `observed` log
 * survives a kill on purpose: what the person at the screen has already seen —
 * an update appearing, a "saved" — is not unseen by a crash, and the class-2
 * reproductions are precisely mismatches between that log and what durable
 * state can rebuild.
 *
 * **The boundary census** (`P-3` falsifier 21's shape). A check-to-commit pair
 * is declared as a `Boundary`, and `demonstrateBoundary` returns two schedules
 * — a kill inside the window, and a second writer's step inside the window —
 * built mechanically from the writers' own program order, then **executed**, so
 * expressibility is an execution receipt rather than command-text reachability
 * (`FU-14`'s lesson, one gate over). A model that collapses a declared pair
 * into one atomic step fails `demonstrateBoundary` with the `FU-08` diagnosis,
 * which is what "the coverage check fails on a write-path boundary it cannot
 * express, rather than a review noticing" means executably.
 *
 * **What this file does not do.** It asserts nothing about any particular
 * model — test/storageSchedule.test.ts composes the write-admission machine
 * with `GenerationApply` and states which reached states are open defects and
 * which are invariants. And it says nothing about whether IndexedDB or
 * localStorage behave as a model says; that boundary is `generationApply`'s
 * already: these are the decisions the machines make, checked against the
 * design rather than against the platform (`L-1`/`L-2` own the platform).
 */

/**
 * One model world. `durable` survives a kill; `volatile` is rebuilt from it;
 * `observed` is what the person has already seen and survives everything.
 */
export interface World<D, V> {
  readonly durable: D;
  readonly volatile: V;
  readonly observed: readonly string[];
}

/** A writer's atomic step: what one turn of the scheduler may execute. */
export interface Step<D, V> {
  readonly id: string;
  readonly run: (w: World<D, V>) => World<D, V>;
}

/**
 * A writer is a program: its steps execute in this order, whatever the
 * interleaving. `resumable` writers may be scheduled after a kill, because
 * their steps are driven by durable state; everyone else's remaining steps
 * died with the page.
 */
export interface Writer<D, V> {
  readonly name: string;
  readonly resumable?: boolean;
  readonly steps: readonly Step<D, V>[];
}

export interface Machine<D, V> {
  readonly initial: World<D, V>;
  /** The reload path: the volatile state a fresh page derives from durable state. */
  readonly recover: (durable: D) => V;
  readonly writers: readonly Writer<D, V>[];
}

/** A schedule point: run one writer's next-by-name step, or kill the page. */
export type Point = { readonly step: string } | { readonly kill: true };

export interface Trace<D, V> {
  readonly world: World<D, V>;
  /** The points that executed, in order — the receipt that the schedule ran. */
  readonly ran: readonly string[];
}

const qualified = /^([^.]+)\.(.+)$/u;

/**
 * Run one explicit schedule. Steps are named `writer.step`; program order per
 * writer is enforced, a step scheduled twice or out of order throws, and a
 * non-resumable writer's steps are unschedulable after any kill. Throwing is
 * the point: a schedule the model cannot take must fail loudly, because a
 * silently skipped point would be this harness rebuilding the defect it exists
 * to end.
 */
export const runSchedule = <D, V>(machine: Machine<D, V>, schedule: readonly Point[]): Trace<D, V> => {
  const cursor = new Map(machine.writers.map((w) => [w.name, 0]));
  let world = machine.initial;
  let killed = false;
  const ran: string[] = [];

  for (const point of schedule) {
    if ('kill' in point) {
      world = { ...world, volatile: machine.recover(world.durable) };
      killed = true;
      ran.push('kill');
      continue;
    }
    const m = qualified.exec(point.step);
    if (m === null) throw new Error(`schedule point "${point.step}" is not writer.step`);
    const writer = machine.writers.find((w) => w.name === m[1]);
    if (writer === undefined) throw new Error(`schedule names writer "${m[1]}", which the machine does not have`);
    if (killed && writer.resumable !== true) {
      throw new Error(
        `schedule runs ${point.step} after a kill, and "${writer.name}" is not resumable: ` +
          'its in-flight program died with the page, and only durable state may drive what happens next.',
      );
    }
    const at = cursor.get(writer.name) ?? 0;
    const next = writer.steps[at];
    if (next === undefined) throw new Error(`schedule runs ${point.step}, and "${writer.name}" has no steps left`);
    if (next.id !== m[2]) {
      throw new Error(
        `schedule runs ${point.step}, and "${writer.name}"'s next step in program order is "${next.id}" — ` +
          'the scheduler chooses interleavings, never a writer\'s own order.',
      );
    }
    world = next.run(world);
    cursor.set(writer.name, at + 1);
    ran.push(point.step);
  }
  return { world, ran };
};

/** The steps of one writer up to and including `until`, as schedule points. */
export const upTo = <D, V>(writer: Writer<D, V>, until: string): Point[] => {
  const index = writer.steps.findIndex((s) => s.id === until);
  if (index === -1) throw new Error(`"${writer.name}" has no step "${until}"`);
  return writer.steps.slice(0, index + 1).map((s) => ({ step: `${writer.name}.${s.id}` }));
};

/** The steps of one writer strictly after `after`, through `until` (or to the end). */
export const between = <D, V>(writer: Writer<D, V>, after: string, until?: string): Point[] => {
  const from = writer.steps.findIndex((s) => s.id === after);
  if (from === -1) throw new Error(`"${writer.name}" has no step "${after}"`);
  const to = until === undefined ? writer.steps.length - 1 : writer.steps.findIndex((s) => s.id === until);
  if (to === -1) throw new Error(`"${writer.name}" has no step "${until}"`);
  return writer.steps.slice(from + 1, to + 1).map((s) => ({ step: `${writer.name}.${s.id}` }));
};

/**
 * A declared check-to-commit pair on the write path, and who the second writer
 * is. `P-3` falsifier 21 names four; the composed model declares its census and
 * a boundary that stops being expressible fails the demonstration below.
 */
export interface Boundary {
  readonly name: string;
  readonly writer: string;
  readonly check: string;
  readonly commit: string;
  /** A different writer's step that can land inside the window, `writer.step`. */
  readonly secondWriter: string;
}

export interface BoundaryDemonstration<D, V> {
  /** The window reached, then the page killed inside it. */
  readonly killed: Trace<D, V>;
  /** The window reached, the second writer's step landed inside it, the commit taken. */
  readonly raced: Trace<D, V>;
}

/**
 * Demonstrate one boundary by executing both schedules. Throws — with the
 * `FU-08` diagnosis — when the pair is not two distinct steps of one writer in
 * check-before-commit order, or the second writer is not another writer: a
 * window that cannot be scheduled is an open defect, never a passed test.
 */
export const demonstrateBoundary = <D, V>(
  machine: Machine<D, V>,
  boundary: Boundary,
): BoundaryDemonstration<D, V> => {
  const writer = machine.writers.find((w) => w.name === boundary.writer);
  if (writer === undefined) throw new Error(`boundary "${boundary.name}": no writer "${boundary.writer}"`);
  const checkAt = writer.steps.findIndex((s) => s.id === boundary.check);
  const commitAt = writer.steps.findIndex((s) => s.id === boundary.commit);
  if (checkAt === -1 || commitAt === -1 || checkAt >= commitAt) {
    throw new Error(
      `boundary "${boundary.name}" is not expressible: "${boundary.check}" and "${boundary.commit}" must be ` +
        `two distinct atomic steps of "${boundary.writer}", check before commit. A model that fuses them has `
        + 'no kill point between the check and the commit anywhere in the file — the FU-08 shape.',
    );
  }
  const m = qualified.exec(boundary.secondWriter);
  const secondStep = m?.[2];
  const second = m === null ? undefined : machine.writers.find((w) => w.name === m[1]);
  if (second === undefined || secondStep === undefined || second.name === boundary.writer) {
    throw new Error(
      `boundary "${boundary.name}" names second writer "${boundary.secondWriter}", which is not another ` +
        'writer\'s step — one writer alone cannot express a race.',
    );
  }

  const window = upTo(writer, boundary.check);
  const killed = runSchedule(machine, [...window, { kill: true }]);
  const raced = runSchedule(machine, [
    ...window,
    ...upTo(second, secondStep),
    ...between(writer, boundary.check, boundary.commit),
  ]);
  return { killed, raced };
};
