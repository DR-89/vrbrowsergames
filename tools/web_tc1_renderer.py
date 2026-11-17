"""Generate TC1's web-only retained draw batches from the pinned native source."""
def replace(text,old,new):
    assert text.count(old)==1,(old,text.count(old))
    return text.replace(old,new)


def prepare_renderer(repo,build,write):
    source='#include <stddef.h>\n'+(repo/'quest/quest_gl.c').read_text()
    source=replace(source,'static GLuint shader(GLenum type,const char *source) {',
        '#include "web_tc1_cache_impl.h"\nstatic GLuint shader(GLenum type,const char *source) {')
    start=source.index('void qgl_flush(void){')
    end=source.index('\nstatic void draw(',start)
    body=source[start:end]
    body=replace(body,'''void qgl_flush(void){
    if(!command_count)return;
    glUseProgram(program);glBindVertexArray(vao);glBindBuffer(GL_ARRAY_BUFFER,vbo);''','''static void web_submit_batch(const Command *commands,size_t command_count,GLuint buffer){
    glUseProgram(program);glBindVertexArray(vao);glBindBuffer(GL_ARRAY_BUFFER,buffer);''')
    body=replace(body,'    glBufferData(GL_ARRAY_BUFFER,(GLsizeiptr)stream_count*sizeof(Vertex),stream,GL_STREAM_DRAW);\n','')
    body=replace(body,'    command_count=stream_count=0;','')
    body+='''
void qgl_flush(void){
    if(!command_count)return;
    GLuint buffer=web_cache_buffer();
    glBindBuffer(GL_ARRAY_BUFFER,buffer);
    glBufferData(GL_ARRAY_BUFFER,(GLsizeiptr)stream_count*sizeof(Vertex),stream,GL_STREAM_DRAW);
    web_submit_batch(commands,command_count,buffer);
    command_count=stream_count=0;
}
'''
    source=source[:start]+body+source[end:]
    source=source.replace('qgl_flush();int layer=atlas_layer(bindings[active]);','qgl_flush();web_cache_texture_write(bindings[active]);int layer=atlas_layer(bindings[active]);')
    source=replace(source,'qgl_flush();glTexParameteri(target,name,value);','qgl_flush();web_cache_texture_write(bindings[active]);glTexParameteri(target,name,value);')
    source=replace(source,'qgl_flush();glDeleteTextures(n,p);','qgl_flush();for(int i=0;i<n;i++)web_cache_texture_write(p[i]);glDeleteTextures(n,p);')
    source=replace(source,'void qglClear(GLbitfield mask){qgl_flush();','void qglClear(GLbitfield mask){qgl_flush();if(web_recording&&web_batch_count)web_cache_safe=false;')
    source=replace(source,'void qgl_shutdown(void){','void qgl_shutdown(void){\n    web_cache_shutdown();')
    # The post shader uses gl_VertexID, not the scene's vertex attributes. A
    # retired cached VBO may have been their last binding in a blank scene.
    source=replace(source,'glUniform1i(post_lut,1);glBindVertexArray(vao);glDrawArrays(GL_TRIANGLES,0,3);',
        'glUniform1i(post_lut,1);glBindVertexArray(vao);for(int i=0;i<3;i++)glDisableVertexAttribArray(i);glDrawArrays(GL_TRIANGLES,0,3);for(int i=0;i<3;i++)glEnableVertexAttribArray(i);')
    write(build/'quest_gl_web.c',source)
    source=(repo/'upstream/engine/ss22_gl.c').read_text()
    source='#include "web_tc1_cache.h"\n'+source
    source=replace(source,'    g_tex_opaque = 1;', '''    if(web_tc1_cache_begin(frames,vw,vh,g_fog_valid&&g_fog.have_gamma?g_fog.gamma:NULL,g_fog.bg))return;
    g_tex_opaque = 1;''')
    source=replace(source,'    if (g_fog_valid && g_fog.have_gamma) eng_post_lut(g_fog.gamma, vw, vh);',
        '    if (g_fog_valid && g_fog.have_gamma) eng_post_lut(g_fog.gamma, vw, vh);\n    web_tc1_cache_finish();')
    write(build/'ss22_gl_web.c',source)
