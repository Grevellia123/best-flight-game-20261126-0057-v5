"""Verify TALON STRIKE v5: title, tap-to-start, autopilot full win, Android
emulation (portrait + landscape), staged screenshots, console errors /
failed / external requests."""
import hashlib
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8085"
ENTRY = "/home/hatch/workspace/makefun/flight-game-entry-v5"
OUT = os.path.join(ENTRY, "screenshots")
SHOTS = [
    ("0-cover.jpg", "?shot=cover&seed=1"),
    ("1-combat.jpg", "?shot=combat&seed=1"),
    ("2-lock.jpg", "?shot=lock&seed=1"),
    ("3-victory.jpg", "?shot=victory&seed=1"),
]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


srv = subprocess.Popen(["node", "serve.ts", "--port", "8085"], cwd=ENTRY,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        errors, failed, external = [], [], []

        def hook(page, tag):
            page.on("console", lambda m: errors.append(f"[{tag}] {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
            page.on("requestfailed", lambda r: failed.append(f"[{tag}] {r.url}"))
            page.on("request", lambda r: external.append(f"[{tag}] {r.url}")
                    if not (r.url.startswith(BASE) or r.url.startswith("data:") or r.url.startswith("blob:")) else None)

        # ---- 1. Desktop title + autopilot win -------------------------------
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        hook(page, "desktop")
        page.goto(BASE + "/?autopilot=1&timescale=4", wait_until="load")
        page.wait_for_timeout(4000)
        print("title visible:", page.is_visible("#title-screen"),
              "| webgl error:", page.is_visible("#webgl-error"))
        page.evaluate("() => window.__talon.start()")
        page.evaluate("() => window.__talon.autopilot(true)")
        won = lost = False
        t0 = time.time()
        for i in range(240):
            time.sleep(5)
            st = page.evaluate("""() => { const w = window.__talon.world; return {
                screen: w.screen, wave: w.wave, kills: w.kills, score: w.score,
                hull: Math.round(w.player.hull), fuel: Math.round(w.player.fuel),
                fps: window.__talon.fps, enemies: w.enemies.length }; }""")
            if i % 6 == 0:
                print(f"t={time.time() - t0:.0f}s screen={st['screen']} wave={st['wave']} "
                      f"kills={st['kills']} score={st['score']} hull={st['hull']} "
                      f"fuel={st['fuel']} fps={st['fps']} enemies={st['enemies']}")
            if st["screen"] == "win":
                won = True
                break
            if st["screen"] == "over":
                lost = True
                break
        print("autopilot result:", "WIN" if won else "LOST" if lost else "TIMEOUT",
              f"after {time.time() - t0:.0f}s wall")
        if won:
            print("final:", page.evaluate("""() => { const w = window.__talon.world; return {
                score: w.score, kills: w.kills,
                acc: w.shotsFired ? Math.round(100 * w.shotsHit / w.shotsFired) : 0 }; }"""))
        page.close()

        # ---- 2. Android Pixel 7 portrait + landscape ------------------------
        for name, vp in [("android-portrait", {"width": 412, "height": 915}),
                         ("android-landscape", {"width": 915, "height": 412})]:
            dev = dict(pw.devices["Pixel 7"])
            dev["viewport"] = vp
            dev["has_touch"] = True
            dev["is_mobile"] = True
            ctx = browser.new_context(**dev)
            p = ctx.new_page()
            hook(p, name)
            p.goto(BASE, wait_until="load")
            p.wait_for_timeout(3000)
            p.tap("#btn-fly")
            p.wait_for_timeout(2000)
            playing = p.evaluate("() => window.__talon.world.screen === 'play'")
            p.evaluate("() => window.__talon.autopilot(true)")
            p.wait_for_timeout(20000)
            st = p.evaluate("""() => { const w = window.__talon.world; return {
                screen: w.screen, wave: w.wave, kills: w.kills,
                fps: window.__talon.fps }; }""")
            print(f"{name}: tap-to-start={playing} after-20s={st}")
            p.close()
            ctx.close()

        # ---- 3. Staged screenshots ------------------------------------------
        # 8s wait: at SwiftShader frame rates the chase/title camera lerp
        # needs the time to converge on the staged pose. Screenshots can
        # catch a black canvas on slow software renderers (the drawing
        # buffer is cleared after compositing) — retry while the frame is
        # still black (a black 1280x720 JPEG is ~40KB, a real one 300KB+).
        os.makedirs(OUT, exist_ok=True)
        sp = browser.new_page(viewport={"width": 1280, "height": 720})
        hook(sp, "shots")
        for fname, q in SHOTS:
            sp.goto(BASE + "/" + q, wait_until="load")
            sp.wait_for_timeout(8000)
            for attempt in range(3):
                sp.screenshot(path=os.path.join(OUT, fname), type="jpeg", quality=82)
                if os.path.getsize(os.path.join(OUT, fname)) > 100000 or attempt == 2:
                    break
                sp.wait_for_timeout(2500)
            print(fname, "shot ok,", os.path.getsize(os.path.join(OUT, fname)), "bytes,",
                  "sha256", sha(os.path.join(OUT, fname))[:12])
        sp.close()
        browser.close()

    print("--- ERRORS:", len(errors))
    for e in errors:
        print(" ", e)
    print("--- FAILED REQUESTS:", len(failed))
    for e in failed:
        print(" ", e)
    print("--- EXTERNAL REQUESTS:", len(external))
    for e in external:
        print(" ", e)
finally:
    srv.kill()
