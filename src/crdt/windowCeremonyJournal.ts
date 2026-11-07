/** Fixed Window journal effects for genuine native preparation roots only. */
import { requireWindowCeremonyCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { createWindowJournalReader } from './windowJournalRead';
import { createProtectionJournalRetirement } from './windowJournalMutation';
import { countJournalEntries, countLegacyJournalEntries } from './startupStorage';
export function createWindowCeremonyJournal(cohort: WindowAccountCohort) {
  requireWindowCeremonyCohort(cohort);
  const reader = createWindowJournalReader(cohort),
    retirement = createProtectionJournalRetirement(cohort);
  return {
    retirement,
    methods: {
      retireProtectedJournal: (input: unknown) =>
        retirement.remove(input as Parameters<typeof retirement.remove>[0]),
      journalBegin(input: unknown) {
        requireWindowCeremonyCohort(cohort);
        return reader.begin((input as { prefix: string }).prefix);
      },
      journalObservationBegin(input: unknown) {
        requireWindowCeremonyCohort(cohort);
        return reader.beginObservation((input as { prefix: string }).prefix);
      },
      journalPage(input: unknown) {
        requireWindowCeremonyCohort(cohort);
        return reader.page((input as { id: number }).id);
      },
      journalFinish(input: unknown) {
        requireWindowCeremonyCohort(cohort);
        reader.finish((input as { id: number }).id);
      },
      journalCount(input: unknown) {
        requireWindowCeremonyCohort(cohort);
        const prefix = (input as { prefix: string }).prefix;
        if (
          typeof prefix !== 'string' ||
          !/^done\.pending-update\.done(?:\.[a-f0-9]{32})?\.$/u.test(prefix)
        )
          throw Error('Startup journal scope changed');
        return cohort.write(() => countJournalEntries(prefix));
      },
      legacyJournalCount() {
        requireWindowCeremonyCohort(cohort);
        return cohort.write(countLegacyJournalEntries);
      },
    },
  };
}
