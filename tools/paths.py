"""Native source locations, configurable without editing the build scripts."""
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
NAMES = {'tc1': 'Time Crisis VR', 'tc2': 'Time Crisis II Arcade VR', 'cz': 'Crisis Zone VR'}


def native_checkout(game):
    override = os.environ.get('ARCADE_' + game.upper() + '_NATIVE')
    if override:
        return Path(override).expanduser().resolve()
    adjacent = ROOT.parent / NAMES[game]
    # Retain the original nested workspace layout for existing developers.
    legacy = ROOT.parents[2] / NAMES[game] if len(ROOT.parents) > 2 else adjacent
    return adjacent if adjacent.exists() or not legacy.exists() else legacy
