#include <stddef.h>
#include <stdio.h>
#include "web_impacts.h"
#include "quest_gpu.h"
static GLuint program,vao,vbo;
static GLint view_location,projection_location,fade_location;
static bool failed;
static GLuint shader(GLenum type,const char *source){
    GLuint s=glCreateShader(type);qgpu_shader_source(s,source);glCompileShader(s);
    GLint ok;glGetShaderiv(s,GL_COMPILE_STATUS,&ok);
    if(!ok){char log[1024];glGetShaderInfoLog(s,sizeof log,NULL,log);fprintf(stderr,"[IMPACTS] %s\n",log);glDeleteShader(s);return 0;}return s;
}
static bool init(void){
    const char *vs="#version 300 es\nprecision highp float;layout(location=0) in vec4 position;layout(location=1) in vec2 uv;layout(location=2) in vec2 info;uniform mat4 impact_view,impact_projection;out vec2 coord;flat out vec2 effect;void main(){gl_Position=impact_projection*impact_view*position;coord=uv;effect=info;}";
    const char *fs="#version 300 es\nprecision highp float;precision highp int;in vec2 coord;flat in vec2 effect;uniform highp sampler2D impact_nearest,impact_depth;uniform float impact_fade;out vec4 frag;void main(){"
      "ivec2 px=ivec2(gl_FragCoord.xy);vec4 n=texelFetch(impact_nearest,px,0);"
      "int object=int(n.r*255.0+0.5)|(int(n.g*255.0+0.5)<<8);"
      "if(n.a<0.5||object!=int(effect.y))discard;"
      "float nearest=exp2((texelFetch(impact_depth,px,0).r-0.5)*256.0);"
      "if(gl_FragCoord.w<nearest*0.998)discard;"
      "float r=length(coord),age=effect.x,fade=1.0-smoothstep(0.9,1.5,age);"
      "float edge=0.38+0.035*sin(atan(coord.y,coord.x)*7.0);"
      "float hole=1.0-smoothstep(edge-0.08,edge,r);"
      "float rim=smoothstep(edge-0.10,edge,r)*(1.0-smoothstep(edge,edge+0.13,r));"
      "float flash=max(0.0,1.0-age/0.12);"
      "float star=(1.0-smoothstep(0.015,0.07,min(abs(coord.x),abs(coord.y))))*(1.0-smoothstep(0.2,1.0,r));"
      "float glow=flash*max(star,1.0-smoothstep(0.0,0.7,r));"
      "float a=max((hole*0.90+rim*0.65)*fade,glow)*impact_fade;if(a<0.01)discard;"
      "vec3 col=mix(vec3(0.025),vec3(0.6,0.54,0.44),rim);"
      "col=mix(col,vec3(1.0,0.72,0.25),min(1.0,glow*1.7));frag=vec4(col,a);}";
    GLuint v=shader(GL_VERTEX_SHADER,vs),f=shader(GL_FRAGMENT_SHADER,fs);
    if(!v||!f){if(v)glDeleteShader(v);if(f)glDeleteShader(f);return false;}
    program=glCreateProgram();glAttachShader(program,v);glAttachShader(program,f);glLinkProgram(program);glDeleteShader(v);glDeleteShader(f);
    GLint ok;glGetProgramiv(program,GL_LINK_STATUS,&ok);if(!ok){glDeleteProgram(program);program=0;return false;}
    glUseProgram(program);view_location=glGetUniformLocation(program,"impact_view");projection_location=glGetUniformLocation(program,"impact_projection");
    fade_location=glGetUniformLocation(program,"impact_fade");
    glUniform1i(glGetUniformLocation(program,"impact_nearest"),0);glUniform1i(glGetUniformLocation(program,"impact_depth"),1);
    glGenVertexArrays(1,&vao);glGenBuffers(1,&vbo);glBindVertexArray(vao);glBindBuffer(GL_ARRAY_BUFFER,vbo);
    const int sizes[3]={4,2,2};const size_t offsets[3]={offsetof(WebImpactVertex,position),offsetof(WebImpactVertex,uv),offsetof(WebImpactVertex,age)};
    for(int i=0;i<3;i++){glEnableVertexAttribArray(i);glVertexAttribPointer(i,sizes[i],GL_FLOAT,GL_FALSE,sizeof(WebImpactVertex),(void*)offsets[i]);}
    return true;
}
void web_impacts_draw(const float *view,const float *projection,double now,unsigned nearest,unsigned depth,bool available,float fade){
    if(!available||failed||fade<=0)return;
    WebImpactVertex vertices[WEB_IMPACT_LIMIT*6];int count=web_impacts_vertices(vertices,now);if(!count)return;
    if(!program&&!init()){failed=true;fprintf(stderr,"[IMPACTS] shader unavailable\n");return;}
    glUseProgram(program);glUniformMatrix4fv(view_location,1,GL_FALSE,view);glUniformMatrix4fv(projection_location,1,GL_FALSE,projection);
    glUniform1f(fade_location,fade);
    glBindVertexArray(vao);glBindBuffer(GL_ARRAY_BUFFER,vbo);glBufferData(GL_ARRAY_BUFFER,count*sizeof *vertices,vertices,GL_STREAM_DRAW);
    glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,nearest);glActiveTexture(GL_TEXTURE1);glBindTexture(GL_TEXTURE_2D,depth);
    glDisable(GL_DEPTH_TEST);glDisable(GL_CULL_FACE);glEnable(GL_BLEND);glBlendEquation(GL_FUNC_ADD);glBlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
    glDrawArrays(GL_TRIANGLES,0,count);glDisable(GL_BLEND);glActiveTexture(GL_TEXTURE0);
}
