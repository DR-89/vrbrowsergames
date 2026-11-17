/* Short-lived surface feedback, separate from the original game's hit/damage
 * decisions. Never place a mark on the aim fallback/HUD plane. */
#include "web_impacts.h"
#include <float.h>
#include <string.h>

typedef struct {
    bool valid;int entry;unsigned frame;
    tc2_render_entry object;
    V3 point,normal;
    double born;
} Impact;
static Impact pending,marks[WEB_IMPACT_LIMIT];
double web_impacts_now;
static int next;
static bool trigger_down,pending_latched;
static int counters[8];
void web_impacts_status(int out[8]){memcpy(out,counters,sizeof counters);out[5]=0;for(int i=0;i<WEB_IMPACT_LIMIT;i++)out[5]+=marks[i].valid;}
static bool same_object(const tc2_render_entry *a,const tc2_render_entry *b){
    return a->type==b->type&&a->model==b->model&&a->model2==b->model2&&
        (!a->model2||a->model_blend_factor==b->model_blend_factor)&&a->scaling==b->scaling&&
        a->transpose==b->transpose&&a->mirror_x==b->mirror_x&&
        a->vp_fov==b->vp_fov&&a->vp_offset_x==b->vp_offset_x&&a->vp_offset_y==b->vp_offset_y&&
        !memcmp(a->m,b->m,sizeof a->m)&&!memcmp(a->v,b->v,sizeof a->v)&&
        (a->type!=TC2_RE_IMMEDIATE||!memcmp(&a->imm,&b->imm,sizeof a->imm));
}
void web_impacts_clear(void){memset(marks,0,sizeof marks);pending.valid=false;trigger_down=pending_latched=false;next=0;}
void web_impacts_capture(V3 origin,V3 end,bool tracked,bool valid,int bits,unsigned frame){
    bool down=(bits&16)!=0,edge=down&&!trigger_down;trigger_down=down;
    if(!down)return;
    if(!edge&&pending_latched&&pending.valid&&frame-pending.frame<=6)return;
    counters[0]++;counters[6]=0;
    pending.valid=false;
    pending_latched=edge;
    const tc2_built *b=qvr_current_frame();
    if(!b||!valid||!tracked||qvr_flat_view){counters[6]=!b?1:!valid?2:!tracked?3:4;return;}
    V3 direction=sub(end,origin);float length=sqrtf(dot(direction,direction));
    if(!isfinite(length)||length<.02f)return;
    direction=mul(direction,1.f/length);float nearest=FLT_MAX;
    int found=-1;V3 point={0},normal={0};
    for(int i=0;i<b->npoly;i++){
        const tc2_poly *p=&b->polys[i];
        if(p->entry<0||p->entry>=b->fs.list.count||p->n<3||p->n>8||qvr_tc2_layer(b,p)!=QTC2_WORLD)continue;
        /* Match the renderer's opaque depth prepass: smoke, glass and other
         * translucent effects must not catch a floating bullet hole. */
        /* C404 stores transparency; the shader uses 255 - fx.alpha. */
        if(p->blend||(p->alpha_enabled&&b->fx.alpha!=0))continue;
        V3 a=qvr_tc2_vertex(b,p,0);
        for(int k=1;k+1<p->n;k++){
            V3 c=qvr_tc2_vertex(b,p,k),d=qvr_tc2_vertex(b,p,k+1);
            if(ray_triangle(origin,direction,a,c,d,&nearest)){
                found=i;point=add(origin,mul(direction,nearest));normal=cross(sub(c,a),sub(d,a));
            }
        }
    }
    if(found<0){counters[6]=5;return;}
    const tc2_poly *p=&b->polys[found];
    float n=sqrtf(dot(normal,normal));if(!isfinite(n)||n<1e-6f)return;
    normal=mul(normal,1.f/n);if(dot(normal,direction)>0)normal=mul(normal,-1);
    const tc2_render_entry *e=&b->fs.list.e[p->entry];
    if(e->type!=TC2_RE_MODEL&&e->type!=TC2_RE_IMMEDIATE)return;
    pending=(Impact){.valid=true,.entry=p->entry,.frame=frame,.object=*e,
        .point=mul(add(point,v3(0,0,qvr_view_distance)),1.f/qvr_world_scale),.normal=normal};
    counters[1]++;counters[7]=p->entry;
}
void web_impacts_confirm(unsigned frame,double now){
    /* Outputs can follow the trigger by a few original frames. Releasing or
     * moving the controller must not retarget the already submitted shot. */
    if(pending.valid&&frame-pending.frame<=6){
        pending.born=now;marks[next]=pending;next=(next+1)%WEB_IMPACT_LIMIT;
        counters[2]++;
    }
    pending.valid=false;
    pending_latched=false;
}
void web_impacts_update(const tc2_built *b,double now){
    if(!b){web_impacts_clear();return;}
    for(int i=0;i<WEB_IMPACT_LIMIT;i++){
        Impact *m=&marks[i];if(!m->valid)continue;
        if(now-m->born>=1500){m->valid=false;counters[4]++;continue;}
        if(m->entry<b->fs.list.count&&same_object(&m->object,&b->fs.list.e[m->entry]))continue;
        int match=-1;
        for(int j=0;j<b->fs.list.count;j++)if(same_object(&m->object,&b->fs.list.e[j])){match=j;break;}
        /* No stable world IDs are exposed by the arcade render list. Drop the
         * effect on a camera/object change instead of making it float. */
        m->entry=match;if(match<0){m->valid=false;counters[3]++;}
    }
}
int web_impacts_vertices(WebImpactVertex *out,double now){
    int count=0;const int corners[6][2]={{-1,-1},{1,-1},{1,1},{-1,-1},{1,1},{-1,1}};
    for(int i=0;i<WEB_IMPACT_LIMIT;i++){
        Impact *m=&marks[i];float age=(float)(now-m->born);
        if(!m->valid||age<0||age>=1500||qvr_flat_view)continue;
        V3 x=cross(m->normal,fabsf(m->normal.y)<.9f?v3(0,1,0):v3(1,0,0));x=mul(x,1.f/sqrtf(dot(x,x)));
        V3 y=cross(m->normal,x),center=add(m->point,mul(m->normal,.002f));
        for(int j=0;j<6;j++){
            V3 p=add(center,mul(add(mul(x,(float)corners[j][0]),mul(y,(float)corners[j][1])),.12f));
            p=sub(mul(p,qvr_world_scale),v3(0,0,qvr_view_distance));
            out[count++]=(WebImpactVertex){{p.x,p.y,p.z,1},{(float)corners[j][0],(float)corners[j][1]},age/1000.f,(float)(m->entry+1)};
        }
    }
    return count;
}
