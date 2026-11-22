#!/usr/bin/env python3
"""Package an explicitly accepted runtime and the exact release commit."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package(descriptor, output, verify_only=False):
    descriptor = json.loads(Path(descriptor).read_text())
    version = descriptor['version']
    if descriptor['tag'] != 'v' + version or not descriptor['runtime_accepted']:
        raise ValueError('A matching tag and explicit runtime acceptance are required.')
    accepted = Path(descriptor['runtime_path'])
    if digest(accepted.read_bytes()) != descriptor['runtime_sha256']:
        raise ValueError('Accepted runtime archive checksum does not match.')
    with zipfile.ZipFile(accepted) as archive:
        if archive.testzip() or 'index.html' not in archive.namelist() or 'LICENSE' not in archive.namelist():
            raise ValueError('Invalid accepted APP archive.')
        expected = {entry.filename: digest(archive.read(entry)) for entry in archive.infolist() if not entry.is_dir()}
    built = {path.relative_to('dist').as_posix(): digest(path.read_bytes()) for path in Path('dist').rglob('*') if path.is_file()}
    built['LICENSE'] = digest(Path('LICENSE').read_bytes())
    if built != expected:
        raise ValueError('Rebuilt application files differ from the accepted runtime. Do not release.')
    package_version = json.loads(Path('package.json').read_text())['version']
    locked_version = json.loads(Path('package-lock.json').read_text())['packages']['']['version']
    if package_version != version or locked_version != version:
        raise ValueError('Release, package and lockfile versions must match.')
    if verify_only:
        print(json.dumps({'accepted_runtime_verified': True, 'rebuilt_files_verified': len(expected), 'version': version}))
        return
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD'], check=True, stdout=subprocess.DEVNULL)
    if subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).strip():
        raise ValueError('Untracked files must not enter a release checkout.')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    paths = sorted(filter(None, subprocess.check_output(['git', 'ls-files', '-z'], text=True).split('\0')))
    manifest = [{'path': path, 'sha256': digest(Path(path).read_bytes()), 'bytes': Path(path).stat().st_size} for path in paths]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    runtime = output / ('NodeFM_' + version + '.zip')
    runtime.write_bytes(accepted.read_bytes())
    source = output / ('NodeFM_' + version + '_release-source.zip')
    snapshot = {
        'version': version, 'commit': commit, 'uncommitted': False,
        'runtimeAccepted': descriptor['accepted_on'], 'runtimeFile': runtime.name,
        'runtimeSha256': descriptor['runtime_sha256'], 'files': manifest,
    }
    with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for entry in manifest:
            archive.write(entry['path'], 'NodeFM-Qortal/' + entry['path'])
        archive.writestr('NodeFM-Qortal/SOURCE-SNAPSHOT.json', json.dumps(snapshot, indent=2) + '\n')
    checksums = output / 'SHA256SUMS'
    checksums.write_text(''.join(digest(path.read_bytes()) + '  ' + path.name + '\n' for path in [runtime, source]))
    (output / 'release.json').write_text(json.dumps(descriptor, indent=2) + '\n')
    print(json.dumps({'commit': commit, 'runtime': str(runtime), 'source': str(source), 'checksums': str(checksums)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('descriptor')
    parser.add_argument('output')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    package(args.descriptor, args.output, args.verify_only)
