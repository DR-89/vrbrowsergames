/* Browser host. The original call stack stays on a pthread. Only the browser
 * thread owns GL. A release/acquire frame gate protects each prepared scene. */
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/threading.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <unistd.h>
#include "quest_gpu.h"
#include "quest_gl.h"
#include "quest_gun.h"
#include "web_menu_ui.h"
#include "quest_options.h"
#ifdef WEB_CZ
#include "web_audio_mix.h"
#endif
#ifdef WEB_TC2
#include "web_online.h"
#include "web_impacts.h"
#include "tc2_online.h"
#include "tc2_voice.h"
#else
#include "web_menu.h"
#endif
#ifdef WEB_TC1
#include "ss22_host.h"
#include "ss22_input.h"
#include "ss22_gl.h"
#include "ss22_game.h"
#include "ss22_board.h"
#include "quest_scene.h"
#else
#include "tc2_vr.h"
#include "tc2_scene.h"
#include "tc2_host.h"
#ifdef WEB_CZ
#include "tc2_game.h"
#endif
#ifndef WEB_CZ
#include "tc2_cabinet.h"
#include "tc2_weapon.h"
#endif
#endif

enum { READY, FRAME, SHOTS, ERROR, AUDIO_WRITE, AUDIO_READ, AUDIO_RATE, AUDIO_CAP, STATUS_COUNT };
static _Atomic int status[STATUS_COUNT];
static pthread_mutex_t gate=PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t wake=PTHREAD_COND_INITIALIZER;
static bool released,started,has_scene,graphics;
static pthread_t core;
static float nx=.5f,ny=.5f;
static _Atomic bool valid;
static bool tracking,fire;
static int input_bits;
static V3 gun_pos,gun_end,gun_muzzle;
static Q4 gun_rotation={0,0,0,1};
static float matrices[32],gun_pitch=-16,gun_up,gun_back;
static int aim_mode=2;
static unsigned shot_seen;
static double shot_time=-1000;
static V3 tracer_origin,tracer_end;
static V3 input_muzzle,input_end;
static GLuint eye_fbo,eye_color,eye_depth;
static int eye_w,eye_h;
static bool eye_complete;
static int prepared_frame=-1;
static int16_t audio_ring[65536*2];
static float gain=1.f;
static float input_x=.5f,input_y=.5f;
static bool input_valid;
static QOptions menu_options;
static _Atomic bool paused;
static V3 head_pos;
static Q4 head_rotation={0,0,0,1};
static V3 menu_center;
static Q4 menu_rotation={0,0,0,1};
static int menu_event;
static _Atomic int game_volume=100;
#ifdef WEB_TC2
static _Atomic int skip_frames;
#endif
EMSCRIPTEN_KEEPALIVE void web_pause(int value){
#ifdef WEB_TC2
 if(value)atomic_store(&skip_frames,0);
#endif
 if(value&&!paused){menu_center=add(head_pos,rotate(head_rotation,v3(0,0,-1.3f)));menu_rotation=head_rotation;web_menu_open(-1);}
 paused=value!=0;
}
EMSCRIPTEN_KEEPALIVE void web_head(float x,float y,float z,float qx,float qy,float qz,float qw){head_pos=v3(x,y,z);head_rotation=(Q4){qx,qy,qz,qw};}

EMSCRIPTEN_KEEPALIVE int web_context(void){
 EmscriptenWebGLContextAttributes a;emscripten_webgl_init_context_attributes(&a);
 a.majorVersion=2;a.minorVersion=0;a.alpha=false;a.depth=true;a.stencil=false;a.antialias=false;
 a.preserveDrawingBuffer=false;a.enableExtensionsByDefault=true;
 EMSCRIPTEN_WEBGL_CONTEXT_HANDLE context=emscripten_webgl_create_context("#game",&a);
 if(context<=0)return 0;
 return emscripten_webgl_make_context_current(context)==EMSCRIPTEN_RESULT_SUCCESS;
}

EMSCRIPTEN_KEEPALIVE int *web_status(void){return (int *)status;}
EMSCRIPTEN_KEEPALIVE float *web_matrices(void){return matrices;}
EMSCRIPTEN_KEEPALIVE int16_t *web_audio(void){return audio_ring;}
EMSCRIPTEN_KEEPALIVE int web_game(void){
#ifdef WEB_TC1
 return 1;
#elif defined(WEB_CZ)
 return 3;
#else
 return 2;
#endif
}
static void push_audio(const int16_t *samples,int n){
#ifdef WEB_TC2
 if(atomic_load(&skip_frames)>0)return;
#endif
 unsigned w=atomic_load_explicit(&status[AUDIO_WRITE],memory_order_relaxed);
 unsigned r=atomic_load_explicit(&status[AUDIO_READ],memory_order_acquire);
 if(w-r+(unsigned)n>65536)return;
 for(int i=0;i<n;i++){
 #ifdef WEB_CZ
   float stereo[2]={(samples[i*4]+samples[i*4+2])*gain,(samples[i*4+1]+samples[i*4+3])*gain};
   web_audio_stereo_limit(&stereo[0],&stereo[1]);
 #endif
 for(int ch=0;ch<2;ch++){
 #ifdef WEB_TC1
   float s=samples[i*4+ch]*gain,a=fabsf(s);
   if(a>16384){a=16384+16383*(1-1/(1+(a-16384)/16383));s=copysignf(a,s);}
 #elif defined(WEB_CZ)
   float s=stereo[ch];
 #else
   float s=(samples[i*4+ch]+samples[i*4+ch+2])*gain;
 #ifdef WEB_TC2
   static int voice;
   if(ch==0)voice=tc2_voice_mix();
   s=s*game_volume/100+voice;
 #endif
 #endif
 #ifndef WEB_TC2
   s=s*game_volume/100;
 #endif
   audio_ring[((w+i)&65535)*2+ch]=(int16_t)fmaxf(-32768,fminf(32767,s));
 }
 }
 atomic_store_explicit(&status[AUDIO_WRITE],w+n,memory_order_release);
}
bool eng_audio_open(void){return true;}
void eng_audio_push(const int16_t *s,int n){push_audio(s,n);}
void eng_audio_set_gain(double g){if(g>0)gain=(float)g;}
void eng_audio_set_volume(int n){(void)n;}
void eng_audio_close(void){}
void tc2_audio_open(void){}
void tc2_audio_volume(int n){(void)n;}
void tc2_audio_push(const int16_t *s,int n){push_audio(s,n);}

static int init_graphics(void){
 if(graphics)return 1;
 if(!qgl_init()||!qui_init())return 0;
#ifndef WEB_TC1
 if(!tc2_gl_init())return 0;
 void ss22_gl_set_gun_flash(int);ss22_gl_set_gun_flash(0);
#else
 ss22_gl_set_gun_flash(false);
#endif
 if(!qgun_init("models/namco-gun.tcgun"))qgun_init("models/player-gun.tcgun");
#if !defined(WEB_TC1) && !defined(WEB_CZ)
 qgun_load_weapon(QGUN_MACHINE_GUN,"models/machine-gun.tcgun");
#endif
 graphics=true;return 1;
}
static int init_on_main(void){return emscripten_sync_run_in_main_runtime_thread(EM_FUNC_SIG_I,init_graphics);}

#ifdef WEB_TC1
static const ss22_host_game *game_host;
bool ss22_host_open(const ss22_host_game *g,int scale,bool full){
 (void)scale;(void)full;game_host=g;
 eng_audio_set_gain(g->out_gain);g->snd_set_output(true);g->input_init();
 return init_on_main()!=0;
}
#else
void (*tc2_present_hook)(void);
bool tc2_vr_open(void){return init_on_main()!=0;}
int tc2_window_open(int scale,int full){(void)scale;(void)full;void tc2_render_soft(int);tc2_render_soft(0);
#ifdef WEB_TC2
 tc2_online_init();
#endif
 return tc2_vr_open();}
int tc2_window_active(void){return 1;}
void tc2_crash_box(const char *reason){fprintf(stderr,"[WEB] %s\n",reason);atomic_store(&status[ERROR],1);}
void tc2_window_frame(void){
 tc2_built_latest_wait(); /* Worker may wait. Browser thread never waits. */
 ss22_host_frame();
#ifdef WEB_TC2
 tc2_online_frame();
#endif
}
#ifdef WEB_TC2
void tc2_subs_frame(uint32_t frame){(void)frame;}
int eng_cfg_int(const char *key,int fallback){(void)key;return fallback;}
#endif
void tc2_out_poll(uint16_t value){void ss22_out_poll(uint16_t);ss22_out_poll((value&1)?2:0);}
void tc2_out_close(void){}
#endif

bool ss22_host_frame(void){
#ifdef WEB_TC2
 if(atomic_load(&skip_frames)>0){extern uint32_t rr_frame;atomic_store(&status[FRAME],rr_frame);atomic_fetch_sub(&skip_frames,1);ss22_input_neutral();return true;}
#endif
 pthread_mutex_lock(&gate);
 extern uint32_t rr_frame;
 atomic_store(&status[FRAME],rr_frame);
 atomic_store_explicit(&status[READY],1,memory_order_release);
 /* Wake the browser's nonblocking simulation task as soon as the snapshot is
  * safe, without waiting for the next 72/90/120 Hz display callback. */
 emscripten_atomic_notify((void *)&status[READY],0x7fffffff);
 while(!released)pthread_cond_wait(&wake,&gate);
 released=false;
 pthread_mutex_unlock(&gate);
#ifdef WEB_TC1
 if(game_host)game_host->input_update();
#else
 ss22_input_update();
#endif
 return true;
}
bool ss22_host_active(void){return true;}
bool ss22_host_restart_requested(void){return false;}
bool ss22_host_open_headless(void){return false;}
bool ss22_host_pointer(float *x,float *y,bool *inside){*x=nx;*y=ny;*inside=valid;return true;}
void ss22_host_shot(const char *path){(void)path;}
void ss22_host_close(void){}
void ss22_input_init(const ss22_input_game *g){(void)g;}
const eng_ui_page *ss22_input_page(void){return NULL;}
void ss22_input_event(const SDL_Event *e){(void)e;}
void ss22_input_motor(uint8_t value){(void)value;}
void ss22_input_close(void){}
bool ss22_input_aim(float *x,float *y){*x=nx;*y=ny;return valid;}
void ss22_input_rumble(uint16_t a,uint16_t b,uint32_t ms){(void)a;(void)b;(void)ms;}
void ss22_out_close(void){}
void ss22_out_poll(uint16_t out){
 static uint16_t prev;
 bool pulse=((out&~prev)&2)!=0;
#ifdef WEB_CZ
 static double last;double now=emscripten_get_now();
 if((out&2)&&(pulse||now-last>=100)){pulse=true;last=now;}
#endif
 if(pulse)atomic_fetch_add(&status[SHOTS],1);prev=out;
}
void ss22_input_update(void){
 g_ss22_gun_off=!input_valid;
#ifdef WEB_TC1
 g_ss22_gun_x=(uint16_t)(68+fminf(1,fmaxf(0,input_x))*626);
 g_ss22_gun_y=(uint16_t)(43+fminf(1,fmaxf(0,input_y))*241);
 ss22_snd_inputs((uint16_t)input_bits,0x200,0,0);
#else
#ifdef WEB_CZ
 g_ss22_gun_x=(uint16_t)(tc2_game.gun_x0+fminf(1,fmaxf(0,input_x))*tc2_game.gun_xw);
 g_ss22_gun_y=(uint16_t)(tc2_game.gun_y0+fminf(1,fmaxf(0,input_y))*tc2_game.gun_yh);
#else
 g_ss22_gun_x=(uint16_t)(91+fminf(1,fmaxf(0,input_x))*733);
 g_ss22_gun_y=(uint16_t)(38+fminf(1,fmaxf(0,input_y))*247);
#endif
 tc2_inputs=(uint16_t)input_bits;
#endif
}
void ss22_input_neutral(void){input_bits=0;valid=false;ss22_input_update();}

static void *run_core(void *unused){
 (void)unused;char *args[]={"arcade","--window",NULL};
 extern int tc_game_main(int,char **);
 int code=tc_game_main(2,args);
 atomic_store(&status[ERROR],code?code:1);return NULL;
}
EMSCRIPTEN_KEEPALIVE int web_start(int player){
 if(started)return 0;
 started=true;
#if !defined(WEB_TC1) && !defined(WEB_CZ)
 qtc2_cabinet_side=player==2?2:1;
 setenv("TC2_VOICE_DSP","0",1); /* browser getUserMedia supplies echo/noise suppression */
#else
 (void)player;
#endif
 atomic_store(&status[AUDIO_RATE],
#ifdef WEB_TC1
 85333
#else
 88200
#endif
 );
 atomic_store(&status[AUDIO_CAP],65536);
 setenv("TC2_OUT_PORT","0",1);
 return pthread_create(&core,NULL,run_core,NULL)==0;
}
/* Startup-only native configuration (diagnostic replays use the core's own options).
 * Emscripten's JS ENV object is already cached after module instantiation. */
EMSCRIPTEN_KEEPALIVE int web_env(const char *name,const char *value){
 if(started||!name||!value||strlen(name)>63||strlen(value)>255)return 0;
 return setenv(name,value,1)==0;
}
EMSCRIPTEN_KEEPALIVE int web_prepare(double now){
 if(!atomic_load_explicit(&status[READY],memory_order_acquire))return 0;
#ifdef WEB_TC2
 web_online_prepare(now,paused);
#else
 web_menu_prepare(now,paused);
#endif
 unsigned shots=atomic_load(&status[SHOTS]);
 if(shots!=shot_seen){
   shot_seen=shots;shot_time=now;tracer_origin=input_muzzle;tracer_end=input_end;
#ifdef WEB_TC2
   web_impacts_confirm((unsigned)atomic_load(&status[FRAME]),now);
#endif
 }
 int frame=atomic_load(&status[FRAME]);if(frame==prepared_frame)return 1;
#ifdef WEB_TC1
 ss22_video_prepare();
#else
 qvr_scene_prepare(tc2_built_latest());
#ifdef WEB_TC2
 web_impacts_update(qvr_current_frame(),now);
#endif
#ifndef WEB_CZ
 extern uint8_t tc2_ram[0x1000000];
 qgun_select(qtc2_weapon_kind(tc2_ram,sizeof tc2_ram));
#endif
#endif
 prepared_frame=frame;has_scene=true;
 return 1;
}
EMSCRIPTEN_KEEPALIVE void web_advance(int bits){
 if(!atomic_load(&status[READY]))return;
#ifdef WEB_TC2
 if(!web_online_advance())return;
 if(!paused)web_impacts_capture(gun_muzzle,gun_end,tracking,valid,bits,(unsigned)atomic_load(&status[FRAME]));
#endif
 input_bits=bits;input_x=nx;input_y=ny;input_valid=valid;
 input_muzzle=gun_muzzle;input_end=gun_end;
 pthread_mutex_lock(&gate);
 released=true;atomic_store_explicit(&status[READY],0,memory_order_release);
 pthread_cond_signal(&wake);pthread_mutex_unlock(&gate);
}
EMSCRIPTEN_KEEPALIVE void web_settings(float scale,float distance,float pitch,float up,float back,int mode,int filter){
 extern float qvr_world_scale,qvr_view_distance;
 qvr_world_scale=fmaxf(.25f,fminf(4,scale));qvr_view_distance=fmaxf(0,fminf(1,distance));
 gun_pitch=fmaxf(-60,fminf(60,pitch));gun_up=fmaxf(-.2f,fminf(.2f,up));gun_back=fmaxf(-.2f,fminf(.2f,back));aim_mode=mode;
 menu_options.world_scale=(int)roundf(qvr_world_scale*100);menu_options.view_distance=(int)roundf(qvr_view_distance*100);
 menu_options.gun_pitch=(int)gun_pitch;menu_options.laser_enabled=mode==1;menu_options.texture_filtering=filter;
#ifndef WEB_TC1
 menu_options.tracer_enabled=mode==2;
#endif
#ifdef WEB_TC1
 qgl_set_texture_filter(filter!=0);
#else
 tc2_gl_set_filter(filter);
#endif
}
EMSCRIPTEN_KEEPALIVE void web_aim(float x,float y,float z,float qx,float qy,float qz,float qw,int tracked,int firing){
 tracking=tracked;fire=firing;
 Q4 hand={qx,qy,qz,qw};float a=gun_pitch*3.14159265358979323846f/360;
 gun_rotation=product(hand,(Q4){sinf(a),0,0,cosf(a)});
 gun_pos=add(v3(x,y,z),rotate(hand,v3(0,gun_up,gun_back)));
 gun_muzzle=qgun_muzzle(gun_pos,gun_rotation);
 V3 dir=rotate(gun_rotation,v3(0,0,-1));gun_end=add(gun_muzzle,mul(dir,20));
 if(paused){float px=0,py=0;bool hit=tracking&&qui_panel_hit(gun_muzzle,dir,menu_center,menu_rotation,&px,&py,&gun_end);
   extern void web_menu_pointer(float,float,int);web_menu_pointer(px,py,hit);valid=false;return;}
 if(has_scene&&tracking)valid=qvr_aim(gun_muzzle,dir,&nx,&ny,&gun_end);else valid=false;
}
EMSCRIPTEN_KEEPALIVE void web_mouse(float x,float y,int inside){nx=x;ny=y;valid=inside;tracking=false;}
EMSCRIPTEN_KEEPALIVE void web_view_mode(int xr){qvr_flat_view=!xr;}
static bool target(int w,int h){
 if(!eye_fbo){glGenFramebuffers(1,&eye_fbo);glGenTextures(1,&eye_color);glGenRenderbuffers(1,&eye_depth);}
 glBindFramebuffer(GL_FRAMEBUFFER,eye_fbo);
 if(w!=eye_w||h!=eye_h){
   eye_w=w;eye_h=h;glBindTexture(GL_TEXTURE_2D,eye_color);
   glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
   glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,w,h,0,GL_RGBA,GL_UNSIGNED_BYTE,NULL);
   glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0,GL_TEXTURE_2D,eye_color,0);
   glBindRenderbuffer(GL_RENDERBUFFER,eye_depth);glRenderbufferStorage(GL_RENDERBUFFER,GL_DEPTH_COMPONENT24,w,h);
   glFramebufferRenderbuffer(GL_FRAMEBUFFER,GL_DEPTH_ATTACHMENT,GL_RENDERBUFFER,eye_depth);
   eye_complete=glCheckFramebufferStatus(GL_FRAMEBUFFER)==GL_FRAMEBUFFER_COMPLETE;
 }
 /* Attachments do not change between eyes/frames. Querying every draw can
  * synchronously drain the browser's graphics command queue. */
 return eye_complete;
}
EMSCRIPTEN_KEEPALIVE unsigned web_eye(int eye,int w,int h,double now){
 if(!graphics||w<1||h<1)return 0;
 if(!target(w,h))return 0;
 glViewport(0,0,w,h);glDisable(GL_SCISSOR_TEST);glColorMask(1,1,1,1);glDepthMask(1);
 glClearColor(0,0,0,1);glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
 if(!has_scene)return eye_fbo;
 float cx,cy,focal;qvr_flat_camera(&cx,&cy,&focal);qgl_flat_camera(cx,cy,focal);
 qgl_target(eye,eye_fbo);qgl_eye(matrices,matrices+16);
#ifdef WEB_TC1
 ss22_draw(w,h);
#else
#ifdef WEB_TC2
 web_impacts_now=paused?-1:now;
#endif
 qtc2_draw(matrices,matrices+16,w,h,eye_fbo);
#endif
 qgl_flush();
 /* The browser composites the panel into each eye, without a native XR
  * underlay. Draw it before the pointer and foreground weapon pass. */
 if(paused&&!qvr_flat_view)
   qui_draw_menu(matrices,matrices+16,menu_center,menu_rotation,web_menu_host(),now/1000,false);
 float age=(float)(now-shot_time);
 if(tracking){
   /* qgl batches primitives. Submit the ray to THIS eye before the weapon
    * changes GL state and before JS copies the eye to the XR compositor. */
   if(aim_mode==1||paused){glDisable(GL_DEPTH_TEST);qgl_pointer(gun_muzzle,gun_end);qgl_flush();}
#ifdef WEB_TC1
   qgun_draw(matrices,matrices+16,gun_pos,gun_rotation,qgun_recoil(age),fire);
#else
   if(aim_mode==2&&age>=0&&age<65){glDisable(GL_DEPTH_TEST);qgl_tracer(tracer_origin,tracer_end,1-age/65);qgl_flush();}
   qgun_draw(matrices,matrices+16,gun_pos,gun_rotation,qgun_recoil(age),fire,qgun_flash(age));
#endif
 }
 if(paused){
   if(qvr_flat_view){
     qui_draw_menu(matrices,matrices+16,menu_center,menu_rotation,web_menu_host(),now/1000,false);
     qui_copy_menu();
   }
 }
#ifdef WEB_TC2
 if(!paused){unsigned serial;const char *toast=web_online_toast(&serial);if(toast[0])qui_draw_toast(matrices,matrices+16,head_pos,head_rotation,toast,serial);}
#endif
 return eye_fbo;
}
EMSCRIPTEN_KEEPALIVE void web_save(void){
 if(!atomic_load(&status[READY]))return;
#ifdef WEB_TC1
 ss22_eeprom_save();
#else
 void tc2_backup_save(int);tc2_backup_save(1);
#endif
}
int main(void){return 0;}

#ifdef WEB_TC2
EMSCRIPTEN_KEEPALIVE int *web_impact_status(void){static int out[8];web_impacts_status(out);return out;}
bool web_core_parked(void){return atomic_load_explicit(&status[READY],memory_order_acquire)!=0;}
EMSCRIPTEN_KEEPALIVE int web_skip_startup(void){
 if(!web_core_parked()||!menu_options.skip_startup||web_online_linked())return 0;
 int n=tc2_online_startup_left();if(n<=0)return 0;
 tc2_online_startup_skipping();atomic_store(&skip_frames,n);
 /* Fast-forward reuses both scene slots without parking. Stop reading the old
  * scene until the worker parks again; head tracking continues over black. */
 has_scene=false;prepared_frame=-1;qvr_scene_prepare(NULL);web_impacts_clear();
 atomic_store(&status[AUDIO_READ],atomic_load(&status[AUDIO_WRITE]));return 1;
}
int web_option_get(int o){
 switch(o){
 case -1:return paused;case -2:return menu_event;
 case QOPT_HAND:return !menu_options.left_handed;
 case QOPT_AIM:return aim_mode==1?0:aim_mode==2?1:2;
 case QOPT_PITCH:return (int)gun_pitch;case QOPT_GUN_Y:return (int)roundf(gun_up*1000);case QOPT_GUN_Z:return (int)roundf(gun_back*1000);
 case QOPT_PLAYER:return menu_options.player_side-1;case QOPT_COVER:return menu_options.physical_crouch;
 case QOPT_WORLD:return menu_options.world_scale;case QOPT_DISTANCE:return menu_options.view_distance;
 case QOPT_RESOLUTION:return 0;case QOPT_FILTER:return !menu_options.texture_filtering;
 case QOPT_GAME_VOLUME:return game_volume;case QOPT_SKIP_STARTUP:return menu_options.skip_startup;
 case QOPT_VOICE_VOLUME:{tc2_online_view v;tc2_online_get_view(&v);return v.volume;}
 }return 0;
}
void web_option_set(int o,int v){
 extern void web_menu_changed(void);
 switch(o){
 case QOPT_HAND:menu_options.left_handed=v==0;break;
 case QOPT_AIM:aim_mode=v==0?1:v==1?2:0;break;
 case QOPT_PITCH:gun_pitch=v;break;case QOPT_GUN_Y:gun_up=v/1000.f;break;case QOPT_GUN_Z:gun_back=v/1000.f;break;
 case QOPT_PLAYER:menu_options.player_side=v+1;break;case QOPT_COVER:menu_options.physical_crouch=v!=0;break;
 case QOPT_WORLD:menu_options.world_scale=v;break;case QOPT_DISTANCE:menu_options.view_distance=v;break;
 case QOPT_FILTER:menu_options.texture_filtering=v==0;break;case QOPT_GAME_VOLUME:game_volume=v;break;
 case QOPT_SKIP_STARTUP:menu_options.skip_startup=v!=0;tc2_online_set_startup_skip(v!=0);break;
 case QOPT_VOICE_VOLUME:tc2_online_set_volume(v);break;
 }
 web_settings(menu_options.world_scale/100.f,menu_options.view_distance/100.f,gun_pitch,gun_up,gun_back,aim_mode,menu_options.texture_filtering);
 web_menu_changed();
}
void web_menu_action(int action){
 switch(action){
 case QACT_RESUME:web_pause(0);break;
 case QACT_RESTART_GAME:web_impacts_clear();tc2_online_restart_game();web_pause(0);break;
 case QACT_RECENTER:menu_event=1;break;
 case QACT_RESTART_APP:tc2_online_leave();menu_event=2;break;
 case 10:web_pause(1);break;
 }
}
EMSCRIPTEN_KEEPALIVE void web_menu_event_done(void){menu_event=0;}
EMSCRIPTEN_KEEPALIVE void web_extra_settings(int hand,int player,int crouch,int skip,int volume){
 menu_options.left_handed=!hand;menu_options.player_side=player;menu_options.physical_crouch=crouch;menu_options.skip_startup=skip;
 game_volume=volume<0?0:volume>100?100:volume;
 /* tc2_online_set_startup_skip touches online state: applied only at a parked boundary. */
 if(web_core_parked())tc2_online_set_startup_skip(skip);
}
#else
static int render_quality=2,render_refresh,render_adaptive;
int web_option_get(int o){
 switch(o){
 case -1:return paused;case -2:return menu_event;
 case QOPT_HAND:return !menu_options.left_handed;
#ifdef WEB_TC1
 case QOPT_AIM:return aim_mode==1?0:1;
#else
 case QOPT_AIM:return aim_mode==1?0:aim_mode==2?1:2;
#endif
 case QOPT_PITCH:return (int)gun_pitch;
 case QOPT_GUN_Y:return (int)roundf(gun_up*1000);case QOPT_GUN_Z:return (int)roundf(gun_back*1000);
 case QOPT_COVER:return menu_options.physical_crouch;
 case QOPT_WORLD:return menu_options.world_scale;case QOPT_DISTANCE:return menu_options.view_distance;
 case QOPT_FILTER:return !menu_options.texture_filtering;case QOPT_GAME_VOLUME:return game_volume;
 case QOPT_RESOLUTION:return render_quality;case QOPT_REFRESH:return render_refresh;case QOPT_ADAPTIVE:return render_adaptive;
 }return 0;
}
static int clamp_option(int v,int lo,int hi){return v<lo?lo:v>hi?hi:v;}
void web_option_set(int o,int v){
 switch(o){
 case QOPT_HAND:menu_options.left_handed=v==0;break;
#ifdef WEB_TC1
 case QOPT_AIM:aim_mode=v==0?1:0;break;
#else
 case QOPT_AIM:aim_mode=v==0?1:v==1?2:0;break;
#endif
 case QOPT_PITCH:gun_pitch=v;break;
 case QOPT_GUN_Y:gun_up=v/1000.f;break;case QOPT_GUN_Z:gun_back=v/1000.f;break;
 case QOPT_COVER:menu_options.physical_crouch=v!=0;break;
 case QOPT_WORLD:menu_options.world_scale=v;break;case QOPT_DISTANCE:menu_options.view_distance=v;break;
 case QOPT_FILTER:menu_options.texture_filtering=v==0;break;
 case QOPT_GAME_VOLUME:game_volume=clamp_option(v,0,100);break;
 case QOPT_RESOLUTION:render_quality=clamp_option(v,0,2);break;
 case QOPT_REFRESH:render_refresh=clamp_option(v,0,2);break;
 case QOPT_ADAPTIVE:render_adaptive=v!=0;break;
 default:return;
 }
 web_settings(menu_options.world_scale/100.f,menu_options.view_distance/100.f,gun_pitch,gun_up,gun_back,aim_mode,menu_options.texture_filtering);
 web_menu_changed();
}
void web_menu_action(int action){
 if(action==QACT_RESUME)web_pause(0);
 else if(action==QACT_RECENTER)menu_event=1;
 else if(action==QACT_RESTART_APP||action==QACT_RESTART_GAME)menu_event=2;
}
EMSCRIPTEN_KEEPALIVE void web_menu_event_done(void){menu_event=0;}
EMSCRIPTEN_KEEPALIVE void web_render_settings(int quality,int refresh,int adaptive){
 render_quality=clamp_option(quality,0,2);render_refresh=clamp_option(refresh,0,2);render_adaptive=adaptive!=0;
}
EMSCRIPTEN_KEEPALIVE void web_extra_settings(int hand,int player,int crouch,int skip,int volume){
 (void)player;(void)skip;menu_options.left_handed=!hand;menu_options.physical_crouch=crouch!=0;game_volume=clamp_option(volume,0,100);
}
#endif
