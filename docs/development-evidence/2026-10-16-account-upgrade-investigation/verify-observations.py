#!/usr/bin/env python3
"""Independently check the recorded refresh boundary; does not run a browser."""
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read_json(path):
    plain = ROOT / path
    if plain.exists():
        return json.loads(plain.read_text())
    return json.loads(gzip.decompress(Path(str(plain) + '.gz').read_bytes()))


rows = []
for kind in ['fresh-account', 'promoted-local']:
    observations = read_json(kind + '/observations.json')
    events = read_json(kind + '/browser-events.json')
    assert len(observations) == 20
    stop = next(e['at'] for e in events if e['kind'] == 'server-stop')
    destructive = [e for e in events if e['at'] >= stop and e['kind'] in
                   ['idb-delete-database', 'idb-clear', 'storage-clear']]
    assert not destructive
    for browser in ['original', 'joined']:
        def stage(name):
            matches = [o for o in observations if o['browser'] == browser and o['stage'] == name]
            assert len(matches) == 1
            return matches[0]

        before = stage('previous-synced-before-server-stop')
        after = stage('immediately-after-hard-refresh')
        unlocked = stage('current-app-unlocked-after-refresh')
        reopened = stage('whole-browser-restarted-writing-retained')
        assert before['controlled'] is True
        assert before['documentId'] != after['documentId']
        assert before['mainScript'] != after['mainScript']
        assert after['mainScript'] == unlocked['mainScript'] == reopened['mainScript']
        assert before['databases'] == after['databases']
        assert before['local'] == after['local']
        assert unlocked['editableApp'] and reopened['editableApp'] and reopened['controlled']
        slots = next(d for d in after['databases'] if d['name'] == 'done.slots')['stores']['slots']
        assert slots['count'] == 1
        rows.append({
            'accountKind': kind, 'browser': browser,
            'newDocumentAcrossHardRefresh': True,
            'allDatabaseNamesVersionsStoresCountsKeysAndSerializedValueDigestsUnchanged': True,
            'localStorageKeysAndValueDigestsUnchanged': True,
            'slotCountBeforeAndAfter': 1,
            'beforeFirstModuleScript': before['mainScript'],
            'afterFirstModuleScript': after['mainScript'],
            'currentAppEditableAfterUnlock': unlocked['editableApp'],
            'editableAfterWholeProcessRestartAndOfflineUnlock': reopened['editableApp'],
            'currentWorkerControlsReopenedDocument': reopened['controlled'],
            'databaseDeleteOrStoreClearOrStorageClearEventsAfterServerStop': len(destructive),
        })

print(json.dumps({
    'status': 'passed', 'profiles': rows,
    'serializationLimit': 'CryptoKey values are represented by descriptors, not exported key material; original-factor unlock separately tests their usability.',
    'offlineLimit': 'The restarted browser loaded the document online, then networking was disabled before factor unlock. Entirely offline navigation was not tested.',
    'instrumentationLimit': 'Document instrumentation records API calls and transaction results, not an external browser storage trace.',
}, indent=2))
