# AniZone provider for Seanime

An online-stream provider for [Seanime](https://github.com/5rahim/seanime) backed by [AniZone](https://anizone.to/).

## Features

- Searches AniZone's anime catalog.
- Loads complete episode lists through AniZone's Livewire pagination instead of stopping at the first 24 episodes.
- Plays AniZone HLS streams.
- Exposes every subtitle track from the AniZone player, preserving descriptive labels such as full English subtitles and signs/songs tracks.
- Passes the page origin and referer headers used by AniZone's web player.

## Install

In Seanime, open **Extensions**, choose **Add extension**, and paste:

```text
https://raw.githubusercontent.com/DefnoJae/Seanime-provider-2/main/manifest.json
```

## Notes

AniZone does not split its catalog into separate subbed and dubbed search entries. The provider therefore exposes each result in both Seanime playback modes, while the player handles the audio tracks and selectable subtitles available in AniZone's HLS stream.

This extension does not host or redistribute media. It only resolves links exposed by AniZone. Availability depends on AniZone and its video CDN, and users are responsible for complying with applicable laws and the source site's terms.

