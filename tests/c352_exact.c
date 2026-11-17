#include "c352.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <emscripten.h>
#include "web_audio_mix.h"
uint32_t rr_frame;
void original_init(c352_t*,const uint8_t*,uint32_t);
void original_write(c352_t*,uint32_t,uint16_t,uint16_t);
void original_generate(c352_t*,int16_t*,int);
extern int original_gain_music,original_gain_fx,original_gain_voice;
extern uint32_t original_music_mask,original_speech_mask;
extern unsigned original_speech_bank_lo,original_speech_bank_hi;
static uint8_t rom[262144];
static uint32_t rng=0x183765;
static uint32_t random32(void){rng=rng*1664525u+1013904223u;return rng;}
static void write_both(c352_t *a,c352_t *b,unsigned reg,uint16_t value,uint16_t mask){original_write(a,reg,value,mask);c352_write(b,reg,value,mask);}
static void setup(c352_t *a,c352_t *b,int voices){
    original_init(a,rom,sizeof rom);c352_init(b,rom,sizeof rom);
    for(int v=0;v<voices;v++){
        unsigned flags=C352_FLG_KEYON|C352_FLG_LOOP;
        if(v&1)flags|=C352_FLG_MULAW;if(v&2)flags|=C352_FLG_FILTER;
        if(v&4)flags|=C352_FLG_PHASEFL|C352_FLG_PHASEFR;
        if(v&8)flags|=C352_FLG_REVERSE|C352_FLG_PHASERL;
        if(v%7==0)flags|=C352_FLG_NOISE;
        const uint16_t regs[8]={(uint16_t)random32(),(uint16_t)random32(),(uint16_t)(300+random32()%65000),flags,(uint16_t)(v%4),64,220,80};
        for(int k=0;k<8;k++)write_both(a,b,v*8+k,regs[k],0xffff);
    }
    write_both(a,b,0x202,0,0xffff);
}
int main(void){
    float previous=0;
    for(int sample=0;sample<=65536;sample++){
        float l=(float)sample,r=-l*.5f;web_audio_stereo_limit(&l,&r);
        assert(l>=previous&&l<32768&&r>-32768);assert(r==-l*.5f);
        if(sample<=24576)assert(l==(float)sample);previous=l;
        float negative=-(float)sample,other=sample*.5f;web_audio_stereo_limit(&negative,&other);assert(negative==-l&&other==-r);
    }
    for(unsigned i=0;i<sizeof rom;i++)rom[i]=(uint8_t)random32();
    original_speech_bank_lo=g_c352_speech_bank_lo=2;original_speech_bank_hi=g_c352_speech_bank_hi=3;
    original_music_mask=g_c352_music_mask=0x0000ffff;original_speech_mask=g_c352_speech_mask=0x10008000;
    c352_t a,b;int16_t old[1024],next[1024];unsigned frames=0;
    const int counts[]={0,1,4,12,24,32},gains[][3]={{100,100,100},{0,100,65},{175,50,125},{0,0,0}};
    for(unsigned c=0;c<6;c++)for(unsigned g=0;g<4;g++){
        original_gain_music=g_c352_gain_music=gains[g][0];original_gain_fx=g_c352_gain_fx=gains[g][1];original_gain_voice=g_c352_gain_voice=gains[g][2];
        setup(&a,&b,counts[c]);
        for(int block=0;block<300;block++){
            if(block%31==0){unsigned reg=random32()%256;write_both(&a,&b,reg,(uint16_t)random32(),block&1?0xffff:0x00ff);write_both(&a,&b,0x202,0,0xffff);}
            int n=(int)(random32()%256)+1;original_generate(&a,old,n);c352_generate(&b,next,n);
            assert(!memcmp(old,next,n*4*sizeof(int16_t)));assert(!memcmp(&a,&b,sizeof a));frames+=(unsigned)n;
        }
    }
    original_gain_music=g_c352_gain_music=original_gain_fx=g_c352_gain_fx=original_gain_voice=g_c352_gain_voice=100;
    for(int voices=4;voices<=24;voices+=20){
        setup(&a,&b,voices);double t=emscripten_get_now();for(int i=0;i<2000;i++)original_generate(&a,old,256);double before=emscripten_get_now()-t;
        t=emscripten_get_now();for(int i=0;i<2000;i++)c352_generate(&b,next,256);double after=emscripten_get_now()-t;
        assert(!memcmp(&a,&b,sizeof a));printf("%d voices: original %.2f ms, optimized %.2f ms\n",voices,before,after);
    }
    printf("PASS: %u four-channel frames and complete chip state match; key-on/off, partial writes, silence, noise, filters, phase, reverse/loop and non-unity gains\n",frames);
}
