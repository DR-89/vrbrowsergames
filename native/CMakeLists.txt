cmake_minimum_required(VERSION 3.22)
project(arcade_webxr C CXX)
set(CMAKE_C_STANDARD 11)
if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Use the Emscripten toolchain")
endif()
if(NOT NATIVE_REPO OR NOT GAME MATCHES "^(tc1|tc2|cz)$")
  message(FATAL_ERROR "Set NATIVE_REPO and GAME=tc1, tc2, or cz")
endif()
file(TO_CMAKE_PATH "${NATIVE_REPO}" ROOT)
set(UP "${ROOT}/upstream")
set(HERE "${CMAKE_CURRENT_SOURCE_DIR}")
if(GAME STREQUAL "tc1")
  include("${UP}/engine/engine.cmake")
  list(REMOVE_ITEM NAMCO22_ENGINE_GL_SRC "${UP}/engine/render_target.c" "${UP}/engine/post_gl.c")
  list(REMOVE_ITEM NAMCO22_ENGINE_SND_SRC "${UP}/engine/audio_out.c")
  file(GLOB LIFTED "${UP}/timecris/gen/tc_lifted_*.c")
  set_source_files_properties("${UP}/timecris/src/tc_game.c" PROPERTIES COMPILE_DEFINITIONS "main=tc_game_main;SDL_MAIN_HANDLED")
  set(SRC "${UP}/timecris/src/tc_game.c" ${LIFTED} "${ROOT}/build/tc_crate.c"
    "${UP}/timecris/gen/tc_c25.c" "${UP}/timecris/gen/tc_snd_driver.c"
    ${NAMCO22_ENGINE_LIFT_SRC} ${NAMCO22_ENGINE_C25_SRC} ${NAMCO22_ENGINE_SND_SRC}
    ${NAMCO22_ENGINE_GL_SRC} ${NAMCO22_ENGINE_SS22_SRC} ${NAMCO22_ENGINE_ROMZIP_SRC}
    "${UP}/engine/ss22_board.c" "${UP}/engine/ss22_dsp.c" "${UP}/engine/ss22_snd.c"
    "${CMAKE_BINARY_DIR}/ss22_video.c" "${UP}/engine/ss22_env.c" "${CMAKE_BINARY_DIR}/ss22_run.c"
    "${ROOT}/quest/quest_scene.c" "${ROOT}/quest/quest_gl.c" "${ROOT}/quest/quest_gun.c")
  list(REMOVE_ITEM SRC "${ROOT}/quest/quest_gl.c" "${UP}/engine/ss22_gl.c")
  list(APPEND SRC "${CMAKE_BINARY_DIR}/quest_gl_web.c" "${CMAKE_BINARY_DIR}/ss22_gl_web.c")
  set(EXTRA_INCLUDE "${UP}/timecris/gen" "${UP}/include")
  add_compile_definitions(WEB_TC1)
else()
  if(GAME STREQUAL "tc2")
    include("${CMAKE_BINARY_DIR}/tc2_sources_web.cmake")
  else()
    include("${ROOT}/quest/tc2_sources.cmake")
  endif()
  set(SRC ${TC2_SOURCES})
  list(REMOVE_ITEM SRC "${ROOT}/quest/quest_host.c" "${ROOT}/quest/tc2_window.c"
    "${ROOT}/quest/quest_ui.c" "${ROOT}/quest/quest_options.c" "${ROOT}/quest/quest_cover.c"
    "${TC}/src/tc2_audio.c")
  list(REMOVE_ITEM SRC "${ROOT}/quest/tc2_gl.c")
  list(APPEND SRC "${CMAKE_BINARY_DIR}/tc2_gl_web.c")
  list(REMOVE_ITEM SRC "${ROOT}/quest/tc2_scene.c")
  list(APPEND SRC "${CMAKE_BINARY_DIR}/tc2_scene_web.c")
  if(GAME STREQUAL "tc2")
    add_compile_definitions(WEB_TC2)
    list(REMOVE_ITEM SRC "${CMAKE_BINARY_DIR}/tc2_audio_voice.c" "${TC}/src/eng/net_host.c"
      "${ROOT}/quest/tc2_online.c" "${ROOT}/quest/tc2_voice.c" "${ROOT}/quest/quest_menu.c")
    list(APPEND SRC web_net.c web_online.c web_impacts.c web_impacts_gl.c "${CMAKE_BINARY_DIR}/tc2_online_web.c"
      "${CMAKE_BINARY_DIR}/tc2_voice_web.c" "${CMAKE_BINARY_DIR}/quest_menu_web.c")
    set_source_files_properties("${CMAKE_BINARY_DIR}/net_rooms.c" "${ROOT}/quest/tc2_rooms.c"
      PROPERTIES COMPILE_OPTIONS "-include;${HERE}/web_net_sock.h")
  endif()
  set(EXTRA_INCLUDE "${TC}/gen" "${TC}/include" "${TC}/src" "${TC}/src/eng")
  if(GAME STREQUAL "cz")
    add_compile_definitions(WEB_CZ)
    list(REMOVE_ITEM SRC "${TC}/src/eng/c352.c")
    list(APPEND SRC "${CMAKE_BINARY_DIR}/c352_web.c")
  endif()
endif()
if(NOT GAME STREQUAL "tc2")
  list(APPEND SRC web_menu.c "${CMAKE_BINARY_DIR}/quest_menu_web.c" "${CMAKE_BINARY_DIR}/quest_canvas.c")
endif()
add_executable(arcade web_host.c "${CMAKE_BINARY_DIR}/quest_ui_web.c" "${ROOT}/quest/quest_options.c" ${SRC})
target_include_directories(arcade PRIVATE . "${CMAKE_BINARY_DIR}" "${ROOT}/quest" "${ROOT}/quest/include" ${EXTRA_INCLUDE})
target_compile_definitions(arcade PRIVATE TCVR WEBXR SDL_MAIN_HANDLED)
if(GAME STREQUAL "tc2")
  target_include_directories(arcade PRIVATE "${OPUS_SRC}/include")
  target_link_libraries(arcade PRIVATE opus tc2_rnnoise tc2_speexdsp)
endif()
set_source_files_properties("${ROOT}/quest/quest_gl.c" "${ROOT}/quest/quest_gun.c" "${CMAKE_BINARY_DIR}/quest_ui_web.c" PROPERTIES COMPILE_OPTIONS "-include;stddef.h")
if(NOT GAME STREQUAL "tc1")
  set_source_files_properties("${CMAKE_BINARY_DIR}/tc2_gl_web.c" PROPERTIES COMPILE_OPTIONS "-include;stddef.h")
endif()
target_compile_options(arcade PRIVATE -O2 -pthread -sUSE_SDL=2 -sUSE_ZLIB=1 -fno-strict-aliasing -fwrapv -Wno-unused-function -Wno-unused-variable -Wno-misleading-indentation)
target_link_options(arcade PRIVATE -O2 -pthread -sUSE_SDL=2 -sUSE_ZLIB=1 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2
  -sMODULARIZE=1 -sEXPORT_NAME=createArcade -sENVIRONMENT=web,worker -sPTHREAD_POOL_SIZE=3
  -sINITIAL_MEMORY=536870912 -sMAXIMUM_MEMORY=1073741824 -sALLOW_MEMORY_GROWTH=1
  -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=16777216 -sALLOW_BLOCKING_ON_MAIN_THREAD=0
  -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 -sASSERTIONS=1
  "-sEXPORTED_RUNTIME_METHODS=['FS','IDBFS','GL','HEAPF32','HEAPU8','HEAP32','PThread','ENV']"
  -lidbfs.js)
set_target_properties(arcade PROPERTIES SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}")
