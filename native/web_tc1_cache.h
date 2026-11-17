#pragma once
#include <stdbool.h>
#include <stdint.h>
bool web_tc1_cache_begin(int frame,int w,int h,const uint8_t gamma[3][256],const uint8_t bg[3]);
void web_tc1_cache_finish(void);
