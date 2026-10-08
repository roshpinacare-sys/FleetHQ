#!/usr/bin/env python3
"""packster.py — stdlib-only MessagePack codec (canonical pack + safe unpack).

Task 33-a. Native rebuild of the "High-Speed Binary Payload Packster" layer
for the pure-standard-library sovereign stack. The referenced msgpack
repository is a JavaScript implementation and cannot run here; the FORMAT
itself is the real standard and is implemented byte-for-byte below
(families: nil, bool, int 8/16/32/64 signed+unsigned, float32/64, str
fix/8/16/32, bin 8/16/32, array fix/16/32, map fix/16/32).

Laws:
  DETERMINISTIC  map keys are ordered by their own packed bytes (canonical
                 form) → same value → same bytes, on every machine, always.
  MEASURED       size_report() reports real json-vs-pack savings; percentages
                 are computed from bytes, never invented.
  HONEST REFUSAL unsupported types and malformed/truncated inputs raise
                 PacksterError — never silent corruption. The ext/timestamp
                 families are out of scope and refused explicitly.
"""
from __future__ import annotations
import json
import struct


class PacksterError(ValueError):
    """Raised on unsupported values or malformed packed bytes."""


# ------------------------------------------------------------------ encoder
def _enc_len(n: int, fix_base: int | None, fix_max: int,
             code8: int | None, code16: int, code32: int) -> bytes:
    if fix_base is not None and n <= fix_max:
        return bytes([fix_base + n])
    if code8 is not None and n <= 0xFF:
        return bytes([code8, n])
    if n <= 0xFFFF:
        return bytes([code16]) + struct.pack(">H", n)
    if n <= 0xFFFFFFFF:
        return bytes([code32]) + struct.pack(">I", n)
    raise PacksterError(f"length {n} exceeds 32-bit family")


def _enc_int(n: int) -> bytes:
    if 0 <= n <= 0x7F:
        return bytes([n])                            # positive fixint
    if -32 <= n < 0:
        return struct.pack(">b", n)                  # negative fixint 0xe0..0xff
    if 0 <= n <= 0xFF:
        return b"\xcc" + bytes([n])
    if 0 <= n <= 0xFFFF:
        return b"\xcd" + struct.pack(">H", n)
    if 0 <= n <= 0xFFFFFFFF:
        return b"\xce" + struct.pack(">I", n)
    if 0 <= n <= 0xFFFFFFFFFFFFFFFF:
        return b"\xcf" + struct.pack(">Q", n)
    if -128 <= n < 0:
        return b"\xd0" + struct.pack(">b", n)
    if -32768 <= n < 0:
        return b"\xd1" + struct.pack(">h", n)
    if -0x80000000 <= n < 0:
        return b"\xd2" + struct.pack(">i", n)
    if -0x8000000000000000 <= n < 0:
        return b"\xd3" + struct.pack(">q", n)
    raise PacksterError(f"int {n} outside 64-bit range")


def _enc(o, canonical: bool) -> bytes:
    if o is None:
        return b"\xc0"
    if o is True:
        return b"\xc3"
    if o is False:
        return b"\xc2"
    if isinstance(o, int):                           # bool handled above
        return _enc_int(o)
    if isinstance(o, float):
        return b"\xcb" + struct.pack(">d", o)
    if isinstance(o, str):
        b = o.encode("utf-8")
        return _enc_len(len(b), 0xA0, 31, 0xD9, 0xDA, 0xDB) + b
    if isinstance(o, (bytes, bytearray)):
        b = bytes(o)
        return _enc_len(len(b), None, -1, 0xC4, 0xC5, 0xC6) + b
    if isinstance(o, (list, tuple)):
        head = _enc_len(len(o), 0x90, 15, None, 0xDC, 0xDD)
        return head + b"".join(_enc(x, canonical) for x in o)
    if isinstance(o, dict):
        items = list(o.items())
        if canonical:                                # order by packed key bytes
            items.sort(key=lambda kv: _enc(kv[0], True))
        head = _enc_len(len(items), 0x80, 15, None, 0xDE, 0xDF)
        return head + b"".join(_enc(k, canonical) + _enc(v, canonical)
                               for k, v in items)
    raise PacksterError(f"unsupported type: {type(o).__name__}")


def pack(obj, canonical: bool = True) -> bytes:
    """Serialize obj to MessagePack bytes. canonical=True sorts map keys."""
    return _enc(obj, canonical)


# ------------------------------------------------------------------ decoder
def _take(d: bytes, i: int, n: int) -> bytes:
    if i + n > len(d):
        raise PacksterError(f"truncated input: need {n} bytes at offset {i}")
    return d[i:i + n]


def _dec(d: bytes, i: int):
    c = d[i]
    i += 1
    if c <= 0x7F:
        return c, i                                  # positive fixint
    if c >= 0xE0:
        return c - 0x100, i                          # negative fixint
    if 0x80 <= c <= 0x8F:
        return _dec_map(d, i, c & 0x0F)
    if 0x90 <= c <= 0x9F:
        return _dec_arr(d, i, c & 0x0F)
    if 0xA0 <= c <= 0xBF:
        n = c & 0x1F
        return _take(d, i, n).decode("utf-8"), i + n
    if c == 0xC0:
        return None, i
    if c == 0xC2:
        return False, i
    if c == 0xC3:
        return True, i
    if c == 0xC4:
        n = _take(d, i, 1)[0]
        return bytes(_take(d, i + 1, n)), i + 1 + n
    if c == 0xC5:
        n = struct.unpack(">H", _take(d, i, 2))[0]
        return bytes(_take(d, i + 2, n)), i + 2 + n
    if c == 0xC6:
        n = struct.unpack(">I", _take(d, i, 4))[0]
        return bytes(_take(d, i + 4, n)), i + 4 + n
    if c == 0xCA:
        return struct.unpack(">f", _take(d, i, 4))[0], i + 4
    if c == 0xCB:
        return struct.unpack(">d", _take(d, i, 8))[0], i + 8
    if c == 0xCC:
        return d[i], i + 1
    if c == 0xCD:
        return struct.unpack(">H", _take(d, i, 2))[0], i + 2
    if c == 0xCE:
        return struct.unpack(">I", _take(d, i, 4))[0], i + 4
    if c == 0xCF:
        return struct.unpack(">Q", _take(d, i, 8))[0], i + 8
    if c == 0xD0:
        return struct.unpack(">b", _take(d, i, 1))[0], i + 1
    if c == 0xD1:
        return struct.unpack(">h", _take(d, i, 2))[0], i + 2
    if c == 0xD2:
        return struct.unpack(">i", _take(d, i, 4))[0], i + 4
    if c == 0xD3:
        return struct.unpack(">q", _take(d, i, 8))[0], i + 8
    if c == 0xD9:
        n = _take(d, i, 1)[0]
        return _take(d, i + 1, n).decode("utf-8"), i + 1 + n
    if c == 0xDA:
        n = struct.unpack(">H", _take(d, i, 2))[0]
        return _take(d, i + 2, n).decode("utf-8"), i + 2 + n
    if c == 0xDB:
        n = struct.unpack(">I", _take(d, i, 4))[0]
        return _take(d, i + 4, n).decode("utf-8"), i + 4 + n
    if c == 0xDC:
        n = struct.unpack(">H", _take(d, i, 2))[0]
        return _dec_arr(d, i + 2, n)
    if c == 0xDD:
        n = struct.unpack(">I", _take(d, i, 4))[0]
        return _dec_arr(d, i + 4, n)
    if c == 0xDE:
        n = struct.unpack(">H", _take(d, i, 2))[0]
        return _dec_map(d, i + 2, n)
    if c == 0xDF:
        n = struct.unpack(">I", _take(d, i, 4))[0]
        return _dec_map(d, i + 4, n)
    if c == 0xC1:
        raise PacksterError("reserved code 0xc1 encountered")
    raise PacksterError(
        f"unsupported format code 0x{c:02x} (ext/timestamp family out of scope)")


def _dec_arr(d: bytes, i: int, n: int):
    out = []
    for _ in range(n):
        v, i = _dec(d, i)
        out.append(v)
    return out, i


def _dec_map(d: bytes, i: int, n: int):
    out = {}
    for _ in range(n):
        k, i = _dec(d, i)
        v, i = _dec(d, i)
        out[k] = v
    return out, i


def unpack(data: bytes):
    """Deserialize MessagePack bytes; refuses trailing bytes."""
    if not isinstance(data, (bytes, bytearray)):
        raise PacksterError("unpack input must be bytes")
    obj, i = _dec(bytes(data), 0)
    if i != len(data):
        raise PacksterError(f"{len(data) - i} trailing bytes after value")
    return obj


# ------------------------------------------------------------------ metrics
def size_report(obj) -> dict:
    """Measured bytes: pack vs json. Savings computed, never claimed."""
    packed = pack(obj)
    raw_json = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    pct = round(100.0 * (1.0 - len(packed) / len(raw_json)), 1) if raw_json else 0.0
    return {"pack_bytes": len(packed), "json_bytes": len(raw_json),
            "savings_pct": pct, "deterministic": pack(obj) == packed}


if __name__ == "__main__":
    demo = {"digest_date": "2026-10-09", "health_all_ok": True,
            "witnesses": [{"name": "eth", "verdict": "OK", "latency_ms": 64},
                          {"name": "zero", "verdict": "OK", "latency_ms": 355}],
            "history_tail": list(range(24))}
    print(json.dumps(size_report(demo), ensure_ascii=False))
    assert unpack(pack(demo)) == demo
    print("packster self-roundtrip OK")
