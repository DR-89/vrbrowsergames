# VR Browser Games

**Play online: [vrbrowsergames.xyz](https://vrbrowsergames.xyz/)** · **Source: [DR-89/vrbrowsergames](https://github.com/DR-89/vrbrowsergames)**

An experimental browser host for the existing Time Crisis, Time Crisis II and Crisis Zone native VR reconstructions. The three original arcade programs compile to WebAssembly; WebGL 2 draws stereo geometry and WebXR supplies physical eye and controller poses. No video streaming or PC is required by the browser architecture.

This is the public source repository for the self-hosted website. It contains the frontend, WebXR/native adaptations, audio processing, translations, WebSocket gateway, pinned lobby source, build tools and regression tests. ROMs, generated game binaries, local saves, credentials and development/browser profiles are excluded. A source checkout alone does not contain playable game data. Deployment instructions: [German server guide](deploy/README-DE.md).

The collection on [vrbrowsergames.xyz](https://vrbrowsergames.xyz/) includes Time Crisis, Time Crisis II, Crisis Zone and a preview/link to the separately hosted [NFSU2 VR](https://nfsu2vr.xyz/). Opening the racing game uses a new tab and preserves the running arcade session. Existing per-game settings and save-storage keys are unchanged.

## Standalone Quest performance

All three games now run their original arcade clock independently of WebXR drawing. The native worker wakes a nonblocking browser task as soon as a prepared scene is safe. A 15 ms game step no longer has to wait for a second 72 Hz display callback. Pause, tracking loss, session exit and online neutral input retain their own handling; the original ~59.906 Hz game clock is unchanged.

Time Crisis additionally retains ordered scene geometry and draw commands between eyes and repeated headset frames. Head/controller poses stay live. New arcade frames, world size, view distance, filtering and viewport changes rebuild the cache. Texture writes that would invalidate an earlier draw use the original traversal instead. Retained batches have a 16 MiB budget; resolution, textures, painter order and gamma are preserved. On Quest 3 at 120 Hz / native 1680×1760 per eye, short matching attract-scene runs measured **106.5 → 111.4 VR callbacks/s** and **55.2 → 57.1 game fps**. This is a modest live improvement, not sustained 120 fps. Frozen-scene stereo CPU time fell about 83%; that figure must not be interpreted as an overall FPS gain. See [test conditions and limits](VALIDATION.md).

The System 23 renderer finishes each depth, priority and color target in one visit, reducing tile-memory stores/reloads without reducing resolution or changing painter order. Base vertices are shared between aiming geometry and GPU triangle fans. Crisis Zone also uses conservative bounds to accelerate multiple effect raycasts, retaining the original exact triangle test and nearest-hit order.

New TC2/Crisis Zone settings on standalone Meta Quest Browser start at **72 Hz / Native 100% / adaptive resolution off**. Existing saved choices are preserved: select those values in the browser options, or open the [TC2 preset](https://vrbrowsergames.xyz/?game=tc2&vr=native72) / [Crisis Zone preset](https://vrbrowsergames.xyz/?game=cz&vr=native72). Those explicit links apply only the three rendering settings once and leave other preferences/saves intact. Native 100% means the runtime's WebXR eye resolution, not a promise about the physical panel dimensions. A browser without GPU timer queries no longer remains silently at an additional 80% internal scale. Smooth world textures stays enabled.

On the connected Quest 3, an eight-second opening-combat sample produced 72 VR callbacks/s at 1680×1760 per eye. Crisis Zone's original simulation improved from 40.7 to 57.9 fps after decoupling, approaching its original 59.906 fps; TC2 measured 59.9 game fps with 72 VR callbacks/s. These are short scene samples, not an all-level minimum, a sustained thermal test, or a 120 Hz certification. The final vertex cache was checked separately for identical rendered pixels. See [validation details](VALIDATION.md).

## Website languages and save backups

The header language selector offers the same 21 languages as NFSU2 VR: English, French, German, Italian, Spanish, Dutch, Swedish, Danish, Korean, Traditional Chinese, Japanese, Russian, Thai, Brazilian Portuguese, Polish, Turkish, Hungarian, Ukrainian, Czech, Slovak and Greek. English is the initial default. The selected website language is saved as `vrbrowsergames:language` and shared across the three arcade pages. Changing it updates labels, instructions, accessibility text and browser status messages in place; it does not restart the game or change its settings, inputs or saves. Original game menus/audio and technical diagnostics retain their original language.

Both save actions are keyboard-accessible buttons with equal dimensions: side by side on wider screens, stacked on phones. They become available after loading the game. Export and restore use the existing per-game JSON backup format.

Translation catalogs live in `dist/lang/`, with stable IDs and matching placeholder tokens. `dist/i18n.js` binds text explicitly and loads only the English catalog plus the selected language; it does not scan the game canvas, observe mutations or run a translation loop per frame. Add new source messages to `english.json` and all other catalogs, keeping IDs stable. Language requests are ordered so an older download cannot overwrite a newer choice; failed downloads retain the previous language.

Run `node tools/language-check.mjs` with Playwright available for all-language desktop/mobile layouts, persistence, download failures/races, live-game language changes and save export/restore controls. `npm test` verifies all catalogs and placeholder parity.

## Screen play and USB lightguns

All three arcade games accept an absolute system mouse pointer. Select **Screen input → Lightgun**, then **Load game → Fullscreen** (F). The game stays at 4:3 inside the screen; aiming excludes the black bars and uses the coordinates at the trigger event, including short taps between simulation ticks. Trigger and pedal can be held together. Focus loss, input cancellation, fullscreen changes and resizing release held inputs.

Use the gun's own desktop software/firmware to calibrate to the monitor and enable absolute mouse mode. This is the common input path documented for [Sinden](https://www.sindenwiki.org/wiki/Getting_Started), [Gun4IR](https://www.gun4ir.com/pages/about-the-gun4ir%C2%AE), [AimTrak](https://www.ultimarc.com/AimTrak%20Setup%20Guide.pdf) and [Retro Shooter](https://retroshooter.com/compatibility/). This is a compatibility target, **not a hardware certification**; no physical gun was available for testing. Joystick-only guns, raw USB/HID access, device calibration, recoil control and multiple independent guns on one browser are not implemented. For TC2 co-op, use separate devices connected to the same online room. Direct USB compatibility with a standalone Quest browser is not established.

- Trigger: left mouse button. Start: Enter, 1 or trigger. Credits: 5. Numpad 1/5 also work. Menu: Escape.
- Default lightgun cover: aim inside the game to leave cover; hold the selected reload button or Space to hide/reload. Outside the game also hides. Devices that freeze the cursor off-screen need the reload button.
- Pedal cover: hold the selected side button/pedal or Space to leave cover, release to hide/reload. Choose right or middle mouse button; configure the device to match.
- Sinden: run the tracking software and select a 1–3% white border. The page renders it at the outer screen edges **only in fullscreen**. Cursor visibility is optional. Other guns can leave the border off.
- Screen preferences are shared across the three arcade games in this browser; VR controls and per-game saves stay separate. Ordinary mouse mode retains right-button/Space-to-leave-cover behavior.

Run `node tools/lightgun-check.mjs` with Playwright available to exercise actual WASM input submission for all three games, fullscreen, letterboxing, short shots, simultaneous buttons and focus loss. This is a software integration check, not an optical tracking test.

## Implementation

The WebGL adaptation in `tools/web_renderer.py` compiles separate color, priority and nearest-depth fragment programs for TC2/Crisis Zone. Only the depth pass writes `gl_FragDepth`. Palette-aware bilinear filtering reuses a shared tile-map lookup when all four samples lie inside the same tile; boundaries retain the original independent lookups. Painter order, stencil, alpha, packed pens and gamma stay intact. Camera uniforms are cached, and flat/VR view changes invalidate the vertex cache even when the game is paused.

Laser and tracer primitives are flushed into the current eye framebuffer before the weapon pass and WebXR submission. This fixes the previous queued-ray bug, which deferred the beam until the next eye/frame and let the world drawing overwrite it. Select **Aiming feedback → Laser guide** for the continuous cyan beam; **Tracer squeeze** remains shot-triggered where supported.

All three VR pause panels draw before the laser and foreground weapon, so the menu cannot paint over the gun. The weapon retains its own depth buffer for self-occlusion. `node tools/menu-layer-check.mjs shared tc1` (or `cz`, `tc2`) checks overlapping menu/weapon pixels in both eyes, tracking loss and resume.

Time Crisis and Crisis Zone now reuse TC2's tabbed VR menu widgets and panel: **GUN, PLAYER, GRAPHICS, AUDIO**. Open it with left-stick click or the opposite hand's upper button. Point and pull the trigger, or navigate with the stick and face buttons; grips change tabs. Desktop users can use the mouse or arrows/Enter/Tab after pressing Esc. Settings are saved separately for each game in this browser and synchronized with the page controls.

The new menus expose gun hand, laser (plus tracer in Crisis Zone), angle/position, grip or physical ducking, world size, view distance, texture filtering, game volume, 65/85/100% render size, 72/90/120 Hz requests and adaptive resolution. Browser/headset support determines the actual display rate. Recenter calibrates physical ducking; restarting requires confirmation and reloads the page, ending current play while retaining saved preferences and cabinet data. There is no unsupported multiplayer/player-slot menu in the single-player games. The native menu text remains English, as in TC2; website instructions are updated in all 21 languages. Menu texture updates happen only when their content/focus changes, and the unpaused render path draws no menu.

TC2 VR also shows a brief warm impact flash followed by a dark, fading surface mark, even with aiming assistance off. Marks follow confirmed cabinet shots from the submitted controller ray, skip transparent effects and HUD geometry, and use the existing per-eye depth/object textures for occlusion. Up to 16 marks share one small draw per eye; they fade within 1.5 seconds. A camera/object change removes the affected mark instead of leaving it floating. This is additional VR feedback, not persistent destruction or a change to the original hit/damage rules. `python tools/check-tc2-impacts.py` checks geometry/lifecycle; `node tools/impact-check.mjs` checks actual cabinet shots, stereo pixels, depth occlusion and expiration.

`node tools/aim-check.mjs` checks visible beam pixels in both eyes, repeated frames, disabling and tracking loss. `node tools/perf-check.mjs tc2 sample --combat` (or `cz`) runs deterministic inputs and freezes a gameplay scene, then measures real stereo rendering at three resolutions. `--reference=<folder>` loads archived core artifacts under `build/reference/`; `--compare=<label>` requires identical output hashes to the saved reference measurement. GPU timings exclude Virtual Desktop transport/compositor costs and do not certify headset fps.

- Original lifted C code runs on a persistent pthread with its C call/IRQ stack intact. It parks at the original frame boundary; the browser main thread never waits on the emulation worker.
- TC2/Crisis Zone retain their existing frame-building worker and double-buffered scene. TC1 prepares its scene on the browser thread while the core is parked, copying palette and spot RAM before continuing the core.
- Rendering reuses the prepared scene with the current headset poses. Each eye renders to a private framebuffer, then blits into its WebXR viewport. Runtime IPD and physical tracking units are preserved.
- The original approximately 59.906 Hz game clock is independent of browser/headset rendering cadence. Slow devices can miss that target; this is not a guaranteed performance level.
- Original C352 samples feed a bounded shared-memory PCM ring. An AudioWorklet resamples each game's chip rate to the audio-device rate with short fades after starvation.
- Controller rays use the native surface intersection and arcade coordinate mapping. The native gun model, recoil, TC2/Crisis Zone tracer and world scaling are retained.
- TC2 uses the current native five-tab VR menu. TC1 and Crisis Zone use its shared four-tab single-player adaptation, generated by `tools/web_menu.py` without changing the native checkouts. Trigger edges survive faster headset frames; accepted-shot feedback uses the submitted ray consistently for both eyes. Crisis Zone uses its own gun calibration and sustained-fire output pulses.
- User settings and cabinet NVRAM are per-game browser storage. ROMs, keys and personal native-app saves are not source-controlled.

### Crisis Zone shooting audio

Crisis Zone now limits loud stereo mix peaks before conversion to 16-bit PCM. Quiet samples are unchanged and both channels receive the same gain. Its generated C352 path skips inactive voices and redundant unity-gain mixing; regression tests compare the complete chip state and all four output channels against the original implementation.

The Quest combat test exposed a second cause of crackling: the cabinet produced about 52 game frames per second while the headset rendered about 72. A larger buffer cannot compensate indefinitely. Crisis Zone therefore uses a 60 ms starting reserve and bounded waveform-similarity overlap/add in the AudioWorklet. During moderate simulation slowdowns, overlapping audio segments fill the missing time while preserving pitch and stereo alignment. The spacing adapts back when the cabinet recovers; long stalls still fade and rebuffer. This can soften transients and adds buffering latency. It does not accelerate the game or guarantee 72/120 game fps. TC1 and TC2 retain their existing sample-rate conversion without time stretching.

All games finish their short fade before restarting after starvation or trimming excessive queued audio. The shared arcade scheduler delivers timer callbacks through message tasks to avoid nested timer clamping. This removes avoidable scheduling waits, but no whole-game Quest FPS gain was established in the dense Crisis Zone shooting scene.

`python tools/check-c352.py` verifies exact chip output/state and peak limiting. `node tools/audio-check.mjs cz sample` captures a fixed real-ROM firefight. `node tools/audio-replay.mjs` and `node tools/audio-device-replay.mjs` replay the recorded audio at 52 game fps through the actual worklet; the latter uses a real browser OfflineAudioContext. Offline throughput is not an immersive headset deadline measurement. See [VALIDATION.md](VALIDATION.md) for measured results and the remaining headset listening check.

## Time Crisis v0.9.5 effects fix

TC1 follows [native v0.9.5 at a92faad](https://github.com/DR-89/time-crisis-vr/commit/a92faadc4e8c2042b1f6baccc77d4785863ceb7c), including RichardGG's [world-depth effects fix (PR #10)](https://github.com/DR-89/time-crisis-vr/pull/10). Explosions, fire and other world sprites use their original view-space depth in VR; the priority bits do not affect physical distance. The HUD stays on its existing plane and shot marks retain their nearest-surface placement. World scale, viewing distance and head movement apply to world effects. The original monitor/lightgun projection is retained.

The browser compiles the release's `quest_scene.c` directly. `python tools/check-tc1-scene.py` compiles the release's own regression suite to WebAssembly and checks world depth, priority masking, HUD boundaries, shot marks, scale/distance and desktop projection. These checks and simulated WebXR sessions do not replace a new physical-headset test.

## Build

For a frontend/server checkout (Node.js 22+):

```sh
git clone https://github.com/DR-89/vrbrowsergames.git
cd vrbrowsergames
npm ci --prefix server
npm test
npm start
```

Open `http://localhost:8094/`. The collection page and server run without game assets; **Load game** requires the separately prepared WASM modules, manifests, ROM data and models in `dist/games/`. This repository does not download game ROMs.

### Prepare the native sources

The browser build consumes prepared native source trees. Clone the following repositories next to this checkout, using the directory names below, and fetch their pinned revisions. Follow each native repository's preparation instructions with your own compatible ROM files; the browser scripts expect extracted chips under each native tree's `build/assets/roms/`.

| Game | Native directory / repository | Browser source revision |
|---|---|---|
| Time Crisis | `Time Crisis VR` — [time-crisis-vr](https://github.com/DR-89/time-crisis-vr) | `a92faadc4e8c2042b1f6baccc77d4785863ceb7c` |
| Time Crisis II | `Time Crisis II Arcade VR` — [time-crisis-2-vr](https://github.com/DR-89/time-crisis-2-vr) | `4b6842d9c74ed9498121696a8b5d3c42483bf8d8` |
| Crisis Zone | `Crisis Zone VR` — [crisis-zone-vr](https://github.com/DR-89/crisis-zone-vr) | `37541cc523141030f66a4b2560d7b2e0ebd63f93` |

TC1/TC2 preparation creates isolated worktrees at the pinned revisions. Crisis Zone must already be checked out and prepared at the listed revision. Its upstream sources are a vendored snapshot, not a separate Git submodule. Full native Android/PC packaging is not required by the web CMake target, but the native preparation/generation steps are required. The existing project's generated ROM-derived files and binary assets are intentionally not published here.

For another folder layout, set `ARCADE_TC1_NATIVE`, `ARCADE_TC2_NATIVE` and `ARCADE_CZ_NATIVE` to the absolute native checkout paths. Ninja is resolved from `PATH`, or from `ARCADE_NINJA` when set; the original native TC2 tooling path is a fallback. For example, in PowerShell:

```powershell
$env:ARCADE_TC1_NATIVE='D:/sources/time-crisis-vr'
$env:ARCADE_TC2_NATIVE='D:/sources/time-crisis-2-vr'
$env:ARCADE_CZ_NATIVE='D:/sources/crisis-zone-vr'
```

### Build and run the games

Requires Python, CMake, Ninja and Emscripten **7.0.0**. TC1 uses the isolated `build/native-tc1` worktree pinned to `a92faadc4e8c2042b1f6baccc77d4785863ceb7c` (v0.9.5), with upstream `6aaa90b4cbc7a23733e1c9f5f9a5e772a19fe23d`. Its preparation script validates the existing ROM chips, applies the release's native hooks and regenerates the DSP, sound and explosion-coroutine translations. TC2 uses `build/native-tc2`: native revision `4b6842d9c74ed9498121696a8b5d3c42483bf8d8`, upstream `8f2ed7f4ed5c3fb5fecbbd29bbf6a6bf13876b2c`; its preparation generates H8 code and downloads pinned voice dependencies. Crisis Zone uses the prepared adjacent native checkout. The original native checkouts remain unchanged. The prepared worktrees report modified upstream submodules because their native integration hooks are applied during preparation.

```powershell
git clone https://github.com/emscripten-core/emsdk.git .tools/emsdk
python .tools/emsdk/emsdk.py install 7.0.0
python .tools/emsdk/emsdk.py activate 7.0.0
python tools/prepare-tc1.py
python tools/prepare-online.py
python tools/build.py all --jobs 2
python tools/check-tc1-scene.py
npm ci --prefix server
node --test tests/*.test.mjs
cargo build --release --manifest-path build/native-tc2/upstream/server/Cargo.toml
./Start-Server.cmd
```

Open `http://localhost:8094/` for local development. Remote devices require HTTPS. The Node server sets COOP/COEP and serves the same-origin WebSocket endpoint. TC2 online also requires the bundled NMN lobby process. Static-only hosting still runs solo games, but cannot provide online rooms. The production package includes both services and Docker Compose/reverse-proxy examples.

## PCVR with Virtual Desktop

On Windows, double-click `Start-PCVR.cmd`. It starts both localhost services when needed and opens Chrome in the dedicated `build/pcvr-profile` profile with `--force-high-performance-gpu`. Its settings and saves are separate from ordinary Chrome. Node.js and Chrome must be installed, the pinned lobby built, and `npm ci --prefix server` completed.

Connect Virtual Desktop, select the desired streaming refresh rate there, then choose a cabinet, **Load game**, and **Enter VR**. The page shows the graphics adapter actually used. On a dual-GPU laptop, check that it reports the dedicated graphics card. The launcher avoids reusing an existing browser process started on the integrated GPU.

**VR refresh target** requests 72/90/120 Hz only when advertised by WebXR. PC runtimes that do not expose this API retain their own refresh setting. **Adapt resolution to keep VR smooth** uses asynchronous GPU measurements to reduce internal eye resolution under load and recover detail gradually. The VR resolution option is the quality ceiling for the session; increasing it beyond the initial ceiling requires re-entering VR. Stereo poses, world scale, controller alignment and the approximately 59.906 Hz arcade clock are unchanged. A 120 Hz target is not a guarantee of 120 rendered frames per second.

The performance readout separates game frames, rendered VR frames, stereo CPU/GPU time, eye resolution, and the display frequency when the runtime reports it. The GPU-time controller needs `EXT_disjoint_timer_query_webgl2`; without it the automatic mode stays at its initial 80% of the selected resolution ceiling.

Each game's manifest records its native source revision and input hashes. Browser patches are generated into `build/`. The WebGL-safe priority pass, cached gamma lookup, framebuffer checks and adaptive resolution are retained alongside the new TC2 online implementation.

## TC2 online on your own server

TC2 follows [DR-89/time-crisis-2-vr at 4b6842d](https://github.com/DR-89/time-crisis-2-vr/commit/4b6842d9c74ed9498121696a8b5d3c42483bf8d8): updated original core, C422 cable emulation, two-player sessions, late P2 join, reconnect/rejoin, the five-tab VR menu, physical ducking, startup skip and Opus voice. The native room/session code is retained. Browser UDP I/O is replaced with bounded shared-memory queues and WebSockets; the gateway forwards unchanged NMN2 datagrams to the operator's own pinned `nmn-server`.

**Host a room** on the page or the VR menu's **ONLINE** tab, share the four-character code, and let the second player **Join room**. P1 is Keith; P2 is Robert with his own camera and arcade state. P1 starts **SOLO/LINKED**. P2 may restart once to handshake, waits until P1 has played for about 25 seconds, then joins **LINK PLAY** with the trigger. The native one-credit join option is retained. Solo P2 selection is separate from the online cabinet assignment.

Click **Enable microphone** on the page and allow browser access before entering VR. Open mic, push-to-talk (V or a stick click), mute, and partner volume are available. Browser echo/noise suppression supplies 48 kHz PCM; the native Opus codec/gate and voice framing are retained. Permission denial still allows listening and playing. Page **Leave / cancel** stops microphone capture. Voice and game packets use the same self-hosted gateway; no third-party lobby, STUN, TURN or voice provider is contacted.

The website selects its own server. Native LAN broadcast, direct-IP hosting and the native server keyboard are replaced by this same-origin route. LAN players use the same HTTPS website. Native-client interoperability is possible at the protocol level if the operator explicitly exposes the lobby's UDP port and points native apps there; browser/native cross-play has not been validated here.

While linked, menus keep the arcade running with neutral controls. Browsers may suspend background tabs or sleeping headsets; the native reconnect logic handles a returning partner. WebSocket is ordered/reliable, so TCP stalls can cause more waiting than native UDP. No complete Internet campaign or simultaneous headset test is claimed.

The server ZIP contains `site/`, `server/`, complete pinned lobby source/licenses, and `deploy/`. Public HTTPS is the only incoming browser port; UDP 27750 stays inside the Docker network by default. Domain-root hosting is supported; gateway paths are `/online` and `/api/online`.

## Compatibility and validation

Requires WebAssembly threads, SharedArrayBuffer, WebGL 2, AudioWorklet and a secure context. TC2/Crisis Zone require at least an 8192-pixel texture limit. Immersive play additionally requires a successful WebXR immersive session and tracked controllers. Detection is refreshed on headset changes, tab focus and an explicit retry; a negative preflight does not permanently disable entering VR.

Hardware validation and measured results are recorded in `VALIDATION.md`. The page displays separately measured game and view cadence; neither is a guarantee of headset display refresh. 120 Hz is not promised.

All three cores reached live scenes in desktop tests and passed synthetic WebXR session checks. The owner confirmed that the separate Chrome/Virtual Desktop test displayed the game on Quest 3 after accepting VR permission. Sustained hardware performance and complete playthroughs remain unverified; see [VALIDATION.md](VALIDATION.md).

Official integration references: [WebXR](https://www.w3.org/TR/webxr/), [Meta WebXR overview](https://developers.meta.com/vr/documentation/web/webxr-overview/), [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html).

## License and credits

The original browser/VR integration code is provided under the [MIT license](LICENSE). Third-party components retain their own licenses; in particular, the bundled Rust lobby declares GPL-2.0-or-later. See [NOTICE.md](NOTICE.md) and the included component notices. Game content and artwork are not covered by the code license.

Original reconstruction: spacestate1/namco22-decompile. Native VR ports: DR-89/time-crisis-vr, DR-89/time-crisis-2-vr, DR-89/crisis-zone-vr. Gun: Martoscar, Namco Arcade Gun, CC BY 4.0, adapted for the ports. Per-game NOTICE and LICENSE files accompany the built games. Original game assets and trademarks retain their original rights.
