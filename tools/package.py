"""Verify game bytes and package the site, WebSocket gateway and pinned lobby source."""
from pathlib import Path
import gzip,hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
site=ROOT/'dist'
for game in ('tc1','tc2','cz'):
    base=site/'games'/game
    manifest=json.loads((base/'manifest.json').read_text())
    wasm=gzip.decompress((base/'arcade.wasm.gz').read_bytes())
    assert wasm[:4]==b'\0asm',game
    assert (base/'arcade.js').stat().st_size>10000
    for f in manifest['roms']+manifest['models']:
        path=(base/f['url']).resolve();assert path.is_relative_to(base.resolve())
        data=path.read_bytes()
        if path.suffix=='.gz':data=gzip.decompress(data)
        assert len(data)==f['size'],path
        assert hashlib.sha256(data).hexdigest()==f['sha256'],path
    print(game,': verified WASM,',len(manifest['roms']),'ROMs,',len(manifest['models']),'models')
files=sorted(p for p in site.rglob('*') if p.is_file())
assert all(p.stat().st_size<25*1024*1024 for p in files),'Uncompressed or oversized static asset'
output=ROOT/'artifacts';output.mkdir(exist_ok=True)
target=output/'time-crisis-webxr-server.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'site/'+p.relative_to(site).as_posix())
    for p in sorted((ROOT/'deploy').rglob('*')):
        if p.is_file():z.write(p,'deploy/'+p.relative_to(ROOT/'deploy').as_posix())
    for name in ('README.md','VALIDATION.md'):z.write(ROOT/name,name)
    for p in sorted((ROOT/'server').rglob('*')):
        if p.is_file() and not any(part in ('node_modules','target') for part in p.relative_to(ROOT/'server').parts):
            z.write(p,'server/'+p.relative_to(ROOT/'server').as_posix())
# Reopen before reading: on Windows, ZipInfo.orig_filename in a live writer can
# retain backslashes even though the archive header uses normalized slashes.
with zipfile.ZipFile(target,'r') as z:
    checksums=''.join(hashlib.sha256(z.read(name)).hexdigest()+'  '+name+'\n' for name in sorted(z.namelist()))
with zipfile.ZipFile(target,'a',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    z.writestr('SHA256SUMS.txt',checksums)
digest=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256').write_text(digest+'  '+target.name+'\n')
print(target,round(target.stat().st_size/1024/1024,1),'MiB',digest)
