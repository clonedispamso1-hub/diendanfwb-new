"""Đo Egress bảng `profiles` (Supabase #1) trên harness Feed (/feed).

Mock toàn bộ REST Supabase bằng page.route → không cần credential thật.
Chạy: python3 tests/playwright/profiles_egress.py  (dev server phải chạy ở :8080)
Ngưỡng PASS: <= 15 request tới `profiles` mỗi phiên.
"""
import asyncio, json, collections
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

N_POSTS = 20
uid = lambda i: f"00000000-0000-4000-8000-{i:012d}"

def profile_row(pid):
    return {
        "id": pid, "username": f"user_{pid[-3:]}", "full_name": f"User {pid[-3:]}",
        "avatar": None, "avatar_url": None, "display_name": None, "vip_level": 1,
        "is_admin": False, "badge_id": None, "title_gif_url": None, "gender": "male",
        "province": "HCM", "location": "HCM", "role": "user", "is_virtual": False,
        "is_seed_account": False, "is_clone": False, "created_at": "2026-01-01T00:00:00Z",
    }

POSTS = [{
    "id": f"post-{i}", "user_id": uid(i % 12), "content": f"Bài viết test {i}",
    "created_at": "2026-01-01T00:00:00Z", "likes_count": 0, "comments_count": 2,
    "is_admin_post": False, "category": "general", "media_urls": [], "images": [],
} for i in range(N_POSTS)]

async def main():
    counts = collections.Counter()
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800})

        async def handler(route):
            url = route.request.url
            table = urlparse(url).path.split("/rest/v1/")[-1]
            counts[table] += 1
            body = []
            if table == "profiles":
                f = parse_qs(urlparse(url).query).get("id", [""])[0]
                if f.startswith("in."):
                    ids = [s.strip('"') for s in f[4:-1].split(",") if s]
                elif f.startswith("eq."):
                    ids = [f[3:]]
                else:
                    ids = [uid(0)]
                body = [profile_row(i) for i in ids]
            elif table == "posts":
                body = POSTS
            await route.fulfill(status=200, content_type="application/json",
                                headers={"access-control-allow-origin": "*", "content-range": "0-0/*"},
                                body=json.dumps(body))

        await ctx.route("**/rest/v1/**", handler)
        pg = await ctx.new_page()
        await pg.goto("http://localhost:8080/feed", wait_until="networkidle")
        await pg.wait_for_timeout(2500)
        for _ in range(8):
            await pg.mouse.wheel(0, 2200)
            await pg.wait_for_timeout(900)
        await pg.wait_for_timeout(2000)
        await b.close()

    print("--- REST calls per table ---")
    for t, n in counts.most_common():
        print(f"{n:>4}  {t}")
    prof = counts["profiles"]
    print("PROFILES REQUESTS:", prof)
    print("PASS" if prof <= 15 else "FAIL", "(ngưỡng 15)")

asyncio.run(main())
