from pathlib import Path
import argparse, ast, json, os, signal, subprocess, threading, time, re
from capture_storage import write_power_window

parser = argparse.ArgumentParser()
parser.add_argument('name')
parser.add_argument('--caffeinate', action='store_true')
parser.add_argument('--timeout', type=int, default=180)
parser.add_argument('--cwd', default='/Users/thomasingalls/.codex/worktrees/7fda/done')
parser.add_argument('argv', nargs=argparse.REMAINDER)
args = parser.parse_args()
argv = args.argv[1:] if args.argv[:1] == ['--'] else args.argv
root = Path('/private/tmp/done-release-hardening-20261102')
out = root / args.name
out.mkdir(exist_ok=False)
def display():
    result = subprocess.run([str(root / 'display-state380')], text=True, capture_output=True, timeout=2)
    value = json.loads(result.stdout)
    main = next((d for d in value['displays'] if d['id'] == value['main']), None)
    value['mainState'] = 'unknown' if value['error'] or main is None else 'off' if main['asleep'] else 'on'
    return value

def hostlog(path, stop):
    with path.open('w') as f:
        next_sample = time.monotonic()
        while not stop.is_set():
            row = {'utcEpoch': time.time()}
            try:
                top = subprocess.run(['/usr/bin/top', '-l', '1', '-n', '0'], text=True, capture_output=True, timeout=3)
                row['hostCpu'] = next((s for s in top.stdout.splitlines() if s.startswith('CPU usage:')), None)
                ps = subprocess.check_output(['/bin/ps', '-A', '-o', 'pid=,pcpu=,rss=,comm='], text=True)
                rows = []
                for line in ps.splitlines():
                    parts = line.strip().split(None, 3)
                    if len(parts) == 4:
                        rows.append({'pid': int(parts[0]), 'cpuPercent': float(parts[1]), 'rssBytes': int(parts[2]) * 1024, 'process': Path(parts[3]).name})
                row['topProcesses'] = sorted(rows, key=lambda x: x['cpuPercent'], reverse=True)[:10]
                row['fseventsd'] = [x for x in rows if x['process'] == 'fseventsd']
                row['fseventsdCpuPercent'] = sum(x['cpuPercent'] for x in row['fseventsd'])
            except Exception as exc:
                row['observationErrorClass'] = type(exc).__name__
            try:
                raw_swap = subprocess.check_output(['/usr/sbin/sysctl', '-n', 'vm.swapusage'], text=True, timeout=2).strip()
                swap = {'raw': raw_swap}
                for key in ['total', 'used', 'free']:
                    match = re.search(r'\b' + key + r'\s*=\s*([0-9.]+)M\b', raw_swap)
                    if not match:
                        raise ValueError('Unexpected swap observation unit')
                    swap[key + 'MiB'] = float(match.group(1))
                row['swap'] = swap
            except Exception as exc:
                row['swap'] = {'observationErrorClass': type(exc).__name__}
            try:
                row['display'] = display()
            except Exception as exc:
                row['display'] = {'mainState': 'unknown', 'observationErrorClass': type(exc).__name__}
            f.write(json.dumps(row) + '\n'); f.flush()
            next_sample += 5
            stop.wait(max(0, next_sample - time.monotonic()))

initial_display = display()
assert initial_display['mainState'] == 'on', 'Display-on precondition not met'
(out / 'display-before.json').write_text(json.dumps(initial_display, indent=2) + '\n')
power_before = subprocess.run(['pmset', '-g', 'log'], capture_output=True, timeout=30)
for name, cmd in [('power-assertions-before.txt', ['pmset', '-g', 'assertions'])]:
    v = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    (out / name).write_text(v.stdout)
env = dict(os.environ)
env['PATH'] = str(root / 'tools') + ':/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin:' + env.get('PATH', '')
env['npm_config_manage_package_manager_versions'] = 'false'
env['LOCAL_STARTUP_REPORT'] = str(out / 'native.json')
env['ACCOUNT_REPORT_DIR'] = str(out)
env.pop('CHROMIUM_PATH', None)
stop = threading.Event()
thread = threading.Thread(target=hostlog, args=(out / 'host-load.jsonl', stop), daemon=True)
thread.start()
command = ['/usr/bin/caffeinate', '-d', *argv] if args.caffeinate else argv
meta = {'argv': argv, 'executedArgv': command, 'displayProtection': 'caffeinate -d' if args.caffeinate else 'operator display-on; no assertion created by this runner', 'displayObserver': 'CoreGraphics CGDisplayIsAsleep every5s, plus before/after power logs', 'cwd': args.cwd, 'deadlineSeconds': args.timeout, 'started': time.time(), 'pinnedNodeAndBrowserEnvironment': True, 'hostObserver': '384:5s CPU/top processes/display plus explicit fseventsd CPU/RSS and swapMiB'}
power_window_started = meta['started']
try:
    with (out / 'child.log').open('wb') as log:
        power_window_started = time.time()
        child = subprocess.Popen(command, cwd=args.cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        meta['childPid'] = child.pid
        try:
            meta['childExit'] = child.wait(timeout=args.timeout)
            meta['timedOut'] = False
        except subprocess.TimeoutExpired:
            meta['timedOut'] = True
            os.killpg(child.pid, signal.SIGTERM)
            try:
                meta['childExit'] = child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                meta['childExit'] = child.wait()
finally:
    power_window_finished = time.time()
    stop.set()
    thread.join(timeout=5)
    meta['finished'] = time.time()
    (out / 'display-after.json').write_text(json.dumps(display(), indent=2) + '\n')
    power = subprocess.run(['pmset', '-g', 'log'], capture_output=True, timeout=30)
    for name, observed in [('power-log-before.txt', power_before), ('power-log-after.txt', power)]:
        write_power_window(out / name, observed.stdout, power_window_started, power_window_finished, observed.returncode)
    (out / 'run.json').write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps(meta), flush=True)
raise SystemExit(0 if meta['childExit'] == 0 and not meta['timedOut'] else 1)
