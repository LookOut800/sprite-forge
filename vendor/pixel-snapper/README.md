# Pixel Snapper (vendored)

[Sprite Fusion Pixel Snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper)
by Hugo Duprez, MIT licence (see `LICENSE`). It finds the grid an AI render
implies, snaps every pixel onto it and quantizes the colours. `snap.html` runs
it first, then our own style pass (`snap-core.js`) on its output.

Built from upstream commit `ae20461`, unmodified:

```
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.105   # must match Cargo.lock
cargo build --release --lib --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir out target/wasm32-unknown-unknown/release/spritefusion_pixel_snapper.wasm
```

then copy `out/spritefusion_pixel_snapper.js` and `out/spritefusion_pixel_snapper_bg.wasm` here.

API used: `process_image(pngBytes, colors, pixelSizeOrNull, paletteCsvOrNull) -> pngBytes`.
