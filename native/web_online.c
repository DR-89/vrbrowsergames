/* All live online/menu access happens only with the arcade worker parked.
 * The worker runs tc2_online_frame once after each release. GL reads cached UI. */
#include "web_online.h"
#include "tc2_online.h"
#include "tc2_link.h"
#include "tc2_voice.h"
#include <emscripten.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>

static QMenuHost host={web_option_get,web_option_set,web_menu_action,0,0,0,0,false,true,"V / STICK"};
static QMenuInput input;
static uint8_t menu_pixels[QMENU_W*QMENU_H*4];
static bool dirty,linked,may_advance=true;
static int open_tab=-2;
static _Atomic int request_open;
static char snapshot[8192]="{}",toast[96],argument[128];
static unsigned toast_serial;
static int16_t capture[480];
static int values[QOPT_COUNT+6];
static unsigned serial;

static void quoted(char *dst,size_t size,const char *src){
 size_t n=0;for(;*src&&n+3<size;src++){unsigned char c=(unsigned char)*src;if(c=='"'||c=='\\')dst[n++]='\\';if(c>=32&&c<127)dst[n++]=(char)c;}dst[n]=0;
}
void qhost_online_menu(bool open){atomic_store(&request_open,open?1:-1);}
bool qhost_online_menu_open(void){return web_option_get(-1)!=0;}
void qhost_test(const char *action,const char *arg){(void)action;(void)arg;}
void web_menu_open(int tab){open_tab=tab;}
const QMenuHost *web_menu_host(void){return &host;}
bool web_online_linked(void){return linked;}
bool web_online_advance(void){return may_advance;}
const char *web_online_toast(unsigned *s){*s=toast_serial;return toast;}
bool web_menu_render(uint8_t *pixels,int *box){
 if(!dirty)return false;memcpy(pixels,menu_pixels,sizeof menu_pixels);
 box[0]=box[1]=0;box[2]=QMENU_W;box[3]=QMENU_H;dirty=false;return true;
}
void web_online_prepare(double now,bool menu){
 int requested=atomic_exchange(&request_open,0);
 if(requested>0){web_menu_action(10);menu=true;open_tab=QMENU_TAB_ONLINE;}
 else if(requested<0){web_menu_action(QACT_RESUME);menu=false;}
 tc2_online_service();
 if(open_tab!=-2){qmenu_open(open_tab);open_tab=-2;}
 input.now=now/1000;
 if(menu){
   qmenu_update(&host,&input);
   if(qmenu_render(&host,menu_pixels,input.now,NULL))dirty=true;
 }
 input.press=input.release=input.select=input.back=false;input.tab=input.nav_x=input.nav_y=0;
 linked=tc2_online_session();may_advance=tc2_online_may_advance();
 if(!tc2_online_toast(toast,sizeof toast,&toast_serial))toast[0]=0;
 tc2_online_view v;tc2_online_get_view(&v);tc2_link_status l;tc2_link_get_status(&l);
 tc2_voice_status voice;tc2_voice_get_status(&voice);
 char name[48],partner[64],message[200];quoted(name,sizeof name,v.name);quoted(partner,sizeof partner,v.partner);quoted(message,sizeof message,toast);
 extern uint8_t tc2_ram[];
 int n=snprintf(snapshot,sizeof snapshot,"{\"state\":%d,\"side\":%d,\"name\":\"%s\",\"code\":\"%s\",\"partner\":\"%s\",\"opening\":%s,\"linked\":%s,\"canRejoin\":%s,\"ping\":%d,\"alive\":%s,\"lag\":%u,\"tx\":%u,\"rx\":%u,\"bad\":%u,\"gameErrors\":%u,\"selfState\":%d,\"gameMode\":%u,\"joinState\":%u,\"voice\":%s,\"muted\":%s,\"voiceSent\":%u,\"voiceReceived\":%u,\"toast\":\"%s\",\"startupLeft\":%d,\"paused\":%s,\"rooms\":[",
 v.state,v.side,name,v.code,partner,v.opening?"true":"false",linked?"true":"false",v.can_rejoin?"true":"false",v.ping_ms,l.alive?"true":"false",l.lag,l.tx,l.rx,l.rx_bad+l.tx_bad,l.game_errors,tc2_link_self_state(),tc2_ram[0x2CE92B],tc2_ram[0x2F3930],v.voice?"true":"false",v.muted?"true":"false",voice.sent,voice.received,message,tc2_online_startup_left(),web_option_get(-1)?"true":"false");
 tc2_online_game games[32];int count=tc2_online_games(games,32);
 for(int i=0;i<count&&n<(int)sizeof snapshot-200;i++){
   char label[64];quoted(label,sizeof label,games[i].name);
   n+=snprintf(snapshot+n,sizeof snapshot-n,"%s{\"name\":\"%s\",\"players\":%d,\"status\":%d}",i?",":"",label,games[i].players,games[i].status);
 }
 snprintf(snapshot+n,sizeof snapshot-n,"]}");
 for(int i=0;i<QOPT_COUNT;i++)values[i+2]=web_option_get(i);
 values[0]=(int)serial;values[1]=web_option_get(-2);
 values[QOPT_COUNT+2]=v.push_to_talk;values[QOPT_COUNT+3]=v.join_credit;
 values[QOPT_COUNT+4]=v.voice;values[QOPT_COUNT+5]=v.volume;
}
void web_menu_changed(void){serial++;}
EMSCRIPTEN_KEEPALIVE int *web_menu_values(void){return values;}
EMSCRIPTEN_KEEPALIVE const char *web_online_status(void){return snapshot;}
EMSCRIPTEN_KEEPALIVE char *web_online_argument(void){return argument;}
EMSCRIPTEN_KEEPALIVE int16_t *web_voice_buffer(void){return capture;}
EMSCRIPTEN_KEEPALIVE int web_voice_feed(int n){if(!web_core_parked()||n!=480)return 0;tc2_voice_capture(capture,n);return 1;}
EMSCRIPTEN_KEEPALIVE int web_online_action(int action,int value){
 if(!web_core_parked())return 0;argument[sizeof argument-1]=0;
 switch(action){
 case 1:tc2_online_host_room();break;
 case 2:tc2_online_join_code(argument);break;
 case 3:tc2_online_leave();break;
 case 4:tc2_online_browse(value!=0);break;
 case 5:tc2_online_join_game(value);break;
 case 6:tc2_online_quick();break;
 case 7:tc2_online_rejoin();break;
 case 8:tc2_online_set_name(argument);break;
 case 9:tc2_online_set_voice(value!=0);break;
 case 10:tc2_online_toggle_mute();break;
 case 11:tc2_online_set_push_to_talk(value!=0);break;
 case 12:tc2_online_talk_key(value!=0);break;
 case 13:tc2_online_set_volume(value);break;
 case 14:tc2_online_set_join_credit(value!=0);break;
 case 15:{extern void tc2_voice_browser_mic(int);tc2_voice_browser_mic(value);break;}
 case 16:tc2_online_restart_game();break;
 case 17:tc2_online_menu_shown(true);break;
 case 18:host.boot_player=value-1;break;
 default:return 0;
 }return 1;
}
EMSCRIPTEN_KEEPALIVE void web_menu_input(float px,float py,int pointer,int press,int release,int held,float sx,float sy,int select,int back,int tab,int nx,int ny){
 if(pointer>=0){input.px=px;input.py=py;input.pointer=pointer;}input.press|=press;input.release|=release;input.held=held;
 input.stick_x=sx;input.stick_y=sy;input.select|=select;input.back|=back;input.tab+=tab;input.nav_x+=nx;input.nav_y+=ny;
}
void web_menu_pointer(float px,float py,int pointer){input.px=px;input.py=py;input.pointer=pointer;}
