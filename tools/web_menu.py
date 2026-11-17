"""Reuse the pinned TC2 menu's renderer/widgets for the two single-player ports.

Generate an offline variant, removing network UI rather than linking fake network
services into TC1/CZ. The native checkouts stay untouched. Marker checks fail if
the pinned source changes; the generated result has no online dependencies.
"""
import re


def replace(source, old, new):
    assert source.count(old) == 1, (old, source.count(old))
    return source.replace(old, new)


def span(source, start, end, replacement=''):
    assert source.count(start) == source.count(end) == 1, (start, end)
    a, b = source.index(start), source.index(end)
    assert b > a
    return source[:a] + replacement + source[b:]


def write(path, text):
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def prepare_menu(tc2, build, game):
    quest = tc2 / 'quest'
    ui = (quest / 'quest_ui.c').read_text()
    ui = replace(ui, 'const bool drew=qmenu_render(host,pixels,now,box);',
                 'extern bool web_menu_render(uint8_t *,int *);\n    const bool drew=web_menu_render(pixels,box);')
    write(build / 'quest_ui_web.c', ui)
    write(build / 'web_menu_ui.h', (quest / 'quest_ui.h').read_text())
    write(build / 'quest_ui.h', (quest / 'quest_ui.h').read_text())
    if game == 'tc2':
        return
    for name in ('quest_canvas.c', 'quest_canvas.h', 'ui_font_data.h'):
        write(build / name, (quest / name).read_text())
    header = (quest / 'quest_menu.h').read_text()
    header = replace(header, 'QOPT_SKIP_STARTUP,QOPT_COUNT', 'QOPT_SKIP_STARTUP,QOPT_REFRESH,QOPT_ADAPTIVE,QOPT_COUNT')
    header = replace(header, 'QMENU_TAB_AUDIO,QMENU_TAB_ONLINE,QMENU_TAB_COUNT', 'QMENU_TAB_AUDIO,QMENU_TAB_COUNT')
    write(build / 'quest_menu.h', header)
    s = (quest / 'quest_menu.c').read_text()
    s = replace(s, '#include "tc2_online.h"', '''enum { QOPTIONS_GAME_VOLUME_MIN=0,QOPTIONS_GAME_VOLUME_MAX=100,
QOPTIONS_GAME_VOLUME_STEP=5,QOPTIONS_GAME_VOLUME_DEFAULT=100 };
#ifdef WEB_TC1
enum { QOPTIONS_GUN_OFFSET_MIN=-200,QOPTIONS_GUN_OFFSET_MAX=200,QOPTIONS_GUN_OFFSET_STEP=5 };
#endif''')
    s = '\n'.join(line for line in s.split('\n') if not any(marker in line for marker in (
        '{QOPT_PLAYER,"Player"', '{QOPT_SKIP_STARTUP,', '{QOPT_VOICE_VOLUME,',
        'static tc2_online_', 'if(t==QMENU_TAB_ONLINE)', 'if(i==QMENU_TAB_ONLINE)',
        'game_count=(tab==QMENU_TAB_ONLINE', 'tc2_online_menu_shown(',
        'else if(tab==QMENU_TAB_ONLINE&&screen!=S_MAIN)', 'else online_tab();')))
    if game == 'tc1':
        s = replace(s, '"LASER shows where you point. TRACER flashes a streak on each shot. OFF is arcade-pure.",T_SEG,{"LASER","TRACER","OFF"},3,0,2,1,0',
                    '"LASER shows where you point. OFF hides the guide during play.",T_SEG,{"LASER","OFF"},2,0,1,1,0')
    s = replace(s, 'QOPTIONS_GUN_PITCH_MAX,1,0,', 'QOPTIONS_GUN_PITCH_MAX,1,-16,')
    s = replace(s, '"The game\'s music, guns and voices. Voice chat is not affected."', '"The game\'s music, weapons and voices."')
    s = replace(s, '    {QOPT_RESOLUTION,"Resolution","","Pixels per eye. Higher costs more GPU time. Default follows the headset. Applies after RESTART APP.",T_RES,{0},0,0,QRESOLUTION_COUNT-1,1,0,"",false},', '''    {QOPT_RESOLUTION,"Render size","Relative to the headset's WebXR resolution","100% uses the full WebXR eye size. Lower sizes reduce GPU work. Applies immediately.",T_SEG,{"65%","85%","100%"},3,0,2,1,2,"",false},
    {QOPT_REFRESH,"Display rate","Requested headset refresh rate","The browser chooses a supported rate. A higher request does not guarantee the game can sustain it.",T_SEG,{"72 HZ","90 HZ","120 HZ"},3,0,2,1,0,"",false},
    {QOPT_ADAPTIVE,"Auto resolution","Adjust size using measured GPU time","ON can lower resolution to keep head tracking smooth when GPU timing is available.",T_SEG,{"OFF","ON"},2,0,1,1,0,"",false},''')
    s = replace(s, 'static bool online_now(void){return V.state!=TC2V_OFFLINE;}', 'static bool online_now(void){return false;}')
    s = replace(s, 'TIME CRISIS II \\xC2\\xB7 VR', ('TIME CRISIS' if game == 'tc1' else 'CRISIS ZONE') + ' \\xC2\\xB7 WEBXR')
    s = span(s, '    /* the status, right-aligned */', '    if(!H->saved){', '    const float right=1090;\n')
    s = replace(s, '{"GUN","PLAYER","GRAPHICS","AUDIO","ONLINE"}', '{"GUN","PLAYER","GRAPHICS","AUDIO"}')
    s = span(s, '        /* a dot: something on that tab wants attention */', '        if(clicked(id)){tab=i;screen=S_MAIN;}')
    s = span(s, 'static void footer(void){', '/* ---- settings tabs ---- */', '''static void footer(void){
    rrect(3,FOOT_Y,QMENU_W-6,2,0,LINE);
    if(drawing())qc_text_fit(&cv,UI_M17,27,FOOT_Y+30,CW,help,MUTED,0);
    const char *labels[]={"RESUME","RECENTER","RESTART GAME"};
    const char *tips[]={"Back to the game. The menu button does the same.",
        "Stand upright to reset your position and calibrate ducking.",
        "Reloads the game. Current play ends; saved settings and cabinet data stay."};
    const int icons[]={I_PLAY,I_RECENTER,I_RESTART};
    const float y=FOOT_Y+46,h=QMENU_H-3-16-y,w=(CW-24)/3;
    for(int i=0;i<3;i++){
        float x=27+i*(w+12);int id=ID(K_FOOT,i);
        if(item(id,x,y,w,h,icons[i],labels[i],"",tips[i],i==0?1:0)){
            if(i==0)H->action(QACT_RESUME);
            else if(i==1)H->action(QACT_RECENTER);
            else{modal=M_APP;focus=ID(K_MBTN,1);}
        }
    }
    next_row();
}

''')
    s = replace(s, 'if(h<60){text_fit', 'if(h<60||!sub[0]){text_fit')
    s = replace(s, 'const bool locked=r->opt==QOPT_PLAYER&&online_now();', 'const bool locked=false;')
    s = replace(s, 'int v=locked?V.side-1:H->get(r->opt);', 'int v=H->get(r->opt);')
    s = span(s, '    if(r->opt==QOPT_RESOLUTION){', '    const float ly=y+(h-54)/2;')
    s = replace(s, 'const bool restart=!locked&&((r->opt==QOPT_PLAYER&&v!=H->boot_player)||(r->opt==QOPT_RESOLUTION&&v!=H->boot_resolution));', 'const bool restart=false;')
    s = span(s, '/* ---- the ONLINE tab ---- */', 'static void modal_frame(')
    s = span(s, '        else if(m==M_CODE)', '    }\n    focusable(ID(K_MBTN,1)')
    s = span(s, 'static void confirm(void){', 'static uint8_t base_px[', '''static void confirm(void){
    const float w=660,h=270;float x,y;modal_frame(w,h,&x,&y);
    text(UI_B32,x+32,y+56,"RESTART GAME?",ACCENT);
    para(UI_M20,x+32,y+100,w-64,28,"Reload the game and return to the cabinet start-up. Current play ends.",TEXT,2);
    para(UI_M17,x+32,y+170,w-64,24,"Saved settings and cabinet data are kept.",MUTED,2);
    modal_buttons(x,y+h-78,w,"RESTART");
}

''')
    s = replace(s, 'if(modal==M_RESTART||modal==M_RESTART_LEAVE||modal==M_APP)confirm();else keyboard();', 'confirm();')
    # Smooth hovering, but a click must select the actual current ray. Mouse
    # down/up can both arrive before the next update, including adjacent rows.
    s = replace(s, 'if(!have_pointer||fabsf(in->px-ptr_x)>80', 'if(in->press||!have_pointer||fabsf(in->px-ptr_x)>80')
    s = s.replace('H=host;tc2_online_get_view(&V);', 'H=host;').replace('    tc2_online_get_view(&V);\n', '').replace('tc2_online_browse(false);', '')
    s = span(s, '    tc2_online_view v=V;', '    const int point[3]=', '    uint32_t h=mix(2166136261u,&s,sizeof s);\n')
    s = replace(s, 'const uint32_t l=mix(2166136261u,live,sizeof live);', 'const uint32_t l=0;')
    s = replace(s, 'const bool live_due=tab==QMENU_TAB_ONLINE&&l!=drawn_live&&now-last_draw>=.15;', 'const bool live_due=false;')
    assert not re.search(r'tc2_online|\bV\.|\bgame_count\b|QMENU_TAB_ONLINE', s)
    write(build / 'quest_menu_web.c', s)
