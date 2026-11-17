#pragma once
#include <math.h>
/* Preserve quiet samples and bend stereo-sum peaks into headroom before s16
 * clipping. Linked gain preserves the stereo image during loud transients. */
static inline void web_audio_stereo_limit(float *left,float *right){
    const float peak=fmaxf(fabsf(*left),fabsf(*right));
    if(peak>24576.f){
        const float excess=peak-24576.f;
        const float ceiling=24576.f+8184.f*excess/(8184.f+excess);
        const float scale=ceiling/peak;*left*=scale;*right*=scale;
    }
}
