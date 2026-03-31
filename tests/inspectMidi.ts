import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const PC = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'midi-fixtures');

function inspectBars(file: string, title: string, bars: number[]) {
  const m = new Midi(fs.readFileSync(path.join(dir, file)));
  const ppq = m.header.ppq;
  const bar = ppq * 4;
  console.log('\n=== ' + title + ' (PPQ:' + ppq + ') ===');

  for (const targetBar of bars) {
    const barStart = targetBar * bar;
    const barEnd = barStart + bar;
    console.log('\nBar ' + targetBar + ':');

    for (let ti = 0; ti < m.tracks.length; ti++) {
      const t = m.tracks[ti];
      if (t.notes.length === 0) continue;
      const barNotes = t.notes.filter((n: any) =>
        n.ticks < barEnd && n.ticks + n.durationTicks > barStart
      );
      if (barNotes.length === 0) continue;

      console.log('  Track ' + ti + ' (' + (t.name || '-') + '):');
      for (const n of barNotes.sort((a: any, b: any) => a.midi - b.midi)) {
        const beat = ((n.ticks - barStart) / ppq).toFixed(1);
        console.log('    MIDI ' + String(n.midi).padStart(3) + ' ' + (PC[n.midi%12]+String(Math.floor(n.midi/12)-1)).padEnd(4) + ' beat=' + beat.padStart(5) + ' dur=' + (n.durationTicks/ppq).toFixed(1) + 'b');
      }
    }
  }
}

inspectBars('chopin_prelude_4.mid', 'Chopin Prelude 4', [1, 2, 3, 4]);
inspectBars('debussy_clair_de_lune.mid', 'Debussy Clair de Lune', [0, 1]);
inspectBars('beethoven_pathetique_2.mid', 'Beethoven Appassionata 2nd', [0, 1]);
inspectBars('chopin_prelude_7.mid', 'Chopin Prelude 7', [1, 2, 3, 9]);
