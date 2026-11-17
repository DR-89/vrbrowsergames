"""Prepare pinned TC1 v0.9.5 and its native hooks in an isolated browser worktree."""
from pathlib import Path
import hashlib, importlib.util, json, subprocess, sys
from paths import native_checkout

ROOT=Path(__file__).resolve().parents[1]
NATIVE=native_checkout('tc1')
REPO=ROOT/'build/native-tc1'
REVISION='a92faadc4e8c2042b1f6baccc77d4785863ceb7c'
UPSTREAM='6aaa90b4cbc7a23733e1c9f5f9a5e772a19fe23d'

def run(args,cwd):
    subprocess.run(list(map(str,args)),cwd=cwd,check=True)

def prepare():
    if not REPO.exists():
        run(['git','fetch','origin'],NATIVE)
        run(['git','worktree','add','--detach',REPO,REVISION],NATIVE)
    actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
    if actual!=REVISION:raise RuntimeError('Unexpected TC1 revision: '+actual)
    up=REPO/'upstream'
    if not (up/'engine/engine.cmake').exists():
        run(['git','submodule','update','--init','--reference',NATIVE/'upstream','upstream'],REPO)
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=up,text=True).strip()!=UPSTREAM:
        raise RuntimeError('Unexpected TC1 upstream revision')
    roms=NATIVE/'build/assets/roms'
    # Preserve the exact game bytes already distributed by this browser port.
    manifest=ROOT/'dist/games/tc1/manifest.json'
    if manifest.exists():
        for entry in json.loads(manifest.read_text())['roms']:
            data=(roms/entry['name']).read_bytes()
            if len(data)!=entry['size'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:
                raise RuntimeError('TC1 ROM differs from browser manifest: '+entry['name'])
    sys.path.insert(0,str(REPO/'tools'))
    spec=importlib.util.spec_from_file_location('tc1_native_build',REPO/'tools/build.py')
    native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
    native.prepare(roms)
    native.prepare_sound()
    print('Prepared TC1',actual,'upstream',UPSTREAM,flush=True)

if __name__=='__main__':prepare()
