#include "vr_math.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
typedef struct {V3 a,b,c;} Triangle;
#include "web_ray_index.h"
static Triangle triangles[8192];
static uint32_t seed=12345;
static float random01(void){seed=seed*1664525u+1013904223u;return (seed>>8)/16777216.f;}
static int brute(int count,V3 o,V3 d,float *nearest){
    int hit=-1;for(int i=0;i<count;i++)if(ray_triangle(o,d,triangles[i].a,triangles[i].b,triangles[i].c,nearest))hit=i;return hit;
}
static unsigned long checks,total;
static void compare(int count,V3 o,V3 d,float limit){
    float a=limit,b=limit;int ai=brute(count,o,d,&a),bi=web_ray_hit(triangles,count,o,d,&b);
    assert(ai==bi);assert(a==b);checks+=web_ray_tests;total+=count;
}
int main(void){
    for(int scale_index=0;scale_index<4;scale_index++){
        float scale=(float[]){.25f,1,4,1000}[scale_index];
        for(int i=0;i<8192;i++){
            float x=(i%128-64)*scale,y=(i/128-32)*scale,z=-(10+i%7)*scale;
            triangles[i]=(Triangle){v3(x,y,z),v3(x+scale,y,z),v3(x,y+scale,z)};
        }
        assert(web_ray_build(triangles,8192));
        for(int i=0;i<1200;i++){
            V3 o=v3((random01()-.5f)*scale,(random01()-.5f)*scale,scale);
            V3 d=v3((random01()-.5f)*12,(random01()-.5f)*6,-1);
            compare(8192,o,d,FLT_MAX);compare(8192,o,d,5*scale);
        }
        // Axis-parallel rays, triangle vertices/edges and zero directions.
        compare(8192,v3(0,0,0),v3(0,0,-1),FLT_MAX);
        compare(8192,v3(0,0,0),v3(0,0,0),FLT_MAX);
        compare(8192,v3(0,0,-10*scale),v3(1,0,0),FLT_MAX);
        for(int i=0;i<8192;i+=101)compare(8192,v3(triangles[i].a.x,triangles[i].a.y,0),v3(0,0,-1),FLT_MAX);
    }
    // Overlapping equal-distance triangles must keep the first original ID.
    for(int i=1;i<17;i++)triangles[i]=triangles[0];
    assert(web_ray_build(triangles,17));compare(17,v3(triangles[0].a.x,triangles[0].a.y,0),v3(0,0,-1),FLT_MAX);
    assert(!web_ray_build(triangles,0));compare(0,v3(0,0,0),v3(0,0,-1),FLT_MAX);
    compare(17,v3(triangles[0].a.x,triangles[0].a.y,0),v3(0,0,-1),FLT_MAX);
    assert(checks<total/4);
    printf("PASS exact nearest hits, ties, scales, boundary/parallel rays, empty/fallback; triangle tests %lu / %lu (%.2f%%)\n",checks,total,checks*100.0/total);
    return 0;
}
