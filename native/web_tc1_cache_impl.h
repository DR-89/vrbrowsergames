/* Included in the WebXR-generated quest_gl.c. Cache painter-ordered GPU batches
 * for one immutable arcade snapshot. Eye matrices remain live. Mutating a texture
 * already read by a retained batch rejects that recording, preserving the
 * original atlas-eviction / sprite-upload barriers without assuming immutability.
 * The next traversal can record a clean, warm snapshot instead. */
#include "web_tc1_cache.h"
#include "quest_scene.h"
#include <emscripten.h>
enum { WEB_BATCH_LIMIT=128,WEB_CACHE_BYTES=16*1024*1024 };
typedef struct {GLuint buffer;Command *commands;size_t count,capacity;} WebBatch;
static WebBatch web_batches[WEB_BATCH_LIMIT];
static size_t web_batch_count,web_cache_bytes;
static bool web_recording,web_cache_valid,web_cache_safe;
static int web_cache_enabled=1;
static unsigned web_record_count,web_replay_count,web_reject_count;
typedef struct {int frame,w,h,flat,filter;float scale,distance,camera[4];} WebCacheKey;
static WebCacheKey web_cache_key;
typedef struct {
    GLuint bindings[2];int active,texture_on[2],alpha_on,alpha_replace,blend_on;
    GLenum blend_src,blend_dst;GLboolean color_mask[4];
    float rgb_scale,alpha_ref,fog_color[3],color[4],uv[4];
} WebLegacyState;
static WebLegacyState web_end_state;
#define WEB_STATE_FIELDS(F) F(bindings) F(active) F(texture_on) F(alpha_on) F(alpha_replace) F(blend_on) F(blend_src) F(blend_dst) F(color_mask) F(rgb_scale) F(alpha_ref) F(fog_color) F(color) F(uv)
static void web_state_save(void){
#define COPY_OUT(field) memcpy(&web_end_state.field,&field,sizeof field);
 WEB_STATE_FIELDS(COPY_OUT)
#undef COPY_OUT
}
static void web_state_restore(void){
#define COPY_IN(field) memcpy(&field,&web_end_state.field,sizeof field);
 WEB_STATE_FIELDS(COPY_IN)
#undef COPY_IN
}
static int atlas_layer(GLuint);
static void web_cache_texture_write(GLuint texture){
    if(!web_recording){web_cache_valid=false;return;}
    /* Uploading a new sprite/text texture after polygons is safe. Reject only
     * writes to textures already read by a retained batch. Atlas commands can
     * span layers, so any later atlas write remains a conservative barrier. */
    const bool atlas=atlas_layer(texture)>=0;
    for(size_t i=0;i<web_batch_count;i++)for(size_t j=0;j<web_batches[i].count;j++){
        const QDrawState *s=&web_batches[i].commands[j].state;
        if((atlas&&s->textured==2)||(s->textured==1&&s->texture==texture)){web_cache_safe=false;return;}
    }
}
static GLuint web_cache_buffer(void){
    if(!web_recording||!web_cache_safe)return vbo;
    size_t bytes=stream_count*sizeof(Vertex)+command_count*sizeof(Command);
    if(web_batch_count==WEB_BATCH_LIMIT||bytes>WEB_CACHE_BYTES-web_cache_bytes){web_cache_safe=false;return vbo;}
    WebBatch *batch=&web_batches[web_batch_count];
    if(command_count!=batch->capacity){
        void *p=realloc(batch->commands,command_count*sizeof(Command));
        if(!p){web_cache_safe=false;return vbo;}
        batch->commands=p;batch->capacity=command_count;
    }
    if(!batch->buffer)glGenBuffers(1,&batch->buffer);
    if(!batch->buffer){web_cache_safe=false;return vbo;}
    memcpy(batch->commands,commands,command_count*sizeof(Command));batch->count=command_count;
    web_batch_count++;web_cache_bytes+=bytes;return batch->buffer;
}
static void web_submit_batch(const Command *,size_t,GLuint);
bool web_tc1_cache_begin(int frame,int w,int h,const uint8_t gamma[3][256],const uint8_t bg[3]){
    WebCacheKey key={0};key.frame=frame;key.w=w;key.h=h;key.flat=qvr_flat_view;
    key.filter=texture_filtering;key.scale=qvr_world_scale;key.distance=qvr_view_distance;
    memcpy(key.camera,flat_camera,sizeof flat_camera);
    if(web_cache_enabled&&web_cache_valid&&!memcmp(&key,&web_cache_key,sizeof key)){
        web_state_restore();
        qgl_scene_begin(gamma,w,h);
        glViewport(0,0,w,h);glDisable(GL_DEPTH_TEST);glDisable(GL_CULL_FACE);glDisable(GL_SCISSOR_TEST);
        glColorMask(1,1,1,1);glClearColor(bg[0]/255.f,bg[1]/255.f,bg[2]/255.f,1);glClear(GL_COLOR_BUFFER_BIT);
        for(size_t i=0;i<web_batch_count;i++)web_submit_batch(web_batches[i].commands,web_batches[i].count,web_batches[i].buffer);
        if(gamma)eng_post_lut(gamma,w,h);
        web_replay_count++;return true;
    }
    web_cache_valid=false;web_batch_count=web_cache_bytes=0;web_cache_key=key;
    web_recording=web_cache_enabled!=0;web_cache_safe=true;
    if(web_recording)web_record_count++;
    return false;
}
void web_tc1_cache_finish(void){
    qgl_flush();
    if(web_recording){
        web_state_save();web_cache_valid=web_cache_safe;if(!web_cache_safe)web_reject_count++;
        /* Keep the retained allocation bounded across changing scenes, too. */
        for(size_t i=web_batch_count;i<WEB_BATCH_LIMIT;i++)if(web_batches[i].buffer||web_batches[i].commands){
            glDeleteBuffers(1,&web_batches[i].buffer);free(web_batches[i].commands);memset(&web_batches[i],0,sizeof web_batches[i]);
        }
    }
    web_recording=false;
}
static void web_cache_shutdown(void){
    for(int i=0;i<WEB_BATCH_LIMIT;i++){glDeleteBuffers(1,&web_batches[i].buffer);free(web_batches[i].commands);}
    memset(web_batches,0,sizeof web_batches);web_batch_count=web_cache_bytes=0;web_cache_valid=web_recording=false;
}
EMSCRIPTEN_KEEPALIVE void web_tc1_cache_enable(int enabled){web_cache_enabled=enabled!=0;web_cache_valid=false;}
EMSCRIPTEN_KEEPALIVE unsigned *web_tc1_cache_status(void){
    static unsigned out[5];out[0]=web_record_count;out[1]=web_replay_count;out[2]=web_reject_count;out[3]=(unsigned)web_batch_count;out[4]=(unsigned)web_cache_bytes;return out;
}
