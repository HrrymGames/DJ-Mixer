# Installing the Setlistic iPhone app (Windows, free Apple ID)

The iPhone app links to the videos and photos in your camera roll instead of copying them,
so nothing is stored twice and there's no waiting when you add videos.

It isn't on the App Store. You install it yourself with **iLoader** (or **Sideloadly**) and a free
Apple ID — use a personal or spare one, never a school one.

> **What actually worked (October 2026):** an Apple change broke sign-in for Sideloadly, AltStore and
> appdb's free option (error -80045/-80046). **iLoader 2.3.10+** (github.com/nab138/iloader → Releases →
> Windows installer) worked: sign in, pick an anisette server from its built-in list (Reset anisette if it
> errors), then **Import IPA** → `Setlistic.ipa`. Refresh weekly the same way. If a tool fails with -80045,
> don't keep retrying — Apple temporarily locks repeated attempts. Apple makes free installs expire after **7 days**, so it needs a quick refresh once a week.
Your concerts are kept when you refresh.

## One-time setup on your laptop

1. Install **iTunes** and **iCloud** for Windows **from Apple's website**, not from the Microsoft Store
   (Sideloadly needs the website versions).
2. Install **Sideloadly** from <https://sideloadly.io>.

## Get the app file

1. On GitHub, open the repository → **Actions** → **Build iPhone app**.
2. Click the newest run with a green tick.
3. Under **Artifacts**, download **Setlistic-ipa**. Unzip it to get `Setlistic.ipa`.

A new build appears automatically every time the app is updated.

## Install

1. Plug your iPhone into the laptop with a cable. Unlock it and tap **Trust** if asked.
2. Open Sideloadly. Drag `Setlistic.ipa` onto it.
3. Type your Apple ID email and click **Start**. Enter your Apple ID password, and the
   2-factor code if asked. These go to Apple to sign the app.
4. On the iPhone:
   - **Settings → General → VPN & Device Management** → tap your Apple ID → **Trust**.
   - **Settings → Privacy & Security → Developer Mode** → turn it **on**. The phone restarts.
5. Open **Setlistic**. When it asks about Photos, choose **Allow Full Access**.

## Every week: refresh

Free installs stop opening after 7 days. Before then, plug in, open Sideloadly and click **Start**
again with the same file. Nothing is deleted.

To make it automatic: in iTunes, with the phone plugged in, tick **Sync with this iPhone over Wi-Fi**.
Then turn on Sideloadly's automatic refresh. It refreshes whenever the laptop and phone are on
the same Wi-Fi with Sideloadly running.

If you miss a refresh, the app just won't open until you refresh it. Your data is still there.

**Don't delete the app from your phone.** That deletes its data. Back up first if you ever need to.

## Moving your concerts in

The app has its own storage, separate from Safari and the Home Screen web app.

1. In the Home Screen web app: **Settings → Back up / export… → Everything → Save → Save to Files**.
2. In the Setlistic app: on the empty Tickets page tap **Already have tickets saved somewhere else?**
   and pick the file.

Videos you'd already added to the web app come across as copies, and they still play.
Everything you add in the app from now on is a link to your camera roll.

## Limits of a free Apple ID

- 3 sideloaded apps at once.
- Each install lasts 7 days (refresh as above).
- Up to 10 different apps signed per week (you'll only ever use 1).
