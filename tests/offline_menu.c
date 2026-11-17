/* Exercise the generated real widgets, not a second implementation of them. */
#include <assert.h>
#include <stdio.h>
#include "quest_menu_web.c"
static int opts[QOPT_COUNT],action=-1;
static int get(int o){return o>=0&&o<QOPT_COUNT?opts[o]:0;}
static void set(int o,int v){const RowDef *r=row_def(o);assert(r);opts[o]=v<r->min?r->min:v>r->max?r->max:v;}
static void act(int a){action=a;}
static QMenuHost host={.get=get,.set=set,.action=act,.saved=true};
static unsigned char image[QMENU_W*QMENU_H*4];
static double now=1;
static void tick(QMenuInput in){in.now=now;now+=.05;qmenu_update(&host,&in);qmenu_render(&host,image,now,NULL);}
static void click(int id){
    const Hit *hit=find_hit(id);assert(hit);float x=hit->x+hit->w/2.f,y=hit->y+hit->h/2.f;
    tick((QMenuInput){.pointer=true,.px=x,.py=y});
    tick((QMenuInput){.pointer=true,.px=x,.py=y,.press=true,.held=true});
    tick((QMenuInput){.pointer=true,.px=x,.py=y,.release=true});
}
int main(void){
    assert(QMENU_TAB_COUNT==4);
    for(int i=0;i<QOPT_COUNT;i++){const RowDef *r=row_def(i);if(r)opts[i]=r->def;}
    for(int t=0;t<QMENU_TAB_COUNT;t++){
        qmenu_open(t);tick((QMenuInput){0});
        for(int i=0;i<nhits;i++)assert(hits[i].x>=0&&hits[i].y>=0&&hits[i].x+hits[i].w<=QMENU_W&&hits[i].y+hits[i].h<=QMENU_H);
        for(int o=0;o<QOPT_COUNT;o++){
            const RowDef *r=row_def(o);if(!r||!find_hit(ID(K_ROW,o)))continue;
            if(r->type==T_SEG){for(int v=0;v<r->nopts;v++){click(ID(K_SEG,o*8+v));assert(opts[o]==v);}}
            else{
                opts[o]=r->def;int expected=opts[o]+r->step;if(expected>r->max)expected=r->max;
                click(ID(K_STEP,o*2+1));assert(opts[o]==expected);
                const Hit *h=find_hit(ID(K_TRACK,o));assert(h);int x=h->x,y=h->y+26,w=h->w;
                tick((QMenuInput){.pointer=true,.px=x,.py=y,.press=true,.held=true});assert(opts[o]==r->min);
                tick((QMenuInput){.pointer=true,.px=x+w-1,.py=y,.held=true});assert(opts[o]==r->max);
                tick((QMenuInput){.pointer=true,.px=x+w-1,.py=y,.release=true});
            }
            if(opts[o]!=r->def){click(ID(K_RESET,o));assert(opts[o]==r->def);}
        }
        tick((QMenuInput){0});
        assert(!qmenu_render(&host,image,now+.1,NULL)); /* stable menus do no redraw */
    }
    assert(!row_def(QOPT_PLAYER)&&!row_def(QOPT_SKIP_STARTUP)&&!row_def(QOPT_VOICE_VOLUME));
#ifdef WEB_TC1
    assert(row_def(QOPT_AIM)->nopts==2);
#else
    assert(row_def(QOPT_AIM)->nopts==3);
#endif
    qmenu_open(0);tick((QMenuInput){0});
    opts[QOPT_PITCH]=-16;opts[QOPT_GUN_Y]=0;
    tick((QMenuInput){.pointer=true,.px=851,.py=344});
    /* A quick down/up in the next row must not hit the prior smoothed point. */
    now-=.049;
    tick((QMenuInput){.pointer=true,.px=851,.py=422,.press=true,.release=true});
    assert(opts[QOPT_PITCH]==-16&&opts[QOPT_GUN_Y]==5);
    qmenu_open(0);tick((QMenuInput){0});
    for(int t=1;t<=4;t++){tick((QMenuInput){.tab=1});assert(qmenu_tab()==t%4);}
    tick((QMenuInput){.select=true});assert(action==QACT_RESUME);
    qmenu_open(0);tick((QMenuInput){0});click(ID(K_FOOT,1));assert(action==QACT_RECENTER);
    click(ID(K_FOOT,2));assert(qmenu_modal());tick((QMenuInput){.back=true});assert(!qmenu_modal());
    click(ID(K_FOOT,2));assert(qmenu_modal());click(ID(K_MBTN,1));assert(action==QACT_RESTART_APP);
    puts("PASS: four tabs, fitting controls, choices, slider endpoints, reset, tab wrap, resume/recenter/restart, cancel and cached redraw.");
}
