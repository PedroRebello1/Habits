#!/usr/bin/env python3
"""Generates the PWA icons: a small contribution grid on warm-black paper.

Pure standard library (zlib + struct), so the icons are reproducible on any
machine without installing anything. Run from the repo root:

    python icons/make-icons.py
"""

import os
import struct
import zlib

INK = (0x13, 0x12, 0x10)      # --ink-900, the page
EMPTY = (0x2A, 0x26, 0x22)    # --ink-600, an untouched cell
BRASS = (0xC6, 0xA1, 0x5B)    # --brass

# Five columns of accumulation, densest on the right — the shape of the app.
PATTERN = [
    [0, 1, 2, 3, 4],
    [1, 0, 3, 2, 4],
    [0, 2, 1, 4, 3],
    [1, 1, 3, 4, 4],
    [0, 2, 2, 3, 4],
]


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cell_colour(level):
    """Same rule as the CSS: mix the brass into the empty cell from a 30%
    floor, so a single tick is still clearly visible."""
    if level <= 0:
        return EMPTY
    return mix(EMPTY, BRASS, level * 0.7 + 0.3)


def coverage(px, py, x0, y0, x1, y1, radius):
    """How much of pixel (px, py) falls inside a rounded rectangle. Exact for
    the interior, 4x4 supersampled near the edges."""
    if px + 1 <= x0 or px >= x1 or py + 1 <= y0 or py >= y1:
        return 0.0
    inset = radius
    if (x0 + inset <= px and px + 1 <= x1 - inset) or (y0 + inset <= py and py + 1 <= y1 - inset):
        if x0 <= px and px + 1 <= x1 and y0 <= py and py + 1 <= y1:
            return 1.0
    hits = 0
    for sy in range(4):
        for sx in range(4):
            x = px + (sx + 0.5) / 4.0
            y = py + (sy + 0.5) / 4.0
            if x < x0 or x > x1 or y < y0 or y > y1:
                continue
            cx = min(max(x, x0 + radius), x1 - radius)
            cy = min(max(y, y0 + radius), y1 - radius)
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= radius * radius:
                hits += 1
    return hits / 16.0


def render(size, maskable):
    # Maskable icons must keep their content inside the central 80% circle, so
    # the grid sits in a smaller box and the background runs full bleed.
    content = size * (0.56 if maskable else 0.74)
    origin = (size - content) / 2.0
    gap = content * 0.055
    cell = (content - gap * 4) / 5.0
    cell_radius = cell * 0.2

    bg_radius = 0.0 if maskable else size * 0.22
    bg_x0 = bg_y0 = 0.0
    bg_x1 = bg_y1 = float(size)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if maskable:
                alpha = 1.0
            else:
                alpha = coverage(x, y, bg_x0, bg_y0, bg_x1, bg_y1, bg_radius)
            if alpha <= 0.0:
                row += b'\x00\x00\x00\x00'
                continue
            colour = INK
            for r in range(5):
                cy0 = origin + r * (cell + gap)
                if not (cy0 - 1 <= y <= cy0 + cell + 1):
                    continue
                for c in range(5):
                    cx0 = origin + c * (cell + gap)
                    if not (cx0 - 1 <= x <= cx0 + cell + 1):
                        continue
                    cov = coverage(x, y, cx0, cy0, cx0 + cell, cy0 + cell, cell_radius)
                    if cov > 0:
                        colour = mix(colour, cell_colour(PATTERN[r][c] / 4.0), cov)
            row += bytes(colour) + bytes([round(alpha * 255)])
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)
    return len(png)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    jobs = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('maskable-512.png', 512, True),
    ]
    for name, size, maskable in jobs:
        path = os.path.join(here, name)
        written = write_png(path, size, render(size, maskable))
        print('%-18s %4dpx  %6d bytes' % (name, size, written))


if __name__ == '__main__':
    main()
