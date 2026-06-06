from __future__ import annotations

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POST_RE = re.compile(r"^(20\d{2})/(\d{2})/(\d{2})/(.+)/index\.html$")
TRANS_RE = re.compile(
    r'<div class="trans">\s*(.*?)\s*<div class="row mt-2">',
    re.DOTALL,
)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.DOTALL | re.IGNORECASE)
H2_RE = re.compile(r"<h2>(.*?)</h2>", re.DOTALL | re.IGNORECASE)
PARAGRAPH_RE = re.compile(r"<p>(.*?)</p>", re.DOTALL | re.IGNORECASE)
DATE_RE = re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\b")


def clean_inline(value: str) -> str:
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = value.replace("\xa0", " ")
    value = "\n".join(line.strip() for line in value.splitlines())
    return value.strip()


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def safe_filename(value: str) -> str:
    value = value.strip().replace("/", "-").replace("\\", "-")
    value = re.sub(r'[:*?"<>|]', "-", value)
    value = re.sub(r"\s+", "-", value)
    value = value.strip(".-")
    return value or "post"


def extract_post(path: Path) -> dict[str, str] | None:
    rel = path.relative_to(ROOT).as_posix()
    match = POST_RE.match(rel)
    if not match:
        return None

    year, month, day, slug = match.groups()
    raw = path.read_text(encoding="utf-8")
    title_match = TITLE_RE.search(raw)
    title = clean_inline(title_match.group(1)) if title_match else slug

    trans_match = TRANS_RE.search(raw)
    if not trans_match:
        return None

    body_html = trans_match.group(1)
    body_html = H2_RE.sub("", body_html, count=1)
    paragraphs: list[str] = []

    for paragraph_match in PARAGRAPH_RE.finditer(body_html):
        text = clean_inline(paragraph_match.group(1))
        if not text:
            continue
        if DATE_RE.search(text):
            continue
        paragraphs.append(text)

    body = "\n\n".join(paragraphs).strip() + "\n"

    return {
        "title": title,
        "date": f"{year}-{month}-{day}",
        "slug": slug,
        "permalink": f"/{year}/{month}/{day}/{slug}/",
        "body": body,
    }


def main() -> None:
    posts = []
    for path in sorted(ROOT.glob("20[0-9][0-9]/*/*/*/index.html")):
        post = extract_post(path)
        if post:
            posts.append(post)

    out_dir = ROOT / "_posts"
    out_dir.mkdir(exist_ok=True)

    used_names: set[str] = set()
    for post in posts:
        stem = safe_filename(post["slug"])
        filename = f'{post["date"]}-{stem}.md'
        if filename in used_names:
            counter = 2
            while f'{post["date"]}-{stem}-{counter}.md' in used_names:
                counter += 1
            filename = f'{post["date"]}-{stem}-{counter}.md'
        used_names.add(filename)

        target = out_dir / filename
        target.write_text(
            "\n".join(
                [
                    "---",
                    "layout: post",
                    f'title: {yaml_string(post["title"])}',
                    f'date: {yaml_string(post["date"])}',
                    f'permalink: {yaml_string(post["permalink"])}',
                    "---",
                    "",
                    post["body"],
                ]
            ),
            encoding="utf-8",
            newline="\n",
        )

    print(f"Migrated {len(posts)} posts to {out_dir}")


if __name__ == "__main__":
    main()
