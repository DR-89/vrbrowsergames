"""Compare the bounds traversal against original triangle scans in WebAssembly."""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parents[1];sdk=root/'.tools/emsdk';out=root/'build/qa/ray-index'
out.mkdir(parents=True,exist_ok=True);(out/'package.json').write_text('{"type":"commonjs"}\n')
env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk);env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
emcc=sdk/'upstream/emscripten'/('emcc.exe' if os.name=='nt' else 'emcc')
subprocess.run([str(emcc),'-std=c11','-O2','-UNDEBUG','-sENVIRONMENT=node','-sASSERTIONS=1',
    '-I'+str(root/'native'),'-I'+str(root/'build/native-tc2/quest'),str(root/'tests/ray_index.c'),'-o',str(out/'test.js')],env=env,check=True)
subprocess.run(['node',str(out/'test.js')],env=env,check=True,timeout=60)
