#pragma once
#include "tc2_scene.h"

#define WEB_IMPACT_LIMIT 16
extern double web_impacts_now;
typedef struct { float position[4], uv[2], age, entry; } WebImpactVertex;
/* Capture the submitted shot while its scene is parked; recoil confirms it. */
void web_impacts_capture(V3 origin,V3 end,bool tracked,bool valid,int bits,unsigned frame);
void web_impacts_confirm(unsigned frame,double now);
void web_impacts_update(const tc2_built *scene,double now);
void web_impacts_clear(void);
void web_impacts_status(int out[8]);
int web_impacts_vertices(WebImpactVertex *vertices,double now);
void web_impacts_draw(const float *view,const float *projection,double now,unsigned nearest,unsigned depth,bool available,float fade);
