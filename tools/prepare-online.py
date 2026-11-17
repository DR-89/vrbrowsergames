"""Prepare the pinned TC2 online source and its generated H8 code; no native checkout edits."""
from pathlib import Path
import importlib.util, os, shutil, subprocess, sys
from paths import native_checkout

ROOT = Path(__file__).resolve().parents[1]
NATIVE = native_checkout('tc2')
REPO = ROOT / 'build/native-tc2'
REVISION = '4b6842d9c74ed9498121696a8b5d3c42483bf8d8'
UPSTREAM = '8f2ed7f4ed5c3fb5fecbbd29bbf6a6bf13876b2c'

def run(args, cwd):
    subprocess.run(list(map(str, args)), cwd=cwd, check=True)

def prepare():
    if not REPO.exists():
        run(['git','fetch','origin'], NATIVE)
        run(['git','worktree','add','--detach',REPO,REVISION], NATIVE)
    actual = subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
    if actual != REVISION: raise RuntimeError('Unexpected TC2 source revision: '+actual)
    up = REPO/'upstream'
    if not (up/'tc2/src/eng/net.c').exists():
        run(['git','submodule','update','--init','--depth','1','upstream'],REPO)
    if subprocess.check_output(['git','rev-parse','HEAD'],cwd=up,text=True).strip()!=UPSTREAM:
        raise RuntimeError('Unexpected upstream source revision')
    spec=importlib.util.spec_from_file_location('tc2_bootstrap',REPO/'tools/bootstrap.py')
    bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
    for dependency in bootstrap.VOICE: bootstrap.fetch(dependency)
    tc=up/'tc2'
    for target in (tc/'extracted',REPO/'build/assets/roms'):
        target.mkdir(parents=True,exist_ok=True)
        for source in (NATIVE/'build/assets/roms').iterdir():
            if source.is_file(): shutil.copy2(source,target/source.name)
    run([sys.executable,'tools/make_prog.py','extracted'],tc)
    for kind,prefix,mode in [('sub','tc2sub','1'),('io','tc2io','0')]:
        output=tc/f'gen/tc2_{kind}.c'
        if output.exists():continue
        env=os.environ.copy();env['PYTHONUTF8']='1'
        if kind=='io':env['H8_ROMSIZE']='0x4000'
        cov=[str(p.relative_to(tc).with_suffix('')) for p in sorted((tc/'cov').glob('h8'+kind+'_*.pcs'))]
        subprocess.run([sys.executable,'tools/h8/h8_translate.py',kind+'.bin',mode,prefix,str(output),*cov],cwd=tc,env=env,check=True)
    print('Prepared TC2',actual,'upstream',UPSTREAM)

if __name__=='__main__':prepare()
