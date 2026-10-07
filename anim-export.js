// Game export for animated sprites: collects a hero's animations (idle,
// run cycle, jump, side, back — hand-edited poses win over generated ones),
// packs them into one sheet (a row per animation) and writes what engines
// read: a Godot 4 SpriteFrames resource (AtlasTexture regions, per-animation
// speed and loop — drop it on an AnimatedSprite2D) and a plain JSON index.
// Moving poses face right; flip the sprite for left.
// Pure functions over pixel grids (arrays of "#rrggbb" | null); plain global
// script, attaches itself to window.SpriteTool.anim.
(() => {
  "use strict";

  // frames = the editor's frames by id (front, back, side, jumpr, ...).
  // Without a recipe (an opened PNG) there's nothing to pose: idle (+ any
  // poses already on the sheet) only.
  function heroAnimations(hero, recipe, colors, frames) {
    const front = frames.front;
    const anims = [{ name: "idle", fps: 1, loop: true, frames: [front] }];
    if (!recipe || !colors) {
      for (const [id, name] of [["side", "side"], ["back", "back"], ["jumpr", "jump"]]) {
        if (frames[id]) anims.push({ name, fps: 1, loop: false, frames: [frames[id]] });
      }
      return anims;
    }
    anims.push(
      { name: "run", fps: 12, loop: true, frames: hero.buildRunCycleFrames(recipe, colors, front, 8) },
      { name: "jump", fps: 1, loop: false, frames: [frames.jumpr || hero.buildGridJump(recipe, colors, front, 1)] },
      { name: "side", fps: 1, loop: false, frames: [frames.side || hero.buildGridProfile(recipe, colors, front, 0)] },
      { name: "back", fps: 1, loop: false, frames: [frames.back || hero.buildGridBack(recipe, colors, front)] },
    );
    return anims;
  }

  // One row per animation, frames left to right, no gaps (engines slice by
  // exact regions). Returns the sheet grid and each animation's regions.
  function packAnimations(anims, W, H) {
    const cols = Math.max(...anims.map(a => a.frames.length)), rows = anims.length;
    const sw = cols * W, sh = rows * H, grid = new Array(sw * sh).fill(null), regions = {};
    anims.forEach((a, r) => {
      regions[a.name] = a.frames.map((f, c) => {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[(r * H + y) * sw + c * W + x] = f[y * W + x];
        return { x: c * W, y: r * H, w: W, h: H };
      });
    });
    return { w: sw, h: sh, grid, regions };
  }

  // Godot 4 SpriteFrames. `pngName` is relative to the .tres — keep the two
  // side by side.
  function godotSpriteFrames(anims, packed, pngName) {
    const subs = [], animText = [];
    for (const a of anims) {
      const ids = packed.regions[a.name].map((r, i) => {
        const id = `AtlasTexture_${a.name}_${i}`;
        subs.push(`[sub_resource type="AtlasTexture" id="${id}"]`, `atlas = ExtResource("1_tex")`,
                  `region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`, ``);
        return id;
      });
      animText.push(`{\n"frames": [${ids.map(id => `{\n"duration": 1.0,\n"texture": SubResource("${id}")\n}`).join(", ")}],\n` +
        `"loop": ${a.loop},\n"name": &"${a.name}",\n"speed": ${a.fps.toFixed(1)}\n}`);
    }
    const nSubs = subs.filter(l => l.startsWith("[sub_resource")).length;
    return [
      `[gd_resource type="SpriteFrames" load_steps=${nSubs + 2} format=3]`, ``,
      `[ext_resource type="Texture2D" path="${pngName}" id="1_tex"]`, ``,
      ...subs,
      `[resource]`,
      `animations = [${animText.join(", ")}]`, ``,
    ].join("\n");
  }

  function animationsJson(anims, packed, pngName, frameW, frameH) {
    const out = { image: pngName, frameWidth: frameW, frameHeight: frameH, faces: "right", animations: {} };
    for (const a of anims) out.animations[a.name] = { fps: a.fps, loop: a.loop, frames: packed.regions[a.name] };
    return JSON.stringify(out, null, 1);
  }

  window.SpriteTool = window.SpriteTool || {};
  window.SpriteTool.anim = { heroAnimations, packAnimations, godotSpriteFrames, animationsJson };
})();
