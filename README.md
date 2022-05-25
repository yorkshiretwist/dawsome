# DAWsome

Simple audio recording in your browser using the Web Audio API

I'm not sure how far I'm going to go with this system, but as well as the obvious functionality (record, play, delete) I want to explore the following:

- Allow the user to select an adio input device
- Displaying an input level meter
- Displaying a real-time waveform of what is being recorded
- Allowing the recorded audio to be uploaded in a form submission

And maybe in the future:

- Multi-track recording (with mute, solo, track level, panning)
- Basic effects like compressor, delay, reverb
- Export of mixed session
- Export of stems

## Dependencies

I originally tried writing this from scratch myself, but then I discovered the incredible [Waveform Playlist](https://github.com/naomiaro/waveform-playlist) project by [naomiaro](https://github.com/naomiaro/) and felt it was better for me to build what I wanted on top of that.

Waveform Playlist is [released under the MIT license](https://github.com/naomiaro/waveform-playlist/blob/main/LICENSE.md).