"""Run TC1's release regression suite compiled to the browser's WASM target."""
from pathlib import Path
import os, subprocess

ROOT=Path(__file__).resolve().parents[1]
repo=ROOT/'build/native-tc1'
sdk=ROOT/'.tools/emsdk'
out=ROOT/'build/qa/tc1-scene'
out.mkdir(parents=True,exist_ok=True)
(out/'package.json').write_text('{"type":"commonjs"}\n')
env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk)
env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
emcc=sdk/'upstream/emscripten'/('emcc.exe' if os.name=='nt' else 'emcc')
subprocess.run([str(emcc),'-std=c11','-O2','-UNDEBUG','-sENVIRONMENT=node','-sASSERTIONS=1',
    '-I'+str(repo/'quest'),'-I'+str(repo/'upstream/engine'),'-I'+str(repo/'upstream/include'),
    str(repo/'tests/test_vr.c'),str(repo/'quest/quest_scene.c'),'-o',str(out/'test.js')],env=env,check=True)
subprocess.run(['node',str(out/'test.js')],env=env,check=True,timeout=30)
