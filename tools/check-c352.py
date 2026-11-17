from pathlib import Path
import os,subprocess
from build import REPOS
from web_c352 import optimize_c352
root=Path(__file__).resolve().parents[1];sdk=root/'.tools/emsdk';out=root/'build/qa/c352'
out.mkdir(parents=True,exist_ok=True);(out/'package.json').write_text('{"type":"commonjs"}\n')
source=(REPOS['cz']/'upstream/tc2/src/eng/c352.c').read_text()
names={**{'c352_'+n:'original_'+n for n in ('init','reset','read','write','generate')},**{'g_c352_'+n:'original_'+n for n in ('gain_music','gain_fx','gain_voice','music_mask','speech_mask','speech_bank_lo','speech_bank_hi')}}
(out/'original.c').write_text(''.join('#define '+a+' '+b+'\n' for a,b in names.items())+source)
(out/'optimized.c').write_text(optimize_c352(source))
env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk);env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
emcc=sdk/'upstream/emscripten'/('emcc.exe' if os.name=='nt' else 'emcc')
subprocess.run([str(emcc),'-std=c11','-O2','-UNDEBUG','-fwrapv','-sENVIRONMENT=node','-sASSERTIONS=1','-I'+str(root/'native'),'-I'+str(REPOS['cz']/'upstream/tc2/src/eng'),str(out/'original.c'),str(out/'optimized.c'),str(root/'tests/c352_exact.c'),'-o',str(out/'test.js')],env=env,check=True)
subprocess.run(['node',str(out/'test.js')],env=env,check=True,timeout=60)
