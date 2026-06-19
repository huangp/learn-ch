# Data sources & attribution

This project seeds its reference data from the following sources. Raw downloads
live in `/data/raw/` (gitignored); see `/data/raw/manifest.json` for the exact
files + checksums used in a build.

| Data | Source | License |
|---|---|---|
| Character definitions, pinyin, IDS decomposition, radical, stroke graphics | [makemeahanzi](https://github.com/skishore/makemeahanzi) (`dictionary.txt`, `graphics.txt`) | `dictionary.txt`: LGPL (derived from Unihan / CJKlib). Stroke graphics: Arphic Public License (permissive). |
| Word definitions (lexicon + glosses) | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | CC BY-SA 3.0 |
| HSK 3.0 word bands + per-word frequency | [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | open word lists |
| Character frequency | [Jun Da — Modern Chinese Character Frequency List](https://lingua.mtsu.edu/chinese-computing/statistics/char/) | academic/open use |

**License caveat (CC-CEDICT, CC BY-SA 3.0):** ShareAlike applies to redistribution
of the *CC-CEDICT data itself*. Using it at runtime to look up glosses, and the
stories this app generates, are not derivatives of the dictionary database.
Commercial use is permitted with attribution. The raw dictionary file is kept
attributed and unmodified in `/data/raw/`; it is not redistributed as a
proprietary blob.

**Scope:** v1 is Simplified Chinese only. Traditional headwords/glyphs are
discarded at ingest (see IMPLEMENTATION_PLAN §5.2).
