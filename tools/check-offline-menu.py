"""Check the actual shared native menu widgets in WebAssembly for both games."""
from pathlib import Path
import os,subprocess
from build import REPOS,patch_ui
root=Path(__file__).resolve().parents[1];sdk=root/'.tools/emsdk';out=root/'build/qa/offline-menu'
out.mkdir(parents=True,exist_ok=True);(out/'package.json').write_text('{"type":"commonjs"}\n')
env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk);env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
emcc=sdk/'upstream/emscripten'/('emcc.exe' if os.name=='nt' else 'emcc')
for game in ('tc1','cz'):
    build=root/'build'/game;patch_ui(REPOS[game],build)
    subprocess.run([str(emcc),'-std=c11','-O2','-UNDEBUG','-sENVIRONMENT=node','-sASSERTIONS=1','-DWEB_'+game.upper(),
        '-I'+str(build),'-I'+str(REPOS[game]/'quest'),str(root/'tests/offline_menu.c'),str(build/'quest_canvas.c'),
        '-o',str(out/(game+'.js'))],env=env,check=True)
    subprocess.run(['node',str(out/(game+'.js'))],env=env,check=True,timeout=60)
