# Attribution and license scope

VR Browser Games is an unofficial browser adaptation by DR-89 and contributors.
It is not affiliated with or endorsed by Namco, Bandai Namco, Meta or EA.

- Browser host, WebXR adapters, generated-source patch tools and VR integration:
  DR-89 and contributors, MIT; see [LICENSE](LICENSE).
- Native ports: [Time Crisis VR](https://github.com/DR-89/time-crisis-vr),
  [Time Crisis II VR](https://github.com/DR-89/time-crisis-2-vr) and
  [Crisis Zone VR](https://github.com/DR-89/crisis-zone-vr), MIT. The exact source
  revisions are recorded in [README.md](README.md). Their notices are retained
  when game modules are built.
- Underlying arcade reconstruction and engine:
  [spacestate1/namco22-decompile](https://github.com/spacestate1/namco22-decompile),
  Copyright (c) 2026 cmcrann. The original MIT notice is retained in the native
  sources and packaged builds. The browser repository supplies adapters and
  patch generators; generated game programs and ROM data are not included.
- Bundled, unmodified NMN Rust lobby: its Cargo manifest declares
  **GPL-2.0-or-later**. See [source provenance](server/nmn-source/SOURCE.txt),
  [GPL text](server/nmn-source/COPYING-GPL-2.0.txt) and the
  [retained upstream MIT notice](server/nmn-source/UPSTREAM-LICENSE-MIT.txt).
  The root MIT license does not replace these component notices.
- WebSocket library `ws`: MIT, with the notice retained in
  [server/licenses/ws-LICENSE.txt](server/licenses/ws-LICENSE.txt).
- Built modules also use Emscripten, SDL, zlib, musl and compiler-rt. TC2 voice
  uses Opus, RNNoise and SpeexDSP. Their original notices are copied into each
  game's `licenses/` directory during staging.
- The native menu font is Chakra Petch, Copyright 2018 The Chakra Petch Project
  Authors, SIL Open Font License 1.1; the build retains its font notice.
- Namco Arcade Gun: [Martoscar's model](https://sketchfab.com/3d-models/namco-arcade-gun-15fbd5b9add94a34b5c21746e3dd32be),
  CC BY 4.0, adapted in the native ports. Models are supplied by those native
  checkouts and are not included in this source export.
- Original game assets, screenshots, logos and trademarks retain their
  respective owners' rights. The code license does not grant rights to them.
  The NFSU2 card links to a separate project at [nfsu2vr.xyz](https://nfsu2vr.xyz/).

ROMs, generated game binaries, saves, recordings, keys and local hosting
configuration are excluded from the public source repository.
