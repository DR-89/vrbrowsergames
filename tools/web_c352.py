"""Bit-exact web sound-chip fast paths; register/noise/voice state is preserved."""
def optimize_c352(source):
    def replace(old,new):
        nonlocal source
        assert source.count(old)==1,(old,source.count(old))
        source=source.replace(old,new)
    replace('void c352_generate(c352_t *c, int16_t *out, int n)\n{',
            'void c352_generate(c352_t *c, int16_t *out, int n)\n{\n    const int unity = g_c352_gain_music == 100 && g_c352_gain_fx == 100 && g_c352_gain_voice == 100;')
    replace('''            int32_t *dst = (v->speech || (g_c352_speech_mask >> j & 1)) ? outs : (g_c352_music_mask >> j & 1) ? outm : outv;''',
            '''            if (!(v->flags & C352_FLG_BUSY)) continue;
            int32_t *dst = unity ? outv : (v->speech || (g_c352_speech_mask >> j & 1)) ? outs : (g_c352_music_mask >> j & 1) ? outm : outv;''')
    replace('clamp_s16((outm[k] * g_c352_gain_music + outv[k] * g_c352_gain_fx + outs[k] * g_c352_gain_voice) / 100 >> 3)',
            'clamp_s16(unity ? outv[k] >> 3 : (outm[k] * g_c352_gain_music + outv[k] * g_c352_gain_fx + outs[k] * g_c352_gain_voice) / 100 >> 3)')
    return source
