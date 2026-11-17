#pragma once
#include "quest_menu.h"
const QMenuHost *web_menu_host(void);
void web_menu_open(int tab);
void web_menu_prepare(double now,bool menu);
void web_menu_changed(void);
int web_option_get(int option);
void web_option_set(int option,int value);
void web_menu_action(int action);
