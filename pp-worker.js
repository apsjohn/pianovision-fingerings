/*  pp-worker.js
    Pyodide 0.23.4 + pianoplayer -> Fingered MIDI
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

  /* -------- Defines the main Python function -------- */
  await self.pyodide.runPythonAsync(`
import base64
import music21 as m21
import importlib
from io import BytesIO

pf = importlib.import_module("pianoplayer.piano_fingering")

def midi_to_fingered_midi(b64, hand_size="XL"):
    # Decode the MIDI data and parse it
    midi_bytes = base64.b64decode(b64)
    score = m21.converter.parseData(midi_bytes)

    # Call our helper to add fingerings to the score object
    annotated_score = pf.compute_and_annotate(score, hand_size)

    # Write the modified score to an in-memory MIDI file
    fp = BytesIO()
    annotated_score.write('midi', fp=fp)
    fp.seek(0)
    
    # Return the new MIDI file's bytes as a base64 string
    return base64.b64encode(fp.read()).decode('utf-8')
`);
})();   // pyReady ends

/* ---------------- message loop ---------------------------------- */
self.onmessage = async (evt) => {
  const { midiArrayBuffer, handSize = "L" } = evt.data;
  await pyReady;

  const b64 = btoa(
    String.fromCharCode(...new Uint8Array(midiArrayBuffer))
  );
  
  const fingeredMidiBase64 = await self.pyodide.runPythonAsync(
    `midi_to_fingered_midi("""${b64}""", "${handSize}")`
  );
  
  postMessage(fingeredMidiBase64);
};