#!/usr/bin/env python3
"""Render a captioned tutorial from real Playwright screenshots; never synthesizes UI.

Requires Pillow and ffmpeg. Use screenshots emitted by launch-video.e2e.js:
  python3 scripts/render-launch-video.py --input-dir /path/to/extracted/artifact \
    --source-commit ACTUAL_SHA --source-url ACTUAL_ACTIONS_RUN_URL

The tutorial explains GitHub/review actions using clearly labeled instruction
panels. It does not depict an outside contribution as submitted or accepted.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1920, 1080
BG, PANEL, INK, MUTED, ACCENT, LINE = '#101b1b', '#182a29', '#f6f7ef', '#c1cfca', '#c5efae', '#39524c'
SCENES = [
    dict(seconds=10, title='Find one useful task.', image='tutorial-contribute.png',
         label='REAL LOCAL APP CAPTURE', kicker='CONTRIBUTOR HUB',
         text='Research, design, testing, docs and code all count. Pick a small issue and read its acceptance criteria.',
         detail='Start with one contribution you can finish.'),
    dict(seconds=13, title='Describe a change.', image='tutorial-draft.png',
         label='REAL LOCAL APP CAPTURE', kicker='DRAFT',
         text='Choose Propose a change. Write a short title, the problem, and what would improve it.',
         detail='Fictitious example shown. No submission is made.'),
    dict(seconds=13, title='Review the exact text.', image='tutorial-review.png',
         label='REAL LOCAL APP CAPTURE', kicker='REVIEW',
         text='Choose the GitHub route. Remove private details and inspect the public proposal before giving permission.',
         detail='Your reviewed text is what you choose to share.'),
    dict(seconds=12, title='Continue on GitHub.', image='tutorial-github-handoff.png',
         label='REAL LOCAL APP CAPTURE', kicker='GITHUB HANDOFF',
         text='Copy the proposal. Open the editor, sign in, paste the file, choose a branch or fork, and open a pull request.',
         detail='This tutorial stops before publishing a dummy PR.'),
    dict(seconds=12, title='Make the PR reviewable.', image=None,
         label='INSTRUCTION PANEL / NEXT STEPS ON GITHUB', kicker='PULL REQUEST',
         text='Link the issue. Explain the problem and change. Put the exact feature preview first, followed by screenshots and verification.',
         detail='The title and description should make the result easy to review.',
         rows=['Problem and resulting behavior', 'Issue and acceptance criteria', 'Exact feature preview + current commit', 'Desktop/mobile screenshots + test results']),
    dict(seconds=12, title='Let the checks run.', image=None,
         label='INSTRUCTION PANEL / CHECKS ARE NOT SIMULATED', kicker='AUTOMATED CHECKS',
         text='Run relevant tests and wait for the build and deployment checks on the current commit. Investigate failures before merging.',
         detail='A successful older preview does not verify a newer change.',
         rows=['Unit and integration tests', 'Browser checks for changed behavior', 'Build and exact-commit deployment', 'Visible failures and known limitations']),
    dict(seconds=12, title='Ask for human review.', image=None,
         label='INSTRUCTION PANEL / NO ACCEPTANCE CLAIMED', kicker='HUMAN REVIEW',
         text='A reviewer examines the change and evidence. Address feedback, keep checks current, and follow the repository rules before merging.',
         detail='An automated check or simulated vote is not human approval.',
         rows=['Review the diff and exact preview', 'Consider objections and limitations', 'Revise and verify the updated commit', 'Record the human decision']),
    dict(seconds=12, title='Record what happened.', image='tutorial-dashboard.png',
         label='REAL LOCAL APP CAPTURE / STATUS IS A SNAPSHOT', kicker='LAUNCH DASHBOARD',
         text='Update the launch task with a dated result and evidence link. Completed work counts as done; prepared future work stays ready to run.',
         detail='Link accepted contributions, artifacts, and decisions to the PR.'),
]


def font(size, bold=False):
    name = 'NimbusSans-Bold.otf' if bold else 'NimbusSans-Regular.otf'
    path = Path('/usr/share/fonts/opentype/urw-base35') / name
    if not path.exists():
        path = Path('/usr/share/fonts/truetype/dejavu') / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')
    return ImageFont.truetype(str(path), size)


def wrap(draw, text, face, width):
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            candidate = f'{line} {word}'.strip()
            if line and draw.textlength(candidate, font=face) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def paragraph(draw, text, xy, width, face, fill, spacing=1.28):
    x, y = xy
    for line in wrap(draw, text, face, width):
        draw.text((x, y), line, font=face, fill=fill)
        y += int(face.size * spacing)
    return y


def frame(scene, number, shots, output):
    canvas = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((72, 46), 'HELIOS  /  CONTRIBUTION TUTORIAL', font=font(27, True), fill=ACCENT)
    draw.text((1588, 48), f'{number + 1:02d} / {len(SCENES):02d}', font=font(27), fill=MUTED)
    draw.line((72, 108, 1848, 108), fill=LINE, width=2)
    draw.text((72, 145), scene['title'], font=font(68, True), fill=INK)
    draw.text((76, 256), scene['kicker'], font=font(25, True), fill=ACCENT)
    paragraph(draw, scene['text'], (72, 311), 575, font(42), INK)
    paragraph(draw, scene['detail'], (72, 731), 560, font(29), MUTED)
    # UI captures stay unaltered apart from scaling to fit this frame.
    box = (720, 252, 1848, 938)
    draw.rounded_rectangle(box, radius=20, fill=PANEL, outline=LINE, width=2)
    if scene['image']:
        with Image.open(shots[scene['image']]) as original:
            shot = original.convert('RGB')
            shot.thumbnail((1088, 610), Image.Resampling.LANCZOS)
            x = 740 + (1088 - shot.width) // 2
            y = 294 + (610 - shot.height) // 2
            canvas.paste(shot, (x, y))
        draw.text((746, 267), scene['label'], font=font(17, True), fill=MUTED)
    else:
        draw.text((758, 286), scene['label'], font=font(20, True), fill=ACCENT)
        for index, row in enumerate(scene['rows']):
            y = 380 + index * 124
            draw.rounded_rectangle((758, y - 6, 1810, y + 88), radius=12, fill='#223b34', outline=LINE)
            draw.text((786, y + 16), str(index + 1).zfill(2), font=font(30, True), fill=ACCENT)
            paragraph(draw, row, (864, y + 17), 880, font(33), INK, 1.1)
    draw.line((72, 974, 1848, 974), fill=LINE, width=2)
    draw.text((72, 1009), 'Captioned tutorial • illustrative input • no outside contribution is submitted or accepted', font=font(23), fill=MUTED)
    progress_width = round(1776 * (number + 1) / len(SCENES))
    draw.rectangle((72, 1065, 72 + progress_width, 1071), fill=ACCENT)
    canvas.save(output)


def timestamp(seconds):
    return f'{seconds // 3600:02}:{seconds % 3600 // 60:02}:{seconds % 60:02}.000'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--output-dir', type=Path, default=Path('public/launch'))
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.source_commit):
        parser.error('--source-commit must be a full Git commit SHA')
    if not args.source_url.startswith('https://github.com/adnanwahab/HeliosHTML/actions/runs/'):
        parser.error('--source-url must identify the actual HeliosHTML capture workflow run')
    shots = {}
    for scene in SCENES:
        name = scene['image']
        if not name:
            continue
        matches = list(args.input_dir.rglob(name))
        if len(matches) != 1:
            raise SystemExit(f'Expected one genuine capture named {name}; found {len(matches)}')
        shots[name] = matches[0]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    video = args.output_dir / 'contribution-workflow.mp4'
    duration = sum(s['seconds'] for s in SCENES)
    with tempfile.TemporaryDirectory(prefix='helios-launch-video-') as directory:
        work = Path(directory)
        listing = []
        for i, scene in enumerate(SCENES):
            image = work / f'{i:02}.png'
            frame(scene, i, shots, image)
            listing += [f"file '{image.as_posix()}'", f"duration {scene['seconds']}"]
        listing.append(f"file '{image.as_posix()}'")
        manifest = work / 'frames.txt'
        manifest.write_text('\n'.join(listing) + '\n')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
                        '-i', str(manifest), '-vf', 'fps=12,format=yuv420p', '-t', str(duration),
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart',
                        '-metadata', 'title=Helios contribution workflow tutorial',
                        '-metadata', 'comment=Captioned tutorial with actual local UI captures; no outside contribution submitted.',
                        str(video)], check=True)
        # Poster is a genuine tutorial frame, not a depiction of a completed external action.
        frame(SCENES[0], 0, shots, args.output_dir / 'contribution-workflow-poster.png')
    if video.stat().st_size >= 10_000_000:
        raise SystemExit('Video exceeds 10 MB; review encoding before publication')
    vtt = ['WEBVTT', '']
    transcript = ['# Helios contribution workflow tutorial', '',
                  f'**Duration:** {duration} seconds. Silent video with visible instructional captions and an optional WebVTT caption track.', '',
                  '**Scope:** real local-app captures with fictitious input, plus clearly labeled instruction panels for GitHub checks and human review. No outside contribution was submitted or accepted during capture.', '',
                  f'**Capture source:** [{args.source_commit}]({args.source_url}). The dashboard is a snapshot from that commit; read the live dashboard for current completion status.', '',
                  '## Transcript', '']
    start = 0
    for i, scene in enumerate(SCENES):
        end = start + scene['seconds']
        caption = f"{scene['title']} {scene['text']} {scene['detail']}"
        vtt += [str(i + 1), f'{timestamp(start)} --> {timestamp(end)}', caption, '']
        transcript += [f"### {timestamp(start)[:-4]}–{timestamp(end)[:-4]} — {scene['title']}", '',
                       scene['text'], '', scene['detail'], '']
        start = end
    transcript += ['## Capture provenance', '',
                   'Screenshots were produced by `test/browser/launch-video.e2e.js` in the linked workflow run. Rendering scales the captures without replacing their content. Instruction panels are designed explanatory text, not simulated GitHub screenshots.', '',
                   '| Capture | SHA-256 |', '| --- | --- |']
    for name, path in shots.items():
        transcript.append(f'| `{name}` | `{hashlib.sha256(path.read_bytes()).hexdigest()}` |')
    transcript += ['', '## Rebuild', '', 'Requires Python with Pillow and FFmpeg. Download the real capture artifact from the workflow above, then run:', '',
                   '```sh', f'python3 scripts/render-launch-video.py --input-dir /path/to/extracted/artifact --source-commit {args.source_commit} --source-url {args.source_url}', '```', '']
    (args.output_dir / 'contribution-workflow.vtt').write_text('\n'.join(vtt))
    (args.output_dir / 'contribution-workflow-transcript.md').write_text('\n'.join(transcript))
    print(json.dumps({'video': str(video), 'duration_seconds': duration, 'bytes': video.stat().st_size, 'source_commit': args.source_commit}))


if __name__ == '__main__':
    main()
