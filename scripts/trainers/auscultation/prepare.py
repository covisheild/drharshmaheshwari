"""Prepare HLS-CMDS v2 audio for the Auscultation Trainer.

Reads the unzipped dataset, levels loudness, encodes small MP3s for R2 and writes the
recording list the site imports.

    uv run --with numpy python scripts/trainers/auscultation/prepare.py <dataset-dir> <out-dir>

<dataset-dir> holds HS.csv, LS.csv, Mix.csv and the WAVs (any sub-folders; HS.zip, LS.zip and
Mix1-3.zip unzipped in place). <out-dir>/hls-cmds-v2/ is uploaded to R2 as
trainers/auscultation/hls-cmds-v2/. src/data/trainers/auscultation/recordings.json is rewritten.

Of the 535 files only ~344 hold distinct audio: the heart and lung sources behind the mixes reuse
the same recordings many times. Each distinct sound is encoded once; mixes point to the shared copy.

Processing is a single linear gain per file (no compression, no filtering), so the sounds keep
their shape; then a 10 ms fade at each end and MP3 encoding (mono, 16 kHz, 32 kbps). The source
is sampled at 4 kHz, so nothing audible is lost.
"""

import csv
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
DATA_OUT = REPO / 'src/data/trainers/auscultation/recordings.json'
SET = 'hls-cmds-v2'

TARGET_DB = -20.0  # loudness of the loud parts (gated RMS), dBFS
PEAK_DB = -1.0     # never let a sample go above this

# Files left out, with the reason. Checked by hashing the audio of every file (Oct 2026).
EXCLUDE = {
    'H0108': 'labelled Late Systolic Murmur, but byte-identical to L0031/L0055/L0131 (fine crackles)',
}

HEART = {
    'Normal': 'heart.normal', 'S3': 'heart.s3', 'S4': 'heart.s4',
    'Early Systolic Murmur': 'heart.esm', 'Mid Systolic Murmur': 'heart.msm',
    'Late Systolic Murmur': 'heart.lsm', 'Late Diastolic Murmur': 'heart.ldm',
    'Atrial Fibrillation': 'heart.af', 'Tachycardia': 'heart.tachy', 'AV Block': 'heart.avb',
}
LUNG = {
    'Normal': 'lung.normal', 'Wheezing': 'lung.wheeze', 'Rhonchi': 'lung.rhonchi',
    'Fine Crackles': 'lung.fine', 'Coarse Crackles': 'lung.coarse', 'Pleural Rub': 'lung.rub',
}


def rows(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return [{k.strip(): v.strip() for k, v in r.items()} for r in csv.DictReader(f)]


def read_wav(path):
    with wave.open(str(path)) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, path
        rate = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    return x, rate


def gated_rms_db(x, rate):
    """RMS over 400 ms blocks, keeping blocks within 20 dB of the loudest (ignores silences)."""
    n = int(rate * 0.4)
    blocks = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) for i in range(0, len(x) - n + 1, n // 2)])
    db = 20 * np.log10(np.maximum(blocks, 1e-9))
    return 20 * np.log10(np.sqrt(np.mean((10 ** (db[db > db.max() - 20] / 20)) ** 2)))


def process(src, dst):
    x, rate = read_wav(src)
    gain_db = min(TARGET_DB - gated_rms_db(x, rate), PEAK_DB - 20 * np.log10(np.abs(x).max()))
    y = x * 10 ** (gain_db / 20)
    fade = int(rate * 0.01)
    ramp = np.linspace(0, 1, fade)
    y[:fade] *= ramp
    y[-fade:] *= ramp[::-1]
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(rate), '-ac', '1', '-i', '-',
         '-ar', '16000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '32k', '-map_metadata', '-1', str(dst)],
        input=pcm, check=True)
    return round(gain_db, 1), round(len(x) / rate, 1)


def main(src_dir, out_dir):
    src_dir, out = Path(src_dir), Path(out_dir) / SET
    wavs = {p.stem: p for p in src_dir.rglob('*.wav') if '__MACOSX' not in p.parts}
    recs, seen = [], {}  # seen: audio hash -> id of the first recording with that audio

    def add(folder, file_id, kind, **fields):
        """Encode one recording and return its id. A byte-identical copy of an earlier file is not
        encoded again: the id of the first copy is returned instead, so no sound enters a quiz twice."""
        if file_id in EXCLUDE:
            return None
        with wave.open(str(wavs[file_id])) as w:
            digest = hashlib.md5(w.readframes(w.getnframes())).hexdigest()
        if digest in seen:
            return seen[digest]
        rec_id = seen[digest] = f'{folder}/{file_id}'
        gain, secs = process(wavs[file_id], out / folder / f'{file_id}.mp3')
        recs.append({'id': rec_id, 'kind': kind, **fields, 'secs': secs})
        print(f'{rec_id:<18} gain {gain:+5.1f} dB')
        return rec_id

    for r in rows(src_dir / 'HS.csv'):
        add('hs', r['Heart Sound ID'], 'heart', heart=HEART[r['Heart Sound Type']], site=r['Location'], sex=r['Gender'])
    for r in rows(src_dir / 'LS.csv'):
        # LS.csv in v2 still carries the v1 IDs for crackles: C (now FC, fine) and G (gurgling, now CC, coarse).
        file_id = r['Lung Sound ID'].replace('_C_', '_FC_').replace('_G_', '_CC_')
        add('ls', file_id, 'lung', lung=LUNG[r['Lung Sound Type']], site=r['Location'], sex=r['Gender'])
    for r in rows(src_dir / 'Mix.csv'):
        h, l, site, sex = HEART[r['Heart Sound Type']], LUNG[r['Lung Sound Type']], r['Location'], r['Gender']
        heart_id = add('mix', r['Heart Sound ID'], 'heart', heart=h, site=site, sex=sex)
        lung_id = add('mix', r['Lung Sound ID'], 'lung', lung=l, site=site, sex=sex)
        parts = {k: v for k, v in (('heart', heart_id), ('lung', lung_id)) if v}
        add('mix', r['Mixed Sound ID'], 'mix', heart=h, lung=l, site=site, sex=sex, parts=parts)

    print(f'{len(seen)} unique sounds; duplicates and {len(EXCLUDE)} excluded file(s) skipped')
    (out / 'ATTRIBUTION.txt').write_text(ATTRIBUTION, encoding='utf-8')
    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUT.write_text(json.dumps({'set': SET, 'recordings': recs}, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(recs)} recordings -> {out} and {DATA_OUT.relative_to(REPO)}')


ATTRIBUTION = """Heart and lung sound recordings from HLS-CMDS v2:
Torabi Y, Shirani S, Reilly JP. Descriptor: Heart and Lung Sounds Dataset Recorded from a Clinical
Manikin using Digital Stethoscope (HLS-CMDS). IEEE Data Descriptions, 2025.
https://doi.org/10.1109/IEEEDATA.2025.3566012 - data: https://zenodo.org/records/15376628
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Changes made for drharshmaheshwari.com: loudness levelled with one gain per file, 10 ms fade at each
end, converted from 4 kHz WAV to 16 kHz MP3. Labels as given by the dataset authors.
"""

if __name__ == '__main__':
    main(*sys.argv[1:3])
