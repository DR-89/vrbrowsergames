/* Included after the scene's Triangle type. A conservative bounds tree over
 * contiguous batches preserves the original nearest-hit/tie order. Building
 * is linear; no sorting, per-ray allocations or changed triangle math. */
#include <float.h>
#include <stdlib.h>
typedef struct { float lo[3],hi[3]; } WebRayBounds;
static WebRayBounds *web_ray_nodes;
static int web_ray_capacity,web_ray_leaves;
static unsigned web_ray_tests;
static WebRayBounds web_ray_empty(void){
    return (WebRayBounds){{FLT_MAX,FLT_MAX,FLT_MAX},{-FLT_MAX,-FLT_MAX,-FLT_MAX}};
}
static WebRayBounds web_ray_union(WebRayBounds a,WebRayBounds b){
    for(int k=0;k<3;k++){a.lo[k]=fminf(a.lo[k],b.lo[k]);a.hi[k]=fmaxf(a.hi[k],b.hi[k]);}return a;
}
static bool web_ray_build(const Triangle *tri,int count){
    web_ray_leaves=0;if(count<=0)return false;
    int leaves=1;while(leaves<(count+7)/8)leaves*=2;
    if(2*leaves>web_ray_capacity){
        WebRayBounds *next=realloc(web_ray_nodes,2*(size_t)leaves*sizeof *next);
        if(!next)return false;web_ray_nodes=next;web_ray_capacity=2*leaves;
    }
    for(int i=0;i<leaves;i++)web_ray_nodes[leaves+i]=web_ray_empty();
    for(int i=0;i<count;i++){
        const V3 vertices[]={tri[i].a,tri[i].b,tri[i].c};
        WebRayBounds *b=&web_ray_nodes[leaves+i/8];
        for(int j=0;j<3;j++){
            const float p[]={vertices[j].x,vertices[j].y,vertices[j].z};
            for(int k=0;k<3;k++){b->lo[k]=fminf(b->lo[k],p[k]);b->hi[k]=fmaxf(b->hi[k],p[k]);}
        }
    }
    for(int i=leaves-1;i>0;i--)web_ray_nodes[i]=web_ray_union(web_ray_nodes[2*i],web_ray_nodes[2*i+1]);
    web_ray_leaves=leaves;return true;
}
static bool web_ray_box(const WebRayBounds *b,V3 origin,V3 direction,float nearest){
    const float o[]={origin.x,origin.y,origin.z},d[]={direction.x,direction.y,direction.z};
    float near=0,far=nearest;
    for(int k=0;k<3;k++){
        if(b->lo[k]>b->hi[k])return false;
        // Bounds must not reject boundary hits due to floating-point rounding.
        float pad=1e-5f*fmaxf(1,fmaxf(fabsf(b->lo[k]),fabsf(b->hi[k])));
        float lo=b->lo[k]-pad,hi=b->hi[k]+pad;
        if(d[k]==0){if(o[k]<lo||o[k]>hi)return false;continue;}
        float a=(lo-o[k])/d[k],z=(hi-o[k])/d[k];
        near=fmaxf(near,fminf(a,z));far=fminf(far,fmaxf(a,z));
        if(near>far)return false;
    }
    return true;
}
static int web_ray_hit(const Triangle *tri,int count,V3 o,V3 d,float *nearest){
    int hit=-1;web_ray_tests=0;
    if(!web_ray_leaves){
        for(int i=0;i<count;i++){web_ray_tests++;if(ray_triangle(o,d,tri[i].a,tri[i].b,tri[i].c,nearest))hit=i;}
        return hit;
    }
    int stack[64],size=1;stack[0]=1;
    while(size){
        int node=stack[--size];if(!web_ray_box(&web_ray_nodes[node],o,d,*nearest))continue;
        if(node<web_ray_leaves){stack[size++]=2*node+1;stack[size++]=2*node;continue;}
        int first=(node-web_ray_leaves)*8,end=first+8;if(end>count)end=count;
        for(int i=first;i<end;i++){web_ray_tests++;if(ray_triangle(o,d,tri[i].a,tri[i].b,tri[i].c,nearest))hit=i;}
    }
    return hit;
}
