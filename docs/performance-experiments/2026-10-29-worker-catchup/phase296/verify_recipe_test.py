import hashlib,tempfile,unittest,sys
sys.dont_write_bytecode=True
from pathlib import Path
from verify_fixture import verify_files
sha=lambda b:hashlib.sha256(b).hexdigest()
class FileEvidence(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='done-recipe-check-',dir='/private/tmp');self.root=Path(self.temp.name);(self.root/'empty.log').write_bytes(b'');(self.root/'source.ts').write_bytes(b'export const original=1;\n');self.files={p.name:sha(p.read_bytes())for p in self.root.iterdir()}
    def tearDown(self):self.temp.cleanup()
    def test_empty_source_is_exact_evidence(self):verify_files(self.root,self.files)
    def test_changed_bytes_refuse(self):
        (self.root/'source.ts').write_bytes(b'changed')
        with self.assertRaisesRegex(AssertionError,'bytes changed'):verify_files(self.root,self.files)
    def test_deleted_empty_source_refuses(self):
        (self.root/'empty.log').unlink()
        with self.assertRaisesRegex(AssertionError,'file set changed'):verify_files(self.root,self.files)
    def test_added_source_refuses(self):
        (self.root/'extra.ts').write_bytes(b'extra')
        with self.assertRaisesRegex(AssertionError,'file set changed'):verify_files(self.root,self.files)
if __name__=='__main__':unittest.main()
