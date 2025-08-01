/*  pp-worker.js
    Pyodide 0.23.4  + pianoplayer →  PianoVision JSON
*/
importScripts(
  "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
);

/* ---------------- boot Pyodide and install wheels --------------- */
const pyReady = (async () => {
  self.pyodide = await loadPyodide();
  await self.pyodide.loadPackage("micropip");

  /* music21 (pure-Python) + custom pianoplayer wheel */
  await self.pyodide.runPythonAsync(`
import micropip, sys, types
await micropip.install('music21==8.*')
await micropip.install(
    '/py/pianoplayer-2.2.0-py3-none-any.whl',
    deps=False
)
for name in ('pretty_midi', 'vtk', 'vtkmodules'):
    sys.modules[name] = types.ModuleType(name)
`);

  /* -------- helper func that returns a JS dict -------- */
  await self.pyodide.runPythonAsync(`
import base64, json, music21 as m21, importlib
pf = importlib.import_module("pianoplayer.piano_fingering")

def finger_to_map(b64, hand_size="XL"):
    sc = m21.converter.parseData(base64.b64decode(b64))
    left_inotes, right_inotes = pf.compute_all(sc, hand_size)

    # --- DEBUGGING BLOCK ---
    print("--- PYTHON-GENERATED KEYS (RIGHT HAND) ---")
    for n in right_inotes[:5]: # Print first 5 keys
        # Use the integer n.ticks value for the key
        key = f"{n.ticks}:{n.pitch}"
        print(f"Python Key: '{key}'")
    # --- END DEBUGGING ---

    fingering_map = {"left": {}, "right": {}}
    for n in left_inotes:
        key = f"{n.ticks}:{n.pitch}"
        fingering_map["left"][key] = 6 - n.fingering if n.fingering else 0
    for n in right_inotes:
        key = f"{n.ticks}:{n.pitch}"
        fingering_map["right"][key] = n.fingering

    return json.dumps(fingering_map, indent=2)
`);
})();   // pyReady ends

/* ---------------- message loop ---------------------------------- */
self.onmessage = async (evt) => {
  const { midiArrayBuffer, handSize = "L" } = evt.data;
  await pyReady;

  // Convert MIDI bytes to base64 and call helper
  const b64 = btoa(
    String.fromCharCode(...new Uint8Array(midiArrayBuffer))
  );
  const jsonStr = await self.pyodide.runPythonAsync(
    `finger_to_map("""${b64}""", "${handSize}")`
  );
  postMessage(jsonStr);
};
