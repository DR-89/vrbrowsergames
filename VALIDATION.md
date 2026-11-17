# Validation — updated 17 November 2026

This is a functional browser test build, not a certified headset release. Standalone Quest 3 measurements are recorded below; earlier sections also cover PC/Virtual Desktop. A full campaign playthrough and sustained thermal performance remain unverified.

## Public source checkout — 17 November

- The source export includes the current frontend, native adapters/patch generators, server/lobby, translations, tests and build tools. All 167 deployed website files were compared with the local working build and have matching SHA-256 hashes. ROMs, generated game binaries, build output, local hosting metadata, credentials, saves and recordings are excluded from GitHub; no earlier local Git history is exported.
- A fresh source checkout passes `npm ci --prefix server` and all **46 Node tests**. Its server serves the collection, audio module, language catalog and online API with the required COOP/COEP headers. Missing game assets correctly remain unavailable until separately prepared.
- Native source paths can be supplied through `ARCADE_TC1_NATIVE`, `ARCADE_TC2_NATIVE` and `ARCADE_CZ_NATIVE`. Default and explicit path resolution were checked, as were Python syntax and build CLI startup. All three pinned native commits are available in their public GitHub repositories. No new game binaries or headset performance measurements were produced for source publication.

## Crisis Zone shooting audio and scheduling — 14 November

- A deterministic real-ROM firefight, cabinet frames 3200–3800, captured 883,413 stereo frames at 88.2 kHz before and after the native change. The original mix reached the signed-16-bit rails on 37 of 1,766,826 channel samples; the linked peak limiter reduces that to **zero**, with peak magnitude 32768 → 29253. RMS is nearly unchanged (7062.41 → 7055.76). Only 5,526 channel samples change; every stereo pair whose peak is at or below 24576 remains identical. Reports and WAV files: `build/qa/cz-exact-before.*`, `cz-exact-after.*`.
- `tools/check-c352.py` compares the original and web-optimized C352 in WebAssembly: **924,664 four-channel sample frames and complete chip state match exactly**, including randomized register writes, gains/masks, looping, noise and filtering. The separate limiter checks cover all input magnitudes through 65536, symmetry, monotonicity, stereo ratios and unchanged quiet samples. Isolated chip timings show reduced work, not a proven whole-game FPS gain.
- Physical Quest 3 / Adreno 740, native **1680×1760 per eye**, adaptive resolution off, 72 Hz: the dense shooting segment runs at **52.11 game fps / 71.99 XR callbacks per second** in the released baseline. Limiting plus a 60 ms reserve measures 52.56 / 71.89; adding the message-task scheduler measures 52.01 / 71.89. These are short single runs, not thermally controlled averages. **No meaningful game-FPS improvement is established.** The longer buffer alone still produces 535 faded audio blocks out of 4,224 measured, so it is not treated as the completed sound fix.
- The final CZ worklet adds bounded pitch-preserving waveform-similarity overlap/add, with preallocated buffers and one shared stereo alignment. Replaying the actual captured firefight at 52 game fps through a real Chrome 157 OfflineAudioContext reduces faded blocks from **758 to zero** across 3,838 steady-state blocks, with zero silent blocks or invalid ring indices. Rendering 11.54 seconds of audio took 57.25 ms before and 67.88 ms after on this PC. These are offline processing costs, **not Quest real-time deadlines or headset listening results**. Report: `build/qa/cz-audio-device-pc.json`; the independent VM replay and output WAVs are under `cz-audio-replay.json` / `cz-output-*.wav`.
- All **46 Node tests pass**, including a 60 → 52 → 60 fps transition with distinct 440/660 Hz stereo tones (pitch within 3 Hz), anti-phase stereo, counter wrap, pause flushing, short/long starvation and bounded backlog recovery. Crisis Zone's final synthetic WebXR lifecycle/menu/resolution test passes with GL error 0 and no page errors. TC1/TC2 synthetic regressions pass with the shared scheduler/audio recovery changes. These synthetic sessions do not measure physical refresh performance.
- The message-task timer removes the browser's nested-timer minimum in a controlled PC fixture: a simulated 15 ms core goes from 75 to 90 ticks in 1.5 seconds. The physical CZ results above take precedence over that synthetic speedup. Native changes apply only to CZ; TC1/TC2 binaries, ROM/model manifests and online services remain unchanged.
- The Quest slept after the physical capture runs and no longer exposed the owned test tab. **The final overlap/add build still needs a subjective headset listening check and an immersive CPU/deadline measurement.** The final live runs before overlap/add have GL error 0; the pre-existing one-time XR startup framebuffer error is recorded separately. This release addresses measured clipping and repeated starvation, not the remaining heavy-scene simulation bottleneck or a guaranteed 72/120 fps target.

## TC1 retained geometry and independent clock — 14 November

- TC1 now uses the shared nonblocking arcade scheduler and atomic READY notification in immersive sessions. Aim is refreshed against the newly prepared scene before accepting input. The original ~59.906 Hz arcade rate, controller poses and render resolution are preserved. Native initialization finishes before VR becomes available.
- `tools/web_tc1_renderer.py` generates web-only changes from the pinned TC1 sources. Ordered vertex buffers and draw-state commands are reused per immutable prepared scene; eye/projection matrices, gun, assistance and menu remain live. The cache key covers flat/VR mode, dimensions, world scale, view distance, filtering and flat camera. Writes to previously sampled textures reject a recording; atlas changes remain conservative barriers. Allocation failure and the 128-batch / 16 MiB bounds fall back to the existing traversal. Unused buffers are released. The fullscreen gamma pass disables unused scene attributes so retiring a cached buffer cannot invalidate blank-scene draws.
- Real ROM regression: `node tools/tc1-cache-check.mjs final --compare=released` passes **56** exact RGBA comparisons (eight frames through actual credited play, seven eye/scale/filter/viewport cases each) against the previous released binary. Cold recordings and their repeated renders match an uncached traversal exactly; six texture-barrier rejections and 106 retained replays were exercised. The run reaches 14 accepted cabinet shots. No GL/core/page errors. Native TC1 scene regression and all 38 Node tests pass. Laser visibility/tracking loss, menu persistence, overlapping foreground weapon and TC1/TC2 synthetic WebXR lifecycle checks pass.
- PC RTX 3050 Laptop / ANGLE, frozen frame 1400: stereo CPU time at 2400×2640 fell **0.976 → 0.198 ms**; measured GPU time **1.287 → 1.123 ms**. At 1440×1600: CPU 0.990 → 0.197 ms, GPU 0.994 → 0.900 ms. At 960×1080: CPU 1.033 → 0.196 ms, GPU 0.758 → 0.672 ms. Complete right-eye hashes match the released binary at all three sizes. These isolated draws exclude simulation and XR submission. Reports: `tc1-perf-fps-before.json`, `tc1-perf-fps-final.json` under `build/qa/`.

Physical Quest 3 / Adreno 740 / standalone Quest Browser, native **1680×1760 per eye**, adaptive resolution off, eight-second attract-scene samples near arcade frames 900–1380:

| Selected/display refresh | Released VR callbacks/s | New VR callbacks/s | Released game fps | New game fps |
|---|---:|---:|---:|---:|
| 72 Hz | 69.05 | 69.09 | 57.11 | 57.69 |
| 120 Hz | 106.55 | 111.36 | 55.23 | 57.12 |

- The 120 Hz run reduces mean native eye-call CPU time from 1.561 to 0.964 ms (about 38%). The 95th-percentile XR callback interval remains 13.92 ms, above the 8.33 ms 120 Hz budget. **Stable 120 fps and a universal 72 fps minimum are not established.** Preparation/core work and frame-time spikes remain. These are single short samples, not thermal-controlled repeats or a full campaign. Actual head poses were tracked, not mechanically fixed. Original cabinet files/settings were preserved around neutral-input runs.
- At 72 Hz, frozen stereo CPU time at 1680×1760 fell **3.961 → 0.685 ms** (about 83%). Both frozen Quest resolutions match the released RGBA hashes exactly. GPU timer queries are unavailable; `gl.finish()` completion samples are diagnostic only, not GPU times or estimates of playable FPS. Reports: `tc1-perf-quest-neutral-before.json`, `tc1-perf-quest-neutral-final.json`, `tc1-perf-quest-neutral-120-before.json`, `tc1-perf-quest-neutral-120.json`. The runtime exposed 72/80/90/120 Hz and confirmed 120 Hz for both 120-Hz runs.
- Live/frozen rendering has GL error 0 and no page errors. The pre-existing one-time startup `INVALID_OPERATION` on `bindFramebuffer` remains observable during immediate XR entry; the traced 72-Hz run records it separately before measurement. Earlier unseeded `quest-fps-after` differs in cabinet inputs/state and is not used for the controlled comparison above. New runtime assets are limited to TC1 and the shared host; TC2/Crisis Zone binaries, ROMs/models, source pins and online services are unchanged.

## Shared TC1 / Crisis Zone VR settings — 14 November

- Both single-player builds reuse TC2's pinned menu widgets, font/canvas and stereo panel, with four tabs (GUN, PLAYER, GRAPHICS, AUDIO). The offline generated source contains no online service dependencies or unsupported player-slot/startup-skip/voice rows. Native source checkouts and ROM/model manifests are unchanged; TC2's published binary is unchanged.
- `python tools/check-offline-menu.py` passes against the actual generated menu in WebAssembly for both games: control bounds, all choices, slider endpoints and resets, tab wrap, resume/recenter/restart confirmation and cancellation, and no redraw for unchanged menus. A regression covers a fast click on an adjacent row: press snaps to the current ray instead of selecting the previous smoothed pointer position.
- `node tools/offline-menu-check.mjs tc1` and `cz` pass using the real game modules: mouse edits to aiming, gun angle/height/depth, cover mode, world size, view distance, quality/refresh/adaptive/filtering and volume, keyboard tabs/resume, and exact settings persistence after reload. Cabinet shot counters do not advance during menu input. WebGL/core errors are zero; page errors are empty. The four tabs were captured and visually inspected; controls fit and footer labels align with their icons.
- `node tools/xr-check.mjs tc1` and `cz` pass with synthetic tracked controllers: grip tab navigation, stick changes to world size, increasing render size from 85% to 100% (including a new XR layer), live refresh requests, a stopped paused game clock, resumed gameplay, permission recovery and session end. TC2's existing synthetic XR/menu regression also passes with the shared browser host. These tests use synthetic WebXR sessions on PC, not a physical headset or a 120 fps performance measurement.
- `node tools/menu-layer-check.mjs shared tc1` and `cz` pass: both eyes draw menu before weapon, with 5,100 / 3,736 overlapping weapon pixels and **zero** pixels overpainted after the weapon. Tracking loss leaves the menu, and resume removes it. GL/core errors are zero.
- All 38 Node tests pass, including the unchanged core-clock, input, online and complete 21-language catalog checks. Website menu instructions were updated in every offered language. Font attribution/license files accompany both new game builds. The new menus and live XR-layer resizing have not yet been tested on the physical Quest; the earlier hardware performance samples below are separate measurements.

## Standalone Quest clock and renderer — 14 November

- Tested on the user's USB-connected Quest 3, Adreno 740, OculusBrowser 156.0 / Chromium 156. This is standalone execution, not Virtual Desktop. `XRWebGLLayer.getNativeFramebufferScaleFactor()` returned 1; the 100% eye target was 1680×1760, with bilinear world textures and no adaptive downscaling.
- The original display-coupled scheduler delivered 72 VR callbacks/s but only **40.725 game fps** in Crisis Zone's frame-3200 combat sample. The game could miss a 13.89 ms display interval even when its work was close to the original 16.69 ms simulation budget. Moving preparation/advance to a nonblocking task, awakened with WebAssembly atomic notification, raised the same eight-second sample to **57.862 game fps**, with 576 VR callbacks and a 13.890 ms mean callback interval. The final interval display fluctuated; this is not a claim of uninterrupted 60 game fps. Native core work is never executed on the browser thread and no blocking atomic wait is used.
- TC2's earlier hardware run measured **59.873 game fps**, 576 VR callbacks in 8.000 seconds, and 1680×1760 per eye. That run includes the grouped renderer, before the additional asynchronous clock and final vertex cache. No 120 Hz gameplay run or complete campaign was measured. Physical headset measurements are retained in `build/qa/{tc2,cz}-perf-quest-native-after.json` and `cz-perf-quest-scheduled.json`.
- GPU timer queries are unavailable in this Quest Browser. Frozen `completion` samples based on `gl.finish()` are diagnostic CPU/driver observations and are **not** reliable GPU execution times or an FPS estimate. The actual immersive samples above are used instead. Early experimental runs (`quest-before`, `quest-baseline`, `quest-native-before`) had test-harness visibility/lifecycle problems and do not establish a before/after hardware speedup. A startup-only INVALID_OPERATION was captured on a framebuffer bind during an immediate VR request; the measured live/frozen Crisis Zone passes were error-free. The host now waits for native initialization before enabling VR.
- Depth, priority and color passes are grouped by framebuffer. TC2 and Crisis Zone match the original complete right-eye RGBA hashes at 2400×2640, 1440×1600 and 960×1080 on the PC comparison GPU. Laser visibility, tracking loss, overlapping menu/weapon order, and the confirmed TC2 impact/occlusion tests pass after regrouping.
- Crisis Zone's bounds tree uses contiguous triangle batches and visits them in original order. The WASM fixture compares more than 9,000 queries with brute force, including ties, empty/fallback paths, parallel/boundary rays and scales from 0.25 to 1000. Exact hit IDs/distances match; the spatial fixture visits 0.28% of the brute-force triangle count. That percentage describes the fixture, not a whole-game FPS gain. Sparse effect scenes retain the original scan.
- The final base-vertex cache is invalidated per prepared arcade scene. It stores unscaled base metres; world-size and view-distance changes still apply after lookup, and Crisis Zone projected impact billboards retain their effect-depth path. The final cache is an additional CPU optimization after the physical scheduling measurement; it has not been remeasured on the headset.
- 38 Node tests pass, including the 15 ms core / 72 Hz view scheduling regression, stale wakeups/session stop, pause/resume and bounded fallback polling. Synthetic native WebXR tests pass for both games with advancing game frames, a stopped pause clock, controller/menu input, scale/resolution edits, permission recovery and session end. These synthetic tests are not headset performance measurements.

## TC2 VR surface impacts — 14 November

- Added a short warm flash and a dark surface mark for confirmed cabinet shots, independent of laser/tracer settings. The effect uses the submitted controller ray, preserves the first trigger edge through confirmation, and samples new rays for held automatic fire. A trigger pull without a cabinet shot does not create a mark. HUD, empty space and translucent surfaces are excluded; C404's inverted transparency encoding is handled explicitly.
- Marks use the existing nearest-object and depth textures in each eye, before foreground text and gamma. The pass restores the renderer's VAO and blending state. It adds one draw per eye when marks are active, with at most 16 marks / 96 vertices, and no effect draw after expiration. Marks fade within 1.5 seconds and are discarded if their camera/object transform changes. They are temporary VR feedback; desktop graphics and original damage decisions are unchanged.
- `python tools/check-tc2-impacts.py` passes confirmed/unconfirmed shots, nearest opaque wall through a translucent surface, stored shot direction, held automatic fire, world scale, identical stereo geometry, invalid rays, HUD/sky exclusion, object/list changes, expiration and bounded storage.
- `node tools/impact-check.mjs` reaches combat with the real WASM core, turns aim assistance off and produces an accepted cabinet shot. At the fixed 960×960 eye pose, the final image contains 69 changed flash pixels and 40 changed dark-mark pixels in each eye. Substituting a nearer depth surface hides the effect completely; the resulting image matches the expired-effect image exactly, including HUD pixels. The expired effect submits no draw. WebGL/core error 0 and no page errors. Reports/images: `build/qa/tc2-impacts.json`, `tc2-impacts.png`, `tc2-impacts-hole.png`.
- TC2 laser visibility, disabling and tracking loss pass again. The overlapping VR menu/weapon test still finds zero overwritten weapon pixels in either eye. These are browser tests with synthetic poses; no new physical-headset test was performed. TC1 and Crisis Zone binaries, native release pins, ROM/model assets, saved-data formats and online server code are unchanged.
- The deterministic frame-4000 combat check with no added impact matches all three reference right-eye RGBA hashes exactly (2400×2640, 1440×1600 and 960×1080). Report: `build/qa/tc2-perf-impacts.json`; log: `tc2-impacts-parity.log`. This confirms that the additional pass does not change normal world/HUD rendering when inactive; it is not a headset frame-rate certification.

## TC2 VR menu foreground weapon — 13 November

- Reproduced the reported menu occlusion in actual native eye buffers: the panel painted over 5,100 weapon pixels in the left eye and 3,736 in the right eye at the fixed overlapping test pose.
- In VR, TC2 now draws the pause panel after the world but before the pointer and weapon. The gun keeps its existing independent depth pass for self-occlusion. The desktop fullscreen menu branch remains in its original position; TC1 and Crisis Zone binaries are unchanged.
- `tools/menu-layer-check.mjs` checks actual pixels around each menu/weapon draw, requires meaningful overlap in both eyes, and now finds zero overwritten weapon pixels. It also checks tracking loss and resume. The resulting screenshot was visually inspected. The test explicitly prepares the native menu cache before drawing, matching the normal frame lifecycle.
- TC2's laser regression passes both eyes, repeated draws, disabling and tracking loss with no JavaScript, native-core or WebGL errors. Reports: `build/qa/tc2-menu-layer-{before,after}.json`, `tc2-menu-layer-after.png`, and `tc2-menu-aim.log`. These are browser rendering checks with synthetic poses, not a new physical-headset test.
- The existing menu integration check also passes mouse selection, world-size adjustment, keyboard tab navigation/resume, startup skip and mobile layout (`build/qa/tc2-menu-input.log`).

## Stereo assistance and System 23 renderer — 13 November

- Rebuilt all three WASM modules. The queued `qgl_pointer` / `qgl_tracer` geometry now flushes before the weapon pass and before the host copies each eye. `tools/aim-check.mjs` finds 169 newly cyan pixels in the left eye and 129 in the right eye in each game's fixed test pose. Repeated draws are identical; disabling the beam or losing tracking leaves no delayed ray. All three report WebGL/core error 0. Screenshots: `build/qa/{tc1,tc2,cz}-laser.png`; report: `build/qa/aim.json`.
- TC2/Crisis Zone compile separate color, priority and nearest-depth fragment programs. Bilinear neighbors inside one tile share its map lookup; edge cases keep independent lookups. Camera uniform locations are cached. The vertex cache now includes flat/VR mode, fixing frozen-scene transitions that previously reused vertices from the other view.
- Updated `tools/perf-check.mjs --combat` supplies deterministic native inputs and freezes frame 4000. Crucially, archived builds are forced to refresh world-space vertices before measurement: the old frozen flat-to-VR probe could measure stale flat-space geometry. Its earlier low GPU figures cannot establish realistic stereo gameplay performance. The final comparison warms up each resolution for 120 stereo draws, then measures 80; at most four asynchronous GPU queries are in flight, preventing an unbounded submission queue. The games/builds run sequentially.
- Reference binaries are retained under `build/reference/20261113-render`. On the same NVIDIA RTX 3050 Laptop GPU, all three complete right-eye RGBA hashes (2400×2640, 1440×1600, 960×1080) match before/after for both games. Frozen VR entry also matches a forced fresh upload with zero differing pixels. Desktop replay throughput varies with host load (the final TC2 baseline sampled 47.3 game fps, versus 59.9 after); this is not evidence of a repeatable simulation speedup. No simulation-clock or ROM changes were made.

| Game / per-eye resolution | Stereo CPU mean before → after | Stereo GPU mean before → after | GPU p95 before → after |
|---|---:|---:|---:|
| TC2 / 1440×1600 | 0.407 → 0.185 ms | 3.597 → 3.232 ms | 4.128 → 3.554 ms |
| Crisis Zone / 1440×1600 | 0.283 → 0.347 ms | 2.285 → 2.057 ms | 2.289 → 2.061 ms |
| TC2 / 2400×2640 | 0.378 → 0.177 ms | 9.629 → 9.027 ms | 10.507 → 9.656 ms |
| Crisis Zone / 2400×2640 | 0.394 → 0.230 ms | 5.672 → 5.317 ms | 5.762 → 5.482 ms |
| TC2 / 960×1080 | 0.512 → 0.202 ms | 1.636 → 1.580 ms | 1.868 → 1.806 ms |
| Crisis Zone / 960×1080 | 0.255 → 0.286 ms | 1.568 → 1.565 ms | 1.636 → 1.649 ms |

These are frozen-scene offscreen measurements, not sustained headset fps. GPU means improved about 10% at 1440×1600 and 6% at 2400×2640 for both games; Crisis Zone is effectively unchanged at the lowest resolution, with slightly higher CPU/p95 samples. Power/thermal/background load was not controlled, and these small samples cannot establish an across-game speedup. An earlier short-warmup run had noisier high-resolution tails and a small Crisis Zone regression; those raw reports remain in `build/qa/{tc2,cz}-perf-world-{before,after}.json`. The table uses the final warmed, queue-bounded runs in `build/qa/{tc2,cz}-perf-steady-{before,after}.json`. TC2 still exceeds an entire 8.33 ms / 120 Hz frame at the highest resolution before compositor/streaming overhead. Adaptive resolution remains important; stable 120 Hz over Virtual Desktop is **not yet established**.

- Runtime-only experiments with integer textures were slower; a linear depth encoding also failed exact image parity at the highest resolution. Neither experiment is in the shipped builds.
- All 34 Node tests pass. TC2 and Crisis Zone synthetic XR checks cover session entry/exit, permission recovery, automatic resolution, controller input and scale with no JavaScript/WebGL errors. These simulated API checks do not certify physical refresh rate. All previous game assets, native release pins, saved-data formats, translations and online services are preserved.

## Website languages and aligned save actions — 13 November

- The header offers the same ordered set of 21 languages as the deployed NFSU2 VR site, including Traditional Chinese and Brazilian Portuguese. All 237 entries in every catalog have non-empty text and matching interpolation tokens. All 34 Node tests pass.
- `tools/language-check.mjs` passes 63 layout checks (all languages at 390, 738 and 1440 px): no horizontal page overflow, the selector stays in view, and backup buttons have equal width/height and aligned rows or mobile stacks. German desktop and Japanese mobile screenshots were visually inspected, including the expanded save section.
- The browser integration test verifies language persistence across reloads/game navigation, translated live status and accessibility text, failed language downloads, racing requests, and literal preservation of room-name data. A running TC1 core keeps its identity and settings and advances frames through language changes with no core/JavaScript error. Both backup buttons work: export produces the existing TC1 JSON format; the file picker rejects an incorrect game backup and restores a valid export.
- The TC1 synthetic WebXR regression passes permission recovery, session entry/exit, resolution changes and scale adjustment with WebGL error 0. Its lightgun regression passes exact shot coordinates, fullscreen/border, pedal/trigger chords and focus loss. No physical headset test was needed or performed for these website changes.
- Game WASM, ROMs, models and online server code are unchanged. The update changes static website assets and documentation only; publication uses the existing atomic release symlink without restarting either game service. QA output: `build/qa/languages.json`, `languages-header-de.png`, `languages-save-de.png`, `languages-mobile-ja.png`, `languages-save-mobile-ja.png`.

## TC1 v0.9.5 world-depth effects — 13 November

- TC1 was rebuilt from release commit `a92faadc4e8c2042b1f6baccc77d4785863ceb7c`, upstream `6aaa90b4cbc7a23733e1c9f5f9a5e772a19fe23d`, in the isolated `build/native-tc1` worktree. The browser directly compiles the release's scene code, including RichardGG's PR #10. Original native checkouts were not edited.
- `tools/check-tc1-scene.py` compiles the release's regression suite to WASM and executes it with assertions enabled. It passes world-sprite depth, 21-bit priority masking, HUD-threshold boundaries, nearest-surface shot marks, world scale/view distance and unchanged desktop projection. The prepared engine hooks and generated CPU/DSP/sound/explosion translations match the previous browser source.
- All 32 Node tests pass. The rebuilt TC1 passes the real browser gameplay/audio/save/stereo smoke test with accepted shots, nonzero original PCM, changed left/right images and scale-dependent rendering, with WebGL error 0 and no native-core error.
- TC1's synthetic WebXR test passes permission recovery, session entry, resolution changes, world-size adjustment and exit. The TC1 lightgun test passes exact trigger coordinates, quick shots, fullscreen/border, black-bar exclusion, pedal/trigger chords and focus-loss release. These are software checks; no new physical headset or lightgun test was performed.
- All 32 TC1 ROM entries and both weapon-model entries are identical to the previous published manifest. The new compressed WASM SHA-256 is `9ae574b97540a93d29c8266eff75d7cf0dfbf6bdad6fb231d2ed19f72cb2d354`. Saves, browser UI, TC2/Crisis Zone builds and online services are retained.
- Logs: `build/qa/tc1-v095-prepare.log`, `tc1-v095-build.log`, `tc1-v095-scene.log`, `tc1-v095-browser.log`, `tc1-v095-xr.log`, and `tc1-v095-lightgun.log`.

## VR Browser Games collection and lightgun input — 13 November

- The collection uses the VR Browser Games brand and includes an external NFSU2 VR card with a local preview image and description. All four previews load. Desktop (1440 px) and mobile (390 px) layouts were inspected without horizontal overflow.
- 32 Node tests pass, including seven new screen-aim/trigger/cover cases. The browser test `tools/lightgun-check.mjs` loads the real TC1, TC2 and Crisis Zone WASM cores and captures inputs at `_web_advance`. All three receive the exact normalized trigger coordinates (0.23, 0.71) after a short click without preceding mouse motion, even when the pointer moves before the next arcade tick.
- All three pass fullscreen entry/exit, white-border rendering, pillarbox rejection, reload-button cover, middle-button pedal, simultaneous pedal/trigger, and trigger release on focus loss. Zero JavaScript, WebGL or native-core errors were reported. Results: `build/qa/lightgun.json` and screenshot `lightgun-fullscreen.png`.
- TC2 native menu input and world-size changes pass with the corrected visible-canvas geometry. Startup skip, keyboard navigation and mobile layout also pass. The TC2 synthetic WebXR regression check passes permission recovery, session entry/exit, stereo rendering and resolution changes with no errors.
- No physical Sinden, Gun4IR, AimTrak or Retro Shooter gun was available. Their absolute-mouse input path is implemented; optical accuracy, hardware calibration, recoil and direct USB operation on Quest remain untested. The page does not claim hardware certification or provide raw HID/joystick support.

## TC2 native update and self-hosted online — 13 November

TC2 is built from native commit `4b6842d9c74ed9498121696a8b5d3c42483bf8d8` with pinned upstream `8f2ed7f4ed5c3fb5fecbbd29bbf6a6bf13876b2c`. HEAD advanced from `289f982` during this work; the sole additional commit updates the v0.4.0 release documentation, with no game-code changes. The native checkout and its submodule are clean. Browser adaptations are generated in the web project's build directory; the user's native checkout is unchanged.

- Twenty-five Node tests pass, including separate native socket forwarding through the WebSocket gateway, packet/origin validation, sending LEAVE before closing the socket, and physical ducking hysteresis.
- The pinned Rust lobby builds on Windows and all 31 of its protocol tests pass. The gateway and lobby run locally as separate processes; browser packets use the website's `/online` endpoint exclusively.
- Two real browser/WASM cabinets reached combat through the original C422 link. The test supplies credits, start, pedal and shot inputs to both cabinets. P1 observes P2 in the original playing state (`selfState == 4`); both have live receive/transmit counters, zero malformed-link/game-error counters, and WebGL error 0.
- A browser fake microphone exercises the actual getUserMedia / AudioWorklet / native Opus / gateway path. The partner receives encoded voice packets. This is not an acoustic quality test with two physical microphones.
- The final two-cabinet replay passed 6,000 original frames on both clients, microphone transmission, menu continuity, LEAVE and immediate REJOIN as P2. Immediate rejoin testing exposed the native room's 1.2-second reopen grace; the browser adaptation retries within the existing eight-second join deadline. Results and original C422 logs are in `build/qa/online-result.json` and `online-P1.log` / `online-P2.log`.
- The native PLAYER menu accepts mouse input, changes world size from 100% to 105%, and synchronizes the browser settings. Keyboard tab navigation/resume, a 390-pixel mobile layout without horizontal overflow, and startup skip pass with no JavaScript or WebGL errors. Skipping completes the real boot frames; one run took 24.1 seconds while this PC was also compiling other projects. This optional feature is not a fixed-time shortcut. The renderer stops reading scene buffers while the core fast-forwards.
- `Start-Server.cmd` successfully starts both services in the background on localhost. The PCVR launcher's `-CheckOnly` reports `ServerReady: True`. The launcher probes the explicit IPv4 bind address to avoid Windows PowerShell's localhost/IPv6 timeout.
- All three games pass the updated synthetic WebXR integration check: permission recovery, one pending session request, advertised 120-Hz API selection, resizing eye targets during a session, native stereo/menu rendering and session exit. The final TC2 build has no JavaScript or WebGL errors in this check. These are API tests with simulated poses, not physical headset measurements.
- The self-hosted backend also runs on Debian 13 with Node 24.19.0 and Rust 1.85.1 under separate unprivileged systemd services. All 31 lobby tests pass there; the live WebSocket gateway returns the Rust lobby's room list. Startup through a release symlink is supported. Caddy configuration validates and preserves the existing site's HTTP 200 response. Public-domain TLS testing requires the new domain's DNS to point at that server.

The simultaneous cabinet tests put both cores and renderers on one PC. Their cadence is not a headset benchmark. No full Internet campaign, browser/native cross-play, two-headset session, or physical 120-Hz result is certified. Docker deployment files are supplied but Docker is unavailable on this machine, so containers have not been executed here.

## Earlier PCVR optimization — 13 November

These measurements predate the TC2 native/online upgrade above. They remain evidence for the rendering optimization, not fresh measurements of the updated TC2 core.

- All three WASM modules rebuilt with framebuffer completeness checks moved out of the steady render loop. TC2 and Crisis Zone also reuse unchanged gamma uploads and use the host's known eye viewport instead of querying WebGL every eye.
- A separate Chrome launcher selects the high-performance GPU without changing global graphics settings or browser security. The page reports the actual GPU, which was confirmed as the NVIDIA RTX 3050 Laptop GPU in the performance probes.
- Optional adaptive resolution uses nonblocking GPU timer queries and bounded, gradual resolution changes. It preserves tracking matrices, the image's field of view, and the original simulation clock. Runtime-supported display rates can be requested up to 120 Hz; PC runtimes may require that selection in Virtual Desktop/SteamVR instead.
- Twenty-one Node tests passed, including late headset connection/retry, GPU overload/headroom/disjoint handling, resolution bounds and supported refresh-rate selection. Synthetic XR integration checks for all three games exercised permission recovery, single pending session requests, 120-Hz API selection, changing eye-target resolution during a session, stereo rendering, controller pause/scale, and return to the desktop without JavaScript or WebGL errors. Synthetic rates are not physical display measurements.
- TC1 frame 1400, TC2 frame 2000 and Crisis Zone frame 2000 were frozen with identical eye poses. At 2400×2640, 1440×1600 and 960×1080 per eye, the complete right-eye RGBA SHA-256 hashes matched the archived reference builds exactly. This checks visual preservation of those scenes, not every stage.
- The 2400×2640 frozen-stereo CPU submission means changed from 2.18 to 1.34 ms for TC1 and 0.89 to 0.35 ms for TC2. These are CPU submission measurements, not total headset frame times. Original and modified builds used the same PC and selected GPU, but background activity and power/thermal behavior were not controlled.
- Live desktop samples on NVIDIA reached about 60 game fps and 144 view fps for TC1/TC2 in the initial probes. A later TC2 run averaged 51.7 game fps despite 144 desktop view fps; Crisis Zone averaged 59.2 game fps. A uniformly sustained original-speed simulation has therefore not been established for all workloads.

The earlier probe's GPU queries could include idle command-buffer submission time because the frozen renderer draws only to offscreen targets. The probe now explicitly flushes the query without waiting for the GPU; use the `*-perf-submitted.json` measurements for GPU costs. Production WebXR submits the completed eye images normally. None of these offscreen probes includes Virtual Desktop encoding/network/compositor costs or certifies sustained 120 fps in combat.

At **2400×2640 per eye**, the corrected fixed-scene probes measured:

| Game | Stereo CPU mean | Stereo GPU mean | Stereo GPU p95 | Live desktop game fps |
|---|---:|---:|---:|---:|
| Time Crisis | 0.92 ms | 1.51 ms | 1.52 ms | 59.9 |
| Time Crisis II | 0.23 ms | 1.16 ms | 1.17 ms | 59.8 |
| Crisis Zone | 0.41 ms | 1.17 ms | 1.18 ms | 59.2 |

The frozen-scene figures omit simulation/preparation and final eye submission; they must not be converted into promised headset fps. The owner reported that Quest was **not connected during this optimization pass**, so the Virtual Desktop 120-Hz result still needs a hardware test.

## Executed checks

- All three original game cores compiled with Emscripten 7.0.0 and loaded from compressed modules in Chrome 157.0.8103.38 on Windows. GPU path: ANGLE / Intel Iris Xe / Direct3D 11.
- Desktop browser smoke tests reached live game scenes, accepted credits/start/fire, produced original audio samples, and wrote separate cabinet NVRAM. Crisis Zone's held automatic fire produced repeated accepted-shot feedback.
- Actual native stereo rendering was tested with left/right eyes 64 mm apart. Pixel comparisons used frozen scenes, identical projection matrices, and a 320 × 240 target. World scale was compared at 25% and 400%. All games produced different eye views and different scaled images, with WebGL error code 0.
- Synthetic WebXR sessions exercised the real browser session/eye loop, controller poses, pause, right-stick scale adjustment from 100% to 115%, and session end back to a paused desktop view. These are simulated API integration tests, not headset tests. All three passed without JavaScript/WebGL errors.
- Eleven Node tests passed: trigger taps between simulation ticks, handoff/release edges, held automatic fire, pause, physical eye separation/recenter, view/projection math, stereo audio resampling, starvation/pause, and unsigned audio-ring wraparound.
- Desktop and 390-pixel mobile page layouts were inspected. No horizontal overflow was observed.
- Packaging verifies decompressed ROM/model byte counts and SHA-256 hashes, WASM format, required modules and static asset sizes. The ZIP includes a complete SHA-256 file inventory.

| Game | Core frame at final smoke sample | Accepted shot counter | Nonzero PCM samples in ring | Left/right differing pixels | 25%/400% differing pixels |
|---|---:|---:|---:|---:|---:|
| Time Crisis | 840 | 2 | 130954 | 63806 | 72940 |
| Time Crisis II | 2718 | 10 | 131052 | 67127 | 74963 |
| Crisis Zone | 2274 | 20 | 131068 | 61084 | 67768 |

## Performance limits

The original game clock targets approximately 59.906 Hz. Rendering and tracked poses run independently at the browser/XR cadence. This separation does not make the original CPU simulation faster.

The smoke runs observed final one-second game/view samples of 57.6/138 fps for TC1, 20.6/79 fps for TC2, and 23.7/50 fps for Crisis Zone. Runs shared the PC with other work and some tests/builds ran concurrently, so these are not controlled benchmark comparisons. They do show that consistent full-speed simulation has **not** been established. Headset display refresh, standalone Quest performance, sustained audio continuity, thermal behavior and 120 Hz have not been validated. Further profiling and optimization are required before advertising a smooth public release.

## Reproducing the checks

```powershell
node --test tests/*.test.mjs
./Start-Server.cmd
# In a second terminal with Playwright installed and Chrome available:
$env:ARCADE_URL='http://localhost:8094'
node tools/online-check.mjs
node tools/menu-check.mjs
node tools/browser-check.mjs tc1
node tools/browser-check.mjs tc2
node tools/browser-check.mjs cz
node tools/xr-check.mjs tc1
node tools/xr-check.mjs tc2
node tools/xr-check.mjs cz
node tools/perf-check.mjs tc1 submitted
node tools/perf-check.mjs tc2 submitted
node tools/perf-check.mjs cz submitted
python tools/package.py
```

`PLAYWRIGHT_MODULE` can point at an existing Playwright installation. Browser checks produce screenshots and JSON under `build/qa/`. The first cabinet boot includes the original power-on tests; wait for the title screen before starting a game. Early 404s for the browser's default favicon were corrected by adding an explicit favicon. The original WebGL priority-buffer feedback loop, asynchronous WASM startup, and Crisis Zone aim calibration were corrected before final game tests.

## Remaining hardware checks

After the confirmed initial VR entry, verify sustained combat/audio, frame cadence at 120 Hz, repeated entry/exit, grip/trigger/haptics, comfortable scale, tracking loss/recenter, physical ducking and save export/import on real hardware. Test TC2 linked play and voice with two real headsets over the deployed HTTPS server. Clearing browser data removes local settings and cabinet saves.
