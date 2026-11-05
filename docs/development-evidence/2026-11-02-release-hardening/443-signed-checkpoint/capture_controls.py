"""Portable storage controls; no app, display, performance or Stage 5 journey."""
from datetime import datetime
from hashlib import sha256
from pathlib import Path
import json
import subprocess
import tempfile
import unittest
from capture_storage import power_window, write_power_window, committed_source, tracked


def stamp(s):
    return datetime.strptime(s, '%Y-%m-%d %H:%M:%S %z').timestamp()


class StorageControls(unittest.TestCase):
    def test_window_bounds_continuations_and_full_identity(self):
        raw = (b'PM ASL header\n2026-11-05 11:59:59 +0100 Before\n'
               b'2026-11-05 12:00:00 +0100 Start\n\tstart detail\n'
               b'2026-11-05 12:00:01 +0100 Inside\n'
               b'2026-11-05 12:00:02 +0100 End\n'
               b'2026-11-05 12:00:03 +0100 After\n\toutside detail\nTotal summary\n')
        output, meta = power_window(raw, stamp('2026-11-05 12:00:00 +0100'), stamp('2026-11-05 12:00:02 +0100'))
        self.assertEqual(output, b'2026-11-05 12:00:00 +0100 Start\n\tstart detail\n2026-11-05 12:00:01 +0100 Inside\n2026-11-05 12:00:02 +0100 End\n')
        self.assertEqual(meta['selectedEvents'], 3)
        self.assertEqual(meta['fullLogSha256'], sha256(raw).hexdigest())
        self.assertEqual(meta['fullLogBytes'], len(raw))
        changed = raw.replace(b'Before', b'BEFORE')
        output2, meta2 = power_window(changed, meta['windowStartedEpoch'], meta['windowFinishedEpoch'])
        self.assertEqual(output2, output)
        self.assertNotEqual(meta2['fullLogSha256'], meta['fullLogSha256'])

    def test_offsets_fractional_boundaries_empty_and_invalid(self):
        raw = b'2026-11-05 12:00:00 +0100 Same instant\n2026-11-05 11:00:01 +0000 Later\n'
        t = stamp('2026-11-05 11:00:00 +0000')
        self.assertEqual(power_window(raw, t, t)[0], raw.splitlines(keepends=True)[0])
        self.assertEqual(power_window(raw, t + .1, t + .9)[0], b'')
        self.assertEqual(power_window(b'', t, t)[1]['fullLogBytes'], 0)
        for a,b in [(t+1,t),(float('nan'),t),(t,float('inf'))]:
            with self.assertRaises(ValueError):power_window(raw,a,b)

    def test_write_never_stores_full_log(self):
        raw = b'2020-01-01 00:00:00 +0000 Old\n2026-11-05 11:00:00 +0000 Current\n'
        t = stamp('2026-11-05 11:00:00 +0000')
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'power-log-after.txt'
            write_power_window(p,raw,t,t,9)
            self.assertEqual(p.read_bytes(),raw.splitlines(keepends=True)[1])
            meta = json.loads(p.with_suffix('.meta.json').read_text())
            self.assertEqual(meta['pmsetExit'],9)
            self.assertEqual(meta['fullLogSha256'],sha256(raw).hexdigest())
            self.assertEqual(len(list(Path(tmp).iterdir())),2)

    def test_exact_commit_reference_and_dirty_untracked_outside_refusals(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'repo';repo.mkdir();p=repo/'src'/'input.txt';p.parent.mkdir();p.write_bytes(b'committed\x00input\n')
            subprocess.run(['git','init','--quiet',str(repo)],check=True)
            subprocess.run(['git','add','.'],cwd=repo,check=True)
            subprocess.run(['git','-c','user.name=Control','-c','user.email=control@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fictional storage control'],cwd=repo,check=True)
            expected=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo).decode().strip()
            ref=committed_source(repo,p)
            self.assertEqual(ref,{'commit':expected,'path':'src/input.txt','sha256':sha256(p.read_bytes()).hexdigest(),'bytes':len(p.read_bytes())})
            p.write_bytes(b'dirty')
            with self.assertRaisesRegex(ValueError,'not byte-identical'):committed_source(repo,p)
            q=repo/'new.txt';q.write_text('new')
            self.assertFalse(tracked(repo,q))
            with self.assertRaises(ValueError):committed_source(repo,q)
            outside=Path(tmp)/'outside';outside.write_text('outside')
            self.assertFalse(tracked(repo,outside))
            with self.assertRaises(ValueError):committed_source(repo,outside)


if __name__ == '__main__':unittest.main(verbosity=2)
