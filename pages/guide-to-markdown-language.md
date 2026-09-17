# Guide To Markdown Language

Everything on this wiki is written in **Markdown** — plain text with a few symbols that turn into formatting when the page is saved. You can't break anything: every save is kept in history, so experiment freely. Hit **✎ Edit This Page** on this very page to see how each example below was written.

## Headings

```
# Biggest heading (page title — one per page, at the top)
## Section heading
### Smaller heading
```

## Bold, italics, and strikethrough

| Type this | Get this |
|-----------|----------|
| `**bold**` | **bold** |
| `*italics*` | *italics* |
| `**_both_**` | **_both_** |
| `~~strikethrough~~` | ~~dead NPC~~ |

## Lists

```
- bullet point
- another one
  - indent two spaces for a sub-point

1. numbered list
2. it counts for you
```

- bullet point
- another one
  - indent two spaces for a sub-point

1. numbered list
2. it counts for you

## Linking between wiki pages

This is the big one — write `[[Page Name]]` (double square brackets) to link to another page on this wiki:

- `[[Bruldrun]]` links to a page from anywhere, whatever folder it's in
- `[[Session Logs]]` — a folder's name links to its Overview page
- A **red link** means that page doesn't exist yet — click it and you can write the page on the spot. The new page lands in the same folder as the page you clicked from, which is exactly what you want when adding an NPC from [[People of Sandpoint]].

## Links to the outside world

```
[Archives of Nethys](https://2e.aonprd.com/)
```

[Archives of Nethys](https://2e.aonprd.com/)

## Quotes

```
> "There are seven dooms in Sandpoint's future..."
```

> "There are seven dooms in Sandpoint's future..."

## Tables

```
| Who | What we know |
|-----|--------------|
| Ripnugget | Goblin, apparently worth shouting about |
| Nualia | Missing from her grave |
```

| Who | What we know |
|-----|--------------|
| Ripnugget | Goblin, apparently worth shouting about |
| Nualia | Missing from her grave |

The `|` bars separate columns; the row of dashes goes under the header row. Don't worry about lining them up prettily — it works either way.

## Dividers

Three dashes on their own line make a horizontal line across the page:

```
---
```

---

## Images

If an image file is already in the repo (ask the GM to add one), show it with:

```
<img class="side" src="assets/session1.webp" alt="Session 1">
```

- `class="side"` — small, tucked into the top-right corner, text wraps around it
- `class="portrait"` — big, on its own line (the character sheets use this)

## Showing symbols without triggering them

Wrap anything in single `` ` `` backticks to show it literally instead of formatting it — that's how this page shows `**bold**` without making it bold. Backticks also make `code-looking text` for things like die rolls or item names.

## House rules for editing

- **Sign your saves** — the name box next to the password isn't optional, and the page history shows who wrote what.
- **Don't fear the delete button**, but don't get cute with it either. Everything is recoverable, but the GM has to go digging.
- If you see *"Someone else edited this page"* when saving: copy your text somewhere safe, refresh, and paste it back in. Two people had the page open at once.
