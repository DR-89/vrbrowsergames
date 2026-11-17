"""Include the complete pinned lobby server source and attribution for self-hosting."""
from pathlib import Path
import shutil, urllib.request
ROOT=Path(__file__).resolve().parents[1]
upstream=ROOT/'build/native-tc2/upstream'
dest=ROOT/'server/nmn-source';dest.mkdir(parents=True,exist_ok=True)
for name in ['Cargo.toml','Cargo.lock','README.md']:
    shutil.copy2(upstream/'server'/name,dest/name)
shutil.copytree(upstream/'server/src',dest/'src',dirs_exist_ok=True)
shutil.copy2(upstream/'LICENSE',dest/'UPSTREAM-LICENSE-MIT.txt')
license=dest/'COPYING-GPL-2.0.txt'
if not license.exists():
    urllib.request.urlretrieve('https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt',license)
(dest/'SOURCE.txt').write_text('Source: https://github.com/spacestate1/namco22-decompile/tree/8f2ed7f4ed5c3fb5fecbbd29bbf6a6bf13876b2c/server\nRevision: 8f2ed7f4ed5c3fb5fecbbd29bbf6a6bf13876b2c\nUnmodified Rust source. Cargo.toml declares GPL-2.0-or-later; the upstream repository also includes the retained MIT license.\nBuild: cargo build --release --locked\n')
licenses=ROOT/'server/licenses';licenses.mkdir(exist_ok=True)
shutil.copy2(ROOT/'server/node_modules/ws/LICENSE',licenses/'ws-LICENSE.txt')
print('Pinned lobby source and licenses staged.')
