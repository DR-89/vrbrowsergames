"""Build the original three arcade cores for WebXR, without editing native repos."""
from pathlib import Path
import argparse, gzip, hashlib, json, os, shutil, subprocess, sys
from web_renderer import optimize_renderer
from web_menu import prepare_menu
from web_tc1_renderer import prepare_renderer
from web_c352 import optimize_c352
from paths import native_checkout
ROOT=Path(__file__).resolve().parents[1]
REPOS={game:native_checkout(game) for game in ('tc1','tc2','cz')}
REPOS['tc1']=ROOT/'build/native-tc1'
REPOS['tc2']=ROOT/'build/native-tc2'
def run(cmd,**kwargs):
    print('>', ' '.join(map(str,cmd)),flush=True)
    subprocess.run(list(map(str,cmd)),check=True,**kwargs)
def replace_once(text,old,new):
    assert text.count(old)==1,(old,text.count(old))
    return text.replace(old,new)

def write_changed(path,text):
    if not path.exists() or path.read_text()!=text:path.write_text(text)
def patch_tc1(repo,build):
    prepare_renderer(repo,build,write_changed)
    engine=repo/'upstream/engine'
    source=(engine/'ss22_run.c').read_text()
    assert 'ss22_video_prepare();' in source
    write_changed(build/'ss22_run.c',source.replace('ss22_video_prepare();','/* WEBXR: main thread prepares the parked core snapshot. */'))
    source=(engine/'ss22_video.c').read_text()
    source=replace_once(source,'    r.pal = g_ss22.pal;', '''    static uint8_t web_palette[sizeof g_ss22.pal];
    static uint16_t web_spot[sizeof g_ss22.spotram / sizeof(uint16_t)];
    memcpy(web_palette,g_ss22.pal,sizeof web_palette);
    memcpy(web_spot,g_ss22.spotram,sizeof web_spot);
    r.pal = web_palette;''')
    source=replace_once(source,'r.spotram = g_ss22.spotram;','r.spotram = web_spot;')
    write_changed(build/'ss22_video.c',source)
def patch_tc2(repo,build):
    if repo==REPOS['cz']:
        write_changed(build/'c352_web.c',optimize_c352((repo/'upstream/tc2/src/eng/c352.c').read_text()))
    source=(repo/'quest/tc2_gl.c').read_text()
    # WebGL validates every active sampler even when a uniform branch skips it.
    # Pass 0 writes the priority texture, and must not also sample that texture.
    source=replace_once(source,'bind_tex(2, t_prio);','bind_tex(2, pass == 2 ? t_prio : t_lut);')
    # The WebXR host owns the eye target and always enters at this viewport.
    # Avoid a synchronous WebGL state query for every eye.
    source=replace_once(source,'GLint vp[4]; glGetIntegerv(GL_VIEWPORT, vp);',
                        'GLint vp[4] = {0, 0, requested_w, requested_h};')
    # Both eyes and repeated headset frames share the same arcade gamma table.
    source=replace_once(source,'bind_tex(0, t_lut); glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 1, GL_RGB, GL_UNSIGNED_BYTE, lut);', '''static uint8_t uploaded_lut[256 * 3];
        static int lut_valid;
        bind_tex(0, t_lut);
        if (!lut_valid || memcmp(uploaded_lut, lut, sizeof lut)) {
            glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 256, 1, GL_RGB, GL_UNSIGNED_BYTE, lut);
            memcpy(uploaded_lut, lut, sizeof lut); lut_valid = 1;
        }''')
    source=optimize_renderer(source)
    if repo==REPOS['tc2']:
        source='#include "web_impacts.h"\n'+source
        source=replace_once(source,'    /* 5. the text the polygons let through again */', '''    /* Surface feedback shares the existing nearest-surface targets. It is
     * composed before foreground text and the original gamma/fade pipeline. */
    glBindFramebuffer(GL_FRAMEBUFFER,fbo_col);
    web_impacts_draw(vr_view,vr_projection,web_impacts_now,t_near,t_nearz,tc2_depth_on()&&fbo_near&&vertex_count>0,(f->fflags&1)?(255-f->ffactor)/255.f:1.f);
    glBindVertexArray(vao);glEnable(GL_BLEND);
    /* 5. the text the polygons let through again */''')
    write_changed(build/'tc2_gl_web.c',source)
    source=(repo/'quest/tc2_scene.c').read_text()
    source=replace_once(source,'static V3 base_vertex(', 'static V3 uncached_base_vertex(')
    source=replace_once(source,'V3 qvr_tc2_vertex(const tc2_built *b,const tc2_poly *p,int index){', '''/* Reuse camera-space unprojection between ray preparation and the GPU's
 * triangle fan. Scale/eye transforms are deliberately applied after this cache. */
static V3 web_base_vertices[TC2_MAX_POLYS][8];
static unsigned char web_base_valid[TC2_MAX_POLYS];
static V3 base_vertex(const tc2_built *b,const tc2_poly *p,int index){
    size_t offset=(size_t)((uintptr_t)p-(uintptr_t)b->polys),poly=offset/sizeof *p;
    if(b!=frame || poly>=(size_t)b->npoly || poly>=TC2_MAX_POLYS || offset%sizeof *p || index<0 || index>=8)
        return uncached_base_vertex(b,p,index);
    unsigned bit=1u<<index;
    if(!(web_base_valid[poly]&bit)){
        web_base_vertices[poly][index]=uncached_base_vertex(b,p,index);web_base_valid[poly]|=bit;
    }
    return web_base_vertices[poly][index];
}
V3 qvr_tc2_vertex(const tc2_built *b,const tc2_poly *p,int index){''')
    source=replace_once(source,'    frame=b;triangle_count=0;',
                        '    memset(web_base_valid,0,sizeof web_base_valid);\n    frame=b;triangle_count=0;')
    if repo==REPOS['cz']:
        source=replace_once(source,'static Triangle triangles[TC2_MAX_POLYS*6];','#include "web_ray_index.h"\nstatic Triangle triangles[TC2_MAX_POLYS*6];')
        source=replace_once(source,'frame=b;triangle_count=0;zone_select=false;',
                            'frame=b;triangle_count=0;web_ray_leaves=0;zone_select=false;')
        source=replace_once(source,'    /* A screen-space effect is not a solid target.', '''    /* Amortize the linear bounds build across effect rays in busy scenes.
     * Sparse scenes keep the original scan; controller rays reuse the tree. */
    int effect_rays=0;
    if(!zone_select)for(int i=0;i<b->fs.list.count;i++)
        effect_rays+=csz_screen_effect(&b->fs.list.e[i]) && b->fs.list.e[i].v[2]>0;
    if(effect_rays>=4 && triangle_count>=64)web_ray_build(triangles,triangle_count);
    /* A screen-space effect is not a solid target.''')
        source=replace_once(source,'''        for(int j=0;j<triangle_count;j++)
            ray_triangle(v3(0,0,0),d,triangles[j].a,triangles[j].b,triangles[j].c,&nearest);''',
            '        web_ray_hit(triangles,triangle_count,v3(0,0,0),d,&nearest);')
        source=replace_once(source,'''    if(!qvr_flat_view)for(int i=0;i<triangle_count;i++){
        Triangle *t=&triangles[i];float distance=nearest;
        if(ray_triangle(world_origin,d,t->a,t->b,t->c,&distance)&&distance<nearest){nearest=distance;c=t->cam;found=true;}
    }''','''    if(!qvr_flat_view){
        int i=web_ray_hit(triangles,triangle_count,world_origin,d,&nearest);
        if(i>=0){c=triangles[i].cam;found=true;}
    }''')
    write_changed(build/'tc2_scene_web.c',source)

def patch_ui(repo,build):
    game=next(key for key,value in REPOS.items() if value==repo)
    prepare_menu(REPOS['tc2'],build,game)


def patch_online(repo,build):
    # Keep upstream room/session/C422 logic. Only platform I/O and unavailable LAN UI change.
    source=(repo/'quest/tc2_online.c').read_text()
    source=replace_once(source,'#define DEFAULT_SERVER  "zonesync.net"','#define DEFAULT_SERVER  "127.0.0.1"')
    source=replace_once(source,'    load_cfg();','    load_cfg();\n    snprintf(server,sizeof server,"%s",DEFAULT_SERVER); /* the website owns the endpoint */')
    source=replace_once(source,'static void episode_tick(void){\n    uint32_t now=SDL_GetTicks();', '''static void episode_tick(void){
    uint32_t now=SDL_GetTicks();
    /* The other cabinet reopens a running room after its 1.2 s departure grace.
     * An immediate REJOIN may receive "in progress" meanwhile. Retain the room
     * and requested cabinet and retry within the existing 8 s join deadline. */
    static uint32_t web_rejoin_retry;
    if(mode==MODE_ROOM&&!episode&&rejoin_pref&&join_started_ms&&!eng_net_connected()&&now-join_started_ms<8000&&now-web_rejoin_retry>=750){
        web_rejoin_retry=now;connect_to(target);
    }''')
    source=replace_once(source,'const char *tc2_online_set_server(const char *address){','const char *tc2_online_set_server(const char *address){\n    return "The browser uses this website server. Open another website to change servers.";')
    write_changed(build/'tc2_online_web.c',source)
    source=(repo/'quest/tc2_voice.c').read_text()
    start=source.index('static void SDLCALL cap_callback(')
    end=source.index('\n#endif',start)
    source=source[:start]+'''/* Browser permission and capture belong to getUserMedia on the UI thread. */
static void mic_open(void){capturing=true;}
static void mic_close(void){capturing=false;}
void tc2_voice_browser_mic(int available){mic_denied=!available;}
'''+source[end:]
    write_changed(build/'tc2_voice_web.c',source)
    source=(repo/'quest/quest_menu.c').read_text()
    source='\n'.join(line for line in source.split('\n') if 'if(!V.can_rejoin)on_item(ON_LAN' not in line and '{QOPT_RESOLUTION,"Resolution"' not in line)
    start=source.index('    {const int id=ID(K_ON,ON_SERVER);')
    end=source.index('    {static const char *const onoff[]',start)
    source=source[:start]+'''    text_fit(UI_M17,COL2+100,mid(UI_M17,cy+38,38),COLW-126,"THIS WEBSITE",TEXT,2);
    next_row();
'''+source[end:]
    source=source.replace('Open rooms and local-network games','Rooms on this website').replace('Lists open rooms on the server and games on your network.','Lists rooms on this website server.')
    source=source.replace('Allow the microphone: Quest Settings > Apps > Permissions','Enable microphone on the browser page first.')
    write_changed(build/'quest_menu_web.c',source)
    source=(repo/'quest/tc2_sources.cmake').read_text()
    # net_rooms.c is generated by this CMake file; disable broadcast discovery at its source.
    marker='set(TC2_NET_INCLUDE '
    at=source.index(marker)
    source=source[:at]+'''file(READ "${CMAKE_BINARY_DIR}/net_rooms.c" WEB_NET)
string(REPLACE "void eng_net_discover(void)\\n{" "void eng_net_discover(void)\\n{ return; /* WebXR: rooms are on the website server. */" WEB_NET "${WEB_NET}")
file(WRITE "${CMAKE_BINARY_DIR}/net_rooms.c" "${WEB_NET}")
'''+source[at:]
    write_changed(build/'tc2_sources_web.cmake',source)
def stage(game,repo,out):
    wasm=out/'arcade.wasm'
    cached=ROOT/'build'/game/'arcade.wasm'
    if not wasm.exists():wasm=cached
    if wasm.exists():
        with (out/'arcade.wasm.gz').open('wb') as stream:
            with gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as g:g.write(wasm.read_bytes())
        if wasm!=cached:shutil.move(str(wasm),str(cached))
    target=out/'roms';target.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for f in sorted((repo/'build/assets/roms').iterdir()):
        if not f.is_file():continue
        data=f.read_bytes(); dest=target/(f.name+'.gz')
        with dest.open('wb') as stream:
            with gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as g:g.write(data)
        manifest.append({'name':f.name,'url':'roms/'+dest.name,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    models=[]
    for f in (repo/'quest/assets/models').glob('*.tcgun'):
        target=out/'models';target.mkdir(exist_ok=True)
        data=f.read_bytes();dest=target/(f.name+'.gz')
        with dest.open('wb') as stream:
            with gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as g:g.write(data)
        models.append({'name':f.name,'url':'models/'+dest.name,'size':len(data),'gzip':True,'sha256':hashlib.sha256(data).hexdigest()})
        redundant=target/f.name
        if redundant.exists():redundant.unlink()
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip())
    upstream=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo/'upstream',text=True).strip()
    (out/'manifest.json').write_text(json.dumps({'id':game,'revision':revision,'nativeWorktreeDirty':dirty,'upstreamRevision':upstream,'roms':manifest,'models':models},indent=2)+'\n')
    notice=(repo/'NOTICE.md').read_text()
    if game!='tc2':
        notice+='\n## Browser pause menu\n\nThe tabbed menu, canvas and baked Chakra Petch font are adapted from the pinned\nDR-89/time-crisis-2-vr source (4b6842d), under its MIT license.\nChakra Petch is distributed under the SIL Open Font License; see\n[ChakraPetch-OFL.txt](licenses/ChakraPetch-OFL.txt).\n'
    (out/'NOTICE.md').write_text(notice);shutil.copy2(repo/'LICENSE',out/'LICENSE')
    licenses=out/'licenses';licenses.mkdir(exist_ok=True)
    em=ROOT/'.tools/emsdk/upstream/emscripten'
    for source,name in [(repo/'upstream/LICENSE','namco22-LICENSE.txt'),(em/'LICENSE','emscripten-LICENSE.txt'),(em/'system/lib/libc/musl/COPYRIGHT','musl-COPYRIGHT.txt'),(em/'system/lib/compiler-rt/LICENSE.TXT','compiler-rt-LICENSE.txt'),(em/'cache/ports/sdl2/SDL-release-2.32.10/LICENSE.txt','SDL-LICENSE.txt'),(em/'cache/ports/zlib/zlib-1.3.2/LICENSE','zlib-LICENSE.txt')]:
        shutil.copy2(source,licenses/name)
    (licenses/'README.txt').write_text('Browser dependencies: Emscripten 7.0.0, SDL 2.32.10, zlib 1.3.2, musl, compiler-rt.\nNative NOTICE.md is retained as provenance; native-only OpenXR/Windows components are not linked into this browser build.\n')
    shutil.copy2(REPOS['tc2']/'tools/fonts/OFL.txt',licenses/'ChakraPetch-OFL.txt')
    if game=='tc2':
        for source,name in [(repo/'.tools/opus/opus-1.5.2/COPYING','Opus-COPYING.txt'),(repo/'.tools/rnnoise/rnnoise-0.2/COPYING','RNNoise-COPYING.txt'),(repo/'.tools/speexdsp/speexdsp-SpeexDSP-1.2.1/COPYING','SpeexDSP-COPYING.txt'),(repo/'tools/fonts/OFL.txt','ChakraPetch-OFL.txt')]:
            shutil.copy2(source,licenses/name)
def main():
    p=argparse.ArgumentParser();p.add_argument('game',choices=[*REPOS,'all']);p.add_argument('--jobs',type=int,default=3);p.add_argument('--stage-only',action='store_true');a=p.parse_args()
    sdk=ROOT/'.tools/emsdk';em=sdk/'upstream/emscripten'
    env=os.environ.copy();env['EM_CONFIG']=str(sdk/'.emscripten');env['EMSDK']=str(sdk)
    env['PATH']=str(sdk/'upstream/bin')+os.pathsep+env['PATH']
    for game in REPOS if a.game=='all' else [a.game]:
        repo=REPOS[game];build=ROOT/'build'/game;out=ROOT/'dist/games'/game
        if game=='tc1':
            if not (repo/'build/tc_crate.c').exists():raise RuntimeError('Run python tools/prepare-tc1.py first')
            revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
            if revision!='a92faadc4e8c2042b1f6baccc77d4785863ceb7c':raise RuntimeError('Unexpected TC1 revision: '+revision)
        build.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
        patch_ui(repo,build)
        if game=='tc2':patch_online(repo,build)
        if game=='tc1':patch_tc1(repo,build)
        else:patch_tc2(repo,build)
        if not a.stage_only:
            ninja=os.environ.get('ARCADE_NINJA') or shutil.which('ninja')
            if not ninja:
                ninja=native_checkout('tc2')/'.tools/ninja/ninja.exe'
                if not ninja.is_file():raise RuntimeError('Install Ninja on PATH or set ARCADE_NINJA to its executable')
            run(['cmake','-S',ROOT/'native','-B',build,'-G','Ninja',f'-DCMAKE_MAKE_PROGRAM={ninja}',f'-DCMAKE_TOOLCHAIN_FILE={em}/cmake/Modules/Platform/Emscripten.cmake',f'-DNATIVE_REPO={repo}',f'-DGAME={game}',f'-DOUTPUT_DIR={out}','-DCMAKE_BUILD_TYPE=Release'],env=env)
            run(['cmake','--build',build,'--parallel',a.jobs],env=env)
        stage(game,repo,out)
if __name__=='__main__':main()
