"""Exercise impact geometry/lifecycle as WASM without the graphics driver."""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parents[1];repo=root/'build/native-tc2';sdk=root/'.tools/emsdk';out=root/'build/qa/tc2-impacts'
out.mkdir(parents=True,exist_ok=True);(out/'package.json').write_text('{"type":"commonjs"}\n')
env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk);env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
emcc=sdk/'upstream/emscripten'/('emcc.exe' if os.name=='nt' else 'emcc')
subprocess.run([str(emcc),'-std=c11','-O2','-UNDEBUG','-sENVIRONMENT=node','-sINITIAL_MEMORY=67108864','-sASSERTIONS=1',
    '-I'+str(root/'native'),'-I'+str(repo/'quest'),'-I'+str(repo/'upstream/tc2/src'),
    str(root/'tests/tc2_impacts.c'),str(root/'native/web_impacts.c'),str(root/'build/tc2/tc2_scene_web.c'),'-o',str(out/'test.js')],env=env,check=True)
subprocess.run(['node',str(out/'test.js')],env=env,check=True,timeout=30)
