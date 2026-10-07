# Stubs: concert tickets app

A phone app that keeps every concert you've been to as a digital ticket. It works in Safari or Chrome and can be added to your home screen so it opens full-screen like a normal app.

## What's in it

- **Map**: a pin with the artist's photo at every venue you've been to. It opens on the UK and Western Europe, and you can zoom out to the whole world.
- **Tickets**: your concerts as tickets, each with a randomly chosen colour on the side bars.
  - When you add one, the app looks up the artist's photo, the venue's city and country, the tour or festival name, and the venue's capacity online.
  - **Upcoming Shows** sits underneath. A show moves up into your tickets the day after it happens.
- **Concert page**: tap a ticket to open it. It's laid out like a Spotify artist page.
  - **Add videos**: pick several clips from your camera roll and give each one a song name. That builds the setlist. Clips with the same song name are grouped together, and you can drag songs with ≡ to reorder them.
  - **Add photos**: shows your photos in a grid.
- **Wishlist**: artists you want to see. The details show as ?????? until you get tickets.
- **Settings**: dark mode, which tab the app opens on, ticket options, back up / restore, and your stats.

Everything is saved **on your phone only**. There are no accounts and no server. Use *Settings → Back up* now and then.

## Putting it on your phone

The app is just these files. They need to be hosted at an `https://` address, then:

1. Open that address in **Safari** on your iPhone (or Chrome on Android).
2. Tap **Share → Add to Home Screen**.

Free ways to host it:

- **Netlify Drop** (easiest): go to <https://app.netlify.com/drop> and drag this `concert-app` folder onto the page. You get a link straight away.
- **GitHub Pages**: needs the repository to be public on a free account (Settings → Pages → deploy from the branch, `/concert-app` folder). Alternatively, move the files to the repo root or a `/docs` folder.

## Running it on a computer

```bash
cd concert-app
npx http-server -p 8080 -c-1
```

Then open <http://localhost:8080>.

## Where the details come from (all free, no sign-up)

| Detail | Source |
|---|---|
| Artist search & photos | Deezer, with Wikipedia as a fallback |
| Venue search, city, country, map position | Photon / OpenStreetMap |
| Venue capacity | OpenStreetMap tags, then Wikidata |
| Tour / festival name | Wikidata, then a Wikipedia search |
| Map tiles | CARTO (light and dark) |

If something can't be found, the field is left for you to type in. Auto-fill can be turned off in Settings.
