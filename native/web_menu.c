/* Single-player menu bridge. Shared TC2 widgets; no networking or worker access.
 * Inputs are consumed at the same parked boundary as scene/settings changes. */
#include "web_menu.h"
#include <emscripten.h>
#include <string.h>

static QMenuHost host={.get=web_option_get,.set=web_option_set,.action=web_menu_action,.saved=true};
static QMenuInput input;
static int open_tab=-2,values[QOPT_COUNT+2];
static unsigned serial;
static uint8_t pixels[QMENU_W*QMENU_H*4];
static int dirty_box[4];
static bool dirty;

const QMenuHost *web_menu_host(void){return &host;}
void web_menu_changed(void){serial++;}
void web_menu_open(int tab){open_tab=tab;memset(&input,0,sizeof input);}
void web_menu_prepare(double now,bool menu){
    if(open_tab!=-2){qmenu_open(open_tab);open_tab=-2;}
    input.now=now/1000;
    if(menu){
        qmenu_update(&host,&input);
        int box[4];
        if(qmenu_render(&host,pixels,input.now,box)){
            /* A prepare may precede another prepare without an eye draw. */
            if(dirty){dirty_box[0]=dirty_box[1]=0;dirty_box[2]=QMENU_W;dirty_box[3]=QMENU_H;}
            else memcpy(dirty_box,box,sizeof box);
            dirty=true;
        }
    }
    input.press=input.release=input.select=input.back=false;
    input.tab=input.nav_x=input.nav_y=0;
    values[0]=(int)serial;values[1]=web_option_get(-2);
    for(int i=0;i<QOPT_COUNT;i++)values[i+2]=web_option_get(i);
}
bool web_menu_render(uint8_t *out,int *box){
    if(!dirty)return false;
    memcpy(out,pixels,sizeof pixels);memcpy(box,dirty_box,sizeof dirty_box);
    dirty=false;return true;
}
EMSCRIPTEN_KEEPALIVE int *web_menu_values(void){return values;}
EMSCRIPTEN_KEEPALIVE int web_menu_paused(void){return web_option_get(-1);}
EMSCRIPTEN_KEEPALIVE int web_menu_tab(void){return qmenu_tab();}
EMSCRIPTEN_KEEPALIVE void web_menu_saved(int saved){host.saved=saved!=0;}
EMSCRIPTEN_KEEPALIVE void web_menu_input(float px,float py,int pointer,int press,int release,int held,float sx,float sy,int select,int back,int tab,int nx,int ny){
    if(pointer>=0){input.px=px;input.py=py;input.pointer=pointer!=0;}
    input.press|=press;input.release|=release;input.held=held!=0;
    input.stick_x=sx;input.stick_y=sy;input.select|=select;input.back|=back;
    input.tab+=tab;input.nav_x+=nx;input.nav_y+=ny;
}
void web_menu_pointer(float px,float py,int pointer){input.px=px;input.py=py;input.pointer=pointer!=0;}
