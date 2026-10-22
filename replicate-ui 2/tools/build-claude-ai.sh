#!/usr/bin/env bash
# Builds claude-ai/replicate-ui.zip: a single skill for uploading in Claude (Settings > Capabilities > Skills).
# Plugin paths (${CLAUDE_PLUGIN_ROOT}/...) become paths relative to the skill folder.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=claude-ai/replicate-ui
rm -rf claude-ai && mkdir -p "$OUT/scripts" "$OUT/references"
cp plugins/replicate-ui/scripts/*.cjs "$OUT/scripts/"
cp plugins/replicate-ui/references/*.md "$OUT/references/"
{
  printf -- '---\nname: replicate-ui\n'
  grep -m1 '^description:' plugins/replicate-ui/skills/replicate/SKILL.md
  printf -- '---\n\n> Scripts and references live next to this file: `scripts/` and `references/` in this skill'"'"'s folder. Wherever the text below says `SKILL_DIR`, use the absolute path of the folder that contains this SKILL.md.\n'
  awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' plugins/replicate-ui/skills/replicate/SKILL.md
} | sed -e 's#\${CLAUDE_PLUGIN_ROOT}#SKILL_DIR#g' -e 's#Reference: \$ARGUMENTS#Reference: the URL, files or screens the user gave.#' > "$OUT/SKILL.md"
for f in "$OUT"/references/*.md; do sed -i.bak 's#\${CLAUDE_PLUGIN_ROOT}#SKILL_DIR#g' "$f" && rm "$f.bak"; done
(cd claude-ai && zip -qr replicate-ui.zip replicate-ui)
echo "built claude-ai/replicate-ui.zip"
