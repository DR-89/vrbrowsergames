"""Fail-closed adaptations of the pinned System 23 GPU renderer for WebGL.

Keep painter order, exact-depth rejection and palette-aware filtering intact.
Each pass compiles only the fragment work it needs; scene data stays shared.
"""

def optimize_renderer(source):
    def replace(old,new):
        nonlocal source
        assert source.count(old)==1,(old,source.count(old))
        source=source.replace(old,new)

    replace('static GLuint prog_poly, prog_text,', 'static GLuint prog_poly[3], prog_text,')
    replace('static GLint up[20], ut[16];','static GLint up[3][20], ut[16];')
    replace('static int vertex_count;', 'static int vertex_count, uploaded_flat=-1;')
    replace('if(new_frame||uploaded_world_scale!=qvr_world_scale||uploaded_view_distance!=qvr_view_distance){',
            'if(new_frame||uploaded_flat!=qvr_flat_view||uploaded_world_scale!=qvr_world_scale||uploaded_view_distance!=qvr_view_distance){')
    replace('uploaded=b;uploaded_world_scale=', 'uploaded=b;uploaded_flat=qvr_flat_view;uploaded_world_scale=')

    replace('"  if (u_near != 0) {\\n"','"#if WEB_POLY_PASS == 1\\n"')
    replace('    "  }\\n"\n    "  if (u_depth != 0) {\\n"','    "#else\\n"\n    "  if (u_depth != 0) {\\n"')
    replace('"  if (u_prio != 0) {\\n"','"#if WEB_POLY_PASS == 2\\n"')
    replace('    "  }\\n"\n    "  int cmode=', '    "#else\\n"\n    "  int cmode=')
    replace('    "  frag = vec4(vec3(col) / 255.0, c.a);\\n"\n    "}\\n";',
            '    "  frag = vec4(vec3(col) / 255.0, c.a);\\n"\n    "#endif\\n#endif\\n"\n    "}\\n";')
    replace('static GLuint texture(GLint ifmt,', '''static GLuint polygon_program(int pass) {
    const char *body=strchr(fs_poly,'\\n');
    size_t size=strlen(fs_poly)+80;char *source=malloc(size);if(!source)return 0;
    snprintf(source,size,"%.*s\\n#define WEB_POLY_PASS %d\\n%s",(int)(body-fs_poly),fs_poly,pass,body+1);
    GLuint result=program(vs_poly,source);free(source);return result;
}
static GLuint texture(GLint ifmt,''')
    replace('if (!(prog_poly = program(vs_poly, fs_poly)) || !(prog_text = program(vs_text, fs_text)) || !(prog_gamma = program(vs_screen, fs_gamma))) return 0;',
            'for(int pass=0;pass<3;pass++)if(!(prog_poly[pass]=polygon_program(pass)))return 0;\n    if (!(prog_text = program(vs_text, fs_text)) || !(prog_gamma = program(vs_screen, fs_gamma))) return 0;')
    replace('for (int i = 0; i < 20; i++) up[i] = glGetUniformLocation(prog_poly, pn[i]);',
            'for(int pass=0;pass<3;pass++)for(int i=0;i<20;i++)up[pass][i]=glGetUniformLocation(prog_poly[pass],pn[i]);')

    start=source.index('static void camera_uniforms(GLuint p){')
    end=source.index('static void draw_quad(void)',start)
    source=source[:start]+'''static void camera_uniforms(GLuint p){
    static struct {GLuint program;GLint view,projection,flat,camera;} cache[4];
    int slot=0;while(slot<3&&cache[slot].program&&cache[slot].program!=p)slot++;
    if(cache[slot].program!=p){
        cache[slot].program=p;cache[slot].view=glGetUniformLocation(p,"u_view");
        cache[slot].projection=glGetUniformLocation(p,"u_proj");
        cache[slot].flat=glGetUniformLocation(p,"u_flat");cache[slot].camera=glGetUniformLocation(p,"u_cam");
    }
    glUniformMatrix4fv(cache[slot].view,1,GL_FALSE,vr_view);
    glUniformMatrix4fv(cache[slot].projection,1,GL_FALSE,vr_projection);
    glUniform1i(cache[slot].flat,qvr_flat_view);
    float cx,cy,f;qvr_flat_camera(&cx,&cy,&f);glUniform3f(cache[slot].camera,cx,cy,f);
}
'''+source[end:]

    start=source.index('        glUseProgram(prog_poly);camera_uniforms(prog_poly);')
    end=source.index('        if (depth) {',start)
    setup=source[start:end].replace('        ','    ')
    setup=setup.replace('glUseProgram(prog_poly);camera_uniforms(prog_poly);',
                        'GLint *up=::UNIFORMS::;glUseProgram(prog_poly[pass]);camera_uniforms(prog_poly[pass]);')
    setup=setup.replace('    const int depth = tc2_depth_on() && fbo_near;\n','')
    setup=setup.replace('glUniform1i(up[17], 0);','glUniform1i(up[17], depth);')
    # Use a different local name: the program-specific uniform array is global.
    setup=setup.replace('GLint *up=::UNIFORMS::;','GLint *u=up[pass];').replace('up[','u[').replace('GLint *u=u[pass];','GLint *u=up[pass];')
    helper='static void polygon_pass(int pass,const tc2_fx *f,int depth){\n'+setup+'}\n\n'
    source=source[:start]+'        const int depth = tc2_depth_on() && fbo_near;\n'+source[end:]
    source=source.replace('unsigned tc2_gl_draw(const tc2_built *b)\n{',helper+'unsigned tc2_gl_draw(const tc2_built *b)\n{')
    replace('            glUniform1i(up[6], 0); glUniform1i(up[16], 1);','            polygon_pass(1,f,0);')
    replace('            glUniform1i(up[16], 0); glUniform1i(up[17], 1);','')
    replace('        glUniform1i(up[6], 0);','        polygon_pass(0,f,depth);')
    replace('            glUniform1i(up[6], 1);','            polygon_pass(2,f,depth);')
    # Preserve cleanup if provided by a future pinned renderer.
    source=source.replace('glDeleteProgram(prog_poly);','for(int pass=0;pass<3;pass++)glDeleteProgram(prog_poly[pass]);')

    # Four bilinear neighbours normally share a 16x16 tile-map entry. Resolve
    # that entry once, while keeping per-neighbour flips, packed pens, palette
    # alpha and premultiplied interpolation exactly as in the original shader.
    replace('"vec4 texel(ivec2 uv, uint base, uint mask, uint shift, int fl) {\\n"',
            '"vec4 texel_mapped(ivec2 uv, uint base, uint mask, uint shift, int fl, vec4 m) {\\n"')
    replace('    "  uint id=((tx>>4u)&0xFFu)|((ty<<4u)&0x1FFF00u);\\n"\n    "  vec4 m=texelFetch(t_map,ivec2(int(id&2047u),int(id>>11u)),0);\\n"','')
    replace('    "void main() {\\n"\n    "  ivec2 px = ivec2(v_screen);\\n"\n    /* Screen overlays', '''    "vec4 map_at(ivec2 uv){uint tx=uint(uv.x),ty=uint(uv.y)+uint(v_par.z);uint id=((tx>>4u)&0xFFu)|((ty<<4u)&0x1FFF00u);return texelFetch(t_map,ivec2(int(id&2047u),int(id>>11u)),0);}\\n"
    "vec4 texel(ivec2 uv,uint base,uint mask,uint shift,int fl){return texel_mapped(uv,base,mask,shift,fl,map_at(uv));}\\n"
    "void main() {\\n"
    "  ivec2 px = ivec2(v_screen);\\n"
    /* Screen overlays''')
    old='''    "    c=mix(mix(texel(p,pbase,pmask,pshift,fl),texel(p+ivec2(1,0),pbase,pmask,pshift,fl),f.x),\\n"
    "          mix(texel(p+ivec2(0,1),pbase,pmask,pshift,fl),texel(p+ivec2(1,1),pbase,pmask,pshift,fl),f.x),f.y);\\n"'''
    new='''    "    if((p.x&15)!=15&&((p.y+int(v_par.z))&15)!=15){vec4 m=map_at(p);\\n"
    "      c=mix(mix(texel_mapped(p,pbase,pmask,pshift,fl,m),texel_mapped(p+ivec2(1,0),pbase,pmask,pshift,fl,m),f.x),\\n"
    "            mix(texel_mapped(p+ivec2(0,1),pbase,pmask,pshift,fl,m),texel_mapped(p+ivec2(1,1),pbase,pmask,pshift,fl,m),f.x),f.y);\\n"
    "    }else{\\n"
'''+old+'\n    "    }\\n"'
    replace(old,new)
    # Mobile GPUs keep a render target in tile memory. The native ordering
    # repeatedly left and resumed the colour/priority targets, forcing full
    # resolution stores and reloads for each eye. Neither the nearest-surface
    # pass nor the priority mask depends on colour: finish each target once.
    start=source.index('    /* 1. the background */')
    end=source.index('    /* 5. the text the polygons let through again */',start)
    old=source[start:end]
    attrs_start=old.index('        glBindBuffer(GL_ARRAY_BUFFER, vbo);')
    attrs_end=old.index('        const int depth =',attrs_start)
    attrs=old[attrs_start:attrs_end]
    helper='static void polygon_vertices(void){\n'+attrs+'}\n'
    source=source[:start]+'''    const int nv=vertex_count;
    const int depth=nv>0 && tc2_depth_on() && fbo_near;
    bind_tex(4,0);bind_tex(5,0);
    /* Finish the nearest-surface attachment before any consumers. */
    if(depth){
        glBindFramebuffer(GL_FRAMEBUFFER,fbo_near);
        glClearColor(0,0,0,0);glClearDepthf(0);glDepthMask(GL_TRUE);
        glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
        glDisable(GL_BLEND);glEnable(GL_DEPTH_TEST);glDepthFunc(GL_GREATER);
        polygon_vertices();polygon_pass(1,f,0);glDrawArrays(GL_TRIANGLES,0,nv);
        for(int a=A_POS;a<=A_EXT;a++)glDisableVertexAttribArray((GLuint)a);
        glDisable(GL_DEPTH_TEST);glDepthFunc(GL_LESS);glClearDepthf(1);
        bind_tex(4,t_near);bind_tex(5,t_nearz);
    }
    /* Build the entire text priority mask in one render-target visit. */
    if(f->layers&4){
        glBindFramebuffer(GL_FRAMEBUFFER,fbo_prio);
        glClearColor(0,0,0,0);glClear(GL_COLOR_BUFFER_BIT);
        glEnable(GL_BLEND);glBlendEquation(GL_FUNC_ADD);glBlendFunc(GL_ONE,GL_ZERO);
        text_pass(b,0);
        if(nv>0){
            polygon_vertices();polygon_pass(2,f,depth);
            glBlendEquationSeparate(GL_MAX,GL_FUNC_ADD);glBlendFuncSeparate(GL_ONE,GL_ONE,GL_ONE,GL_ZERO);
            glDrawArrays(GL_TRIANGLES,0,nv);
            for(int a=A_POS;a<=A_EXT;a++)glDisableVertexAttribArray((GLuint)a);
        }
    }
    /* Background, underlay, painter-ordered polygons and foreground now stay
     * on the colour attachment until the final gamma resolve. */
    glBindFramebuffer(GL_FRAMEBUFFER,fbo_col);
    glClearColor((f->bg>>16&255)/255.f,(f->bg>>8&255)/255.f,(f->bg&255)/255.f,1);
    glClear(GL_COLOR_BUFFER_BIT);
    glEnable(GL_BLEND);glBlendEquation(GL_FUNC_ADD);glBlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
    if(f->layers&4)text_pass(b,1);
    if(nv>0){
        polygon_vertices();polygon_pass(0,f,depth);glDrawArrays(GL_TRIANGLES,0,nv);
        for(int a=A_POS;a<=A_EXT;a++)glDisableVertexAttribArray((GLuint)a);
    }
    bind_tex(4,0);bind_tex(5,0);glActiveTexture(GL_TEXTURE0);
'''+source[end:]
    source=source.replace('unsigned tc2_gl_draw(const tc2_built *b)\n{',helper+'\nunsigned tc2_gl_draw(const tc2_built *b)\n{')
    return source
