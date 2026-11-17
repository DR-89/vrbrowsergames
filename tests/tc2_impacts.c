#include "web_impacts.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static WebImpactVertex vertices[WEB_IMPACT_LIMIT*6];
static void near(float a,float b){assert(fabsf(a-b)<.0001f);}
static void wall(tc2_built *b,int index,float depth){
    b->fs.list.e[index]=(tc2_render_entry){.type=TC2_RE_MODEL,.model=(uint16_t)(100+index),.vp_fov=800};
    tc2_poly *p=&b->polys[index];*p=(tc2_poly){.n=4,.entry=index,.model=100+index,.alpha_enabled=1,.vp_size_x=320,.vp_size_y=240};
    const float xy[4][2]={{80,40},{560,40},{560,440},{80,440}};
    for(int i=0;i<4;i++){p->pv[i].x=xy[i][0];p->pv[i].y=xy[i][1];p->pv[i].p[0]=1/depth;}
}
static void shot(unsigned frame,double now){web_impacts_capture(v3(0,0,0),v3(0,0,-20),true,true,16,frame);web_impacts_confirm(frame+1,now);}
int main(void){
    tc2_built *b=calloc(1,sizeof *b);assert(b);b->npoly=b->fs.list.count=2;b->fx.alpha=0;
    qvr_units_per_meter=1;wall(b,0,10);wall(b,1,3);qvr_scene_prepare(b);
    web_impacts_capture(v3(0,0,0),v3(0,0,-20),true,true,16,99);assert(web_impacts_vertices(vertices,1000)==0);web_impacts_clear();
    shot(100,1000);assert(web_impacts_vertices(vertices,1000)==6);
    near(vertices[0].position[2],-2.998f);near(vertices[0].entry,2);
    WebImpactVertex first[6];memcpy(first,vertices,sizeof first);assert(web_impacts_vertices(vertices,1000)==6);assert(!memcmp(first,vertices,sizeof first));
    for(int i=25;i<=400;i+=25){qvr_world_scale=i/100.f;qvr_view_distance=.4f;assert(web_impacts_vertices(vertices,1200)==6);near(vertices[0].position[2],-2.998f*qvr_world_scale-.4f);}
    qvr_world_scale=1;qvr_view_distance=0;assert(web_impacts_vertices(vertices,2500)==0);
    web_impacts_clear();web_impacts_capture(v3(0,0,0),v3(0,0,-20),true,true,16,100);
    web_impacts_capture(v3(0,0,0),v3(20,20,-1),true,true,0,101);web_impacts_confirm(102,1000);
    assert(web_impacts_vertices(vertices,1000)==6);near(vertices[0].position[2],-2.998f);
    b->fs.list.e[1].v[0]++;web_impacts_update(b,1100);assert(web_impacts_vertices(vertices,1100)==0);b->fs.list.e[1].v[0]--;
    web_impacts_clear();web_impacts_capture(v3(0,0,0),v3(0,0,-20),true,true,16,100);
    web_impacts_capture(v3(0,0,0),v3(20,20,-1),true,true,16,101);web_impacts_confirm(102,1000);
    assert(web_impacts_vertices(vertices,1000)==6);near(vertices[0].position[2],-2.998f);
    b->fs.list.e[1].model_blend_factor++;web_impacts_update(b,1100);assert(web_impacts_vertices(vertices,1100)==6);
    /* Held automatic fire uses the newly submitted ray after the first shot. */
    web_impacts_capture(v3(0,0,0),v3(.2f,0,-3),true,true,16,103);
    web_impacts_capture(v3(0,0,0),v3(-.2f,0,-3),true,true,16,104);web_impacts_confirm(105,1100);
    assert(web_impacts_vertices(vertices,1100)==12);near((vertices[6].position[0]+vertices[8].position[0])/2,-.2f);
    web_impacts_clear();shot(100,1000);tc2_render_entry e=b->fs.list.e[0];b->fs.list.e[0]=b->fs.list.e[1];b->fs.list.e[1]=e;
    web_impacts_update(b,1100);assert(web_impacts_vertices(vertices,1100)==6);near(vertices[0].entry,1);
    wall(b,0,10);wall(b,1,3);qvr_scene_prepare(b);
    for(int mode=0;mode<6;mode++){
        web_impacts_clear();qvr_flat_view=mode==4;
        web_impacts_capture(v3(0,0,0),mode==3?v3(30,30,-1):v3(0,0,-20),mode!=1,mode!=2,mode==0?0:16,100);
        web_impacts_confirm(mode==5?107:101,1000);assert(web_impacts_vertices(vertices,1000)==0);
    }
    qvr_flat_view=0;web_impacts_clear();b->polys[1].blend=1;shot(100,1000);assert(web_impacts_vertices(vertices,1000)==6);near(vertices[0].position[2],-9.998f);
    web_impacts_clear();b->polys[0].blend=1;shot(100,1000);assert(web_impacts_vertices(vertices,1000)==0);b->polys[0].blend=b->polys[1].blend=0;
    b->fx.alpha=64;shot(100,1000);assert(web_impacts_vertices(vertices,1000)==0);b->fx.alpha=0;
    b->npoly=0;qvr_scene_prepare(b);shot(100,1000);assert(web_impacts_vertices(vertices,1000)==0);b->npoly=2;
    b->fs.list.e[0].type=b->fs.list.e[1].type=TC2_RE_DIRECT;qvr_scene_prepare(b);shot(100,1000);assert(web_impacts_vertices(vertices,1000)==0);
    wall(b,0,10);wall(b,1,3);qvr_scene_prepare(b);
    for(int i=0;i<100;i++)shot(100+i,1000+i);assert(web_impacts_vertices(vertices,1100)==WEB_IMPACT_LIMIT*6);
    web_impacts_update(NULL,1100);assert(web_impacts_vertices(vertices,1100)==0);
    free(b);puts("PASS: confirmed surface hits, nearest wall, stored shot ray, stereo stability, scale, expiry, transitions, bounded pool, no sky/HUD/invalid/menu-view marks");
}
