#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "quest_menu.h"
void web_online_prepare(double now,bool menu);
bool web_online_advance(void);
bool web_online_linked(void);
const QMenuHost *web_menu_host(void);
const char *web_online_toast(unsigned *serial);
void web_menu_open(int tab);
int web_option_get(int option);
void web_option_set(int option,int value);
void web_menu_action(int action);
bool web_core_parked(void);
