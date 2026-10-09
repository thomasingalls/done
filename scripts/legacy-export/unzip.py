"""Independent standard-library ZIP/CRC readback. No file extraction or production serializer."""
import json
import sys
import zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise ValueError('duplicate archive path')
    entries = [{'path': name, 'content': archive.read(name).decode('utf-8')} for name in names]
print(json.dumps(entries, ensure_ascii=False))
